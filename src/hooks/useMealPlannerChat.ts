import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  /** True while the assistant's reply for this turn is still in flight. */
  pending?: boolean
}

/** The SSE events the `meal-planner-chat` edge function actually emits
 *  (verified against supabase/functions/meal-planner-chat/index.ts):
 *    {type:'text', text}  — a complete text block from the current turn.
 *    {type:'tool', name}  — a tool call is about to run.
 *    {type:'done', reply} — the authoritative final assistant reply. No sessionId.
 *    {type:'error', message}
 *  Unlike the (delta-streamed) symphony-agent function, `text` here is the
 *  FULL text of the block that turn produced, not an incremental delta —
 *  the edge fn does one non-streaming Anthropic call per tool-loop turn.
 *  So each `text` event REPLACES the assistant message content rather than
 *  appending to it; `done.reply` is simply the last such value. */
interface SseEvent {
  type?: string
  text?: string
  name?: string
  reply?: string
  message?: string
}

/**
 * Pure helper: extracts complete `data: {...}\n\n` SSE frames from
 * `buffer + chunk`, returning the parsed events plus the leftover partial
 * frame to prepend to the next chunk. Frames that don't start with `data:`
 * are ignored; unparsable JSON is skipped rather than throwing.
 */
export function parseSseEvents(chunk: string, buffer: string): { events: SseEvent[]; rest: string } {
  const combined = buffer + chunk
  const frames = combined.split('\n\n')
  const rest = frames.pop() ?? ''
  const events: SseEvent[] = []
  for (const frame of frames) {
    const line = frame.trim()
    if (!line.startsWith('data:')) continue
    const json = line.slice(line.indexOf(':') + 1).trim()
    if (!json) continue
    try {
      events.push(JSON.parse(json) as SseEvent)
    } catch {
      // skip malformed frame
    }
  }
  return { events, rest }
}

export interface UseMealPlannerChatResult {
  messages: ChatMsg[]
  busy: boolean
  /** True while the persisted transcript for this week is being loaded. */
  loadingHistory: boolean
  /** Latest tool name while a tool call is in flight; null when idle. */
  toolActivity: string | null
  send: (text: string) => Promise<void>
  clear: () => void
}

/**
 * SSE client for the `meal-planner-chat` edge function. Carries the
 * conversation only — grid updates land via useMealPlan's realtime
 * subscription, not through this hook. The edge fn is stateless (no
 * server-side session); the client owns the history it re-sends each turn.
 *
 * That history is persisted to `meal_chat_messages` so navigating away from
 * /meals no longer wipes the conversation. The transcript is household-shared
 * and keyed by week_start (RLS mirrors meal_plans), so it is loaded on mount /
 * week change and each finalized message is written back. Persistence is
 * best-effort: a failed read/write degrades to the old in-memory behaviour
 * rather than breaking the live chat — the meals are the source of truth, the
 * transcript is a convenience.
 */
export function useMealPlannerChat(weekStart: Date): UseMealPlannerChatResult {
  const weekStartIso = toIsoDate(weekStart)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  // Mirrors `messages` synchronously so send() can read the pre-turn history
  // and patch the in-flight assistant message without waiting on React state.
  const messagesRef = useRef<ChatMsg[]>([])

  const applyMessages = useCallback((next: ChatMsg[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  // Persist one finalized message. Best-effort: swallow failures so the live
  // chat keeps working even if the write is rejected.
  const persist = useCallback(async (role: ChatMsg['role'], content: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase
        .from('meal_chat_messages')
        .insert({ user_id: user.id, week_start: weekStartIso, role, content })
    } catch (err) {
      console.warn('meal chat persist failed', err)
    }
  }, [weekStartIso])

  // Load the persisted transcript for this week on mount / week change.
  // RLS handles household visibility, so we query by week_start only — one
  // shared thread, merged across the household by created_at.
  useEffect(() => {
    let cancelled = false
    setLoadingHistory(true)
    applyMessages([])
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('meal_chat_messages')
          .select('role, content')
          .eq('week_start', weekStartIso)
          .order('created_at', { ascending: true })
        if (cancelled) return
        // Only seed if the user hasn't already started chatting while the load
        // was in flight — a slow load must never clobber live messages.
        if (!error && Array.isArray(data) && messagesRef.current.length === 0) {
          applyMessages(data.map((r) => ({ role: r.role as ChatMsg['role'], content: r.content })))
        }
      } catch (err) {
        if (!cancelled) console.warn('meal chat history load failed', err)
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => { cancelled = true }
  }, [weekStartIso, applyMessages])

  const patchLastMessage = useCallback((patch: Partial<ChatMsg>) => {
    const current = messagesRef.current
    if (current.length === 0) return
    const next = current.map((m, i) => (i === current.length - 1 ? { ...m, ...patch } : m))
    applyMessages(next)
  }, [applyMessages])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    const history = messagesRef.current.map(({ role, content }) => ({ role, content }))

    setBusy(true)
    setToolActivity(null)
    applyMessages([
      ...messagesRef.current,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '', pending: true },
    ])
    // Write the user message straight away so it survives even if the tab
    // closes before the assistant's reply lands.
    void persist('user', trimmed)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        patchLastMessage({ content: 'Something went wrong: not signed in', pending: false })
        return
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meal-planner-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: trimmed, weekStart: weekStartIso, history }),
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => 'request failed')
        patchLastMessage({ content: `Something went wrong: ${errText}`, pending: false })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const { events, rest } = parseSseEvents(chunk, buffer)
        buffer = rest
        for (const evt of events) {
          if (evt.type === 'text' && typeof evt.text === 'string') {
            patchLastMessage({ content: evt.text })
          } else if (evt.type === 'tool' && typeof evt.name === 'string') {
            setToolActivity(evt.name)
          } else if (evt.type === 'done') {
            const reply = evt.reply ?? messagesRef.current.at(-1)?.content ?? ''
            patchLastMessage({ content: reply, pending: false })
            // Persist the authoritative final reply. Error replies (below) are
            // deliberately not persisted — no point reloading "Something went
            // wrong" on the next visit.
            if (reply) void persist('assistant', reply)
          } else if (evt.type === 'error') {
            patchLastMessage({ content: `Something went wrong: ${evt.message ?? 'unknown error'}`, pending: false })
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      patchLastMessage({ content: `Something went wrong: ${msg}`, pending: false })
    } finally {
      setBusy(false)
      setToolActivity(null)
    }
  }, [weekStartIso, busy, applyMessages, patchLastMessage, persist])

  const clear = useCallback(() => {
    applyMessages([])
    setToolActivity(null)
    // Wipe the whole household's thread for this week (RLS-scoped delete).
    void (async () => {
      try {
        await supabase.from('meal_chat_messages').delete().eq('week_start', weekStartIso)
      } catch (err) {
        console.warn('meal chat clear failed', err)
      }
    })()
  }, [applyMessages, weekStartIso])

  return { messages, busy, loadingHistory, toolActivity, send, clear }
}
