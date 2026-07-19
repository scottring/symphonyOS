import { describe, it, expect } from 'vitest'
import { sundayOfWeek, dayLabelFor, isToday, formatDateMonthDay, activeDayRange } from './weekHelpers'

describe('weekHelpers', () => {
  it('sundayOfWeek returns Sunday at the start of the week', () => {
    // Use noon UTC to keep the local-day stable across timezones.
    const sunday = (d: Date) => {
      const s = sundayOfWeek(d)
      const y = s.getFullYear()
      const mm = String(s.getMonth() + 1).padStart(2, '0')
      const dd = String(s.getDate()).padStart(2, '0')
      return `${y}-${mm}-${dd}`
    }
    expect(sunday(new Date('2026-04-28T12:00:00Z'))).toBe('2026-04-26') // Tuesday → Sunday
    expect(sunday(new Date('2026-04-26T12:00:00Z'))).toBe('2026-04-26') // Sunday → Sunday
    expect(sunday(new Date('2026-05-03T12:00:00Z'))).toBe('2026-05-03') // Sunday → same Sunday
  })

  it('dayLabelFor returns the abbreviated day name', () => {
    expect(dayLabelFor(0)).toBe('SUN')
    expect(dayLabelFor(6)).toBe('SAT')
  })

  it('isToday compares against current local date', () => {
    expect(isToday(new Date())).toBe(true)
    expect(isToday(new Date(Date.now() - 86400000))).toBe(false)
  })

  it('formatDateMonthDay returns short month + day', () => {
    expect(formatDateMonthDay(new Date('2026-04-28T12:00:00Z'))).toMatch(/Apr 28/)
  })
})

describe('activeDayRange', () => {
  const weekStart = new Date(2026, 6, 12) // Sunday July 12, 2026 (local midnight)

  it('defaults to the full week when both bounds are null', () => {
    expect(activeDayRange(weekStart, null, null)).toEqual({ firstDay: 0, lastDay: 6 })
  })

  it('maps a partial range to day indexes (Tue→Sat)', () => {
    expect(activeDayRange(weekStart, '2026-07-14', '2026-07-18')).toEqual({ firstDay: 2, lastDay: 6 })
  })

  it('supports one-sided ranges', () => {
    expect(activeDayRange(weekStart, '2026-07-13', null)).toEqual({ firstDay: 1, lastDay: 6 })
    expect(activeDayRange(weekStart, null, '2026-07-16')).toEqual({ firstDay: 0, lastDay: 4 })
  })

  it('clamps out-of-week dates into 0..6', () => {
    expect(activeDayRange(weekStart, '2026-07-01', '2026-07-30')).toEqual({ firstDay: 0, lastDay: 6 })
  })

  it('collapses an inverted range instead of going negative', () => {
    expect(activeDayRange(weekStart, '2026-07-16', '2026-07-14')).toEqual({ firstDay: 4, lastDay: 4 })
  })
})
