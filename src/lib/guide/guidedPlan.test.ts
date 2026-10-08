import { describe, it, expect } from 'vitest'
import { advance, back, finishHere, recordCoach, withCoach, firstStepChoices, hasPlans, onStepPage, parseGuideState, pause, pickUpPeriods, pickUpRows, planPeriods, startGuide, startPickUp, stepIdeas, stepPath, stepShortName, stepTitle, type PickUpFacts } from './guidedPlan'
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
  it('reads a run saved before the coach existed, adding no coach fields', () => {
    const old = { v: 1, route: 'month', steps: ['month', 'week', 'today'], periods: { month: '2026-10-01' }, current: 1, done: ['month'], status: 'paused', updatedAt: '2026-10-01T10:00:00Z' }
    const parsed = parseGuideState(JSON.parse(JSON.stringify(old)))!
    expect(parsed).toStrictEqual(old)
    expect('coach' in parsed).toBe(false)
    expect('coachDone' in parsed).toBe(false)
  })
  it('keeps the coach choice and its progress, and drops a malformed record', () => {
    const s = recordCoach(recordCoach(withCoach(startGuide('month', '2026-10-01', sep29, seasons, SAT), true),
      'month', { id: 't1', title: 'Finish the patio', saved: 'Saved to October.', also: 'It stays on October’s list as you plan the weeks.', at: 'x' }),
      'week', { skipped: true, at: 'y' })
    const back = parseGuideState(JSON.parse(JSON.stringify(s)))!
    expect(back.coach).toBe(true)
    expect(back.coachDone).toEqual(s.coachDone)
    const odd = parseGuideState({ ...JSON.parse(JSON.stringify(s)), coach: 'yes', coachDone: { month: { title: 3 }, nope: { skipped: true } } })!
    expect('coach' in odd).toBe(false)
    expect('coachDone' in odd).toBe(false)
  })
  it('moving through a run keeps the coach fields', () => {
    const s = withCoach(startGuide('month', '2026-10-01', sep29, seasons, SAT), true)
    expect(back(advance(s)).coach).toBe(true)
    expect(pause(s).coach).toBe(true)
  })
})

describe('stepIdeas — help for a blank step', () => {
  const s = startGuide('bigger', '2026-01-01', sep29, seasons, SAT)
  const wk = () => 40
  it('the season step asks of each year goal what would be true by the season’s end, naming the button', () => {
    const i = stepIdeas('season', s, seasons, wk)
    expect(i.prompt).toContain('each 2026 goal')
    expect(i.prompt).toContain('by the end of Fall')
    expect(i.prompt).toContain('“+ Add to Fall”')
    expect(i.patterns.length).toBeGreaterThanOrEqual(3)
  })
  it('the month step names the season above and the month', () => {
    expect(stepIdeas('month', s, seasons, wk).prompt).toMatch(/each Fall line .* October’s part/)
  })
  it('a month-ahead run has no season: it still reads', () => {
    const m = startGuide('month', '2026-10-01', sep29, seasons, SAT)
    expect(stepIdeas('month', m, seasons, wk).prompt).toContain('each season line')
  })
})

