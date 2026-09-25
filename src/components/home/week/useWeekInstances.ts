import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Paging to another week while the first week's fetch is still in flight
  // must not let that late response land on top of the new week's rows: only
  // the most recent request may set state.
  const seq = useRef(0)
  const refresh = useCallback(async () => {
    const mine = ++seq.current
    const start = new Date(weekStartMs)
    const rows = await getInstancesForRange(start, addDays(start, dayCount - 1))
    if (mine === seq.current) setInstances(rows)
  }, [weekStartMs, dayCount, getInstancesForRange])

  useEffect(() => {
    // `dayCount <= 0` is "no window, don't ask": the shared day-choice hook
    // runs on surfaces that may have no week to offer, and hooks cannot be
    // called conditionally. Every existing caller passes 7.
    //
    // It must not SET state either, even to empty. A caller whose
    // `getInstancesForRange` is a fresh function each render (a test double,
    // typically) rebuilds `refresh` every render, so an unconditional
    // `setInstances([])` here re-rendered forever — a real out-of-memory
    // crash, found by TodayView's tests the moment a second copy of this hook
    // was mounted. The functional update below is a no-op once the list is
    // already empty, so React bails out instead.
    if (dayCount <= 0) {
      setInstances((prev) => (prev.length === 0 ? prev : []))
      return
    }
    void refresh()
    return onInstancesChanged(() => void refresh())
  }, [refresh, dayCount])

  return instances
}
