import { describe, it, expect } from 'vitest'
import { computeUrgency as canonical, deriveUrgencyFacts as deriveCanonical } from './urgency'
// Plain TS, no Deno APIs — importable by vitest directly.
import {
  computeUrgency as twin,
  deriveUrgencyFacts as deriveTwin,
} from '../../../supabase/functions/_shared/urgency'
import type { UrgencyFacts } from './urgency'

const FIXTURES: UrgencyFacts[] = [
  {},
  { eventStartsInMinutes: 30 },
  { eventStartsInMinutes: 90 },
  { eventStartsInMinutes: 91 },
  { eventStartsInMinutes: -5 },
  { daysOverdue: 0 },
  { daysOverdue: 3 },
  { daysOverdue: 400 },
  { cadenceWeeksLate: 0 },
  { cadenceWeeksLate: 2 },
  { cadenceWeeksLate: 99 },
  { dueToday: true },
  { waitingDays: 7 },
  { waitingDays: 6 },
  { deferCount: 9 },
  { dueToday: true, waitingDays: 10, daysOverdue: 0 },
  { eventStartsInMinutes: 1, deferCount: 50 },
]

describe('edge twin stays in sync with canonical urgency', () => {
  it.each(FIXTURES)('scores %j identically', (facts) => {
    expect(twin(facts)).toBe(canonical(facts))
  })

  it('derives facts identically', () => {
    const now = new Date('2026-07-30T09:00:00')
    const input = {
      eventStartAt: '2026-07-30T10:00:00',
      dueAt: '2026-07-28T09:00:00',
      waitingSince: '2026-07-01T09:00:00',
      deferCount: 4,
    }
    expect(deriveTwin(input, now)).toEqual(deriveCanonical(input, now))
  })

  it('agrees on the critical constant', async () => {
    const c = await import('./urgency')
    const t = await import('../../../supabase/functions/_shared/urgency')
    expect(t.CRITICAL_URGENCY).toBe(c.CRITICAL_URGENCY)
  })
})
