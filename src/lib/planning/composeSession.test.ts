import { describe, it, expect } from 'vitest'
import { composeSession, type SessionState } from './composeSession'
import { SESSIONS } from '@/components/planning/guided/sessions'

const idle: SessionState = {
  periodElapsed: 0,
  completedInPeriod: 3,
  inboxCount: 4,
  upkeepCount: 5,
  nextSessionBooked: false,
  unplacedCount: 2,
  chosenCount: 6,
}

const typesOf = (steps: { type: string }[]) => steps.map((s) => s.type)

describe('composeSession', () => {
  it('keeps the whole ritual when every step has something to do', () => {
    const base = SESSIONS.monthly
    const out = composeSession(base, 'monthly', idle)
    expect(out.steps).toHaveLength(base.steps.length)
    expect(out.skipped).toEqual([])
  })

  it('never drops the spine, even with nothing anywhere', () => {
    const empty: SessionState = {
      periodElapsed: 0, completedInPeriod: 0, inboxCount: 0, upkeepCount: 0,
      nextSessionBooked: true, unplacedCount: 0, chosenCount: 5,
    }
    for (const horizon of ['annual', 'seasonal', 'monthly', 'weekly', 'daily'] as const) {
      const base = SESSIONS[horizon]
      const out = composeSession(base, horizon, empty)
      const spineIn = typesOf(base.steps).filter((t) =>
        ['narration', 'reflect', 'review', 'calendar'].includes(t))
      const spineOut = typesOf(out.steps).filter((t) =>
        ['narration', 'reflect', 'review', 'calendar'].includes(t))
      expect(spineOut).toEqual(spineIn)
    }
  })

  it('skips the wins step when nothing was finished, with a reason', () => {
    const out = composeSession(SESSIONS.monthly, 'monthly', { ...idle, completedInPeriod: 0 })
    expect(typesOf(out.steps)).not.toContain('wins')
    expect(out.skipped.map((s) => s.reason)).toContain('nothing finished in this period yet')
  })

  it('skips the inbox step when the inbox is already empty', () => {
    const out = composeSession(SESSIONS.weekly, 'weekly', { ...idle, inboxCount: 0 })
    expect(typesOf(out.steps)).not.toContain('inbox')
    expect(out.skipped.some((s) => s.reason === 'inbox is already empty')).toBe(true)
  })

  it('skips maintenance with no upkeep items, and book-next when already booked', () => {
    const out = composeSession(SESSIONS.monthly, 'monthly', {
      ...idle, upkeepCount: 0, nextSessionBooked: true,
    })
    expect(typesOf(out.steps)).not.toContain('maintenance')
    expect(typesOf(out.steps)).not.toContain('book-next')
  })

  it('skips place-on-weeks when nothing is unplaced', () => {
    const out = composeSession(SESSIONS.monthly, 'monthly', { ...idle, unplacedCount: 0 })
    expect(typesOf(out.steps)).not.toContain('place-on-weeks')
  })

  it('reports every skip — a step is never silently absent', () => {
    const base = SESSIONS.monthly
    const out = composeSession(base, 'monthly', {
      ...idle, completedInPeriod: 0, upkeepCount: 0, nextSessionBooked: true, unplacedCount: 0,
    })
    const missing = base.steps.filter((s) => !out.steps.some((k) => k.id === s.id))
    expect(out.skipped.map((s) => s.id).sort()).toEqual(missing.map((s) => s.id).sort())
    for (const s of out.skipped) expect(s.reason).toBeTruthy()
  })

  it('hoists the composer step when the period is underway with nothing chosen', () => {
    const base = SESSIONS.seasonal
    const out = composeSession(base, 'seasonal', { ...idle, periodElapsed: 0.5, chosenCount: 0 })
    const composerIdx = out.steps.findIndex((s) => s.type === 'pick-by-goal')
    const baseIdx = base.steps.findIndex((s) => s.type === 'pick-by-goal')
    expect(composerIdx).toBeLessThan(baseIdx)
    expect(out.why[out.steps[composerIdx].id]).toMatch(/weeks in with nothing chosen/)
  })

  it('does not hoist past an opening narration', () => {
    const base = SESSIONS.seasonal
    if (base.steps[0].type !== 'narration') return
    const out = composeSession(base, 'seasonal', { ...idle, periodElapsed: 0.5, chosenCount: 0 })
    expect(out.steps[0].id).toBe(base.steps[0].id)
  })

  it('does not hoist when choices already exist', () => {
    const base = SESSIONS.seasonal
    const out = composeSession(base, 'seasonal', { ...idle, periodElapsed: 0.9, chosenCount: 4 })
    expect(typesOf(out.steps)).toEqual(typesOf(base.steps))
    expect(out.why).toEqual({})
  })

  it('does not hoist early in the period — nothing chosen on day one is normal', () => {
    const base = SESSIONS.seasonal
    const out = composeSession(base, 'seasonal', { ...idle, periodElapsed: 0.05, chosenCount: 0 })
    expect(typesOf(out.steps)).toEqual(typesOf(base.steps))
  })

  it('never loses or duplicates a step while reordering', () => {
    const base = SESSIONS.monthly
    const out = composeSession(base, 'monthly', { ...idle, periodElapsed: 0.6, chosenCount: 0 })
    const ids = out.steps.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const expected = base.steps.filter((s) => !out.skipped.some((k) => k.id === s.id))
    expect(ids.sort()).toEqual(expected.map((s) => s.id).sort())
  })
})
