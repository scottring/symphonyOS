import { describe, it, expect, afterEach } from 'vitest'
import { readViewedDay, publishViewedDay, onViewedDayChange } from './viewedDaySignal'

afterEach(() => publishViewedDay(null))

describe('viewedDaySignal', () => {
  it('publishes the day on screen and clears it', () => {
    const day = new Date(2026, 8, 13)
    publishViewedDay(day)
    expect(readViewedDay()).toEqual(day)
    publishViewedDay(null)
    expect(readViewedDay()).toBeNull()
  })

  it('notifies subscribers and stops after cleanup', () => {
    const seen: (string | null)[] = []
    const off = onViewedDayChange((w) => seen.push(w ? w.toDateString() : null))
    publishViewedDay(new Date(2026, 8, 13))
    publishViewedDay(null)
    off()
    publishViewedDay(new Date(2026, 8, 20))
    expect(seen).toEqual(['Sun Sep 13 2026', null])
  })

  // Two day pages mounting the same day (a remount, a re-render) must not
  // churn the pin's memo.
  it('does not re-notify for the same day', () => {
    let calls = 0
    const off = onViewedDayChange(() => { calls += 1 })
    publishViewedDay(new Date(2026, 8, 13))
    publishViewedDay(new Date(2026, 8, 13))
    off()
    expect(calls).toBe(1)
  })
})
