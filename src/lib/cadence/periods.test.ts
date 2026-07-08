import { describe, it, expect } from 'vitest'
import { seasonIndex, seasonStart, seasonEnd, periodLabel, periodProgress, horizonNeighbors } from './periods'

describe('seasonIndex / seasonStart / seasonEnd', () => {
  it('maps months to meteorological seasons', () => {
    expect(seasonIndex(new Date(2026, 0, 15))).toBe(0) // Jan → winter
    expect(seasonIndex(new Date(2026, 4, 15))).toBe(1) // May → spring
    expect(seasonIndex(new Date(2026, 6, 8))).toBe(2)  // Jul → summer
    expect(seasonIndex(new Date(2026, 10, 1))).toBe(3) // Nov → fall
    expect(seasonIndex(new Date(2026, 11, 25))).toBe(0) // Dec → winter
  })

  it('finds the season start, crossing the year boundary for Jan/Feb', () => {
    expect(seasonStart(new Date(2026, 6, 8))).toEqual(new Date(2026, 5, 1))   // Jul → Jun 1
    expect(seasonStart(new Date(2026, 11, 25))).toEqual(new Date(2026, 11, 1)) // Dec → Dec 1
    expect(seasonStart(new Date(2026, 0, 15))).toEqual(new Date(2025, 11, 1))  // Jan → prev Dec 1
    expect(seasonStart(new Date(2026, 2, 1))).toEqual(new Date(2026, 2, 1))    // Mar 1 → itself
  })

  it('season end is exclusive, three months after start', () => {
    expect(seasonEnd(new Date(2026, 6, 8))).toEqual(new Date(2026, 8, 1))    // summer → Sep 1
    expect(seasonEnd(new Date(2026, 0, 15))).toEqual(new Date(2026, 2, 1))   // winter → Mar 1
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
  it('season progress (summer = Jun+Jul+Aug = 92 days)', () => {
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
