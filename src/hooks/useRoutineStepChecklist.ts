// src/hooks/useRoutineStepChecklist.ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { useActionableInstances } from './useActionableInstances'
import { buildStepChecklist } from '@/lib/today/stepChecklist'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'

/**
 * Today-completion state for a routine collection's steps, for the detail
 * panel's checklist. Checking a step resolves ALL of its remaining doses for
 * today (unchecking returns them to pending) — dose-level control stays on the
 * Today collection row. Writes go through the same actionable_instances keys
 * the Today view uses, and emit the instances-changed signal so Today's
 * progress counts refresh immediately.
 */
export function useRoutineStepChecklist(steps: Routine[]) {
  const { getInstancesForDate, markDone, undoDone } = useActionableInstances()
  const [instances, setInstances] = useState<ActionableInstance[]>([])

  const refresh = useCallback(async () => {
    setInstances(await getInstancesForDate(new Date()))
  }, [getInstancesForDate])

  const hasSteps = steps.length > 0
  useEffect(() => {
    if (!hasSteps) return
    void refresh()
    // Stay in sync when the Today row (or another panel) toggles a dose.
    return onInstancesChanged(() => void refresh())
  }, [hasSteps, refresh])

  const checklist = useMemo(
    () => buildStepChecklist(steps, instances, new Date()),
    [steps, instances],
  )

  const checkedByStep = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const [id, s] of checklist) m.set(id, s.checked)
    return m
  }, [checklist])

  const toggleStep = useCallback(async (stepRoutine: Routine) => {
    const state = checklist.get(stepRoutine.id)
    if (!state) return
    const today = new Date()
    if (state.checked) {
      await Promise.all(state.allKeys.map((k) => undoDone('routine', k, today)))
    } else {
      await Promise.all(state.unresolvedKeys.map((k) => markDone('routine', k, today)))
    }
    // markDone/undoDone emit the instances-changed signal, which triggers our
    // subscription's refresh — but refresh once more here so the final state
    // lands even if the last write raced an earlier signal-driven fetch.
    await refresh()
  }, [checklist, markDone, undoDone, refresh])

  return { checkedByStep, toggleStep }
}
