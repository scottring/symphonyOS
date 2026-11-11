import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Routine } from '@/types/routine'
import type { ActionableInstance } from '@/types/actionable'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'
import { CARRY_LOOKBACK_DAYS, carriesForward, selectCarriedRoutines, type CarriedRoutine } from '@/lib/today/carriedRoutines'

/** Today's carried routines ("Keep it until it's done", carriedRoutines.ts):
 *  reads the look-back window's instances only when some routine carries and
 *  the page shows today, and again whenever an occurrence is written. Done
 *  and Skip write the ORIGINAL occurrence's date. */
export function useCarriedRoutines(routines: readonly Routine[], isToday: boolean) {
  const { getInstancesForRange, markDone, skip, undoDone } = useActionableInstances()
  const carrying = useMemo(() => routines.filter(carriesForward), [routines])
  const [instances, setInstances] = useState<ActionableInstance[]>([])
  const [tick, setTick] = useState(0)
  const on = isToday && carrying.length > 0

  useEffect(() => onInstancesChanged(() => setTick((t) => t + 1)), [])
  useEffect(() => {
    if (!on) return
    let live = true
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - CARRY_LOOKBACK_DAYS)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    void getInstancesForRange(start, end).then((rows) => { if (live) setInstances(rows) })
    return () => { live = false }
  }, [on, tick, getInstancesForRange])

  const carried: CarriedRoutine[] = useMemo(
    () => (on ? selectCarriedRoutines(carrying, instances, new Date()) : []),
    [on, carrying, instances],
  )
  const done = useCallback((c: CarriedRoutine) => markDone('routine', c.routine.id, c.date), [markDone])
  const skipIt = useCallback((c: CarriedRoutine) => skip('routine', c.routine.id, c.date), [skip])
  /** Puts the occurrence back as it was (Undo of Done or Skip). */
  const undo = useCallback((c: CarriedRoutine) => undoDone('routine', c.routine.id, c.date), [undoDone])
  return { carried, done, skip: skipIt, undo }
}
