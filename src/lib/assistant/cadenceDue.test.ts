import { describe, it, expect } from 'vitest'
import { computeCadenceOverdue, completedCadenceTokens, isSessionSubstantive } from './cadenceDue'
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
    // (see below for the completion-signal tests)
    // Integration sanity: a 4-week-late month must clear the wall's floor of 70.
    const { computeUrgency } = await import('./urgency')
    const r = computeCadenceOverdue(DEFAULT_CADENCE, thu, new Set(['season:2026-S2']))
    expect(computeUrgency({ cadenceWeeksLate: r!.weeksLate })).toBeGreaterThanOrEqual(70)
  })
})

describe('isSessionSubstantive', () => {
  it('rejects a row that was merely opened', () => {
    // usePlanningSession creates the row on open; stepIndex lands on first nav.
    expect(isSessionSubstantive({})).toBe(false)
    expect(isSessionSubstantive({ stepIndex: 3 })).toBe(false)
    expect(isSessionSubstantive(null)).toBe(false)
    expect(isSessionSubstantive(undefined)).toBe(false)
  })

  it('rejects answers that are only whitespace', () => {
    expect(isSessionSubstantive({ stepIndex: 2, review: '   ' })).toBe(false)
  })

  it('accepts a real answer', () => {
    expect(isSessionSubstantive({ stepIndex: 4, review: 'Shipped the context graph' })).toBe(true)
    expect(isSessionSubstantive({ oneWord: 'steady' })).toBe(true)
  })
})

describe('completedCadenceTokens', () => {
  it('maps planning horizons to cadence kinds', () => {
    const set = completedCadenceTokens([
      { horizon: 'weekly', period_token: '2026-7-26', notes: { review: 'done' } },
      { horizon: 'monthly', period_token: '2026-7', notes: { review: 'done' } },
      { horizon: 'seasonal', period_token: '2026-S2', notes: { review: 'done' } },
      { horizon: 'annual', period_token: '2026', notes: { review: 'done' } },
    ])
    expect(set).toEqual(new Set([
      'week:2026-7-26', 'month:2026-7', 'season:2026-S2', 'year:2026',
    ]))
  })

  it('excludes opened-but-empty sessions, so the nudge survives a bail-out', () => {
    const set = completedCadenceTokens([
      { horizon: 'monthly', period_token: '2026-7', notes: { stepIndex: 2 } },
    ])
    expect(set.size).toBe(0)
  })

  it('ignores the daily horizon, which has no cadence ritual', () => {
    const set = completedCadenceTokens([
      { horizon: 'daily', period_token: '2026-07-30', notes: { oneWord: 'steady' } },
    ])
    expect(set.size).toBe(0)
  })
})
