import { describe, it, expect } from 'vitest'
import { normalizeDayKey, withDayKeys } from './recurrenceDays'
import { matchesRecurrenceForDate } from './routineUtils'
import type { RecurrencePattern, Routine } from '@/types/actionable'

const TUE = new Date(2026, 8, 29), WED = new Date(2026, 8, 30)

describe('weekly routine days', () => {
  it('reads full names and odd casing as the app’s keys', () => {
    expect(['Tuesday', 'tues', 'TUE', 'thursday'].map(normalizeDayKey)).toEqual(['tue', 'tue', 'tue', 'thu'])
    expect([7, 'someday', null].map(normalizeDayKey)).toEqual([null, null, null])
  })

  it('a routine the assistant saved as "every tuesday" is due on Tuesdays (2026-09-29)', () => {
    const saved = { id: 'r', name: 'Girls on the Run Practice', time_of_day: '15:00:00', recurrence_pattern: { type: 'weekly', days: ['tuesday'] } } as unknown as Routine
    expect(matchesRecurrenceForDate(saved, TUE)).toBe(false) // the bug, as stored
    const read = withDayKeys(saved)
    expect(read.recurrence_pattern.days).toEqual(['tue'])
    expect(matchesRecurrenceForDate(read, TUE)).toBe(true)
    expect(matchesRecurrenceForDate(read, WED)).toBe(false)
  })

  it('dedupes mixed rows into week order and leaves good rows untouched', () => {
    expect(withDayKeys({ recurrence_pattern: { type: 'weekly', days: ['tuesday', 'tue', 'sunday'] } as RecurrencePattern }).recurrence_pattern.days).toEqual(['sun', 'tue'])
    const good = { recurrence_pattern: { type: 'weekly', days: ['mon', 'wed'] } as RecurrencePattern }
    expect(withDayKeys(good)).toBe(good)
    const daily = { recurrence_pattern: { type: 'daily' } as RecurrencePattern }
    expect(withDayKeys(daily)).toBe(daily)
  })
})
