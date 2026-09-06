import { describe, it, expect, beforeEach } from 'vitest'
import {
  firstWeekSteps,
  shouldShowFirstWeek,
  readSampleIds,
  writeSampleIds,
  clearSampleIdsRecord,
  hasSampleIds,
  type FirstWeekSignals,
} from './firstWeek'

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

describe('sample id tracking', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips what was written, and reports nothing before a write', () => {
    expect(hasSampleIds('u1')).toBe(false)
    expect(readSampleIds('u1')).toEqual({ taskIds: [], noteIds: [] })

    writeSampleIds('u1', { taskIds: ['t1', 't2'], noteIds: ['n1'] })
    expect(hasSampleIds('u1')).toBe(true)
    expect(readSampleIds('u1')).toEqual({ taskIds: ['t1', 't2'], noteIds: ['n1'] })

    clearSampleIdsRecord('u1')
    expect(hasSampleIds('u1')).toBe(false)
  })

  it('keys are per-user', () => {
    writeSampleIds('u1', { taskIds: ['t1'], noteIds: [] })
    expect(hasSampleIds('u2')).toBe(false)
  })
})
