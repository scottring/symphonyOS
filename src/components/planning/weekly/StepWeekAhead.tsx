import { useState } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import { WeekView } from '@/components/home/WeekView'
import { sundayOfWeek } from '@/lib/weekHelpers'

interface Props {
  weekDate: Date
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
}

export function StepWeekAhead({ weekDate, tasks, events, routines }: Props) {
  const [viewWeekStart, setViewWeekStart] = useState<Date>(() => sundayOfWeek(weekDate))

  return (
    <div data-testid="step-week-ahead">
      <p className="text-sm text-neutral-500 mb-3">
        Review the big rocks for the next 7 days before you plan.
      </p>
      <WeekView
        tasks={tasks}
        events={events}
        routines={routines}
        dateInstances={[]}
        weekStart={viewWeekStart}
        onWeekChange={setViewWeekStart}
        onSelectDay={() => {}}
      />
    </div>
  )
}
