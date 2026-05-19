import type { AskSymphonySuggestion } from '@/hooks/useAskSymphony'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'

export interface MealStreamResult {
  text: string
  cards: AskSymphonySuggestion[]
  error?: string
}

/** Read an ask-symphony-meal SSE body to completion and return the final
 *  text + cards. Pure over the stream so it is unit-testable. */
export async function collectMealStream(
  body: ReadableStream<Uint8Array>,
): Promise<MealStreamResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  let text = ''
  let cards: AskSymphonySuggestion[] = []
  let error: string | undefined
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    acc += decoder.decode(value, { stream: true })
    const lines = acc.split('\n')
    acc = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (!json) continue
      let evt: { type?: string; delta?: string; cards?: AskSymphonySuggestion[]; text?: string; message?: string }
      try { evt = JSON.parse(json) } catch { continue }
      if (evt.type === 'text' && typeof evt.delta === 'string') text += evt.delta
      else if (evt.type === 'done') {
        cards = evt.cards ?? []
        if (typeof evt.text === 'string' && evt.text.length > 0) text = evt.text
      } else if (evt.type === 'error') error = evt.message ?? 'stream error'
    }
  }
  return { text, cards, error }
}

/** Invoke ask-symphony-meal for a one-off request (no chat session) and
 *  return its suggestion cards. Used by the general-chat meal handoff. */
export async function fetchMealSuggestions(
  message: string,
  weekStart: Date,
): Promise<MealStreamResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { text: '', cards: [], error: 'not authenticated' }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-symphony-meal`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      weekStart: toIsoDate(weekStart),
      clientToday: toIsoDate(new Date()),
    }),
  })
  if (!res.ok || !res.body) {
    return { text: '', cards: [], error: await res.text().catch(() => 'request failed') }
  }
  return collectMealStream(res.body)
}
