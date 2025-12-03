import { describe, it, expect } from 'vitest'
import { parseRoutine, parsedRoutineToDb, isValidParsedRoutine } from './parseRoutine'
import type { Contact } from '@/types/contact'

const mockContacts: Contact[] = [
  { id: 'iris-id', name: 'Iris', createdAt: new Date(), updatedAt: new Date() },
  { id: 'scott-id', name: 'Scott', createdAt: new Date(), updatedAt: new Date() },
  { id: 'john-smith-id', name: 'John Smith', createdAt: new Date(), updatedAt: new Date() },
]

describe('parseRoutine', () => {
  describe('basic parsing', () => {
    it('parses simple daily routine', () => {
      const result = parseRoutine('take vitamins every morning')
      expect(result.action).toBe('take vitamins')
      expect(result.recurrence.type).toBe('daily')
      expect(result.timeOfDay).toBe('morning')
      expect(result.assignee).toBeNull()
      expect(result.time).toBeNull()
    })

    it('parses routine with assignee', () => {
      const result = parseRoutine('iris walks jax every weekday at 7am', mockContacts)
      expect(result.assignee).toBe('iris-id')
      expect(result.assigneeName).toBe('Iris')
      expect(result.action).toBe('walks jax')
      expect(result.recurrence.type).toBe('weekdays')
      expect(result.time).toBe('07:00')
    })

    it('parses weekly routine with specific day', () => {
      const result = parseRoutine('family dinner every sunday at 6pm')
      expect(result.action).toBe('family dinner')
      expect(result.recurrence.type).toBe('weekly')
      expect(result.recurrence.days).toEqual([0]) // Sunday
      expect(result.time).toBe('18:00')
    })

    it('parses routine with complex time', () => {
      const result = parseRoutine('scott takes kids to school mon-fri at 7:19am', mockContacts)
      expect(result.assignee).toBe('scott-id')
      expect(result.action).toBe('takes kids to school')
      expect(result.recurrence.type).toBe('weekdays')
      expect(result.time).toBe('07:19')
    })

    it('parses weekly routine', () => {
      const result = parseRoutine('review goals every monday at 9')
      expect(result.action).toBe('review goals')
      expect(result.recurrence.type).toBe('weekly')
      expect(result.recurrence.days).toEqual([1]) // Monday
      expect(result.time).toBe('09:00')
    })
  })

  describe('time parsing', () => {
    it('parses "at 7"', () => {
      const result = parseRoutine('wake up at 7')
      expect(result.time).toBe('07:00')
    })

    it('parses "at 7am"', () => {
      const result = parseRoutine('wake up at 7am')
      expect(result.time).toBe('07:00')
    })

    it('parses "at 7 am"', () => {
      const result = parseRoutine('wake up at 7 am')
      expect(result.time).toBe('07:00')
    })

    it('parses "at 7pm"', () => {
      const result = parseRoutine('dinner at 7pm')
      expect(result.time).toBe('19:00')
    })

    it('parses "at 7:30pm"', () => {
      const result = parseRoutine('meeting at 7:30pm')
      expect(result.time).toBe('19:30')
    })

    it('parses "at noon"', () => {
      const result = parseRoutine('lunch at noon')
      expect(result.time).toBe('12:00')
    })

    it('parses "at midnight"', () => {
      const result = parseRoutine('reset at midnight')
      expect(result.time).toBe('00:00')
    })

    it('parses "at 12pm" as noon', () => {
      const result = parseRoutine('lunch at 12pm')
      expect(result.time).toBe('12:00')
    })

    it('parses "at 12am" as midnight', () => {
      const result = parseRoutine('reset at 12am')
      expect(result.time).toBe('00:00')
    })
  })

  describe('recurrence patterns', () => {
    it('parses "every day"', () => {
      const result = parseRoutine('exercise every day')
      expect(result.recurrence.type).toBe('daily')
    })

    it('parses "daily"', () => {
      const result = parseRoutine('take vitamins daily')
      expect(result.recurrence.type).toBe('daily')
    })

    it('parses "every weekday"', () => {
      const result = parseRoutine('commute every weekday')
      expect(result.recurrence.type).toBe('weekdays')
    })

    it('parses "weekdays"', () => {
      const result = parseRoutine('work weekdays')
      expect(result.recurrence.type).toBe('weekdays')
    })

    it('parses "mon-fri"', () => {
      const result = parseRoutine('work mon-fri')
      expect(result.recurrence.type).toBe('weekdays')
    })

    it('parses "monday through friday"', () => {
      const result = parseRoutine('work monday through friday')
      expect(result.recurrence.type).toBe('weekdays')
    })

    it('parses "every weekend"', () => {
      const result = parseRoutine('relax every weekend')
      expect(result.recurrence.type).toBe('weekends')
    })

    it('parses "weekends"', () => {
      const result = parseRoutine('sleep in weekends')
      expect(result.recurrence.type).toBe('weekends')
    })

    it('parses "saturday and sunday"', () => {
      const result = parseRoutine('rest saturday and sunday')
      expect(result.recurrence.type).toBe('weekends')
    })

    it('parses "every monday"', () => {
      const result = parseRoutine('meeting every monday')
      expect(result.recurrence.type).toBe('weekly')
      expect(result.recurrence.days).toEqual([1])
    })

    it('parses "every monday and wednesday"', () => {
      const result = parseRoutine('gym every monday and wednesday')
      expect(result.recurrence.type).toBe('weekly')
      expect(result.recurrence.days).toEqual([1, 3])
    })

    it('parses "every tuesday, thursday"', () => {
      const result = parseRoutine('yoga every tuesday, thursday')
      expect(result.recurrence.type).toBe('weekly')
      expect(result.recurrence.days).toEqual([2, 4])
    })
  })

  describe('time of day', () => {
    it('extracts morning', () => {
      const result = parseRoutine('exercise morning')
      expect(result.timeOfDay).toBe('morning')
    })

    it('extracts afternoon', () => {
      const result = parseRoutine('nap afternoon')
      expect(result.timeOfDay).toBe('afternoon')
    })

    it('extracts evening', () => {
      const result = parseRoutine('read evening')
      expect(result.timeOfDay).toBe('evening')
    })
  })

  describe('assignee matching', () => {
    it('matches contact at start of string', () => {
      const result = parseRoutine('iris feeds the cat', mockContacts)
      expect(result.assignee).toBe('iris-id')
      expect(result.assigneeName).toBe('Iris')
      expect(result.action).toBe('feeds the cat')
    })

    it('matches multi-word contact name', () => {
      const result = parseRoutine('john smith calls mom every sunday', mockContacts)
      expect(result.assignee).toBe('john-smith-id')
      expect(result.assigneeName).toBe('John Smith')
      expect(result.action).toBe('calls mom')
    })

    it('does not match contact in middle of string', () => {
      const result = parseRoutine('call iris every day', mockContacts)
      expect(result.assignee).toBeNull()
      expect(result.action).toBe('call iris')
    })

    it('is case insensitive', () => {
      const result = parseRoutine('IRIS walks jax', mockContacts)
      expect(result.assignee).toBe('iris-id')
    })
  })

  describe('tokens', () => {
    it('generates correct tokens for complex routine', () => {
      const result = parseRoutine('iris walks jax every weekday morning at 7am', mockContacts)

      const tokenTypes = result.tokens.map(t => t.type)
      expect(tokenTypes).toContain('person')
      expect(tokenTypes).toContain('action')
      expect(tokenTypes).toContain('day-pattern')
      expect(tokenTypes).toContain('time-of-day')
      expect(tokenTypes).toContain('time')
    })

    it('includes person token with uppercase name', () => {
      const result = parseRoutine('iris does something', mockContacts)
      const personToken = result.tokens.find(t => t.type === 'person')
      expect(personToken?.text).toBe('IRIS')
    })

    it('includes day-pattern token', () => {
      const result = parseRoutine('task every weekday')
      const dayToken = result.tokens.find(t => t.type === 'day-pattern')
      expect(dayToken?.text).toBe('WEEKDAYS')
    })

    it('includes time token with compact format', () => {
      const result = parseRoutine('task at 7am')
      const timeToken = result.tokens.find(t => t.type === 'time')
      expect(timeToken?.text).toBe('7a')
    })
  })
})

