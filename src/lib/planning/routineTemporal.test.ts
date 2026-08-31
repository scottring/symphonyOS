import { describe, it, expect } from 'vitest'
import { routineTemporalLabel } from './routineTemporal'
import type { Routine } from '@/types/actionable'

function routine(over: Partial<Routine>): Routine {
  return {
    id: 'r1',
    name: 'R',
    recurrence_pattern: { type: 'daily' },
    time_of_day: null,
    is_active: true,
    ...over,
  } as Routine
}

describe('routineTemporalLabel', () => {
  it('names the recurrence and the time', () => {
    expect(routineTemporalLabel(routine({
      recurrence_pattern: { type: 'daily' }, time_of_day: '07:00:00',
    }))).toBe('Daily · 7:00 AM')
    expect(routineTemporalLabel(routine({
      recurrence_pattern: { type: 'weekly', days: ['mon', 'wed', 'fri'] },
    }))).toBe('Weekly · Mon, Wed, Fri · no set time')
    expect(routineTemporalLabel(routine({
      recurrence_pattern: { type: 'monthly', day_of_month: 15 }, time_of_day: '18:30:00',
    }))).toBe('Monthly · day 15 · 6:30 PM')
  })

  it('handles intervals and since_last', () => {
    expect(routineTemporalLabel(routine({
      recurrence_pattern: { type: 'weekly', interval: 2, days: ['sat'] },
    }))).toBe('Every 2 weeks · Sat · no set time')
    expect(routineTemporalLabel(routine({
      recurrence_pattern: { type: 'since_last', interval: 10, unit: 'days' },
    }))).toBe('10 days after last done · no set time')
  })
})
