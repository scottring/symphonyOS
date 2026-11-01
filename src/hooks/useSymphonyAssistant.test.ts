import {createElement} from 'react'
import {CanvasActivityProvider,useCanvasActivity,type CanvasActivityProviderProps} from '../contexts/CanvasActivityContext'
import {resolveConversationAction} from '../lib/conversationActions'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/hooks/useFamilyMembers',()=>({useFamilyMembers:()=>({getCurrentUserMember:()=>undefined})}))

vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: vi.fn(),
}))

// Local supabase mock with chat_sessions support (the global setup mock has no
// .limit or capture hooks). Kept minimal: family_members returns empty.
const db = vi.hoisted(() => ({
  failInsert: false,
  failRead: false,
  sessionsRows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  deleted: [] as string[],
  nextId: 'sess-1',
}))

vi.mock('@/lib/supabase', () => {
  const thenable = (data: unknown) => Object.assign(Promise.resolve({ data, error: null }), {})
  return {
    // Mirrors the real module: the cached-session reader lives beside
    // `supabase`, so a whole-module mock has to provide it too.
    getAuthUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: (table: string) => {
        if (table === 'chat_sessions') {
          // Self-returning filter chain — the sessions read stacks several
          // .eq()s (entity_type, mode, and optionally entity_id).
          const query: Record<string, unknown> = {}
          const back = () => query
          const filters: Array<[string, unknown]> = []
          Object.assign(query, {
            eq: (col: string, value: unknown) => { filters.push([col, value]); return query },
            order: back,
            limit: () => db.failRead?Promise.resolve({data:null,error:new Error('Read unavailable')}):thenable(db.sessionsRows.filter((row) => filters.every(([col, value]) => row[col] === value))),
          })
          return {
            select: () => query,
            insert: (row: Record<string, unknown>) => {
              db.inserted.push(row)
              return {
                select: () => ({
                  single: () => Promise.resolve(db.failInsert ? {data:null,error:new Error('offline')} : { data: { id: db.nextId }, error: null }),
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

  it('reports failed history reads and can retry without losing the saved conversation',async()=>{
    db.failRead=true
    const {result}=renderHook(()=>useSymphonyAssistant({persistKey:'onboarding_test'}))
    await waitFor(()=>expect(result.current.sessionsLoading).toBe(false))
    expect(result.current.sessionsError).toContain('could not be loaded')
    db.failRead=false
    await act(async()=>result.current.reloadSessions())
    await waitFor(()=>expect(result.current.sessionsError).toBeNull())
    expect(result.current.sessionsLoading).toBe(false)
  })

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

  it('sends what became of the last change card with the turn', async () => {
    let sent: unknown
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      sent = h.changeCard
      h.onText?.('ok')
      h.onDone?.('ok', null)
    })
    const card = { state: 'approved' as const, title: '2 changes', ops: [{ op: 'someday', title: 'Paper mail', where: '→ Someday' }], at: '2026-10-14T09:00:00.000Z' }
    const changeCard = vi.fn().mockReturnValueOnce(card).mockReturnValue(undefined)
    const { result } = renderHook(() => useSymphonyAssistant({ turnObserver: { changeCard } }))
    await act(async () => { await result.current.sendMessage('what next?') })
    expect(sent).toEqual(card)
    await act(async () => { await result.current.sendMessage('and then?') })
    expect(sent).toBeUndefined()
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

  it('attaches note sources from onDone to the assistant message', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onText?.('Here is your prep.')
      h.onDone?.('Here is your prep.', null, [
        { id: 'n1', title: 'NYSRA Panel One-Pager', vaultPath: 'job-search/nysra-panel-onepager.md' },
        { id: 'n2', title: 'NYSRA Interview Prep' },
      ])
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('prep for nysra') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const assistantMsg = result.current.messages[1]
    expect(assistantMsg.sources?.map(s => s.id)).toEqual(['n1', 'n2'])
    expect(assistantMsg.sources?.[0].title).toBe('NYSRA Panel One-Pager')
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

  it('sends the guided session\'s context with every turn', async () => {
    const seen: unknown[] = []
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      seen.push(h.sessionContext)
      h.onDone?.('ok', null)
    })
    const sessionContext = { horizon: 'weekly', periodLabel: 'Week of Nov 1', stepId: 'inbox', stepTitle: 'Clear the inbox',
      guide: { level: 'week' as const, stepId: 'inbox', stepTitle: 'Clear the inbox', writes: ['inbox' as const], aboveLines: [], areas: [] } }
    const { result } = renderHook(() => useSymphonyAssistant({ sessionContext }))
    await act(async () => { await result.current.sendMessage('what is left?') })
    await act(async () => { await result.current.sendMessage('and then?') })
    expect(seen).toEqual([sessionContext, sessionContext])
    expect((seen[0] as typeof sessionContext).guide.stepId).toBe('inbox')
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
      db.failRead = false
      db.nextId = 'sess-1'
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

    it('openThread reopens the newest saved thread for that entity', async () => {
      const row = (id: string, entity_id: string, content: string, updated_at: string) => ({
        id, title: content, user_id: 'u1', entity_type: 'planning_session', entity_id, mode: 'chat',
        messages: [{ role: 'user', content, timestamp: updated_at }, { role: 'assistant', content: `re: ${content}`, timestamp: updated_at }],
        created_at: updated_at, updated_at,
      })
      db.sessionsRows = [row('p1', 'weekly:2026-11-1', 'Sunday talk', '2026-11-01T10:00:00Z'), row('p0', 'weekly:2026-10-25', 'last week', '2026-10-25T10:00:00Z')]
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onDone?.('ok', null) })
      const onThread = vi.fn()
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await act(async () => { await result.current.openThread('planning_session', 'weekly:2026-11-1', onThread) })
      expect(result.current.messages.map((m) => m.content)).toEqual(['Sunday talk', 're: Sunday talk'])
      expect(result.current.activeSessionId).toBe('p1')
      expect(onThread).toHaveBeenCalledWith('p1')
      // Tuesday's turn carries on the same row.
      await act(async () => { await result.current.sendMessage('and Tuesday?') })
      expect(db.inserted).toHaveLength(0)
      expect(db.updated[0].id).toBe('p1')
      // The planning thread is not one of the rail's "older conversations".
      expect(result.current.sessions.some((s) => s.id === 'p1')).toBe(false)
    })

    it('openThread without a saved thread starts one: the next send inserts it under that entity', async () => {
      db.nextId = 'new-thread'
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onText?.('ok'); h.onDone?.('ok', null) })
      const onThread = vi.fn()
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await act(async () => { await result.current.sendMessage('rail chat') })
      db.inserted = []
      await act(async () => { await result.current.openThread('planning_session', 'weekly:2026-11-1', onThread) })
      // The rail conversation is not carried into the session.
      expect(result.current.messages).toEqual([])
      expect(onThread).not.toHaveBeenCalled()
      await act(async () => { await result.current.sendMessage('what is on this week?') })
      expect(db.inserted).toHaveLength(1)
      expect(db.inserted[0]).toMatchObject({ entity_type: 'planning_session', entity_id: 'weekly:2026-11-1', mode: 'chat', user_id: 'u1' })
      expect(onThread).toHaveBeenCalledWith('new-thread')
      // Back to the rail: the next new conversation is a rail one again.
      act(() => result.current.resetSession())
      db.nextId = 'rail-2'
      await act(async () => { await result.current.sendMessage('rail again') })
      expect(db.inserted[1]).toMatchObject({ entity_type: 'symphony_rail', entity_id: null })
      expect(onThread).toHaveBeenCalledTimes(1)
    })

    it('a reset while a thread is still loading keeps the rail empty', async () => {
      db.sessionsRows = [{ id: 'p1', title: 't', user_id: 'u1', entity_type: 'planning_session', entity_id: 'weekly:2026-11-1', mode: 'chat', messages: [{ role: 'user', content: 'Sunday talk' }], created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z' }]
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      let opening: Promise<void> | undefined
      act(() => { opening = result.current.openThread('planning_session', 'weekly:2026-11-1'); result.current.resetSession() })
      await act(async () => { await opening })
      expect(result.current.messages).toEqual([])
      expect(result.current.activeSessionId).toBeNull()
    })

    const planningRow = (id = 'p1', user_id = 'u1') => ({
      id, title: 'Sunday talk', user_id, entity_type: 'planning_session', entity_id: 'weekly:2026-11-1', mode: 'chat',
      messages: [{ role: 'user', content: 'Sunday talk' }, { role: 'assistant', content: 'noted' }],
      created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
    })
    /** A turn that waits until `finish()`. */
    function heldTurn() {
      const held: { finish?: () => void } = {}
      vi.mocked(streamSymphonyAgent).mockImplementationOnce(async (_messages, h) => {
        await new Promise<void>((resolve) => { held.finish = resolve })
        h.onText?.('ok'); h.onDone?.('ok', null)
      })
      return held
    }

    it('openThread reads only my own rows', async () => {
      db.sessionsRows = [planningRow('theirs', 'u2')]
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await act(async () => { await result.current.openThread('planning_session', 'weekly:2026-11-1') })
      expect(result.current.messages).toEqual([])
      expect(result.current.activeSessionId).toBeNull()
    })

    it('leaving mid-turn: the turn is saved to the session, then the reset applies and the next send is a rail conversation', async () => {
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onText?.('ok'); h.onDone?.('ok', null) })
      db.nextId = 'planning-row'
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await act(async () => { await result.current.openThread('planning_session', 'weekly:2026-11-1') })
      const held = heldTurn()
      let turn: Promise<unknown> | undefined
      act(() => { turn = result.current.sendMessage('in the session') })
      await waitFor(() => expect(held.finish).toBeDefined())
      act(() => result.current.resetSession())
      await act(async () => { held.finish!(); await turn })
      expect(db.inserted[0]).toMatchObject({ entity_type: 'planning_session', entity_id: 'weekly:2026-11-1' })
      expect(result.current.messages).toEqual([])
      db.nextId = 'rail-row'
      await act(async () => { await result.current.sendMessage('back on the rail') })
      expect(db.inserted).toHaveLength(2)
      expect(db.inserted[1]).toMatchObject({ entity_type: 'symphony_rail', entity_id: null })
      expect(db.updated.some((u) => u.id === 'planning-row')).toBe(false)
    })

    it('entering mid-turn: the rail turn is saved to the rail, then the session thread opens for the next send', async () => {
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onText?.('ok'); h.onDone?.('ok', null) })
      const onThread = vi.fn()
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      const held = heldTurn()
      let turn: Promise<unknown> | undefined
      act(() => { turn = result.current.sendMessage('on the rail') })
      await waitFor(() => expect(held.finish).toBeDefined())
      act(() => { void result.current.openThread('planning_session', 'weekly:2026-11-1', onThread) })
      await act(async () => { held.finish!(); await turn })
      expect(db.inserted[0]).toMatchObject({ entity_type: 'symphony_rail' })
      await waitFor(() => expect(result.current.messages).toEqual([]))
      db.nextId = 'planning-row'
      await act(async () => { await result.current.sendMessage('now planning') })
      expect(db.inserted[1]).toMatchObject({ entity_type: 'planning_session', entity_id: 'weekly:2026-11-1' })
      expect(onThread).toHaveBeenCalledWith('planning-row')
    })

    it('a session opened mid-turn, then New: the session stays the target, starting empty', async () => {
      db.sessionsRows = [planningRow()]
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onText?.('ok'); h.onDone?.('ok', null) })
      const onThread = vi.fn()
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      const held = heldTurn()
      let turn: Promise<unknown> | undefined
      act(() => { turn = result.current.sendMessage('on the rail') })
      await waitFor(() => expect(held.finish).toBeDefined())
      act(() => { void result.current.openThread('planning_session', 'weekly:2026-11-1', onThread) })
      act(() => result.current.newThread())
      await act(async () => { held.finish!(); await turn })
      expect(db.inserted[0]).toMatchObject({ entity_type: 'symphony_rail' })
      expect(result.current.messages).toEqual([])
      db.nextId = 'p2'
      await act(async () => { await result.current.sendMessage('start the session fresh') })
      expect(db.inserted).toHaveLength(2)
      expect(db.inserted[1]).toMatchObject({ entity_type: 'planning_session', entity_id: 'weekly:2026-11-1' })
      expect(db.updated.some((u) => u.id === 'p1')).toBe(false)
      expect(onThread).toHaveBeenCalledWith('p2')
    })

    it('a turn that throws still ends: loading clears, the queued reset applies, and the next turn runs', async () => {
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onText?.('ok'); h.onDone?.('ok', null) })
      const failing: { reject?: (e: Error) => void } = {}
      const resolveAction = vi.fn()
        .mockImplementationOnce(() => new Promise((_resolve, reject) => { failing.reject = reject }))
        .mockResolvedValue(null)
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail', resolveAction }))
      await act(async () => { await result.current.openThread('planning_session', 'weekly:2026-11-1') })
      let turn: Promise<unknown> | undefined
      act(() => { turn = result.current.sendMessage('approve') })
      await waitFor(() => expect(failing.reject).toBeDefined())
      act(() => result.current.resetSession())
      await act(async () => { failing.reject!(new Error('boom')); await expect(turn).rejects.toThrow('boom') })
      expect(result.current.loading).toBe(false)
      await act(async () => { await result.current.sendMessage('next one') })
      expect(db.inserted).toHaveLength(1)
      expect(db.inserted[0]).toMatchObject({ entity_type: 'symphony_rail' })
    })

    it('newThread starts a fresh row under the same session, which becomes its thread', async () => {
      db.sessionsRows = [planningRow()]
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onText?.('ok'); h.onDone?.('ok', null) })
      const onThread = vi.fn()
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await act(async () => { await result.current.openThread('planning_session', 'weekly:2026-11-1', onThread) })
      expect(result.current.activeSessionId).toBe('p1')
      act(() => result.current.newThread())
      expect(result.current.messages).toEqual([])
      db.nextId = 'p2'
      await act(async () => { await result.current.sendMessage('start over') })
      expect(db.inserted).toHaveLength(1)
      expect(db.inserted[0]).toMatchObject({ entity_type: 'planning_session', entity_id: 'weekly:2026-11-1' })
      expect(db.updated).toHaveLength(0)
      expect(onThread).toHaveBeenLastCalledWith('p2')
    })

    it('a failed thread read is retried before the first save, so the turn joins the saved thread', async () => {
      db.sessionsRows = [planningRow()]
      db.failRead = true
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onText?.('ok'); h.onDone?.('ok', null) })
      const onThread = vi.fn()
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await act(async () => { await result.current.openThread('planning_session', 'weekly:2026-11-1', onThread) })
      expect(result.current.error).toContain('could not be loaded')
      db.failRead = false
      await act(async () => { await result.current.sendMessage('carry on') })
      expect(db.inserted).toHaveLength(0)
      expect(db.updated[0].id).toBe('p1')
      expect((db.updated[0].patch.messages as Array<{ content: string }>).map((m) => m.content)).toEqual(['Sunday talk', 'noted', 'carry on', 'ok'])
      expect(result.current.messages.map((m) => m.content)).toEqual(['Sunday talk', 'noted', 'carry on', 'ok'])
      expect(result.current.activeSessionId).toBe('p1')
      expect(onThread).toHaveBeenCalledWith('p1')
    })

    it('while the thread still cannot be read, nothing is inserted and the save says so', async () => {
      db.failRead = true
      vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => { h.onText?.('ok'); h.onDone?.('ok', null) })
      const { result } = renderHook(() => useSymphonyAssistant({ persistKey: 'symphony_rail' }))
      await act(async () => { await result.current.openThread('planning_session', 'weekly:2026-11-1') })
      await act(async () => { await result.current.sendMessage('carry on') })
      expect(db.inserted).toHaveLength(0)
      expect(result.current.error).toContain('could not be saved')
      db.failRead = false
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

describe('useSymphonyAssistant empty-reply resilience', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fills the placeholder bubble when the stream ends with no text', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onDone?.('', null) // agent finished silently (e.g. tool-only turn)
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('hi') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const assistant = result.current.messages[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.content.length).toBeGreaterThan(0)
  })

  it('fills the placeholder bubble on a stream error event', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onError?.('Assistant offline')
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('hi') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.messages[1].content).toMatch(/went wrong|offline/i)
  })

  it('fills the placeholder bubble and clears loading when the stream throws', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async () => {
      throw new Error('network dropped')
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('hi') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.messages[1].content.length).toBeGreaterThan(0)
    expect(result.current.error).toBeTruthy()
  })
})


