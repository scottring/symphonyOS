import { PlanningSession } from '@/components/planning/PlanningSession'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

interface Props {
  weekDate: Date
  /** How many day columns to open with. The week rung places into a DAY, so
   *  the grid must show the days available to place on — it defaulted to ONE,
   *  which meant "place the big rocks" offered a single column while /week
   *  showed seven. Same component, different day count, and the step was the
   *  one that looked broken. */
  days?: number
  /** Reject task drops on days before this date (see PlanningSession). */
  minDropDate?: Date
  priorities: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  /** Selected, untimed routines offered as draggable chips in the drawer. */
  draggableRoutines?: Routine[]
  /** Pin a dragged routine to a date's weekday + time. */
  onScheduleRoutine?: (routineId: string, date: Date, time: string) => void
  /** Per-day routine resolver so each grid column shows the routines recurring that day. */
  getRoutinesForDate?: (date: Date) => Routine[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
}

export function StepSchedule({
  weekDate,
  days = 7,
  minDropDate,
  priorities,
  events,
  routines,
  draggableRoutines,
  onScheduleRoutine,
  getRoutinesForDate,
  onUpdateTask,
  onPushTask,
}: Props) {
  return (
    <div className="h-full">
      <PlanningSession
        tasks={priorities}
        events={events}
        routines={routines}
        draggableRoutines={draggableRoutines}
        onScheduleRoutine={onScheduleRoutine}
        getRoutinesForDate={getRoutinesForDate}
        onUpdateTask={onUpdateTask}
        onPushTask={onPushTask}
        onClose={() => {}}
        initialDate={weekDate}
        initialDays={days}
        minDropDate={minDropDate}
        embedded
        // Weekly session: placing a rock picks its DAY, not its hour (the week
        // rung's one decision). Matches the /week page.
        placementGrain="day"
      />
    </div>
  )
}
