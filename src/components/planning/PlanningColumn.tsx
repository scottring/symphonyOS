import { useMemo, useCallback, useState } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { PlanningTimeSlot } from './PlanningTimeSlot'
import { PlanningTaskCard } from './PlanningTaskCard'
import { PlanningEventBlock } from './PlanningEventBlock'
import { PlanningRoutineBlock } from './PlanningRoutineBlock'
import { assignOverlapLanes, type Lane } from './overlapLanes'

// Side-by-side lane → absolute-position style. Lanes let time-overlapping items
// sit next to each other instead of stacking. Defaults to one full-width lane.
function laneStyle(lane: Lane | undefined, top: number, height: number, raised: boolean) {
  const totalColumns = lane?.totalColumns ?? 1
  const column = lane?.column ?? 0
  const widthPercent = 100 / totalColumns
  const leftPercent = column * widthPercent
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(4px + ${leftPercent}%)`,
    width: `calc(${widthPercent}% - 8px)`,
    zIndex: raised ? 30 : 10,
  }
}

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
  familyMembers: FamilyMember[]
  eventNotesMap?: Map<string, EventNote>
  timeLabels: TimeLabel[]
  slotHeight: number
  dayStartHour: number
}

export function PlanningColumn({
  date,
  tasks,
  events,
  routines,
  familyMembers,
  eventNotesMap,
  timeLabels,
  slotHeight,
  dayStartHour,
}: PlanningColumnProps) {
  // Helper to find family member by ID
  const getMember = useCallback((id: string | null | undefined) => {
    if (!id) return undefined
    return familyMembers.find(m => m.id === id)
  }, [familyMembers])

  // Click-to-front: overlapping placed cards (esp. full-width routines/events)
  // otherwise hide each other. Clicking one raises it above the rest.
  const [raisedId, setRaisedId] = useState<string | null>(null)
  const dateKey = formatDateKey(date)
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }, [date])

  // Calculate positions for placed tasks. Overlap lanes are computed once across
  // ALL placed item types below, so we only compute position + time range here.
  const placedTasks = useMemo(() => {
    return tasks.map((task) => {
      if (!task.scheduledFor) return null

      const taskDate = new Date(task.scheduledFor)
      const hour = taskDate.getHours()
      const minute = taskDate.getMinutes()

      const minutesFromStart = (hour - dayStartHour) * 60 + minute
      const top = (minutesFromStart / 30) * slotHeight

      const duration = task.estimatedDuration || 30
      const height = (duration / 30) * slotHeight

      return {
        task,
        top,
        height,
        startMinutes: minutesFromStart,
        endMinutes: minutesFromStart + duration,
      }
    }).filter(Boolean) as {
      task: Task
      top: number
      height: number
      startMinutes: number
      endMinutes: number
    }[]
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
      let durationMinutes = 30 // Default 30 min
      if (endDate) {
        durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000
      }
      const height = (durationMinutes / 30) * slotHeight

      return {
        event,
        top,
        height: Math.max(height, slotHeight), // Minimum 1 slot
        startMinutes: minutesFromStart,
        endMinutes: minutesFromStart + Math.max(durationMinutes, 30),
      }
    }).filter(Boolean) as { event: CalendarEvent; top: number; height: number; startMinutes: number; endMinutes: number }[]
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
          startMinutes: minutesFromStart,
          endMinutes: minutesFromStart + 30,
        }
      })
  }, [routines, slotHeight, dayStartHour])

  // Single overlap pass across ALL placed items (tasks + events + routines) so
  // anything sharing a time gets its own side-by-side lane regardless of type —
  // instead of events/routines stacking full-width on top of each other.
  const lanes = useMemo(() => {
    return assignOverlapLanes([
      ...placedTasks.map((p) => ({ id: p.task.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
      ...placedEvents.map((p) => ({ id: p.event.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
      ...placedRoutines.map((p) => ({ id: p.routine.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
    ])
  }, [placedTasks, placedEvents, placedRoutines])

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

        {/* Placed tasks — overlay on slots, laned by the unified overlap pass */}
        {placedTasks.map(({ task, top, height }) => (
          <div
            key={task.id}
            data-testid={`placed-${task.id}`}
            onClick={() => setRaisedId(task.id)}
            className="absolute"
            style={laneStyle(lanes.get(task.id), top, height, raisedId === task.id)}
          >
            <PlanningTaskCard task={task} isPlaced assignee={getMember(task.assignedTo)} />
          </div>
        ))}

        {/* Placed events */}
        {placedEvents.map(({ event, top, height }) => {
          const eventId = event.google_event_id || event.id
          const eventNote = eventNotesMap?.get(eventId)
          const eventAssignee = eventNote?.assignedTo ? getMember(eventNote.assignedTo) : undefined
          return (
            <div
              key={event.id}
              data-testid={`placed-${event.id}`}
              onClick={() => setRaisedId(event.id)}
              className="absolute cursor-pointer"
              style={laneStyle(lanes.get(event.id), top, height, raisedId === event.id)}
            >
              <PlanningEventBlock event={event} height={height} assignee={eventAssignee} />
            </div>
          )
        })}

        {/* Placed routines */}
        {placedRoutines.map(({ routine, top, height }) => (
          <div
            key={routine.id}
            data-testid={`placed-${routine.id}`}
            onClick={() => setRaisedId(routine.id)}
            className="absolute cursor-pointer"
            style={laneStyle(lanes.get(routine.id), top, height, raisedId === routine.id)}
          >
            <PlanningRoutineBlock routine={routine} assignee={getMember(routine.assigned_to)} />
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
