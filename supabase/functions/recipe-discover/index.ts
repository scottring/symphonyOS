// supabase/functions/recipe-discover/index.ts
//
// Recipe discovery: given a freeform query, generate 3 candidate recipes via
// Claude Haiku 4.5. The user picks one and saves it to the shelf client-side.
//
// Request:
//   POST { query: string, source?: 'ai' | 'web' }
//
// Responses:
//   AI tier (default): 200 { candidates: [<recipe>, <recipe>, <recipe>], source: 'ai' }
//   Web tier (stub):   502 { error: '...', upgrade: true }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Extract the outermost balanced { ... } object from a string. */
function extractJson(s: string): string {
  const start = s.indexOf('{')
  if (start < 0) return s
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1)
  }
  return s
}

const SYSTEM_PROMPT = `You generate recipe candidates for a household meal planner. Given a freeform query, output exactly 3 distinct recipe candidates as strict JSON. Each candidate is a complete, cookable recipe — real-feeling ingredients, sensible step-by-step instructions, realistic prep time. Tailor variety: if the query is broad, span different cuisines or techniques; if narrow, vary within that constraint.

Output strict JSON:
{
  "candidates": [
    {
      "title": "<short recipe name>",
      "why": "<one sentence: why this fits the query>",
      "prep_minutes": <integer>,
      "is_prep_friendly": <boolean>,
      "tags": ["<canonical-slot-or-meta>", "..."],   // pick from: breakfast, lunch, snack, dinner, quick, batch, vegetarian, kid-friendly, gluten-free, dairy-free
      "ingredients": ["<line 1>", "<line 2>", ...],   // 5-12 lines, one per line, with quantities
      "instructions": ["<step 1>", "<step 2>", ...],  // 3-8 steps, one per line, imperative voice
      "acceptance_sentence": "<one short sentence about kid acceptance, in italic-friendly tone>",
      "tag_grams_estimate": <integer or null>,        // grams of vegetables this contributes (rough), e.g. 80, 200, 430. null if no veg or not estimable.
      "tag_kcal_estimate": <integer or null>          // approximate kcal per serving
    },
    { ...two more... }
  ]
}

Keep titles short and human (not "Delicious Easy Quick…"). Acceptance sentences should sound like a parent observed a real meal — e.g. "Both kids love this." or "Ella eats it. Kaleb negotiates." Don't mention "AI" or "I". Don't add markdown.`

interface RequestBody {
  query: string
  source?: 'ai' | 'web'
}

interface RawCandidate {
  title?: string
  why?: string
  prep_minutes?: number
  is_prep_friendly?: boolean
  tags?: string[]
  ingredients?: string[]
  instructions?: string[]
  acceptance_sentence?: string
  tag_grams_estimate?: number | null
  tag_kcal_estimate?: number | null
}

interface NormalizedCandidate {
  title: string
  why: string
  prep_minutes: number
  is_prep_friendly: boolean
  tags: string[]
  ingredients: string[]
  instructions: string[]
  acceptance_sentence: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonError(405, 'method not allowed')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonError(401, 'missing authorization')

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) return jsonError(500, 'ANTHROPIC_API_KEY not set')

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonError(400, 'invalid JSON body')
  }
  if (!body.query?.trim()) return jsonError(400, 'query required')

  const source = body.source ?? 'ai'

  // Web tier is a premium stub for a future paid feature.
  if (source === 'web') {
    return new Response(
      JSON.stringify({
        error: 'Web search is a premium feature — upgrade to access curated results.',
        upgrade: true,
      }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  // ── AI tier: call Haiku 4.5 one-shot ───────────────────────────────
  const turns = [
    { role: 'user', content: `QUERY: ${body.query.trim()}` },
    { role: 'assistant', content: '{\n  "candidates":' },
  ]

  let upstream: Response
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        stream: false,
        system: SYSTEM_PROMPT,
        messages: turns,
      }),
    })
  } catch (e) {
    console.error('[recipe-discover] fetch failed:', e)
    return jsonError(502, `anthropic fetch failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (!upstream.ok) {
    const bodyText = await upstream.text().catch(() => '')
    const requestId = upstream.headers.get('request-id') ?? upstream.headers.get('x-request-id') ?? null
    console.error('anthropic upstream error', { status: upstream.status, requestId, body: bodyText })
    let detail = bodyText.slice(0, 500)
    try {
      const parsed = JSON.parse(bodyText)
      const apiMsg = parsed?.error?.message ?? parsed?.message
      if (typeof apiMsg === 'string') detail = apiMsg
    } catch { /* keep raw slice */ }
    return jsonError(502, `anthropic ${upstream.status}: ${detail}${requestId ? ` (req ${requestId})` : ''}`)
  }

  let upstreamJson: { content?: Array<{ type?: string; text?: string }> }
  try {
    upstreamJson = await upstream.json()
  } catch (e) {
    return jsonError(502, `anthropic response not JSON: ${e instanceof Error ? e.message : String(e)}`)
  }

  const modelText = (upstreamJson.content ?? [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('')

  // Re-prefix the prefilled assistant content to form complete JSON.
  const fullJson = `{\n  "candidates":${modelText}`
  let parsed: { candidates?: RawCandidate[] }
  try {
    parsed = JSON.parse(extractJson(fullJson))
  } catch (e) {
    console.error('[recipe-discover] JSON parse failed:', e, 'rawText:', modelText.slice(0, 500))
    return jsonError(502, `model response not JSON: ${e instanceof Error ? e.message : String(e)}`)
  }

  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : []

  const normalized: NormalizedCandidate[] = rawCandidates.map(normalizeCandidate).filter(Boolean) as NormalizedCandidate[]

  return new Response(
    JSON.stringify({ candidates: normalized, source: 'ai' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})

function normalizeCandidate(raw: RawCandidate): NormalizedCandidate | null {
  if (!raw || typeof raw.title !== 'string' || !raw.title.trim()) return null

  const baseTags = Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string') : []
  const tags = [...baseTags]

  if (typeof raw.tag_grams_estimate === 'number' && Number.isFinite(raw.tag_grams_estimate)) {
    tags.push(`~${Math.round(raw.tag_grams_estimate)}g`)
  }
  if (typeof raw.tag_kcal_estimate === 'number' && Number.isFinite(raw.tag_kcal_estimate)) {
    tags.push(`~${Math.round(raw.tag_kcal_estimate)}kcal`)
  }

  return {
    title: raw.title.trim(),
    why: typeof raw.why === 'string' ? raw.why : '',
    prep_minutes: typeof raw.prep_minutes === 'number' ? Math.max(0, Math.round(raw.prep_minutes)) : 0,
    is_prep_friendly: !!raw.is_prep_friendly,
    tags,
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.filter(s => typeof s === 'string') : [],
    instructions: Array.isArray(raw.instructions) ? raw.instructions.filter(s => typeof s === 'string') : [],
    acceptance_sentence: typeof raw.acceptance_sentence === 'string' ? raw.acceptance_sentence : '',
  }
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
