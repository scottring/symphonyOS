import { describe, it, expect } from 'vitest'
import { detectFoldMode, foldSizes } from '@/lib/fold/foldMode'

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
    expect(foldSizes('v', 400, 800)).toEqual({ above: 400, current: 400, edge: 46, maxAboveHeight: 496 })
  })
})
