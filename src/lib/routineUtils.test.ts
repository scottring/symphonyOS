import { describe, it, expect } from 'vitest'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import { matchesRecurrenceForDate, getRoutinesForDatePure, isEverydayRoutine, weekdayKeyForDate, scheduleRoutineOnDate } from './routineUtils'

function makeRoutine(pattern: RecurrencePattern, overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    user_id: 'u1',
    name: 'Test',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    visibility: 'active',
    paused_until: null,
    recurrence_pattern: pattern,
    time_of_day: null,
    raw_input: null,
    show_on_timeline: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('matchesRecurrenceForDate — since_last', () => {
  const today = new Date(2026, 4, 17) // 2026-05-17 local

  it('surfaces immediately when never completed', () => {
    const routine = makeRoutine({ type: 'since_last', interval: 6, unit: 'weeks' })
    expect(matchesRecurrenceForDate(routine, today, null)).toBe(true)
  })

  it('hides while still within the interval (weeks)', () => {
    const routine = makeRoutine({ type: 'since_last', interval: 6, unit: 'weeks' })
    const lastCompleted = new Date(2026, 4, 10) // 7 days ago
    expect(matchesRecurrenceForDate(routine, today, lastCompleted)).toBe(false)
  })

  it('surfaces once the interval has elapsed (weeks)', () => {
    const routine = makeRoutine({ type: 'since_last', interval: 6, unit: 'weeks' })
    const lastCompleted = new Date(2026, 2, 1) // ~11 weeks ago
    expect(matchesRecurrenceForDate(routine, today, lastCompleted)).toBe(true)
  })

  it('surfaces exactly on the due date boundary', () => {
    const routine = makeRoutine({ type: 'since_last', interval: 7, unit: 'days' })
    const lastCompleted = new Date(2026, 4, 10) // exactly 7 days ago
    expect(matchesRecurrenceForDate(routine, today, lastCompleted)).toBe(true)
  })

  it('keeps surfacing every day after the due date (until completed)', () => {
    const routine = makeRoutine({ type: 'since_last', interval: 6, unit: 'weeks' })
    const lastCompleted = new Date(2025, 11, 1) // way over 6 weeks
    // matches today
    expect(matchesRecurrenceForDate(routine, today, lastCompleted)).toBe(true)
    // and tomorrow
    const tomorrow = new Date(2026, 4, 18)
    expect(matchesRecurrenceForDate(routine, tomorrow, lastCompleted)).toBe(true)
  })

  it('handles months unit via calendar math (not naive 30-day)', () => {
    const routine = makeRoutine({ type: 'since_last', interval: 6, unit: 'months' })
    // Completed on 2025-11-17, due date = 2026-05-17 (calendar +6 months)
    const lastCompleted = new Date(2025, 10, 17)
    expect(matchesRecurrenceForDate(routine, today, lastCompleted)).toBe(true)
    // One day before the calendar boundary → still hidden
    const dayBefore = new Date(2026, 4, 16)
    expect(matchesRecurrenceForDate(routine, dayBefore, lastCompleted)).toBe(false)
  })

  it('defaults to interval=1, unit=weeks when fields missing', () => {
    const routine = makeRoutine({ type: 'since_last' })
    const lastCompleted = new Date(2026, 4, 9) // 8 days ago
    expect(matchesRecurrenceForDate(routine, today, lastCompleted)).toBe(true)
    const lastWeek = new Date(2026, 4, 13) // 4 days ago → still hidden
    expect(matchesRecurrenceForDate(routine, today, lastWeek)).toBe(false)
  })
})

describe('getRoutinesForDatePure with since_last', () => {
  it('uses the completion map per routine', () => {
    const haircut = makeRoutine({ type: 'since_last', interval: 6, unit: 'weeks' }, { id: 'haircut' })
    const plants = makeRoutine({ type: 'since_last', interval: 1, unit: 'weeks' }, { id: 'plants' })
    const daily = makeRoutine({ type: 'daily' }, { id: 'brush' })
    const today = new Date(2026, 4, 17)

    const completions = new Map<string, Date>([
      ['haircut', new Date(2026, 4, 10)], // 1 week ago — still hidden
      ['plants', new Date(2026, 4, 8)], // 9 days ago — surfaces
    ])

    const result = getRoutinesForDatePure([haircut, plants, daily], today, completions)
    const ids = result.map(r => r.id).sort()
    expect(ids).toEqual(['brush', 'plants'])
  })

  it('falls back to "always due" when no completion map supplied', () => {
    const haircut = makeRoutine({ type: 'since_last', interval: 6, unit: 'weeks' }, { id: 'haircut' })
    const today = new Date(2026, 4, 17)
    const result = getRoutinesForDatePure([haircut], today)
    expect(result.map(r => r.id)).toEqual(['haircut'])
  })
})

describe('isEverydayRoutine', () => {
  it('treats a plain daily routine as everyday', () => {
    expect(isEverydayRoutine({ type: 'daily' })).toBe(true)
  })

  it('treats a weekly routine covering all five weekdays as everyday', () => {
    expect(isEverydayRoutine({ type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })).toBe(true)
  })

  it('treats a weekly routine covering all seven days as everyday', () => {
    expect(
      isEverydayRoutine({ type: 'weekly', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }),
    ).toBe(true)
  })

  it('is case-insensitive on day strings', () => {
    expect(isEverydayRoutine({ type: 'weekly', days: ['MON', 'Tue', 'wed', 'THU', 'Fri'] })).toBe(true)
  })

  it('does NOT treat an occasional weekly routine (e.g. soccer Tue/Thu) as everyday', () => {
    expect(isEverydayRoutine({ type: 'weekly', days: ['tue', 'thu'] })).toBe(false)
  })

  it('does NOT treat a weekday-missing weekly routine as everyday', () => {
    // Mon–Thu only — missing Fri, so not "every weekday"
    expect(isEverydayRoutine({ type: 'weekly', days: ['mon', 'tue', 'wed', 'thu'] })).toBe(false)
  })

  it('returns false for monthly / specific_days / since_last patterns', () => {
    expect(isEverydayRoutine({ type: 'monthly', day_of_month: 1 })).toBe(false)
    expect(isEverydayRoutine({ type: 'specific_days', dates: ['2026-07-04'] })).toBe(false)
    expect(isEverydayRoutine({ type: 'since_last', interval: 6, unit: 'weeks' })).toBe(false)
  })

  it('returns false for missing / undefined pattern', () => {
    expect(isEverydayRoutine(undefined)).toBe(false)
    expect(isEverydayRoutine(null)).toBe(false)
  })

  it('returns false for a weekly routine with no days array', () => {
    expect(isEverydayRoutine({ type: 'weekly' })).toBe(false)
  })
})

describe('weekdayKeyForDate', () => {
  it('maps each weekday to its recurrence key', () => {
    // 2026-05-17 is a Sunday
    expect(weekdayKeyForDate(new Date(2026, 4, 17))).toBe('sun')
    expect(weekdayKeyForDate(new Date(2026, 4, 18))).toBe('mon')
    expect(weekdayKeyForDate(new Date(2026, 4, 23))).toBe('sat')
  })
})

describe('scheduleRoutineOnDate', () => {
  it('converts the routine to weekly on the dropped weekday at the given time', () => {
    const routine = makeRoutine({ type: 'weekly', days: [] })
    const sat = new Date(2026, 4, 23) // Saturday
    expect(scheduleRoutineOnDate(routine, sat, '10:00')).toEqual({
      recurrence_pattern: { type: 'weekly', days: ['sat'] },
      time_of_day: '10:00',
    })
  })

  it('preserves other recurrence fields while overriding type/days', () => {
    const routine = makeRoutine({ type: 'monthly', day_of_month: 5, interval: 2 })
    const wed = new Date(2026, 4, 20) // Wednesday
    expect(scheduleRoutineOnDate(routine, wed, '14:30')).toEqual({
      recurrence_pattern: { type: 'weekly', days: ['wed'], day_of_month: 5, interval: 2 },
      time_of_day: '14:30',
    })
  })
})
