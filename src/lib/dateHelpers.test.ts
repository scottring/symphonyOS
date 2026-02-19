import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getBaseDate,
  getNextWeekend,
  getNextMonday,
  getWeekendAfterNext,
  getHoursFromNow,
  getThisEvening,
  isBeforeEvening,
  formatDateForInput,
  formatTimeForInput,
  parseDateInput,
  parseTimeInput,
  formatDateLabel,
  formatTimeCompact,
} from './dateHelpers'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getBaseDate', () => {
  it('returns today at midnight when daysFromNow is 0', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0)) // Thu Feb 19 2026 2:30pm
    const result = getBaseDate(0)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(19)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })

  it('returns tomorrow at midnight when daysFromNow is 1', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0))
    const result = getBaseDate(1)
    expect(result.getDate()).toBe(20)
    expect(result.getHours()).toBe(0)
  })

  it('returns 7 days from now at midnight', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0))
    const result = getBaseDate(7)
    expect(result.getDate()).toBe(26)
    expect(result.getHours()).toBe(0)
  })

  it('handles month boundary correctly', () => {
    vi.setSystemTime(new Date(2026, 1, 28, 10, 0, 0)) // Feb 28
    const result = getBaseDate(3)
    expect(result.getMonth()).toBe(2) // March
    expect(result.getDate()).toBe(3)
  })

  it('handles year boundary correctly', () => {
    vi.setSystemTime(new Date(2026, 11, 30, 10, 0, 0)) // Dec 30
    const result = getBaseDate(5)
    expect(result.getFullYear()).toBe(2027)
    expect(result.getMonth()).toBe(0) // January
    expect(result.getDate()).toBe(4)
  })

  it('handles negative days (past dates)', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0))
    const result = getBaseDate(-3)
    expect(result.getDate()).toBe(16)
    expect(result.getHours()).toBe(0)
  })
})

describe('getNextWeekend', () => {
  it('returns next Saturday when today is Monday', () => {
    // Monday Feb 16 2026
    vi.setSystemTime(new Date(2026, 1, 16, 10, 0, 0))
    const result = getNextWeekend()
    expect(result.getDay()).toBe(6) // Saturday
    expect(result.getDate()).toBe(21) // Feb 21
    expect(result.getHours()).toBe(0)
  })

  it('returns next Saturday when today is Tuesday', () => {
    // Tuesday Feb 17 2026
    vi.setSystemTime(new Date(2026, 1, 17, 10, 0, 0))
    const result = getNextWeekend()
    expect(result.getDay()).toBe(6)
    expect(result.getDate()).toBe(21) // 4 days later
  })

  it('returns next Saturday when today is Wednesday', () => {
    // Wednesday Feb 18 2026
    vi.setSystemTime(new Date(2026, 1, 18, 10, 0, 0))
    const result = getNextWeekend()
    expect(result.getDay()).toBe(6)
    expect(result.getDate()).toBe(21) // 3 days later
  })

  it('returns next Saturday when today is Thursday', () => {
    // Thursday Feb 19 2026
    vi.setSystemTime(new Date(2026, 1, 19, 10, 0, 0))
    const result = getNextWeekend()
    expect(result.getDay()).toBe(6)
    expect(result.getDate()).toBe(21) // 2 days later
  })

  it('returns next Saturday when today is Friday', () => {
    // Friday Feb 20 2026
    vi.setSystemTime(new Date(2026, 1, 20, 10, 0, 0))
    const result = getNextWeekend()
    expect(result.getDay()).toBe(6)
    expect(result.getDate()).toBe(21) // 1 day later
  })

  it('returns same day (Saturday) when today is Saturday', () => {
    // Saturday Feb 21 2026
    vi.setSystemTime(new Date(2026, 1, 21, 10, 0, 0))
    const result = getNextWeekend()
    // 6 - 6 = 0 days, so same day
    expect(result.getDay()).toBe(6)
    expect(result.getDate()).toBe(21)
  })

  it('returns next Saturday (6 days later) when today is Sunday', () => {
    // Sunday Feb 22 2026
    vi.setSystemTime(new Date(2026, 1, 22, 10, 0, 0))
    const result = getNextWeekend()
    expect(result.getDay()).toBe(6)
    expect(result.getDate()).toBe(28) // 6 days later
  })

  it('returns midnight', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 15, 45, 30))
    const result = getNextWeekend()
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })
})

