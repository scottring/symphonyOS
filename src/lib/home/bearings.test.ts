import { describe, expect, it } from 'vitest'
import { chooseNextStep, count, greeting, inTime, lookBackPath, nextSteps, nextUp, numberWord, timeRange, type BearingsFacts } from './bearings'

const level = (name: string, over: Partial<BearingsFacts['month']> = {}) => ({ name, open: 3, planned: true, review: 0, reviewName: 'September', ...over })
const facts = (over: Partial<BearingsFacts> = {}): BearingsFacts => ({
  now: new Date(2026, 9, 11, 9, 0),
  weekDaysLeft: 7,
  week: { planned: true, open: 2, done: 0 },
  month: level('October'),
  season: level('Fall', { reviewName: 'Summer' }),
  inbox: 0,
  todayChosen: 2,
  eventsAhead: 1,
  ...over,
})

describe('words, not tallies', () => {
  it('writes small numbers out', () => {
    expect(numberWord(3)).toBe('three')
    expect(numberWord(12)).toBe('12')
    expect(count(1, 'line')).toBe('one line')
    expect(count(0, 'line')).toBe('no lines')
  })
  it('greets by the hour', () => {
    expect(greeting(new Date(2026, 9, 11, 8))).toBe('Good morning')
    expect(greeting(new Date(2026, 9, 11, 14))).toBe('Good afternoon')
    expect(greeting(new Date(2026, 9, 11, 21))).toBe('Good evening')
  })
})

describe('the next step', () => {
  it('suggests planning a week nobody has planned, while most of it is ahead', () => {
    const step = chooseNextStep(facts({ week: { planned: false, open: 3, done: 0 } }), new Set())
    expect(step.id).toBe('plan-week')
    expect(step.title).toBe('The week ahead hasn’t been planned yet.')
    expect(step.body).toContain('Three things are waiting for a day.')
    expect(step.action.to).toBe('/week')
  })
  it('Plan the week opens the review deck on the current week, like the checklist link', () => {
    const step = chooseNextStep(facts({ week: { planned: false, open: 3, done: 0 }, weekStart: '2026-10-11' }), new Set())
    expect(step.id).toBe('plan-week')
    expect(step.action.to).toBe('/week?view=alongside&date=2026-10-11&start=2026-10-11&review=1')
  })
  it('lets a nearly finished week go', () => {
    expect(chooseNextStep(facts({ week: { planned: false, open: 3, done: 0 }, weekDaysLeft: 2 }), new Set()).id).not.toBe('plan-week')
  })
  it('falls through to the next step when one is set aside', () => {
    const f = facts({ week: { planned: false, open: 0, done: 0 }, inbox: 7 })
    expect(chooseNextStep(f, new Set(['plan-week'])).id).toBe('sort-inbox')
  })
  it('offers the month look-back with the month it reviews', () => {
    const step = chooseNextStep(facts({ month: level('October', { review: 3 }) }), new Set())
    expect(step.title).toBe('September closed with three open lines.')
  })
  it('Look back opens that period\'s review by hand', () => {
    const step = chooseNextStep(facts({ month: level('October', { review: 3, reviewStart: '2026-09-01' }) }), new Set())
    expect(step.action?.to).toBe('/month?start=2026-09-01&review=1')
    expect(lookBackPath('season', { reviewStart: '2026-06-01' })).toBe('/season?start=2026-06-01&review=1')
    expect(lookBackPath('season', {})).toBe('/season')
  })
  it('asks for today when nothing is chosen, but not late in the evening', () => {
    expect(chooseNextStep(facts({ todayChosen: 0 }), new Set()).id).toBe('choose-today')
    expect(chooseNextStep(facts({ todayChosen: 0, now: new Date(2026, 9, 11, 21) }), new Set()).id).toBe('do-today')
  })
  it('always ends with going to Today, even when everything is set aside', () => {
    const all = nextSteps(facts({ week: { planned: false, open: 1, done: 0 }, inbox: 9, todayChosen: 0 }))
    expect(all[all.length - 1].id).toBe('do-today')
    expect(chooseNextStep(facts(), new Set(all.map((s) => s.id))).id).toBe('do-today')
  })
})

describe('the day in a sentence', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m)
  const day = [
    { title: 'Liam’s baseball', start: at(10, 30), end: at(12) },
    { title: 'Grampappa’s', start: at(12, 30), end: at(16, 30) },
  ]
  it('names what is next and how far off', () => {
    expect(nextUp(day, at(9))).toEqual({ lead: 'Next up is', what: 'Liam’s baseball at 10:30', rest: ', in an hour and a half. Then Grampappa’s at 12:30.' })
  })
  it('names what is on now', () => {
    expect(nextUp(day, at(13))?.what).toBe('Grampappa’s, until 4:30')
  })
  it('writes times as Today does, and a moment as one time', () => {
    expect(timeRange(at(10, 30), at(12))).toBe('10:30–12:00')
    expect(timeRange(at(14), at(14))).toBe('2:00')
  })
  it('is quiet when the timed day is over', () => {
    expect(nextUp(day, at(17))).toBeNull()
  })
  it('rounds the wait the way people say it', () => {
    expect(inTime(at(9), at(9, 20))).toBe('in 20 minutes')
    expect(inTime(at(9), at(12))).toBe('in 3 hours')
  })
})

// Scott, 2026-10-31: Home nudged the week but never the month, season or year.
describe('a month, season or year with a step due', () => {
  it('asks top down, before the week: the review in its last days walks on into the next', () => {
    const steps = nextSteps(facts({
      week: { planned: false, open: 2, done: 0 },
      due: [
        { level: 'season', step: 'plan', name: 'Fall', to: '/season?start=2026-09-22&plan=1' },
        { level: 'month', step: 'review', name: 'October', next: 'November', daysLeft: 1, to: '/month?start=2026-10-01&review=1' },
      ],
    }))
    expect(steps.map((s) => s.id).slice(0, 3)).toEqual(['due-season', 'due-month', 'plan-week'])
    expect(steps[0]).toMatchObject({ title: 'Fall hasn’t been planned yet.', action: { label: 'Plan Fall', to: '/season?start=2026-09-22&plan=1' } })
    expect(steps[1]).toMatchObject({ title: 'October ends today.', body: 'Look back at it, then plan November.', action: { label: 'Review October' } })
    expect(nextSteps(facts({ due: [{ level: 'month', step: 'review', name: 'October', next: 'November', daysLeft: 3, to: '/m' }] }))[0].title).toBe('October ends in three days.')
  })

  it('a month due to plan replaces "has nothing on it yet"', () => {
    const ids = nextSteps(facts({ month: level('November', { open: 0, planned: false }), due: [{ level: 'month', step: 'plan', name: 'November', to: '/m' }] })).map((s) => s.id)
    expect(ids).toContain('due-month')
    expect(ids).not.toContain('plan-month')
  })

  it('set aside, the next step shows', () => {
    const f = facts({ due: [{ level: 'month', step: 'plan', name: 'November', to: '/m' }], week: { planned: false, open: 0, done: 0 } })
    expect(chooseNextStep(f, new Set(['due-month'])).id).toBe('plan-week')
  })
})

