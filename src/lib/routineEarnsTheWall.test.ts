import { describe, it, expect } from 'vitest'
import { routineEarnsTheWall } from './routineUtils'

describe('routineEarnsTheWall — what is rare enough to be news', () => {
  it('daily is rhythm', () => {
    expect(routineEarnsTheWall({ type: 'daily' })).toBe(false)
  })
  it('weekly on one or two days earns it', () => {
    expect(routineEarnsTheWall({ type: 'weekly', days: ['sat'] })).toBe(true)
    expect(routineEarnsTheWall({ type: 'weekly', days: ['tue', 'thu'] })).toBe(true)
  })
  it('weekly on three or more days is rhythm', () => {
    expect(routineEarnsTheWall({ type: 'weekly', days: ['mon', 'wed', 'fri'] })).toBe(false)
    expect(routineEarnsTheWall({ type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })).toBe(false)
  })
  it('weekly with no days listed means every day — rhythm', () => {
    expect(routineEarnsTheWall({ type: 'weekly' })).toBe(false)
  })
  it('specific_days follows the same day count, and named dates always earn it', () => {
    expect(routineEarnsTheWall({ type: 'specific_days', days: ['sun'] })).toBe(true)
    expect(routineEarnsTheWall({ type: 'specific_days', days: ['mon', 'tue', 'wed'] })).toBe(false)
    expect(routineEarnsTheWall({ type: 'specific_days', dates: ['2026-10-31'] })).toBe(true)
  })
  it('any interval above one earns it, whatever the type', () => {
    expect(routineEarnsTheWall({ type: 'daily', interval: 2 })).toBe(true)
    expect(routineEarnsTheWall({ type: 'weekly', days: ['mon', 'tue', 'wed'], interval: 2 })).toBe(true)
  })
  it('monthly, quarterly, yearly and since_last always earn it', () => {
    expect(routineEarnsTheWall({ type: 'monthly', day_of_month: 1 })).toBe(true)
    expect(routineEarnsTheWall({ type: 'quarterly' })).toBe(true)
    expect(routineEarnsTheWall({ type: 'yearly', month_of_year: 4 })).toBe(true)
    expect(routineEarnsTheWall({ type: 'since_last', interval: 1, unit: 'weeks' })).toBe(true)
  })
  it('no pattern at all is not a routine the wall can judge — rhythm', () => {
    expect(routineEarnsTheWall(null)).toBe(false)
    expect(routineEarnsTheWall(undefined)).toBe(false)
  })
})
