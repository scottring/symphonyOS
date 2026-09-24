import { describe, it, expect } from 'vitest'
import { weekStartParam } from './weekStartParam'
import { weekRangeFromStartParam } from '@/lib/planning/dateRange'

describe('weekStartParam', () => {
  // S2-25: the week paged to lived only in component state, so a reload — or
  // coming back from a task — re-derived it from today and returned you to
  // this week. The week has to be IN the URL for the page to keep its place.
  it('writes the week being shown, and that week reads back unchanged', () => {
    const anchor = new Date(2026, 8, 20)
    const next = weekStartParam('week', 7, '', anchor)!
    expect(next.get('start')).toBe('2026-09-20')
    expect(weekRangeFromStartParam(next.get('start'), 0)![0]).toEqual(anchor)
  })

  it('keeps the rest of the query, and replaces a stale start', () => {
    const next = weekStartParam('week', 7, '?detail=t1&start=2026-09-06', new Date(2026, 8, 20))!
    expect(next.get('detail')).toBe('t1')
    expect(next.get('start')).toBe('2026-09-20')
  })

  // A weekend or custom run has no round-trip: `start` alone would reopen it
  // as a full week, which loses more than it keeps.
  it('leaves the URL alone for a range that is not the seven-day week', () => {
    expect(weekStartParam('week', 2, '', new Date(2026, 8, 26))).toBeNull()
    expect(weekStartParam('week', 3, '', new Date(2026, 8, 26))).toBeNull()
  })

  it('leaves the URL alone on views that never read start', () => {
    expect(weekStartParam('workweek', 7, '', new Date(2026, 8, 20))).toBeNull()
    expect(weekStartParam('today', 7, '', new Date(2026, 8, 20))).toBeNull()
    expect(weekStartParam(undefined, 7, '', new Date(2026, 8, 20))).toBeNull()
  })
})
