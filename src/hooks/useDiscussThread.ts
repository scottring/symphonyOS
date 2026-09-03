// src/hooks/useDiscussThread.ts
//
// Discuss: ONE shared AI thread per task or routine.
//
// The conversation belongs to the item, not to whoever opened it. On a family
// item both partners open the same chat_sessions row (mode='discuss'), each
// message says who wrote it, appends are atomic through the
// `append_chat_message` RPC (never a whole-array rewrite, so two people can't
// clobber each other), and a realtime subscription on that one row makes the
// other side's message appear without a reload.
//
// Scope is DERIVED by the caller with scopeForDomain (src/lib/scope.ts) and
// handed in on the entity. Nothing here invents a literal.
//
// Design: docs/superpowers/specs/2026-09-02-discuss-thread-design.md §5.1.

import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import type { AgentApiMessage, AgentSourceNote, AssistantTaskContext } from '@/lib/agentStream'
import { runAgentTurn } from '@/lib/agentTurn'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { memberForAuthUser, type Scope } from '@/lib/scope'
import { sharedWithNames } from '@/lib/discussions/sharedWith'

export interface DiscussEntity {
  type: 'task' | 'routine' | 'event'
  id: string
  title: string
  /** Derived by scopeForDomain — never a literal from a picker. */
  scope: Scope
}

export interface DiscussAuthor {
  /** The auth user id, so ChatPanel can tell "me" from "my partner". */
  id: string | null
  name: string
  kind: 'member' | 'symphony'
}

export interface DiscussMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  author: DiscussAuthor
  sources?: AgentSourceNote[]
  /** A member message that invited Symphony (Ask button or "@Symphony"). */
  askedSymphony?: true
}

export interface UseDiscussThreadOptions {
  /** Sent to the edge fn every turn so the agent keeps the item in view. */
  taskContext?: AssistantTaskContext
  /** Called after a turn in which the agent wrote data, so the caller refetches. */
  onMutate?: () => void
  /** Stamp chat_session_reads while the thread is on screen in a visible tab. */
  markRead?: boolean
}

/** Shown when the Discuss RPCs aren't reachable (migration not applied yet). */
export const DISCUSS_UNAVAILABLE = "Discussion isn't available yet"

export const SYMPHONY_AUTHOR: DiscussAuthor = { id: null, name: 'Symphony', kind: 'symphony' }
/** Pre-authorship messages: we know a person wrote it, not which one. */
const LEGACY_MEMBER_AUTHOR: DiscussAuthor = { id: null, name: 'You', kind: 'member' }

interface StoredDiscussMessage {
  role?: string
  content?: string
  timestamp?: string
  author?: Partial<DiscussAuthor>
  sources?: AgentSourceNote[]
  askedSymphony?: boolean
}

function readAuthor(raw: Partial<DiscussAuthor> | undefined, role: 'user' | 'assistant'): DiscussAuthor {
  if (raw && typeof raw.name === 'string' && raw.name.length > 0) {
    return {
      id: typeof raw.id === 'string' ? raw.id : null,
      name: raw.name,
      kind: raw.kind === 'symphony' ? 'symphony' : 'member',
    }
  }
  return role === 'assistant' ? SYMPHONY_AUTHOR : LEGACY_MEMBER_AUTHOR
}

export function hydrateDiscussMessages(raw: unknown, threadId: string): DiscussMessage[] {
  if (!Array.isArray(raw)) return []
  return (raw as StoredDiscussMessage[]).map((m, i) => {
    const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user'
    return {
      id: `${threadId}-${i}`,
      role,
      content: m.content ?? '',
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      author: readAuthor(m.author, role),
      ...(Array.isArray(m.sources) && m.sources.length > 0 ? { sources: m.sources } : {}),
      ...(m.askedSymphony === true ? { askedSymphony: true as const } : {}),
    }
  })
}

/**
 * The model's view of a shared thread. Two people are talking, so every human
 * turn is prefixed with its speaker and a one-line preface names who is here —
 * otherwise the agent answers Iris as if she were Scott.
 */
