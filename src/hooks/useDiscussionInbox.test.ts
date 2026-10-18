import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const db = vi.hoisted(() => ({
  sessions: [] as unknown[],
  reads: [] as unknown[],
  realtime: { filter: null as unknown, cb: null as null | (() => void) },
  calls: [] as string[],
  hold: null as null | Promise<void>,
}))

vi.mock('@/lib/supabase', () => {
  const table = (rows: () => unknown[]) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: self, eq: self, order: self, limit: self,
      then: (resolve: (v: unknown) => void) => {
        if (db.hold) void db.hold.then(() => resolve({ data: rows(), error: null }))
        else resolve({ data: rows(), error: null })
      },
    })
    return chain
  }
  return {
    getAuthUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    supabase: {
      from: (name: string) => { db.calls.push(name); return name === 'chat_sessions' ? table(() => db.sessions) : table(() => db.reads) },
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
import { __resetSharedRequests } from '@/lib/sharedRequest'
import { __resetLoadPriority, markPageDataLoaded } from '@/lib/loadPriority'

const iris = { id: 'u2', name: 'Iris', kind: 'member' }
const scott = { id: 'u1', name: 'Scott', kind: 'member' }

describe('useDiscussionInbox', () => {
  beforeEach(() => {
    db.sessions = []
    db.reads = []
    db.realtime = { filter: null, cb: null }
    db.calls = []
    db.hold = null
    __resetSharedRequests()
    __resetLoadPriority(false)
  })

  it('instances mounting together share one load, its three reads asked at once', async () => {
    // The top bar, Today, Home and an item label each made their own three
    // trips, one after another (prod, 2026-10-18: chat_sessions ×4 on a load).
    let release!: () => void
    db.hold = new Promise<void>((r) => { release = r })
    const a = renderHook(() => useDiscussionInbox())
    const b = renderHook(() => useDiscussionInbox())
    await waitFor(() => expect(db.calls).toHaveLength(3))
    // All three were asked before any answered.
    expect([...db.calls].sort()).toEqual(['chat_session_reads', 'chat_sessions', 'family_members'])
    await act(async () => { release() })
    await waitFor(() => expect(a.result.current.loading).toBe(false))
    await waitFor(() => expect(b.result.current.loading).toBe(false))
    expect(db.calls.filter((c) => c === 'chat_sessions')).toHaveLength(1)
  })

  it('a deferred caller (the top bar badge) waits for the page data', async () => {
    __resetLoadPriority(true)
    const { result } = renderHook(() => useDiscussionInbox({ defer: true }))
    await act(async () => { await Promise.resolve() })
    expect(db.calls).toHaveLength(0)
    await act(async () => { markPageDataLoaded() })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(db.calls).toContain('chat_sessions')
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
