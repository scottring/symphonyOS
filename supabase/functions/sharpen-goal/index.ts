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

// Season-bet variant: bets read best as outcomes ("Will drafted and signed"),
// not activities ("Start working on the will") — see lib/planning/outcomeCoach.
// Unlike buildPrompt's JSON contract, this asks for a bare sentence: no "why"
// to show, just the rewrite the coach hint's Sharpen button drops straight
// into the draft input.
function buildBetPrompt(title: string): string {
  return `Rewrite the given season intention as a single outcome sentence: the end-state that will be true by the end of the season, concrete and verifiable, under 12 words, no "start/continue/work on" phrasing. Return only the rewritten sentence.

"${title}"`
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

// Bench audit: judge each bench item against the season grain and return a
// per-item verdict the client renders inline. Verdicts:
//   ready    — a well-constructed season outcome as written
//   rephrase — right size, wrong shape (activity phrasing) → suggestion
//   month    — month-sized (fits a sitting or two) → belongs on the month list
//   goal     — multi-season direction in disguise → shelve or translate
function buildAuditPrompt(items: { id: string; title: string }[]): string {
  const list = items.map((i) => `- id "${i.id}": "${i.title}"`).join('\n')
  return `You are the planning coach for Symphony. The user's SEASON page holds "picks" — outcomes true by the end of a ~13-week season, measured in weekends ("Will drafted and signed"). A MONTH move fits in a sitting or two ("Order the dishwasher"). A GOAL is a multi-season direction ("Financial calm"). Audit each bench item below for season-level construction:

${list}

For each item return a verdict:
- "ready": a concrete season-sized outcome as written.
- "rephrase": season-sized but phrased as an activity or vaguely — include "suggestion": a rewrite as one outcome sentence, under 12 words, no "start/continue/work on" phrasing, keeping the user's intent without inventing facts.
- "month": actually month-sized — doable in a sitting or two.
- "goal": actually a multi-season direction, too big for one season.

Also give every item a "reason": one short plain clause (under 12 words).

For "month" and "goal" verdicts, ALSO include "seasonVersion": the item rewritten as a genuine season-sized outcome (one sentence, under 12 words, no "start/continue/work on" phrasing, keeping the user's intent without inventing facts) — the upgrade path in case the user wants to keep it at season level. For "month", scope UP (the fuller outcome the sitting serves); for "goal", scope DOWN (the one-season slice).

Respond with ONLY a JSON array (no markdown fences, no prose), one object per item, same order:
[{"id": "...", "verdict": "ready|rephrase|month|goal", "suggestion": "only for rephrase", "seasonVersion": "only for month/goal", "reason": "..."}]`
}

export interface AuditItemResult {
  id: string
  verdict: 'ready' | 'rephrase' | 'month' | 'goal'
  suggestion?: string
  /** For month/goal verdicts: the item rewritten at season grain (the upgrade path). */
  seasonVersion?: string
  reason: string
}

function parseAuditResult(text: string, ids: string[]): AuditItemResult[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as Partial<AuditItemResult>[]
  if (!Array.isArray(parsed)) throw new Error('Audit result was not an array')
  const valid = new Set(ids)
  const verdicts = new Set(['ready', 'rephrase', 'month', 'goal'])
  return parsed
    .filter((r): r is AuditItemResult =>
      typeof r?.id === 'string' && valid.has(r.id) && typeof r?.verdict === 'string' && verdicts.has(r.verdict))
    .map((r) => ({
      id: r.id,
      verdict: r.verdict,
      suggestion: typeof r.suggestion === 'string' ? r.suggestion.trim().slice(0, 300) : undefined,
      seasonVersion: typeof r.seasonVersion === 'string' ? r.seasonVersion.trim().slice(0, 300) : undefined,
      reason: typeof r.reason === 'string' ? r.reason.trim().slice(0, 160) : '',
    }))
}

// The bet prompt asks for a bare sentence, not JSON — strip any stray quoting
// or code fences the model adds anyway and use the line as-is.
function parseBetResult(text: string): SharpenResult {
  const stripped = text
    .trim()
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
  if (!stripped) throw new Error('Sharpen result was empty')
  return { suggestion: stripped.slice(0, 300), why: '' }
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

  // Validate the caller's JWT so unauthenticated requests can't bill the model.
  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: {
    name?: string; title?: string; areaName?: string; context?: string
    mode?: 'goal' | 'bet' | 'audit'
    items?: { id?: string; title?: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Bench audit: batch verdicts, separate path from the single-title modes.
  if (body.mode === 'audit') {
    const items = (body.items ?? [])
      .filter((i): i is { id: string; title: string } =>
        typeof i?.id === 'string' && typeof i?.title === 'string' && !!i.title.trim())
      .slice(0, 40)
      .map((i) => ({ id: i.id, title: i.title.trim().slice(0, 300) }))
    if (items.length === 0) return json({ error: 'items required' }, 400)
    try {
      const text = await callClaude(buildAuditPrompt(items), apiKey, 3000)
      return json({ results: parseAuditResult(text, items.map((i) => i.id)) })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Audit failed' }, 502)
    }
  }

  const isBet = body.mode === 'bet'
  const name = (isBet ? body.title : body.name)?.trim()
  if (!name) return json({ error: `${isBet ? 'title' : 'name'} required` }, 400)
  if (name.length > 500) return json({ error: `${isBet ? 'title' : 'name'} too long` }, 400)

  try {
    const text = isBet
      ? await callClaude(buildBetPrompt(name), apiKey)
      : await callClaude(buildPrompt(name, body.areaName, body.context), apiKey)
    return json(isBet ? parseBetResult(text) : parseResult(text))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Sharpen failed' }, 502)
  }
})
