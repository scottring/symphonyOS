import { describe, it, expect } from 'vitest'
import { keepCandidates, keepMessage, offerKey } from './keepCandidates'
import type { Routine } from '@/types/routine'

const r = (id: string, recurrence_pattern: unknown, over: Partial<Routine> = {}): Routine =>
  ({ id, name: id, visibility: 'active', show_on_timeline: true, recurrence_pattern, keep_until_done: false, parent_routine_id: null, ...over } as unknown as Routine)

describe('routines worth keeping until done (2026-11-12)', () => {
  it('offers the rare ones with set days, not yet kept', () => {
    const list = [
      r('ffg', { type: 'monthly', day_of_month: 10 }),
      r('taxes', { type: 'yearly', month_of_year: 4, day_of_month: 15 }),
      r('payroll', { type: 'weekly', days: ['fri'], interval: 2 }),
      r('trash', { type: 'weekly', days: ['tue'] }),
      r('walk', { type: 'daily' }),
      r('haircut', { type: 'since_last', interval: 6, unit: 'weeks' }),
      r('kept', { type: 'monthly', day_of_month: 1 }, { keep_until_done: true }),
      r('resting', { type: 'monthly', day_of_month: 1 }, { visibility: 'reference' } as Partial<Routine>),
      r('step', { type: 'monthly', day_of_month: 1 }, { parent_routine_id: 'x' } as Partial<Routine>),
    ]
    expect(keepCandidates(list).map((x) => x.id)).toEqual(['ffg', 'taxes', 'payroll'])
  })

  it('names them for Symphony and keys the offer by who is in it', () => {
    const c = [r('b', { type: 'monthly' }, { name: 'Pay FFG' }), r('a', { type: 'yearly' }, { name: 'Renew passports' })]
    expect(keepMessage(c)).toContain('“Pay FFG”, “Renew passports”')
    expect(keepMessage(c)).toContain('keep_until_done true')
    expect(offerKey(c)).toBe('a,b')
  })
})
