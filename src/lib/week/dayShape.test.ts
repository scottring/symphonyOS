import { describe, it, expect } from 'vitest'
import { freeWindows, formatFree, busyBlocks } from './dayShape'

// The week's last planning step shows each day's shape: what's taken, and the
// free time left between 7a and 9p (Scott, 2026-10-03: "does it fit?").
describe('freeWindows', () => {
  it('finds the gaps between taken time', () => {
    expect(freeWindows([{ s: 9, e: 10 }, { s: 16, e: 17 }])).toEqual([{ s: 7, e: 9 }, { s: 10, e: 16 }, { s: 17, e: 21 }])
  })
  it('merges overlaps and ignores gaps under half an hour', () => {
    expect(freeWindows([{ s: 9, e: 10 }, { s: 9.5, e: 10.5 }, { s: 10.75, e: 20.75 }])).toEqual([{ s: 7, e: 9 }])
  })
  it('can ask for longer gaps — the Week page counts an hour or more', () => {
    expect(freeWindows([{ s: 18, e: 18.5 }, { s: 19, e: 19.5 }], 1)).toEqual([{ s: 7, e: 18 }, { s: 19.5, e: 21 }])
  })
  it('a day with nothing taken is free from 7a to 9p', () => {
    expect(freeWindows([])).toEqual([{ s: 7, e: 21 }])
  })
})

describe('formatFree', () => {
  it('says the windows the way a person does', () => {
    expect(formatFree([{ s: 10.5, e: 16 }, { s: 17, e: 19 }])).toBe('Free 10:30a–4p · 5–7p')
    expect(formatFree([{ s: 7, e: 21 }])).toBe('Free all day')
    expect(formatFree([])).toBe('No free time')
  })
})

describe('busyBlocks', () => {
  it('turns timed entries into hours, with a default length and clipped to the day', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m)
    expect(busyBlocks([{ start: at(8), end: at(17) }, { start: at(19) }, { start: at(6), end: at(7, 30) }]))
      .toEqual([{ s: 8, e: 17 }, { s: 19, e: 19.5 }, { s: 7, e: 7.5 }])
  })
})
