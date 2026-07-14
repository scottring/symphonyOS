// src/lib/today/stepChecklist.ts
import type { Routine, ActionableInstance } from '@/types/actionable'
import { expandRoutineDoses, routineStatusKey } from './doseExpansion'
import { stepAppliesOnDate } from './stepSchedule'

export interface StepDayState {
  /** Every dose of the step is resolved (completed or skipped) on the date. */
  checked: boolean
  /** actionable_instances entity ids for doses still pending. */
  unresolvedKeys: string[]
  /** actionable_instances entity ids for all of the step's doses. */
  allKeys: string[]
}

/**
 * Per-step completion state for a collection's steps on a given date, keyed by
 * step id. Steps that don't apply on the date (weekday overrides) are omitted —
 * they get no checkbox. Uses the same entity keys as the Today collection row
 * (`stepId` or `stepId#slot`), so both surfaces count the same doses.
 */
export function buildStepChecklist(
  steps: Routine[],
  instances: ActionableInstance[],
  date: Date,
): Map<string, StepDayState> {
  const statusByKey = new Map<string, string>()
  for (const inst of instances) {
    if (inst.entity_type === 'routine') statusByKey.set(inst.entity_id, inst.status)
  }

  const map = new Map<string, StepDayState>()
  for (const step of steps) {
    if (!stepAppliesOnDate(step, date)) continue
    const allKeys: string[] = []
    const unresolvedKeys: string[] = []
    for (const dose of expandRoutineDoses(step)) {
      const key = routineStatusKey(step.id, dose.slotIndex)
      allKeys.push(key)
      const status = statusByKey.get(key)
      if (status !== 'completed' && status !== 'skipped') unresolvedKeys.push(key)
    }
    map.set(step.id, {
      checked: allKeys.length > 0 && unresolvedKeys.length === 0,
      unresolvedKeys,
      allKeys,
    })
  }
  return map
}
