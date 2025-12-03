import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseNaturalDate, formatDatePreview } from './parseNaturalDate'

describe('parseNaturalDate', () => {
  // Fix the current time for consistent tests
  beforeEach(() => {
    // Wednesday, Jan 15, 2025 at 10:00 AM
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('today/tomorrow/yesterday', () => {
    it('parses "today"', () => {
      const result = parseNaturalDate('Call mom today')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Call mom')
      expect(result!.scheduledFor.getDate()).toBe(15)
    })

    it('parses "tomorrow"', () => {
      const result = parseNaturalDate('Meeting tomorrow')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Meeting')
      expect(result!.scheduledFor.getDate()).toBe(16)
    })

    it('parses "yesterday"', () => {
      const result = parseNaturalDate('Called doctor yesterday')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Called doctor')
      expect(result!.scheduledFor.getDate()).toBe(14)
    })
  })

  describe('time parsing', () => {
    it('parses "3pm" as today if time not passed', () => {
      const result = parseNaturalDate('Meeting at 3pm')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Meeting')
      expect(result!.scheduledFor.getHours()).toBe(15)
      expect(result!.scheduledFor.getDate()).toBe(15)
    })

    it('parses "9am" as tomorrow if time has passed', () => {
      const result = parseNaturalDate('Standup 9am')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Standup')
      expect(result!.scheduledFor.getHours()).toBe(9)
      expect(result!.scheduledFor.getDate()).toBe(16) // Tomorrow since 9am < 10am now
    })

    it('parses "3:30pm"', () => {
      const result = parseNaturalDate('Call at 3:30pm')
      expect(result).not.toBeNull()
      expect(result!.scheduledFor.getHours()).toBe(15)
      expect(result!.scheduledFor.getMinutes()).toBe(30)
    })

    it('parses "tomorrow 3pm"', () => {
      const result = parseNaturalDate('Dentist tomorrow 3pm')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Dentist')
      expect(result!.scheduledFor.getDate()).toBe(16)
      expect(result!.scheduledFor.getHours()).toBe(15)
    })
  })

  describe('day of week', () => {
    it('parses "Monday" (next occurrence)', () => {
      // Jan 15 is Wednesday, so Monday is Jan 20
      const result = parseNaturalDate('Report Monday')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Report')
      expect(result!.scheduledFor.getDay()).toBe(1) // Monday
      expect(result!.scheduledFor.getDate()).toBe(20)
    })

    it('parses "next Monday"', () => {
      const result = parseNaturalDate('Planning next Monday')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Planning')
      expect(result!.scheduledFor.getDay()).toBe(1)
    })

    it('parses "Friday 2pm"', () => {
      const result = parseNaturalDate('Happy hour Friday 2pm')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Happy hour')
      expect(result!.scheduledFor.getDay()).toBe(5) // Friday
      expect(result!.scheduledFor.getHours()).toBe(14)
    })

    it('parses short day names like "mon"', () => {
      const result = parseNaturalDate('Gym mon')
      expect(result).not.toBeNull()
      expect(result!.scheduledFor.getDay()).toBe(1)
    })
  })

  describe('relative dates', () => {
    it('parses "in 2 days"', () => {
      const result = parseNaturalDate('Follow up in 2 days')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Follow up')
      expect(result!.scheduledFor.getDate()).toBe(17)
    })

    it('parses "in 1 week"', () => {
      const result = parseNaturalDate('Review in 1 week')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Review')
      expect(result!.scheduledFor.getDate()).toBe(22)
    })

    it('parses "next week"', () => {
      const result = parseNaturalDate('Sprint planning next week')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Sprint planning')
      expect(result!.scheduledFor.getDate()).toBe(22)
    })
  })

  describe('no date found', () => {
    it('returns null for plain tasks', () => {
      const result = parseNaturalDate('Buy groceries')
      expect(result).toBeNull()
    })

    it('returns null for empty input', () => {
      const result = parseNaturalDate('')
      expect(result).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('preserves title when date is the only content', () => {
      const result = parseNaturalDate('tomorrow')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('tomorrow') // Falls back to original
    })

    it('handles multiple spaces', () => {
      const result = parseNaturalDate('Call   mom   tomorrow')
      expect(result).not.toBeNull()
      expect(result!.cleanedTitle).toBe('Call mom')
    })
  })
})

describe('formatDatePreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats today', () => {
    const date = new Date(2025, 0, 15, 15, 0)
    expect(formatDatePreview(date)).toMatch(/Today 3\s?pm/i)
  })

  it('formats tomorrow', () => {
    const date = new Date(2025, 0, 16, 9, 30)
    expect(formatDatePreview(date)).toMatch(/Tomorrow 9:30\s?am/i)
  })

  it('formats day of week for near future', () => {
    const date = new Date(2025, 0, 17, 14, 0) // Friday
    expect(formatDatePreview(date)).toMatch(/Friday 2\s?pm/i)
  })

  it('formats with month/day for far future', () => {
    const date = new Date(2025, 1, 1, 10, 0)
    expect(formatDatePreview(date)).toMatch(/Feb 1 10\s?am/i)
  })
})