describe('getNextMonday', () => {
  it('returns next Monday when today is Monday', () => {
    // Monday Feb 16 2026
    vi.setSystemTime(new Date(2026, 1, 16, 10, 0, 0))
    const result = getNextMonday()
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(23) // 7 days later (8 - 1)
  })

  it('returns next Monday when today is Tuesday', () => {
    // Tuesday Feb 17 2026
    vi.setSystemTime(new Date(2026, 1, 17, 10, 0, 0))
    const result = getNextMonday()
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(23) // 6 days later (8 - 2)
  })

  it('returns next Monday when today is Wednesday', () => {
    // Wednesday Feb 18 2026
    vi.setSystemTime(new Date(2026, 1, 18, 10, 0, 0))
    const result = getNextMonday()
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(23) // 5 days later (8 - 3)
  })

  it('returns next Monday when today is Thursday', () => {
    // Thursday Feb 19 2026
    vi.setSystemTime(new Date(2026, 1, 19, 10, 0, 0))
    const result = getNextMonday()
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(23) // 4 days later (8 - 4)
  })

  it('returns next Monday when today is Friday', () => {
    // Friday Feb 20 2026
    vi.setSystemTime(new Date(2026, 1, 20, 10, 0, 0))
    const result = getNextMonday()
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(23) // 3 days later (8 - 5)
  })

  it('returns next Monday when today is Saturday', () => {
    // Saturday Feb 21 2026
    vi.setSystemTime(new Date(2026, 1, 21, 10, 0, 0))
    const result = getNextMonday()
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(23) // 2 days later (8 - 6)
  })

  it('returns tomorrow (Monday) when today is Sunday', () => {
    // Sunday Feb 22 2026
    vi.setSystemTime(new Date(2026, 1, 22, 10, 0, 0))
    const result = getNextMonday()
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(23) // 1 day later
  })

  it('returns midnight', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 15, 45, 30))
    const result = getNextMonday()
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})

describe('getWeekendAfterNext', () => {
  it('returns 7 days after next Saturday', () => {
    // Thursday Feb 19 2026 -> next Saturday = Feb 21 -> weekend after = Feb 28
    vi.setSystemTime(new Date(2026, 1, 19, 10, 0, 0))
    const result = getWeekendAfterNext()
    expect(result.getDay()).toBe(6) // Saturday
    expect(result.getDate()).toBe(28)
  })

  it('returns correct date when called on Sunday', () => {
    // Sunday Feb 22 2026 -> next Saturday = Feb 28 -> weekend after = Mar 7
    vi.setSystemTime(new Date(2026, 1, 22, 10, 0, 0))
    const result = getWeekendAfterNext()
    expect(result.getDay()).toBe(6)
    expect(result.getMonth()).toBe(2) // March
    expect(result.getDate()).toBe(7)
  })

  it('returns correct date when called on Saturday', () => {
    // Saturday Feb 21 2026 -> next Saturday = Feb 21 (same day) -> weekend after = Feb 28
    vi.setSystemTime(new Date(2026, 1, 21, 10, 0, 0))
    const result = getWeekendAfterNext()
    expect(result.getDay()).toBe(6)
    expect(result.getDate()).toBe(28)
  })

  it('handles month boundary', () => {
    // Monday Feb 23 2026 -> next Saturday = Feb 28 -> weekend after = Mar 7
    vi.setSystemTime(new Date(2026, 1, 23, 10, 0, 0))
    const result = getWeekendAfterNext()
    expect(result.getMonth()).toBe(2) // March
    expect(result.getDate()).toBe(7)
  })

  it('returns midnight', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 15, 45, 30))
    const result = getWeekendAfterNext()
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})

