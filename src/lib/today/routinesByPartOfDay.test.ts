import { describe, it, expect } from 'vitest'
import { routinesByPartOfDay } from './routinesByPartOfDay'
import type { Routine } from '@/types/routine'

const r = (id: string, time_of_day: string | null): Routine =>
  ({ id, name: id, time_of_day, recurrence_pattern: { type: 'daily' }, is_active: true } as unknown as Routine)

describe('routinesByPartOfDay', () => {
  it('buckets by hour boundaries (morning<12, afternoon 12-16, evening>=17)', () => {
    const out = routinesByPartOfDay([r('a', '07:00:00'), r('b', '13:30:00'), r('c', '18:00:00')])
    expect(out.morning.map(x => x.id)).toEqual(['a'])
    expect(out.afternoon.map(x => x.id)).toEqual(['b'])
    expect(out.evening.map(x => x.id)).toEqual(['c'])
  })
  it('places untimed routines in morning and sorts timed ascending', () => {
    const out = routinesByPartOfDay([r('late', '09:30:00'), r('none', null), r('early', '06:00:00')])
    expect(out.morning.map(x => x.id)).toEqual(['early', 'late', 'none'])
  })
})
