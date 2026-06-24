import { supabase } from '@/lib/supabase'

export type AgentStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; reply: string; sessionId: string | null }
  | { type: 'error'; message: string }

/**
 * Parse a growing SSE buffer. Returns the complete events found and the
 * leftover (incomplete) tail to prepend to the next chunk. Pure + testable.
 */
export function parseSSEChunk(buffer: string): { events: AgentStreamEvent[]; rest: string } {
  const frames = buffer.split('\n\n')
  const rest = frames.pop() ?? ''
  const events: AgentStreamEvent[] = []
  for (const frame of frames) {
    const line = frame.trim()
    if (!line.startsWith('data:')) continue
    const json = line.slice(line.indexOf(':') + 1).trim()
    try {
      events.push(JSON.parse(json) as AgentStreamEvent)
    } catch {
      // skip malformed frame
    }
  }
  return { events, rest }
}

export interface StreamHandlers {
  onText?: (text: string) => void
  onTool?: (name: string) => void
  onSession?: (sessionId: string) => void
  onDone?: (reply: string, sessionId: string | null) => void
  onError?: (message: string) => void
}

export type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'document'; source: { type: 'url'; url: string } }

export interface AgentApiMessage {
  role: 'user' | 'assistant'
  content: string | AgentContentBlock[]
}

/**
 * Stream the Symphony agent edge function for one conversation turn.
 * Sends the full message history; the function verifies the caller's JWT
 * and runs all tool queries RLS-scoped to that user.
 */
export async function streamSymphonyAgent(
  messages: AgentApiMessage[],
  handlers: StreamHandlers,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    handlers.onError?.('Not signed in')
    return
  }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/symphony-agent`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    },
  )

  if (!res.ok || !res.body) {
    handlers.onError?.(res.status === 401 ? 'Session expired' : 'Assistant offline')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSSEChunk(buffer)
    buffer = rest
    for (const ev of events) {
      if (ev.type === 'text') handlers.onText?.(ev.text)
      else if (ev.type === 'tool') handlers.onTool?.(ev.name)
      else if (ev.type === 'session') handlers.onSession?.(ev.sessionId)
      else if (ev.type === 'done') handlers.onDone?.(ev.reply, ev.sessionId)
      else if (ev.type === 'error') handlers.onError?.(ev.message)
    }
  }
}