describe('getHoursFromNow', () => {
  it('adds the specified number of hours', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 0, 0)) // 10:00am
    const result = getHoursFromNow(2)
    expect(result.getHours()).toBe(12) // 12:00pm
    expect(result.getMinutes()).toBe(0)
  })

  it('rounds up to nearest 30 minutes when minutes are non-zero', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 10, 0)) // 10:10am
    const result = getHoursFromNow(1)
    // 10:10 + 1hr = 11:10 -> ceil(10/30)*30 = 30 -> 11:30
    expect(result.getHours()).toBe(11)
    expect(result.getMinutes()).toBe(30)
  })

  it('keeps 0 minutes when already on the hour', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 0, 0)) // 10:00am
    const result = getHoursFromNow(1)
    // 10:00 + 1hr = 11:00 -> ceil(0/30)*30 = 0 -> 11:00
    expect(result.getHours()).toBe(11)
    expect(result.getMinutes()).toBe(0)
  })

  it('keeps 30 minutes when already on the half hour', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 30, 0)) // 10:30am
    const result = getHoursFromNow(1)
    // 10:30 + 1hr = 11:30 -> ceil(30/30)*30 = 30 -> 11:30
    expect(result.getHours()).toBe(11)
    expect(result.getMinutes()).toBe(30)
  })

  it('rounds 1-30 minutes up to 30', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 15, 0)) // 10:15am
    const result = getHoursFromNow(0)
    // ceil(15/30)*30 = 30 -> 10:30
    expect(result.getHours()).toBe(10)
    expect(result.getMinutes()).toBe(30)
  })

  it('rounds 31-59 minutes up to 60 (next hour)', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 45, 0)) // 10:45am
    const result = getHoursFromNow(0)
    // ceil(45/30)*30 = 60 -> rolls to 11:00
    expect(result.getHours()).toBe(11)
    expect(result.getMinutes()).toBe(0)
  })

  it('clears seconds and milliseconds', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 0, 45, 500))
    const result = getHoursFromNow(1)
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })

  it('handles crossing midnight', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 23, 0, 0)) // 11pm
    const result = getHoursFromNow(3)
    expect(result.getDate()).toBe(20)
    expect(result.getHours()).toBe(2)
  })
})

describe('getThisEvening', () => {
  it('returns today at 6pm', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 0, 0))
    const result = getThisEvening()
    expect(result.getDate()).toBe(19)
    expect(result.getHours()).toBe(18)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })

  it('returns 6pm even when current time is after 6pm', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 21, 30, 0))
    const result = getThisEvening()
    expect(result.getHours()).toBe(18)
    expect(result.getDate()).toBe(19)
  })

  it('returns 6pm even when current time is exactly 6pm', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 18, 0, 0))
    const result = getThisEvening()
    expect(result.getHours()).toBe(18)
    expect(result.getMinutes()).toBe(0)
  })
})

describe('isBeforeEvening', () => {
  it('returns true at 9am', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 9, 0, 0))
    expect(isBeforeEvening()).toBe(true)
  })

  it('returns true at midnight', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 0, 0, 0))
    expect(isBeforeEvening()).toBe(true)
  })

  it('returns true at 5:59pm (17:59)', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 17, 59, 0))
    expect(isBeforeEvening()).toBe(true)
  })

  it('returns false at exactly 6pm (18:00)', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 18, 0, 0))
    expect(isBeforeEvening()).toBe(false)
  })

  it('returns false at 9pm', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 21, 0, 0))
    expect(isBeforeEvening()).toBe(false)
  })

  it('returns false at 11:59pm', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 23, 59, 0))
    expect(isBeforeEvening()).toBe(false)
  })
})

describe('formatDateForInput', () => {
  it('formats a standard date as YYYY-MM-DD', () => {
    const date = new Date(2026, 1, 19) // Feb 19
    expect(formatDateForInput(date)).toBe('2026-02-19')
  })

  it('pads single-digit month with zero', () => {
    const date = new Date(2026, 0, 5) // Jan 5
    expect(formatDateForInput(date)).toBe('2026-01-05')
  })

  it('pads single-digit day with zero', () => {
    const date = new Date(2026, 2, 3) // Mar 3
    expect(formatDateForInput(date)).toBe('2026-03-03')
  })

  it('handles double-digit month and day', () => {
    const date = new Date(2026, 11, 25) // Dec 25
    expect(formatDateForInput(date)).toBe('2026-12-25')
  })

  it('handles Dec 31 year boundary', () => {
    const date = new Date(2026, 11, 31)
    expect(formatDateForInput(date)).toBe('2026-12-31')
  })

  it('handles Jan 1', () => {
    const date = new Date(2027, 0, 1)
    expect(formatDateForInput(date)).toBe('2027-01-01')
  })
})

