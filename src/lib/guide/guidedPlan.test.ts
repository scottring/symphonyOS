import { describe, it, expect } from 'vitest'
import { advance, back, finishHere, firstStepChoices, onStepPage, parseGuideState, pause, planPeriods, startGuide, stepPath } from './guidedPlan'
import type { Seasons } from '@/lib/cadence/seasons'

// Scott's household: custom seasons, Fall = Oct 1 – Dec 31; Saturday weeks.
const seasons = [
  { name: 'Winter', month: 1, day: 1 }, { name: 'Spring', month: 4, day: 1 },
  { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
] as unknown as Seasons
const SAT = 6
const sep29 = new Date(2026, 8, 29, 15, 0)

describe('first-step choices', () => {
  it('Sep 29: October is recommended, September offered', () => {
    expect(firstStepChoices('month', sep29, seasons, SAT).map((c) => c.start)).toEqual(['2026-10-01', '2026-09-01'])
  })
  it('mid-month: only this month', () => {
    expect(firstStepChoices('month', new Date(2026, 9, 12), seasons, SAT).map((c) => c.start)).toEqual(['2026-10-01'])
  })
  it('two days before Fall: Fall first, Summer second', () => {
    const c = firstStepChoices('season', sep29, seasons, SAT)
    expect(c.map((x) => x.start)).toEqual(['2026-10-01', '2026-07-01'])
    expect(c[0].label).toMatch(/^Fall · Thu Oct 1 – Thu Dec 31$/)
  })
})

describe('planPeriods — each step derives from the one above', () => {
  it('bigger picture on Sep 29: 2026 → Fall → October → week 40 (holds Oct 1) → today', () => {
    const { steps, periods } = planPeriods('bigger', '2026-01-01', sep29, seasons, SAT)
    expect(steps).toEqual(['year', 'season', 'month', 'week', 'today'])
    expect(periods).toEqual({ year: '2026-01-01', season: '2026-10-01', month: '2026-10-01', week: '2026-09-26', today: '2026-09-29' })
  })
  it('month ahead, choosing September: this week, today', () => {
    const { periods } = planPeriods('month', '2026-09-01', sep29, seasons, SAT)
    expect(periods).toMatchObject({ month: '2026-09-01', week: '2026-09-26', today: '2026-09-29' })
  })
  it('planning November ahead ends at its week — no Today step on a future week', () => {
    const { steps, periods } = planPeriods('month', '2026-11-01', sep29, seasons, SAT)
    expect(steps).toEqual(['month', 'week'])
    expect(periods.week).toBe('2026-10-31')
    expect(periods.today).toBeUndefined()
  })
  it('just today', () => {
    expect(planPeriods('today', '2026-09-29', sep29, seasons, SAT).steps).toEqual(['today'])
  })
})

describe('moving through a run', () => {
  it('continue, back, finish; the last Continue finishes', () => {
    let s = startGuide('week', '2026-09-26', sep29, seasons, SAT)
    expect(stepPath('week', s)).toBe('/week?start=2026-09-26')
    s = advance(s)
    expect(s.current).toBe(1)
    expect(s.done).toEqual(['week'])
    s = back(s)
    expect(s.current).toBe(0)
    s = advance(advance(s))
    expect(s.status).toBe('finished')
    expect(s.done).toEqual(['week', 'today'])
  })
  it('finish here marks only what was reached; pause keeps the place', () => {
    const s = startGuide('bigger', '2026-01-01', sep29, seasons, SAT)
    const f = finishHere(advance(s))
    expect(f.status).toBe('finished')
    expect(f.done).toEqual(['year', 'season'])
    expect(pause(advance(s))).toMatchObject({ status: 'paused', current: 1 })
  })
  it('knows when the page on screen is the step', () => {
    const s = startGuide('month', '2026-10-01', sep29, seasons, SAT)
    expect(onStepPage('month', s, '/month', '?start=2026-10-01')).toBe(true)
    expect(onStepPage('month', s, '/month', '?start=2026-09-01')).toBe(false)
    expect(onStepPage('today', s, '/today', '')).toBe(true)
  })
  it('ignores a saved shape it does not know', () => {
    expect(parseGuideState({ v: 2 })).toBeNull()
    expect(parseGuideState(null)).toBeNull()
    const s = startGuide('today', '2026-09-29', sep29, seasons, SAT)
    expect(parseGuideState(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })
})
