import { describe, it, expect } from 'vitest'
import { computeCadenceOverdue } from './cadenceDue'
import { DEFAULT_CADENCE, weekToken } from '@/lib/cadence/config'

// Thursday 2026-07-30. Week anchor (Sunday start) is 2026-07-26.
const thu = new Date(2026, 6, 30, 9, 0, 0)
const thuWeek = weekToken(thu, DEFAULT_CADENCE.weekStartsOn)
// July 2026 falls in meteorological summer → S2, started 2026-06-01.
const allButWeek = new Set(['season:2026-S2', 'month:2026-7'])

describe('computeCadenceOverdue', () => {
  it('returns null when every current period was already planned', () => {
    const done = new Set([...allButWeek, `week:${thuWeek}`])
    expect(computeCadenceOverdue(DEFAULT_CADENCE, thu, done)).toBeNull()
  })

  it('reports the week as due when only its session is missing', () => {
    const r = computeCadenceOverdue(DEFAULT_CADENCE, thu, allButWeek)
    expect(r).toMatchObject({ kind: 'week', token: thuWeek, weeksLate: 0 })
  })

  it('prefers the larger unplanned ritual', () => {
    // Nothing planned at all — the season outranks the month and the week.
    expect(computeCadenceOverdue(DEFAULT_CADENCE, thu, new Set())?.kind).toBe('season')
    // Season done, month not — the month outranks the week.
    expect(computeCadenceOverdue(DEFAULT_CADENCE, thu, new Set(['season:2026-S2']))?.kind)
      .toBe('month')
  })

  it('counts weeks late for an unplanned month', () => {
    // 2026-07-30 is ~4 weeks past the July 1 anchor.
    const r = computeCadenceOverdue(DEFAULT_CADENCE, thu, new Set(['season:2026-S2']))
    expect(r!.weeksLate).toBe(4)
  })

  it('does not owe the year before its September 1 anchor', () => {
    const done = new Set([...allButWeek, `week:${thuWeek}`])
    // July is before Sept 1, so no year ritual is owed even though it is unplanned.
    expect(computeCadenceOverdue(DEFAULT_CADENCE, thu, done)).toBeNull()

    const oct = new Date(2026, 9, 15, 9, 0, 0)
    const octDone = new Set([
      'season:2026-S3', 'month:2026-10',
      `week:${weekToken(oct, DEFAULT_CADENCE.weekStartsOn)}`,
    ])
    const r = computeCadenceOverdue(DEFAULT_CADENCE, oct, octDone)
    expect(r).toMatchObject({ kind: 'year', token: '2026' })
    expect(r!.weeksLate).toBeGreaterThan(5)
  })

  it('respects weeklyNudgeEnabled=false for the weekly ritual only', () => {
    const cfg = { ...DEFAULT_CADENCE, weeklyNudgeEnabled: false }
    expect(computeCadenceOverdue(cfg, thu, allButWeek)).toBeNull()
    expect(computeCadenceOverdue(cfg, thu, new Set(['season:2026-S2']))?.kind).toBe('month')
  })

  it('scores an overdue month above the wall floor via urgency', async () => {
    // Integration sanity: a 4-week-late month must clear the wall's floor of 70.
    const { computeUrgency } = await import('./urgency')
    const r = computeCadenceOverdue(DEFAULT_CADENCE, thu, new Set(['season:2026-S2']))
    expect(computeUrgency({ cadenceWeeksLate: r!.weeksLate })).toBeGreaterThanOrEqual(70)
  })
})
