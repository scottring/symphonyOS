// src/components/planning/guided/stepTypes/ScheduleGridStep.tsx
//
// Weekly "place the big rocks": the existing StepSchedule grid, fed this
// week's list and events. Fetches the week's events once on entry.
import { useEffect, useMemo, useRef } from 'react'
import { StepSchedule } from '@/components/planning/weekly/StepSchedule'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'

export function ScheduleGridStep() {
  const { host, periodStart, periodEnd } = useGuided()
  const match = useMemo(() => makeAssigneeFilter([]), [])
  const priorities = useMemo(
    () => host.tasks.filter((t) => {
      if (t.completed || !match(t.assignedTo, t.assignedToAll)) return false
      // The week's list (unscheduled pool + anything still bucketed to the week).
      if (t.bucket === 'week') return true
      // Placed rocks: dropping a task onto the grid stamps a scheduledFor and
      // flips its bucket week→timed. Without this it would fall out of the
      // week filter and vanish from the grid the instant it's scheduled. Keep
      // any task scheduled into THIS week visible where it was dropped.
      if (t.scheduledFor) {
        const d = new Date(t.scheduledFor)
        return d >= periodStart && d <= periodEnd
      }
      return false
    }),
    [host.tasks, match, periodStart, periodEnd],
  )
  // Fetch once — but only once CONNECTED (the provider may still be
  // validating the Google connection when this step mounts; see CalendarStep).
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!host.calendarConnected || fetchedRef.current) return
    fetchedRef.current = true
    void host.fetchEvents(periodStart, periodEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when first connected
  }, [host.calendarConnected])
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
