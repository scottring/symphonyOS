import type { WorkspaceContext } from '@/lib/workspace/context'
import type { TurnOutcome } from '@/lib/turnOutcome'
import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import type { AgentApiMessage, AgentProposalItem, AssistantSessionContext, AssistantTaskContext, AgentSourceNote } from '@/lib/agentStream'
import { runAgentTurn, type AgentTurnResult } from '@/lib/agentTurn'
import type { ChangeCardNote, ChangeSet } from '@/lib/canvas/changeCard'
import type { ChatMessage, ChatSession } from '@/types/chat'
import type { ChatAttachment } from '@/components/chat/ChatAttachment'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { afterPageData } from '@/lib/loadPriority'

const SESSIONS_LIMIT = 20

export interface UseSymphonyAssistantOptions {
  surface?: 'onboarding' | 'onboarding_activity'
  resolveAction?: (text: string) => Promise<AgentTurnResult | null>
  onPlanSaved?: (saved: { id: string; level: number; date: string }) => void
  onWorkspace?: (page:string,date?:string)=>void
  workspaceContext?: WorkspaceContext
  /** Called after a turn in which the agent wrote data, so the caller can
   *  refetch (the task list is not realtime for external writes). */
  onMutate?: () => void
  /** Scope the conversation to one task/routine (sent to the edge fn every turn). */
  taskContext?: AssistantTaskContext
  /** The planning session and step the conversation is inside (sent every turn). */
  sessionContext?: AssistantSessionContext
  /** Persist conversations to chat_sessions under this entity_type (e.g.
   *  'symphony_rail', 'task'). Omit only for truly ephemeral chats. */
  persistKey?: string
  /** Link persisted conversations to a specific entity (task/routine id) so
   *  they can be surfaced on that entity's panel later. */
  persistEntityId?: string
  /** Follows each turn for the canvas: when it starts, each tool, reported
   *  write outcomes, suggestions, and how it ended. */
  turnObserver?: AssistantTurnObserver
}

export interface AssistantTurnObserver {
  start?: (turn: { text: string; turnId: string; retry: boolean }) => void
  tool?: (name: string) => void
  toolResult?: (result: { name: string; ok: boolean; ids?: string[]; error?: string }) => void
  proposal?: (items: AgentProposalItem[]) => void
  changeSet?: (set: ChangeSet) => void
  point?: (p: { dates: string[]; taskIds: string[] }) => void
  end?: (turn: { turnId: string; didWrite: boolean; error: string | null; errorCode?: string; text: string; requestId?: string }) => void
  /** The change card's state to tell this turn (read once per turn). */
  changeCard?: () => ChangeCardNote | undefined
}

type StoredMessage = { role: 'user' | 'assistant'; content: string; timestamp?: string; sources?: AgentSourceNote[] }

function serializeMessages(msgs: ChatMessage[]): StoredMessage[] {
  return msgs
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
      ...(m.sources && m.sources.length > 0 ? { sources: m.sources } : {}),
    }))
}

function hydrateMessages(raw: unknown, sessionId: string): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  return (raw as StoredMessage[]).map((m, i) => ({
    id: `${sessionId}-${i}`,
    role: m.role,
    content: m.content ?? '',
    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
    ...(Array.isArray(m.sources) && m.sources.length > 0 ? { sources: m.sources } : {}),
  }))
}

type ThreadTarget = { entityType: string; entityId: string; onThread?: (id: string) => void; unread?: boolean }
type PendingSwitch =
  | { kind: 'reset' }
  | { kind: 'fresh' }
  // fresh: "New" was pressed after the open was asked for — the session's
  // thread target, with an empty conversation instead of the saved one.
  | { kind: 'open'; entityType: string; entityId: string; onThread?: (id: string) => void; fresh?: boolean }

/** The newest saved conversation for an entity — mine only. Throws when it
 *  cannot be read. */
