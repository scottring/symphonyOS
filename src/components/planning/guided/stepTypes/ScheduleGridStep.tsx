// src/components/planning/guided/stepTypes/ScheduleGridStep.tsx
//
// Weekly "place the big rocks": the existing StepSchedule grid, fed this
// week's list and events. Fetches the week's events once on entry.
import { useEffect, useMemo } from 'react'
import { StepSchedule } from '@/components/planning/weekly/StepSchedule'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'

export function ScheduleGridStep() {
  const { host, periodStart, periodEnd } = useGuided()
  const match = useMemo(() => makeAssigneeFilter([]), [])
  const priorities = useMemo(
    () => host.tasks.filter((t) => !t.completed && t.bucket === 'week' && match(t.assignedTo, t.assignedToAll)),
    [host.tasks, match],
  )
  useEffect(() => {
    if (!host.calendarConnected) return
    void host.fetchEvents(periodStart, periodEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per entry
  }, [])
  return (
    <div className="h-[60vh] min-h-[420px]">
      <StepSchedule
        weekDate={periodStart}
        priorities={priorities}
        events={host.events}
        routines={host.routines}
        draggableRoutines={host.draggableRoutines}
        onScheduleRoutine={host.onScheduleRoutine}
        getRoutinesForDate={host.getRoutinesForDate}
        onUpdateTask={host.onUpdateTask}
        onPushTask={host.onPushTask}
      />
    </div>
  )
}
