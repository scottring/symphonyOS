import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { streamSymphonyAgent, type AgentApiMessage, type AssistantTaskContext, type AgentSourceNote } from '@/lib/agentStream'
import type { ChatMessage, ChatSession } from '@/types/chat'
import type { ChatAttachment } from '@/components/chat/ChatAttachment'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

// Tools that mutate task/project data. When the agent uses one, the app needs
// to refresh so the change shows without a page reload.
const WRITE_TOOLS = new Set([
  'symphony_create_task',
  'symphony_create_calendar_event',
  'symphony_update_task',
  'symphony_complete_task',
  'symphony_delete_task',
  'symphony_create_project',
  'symphony_update_project',
  'symphony_create_routine',
  'symphony_update_routine',
  'symphony_delete_routine',
  'symphony_create_note',
  'symphony_attach_source',
])

const SESSIONS_LIMIT = 20

export interface UseSymphonyAssistantOptions {
  /** Called after a turn in which the agent wrote data, so the caller can
   *  refetch (the task list is not realtime for external writes). */
  onMutate?: () => void
  /** Scope the conversation to one task/routine (sent to the edge fn every turn). */
  taskContext?: AssistantTaskContext
  /** Persist conversations to chat_sessions under this entity_type (e.g.
   *  'symphony_rail', 'task'). Omit only for truly ephemeral chats. */
  persistKey?: string
  /** Link persisted conversations to a specific entity (task/routine id) so
   *  they can be surfaced on that entity's panel later. */
  persistEntityId?: string
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

/**
 * Right-rail assistant scoped to Symphony. Talks to the `symphony-agent`
 * edge function, which runs an Anthropic tool-use loop over the user's own
 * Symphony data (RLS-scoped). Conversation is held in React state and sent
 * with each turn; with `persistKey` set, each turn is also saved to
 * chat_sessions so conversations survive reloads (history dropdown).
 */
export function useSymphonyAssistant(options?: UseSymphonyAssistantOptions) {
  const { onMutate, taskContext, persistKey, persistEntityId } = options ?? {}
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toolActivity, setToolActivity] = useState<string[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  // The persisted row id survives across turns without waiting for state.
  const sessionIdRef = useRef<string | null>(null)
  const { getCurrentUserMember } = useFamilyMembers()

  // Recent persisted conversations for the history dropdown.
  useEffect(() => {
    if (!persistKey) return
    let cancelled = false
    ;(async () => {
      setSessionsLoading(true)
      try {
        let query = supabase
          .from('chat_sessions')
          .select('id, title, entity_type, entity_id, mode, messages, created_at, updated_at')
          .eq('entity_type', persistKey)
        if (persistEntityId) query = query.eq('entity_id', persistEntityId)
        const { data } = await query
          .order('updated_at', { ascending: false })
          .limit(SESSIONS_LIMIT)
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
      } finally {
        if (!cancelled) setSessionsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [persistKey, persistEntityId])

  /** Insert or update the chat_sessions row for the current conversation. */
  const persistTurn = useCallback(async (finalMessages: ChatMessage[]) => {
    if (!persistKey) return
    try {
      const stored = serializeMessages(finalMessages)
      if (stored.length === 0) return
      if (sessionIdRef.current) {
        await supabase
          .from('chat_sessions')
          .update({ messages: stored, updated_at: new Date().toISOString() })
          .eq('id', sessionIdRef.current)
        setSessions((prev) => prev.map((s) =>
          s.id === sessionIdRef.current
            ? { ...s, messages: finalMessages, updatedAt: new Date() }
            : s))
      } else {
        const { data: { user } } = await getAuthUser()
        if (!user) return
        const title = stored.find((m) => m.role === 'user')?.content.slice(0, 80) ?? 'Chat'
        const { data } = await supabase
          .from('chat_sessions')
          .insert({ user_id: user.id, title, entity_type: persistKey, entity_id: persistEntityId ?? null, mode: 'chat', messages: stored })
          .select()
          .single()
        if (data?.id) {
          sessionIdRef.current = data.id
          setActiveSessionId(data.id)
          setSessions((prev) => [{
            id: data.id,
            title,
            entityType: persistKey,
            entityId: persistEntityId ?? null,
            mode: 'chat',
            messages: finalMessages,
            createdAt: new Date(),
            updatedAt: new Date(),
          }, ...prev])
        }
      }
    } catch {
      // Persistence is best-effort; the live conversation is unaffected.
    }
  }, [persistKey, persistEntityId])

  const sendMessage = useCallback(async (text: string, attachment?: ChatAttachment) => {
    if ((!text.trim() && !attachment) || loading) return

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

    // Track the assistant's reply locally too, so persistence doesn't depend
    // on reading back async state.
    let assistantText = ''
    let assistantSources: AgentSourceNote[] | undefined
    const appendText = (chunk: string) => {
      assistantText += chunk
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: m.content + chunk } : m))
    }

    let didWrite = false
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

    let streamError: string | null = null
    try {
      await streamSymphonyAgent(apiMessages, {
        onText: appendText,
        onTool: (name) => {
          if (WRITE_TOOLS.has(name)) didWrite = true
          setToolActivity((prev) => [...prev, name])
        },
        onDone: (reply, _sessionId, sources) => {
          // Fall back to the authoritative final reply if no text streamed.
          if (assistantText.length === 0) assistantText = reply
          if (sources && sources.length > 0) assistantSources = sources
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: m.content.length === 0 ? reply : m.content,
                  sources: sources && sources.length > 0 ? sources : m.sources,
                }
              : m))
        },
        onError: (message) => {
          streamError = message
          setError(message)
        },
        attachment: attachmentMeta,
        currentMemberId: getCurrentUserMember()?.id,
        taskContext,
      })
    } catch {
      streamError = 'Connection dropped'
      setError('The assistant connection dropped.')
    }

    // Never leave the placeholder bubble empty: an invisible failure reads as
    // the assistant ignoring the message, so the user re-sends and double-posts
    // (and a silent tool-only turn looks the same). Always say something.
    if (assistantText.length === 0) {
      assistantText = streamError
        ? `Something went wrong on my end (${streamError}). Please try that again.`
        : 'Something went wrong on my end — please try that again.'
      const fallback = assistantText
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId && m.content.length === 0
          ? { ...m, content: fallback } : m))
    }

    if (didWrite) onMutate?.()
    setLoading(false)

    void persistTurn([
      ...messages,
      userMsg,
      { id: assistantId, role: 'assistant', content: assistantText, sources: assistantSources, timestamp: new Date() },
    ])
  }, [loading, messages, onMutate, taskContext, getCurrentUserMember, persistTurn])

  const resetSession = useCallback(() => {
    setMessages([])
    setError(null)
    setToolActivity([])
    sessionIdRef.current = null
    setActiveSessionId(null)
  }, [])

  /** Restore a persisted conversation into the pane. */
  const loadSession = useCallback((session: ChatSession) => {
    setMessages(session.messages)
    setError(null)
    setToolActivity([])
    sessionIdRef.current = session.id
    setActiveSessionId(session.id)
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (sessionIdRef.current === id) resetSession()
    try {
      await supabase.from('chat_sessions').delete().eq('id', id)
    } catch {
      // best-effort
    }
  }, [resetSession])

  return {
    messages, loading, error, toolActivity, sendMessage, resetSession,
    sessions, sessionsLoading, activeSessionId, loadSession, deleteSession,
  }
}
