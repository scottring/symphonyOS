import { describe, expect, it } from 'vitest'
import { pointAt } from './pointing'

const A = '0b8e7c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d'

describe('pointAt', () => {
  it('keeps real dates and task ids', () => {
    expect(pointAt({ dates: ['2026-10-18', '2026-10-19'], task_ids: [A] })).toEqual({ dates: ['2026-10-18', '2026-10-19'], taskIds: [A] })
  })
  it('drops bad values; nothing left is an error', () => {
    expect(pointAt({ dates: ['2026-02-30', 'Sunday'], task_ids: ['nope'] })).toEqual({ error: 'Point at real YYYY-MM-DD dates or task ids' })
    expect(pointAt({})).toEqual({ error: 'Point at real YYYY-MM-DD dates or task ids' })
  })
  it('clearing is allowed: an explicit empty point', () => {
    expect(pointAt({ clear: true })).toEqual({ dates: [], taskIds: [] })
  })
  it('caps at 7 dates and 12 tasks', () => {
    const r = pointAt({ dates: Array.from({ length: 10 }, (_, i) => `2026-10-${String(10 + i).padStart(2, '0')}`), task_ids: Array.from({ length: 20 }, () => A) })
    if ('error' in r) throw new Error(r.error)
    expect(r.dates).toHaveLength(7)
    expect(r.taskIds).toHaveLength(1) // de-duplicated
  })
})
