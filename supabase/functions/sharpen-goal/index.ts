// SHARPEN-GOAL — one-shot goal rewrite. Given a goal statement, returns a
// sharper version phrased as a past-tense outcome with a concrete finish line
// (the same quality the guided planning flow coaches), plus a one-line "why".
// No DB reads/writes: the client applies the rewrite via updateGoal only if the
// user taps "Use this" (AI proposes; only the user's tap writes). Auth: user JWT
// (same pattern as analyze-capture / symphony-agent).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

interface SharpenResult {
  suggestion: string
  why: string
}

function buildPrompt(name: string, areaName?: string, context?: string): string {
  const where = [areaName ? `life area "${areaName}"` : null, context ? `${context} domain` : null]
    .filter(Boolean)
    .join(', ')
  return `You are the goal coach for Symphony, a personal planning app. The user wrote an annual goal${where ? ` in their ${where}` : ''}:

"${name}"

Rewrite it as a SHARPER version, following these rules (the same ones the guided planning ritual teaches):
- Phrase it in the PAST TENSE, as if it already happened by this time next year ("Shipped…", "Renovated…", "Finally…"). Past tense forces specifics; future/present tense stays vague.
- Give it a concrete FINISH LINE — something you could point at and say "done": a number, a milestone, an observable state.
- Keep the user's actual intent and voice. Do NOT invent facts (specific dollar amounts, dates, or names the user didn't imply). Prefer a concrete-but-honest finish line over a fabricated metric.
- One sentence. Plain language, no markdown.

Respond with ONLY a JSON object (no markdown fences, no prose):
{
  "suggestion": "the rewritten goal, one past-tense sentence with a finish line",
  "why": "one short clause naming what you sharpened, e.g. 'past tense + a countable finish line'"
}`
}

function parseResult(text: string): SharpenResult {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as Partial<SharpenResult>
  if (typeof parsed.suggestion !== 'string' || !parsed.suggestion.trim()) {
    throw new Error('Sharpen result missing suggestion')
  }
  return {
    suggestion: parsed.suggestion.trim().slice(0, 300),
    why: typeof parsed.why === 'string' ? parsed.why.trim().slice(0, 160) : '',
  }
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic returned ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !serviceKey) return json({ error: 'Missing server config' }, 500)

  // Validate the caller's JWT so unauthenticated requests can't bill the model.
  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: { name?: string; areaName?: string; context?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const name = body.name?.trim()
  if (!name) return json({ error: 'name required' }, 400)
  if (name.length > 500) return json({ error: 'name too long' }, 400)

  try {
    const text = await callClaude(buildPrompt(name, body.areaName, body.context), apiKey)
    return json(parseResult(text))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Sharpen failed' }, 502)
  }
})
