import { useState, useMemo, useCallback, useEffect } from 'react'
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { isEverydayRoutine } from '@/lib/routineUtils'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { PlanningHeader } from './PlanningHeader'
import { PlanningGrid } from './PlanningGrid'
import { PlanningTaskDrawer } from './PlanningTaskDrawer'
import { PlanningShelf, type PlanningShelfProps } from './PlanningShelf'
import { PlanningTaskCard } from './PlanningTaskCard'
import { PlanningRoutineDragCard, ROUTINE_DRAG_PREFIX } from './PlanningRoutineDragCard'
import { PlanningEventBlock, PLACED_EVENT_DRAG_PREFIX } from './PlanningEventBlock'
import { PlanningRoutineBlock, PLACED_ROUTINE_DRAG_PREFIX } from './PlanningRoutineBlock'
import { computeEventReschedule } from './planningReschedule'
import { PlanningSlotQuickCreate } from './PlanningSlotQuickCreate'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { belongsToWeek, isStaleWeekPlacement } from '@/lib/today/weekPlacement'
import { resolveRoutineTime } from '@/lib/today/routineTime'

interface PlanningSessionProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  /** Untimed routines shown in the drawer as draggable chips (weekly planning). */
  draggableRoutines?: Routine[]
  /** Full routine set, used to resolve a routine dragged into a day it does not
   *  recur on — the day's own list will not contain it. */
  allRoutines?: Routine[]
  /** Instances for the viewed date. A time-grain drop writes a one-day time
   *  override here rather than rewriting the recurrence rule, so the grid needs
   *  these to place a dropped routine. Day grain rewrites the rule instead, so
   *  the week view does not depend on them. */
  dateInstances?: ActionableInstance[]
  /**
   * Drop handler for a dragged routine: pins it to a date's weekday + time by
   * REWRITING the recurrence rule. Right on the week grid, where the gesture
   * means "this is when this routine happens".
   */
  onScheduleRoutine?: (routineId: string, date: Date, time: string) => void
  /**
   * Pin a routine to a time on ONE day, leaving its recurrence rule alone.
   * Used at time grain, where the day is already settled and only the time is
   * in question — `onScheduleRoutine` there would turn one drag into "every
   * future occurrence moves too".
   */
  onScheduleRoutineToday?: (routineId: string, when: Date) => void
  /** Reschedule a placed calendar event to a new start/end (preserves duration). */
  onRescheduleEvent?: (event: CalendarEvent, startTime: Date, endTime: Date) => void
  familyMembers?: FamilyMember[]
  eventNotesMap?: Map<string, EventNote>
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  /** Click-to-create (week-grid-click spec): create a task at the clicked
   *  empty slot's local date/time. Undefined = slots are not clickable (no-op),
   *  keeping other mount sites (e.g. the wizard drawer) unaffected until wired. */
  onCreateTaskAt?: (title: string, scheduledFor: Date) => void | Promise<void>
  onClose: () => void
  initialDate?: Date
  /** Days the range starts with (default 1; clamped to 7). WeekPage passes 7. */
  initialDays?: number
  /** Reject task drops on days before this date (planning never schedules
   *  rocks into the past — week-boundary spec). Day-granular; unset = allow. */
  minDropDate?: Date
  getRoutinesForDate?: (date: Date) => Routine[]
  embedded?: boolean
  /** Week→Today seam: when present, each day header renders a small "→ day"
   *  button that jumps straight to that date on the Today rung. */
  onOpenDay?: (date: Date) => void
  /** Shelf mode: render the pool as a full-width lane above the grid instead
   *  of the side drawer. The session supplies tasks + backlog toggle. */
  shelf?: Omit<PlanningShelfProps, 'tasks' | 'hiddenCount' | 'showingAll' | 'onToggleShowAll'>
  /**
   * How much a placement on this surface decides.
   *
   * 'time' (default) — the drop's hour is the answer. This is Today: the day is
   *   already settled, and the only question left is what time.
   * 'day'  — the DAY is the answer and the hour under the cursor is incidental;
   *   the task lands all-day on that date. This is the week rung: it asks which
   *   day, and leaves the time to Today. Dropping anywhere in a day's column
   *   means that day, exactly as dropping anywhere in a month row means that
   *   week.
   */
  placementGrain?: 'day' | 'time'
}

