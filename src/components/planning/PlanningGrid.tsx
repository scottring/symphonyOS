import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { PlanningColumn } from './PlanningColumn'
import { allDayLaneHeight } from '@/lib/planning/allDayLane'

interface PlanningGridProps {
  dateRange: Date[]
  scheduledTasksByDate: Map<string, Task[]>
  eventsByDate: Map<string, CalendarEvent[]>
  /** Passed straight to each column: does this event's calendar accept writes?
   *  Gates the day-grain drag affordance. */
  canMoveEvent?: (event: CalendarEvent) => boolean
  routinesByDate: Map<string, Routine[]>
  /** routine id → this date's instance, per date key. Carries drop-time overrides. */
  routineInstancesByDate?: Map<string, Map<string, ActionableInstance>>
  /** Incomplete, isAllDay tasks scheduled on each day — rendered in the fixed
   *  all-day lane, not the hour grid. */
  allDayTasksByDate?: Map<string, Task[]>
  familyMembers: FamilyMember[]
  eventNotesMap?: Map<string, EventNote>
  dayStartHour: number
  dayEndHour: number
  slotDuration: number
  onOpenDay?: (date: Date) => void
  /** Click-to-create (week-grid-click spec): threaded down to every column's
   *  time slots. Undefined = slots are not clickable. */
  onSlotClick?: (dateKey: string, hour: number, minute: number, anchorEl: HTMLElement) => void
  /** Day grain: the week rung places into a DAY, so the hour axis is not drawn
   *  at all. Everything in this mode is written isAllDay, so the columns hold
   *  the day's items directly. */
  dayGrain?: boolean
}

export function PlanningGrid({
  dateRange,
  scheduledTasksByDate,
  eventsByDate,
  canMoveEvent,
  routinesByDate,
  routineInstancesByDate,
  allDayTasksByDate,
  familyMembers,
  eventNotesMap,
  dayStartHour,
  dayEndHour,
  slotDuration,
  onOpenDay,
  onSlotClick,
  dayGrain = false,
}: PlanningGridProps) {
  // Generate time labels
  const timeLabels = useMemo(() => {
    const labels: { hour: number; minute: number; label: string }[] = []
    for (let hour = dayStartHour; hour < dayEndHour; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        const period = hour >= 12 ? 'PM' : 'AM'
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
        // Only show label on the hour (minute === 0)
        labels.push({
          hour,
          minute,
          label: minute === 0 ? `${displayHour} ${period}` : '',
        })
      }
    }
    return labels
  }, [dayStartHour, dayEndHour, slotDuration])

  // Calculate slot height (in pixels)
  const slotHeight = 40 // 40px per 30-minute slot

  // The all-day lane's height, set by the busiest day on the grid and applied
  // uniformly. The week rung places by day, so this lane is where week
  // placements land — sized to fit them, they stay visible instead of
  // collapsing behind a "+N" that reads as data loss.
  const laneHeight = useMemo(() => {
    let max = 0
    for (const date of dateRange) {
      const n = allDayTasksByDate?.get(formatDateKey(date))?.length ?? 0
      if (n > max) max = n
    }
    return allDayLaneHeight(max)
  }, [dateRange, allDayTasksByDate])

  return (
    <div className="flex-1 overflow-auto">
      {/* Day grain has no hour rail to make room for, so seven columns fit the
          width — min-w-max would force a horizontal scrollbar and hide half the
          week, which is the one thing a week view must not do. */}
      <div className={dayGrain ? 'flex w-full' : 'flex min-w-max'}>
        {/* Time labels column — absent in day grain: there is no hour axis to
            label when the day is the unit being placed into. */}
        {!dayGrain && (
        <div className="shrink-0 w-16 border-r border-neutral-200 bg-neutral-50">
          {/* Header spacer */}
          <div className="h-12 border-b border-neutral-200" />

          {/* All-day label spacer — matches the columns' lane height so hour
              rows below stay aligned across the grid. */}
          <div
            style={{ height: laneHeight }}
            className="px-2 flex items-center border-b border-neutral-200"
          >
            <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">
              All day
            </span>
          </div>

          {/* Time labels */}
          <div>
            {timeLabels.map(({ hour, minute, label }) => (
              <div
                key={`time-${hour}-${minute}`}
                className="relative"
                style={{ height: `${slotHeight}px` }}
              >
                {label && (
                  <span className="absolute -top-2.5 right-2 text-xs text-neutral-500 font-medium">
                    {label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Day columns */}
        {dateRange.map((date) => {
          const dateKey = formatDateKey(date)
          const tasks = scheduledTasksByDate.get(dateKey) || []
          const events = eventsByDate.get(dateKey) || []
          const routines = routinesByDate.get(dateKey) || []
          const allDayTasks = allDayTasksByDate?.get(dateKey) || []

          return (
            <PlanningColumn
              key={dateKey}
              date={date}
              tasks={tasks}
              events={events}
              routines={routines}
              routineInstances={routineInstancesByDate?.get(dateKey)}
              allDayTasks={allDayTasks}
              canMoveEvent={canMoveEvent}
              laneHeight={laneHeight}
              familyMembers={familyMembers}
              eventNotesMap={eventNotesMap}
              timeLabels={timeLabels}
              slotHeight={slotHeight}
              dayStartHour={dayStartHour}
              onOpenDay={onOpenDay}
              onSlotClick={onSlotClick}
              dayGrain={dayGrain}
              // Wide columns (≤3 days on the grid) can afford more side-by-side
              // lanes before collapsing into a "+N" chip.
              maxLanes={dateRange.length <= 3 ? 6 : 4}
            />
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
