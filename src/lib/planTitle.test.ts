import { describe, it, expect } from 'vitest'
import { periodFromTitle } from '@/lib/planTitle'
const seasons = [
  { name: 'Winter', month: 12, day: 1 }, { name: 'Spring', month: 3, day: 1 },
  { name: 'Summer', month: 6, day: 1 }, { name: 'Fall', month: 9, day: 1 },
] as const
const today = new Date(2026, 8, 6)

describe('periodFromTitle', () => {
  it('names a season with a year', () => {
    expect(periodFromTitle('Fall 2026', today, seasons)).toEqual({ kind: 'season', start: new Date(2026, 8, 1), label: 'Fall 2026' })
  })
  it('a season with no year is the next occurrence on or after this season', () => {
    expect(periodFromTitle('winter', today, seasons)).toEqual({ kind: 'season', start: new Date(2026, 11, 1), label: 'Winter 2026' })
  })
  it('a bare month is this year unless it has passed, then next year', () => {
    expect(periodFromTitle('September', today, seasons)).toEqual({ kind: 'month', start: new Date(2026, 8, 1) })
    expect(periodFromTitle('October', today, seasons)).toEqual({ kind: 'month', start: new Date(2026, 9, 1) })
    expect(periodFromTitle('March', today, seasons)).toEqual({ kind: 'month', start: new Date(2027, 2, 1) })
  })
  it('a year', () => { expect(periodFromTitle('2026', today, seasons)).toEqual({ kind: 'year', year: 2026 }) })
  it('anything else is null', () => {
    expect(periodFromTitle('Week of Sept 7', today, seasons)).toBeNull()
    expect(periodFromTitle(null, today, seasons)).toBeNull()
  })
})
