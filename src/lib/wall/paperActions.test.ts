import { describe, it, expect, vi } from 'vitest'
import { claimPaper, paperInBackpack, paperNotOurs } from './paperActions'

// One update per action on the paper's own row (spec 2026-10-20).
function client(error: unknown = null) {
  const calls: { table: string; patch: Record<string, unknown>; id: unknown }[] = []
  const db = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: vi.fn(async (_col: string, id: unknown) => { calls.push({ table, patch, id }); return { error } }),
      }),
    }),
  }
  return { db, calls }
}
const NOW = new Date('2026-10-20T21:00:00Z')

describe('paper actions', () => {
  it('I have it records who has the paper', async () => {
    const { db, calls } = client()
    expect(await claimPaper(db, 'p1', 'iris')).toBe(true)
    expect(calls).toEqual([{ table: 'tasks', patch: { held_by: 'iris' }, id: 'p1' }])
  })

  it('In backpack completes it, stamped', async () => {
    const { db, calls } = client()
    expect(await paperInBackpack(db, 'p1', NOW)).toBe(true)
    expect(calls).toEqual([{ table: 'tasks', patch: { completed: true, completed_at: NOW.toISOString() }, id: 'p1' }])
  })

  it('Not ours dismisses it, kept for the dedupe', async () => {
    const { db, calls } = client()
    expect(await paperNotOurs(db, 'p1', NOW)).toBe(true)
    // Closed too, so the phone app (which reads every open task) drops it.
    expect(calls).toEqual([{ table: 'tasks', patch: { dismissed_at: NOW.toISOString(), completed: true, completed_at: NOW.toISOString() }, id: 'p1' }])
  })

  it('says so when the write fails', async () => {
    const { db } = client({ message: 'nope' })
    expect(await claimPaper(db, 'p1', 'iris')).toBe(false)
  })
})
