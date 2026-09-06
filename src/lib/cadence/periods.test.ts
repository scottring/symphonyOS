import { describe, it, expect, beforeEach } from 'vitest'
import { seasonIndex, seasonStart, seasonEnd, periodLabel, periodProgress, horizonNeighbors } from './periods'

describe('seasonIndex / seasonStart / seasonEnd', () => {
  // The household's configured seasons (DEFAULT: Spring Mar 1 / Summer Jun 1 /
  // Fall Sep 1 / Winter Dec 1), no longer the meteorological four.
  beforeEach(() => localStorage.clear())

  it('maps dates to the configured seasons', () => {
    expect(seasonIndex(new Date(2026, 0, 15))).toBe(3) // Jan → Winter (started prev Dec 1)
    expect(seasonIndex(new Date(2026, 3, 15))).toBe(0) // Apr → Spring
    expect(seasonIndex(new Date(2026, 6, 8))).toBe(1)  // Jul → Summer
    expect(seasonIndex(new Date(2026, 9, 1))).toBe(2)  // Oct → Fall
    expect(seasonIndex(new Date(2026, 11, 25))).toBe(3) // Dec → Winter (it started Dec 1)
  })

  it('finds the season start, wrapping the year before the first boundary', () => {
    expect(seasonStart(new Date(2026, 6, 8))).toEqual(new Date(2026, 5, 1))    // Jul → Jun 1
    expect(seasonStart(new Date(2026, 11, 25))).toEqual(new Date(2026, 11, 1)) // Dec 25 → Dec 1
    expect(seasonStart(new Date(2026, 11, 1))).toEqual(new Date(2026, 11, 1))  // Dec 1 → itself
    const uneven = [
      { name: 'Deep winter', month: 2, day: 15 }, { name: 'Spring', month: 4, day: 1 },
      { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
    ]
    localStorage.setItem('symphony-seasons', JSON.stringify(uneven))
    expect(seasonStart(new Date(2026, 0, 15))).toEqual(new Date(2025, 9, 1))   // Jan 15 → prev Oct 1
  })

  it('season end is exclusive: the next boundary, wrapping into next year', () => {
    expect(seasonEnd(new Date(2026, 6, 8))).toEqual(new Date(2026, 8, 1))    // Summer → Sep 1
    expect(seasonEnd(new Date(2026, 11, 20))).toEqual(new Date(2027, 2, 1))  // Winter → Mar 1
  })
})

describe('periodLabel', () => {
  const july8 = new Date(2026, 6, 8)
  it('names each horizon period', () => {
    expect(periodLabel('month', july8)).toBe('July 2026')
    expect(periodLabel('season', july8)).toBe('Summer 2026')
    expect(periodLabel('year', july8)).toBe('2026')
    expect(periodLabel('someday', july8)).toBeNull()
  })
  it('week label names the week start', () => {
    // Default config: week starts Sunday. Jul 8 2026 is a Wednesday → week of Jul 5.
    expect(periodLabel('week', july8)).toBe('Week of Jul 5')
  })
})

describe('periodProgress', () => {
  const july8 = new Date(2026, 6, 8, 14, 30)
  it('month progress', () => {
    expect(periodProgress('month', july8)).toEqual({ day: 8, total: 31 })
  })
  it('season progress (Summer = Jun 1 → Sep 1 = 92 days by the default seasons)', () => {
    localStorage.clear()
    expect(periodProgress('season', july8)).toEqual({ day: 38, total: 92 })
  })
  it('year progress', () => {
    expect(periodProgress('year', july8)).toEqual({ day: 189, total: 365 })
  })
  it('week progress (Sunday start → Wednesday is day 4)', () => {
    expect(periodProgress('week', july8)).toEqual({ day: 4, total: 7 })
  })
  it('timeless horizons have no progress', () => {
    expect(periodProgress('someday', july8)).toBeNull()
    expect(periodProgress('today', july8)).toBeNull()
  })
})

describe('horizonNeighbors', () => {
  it('walks the spine', () => {
    expect(horizonNeighbors('month')).toEqual({ down: 'week', up: 'season' })
    expect(horizonNeighbors('season')).toEqual({ down: 'month', up: 'year' })
    expect(horizonNeighbors('today')).toEqual({ down: null, up: 'week' })
    expect(horizonNeighbors('year')).toEqual({ down: 'season', up: null })
  })
  it('someday sits outside the cascade', () => {
    expect(horizonNeighbors('someday')).toEqual({ down: null, up: null })
  })
})
