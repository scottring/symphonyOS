import { describe, it, expect } from 'vitest'
import { GUIDE_STEPS, choosingStep, stepsFor, type GuideLevel } from './steps'

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

  it('has no emojis in copy', () => {
    const all = JSON.stringify(GUIDE_STEPS)
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false)
  })
})
