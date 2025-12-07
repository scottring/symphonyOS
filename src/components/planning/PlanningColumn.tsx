import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import { PlanningTimeSlot } from './PlanningTimeSlot'
import { PlanningTaskCard } from './PlanningTaskCard'
import { PlanningEventBlock } from './PlanningEventBlock'
import { PlanningRoutineBlock } from './PlanningRoutineBlock'

interface TimeLabel {
  hour: number
  minute: number
  label: string
}

interface PlanningColumnProps {
  date: Date
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  timeLabels: TimeLabel[]
  slotHeight: number
  dayStartHour: number
}

export function PlanningColumn({
  date,
  tasks,
  events,
  routines,
  timeLabels,
  slotHeight,
  dayStartHour,
}: PlanningColumnProps) {
  const dateKey = formatDateKey(date)
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }, [date])

  // Calculate positions for placed items
  const placedTasks = useMemo(() => {
    return tasks.map((task) => {
      if (!task.scheduledFor) return null

      const taskDate = new Date(task.scheduledFor)
      const hour = taskDate.getHours()
      const minute = taskDate.getMinutes()

      // Calculate top position relative to day start
      const minutesFromStart = (hour - dayStartHour) * 60 + minute
      const top = (minutesFromStart / 30) * slotHeight

      // Duration in slots (default 30 min = 1 slot)
      const duration = task.estimatedDuration || 30
      const height = (duration / 30) * slotHeight

      return {
        task,
        top,
        height,
      }
    }).filter(Boolean) as { task: Task; top: number; height: number }[]
  }, [tasks, slotHeight, dayStartHour])

  // Calculate positions for events
  const placedEvents = useMemo(() => {
    return events.map((event) => {
      const startTimeStr = event.start_time || event.startTime
      const endTimeStr = event.end_time || event.endTime

      if (!startTimeStr) return null

      const startDate = new Date(startTimeStr)
      const endDate = endTimeStr ? new Date(endTimeStr) : null

      const startHour = startDate.getHours()
      const startMinute = startDate.getMinutes()

      // Calculate top position
      const minutesFromStart = (startHour - dayStartHour) * 60 + startMinute
      const top = (minutesFromStart / 30) * slotHeight

      // Calculate height based on duration
      let height = slotHeight // Default 30 min
      if (endDate) {
        const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000
        height = (durationMinutes / 30) * slotHeight
      }

      return {
        event,
        top,
        height: Math.max(height, slotHeight), // Minimum 1 slot
      }
    }).filter(Boolean) as { event: CalendarEvent; top: number; height: number }[]
  }, [events, slotHeight, dayStartHour])

  // Calculate positions for routines
  const placedRoutines = useMemo(() => {
    return routines
      .filter((r) => r.time_of_day) // Only show routines with specific times
      .map((routine) => {
        const [hourStr, minuteStr] = (routine.time_of_day || '09:00').split(':')
        const hour = parseInt(hourStr, 10)
        const minute = parseInt(minuteStr, 10)

        // Calculate top position
        const minutesFromStart = (hour - dayStartHour) * 60 + minute
        const top = (minutesFromStart / 30) * slotHeight

        return {
          routine,
          top,
          height: slotHeight, // Routines are 30 min by default
        }
      })
  }, [routines, slotHeight, dayStartHour])

  return (
    <div
      className={`flex-1 min-w-[200px] border-r border-neutral-200 ${
        isToday ? 'bg-primary-50/30' : ''
      }`}
    >
      {/* Day header */}
      <div
        className={`h-12 px-3 flex flex-col justify-center border-b border-neutral-200 sticky top-0 z-10 ${
          isToday ? 'bg-primary-50' : 'bg-neutral-50'
        }`}
      >
        <span className="text-sm font-medium text-neutral-700">
          {date.toLocaleDateString('en-US', { weekday: 'short' })}
        </span>
        <span
          className={`text-xs ${
            isToday ? 'text-primary-600 font-semibold' : 'text-neutral-500'
          }`}
        >
          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Time slots (drop targets) */}
      <div className="relative">
        {/* Background slots - these are the drop targets */}
        {timeLabels.map(({ hour, minute }) => (
          <PlanningTimeSlot
            key={`${dateKey}-${hour}-${minute}`}
            dateKey={dateKey}
            hour={hour}
            minute={minute}
            height={slotHeight}
          />
        ))}

        {/* Placed tasks - overlay on top of slots */}
        {placedTasks.map(({ task, top, height }) => (
          <div
            key={task.id}
            className="absolute left-1 right-1 z-10"
            style={{ top: `${top}px`, height: `${height}px` }}
          >
            <PlanningTaskCard task={task} isPlaced />
          </div>
        ))}

        {/* Placed events - not draggable */}
        {placedEvents.map(({ event, top, height }) => (
          <div
            key={event.id}
            className="absolute left-1 right-1 pointer-events-none z-5"
            style={{ top: `${top}px`, height: `${height}px` }}
          >
            <PlanningEventBlock event={event} height={height} />
          </div>
        ))}

        {/* Placed routines - not draggable */}
        {placedRoutines.map(({ routine, top, height }) => (
          <div
            key={routine.id}
            className="absolute left-1 right-1 pointer-events-none z-5"
            style={{ top: `${top}px`, height: `${height}px` }}
          >
            <PlanningRoutineBlock routine={routine} />
          </div>
        ))}
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