describe('formatTimeForInput', () => {
  it('formats morning time as HH:MM', () => {
    const date = new Date(2026, 1, 19, 9, 30, 0)
    expect(formatTimeForInput(date)).toBe('09:30')
  })

  it('formats afternoon time as HH:MM (24-hour)', () => {
    const date = new Date(2026, 1, 19, 14, 0, 0)
    expect(formatTimeForInput(date)).toBe('14:00')
  })

  it('formats midnight as 00:00', () => {
    const date = new Date(2026, 1, 19, 0, 0, 0)
    expect(formatTimeForInput(date)).toBe('00:00')
  })

  it('formats noon as 12:00', () => {
    const date = new Date(2026, 1, 19, 12, 0, 0)
    expect(formatTimeForInput(date)).toBe('12:00')
  })

  it('pads single-digit hours with zero', () => {
    const date = new Date(2026, 1, 19, 7, 5, 0)
    expect(formatTimeForInput(date)).toBe('07:05')
  })

  it('pads single-digit minutes with zero', () => {
    const date = new Date(2026, 1, 19, 10, 5, 0)
    expect(formatTimeForInput(date)).toBe('10:05')
  })

  it('formats 23:59 correctly', () => {
    const date = new Date(2026, 1, 19, 23, 59, 0)
    expect(formatTimeForInput(date)).toBe('23:59')
  })
})

describe('parseDateInput', () => {
  it('parses valid YYYY-MM-DD string to Date at midnight', () => {
    const result = parseDateInput('2026-02-19')
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(2026)
    expect(result!.getMonth()).toBe(1) // February = 1
    expect(result!.getDate()).toBe(19)
    expect(result!.getHours()).toBe(0)
    expect(result!.getMinutes()).toBe(0)
    expect(result!.getSeconds()).toBe(0)
  })

  it('returns null for empty string', () => {
    expect(parseDateInput('')).toBeNull()
  })

  it('returns null for string with missing parts', () => {
    expect(parseDateInput('2026-02')).toBeNull()
  })

  it('returns null for string with only year', () => {
    expect(parseDateInput('2026')).toBeNull()
  })

  it('parses January 1 correctly', () => {
    const result = parseDateInput('2027-01-01')
    expect(result).not.toBeNull()
    expect(result!.getFullYear()).toBe(2027)
    expect(result!.getMonth()).toBe(0) // January
    expect(result!.getDate()).toBe(1)
  })

  it('parses December 31 correctly', () => {
    const result = parseDateInput('2026-12-31')
    expect(result).not.toBeNull()
    expect(result!.getMonth()).toBe(11) // December
    expect(result!.getDate()).toBe(31)
  })
})

describe('parseTimeInput', () => {
  it('parses HH:MM string and applies to current date by default', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 10, 0, 0))
    const result = parseTimeInput('14:30')
    expect(result).not.toBeNull()
    expect(result!.getHours()).toBe(14)
    expect(result!.getMinutes()).toBe(30)
    expect(result!.getSeconds()).toBe(0)
    expect(result!.getDate()).toBe(19)
  })

  it('applies time to provided base date', () => {
    const baseDate = new Date(2026, 5, 15, 0, 0, 0) // June 15
    const result = parseTimeInput('09:00', baseDate)
    expect(result).not.toBeNull()
    expect(result!.getMonth()).toBe(5) // June
    expect(result!.getDate()).toBe(15)
    expect(result!.getHours()).toBe(9)
    expect(result!.getMinutes()).toBe(0)
  })

  it('returns null for empty string', () => {
    expect(parseTimeInput('')).toBeNull()
  })

  it('parses midnight (00:00)', () => {
    const result = parseTimeInput('00:00', new Date(2026, 1, 19))
    expect(result).not.toBeNull()
    expect(result!.getHours()).toBe(0)
    expect(result!.getMinutes()).toBe(0)
  })

  it('parses 23:59', () => {
    const result = parseTimeInput('23:59', new Date(2026, 1, 19))
    expect(result).not.toBeNull()
    expect(result!.getHours()).toBe(23)
    expect(result!.getMinutes()).toBe(59)
  })

  it('does not mutate the base date', () => {
    const baseDate = new Date(2026, 1, 19, 10, 0, 0)
    const originalTime = baseDate.getTime()
    parseTimeInput('14:30', baseDate)
    expect(baseDate.getTime()).toBe(originalTime)
  })

  it('clears seconds and milliseconds', () => {
    const baseDate = new Date(2026, 1, 19, 10, 30, 45, 500)
    const result = parseTimeInput('14:00', baseDate)
    expect(result).not.toBeNull()
    expect(result!.getSeconds()).toBe(0)
    expect(result!.getMilliseconds()).toBe(0)
  })
})

