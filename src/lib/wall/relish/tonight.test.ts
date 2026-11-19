import { describe, expect, it } from 'vitest'
import { DINNER_PROMPTS } from './dinnerPrompts'
import { RELISH_GAMES } from './games'
import { localDayNumber, promptIndex, promptsFor, strideFor, tonightsPrompt } from './tonight'

describe('Relish on the wall: the bundled library', () => {
  it('carries Relish’s 50 prompts, each for kids, grown-ups or both', () => {
    expect(DINNER_PROMPTS).toHaveLength(50)
    expect(new Set(DINNER_PROMPTS.map((p) => p.id)).size).toBe(50)
    for (const p of DINNER_PROMPTS) expect(p.audiences.length).toBeGreaterThan(0)
  })

  it('no kid prompt assumes who the grown-ups are', () => {
    expect(DINNER_PROMPTS.some((p) => /Mom or Dad/.test(p.text))).toBe(false)
    expect(DINNER_PROMPTS.find((p) => p.id === 'family-history-001')?.text).toMatch(/a grown-up in our family as a kid/)
  })

  it('has eight table games, each with steps', () => {
    expect(RELISH_GAMES).toHaveLength(8)
    for (const g of RELISH_GAMES) expect(g.steps.length).toBeGreaterThan(1)
    expect(RELISH_GAMES.find((g) => g.id === 'would-you-rather')?.deck?.items).toHaveLength(12)
  })
})

describe('Relish on the wall: the audience', () => {
  it('kids at the table get only kid prompts; just grown-ups only adult ones', () => {
    const kid = promptsFor('kid')
    const adult = promptsFor('adult')
    expect(kid.length).toBeGreaterThan(0)
    expect(adult.length).toBeGreaterThan(0)
    expect(kid.every((p) => p.audiences.includes('kid'))).toBe(true)
    expect(adult.every((p) => p.audiences.includes('adult'))).toBe(true)
    // A prompt for both shows in both.
    const both = DINNER_PROMPTS.find((p) => p.audiences.length === 2)!
    expect(kid).toContain(both)
    expect(adult).toContain(both)
    // A grown-ups-only prompt never reaches the kids.
    expect(kid.some((p) => p.id === 'connection-001')).toBe(false)
  })

  it('tonight’s question follows the audience', () => {
    const d = new Date(2026, 10, 19, 18, 30)
    expect(tonightsPrompt(d, 'kid')!.audiences).toContain('kid')
    expect(tonightsPrompt(d, 'adult')!.audiences).toContain('adult')
  })
})

describe('Relish on the wall: tonight’s question', () => {
  it('is the same all day: morning, dinner and just before midnight', () => {
    const morning = tonightsPrompt(new Date(2026, 10, 19, 0, 1), 'kid')
    expect(tonightsPrompt(new Date(2026, 10, 19, 18, 30), 'kid')).toBe(morning)
    expect(tonightsPrompt(new Date(2026, 10, 19, 23, 59), 'kid')).toBe(morning)
  })

  it('changes from one day to the next, and doesn’t repeat for weeks', () => {
    const days = Array.from({ length: promptsFor('kid').length }, (_, i) => tonightsPrompt(new Date(2026, 10, 1 + i, 18), 'kid')!.id)
    for (let i = 1; i < days.length; i++) expect(days[i]).not.toBe(days[i - 1])
    expect(new Set(days).size).toBe(days.length)
  })

  it('reads the local date, across a month end and a DST change', () => {
    expect(localDayNumber(new Date(2026, 10, 1, 0, 30)) - localDayNumber(new Date(2026, 9, 31, 23, 30))).toBe(1)
    // US clocks fall back on 2026-11-01; the day still counts once.
    expect(localDayNumber(new Date(2026, 10, 2, 12)) - localDayNumber(new Date(2026, 10, 1, 12))).toBe(1)
  })

  it('doesn’t serve a run of one theme on consecutive days', () => {
    const kid = promptsFor('kid')
    const a = kid[promptIndex(kid.length, 20_000)]
    const b = kid[promptIndex(kid.length, 20_001)]
    expect(a.themes[0]).not.toBe(b.themes[0])
  })
})

describe('Relish on the wall: Another', () => {
  it('moves to a different prompt each tap', () => {
    const d = new Date(2026, 10, 19, 18)
    expect(tonightsPrompt(d, 'kid', 1)).not.toBe(tonightsPrompt(d, 'kid', 0))
    expect(tonightsPrompt(d, 'kid', 2)).not.toBe(tonightsPrompt(d, 'kid', 1))
  })

  it('visits every prompt once, then wraps back to tonight’s', () => {
    const d = new Date(2026, 10, 19, 18)
    for (const audience of ['kid', 'adult'] as const) {
      const len = promptsFor(audience).length
      const seen = Array.from({ length: len }, (_, step) => tonightsPrompt(d, audience, step)!.id)
      expect(new Set(seen).size).toBe(len)
      expect(tonightsPrompt(d, audience, len)).toBe(tonightsPrompt(d, audience, 0))
    }
  })

  it('stays in range for any list length', () => {
    for (let len = 1; len <= 60; len++) {
      expect(strideFor(len) % len === 0 && len > 1).toBe(false)
      for (const step of [0, 1, len - 1, len, 3 * len + 2]) {
        const i = promptIndex(len, 20_411, step)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(len)
      }
    }
    expect(promptIndex(0, 20_411)).toBe(-1)
    expect(tonightsPrompt(new Date(), 'kid', 0, [])).toBeNull()
  })
})
