import { describe, it, expect } from 'vitest'
import { curateUnits, scoreCuratedItem } from './curate'

const now = new Date(2026, 6, 30, 12, 0, 0)
const at = (h: number, m = 0) => new Date(2026, 6, 30, h, m, 0)

interface Row {
  id: string
  completed: boolean
  startTime?: Date | null
  isSubtask?: boolean
  isWaiting?: boolean
  skipped?: boolean
}
const row = (id: string, o: Partial<Row> = {}): Row => ({ id, completed: false, ...o })
const startsUnit = (r: Row) => !r.isSubtask
const ids = (rows: Row[]) => rows.map((r) => r.id)

describe('scoreCuratedItem', () => {
  it('ranks imminent above overdue above later above untimed', () => {
    const imminent = scoreCuratedItem(row('a', { startTime: at(12, 30) }), now)
    const overdue = scoreCuratedItem(row('b', { startTime: at(9) }), now)
    const later = scoreCuratedItem(row('c', { startTime: at(20) }), now)
    const untimed = scoreCuratedItem(row('d'), now)
    expect(imminent).toBeGreaterThan(overdue)
    expect(overdue).toBeGreaterThan(later)
    expect(later).toBeGreaterThan(untimed)
  })

  it('puts completed and skipped rows below everything', () => {
    expect(scoreCuratedItem(row('a', { completed: true, startTime: at(12, 5) }), now))
      .toBeLessThan(scoreCuratedItem(row('b'), now))
    expect(scoreCuratedItem(row('a', { skipped: true }), now))
      .toBeLessThan(scoreCuratedItem(row('b'), now))
  })

  it('penalises a blocked item — real, but not actionable now', () => {
    expect(scoreCuratedItem(row('a', { isWaiting: true }), now))
      .toBeLessThan(scoreCuratedItem(row('b'), now))
  })
})

describe('curateUnits', () => {
  it('does nothing when the list already fits', () => {
    const rows = [row('a'), row('b')]
    const out = curateUnits(rows, 8, false, startsUnit, now)
    expect(out).toEqual({ visible: rows, hiddenCount: 0 })
  })

  it('returns everything when expanded', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`r${i}`))
    expect(curateUnits(rows, 3, true, startsUnit, now).hiddenCount).toBe(0)
  })

  it('keeps the RELEVANT row over the merely-earlier one', () => {
    // capUnits would keep a,b (first two). The imminent item is row c.
    const rows = [row('a'), row('b'), row('c', { startTime: at(12, 15) })]
    const out = curateUnits(rows, 2, false, startsUnit, now)
    expect(ids(out.visible)).toContain('c')
    expect(out.hiddenCount).toBe(1)
  })

  it('preserves the caller ordering among survivors', () => {
    const rows = [row('a'), row('b', { startTime: at(12, 5) }), row('c', { startTime: at(9) })]
    const out = curateUnits(rows, 2, false, startsUnit, now)
    // b and c both outrank a; they must still read b-then-c, as built.
    expect(ids(out.visible)).toEqual(['b', 'c'])
  })

  it('folds completed rows first', () => {
    const rows = [row('done', { completed: true }), row('a'), row('b')]
    const out = curateUnits(rows, 2, false, startsUnit, now)
    expect(ids(out.visible)).toEqual(['a', 'b'])
  })

  it('never splits a group — parent and children fold together', () => {
    const rows = [
      row('p1'), row('c1', { isSubtask: true }), row('c2', { isSubtask: true }),
      row('p2', { startTime: at(12, 10) }),
    ]
    const out = curateUnits(rows, 2, false, startsUnit, now)
    // p2 scores highest and fits alone; the 3-row group cannot fit in cap 2.
    expect(ids(out.visible)).toEqual(['p2'])
    expect(out.hiddenCount).toBe(3)
  })

  it('scores a group by its best member', () => {
    const rows = [
      row('dull'),
      row('p'), row('urgent', { isSubtask: true, startTime: at(12, 5) }),
    ]
    const out = curateUnits(rows, 2, false, startsUnit, now)
    expect(ids(out.visible)).toEqual(['p', 'urgent'])
  })

  it('always reports an exact hidden count', () => {
    const rows = Array.from({ length: 11 }, (_, i) => row(`r${i}`))
    const out = curateUnits(rows, 4, false, startsUnit, now)
    expect(out.visible.length + out.hiddenCount).toBe(11)
    expect(out.visible).toHaveLength(4)
  })

  it('is stable — equal scores keep original order', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row(`r${i}`))
    const a = curateUnits(rows, 3, false, startsUnit, now)
    const b = curateUnits(rows, 3, false, startsUnit, now)
    expect(ids(a.visible)).toEqual(ids(b.visible))
    expect(ids(a.visible)).toEqual(['r0', 'r1', 'r2'])
  })
})