export function buildDiscussApiMessages(thread: DiscussMessage[]): AgentApiMessage[] {
  const names = Array.from(new Set(
    thread.filter((m) => m.author.kind === 'member').map((m) => m.author.name),
  ))
  const preface = `Participants in this discussion: ${names.join(', ') || 'the item owner'}. `
    + "Messages are prefixed with the speaker's name."
  return [
    { role: 'user', content: preface },
    ...thread
      .filter((m) => m.content.trim().length > 0)
      .map((m): AgentApiMessage => m.role === 'user'
        ? { role: 'user', content: `${m.author.name}: ${m.content}` }
        : { role: 'assistant', content: m.content }),
  ]
}

export function useDiscussThread(
  entity: DiscussEntity | null,
  options: UseDiscussThreadOptions = {},
) {
  const { taskContext, onMutate, markRead = false } = options
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DiscussMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toolActivity, setToolActivity] = useState<string[]>([])

  const { members, getCurrentUserMember } = useFamilyMembers()

  // The viewer's AUTH id — what every author carries, and the only reliable way
  // to tell "mine" from "my partner's". Not the member row's auth_user_id: that
  // is null on the household creator's own seed row.
  const [selfAuthId, setSelfAuthId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: { user } } = await getAuthUser()
      if (!cancelled) setSelfAuthId(user?.id ?? null)
    })()
    return () => { cancelled = true }
  }, [])

  // Refs so send() and reload() don't have to re-create on every message.
  const threadIdRef = useRef<string | null>(null)
  const messagesRef = useRef<DiscussMessage[]>([])
  const sendingRef = useRef(false)
  useEffect(() => { messagesRef.current = messages }, [messages])

  const entityType = entity?.type ?? null
  const entityId = entity?.id ?? null
  const entityTitle = entity?.title ?? null
  const entityScope = entity?.scope ?? null

  // ── Find-or-create the item's one thread ──────────────────────────────────
  useEffect(() => {
    threadIdRef.current = null
    setThreadId(null)
    setMessages([])
    setError(null)
    if (!entityType || !entityId || !entityScope) return

    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('ensure_discuss_thread', {
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_title: entityTitle ?? '',
          p_scope: entityScope,
        })
        if (cancelled) return
        if (rpcError || typeof data !== 'string') {
          setError(DISCUSS_UNAVAILABLE)
          setLoading(false)
          return
        }
        threadIdRef.current = data
        setThreadId(data)
      } catch {
        if (!cancelled) {
          setError(DISCUSS_UNAVAILABLE)
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [entityType, entityId, entityTitle, entityScope])

  // ── Read the thread ───────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const id = threadIdRef.current
    if (!id) return
    try {
      const { data, error: readError } = await supabase
        .from('chat_sessions')
        .select('id, messages, scope, user_id')
        .eq('id', id)
        .eq('mode', 'discuss')
        .single()
      if (readError || !data) return
      setMessages(hydrateDiscussMessages(data.messages, id))
    } catch {
      // A failed re-read leaves the last good transcript on screen.
    }
  }, [])

  // ── Hydrate + subscribe to the row ────────────────────────────────────────
  useEffect(() => {
    if (!threadId) return
    let cancelled = false
    ;(async () => {
      await reload()
      if (!cancelled) setLoading(false)
    })()

    const channel = supabase
      .channel(`discuss:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_sessions', filter: `id=eq.${threadId}` },
        () => { void reload() },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel?.(channel)
    }
  }, [threadId, reload])

  // A tab left open all day misses whatever realtime dropped on the floor.
  useRefreshOnVisible(() => { void reload() }, { enabled: !!threadId })

  /** Who is speaking: the linked family member, else the email local part. */
  const resolveAuthor = useCallback(async (): Promise<DiscussAuthor> => {
    const { data: { user } } = await getAuthUser()
    const member = memberForAuthUser(members, user?.id) ?? getCurrentUserMember()
    const name = member?.name ?? user?.email?.split('@')[0] ?? 'You'
    return { id: user?.id ?? null, name, kind: 'member' }
  }, [members, getCurrentUserMember])

  /**
   * Append the member's own line. Optimistic: the sender sees it immediately;
   * realtime + the reload after the append reconcile it with the stored array.
   * Returns the thread as it stands after the append (for the agent's view).
   */
  const appendMember = useCallback(async (text: string, askedSymphony: boolean): Promise<DiscussMessage[]> => {
    const id = threadIdRef.current!
    const author = await resolveAuthor()
    const timestamp = new Date()
    const userMsg: DiscussMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp,
      author,
      ...(askedSymphony ? { askedSymphony: true as const } : {}),
    }
    const thread = [...messagesRef.current, userMsg]
    setMessages(thread)
    try {
      await supabase.rpc('append_chat_message', {
        p_session: id,
        p_message: {
          role: 'user',
          content: text,
          timestamp: timestamp.toISOString(),
          author,
          ...(askedSymphony ? { askedSymphony: true } : {}),
        },
      })
    } catch {
      // Fall through: the reload will show what stuck.
    }
    return thread
  }, [resolveAuthor])

  /** Say something to the people in the thread. Symphony stays quiet. */
  const post = useCallback(async (content: string) => {
    const text = content.trim()
    if (!text || !threadIdRef.current || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    await appendMember(text, false)
    sendingRef.current = false
    setSending(false)
    void reload()
  }, [appendMember, reload])

  /** Invite Symphony: post the question, then one agent turn with the whole thread. */
  const ask = useCallback(async (content: string) => {
    const text = content.trim()
    const id = threadIdRef.current
    if (!text || !id || sendingRef.current) return

    sendingRef.current = true
    setSending(true)
    setError(null)
    setToolActivity([])

    const thread = await appendMember(text, true)

    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), author: SYMPHONY_AUTHOR },
    ])

    const turn = await runAgentTurn(buildDiscussApiMessages(thread), {
      onText: (chunk) => {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m))
      },
      onTool: (name) => setToolActivity((prev) => [...prev, name]),
      onReplyFallback: (reply) => {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId && m.content.length === 0 ? { ...m, content: reply } : m))
      },
      onSources: (sources) => {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, sources } : m))
      },
      onError: (message) => setError(message),
      onFallbackText: (fallback) => {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId && m.content.length === 0 ? { ...m, content: fallback } : m))
      },
      currentMemberId: getCurrentUserMember()?.id,
      taskContext,
    })

    try {
      await supabase.rpc('append_chat_message', {
        p_session: id,
        p_message: {
          role: 'assistant',
          content: turn.text,
          timestamp: new Date().toISOString(),
          author: SYMPHONY_AUTHOR,
          ...(turn.sources && turn.sources.length > 0 ? { sources: turn.sources } : {}),
        },
      })
    } catch {
      // best-effort
    }

    if (turn.didWrite) onMutate?.()
    sendingRef.current = false
    setSending(false)
    // Re-read so the optimistic ids give way to the stored array (and so the
    // partner's messages that landed mid-turn are folded in).
    void reload()
  }, [appendMember, getCurrentUserMember, taskContext, onMutate, reload])

  // ── Mark read ─────────────────────────────────────────────────────────────
  // Stamp whenever the thread on screen changes while the tab is visible. A
  // failed stamp only affects the dot, so it stays silent.
  const messageCount = messages.length
  useEffect(() => {
    if (!markRead || !threadId || !selfAuthId || loading) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    void supabase
      .from('chat_session_reads')
      .upsert(
        { session_id: threadId, user_id: selfAuthId, last_read_at: new Date().toISOString() },
        { onConflict: 'session_id,user_id' },
      )
      .then(() => undefined, () => undefined)
  }, [markRead, threadId, selfAuthId, loading, messageCount])

  /** Distinct member names in the thread, plus whoever is looking. */
  const selfName = getCurrentUserMember()?.name
  const participants = Array.from(new Set([
    ...messages.filter((m) => m.author.kind === 'member').map((m) => m.author.name),
    ...(selfName ? [selfName] : []),
  ]))

  /** Everyone else who can open this thread — derived from the item's scope. */
  const sharedWith = entityScope ? sharedWithNames(members, selfAuthId, entityScope) : []

  return {
    threadId, messages, loading, sending, error, toolActivity,
    post, ask, participants, sharedWith, reload, selfAuthId,
  }
}
