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
    const drives = (level: GuideLevel) => Object.fromEntries(stepsFor(level).map((s) => [s.id, { ...s.drives }]))
    expect(drives('month')).toEqual({
      'fresh-start': {}, 'look-back': { above: true, look: true }, 'read-season': { above: true },
      'next-weeks': { calendar: true }, 'by-area': { above: true, write: true }, 'upkeep-fun': {},
    })
    for (const level of ['week', 'month', 'season', 'year'] as const) {
      expect(stepsFor(level).find((s) => s.id === 'look-back')?.drives).toEqual({ above: true, look: true })
      expect(choosingStep(level).drives).toEqual({ above: true, write: true })
    }
    // Today: the week opens beside the day to pick from, and for its routines.
    expect(drives('day')).toEqual({
      'look-back': {}, calendar: {}, energy: {},
      pick: { above: true }, habits: { above: true },
    })
  })

  // Planning as tooltips (2026-11-04): each step points at its place on the page.
  it('says where each step’s tooltip points', () => {
    const at = (level: GuideLevel) => Object.fromEntries(stepsFor(level).map((s) => [s.id, s.at]))
    expect(at('day')).toEqual({ 'look-back': 'leftovers', calendar: 'day', energy: 'energy', pick: 'left', habits: 'routines' })
    expect(at('week')).toEqual({ 'look-back': 'left', calendar: 'day', 'read-month': 'left', inbox: 'inbox', choose: 'write', ops: 'dinner', family: 'family' })
    expect(at('month')).toEqual({ 'fresh-start': 'menu', 'look-back': 'left', 'read-season': 'left', 'next-weeks': 'right', 'by-area': 'write', 'upkeep-fun': 'write' })
    expect(at('season')).toEqual({ 'look-back': 'left', 'from-year': 'left', calendar: 'right', energy: 'energy', 'by-area': 'write', 'ideal-week': 'ideal-week', 'wild-cards': 'wild-cards' })
    expect(at('year')).toEqual({ 'look-back': 'left', vision: 'vision', landscape: 'landscape', areas: 'areas', 'brain-dump': 'write', refine: 'list', 'share-book': 'list' })
    // A step that opens the calendar points at it (Year's landscape at its
    // own section); a writing step at the write line.
    for (const level of ['day', 'week', 'month', 'season', 'year'] as const) {
      for (const s of stepsFor(level)) {
        if (s.drives?.calendar && s.id !== 'landscape') expect(s.at).toBe('right')
        if (s.drives?.write) expect(s.at).toBe('write')
      }
    }
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
