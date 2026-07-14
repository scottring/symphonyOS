// src/lib/today/stepChecklist.test.ts
import { describe, it, expect } from 'vitest'
import { buildStepChecklist } from './stepChecklist'
import type { Routine, ActionableInstance } from '@/types/actionable'

function step(id: string, overrides: Partial<Routine> = {}): Routine {
  return {
    id, user_id: 'u1', name: id, recurrence_pattern: { type: 'daily' }, visibility: 'active',
    parent_routine_id: 'c1',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Routine
}

function inst(entityId: string, status: string): ActionableInstance {
  return { entity_type: 'routine', entity_id: entityId, status } as ActionableInstance
}

// A Monday, so weekday-override tests are deterministic.
const monday = new Date('2026-07-13T12:00:00')

describe('buildStepChecklist', () => {
  it('unchecks a step with no instance and checks a completed one', () => {
    const map = buildStepChecklist([step('a'), step('b')], [inst('b', 'completed')], monday)
    expect(map.get('a')).toEqual({ checked: false, unresolvedKeys: ['a'], allKeys: ['a'] })
    expect(map.get('b')!.checked).toBe(true)
  })

  it('counts skipped doses as resolved', () => {
    const map = buildStepChecklist([step('a')], [inst('a', 'skipped')], monday)
    expect(map.get('a')!.checked).toBe(true)
  })

  it('a dosed step is checked only when every dose is resolved', () => {
    const dosed = step('med', { times_per_day: ['07:00:00', '19:00:00'] })
    const partial = buildStepChecklist([dosed], [inst('med#0', 'completed')], monday)
    expect(partial.get('med')).toEqual({ checked: false, unresolvedKeys: ['med#1'], allKeys: ['med#0', 'med#1'] })

    const full = buildStepChecklist([dosed], [inst('med#0', 'completed'), inst('med#1', 'skipped')], monday)
    expect(full.get('med')!.checked).toBe(true)
  })

  it('omits steps that do not apply on the date', () => {
    const tuesdayOnly = step('tue', { recurrence_pattern: { type: 'weekly', days: ['tue'] } })
    const map = buildStepChecklist([step('a'), tuesdayOnly], [], monday)
    expect(map.has('tue')).toBe(false)
    expect(map.has('a')).toBe(true)
  })

  it('ignores non-routine instances and pending statuses', () => {
    const map = buildStepChecklist(
      [step('a')],
      [{ entity_type: 'task', entity_id: 'a', status: 'completed' } as ActionableInstance, inst('a', 'pending')],
      monday,
    )
    expect(map.get('a')!.checked).toBe(false)
  })
})
