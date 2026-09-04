import { describe, it, expect } from 'vitest'
import { weekStartAnchor } from './config'

// The "Week starts on" setting (Settings → Planning Rhythm) drives every week
// reader — the task buckets, the cadence, the pools. The week GRID was the one
// place still hardcoded to Monday (HomeView, since 2026-02), so a user set to
// Sunday saw a Monday grid while their placements landed in Sunday-anchored
// weeks. These lock the anchor both views now share.
describe('weekStartAnchor — the setting the week grid follows', () => {
  const wed = new Date(2026, 8, 2)   // Wednesday, Sep 2 2026
  const sun = new Date(2026, 8, 6)   // Sunday, Sep 6 2026

  it('anchors to the preceding Monday when the week starts on Monday', () => {
    const d = weekStartAnchor(wed, 1)
    expect(d.getDay()).toBe(1)
    expect(d.getDate()).toBe(31) // Mon Aug 31
  })

  it('anchors to the preceding Sunday when the week starts on Sunday', () => {
    const d = weekStartAnchor(wed, 0)
    expect(d.getDay()).toBe(0)
    expect(d.getDate()).toBe(30) // Sun Aug 30
  })

  it('is a no-op on the anchor day itself', () => {
    expect(weekStartAnchor(sun, 0).getTime()).toBe(sun.getTime())
  })

  // Sunday is the case the hardcoded grid got wrong: on a Sunday it jumped to
  // TOMORROW's Monday, showing a week the day itself was not in.
  it('keeps a Sunday inside its own week, not the next one', () => {
    const d = weekStartAnchor(sun, 0)
    expect(d.getTime()).toBeLessThanOrEqual(sun.getTime())
  })

  it('zeroes the time so date arithmetic downstream is clean', () => {
    const noisy = new Date(2026, 8, 2, 17, 43, 12, 500)
    const d = weekStartAnchor(noisy, 1)
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0])
  })
})
