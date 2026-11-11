import { describe, it, expect } from 'vitest'
import { listTasksQuery } from './listTasks.ts'

// A chainable fake that records each filter call.
function fakeDb() {
  const calls: [string, ...unknown[]][] = []
  const q: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['select', 'order', 'eq', 'is', 'ilike', 'gte', 'lte', 'lt', 'limit']) {
    q[m] = (...a: unknown[]) => { calls.push([m, ...a]); return q }
  }
  return { calls, db: { from: () => q } }
}

describe('symphony_list_tasks — let go is off every list (final review)', () => {
  it('leaves out let-go rows (dismissed_at set) on an ordinary list', () => {
    const { calls, db } = fakeDb()
    listTasksQuery(db, { bucket: 'week' })
    expect(calls).toContainEqual(['is', 'dismissed_at', null])
    expect(calls).toContainEqual(['eq', 'bucket', 'week'])
  })
  it('a title search still finds them', () => {
    const { calls, db } = fakeDb()
    listTasksQuery(db, { search: 'vacation' })
    expect(calls).toContainEqual(['ilike', 'title', '%vacation%'])
    expect(calls.some(([m, col]) => m === 'is' && col === 'dismissed_at')).toBe(false)
  })
})

describe('symphony_list_tasks — the person\'s day and the stated cap (AI audit 2026-11-11)', () => {
  it('a scheduled_for day means the Eastern day, not the UTC date', () => {
    const { calls, db } = fakeDb()
    listTasksQuery(db, { scheduled_for: '2026-11-11' })
    expect(calls).toContainEqual(['gte', 'scheduled_for', '2026-11-11T05:00:00.000Z'])
    expect(calls).toContainEqual(['lt', 'scheduled_for', '2026-11-12T05:00:00.000Z'])
  })
  it('clamps the limit to 1..50', () => {
    for (const [asked, got] of [[500, 50], [0, 1], [12, 12], [undefined, 50]] as const) {
      const { calls, db } = fakeDb()
      listTasksQuery(db, { limit: asked })
      expect(calls).toContainEqual(['limit', got])
    }
  })
  it('order_by list reads the Week list order', () => {
    const { calls, db } = fakeDb()
    listTasksQuery(db, { bucket: 'week', order_by: 'list' })
    expect(calls).toContainEqual(['order', 'sort_order', { ascending: true, nullsFirst: false }])
  })
})