async function readThread(entityType: string, entityId: string): Promise<{ id: string; messages: unknown } | null> {
  const { data: { user } } = await getAuthUser()
  if (!user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, messages')
    .eq('user_id', user.id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('mode', 'chat')
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data?.[0] as { id: string; messages: unknown } | undefined) ?? null
}

/**
 * Right-rail assistant scoped to Symphony. Talks to the `symphony-agent`
 * edge function, which runs an Anthropic tool-use loop over the user's own
 * Symphony data (RLS-scoped). Conversation is held in React state and sent
 * with each turn; with `persistKey` set, each turn is also saved to
 * chat_sessions so conversations survive reloads (history dropdown).
 */
export function useSymphonyAssistant(options?: UseSymphonyAssistantOptions) {
  const { surface, resolveAction, onPlanSaved, onWorkspace, onMutate, taskContext, sessionContext, workspaceContext, persistKey, persistEntityId, turnObserver } = options ?? {}
  // The last message sent, so a failed turn can be retried with the same turn
  // id (the server can then recognise writes it already made).
  const lastTurn = useRef<{ text: string; turnId: string; changeCard?: ChangeCardNote } | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const sending = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [toolActivity, setToolActivity] = useState<string[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(!!persistKey)
  const [sessionsError,setSessionsError] = useState<string|null>(null)
  const [sessionsAttempt,setSessionsAttempt] = useState(0)
  const reloadSessions=useCallback(()=>setSessionsAttempt(n=>n+1),[])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  // The persisted row id survives across turns without waiting for state.
  const sessionIdRef = useRef<string | null>(null)
  // A thread opened by entity (openThread): a new conversation is saved under
  // it instead of persistKey, and its row id is reported once it exists.
  // `unread` while its saved row has not been read yet: the first save looks
  // again before inserting, so a failed read never quietly starts a second thread.
  const threadRef = useRef<ThreadTarget | null>(null)
  // Bumped by anything that changes the conversation, so a thread still
  // loading does not land over what replaced it.
  const openRequest = useRef(0)
  // A reset, new thread or open asked for while a turn runs: applied when the
  // turn ends, so the turn is saved where it began (latest request wins).
  const pending = useRef<PendingSwitch | null>(null)
  const { getCurrentUserMember } = useFamilyMembers()

  // Recent persisted conversations for the history dropdown.
  useEffect(() => {
    if (!persistKey) return
    let cancelled = false
    ;(async () => {
      setSessionsLoading(true)
      setSessionsError(null)
      try {
        // Earlier conversations, messages and all, are not first paint: the
        // page's own data goes first (lib/loadPriority).
        await afterPageData()
        if (cancelled) return
        // mode='chat' only: the item's Discuss thread is a chat_sessions row on
        // the same entity_id, and it belongs to the drawer's main pane, not to
        // the "older conversations" dropdown.
        let query = supabase
          .from('chat_sessions')
          .select('id, title, entity_type, entity_id, mode, messages, created_at, updated_at')
          .eq('entity_type', persistKey)
          .eq('mode', 'chat')
        if (persistEntityId) query = query.eq('entity_id', persistEntityId)
        const { data,error:historyError } = await query
          .order('updated_at', { ascending: false })
          .limit(SESSIONS_LIMIT)
        if(historyError)throw historyError
        if (cancelled || !data) return
        setSessions(data.map((row) => ({
          id: row.id,
          title: row.title,
          entityType: row.entity_type,
          entityId: row.entity_id,
          mode: (row.mode ?? 'chat') as ChatSession['mode'],
          messages: hydrateMessages(row.messages, row.id),
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        })))
      } catch {
        if(!cancelled)setSessionsError('Your earlier conversation could not be loaded. Your saved activities are unchanged.')
      } finally {
        if (!cancelled) setSessionsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [persistKey, persistEntityId, sessionsAttempt])

  /** Insert or update the chat_sessions row for the current conversation. */
  const persistTurn = useCallback(async (finalMessages: ChatMessage[]) => {
    const thread = threadRef.current
    if (!persistKey && !thread) return
    try {
      const stored = serializeMessages(finalMessages)
      if (stored.length === 0) return
      if (sessionIdRef.current) {
        const { error: saveError } = await supabase
          .from('chat_sessions')
          .update({ messages: stored, updated_at: new Date().toISOString() })
          .eq('id', sessionIdRef.current)
        if (saveError) throw saveError
        setSessions((prev) => prev.map((s) =>
          s.id === sessionIdRef.current
            ? { ...s, messages: finalMessages, updatedAt: new Date() }
            : s))
      } else {
        const { data: { user } } = await getAuthUser()
        if (!user) return
        if (thread?.unread) {
          // Its saved row could not be read on opening: look once more, so
          // this turn joins that thread rather than starting a second one.
          // A failed read throws: nothing is saved and the next turn retries.
          const row = await readThread(thread.entityType, thread.entityId)
          thread.unread = false
          if (row) {
            const earlier = hydrateMessages(row.messages, row.id)
            const { error: saveError } = await supabase
              .from('chat_sessions')
              .update({ messages: serializeMessages([...earlier, ...finalMessages]), updated_at: new Date().toISOString() })
              .eq('id', row.id)
            if (saveError) { thread.unread = true; throw saveError }
            sessionIdRef.current = row.id
            setActiveSessionId(row.id)
            setMessages((prev) => [...earlier, ...prev])
            thread.onThread?.(row.id)
            return
          }
        }
        const title = stored.find((m) => m.role === 'user')?.content.slice(0, 80) ?? 'Chat'
        const entityType = thread ? thread.entityType : persistKey!
        const entityId = thread ? thread.entityId : persistEntityId ?? null
        const { data, error: saveError } = await supabase
          .from('chat_sessions')
          .insert({ user_id: user.id, title, entity_type: entityType, entity_id: entityId, mode: 'chat', messages: stored })
          .select()
          .single()
        if (saveError || !data?.id) throw saveError ?? new Error('Conversation not saved')
        if (data?.id) {
          sessionIdRef.current = data.id
          setActiveSessionId(data.id)
          // Only the conversations the history lists join it.
          if (!thread) setSessions((prev) => [{
            id: data.id,
            title,
            entityType,
            entityId,
            mode: 'chat',
            messages: finalMessages,
            createdAt: new Date(),
            updatedAt: new Date(),
          }, ...prev])
          thread?.onThread?.(data.id)
        }
      }
    } catch {
      setError('Your plan changes are separate, but this conversation could not be saved. Keep this page open; your next message will retry saving the conversation.')
    }
  }, [persistKey, persistEntityId])

  const clearPane = useCallback(() => {
    setMessages([])
    setError(null)
    setToolActivity([])
    sessionIdRef.current = null
    setActiveSessionId(null)
  }, [])

  /** Back to an empty everyday conversation (persistKey). */
  const resetSession = useCallback(() => {
    if (sending.current) { pending.current = { kind: 'reset' }; return }
    openRequest.current += 1
    threadRef.current = null
    clearPane()
  }, [clearPane])

  /** "New" inside an opened thread: an empty conversation saved as a new row
   *  under the same entity (the newest, so it is what reopens next time).
   *  With no thread open, the same as resetSession. */
  const newThread = useCallback(() => {
    if (sending.current) {
      // A session asked to open meanwhile stays the target: New only means
      // its conversation starts empty.
      const queued = pending.current
      pending.current = queued?.kind === 'open' ? { ...queued, fresh: true } : { kind: 'fresh' }
      return
    }
    const thread = threadRef.current
    openRequest.current += 1
    threadRef.current = thread ? { ...thread, unread: false } : null
    clearPane()
  }, [clearPane])

  /** Target an entity's thread with an empty conversation: the next turn is
   *  saved as a new row under it. */
  const startFreshThread = useCallback((entityType: string, entityId: string, onThread?: (id: string) => void) => {
    openRequest.current += 1
    threadRef.current = { entityType, entityId, onThread, unread: false }
    clearPane()
  }, [clearPane])

  /** Open the conversation saved for one entity (a planning session's
   *  thread): my newest chat_sessions row with that entity_type/entity_id,
   *  or, when there is none yet, an empty conversation whose first turn is
   *  saved under it. `onThread` hears the row's id once it is known. */
  const openThread = useCallback(async (entityType: string, entityId: string, onThread?: (id: string) => void) => {
    if (sending.current) { pending.current = { kind: 'open', entityType, entityId, onThread }; return }
    const request = ++openRequest.current
    const thread: ThreadTarget = { entityType, entityId, onThread, unread: true }
    threadRef.current = thread
    clearPane()
    try {
      const row = await readThread(entityType, entityId)
      // Replaced meanwhile (reset, another thread, a loaded conversation) or
      // already talking: that turn's save looks again (unread) instead.
      // A turn already saved into the thread (its own look found or made
      // the row): what it saved stands.
      if (request !== openRequest.current || sending.current || !thread.unread) return
      thread.unread = false
      if (!row) return
      setMessages(hydrateMessages(row.messages, row.id))
      sessionIdRef.current = row.id
      setActiveSessionId(row.id)
      onThread?.(row.id)
    } catch {
      if (request === openRequest.current) setError('This session\'s earlier conversation could not be loaded. Your plan is unchanged.')
    }
  }, [clearPane])

  /** One turn, with the server's verdict on what it did (turnOutcome.ts).
   *  Voice reads the outcome; the typed bar reads the text. */
  const sendTurn = useCallback(async (text: string, attachment?: ChatAttachment, opts?: { turnId?: string; retry?: boolean }): Promise<{ text: string; outcome: TurnOutcome; error: string | null } | undefined> => {
    if ((!text.trim() && !attachment) || sending.current) return
    sending.current = true
    setLoading(true)
    try {
      // Resolve approval/Undo before starting a planner turn: turnStarted clears
      // the prior Undo receipt. These actions own their existing canvas receipt.
      const localTurn = attachment ? null : await resolveAction?.(text)
      const turnId = opts?.turnId ?? crypto.randomUUID()
      const retry = !!opts?.retry
      // A retry tells the same card again: it was taken for the first try.
      const changeCard = localTurn ? undefined : retry && lastTurn.current?.turnId === turnId ? lastTurn.current.changeCard : turnObserver?.changeCard?.()
      lastTurn.current = { text, turnId, changeCard }
      if (!localTurn) turnObserver?.start?.({ text: text.trim(), turnId, retry })

      // Build the content for this turn: blocks array if there's an attachment, plain string otherwise.
      const content: AgentApiMessage['content'] = attachment
        ? [
            { type: 'text' as const, text: text.trim() || 'Set this up.' },
            attachment.fileType === 'application/pdf'
              ? { type: 'document' as const, source: { type: 'url' as const, url: attachment.url } }
              : { type: 'image' as const, source: { type: 'url' as const, url: attachment.url } },
          ]
        : text.trim()

      // Build the API history from prior turns + this one (before the placeholder).
      // Prior turns are displayed ChatMessages whose .content is always a string — safe to filter/map.
      const apiMessages: AgentApiMessage[] = [
        ...messages
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content },
      ]

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim() || (attachment ? attachment.fileName : ''),
        timestamp: new Date(),
      }
      const assistantId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: 'assistant', content: '', timestamp: new Date() },
      ])
      setLoading(true)
      setError(null)
      setToolActivity([])

      // Pass attachment metadata to the edge function so the agent can call
      // symphony_attach_source to register the uploaded PDF on the project.
      const attachmentMeta = attachment
        ? {
            storagePath: attachment.storagePath,
            fileName: attachment.fileName,
            fileType: attachment.fileType,
            fileSize: attachment.fileSize,
          }
        : undefined

      let pendingCard: ChangeSet | undefined
      let pendingProposals: AgentProposalItem[] | undefined
      const turn = localTurn ?? await runAgentTurn(apiMessages, {
        surface,
        onTool: (name) => { setToolActivity((prev) => [...prev, name]); turnObserver?.tool?.(name) },
        onToolResult: (result) => turnObserver?.toolResult?.(result),
        onProposal: (items) => { pendingProposals = items },
        onChangeSet: (set) => { pendingCard = set },
        // Beta: no live page pointing while the conversation is running.
        turnId,
        onReplyFallback: (reply) => {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId && m.content.length === 0 ? { ...m, content: reply } : m))
        },
        onSources: (sources) => {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, sources } : m))
        },
        onError: (message) => setError(message),
        onFallbackText: (text) => {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId && m.content.length === 0 ? { ...m, content: text } : m))
        },
        attachment: attachmentMeta,
        currentMemberId: getCurrentUserMember()?.id,
        taskContext,
        sessionContext,
        workspaceContext,
        changeCard,
        onWorkspace,
        onPlanSaved,
      })

      if (!turn.error && !['failed', 'unverified'].includes(turn.outcome.state)) {
        if (pendingCard) turnObserver?.changeSet?.(pendingCard)
        if (pendingProposals) turnObserver?.proposal?.(pendingProposals)
      }
      setMessages(prev => prev.map(m => m.id === assistantId ? {...m, content:turn.text, sources:turn.sources} : m))
      const assistantSources: AgentSourceNote[] | undefined = turn.sources

      if (turn.didWrite) onMutate?.()
      if (!localTurn) turnObserver?.end?.({ turnId, didWrite: turn.didWrite, error: turn.error, ...(turn.errorCode ? { errorCode: turn.errorCode } : {}), text: turn.text, ...(turn.requestId ? { requestId: turn.requestId } : {}) })
      await persistTurn([
        ...messages,
        userMsg,
        { id: assistantId, role: 'assistant', content: turn.text, sources: assistantSources, timestamp: new Date() },
      ])
      return { text: turn.text, outcome: turn.outcome, error: turn.error }
    } finally {
      // Even when the turn throws: a stuck flag would block every later turn
      // and every switch queued behind this one.
      setLoading(false)
      sending.current = false
      const next = pending.current
      pending.current = null
      if (next?.kind === 'reset') resetSession()
      else if (next?.kind === 'fresh') newThread()
      else if (next?.kind === 'open') {
        if (next.fresh) startFreshThread(next.entityType, next.entityId, next.onThread)
        else void openThread(next.entityType, next.entityId, next.onThread)
      }
    }
  }, [surface, resolveAction, onPlanSaved, onWorkspace, workspaceContext, messages, onMutate, taskContext, sessionContext, getCurrentUserMember, persistTurn, turnObserver, resetSession, newThread, openThread, startFreshThread])

  const sendMessage = useCallback(async (text: string, attachment?: ChatAttachment, opts?: { turnId?: string; retry?: boolean }) => (await sendTurn(text, attachment, opts))?.text, [sendTurn])

  /** Send the last message again with the same turn id. */
  const retryLast = useCallback(async () => {
    const last = lastTurn.current
    if (!last || sending.current) return
    return sendMessage(last.text, undefined, { turnId: last.turnId, retry: true })
  }, [sendMessage])

  /** Restore a persisted conversation into the pane. */
  const loadSession = useCallback((session: ChatSession) => {
    if (sending.current) return
    openRequest.current += 1
    setMessages(session.messages)
    setError(null)
    setToolActivity([])
    sessionIdRef.current = session.id
    setActiveSessionId(session.id)
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    if (sending.current) return
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (sessionIdRef.current === id) resetSession()
    try {
      await supabase.from('chat_sessions').delete().eq('id', id)
    } catch {
      // best-effort
    }
  }, [resetSession])

  return {
    messages, loading, error, toolActivity, sendMessage, sendTurn, retryLast, resetSession, newThread, openThread,
    sessions, sessionsLoading, sessionsError, reloadSessions, activeSessionId, loadSession, deleteSession,
  }
}
