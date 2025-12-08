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

  describe('interval-based daily patterns', () => {
    it('parses "every other day"', () => {
      const result = parseRoutine('take out trash every other day')
      expect(result.recurrence.type).toBe('daily')
      expect(result.recurrence.interval).toBe(2)
      expect(result.action).toBe('take out trash')
    })

    it('parses "alternate days"', () => {
      const result = parseRoutine('water plants alternate days')
      expect(result.recurrence.type).toBe('daily')
      expect(result.recurrence.interval).toBe(2)
      expect(result.action).toBe('water plants')
    })

    it('parses "alternate day" (singular)', () => {
      const result = parseRoutine('check mail alternate day')
      expect(result.recurrence.type).toBe('daily')
      expect(result.recurrence.interval).toBe(2)
    })
  })

  describe('biweekly patterns', () => {
    it('parses "biweekly"', () => {
      const result = parseRoutine('team meeting biweekly')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.action).toBe('team meeting')
    })

    it('parses "fortnightly"', () => {
      const result = parseRoutine('lunch with mom fortnightly')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.action).toBe('lunch with mom')
    })

    it('parses "every other week"', () => {
      const result = parseRoutine('every other week groceries')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.action).toBe('groceries')
    })

    it('parses "every two weeks"', () => {
      const result = parseRoutine('every two weeks laundry')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.action).toBe('laundry')
    })

    it('parses "every 2 weeks"', () => {
      const result = parseRoutine('every 2 weeks deep clean')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.action).toBe('deep clean')
    })
  })

  describe('biweekly with specific day patterns', () => {
    it('parses "every other Monday"', () => {
      const result = parseRoutine('every other Monday standup')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.recurrence.days).toEqual([1]) // Monday = 1
      expect(result.action).toBe('standup')
    })

    it('parses "every other Tuesday"', () => {
      const result = parseRoutine('every other Tuesday dentist')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.recurrence.days).toEqual([2]) // Tuesday = 2
      expect(result.action).toBe('dentist')
    })

    it('parses "every other Friday"', () => {
      const result = parseRoutine('every other Friday happy hour')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.recurrence.days).toEqual([5]) // Friday = 5
      expect(result.action).toBe('happy hour')
    })

    it('parses abbreviated day names', () => {
      const result = parseRoutine('every other Wed team lunch')
      expect(result.recurrence.type).toBe('biweekly')
      expect(result.recurrence.days).toEqual([3]) // Wednesday = 3
    })
  })

  describe('monthly patterns', () => {
    it('parses "monthly"', () => {
      const result = parseRoutine('pay rent monthly')
      expect(result.recurrence.type).toBe('monthly')
      expect(result.action).toBe('pay rent')
    })

    it('parses "every month"', () => {
      const result = parseRoutine('every month review budget')
      expect(result.recurrence.type).toBe('monthly')
      expect(result.action).toBe('review budget')
    })
  })

  describe('quarterly patterns', () => {
    it('parses "quarterly"', () => {
      const result = parseRoutine('quarterly review')
      expect(result.recurrence.type).toBe('quarterly')
      expect(result.action).toBe('review')
    })

    it('parses "every quarter"', () => {
      const result = parseRoutine('every quarter taxes')
      expect(result.recurrence.type).toBe('quarterly')
      expect(result.action).toBe('taxes')
    })

    it('parses "every 3 months"', () => {
      const result = parseRoutine('every 3 months oil change')
      expect(result.recurrence.type).toBe('quarterly')
      expect(result.action).toBe('oil change')
    })

    it('parses "every three months"', () => {
      const result = parseRoutine('every three months checkup')
      expect(result.recurrence.type).toBe('quarterly')
      expect(result.action).toBe('checkup')
    })
  })

  describe('yearly patterns', () => {
    it('parses "annually"', () => {
      const result = parseRoutine('review goals annually')
      expect(result.recurrence.type).toBe('yearly')
      expect(result.action).toBe('review goals')
    })

    it('parses "every year"', () => {
      const result = parseRoutine('every year birthday reminder')
      expect(result.recurrence.type).toBe('yearly')
      expect(result.action).toBe('birthday reminder')
    })

    it('parses "yearly"', () => {
      const result = parseRoutine('yearly physical')
      expect(result.recurrence.type).toBe('yearly')
      expect(result.action).toBe('physical')
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

  describe('interval-based patterns', () => {
    it('converts every other day to daily with interval 2', () => {
      const parsed = parseRoutine('task every other day')
      const db = parsedRoutineToDb(parsed)

      expect(db.recurrence_pattern.type).toBe('daily')
      expect(db.recurrence_pattern.interval).toBe(2)
      expect(db.recurrence_pattern.start_date).toBeDefined()
    })

    it('converts regular daily without interval', () => {
      const parsed = parseRoutine('task daily')
      const db = parsedRoutineToDb(parsed)

      expect(db.recurrence_pattern.type).toBe('daily')
      expect(db.recurrence_pattern.interval).toBeUndefined()
    })

    it('converts biweekly to weekly with interval 2', () => {
      const parsed = parseRoutine('task biweekly')
      const db = parsedRoutineToDb(parsed)

      expect(db.recurrence_pattern.type).toBe('weekly')
      expect(db.recurrence_pattern.interval).toBe(2)
      expect(db.recurrence_pattern.start_date).toBeDefined()
    })

    it('converts every other Monday to weekly with interval and day', () => {
      const parsed = parseRoutine('task every other Monday')
      const db = parsedRoutineToDb(parsed)

      expect(db.recurrence_pattern.type).toBe('weekly')
      expect(db.recurrence_pattern.interval).toBe(2)
      expect(db.recurrence_pattern.days).toEqual(['mon'])
      expect(db.recurrence_pattern.start_date).toBeDefined()
    })
  })

  describe('long-term patterns', () => {
    it('converts monthly pattern', () => {
      const parsed = parseRoutine('task monthly')
      const db = parsedRoutineToDb(parsed)

      expect(db.recurrence_pattern.type).toBe('monthly')
    })

    it('converts quarterly pattern', () => {
      const parsed = parseRoutine('task quarterly')
      const db = parsedRoutineToDb(parsed)

      expect(db.recurrence_pattern.type).toBe('quarterly')
    })

    it('converts yearly pattern', () => {
      const parsed = parseRoutine('task yearly')
      const db = parsedRoutineToDb(parsed)

      expect(db.recurrence_pattern.type).toBe('yearly')
    })
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

// =============================================================================
// NEW FLEXIBLE PARSING TESTS
// =============================================================================

describe('flexible time parsing', () => {
  it('parses "700p" as 7:00 PM', () => {
    const result = parseRoutine('gym 700p')
    expect(result.time).toBe('19:00')
  })

  it('parses "700pm" as 7:00 PM', () => {
    const result = parseRoutine('gym 700pm')
    expect(result.time).toBe('19:00')
  })

  it('parses "7p" as 7:00 PM', () => {
    const result = parseRoutine('gym 7p')
    expect(result.time).toBe('19:00')
  })

  it('parses "1130a" as 11:30 AM', () => {
    const result = parseRoutine('meeting 1130a')
    expect(result.time).toBe('11:30')
  })

  it('parses "1130am" as 11:30 AM', () => {
    const result = parseRoutine('meeting 1130am')
    expect(result.time).toBe('11:30')
  })

  it('parses military time "1930"', () => {
    const result = parseRoutine('dinner 1930')
    expect(result.time).toBe('19:30')
  })

  it('parses military time "0700"', () => {
    const result = parseRoutine('wake up 0700')
    expect(result.time).toBe('07:00')
  })

  it('parses time without "at" keyword', () => {
    const result = parseRoutine('7pm gym')
    expect(result.time).toBe('19:00')
    expect(result.action).toBe('gym')
  })

  it('parses "12p" as noon', () => {
    const result = parseRoutine('lunch 12p')
    expect(result.time).toBe('12:00')
  })

  it('parses "12a" as midnight', () => {
    const result = parseRoutine('reset 12a')
    expect(result.time).toBe('00:00')
  })

  it('parses "7a" as 7:00 AM', () => {
    const result = parseRoutine('task 7a')
    expect(result.time).toBe('07:00')
  })
})

describe('days without "every" prefix', () => {
  it('parses "monday gym"', () => {
    const result = parseRoutine('monday gym')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "gym monday"', () => {
    const result = parseRoutine('gym monday')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "monday wednesday gym"', () => {
    const result = parseRoutine('monday wednesday gym')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
    expect(result.action).toBe('gym')
  })

  it('parses "gym monday wednesday"', () => {
    const result = parseRoutine('gym monday wednesday')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
    expect(result.action).toBe('gym')
  })

  it('parses "gym monday and wednesday at 6pm"', () => {
    const result = parseRoutine('gym monday and wednesday at 6pm')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
    expect(result.time).toBe('18:00')
    expect(result.action).toBe('gym')
  })

  it('parses pluralized days "tuesdays"', () => {
    const result = parseRoutine('trash tuesdays')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([2])
    expect(result.action).toBe('trash')
  })

  it('parses "mondays and wednesdays"', () => {
    const result = parseRoutine('gym mondays and wednesdays')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
  })
})

describe('"on [days]" pattern', () => {
  it('parses "gym on monday"', () => {
    const result = parseRoutine('gym on monday')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "on tuesdays take out trash"', () => {
    const result = parseRoutine('on tuesdays take out trash')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([2])
    expect(result.action).toBe('take out trash')
  })

  it('parses "meeting on monday and friday"', () => {
    const result = parseRoutine('meeting on monday and friday')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 5])
  })
})

describe('no recurrence defaults to daily', () => {
  it('parses "take vitamins" as daily', () => {
    const result = parseRoutine('take vitamins')
    expect(result.recurrence.type).toBe('daily')
    expect(result.action).toBe('take vitamins')
    expect(isValidParsedRoutine(result)).toBe(true)
  })

  it('parses "walk the dog" as daily', () => {
    const result = parseRoutine('walk the dog')
    expect(result.recurrence.type).toBe('daily')
    expect(result.action).toBe('walk the dog')
    expect(isValidParsedRoutine(result)).toBe(true)
  })

  it('parses "take vitamins at 7am" as daily at 7am', () => {
    const result = parseRoutine('take vitamins at 7am')
    expect(result.recurrence.type).toBe('daily')
    expect(result.time).toBe('07:00')
    expect(result.action).toBe('take vitamins')
  })
})

describe('flexible word order', () => {
  it('parses "7pm gym monday"', () => {
    const result = parseRoutine('7pm gym monday')
    expect(result.time).toBe('19:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "monday 7pm gym"', () => {
    const result = parseRoutine('monday 7pm gym')
    expect(result.time).toBe('19:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "700p monday wednesday gym"', () => {
    const result = parseRoutine('700p monday wednesday gym')
    expect(result.time).toBe('19:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
    expect(result.action).toBe('gym')
  })
})

describe('complex real-world inputs', () => {
  it('parses "iris walks jax 7a weekdays"', () => {
    const result = parseRoutine('iris walks jax 7a weekdays', mockContacts)
    expect(result.assignee).toBe('iris-id')
    expect(result.time).toBe('07:00')
    expect(result.recurrence.type).toBe('weekdays')
    expect(result.action).toBe('walks jax')
  })

  it('parses "trash tuesday thursday 7p"', () => {
    const result = parseRoutine('trash tuesday thursday 7p')
    expect(result.time).toBe('19:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([2, 4])
    expect(result.action).toBe('trash')
  })

  it('parses "family dinner sundays 6pm"', () => {
    const result = parseRoutine('family dinner sundays 6pm')
    expect(result.time).toBe('18:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([0])
    expect(result.action).toBe('family dinner')
  })
})
