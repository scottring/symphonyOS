// NOTE-MATCH — Ranks candidate notes for an inbox item and proposes a
// new-note title. Called from the client when the user opens the
// NotePicker on an inbox row.
//
// Auth: requires the calling user's Supabase JWT (standard pattern).
// Anthropic API key: ANTHROPIC_API_KEY secret.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InboxItem {
  title: string
  notes?: string
}

interface CandidateNote {
  id: string
  title: string
  first_200_chars: string
}

export interface NoteMatchRequest {
  inbox_item: InboxItem
  candidate_notes: CandidateNote[]
  domain: 'work' | 'family' | 'personal' | 'universal'
}

export interface NoteMatchResponse {
  best_match: { id: string; confidence: number } | null
  suggested_new_title: string
}

export function buildPrompt(req: NoteMatchRequest): string {
  const candidates = req.candidate_notes
    .map((n, i) => `[${i + 1}] id=${n.id} title="${n.title}" preview="${n.first_200_chars.replace(/"/g, '\\"')}"`)
    .join('\n')
  return `You are a triage assistant. The user just captured an inbox item and is deciding whether it belongs in an existing note or is the seed of a new one.

DOMAIN: ${req.domain}

INBOX ITEM:
  title: ${req.inbox_item.title}
  notes: ${req.inbox_item.notes ?? '(none)'}

EXISTING NOTES (most recent first):
${candidates || '(none)'}

Your job: pick the existing note that the inbox item *meaningfully* belongs to, if any. Be conservative — only return a match if the item adds context to that note in a way that would make sense to a human re-reading it later. Otherwise return null.

Always propose a short, descriptive title (max 6 words, no quotes, sentence case) for a *new* note that could absorb this item, in case the user prefers to create one.

Respond with strict JSON only, no prose, no markdown fence:
{"best_match": {"id": "<note_id>", "confidence": 0.0-1.0} | null, "suggested_new_title": "<title>"}`
}

export function parseResponse(raw: string): NoteMatchResponse {
  // Strip code fences if the model wrapped its output
  const trimmed = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { best_match: null, suggested_new_title: '' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { best_match: null, suggested_new_title: '' }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = parsed as any
  const bm = obj.best_match
  const best_match =
    bm && typeof bm === 'object' && typeof bm.id === 'string' && typeof bm.confidence === 'number'
      ? { id: bm.id, confidence: bm.confidence }
      : null
  const title = typeof obj.suggested_new_title === 'string' ? obj.suggested_new_title : ''
  return { best_match, suggested_new_title: title }
}

async function callAnthropic(prompt: string, apiKey: string, signal: AbortSignal): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Anthropic returned ${res.status}`)
  }
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (data as any)?.content?.[0]?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  let body: NoteMatchRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  if (!body?.inbox_item?.title || !Array.isArray(body.candidate_notes) || !body.domain) {
    return new Response(JSON.stringify({ error: 'inbox_item.title, candidate_notes, domain required' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const fallback: NoteMatchResponse = {
    best_match: null,
    suggested_new_title: body.inbox_item.title,
  }
  if (!apiKey) {
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)
  try {
    const prompt = buildPrompt(body)
    const text = await callAnthropic(prompt, apiKey, controller.signal)
    const parsed = parseResponse(text)
    // If LLM didn't propose a title, fall back to the task title
    if (!parsed.suggested_new_title) parsed.suggested_new_title = body.inbox_item.title
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('note-match failed:', err)
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } finally {
    clearTimeout(timeoutId)
  }
})
