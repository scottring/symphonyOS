import { describe, it, expect } from 'vitest'
import { capItems, capUnits, DEFAULT_SECTION_CAP } from './pageCap'

const rows = (n: number, completed = false, prefix = 'i') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, completed }))

describe('capItems', () => {
  it('passes everything through when under the cap', () => {
    const out = capItems(rows(3), 8, false)
    expect(out.visible).toHaveLength(3)
    expect(out.hiddenCount).toBe(0)
  })

  it('caps and reports exactly how many it hid', () => {
    const out = capItems(rows(20), 8, false)
    expect(out.visible).toHaveLength(8)
    expect(out.hiddenCount).toBe(12)
  })

  it('shows everything when expanded, and reports nothing hidden', () => {
    const out = capItems(rows(20), 8, true)
    expect(out.visible).toHaveLength(20)
    expect(out.hiddenCount).toBe(0)
  })

  it('hides COMPLETED rows before incomplete ones', () => {
    // Burying a to-do behind a done item inverts the point of the page.
    const items = [...rows(6, true, 'done'), ...rows(6, false, 'todo')]
    const out = capItems(items, 6, false)
    expect(out.visible.every((i) => !i.completed)).toBe(true)
    expect(out.hiddenCount).toBe(6)
  })

  it('tops up with completed rows when there is room left', () => {
    const items = [...rows(2, false, 'todo'), ...rows(6, true, 'done')]
    const out = capItems(items, 4, false)
    expect(out.visible).toHaveLength(4)
    expect(out.visible.filter((i) => !i.completed)).toHaveLength(2)
    expect(out.hiddenCount).toBe(4)
  })

  it('keeps the original order among what it shows', () => {
    const items = [
      { id: 'a', completed: false },
      { id: 'b', completed: true },
      { id: 'c', completed: false },
    ]
    // 'b' is dropped for being done, but a and c keep their relative order.
    expect(capItems(items, 2, false).visible.map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('treats a cap of 0 or less as no cap rather than an empty page', () => {
    expect(capItems(rows(5), 0, false).visible).toHaveLength(5)
    expect(capItems(rows(5), -3, false).visible).toHaveLength(5)
  })

  it('never reports a negative hidden count', () => {
    expect(capItems(rows(2), 8, false).hiddenCount).toBe(0)
  })

  it('exports a sane default', () => {
    expect(DEFAULT_SECTION_CAP).toBeGreaterThan(0)
  })
})

describe('capUnits — a group is never split', () => {
  type Row = { id: string; completed: boolean; child?: boolean }
  const startsUnit = (r: Row) => !r.child
  const row = (id: string, completed = false, child = false): Row => ({ id, completed, child })

  it('keeps a parent and its children together rather than cutting mid-group', () => {
    // cap 4: [a][b] then a 3-row group would overflow, so the group is dropped
    // whole. A half-rendered group card has no bottom edge.
    const items = [
      row('a'), row('b'),
      row('p'), row('c1', false, true), row('c2', false, true),
      row('z'),
    ]
    const out = capUnits(items, 4, false, startsUnit)
    expect(out.visible.map((i) => i.id)).not.toContain('c1')
    expect(out.visible.map((i) => i.id)).not.toContain('p')
    expect(out.hiddenCount).toBe(items.length - out.visible.length)
  })

  it('includes a group whole when it fits', () => {
    const items = [row('p'), row('c1', false, true), row('c2', false, true), row('z')]
    const out = capUnits(items, 4, false, startsUnit)
    expect(out.visible).toHaveLength(4)
    expect(out.hiddenCount).toBe(0)
  })

  it('drops a fully-completed group before a live one', () => {
    const items = [
      row('dp', true), row('dc', true, true),
      row('lp'), row('lc', false, true),
    ]
    const out = capUnits(items, 2, false, startsUnit)
    expect(out.visible.map((i) => i.id)).toEqual(['lp', 'lc'])
  })

  it('reports every hidden row, not every hidden group', () => {
    const items = [row('a'), row('p'), row('c1', false, true), row('c2', false, true)]
    const out = capUnits(items, 1, false, startsUnit)
    expect(out.visible.map((i) => i.id)).toEqual(['a'])
    expect(out.hiddenCount).toBe(3)
  })

  it('passes everything through when expanded', () => {
    const items = [row('p'), row('c1', false, true)]
    expect(capUnits(items, 1, true, startsUnit).visible).toHaveLength(2)
  })
})
