import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { onThreadRead } from '@/lib/discussions/readSignal'

vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: vi.fn(),
}))

const db = vi.hoisted(() => ({
  /** What ensure_discuss_thread returns. */
  threadId: 'thr-1' as string | null,
  ensureError: null as { message: string } | null,
  /** The stored chat_sessions row, keyed by id. */
  rows: {} as Record<string, { id: string; messages: unknown[]; scope: string; user_id: string }>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  members: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  realtime: { filter: null as unknown, cb: null as null | (() => void) },
  removed: 0,
}))

vi.mock('@/lib/supabase', () => {
  const familyChain: Record<string, unknown> = {}
  const self = () => familyChain
  Object.assign(familyChain, {
    select: self, eq: self, or: self, order: self, limit: self,
    then: (resolve: (v: unknown) => void) => resolve({ data: db.members, error: null }),
  })

  return {
    getAuthUser: async () => ({ data: { user: { id: 'u1', email: 'scott@example.com' } }, error: null }),
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      rpc: (fn: string, args: Record<string, unknown>) => {
        db.rpcCalls.push({ fn, args })
        if (fn === 'ensure_discuss_thread') {
          return Promise.resolve({ data: db.ensureError ? null : db.threadId, error: db.ensureError })
        }
        if (fn === 'append_chat_message') {
          const row = db.rows[args.p_session as string]
          if (row) row.messages = [...row.messages, args.p_message]
          return Promise.resolve({ data: null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      from: (table: string) => {
        if (table === 'chat_session_reads') {
          return {
            upsert: (row: Record<string, unknown>) => {
              db.upserts.push({ table, row })
              return Promise.resolve({ data: null, error: null })
            },
          }
        }
        if (table !== 'chat_sessions') return familyChain
        const chain: Record<string, unknown> = {}
        const back = () => chain
        Object.assign(chain, {
          select: back,
          eq: back,
          order: back,
          limit: back,
          single: () => {
            const row = Object.values(db.rows)[0]
            return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'no rows' } })
          },
        })
        return chain
      },
      channel: (name: string) => {
        const ch = {
          name,
          on: (_event: string, filter: unknown, cb: () => void) => {
            db.realtime.filter = filter
            db.realtime.cb = cb
            return ch
          },
          subscribe: () => ch,
        }
        return ch
      },
      removeChannel: () => { db.removed += 1 },
    },
  }
})

import { streamSymphonyAgent } from '@/lib/agentStream'
import { useDiscussThread, DISCUSS_UNAVAILABLE, type DiscussEntity } from '@/hooks/useDiscussThread'

const familyTask: DiscussEntity = {
  type: 'task', id: 't1', title: 'Book the dentist', scope: 'compound',
}

function seedRow(messages: unknown[] = []) {
  db.rows = { 'thr-1': { id: 'thr-1', messages, scope: 'compound', user_id: 'u1' } }
}