it('persists spoken actions in the same conversation and includes them in the next typed turn',async()=>{
 const {resolveConversationAction}=await import('../lib/conversationActions')
 const approve=vi.fn(async()=> 'saved' as const),undo=vi.fn(async()=> 'undone' as const)
 const histories:unknown[]=[]
 vi.mocked(streamSymphonyAgent).mockImplementation(async(messages,h)=>{histories.push(messages);h.onText?.('On the card.');h.onDone?.('On the card.',null)})
 const start=vi.fn(),end=vi.fn()
 const {result}=renderHook(()=>useSymphonyAssistant({persistKey:'symphony_rail',turnObserver:{start,end},resolveAction:text=>resolveConversationAction(text,approve,undo)}))
 await act(async()=>{await result.current.sendMessage('Call my mom about dinner tonight')})
 await act(async()=>{await result.current.sendTurn('Approve')})
 await act(async()=>{await result.current.sendTurn('Undo')})
 await act(async()=>{await result.current.sendMessage('What is left?')})
 expect(approve).toHaveBeenCalledTimes(1);expect(undo).toHaveBeenCalledTimes(1)
 expect(histories).toHaveLength(2)
 expect(start).toHaveBeenCalledTimes(2);expect(end).toHaveBeenCalledTimes(2)
 expect((histories[1] as any[]).map(m=>m.content)).toEqual(['Call my mom about dinner tonight','On the card.','Approve','Saved.','Undo','Undone.','What is left?'])
 expect((db.updated.at(-1)?.patch.messages as any[]).map(m=>m.content)).toEqual(result.current.messages.map(m=>m.content))
})


