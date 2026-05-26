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
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { PlanningHeader } from './PlanningHeader'
import { PlanningGrid } from './PlanningGrid'
import { PlanningTaskDrawer } from './PlanningTaskDrawer'
import { PlanningTaskCard } from './PlanningTaskCard'
import { PlanningRoutineDragCard, ROUTINE_DRAG_PREFIX } from './PlanningRoutineDragCard'
import { PlanningEventBlock, PLACED_EVENT_DRAG_PREFIX } from './PlanningEventBlock'
import { PlanningRoutineBlock, PLACED_ROUTINE_DRAG_PREFIX } from './PlanningRoutineBlock'
import { computeEventReschedule } from './planningReschedule'

interface PlanningSessionProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  /** Untimed routines shown in the drawer as draggable chips (weekly planning). */
  draggableRoutines?: Routine[]
  /** Drop handler for a dragged routine: pins it to a date's weekday + time. */
  onScheduleRoutine?: (routineId: string, date: Date, time: string) => void
  /** Reschedule a placed calendar event to a new start/end (preserves duration). */
  onRescheduleEvent?: (event: CalendarEvent, startTime: Date, endTime: Date) => void
  familyMembers?: FamilyMember[]
  eventNotesMap?: Map<string, EventNote>
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onClose: () => void
  initialDate?: Date
  getRoutinesForDate?: (date: Date) => Routine[]
  embedded?: boolean
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
  onScheduleRoutine,
  onRescheduleEvent,
  familyMembers = [],
  eventNotesMap,
  onUpdateTask,
  onPushTask,
  onClose,
  initialDate,
  getRoutinesForDate,
  embedded = false,
}: PlanningSessionProps) {
  // Date range state - start with the initial date if provided
  const [dateRange, setDateRange] = useState<Date[]>(() => {
    const startDate = initialDate ? new Date(initialDate) : new Date()
    startDate.setHours(0, 0, 0, 0)
    return [startDate]
  })

  // Active drag state
  const [activeId, setActiveId] = useState<string | null>(null)

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
  const unscheduledTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return tasks.filter((task) => {
      if (task.completed) return false

      // Exclude tasks deferred to a future date
      if (task.deferredUntil) {
        const deferDate = new Date(task.deferredUntil)
        deferDate.setHours(0, 0, 0, 0)
        if (deferDate > today) return false
      }

      // Include all-day tasks (so they can be time-blocked)
      if (task.isAllDay) return true

      if (!task.scheduledFor) return true
      // Include tasks scheduled for past dates (they need to be rescheduled)
      const taskDate = new Date(task.scheduledFor)
      taskDate.setHours(0, 0, 0, 0)
      return taskDate < today
    })
  }, [tasks])

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
      map.set(dateKey, routinesForDay)
    }

    return map
  }, [dateRange, getRoutinesForDate, routines, hideRoutines])

  // Get the currently dragged task
  const activeTask = useMemo(() => {
    if (!activeId) return null
    return tasks.find((t) => t.id === activeId) ?? null
  }, [activeId, tasks])

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
        const date = new Date(parsed.year, parsed.month, parsed.day)
        const time = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
        onScheduleRoutine?.(activeId.slice(ROUTINE_DRAG_PREFIX.length), date, time)
        return
      }

      // Placed routine reschedule (id `placed-routine-<id>`): same effect as a
      // drawer-routine drop — pin it to the slot's weekday + time.
      if (activeId.startsWith(PLACED_ROUTINE_DRAG_PREFIX)) {
        if (!dropTarget.startsWith('slot-')) return
        const parsed = parseSlotId(dropTarget)
        if (!parsed) return
        const date = new Date(parsed.year, parsed.month, parsed.day)
        const time = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
        onScheduleRoutine?.(activeId.slice(PLACED_ROUTINE_DRAG_PREFIX.length), date, time)
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

        // Create date in local time (not UTC) to avoid timezone shift
        const scheduledFor = new Date(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute, 0, 0)

        // bucket:'timed' is required for the task to surface in the Today/Day
        // view (selectTimed filters on bucket==='timed'); scheduledFor alone
        // only shows in the Week grid. Keep them in lockstep.
        onUpdateTask(activeId, {
          bucket: 'timed',
          scheduledFor,
          isAllDay: false,
        })
      }
    },
    [onUpdateTask, tasks, onScheduleRoutine, onRescheduleEvent, events]
  )

  return (
    <div className={embedded ? 'h-full bg-bg-base flex flex-col' : 'fixed inset-0 z-50 bg-bg-base flex flex-col'}>
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

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
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
        >
          {/* Task drawer (sidebar) */}
          <PlanningTaskDrawer tasks={unscheduledTasks} routines={draggableRoutines} onPushTask={onPushTask} />

          {/* Planning grid */}
          <PlanningGrid
            dateRange={dateRange}
            scheduledTasksByDate={scheduledTasksByDate}
            eventsByDate={eventsByDate}
            routinesByDate={routinesByDate}
            familyMembers={familyMembers}
            eventNotesMap={eventNotesMap}
            dayStartHour={DAY_START_HOUR}
            dayEndHour={DAY_END_HOUR}
            slotDuration={SLOT_DURATION}
          />

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
