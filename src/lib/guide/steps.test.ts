import { describe, it, expect } from 'vitest'
import { GUIDE_STEPS, HORIZON_OF, choosingStep, stepsFor, type GuideLevel } from './steps'

const LEVELS: GuideLevel[] = ['day', 'week', 'month', 'season', 'year']

describe('guide step catalog', () => {
  it('has the expected step counts', () => {
    expect(stepsFor('day')).toHaveLength(5)
    expect(stepsFor('week')).toHaveLength(7)
    expect(stepsFor('month')).toHaveLength(6)
    expect(stepsFor('season')).toHaveLength(7)
    expect(stepsFor('year')).toHaveLength(7)
  })

  it.each(LEVELS)('%s: ids unique, exactly one choosing step, all copy present', level => {
    const steps = GUIDE_STEPS[level]
    expect(new Set(steps.map(s => s.id)).size).toBe(steps.length)
    expect(steps.filter(s => s.choosing)).toHaveLength(1)
    for (const s of steps) {
      for (const f of [s.why, s.you, s.guide, s.more]) expect(f.trim()).not.toBe('')
      expect(s.writes.length).toBeGreaterThan(0)
    }
  })

  it('names the choosing step per level', () => {
    expect(choosingStep('day').id).toBe('pick')
    expect(choosingStep('week').id).toBe('choose')
    expect(choosingStep('month').id).toBe('by-area')
    expect(choosingStep('season').id).toBe('by-area')
    expect(choosingStep('year').id).toBe('brain-dump')
  })

  it('every more is 2-3 sentences with no digits (the guide never supplies specifics)', () => {
    for (const level of LEVELS) {
      for (const s of GUIDE_STEPS[level]) {
        const sentences = s.more.split(/[.!?]+\s*/).filter(x => x.trim())
        expect(sentences.length, `${level}/${s.id}`).toBeGreaterThanOrEqual(2)
        expect(sentences.length, `${level}/${s.id}`).toBeLessThanOrEqual(3)
        expect(/\d/.test(s.more), `${level}/${s.id}`).toBe(false)
      }
    }
  })

  // The planning ribbon (2026-11-04): each step drives the page's folds.
  it('says what each step opens on the page', () => {
    const drives = (level: GuideLevel) => Object.fromEntries(stepsFor(level).map((s) => [s.id, { ...s.drives, ...(s.card ? { card: true } : {}) }]))
    expect(drives('month')).toEqual({
      'fresh-start': { card: true }, 'look-back': { above: true, look: true }, 'read-season': { above: true },
      'next-weeks': { calendar: true }, 'by-area': { above: true, write: true }, 'upkeep-fun': { card: true },
    })
    for (const level of ['week', 'month', 'season', 'year'] as const) {
      expect(stepsFor(level).find((s) => s.id === 'look-back')?.drives).toEqual({ above: true, look: true })
      expect(choosingStep(level).drives).toEqual({ above: true, write: true })
    }
    expect(stepsFor('day').every((s) => s.card && !s.drives)).toBe(true)
  })

  it('no step asks to carry, table, or send anything back up', () => {
    const all = JSON.stringify(GUIDE_STEPS)
    expect(all).not.toMatch(/back to the season|carry it|table it|under its (season|year|month) goal|tied to/i)
  })

  it('maps levels to horizons', () => {
    expect(HORIZON_OF).toEqual({ day: 'daily', week: 'weekly', month: 'monthly', season: 'seasonal', year: 'annual' })
  })

  it('has no emojis in copy', () => {
    const all = JSON.stringify(GUIDE_STEPS)
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false)
  })
})
