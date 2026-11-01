import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// The read the hook makes, recorded; the rows it gets back.
const db = vi.hoisted(() => ({ ors: [] as string[], rows: [] as Record<string, unknown>[] }))
vi.mock('@/lib/supabase', () => {
  const query = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      or: (f: string) => { db.ors.push(f); return chain },
      order: () => chain,
      limit: () => Promise.resolve({ data: db.rows, error: null }),
    }
    return chain
  }
  return {
    supabase: {
      from: () => query(),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => Promise.resolve(),
    },
  }
})

import { useScratchpad } from './useScratchpad'

const row = (id: string, expires_at: string | null) => ({
  id, body: id, kind: 'note', author_member_id: null, status: 'open', resolution: null,
  sent_to_member_id: null, created_at: '2026-11-01T10:00:00Z', resolved_at: null, expires_at,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-09T12:00:00Z'))
  db.ors = []; db.rows = []
})
afterEach(() => { vi.useRealTimers() })

describe('useScratchpad — notes that last a while', () => {
  it('asks only for notes with no end, or an end still ahead', async () => {
    renderHook(() => useScratchpad('me'))
    await waitFor(() => expect(db.ors).toContain('expires_at.is.null,expires_at.gt.2026-11-09T12:00:00.000Z'))
    // The open-or-recently-sorted read is still there beside it.
    expect(db.ors.some((f) => f.startsWith('status.eq.open,resolved_at.gte.'))).toBe(true)
  })

  it('a note whose end has passed is not shown, one with no end or a later end is', async () => {
    db.rows = [row('kept', null), row('later', '2026-11-15T05:00:00Z'), row('gone', '2026-11-08T05:00:00Z')]
    const { result } = renderHook(() => useScratchpad('me'))
    await waitFor(() => expect(result.current.notes.map((n) => n.id)).toEqual(['kept', 'later']))
  })
})
