import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  rectIntersection,
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
import type { Routine } from '@/types/actionable'
import { PlanningHeader } from './PlanningHeader'
import { PlanningGrid } from './PlanningGrid'
import { PlanningTaskDrawer } from './PlanningTaskDrawer'
import { PlanningTaskCard } from './PlanningTaskCard'

interface PlanningSessionProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onClose: () => void
  initialDate?: Date
  getRoutinesForDate?: (date: Date) => Routine[]
}

// Time slot duration in minutes
const SLOT_DURATION = 30

// Default start and end hours for the planning grid
const DAY_START_HOUR = 6
const DAY_END_HOUR = 22

export function PlanningSession({
  tasks,
  events,
  routines,
  onUpdateTask,
  onClose,
  initialDate,
  getRoutinesForDate,
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

  // Get unscheduled tasks (no scheduledFor or in the past)
  const unscheduledTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return tasks.filter((task) => {
      if (task.completed) return false
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

  // Get routines for the date range
  const routinesByDate = useMemo(() => {
    const map = new Map<string, Routine[]>()

    for (const date of dateRange) {
      const dateKey = formatDateKey(date)
      // Use getRoutinesForDate if provided, otherwise use routines prop directly
      const routinesForDay = getRoutinesForDate ? getRoutinesForDate(date) : routines
      map.set(dateKey, routinesForDay)
    }

    return map
  }, [dateRange, getRoutinesForDate, routines])

  // Get the currently dragged task
  const activeTask = useMemo(() => {
    if (!activeId) return null
    return tasks.find((t) => t.id === activeId) ?? null
  }, [activeId, tasks])

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

  // Slot height in pixels (40px = 30 min, so 20px = 15 min)
  const SLOT_HEIGHT = 40
  const PIXELS_PER_15_MIN = SLOT_HEIGHT / 2

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
        const newDuration = Math.max(15, currentDuration + durationChange) // Minimum 15 min

        if (newDuration !== currentDuration) {
          onUpdateTask(taskId, { estimatedDuration: newDuration })
        }
        return
      }

      if (!over) return

      const dropTarget = over.id as string

      // Handle dropping on unscheduled drawer
      if (dropTarget === 'unscheduled-drawer') {
        onUpdateTask(activeId, {
          scheduledFor: null,
          isAllDay: true,
        })
        return
      }

      // Parse the drop target: "slot-{date}-{hour}-{minute}"
      if (dropTarget.startsWith('slot-')) {
        const parts = dropTarget.split('-')
        // slot-2024-12-07-9-30 → [slot, 2024, 12, 07, 9, 30]
        const year = parseInt(parts[1], 10)
        const month = parseInt(parts[2], 10) - 1 // JS months are 0-indexed
        const day = parseInt(parts[3], 10)
        const hour = parseInt(parts[4], 10)
        const minute = parseInt(parts[5], 10)

        // Create date in local time (not UTC) to avoid timezone shift
        const scheduledFor = new Date(year, month, day, hour, minute, 0, 0)

        onUpdateTask(activeId, {
          scheduledFor,
          isAllDay: false,
        })
      }
    },
    [onUpdateTask, tasks]
  )

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col">
      {/* Header */}
      <PlanningHeader
        dateRange={dateRange}
        onClose={onClose}
        onAddDay={handleAddDay}
        onRemoveDay={handleRemoveDay}
        onDateChange={handleDateChange}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
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
          <PlanningTaskDrawer tasks={unscheduledTasks} />

          {/* Planning grid */}
          <PlanningGrid
            dateRange={dateRange}
            scheduledTasksByDate={scheduledTasksByDate}
            eventsByDate={eventsByDate}
            routinesByDate={routinesByDate}
            dayStartHour={DAY_START_HOUR}
            dayEndHour={DAY_END_HOUR}
            slotDuration={SLOT_DURATION}
          />

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {activeTask && (
              <PlanningTaskCard task={activeTask} isDragging />
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
