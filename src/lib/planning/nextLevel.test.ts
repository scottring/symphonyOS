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
