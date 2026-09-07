import { describe, it, expect } from 'vitest'
import { isMissedPlacement, missedLabel } from './missedPlacement'

const now = new Date(2026, 8, 10, 14, 0) // Thu Sep 10 2026, 2pm

describe('isMissedPlacement', () => {
  it('is true for a card left on a day that has passed', () => {
    expect(isMissedPlacement(new Date(2026, 8, 9, 10, 30), false, now)).toBe(true)
  })

  it('is false while the day is still running — a morning slot missed at 2pm is not a verdict', () => {
    expect(isMissedPlacement(new Date(2026, 8, 10, 8, 0), false, now)).toBe(false)
  })

  it('is false for a day still ahead', () => {
    expect(isMissedPlacement(new Date(2026, 8, 11, 9, 0), false, now)).toBe(false)
  })

  it('is false when it was done — a ticked card belongs to the day it was done on', () => {
    expect(isMissedPlacement(new Date(2026, 8, 9, 10, 30), true, now)).toBe(false)
  })

  it('is false with no date at all', () => {
    expect(isMissedPlacement(null, false, now)).toBe(false)
    expect(isMissedPlacement(undefined, false, now)).toBe(false)
  })
})

describe('missedLabel', () => {
  it('names the weekday inside the last week', () => {
    expect(missedLabel(new Date(2026, 8, 9, 10, 30), now)).toBe("Didn't happen · Wed")
  })

  it('falls back to a date once the weekday would be ambiguous', () => {
    expect(missedLabel(new Date(2026, 8, 2, 10, 30), now)).toBe("Didn't happen · Sep 2")
  })
})
