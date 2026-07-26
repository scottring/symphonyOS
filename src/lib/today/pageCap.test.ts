import { describe, it, expect } from 'vitest'
import { capItems, DEFAULT_SECTION_CAP } from './pageCap'

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
