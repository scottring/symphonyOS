import { describe, it, expect } from 'vitest'
import { formatLegacyRoutine } from './routineFormatters'

describe('formatLegacyRoutine', () => {
  describe('daily recurrence', () => {
    it('formats daily routine without time', () => {
      const result = formatLegacyRoutine('Morning Exercise', 'daily')
      expect(result).toBe('Morning Exercise every day')
    })

    it('formats daily routine with time', () => {
      const result = formatLegacyRoutine('Morning Exercise', 'daily', undefined, '08:00')
      expect(result).toBe('Morning Exercise every day at 8am')
    })

    it('formats daily routine with afternoon time', () => {
      const result = formatLegacyRoutine('Afternoon Walk', 'daily', undefined, '14:30')
      expect(result).toBe('Afternoon Walk every day at 2:30pm')
    })

    it('formats daily routine with noon time', () => {
      const result = formatLegacyRoutine('Lunch Break', 'daily', undefined, '12:00')
      expect(result).toBe('Lunch Break every day at 12pm')
    })

    it('formats daily routine with midnight time', () => {
      const result = formatLegacyRoutine('Midnight Routine', 'daily', undefined, '00:00')
      expect(result).toBe('Midnight Routine every day at 12am')
    })
  })

  describe('weekly recurrence', () => {
    it('formats weekly routine without specific days', () => {
      const result = formatLegacyRoutine('Weekly Review', 'weekly')
      expect(result).toBe('Weekly Review weekly')
    })

    it('formats weekly routine with empty days array', () => {
      const result = formatLegacyRoutine('Weekly Review', 'weekly', [])
      expect(result).toBe('Weekly Review weekly')
    })

    it('formats weekday routine (Mon-Fri)', () => {
      const result = formatLegacyRoutine('Weekday Standup', 'weekly', ['mon', 'tue', 'wed', 'thu', 'fri'])
      expect(result).toBe('Weekday Standup weekdays')
    })

    it('formats weekend routine (Sat-Sun)', () => {
      const result = formatLegacyRoutine('Weekend Walk', 'weekly', ['sat', 'sun'])
      expect(result).toBe('Weekend Walk weekends')
    })

    it('formats routine with specific single day', () => {
      const result = formatLegacyRoutine('Monday Meeting', 'weekly', ['mon'])
      expect(result).toBe('Monday Meeting every Mon')
    })

    it('formats routine with multiple specific days', () => {
      const result = formatLegacyRoutine('MWF Workout', 'weekly', ['mon', 'wed', 'fri'])
      expect(result).toBe('MWF Workout every Mon, Wed, Fri')
    })

    it('formats routine with all days', () => {
      const result = formatLegacyRoutine('Every Day Task', 'weekly', ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
      expect(result).toBe('Every Day Task every Sun, Mon, Tue, Wed, Thu, Fri, Sat')
    })

    it('formats weekly routine with time', () => {
      const result = formatLegacyRoutine('Monday Standup', 'weekly', ['mon'], '09:00')
      expect(result).toBe('Monday Standup every Mon at 9am')
    })

    it('handles unknown day abbreviations', () => {
      const result = formatLegacyRoutine('Test', 'weekly', ['xyz'])
      expect(result).toBe('Test every xyz')
    })
  })

  describe('monthly recurrence', () => {
    it('formats monthly routine without time', () => {
      const result = formatLegacyRoutine('Monthly Review', 'monthly')
      expect(result).toBe('Monthly Review monthly')
    })

    it('formats monthly routine with time', () => {
      const result = formatLegacyRoutine('Monthly Review', 'monthly', undefined, '10:00')
      expect(result).toBe('Monthly Review monthly at 10am')
    })
  })

  describe('unknown recurrence type', () => {
    it('handles unknown recurrence type', () => {
      const result = formatLegacyRoutine('Unknown Routine', 'unknown')
      expect(result).toBe('Unknown Routine')
    })

    it('handles unknown recurrence type with time', () => {
      const result = formatLegacyRoutine('Unknown Routine', 'unknown', undefined, '08:00')
      expect(result).toBe('Unknown Routine at 8am')
    })
  })

  describe('time formatting', () => {
    it('formats time on the hour without minutes', () => {
      const result = formatLegacyRoutine('Test', 'daily', undefined, '09:00')
      expect(result).toBe('Test every day at 9am')
    })

    it('formats time with minutes', () => {
      const result = formatLegacyRoutine('Test', 'daily', undefined, '09:30')
      expect(result).toBe('Test every day at 9:30am')
    })

    it('formats evening time correctly', () => {
      const result = formatLegacyRoutine('Test', 'daily', undefined, '20:45')
      expect(result).toBe('Test every day at 8:45pm')
    })

    it('handles null time', () => {
      const result = formatLegacyRoutine('Test', 'daily', undefined, null)
      expect(result).toBe('Test every day')
    })
  })

  describe('edge cases', () => {
    it('handles routine name only', () => {
      const result = formatLegacyRoutine('Simple Routine', '')
      expect(result).toBe('Simple Routine')
    })

    it('handles empty routine name', () => {
      const result = formatLegacyRoutine('', 'daily')
      expect(result).toBe('every day')
    })
  })
})
