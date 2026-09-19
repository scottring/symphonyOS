import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActionableInstance } from '@/types/actionable'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useRoutines } from '@/hooks/useRoutines'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'
import { readHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { routinesForViewedDate } from '@/lib/today/routinesForDate'
import { selectDayPlan, type DayPlan } from '@/lib/today/dayPlan'
import { weekStartAnchor, readCadenceConfig, localYmd } from '@/lib/cadence/config'

/**
 * The day plan for the Today pin, read from the SAME sources Today reads:
 * layer-filtered tasks, the day's routines (pattern + deferrals − skips), the
 * day's instances, the shared assignee lens and hide-daily preference. The pin
 * lives in the shell beside any page, so it cannot borrow Today's data — it
 * rebuilds the identical input and runs the identical selector.
 */
export function useDayPlan(day: Date): { plan: DayPlan | null; loading: boolean; error: boolean } {
  const { tasks, loading: tasksLoading, error: tasksError } = useSupabaseTasks()
  const { routines: allRoutines, getRoutinesForDate, loading: routinesLoading } = useRoutines()
  const { getInstancesForDate } = useActionableInstances()
  const { layers } = useDomain()
  const [selectedAssignees] = useAssigneeFilter()
  const [hideRoutines, setHideRoutines] = useState(() => readHideRoutines())
  useEffect(() => onHideRoutinesChange(setHideRoutines), [])

  const dayKey = localYmd(day)
  const [instances, setInstances] = useState<ActionableInstance[] | null>(null)
  const refresh = useCallback(async () => {
    const [y, m, d] = dayKey.split('-').map(Number)
    setInstances(await getInstancesForDate(new Date(y, m - 1, d)))
  }, [dayKey, getInstancesForDate])
  useEffect(() => {
    void refresh()
    return onInstancesChanged(() => void refresh())
  }, [refresh])

  const plan = useMemo(() => {
    if (!instances) return null
    const [y, m, d] = dayKey.split('-').map(Number)
    const viewedDate = new Date(y, m - 1, d)
    return selectDayPlan({
      tasks: filterTasksForLayers(tasks, layers),
      routines: routinesForViewedDate(getRoutinesForDate(viewedDate), allRoutines, instances, viewedDate),
      dateInstances: instances,
      viewedDate,
      selectedAssignee: selectedAssignees,
      hideRoutines,
      layers,
      weekStart: weekStartAnchor(viewedDate, readCadenceConfig().weekStartsOn),
    })
  }, [instances, dayKey, tasks, layers, getRoutinesForDate, allRoutines, selectedAssignees, hideRoutines])

  return { plan, loading: tasksLoading || routinesLoading || !instances, error: !!tasksError }
}
