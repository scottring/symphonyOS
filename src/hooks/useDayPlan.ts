import { weekRoutineChoices } from '@/lib/planning/weekRoutineChoices'
import { useEffect, useMemo, useState } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useRoutines } from '@/hooks/useRoutines'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useDateInstances } from '@/hooks/useDateInstances'
import { readHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { routinesForViewedDate } from '@/lib/today/routinesForDate'
import { selectDayPlan, type DayPlan } from '@/lib/today/dayPlan'
import { unhomedRoutines } from '@/lib/week/unhomedRoutines'
import { useWeekInstances } from '@/components/home/week/useWeekInstances'
import { weekStartAnchor, readCadenceConfig, localYmd } from '@/lib/cadence/config'

/**
 * The day plan for the Today pin, read from the SAME sources Today reads:
 * layer-filtered tasks, the day's routines (pattern + deferrals − skips), the
 * day's instances, the shared assignee lens and hide-daily preference. The pin
 * lives in the shell beside any page, so it cannot borrow Today's data — it
 * rebuilds the identical input and runs the identical selector.
 */
export function useDayPlan(
  day: Date,
  /** The week the pin's THIS WEEK group should answer for. Omitted = the week
   *  `day` falls in. A week page passes the week it is showing so the pin and
   *  the page are not answering for different weeks. */
  weekStartOverride?: Date | null,
): { plan: DayPlan | null; loading: boolean; error: boolean } {
  const { tasks, loading: tasksLoading, error: tasksError, userId } = useSupabaseTasks()
  const { routines: allRoutines, getRoutinesForDate, loading: routinesLoading } = useRoutines()
  const { getInstancesForDate } = useActionableInstances()
  const { layers } = useDomain()
  const [selectedAssignees] = useAssigneeFilter()
  const [hideRoutines, setHideRoutines] = useState(() => readHideRoutines())
  useEffect(() => onHideRoutinesChange(setHideRoutines), [])

  const dayKey = localYmd(day)
  const weekKey = weekStartOverride ? localYmd(weekStartOverride) : null
  const weekStart = useMemo(() => {
    if (weekKey) { const [wy, wm, wd] = weekKey.split('-').map(Number); return new Date(wy, wm - 1, wd) }
    const [y, m, d] = dayKey.split('-').map(Number)
    return weekStartAnchor(new Date(y, m - 1, d), readCadenceConfig().weekStartsOn)
  }, [dayKey, weekKey])
  // Every instance touching the planned week: a flexible routine already
  // placed on one of its days has a home for that week and leaves To plan.
  const weekInstances = useWeekInstances(weekStart, 7)
  const { instances } = useDateInstances(day, getInstancesForDate)

  const plan = useMemo(() => {
    if (!instances) return null
    const [y, m, d] = dayKey.split('-').map(Number)
    const viewedDate = new Date(y, m - 1, d)
    const dayPlan = selectDayPlan({
      tasks: filterTasksForLayers(tasks, layers),
      routines: routinesForViewedDate(getRoutinesForDate(viewedDate), allRoutines, instances, viewedDate),
      dateInstances: instances,
      viewedDate,
      referenceMonth: weekStartOverride ?? viewedDate,
      selectedAssignee: selectedAssignees,
      hideRoutines,
      layers,
      weekStart,
      userId,
      // Weekly routines with no day of their own join the To plan list. The
      // hide-daily preference is a grid preference, not a planning one.
      unhomedRoutines: unhomedRoutines(allRoutines, { member: selectedAssignees, prefs: { hideRoutines: false, layers } },
        { weekStart, instances: weekInstances }),
    })
    return weekStartOverride ? {
      ...dayPlan,
      weekRoutineDays: weekRoutineChoices({ weekStart, selectedAssignee: selectedAssignees, hideRoutines, layers }, allRoutines, getRoutinesForDate, weekInstances),
    } : dayPlan
  }, [instances, dayKey, weekStartOverride, weekStart, weekInstances, tasks, layers, getRoutinesForDate, allRoutines, selectedAssignees, hideRoutines, userId])

  return { plan, loading: tasksLoading || routinesLoading || !instances, error: !!tasksError }
}
