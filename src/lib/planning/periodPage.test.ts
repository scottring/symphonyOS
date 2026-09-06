import { describe, it, expect, beforeEach } from 'vitest'
import { periodBounds, isCurrentPeriod, selectPeriodTasks, actionsFor, railLevel, planningPeriod, type PlanLevel } from './periodPage'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import type { Task } from '@/types/task'

const d = (y: number, m: number, day: number) => new Date(y, m, day)
const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`
let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), ...over,
} as Task)

describe('periodBounds', () => {
  beforeEach(() => localStorage.clear())
  it('month: first to first, labelled, with neighbours', () => {
    const b = periodBounds('month', d(2026, 8, 17), DEFAULT_SEASONS)
    expect([ymd(b.start), ymd(b.end), b.label]).toEqual(['2026-9-1', '2026-10-1', 'September 2026'])
    expect(ymd(b.prev)).toBe('2026-8-1')
    expect(ymd(b.next)).toBe('2026-10-1')
  })
  it('season: follows the configured boundaries and wraps the year', () => {
    const b = periodBounds('season', d(2026, 10, 20), DEFAULT_SEASONS)
    expect([ymd(b.start), ymd(b.end), b.label]).toEqual(['2026-9-1', '2026-12-1', 'Fall 2026'])
    expect(ymd(b.prev)).toBe('2026-6-1')
    expect(ymd(b.next)).toBe('2026-12-1')
  })
  it('year: calendar year', () => {
    const b = periodBounds('year', d(2026, 8, 17), DEFAULT_SEASONS)
    expect([ymd(b.start), ymd(b.end), b.label]).toEqual(['2026-1-1', '2027-1-1', '2026'])
  })
})

describe('isCurrentPeriod', () => {
  it('is true only for the period containing today', () => {
    const today = d(2026, 8, 17)
    expect(isCurrentPeriod(periodBounds('month', today, DEFAULT_SEASONS), today)).toBe(true)
    expect(isCurrentPeriod(periodBounds('month', d(2026, 7, 3), DEFAULT_SEASONS), today)).toBe(false)
  })
})

describe('selectPeriodTasks', () => {
  const sep = d(2026, 8, 1); const aug = d(2026, 7, 1)
  const mine = task({ bucket: 'month', monthStart: sep, assignedTo: 'me' })
  const unassigned = task({ bucket: 'month', monthStart: sep })
  const legacy = task({ bucket: 'month' }) // NULL month_start → the current month
  const iris = task({ bucket: 'month', monthStart: sep, assignedTo: 'iris' })
  const august = task({ bucket: 'month', monthStart: aug })
  const weekRow = task({ bucket: 'week' })
  const all = [mine, unassigned, legacy, iris, august, weekRow]

  // The CURRENT period is a pool question: legacy NULL rows belong here.
  it('current month: stamped + legacy rows, scoped to me; other months and buckets stay out', () => {
    const ids = selectPeriodTasks(all, 'month', sep, true, 'me').map((t) => t.id)
    expect(ids).toEqual([mine.id, unassigned.id, legacy.id])
  })
  // A PAST period is a membership question: only rows explicitly placed on it.
  // A legacy row must not repeat in every month you page back to.
  it('a past month: only explicitly placed rows', () => {
    const ids = selectPeriodTasks(all, 'month', aug, false, 'me').map((t) => t.id)
    expect(ids).toEqual([august.id])
  })
  it('season uses the quarter bucket and season_start', () => {
    const fall = d(2026, 9, 1)
    const s = task({ bucket: 'quarter', seasonStart: fall })
    expect(selectPeriodTasks([s, mine], 'season', fall, true, 'me')).toEqual([s])
  })
  it('without a member id nothing is scoped away', () => {
    expect(selectPeriodTasks(all, 'month', sep, true, null)).toHaveLength(4)
  })
})

describe('actionsFor', () => {
  // The verbs a row offers, by fate × kind × whether the period is over.
  it('an open task in the current period: tick, make it a goal', () => {
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false })).toEqual(['complete', 'make-goal'])
  })
  it('an open goal in the current period: tick, make it a task', () => {
    expect(actionsFor({ fate: 'open', isGoal: true, isPast: false })).toEqual(['complete', 'make-task'])
  })
  it('an open task in a PAST period: the look-back verbs', () => {
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: true })).toEqual(['complete', 'keep', 'someday', 'make-goal', 'drop'])
  })
  // A goal is an outcome, not a thing you postpone: no Someday.
  it('an open goal in a PAST period: keep, make it a task, drop — never someday', () => {
    expect(actionsFor({ fate: 'open', isGoal: true, isPast: true })).toEqual(['complete', 'keep', 'make-task', 'drop'])
  })
  it('done and placed-done rows are the win column: nothing to do', () => {
    expect(actionsFor({ fate: 'done', isGoal: false, isPast: true })).toEqual([])
    expect(actionsFor({ fate: 'placed-done', isGoal: false, isPast: true })).toEqual([])
  })
  it('a placed-open row can still be kept or dropped in a look-back, not re-placed', () => {
    expect(actionsFor({ fate: 'placed-open', isGoal: false, isPast: true })).toEqual(['keep', 'drop'])
    expect(actionsFor({ fate: 'placed-open', isGoal: false, isPast: false })).toEqual([])
  })
})

describe('planningPeriod', () => {
  const seasons = DEFAULT_SEASONS
  it('an explicit start wins', () => {
    expect(planningPeriod({ level: 'season', today: new Date(2026, 8, 6), seasons, explicitStart: new Date(2026, 11, 1), countFor: () => 0 }).start).toEqual(new Date(2026, 11, 1))
  })
  it('looks ahead when the current season has ≤14 days left', () => {
    const r = planningPeriod({ level: 'season', today: new Date(2026, 10, 20), seasons, countFor: () => 0 })
    expect(r).toEqual({ start: new Date(2026, 11, 1), lookingAhead: true })
  })
  it('looks ahead when this period is empty and the next has a list', () => {
    const next = new Date(2026, 9, 1)
    const r = planningPeriod({ level: 'month', today: new Date(2026, 8, 6), seasons, countFor: (s) => (s.getTime() === next.getTime() ? 9 : 0) })
    expect(r).toEqual({ start: next, lookingAhead: true })
  })
  it('otherwise the current period', () => {
    expect(planningPeriod({ level: 'month', today: new Date(2026, 8, 6), seasons, countFor: () => 3 })).toEqual({ start: new Date(2026, 8, 1), lookingAhead: false })
  })
  it('the year level never looks ahead', () => {
    expect(planningPeriod({ level: 'year', today: new Date(2026, 11, 28), seasons, countFor: () => 0 })).toEqual({ start: new Date(2026, 0, 1), lookingAhead: false })
  })
})

describe('railLevel', () => {
  it('each page looks at the level above; the year looks at nothing', () => {
    expect(railLevel('month')).toBe('season')
    expect(railLevel('season')).toBe('year')
    expect(railLevel('year')).toBeNull()
  })
})
