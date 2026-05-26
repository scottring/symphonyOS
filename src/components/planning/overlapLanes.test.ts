import { describe, it, expect } from 'vitest'
import { layoutLanes } from './overlapLanes'

describe('layoutLanes', () => {
  it('gives non-overlapping items a single full-width lane and no chips', () => {
    const { lanes, chips } = layoutLanes([
      { id: 'a', startMinutes: 0, endMinutes: 30 },
      { id: 'b', startMinutes: 60, endMinutes: 90 },
    ], 4)
    expect(lanes.get('a')).toEqual({ column: 0, totalColumns: 1 })
    expect(lanes.get('b')).toEqual({ column: 0, totalColumns: 1 })
    expect(chips).toEqual([])
  })

  it('lanes a small overlapping group side-by-side (under the cap)', () => {
    const { lanes, chips } = layoutLanes([
      { id: 'a', startMinutes: 540, endMinutes: 600 },
      { id: 'b', startMinutes: 570, endMinutes: 630 },
    ], 4)
    expect(lanes.get('a')).toEqual({ column: 0, totalColumns: 2 })
    expect(lanes.get('b')).toEqual({ column: 1, totalColumns: 2 })
    expect(chips).toEqual([])
  })

  it('caps lanes and collapses the excess into one "+N" chip', () => {
    // 6 items all overlapping at 9:00, cap 4 → 3 visible lanes + 1 chip lane
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`, startMinutes: 540, endMinutes: 600,
    }))
    const { lanes, chips } = layoutLanes(items, 4)

    // 3 visible items, each at totalColumns 4 (lanes 0,1,2)
    const visible = items.map((it) => it.id).filter((id) => lanes.has(id))
    expect(visible.length).toBe(3)
    visible.forEach((id) => expect(lanes.get(id)!.totalColumns).toBe(4))
    expect(new Set(visible.map((id) => lanes.get(id)!.column))).toEqual(new Set([0, 1, 2]))

    // 1 chip in the last lane holding the other 3 items
    expect(chips.length).toBe(1)
    expect(chips[0].column).toBe(3)
    expect(chips[0].totalColumns).toBe(4)
    expect(chips[0].itemIds.length).toBe(3)
    // chip + visible together cover all 6 items
    expect(new Set([...visible, ...chips[0].itemIds])).toEqual(new Set(items.map((it) => it.id)))
  })

  it('exactly at the cap stays fully laned with no chip', () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, startMinutes: 540, endMinutes: 600 }))
    const { lanes, chips } = layoutLanes(items, 4)
    expect([...lanes.keys()].length).toBe(4)
    expect(chips).toEqual([])
  })
})
