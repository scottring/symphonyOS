import { describe, it, expect } from 'vitest'
import { dateAtPosition, positionOf, storageFor, windowWeeks } from './mealWeek'
import { toIsoDate } from './weekHelpers'

const SAT = new Date(2026, 9, 24) // Saturday Oct 24
const SUN = new Date(2026, 9, 25)
const MON = new Date(2026, 9, 26)

describe('mealWeek', () => {
  it('a Saturday week runs Sat Oct 24 to Fri Oct 30', () => {
    expect(toIsoDate(dateAtPosition(SAT, 0))).toBe('2026-10-24')
    expect(toIsoDate(dateAtPosition(SAT, 6))).toBe('2026-10-30')
  })

  it('files each day under the Sunday week its date is in', () => {
    expect(storageFor(SAT, 0)).toEqual({ weekStart: '2026-10-18', dayOfWeek: 6 })
    expect(storageFor(SAT, 1)).toEqual({ weekStart: '2026-10-25', dayOfWeek: 0 })
    expect(storageFor(SAT, 6)).toEqual({ weekStart: '2026-10-25', dayOfWeek: 5 })
  })

  it('places stored meals back, and leaves out the days outside the window', () => {
    expect(positionOf(SAT, '2026-10-18', 6)).toBe(0)
    expect(positionOf(SAT, '2026-10-25', 0)).toBe(1)
    expect(positionOf(SAT, '2026-10-25', 6)).toBeNull() // Sat Oct 31: next week's
    expect(positionOf(SAT, '2026-10-18', 5)).toBeNull() // Fri Oct 23: last week's
  })

  it('a Saturday week draws on two Sunday weeks, anchored on the later', () => {
    expect(windowWeeks(SAT)).toEqual({ weeks: ['2026-10-18', '2026-10-25'], anchor: '2026-10-25' })
  })

  it('a Sunday week is one Sunday week, positions equal to days of the week', () => {
    expect(windowWeeks(SUN)).toEqual({ weeks: ['2026-10-25'], anchor: '2026-10-25' })
    for (let d = 0; d < 7; d++) {
      expect(storageFor(SUN, d)).toEqual({ weekStart: '2026-10-25', dayOfWeek: d })
      expect(positionOf(SUN, '2026-10-25', d)).toBe(d)
    }
  })

  it('a Monday week anchors on the Sunday before it', () => {
    expect(windowWeeks(MON)).toEqual({ weeks: ['2026-10-25', '2026-11-01'], anchor: '2026-10-25' })
    expect(storageFor(MON, 6)).toEqual({ weekStart: '2026-11-01', dayOfWeek: 0 })
  })
})
