import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: vi.fn(),
}))

// Local supabase mock with chat_sessions support (the global setup mock has no
// .limit or capture hooks). Kept minimal: family_members returns empty.
const db = vi.hoisted(() => ({
  sessionsRows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  deleted: [] as string[],
}))

vi.mock('@/lib/supabase', () => {
  const thenable = (data: unknown) => Object.assign(Promise.resolve({ data, error: null }), {})
  return {
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: (table: string) => {
        if (table === 'chat_sessions') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => thenable(db.sessionsRows),
                }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              db.inserted.push(row)
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: 'sess-1' }, error: null }),
                }),
              }
            },
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => {
                db.updated.push({ id, patch })
                return thenable(null)
              },
            }),
            delete: () => ({
              eq: (_col: string, id: string) => {
                db.deleted.push(id)
                return thenable(null)
              },
            }),
          }
        }
        // family_members etc — empty result, chainable enough for useFamilyMembers
        const chain: Record<string, unknown> = {}
        const self = () => chain
        Object.assign(chain, {
          select: self, eq: self, or: self, order: self,
          then: (res: (v: unknown) => void) => res({ data: [], error: null }),
        })
        return chain
      },
      channel: () => ({ on: () => ({ subscribe: vi.fn() }), subscribe: vi.fn(), unsubscribe: vi.fn() }),
    },
  }
})

import { streamSymphonyAgent } from '@/lib/agentStream'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'

describe('useSymphonyAssistant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends streamed text to a single assistant message and clears loading on done', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onText?.('Hello ')
      h.onText?.('Scott.')
      h.onDone?.('Hello Scott.', null)
    })

    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('hi') })

    await waitFor(() => expect(result.current.loading).toBe(false))
    const msgs = result.current.messages
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].content).toBe('Hello Scott.')
  })

  it('sends prior history plus the new user turn to the agent', async () => {
    let captured: Array<{ role: string; content: string }> = []
    vi.mocked(streamSymphonyAgent).mockImplementation(async (messages, h) => {
      captured = messages
      h.onText?.('ok')
      h.onDone?.('ok', null)
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('first') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.sendMessage('second') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Second call should include the first user + assistant turns, then "second".
    expect(captured.map(m => m.content)).toEqual(['first', 'ok', 'second'])
  })

  it('records tool activity from onTool', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onTool?.('symphony_create_task')
      h.onText?.('Created.')
      h.onDone?.('Created.', null)
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('add a task') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.toolActivity).toContain('symphony_create_task')
  })

  it('surfaces errors', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onError?.('Assistant offline')
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('hi') })
    await waitFor(() => expect(result.current.error).toBe('Assistant offline'))
  })

  it('forwards taskContext to the stream call', async () => {
    let seen: unknown
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      seen = h.taskContext
      h.onDone?.('ok', null)
    })
    const taskContext = { id: 't1', title: 'Replace kitchen light bulbs', notes: 'GU10?' }
    const { result } = renderHook(() => useSymphonyAssistant({ taskContext }))
    await act(async () => { await result.current.sendMessage('help me plan this') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(seen).toEqual(taskContext)
  })

  it('calls onMutate after a turn that used a write tool', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onTool?.('symphony_update_task')
      h.onDone?.('updated', null)
    })
    const onMutate = vi.fn()
    const { result } = renderHook(() => useSymphonyAssistant({ onMutate }))
    await act(async () => { await result.current.sendMessage('mark it needs discussion') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(onMutate).toHaveBeenCalledTimes(1)
  })

  describe('persistence (persistKey)', () => {
    beforeEach(() => {
      db.sessionsRows = []
      db.inserted = []
      db.updated = []
      db.deleted = []
    })

    it('inserts a chat_sessions row after the first turn, updates on later turns', async () => {
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
        h.onText?.('sure')
        h.onDone?.('sure', null)
      })
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await act(async () => { await result.current.sendMessage('plan my week please') })
      await waitFor(() => expect(db.inserted.length).toBe(1))
      expect(db.inserted[0]).toMatchObject({
        entity_type: 'symphony_rail',
        title: 'plan my week please',
        user_id: 'u1',
      })
      await waitFor(() => expect(result.current.activeSessionId).toBe('sess-1'))

      await act(async () => { await result.current.sendMessage('and tuesday?') })
      await waitFor(() => expect(db.updated.length).toBe(1))
      expect(db.updated[0].id).toBe('sess-1')
      expect((db.updated[0].patch.messages as unknown[]).length).toBe(4)
    })

    it('loads recent sessions on mount and restores one via loadSession', async () => {
      db.sessionsRows = [{
        id: 's9', title: 'older chat', entity_type: 'symphony_rail', entity_id: null, mode: 'chat',
        messages: [{ role: 'user', content: 'hi', timestamp: '2026-07-01T10:00:00Z' },
                   { role: 'assistant', content: 'hello', timestamp: '2026-07-01T10:00:05Z' }],
        created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:05Z',
      }]
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await waitFor(() => expect(result.current.sessions.length).toBe(1))
      act(() => result.current.loadSession(result.current.sessions[0]))
      expect(result.current.messages.map((m) => m.content)).toEqual(['hi', 'hello'])
      expect(result.current.activeSessionId).toBe('s9')
    })

    it('deleteSession removes the row and resets when active', async () => {
      db.sessionsRows = [{
        id: 's9', title: 'older chat', entity_type: 'symphony_rail', entity_id: null, mode: 'chat',
        messages: [{ role: 'user', content: 'hi' }],
        created_at: '2026-07-01T10:00:00Z', updated_at: '2026-07-01T10:00:05Z',
      }]
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await waitFor(() => expect(result.current.sessions.length).toBe(1))
      act(() => result.current.loadSession(result.current.sessions[0]))
      await act(async () => { await result.current.deleteSession('s9') })
      expect(db.deleted).toContain('s9')
      expect(result.current.sessions.length).toBe(0)
      expect(result.current.messages.length).toBe(0)
      expect(result.current.activeSessionId).toBeNull()
    })

    it('does not touch chat_sessions without persistKey', async () => {
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
        h.onDone?.('ok', null)
      })
      const { result } = renderHook(() => useSymphonyAssistant())
      await act(async () => { await result.current.sendMessage('hi') })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(db.inserted.length).toBe(0)
    })
  })
})
