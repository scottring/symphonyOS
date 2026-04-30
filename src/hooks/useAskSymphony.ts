import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/** A single suggestion card returned by the model. The `apply` payload is
 *  consumed client-side to mutate the plan. */
export interface AskSymphonySuggestion {
  kind: 'add' | 'swap' | 'remove'
  kicker: string
  title: string
  why: string
  /** Present on swap cards: the meal_plan_entries.id being replaced. */
  originalEntryId?: string
  /** Free-form payload — exact shape depends on `kind`. See PlannerPage's
   *  onApplySuggestion for the per-kind contract. */
  apply: Record<string, unknown>
}

export interface AskSymphonyMessage {
  /** Local-only id (not persisted; the server stores its own message list). */
  id: string
  role: 'user' | 'assistant'
  text: string
  cards?: AskSymphonySuggestion[]
}

interface AskResult {
  ok: boolean
  text?: string
  cards?: AskSymphonySuggestion[]
  sessionId?: string
  error?: string
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Thin wrapper around the `ask-symphony-meal` edge function.
 *
 *  v1: each open of the rail starts a fresh in-memory message list. The edge
 *  function still persists turns server-side so future enhancements can read
 *  back the session. */
export function useAskSymphony(weekStart: Date) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AskSymphonyMessage[]>([])
  const [busy, setBusy] = useState(false)

  const send = useCallback(async (message: string): Promise<AskResult> => {
    setBusy(true)
    const userMsgId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: message }])
    try {
      const { data, error } = await supabase.functions.invoke('ask-symphony-meal', {
        body: { message, weekStart: toIso(weekStart), sessionId: sessionId ?? undefined },
      })
      if (error || !data) {
        const msg = error?.message ?? 'Symphony is unavailable.'
        setMessages(prev => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', text: `(error: ${msg})` },
        ])
        return { ok: false, error: msg }
      }
      const result = data as { text: string; cards: AskSymphonySuggestion[]; sessionId: string }
      setSessionId(result.sessionId)
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: result.text, cards: result.cards },
      ])
      return { ok: true, ...result }
    } finally {
      setBusy(false)
    }
  }, [weekStart, sessionId])

  return { messages, busy, send, sessionId }
}
