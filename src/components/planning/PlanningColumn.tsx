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
import { layoutLanes, type Lane } from './overlapLanes'

// Max side-by-side lanes before overlapping items collapse into a "+N" chip.
const MAX_LANES = 4

// "8:00 AM" style label from minutes-since-day-start.
function minutesToLabel(minutesFromStart: number, dayStartHour: number): string {
  const total = dayStartHour * 60 + minutesFromStart
  const hour24 = Math.floor(total / 60)
  const minute = total % 60
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return minute === 0 ? `${hour12} ${period}` : `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

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
  // anything sharing a time gets its own side-by-side lane regardless of type.
  // Lanes are capped (MAX_LANES); excess items collapse into a "+N" chip so the
  // visible cards never shred into unreadable slivers.
  const layout = useMemo(() => {
    return layoutLanes([
      ...placedTasks.map((p) => ({ id: p.task.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
      ...placedEvents.map((p) => ({ id: p.event.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
      ...placedRoutines.map((p) => ({ id: p.routine.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
    ], MAX_LANES)
  }, [placedTasks, placedEvents, placedRoutines])

  // Look up a hidden item's label + time so the "+N" popover can list them.
  const itemInfo = useMemo(() => {
    const m = new Map<string, { title: string; time: string }>()
    for (const { task, startMinutes } of placedTasks) m.set(task.id, { title: task.title, time: minutesToLabel(startMinutes, dayStartHour) })
    for (const { event, startMinutes } of placedEvents) m.set(event.id, { title: event.title, time: minutesToLabel(startMinutes, dayStartHour) })
    for (const { routine, startMinutes } of placedRoutines) m.set(routine.id, { title: routine.name, time: minutesToLabel(startMinutes, dayStartHour) })
    return m
  }, [placedTasks, placedEvents, placedRoutines, dayStartHour])

  // Which "+N" chip's reveal popover is open.
  const [openChipId, setOpenChipId] = useState<string | null>(null)

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

        {/* Placed tasks — laned by the unified overlap pass (skip overflow) */}
        {placedTasks.filter(({ task }) => layout.lanes.has(task.id)).map(({ task, top, height }) => (
          <div
            key={task.id}
            data-testid={`placed-${task.id}`}
            onClick={() => setRaisedId(task.id)}
            className="absolute"
            style={laneStyle(layout.lanes.get(task.id), top, height, raisedId === task.id)}
          >
            <PlanningTaskCard task={task} isPlaced assignee={getMember(task.assignedTo)} />
          </div>
        ))}

        {/* Placed events */}
        {placedEvents.filter(({ event }) => layout.lanes.has(event.id)).map(({ event, top, height }) => {
          const eventId = event.google_event_id || event.id
          const eventNote = eventNotesMap?.get(eventId)
          const eventAssignee = eventNote?.assignedTo ? getMember(eventNote.assignedTo) : undefined
          return (
            <div
              key={event.id}
              data-testid={`placed-${event.id}`}
              onClick={() => setRaisedId(event.id)}
              className="absolute cursor-pointer"
              style={laneStyle(layout.lanes.get(event.id), top, height, raisedId === event.id)}
            >
              <PlanningEventBlock event={event} height={height} assignee={eventAssignee} />
            </div>
          )
        })}

        {/* Placed routines */}
        {placedRoutines.filter(({ routine }) => layout.lanes.has(routine.id)).map(({ routine, top, height }) => (
          <div
            key={routine.id}
            data-testid={`placed-${routine.id}`}
            onClick={() => setRaisedId(routine.id)}
            className="absolute cursor-pointer"
            style={laneStyle(layout.lanes.get(routine.id), top, height, raisedId === routine.id)}
          >
            <PlanningRoutineBlock routine={routine} assignee={getMember(routine.assigned_to)} />
          </div>
        ))}

        {/* "+N" overflow chips — collapse items beyond the lane cap. Click to
            reveal the hidden items (title + time) in a popover. */}
        {layout.chips.map((chip) => {
          const top = (chip.startMinutes / 30) * slotHeight
          const open = openChipId === chip.id
          return (
            <div
              key={chip.id}
              className="absolute"
              style={laneStyle({ column: chip.column, totalColumns: chip.totalColumns }, top, slotHeight, open)}
            >
              <button
                type="button"
                onClick={() => setOpenChipId(open ? null : chip.id)}
                aria-label={`${chip.itemIds.length} more overlapping items`}
                className="h-full w-full rounded-lg bg-neutral-200 text-neutral-700 text-xs font-semibold hover:bg-neutral-300 transition-colors flex items-center justify-center"
              >
                +{chip.itemIds.length}
              </button>
              {open && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOpenChipId(null)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-64 overflow-y-auto rounded-xl bg-white shadow-lg border border-neutral-200 p-1.5">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
                      {chip.itemIds.length} more at this time
                    </div>
                    {chip.itemIds.map((id) => {
                      const info = itemInfo.get(id)
                      return (
                        <div key={id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-50">
                          <span className="text-sm text-neutral-800 truncate">{info?.title ?? 'Untitled'}</span>
                          <span className="text-[10px] text-neutral-400 shrink-0">{info?.time ?? ''}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
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
