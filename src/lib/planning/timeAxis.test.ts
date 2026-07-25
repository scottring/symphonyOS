// src/lib/planning/timeAxis.test.ts
import { describe, it, expect } from 'vitest'
import { fractionOfSpan, multiDayClaims, weekBuckets, monthTicks, seasonSegments } from './timeAxis'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const YEAR_START = new Date(2026, 0, 1)
const YEAR_END = new Date(2026, 11, 31, 23, 59, 59)

describe('fractionOfSpan', () => {
  it('is 0 at the start and 1 at the end', () => {
    expect(fractionOfSpan(YEAR_START, YEAR_START, YEAR_END)).toBeCloseTo(0, 3)
    expect(fractionOfSpan(YEAR_END, YEAR_START, YEAR_END)).toBeCloseTo(1, 3)
  })

  it('puts 2026-07-25 (day 206) at ~56%', () => {
    expect(fractionOfSpan(new Date(2026, 6, 25), YEAR_START, YEAR_END)).toBeCloseTo(0.562, 2)
  })

  it('clamps outside the span', () => {
    expect(fractionOfSpan(new Date(2025, 5, 1), YEAR_START, YEAR_END)).toBe(0)
    expect(fractionOfSpan(new Date(2027, 5, 1), YEAR_START, YEAR_END)).toBe(1)
  })
})

describe('multiDayClaims', () => {
  const evs = [
    { id: 'a', title: 'Catskills trip', start_time: '2026-08-08T12:00:00Z', end_time: '2026-08-15T12:00:00Z', all_day: true },
    { id: 'b', title: 'Dentist', start_time: '2026-08-20T14:00:00Z', end_time: '2026-08-20T15:00:00Z', all_day: false },
  ] as unknown as CalendarEvent[]

  it('keeps spans of >= minDays and drops single-day events', () => {
    const claims = multiDayClaims(evs, YEAR_START, YEAR_END, 2)
    expect(claims).toHaveLength(1)
    expect(claims[0].title).toBe('Catskills trip')
  })

  it('positions the claim by its start and sizes it by its length', () => {
    const [c] = multiDayClaims(evs, YEAR_START, YEAR_END, 2)
    expect(c.startPct).toBeGreaterThan(59)
    expect(c.startPct).toBeLessThan(61)
    expect(c.widthPct).toBeGreaterThan(1.5)
  })

  it('ignores events entirely outside the span', () => {
    const outside = [
      { id: 'c', title: 'Last year', start_time: '2025-03-01T00:00:00Z', end_time: '2025-03-10T00:00:00Z', all_day: true },
    ] as unknown as CalendarEvent[]
    expect(multiDayClaims(outside, YEAR_START, YEAR_END, 2)).toHaveLength(0)
  })
})

describe('weekBuckets', () => {
  it('returns one bucket per week of the span and counts dates into them', () => {
    const buckets = weekBuckets(
      [new Date(2026, 0, 2), new Date(2026, 0, 3), new Date(2026, 6, 25)],
      YEAR_START,
      YEAR_END,
    )
    expect(buckets.length).toBeGreaterThanOrEqual(52)
    expect(buckets[0].count).toBe(2)
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(3)
  })

  it('gives a fully empty tail zero counts, not missing buckets', () => {
    const buckets = weekBuckets([new Date(2026, 0, 2)], YEAR_START, YEAR_END)
    expect(buckets.at(-1)!.count).toBe(0)
  })
})

describe('monthTicks / seasonSegments', () => {
  it('gives twelve ascending ticks starting at 0', () => {
    const ticks = monthTicks(2026)
    expect(ticks).toHaveLength(12)
    expect(ticks[0]).toMatchObject({ label: 'JAN', pct: 0 })
    expect(ticks[6].pct).toBeGreaterThan(ticks[5].pct)
  })

  it('gives four season segments covering the whole year', () => {
    const segs = seasonSegments(2026)
    expect(segs).toHaveLength(4)
    const total = segs.reduce((n, s) => n + s.widthPct, 0)
    expect(total).toBeCloseTo(100, 1)
  })
})
