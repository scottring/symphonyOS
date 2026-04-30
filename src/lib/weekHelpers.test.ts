import { describe, it, expect } from 'vitest'
import { mondayOfWeek, dayLabelFor, isToday, formatDateMonthDay } from './weekHelpers'

describe('weekHelpers', () => {
  it('mondayOfWeek returns Monday in the same week', () => {
    // Use noon UTC to keep the local-day stable across timezones.
    const monday = (d: Date) => {
      const m = mondayOfWeek(d)
      const y = m.getFullYear()
      const mm = String(m.getMonth() + 1).padStart(2, '0')
      const dd = String(m.getDate()).padStart(2, '0')
      return `${y}-${mm}-${dd}`
    }
    expect(monday(new Date('2026-04-28T12:00:00Z'))).toBe('2026-04-27') // Tuesday → Monday
    expect(monday(new Date('2026-04-27T12:00:00Z'))).toBe('2026-04-27') // Monday → Monday
    expect(monday(new Date('2026-05-03T12:00:00Z'))).toBe('2026-04-27') // Sunday → previous Monday
  })

  it('dayLabelFor returns the abbreviated day name', () => {
    expect(dayLabelFor(0)).toBe('MON')
    expect(dayLabelFor(6)).toBe('SUN')
  })

  it('isToday compares against current local date', () => {
    expect(isToday(new Date())).toBe(true)
    expect(isToday(new Date(Date.now() - 86400000))).toBe(false)
  })

  it('formatDateMonthDay returns short month + day', () => {
    expect(formatDateMonthDay(new Date('2026-04-28T12:00:00Z'))).toMatch(/Apr 28/)
  })
})
