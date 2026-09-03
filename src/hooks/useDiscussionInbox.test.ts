import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const db = vi.hoisted(() => ({
  sessions: [] as unknown[],
  reads: [] as unknown[],
  realtime: { filter: null as unknown, cb: null as null | (() => void) },
}))

vi.mock('@/lib/supabase', () => {
  const table = (rows: () => unknown[]) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: self, eq: self, order: self, limit: self,
      then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
    })
    return chain
  }
  return {
    getAuthUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    supabase: {
      from: (name: string) => name === 'chat_sessions' ? table(() => db.sessions) : table(() => db.reads),
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

import { useDiscussionInbox } from './useDiscussionInbox'
import { emitThreadRead } from '@/lib/discussions/readSignal'

const iris = { id: 'u2', name: 'Iris', kind: 'member' }
const scott = { id: 'u1', name: 'Scott', kind: 'member' }

describe('useDiscussionInbox', () => {
  beforeEach(() => {
    db.sessions = []
    db.reads = []
    db.realtime = { filter: null, cb: null }
  })

  it('lists threads with activity and counts the ones waiting on me', async () => {
    db.sessions = [
      { id: 's1', entity_type: 'task', entity_id: 't1', title: 'Dentist', updated_at: '2026-09-02T10:00:00Z',
        messages: [{ role: 'user', content: 'Can you take her?', timestamp: '2026-09-02T10:00:00Z', author: iris }] },
      { id: 's2', entity_type: 'routine', entity_id: 'r1', title: 'Laundry', updated_at: '2026-09-02T09:00:00Z',
        messages: [{ role: 'user', content: 'done', timestamp: '2026-09-02T09:00:00Z', author: scott }] },
      { id: 's3', entity_type: 'task', entity_id: 't3', title: 'Empty', updated_at: '2026-09-02T11:00:00Z', messages: [] },
    ]
    const { result } = renderHook(() => useDiscussionInbox())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows.map((r) => r.sessionId)).toEqual(['s1', 's2'])
    expect(result.current.unreadCount).toBe(1)
  })

  it('reloads when any thread row changes', async () => {
    const { result } = renderHook(() => useDiscussionInbox())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(db.realtime.filter).toMatchObject({ table: 'chat_sessions' })

    db.sessions = [
      { id: 's1', entity_type: 'task', entity_id: 't1', title: 'Dentist', updated_at: '2026-09-02T10:00:00Z',
        messages: [{ role: 'user', content: 'hi', timestamp: '2026-09-02T10:00:00Z', author: iris }] },
    ]
    await act(async () => { db.realtime.cb?.() })
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
  })

  it('drops the badge as soon as a thread is marked read in this tab', async () => {
    db.sessions = [
      { id: 's1', entity_type: 'task', entity_id: 't1', title: 'Dentist', updated_at: '2026-09-02T10:00:00Z',
        messages: [{ role: 'user', content: 'hi', timestamp: '2026-09-02T10:00:00Z', author: iris }] },
    ]
    const { result } = renderHook(() => useDiscussionInbox())
    await waitFor(() => expect(result.current.unreadCount).toBe(1))

    db.reads = [{ session_id: 's1', last_read_at: '2026-09-02T12:00:00Z' }]
    await act(async () => { emitThreadRead('s1') })
    await waitFor(() => expect(result.current.unreadCount).toBe(0))
  })
})
