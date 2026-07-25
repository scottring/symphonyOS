import { describe, it, expect } from 'vitest'
import { selectHorizonPool, HORIZONS } from './horizons'
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
