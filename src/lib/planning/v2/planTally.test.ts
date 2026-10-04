import { describe, it, expect } from 'vitest'
import { EMPTY_TALLY, addToTally, decidedSentence, lookBackWhy, nextAfterSave, planWhy, tallySentence } from './planTally'

describe('planTally', () => {
  it('says what a look-back decided, in order, skipping zeros', () => {
    let t = EMPTY_TALLY
    for (const d of ['carried', 'carried', 'carried', 'someday', 'someday', 'dropped', 'left'] as const) t = addToTally(t, d)
    expect(tallySentence(t, 'Summer')).toBe('3 carried from Summer, 2 kept for someday, 1 let go.')
  })
  it('says nothing when nothing was decided', () => {
    expect(tallySentence(EMPTY_TALLY, 'Summer')).toBe('')
  })
  it('the look-back step says nothing is deleted, without counting', () => {
    expect(lookBackWhy('Summer', 'Fall', 6)).toMatch(/^Summer left work open\..*Nothing is deleted\.$/)
    expect(lookBackWhy('Summer', 'Fall', 6)).not.toMatch(/\d/)
  })
  it('once every card is decided, the bar says so (walkthrough 2026-10-02 #30)', () => {
    expect(lookBackWhy('October', 'November', 0)).toBe('October’s open work is decided. Next, write November.')
  })
  it('a save says the look-back is decided in words, not counts', () => {
    expect(decidedSentence(addToTally(EMPTY_TALLY, 'carried'), 'October')).toBe('October’s open work is decided.')
    expect(decidedSentence(EMPTY_TALLY, 'October')).toBe('')
  })
})

describe('planWhy', () => {
  // Scott, 2026-10-04: a season is a brainstorm list; nothing is linked.
  it('a season with lines is read again, with no goal links', () => {
    const why = planWhy('season', 'Fall', '2026', 14)
    expect(why).toBe('Read Fall’s list again: keep what still matters, cut what doesn’t, add what’s missing.')
    expect(why).not.toMatch(/part”/)
  })
  it('an empty season is a brainstorm, the year there to look at', () => {
    expect(planWhy('season', 'Fall', '2026', 0)).toMatch(/^Write everything you’d like Fall to hold\..*2026 is there to look at/)
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
    expect(nextAfterSave('season', new Date(2026, 9, 1), false, sep29, helpers)).toEqual({ label: 'Write October’s list', to: '/month?start=2026-10-01' })
  })
  it('a running month hands to this week', () => {
    expect(nextAfterSave('month', new Date(2026, 8, 1), true, sep29, helpers).to).toBe('/week?start=2026-09-26')
  })
  it('October planned ahead hands to the week holding Oct 1', () => {
    expect(nextAfterSave('month', new Date(2026, 9, 1), false, sep29, helpers)).toEqual({ label: 'Plan week 40', to: '/week?start=2026-09-26' })
  })
  it('on a week’s last day a running month hands to NEXT week (walkthrough 2026-10-02 #18)', () => {
    const fri = new Date(2026, 9, 2) // last day of the Saturday week Sep 26 – Oct 2
    expect(nextAfterSave('month', new Date(2026, 9, 1), true, fri, helpers).to).toBe('/week?start=2026-10-03')
  })
  it('a year hands to a season', () => {
    expect(nextAfterSave('year', new Date(2026, 0, 1), true, sep29, helpers).label).toBe('Write Fall’s list')
  })
})
