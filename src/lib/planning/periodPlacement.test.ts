import { describe, it, expect, beforeEach } from 'vitest'
import {
  monthStartOf, belongsToMonth, isPlacedOnMonth, belongsToSeason, isPlacedOnSeason,
  monthStartForBucket, seasonStartForBucket, isPlacement,
} from './periodPlacement'

const d = (y: number, m: number, day: number) => new Date(y, m, day)

describe('monthStartOf', () => {
  it('is the first of the month at midnight', () => {
    const s = monthStartOf(new Date(2026, 8, 17, 15, 45))
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours()]).toEqual([2026, 8, 1, 0])
  })
})

// The two predicates differ ONLY on the NULL row, and mixing them up is the bug
// (the same lesson as weekPlacement.ts).
describe('belongsToMonth vs isPlacedOnMonth', () => {
  const sep = d(2026, 8, 1)
  const oct = d(2026, 9, 1)

  it('an explicitly stamped row belongs to and is placed on its month only', () => {
    const task = { monthStart: sep }
    expect(belongsToMonth(task, sep)).toBe(true)
    expect(isPlacedOnMonth(task, sep)).toBe(true)
    expect(belongsToMonth(task, oct)).toBe(false)
    expect(isPlacedOnMonth(task, oct)).toBe(false)
  })

  // A legacy row (no month_start) used to mean "the current month". The POOL
  // keeps showing it — scoping it away would make an existing month plan
  // vanish. A one-row-per-month surface must NOT count it, or it repeats in
  // every month of the navigator.
  it('a NULL row belongs to any month but is placed on none', () => {
    const legacy = { monthStart: undefined }
    expect(belongsToMonth(legacy, sep)).toBe(true)
    expect(belongsToMonth(legacy, oct)).toBe(true)
    expect(isPlacedOnMonth(legacy, sep)).toBe(false)
  })

  it('compares by calendar day, not by millisecond', () => {
    expect(belongsToMonth({ monthStart: new Date(2026, 8, 1, 9) }, sep)).toBe(true)
  })
})

describe('belongsToSeason vs isPlacedOnSeason', () => {
  const fall = d(2026, 9, 1)
  const summer = d(2026, 6, 1)
  it('mirror the month predicates exactly', () => {
    expect(belongsToSeason({ seasonStart: fall }, fall)).toBe(true)
    expect(belongsToSeason({ seasonStart: fall }, summer)).toBe(false)
    expect(isPlacedOnSeason({ seasonStart: fall }, fall)).toBe(true)
    expect(belongsToSeason({ seasonStart: undefined }, summer)).toBe(true)
    expect(isPlacedOnSeason({ seasonStart: undefined }, summer)).toBe(false)
  })
})

describe('monthStartForBucket / seasonStartForBucket', () => {
  beforeEach(() => localStorage.clear())
  const now = new Date(2026, 8, 17)

  // Entering the month bucket means THIS month; every other bucket has no
  // month. The clear matters as much as the stamp: a task sent from the month
  // to the week that kept its month_start would come back in September's
  // look-back as still open.
  it('stamps this month on entry and clears everywhere else', () => {
    expect(monthStartForBucket('month', now)?.getTime()).toBe(d(2026, 8, 1).getTime())
    expect(monthStartForBucket('week', now)).toBeUndefined()
    expect(monthStartForBucket('quarter', now)).toBeUndefined()
    expect(monthStartForBucket('timed', now)).toBeUndefined()
  })

  it('stamps this season (from the configured boundaries) on entry to quarter and clears elsewhere', () => {
    expect(seasonStartForBucket('quarter', now)?.getTime()).toBe(d(2026, 6, 1).getTime()) // Summer, Jul 1 default
    expect(seasonStartForBucket('month', now)).toBeUndefined()
  })
})

describe('isPlacement', () => {
  it('is true for any write that moves the task in time', () => {
    expect(isPlacement({ bucket: 'week' })).toBe(true)
    expect(isPlacement({ scheduledFor: new Date() })).toBe(true)
    expect(isPlacement({ weekStart: new Date() })).toBe(true)
    expect(isPlacement({ monthStart: new Date() })).toBe(true)
    expect(isPlacement({ seasonStart: new Date() })).toBe(true)
  })
  it('is false for edits that leave it where it is', () => {
    expect(isPlacement({ title: 'x' })).toBe(false)
    expect(isPlacement({ completed: true })).toBe(false)
    expect(isPlacement({ notes: 'y', context: 'family' })).toBe(false)
    expect(isPlacement({})).toBe(false)
  })
})
