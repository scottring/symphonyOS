import { describe, it, expect } from 'vitest'
import { EMPTY_TALLY, addToTally, lookBackWhy, nextAfterSave, planWhy, tallySentence } from './planTally'

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

describe('planWhy', () => {
  it('a season with lines is checked against the year, not written from scratch', () => {
    const why = planWhy('season', 'Fall', '2026', 14)
    expect(why).toMatch(/^Check Fall’s list against 2026: keep what still matters, cut what doesn’t, add what’s missing\./)
    expect(why).toContain('“+ Add to Fall”')
    expect(why).not.toMatch(/write what/)
  })
  it('an empty season is written from the year’s goals', () => {
    expect(planWhy('season', 'Fall', '2026', 0)).toMatch(/^Fall’s list is empty\./)
  })
  it('a month checks against its season and the calendar', () => {
    expect(planWhy('month', 'October', 'Fall', 3)).toMatch(/^Check October’s list against Fall and the calendar.*A quiet month is fine\.$/)
    expect(planWhy('month', 'October', 'Fall', 0)).toBe('Look at Fall and the calendar, then write what October is for. A quiet month is fine.')
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
