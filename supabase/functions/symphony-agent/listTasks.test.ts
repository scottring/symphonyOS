import { describe, it, expect } from 'vitest'
import { listTasksQuery } from './listTasks.ts'

// A chainable fake that records each filter call.
function fakeDb() {
  const calls: [string, ...unknown[]][] = []
  const q: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['select', 'order', 'eq', 'is', 'ilike', 'gte', 'lte', 'limit']) {
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
