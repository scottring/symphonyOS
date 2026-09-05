import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_SEASONS, normalizeSeasons, seasonStartFor, seasonEndFor, seasonLabel, seasonToken,
  isSeasonBoundary, readSeasons, cacheSeasons, type Seasons,
} from './seasons'

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

// Scott's stated boundary: the next season starts in October. The other three
// are the seed he adjusts in Settings.
describe('DEFAULT_SEASONS', () => {
  it('starts Fall on October 1 and is calendar-ordered', () => {
    expect(DEFAULT_SEASONS.map((s) => [s.name, s.month, s.day])).toEqual([
      ['Winter', 1, 1], ['Spring', 4, 1], ['Summer', 7, 1], ['Fall', 10, 1],
    ])
  })
})

describe('seasonStartFor', () => {
  it('finds the boundary on or before the date', () => {
    expect(ymd(seasonStartFor(new Date(2026, 8, 5), DEFAULT_SEASONS))).toBe('2026-7-1')   // Sep 5 → Summer (Jul 1)
    expect(ymd(seasonStartFor(new Date(2026, 9, 1), DEFAULT_SEASONS))).toBe('2026-10-1')  // Oct 1 IS the boundary
    expect(ymd(seasonStartFor(new Date(2026, 11, 31), DEFAULT_SEASONS))).toBe('2026-10-1')
  })

  // A date before the year's first boundary belongs to the LAST season of the
  // previous year — the year wrap is where a naive "same year" lookup breaks.
  it('wraps to the previous year before the first boundary', () => {
    const uneven: Seasons = [
      { name: 'Deep winter', month: 2, day: 15 }, { name: 'Spring', month: 4, day: 1 },
      { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
    ]
    expect(ymd(seasonStartFor(new Date(2026, 0, 20), uneven))).toBe('2025-10-1')
  })

  it('returns midnight', () => {
    const s = seasonStartFor(new Date(2026, 8, 5, 14, 30), DEFAULT_SEASONS)
    expect([s.getHours(), s.getMinutes()]).toEqual([0, 0])
  })
})

describe('seasonEndFor', () => {
  it('is the next boundary, exclusive, and wraps into next year from the last season', () => {
    expect(ymd(seasonEndFor(new Date(2026, 8, 5), DEFAULT_SEASONS))).toBe('2026-10-1')
    expect(ymd(seasonEndFor(new Date(2026, 10, 5), DEFAULT_SEASONS))).toBe('2027-1-1')
  })
})

describe('seasonLabel / seasonToken', () => {
  it('names the season by the year it STARTED', () => {
    expect(seasonLabel(new Date(2026, 8, 5), DEFAULT_SEASONS)).toBe('Summer 2026')
    expect(seasonLabel(new Date(2026, 11, 20), DEFAULT_SEASONS)).toBe('Fall 2026')
  })
  it('token is stable and lowercase', () => {
    expect(seasonToken(new Date(2026, 8, 5), DEFAULT_SEASONS)).toBe('2026-summer')
  })
})

describe('isSeasonBoundary', () => {
  it('is true only on a configured start day', () => {
    expect(isSeasonBoundary(new Date(2026, 9, 1), DEFAULT_SEASONS)).toBe(true)
    expect(isSeasonBoundary(new Date(2026, 8, 1), DEFAULT_SEASONS)).toBe(false) // Sep 1 was meteorological, not ours
    expect(isSeasonBoundary(new Date(2026, 9, 2), DEFAULT_SEASONS)).toBe(false)
  })
})

describe('normalizeSeasons', () => {
  it('accepts a valid array and sorts it into calendar order', () => {
    const out = normalizeSeasons([
      { name: 'Fall', month: 10, day: 1 }, { name: 'Winter', month: 1, day: 1 },
      { name: 'Summer', month: 7, day: 1 }, { name: 'Spring', month: 4, day: 1 },
    ])
    expect(out.map((s) => s.name)).toEqual(['Winter', 'Spring', 'Summer', 'Fall'])
  })
  it('falls back to DEFAULT on junk: wrong length, bad month, missing name, non-array', () => {
    expect(normalizeSeasons(null)).toEqual(DEFAULT_SEASONS)
    expect(normalizeSeasons([{ name: 'X', month: 1, day: 1 }])).toEqual(DEFAULT_SEASONS)
    expect(normalizeSeasons([
      { name: 'A', month: 13, day: 1 }, { name: 'B', month: 4, day: 1 },
      { name: 'C', month: 7, day: 1 }, { name: 'D', month: 10, day: 1 },
    ])).toEqual(DEFAULT_SEASONS)
  })
  // Feb 30 is not a day. Clamp rather than reject so a typo doesn't wipe the config.
  it("clamps an impossible day to the month's last day", () => {
    const out = normalizeSeasons([
      { name: 'W', month: 2, day: 30 }, { name: 'Sp', month: 4, day: 1 },
      { name: 'Su', month: 7, day: 1 }, { name: 'F', month: 10, day: 1 },
    ])
    expect(out[0].day).toBe(28)
  })
})

describe('readSeasons / cacheSeasons', () => {
  beforeEach(() => localStorage.clear())
  it('reads DEFAULT when nothing is cached', () => {
    expect(readSeasons()).toEqual(DEFAULT_SEASONS)
  })
  it('round-trips a cached config and survives corrupt storage', () => {
    const custom: Seasons = [
      { name: 'W', month: 1, day: 15 }, { name: 'Sp', month: 4, day: 1 },
      { name: 'Su', month: 7, day: 1 }, { name: 'F', month: 10, day: 1 },
    ]
    cacheSeasons(custom)
    expect(readSeasons()).toEqual(custom)
    localStorage.setItem('symphony-seasons', '{not json')
    expect(readSeasons()).toEqual(DEFAULT_SEASONS)
  })
})
