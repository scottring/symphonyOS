import { describe, it, expect } from 'vitest'
import { sundayOfWeek, dayLabelFor, isToday, formatDateMonthDay, activeDayRange, weekEventSpan, rangeEventSpan } from './weekHelpers'

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

describe('weekEventSpan', () => {
  it('covers the whole week containing the date, under both week anchors', () => {
    // Mon Aug 31 2026 — the Week bench grid shows Aug 31–Sep 6 (Monday
    // anchor); nav normalizes to a Sunday anchor. The span must cover both.
    const { start, end } = weekEventSpan(new Date(2026, 7, 31, 14, 30))
    expect(start).toEqual(new Date(2026, 7, 30, 0, 0, 0, 0))
    expect(end).toEqual(new Date(2026, 8, 6, 23, 59, 59, 999))
    // The PT appointment that started all this: Wed Sep 2, 9:15 AM.
    const wed = new Date(2026, 8, 2, 9, 15)
    expect(wed >= start && wed <= end).toBe(true)
  })

  it('starts on the Sunday of the given week at local midnight', () => {
    const { start } = weekEventSpan(new Date(2026, 8, 6, 8, 0)) // Sun Sep 6
    expect(start).toEqual(new Date(2026, 8, 6, 0, 0, 0, 0))
  })
})

describe('rangeEventSpan', () => {
  it('covers two weeks from the Sunday of the viewed date, so any 7-day range starting in that week has its events', () => {
    const { start, end } = rangeEventSpan(new Date(2026, 8, 12, 12)) // Sat Sep 12
    expect(start.getMonth()).toBe(8)
    expect(start.getDate()).toBe(6) // Sun Sep 6
    expect(end.getDate()).toBe(20) // through Sun Sep 20
    expect(end.getHours()).toBe(23)
  })
})
