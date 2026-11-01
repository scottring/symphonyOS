import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[] }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ insert: (r: Record<string, unknown>) => { db.inserts.push(r); return Promise.resolve({ error: null }) } }) },
}))

import { addScratchpadNote } from './addScratchpadNote'

beforeEach(() => { db.inserts = [] })

describe('addScratchpadNote', () => {
  it('a note with an end carries it; one without has no end', async () => {
    const end = new Date(2026, 10, 8)
    expect(await addScratchpadNote('me', 'Grandma visits', 'note', 'm1', end)).toBe(true)
    expect(await addScratchpadNote('me', 'Call back', 'talk', null)).toBe(true)
    expect(db.inserts).toEqual([
      { user_id: 'me', body: 'Grandma visits', kind: 'note', author_member_id: 'm1', expires_at: end.toISOString() },
      { user_id: 'me', body: 'Call back', kind: 'talk', author_member_id: null },
    ])
  })
})
