import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Task } from '@/types/task'
import { buildShelf } from './weekShelf'

// Paper-style horizons (spec 2026-11-04): the Week's own list is flat, in the
// week's order, and nothing on it is filtered or grouped by is_goal or by
// what it was written for.

const weekStart = new Date(2026, 10, 1) // Sun Nov 1 – Sat Nov 7
const now = new Date(2026, 10, 4, 9)
const onWeek = [{ level: 'week', periodStart: weekStart, status: 'open' }] as Task['commitments']
const task = (x: Partial<Task>) => ({ id: 't', title: 'T', completed: false, createdAt: new Date(2026, 9, 1), bucket: 'week', weekStart, commitments: onWeek, ...x }) as Task

describe('buildShelf', () => {
  // Finding #15: Today's week column held "Plan winter vacation" (a month line
  // marked is_goal, committed to this week) and the Week's own list did not.
  it('keeps an is_goal task committed to this week with no day (#15)', () => {
    const goal = task({ id: 'g', title: 'Plan winter vacation', isGoal: true })
    const rows = buildShelf({ weekTasks: [goal], weekStart, now }).flatMap((g) => g.rows)
    expect(rows.map((r) => r.task.id)).toEqual(['g'])
  })

  it('is one flat list in the week’s own order, whatever each row was written for', () => {
    const line = task({ id: 'm1', title: 'Plan the autumn trip', bucket: 'month' })
    const cabin = task({ id: 'a', title: 'Book the cabin', sourceId: 'm1' })
    const bank = task({ id: 'b', title: 'Call the bank' })
    const car = task({ id: 'c', title: 'Service the car', goalTaskId: 'm1' })
    const g = buildShelf({ weekTasks: [cabin, bank, car, line], weekStart, now })
    expect(g).toHaveLength(1)
    expect(g[0].rows.map((r) => r.task.id)).toEqual(['a', 'b', 'c', 'm1'])
  })

  it('leaves placed work on its day and keeps done rows apart', () => {
    const placed = task({ id: 'p', title: 'Pick up the keys', scheduledFor: new Date(2026, 10, 5), isAllDay: true })
    const done = task({ id: 'd', title: 'Buy maps', completed: true })
    const g = buildShelf({ weekTasks: [placed, done], weekStart, now })
    expect(g.flatMap((x) => x.rows)).toEqual([])
    expect(g.flatMap((x) => x.done).map((r) => r.task.id)).toEqual(['d'])
  })

  it('a day that passed undone comes back with a quiet “from Mon”', () => {
    const missed = task({ id: 'm', title: 'Return books', scheduledFor: new Date(2026, 10, 2), isAllDay: true })
    expect(buildShelf({ weekTasks: [missed], weekStart, now })[0].rows[0].meta).toBe('from Mon')
  })
})

// The tray (Scott, 2026-11-07): each card says where it came from, and the
// tray's foot tallies how the week has moved through it.
describe('buildShelf, the tray', () => {
  it('a card written minutes ago reads “just added”', () => {
    const fresh = task({ id: 'n', title: 'Email Ms. Kroger', createdAt: new Date(2026, 10, 4, 8, 55) })
    expect(buildShelf({ weekTasks: [fresh], weekStart, now })[0].rows[0].meta).toBe('just added')
  })

  it('a card brought down from the month reads “from November”', () => {
    const fromMonth = task({ id: 'm', title: 'Choose a kitchen weekend',
      commitments: [...onWeek!, { level: 'month', periodStart: new Date(2026, 10, 1), status: 'open' }] as Task['commitments'] })
    expect(buildShelf({ weekTasks: [fromMonth], weekStart, now })[0].rows[0].meta).toBe('from November')
  })

  it('tallies the week: everything on it, what has a day, what is done', () => {
    const placed = task({ id: 'p', scheduledFor: new Date(2026, 10, 5), isAllDay: true })
    const placedDone = task({ id: 'pd', scheduledFor: new Date(2026, 10, 3), isAllDay: true, completed: true })
    const loose = task({ id: 'l' })
    const done = task({ id: 'd', completed: true })
    expect(buildShelf({ weekTasks: [placed, placedDone, loose, done], weekStart, now })[0].flow).toEqual({ in: 4, onDays: 2, done: 2 })
  })
})

// The week of Sat Oct 31, 2026 holds the clock change (Nov 1, America/New_York).
// Counted in 24-hour steps its sixth day ended on Thursday, so a task given
// Friday Nov 6 stayed in Sometime this week while Today showed it on Friday
// (Scott, 2026-11-06).
describe('buildShelf across the clock change', () => {
  const tz = process.env.TZ
  beforeAll(() => { process.env.TZ = 'America/New_York' })
  afterAll(() => { process.env.TZ = tz })

  it('puts a task given the week’s last day on that day, not in Sometime', () => {
    const start = new Date(2026, 9, 31) // Sat Oct 31
    const friday = task({ id: 'f', title: 'Text Mike', weekStart: start, scheduledFor: new Date(2026, 10, 6), isAllDay: true,
      commitments: [{ level: 'week', periodStart: start, status: 'open' }] as Task['commitments'] })
    const rows = buildShelf({ weekTasks: [friday], weekStart: start, now: new Date(2026, 10, 6, 11) }).flatMap((g) => g.rows)
    expect(rows).toEqual([])
  })
})
