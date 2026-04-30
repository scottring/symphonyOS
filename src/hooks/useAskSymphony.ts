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

/** Thin wrapper around the `ask-symphony-meal` edge function. The function
 *  returns Server-Sent Events; we read them incrementally and update the
 *  assistant message as text deltas arrive, then attach cards on the final
 *  `done` event. */
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
      const dbMessages = (data.messages ?? []) as Array<{ role: 'user' | 'assistant'; text?: string; content?: string; cards?: unknown }>
      const hydrated: AskSymphonyMessage[] = dbMessages.map((m, i) => ({
        id: `loaded-${data.id}-${i}`,
        role: m.role,
        // Server persists the assistant body as `content`; older rows used
        // `text`. Accept either.
        text: m.text ?? m.content ?? '',
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
    const assistantMsgId = crypto.randomUUID()
    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text: message },
      { id: assistantMsgId, role: 'assistant', text: '' },
    ])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: '(not authenticated)' } : m))
        return { ok: false, error: 'not authenticated' }
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-symphony-meal`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, weekStart: toIsoDate(weekStart), sessionId: sessionId ?? undefined }),
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => 'stream failed')
        setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: `(error: ${errText})` } : m))
        return { ok: false, error: errText }
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      let accumulatedText = ''
      let finalCards: AskSymphonySuggestion[] = []
      let finalSessionId = sessionId
      let resultError: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        const lines = acc.split('\n')
        acc = lines.pop() ?? ''
        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) continue
          const json = line.slice(5).trim()
          if (!json) continue
          let evt: { type?: string; delta?: string; cards?: AskSymphonySuggestion[]; sessionId?: string; text?: string; message?: string }
          try {
            evt = JSON.parse(json)
          } catch {
            continue
          }
          if (evt.type === 'text' && typeof evt.delta === 'string') {
            accumulatedText += evt.delta
            const snapshot = accumulatedText
            setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: snapshot } : m))
          } else if (evt.type === 'done') {
            finalCards = evt.cards ?? []
            if (evt.sessionId) finalSessionId = evt.sessionId
            // Prefer the server's authoritative `text` for the persisted message.
            const finalText = typeof evt.text === 'string' && evt.text.length > 0 ? evt.text : accumulatedText
            accumulatedText = finalText
            setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: finalText, cards: finalCards } : m))
          } else if (evt.type === 'error') {
            resultError = evt.message ?? 'stream error'
            const errMsg = resultError
            setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: (m.text ? m.text + '\n' : '') + `(error: ${errMsg})` } : m))
          }
        }
      }

      if (finalSessionId) setSessionId(finalSessionId)
      if (resultError) return { ok: false, error: resultError }
      return { ok: true, text: accumulatedText, cards: finalCards, sessionId: finalSessionId ?? undefined }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, text: `(error: ${msg})` } : m))
      return { ok: false, error: msg }
    } finally {
      setBusy(false)
    }
  }, [weekStart, sessionId])

  return { messages, busy, send, sessionId }
}
