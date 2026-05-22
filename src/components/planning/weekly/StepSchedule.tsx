import { PlanningSession } from '@/components/planning/PlanningSession'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

interface Props {
  weekDate: Date
  priorities: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
}

export function StepSchedule({ weekDate, priorities, events, routines, onUpdateTask, onPushTask }: Props) {
  return (
    <PlanningSession
      tasks={priorities}
      events={events}
      routines={routines}
      onUpdateTask={onUpdateTask}
      onPushTask={onPushTask}
      onClose={() => {}}
      initialDate={weekDate}
    />
  )
}
