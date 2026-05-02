import { describe, it, expect } from 'vitest'
import { sundayOfWeek, dayLabelFor, isToday, formatDateMonthDay } from './weekHelpers'

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
