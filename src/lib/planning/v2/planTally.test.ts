import { describe, it, expect } from 'vitest'
import { EMPTY_TALLY, addToTally, lookBackWhy, nextAfterSave, tallySentence } from './planTally'

describe('planTally', () => {
  it('says what a look-back decided, in order, skipping zeros', () => {
    let t = EMPTY_TALLY
    for (const d of ['carried', 'carried', 'carried', 'someday', 'someday', 'dropped', 'left'] as const) t = addToTally(t, d)
    expect(tallySentence(t, 'Summer')).toBe('3 carried from Summer, 2 kept for someday, 1 let go.')
  })
  it('says nothing when nothing was decided', () => {
    expect(tallySentence(EMPTY_TALLY, 'Summer')).toBe('')
  })
  it('the look-back step says nothing is deleted', () => {
    expect(lookBackWhy('Summer', 'Fall', 6)).toMatch(/^Summer left 6 open\..*Nothing is deleted\.$/)
  })
})

describe('nextAfterSave', () => {
  const helpers = {
    weekStartOf: (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() - 6 + 7) % 7)); return x }, // Saturday weeks
    weekNumber: () => 40,
    seasonOf: () => ({ start: new Date(2026, 9, 1), name: 'Fall' }),
  }
  const sep29 = new Date(2026, 8, 29)
  it('Fall saved on Sep 29 (before it starts) hands to October, not September', () => {
    expect(nextAfterSave('season', new Date(2026, 9, 1), false, sep29, helpers)).toEqual({ label: 'Choose what October takes on', to: '/month?start=2026-10-01' })
  })
  it('a running month hands to this week', () => {
    expect(nextAfterSave('month', new Date(2026, 8, 1), true, sep29, helpers).to).toBe('/week?start=2026-09-26')
  })
  it('October planned ahead hands to the week holding Oct 1', () => {
    expect(nextAfterSave('month', new Date(2026, 9, 1), false, sep29, helpers)).toEqual({ label: 'Choose steps for week 40', to: '/week?start=2026-09-26' })
  })
  it('a year hands to a season', () => {
    expect(nextAfterSave('year', new Date(2026, 0, 1), true, sep29, helpers).label).toBe('Choose what Fall takes on')
  })
})
