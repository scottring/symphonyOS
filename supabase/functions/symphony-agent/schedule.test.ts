import { describe, it, expect } from 'vitest'
import { normalizeSchedule } from './schedule'

// Every assertion below is about ONE thing: the day a task lands on in the
// app's timezone. The Today view buckets by local day, so a stored instant of
// 2026-09-03T00:00:00Z is not "Sept 3" — it is Sept 2 at 8pm in EDT, and the
// task shows up on yesterday's page.
describe('normalizeSchedule', () => {
  it('stores a date-only value at LOCAL midnight, not UTC midnight', () => {
    const { scheduled_for, is_all_day, bucket } = normalizeSchedule('2026-09-03', undefined)
    expect(scheduled_for).toBe('2026-09-03T04:00:00.000Z') // EDT = UTC-4
    expect(is_all_day).toBe(true)
    expect(bucket).toBe('timed')
  })

  // The regression. "Respond to Christian" was written 2026-09-02 with
  // scheduled_for='2026-09-03' AND is_all_day=false. `allDay` came out false,
  // so the date-only branch (which required allDay) was skipped, the timed
  // branch (which required a time) was skipped too, and the raw string fell
  // through to Postgres as UTC midnight — putting a task scheduled for today
  // onto yesterday's Today view at 8pm, where it was unreachable.
  it('ignores is_all_day: false when there is no time to be not-all-day about', () => {
    const { scheduled_for, is_all_day } = normalizeSchedule('2026-09-03', false)
    expect(scheduled_for).toBe('2026-09-03T04:00:00.000Z')
    // A day with no time IS all-day, whatever the caller claimed. Persisting
    // false here is the other half of the bug: every timeline view mishandles
    // a midnight scheduled_for with is_all_day false (Today buckets it as
    // 'unscheduled', the week grid drops it at the 00:00 row).
    expect(is_all_day).toBe(true)
  })

  it('honors EST for a winter date', () => {
    expect(normalizeSchedule('2026-01-15', false).scheduled_for).toBe('2026-01-15T05:00:00.000Z')
  })

  it('reads an offsetless time as app-local wall clock', () => {
    const { scheduled_for, is_all_day } = normalizeSchedule('2026-09-03T15:00:00', undefined)
    expect(scheduled_for).toBe('2026-09-03T19:00:00.000Z') // 3pm EDT
    expect(is_all_day).toBe(false)
  })

  it('leaves an explicit-offset instant alone', () => {
    expect(normalizeSchedule('2026-09-03T19:00:00Z', undefined).scheduled_for)
      .toBe('2026-09-03T19:00:00Z')
  })

  it('lets a caller mark a timed value all-day without moving the instant', () => {
    const { scheduled_for, is_all_day } = normalizeSchedule('2026-09-03T15:00:00Z', true)
    expect(scheduled_for).toBe('2026-09-03T15:00:00Z')
    expect(is_all_day).toBe(true)
  })

  it('sends a missing date to the inbox', () => {
    expect(normalizeSchedule(null, undefined)).toEqual({
      scheduled_for: null, is_all_day: false, bucket: 'inbox',
    })
  })
})
