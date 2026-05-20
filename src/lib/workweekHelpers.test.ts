import { describe, it, expect } from 'vitest'
import { mondayOfWeek } from './workweekHelpers'

describe('mondayOfWeek', () => {
  it('returns Monday for a Tuesday', () => {
    // 2026-05-19 is a Tuesday
    const tue = new Date(2026, 4, 19)
    const mon = mondayOfWeek(tue)
    expect(mon.getDate()).toBe(18)
    expect(mon.getDay()).toBe(1)  // Monday
  })

  it('returns the same date when called on a Monday', () => {
    const mon = new Date(2026, 4, 18)
    expect(mondayOfWeek(mon).getDate()).toBe(18)
  })

  it('snaps a Saturday to the UPCOMING Monday (next week)', () => {
    // 2026-05-23 is a Saturday
    const sat = new Date(2026, 4, 23)
    const mon = mondayOfWeek(sat)
    expect(mon.getDate()).toBe(25)
    expect(mon.getDay()).toBe(1)
  })

  it('snaps a Sunday to the upcoming Monday', () => {
    // 2026-05-24 is a Sunday
    const sun = new Date(2026, 4, 24)
    const mon = mondayOfWeek(sun)
    expect(mon.getDate()).toBe(25)
    expect(mon.getDay()).toBe(1)
  })

  it('zeroes the time portion', () => {
    const tue = new Date(2026, 4, 19, 15, 42, 30, 500)
    const mon = mondayOfWeek(tue)
    expect(mon.getHours()).toBe(0)
    expect(mon.getMinutes()).toBe(0)
    expect(mon.getSeconds()).toBe(0)
    expect(mon.getMilliseconds()).toBe(0)
  })
})
