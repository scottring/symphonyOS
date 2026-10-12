import { describe, it, expect } from 'vitest'
import { triageContract, whenAvailability, unavailableNote, periodMoves, WHEN_ORDER } from './contract'
import { resolveWhen, whenDetail, daysOf, describeWhen, type TriageClock } from './periods'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

const labels = (kind: Parameters<typeof triageContract>[0], completed = false) => triageContract(kind, { completed }).map((a) => a.label)

describe('the triage contract', () => {
  it('a task: every When (Tomorrow its own), Pick date, then More — in one order', () => {
    expect(labels('task')).toEqual([
      'Today', 'Tonight', 'Tomorrow', 'This week', 'Next week', 'This weekend', 'Next weekend',
      'This month', 'Next month', 'This season', 'Someday', 'Pick date & time…',
      'Complete', 'Open details', 'People…', 'Life area…', 'Move under…', 'Delete',
    ])
  })

  it('a dated task adds the scoped "Skip this day" between When and More', () => {
    const l = labels('dated-task')
    expect(l.slice(l.indexOf('Pick date & time…') + 1, l.indexOf('Complete'))).toEqual(['Skip this day'])
  })

  it('a routine occurrence: the same When order, Skip this time, and only one-time verbs', () => {
    const l = labels('occurrence')
    expect(l.slice(0, WHEN_ORDER.length)).toEqual(labels('task').slice(0, WHEN_ORDER.length))
    expect(l.slice(WHEN_ORDER.length)).toEqual(['Pick date & time…', 'Skip this time', 'Complete', 'Open routine'])
    // People and Life area would edit every occurrence — never offered here.
    expect(l).not.toContain('People…')
    expect(l).not.toContain('Life area…')
  })

  it('an occurrence’s periods ask for a day; Someday and This season explain themselves', () => {
    const a = whenAvailability('occurrence')
    expect(a['next-week']).toBe('pick-day')
    expect(a['this-month']).toBe('pick-day')
    expect(a['this-weekend']).toBe('pick-day')
    expect(a.someday).toBe('unavailable')
    expect(a['this-season']).toBe('unavailable')
    expect(unavailableNote('someday')).toMatch(/Someday isn’t available for one time of a routine.*Skip this time.*routine itself/)
  })

  it('goals get no days or times — only goal verbs', () => {
    for (const kind of ['period-goal', 'year-goal'] as const) {
      const l = labels(kind)
      for (const w of ['Today', 'Tonight', 'Tomorrow', 'This week', 'Next week', 'Pick date & time…', 'Skip this day']) expect(l).not.toContain(w)
    }
    expect(periodMoves('month', 'November').map((m) => m.label)).toEqual(['Carry to next month · November', 'Remove from this month'])
    expect(periodMoves('year').map((m) => m.label)).toEqual(['Archive goal'])
  })

  it('a calendar event never gets task triage', () => {
    expect(labels('event')).toEqual(['Open details'])
  })

  it('a finished thing reopens before it is rescheduled', () => {
    expect(labels('dated-task', true)).toEqual(['Reopen', 'Open details', 'People…', 'Life area…', 'Move under…', 'Delete'])
  })
})

describe('where each When lands', () => {
  // Monday Oct 12 2026.
  const clock = (weekStartsOn: 0 | 1 | 6, now = new Date(2026, 9, 12, 9)): TriageClock => ({ now, weekStartsOn, seasons: DEFAULT_SEASONS })

  it('Tomorrow names its date', () => {
    expect(whenDetail('tomorrow', clock(0))).toBe('Tue, Oct 13')
    expect(describeWhen('tomorrow', clock(0))).toBe('Moved to Tomorrow · Tue, Oct 13')
  })

  it('weeks follow the household week start', () => {
    expect(whenDetail('this-week', clock(6))).toBe('Oct 10–16')
    expect(whenDetail('next-week', clock(6))).toBe('Oct 17–23')
    expect(whenDetail('this-week', clock(1))).toBe('Oct 12–18')
    expect(whenDetail('next-week', clock(0))).toBe('Oct 18–24')
  })

  it('a weekend is Saturday–Sunday whatever the week start; a Sunday is still this weekend', () => {
    expect(whenDetail('this-weekend', clock(6))).toBe('Oct 17–18')
    expect(whenDetail('next-weekend', clock(6))).toBe('Oct 24–25')
    expect(resolveWhen('this-weekend', clock(0, new Date(2026, 9, 18, 9)))).toMatchObject({ saturday: new Date(2026, 9, 17) })
  })

  it('months and a season name themselves', () => {
    expect(whenDetail('this-month', clock(0))).toBe('October')
    expect(whenDetail('next-month', clock(0))).toBe('November')
    expect(whenDetail('next-month', clock(0, new Date(2026, 11, 3)))).toBe('January 2027')
    expect(whenDetail('this-season', clock(0))).toBe('Fall 2026')
  })

  it('a period’s days, for an occurrence’s day picker', () => {
    expect(daysOf('next-week', clock(6)).map((d) => d.getDate())).toEqual([17, 18, 19, 20, 21, 22, 23])
    expect(daysOf('next-month', clock(0))).toHaveLength(30)
    expect(daysOf('someday', clock(0))).toEqual([])
  })
})