describe('parsedRoutineToDb', () => {
  it('converts daily routine', () => {
    const parsed = parseRoutine('take vitamins daily')
    const db = parsedRoutineToDb(parsed)
    expect(db.name).toBe('take vitamins')
    expect(db.recurrence_pattern.type).toBe('daily')
  })

  it('converts weekday routine', () => {
    const parsed = parseRoutine('work every weekday')
    const db = parsedRoutineToDb(parsed)
    expect(db.recurrence_pattern.type).toBe('weekly')
    expect(db.recurrence_pattern.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
  })

  it('converts weekend routine', () => {
    const parsed = parseRoutine('relax weekends')
    const db = parsedRoutineToDb(parsed)
    expect(db.recurrence_pattern.type).toBe('weekly')
    expect(db.recurrence_pattern.days).toEqual(['sat', 'sun'])
  })

  it('converts weekly routine with specific days', () => {
    const parsed = parseRoutine('gym every monday and wednesday')
    const db = parsedRoutineToDb(parsed)
    expect(db.recurrence_pattern.type).toBe('weekly')
    expect(db.recurrence_pattern.days).toEqual(['mon', 'wed'])
  })

  it('includes time_of_day', () => {
    const parsed = parseRoutine('task at 7am')
    const db = parsedRoutineToDb(parsed)
    expect(db.time_of_day).toBe('07:00')
  })

  it('includes assignee', () => {
    const parsed = parseRoutine('iris does task', mockContacts)
    const db = parsedRoutineToDb(parsed)
    expect(db.default_assignee).toBe('iris-id')
  })

  it('includes raw_input', () => {
    const parsed = parseRoutine('take vitamins daily')
    const db = parsedRoutineToDb(parsed)
    expect(db.raw_input).toBe('take vitamins daily')
  })
})

describe('isValidParsedRoutine', () => {
  it('returns true for routine with action', () => {
    const parsed = parseRoutine('take vitamins')
    expect(isValidParsedRoutine(parsed)).toBe(true)
  })

  it('returns false for empty string', () => {
    const parsed = parseRoutine('')
    expect(isValidParsedRoutine(parsed)).toBe(false)
  })

  it('returns false for only patterns', () => {
    const parsed = parseRoutine('every day at 7am')
    // This should still have action as empty
    expect(isValidParsedRoutine(parsed)).toBe(false)
  })
})
