import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'

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

/** Thin wrapper around the `ask-symphony-meal` edge function. */
export function useAskSymphony(weekStart: Date) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AskSymphonyMessage[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const weekStartIso = toIsoDate(weekStart)
      const { data } = await supabase
        .from('chat_sessions')
        .select('id, messages')
        .eq('user_id', user.id)
        .eq('entity_type', 'meal_week')
        .eq('entity_id', weekStartIso)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled || !data) return
      const dbMessages = (data.messages ?? []) as Array<{ role: 'user' | 'assistant'; text: string; cards?: unknown }>
      const hydrated: AskSymphonyMessage[] = dbMessages.map((m, i) => ({
        id: `loaded-${data.id}-${i}`,
        role: m.role,
        text: m.text,
        cards: (m.cards as AskSymphonySuggestion[] | undefined) ?? undefined,
      }))
      setSessionId(data.id)
      setMessages(hydrated)
    })()
    return () => { cancelled = true }
  }, [weekStart])

  const send = useCallback(async (message: string): Promise<AskResult> => {
    setBusy(true)
    const userMsgId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: message }])
    try {
      const { data, error } = await supabase.functions.invoke('ask-symphony-meal', {
        body: { message, weekStart: toIsoDate(weekStart), sessionId: sessionId ?? undefined },
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
