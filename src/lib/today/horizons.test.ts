import { describe, it, expect } from 'vitest'
import { selectHorizonPool, selectStaleWeekPlacements, HORIZONS } from './horizons'
import type { Task } from '@/types/task'

const t = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36), title: 'x', completed: false, bucket: 'inbox',
  createdAt: new Date(), updatedAt: new Date(), ...over,
})
const matchAll = () => true

describe('selectHorizonPool', () => {
  it('this-week pool = bucket "week", incomplete, matched', () => {
    const tasks = [t({ bucket: 'week' }), t({ bucket: 'month' }), t({ bucket: 'week', completed: true })]
    expect(selectHorizonPool(tasks, 'week', matchAll).map(x => x.bucket)).toEqual(['week'])
  })
  it('this-season pool = bucket "quarter"', () => {
    expect(selectHorizonPool([t({ bucket: 'quarter' }), t({ bucket: 'someday' })], 'season', matchAll)).toHaveLength(1)
  })
  it('someday pool = bucket "someday" (NOT quarter)', () => {
    expect(selectHorizonPool([t({ bucket: 'someday' }), t({ bucket: 'quarter' })], 'someday', matchAll)).toHaveLength(1)
  })
  it('respects the assignee match fn', () => {
    const mine = t({ bucket: 'week', assignedTo: 'me' })
    const hers = t({ bucket: 'week', assignedTo: 'iris' })
    const onlyMine = (a: string | null | undefined) => a === 'me'
    expect(selectHorizonPool([mine, hers], 'week', onlyMine)).toEqual([mine])
  })
  // ── The week horizon is scoped to ONE week once week_start is written. ──
  describe('week scoping', () => {
    const JUL_19 = new Date(2026, 6, 19)
    const JUL_26 = new Date(2026, 6, 26)

    it('includes a task placed on the viewed week', () => {
      const task = t({ bucket: 'week', title: 'this week', weekStart: JUL_19 })
      expect(selectHorizonPool([task], 'week', matchAll, JUL_19)).toEqual([task])
    })

    it('excludes a task placed on a different week', () => {
      const task = t({ bucket: 'week', title: 'next week', weekStart: JUL_26 })
      expect(selectHorizonPool([task], 'week', matchAll, JUL_19)).toEqual([])
    })

    it('keeps legacy rows (no weekStart) in the pool for any week', () => {
      const legacy = t({ bucket: 'week', title: 'legacy' })
      expect(selectHorizonPool([legacy], 'week', matchAll, JUL_19)).toEqual([legacy])
      expect(selectHorizonPool([legacy], 'week', matchAll, JUL_26)).toEqual([legacy])
    })

    it('omitting the week means any week — the pre-cascade behavior', () => {
      const tasks = [t({ bucket: 'week', weekStart: JUL_19 }), t({ bucket: 'week', weekStart: JUL_26 })]
      expect(selectHorizonPool(tasks, 'week', matchAll)).toHaveLength(2)
    })

    it('does not scope the month or season pools', () => {
      const monthMove = t({ bucket: 'month', weekStart: JUL_26 })
      expect(selectHorizonPool([monthMove], 'month', matchAll, JUL_19)).toEqual([monthMove])
    })
  })

  it('HORIZONS lists the five rhythm rungs + someday in order', () => {
    expect(HORIZONS.map(h => h.id)).toEqual(['today', 'week', 'month', 'season', 'year', 'someday'])
  })
})

// ── The week rung's carry-over: nothing rolls a stale placement forward on its
// own, so this selector is the only thing that puts it back in front of you. ──
describe('selectStaleWeekPlacements', () => {
  const week = (d: number) => new Date(2026, 6, d)

  it('picks up only week placements whose week has passed', () => {
    const left = t({ id: 'left', bucket: 'week', weekStart: week(12) })
    const tasks = [
      left,
      t({ id: 'now', bucket: 'week', weekStart: week(19) }),
      t({ id: 'later', bucket: 'week', weekStart: week(26) }),
      t({ id: 'legacy', bucket: 'week' }),
      t({ id: 'month', bucket: 'month', weekStart: week(12) }),
      t({ id: 'done', bucket: 'week', weekStart: week(12), completed: true }),
    ]
    expect(selectStaleWeekPlacements(tasks, week(19), matchAll)).toEqual([left])
  })

  it('returns the oldest first — the thing ignored longest asks first', () => {
    const tasks = [
      t({ id: 'jul5', bucket: 'week', weekStart: week(5) }),
      t({ id: 'jun28', bucket: 'week', weekStart: new Date(2026, 5, 28) }),
      t({ id: 'jul12', bucket: 'week', weekStart: week(12) }),
    ]
    expect(selectStaleWeekPlacements(tasks, week(19), matchAll).map((x) => x.id))
      .toEqual(['jun28', 'jul5', 'jul12'])
  })

  it('respects the assignee match fn', () => {
    const mine = t({ id: 'mine', bucket: 'week', weekStart: week(12), assignedTo: 'me' })
    const hers = t({ id: 'hers', bucket: 'week', weekStart: week(12), assignedTo: 'iris' })
    const onlyMine = (a: string | null | undefined) => a === 'me'
    expect(selectStaleWeekPlacements([mine, hers], week(19), onlyMine)).toEqual([mine])
  })

  // The pool and the carry-over must partition, not overlap: an item showing in
  // both would render twice on the one-surface week page.
  it('is disjoint from the week pool', () => {
    const left = t({ id: 'left', bucket: 'week', weekStart: week(12) })
    expect(selectHorizonPool([left], 'week', matchAll, week(19))).toEqual([])
    expect(selectStaleWeekPlacements([left], week(19), matchAll)).toEqual([left])
  })
})