it('preserves the actual canvas Undo through shared conversation approval and Undo turns',async()=>{
 const undoWrite=vi.fn(async()=>true),apply=vi.fn(async()=>({ok:true as const,summary:'Saved',undo:undoWrite,ids:['new-task']}))
 const wrapper=({children}:{children:React.ReactNode})=>createElement(CanvasActivityProvider,{
  snapshot:{tasks:[],goals:[]},writers:{deleteTask:vi.fn(),updateTask:vi.fn(),deleteGoal:vi.fn(),updateGoal:vi.fn()},
  refetch:vi.fn(),applyChanges:apply,children,
 } as CanvasActivityProviderProps)
 const {result}=renderHook(()=>{
  const activity=useCanvasActivity()
  const assistant=useSymphonyAssistant({persistKey:'symphony_rail',
   resolveAction:text=>resolveConversationAction(text,async()=>{
    if(!activity.changeSet)return 'none'
    let outcome:'saved'|'partial'|'failed'='failed'
    await activity.approveChangeSet(state=>{outcome=state});return outcome
   },activity.undo),
   turnObserver:{start:({text,retry})=>activity.turnStarted(text,retry),end:activity.turnEnded,changeCard:activity.takeChangeCard},
  })
  return {activity,assistant}
 },{wrapper})
 act(()=>result.current.activity.setChangeSet({key:'one-conversation',title:'Call mom',ops:[{key:'mom',op:'add',title:'Talk to my mom about dinner tonight'}]}))
 await act(async()=>{await result.current.assistant.sendTurn('Approve')})
 expect(apply).toHaveBeenCalledTimes(1)
 expect(result.current.activity.receipt?.undoable).toBe(true)
 await act(async()=>{await result.current.assistant.sendTurn('Undo')})
 expect(undoWrite).toHaveBeenCalledTimes(1)
 expect(result.current.activity.receipt?.summary).toBe('Undone')
 expect(result.current.assistant.messages.map(m=>m.content)).toEqual(['Approve','Saved.','Undo','Undone.'])
})


