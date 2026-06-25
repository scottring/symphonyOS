import { describe, it, expect } from 'vitest'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import { weekdayKeyForDate, WEEKDAY_KEYS } from '@/lib/routineUtils'
import { stepAppliesOnDate } from './stepSchedule'

function step(rp: RecurrencePattern): Routine {
  return {
    id: 's', user_id: 'u', name: 's', recurrence_pattern: rp, visibility: 'active',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Routine
}

const d = new Date(2026, 0, 5) // fixed date; weekday derived below
const key = weekdayKeyForDate(d)
const otherKey = WEEKDAY_KEYS.find(k => k !== key)!

describe('stepAppliesOnDate', () => {
  it('inherits (always true) when recurrence is daily', () => {
    expect(stepAppliesOnDate(step({ type: 'daily' }), d)).toBe(true)
  })
  it('inherits (always true) when weekly but days is empty', () => {
    expect(stepAppliesOnDate(step({ type: 'weekly', days: [] }), d)).toBe(true)
  })
  it('applies when weekly days include the date weekday', () => {
    expect(stepAppliesOnDate(step({ type: 'weekly', days: [key] }), d)).toBe(true)
  })
  it('does not apply when weekly days exclude the date weekday', () => {
    expect(stepAppliesOnDate(step({ type: 'weekly', days: [otherKey] }), d)).toBe(false)
  })
  it('honors specific_days the same way as weekly', () => {
    expect(stepAppliesOnDate(step({ type: 'specific_days', days: [otherKey] }), d)).toBe(false)
    expect(stepAppliesOnDate(step({ type: 'specific_days', days: [key] }), d)).toBe(true)
  })
})
