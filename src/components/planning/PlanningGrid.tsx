import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import { PlanningColumn } from './PlanningColumn'

interface PlanningGridProps {
  dateRange: Date[]
  scheduledTasksByDate: Map<string, Task[]>
  eventsByDate: Map<string, CalendarEvent[]>
  routinesByDate: Map<string, Routine[]>
  dayStartHour: number
  dayEndHour: number
  slotDuration: number
}

export function PlanningGrid({
  dateRange,
  scheduledTasksByDate,
  eventsByDate,
  routinesByDate,
  dayStartHour,
  dayEndHour,
  slotDuration,
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

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex min-w-max">
        {/* Time labels column */}
        <div className="shrink-0 w-16 border-r border-neutral-200 bg-neutral-50">
          {/* Header spacer */}
          <div className="h-12 border-b border-neutral-200" />

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

        {/* Day columns */}
        {dateRange.map((date) => {
          const dateKey = formatDateKey(date)
          const tasks = scheduledTasksByDate.get(dateKey) || []
          const events = eventsByDate.get(dateKey) || []
          const routines = routinesByDate.get(dateKey) || []

          return (
            <PlanningColumn
              key={dateKey}
              date={date}
              tasks={tasks}
              events={events}
              routines={routines}
              timeLabels={timeLabels}
              slotHeight={slotHeight}
              dayStartHour={dayStartHour}
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
