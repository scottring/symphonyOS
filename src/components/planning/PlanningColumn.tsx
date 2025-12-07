import { useMemo, useCallback } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
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
  const dateKey = formatDateKey(date)
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }, [date])

  // Calculate positions for placed items with overlap handling
  const placedTasks = useMemo(() => {
    const taskPositions = tasks.map((task) => {
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

      // Store start/end minutes for overlap detection
      const startMinutes = minutesFromStart
      const endMinutes = startMinutes + duration

      return {
        task,
        top,
        height,
        startMinutes,
        endMinutes,
        // These will be calculated after overlap detection
        column: 0,
        totalColumns: 1,
      }
    }).filter(Boolean) as { 
      task: Task; 
      top: number; 
      height: number; 
      startMinutes: number;
      endMinutes: number;
      column: number;
      totalColumns: number;
    }[]

    // Sort by start time for overlap detection
    taskPositions.sort((a, b) => a.startMinutes - b.startMinutes)

    // Find overlapping groups and assign columns
    const processed = new Set<number>()
    
    for (let i = 0; i < taskPositions.length; i++) {
      if (processed.has(i)) continue
      
      // Find all tasks that overlap with this one (directly or transitively)
      const group: number[] = [i]
      let maxEnd = taskPositions[i].endMinutes
      
      for (let j = i + 1; j < taskPositions.length; j++) {
        if (processed.has(j)) continue
        
        // Check if this task overlaps with any task in the current group
        const task = taskPositions[j]
        if (task.startMinutes < maxEnd) {
          group.push(j)
          maxEnd = Math.max(maxEnd, task.endMinutes)
        }
      }
      
      // Assign columns to tasks in the group
      const totalColumns = group.length
      group.forEach((idx, col) => {
        taskPositions[idx].column = col
        taskPositions[idx].totalColumns = totalColumns
        processed.add(idx)
      })
    }

    return taskPositions
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

        {/* Placed tasks - overlay on top of slots with overlap handling */}
        {placedTasks.map(({ task, top, height, column, totalColumns }) => {
          // Calculate horizontal position for overlapping tasks
          const widthPercent = 100 / totalColumns
          const leftPercent = column * widthPercent
          
          return (
            <div
              key={task.id}
              className="absolute z-10"
              style={{
                top: `${top}px`,
                height: `${height}px`,
                left: `calc(4px + ${leftPercent}%)`,
                width: `calc(${widthPercent}% - 8px)`,
              }}
            >
              <PlanningTaskCard task={task} isPlaced assignee={getMember(task.assignedTo)} />
            </div>
          )
        })}

        {/* Placed events - not draggable */}
        {placedEvents.map(({ event, top, height }) => {
          const eventId = event.google_event_id || event.id
          const eventNote = eventNotesMap?.get(eventId)
          const eventAssignee = eventNote?.assignedTo ? getMember(eventNote.assignedTo) : undefined
          return (
            <div
              key={event.id}
              className="absolute left-1 right-1 pointer-events-none"
              style={{ top: `${top}px`, height: `${height}px` }}
            >
              <PlanningEventBlock event={event} height={height} assignee={eventAssignee} />
            </div>
          )
        })}

        {/* Placed routines - not draggable */}
        {placedRoutines.map(({ routine, top, height }) => (
          <div
            key={routine.id}
            className="absolute left-1 right-1 pointer-events-none"
            style={{ top: `${top}px`, height: `${height}px` }}
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
