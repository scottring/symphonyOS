import { useCallback, useEffect, useState } from 'react'
import type { ActionableInstance } from '@/types/actionable'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'
import { addDays } from '@/lib/dateUtils'

/**
 * Every actionable_instance touching the visible week.
 *
 * The container's `dateInstances` is scoped to the VIEWED DATE, which is one of
 * the grid's seven columns — so the grid needs its own span or six columns
 * render as if no one had ever dragged anything on them.
 *
 * actionable_instances has no realtime channel; writers announce themselves on
 * the instances signal instead (see emitInstancesChanged), so a drop refreshes
 * this without a reload.
 */
export function useWeekInstances(weekStart: Date, dayCount: number): ActionableInstance[] {
  const { getInstancesForRange } = useActionableInstances()
  const [instances, setInstances] = useState<ActionableInstance[]>([])

  // Depend on the timestamp, not the Date object: HomeView rebuilds weekStart
  // on every render, and an object identity in the dep array would refetch the
  // week on each one.
  const weekStartMs = weekStart.getTime()

  const refresh = useCallback(async () => {
    const start = new Date(weekStartMs)
    const rows = await getInstancesForRange(start, addDays(start, dayCount - 1))
    setInstances(rows)
  }, [weekStartMs, dayCount, getInstancesForRange])

  useEffect(() => {
    void refresh()
    return onInstancesChanged(() => void refresh())
  }, [refresh])

  return instances
}
