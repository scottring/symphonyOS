import { describe, it, expect } from 'vitest'
import type { Span } from '@/types/span'
import type { Task } from '@/types/task'
import {
  belongsToSpan, selectPlaceableSpans, selectSpanPool, spanContainsDay,
  spanDayCount, spanIdForBucket, spanOverlapsWeek, spansForDay,
} from './spanPlacement'

const d = (day: number, h = 0) => new Date(2026, 8, day, h)

const span = (over: Partial<Span> = {}): Span => ({
  id: 's1', userId: 'u1', name: 'Labor Day weekend',
  startDate: d(5), endDate: d(7), context: 'family', scope: 'compound',
  createdAt: d(1), updatedAt: d(1), ...over,
})

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: 't1', title: 'Pack the cooler', completed: false,
    bucket: 'span', spanId: 's1', createdAt: d(1), updatedAt: d(1),
    ...over,
  }) as Task

describe('spanContainsDay — both ends inclusive', () => {
  const s = span()
  it('includes the first and last day, as a person means them', () => {
    expect(spanContainsDay(s, d(5))).toBe(true)
    expect(spanContainsDay(s, d(7))).toBe(true)
  })
  it('excludes the days either side', () => {
    expect(spanContainsDay(s, d(4))).toBe(false)
    expect(spanContainsDay(s, d(8))).toBe(false)
  })
  it('ignores the clock — a day is a day', () => {
    expect(spanContainsDay(s, d(7, 23))).toBe(true)
    expect(spanContainsDay(s, d(8, 0))).toBe(false)
  })
})

describe('spanDayCount', () => {
  it('counts Sat–Mon as three days, not two', () => {
    expect(spanDayCount(span())).toBe(3)
  })
  it('counts a single-day span as one', () => {
    expect(spanDayCount(span({ startDate: d(5), endDate: d(5) }))).toBe(1)
  })
})

// The clearing half is the load-bearing one: without it a task moved out of a
// span keeps a secret span_id and reappears in that pool forever. Exactly the
// bug weekStartForBucket exists to prevent.
describe('spanIdForBucket — the stamp, and the clearing of it', () => {
  it('stamps the span when entering the span bucket', () => {
    expect(spanIdForBucket('span', 's1')).toBe('s1')
  })
  it('clears the stamp for every other bucket', () => {
    for (const b of ['week', 'month', 'quarter', 'someday', 'timed', 'inbox'] as const) {
      expect(spanIdForBucket(b, 's1')).toBeNull()
    }
  })
})

describe('belongsToSpan / selectSpanPool', () => {
  const s = span()
  it('takes tasks placed on this span', () => {
    expect(belongsToSpan(task(), s)).toBe(true)
  })
  it('ignores tasks placed on another span', () => {
    expect(belongsToSpan(task({ spanId: 's2' }), s)).toBe(false)
  })
  it('ignores tasks that are not in the span bucket, stamp or no stamp', () => {
    expect(belongsToSpan(task({ bucket: 'week' }), s)).toBe(false)
  })
  it('ignores completed work', () => {
    expect(belongsToSpan(task({ completed: true }), s)).toBe(false)
  })
  it('the pool is everything placed and not done', () => {
    const pool = selectSpanPool(
      [task(), task({ id: 't2', completed: true }), task({ id: 't3', spanId: 's2' }), task({ id: 't4' })],
      s,
    )
    expect(pool.map((t) => t.id)).toEqual(['t1', 't4'])
  })
})

describe('spansForDay', () => {
  const weekend = span()
  const brk = span({ id: 's2', name: 'Fall break', startDate: d(1), endDate: d(10) })
  it('returns every span covering the day, soonest-starting first', () => {
    expect(spansForDay([weekend, brk], d(6)).map((s) => s.id)).toEqual(['s2', 's1'])
  })
  it('returns none for a day outside them all', () => {
    expect(spansForDay([weekend], d(20))).toEqual([])
  })
})

// Placing work into last weekend is the span version of the stale week
// placement that stranded moves on a week nobody would open again.
describe('selectPlaceableSpans', () => {
  const past = span({ id: 'past', startDate: d(1), endDate: d(2) })
  const ongoing = span({ id: 'ongoing', startDate: d(5), endDate: d(7) })
  const future = span({ id: 'future', startDate: d(20), endDate: d(22) })

  it('drops spans that have already ended', () => {
    expect(selectPlaceableSpans([past, ongoing, future], d(6)).map((s) => s.id)).toEqual(['ongoing', 'future'])
  })
  it('keeps a span you are in the middle of', () => {
    expect(selectPlaceableSpans([ongoing], d(7)).map((s) => s.id)).toEqual(['ongoing'])
  })
  it('drops it the day after it ends', () => {
    expect(selectPlaceableSpans([ongoing], d(8))).toEqual([])
  })
})

// The week grid draws the days; the span owns the work. This says which weeks
// should show that a span is running, without either container claiming a task
// the other also claims.
describe('spanOverlapsWeek', () => {
  const weekend = span() // Sat 5 – Mon 7
  it('overlaps the week that ends inside it', () => {
    expect(spanOverlapsWeek(weekend, d(1))).toBe(true) // week of Sep 1 runs to Sep 7
  })
  it('overlaps the week that starts inside it', () => {
    expect(spanOverlapsWeek(weekend, d(7))).toBe(true)
  })
  it('does not overlap a week it never touches', () => {
    expect(spanOverlapsWeek(weekend, d(14))).toBe(false)
  })
})
