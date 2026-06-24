import { describe, it, expect } from 'vitest'
import type { Routine } from '@/types/actionable'
import { groupRoutineSteps } from './routineCollections'

function r(over: Partial<Routine>): Routine {
  return {
    id: 'r', user_id: 'u', name: 'R', description: null, default_assignee: null,
    assigned_to: null, assigned_to_all: null, visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null, times_per_day: null,
    image_url: null, raw_input: null, show_on_timeline: true,
    parent_routine_id: null, step_order: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('groupRoutineSteps', () => {
  it('parentless childless routine is standalone', () => {
    const { collections, standalone } = groupRoutineSteps([r({ id: 'solo' })])
    expect(standalone.map(x => x.id)).toEqual(['solo'])
    expect(collections).toEqual([])
  })
  it('a routine with children becomes a collection; children are its ordered steps', () => {
    const parent = r({ id: 'hep', name: 'Shoulder HEP' })
    const s2 = r({ id: 's2', name: 'B', parent_routine_id: 'hep', step_order: 2 })
    const s1 = r({ id: 's1', name: 'A', parent_routine_id: 'hep', step_order: 1 })
    const { collections, standalone } = groupRoutineSteps([parent, s2, s1])
    expect(standalone).toEqual([])
    expect(collections).toHaveLength(1)
    expect(collections[0].id).toBe('hep')
    expect(collections[0].steps.map(s => s.id)).toEqual(['s1', 's2']) // ordered by step_order
  })
  it('null step_order sorts after ordered steps, tiebreak by time then name', () => {
    const parent = r({ id: 'p' })
    const ordered = r({ id: 'o', parent_routine_id: 'p', step_order: 1 })
    const lateA = r({ id: 'la', name: 'Z', parent_routine_id: 'p', step_order: null, time_of_day: '07:00' })
    const lateB = r({ id: 'lb', name: 'A', parent_routine_id: 'p', step_order: null, time_of_day: '07:00' })
    const { collections } = groupRoutineSteps([parent, lateA, lateB, ordered])
    expect(collections[0].steps.map(s => s.id)).toEqual(['o', 'lb', 'la']) // ordered; then null by time then name
  })
})