it('retains the full conversation after a save failure and retries it with the next turn',async()=>{
 vi.mocked(streamSymphonyAgent).mockImplementation(async(_messages,h)=>{h.onText?.('On the card.');h.onDone?.('On the card.',null)})
 const {result}=renderHook(()=>useSymphonyAssistant({persistKey:'symphony_rail'}))
 db.failInsert=true
 try {
  await act(async()=>{await result.current.sendTurn('Return the library books')})
  expect(result.current.error).toMatch(/conversation could not be saved/)
  expect(result.current.messages.map(m=>m.content)).toEqual(['Return the library books','On the card.'])
 }finally{db.failInsert=false}
 await act(async()=>{await result.current.sendTurn('On Saturday')})
 expect(result.current.error).toBeNull()
 expect((db.inserted.at(-1)?.messages as any[]).map(m=>m.content)).toEqual(['Return the library books','On the card.','On Saturday','On the card.'])
})


it.each([false,true])('beta publishes a final card only after successful completion (failure=%s)',async(failed)=>{
 const changeSet=vi.fn(),point=vi.fn()
 let finish!:()=>void
 vi.mocked(streamSymphonyAgent).mockImplementation(async(_m,h)=>{
  h.onText?.('Draft wording')
  h.onChangeSet?.({key:'bike',title:'Bike tomorrow',ops:[]})
  h.onPoint?.({dates:['2026-10-16'],taskIds:[]})
  await new Promise<void>(resolve=>{finish=resolve})
  if(failed)h.onError?.('Connection dropped')
  else h.onDone?.('Ready to review.',null,undefined,{state:'proposed',writes:[],say:'Ready',proposal:{key:'bike',title:'Bike tomorrow',ops:0}})
 })
 const {result}=renderHook(()=>useSymphonyAssistant({turnObserver:{changeSet,point}}))
 let pending!:Promise<unknown>
 act(()=>{pending=result.current.sendTurn('Tomorrow for the bicycle.')})
 await waitFor(()=>expect(finish).toBeDefined())
 expect(changeSet).not.toHaveBeenCalled()
 expect(point).not.toHaveBeenCalled()
 expect(result.current.messages.at(-1)?.content).toBe('')
 await act(async()=>{finish();await pending})
 expect(changeSet).toHaveBeenCalledTimes(failed?0:1)
 expect(point).not.toHaveBeenCalled()
})
