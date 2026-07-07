import type { TodayDataInput, TodayData } from './types'
import { SECTIONS_ORDER } from './types'
import { makeAssigneeFilter } from './assigneeFilter'
import { selectOverdue, selectInbox, selectWeek, selectCompletedInbox, selectTimed } from './taskPools'
import { buildRoutineStatusMap, buildEventStatusMap, selectVisibleRoutines } from './statusMaps'
import { buildGroupedSections } from './grouping'

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

  const overdueTasks = selectOverdue(input.tasks, isToday, match)
  const inboxTasks = selectInbox(input.tasks, isToday, match)
  const weekTasks = selectWeek(input.tasks, isToday, match)
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
  const visibleRoutines = selectVisibleRoutines(input.routines, input.hideRoutines)

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

  // Counts — port TodaySchedule ~968-975 exactly.
  const completedTasks = timedTasks.filter((t) => t.completed).length
  const completedRoutines = visibleRoutines.filter((r) => routineStatusMap.get(r.id)?.status === 'completed').length
  const completedOverdue = overdueTasks.filter((t) => t.completed).length
  const completedCount = completedTasks + completedRoutines + completedOverdue
  const incompleteOverdue = overdueTasks.filter((t) => !t.completed).length
  const actionableCount = timedTasks.length + visibleRoutines.length + incompleteOverdue + completedOverdue
  const totalItems = timedTasks.length + filteredEvents.length + visibleRoutines.length + inboxTasks.length + overdueTasks.length
  const progressPercent = actionableCount > 0 ? (completedCount / actionableCount) * 100 : 0

  return {
    isToday,
    overdueTasks: displayOverdueTasks,
    inboxTasks,
    weekTasks,
    completedInboxTasks,
    grouped,
    sectionsOrder: SECTIONS_ORDER,
    counts: { completedCount, incompleteOverdue, actionableCount, totalItems, progressPercent },
  }
}
