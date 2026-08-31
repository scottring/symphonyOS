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

  // The screenshot bug (2026-08-31): one visible block + a "+2" chip beside
  // empty column width. A long spanning event plus two short items is only a
  // 3-group — it must never chip at cap 4.
  it('a spanning event with two short overlappers lanes fully — no chip', () => {
    const { lanes, chips } = layoutLanes([
      { id: 'school', startMinutes: 90, endMinutes: 480 },  // 7:30–14:00 from 6am
      { id: 'a', startMinutes: 240, endMinutes: 270 },       // 10:00–10:30
      { id: 'b', startMinutes: 240, endMinutes: 270 },
    ], 4)
    expect([...lanes.keys()].sort()).toEqual(['a', 'b', 'school'])
    expect(chips).toEqual([])
  })

  // Duplicate ids (the same event fed twice — e.g. one row per calendar it
  // syncs from) inflated the group count past the cap while the duplicates
  // rendered as ONE block: 3×'school' + 2 real items = a 5-group → 3 "visible"
  // lanes all keyed 'school' (Map collapses them) + a "+2" chip holding the
  // two real, now-undraggable items. Layout is keyed by id, so dedupe first.
  it('dedupes duplicate ids before grouping', () => {
    const { lanes, chips } = layoutLanes([
      { id: 'school', startMinutes: 90, endMinutes: 480 },
      { id: 'school', startMinutes: 90, endMinutes: 480 },
      { id: 'school', startMinutes: 90, endMinutes: 480 },
      { id: 'a', startMinutes: 240, endMinutes: 270 },
      { id: 'b', startMinutes: 240, endMinutes: 270 },
    ], 4)
    expect([...lanes.keys()].sort()).toEqual(['a', 'b', 'school'])
    expect(lanes.get('school')!.totalColumns).toBe(3)
    expect(chips).toEqual([])
  })
})
