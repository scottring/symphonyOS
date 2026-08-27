import type { TodayDataInput, TodayData } from './types'
import { SECTIONS_ORDER } from './types'
import { makeAssigneeFilter } from './assigneeFilter'
import { selectCarriedOver, selectSlipped, selectCompletedInbox, selectTimed } from './taskPools'
import { selectNeedsAttention } from './attention'
import { buildRoutineStatusMap, buildEventStatusMap, selectVisibleRoutines } from './statusMaps'
import { buildGroupedSections } from './grouping'
import { countRoutineUnits } from './routineCollections'
import { deferredInRoutineIds } from './deferredRoutines'
import type { ResolveRoutineCtx } from '@/lib/routineUtils'

function computeIsToday(viewedDate: Date): boolean {
  const today = new Date()
  return (
    viewedDate.getFullYear() === today.getFullYear() &&
    viewedDate.getMonth() === today.getMonth() &&
    viewedDate.getDate() === today.getDate()
  )
}

/** Pure port of TodaySchedule's data memos + counts (~587-975). No React. */
export function computeTodayData(input: TodayDataInput): TodayData {
  const match = makeAssigneeFilter(input.selectedAssignee)
  const isToday = computeIsToday(input.viewedDate)

  // A date expires. Only work inside the grace window keeps a Today slot;
  // everything older is slipped and belongs to the review queue, so every
  // count and linger filter below correctly describes the carried-over lane.
  const overdueTasks = selectCarriedOver(input.tasks, isToday, match)
  const slippedTasks = selectSlipped(input.tasks, isToday, match)
  const attentionItems = isToday
    ? selectNeedsAttention(input.tasks, match, new Date(), input.weekStart)
    : []
  const completedInboxTasks = selectCompletedInbox(input.tasks, input.viewedDate, match)
  const timedTasks = selectTimed(input.tasks, input.viewedDate, match)

  // Completed-task linger: a checked-off task stays visible briefly, then
  // drops out of the displayed list (counts below still use the full pools).
  // `cutoff` undefined → keep all completed (desktop default).
  const cutoff = input.completedLingerCutoff
  const stillVisible = (t: { completed: boolean; updatedAt: Date }): boolean => {
    if (!t.completed || cutoff == null) return true
    return new Date(t.updatedAt).getTime() >= cutoff
  }
  const displayTimedTasks = cutoff == null ? timedTasks : timedTasks.filter(stillVisible)
  const displayOverdueTasks = cutoff == null ? overdueTasks : overdueTasks.filter(stillVisible)

  const routineStatusMap = buildRoutineStatusMap(input.dateInstances)
  const eventStatusMap = buildEventStatusMap(input.dateInstances)
  const routineCtx: ResolveRoutineCtx = {
    date: input.viewedDate,
    member: input.selectedAssignee,
    prefs: { hideRoutines: input.hideRoutines, domain: input.domain },
    // A routine dragged onto this date from another day keeps its own
    // recurrence pattern (see routineTime.ts) — rung 2 would otherwise call
    // it 'not-today' and drop it. deferredInRoutineIds is the same
    // cross-day-only rule useScheduleFiltering.ts uses.
    deferredInto: deferredInRoutineIds(input.dateInstances, input.viewedDate),
  }
  // selectVisibleRoutines keeps Steps (and their collection's parent row)
  // alongside independently-visible routines — see its own docstring —
  // so grouping/counting below can reconstruct collections correctly.
  const visibleRoutines = selectVisibleRoutines(input.routines, routineCtx)

  // filteredEvents: viewed-date filter + dedupe (ports TodaySchedule ~752-777)
  const vY = input.viewedDate.getFullYear()
  const vM = input.viewedDate.getMonth()
  const vD = input.viewedDate.getDate()
  const eventsForDay = input.events.filter((event) => {
    const s = event.start_time || event.startTime
    if (!s) return false
    const es = new Date(s)
    return es.getFullYear() === vY && es.getMonth() === vM && es.getDate() === vD
  })
  // Key on the parsed instant, not the raw string: the same meeting synced to
  // two calendars can report identical times in different forms (e.g.
  // "09:00:00-04:00" on the primary vs "13:00:00Z" on a group calendar).
  const seen = new Set<string>()
  const filteredEvents = eventsForDay.filter((event) => {
    const s = event.start_time || event.startTime
    const key = `${event.title}|${new Date(s!).getTime()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const grouped = buildGroupedSections({
    timedTasks: displayTimedTasks,
    events: filteredEvents,
    routines: visibleRoutines,
    viewedDate: input.viewedDate,
    routineStatusMap,
    eventStatusMap,
    match,
    eventNotesMap: input.eventNotesMap,
    eventContextOverrides: input.eventContextOverrides,
    getDomainForCalendar: input.getDomainForCalendar,
  })

  // Counts. The denominator has to be the actionable rows the user can see, or
  // the progress band reports on a day that isn't on screen: a flat routine
  // count double-counts collection steps, invents rows for steps whose parent
  // isn't on today, and misses a dosed routine's extra slots. countRoutineUnits
  // mirrors the grouping above. Tasks use the FULL pools, not the linger-filtered
  // display ones, so the numbers don't jump when a completed row fades out.
  const routineUnits = countRoutineUnits(visibleRoutines, input.viewedDate, routineStatusMap, match)
  const completedTasks = timedTasks.filter((t) => t.completed).length
  const completedOverdue = overdueTasks.filter((t) => t.completed).length
  const completedCount = completedTasks + routineUnits.completed + completedOverdue
  const incompleteOverdue = overdueTasks.filter((t) => !t.completed).length
  const actionableCount = timedTasks.length + routineUnits.actionable + incompleteOverdue + completedOverdue
  const totalItems = timedTasks.length + filteredEvents.length + visibleRoutines.length + overdueTasks.length
  const progressPercent = actionableCount > 0 ? (completedCount / actionableCount) * 100 : 0

  return {
    isToday,
    overdueTasks: displayOverdueTasks,
    slippedTasks,
    attentionItems,
    completedInboxTasks,
    grouped,
    sectionsOrder: SECTIONS_ORDER,
    counts: { completedCount, incompleteOverdue, actionableCount, totalItems, progressPercent },
  }
}