describe('pick up where you are', () => {
  const oct1 = new Date(2026, 9, 1, 9)
  const wk = () => 40
  const facts = (over: Partial<PickUpFacts> = {}): PickUpFacts => ({
    yearGoals: 4,
    season: { open: 6, planned: false, review: 0 },
    month: { open: 0, planned: false, review: 3 },
    week: { open: 2, done: 0 },
    todayChosen: 1,
    ...over,
  })
  const periods = pickUpPeriods(oct1, seasons, SAT)

  it('plans this year, Fall, October, week 40 and today on Oct 1', () => {
    expect(periods).toMatchObject({ year: '2026-01-01', season: '2026-10-01', month: '2026-10-01', 'month-review': '2026-10-01', week: '2026-09-26', today: '2026-10-01' })
  })

  it('the storyboard account: look back at September, plan October, week, today; year and Fall in place', () => {
    const rows = pickUpRows(facts(), periods, oct1, seasons, wk)
    expect(rows.filter((r) => r.inPath && r.on).map((r) => r.name)).toEqual(['September', 'October', 'Week 40', 'Today'])
    expect(rows.find((r) => r.step === 'month-review')!.detail).toBe('Ended with 3 still open')
    expect(rows.filter((r) => !r.inPath).map((r) => `${r.name}: ${r.detail}`)).toEqual(['2026: 4 goals', 'Fall: 6 priorities'])
    expect(rows.find((r) => r.step === 'month-review')!.why).toBe('3 open. Carry each one into October, mark it done, keep it for someday, or let it go.')
    expect(rows.find((r) => r.step === 'month')!.why).toBe('Nothing on it yet. Fall sits beside the list.')
    expect(rows.find((r) => r.step === 'week')!.why).toBe('2 steps so far. It ends tomorrow, so keep it short.')
  })

  it('everything planned: only the week and today', () => {
    const rows = pickUpRows(facts({ month: { open: 3, planned: true, review: 0 }, week: { open: 3, done: 2 } }), periods, oct1, seasons, wk)
    expect(rows.filter((r) => r.inPath).map((r) => r.step)).toEqual(['week', 'today'])
    expect(rows.find((r) => r.step === 'week')!.detail).toBe('5 steps, 2 done')
  })

  it('a month marked planned with nothing on it is in place', () => {
    const rows = pickUpRows(facts({ month: { open: 0, planned: true, review: 0 } }), periods, oct1, seasons, wk)
    expect(rows.find((r) => r.step === 'month')).toMatchObject({ inPath: false, detail: 'Marked planned' })
  })

  it('an empty year and season are offered unchecked', () => {
    const rows = pickUpRows(facts({ yearGoals: 0, season: { open: 0, planned: false, review: 0 } }), periods, oct1, seasons, wk)
    expect(rows.find((r) => r.step === 'year')).toMatchObject({ inPath: true, on: false, chip: 'Optional' })
    expect(rows.find((r) => r.step === 'season')).toMatchObject({ inPath: true, on: false, chip: 'Optional' })
  })

  it('a look-back is offered only while the new period is young', () => {
    const oct20 = new Date(2026, 9, 20)
    const rows = pickUpRows(facts(), pickUpPeriods(oct20, seasons, SAT), oct20, seasons, wk)
    expect(rows.some((r) => r.step === 'month-review')).toBe(false)
    // Planning ahead on Sep 29: October is next, so September's open lines are asked about.
    const ahead = pickUpRows(facts(), pickUpPeriods(sep29, seasons, SAT), sep29, seasons, wk)
    expect(ahead.find((r) => r.step === 'month-review')).toMatchObject({ name: 'September', detail: 'Has 3 still open' })
  })

  it('a season look-back closes out Summer on Fall’s page', () => {
    const rows = pickUpRows(facts({ season: { open: 6, planned: false, review: 2 } }), periods, oct1, seasons, wk)
    expect(rows.find((r) => r.step === 'season-review')).toMatchObject({ name: 'Summer', inPath: true, on: true })
  })

  it('a new account has nothing to pick up', () => {
    const none = facts({ yearGoals: 0, season: { open: 0, planned: false, review: 0 }, month: { open: 0, planned: false, review: 0 }, week: { open: 0, done: 0 }, todayChosen: 0 })
    expect(hasPlans(none)).toBe(false)
    expect(hasPlans(facts())).toBe(true)
  })

  it('the run keeps the rows’ order; a look-back runs on the page it hands to', () => {
    const s = startPickUp(['today', 'month', 'month-review', 'week'], periods)
    expect(s.steps).toEqual(['month-review', 'month', 'week', 'today'])
    expect(stepPath('month-review', s)).toBe('/month?start=2026-10-01')
    expect(onStepPage('month-review', s, '/month', '?start=2026-10-01')).toBe(true)
    expect(stepTitle('month-review', s, seasons, wk)).toBe('Look back at September')
    expect(stepShortName('month-review', s, seasons, wk)).toBe('look back at September')
    expect(stepIdeas('month-review', s, seasons, wk)).toBeNull()
    // The rail still knows the run's season and year.
    expect(s.periods).toMatchObject({ year: '2026-01-01', season: '2026-10-01' })
    expect(parseGuideState(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })
})
