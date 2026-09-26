import { describe, it, expect, beforeEach } from 'vitest'
import { nextLevelChoices } from './nextLevel'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import type { Task } from '@/types/task'

let n = 0
const task = (over: Partial<Task>): Task => ({ id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), ...over } as Task)
const SEP = (d: number) => new Date(2026, 8, d)
const today = SEP(10)

describe('nextLevelChoices — the way down from a plan page', () => {
  beforeEach(() => localStorage.clear())

  it('a month lists its weeks with the WEEK page\'s own count; goals are never counted onto a week', () => {
    const tasks = [
      task({ isGoal: true, bucket: 'month', monthStart: SEP(1) }),
      task({ bucket: 'week', weekStart: SEP(13), commitments: [{ level: 'week', periodStart: SEP(13), status: 'open' }] }),
      task({ bucket: 'week', weekStart: SEP(13), completed: true, commitments: [{ level: 'week', periodStart: SEP(13), status: 'open' }] }),
      task({ bucket: 'week', weekStart: SEP(13), assignedTo: 'iris', assignedToAll: ['iris'], commitments: [{ level: 'week', periodStart: SEP(13), status: 'open' }] }),
    ]
    const weeks = nextLevelChoices('month', { start: SEP(1), end: new Date(2026, 9, 1) }, tasks, 'me', DEFAULT_SEASONS, today)
    const w13 = weeks.find((w) => w.href === '/week?start=2026-09-13')!
    expect(w13.open).toBe(1)
    expect(weeks.find((w) => w.current)?.href).toBe('/week?start=2026-09-06')
    expect(weeks.every((w) => w.level === 'week')).toBe(true)
  })

  it('a season lists its months, a year its seasons', () => {
    const months = nextLevelChoices('season', { start: SEP(1), end: new Date(2026, 11, 1) }, [], null, DEFAULT_SEASONS, today)
    expect(months.map((m) => m.label)).toEqual(['September', 'October', 'November'])
    expect(months[1].href).toBe('/month?start=2026-10-01')
    const seasons = nextLevelChoices('year', { start: new Date(2026, 0, 1), end: new Date(2027, 0, 1) }, [], null, DEFAULT_SEASONS, today)
    expect(seasons.every((s) => s.level === 'season' && s.href.startsWith('/season?start='))).toBe(true)
    expect(seasons.filter((s) => s.current)).toHaveLength(1)
  })
})

describe('nextLevelChoices at month and year boundaries', () => {
  const at = new Date(2026, 8, 26)
  it('Year 2026 names both Winters it touches, so they cannot be confused', () => {
    const seasons = nextLevelChoices('year', { start: new Date(2026, 0, 1), end: new Date(2027, 0, 1) }, [], null, DEFAULT_SEASONS, at)
    expect(seasons.map((s) => s.label)).toEqual(['Winter 2025–26', 'Spring', 'Summer', 'Fall', 'Winter 2026–27'])
    expect(seasons.map((s) => s.href)).toEqual(['/season?start=2025-12-01', '/season?start=2026-03-01', '/season?start=2026-06-01', '/season?start=2026-09-01', '/season?start=2026-12-01'])
    expect(new Set(seasons.map((s) => s.label)).size).toBe(seasons.length)
  })
  it('a Winter season names the months of the next year with their year', () => {
    const months = nextLevelChoices('season', { start: new Date(2026, 11, 1), end: new Date(2027, 2, 1) }, [], null, DEFAULT_SEASONS, at)
    expect(months.map((m) => m.label)).toEqual(['December', 'January 2027', 'February 2027'])
    expect(months[1].href).toBe('/month?start=2027-01-01')
  })
  it('December includes the week that crosses into January, and counts it as the Week page does', () => {
    const DEC27 = new Date(2026, 11, 27)
    const onIt = { bucket: 'week' as const, weekStart: DEC27, commitments: [{ level: 'week' as const, periodStart: DEC27, status: 'open' as const }] }
    const tasks = [task(onIt), task({ ...onIt, scheduledFor: new Date(2027, 0, 1), bucket: 'timed' })]
    const weeks = nextLevelChoices('month', { start: new Date(2026, 11, 1), end: new Date(2027, 0, 1) }, tasks, null, DEFAULT_SEASONS, at)
    const last = weeks.at(-1)!
    expect(last).toMatchObject({ label: 'Dec 27 – Jan 2', href: '/week?start=2026-12-27', open: 2 })
    expect(weeks[0].href).toBe('/week?start=2026-11-29')
  })
  it('a week shared by two months shows the same count on both — it is one week', () => {
    const NOV29 = new Date(2026, 10, 29)
    const tasks = [task({ bucket: 'week', weekStart: NOV29, commitments: [{ level: 'week', periodStart: NOV29, status: 'open' }] })]
    const nov = nextLevelChoices('month', { start: new Date(2026, 10, 1), end: new Date(2026, 11, 1) }, tasks, null, DEFAULT_SEASONS, at)
    const dec = nextLevelChoices('month', { start: new Date(2026, 11, 1), end: new Date(2027, 0, 1) }, tasks, null, DEFAULT_SEASONS, at)
    expect(nov.find((w) => w.href === '/week?start=2026-11-29')?.open).toBe(1)
    expect(dec.find((w) => w.href === '/week?start=2026-11-29')?.open).toBe(1)
  })
})
