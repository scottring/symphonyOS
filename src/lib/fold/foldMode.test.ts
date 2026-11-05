import { describe, it, expect } from 'vitest'
import { detectFoldMode, foldSizes, spreadFits } from '@/lib/fold/foldMode'

describe('detectFoldMode', () => {
  const cases: Array<[number, number, boolean, boolean, string]> = [
    [1316, 904, false, false, 'h'],
    [700, 900, false, false, 'v'],
    [626, 890, true, false, 'duo'],
    [466, 678, true, false, 'v'],
    [1000, 800, false, true, 'duo'],
    // iPad portrait is not a Duo (Scott's iPad would otherwise open the sheet on every visit).
    [744, 1133, true, false, 'v'],
    [820, 1180, true, false, 'h'],
    [720, 900, true, false, 'duo'],
    [721, 900, true, false, 'v'],
  ]
  it.each(cases)('%i x %i coarse=%s segments=%s -> %s', (width, height, coarse, segments, want) => {
    expect(detectFoldMode({ width, height, coarse, segments })).toBe(want)
  })
})

describe('foldSizes', () => {
  it('h', () => {
    expect(foldSizes('h', 820, 900)).toMatchObject({ above: 295, current: 525, edge: 34 })
    expect(foldSizes('h', 1000, 900)).toMatchObject({ above: 340, current: 560 })
  })
  it('duo', () => {
    expect(foldSizes('duo', 606, 890)).toMatchObject({ above: 230, current: 376, edge: 22 })
  })
  it('v', () => {
    expect(foldSizes('v', 400, 800)).toEqual({ above: 400, calendar: 400, current: 400, edge: 46, maxAboveHeight: 496, both: false })
  })
})

// Task 5c: the calendar folds out on the right. Both companions open only
// when the spread holds the sheet above, this sheet and the calendar at their
// minimum widths (220 + 420 + 220).
describe('spreadFits', () => {
  it('h: both at 860, one at a time below', () => {
    expect(spreadFits('h', 860)).toEqual({ both: true })
    expect(spreadFits('h', 859)).toEqual({ both: false })
  })
  it('v and duo: one at a time', () => {
    expect(spreadFits('v', 2000)).toEqual({ both: false })
    expect(spreadFits('duo', 2000)).toEqual({ both: false })
  })
})

describe('foldSizes with a calendar', () => {
  it('h, wide: two companions and this sheet, at most 560', () => {
    expect(foldSizes('h', 1284, 900, { calendar: true })).toMatchObject({ above: 320, calendar: 320, current: 560, edge: 34, both: true })
  })
  it('h, at the threshold: this sheet keeps 420', () => {
    expect(foldSizes('h', 860, 900, { calendar: true })).toMatchObject({ above: 220, calendar: 220, current: 420, both: true })
  })
  it('h, narrow: one companion open, the other folded at its edge', () => {
    expect(foldSizes('h', 788, 900, { calendar: true })).toMatchObject({ above: 220, calendar: 220, current: 534, both: false })
  })
  it('duo: the open companion takes 38%, the folded one its edge', () => {
    expect(foldSizes('duo', 606, 890, { calendar: true })).toMatchObject({ above: 230, calendar: 230, current: 354, edge: 22, both: false })
  })
  it('without a calendar the sizes are as before', () => {
    expect(foldSizes('h', 820, 900)).toMatchObject({ above: 295, current: 525, both: false })
  })
})

// Scott, 2026-11-05: the look back's rows each on one line.
describe('foldSizes for a look back (wide)', () => {
  it('h: the sheet above widens (300–440) and the calendar folds; this sheet keeps 560 when there is room', () => {
    const s = foldSizes('h', 1180, 900, { calendar: true, wide: true })
    expect(s.above).toBe(425)
    expect(s.both).toBe(false)
    expect(s.current).toBe(560)
    expect(foldSizes('h', 1180, 900, { calendar: true }).above).toBeLessThan(s.above)
    expect(foldSizes('h', 700, 900, { wide: true }).above).toBe(300)
    expect(foldSizes('h', 2000, 900, { wide: true }).above).toBe(440)
  })
  it('duo and v are as they are', () => {
    expect(foldSizes('duo', 640, 900, { calendar: true, wide: true })).toEqual(foldSizes('duo', 640, 900, { calendar: true }))
    expect(foldSizes('v', 390, 800, { wide: true })).toEqual(foldSizes('v', 390, 800))
  })
})
