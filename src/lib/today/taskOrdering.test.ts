import { describe, it, expect } from 'vitest'
import {
  SORT_ORDER_GAP, nextTaskSortOrder, sortByManualOrder, reorderTasksByDrag,
} from '@/lib/today/taskOrdering'

const d = (n: number) => new Date(2026, 6, 25, 0, 0, n)

describe('nextTaskSortOrder', () => {
  it('starts at 0 for an empty list', () => {
    expect(nextTaskSortOrder([])).toBe(0)
  })
  it('appends one gap past the highest', () => {
    expect(nextTaskSortOrder([{ sortOrder: 0 }, { sortOrder: 1000 }])).toBe(2000)
  })
  it('ignores nulls when finding the highest', () => {
    expect(nextTaskSortOrder([{ sortOrder: null }, { sortOrder: 5000 }])).toBe(6000)
  })
})

describe('sortByManualOrder', () => {
  it('orders by sortOrder when present', () => {
    const out = sortByManualOrder([
      { id: 'b', sortOrder: 2000, createdAt: d(1) },
      { id: 'a', sortOrder: 1000, createdAt: d(2) },
    ])
    expect(out.map(i => i.id)).toEqual(['a', 'b'])
  })
  it('puts never-ordered items after ordered ones, oldest first', () => {
    const out = sortByManualOrder([
      { id: 'new', sortOrder: null, createdAt: d(9) },
      { id: 'old', sortOrder: null, createdAt: d(1) },
      { id: 'ordered', sortOrder: 1000, createdAt: d(5) },
    ])
    expect(out.map(i => i.id)).toEqual(['ordered', 'old', 'new'])
  })
})

describe('reorderTasksByDrag', () => {
  const orders = (pairs: [string, number | null][]) => new Map(pairs)

  it('writes ONE row when there is room between neighbours', () => {
    // a=0, b=1000, c=2000 — move c between a and b
    const writes = reorderTasksByDrag(['a','b','c'], 'c', 'b',
      orders([['a',0],['b',1000],['c',2000]]))
    expect(writes).toHaveLength(1)
    expect(writes[0].id).toBe('c')
    expect(writes[0].sortOrder).toBeGreaterThan(0)
    expect(writes[0].sortOrder).toBeLessThan(1000)
  })

  it('writes one row when dropped at the very end', () => {
    const writes = reorderTasksByDrag(['a','b','c'], 'a', 'c',
      orders([['a',0],['b',1000],['c',2000]]))
    expect(writes).toHaveLength(1)
    expect(writes[0].id).toBe('a')
    expect(writes[0].sortOrder).toBeGreaterThan(2000)
  })

  it('writes one row when moved to the very front', () => {
    const writes = reorderTasksByDrag(['a','b','c'], 'b', 'a',
      orders([['a',0],['b',1000],['c',2000]]))
    expect(writes).toHaveLength(1)
    expect(writes[0].id).toBe('b')
    expect(writes[0].sortOrder).toBeLessThan(0)
    // negative is correct — sort_order is a plain nullable integer with no non-negative constraint
    expect(writes[0].sortOrder).toBe(-1000)
  })

  it('renormalises the whole list when the gap collapses', () => {
    // a=0, b=1 — no integer strictly between them
    const writes = reorderTasksByDrag(['a','b','c'], 'c', 'b',
      orders([['a',0],['b',1],['c',5000]]))
    expect(writes.length).toBeGreaterThan(1)
    const byId = new Map(writes.map(w => [w.id, w.sortOrder]))
    // after renormalise the requested order must actually hold
    expect(byId.get('a')!).toBeLessThan(byId.get('c')!)
    expect(byId.get('c')!).toBeLessThan(byId.get('b')!)
    // and the gaps are restored
    expect(new Set(writes.map(w => w.sortOrder)).size).toBe(writes.length)
  })

  it('renormalises when any participant has a null order', () => {
    const writes = reorderTasksByDrag(['a','b'], 'b', 'a', orders([['a',null],['b',null]]))
    expect(writes).toHaveLength(2)
    expect(writes[0].sortOrder).toBe(0)
    expect(writes[1].sortOrder).toBe(SORT_ORDER_GAP)
  })

  it('returns no writes when the item is dropped on itself', () => {
    expect(reorderTasksByDrag(['a','b'], 'a', 'a', orders([['a',0],['b',1000]]))).toEqual([])
  })

  it('returns no writes for an unknown id', () => {
    expect(reorderTasksByDrag(['a','b'], 'zz', 'a', orders([['a',0],['b',1000]]))).toEqual([])
  })
})
