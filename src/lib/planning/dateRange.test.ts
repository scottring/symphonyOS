import { describe, it, expect } from 'vitest'
import { buildRange, presetRange, weekRange, foldWeeksFor, MAX_RANGE_DAYS } from './dateRange'

const d = (y: number, m: number, day: number) => new Date(y, m, day)
const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`

describe('buildRange', () => {
  it('returns the consecutive days from start through end, inclusive', () => {
    // Labor Day weekend: Sat Sep 5 – Mon Sep 7, 2026.
    expect(buildRange(d(2026, 8, 5), d(2026, 8, 7)).map(ymd))
      .toEqual(['2026-9-5', '2026-9-6', '2026-9-7'])
  })

  it('collapses to a single day when start and end are the same', () => {
    expect(buildRange(d(2026, 8, 5), d(2026, 8, 5)).map(ymd)).toEqual(['2026-9-5'])
  })

  // An end before the start is a half-finished edit, not an instruction to
  // render backwards. The grid shows the day you named and waits.
  it('treats an end before the start as a single day', () => {
    expect(buildRange(d(2026, 8, 5), d(2026, 8, 1)).map(ymd)).toEqual(['2026-9-5'])
  })

  // Seven columns is what the grid can read at desk width. Past that the
  // days are stripes, so the range stops rather than degrading.
  it('caps the range at seven days', () => {
    const range = buildRange(d(2026, 8, 1), d(2026, 8, 30))
    expect(range).toHaveLength(MAX_RANGE_DAYS)
    expect(ymd(range[MAX_RANGE_DAYS - 1])).toBe('2026-9-7')
  })

  it('normalises both ends to local midnight, so a time-of-day never shifts a column', () => {
    const start = new Date(2026, 8, 5, 23, 30)
    const end = new Date(2026, 8, 6, 0, 15)
    const range = buildRange(start, end)
    expect(range.map(ymd)).toEqual(['2026-9-5', '2026-9-6'])
    expect(range.every((x) => x.getHours() === 0 && x.getMinutes() === 0)).toBe(true)
  })

  it('crosses a month boundary without losing a day', () => {
    expect(buildRange(d(2026, 8, 29), d(2026, 9, 1)).map(ymd))
      .toEqual(['2026-9-29', '2026-9-30', '2026-10-1'])
  })
})

describe('presetRange', () => {
  const wed = d(2026, 8, 2)  // Wednesday Sep 2, 2026

  it('today is one column', () => {
    expect(presetRange('today', wed).map(ymd)).toEqual(['2026-9-2'])
  })

  it('three days runs from today', () => {
    expect(presetRange('three', wed).map(ymd)).toEqual(['2026-9-2', '2026-9-3', '2026-9-4'])
  })

  it('week runs seven days from today', () => {
    expect(presetRange('week', wed)).toHaveLength(7)
    expect(ymd(presetRange('week', wed)[6])).toBe('2026-9-8')
  })

  it('weekend jumps forward to the coming Saturday and Sunday', () => {
    expect(presetRange('weekend', wed).map(ymd)).toEqual(['2026-9-5', '2026-9-6'])
  })

  it('weekend on a Saturday means this weekend, not next', () => {
    expect(presetRange('weekend', d(2026, 8, 5)).map(ymd)).toEqual(['2026-9-5', '2026-9-6'])
  })

  // Sunday's weekend has one day left in it. Offering Saturday would be
  // offering yesterday.
  it('weekend on a Sunday is the day itself', () => {
    expect(presetRange('weekend', d(2026, 8, 6)).map(ymd)).toEqual(['2026-9-6'])
  })
})

describe('weekRange', () => {
  it('is the calendar week containing today, anchored to the week start', () => {
    // Wed Sep 9 2026, weeks starting Sunday → Sun Sep 6 … Sat Sep 12.
    const days = weekRange(d(2026, 8, 9), 0)
    expect(days.map(ymd)).toEqual(['2026-9-6', '2026-9-7', '2026-9-8', '2026-9-9', '2026-9-10', '2026-9-11', '2026-9-12'])
  })
  it('honours a Monday week start', () => {
    expect(weekRange(d(2026, 8, 9), 1).map(ymd)[0]).toBe('2026-9-7')
  })
})

describe('foldWeeksFor', () => {
  // The week list beside the grid is THIS week's plan. A range that reaches
  // into another week gets that week's placed rows folded beneath — one fold
  // per week the range touches, never the current week (it is already there).
  it('is empty when the range sits inside the current week', () => {
    expect(foldWeeksFor(d(2026, 8, 11), 2, d(2026, 8, 9), 0)).toEqual([])
  })
  it('names next week when a weekend range crosses into it', () => {
    // Sat Sep 12 – Sun Sep 13; Sunday starts the next week.
    expect(foldWeeksFor(d(2026, 8, 12), 2, d(2026, 8, 9), 0).map(ymd)).toEqual(['2026-9-13'])
  })
  it('names every touched week when the range sits wholly in the future', () => {
    // Sat Jan 9 – Sun Jan 10 2027 touches two weeks, neither current.
    expect(foldWeeksFor(d(2027, 0, 9), 2, d(2026, 8, 9), 0).map(ymd)).toEqual(['2027-1-3', '2027-1-10'])
  })
})
