import { describe, it, expect } from 'vitest'
import { selectCarriedRoutines, carriedFrom } from './carriedRoutines'
import type { Routine } from '@/types/routine'
import type { ActionableInstance } from '@/types/actionable'

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'ffg', name: 'Pay FFG', visibility: 'active', paused_until: null, show_on_timeline: true,
  recurrence_pattern: { type: 'monthly', day_of_month: 10 }, time_of_day: null, keep_until_done: true,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
} as unknown as Routine)
const inst = (date: string, over: Partial<ActionableInstance> = {}): ActionableInstance => ({
  id: `i-${date}`, user_id: 'u', entity_type: 'routine', entity_id: 'ffg', date, status: 'pending',
  assignee: null, assigned_to_override: null, deferred_to: null, completed_at: null, skipped_at: null,
  progress: null, created_at: '', updated_at: '', ...over,
} as ActionableInstance)
const nov11 = new Date(2026, 10, 11, 9)

describe('Keep it until it\'s done (Pay FFG, 2026-11-11)', () => {
  it('carries a missed occurrence onto today, from its own day', () => {
    const out = selectCarriedRoutines([routine()], [], nov11)
    expect(out).toHaveLength(1)
    expect(out[0].date.getDate()).toBe(10)
    expect(carriedFrom(out[0].dueOn, nov11)).toBe('from yesterday')
  })

  it('not once it is done or skipped, and not when the switch is off', () => {
    expect(selectCarriedRoutines([routine()], [inst('2026-11-10', { status: 'completed' })], nov11)).toEqual([])
    expect(selectCarriedRoutines([routine()], [inst('2026-11-10', { status: 'skipped' })], nov11)).toEqual([])
    expect(selectCarriedRoutines([routine({ keep_until_done: false })], [], nov11)).toEqual([])
  })

  it('a moved occurrence is its new day\'s until that day has passed', () => {
    const moved = inst('2026-11-10', { status: 'deferred', deferred_to: new Date(2026, 10, 12).toISOString(), planned_on: '2026-11-12' })
    expect(selectCarriedRoutines([routine()], [moved], nov11)).toEqual([])
    const later = selectCarriedRoutines([routine()], [moved], new Date(2026, 10, 14))
    expect(later).toHaveLength(1)
    expect(later[0].date.getDate()).toBe(10) // Done writes the original occurrence
    expect(carriedFrom(later[0].dueOn, new Date(2026, 10, 14))).toBe('from Thu')
  })

  it('stops when the next occurrence comes due, and leaves resting or dayless routines alone', () => {
    expect(selectCarriedRoutines([routine()], [], new Date(2026, 11, 10))).toEqual([])
    expect(selectCarriedRoutines([routine({ visibility: 'reference' } as Partial<Routine>)], [], nov11)).toEqual([])
    expect(selectCarriedRoutines([routine({ recurrence_pattern: { type: 'weekly', days: [] } } as Partial<Routine>)], [], nov11)).toEqual([])
    expect(selectCarriedRoutines([routine({ paused_until: '2026-12-01T00:00:00Z' })], [], nov11)).toEqual([])
  })

  it('a routine made after its last due day has nothing missed', () => {
    expect(selectCarriedRoutines([routine({ created_at: '2026-11-10T20:00:00' })], [], nov11)).toHaveLength(1)
    expect(selectCarriedRoutines([routine({ created_at: '2026-11-11T08:00:00' })], [], nov11)).toEqual([])
  })

  it('a week or more back says the date', () => {
    expect(carriedFrom(new Date(2026, 10, 1), nov11)).toBe('from Nov 1')
  })
})
