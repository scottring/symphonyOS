import { describe, it, expect } from 'vitest'
import { periodBounds } from '@/lib/planning/periodPage'
import type { Seasons } from '@/lib/cadence/seasons'
import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'
import { lookBackItems, seasonGoalsOfYear } from './useYearSession'

const SEASONS = [{ name: 'Spring', month: 3, day: 1 }, { name: 'Summer', month: 6, day: 1 }, { name: 'Fall', month: 9, day: 1 }, { name: 'Winter', month: 12, day: 1 }] as unknown as Seasons
const task = (id: string, goalId: string | undefined, seasonStart: Date, more: Partial<Task> = {}) =>
  ({ id, title: id, bucket: 'quarter', goalId, seasonStart, createdAt: new Date(2026, 0, 1), ...more }) as Task
const goal = (id: string, year: number, more: Partial<Goal> = {}) => ({ id, name: id, year, status: 'active', ...more }) as Goal

describe('seasonGoalsOfYear', () => {
  it('reads every season touching the year with the Season selector, once each, for this year’s goals only', () => {
    const year = periodBounds('year', new Date(2026, 5, 1), SEASONS)
    const tasks = [
      task('winter-in', 'a', new Date(2025, 11, 1)),
      task('spring', 'a', new Date(2026, 2, 1)),
      task('fall', 'b', new Date(2026, 8, 1)),
      task('next-winter', 'a', new Date(2026, 11, 1)),
      task('other-goal', 'z', new Date(2026, 2, 1)),
      task('no-goal', undefined, new Date(2026, 2, 1)),
      task('last-fall', 'a', new Date(2025, 8, 1)),
    ]
    const out = seasonGoalsOfYear(tasks, year, SEASONS, new Date(2026, 9, 11), null, new Set(['a', 'b']))
    expect(out.get('a')?.map((t) => t.id).sort()).toEqual(['next-winter', 'spring', 'winter-in'])
    expect(out.get('b')?.map((t) => t.id)).toEqual(['fall'])
    expect(out.has('z')).toBe(false)
  })
})

describe('lookBackItems', () => {
  it('reads renewed and done from the goals, and let-go from the session only', () => {
    const prev = [goal('p1', 2025), goal('p2', 2025, { status: 'completed' }), goal('p3', 2025), goal('p4', 2025)]
    const items = lookBackItems(prev, [goal('n1', 2026, { carriedFrom: 'p1' })], { p3: 'left', p4: 'renewed' })
    expect(items.map((i) => [i.goal.id, i.done, i.renewedAs?.id ?? null, i.left, i.decided])).toEqual([
      ['p1', false, 'n1', false, true],
      ['p2', true, null, false, true],
      ['p3', false, null, true, true],
      // A stale verdict is not a renewal: only a goal for this year is.
      ['p4', false, null, false, false],
    ])
  })
})
