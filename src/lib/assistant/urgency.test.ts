import { describe, it, expect } from 'vitest'
import { computeUrgency, deriveUrgencyFacts, CRITICAL_URGENCY } from './urgency'

describe('computeUrgency', () => {
  it('scores nothing when there is no time pressure', () => {
    expect(computeUrgency({})).toBe(0)
  })

  it('scores an imminent event at the critical band', () => {
    expect(computeUrgency({ eventStartsInMinutes: 30 })).toBe(90)
    expect(computeUrgency({ eventStartsInMinutes: 30 })).toBeGreaterThanOrEqual(CRITICAL_URGENCY)
  })

  it('does not treat an event beyond 90 minutes as time pressure', () => {
    expect(computeUrgency({ eventStartsInMinutes: 91 })).toBe(0)
  })

  it('ignores events that already started', () => {
    expect(computeUrgency({ eventStartsInMinutes: -5 })).toBe(0)
  })

  it('scales overdue by days and caps at 85', () => {
    expect(computeUrgency({ daysOverdue: 0 })).toBe(60)
    expect(computeUrgency({ daysOverdue: 3 })).toBe(69)
    expect(computeUrgency({ daysOverdue: 400 })).toBe(85)
  })

  it('scales cadence lateness and caps at 80', () => {
    expect(computeUrgency({ cadenceWeeksLate: 0 })).toBe(50)
    expect(computeUrgency({ cadenceWeeksLate: 2 })).toBe(70)
    expect(computeUrgency({ cadenceWeeksLate: 99 })).toBe(80)
  })

  it('scores due-today and long waits', () => {
    expect(computeUrgency({ dueToday: true })).toBe(55)
    expect(computeUrgency({ waitingDays: 7 })).toBe(45)
    expect(computeUrgency({ waitingDays: 6 })).toBe(0)
  })

  it('takes the MAX of signals, never the sum', () => {
    // Three signals at once: 55 + 45 + 60 would be 160 if summed.
    const u = computeUrgency({ dueToday: true, waitingDays: 10, daysOverdue: 0 })
    expect(u).toBe(60)
  })

  it('applies defer_count as a weak modifier that cannot alone cross a floor', () => {
    // The Today floor is 55. A deferred-but-not-time-pressured item stays quiet.
    expect(computeUrgency({ deferCount: 9 })).toBe(5)
    expect(computeUrgency({ dueToday: true, deferCount: 3 })).toBe(60)
  })

  it('clamps to 0..100', () => {
    expect(computeUrgency({ eventStartsInMinutes: 1, deferCount: 50 })).toBe(95)
  })
})

describe('deriveUrgencyFacts', () => {
  const now = new Date('2026-07-30T09:00:00')

  it('converts an event timestamp to minutes away', () => {
    const f = deriveUrgencyFacts({ eventStartAt: '2026-07-30T10:00:00' }, now)
    expect(f.eventStartsInMinutes).toBe(60)
  })

  it('counts whole days overdue', () => {
    const f = deriveUrgencyFacts({ dueAt: '2026-07-28T09:00:00' }, now)
    expect(f.daysOverdue).toBe(2)
  })

  it('marks due-today without marking it overdue', () => {
    const f = deriveUrgencyFacts({ dueAt: '2026-07-30T17:00:00' }, now)
    expect(f.dueToday).toBe(true)
    expect(f.daysOverdue).toBeNull()
  })

  it('passes cadence lateness through', () => {
    const f = deriveUrgencyFacts({ cadenceDue: { weeksLate: 3 } }, now)
    expect(f.cadenceWeeksLate).toBe(3)
  })

  it('ignores malformed timestamps rather than scoring NaN', () => {
    const f = deriveUrgencyFacts({ eventStartAt: 'not-a-date', dueAt: 'nope' }, now)
    expect(f.eventStartsInMinutes).toBeNull()
    expect(f.daysOverdue).toBeNull()
    expect(computeUrgency(f)).toBe(0)
  })
})
