import { describe, it, expect } from 'vitest'
import { firstWeekSteps, shouldShowFirstWeek, type FirstWeekSignals } from './firstWeek'

const none: FirstWeekSignals = { memberCount: 1, pageCommitted: false, partnerInvited: false, routineCount: 0 }

describe('firstWeekSteps', () => {
  it('four steps, all undone for a fresh account', () => {
    const s = firstWeekSteps(none)
    expect(s.map((x) => x.id)).toEqual(['people', 'page', 'partner', 'routine'])
    expect(s.every((x) => !x.done)).toBe(true)
    expect(s[1].to).toBe('/today?plan=paper')
  })

  it('done lines point at where the result lives', () => {
    const s = firstWeekSteps({ memberCount: 4, pageCommitted: true, partnerInvited: true, routineCount: 2 })
    expect(s[0]).toMatchObject({ done: true, doneLine: '4 people' })
    expect(s[1]).toMatchObject({ done: true, doneLine: 'see This Week' })
    expect(s[3]).toMatchObject({ done: true, doneLine: 'see Routines' })
  })
})

describe('shouldShowFirstWeek', () => {
  it('shows only while ≥2 steps remain, and hides for 7 days after Hide for now', () => {
    const two = firstWeekSteps({ ...none, memberCount: 4, pageCommitted: true })
    expect(shouldShowFirstWeek(two, null, new Date())).toBe(true)

    const one = firstWeekSteps({ ...none, memberCount: 4, pageCommitted: true, partnerInvited: true })
    expect(shouldShowFirstWeek(one, null, new Date())).toBe(false)

    expect(shouldShowFirstWeek(two, new Date(Date.now() - 2 * 86_400_000).toISOString(), new Date())).toBe(false)
    expect(shouldShowFirstWeek(two, new Date(Date.now() - 8 * 86_400_000).toISOString(), new Date())).toBe(true)
  })
})
