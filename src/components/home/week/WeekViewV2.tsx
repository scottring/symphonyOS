import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragMoveEvent,
} from '@dnd-kit/core'
import type { Task } from '@/types/task'
import { PlanWeekMenu } from '@/components/plan/PlanWeekMenu'
import { taskTiming, hasTiming, broaderCommitment, removeDayOutcome, removeAllOutcome } from '@/lib/planning/taskTiming'
import { timingRemoval } from '@/lib/planning/planActions'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { taskToTimelineItem, eventToTimelineItem } from '@/types/timeline'
import { goalTitleMap } from '@/lib/planning/goalSteps'
import { WeekGrid, dayKey, type PlanSlot } from './WeekGrid'
import { WeekAllDayChip, WeekAllDayEventChip } from './WeekAllDayChip'
import { WeekEventBlock } from './WeekEventBlock'
import { layoutWeekLanes, type PlacedItem } from './layoutLanes'
import { useWeekDragDrop } from './useWeekDragDrop'
import { useGridCreate } from './useGridCreate'
import { SlotQuickCreatePopover, type CreateType } from './SlotQuickCreatePopover'
import { RoutinePlacePopover } from './RoutinePlacePopover'
import { RoutinesToggle } from './RoutinesToggle'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { suggestSlots, type BusyInterval } from '@/lib/planning/dropSmarts'
import { FIRST_HOUR, LAST_HOUR } from './WeekGrid'
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { partitionWeekExtras } from '@/lib/week/weekExtras'
import { buildWeekRoutineItems } from './weekRoutineItems'
import { useWeekInstances } from './useWeekInstances'
import { edgeForPointer } from './edgeAdvance'
import { WeekJournal, type JournalDay, type JournalEntry } from './WeekJournal'
import { dayDensity, densityReadiness, type DensitySources } from '@/lib/planning/dayDensity'
import { formatWeekRange } from '@/lib/dateHelpers'
import { WeekList } from './WeekList'
import { makePlanActions } from '@/lib/planning/planActions'
import { focusDays, sameDay } from '@/lib/placement/model'
import type { PlanDragPayload } from '@/lib/planning/planDrag'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { showToast } from '@/hooks/useToast'
import { eventDays, isMultiDayEvent, layoutContextSpans } from '@/lib/week/journalSpread'
import { localYmd } from '@/lib/cadence/config'
import { publishViewedWeek } from '@/lib/viewedWeekSignal'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { AssigneeFilter } from '@/lib/today/types'
import { isTimelineObligation } from '@/lib/routineUtils'
import type { Layer } from '@/lib/domains'
import { WeekPlanHost } from './WeekPlanHost'

/** Does this calendar event span the whole day? Explicit flags win; otherwise
 *  a full-day span (midnight start, 24h+ duration — how a holiday reads from
 *  Google) counts too. A holiday used to reach the timed grid and get clamped
 *  to the 8 AM row (demo run 2026-09-06) — it belongs in the all-day lane. */
function isAllDayEvent(ev: CalendarEvent): boolean {
  const flagged =
    (ev as { is_all_day?: boolean }).is_all_day ??
    (ev as { isAllDay?: boolean }).isAllDay ??
    ev.all_day ??
    ev.allDay
  if (flagged !== undefined) return flagged
  const startStr = (ev as { start_time?: string }).start_time ?? (ev as { startTime?: string }).startTime
  const endStr = (ev as { end_time?: string }).end_time ?? (ev as { endTime?: string }).endTime
  if (!startStr || !endStr) return false
  const start = new Date(startStr)
  const end = new Date(endStr)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0
  return startsAtMidnight && end.getTime() - start.getTime() >= 24 * 60 * 60 * 1000
}

/** A task whose start is before the grid's first hour — too early to place on
 *  the timed grid without being clamped onto FIRST_HOUR (a 6:50 AM task drawn
 *  as if it were 8 AM; demo run 2026-09-06). Rendered in the all-day lane
 *  instead, its real time prefixed onto the chip. */
function isEarlyTask(d: Date): boolean {
  return d.getHours() * 60 + d.getMinutes() < FIRST_HOUR * 60
}

function formatEarlyTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

interface WeekViewV2Props {
  tasks: Task[]
  events: CalendarEvent[]
  /**
   * How each source stands for the week being VIEWED. The day tiles draw a day
   * as quiet only when they have actually read it: "nothing on Thursday", "we
   * could not read Thursday" and "there is no calendar to read" are three
   * different answers (Codex, 2026-09-24). Omitted, everything reads ready —
   * the shape every existing caller and test already has.
   */
  sources?: DensitySources
  routines: Routine[]
  // dateInstances is reserved for future instance-completion overlays;
  // not yet consumed in rendering but kept in the API for Task 12 wiring.
  dateInstances: ActionableInstance[]
  weekStart: Date
  onWeekChange: (d: Date) => void
  selectedAssignee?: string | null
  /** Multi-select assignee filter (rung 5). Superset of `selectedAssignee`;
   *  when provided it drives resolveRoutine directly. */
  selectedAssignees?: AssigneeFilter
  /** The checked layers (rung 4). Unsorted is a layer, not a wildcard. */
  layers: ReadonlySet<Layer>
  onSelectItem: (id: string | null) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void | boolean> | void
  onUpdateEvent: (eventId: string, updates: { startTime: Date; endTime: Date }) => Promise<void> | void
  onUpdateRoutine: (routineId: string, updates: Partial<Routine>) => Promise<void> | void
  /** Pin a routine to a time on ONE day (override write, recurrence rule
   *  untouched). Present = routine blocks become draggable. */
  onPushRoutine?: (routineId: string, when: Date, fromDate: Date) => void
  /** Number of day columns drawn from `weekStart` (1–7). 7 = the week; a
   *  preset or custom range from the masthead draws fewer. A range is a VIEW —
   *  the list beside the grid stays this week's plan, and any other week the
   *  range touches folds beneath it. Default 7. */
  dayCount?: number
  /** From HomeView's useUndo. Called after successful mutations to surface an undo toast. */
  pushAction?: (message: string, undo: () => void) => void
  /** Journal (default) or Schedule. When omitted the view keeps its own and
   *  draws its own switch; HomeView passes it so the switch sits by the dates. */
  mode?: WeekMode
}

export type WeekMode = 'journal' | 'schedule'

