// src/components/planning/guided/sessions.test.ts
import { describe, it, expect } from 'vitest'
import { SESSIONS } from './sessions'
import type { StepType } from './types'

const KNOWN_TYPES: StepType[] = [
  'narration', 'reflect', 'review', 'look-above', 'calendar',
  'write-list', 'inbox', 'schedule-grid', 'domains-goals', 'book-next',
]

describe('guided session configs', () => {
  const horizons = ['annual', 'seasonal', 'monthly', 'weekly', 'daily'] as const

  it('defines all five horizons', () => {
    for (const h of horizons) expect(SESSIONS[h], h).toBeDefined()
  })

  it.each(horizons)('%s: every step has narration, a known type, and a unique id', (h) => {
    const seen = new Set<string>()
    for (const step of SESSIONS[h].steps) {
      expect(step.narration.trim().length, `${h}.${step.id} narration`).toBeGreaterThan(20)
      expect(KNOWN_TYPES).toContain(step.type)
      expect(seen.has(step.id), `${h}.${step.id} duplicate`).toBe(false)
      seen.add(step.id)
    }
  })

  it('reflect steps all carry a notesKey', () => {
    for (const h of horizons)
      for (const s of SESSIONS[h].steps.filter((s) => s.type === 'reflect'))
        expect(s.props?.notesKey, `${h}.${s.id}`).toBeTruthy()
  })

  it('write-list / review / inbox steps carry their bucket where required', () => {
    for (const h of horizons)
      for (const s of SESSIONS[h].steps.filter((s) => s.type === 'write-list'))
        expect(s.props?.bucket, `${h}.${s.id}`).toBeTruthy()
  })

  it('daily is light: at most 4 steps', () => {
    expect(SESSIONS.daily.steps.length).toBeLessThanOrEqual(4)
  })
})
