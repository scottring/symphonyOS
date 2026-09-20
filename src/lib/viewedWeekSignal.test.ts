import { describe, it, expect, afterEach } from 'vitest'
import { readViewedWeek, publishViewedWeek, onViewedWeekChange } from './viewedWeekSignal'

afterEach(() => publishViewedWeek(null))

describe('viewedWeekSignal', () => {
  it('publishes the week on screen and clears it', () => {
    const week = new Date(2026, 8, 13)
    publishViewedWeek(week)
    expect(readViewedWeek()).toEqual(week)
    publishViewedWeek(null)
    expect(readViewedWeek()).toBeNull()
  })

  it('notifies subscribers and stops after cleanup', () => {
    const seen: (string | null)[] = []
    const off = onViewedWeekChange((w) => seen.push(w ? w.toDateString() : null))
    publishViewedWeek(new Date(2026, 8, 13))
    publishViewedWeek(null)
    off()
    publishViewedWeek(new Date(2026, 8, 20))
    expect(seen).toEqual(['Sun Sep 13 2026', null])
  })

  // Two week pages mounting the same week (a remount, a re-render) must not
  // churn the pin's memo.
  it('does not re-notify for the same week', () => {
    let calls = 0
    const off = onViewedWeekChange(() => { calls += 1 })
    publishViewedWeek(new Date(2026, 8, 13))
    publishViewedWeek(new Date(2026, 8, 13))
    off()
    expect(calls).toBe(1)
  })
})