// Time slot duration in minutes
const SLOT_DURATION = 30

// Default start and end hours for the planning grid
const DAY_START_HOUR = 6
const DAY_END_HOUR = 22

// Resize constants
const MIN_DURATION = 15
const SLOT_HEIGHT = 40
const PIXELS_PER_15_MIN = SLOT_HEIGHT / 2

export function PlanningSession({
  tasks,
  events,
  routines,
  draggableRoutines = [],
  allRoutines,
  dateInstances,
  onScheduleRoutine,
  onScheduleRoutineToday,
  onRescheduleEvent,
  familyMembers = [],
  eventNotesMap,
  onUpdateTask,
  onPushTask,
  onCreateTaskAt,
  onClose,
  initialDate,
  initialDays,
  minDropDate,
  getRoutinesForDate,
  embedded = false,
  onOpenDay,
  shelf,
  placementGrain = 'time',
}: PlanningSessionProps) {
  const dayGrain = placementGrain === 'day'
  // Date range state - start with the initial date if provided
  const [dateRange, setDateRange] = useState<Date[]>(() => {
    const startDate = initialDate ? new Date(initialDate) : new Date()
    startDate.setHours(0, 0, 0, 0)
    const count = Math.min(Math.max(initialDays ?? 1, 1), 7)
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      return d
    })
  })

  // Active drag state
  const [activeId, setActiveId] = useState<string | null>(null)

  // Transient refusal notice (a past-day drop, or a past-day slot click) —
  // auto-clears.
  const [dropNotice, setDropNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!dropNotice) return
    const t = setTimeout(() => setDropNotice(null), 3500)
    return () => clearTimeout(t)
  }, [dropNotice])

  // Click-to-create popover state (week-grid-click spec): which slot was
  // clicked, and the DOM node to anchor the popover against.
  const [quickCreate, setQuickCreate] = useState<{
    dateKey: string
    hour: number
    minute: number
    anchorEl: HTMLElement
  } | null>(null)

  // Fires on click of an empty hour slot. Suppressed while a dnd-kit drag is
  // active (activeId != null) — the 5px MouseSensor activation constraint
  // already keeps genuine clicks from starting drags, but a click that lands
  // right as a drag ends should still not open the popover. No-op entirely
  // when the mount site hasn't wired onCreateTaskAt (e.g. the wizard drawer).
  const handleSlotClick = useCallback(
    (dateKey: string, hour: number, minute: number, anchorEl: HTMLElement) => {
      if (activeId) return
      if (!onCreateTaskAt) return

      const parsed = parseDateKey(dateKey)
      if (!parsed) return

      // Same past-day refusal as the drag-drop slot branch — planning never
      // schedules a rock into the past.
      if (minDropDate) {
        const clickedDay = new Date(parsed.year, parsed.month, parsed.day)
        const minDay = new Date(minDropDate)
        minDay.setHours(0, 0, 0, 0)
        if (clickedDay.getTime() < minDay.getTime()) {
          setDropNotice('That day is already behind you — pick a day ahead.')
          return
        }
      }

      setQuickCreate({ dateKey, hour, minute, anchorEl })
    },
    [activeId, onCreateTaskAt, minDropDate]
  )

  // Submits the quick-create popover: builds the same LOCAL-date scheduledFor
  // as the slot drag-drop branch (new Date(y, m, d, hour, minute)), then
  // hands off to the caller-supplied onCreateTaskAt (one atomic addTask).
  const handleQuickCreateSubmit = useCallback(
    (title: string) => {
      if (!quickCreate || !onCreateTaskAt) {
        setQuickCreate(null)
        return
      }
      const parsed = parseDateKey(quickCreate.dateKey)
      setQuickCreate(null)
      if (!parsed) return
      // Same grain rule as a drop: on a week surface a new item gets the day,
      // not the hour of the slot that was clicked.
      const scheduledFor = dayGrain
        ? new Date(parsed.year, parsed.month, parsed.day)
        : new Date(parsed.year, parsed.month, parsed.day, quickCreate.hour, quickCreate.minute, 0, 0)
      void onCreateTaskAt(title, scheduledFor)
    },
    [quickCreate, onCreateTaskAt, dayGrain]
  )

  // Configure sensors for drag detection
  // Use MouseSensor and TouchSensor separately for better scroll container support
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  )

  // Get unscheduled tasks (no scheduledFor or in the past, and not deferred to future)
  const allUnscheduledTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Bounds of the days currently on the grid. A task scheduled onto one of
    // these days is PLACED — it belongs on the grid, not also in the unscheduled
    // rail — even if that day is earlier this week (the week-planning grid spans
    // past + future days, so "past" alone can't mean "unscheduled" here). For
    // the single-day Today view this is a no-op: a same-day task was already
    // excluded, and genuinely-overdue tasks fall before the range and still
    // resurface.
    const rangeStart = dateRange.length ? new Date(dateRange[0]) : null
    rangeStart?.setHours(0, 0, 0, 0)
    const rangeEnd = dateRange.length ? new Date(dateRange[dateRange.length - 1]) : null
    rangeEnd?.setHours(23, 59, 59, 999)

    return tasks.filter((task) => {
      if (task.completed) return false

      // Exclude tasks deferred to a future date
      if (task.deferredUntil) {
        const deferDate = new Date(task.deferredUntil)
        deferDate.setHours(0, 0, 0, 0)
        if (deferDate > today) return false
      }

      // All-day tasks: a date inside the visible grid range means it renders
      // in that day's all-day lane, not the unscheduled pool. Without a date,
      // or with a date outside the range, it stays in the pool as before
      // (so it can be time-blocked or dragged onto the visible range).
      if (task.isAllDay) {
        if (!task.scheduledFor) return true
        const allDayDate = new Date(task.scheduledFor)
        if (rangeStart && rangeEnd && allDayDate >= rangeStart && allDayDate <= rangeEnd) return false
        return true
      }

      if (!task.scheduledFor) return true
      const taskDate = new Date(task.scheduledFor)
      // Placed on a day shown on the grid → it's on the grid, not unscheduled.
      if (rangeStart && rangeEnd && taskDate >= rangeStart && taskDate <= rangeEnd) return false
      // Otherwise, past-scheduled tasks resurface so they can be rescheduled.
      const taskDay = new Date(taskDate)
      taskDay.setHours(0, 0, 0, 0)
      return taskDay < today
    })
  }, [tasks, dateRange])

  // The rail defaults to today-relevant candidates — carried-over, all-day, and
  // this-week tasks. Dumping the whole backlog (inbox/month/someday) made the
  // rail a 29-item wall of project sub-steps; those stay behind "Show more".
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false)
  const { relevantUnscheduled, backlogCount } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentWeek = weekStartAnchor(today, readCadenceConfig().weekStartsOn)
    const isRelevant = (task: Task) => {
      if (task.isAllDay) return true
      // This week's items, plus anything left behind by an earlier week — a
      // stranded placement is the MOST relevant thing here, and burying it
      // behind "Show more" is how it stays stranded. Only a move placed on a
      // week still ahead is filtered out.
      if (task.bucket === 'week') return belongsToWeek(task, currentWeek) || isStaleWeekPlacement(task, currentWeek)
      if (task.scheduledFor) {
        const d = new Date(task.scheduledFor)
        d.setHours(0, 0, 0, 0)
        if (d < today) return true // carried over
      }
      return false
    }
    const relevant = allUnscheduledTasks.filter(isRelevant)
    return { relevantUnscheduled: relevant, backlogCount: allUnscheduledTasks.length - relevant.length }
  }, [allUnscheduledTasks])

  const unscheduledTasks = showAllUnscheduled ? allUnscheduledTasks : relevantUnscheduled

  // Get scheduled tasks for the date range
  const scheduledTasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()

    for (const date of dateRange) {
      const dateKey = formatDateKey(date)
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const tasksForDay = tasks.filter((task) => {
        if (task.completed) return false
        if (!task.scheduledFor) return false

        // Filter out all-day tasks (they show in unscheduled drawer)
        if (task.isAllDay) return false

        const taskDate = new Date(task.scheduledFor)
        return taskDate >= startOfDay && taskDate <= endOfDay
      })

      map.set(dateKey, tasksForDay)
    }

    return map
  }, [tasks, dateRange])

  // All-day tasks scheduled onto a visible day — rendered in that day's fixed
  // all-day lane (PlanningColumn), never in the hour grid.
  const allDayTasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()

    for (const date of dateRange) {
      const dateKey = formatDateKey(date)
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const tasksForDay = tasks.filter((task) => {
        if (task.completed) return false
        if (!task.isAllDay || !task.scheduledFor) return false
        const taskDate = new Date(task.scheduledFor)
        return taskDate >= startOfDay && taskDate <= endOfDay
      })

      map.set(dateKey, tasksForDay)
    }

    return map
  }, [tasks, dateRange])

  // Get events for the date range
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()

    for (const date of dateRange) {
      const dateKey = formatDateKey(date)
      const viewedYear = date.getFullYear()
      const viewedMonth = date.getMonth()
      const viewedDay = date.getDate()

      const eventsForDay = events.filter((event) => {
        const startTimeStr = event.start_time || event.startTime
        if (!startTimeStr) return false
        const eventStart = new Date(startTimeStr)
        return (
          eventStart.getFullYear() === viewedYear &&
          eventStart.getMonth() === viewedMonth &&
          eventStart.getDate() === viewedDay
        )
      })

      map.set(dateKey, eventsForDay)
    }

    return map
  }, [events, dateRange])

  // App-wide "hide daily activities" preference (shared with Today/Week views via
  // the hideRoutinesSignal). Toggling here syncs everywhere.
  const [hideRoutines, setHideRoutines] = useState<boolean>(() => readHideRoutines())
  useEffect(() => onHideRoutinesChange(setHideRoutines), [])

  // routine id → instance, bucketed under EVERY date the instance has a say in.
  //
  // A cross-day drop keeps the row's original `date` and sets status 'deferred'
  // with `deferred_to` on the target day, so the instance speaks for two days:
  // the day it left (which must stop drawing it) and the day it moved to (which
  // must start). Filing it under one key only makes it fall between the columns
  // and disappear. resolveRoutineTime already decides correctly per day — it
  // just has to be handed the instance in both places.
  const routineInstancesByDate = useMemo(() => {
    const byDate = new Map<string, Map<string, ActionableInstance>>()
    const put = (key: string, instance: ActionableInstance) => {
      if (!byDate.has(key)) byDate.set(key, new Map())
      byDate.get(key)!.set(instance.entity_id, instance)
    }
    for (const instance of dateInstances ?? []) {
      if (instance.entity_type !== 'routine') continue
      put(instance.date as string, instance)
      if (instance.status === 'deferred' && instance.deferred_to) {
        put(formatDateKey(new Date(instance.deferred_to)), instance)
      }
    }
    return byDate
  }, [dateInstances])

  // Get routines for the date range. Mirrors the Week grid's routine visibility:
  //   1. show_on_timeline === false → never render.
  //   2. "Hide daily activities" toggle → drop everyday/weekday routines (the
  //      noise); lower-frequency routines still show.
  const routinesByDate = useMemo(() => {
    const map = new Map<string, Routine[]>()

    for (const date of dateRange) {
      const dateKey = formatDateKey(date)
      // Use getRoutinesForDate if provided, otherwise use routines prop directly
      const routinesForDay = (getRoutinesForDate ? getRoutinesForDate(date) : routines)
        .filter((r) => r.show_on_timeline !== false)
        .filter((r) => !hideRoutines || !isEverydayRoutine(r.recurrence_pattern))

      // A routine dragged INTO this day usually doesn't recur on it, so the
      // day's own list won't contain it. Pull it in from the full set, the same
      // way useScheduleFiltering does for the Today rung.
      const placed = routineInstancesByDate.get(dateKey)
      const deferredIn: Routine[] = []
      if (placed) {
        for (const [routineId, instance] of placed) {
          if (instance.status !== 'deferred' || !instance.deferred_to) continue
          if (formatDateKey(new Date(instance.deferred_to)) !== dateKey) continue
          if (routinesForDay.some((r) => r.id === routineId)) continue
          const routine = allRoutines?.find((r) => r.id === routineId)
          if (routine && routine.show_on_timeline !== false) deferredIn.push(routine)
        }
      }
      map.set(dateKey, deferredIn.length ? [...routinesForDay, ...deferredIn] : routinesForDay)
    }

    return map
  }, [dateRange, getRoutinesForDate, routines, hideRoutines, routineInstancesByDate, allRoutines])

  // Get the currently dragged task
  const activeTask = useMemo(() => {
    if (!activeId) return null
    return tasks.find((t) => t.id === activeId) ?? null
  }, [activeId, tasks])

  // Drawer contents: the draggable routines that aren't already ON the grid.
  //
  // Every drawer routine is untimed, so the only way it gets a time is a drop.
  // Leaving a placed one in the drawer shows the same routine twice and invites
  // dropping it again. Deliberately NOT applied to `draggableRoutines` itself —
  // the drag overlay still has to resolve a routine mid-drag, after it has a
  // placement but before the pointer is released.
  const unplacedRoutines = useMemo(() => {
    if (!draggableRoutines.length) return draggableRoutines
    return draggableRoutines.filter((routine) =>
      !dateRange.some((date) => {
        const instance = routineInstancesByDate.get(formatDateKey(date))?.get(routine.id)
        return instance ? resolveRoutineTime(routine, instance, date) !== null : false
      }),
    )
  }, [draggableRoutines, dateRange, routineInstancesByDate])

  // Get the currently dragged routine (drag ids are prefixed `routine-`)
  const activeRoutine = useMemo(() => {
    if (!activeId || !activeId.startsWith(ROUTINE_DRAG_PREFIX)) return null
    const routineId = activeId.slice(ROUTINE_DRAG_PREFIX.length)
    return draggableRoutines.find((r) => r.id === routineId) ?? null
  }, [activeId, draggableRoutines])

  // Currently dragged placed event (drag ids are prefixed `event-`)
  const activeEvent = useMemo(() => {
    if (!activeId || !activeId.startsWith(PLACED_EVENT_DRAG_PREFIX)) return null
    const id = activeId.slice(PLACED_EVENT_DRAG_PREFIX.length)
    return events.find((e) => e.id === id) ?? null
  }, [activeId, events])

  // Currently dragged placed routine (drag ids are prefixed `placed-routine-`)
  const activePlacedRoutine = useMemo(() => {
    if (!activeId || !activeId.startsWith(PLACED_ROUTINE_DRAG_PREFIX)) return null
    const id = activeId.slice(PLACED_ROUTINE_DRAG_PREFIX.length)
    for (const list of routinesByDate.values()) {
      const found = list.find((r) => r.id === id)
      if (found) return found
    }
    return null
  }, [activeId, routinesByDate])

  // Add a day to the date range
  const handleAddDay = useCallback(() => {
    setDateRange((prev) => {
      if (prev.length >= 7) return prev // Max 7 days
      const lastDate = prev[prev.length - 1]
      const nextDate = new Date(lastDate)
      nextDate.setDate(nextDate.getDate() + 1)
      return [...prev, nextDate]
    })
  }, [])

  // Remove a day from the date range
  const handleRemoveDay = useCallback(() => {
    setDateRange((prev) => {
      if (prev.length <= 1) return prev
      return prev.slice(0, -1)
    })
  }, [])

  // Change the date range start
  const handleDateChange = useCallback((startDate: Date) => {
    startDate.setHours(0, 0, 0, 0)
    setDateRange((prev) => {
      const daysCount = prev.length
      const newRange: Date[] = []
      for (let i = 0; i < daysCount; i++) {
        const date = new Date(startDate)
        date.setDate(date.getDate() + i)
        newRange.push(date)
      }
      return newRange
    })
  }, [])

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string
    // Don't show overlay for resize handles
    if (!id.startsWith('resize-')) {
      setActiveId(id)
    }
  }, [])

  // Handle drag over (for debugging)
  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Can add visual feedback here if needed
  }, [])

  /**
   * A routine was dropped on an hour slot.
   *
   * At DAY grain this rewrites the recurrence rule — the week grid's gesture
   * means "this is when this routine happens". At TIME grain the day is already
   * settled and only the time is in question, so it writes a ONE-DAY override
   * instead; rewriting the rule there would move every future occurrence from a
   * single drag.
   */
  const scheduleRoutineFromSlot = useCallback(
    (routineId: string, parsed: { year: number; month: number; day: number; hour: number; minute: number }) => {
      if (!dayGrain && onScheduleRoutineToday) {
        onScheduleRoutineToday(
          routineId,
          new Date(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute, 0, 0),
        )
        return
      }
      const date = new Date(parsed.year, parsed.month, parsed.day)
      const time = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
      onScheduleRoutine?.(routineId, date, time)
    },
    [dayGrain, onScheduleRoutine, onScheduleRoutineToday],
  )

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event
      setActiveId(null)

      const activeId = active.id as string

      // Handle resize operations
      if (activeId.startsWith('resize-')) {
        const taskId = activeId.replace('resize-', '')
        const task = tasks.find(t => t.id === taskId)
        if (!task) return

        const currentDuration = task.estimatedDuration || 30
        // Calculate duration change: positive delta.y = increase duration
        // Round to 15-minute increments
        const durationChange = Math.round(delta.y / PIXELS_PER_15_MIN) * 15
        const newDuration = Math.max(MIN_DURATION, currentDuration + durationChange)

        if (newDuration !== currentDuration) {
          onUpdateTask(taskId, { estimatedDuration: newDuration })
        }
        return
      }

      if (!over) return

      const dropTarget = over.id as string

      // Routine drags (id `routine-<id>`): only meaningful when dropped on a
      // time slot — that pins the routine to the slot's weekday + time. Dropping
      // a routine anywhere else (e.g. back on the drawer) is a no-op.
      if (activeId.startsWith(ROUTINE_DRAG_PREFIX)) {
        if (!dropTarget.startsWith('slot-')) return
        const parsed = parseSlotId(dropTarget)
        if (!parsed) return
        scheduleRoutineFromSlot(activeId.slice(ROUTINE_DRAG_PREFIX.length), parsed)
        return
      }

      // Placed routine reschedule (id `placed-routine-<id>`): same effect as a
      // drawer-routine drop — pin it to the slot's weekday + time.
      if (activeId.startsWith(PLACED_ROUTINE_DRAG_PREFIX)) {
        if (!dropTarget.startsWith('slot-')) return
        const parsed = parseSlotId(dropTarget)
        if (!parsed) return
        scheduleRoutineFromSlot(activeId.slice(PLACED_ROUTINE_DRAG_PREFIX.length), parsed)
        return
      }

      // Placed event reschedule (id `event-<id>`): rewrite the calendar event's
      // start/end, preserving its duration. Only meaningful on a slot drop.
      if (activeId.startsWith(PLACED_EVENT_DRAG_PREFIX)) {
        if (!dropTarget.startsWith('slot-')) return
        const parsed = parseSlotId(dropTarget)
        if (!parsed) return
        const ev = events.find((e) => e.id === activeId.slice(PLACED_EVENT_DRAG_PREFIX.length))
        if (!ev) return
        const { startTime, endTime } = computeEventReschedule(ev, parsed)
        onRescheduleEvent?.(ev, startTime, endTime)
        return
      }

      // All-day lane drop (id `allday-YYYY-MM-DD`): pins the dragged task as an
      // all-day item on that date. Bare task ids only reach here — routine/
      // event/resize-prefixed ids all return via their branches above.
      if (dropTarget.startsWith('allday-')) {
        const m = /^allday-(\d{4})-(\d{2})-(\d{2})$/.exec(dropTarget)
        if (!m) return
        const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        if (minDropDate) {
          const minDay = new Date(minDropDate)
          minDay.setHours(0, 0, 0, 0)
          if (day.getTime() < minDay.getTime()) {
            setDropNotice('That day is already behind you — pick a day ahead.')
            return
          }
        }
        onUpdateTask(activeId, { bucket: 'timed', scheduledFor: day, isAllDay: true })
        return
      }

      // Handle dropping on unscheduled drawer
      if (dropTarget === 'unscheduled-drawer') {
        // Clear the time AND drop out of the 'timed' bucket — a task with no
        // scheduledFor must not stay bucket:'timed' (it would vanish from every
        // Today pool). Return it to the week bucket as a planned, untimed task.
        onUpdateTask(activeId, {
          bucket: 'week',
          scheduledFor: undefined,
          isAllDay: false,
        })
        return
      }

      // Parse the drop target: "slot-{date}-{hour}-{minute}"
      if (dropTarget.startsWith('slot-')) {
        const parsed = parseSlotId(dropTarget)
        if (!parsed) return

        // Planning never schedules a rock into the past — a "fresh" plan that
        // is instantly overdue reads as failure (week-boundary spec).
        if (minDropDate) {
          const dropDay = new Date(parsed.year, parsed.month, parsed.day)
          const minDay = new Date(minDropDate)
          minDay.setHours(0, 0, 0, 0)
          if (dropDay.getTime() < minDay.getTime()) {
            setDropNotice('That day is already behind you — pick a day ahead.')
            return
          }
        }

        // Create date in local time (not UTC) to avoid timezone shift.
        // At day grain the hour is dropped on purpose — the week rung's answer
        // is the day, and giving it a time here would be Today's job done badly
        // (2 PM chosen by wherever the cursor happened to be). The item lands in
        // that day's all-day lane; opening Today is where it gets a time.
        const scheduledFor = dayGrain
          ? new Date(parsed.year, parsed.month, parsed.day)
          : new Date(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute, 0, 0)

        // bucket:'timed' is required for the task to surface in the Today/Day
        // view (selectTimed filters on bucket==='timed'); scheduledFor alone
        // only shows in the Week grid. Keep them in lockstep.
        onUpdateTask(activeId, {
          bucket: 'timed',
          scheduledFor,
          isAllDay: dayGrain,
        })
      }
    },
    [onUpdateTask, tasks, scheduleRoutineFromSlot, onRescheduleEvent, events, minDropDate, dayGrain]
  )

  return (
    <div className={embedded ? 'relative h-full bg-bg-base flex flex-col' : 'fixed inset-0 z-50 bg-bg-base flex flex-col'}>
      {/* Header */}
      <PlanningHeader
        dateRange={dateRange}
        onClose={onClose}
        onAddDay={handleAddDay}
        onRemoveDay={handleRemoveDay}
        onDateChange={handleDateChange}
        showClose={!embedded}
        hideRoutines={hideRoutines}
        onToggleRoutines={() => writeHideRoutines(!hideRoutines)}
      />

      {/* Past-day drop refusal — quiet, transient */}
      {dropNotice && (
        <div role="status" className="absolute left-1/2 -translate-x-1/2 top-16 z-20 rounded-lg bg-neutral-800/90 text-white text-sm px-4 py-2 shadow-lg pointer-events-none">
          {dropNotice}
        </div>
      )}

      {/* Click-to-create popover — anchored to the clicked empty slot */}
      {quickCreate && (
        <PlanningSlotQuickCreate
          anchorEl={quickCreate.anchorEl}
          onSubmit={handleQuickCreateSubmit}
          onCancel={() => setQuickCreate(null)}
        />
      )}

      {/* Main content */}
      <div className={`flex-1 ${shelf ? 'flex flex-col gap-3 overflow-hidden p-3 pt-0' : 'flex overflow-hidden'}`}>
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {shelf ? (
            /* Full-width pool lane above the grid — shelf mode replaces the drawer */
            <PlanningShelf
              {...shelf}
              tasks={unscheduledTasks}
              hiddenCount={showAllUnscheduled ? 0 : backlogCount}
              showingAll={showAllUnscheduled}
              onToggleShowAll={backlogCount > 0 || showAllUnscheduled ? () => setShowAllUnscheduled((v) => !v) : undefined}
            />
          ) : (
            /* Task drawer (sidebar) */
            <PlanningTaskDrawer
              tasks={unscheduledTasks}
              routines={unplacedRoutines}
              onPushTask={onPushTask}
              hiddenCount={showAllUnscheduled ? 0 : backlogCount}
              showingAll={showAllUnscheduled}
              onToggleShowAll={backlogCount > 0 || showAllUnscheduled ? () => setShowAllUnscheduled((v) => !v) : undefined}
            />
          )}

          {/* Planning grid */}
          {shelf ? (
            <div className="flex-1 min-h-0 flex">
              <PlanningGrid
                dateRange={dateRange}
                scheduledTasksByDate={scheduledTasksByDate}
                eventsByDate={eventsByDate}
                routinesByDate={routinesByDate}
                routineInstancesByDate={routineInstancesByDate}
                allDayTasksByDate={allDayTasksByDate}
                familyMembers={familyMembers}
                eventNotesMap={eventNotesMap}
                dayStartHour={DAY_START_HOUR}
                dayEndHour={DAY_END_HOUR}
                slotDuration={SLOT_DURATION}
                onOpenDay={onOpenDay}
                onSlotClick={onCreateTaskAt ? handleSlotClick : undefined}
                dayGrain={dayGrain}
              />
            </div>
          ) : (
            <PlanningGrid
              dateRange={dateRange}
              scheduledTasksByDate={scheduledTasksByDate}
              eventsByDate={eventsByDate}
              routinesByDate={routinesByDate}
              routineInstancesByDate={routineInstancesByDate}
              allDayTasksByDate={allDayTasksByDate}
              familyMembers={familyMembers}
              eventNotesMap={eventNotesMap}
              dayStartHour={DAY_START_HOUR}
              dayEndHour={DAY_END_HOUR}
              slotDuration={SLOT_DURATION}
              onOpenDay={onOpenDay}
              onSlotClick={onCreateTaskAt ? handleSlotClick : undefined}
              dayGrain={dayGrain}
            />
          )}

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {activeTask && (
              <PlanningTaskCard task={activeTask} isDragging />
            )}
            {activeRoutine && (
              <PlanningRoutineDragCard routine={activeRoutine} isOverlay />
            )}
            {activeEvent && (
              <PlanningEventBlock event={activeEvent} height={SLOT_HEIGHT} isOverlay />
            )}
            {activePlacedRoutine && (
              <PlanningRoutineBlock routine={activePlacedRoutine} isOverlay />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}

// Helper to format date as YYYY-MM-DD for keys
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper to parse a dateKey (YYYY-MM-DD) into local date components — used
// by the click-to-create popover, which receives dateKey/hour/minute
// separately rather than a single slot id.
function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10) - 1,
    day: parseInt(match[3], 10),
  }
}

// Helper to parse slot ID into date components
// Slot ID format: slot-YYYY-MM-DD-HH-MM (e.g., slot-2025-12-09-14-30)
function parseSlotId(slotId: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const match = slotId.match(/^slot-(\d{4})-(\d{2})-(\d{2})-(\d+)-(\d+)$/)
  if (!match) return null
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10) - 1, // JS months are 0-indexed
    day: parseInt(match[3], 10),
    hour: parseInt(match[4], 10),
    minute: parseInt(match[5], 10),
  }
}