describe('formatDateLabel', () => {
  it('returns "Today" for today\'s date', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0))
    const today = new Date(2026, 1, 19, 10, 0, 0)
    expect(formatDateLabel(today)).toBe('Today')
  })

  it('returns "Today" even if time differs', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 8, 0, 0))
    const laterToday = new Date(2026, 1, 19, 22, 30, 0)
    expect(formatDateLabel(laterToday)).toBe('Today')
  })

  it('returns "Tomorrow" for tomorrow\'s date', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0))
    const tomorrow = new Date(2026, 1, 20, 10, 0, 0)
    expect(formatDateLabel(tomorrow)).toBe('Tomorrow')
  })

  it('returns formatted date for day after tomorrow', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0))
    const dayAfterTomorrow = new Date(2026, 1, 21, 10, 0, 0) // Saturday Feb 21
    const result = formatDateLabel(dayAfterTomorrow)
    // Should be a short date like "Sat, Feb 21"
    expect(result).not.toBe('Today')
    expect(result).not.toBe('Tomorrow')
    expect(result).toContain('Sat')
    expect(result).toContain('Feb')
    expect(result).toContain('21')
  })

  it('returns formatted date for past dates', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0))
    const yesterday = new Date(2026, 1, 18, 10, 0, 0) // Wednesday Feb 18
    const result = formatDateLabel(yesterday)
    expect(result).not.toBe('Today')
    expect(result).not.toBe('Tomorrow')
    expect(result).toContain('Wed')
  })

  it('returns formatted date for dates far in the future', () => {
    vi.setSystemTime(new Date(2026, 1, 19, 14, 30, 0))
    const futureDate = new Date(2026, 5, 15) // June 15
    const result = formatDateLabel(futureDate)
    expect(result).toContain('Jun')
    expect(result).toContain('15')
  })
})

describe('formatTimeCompact', () => {
  it('formats on-the-hour afternoon time as "2p"', () => {
    const date = new Date(2026, 1, 19, 14, 0, 0)
    expect(formatTimeCompact(date)).toBe('2p')
  })

  it('formats on-the-hour morning time as "9a"', () => {
    const date = new Date(2026, 1, 19, 9, 0, 0)
    expect(formatTimeCompact(date)).toBe('9a')
  })

  it('formats time with minutes as "2:30p"', () => {
    const date = new Date(2026, 1, 19, 14, 30, 0)
    expect(formatTimeCompact(date)).toBe('2:30p')
  })

  it('formats time with single-digit minutes with padding as "9:05a"', () => {
    const date = new Date(2026, 1, 19, 9, 5, 0)
    expect(formatTimeCompact(date)).toBe('9:05a')
  })

  it('formats midnight as "12a"', () => {
    const date = new Date(2026, 1, 19, 0, 0, 0)
    expect(formatTimeCompact(date)).toBe('12a')
  })

  it('formats noon as "12p"', () => {
    const date = new Date(2026, 1, 19, 12, 0, 0)
    expect(formatTimeCompact(date)).toBe('12p')
  })

  it('formats 12:30am as "12:30a"', () => {
    const date = new Date(2026, 1, 19, 0, 30, 0)
    expect(formatTimeCompact(date)).toBe('12:30a')
  })

  it('formats 12:30pm as "12:30p"', () => {
    const date = new Date(2026, 1, 19, 12, 30, 0)
    expect(formatTimeCompact(date)).toBe('12:30p')
  })

  it('formats 11:59pm as "11:59p"', () => {
    const date = new Date(2026, 1, 19, 23, 59, 0)
    expect(formatTimeCompact(date)).toBe('11:59p')
  })

  it('formats 1am as "1a"', () => {
    const date = new Date(2026, 1, 19, 1, 0, 0)
    expect(formatTimeCompact(date)).toBe('1a')
  })

  it('formats 11am as "11a"', () => {
    const date = new Date(2026, 1, 19, 11, 0, 0)
    expect(formatTimeCompact(date)).toBe('11a')
  })

  it('formats 1pm as "1p"', () => {
    const date = new Date(2026, 1, 19, 13, 0, 0)
    expect(formatTimeCompact(date)).toBe('1p')
  })
})
