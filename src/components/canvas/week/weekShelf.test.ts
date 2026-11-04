import { describe, it, expect } from 'vitest'
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