describe('useDiscussThread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.threadId = 'thr-1'
    db.ensureError = null
    db.rpcCalls = []
    db.upserts = []
    db.realtime = { filter: null, cb: null }
    db.removed = 0
    db.members = [{
      id: 'm1', user_id: 'u1', auth_user_id: 'u1', name: 'Scott', initials: 'SK',
      color: 'blue', avatar_url: null, is_full_user: true, display_order: 0,
      member_type: 'core', created_at: '2026-01-01T00:00:00Z',
    }]
    seedRow()
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onText?.('Try Tuesday.')
      h.onDone?.('Try Tuesday.', null)
    })
  })

  it('ensures the thread on mount with the derived scope', async () => {
    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.threadId).toBe('thr-1'))
    const ensure = db.rpcCalls.find((c) => c.fn === 'ensure_discuss_thread')
    expect(ensure?.args).toEqual({
      p_entity_type: 'task',
      p_entity_id: 't1',
      p_title: 'Book the dentist',
      p_scope: 'compound',
    })
  })

  it('makes no calls when the entity is null', async () => {
    const { result } = renderHook(() => useDiscussThread(null))
    await act(async () => {})
    expect(db.rpcCalls).toHaveLength(0)
    expect(result.current.threadId).toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it('reports the thread unavailable when the ensure RPC fails', async () => {
    db.ensureError = { message: 'function ensure_discuss_thread does not exist' }
    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.error).toBe(DISCUSS_UNAVAILABLE))
    expect(result.current.threadId).toBeNull()
  })

  it('hydrates legacy messages that carry no author', async () => {
    seedRow([
      { role: 'user', content: 'what size bulb?', timestamp: '2026-08-01T10:00:00Z' },
      { role: 'assistant', content: 'GU10.', timestamp: '2026-08-01T10:00:05Z' },
    ])
    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages[0].author).toEqual({ id: null, name: 'You', kind: 'member' })
    expect(result.current.messages[1].author).toEqual({ id: null, name: 'Symphony', kind: 'symphony' })
  })

  it('post appends the message stamped with its author and never wakes Symphony', async () => {
    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.threadId).toBe('thr-1'))

    await act(async () => { await result.current.post('When can we go?') })

    const append = db.rpcCalls.filter((c) => c.fn === 'append_chat_message')
    expect(append).toHaveLength(1)
    expect(append[0].args.p_session).toBe('thr-1')
    expect(append[0].args.p_message).toEqual({
      role: 'user',
      content: 'When can we go?',
      timestamp: expect.any(String),
      author: { id: 'u1', name: 'Scott', kind: 'member' },
    })
    expect(streamSymphonyAgent).not.toHaveBeenCalled()
  })

  it('ask marks the question as addressed to Symphony', async () => {
    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.threadId).toBe('thr-1'))

    await act(async () => { await result.current.ask('What should we do first?') })

    const append = db.rpcCalls.filter((c) => c.fn === 'append_chat_message')
    expect(append[0].args.p_message).toMatchObject({
      role: 'user', content: 'What should we do first?', askedSymphony: true,
    })
    expect(streamSymphonyAgent).toHaveBeenCalledTimes(1)
  })

  it('names who else can see the thread from the item scope', async () => {
    db.members = [
      ...db.members,
      { id: 'm2', user_id: 'u1', auth_user_id: 'u2', name: 'Iris', initials: 'I', color: 'red',
        avatar_url: null, is_full_user: false, display_order: 1, member_type: 'core', created_at: '2026-01-01T00:00:00Z' },
    ]
    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.sharedWith).toEqual(['Iris']))

    const solo = renderHook(() => useDiscussThread({ ...familyTask, scope: 'individual' }))
    await waitFor(() => expect(solo.result.current.threadId).toBe('thr-1'))
    expect(solo.result.current.sharedWith).toEqual([])
  })

  it('stamps chat_session_reads once the thread is on screen when markRead is set', async () => {
    seedRow([
      { role: 'user', content: 'hi', timestamp: '2026-08-01T10:00:00Z',
        author: { id: 'u2', name: 'Iris', kind: 'member' } },
    ])
    const { result } = renderHook(() => useDiscussThread(familyTask, { markRead: true }))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(db.upserts[0].row).toMatchObject({ session_id: 'thr-1', user_id: 'u1' })

    const quiet = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(quiet.result.current.messages).toHaveLength(1))
    expect(db.upserts).toHaveLength(1)
  })

  it('waits for the tab to be visible before stamping, then stamps on return', async () => {
    seedRow([
      { role: 'user', content: 'hi', timestamp: '2026-08-01T10:00:00Z',
        author: { id: 'u2', name: 'Iris', kind: 'member' } },
    ])
    let state: DocumentVisibilityState = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    try {
      const { result } = renderHook(() => useDiscussThread(familyTask, { markRead: true }))
      await waitFor(() => expect(result.current.messages).toHaveLength(1))
      expect(db.upserts).toHaveLength(0)

      state = 'visible'
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
      await waitFor(() => expect(db.upserts).toHaveLength(1))
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState
    }
  })

  it('announces the read in-tab so badges can refresh without a realtime hop', async () => {
    seedRow([
      { role: 'user', content: 'hi', timestamp: '2026-08-01T10:00:00Z',
        author: { id: 'u2', name: 'Iris', kind: 'member' } },
    ])
    const heard: string[] = []
    const off = onThreadRead((id) => { heard.push(id) })
    renderHook(() => useDiscussThread(familyTask, { markRead: true }))
    await waitFor(() => expect(heard).toEqual(['thr-1']))
    off()
  })

  it('sends the whole thread to the agent name-prefixed, behind a participants preface', async () => {
    seedRow([
      { role: 'user', content: 'can you take her?', timestamp: '2026-08-01T10:00:00Z',
        author: { id: 'u2', name: 'Iris', kind: 'member' } },
      { role: 'assistant', content: 'Thursday is open.', timestamp: '2026-08-01T10:00:05Z',
        author: { id: null, name: 'Symphony', kind: 'symphony' } },
    ])
    let captured: Array<{ role: string; content: unknown }> = []
    vi.mocked(streamSymphonyAgent).mockImplementation(async (messages, h) => {
      captured = messages
      h.onDone?.('Booked.', null)
    })

    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    await act(async () => { await result.current.ask('Thursday works') })

    expect(captured[0].content).toContain('Participants in this discussion: Iris, Scott')
    expect(captured.map((m) => m.content)).toEqual([
      expect.stringContaining('Participants in this discussion'),
      'Iris: can you take her?',
      'Thursday is open.',
      'Scott: Thursday works',
    ])
  })

  it('appends the reply with the Symphony author', async () => {
    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.threadId).toBe('thr-1'))
    await act(async () => { await result.current.ask('help') })

    const append = db.rpcCalls.filter((c) => c.fn === 'append_chat_message')
    expect(append).toHaveLength(2)
    expect(append[1].args.p_message).toMatchObject({
      role: 'assistant',
      content: 'Try Tuesday.',
      author: { id: null, name: 'Symphony', kind: 'symphony' },
    })
  })

  it('forwards the taskContext and reports agent writes through onMutate', async () => {
    let seenContext: unknown
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      seenContext = h.taskContext
      h.onTool?.('symphony_update_task')
      h.onDone?.('Updated.', null)
    })
    const onMutate = vi.fn()
    const taskContext = { id: 't1', title: 'Book the dentist' }
    const { result } = renderHook(() => useDiscussThread(familyTask, { taskContext, onMutate }))
    await waitFor(() => expect(result.current.threadId).toBe('thr-1'))
    await act(async () => { await result.current.ask('mark it done') })

    expect(seenContext).toEqual(taskContext)
    expect(onMutate).toHaveBeenCalledTimes(1)
    expect(result.current.toolActivity).toContain('symphony_update_task')
  })

  it('reloads the thread when a realtime UPDATE arrives on its row', async () => {
    const { result } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.threadId).toBe('thr-1'))
    expect(db.realtime.filter).toMatchObject({
      event: 'UPDATE', table: 'chat_sessions', filter: 'id=eq.thr-1',
    })

    // Iris posts from her own browser.
    db.rows['thr-1'].messages = [
      { role: 'user', content: 'I can take her', timestamp: '2026-08-01T11:00:00Z',
        author: { id: 'u2', name: 'Iris', kind: 'member' } },
    ]
    await act(async () => { db.realtime.cb?.() })

    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(result.current.messages[0].author.name).toBe('Iris')
  })

  it('drops the realtime channel on unmount', async () => {
    const { result, unmount } = renderHook(() => useDiscussThread(familyTask))
    await waitFor(() => expect(result.current.threadId).toBe('thr-1'))
    unmount()
    expect(db.removed).toBeGreaterThan(0)
  })
})
