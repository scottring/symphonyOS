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
  it('HORIZONS lists the five rhythm rungs + someday in order', () => {
    expect(HORIZONS.map(h => h.id)).toEqual(['today', 'week', 'month', 'season', 'year', 'someday'])
  })
})
