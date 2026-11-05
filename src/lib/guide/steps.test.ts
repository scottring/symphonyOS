import { describe, it, expect } from 'vitest'
import { GUIDE_STEPS, HORIZON_OF, choosingStep, stepIn, stepsFor, wordsIn, type GuideLevel } from './steps'
import { dayWords } from './dayTarget'

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
      'next-weeks': { calendar: true }, 'by-area': { above: true, write: true }, 'upkeep-fun': { calendar: true },
    })
    for (const level of ['week', 'month', 'season', 'year'] as const) {
      expect(stepsFor(level).find((s) => s.id === 'look-back')?.drives).toEqual({ above: true, look: true })
      expect(choosingStep(level).drives).toEqual({ above: true, write: true })
    }
    // Today: the week opens beside the day for yesterday's leftovers (Task 4:
    // they are back on the week sheet), to pick from, and for its routines.
    expect(drives('day')).toEqual({
      'look-back': { above: true }, calendar: {}, energy: {},
      pick: { above: true }, habits: { above: true },
    })
  })

  // Planning as tooltips (2026-11-04): each step points at its place on the page.
  it('says where each step’s tooltip points', () => {
    const at = (level: GuideLevel) => Object.fromEntries(stepsFor(level).map((s) => [s.id, s.at]))
    expect(at('day')).toEqual({ 'look-back': 'leftovers', calendar: 'day', energy: 'energy', pick: 'left', habits: 'routines' })
    expect(at('week')).toEqual({ 'look-back': 'left', calendar: 'day', 'read-month': 'left', inbox: 'inbox', choose: 'write', ops: 'dinner', family: 'family' })
    expect(at('month')).toEqual({ 'fresh-start': 'menu', 'look-back': 'left', 'read-season': 'left', 'next-weeks': 'right', 'by-area': 'write', 'upkeep-fun': 'routines' })
    expect(at('season')).toEqual({ 'look-back': 'left', 'from-year': 'left', calendar: 'right', energy: 'energy', 'by-area': 'write', 'ideal-week': 'ideal-week', 'wild-cards': 'wild-cards' })
    expect(at('year')).toEqual({ 'look-back': 'left', vision: 'vision', landscape: 'landscape', areas: 'areas', 'brain-dump': 'write', refine: 'list', 'share-book': 'list' })
    // With no leftovers on the week sheet the look back points at the
    // week's fold, not the page title (Task 4).
    expect(stepsFor('day').find((s) => s.id === 'look-back')?.fallback).toBe('left')
    // A step that opens the calendar points at it, or at its routines
    // (Month's Maintenance and fun; Year's landscape at its own section); a
    // writing step at the write line.
    for (const level of ['day', 'week', 'month', 'season', 'year'] as const) {
      for (const s of stepsFor(level)) {
        if (s.drives?.calendar && s.id !== 'landscape') expect(['right', 'routines']).toContain(s.at)
        if (s.drives?.write) expect(s.at).toBe('write')
      }
    }
  })

  it('no step asks to carry, table, or send anything back up', () => {
    const all = JSON.stringify(GUIDE_STEPS)
    // Carrying forward (To November) is the look back's own call; nothing
    // is carried up or back to the level above.
    expect(all).not.toMatch(/back to the season|carry it (up|back)|table it|under its (season|year|month) goal|tied to/i)
  })

  it('maps levels to horizons', () => {
    expect(HORIZON_OF).toEqual({ day: 'daily', week: 'weekly', month: 'monthly', season: 'seasonal', year: 'annual' })
  })

  it('has no emojis in copy', () => {
    const all = JSON.stringify(GUIDE_STEPS)
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false)
  })

  // Task 4 (2026-11-04): a step that captures one small fact asks it in its
  // tooltip; leftovers are planned from the week sheet.
  it('says where the small facts are asked, and how leftovers are planned', () => {
    const step = (level: GuideLevel, id: string) => stepsFor(level).find((s) => s.id === id)!
    expect(wordsIn(step('day', 'look-back').you, dayWords(false))).toBe('Leftovers are at the top of the week sheet on the left, marked with their day. Tap + to plan one for today, or leave it on the week.')
    for (const level of ['day', 'season'] as const) expect(step(level, 'energy').you).not.toMatch(/chip/i)
    expect(step('month', 'upkeep-fun').you).toMatch(/then write at least one fun thing on \{this\}'s list\.$/)
  })

  // Scott, 2026-11-05: each tooltip says what its step is for, what is on the
  // screen and what each call does, naming the real periods.
  it('names the periods, and says what each look back call means', () => {
    const month = stepIn(stepsFor('month').find((s) => s.id === 'look-back')!, { this: 'November', prev: 'October', above: 'Fall' })
    expect(month.title).toBe('Look back at October')
    expect(month.you).toContain('Done (it finished, just wasn’t checked off)'.replace('’', "'"))
    expect(month.you).toContain('To November (carry it forward), Someday (not now), or Let go (not ever)')
    expect(month.you).not.toMatch(/energy/i)
    expect(wordsIn('Read {above}', { above: 'Fall' })).toBe('Read Fall')
    expect(wordsIn('Read {above}')).toBe('Read {above}')
    for (const level of ['day', 'week', 'month', 'season', 'year'] as const) {
      for (const s of stepsFor(level)) expect(s.why.length + s.you.length, `${level}/${s.id}`).toBeGreaterThan(40)
    }
  })
})
