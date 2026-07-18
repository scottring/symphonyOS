import { useCallback, useRef, useState } from 'react'
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
  /** Latest tool name while a tool call is in flight; null when idle. */
  toolActivity: string | null
  send: (text: string) => Promise<void>
  clear: () => void
}

/**
 * SSE client for the `meal-planner-chat` edge function. Carries the
 * conversation only — grid updates land via useMealPlan's realtime
 * subscription, not through this hook. Conversation history is held in
 * memory and re-sent with every turn (the edge fn is stateless; no
 * server-side session).
 */
export function useMealPlannerChat(weekStart: Date): UseMealPlannerChatResult {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  // Mirrors `messages` synchronously so send() can read the pre-turn history
  // and patch the in-flight assistant message without waiting on React state.
  const messagesRef = useRef<ChatMsg[]>([])

  const applyMessages = useCallback((next: ChatMsg[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

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
        body: JSON.stringify({ message: trimmed, weekStart: toIsoDate(weekStart), history }),
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
            patchLastMessage({ content: evt.reply ?? messagesRef.current.at(-1)?.content ?? '', pending: false })
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
  }, [weekStart, busy, applyMessages, patchLastMessage])

  const clear = useCallback(() => {
    applyMessages([])
    setToolActivity(null)
  }, [applyMessages])

  return { messages, busy, toolActivity, send, clear }
}
