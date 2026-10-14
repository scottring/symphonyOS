// MATH-STORY — dresses a Math of the day problem in a short story. The wall's
// code has already chosen the numbers and computed the answer
// (src/lib/wall/math); this only writes words around them: a story that keeps
// every number, a first-step hint, and names for the answer boxes.
//
// No DB reads or writes: the wall checks what comes back (acceptWording: every
// number kept, the answer never given away) and writes it onto the kid's row
// with the signed-in user's own permissions; anything that fails the check is
// dropped and the kid sees the plain problem. Auth: user JWT (same pattern as
// sharpen-goal), so unauthenticated requests can't bill the model.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-opus-5-5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

interface StoryRequest {
  kidName: string
  kind: 'multiply' | 'divide' | 'fraction' | 'addsub' | 'word'
  levelLabel: string
  expression: string
  numbers: string[]
  answer: string
  answerShape: 'number' | 'remainder' | 'fraction'
  labelCount: number
  steps: string[] | null
  defaultHint: string
}

const KINDS = new Set(['multiply', 'divide', 'fraction', 'addsub', 'word'])
const SHAPES = new Set(['number', 'remainder', 'fraction'])
const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max

function readRequest(b: Record<string, unknown>): StoryRequest | null {
  if (!str(b.kidName, 40) || !KINDS.has(b.kind as string) || !str(b.expression, 60) || !str(b.answer, 30)) return null
  if (!SHAPES.has(b.answerShape as string) || typeof b.labelCount !== 'number' || b.labelCount < 0 || b.labelCount > 2) return null
  if (!Array.isArray(b.numbers) || b.numbers.length < 1 || b.numbers.length > 4 || !b.numbers.every((n) => str(n, 12))) return null
  const steps = Array.isArray(b.steps) && b.steps.length <= 3 && b.steps.every((s) => str(s, 60)) ? (b.steps as string[]) : null
  return {
    kidName: (b.kidName as string).trim(),
    kind: b.kind as StoryRequest['kind'],
    levelLabel: typeof b.levelLabel === 'string' ? b.levelLabel.slice(0, 60) : '',
    expression: (b.expression as string).trim(),
    numbers: b.numbers as string[],
    answer: (b.answer as string).trim(),
    answerShape: b.answerShape as StoryRequest['answerShape'],
    labelCount: b.labelCount as number,
    steps,
    defaultHint: typeof b.defaultHint === 'string' ? b.defaultHint.slice(0, 240) : '',
  }
}

function buildPrompt(r: StoryRequest): string {
  const kindLine: Record<StoryRequest['kind'], string> = {
    multiply: 'a multiplication problem',
    divide: r.answerShape === 'remainder'
      ? 'a long-division problem with a remainder: the story must ask both how many and how many are left over'
      : 'a long-division problem that comes out even',
    fraction: 'a fraction problem: the story is about parts of one whole thing (a pizza, a ribbon, a garden), with each fraction written as digits like 3/8',
    addsub: 'a big adding or subtracting problem',
    word: 'a two-step word problem',
  }
  const labels = r.labelCount === 0
    ? '"labels": [] (the answer is a fraction, entered as top and bottom)'
    : r.labelCount === 1
      ? '"labels": ["1-3 words naming what the answer counts, e.g. Slices each"]'
      : '"labels": ["1-3 words for the main answer, e.g. Full boxes", "1-3 words for the remainder, e.g. Left over"]'
  return `You write the daily math problem for ${r.kidName}, an advanced third grader, shown on the family's kitchen wall. The numbers are already chosen; you write the words around them.

The problem: ${r.expression} (${kindLine[r.kind]}${r.levelLabel ? `; level: ${r.levelLabel}` : ''})
The answer is ${r.answer}.${r.steps ? `\nThe story must need exactly these two steps, in this order: ${r.steps.join(', then ')}.` : ''}

Write:
1. "story": a short, playful problem, 1-3 short sentences, under 40 words (at most 220 characters), starring ${r.kidName}. Use everyday kid things (school, sports, animals, baking, games, space). Write each of these numbers exactly as shown, as digits: ${r.numbers.join(', ')}. Use no other numbers. Never state the answer (${r.answer}) or hint at it. End with the question.
2. "hint": one short sentence that nudges the first step without giving the answer. A good one: "${r.defaultHint}"
3. ${labels}. Each label is at most 18 characters.

Plain words a 9-year-old reads easily. No markdown.

Respond with ONLY a JSON object, no code fences:
{"story": "...", "hint": "...", "labels": [...]}`
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // If a safety classifier declines, the API re-runs the request on a fallback model.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      fallbacks: 'default',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic returned ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] }
  if (data.stop_reason === 'refusal') throw new Error('Declined')
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

function parseResult(text: string): { story: string; hint: string; labels: string[] } {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as { story?: unknown; hint?: unknown; labels?: unknown }
  if (typeof parsed.story !== 'string' || !parsed.story.trim()) throw new Error('No story')
  return {
    story: parsed.story.trim().slice(0, 600),
    hint: typeof parsed.hint === 'string' ? parsed.hint.trim().slice(0, 300) : '',
    labels: Array.isArray(parsed.labels) ? parsed.labels.filter((l): l is string => typeof l === 'string').slice(0, 2) : [],
  }
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

  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const r = readRequest(body)
  if (!r) return json({ error: 'Invalid problem' }, 400)

  try {
    return json(parseResult(await callClaude(buildPrompt(r), apiKey)))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Story failed' }, 502)
  }
})
