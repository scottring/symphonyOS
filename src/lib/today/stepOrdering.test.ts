import { describe, it, expect } from 'vitest'
import type { Routine } from '@/types/actionable'
import { nextStepOrder, normalizeStepOrders, reorderByDrag } from './stepOrdering'

function step(id: string, order: number | null): Routine {
  return {
    id, user_id: 'u', name: id, recurrence_pattern: { type: 'daily' },
    visibility: 'active', step_order: order,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Routine
}

describe('stepOrdering', () => {
  it('nextStepOrder returns max order + 1', () => {
    expect(nextStepOrder([step('a', 0), step('b', 2)])).toBe(3)
  })
  it('nextStepOrder falls back to length when no orders set', () => {
    expect(nextStepOrder([step('a', null), step('b', null)])).toBe(2)
  })
  it('nextStepOrder is 0 for an empty collection', () => {
    expect(nextStepOrder([])).toBe(0)
  })
  it('normalizeStepOrders assigns gap-free 0..n-1', () => {
    expect(normalizeStepOrders(['x', 'y', 'z'])).toEqual([
      { id: 'x', step_order: 0 }, { id: 'y', step_order: 1 }, { id: 'z', step_order: 2 },
    ])
  })
  it('reorderByDrag moves active before over and renormalizes', () => {
    const steps = [step('a', 0), step('b', 1), step('c', 2)]
    // drag 'c' onto 'a' → order becomes c, a, b
    expect(reorderByDrag(steps, 'c', 'a')).toEqual([
      { id: 'c', step_order: 0 }, { id: 'a', step_order: 1 }, { id: 'b', step_order: 2 },
    ])
  })
  it('reorderByDrag is a no-op set when active === over', () => {
    const steps = [step('a', 0), step('b', 1)]
    expect(reorderByDrag(steps, 'a', 'a')).toEqual([
      { id: 'a', step_order: 0 }, { id: 'b', step_order: 1 },
    ])
  })
})
