import type { TodayDataInput, TodayData } from './types'
import { SECTIONS_ORDER } from './types'
import { makeAssigneeFilter } from './assigneeFilter'
import { selectCarriedOver, selectSlipped, selectCompletedInbox, selectTimed } from './taskPools'
import { selectNeedsAttention } from './attention'
import { buildRoutineStatusMap, buildEventStatusMap, selectVisibleRoutines } from './statusMaps'
import { buildGroupedSections } from './grouping'
import { goalTitleMap } from '@/lib/planning/goalSteps'
import { countRoutineUnits } from './routineCollections'
import { selectDayPlan, routineResolveCtx, routinesForMain } from './dayPlan'
import { localYmd } from '@/lib/cadence/config'
import { dedupeCalendarEvents } from '@/lib/calendar/dedupeEvents'

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
  // The day's plan decides what the main list draws; everything it moves off
  // the list waits in the Today pin (dayPlan.ts). Computed first so every
  // pool and count below describes the same rows.
  const dayPlan = selectDayPlan(input)
  const viewedYmd = localYmd(input.viewedDate)
  const chosenToday = (t: { plannedOn?: Date }) => !!t.plannedOn && localYmd(t.plannedOn) === viewedYmd

  // A carried-over task chosen for today is on the main list already.
  const overdueTasks = selectCarriedOver(input.tasks, isToday, match).filter((t) => !chosenToday(t))
  const slippedTasks = selectSlipped(input.tasks, isToday, match)
  const attentionItems = isToday
    ? selectNeedsAttention(input.tasks, match, new Date(), input.weekStart)
    : []
  const completedInboxTasks = selectCompletedInbox(input.tasks, input.viewedDate, match)
  // Dated to the day: a time keeps its row; an untimed one needs choosing
  // first. Chosen tasks from other pools (week list, another day) join.
  const timedTasks = [
    ...selectTimed(input.tasks, input.viewedDate, match).filter((t) => !dayPlan.offMainTaskIds.has(t.id)),
    ...dayPlan.plannedExtraTasks,
  ]
  const plannedExtraIds = new Set(dayPlan.plannedExtraTasks.map((t) => t.id))

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
  // A routine dragged onto this date from another day keeps its own
  // recurrence pattern (see routineTime.ts) — rung 2 would otherwise call it
  // 'not-today' and drop it; routineResolveCtx carries deferredInto for that.
  // selectVisibleRoutines keeps Steps (and their collection's parent row)
  // alongside independently-visible routines — see its own docstring —
  // so grouping/counting below can reconstruct collections correctly.
  // Untimed occurrences not chosen for the day leave for the pin.
  const visibleRoutines = routinesForMain(
    selectVisibleRoutines(input.routines, routineResolveCtx(input)),
    dayPlan.offMainRoutineItemIds,
  )

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
  // Kept even though HomeView now dedupes at the source: Today is reached by
  // callers other than HomeView (tests, the mobile shell), and this function
  // promising its own output is deduped costs one pass over a day's events.
  const filteredEvents = dedupeCalendarEvents(eventsForDay)

  const grouped = buildGroupedSections({
    timedTasks: displayTimedTasks.filter((t) => !plannedExtraIds.has(t.id)),
    plannedTasks: displayTimedTasks.filter((t) => plannedExtraIds.has(t.id)),
    events: filteredEvents,
    routines: visibleRoutines,
    viewedDate: input.viewedDate,
    routineStatusMap,
    eventStatusMap,
    match,
    eventNotesMap: input.eventNotesMap,
    eventContextOverrides: input.eventContextOverrides,
    getDomainForCalendar: input.getDomainForCalendar,
    // Built from the reader's OWN task list, which RLS has already filtered:
    // a goal they cannot see contributes no title, so a shared step can never
    // leak a private goal's name onto Today.
    goalTitles: goalTitleMap(input.tasks),
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
    dayPlan,
    sectionsOrder: SECTIONS_ORDER,
    counts: { completedCount, incompleteOverdue, actionableCount, totalItems, progressPercent },
  }
}
