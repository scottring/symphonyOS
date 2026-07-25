import { describe, it, expect } from 'vitest'
import { belongsToWeek, weekPlacementState, isStaleWeekPlacement, needsWeekVerdict, weekStartForBucket } from './weekPlacement'
import type { Task } from '@/types/task'

const JUL_19 = new Date(2026, 6, 19) // Sunday
const JUL_26 = new Date(2026, 6, 26) // the next Sunday

describe('belongsToWeek', () => {
  it('a task placed on the viewed week belongs to it', () => {
    expect(belongsToWeek({ weekStart: new Date(2026, 6, 19) }, JUL_19)).toBe(true)
  })

  it('a task placed on a DIFFERENT week does not', () => {
    expect(belongsToWeek({ weekStart: JUL_26 }, JUL_19)).toBe(false)
    expect(belongsToWeek({ weekStart: JUL_19 }, JUL_26)).toBe(false)
  })

  // The no-backfill promise: every row that existed before the cascade shipped
  // has week_start NULL, and its old meaning was the implicit "the current week".
  // Scoping those to one week would make an existing week plan vanish.
  it('a task with no weekStart belongs to whatever week is viewed', () => {
    expect(belongsToWeek({ weekStart: undefined }, JUL_19)).toBe(true)
    expect(belongsToWeek({ weekStart: undefined }, JUL_26)).toBe(true)
  })

  it('compares the calendar day, not the instant — a stamped time never splits a week', () => {
    // A weekStart that somehow carries a time still belongs to its own week.
    expect(belongsToWeek({ weekStart: new Date(2026, 6, 19, 14, 30) }, JUL_19)).toBe(true)
  })
})

// ── The carry-over question. `unplaced` (week_start NULL) is the case that
// separates these predicates, and getting it wrong in either direction is a bug:
// counted as late, every legacy row screams; ignored by the review, every legacy
// row lingers. ──
describe('weekPlacementState', () => {
  const week = (d: number) => new Date(2026, 6, d)
  const t = (over: Partial<Task>): Task => ({
    id: 'x', title: 'x', completed: false, bucket: 'week',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  })

  it('names each position relative to the viewed week', () => {
    expect(weekPlacementState(t({ weekStart: week(19) }), week(19))).toBe('this-week')
    expect(weekPlacementState(t({ weekStart: week(26) }), week(19))).toBe('later')
    expect(weekPlacementState(t({ weekStart: week(12) }), week(19))).toBe('left-behind')
    expect(weekPlacementState(t({ weekStart: undefined }), week(19))).toBe('unplaced')
  })

  it('is not-week for other buckets and for anything completed', () => {
    expect(weekPlacementState(t({ bucket: 'month', weekStart: week(12) }), week(19))).toBe('not-week')
    expect(weekPlacementState(t({ weekStart: week(12), completed: true }), week(19))).toBe('not-week')
  })

  it('crosses a year boundary correctly (Dec is behind Jan, not ahead)', () => {
    const dec28 = new Date(2025, 11, 28)
    const jan4 = new Date(2026, 0, 4)
    expect(weekPlacementState(t({ weekStart: dec28 }), jan4)).toBe('left-behind')
    expect(weekPlacementState(t({ weekStart: jan4 }), dec28)).toBe('later')
  })
})

describe('isStaleWeekPlacement', () => {
  const week = (d: number) => new Date(2026, 6, d)
  const t = (over: Partial<Task>): Task => ({
    id: 'x', title: 'x', completed: false, bucket: 'week',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  })

  it('is true only for a week that has already passed', () => {
    expect(isStaleWeekPlacement(t({ weekStart: week(12) }), week(19))).toBe(true)
    expect(isStaleWeekPlacement(t({ weekStart: week(19) }), week(19))).toBe(false)
    expect(isStaleWeekPlacement(t({ weekStart: week(26) }), week(19))).toBe(false)
  })

  // A legacy row is not LATE — it never had a week to miss, and it's still in
  // the current week's pool where it has always been. Marking it stale would
  // paint every pre-cascade item amber.
  it('is false for a row with no week of its own', () => {
    expect(isStaleWeekPlacement(t({ weekStart: undefined }), week(19))).toBe(false)
  })
})

describe('needsWeekVerdict', () => {
  const week = (d: number) => new Date(2026, 6, d)
  const t = (over: Partial<Task>): Task => ({
    id: 'x', title: 'x', completed: false, bucket: 'week',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  })

  it('asks about what was left behind AND what never got a week', () => {
    expect(needsWeekVerdict(t({ weekStart: week(12) }), week(19))).toBe(true)
    expect(needsWeekVerdict(t({ weekStart: undefined }), week(19))).toBe(true)
  })

  // The regression the placement cascade would otherwise have introduced:
  // "last week's list" quietly filling up with next month's plan.
  it('does NOT ask about a move deliberately placed on this week or a later one', () => {
    expect(needsWeekVerdict(t({ weekStart: week(19) }), week(19))).toBe(false)
    expect(needsWeekVerdict(t({ weekStart: week(26) }), week(19))).toBe(false)
  })
})

describe('weekStartForBucket', () => {
  const currentWeek = new Date(2026, 6, 19)

  // The no-op bug: an item already in the week bucket, carried forward from a
  // week that passed, was written with `{bucket:'week'}` and nothing else — so
  // the update changed nothing and it came back marked late. The stamp is the
  // whole reason "carry it forward" does anything.
  it('stamps THIS week when entering the week bucket', () => {
    expect(weekStartForBucket('week', currentWeek)).toEqual(currentWeek)
  })

  it('clears the week for every other bucket — nothing keeps a secret week', () => {
    for (const bucket of ['inbox', 'month', 'quarter', 'someday', 'timed'] as const) {
      expect(weekStartForBucket(bucket, currentWeek)).toBeUndefined()
    }
  })
})