/** Journal | Schedule — presentation only: same dates, same data. */
export function WeekModeSwitch({ mode, onChange }: { mode: WeekMode; onChange: (m: WeekMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Week layout" className="inline-flex items-center gap-3 text-xs font-medium">
      {(['journal', 'schedule'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`border-b py-0.5 transition-colors ${
            mode === m ? 'border-neutral-800 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-700'
          }`}
        >
          {m === 'journal' ? 'Journal' : 'Schedule'}
        </button>
      ))}
    </div>
  )
}

export function WeekViewV2(props: WeekViewV2Props) {
  const {
    tasks,
    events,
    sources,
    routines,
    weekStart,
    onWeekChange,
    selectedAssignees,
    layers,
    onSelectItem,
    onUpdateTask,
    onUpdateEvent,
    onUpdateRoutine,
    onPushRoutine,
    dayCount = 7,
    pushAction,
  } = props

  // Create-gesture wiring
  const navigate = useNavigate()
  const { addTask, deleteTask, toggleTask, updateTask, updateTasksBulk, pushTask, userId } = useSupabaseTasks()
  // The rail plans MY week — scope it to the current member, as the strip does.
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const { createEvent, deleteEvent } = useGoogleCalendar()
  const gridCreate = useGridCreate()

  // Pool-pill triage. Defers run through the DomainGate (a context-less task
  // asks "Where does this belong?" before the write — Iris's rule); "not this
  // week" rides the already-gated onUpdateTask prop with the same write the
  // Plan-Your-Time overlay makes.
  const gated = useGatedTaskActions(
    { updateTask, pushTask, updateTasksBulk },
    (id) => tasks.find((t) => t.id === id),
  )
  // Tell the shell which week is on screen, so the Today pin's week list
  // answers the same question this page is asking. Cleared on unmount — the
  // pin falls back to the real current week beside every other page.
  // The prop is a RANGE start (Saturday for ?range=weekend, Monday for the
  // workweek); the list and the pin key on the week ANCHOR, like belongsToWeek.
  const weekAnchor = useMemo(() => weekStartAnchor(weekStart, readCadenceConfig().weekStartsOn), [weekStart])
  useEffect(() => { publishViewedWeek(weekAnchor) }, [weekAnchor])
  // Only unmount clears it — a cleanup on every change published null → week
  // and defeated the signal's same-week dedupe.
  useEffect(() => () => publishViewedWeek(null), [])

  // A shelf routine pill dropped on a slot asks the place-scope question
  // before anything is written: the rule ("every Thursday at 5:00" — its new
  // home) or just this week (the existing one-day override).
  const [routinePlace, setRoutinePlace] = useState<{ routineId: string; when: Date } | null>(null)
  const placingRoutine = routinePlace
    ? routines.find((r) => r.id === routinePlace.routineId) ?? null
    : null
  const confirmRoutinePlace = useCallback((scope: 'rule' | 'once') => {
    if (!routinePlace) return
    const routine = routines.find((r) => r.id === routinePlace.routineId)
    setRoutinePlace(null)
    if (!routine) return
    if (scope === 'once') {
      // A shelf pill isn't leaving another day — it's landing on this one, so
      // the day it moves off IS the drop day (a same-day time override).
      onPushRoutine?.(routine.id, routinePlace.when, routinePlace.when)
      return
    }
    const when = routinePlace.when
    const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][when.getDay()]
    const prevTime = routine.time_of_day
    const prevPattern = routine.recurrence_pattern
    const updates: Partial<Routine> = {
      time_of_day: `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}:00`,
    }
    if (prevPattern.type === 'weekly') {
      updates.recurrence_pattern = { ...prevPattern, days: [weekdayKey] }
    }
    void onUpdateRoutine(routine.id, updates)
    pushAction?.(`Placed "${routine.name}"`, () => {
      void onUpdateRoutine(routine.id, { time_of_day: prevTime, recurrence_pattern: prevPattern })
    })
  }, [routinePlace, routines, onPushRoutine, onUpdateRoutine, pushAction])

  const handleCreate = useCallback(
    async (params: { type: CreateType; title: string; startTime: Date; endTime: Date }) => {
      if (params.type === 'task') {
        const newId = await addTask(params.title, undefined, undefined, params.startTime, { isAllDay: false })
        if (newId) {
          pushAction?.(`Created "${params.title}"`, () => {
            void deleteTask(newId)
          })
        }
      } else if (params.type === 'event') {
        const result = await createEvent({
          title: params.title,
          startTime: params.startTime,
          endTime: params.endTime,
        })
        if (result?.id) {
          pushAction?.(`Created "${params.title}"`, () => {
            void deleteEvent({ eventId: result.id })
          })
        }
      } else if (params.type === 'routine') {
        // Routines need a recurrence pattern that doesn't fit the popover.
        // Build an NL string from the slot's title/weekday/time and navigate
        // to /routines/new with it as initial input — parseRoutine handles
        // the structured conversion. e.g., "Yoga every tuesday at 9:00am"
        const weekday = params.startTime
          .toLocaleDateString('en-US', { weekday: 'long' })
          .toLowerCase()
        const timeStr = params.startTime
          .toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
          .toLowerCase()
          .replace(/\s/g, '') // "9:00am" not "9:00 AM"
        const initialNl = `${params.title} every ${weekday} at ${timeStr}`
        navigate(`/routines/new?initial=${encodeURIComponent(initialNl)}`)
      }
      gridCreate.close()
    },
    [addTask, deleteTask, createEvent, deleteEvent, navigate, gridCreate, pushAction],
  )

  // Drag-drop wiring. Domain-on-drop needs nothing here: onUpdateTask is the
  // GATED update (ctx.onUpdateTask = useGatedTaskActions), so scheduling a
  // context-less task opens the DomainGate modal before the write — Iris's
  // rule, enforced in one place.
  const drag = useWeekDragDrop({
    weekStart,
    onWeekChange,
    onUpdateTask,
    onUpdateEvent,
    onUpdateRoutine,
    tasks,
    events,
    routines,
    dayCount,
    pushAction,
    onPushRoutine,
    onRoutinePlaceRequest: setRoutinePlace,
  })

  // Sensor with activation constraint — disambiguates click vs drag.
  // Drag activates only after pointer moves 8px from origin; below that,
  // onClick/onPointerUp fire normally on the block.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // The drop lands where the CURSOR is, not where the dragged element's box
  // happens to overlap. dnd-kit's default (rectIntersection) scores droppables
  // by area, and a list pill is 262x60 — wide enough to cover whole 15-minute
  // sub-slots in two day columns at once, so the winner was decided by the
  // pill's geometry and could sit a day off from where you aimed. pointerWithin
  // asks the one question a person is asking ("which cell is under my
  // pointer?"); rectIntersection stays as the fallback for the moments the
  // pointer is over no droppable at all (between the grid's cells, over a
  // block), so a drop is never silently swallowed.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const byPointer = pointerWithin(args)
    return byPointer.length > 0 ? byPointer : rectIntersection(args)
  }, [])

  // Edge-hover state for cross-week auto-advance, measured against the grid box.
  const [edgeHover, setEdgeHover] = useState<'left' | 'right' | null>(null)
  const gridBoundsRef = useRef<HTMLDivElement>(null)
  // Has this drag been on the grid yet? A pill dragged out of the list column
  // starts LEFT of the grid; without this, it armed the back-a-week timer at
  // pointer-down and the week flipped out from under the drop (edgeAdvance.ts).
  const enteredGridRef = useRef(false)

  const handleDragMove = (e: DragMoveEvent) => {
    // activatorEvent is the pointer-down that started the drag; adding delta.x
    // gives the current pointer x position relative to the page.
    const activator = e.activatorEvent as PointerEvent | undefined
    const rect = gridBoundsRef.current?.getBoundingClientRect()
    if (!rect) return

    const currentX = (activator?.clientX ?? 0) + (e.delta?.x ?? 0)
    const { edge, entered } = edgeForPointer(currentX, rect, enteredGridRef.current)
    enteredGridRef.current = entered

    if (edge !== edgeHover) {
      setEdgeHover(edge)
      drag.notifyEdge(edge)
    }
  }

  // Every drag starts fresh: the grid has not been entered until this one
  // enters it.
  const handleDragStart = (e: Parameters<typeof drag.dndHandlers.onDragStart>[0]) => {
    enteredGridRef.current = false
    setEdgeHover(null)
    drag.dndHandlers.onDragStart(e)
  }

  // Week bounds: [weekStart, weekStart + dayCount days)
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart)
    e.setDate(e.getDate() + dayCount)
    return e
  }, [weekStart, dayCount])

  const inWeek = (d: Date) => d >= weekStart && d < weekEnd

  // Tasks that have a specific start time AND fall at/after the grid's first
  // hour go into the time grid. Anything earlier is too early to place without
  // being clamped onto FIRST_HOUR — it renders in the all-day lane's Earlier
  // row instead (see earlyTasksByDay).
  const scheduledTasks = useMemo(
    () => tasks.filter((t) => t.scheduledFor && inWeek(t.scheduledFor) && !t.isAllDay && !isEarlyTask(t.scheduledFor)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, weekStart],
  )

  // All-day tasks, grouped by day so each renders in the grid's all-day row
  // under its actual day column. Completed tasks are excluded so finishing one
  // elsewhere (Today, detail panel) removes its chip here.
  const allDayByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.scheduledFor || !t.isAllDay || t.completed) continue
      if (!inWeek(t.scheduledFor)) continue
      const key = dayKey(t.scheduledFor)
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, weekStart])

  // Timed tasks too early for the grid ("Earlier" row) — see scheduledTasks.
  const earlyTasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.scheduledFor || t.isAllDay || t.completed) continue
      if (!inWeek(t.scheduledFor)) continue
      if (!isEarlyTask(t.scheduledFor)) continue
      const key = dayKey(t.scheduledFor)
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, weekStart])

  // In-week calendar events, split into timed (grid material) and all-day
  // (all-day lane). A holiday used to reach the timed grid and get clamped to
  // the 8 AM row (demo run 2026-09-06) — isAllDayEvent keeps it out.
  const { weekEvents, allDayEventsByDay } = useMemo(() => {
    const timed: CalendarEvent[] = []
    const allDayMap = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const startStr =
        (ev as { start_time?: string }).start_time ??
        (ev as { startTime?: string }).startTime
      if (!startStr) continue
      const start = new Date(startStr)
      if (!inWeek(start)) continue
      if (isAllDayEvent(ev)) {
        const key = dayKey(start)
        const arr = allDayMap.get(key)
        if (arr) arr.push(ev)
        else allDayMap.set(key, [ev])
      } else {
        timed.push(ev)
      }
    }
    return { weekEvents: timed, allDayEventsByDay: allDayMap }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, weekStart])

  // Respect the app-wide 'Hide daily activities' toggle (same localStorage key
  // TodayView uses). When true, routines are omitted from the grid; tasks and
  // events still render. Reactive via in-tab custom event + cross-tab storage event.
  const [hideRoutines, setHideRoutines] = useState<boolean>(() => readHideRoutines())

  useEffect(() => onHideRoutinesChange(setHideRoutines), [])

  // Journal is the week; Schedule is the hourly grid, a switch away. The grid
  // needs desk width to read — below lg the spread stacks and is the only mode.
  // Controlled from the masthead when HomeView hosts it (the switch sits by
  // the dates); uncontrolled — with its own switch — when mounted alone.
  const [ownMode, setOwnMode] = useState<WeekMode>('journal')
  const mode = props.mode ?? ownMode
  const narrow = useMediaQuery('(max-width: 1023px)')
  const showSchedule = mode === 'schedule' && !narrow

  // Instance-level overrides for the whole visible week — what a drag on this
  // grid writes. The container's `dateInstances` covers one column only.
  const weekInstances = useWeekInstances(weekStart, dayCount)

  // Convert to TimelineItems for grid rendering. Routine expansion (one item
  // per day column, with any instance-level override applied) lives in
  // buildWeekRoutineItems.
  // Dinner + Specials events leave the time grid (This Week redesign):
  // dinners render in the grid's dinner row, specials fold into the same
  // day's School block subtitle (or stay grid material without one).
  const extras = useMemo(() => partitionWeekExtras(weekEvents), [weekEvents])

  // From the FULL task list, not the week's subset: a step placed on this week
  // whose goal sits on the month list would otherwise lose its label.
  const goalTitles = useMemo(() => goalTitleMap(tasks), [tasks])
  const labelFor = useCallback(
    (t: Task) => (t.goalTaskId ? goalTitles.get(t.goalTaskId) : undefined),
    [goalTitles],
  )

  // Calendar events as items, with the day's Specials folded into its School
  // block subtitle (or kept as their own item on a day without one). Shared by
  // the grid and the journal so the two modes can never disagree about them.
  const eventItems = useMemo(() => {
    const items = extras.rest.map(eventToTimelineItem)
    const schoolByDay = new Map<string, (typeof items)[number]>()
    for (const item of items) {
      if (item.startTime && /^school\b/i.test(item.title)) {
        const key = dayKey(item.startTime)
        if (!schoolByDay.has(key)) schoolByDay.set(key, item)
      }
    }
    for (const [key, entries] of extras.specialsByDay) {
      const school = schoolByDay.get(key)
      if (school) {
        school.subtitle = entries.map((e) => e.label).join(' · ')
      } else {
        items.push(...entries.map((e) => eventToTimelineItem(e.event)))
      }
    }
    return items
  }, [extras])

  // The switch says "Routines", so off means NONE: it used to run only the
  // daily sweep, which left a Sunday-only routine in the journal's Available
  // line with the switch off (Scott, 2026-09-20). The Today page keeps its
  // own reading of the preference.
  const routineItems = useMemo(
    () => hideRoutines ? [] : buildWeekRoutineItems({
      routines,
      weekStart,
      dayCount,
      instances: weekInstances,
      member: selectedAssignees,
      prefs: { hideRoutines: false, layers },
    }),
    [routines, weekStart, dayCount, weekInstances, selectedAssignees, hideRoutines, layers],
  )

  const allItems = useMemo(() => {
    const taskItems = scheduledTasks.map((t) => taskToTimelineItem(t, labelFor(t)))
    const blocks = [...taskItems, ...eventItems, ...routineItems]

    // Keep the actively-dragged task/event mounted even if cross-week auto-
    // advance moved its scheduledFor out of the visible range. Without this,
    // dnd-kit loses the draggable's data registration and the drop is a no-op.
    // WeekEventBlock calls useDraggable before its placement guard, so the
    // drag data stays registered even when computePlacement returns null.
    // WeekGrid's overflow-hidden clips the off-grid render; DragOverlay still
    // shows the floating chip the user sees.
    const activeId = drag.activeDragId
    if (activeId) {
      // Drag ids are 'block:<itemId>' for tasks/events, 'block-routine:<itemId>'
      // for routines. Routines are not draggable, so only handle task/event.
      if (activeId.startsWith('block:')) {
        const itemId = activeId.slice('block:'.length)
        if (!blocks.find((b) => b.id === itemId)) {
          if (itemId.startsWith('task-')) {
            const taskId = itemId.slice('task-'.length)
            const task = tasks.find((t) => t.id === taskId)
            if (task) blocks.push(taskToTimelineItem(task, labelFor(task)))
          } else if (itemId.startsWith('event-')) {
            const event = events.find((ev) => {
              const id = ev.google_event_id || ev.id
              return `event-${id}` === itemId
            })
            if (event) blocks.push(eventToTimelineItem(event))
          }
        }
      }
    }

    return blocks
  }, [scheduledTasks, eventItems, routineItems, drag.activeDragId, tasks, events, labelFor])

  // Run the lane-placement pass over allItems. Items with a startTime outside
  // the visible week range are filtered out by layoutWeekLanes (dayIdx check).
  // However, the drag-mount fallback above may have pushed an out-of-week item
  // into allItems so dnd-kit's draggable registration stays live during cross-
  // week auto-advance. Those items are filtered by layoutWeekLanes and won't
  // appear in placedItems — WeekEventBlock would never mount, dnd-kit would
  // lose registration, and the drop would be a no-op.
  //
  // Fix: after the layout pass, check if the active drag item is absent from
  // placedItems. If so, inject a synthetic PlacedItem with dayIdx=0 / laneIdx=0
  // / laneCount=1. computePlacementFromLane inside WeekEventBlock checks
  // dayIdx === placedItem.dayIdx; since dayIdx from the real startTime != 0
  // (it's outside the week), it returns null — triggering the hidden-stub branch
  // (isDragging → 1×1 invisible div). This is exactly the mounting behaviour
  // the original allBlocks code relied on.
  const placedItems = useMemo<PlacedItem[]>(() => {
    const placed = layoutWeekLanes(allItems, weekStart, dayCount, FIRST_HOUR * 60)

    const activeId = drag.activeDragId
    if (activeId && activeId.startsWith('block:')) {
      const itemId = activeId.slice('block:'.length)
      const alreadyPlaced = placed.some((p) => p.item.id === itemId)
      if (!alreadyPlaced) {
        const fallback = allItems.find((b) => b.id === itemId)
        if (fallback) {
          // dayIdx=0 is intentionally wrong so computePlacementFromLane returns
          // null, which triggers WeekEventBlock's hidden-stub mount path.
          placed.push({ item: fallback, dayIdx: 0, laneIdx: 0, laneCount: 1 })
        }
      }
    }

    return placed
  }, [allItems, weekStart, dayCount, drag.activeDragId])

  // ── Journal spread ────────────────────────────────────────────────────
  // The same inputs the grid reads (layer-filtered tasks and events, routines
  // through the one resolver ladder with its instance overrides), laid out as
  // days instead of hours. Unlike the grid it keeps the whole day: tasks too
  // early for the grid's first hour, all-day tasks, all-day events, and what
  // has been done (struck, the way a paper week keeps it).
  const journalDays = useMemo<JournalDay[]>(() => {
    const days: JournalDay[] = Array.from({ length: dayCount }, (_, i) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)
      return { date, key: localYmd(date), notes: [], entries: [], available: [], dinners: [] }
    })
    const byKey = new Map(days.map((d) => [d.key, d]))
    const timed = new Map(days.map((d) => [d.key, [] as JournalEntry[]]))
    const untimed = new Map(days.map((d) => [d.key, [] as JournalEntry[]]))

    // Tasks: timed ones at their time; untimed ones on the day they are dated
    // to, or the day they were CHOSEN for (a week-list task chosen for
    // Thursday keeps its list but is Thursday's work).
    const seen = new Set<string>()
    for (const t of tasks) {
      const entry = (time?: Date): JournalEntry => ({
        id: `task-${t.id}`, kind: 'task', time, title: t.title, subtitle: labelFor(t), completed: t.completed, task: t,
      })
      if (t.scheduledFor) {
        const key = localYmd(t.scheduledFor)
        if (byKey.has(key)) {
          seen.add(t.id)
          if (t.isAllDay) untimed.get(key)!.push(entry())
          else timed.get(key)!.push(entry(t.scheduledFor))
          continue
        }
      }
      // Chosen for a day (this person's focus; legacy planned_on when the row
      // has no focus rows) — drawn on that day, untimed.
      if (!seen.has(t.id)) {
        for (const key of focusDays(t, userId)) {
          if (byKey.has(key)) { untimed.get(key)!.push(entry()); break }
        }
      }
    }

    for (const item of eventItems) {
      if (!item.startTime) continue
      const key = localYmd(item.startTime)
      if (!byKey.has(key)) continue
      const source = item.originalEvent as CalendarEvent | undefined
      // A multi-day timed event (on call Mon 9am → Fri 5pm) is listed once
      // above the days, not as an entry on its first day.
      if (source && isMultiDayEvent(source)) continue
      timed.get(key)!.push({ id: item.id, kind: 'event', time: item.startTime, title: item.title, subtitle: item.subtitle, completed: false })
    }

    for (const ev of events) {
      const span = eventDays(ev)
      if (!span || !span.allDay || span.first !== span.last) continue
      byKey.get(span.first)?.notes.push(ev)
    }

    for (const [key, entries] of extras.dinnersByDay) byKey.get(key)?.dinners.push(...entries)

    // Routine occurrences: with a time, or chosen for the day, they are the
    // day's entries; an untimed one nobody chose is only available — the same
    // split Today and its pin make (dayPlan.ts).
    for (const r of routineItems) {
      const idx = Number(r.id.match(/-day(\d+)$/)?.[1] ?? -1)
      const day = days[idx]
      if (!day) continue
      const routineId = r.id.slice('routine-'.length).replace(/-day\d+$/, '')
      const instance = weekInstances.find((i) => i.entity_type === 'routine' && i.entity_id === routineId && i.date === day.key)
      const completed = instance?.status === 'completed'
      const planned = instance?.planned_on === day.key
      const pinned = !!r.originalRoutine && isTimelineObligation(r.originalRoutine)
      const entry: JournalEntry = {
        id: r.id, kind: 'routine', time: r.startTime ?? undefined, title: r.title, completed, routineId,
      }
      if (r.startTime) timed.get(day.key)!.push(entry)
      else if (planned || pinned || completed) untimed.get(day.key)!.push(entry)
      else day.available.push({ ...r, completed })
    }

    for (const d of days) {
      const t = timed.get(d.key)!.sort((a, b) => a.time!.getTime() - b.time!.getTime())
      const u = untimed.get(d.key)!.sort((a, b) => Number(a.completed) - Number(b.completed))
      d.entries = [...t, ...u]
    }
    return days
  }, [tasks, userId, events, eventItems, extras, routineItems, weekInstances, weekStart, dayCount, labelFor])

  /**
   * How much is already on each day of the week being VIEWED, for the timing
   * control's day tiles. Counted off `journalDays` — the list the page itself
   * draws — rather than re-derived, so the tiles can never disagree with the
   * days beneath them. Entries are already one-per-thing there; all-day notes
   * are events too, and a dinner is the day's meal, not a commitment to plan
   * around, so it is left out.
   */
  const dayDensities = useMemo(() => {
    // The week's own instances are part of the count, so a week whose
    // instances have not landed is not a week we can report on.
    const readiness = densityReadiness(sources ?? { tasks: 'ready', events: 'ready', routines: 'ready' })
    return journalDays.map((d) => dayDensity(
      d.date,
      [
        // An event is identified by WHAT and WHEN, not by which calendar sent
        // it: the same meeting synced to two calendars arrives twice with
        // different ids (the journal does not merge them — it draws both), and
        // counting it twice would make a day look busier than it is.
        ...d.entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          key: e.kind === 'event' ? `event|${e.title}|${e.time?.getTime() ?? d.key}` : undefined,
        })),
        ...d.notes.map((n) => ({
          id: `event-${n.google_event_id || n.id}`,
          kind: 'event' as const,
          key: `event|${n.title}|allday|${d.key}`,
        })),
      ],
      readiness,
    ))
  }, [journalDays, sources])

  const journalSpans = useMemo(
    () => layoutContextSpans(events, journalDays.map((d) => d.date)),
    [events, journalDays],
  )

  // Ticking from the page. A task's undo writes the EXPLICIT prior state (a
  // second toggle would read a stale snapshot — HomeView's rule). A routine
  // ticks its OCCURRENCE — that day's instance — so Today, the pin and this
  // page show the same completion.
  const { markDone, undoDone, setPlanned, reschedule: rescheduleInstance } = useActionableInstances()
  const handleJournalToggle = useCallback((entry: JournalEntry, day: JournalDay) => {
    if (entry.task) {
      const task = entry.task
      const was = task.completed
      void toggleTask(task.id).then((ok) => {
        if (!ok) return // rolled back and reported by the write itself
        pushAction?.(was ? 'Task marked incomplete' : 'Task completed', () => {
          void onUpdateTask(task.id, { completed: was })
        })
      })
      return
    }
    if (entry.routineId) {
      const id = entry.routineId
      const done = !entry.completed
      void (done ? markDone('routine', id, day.date) : undoDone('routine', id, day.date))
      pushAction?.(done ? 'Routine completed' : 'Routine marked incomplete', () => {
        void (done ? undoDone('routine', id, day.date) : markDone('routine', id, day.date))
      })
    }
  }, [toggleTask, onUpdateTask, pushAction, markDone, undoDone])

  // Rows dragged out of the Today pin (native drag): a day chooses the day, a
  // slot gives the time. Same writes as the pin's own buttons (planActions).
  const planActions = useMemo(() => makePlanActions({
    findTask: (id) => tasks.find((t) => t.id === id) ?? tasks.flatMap((t) => t.subtasks ?? []).find((t) => t.id === id),
    updateTask: (id, u) => onUpdateTask(id, u),
    pushTask: (id, target) => gated.pushTask(id, target),
    setRoutinePlanned: (id, day, planned) => setPlanned('routine', id, day, planned),
    rescheduleRoutine: (id, from, when) => rescheduleInstance('routine', id, from, when),
    pushAction,
    notify: (m) => showToast(m, 'warning'),
  }), [tasks, onUpdateTask, gated, setPlanned, rescheduleInstance, pushAction])
  // "+ Add" on a journal day: a dated, all-day task on that day, assigned to
  // me. Captures never inherit the view's lens, so it lands Unsorted — and
  // when the current filter would then hide it, the toast says so rather
  // than letting the row vanish (the walkthrough's silent-filter trap).
  const handleAddToDay = useCallback(async (day: JournalDay, title: string) => {
    const id = await addTask(title, undefined, undefined, day.date, { isAllDay: true, assignedTo: meId ?? undefined })
    if (!id) return
    const when = day.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const hidden = !layers.has('unsorted')
    showToast(`Added to ${when} · Unsorted · only you${hidden ? ' · hidden by your current view' : ''}`, hidden ? 'warning' : 'success', hidden ? 8000 : undefined)
    pushAction?.(`Added "${title}"`, () => { void deleteTask(id) })
  }, [addTask, deleteTask, meId, layers, pushAction])

  const handlePlanDropOnDay = useCallback((day: JournalDay, payload: PlanDragPayload) => {
    void planActions.drop(payload, { type: 'day', day: day.date })
  }, [planActions])
  const handlePlanDropOnSlot = useCallback((slot: PlanSlot, payload: PlanDragPayload) => {
    const [y, m, d] = slot.dayIso.split('-').map(Number)
    if (slot.hour === undefined) {
      void planActions.drop(payload, { type: 'day', day: new Date(y, m - 1, d) })
      return
    }
    const when = new Date(y, m - 1, d, slot.hour, slot.minute ?? 0)
    // A routine with no day of its own, dragged from the Planning panel onto a
    // slot, is placed for THAT day of this week — an occurrence, never the
    // rule. Changing the repeating schedule is a separate, explicit action
    // (Scott, 2026-09-21).
    if (payload.kind === 'routine') {
      const r = routines.find((x) => x.id === payload.id)
      if (r && r.recurrence_pattern.type === 'weekly' && !r.recurrence_pattern.days?.length) {
        void planActions.placeRoutineOnce(r.id, when, r.name)
        return
      }
    }
    void planActions.drop(payload, { type: 'time', when })
  }, [planActions, routines])

  // Chosen-but-untimed work the grid has no row for: a routine occurrence
  // chosen for its day, a week-list task chosen for a day. Schedule shows them
  // in that day's all-day cell, so the two modes never disagree.
  const plannedAllDay = useMemo(() => {
    const map = new Map<string, JournalEntry[]>()
    for (const d of journalDays) {
      const extra = d.entries.filter((e) =>
        !e.time && (e.kind === 'routine' || (e.task && !(e.task.scheduledFor && localYmd(e.task.scheduledFor) === d.key))))
      if (extra.length) map.set(d.key, extra)
    }
    return map
  }, [journalDays])

  // Suggested open slots while a POOL pill drags — rules-based paint
  // (dropSmarts); never captures the drop. Only pool pills: an already-placed
  // block being moved knows where it's going.
  const suggestedSlotIds = useMemo(() => {
    const activeId = drag.activeDragId
    if (!activeId || !activeId.startsWith('pool:')) return null
    const task = tasks.find((t) => t.id === activeId.slice('pool:'.length))
    if (!task) return null
    const busyByDate = new Map<string, BusyInterval[]>()
    for (const item of allItems) {
      if (!item.startTime) continue
      const key = dayKey(item.startTime)
      const startMinutes = item.startTime.getHours() * 60 + item.startTime.getMinutes()
      const endMinutes = item.endTime
        ? item.endTime.getHours() * 60 + item.endTime.getMinutes()
        : startMinutes + 30
      const list = busyByDate.get(key) ?? []
      list.push({ startMinutes, endMinutes })
      busyByDate.set(key, list)
    }
    const dates = Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    })
    const pad = (n: number) => String(n).padStart(2, '0')
    return new Set(
      suggestSlots(task, busyByDate, {
        dates,
        dayStartHour: FIRST_HOUR,
        dayEndHour: LAST_HOUR,
        slotMinutes: 30,
        now: new Date(),
      }).map((s) => `slot:${s.dateKey}:${pad(s.hour)}:${pad(s.minute)}`),
    )
  }, [drag.activeDragId, tasks, allItems, weekStart, dayCount])

  // WeekEventBlock.onSelect expects (id: string), but onSelectItem is
  // (id: string | null). Narrow here so TypeScript is satisfied; passing null
  // is only needed for deselection, which happens elsewhere.
  // Routine items get a synthetic '-dayN' suffix for React key uniqueness;
  // strip it before forwarding so the detail panel's id-resolution matches the
  // actual routine id stored in the DB.
  const handleSelectBlock = (id: string) => {
    if (id.startsWith('routine-')) {
      onSelectItem(id.replace(/-day\d+$/, ''))
      return
    }
    onSelectItem(id)
  }

  // Keyboard nav: '[' previous week, ']' next week. Skips when focus is in
  // an input/textarea/contentEditable so it doesn't hijack typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') {
        const next = new Date(weekStart)
        next.setDate(next.getDate() - dayCount)
        onWeekChange(next)
      } else if (e.key === ']') {
        const next = new Date(weekStart)
        next.setDate(next.getDate() + dayCount)
        onWeekChange(next)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [weekStart, dayCount, onWeekChange])

  // The week's planning lives in the ONE Planning panel (Scott, 2026-09-21):
  // the dock beside the page on desktop, a sheet on a phone. The viewport is
  // the days. When the panel is closed the page offers it in one line, so a
  // week is never a wall of days with no way to fill them.
  const weekIsCurrent = sameDay(weekAnchor, weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn))
  /**
   * The timing control on a week row — the same component the month and season
   * pages use, so the week is an execution view of the same work rather than a
   * different vocabulary (requirement 2).
   *
   * The weeks it offers come from the week being VIEWED, never the week
   * containing now. "Keep it in <month>" is offered only when the task has a
   * broader commitment to fall back to: with nothing above it, clearing the
   * week has no destination to name, and the brief forbids promising one.
   */
  /** The week's own days as tiles, with what each already holds. */
  const dayChoices = useMemo(() => journalDays.map((d, i) => ({
    date: d.date,
    label: d.date.toLocaleDateString('en-US', { weekday: 'short' }),
    dateLabel: d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    density: dayDensities[i],
  })), [journalDays, dayDensities])

  const weekTimingControl = useCallback((task: Task) => {
    const t = taskTiming(task)
    // What actually survives a removal, read from commitments — not from the
    // cached monthStart, which outlives a commitment that was removed, and
    // never from the goal link, which is not a period commitment at all.
    const broader = broaderCommitment(task)
    const removeTiming = (scope: 'day' | 'all') => {
      const { updates, previous } = timingRemoval(task, scope)
      const kept = scope === 'day' ? removeDayOutcome(t, broader?.label ?? null) : removeAllOutcome(t, broader?.label ?? null)
      const what = scope === 'day'
        ? `Removed ${t.day!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} from “${task.title}”.`
        : `Removed ${t.day ? 'the day and the week' : 'the week'} from “${task.title}”.`
      void Promise.resolve(onUpdateTask(task.id, updates)).then((ok) => {
        if (ok === false) return
        showToast(`${what} ${kept}`, 'success', 8000, {
          label: 'Undo', onClick: () => { void onUpdateTask(task.id, previous) },
        })
      })
    }
    return (
      <PlanWeekMenu
        size="sm"
        title={task.title}
        periodStart={weekAnchor}
        periodLabel={broader?.label ?? undefined}
        timing={t}
        currentWeekStart={t.week}
        // The days of the week in VIEW, never today's: choosing from a
        // November row must offer November days (Scott, 2026-09-24).
        dayChoices={dayChoices}
        dayChoicesLabel={`A day in ${formatWeekRange(weekAnchor)}`}
        onPickWeek={(weekStart) => { void onUpdateTask(task.id, { bucket: 'week', weekStart, scheduledFor: undefined }) }}
        onClearWeek={hasTiming(t) ? () => removeTiming('all') : undefined}
        onRemoveDay={t.day ? () => removeTiming('day') : undefined}
        onPickDay={(date) => { void onUpdateTask(task.id, { bucket: 'timed', scheduledFor: date, isAllDay: true }) }}
      />
    )
  }, [weekAnchor, onUpdateTask, dayChoices])

  const weekListFor = (onPlan: () => void) => (
    <WeekList
      key={localYmd(weekAnchor)}
      tasks={tasks}
      weekStart={weekAnchor}
      meId={meId}
      userId={userId}
      isCurrent={weekIsCurrent}
      onToggle={(task) => handleJournalToggle({ id: `task-${task.id}`, kind: 'task', title: task.title, completed: task.completed, task }, journalDays[0])}
      onSelect={(id) => onSelectItem(`task-${id}`)}
      onAdd={async (title) => {
        const id = await addTask(title, undefined, undefined, undefined, { bucket: 'week', weekStart: weekAnchor, assignedTo: meId ?? undefined })
        if (!id) throw new Error('Task creation failed')
        const hidden = !layers.has('unsorted')
        showToast(`Added to the week · Unsorted · only you${hidden ? ' · hidden by your current view' : ''}`, hidden ? 'warning' : 'success', hidden ? 8000 : undefined)
        pushAction?.(`Added "${title}"`, () => { void deleteTask(id) })
      }}
      onPlan={onPlan}
      timingControl={weekTimingControl}
    />
  )

  // A past week is a look-back, not a plan.
  const weekIsPast = weekAnchor.getTime() + 7 * 86_400_000 <= Date.now()

  return (
    <WeekPlanHost tasks={tasks} weekStart={weekAnchor} meId={meId} isPast={weekIsPast} tools={<>
        {!narrow && props.mode === undefined && (
          <div className="mr-auto"><WeekModeSwitch mode={mode} onChange={setOwnMode} /></div>
        )}
        <RoutinesToggle hidden={hideRoutines} onToggle={() => writeHideRoutines(!hideRoutines)} />
      </>}>
      {({ openSession }) => (
    <div className="relative week-content">

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={drag.dndHandlers.onDragEnd}
        onDragCancel={drag.dndHandlers.onDragCancel}
        onDragMove={handleDragMove}
      >
        {/* The week list stands LEFT of the days, the month list folded beneath
            it (Scott, 2026-09-05: chips down the side, not along the top).
            Inside the DndContext so the rows' useDraggable registers; drops
            ride the existing chip branches in useWeekDragDrop. The month is
            the rung above, read-only — the week is planned by looking at it,
            never by dragging from it. On a narrow screen the list sits above
            the stacked days instead. */}
        {narrow ? (
          <div className="flex flex-col gap-4">
            {weekListFor(openSession)}
            <h2 className="week-days-heading">The days</h2>
            <WeekJournal days={journalDays} spans={journalSpans} onSelectItem={onSelectItem} onToggleEntry={handleJournalToggle} onPlanDrop={handlePlanDropOnDay} onAddToDay={handleAddToDay} narrow dragEnabled={false} timingControl={weekTimingControl} />
          </div>
        ) : (
        <div className="flex items-start gap-4">
        {/* Edge auto-advance measures THIS box, not the whole view. */}
        <div ref={gridBoundsRef} data-week-bounds className="flex-1 min-w-0">
        {!showSchedule ? (
          <>
            {weekListFor(openSession)}
            <h2 className="week-days-heading">The days</h2>
            <WeekJournal days={journalDays} spans={journalSpans} onSelectItem={onSelectItem} onToggleEntry={handleJournalToggle} onPlanDrop={handlePlanDropOnDay} onAddToDay={handleAddToDay} timingControl={weekTimingControl} />
          </>
        ) : (
        <>
        {weekListFor(openSession)}
        <WeekGrid
          weekStart={weekStart}
          dayCount={dayCount}
          renderAllDay={(day) => {
            const key = dayKey(day)
            return (
              <>
                {(allDayEventsByDay.get(key) ?? []).map((ev) => (
                  <WeekAllDayEventChip key={ev.google_event_id || ev.id} event={ev} onSelect={onSelectItem} />
                ))}
                {(allDayByDay.get(key) ?? []).map((t) => (
                  <WeekAllDayChip key={t.id} task={t} onSelect={onSelectItem} />
                ))}
                {(plannedAllDay.get(key) ?? []).map((e) => e.task ? (
                  <WeekAllDayChip key={e.id} task={e.task} onSelect={onSelectItem} />
                ) : (
                  <button key={e.id} type="button" onClick={() => onSelectItem(e.id.replace(/-day\d+$/, ''))}
                    className={`w-full min-w-0 truncate rounded border border-neutral-200 bg-bg-elevated px-1.5 py-0.5 text-left text-[11.5px] text-neutral-600 hover:border-neutral-300 ${e.completed ? 'line-through text-neutral-400' : ''}`}
                    title={e.title}>
                    {e.title}
                  </button>
                ))}
                {(earlyTasksByDay.get(key) ?? []).map((t) => (
                  <WeekAllDayChip
                    key={t.id}
                    task={t}
                    onSelect={onSelectItem}
                    displayLabel={`${formatEarlyTime(t.scheduledFor!)} · ${t.title}`}
                    ariaLabel={`Earlier: ${t.title}`}
                  />
                ))}
              </>
            )
          }}
          renderDinner={
            extras.dinnersByDay.size === 0
              ? undefined
              : (day) =>
                  (extras.dinnersByDay.get(dayKey(day)) ?? []).map(({ event, label }) => (
                    <button
                      key={event.id}
                      type="button"
                      title={label}
                      onClick={() => onSelectItem(`event-${event.google_event_id || event.id}`)}
                      className="block w-full min-w-0 text-left text-[11.5px] leading-tight text-accent-700 truncate hover:underline cursor-pointer"
                    >
                      {label}
                    </button>
                  ))
          }
          onCreateGesture={
            drag.activeDragId
              ? undefined
              : {
                  onSlotPointerDown: gridCreate.onSlotPointerDown,
                  onSlotPointerMove: gridCreate.onGridPointerMove,
                  onSlotPointerUp: gridCreate.onSlotPointerUp,
                }
          }
          suppressCreate={!!drag.activeDragId}
          suggestedSlotIds={suggestedSlotIds}
          onPlanDrop={handlePlanDropOnSlot}
        >
          {placedItems.map((p) => (
            <WeekEventBlock
              key={p.item.id}
              placedItem={p}
              weekStart={weekStart}
              dayCount={dayCount}
              onSelect={handleSelectBlock}
              routinesMovable={!!onPushRoutine}
              onResizeCommit={(itemId, updates) => {
                // itemId from WeekEventBlock is the TimelineItem.id (prefixed).
                // Strip before persisting so the DB update targets the real uuid.
                if (itemId.startsWith('task-')) {
                  void onUpdateTask(itemId.slice('task-'.length), updates as Partial<Task>)
                }
                // Events resize: not wired. Routines: not resizable (disabled in WeekEventBlock).
              }}
            />
          ))}
        </WeekGrid>
        </>
        )}
        </div>
        </div>
        )}

        {placingRoutine && routinePlace && (
          <RoutinePlacePopover
            routine={placingRoutine}
            when={routinePlace.when}
            canOnce={!!onPushRoutine}
            onConfirm={confirmRoutinePlace}
            onCancel={() => setRoutinePlace(null)}
          />
        )}

        {gridCreate.state && (() => {
          const { startTime, endTime } = gridCreate.toTimes(gridCreate.state)
          return (
            <SlotQuickCreatePopover
              anchorRect={gridCreate.state.anchorRect}
              startTime={startTime}
              endTime={endTime}
              onCreate={handleCreate}
              onCancel={gridCreate.close}
            />
          )
        })()}

        {gridCreate.liveGesture && (() => {
          const lg = gridCreate.liveGesture
          // Compute outline rect from the live gesture. anchorRect is the start
          // slot's rect (15-min sub-slot). The height = number-of-15min-slots
          // between start and end, inclusive of the end slot itself.
          const startMinutes = lg.startSlot.hour * 60 + lg.startSlot.minute
          const endMinutes = lg.endSlot.hour * 60 + lg.endSlot.minute + 15
          const minutesSpan = Math.max(15, endMinutes - startMinutes)
          const heightPx = (minutesSpan / 15) * lg.anchorRect.height
          const style: React.CSSProperties = {
            position: 'fixed',
            top: lg.anchorRect.top,
            left: lg.anchorRect.left,
            width: lg.anchorRect.width,
            height: heightPx,
            pointerEvents: 'none',
            zIndex: 55,
          }
          return (
            <div
              style={style}
              className="border-2 border-dashed border-primary-500/60 bg-primary-500/5 rounded-md"
            />
          )
        })()}

        <DragOverlay dropAnimation={null}>
          {drag.activeDragId
            ? (() => {
                // All-day strip chips drag with a 'chip:<taskId>' id and aren't
                // in placedItems — render their own floating pill so the drag
                // has visible feedback (without this the chip looked unmovable).
                // List pills ('pool:' tasks, 'poolroutine:' routines). Without
                // this the drag had NO visible feedback at all — the pill
                // stayed put (a list pill applies no transform, by design:
                // the list must not reflow mid-drag) and the DragOverlay
                // rendered null, so a drag that was working perfectly well
                // looked like a pill that could not be picked up.
                if (drag.activeDragId.startsWith('pool:')) {
                  const task = tasks.find((t) => t.id === drag.activeDragId!.slice('pool:'.length))
                  if (!task) return null
                  return (
                    <div className="pointer-events-none max-w-[260px] rounded-lg border border-primary-300 bg-white px-2 py-1.5 text-[13px] text-neutral-800 shadow-lg">
                      {task.title}
                    </div>
                  )
                }
                if (drag.activeDragId.startsWith('poolroutine:')) {
                  const routine = routines.find((r) => r.id === drag.activeDragId!.slice('poolroutine:'.length))
                  if (!routine) return null
                  return (
                    <div className="pointer-events-none max-w-[260px] rounded-lg border border-primary-200 bg-primary-50 px-2 py-1.5 text-[12.5px] font-semibold text-primary-800 shadow-lg">
                      {routine.name}
                    </div>
                  )
                }
                if (drag.activeDragId.startsWith('chip:') || drag.activeDragId.startsWith('journal:')) {
                  const taskId = drag.activeDragId.slice(drag.activeDragId.indexOf(':') + 1)
                  const task = tasks.find((t) => t.id === taskId)
                  if (!task) return null
                  return (
                    <div className="opacity-80 pointer-events-none">
                      <div className="px-3 py-1.5 rounded-full bg-bg-elevated border border-neutral-300 text-[12px] text-neutral-800 shadow-md whitespace-nowrap">
                        {task.title}
                      </div>
                    </div>
                  )
                }
                // Strip the dnd-kit drag prefix to recover the TimelineItem id.
                // Routines use 'block-routine:', everything else uses 'block:'.
                const itemId = drag.activeDragId.startsWith('block-routine:')
                  ? drag.activeDragId.slice('block-routine:'.length)
                  : drag.activeDragId.startsWith('block:')
                  ? drag.activeDragId.slice('block:'.length)
                  : drag.activeDragId
                const item = placedItems.find((p) => p.item.id === itemId)?.item
                if (!item) return null
                return (
                  <div className="opacity-60 pointer-events-none">
                    <div className="px-2 py-1 rounded-md bg-primary-50 border border-primary-200 text-[12px] text-primary-900 shadow-md whitespace-nowrap">
                      {item.title}
                    </div>
                  </div>
                )
              })()
            : null}
        </DragOverlay>
      </DndContext>
    </div>
      )}
    </WeekPlanHost>
  )
}
