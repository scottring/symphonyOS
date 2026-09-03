import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const db = vi.hoisted(() => ({
  session: null as null | { id: string; messages: unknown[] },
  read: null as null | { last_read_at: string },
  realtime: { filter: null as unknown, cb: null as null | (() => void) },
}))

vi.mock('@/lib/supabase', () => {
  const table = (rows: () => unknown[]) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: self, eq: self, limit: self,
      then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
    })
    return chain
  }
  return {
    getAuthUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    supabase: {
      from: (name: string) => name === 'chat_sessions'
        ? table(() => (db.session ? [db.session] : []))
        : table(() => (db.read ? [db.read] : [])),
      channel: () => {
        const ch = {
          on: (_e: string, filter: unknown, cb: () => void) => { db.realtime = { filter, cb }; return ch },
          subscribe: () => ch,
        }
        return ch
      },
      removeChannel: vi.fn(),
    },
  }
})

import { useThreadUnread } from './useThreadUnread'

const iris = { id: 'u2', name: 'Iris', kind: 'member' }

describe('useThreadUnread', () => {
  beforeEach(() => {
    db.session = null
    db.read = null
    db.realtime = { filter: null, cb: null }
  })

  it('is false when the item has no thread', async () => {
    const { result } = renderHook(() => useThreadUnread('task', 't1'))
    await waitFor(() => expect(db.realtime.cb).not.toBeNull())
    expect(result.current).toBe(false)
  })

  it('is true when a partner posted after my stamp, and flips live', async () => {
    db.session = { id: 's1', messages: [
      { role: 'user', content: 'hi', timestamp: '2026-09-02T10:00:00Z', author: iris },
    ] }
    db.read = { last_read_at: '2026-09-02T09:00:00Z' }
    const { result } = renderHook(() => useThreadUnread('task', 't1'))
    await waitFor(() => expect(result.current).toBe(true))
    expect(db.realtime.filter).toMatchObject({ table: 'chat_sessions', filter: 'entity_id=eq.t1' })

    db.read = { last_read_at: '2026-09-02T11:00:00Z' }
    db.realtime.cb?.()
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('is false for a thread whose last word is mine', async () => {
    db.session = { id: 's1', messages: [
      { role: 'user', content: 'hi', timestamp: '2026-09-02T10:00:00Z', author: iris },
      { role: 'user', content: 'on it', timestamp: '2026-09-02T10:05:00Z', author: { id: 'u1', name: 'Scott', kind: 'member' } },
    ] }
    const { result } = renderHook(() => useThreadUnread('task', 't1'))
    await waitFor(() => expect(db.realtime.cb).not.toBeNull())
    expect(result.current).toBe(false)
  })
})
