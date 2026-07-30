// SUGGEST-WAITING-FOR — proposes what a task is actually waiting on.
//
// The "Waiting for…" field wants a sentence ("YNAB support to reply about the
// duplicate charge"), not a flag. Typing that sentence is the friction, and
// Symphony already knows enough to draft it: the task's own notes, the person
// it's about, the project it belongs to, and what was already tried all sit in
// the context bundle.
//
// So this is a context-graph CONSUMER, not another bespoke retrieval path — the
// third one after proactive-engine and symphony-agent. It reads the bundle,
// asks for 2-3 short candidates, and returns them. It never writes: the user's
// tap is what commits (same rule as sharpen-goal).
//
// Auth: user JWT, validated before any model call so an unauthenticated request
// can't bill the key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assembleContext } from '../_shared/context-graph/assemble.ts'
import { renderBundleForPrompt } from '../_shared/context-graph/build.ts'

const MODEL = 'claude-haiku-4-5-20251001'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

/** At most this many candidates reach the UI — it's a short list, not a menu. */
const MAX_SUGGESTIONS = 3

function buildPrompt(taskTitle: string, bundleText: string): string {
  return `A task in Symphony has been marked as blocked, waiting on someone or something. The user needs to record WHAT they're waiting for, in plain words, so it shows on the task and can be chased later.

TASK: "${taskTitle}"

WHAT SYMPHONY KNOWS:
${bundleText}

Propose ${MAX_SUGGESTIONS} candidate answers to "what are you waiting for?".

Rules:
- Each is a NOUN PHRASE that completes the sentence "Waiting on ___". So: "YNAB support to reply about the duplicate charge", NOT "I am waiting for YNAB".
- Under 12 words. One line. No trailing period.
- Name the actual person, company, or thing when the context gives you one. Use the names above; do NOT invent a person, company, amount, or date that isn't there.
- If the context is thin, offer the most plausible generic phrasing rather than inventing specifics ("a reply", "the quote", "their confirmation").
- Order them most-likely first, and make them genuinely DIFFERENT guesses — not three rewordings of one guess.

Respond with ONLY a JSON object, no markdown fences, no prose:
{"suggestions": ["...", "...", "..."]}`
}

function parseSuggestions(text: string): string[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as { suggestions?: unknown }
  if (!Array.isArray(parsed.suggestions)) throw new Error('Result missing suggestions array')
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of parsed.suggestions) {
    if (typeof s !== 'string') continue
    // Strip a leading "waiting on/for" the model may echo despite the rule, and
    // any trailing period, so the row reads "Waiting on <this>" cleanly.
    const cleaned = s
      .trim()
      .replace(/^waiting\s+(on|for)\s+/i, '')
      .replace(/\.\s*$/, '')
      .slice(0, 160)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
    if (out.length >= MAX_SUGGESTIONS) break
  }
  if (out.length === 0) throw new Error('No usable suggestions')
  return out
}

async function callClaude(prompt: string, apiKey: string, maxTokens = 400): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
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

  // Validate the caller's JWT before any model call so an unauthenticated
  // request can't bill the key.
  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: { taskId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const taskId = body.taskId?.trim()
  if (!taskId) return json({ error: 'taskId required' }, 400)

  try {
    // Bundle queries are user-scoped inside assembleContext, which matters here
    // because this runs on a service client.
    const bundle = await assembleContext(
      { client: service, openAiKey: Deno.env.get('OPENAI_API_KEY') || undefined },
      { entityType: 'task', entityId: taskId, userId: user.id },
    )
    if (!bundle.entity?.title) return json({ error: 'Task not found' }, 404)

    const text = await callClaude(buildPrompt(bundle.entity.title, renderBundleForPrompt(bundle)), apiKey)
    return json({ suggestions: parseSuggestions(text), degraded: bundle.degraded })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Suggest failed' }, 502)
  }
})
