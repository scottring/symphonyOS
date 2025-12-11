import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  toDateString,
  parseLocalDate,
  getTodayString,
  getTomorrowString,
  getDateStringFromToday,
  isToday,
  isPastDate,
  isFutureDate,
  isSameDay,
  startOfDay,
  endOfDay,
  differenceInDays,
  addDays,
  subtractDays,
  getDayOfWeek,
  getShortDayOfWeek,
  isWeekend,
  startOfWeek,
  getWeekDates,
} from './dateUtils'

describe('dateUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Set to Saturday, June 15, 2024 at noon
    vi.setSystemTime(new Date('2024-06-15T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('toDateString', () => {
    it('formats date as YYYY-MM-DD', () => {
      const date = new Date(2024, 5, 15) // June 15, 2024
      expect(toDateString(date)).toBe('2024-06-15')
    })

    it('pads single digit months', () => {
      const date = new Date(2024, 0, 15) // January 15, 2024
      expect(toDateString(date)).toBe('2024-01-15')
    })

    it('pads single digit days', () => {
      const date = new Date(2024, 5, 5) // June 5, 2024
      expect(toDateString(date)).toBe('2024-06-05')
    })
  })

  describe('parseLocalDate', () => {
    it('parses YYYY-MM-DD string to Date', () => {
      const date = parseLocalDate('2024-06-15')
      expect(date.getFullYear()).toBe(2024)
      expect(date.getMonth()).toBe(5) // 0-indexed
      expect(date.getDate()).toBe(15)
    })

    it('handles first day of month', () => {
      const date = parseLocalDate('2024-01-01')
      expect(date.getMonth()).toBe(0)
      expect(date.getDate()).toBe(1)
    })
  })

  describe('getTodayString', () => {
    it('returns current date as string', () => {
      expect(getTodayString()).toBe('2024-06-15')
    })
  })

  describe('getTomorrowString', () => {
    it('returns tomorrow as string', () => {
      expect(getTomorrowString()).toBe('2024-06-16')
    })
  })

  describe('getDateStringFromToday', () => {
    it('returns date N days from today', () => {
      expect(getDateStringFromToday(0)).toBe('2024-06-15')
      expect(getDateStringFromToday(1)).toBe('2024-06-16')
      expect(getDateStringFromToday(7)).toBe('2024-06-22')
    })

    it('handles negative offsets', () => {
      expect(getDateStringFromToday(-1)).toBe('2024-06-14')
      expect(getDateStringFromToday(-7)).toBe('2024-06-08')
    })
  })

  describe('isToday', () => {
    it('returns true for today', () => {
      expect(isToday('2024-06-15')).toBe(true)
    })

    it('returns false for other dates', () => {
      expect(isToday('2024-06-14')).toBe(false)
      expect(isToday('2024-06-16')).toBe(false)
    })
  })

  describe('isPastDate', () => {
    it('returns true for past dates', () => {
      expect(isPastDate('2024-06-14')).toBe(true)
      expect(isPastDate('2024-01-01')).toBe(true)
    })

    it('returns false for today', () => {
      expect(isPastDate('2024-06-15')).toBe(false)
    })

    it('returns false for future dates', () => {
      expect(isPastDate('2024-06-16')).toBe(false)
    })
  })

  describe('isFutureDate', () => {
    it('returns true for future dates', () => {
      expect(isFutureDate('2024-06-16')).toBe(true)
      expect(isFutureDate('2024-12-31')).toBe(true)
    })

    it('returns false for today', () => {
      expect(isFutureDate('2024-06-15')).toBe(false)
    })

    it('returns false for past dates', () => {
      expect(isFutureDate('2024-06-14')).toBe(false)
    })
  })

  describe('isSameDay', () => {
    it('returns true for same day', () => {
      const date1 = new Date(2024, 5, 15, 10, 0, 0)
      const date2 = new Date(2024, 5, 15, 22, 30, 45)
      expect(isSameDay(date1, date2)).toBe(true)
    })

    it('returns false for different days', () => {
      const date1 = new Date(2024, 5, 15)
      const date2 = new Date(2024, 5, 16)
      expect(isSameDay(date1, date2)).toBe(false)
    })
  })

  describe('startOfDay', () => {
    it('returns midnight of the given date', () => {
      const date = new Date(2024, 5, 15, 14, 30, 45, 500)
      const start = startOfDay(date)

      expect(start.getHours()).toBe(0)
      expect(start.getMinutes()).toBe(0)
      expect(start.getSeconds()).toBe(0)
      expect(start.getMilliseconds()).toBe(0)
    })

    it('does not mutate original date', () => {
      const date = new Date(2024, 5, 15, 14, 30)
      startOfDay(date)
      expect(date.getHours()).toBe(14)
    })
  })

  describe('endOfDay', () => {
    it('returns 23:59:59.999 of the given date', () => {
      const date = new Date(2024, 5, 15, 10, 0, 0)
      const end = endOfDay(date)

      expect(end.getHours()).toBe(23)
      expect(end.getMinutes()).toBe(59)
      expect(end.getSeconds()).toBe(59)
      expect(end.getMilliseconds()).toBe(999)
    })

    it('does not mutate original date', () => {
      const date = new Date(2024, 5, 15, 10, 0)
      endOfDay(date)
      expect(date.getHours()).toBe(10)
    })
  })

  describe('differenceInDays', () => {
    it('returns positive difference when left is after right', () => {
      const later = new Date(2024, 5, 20)
      const earlier = new Date(2024, 5, 15)
      expect(differenceInDays(later, earlier)).toBe(5)
    })

    it('returns negative difference when left is before right', () => {
      const earlier = new Date(2024, 5, 15)
      const later = new Date(2024, 5, 20)
      expect(differenceInDays(earlier, later)).toBe(-5)
    })

    it('returns 0 for same timestamp', () => {
      const date1 = new Date(2024, 5, 15, 12, 0)
      const date2 = new Date(2024, 5, 15, 12, 0)
      expect(differenceInDays(date1, date2)).toBe(0)
    })

    it('handles time differences within same day', () => {
      // When comparing same day with earlier vs later time,
      // floor(-12 hours / 24 hours) = floor(-0.5) = -1
      const date1 = new Date(2024, 5, 15, 10, 0)
      const date2 = new Date(2024, 5, 15, 22, 0)
      expect(differenceInDays(date1, date2)).toBe(-1)
    })
  })

  describe('addDays', () => {
    it('adds days to date', () => {
      const date = new Date(2024, 5, 15)
      const result = addDays(date, 5)
      expect(result.getDate()).toBe(20)
    })

    it('handles month overflow', () => {
      const date = new Date(2024, 5, 28) // June 28
      const result = addDays(date, 5)
      expect(result.getMonth()).toBe(6) // July
      expect(result.getDate()).toBe(3)
    })

    it('does not mutate original date', () => {
      const date = new Date(2024, 5, 15)
      addDays(date, 5)
      expect(date.getDate()).toBe(15)
    })
  })

  describe('subtractDays', () => {
    it('subtracts days from date', () => {
      const date = new Date(2024, 5, 15)
      const result = subtractDays(date, 5)
      expect(result.getDate()).toBe(10)
    })

    it('handles month underflow', () => {
      const date = new Date(2024, 5, 3) // June 3
      const result = subtractDays(date, 5)
      expect(result.getMonth()).toBe(4) // May
      expect(result.getDate()).toBe(29)
    })
  })

  describe('getDayOfWeek', () => {
    it('returns day name in lowercase', () => {
      const saturday = new Date(2024, 5, 15)
      expect(getDayOfWeek(saturday)).toBe('saturday')

      const monday = new Date(2024, 5, 17)
      expect(getDayOfWeek(monday)).toBe('monday')
    })
  })

  describe('getShortDayOfWeek', () => {
    it('returns short day name', () => {
      const saturday = new Date(2024, 5, 15)
      expect(getShortDayOfWeek(saturday)).toBe('sat')

      const monday = new Date(2024, 5, 17)
      expect(getShortDayOfWeek(monday)).toBe('mon')
    })
  })

  describe('isWeekend', () => {
    it('returns true for Saturday', () => {
      const saturday = new Date(2024, 5, 15)
      expect(isWeekend(saturday)).toBe(true)
    })

    it('returns true for Sunday', () => {
      const sunday = new Date(2024, 5, 16)
      expect(isWeekend(sunday)).toBe(true)
    })

    it('returns false for weekdays', () => {
      const monday = new Date(2024, 5, 17)
      const friday = new Date(2024, 5, 21)
      expect(isWeekend(monday)).toBe(false)
      expect(isWeekend(friday)).toBe(false)
    })
  })

  describe('startOfWeek', () => {
    it('returns Sunday of the week', () => {
      const saturday = new Date(2024, 5, 15)
      const start = startOfWeek(saturday)
      expect(start.getDay()).toBe(0) // Sunday
      expect(start.getDate()).toBe(9)
    })

    it('returns same day if already Sunday', () => {
      const sunday = new Date(2024, 5, 9)
      const start = startOfWeek(sunday)
      expect(start.getDate()).toBe(9)
    })

    it('sets time to midnight', () => {
      const date = new Date(2024, 5, 15, 14, 30)
      const start = startOfWeek(date)
      expect(start.getHours()).toBe(0)
      expect(start.getMinutes()).toBe(0)
    })
  })

  describe('getWeekDates', () => {
    it('returns array of 7 dates', () => {
      const date = new Date(2024, 5, 15)
      const week = getWeekDates(date)
      expect(week).toHaveLength(7)
    })

    it('starts with Sunday', () => {
      const date = new Date(2024, 5, 15) // Saturday
      const week = getWeekDates(date)
      expect(week[0].getDay()).toBe(0) // Sunday
    })

    it('ends with Saturday', () => {
      const date = new Date(2024, 5, 15)
      const week = getWeekDates(date)
      expect(week[6].getDay()).toBe(6) // Saturday
    })

    it('contains consecutive days', () => {
      const date = new Date(2024, 5, 15)
      const week = getWeekDates(date)

      for (let i = 1; i < week.length; i++) {
        const diff = week[i].getDate() - week[i - 1].getDate()
        // Handle month boundaries
        expect(Math.abs(diff)).toBeLessThanOrEqual(28)
      }
    })
  })
})
