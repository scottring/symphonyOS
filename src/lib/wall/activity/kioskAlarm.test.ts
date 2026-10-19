import { describe, it, expect } from 'vitest'
import { startTimer, MINUTE_MS } from './kioskTimers'
import {
  finishedLive, ringingTimers, ringDue, doneAnnouncement, ALARM_RING_MS, FAST_RING_MS, SLOW_RING_MS, LIVE_FINISH_MS,
} from './kioskAlarm'

const T0 = Date.UTC(2026, 9, 19, 22, 0, 0)

describe('kiosk alarm', () => {
  const t = startTimer('a', 'Rice', 1, T0)
  const end = T0 + MINUTE_MS

  it('counts a finish as live only when the wall sees it right away', () => {
    expect(finishedLive(t, end - 1)).toBe(false)
    expect(finishedLive(t, end + 1_000)).toBe(true)
    // Finished while the page was closed: shows Done, never rings on load.
    expect(finishedLive(t, end + LIVE_FINISH_MS + 1)).toBe(false)
  })

  it('rings only live-finished timers, and stops after five minutes', () => {
    const live = new Set(['a'])
    expect(ringingTimers([t], live, end + 10_000)).toHaveLength(1)
    expect(ringingTimers([t], new Set(), end + 10_000)).toHaveLength(0)
    expect(ringingTimers([t], live, end + ALARM_RING_MS)).toHaveLength(0)
    expect(ringingTimers([t], live, end - 1)).toHaveLength(0)
  })

  it('rings at once, every 4 s for the first minute, then every 15 s', () => {
    const r = [t]
    expect(ringDue(r, 0, end)).toBe(true)
    expect(ringDue(r, end, end + FAST_RING_MS - 1)).toBe(false)
    expect(ringDue(r, end, end + FAST_RING_MS)).toBe(true)
    const late = end + 2 * MINUTE_MS
    expect(ringDue(r, late, late + FAST_RING_MS)).toBe(false)
    expect(ringDue(r, late, late + SLOW_RING_MS)).toBe(true)
    expect(ringDue([], 0, end)).toBe(false)
  })

  it('rings at once when a second timer finishes, then paces from that finish', () => {
    const u = startTimer('b', 'Pasta', 2, T0)
    const uEnd = T0 + 2 * MINUTE_MS
    // The first rang a second before the second finished: ring again now.
    expect(ringDue([t, u], uEnd - 1_000, uEnd + 1_000)).toBe(true)
    // Then the fast pace again, counted from the second finish.
    expect(ringDue([t, u], uEnd + 1_000, uEnd + 3_000)).toBe(false)
    expect(ringDue([t, u], uEnd + 1_000, uEnd + 1_000 + FAST_RING_MS)).toBe(true)
  })

  it('says which timer is done', () => {
    expect(doneAnnouncement(startTimer('x', '10 min', 10, T0))).toBe('The 10-minute timer is done.')
    expect(doneAnnouncement(startTimer('x', '8 min · step 3', 8, T0))).toBe('The 8-minute timer for step 3 is done.')
    expect(doneAnnouncement(startTimer('x', 'Step 2 · 5 min', 5, T0))).toBe('The 5-minute timer for step 2 is done.')
    expect(doneAnnouncement(startTimer('x', 'Rice', 18, T0))).toBe('Rice timer is done.')
    expect(doneAnnouncement(startTimer('x', 'Oven timer', 18, T0))).toBe('Oven timer is done.')
    expect(doneAnnouncement(startTimer('x', '', 18, T0))).toBe('Your timer is done.')
  })
})
