import { describe, it, expect } from 'vitest'
import { mayInterrupt, SURFACES, DAILY_INTERRUPT_BUDGET } from './interruptionPolicy'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

const base: ProactiveSuggestion = {
  id: 's1', userId: 'u1', entityType: 'task', entityId: 't1',
  suggestionType: 'call', title: 'Call Camp Notre Dame', confidence: 0.9,
  actionType: 'call', actionPayload: { phoneNumber: '555' }, status: 'active',
  suggestionKey: 'task:t1:call', generatedAt: '2026-07-30T06:30:00',
  createdAt: '2026-07-30T06:30:00', updatedAt: '2026-07-30T06:30:00',
}
const noon = new Date(2026, 6, 30, 12, 0, 0)
const state = { budgetSpent: 0 }

describe('mayInterrupt', () => {
  it('allows a high-urgency active suggestion on the wall', () => {
    const d = mayInterrupt(base, 75, SURFACES.wall, state, noon)
    expect(d.allow).toBe(true)
  })

  it('rejects below the surface floor', () => {
    const d = mayInterrupt(base, 69, SURFACES.wall, state, noon)
    expect(d).toEqual({ allow: false, reason: 'below_floor' })
  })

  it('uses a lower floor for Today than for the wall', () => {
    expect(mayInterrupt(base, 60, SURFACES.today, state, noon).allow).toBe(true)
    expect(mayInterrupt(base, 60, SURFACES.wall, state, noon).allow).toBe(false)
  })

  it('rejects non-active suggestions', () => {
    const d = mayInterrupt({ ...base, status: 'dismissed' }, 95, SURFACES.wall, state, noon)
    expect(d).toEqual({ allow: false, reason: 'not_active' })
  })

  it('rejects unactionable types before they can spend budget', () => {
    const dead = { ...base, suggestionType: 'someday' as const, actionType: undefined }
    const d = mayInterrupt(dead, 95, SURFACES.wall, state, noon)
    expect(d).toEqual({ allow: false, reason: 'not_actionable' })
  })

  it('rejects while snoozed, and allows once the snooze expires', () => {
    const snoozed = { ...base, snoozedUntil: '2026-07-30T16:00:00' }
    expect(mayInterrupt(snoozed, 75, SURFACES.wall, state, noon))
      .toEqual({ allow: false, reason: 'snoozed' })
    const expired = { ...base, snoozedUntil: '2026-07-30T11:00:00' }
    expect(mayInterrupt(expired, 75, SURFACES.wall, state, noon).allow).toBe(true)
  })

  it('rejects outside the window on the wall but not on Today', () => {
    const late = new Date(2026, 6, 30, 22, 0, 0)
    expect(mayInterrupt(base, 75, SURFACES.wall, state, late))
      .toEqual({ allow: false, reason: 'outside_window' })
    // Today is user-initiated: you opened it, so you asked.
    expect(mayInterrupt(base, 75, SURFACES.today, state, late).allow).toBe(true)
  })

  it('rejects when the global budget is spent', () => {
    const spent = { budgetSpent: DAILY_INTERRUPT_BUDGET }
    expect(mayInterrupt(base, 75, SURFACES.wall, spent, noon))
      .toEqual({ allow: false, reason: 'budget_spent' })
  })

  it('rejects a seen-but-unacted item inside the cooldown', () => {
    const seen = { ...base, seenAt: '2026-07-30T10:00:00', seenUrgency: 75 }
    expect(mayInterrupt(seen, 75, SURFACES.wall, state, noon))
      .toEqual({ allow: false, reason: 'cooldown' })
  })

  it('allows a seen item once the cooldown has passed', () => {
    const seen = { ...base, seenAt: '2026-07-30T07:00:00', seenUrgency: 75 }
    expect(mayInterrupt(seen, 75, SURFACES.wall, state, noon).allow).toBe(true)
  })

  it('lets escalation beat the cooldown', () => {
    // Seen at 62 this morning, now 78 because it went overdue.
    const seen = { ...base, seenAt: '2026-07-30T10:00:00', seenUrgency: 62 }
    expect(mayInterrupt(seen, 78, SURFACES.wall, state, noon).allow).toBe(true)
  })

  it('lets critical bypass budget, cooldown, AND the window', () => {
    const seen = { ...base, seenAt: '2026-07-30T11:55:00', seenUrgency: 90 }
    const late = new Date(2026, 6, 30, 21, 30, 0)
    const d = mayInterrupt(seen, 95, SURFACES.wall, { budgetSpent: 99 }, late)
    expect(d).toEqual({ allow: true, urgency: 95, critical: true, reason: 'allowed' })
  })

  it('never lets critical bypass the actionable or active checks', () => {
    expect(mayInterrupt({ ...base, status: 'expired' }, 95, SURFACES.wall, state, noon).allow).toBe(false)
  })

  it('reports the MOST SPECIFIC reason when several apply', () => {
    // Snoozed AND below floor AND outside window AND budget spent.
    const bad = { ...base, snoozedUntil: '2026-07-30T23:00:00' }
    const late = new Date(2026, 6, 30, 22, 0, 0)
    const d = mayInterrupt(bad, 10, SURFACES.wall, { budgetSpent: 99 }, late)
    expect(d).toEqual({ allow: false, reason: 'snoozed' })
  })
})
