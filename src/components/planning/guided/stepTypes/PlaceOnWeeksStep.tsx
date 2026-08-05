// src/components/planning/guided/stepTypes/PlaceOnWeeksStep.tsx
//
// The monthly arc's place-rocks, one rung up. The weekly ritual ends by
// putting rocks on DAYS (schedule-grid); the monthly ritual places moves on
// WEEKS — the month rung's one decision. Before this step existed the monthly
// session could complete without placing a single move (the audit's Finding 2).
//
// Same grid as /month (MonthCalendarGrid in week mode) and the SAME write —
// bucket='week' + week_start, scheduledFor cleared, isAllDay reset — so the
// session and the page can never disagree about what a month placement means.
// The grid's built-in rocks rail is the shelf: this month's undated moves,
// draggable, with drag-back-to-unplace.
import { useEffect, useMemo, useRef } from 'react'
import { MonthCalendarGrid } from '@/components/planning/horizon/MonthCalendarGrid'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'

export function PlaceOnWeeksStep() {
  const { host, periodStart, periodEnd } = useGuided()
  const match = useMemo(() => makeAssigneeFilter([]), [])

  const tasks = useMemo(
    () => host.tasks.filter((t) => match(t.assignedTo, t.assignedToAll)),
    [host.tasks, match],
  )

  // The progress line's two counts — the same two kinds of "placed" as the
  // /month masthead: a week with no day IS placed (allday_lane_drop_visibility
  // taught us a placement that vanishes from every count reads as data loss).
  // `toPlace` mirrors the grid's own rocks-rail derivation exactly (including
  // the copied-down exclusion), or the line and the rail disagree on the count.
  const { toPlace, placed } = useMemo(() => {
    const start = new Date(periodStart)
    start.setHours(0, 0, 0, 0)
    const inMonth = (d: Date) => d >= start && d <= periodEnd
    const copiedDown = new Set(
      tasks.filter((t) => !t.completed && t.sourceId).map((t) => t.sourceId as string),
    )
    let toPlace = 0
    let placed = 0
    for (const t of tasks) {
      if (t.completed) continue
      if (t.bucket === 'month' && !t.scheduledFor) {
        if (!copiedDown.has(t.id)) toPlace += 1
      }
      else if (t.bucket === 'week' && t.weekStart && inMonth(new Date(t.weekStart))) placed += 1
      else if (t.bucket === 'timed' && t.scheduledFor && inMonth(new Date(t.scheduledFor))) placed += 1
    }
    return { toPlace, placed }
  }, [tasks, periodStart, periodEnd])

  // Events give the grid its terrain. Fetch once — but only once CONNECTED
  // (the provider may still be validating; see CalendarStep/ScheduleGridStep).
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!host.calendarConnected || fetchedRef.current) return
    fetchedRef.current = true
    void host.fetchEvents(periodStart, periodEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when first connected
  }, [host.calendarConnected])

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-400">
        {placed} placed · {toPlace} to place — a move may stay unplaced on purpose; it keeps living on the month list.
      </p>
      <MonthCalendarGrid
        month={periodStart}
        tasks={tasks}
        events={host.events}
        // The month rung's one decision: which WEEK. scheduledFor is cleared,
        // not just left unwritten — a date implies bucket='timed' (the timed
        // invariant), and a week placement must set neither.
        onPlaceTasksInWeek={(ids, weekStart) =>
          ids.forEach((id) =>
            host.onUpdateTask(id, { bucket: 'week', weekStart, scheduledFor: undefined, isAllDay: false }))}
        // Back to the rail clears the week too, or the move returns to
        // "unplaced" secretly carrying one (the MonthPage rule).
        onUnscheduleTask={(id) =>
          host.onUpdateTask(id, { bucket: 'month', scheduledFor: undefined, weekStart: undefined })}
      />
    </div>
  )
}
