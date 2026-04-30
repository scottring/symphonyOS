// supabase/functions/ask-symphony-meal/index.ts
//
// Per-week meal-plan chat. The planner asks a question or requests a change,
// the model returns a short conversational reply plus optional Suggestion
// Cards (add / swap / remove). The user explicitly applies a card client-side
// — this function never mutates meal_plan_entries directly.
//
// State: prior turns persist in chat_sessions
//   (entity_type='meal_week', entity_id=<weekStart YYYY-MM-DD>).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildPromptContext } from '../_shared/mealPlanGenerate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Extract the outermost balanced { ... } object from a string. Tolerates
 *  trailing prose models occasionally emit after the JSON. Returns the input
 *  unchanged if no `{` is found. */
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

const SYSTEM_PROMPT = `You are Symphony's meal-planning assistant. The planner is asking about THIS WEEK's plan. You can suggest swaps, additions, removals, or just answer questions. NEVER act unilaterally — surface SuggestionCards in your response and let the planner click "Apply" to commit.

Output strict JSON:
{
  "text": "<short conversational reply, 1-3 sentences>",
  "cards": [SuggestionCard, …]
}

A SuggestionCard is one of:

(a) ADD a meal:
{
  "kind": "add",
  "kicker": "<short label like 'TUESDAY DINNER · KID-FRIENDLY ADD'>",
  "title": "<recipe title or ad-hoc name>",
  "why": "<one sentence explaining the choice>",
  "apply": {
    "dayOfWeek": 0..6,
    "slot": "breakfast"|"lunch"|"snack"|"dinner",
    "recipeId": "<uuid from shelf or null>",
    "adHocTitle": "<string or null>",
    "familyMemberId": "<family_members.id or null>"
  }
}

(b) SWAP an existing entry:
{
  "kind": "swap",
  "kicker": "TUESDAY DINNER · KID-FRIENDLY SWAP",
  "originalEntryId": "<existing meal_plan_entries.id>",
  "title": "<replacement title>",
  "why": "...",
  "apply": {
    "dayOfWeek": 0..6,
    "slot": "...",
    "recipeId": "<uuid or null>",
    "adHocTitle": "<or null>",
    "familyMemberId": "<or null>"
  }
}

(c) REMOVE an entry:
{
  "kind": "remove",
  "kicker": "MONDAY LUNCH · REMOVE",
  "title": "<the entry being removed>",
  "why": "...",
  "apply": { "entryId": "<existing meal_plan_entries.id>" }
}

If the planner is just asking a question (no action implied), return cards: [].
Recipe ids must come from the supplied shelf — never invent one. For meals not on the shelf, use adHocTitle and recipeId: null.
day_of_week is 0..6 (Mon..Sun).`

interface RequestBody {
  message: string
  weekStart: string      // YYYY-MM-DD
  sessionId?: string
}

interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  cards?: unknown[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError(401, 'missing authorization')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return jsonError(500, 'ANTHROPIC_API_KEY not set')

    const body = (await req.json()) as RequestBody
    if (!body.message?.trim()) return jsonError(400, 'message required')
    if (!body.weekStart)        return jsonError(400, 'weekStart required')

    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id
    if (!userId) return jsonError(401, 'no authenticated user')

    // ── Load context (RLS filters to household-visible rows) ───────────
    const [
      { data: planRows, error: planErr },
      { data: briefRows, error: briefErr },
      { data: recipes,   error: recErr   },
      { data: habits,    error: habErr   },
      { data: members,   error: memErr   },
    ] = await Promise.all([
      supabase.from('meal_plans').select('id,user_id').eq('week_start', body.weekStart).order('created_at', { ascending: true }).limit(1),
      supabase.from('weekly_briefs').select('id,body').eq('week_start', body.weekStart).order('created_at', { ascending: true }).limit(1),
      supabase.from('recipes').select('id,title,tags,prep_minutes,acceptance_sentence,is_prep_friendly'),
      supabase.from('standing_habits').select('user_id,name,slot,grams_hint,paused_for_weeks').eq('paused', false),
      supabase.from('family_members').select('id,name,auth_user_id'),
    ])
    if (planErr || briefErr || recErr || habErr || memErr) {
      return jsonError(500, `context load failed: ${(planErr || briefErr || recErr || habErr || memErr)?.message}`)
    }

    const plan = planRows?.[0]
    const brief = briefRows?.[0]

    // Plan entries (so the model knows what's already scheduled).
    let entryRows: Array<{
      id: string
      day_of_week: number
      slot: string
      recipe_id: string | null
      ad_hoc_title: string | null
      family_member_id: string | null
    }> = []
    if (plan) {
      const { data: er, error: entryErr } = await supabase
        .from('meal_plan_entries')
        .select('id,day_of_week,slot,recipe_id,ad_hoc_title,family_member_id')
        .eq('meal_plan_id', plan.id)
      if (entryErr) return jsonError(500, `entries load failed: ${entryErr.message}`)
      entryRows = er ?? []
    }

    // ── Load or create chat session ────────────────────────────────────
    let sessionId = body.sessionId ?? null
    let priorMessages: StoredMessage[] = []

    if (sessionId) {
      const { data: sess, error: sessErr } = await supabase
        .from('chat_sessions')
        .select('id,messages')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle()
      if (sessErr) return jsonError(500, `session load failed: ${sessErr.message}`)
      if (!sess) {
        // Caller passed a stale id — start a fresh session below.
        sessionId = null
      } else {
        priorMessages = (sess.messages ?? []) as StoredMessage[]
      }
    }

    // ── Build prompt ───────────────────────────────────────────────────
    const planContext = buildPromptContext({
      weekStart: body.weekStart,
      mealPlanId: plan?.id ?? '(no plan yet)',
      members: (members ?? []).map(m => ({ name: m.name, family_member_id: m.id, auth_user_id: m.auth_user_id })),
      shelf:   (recipes ?? []).map(r => ({
        recipe_id: r.id, title: r.title, tags: r.tags ?? [],
        prep_minutes: r.prep_minutes, kid_acceptance: r.acceptance_sentence,
        is_prep_friendly: r.is_prep_friendly,
      })),
      habits: (habits ?? []).map(h => ({
        owner_auth_user_id: h.user_id, name: h.name, slot: h.slot, grams_hint: h.grams_hint,
      })),
      brief: brief?.body ?? '',
    })

    const recipeTitleById = new Map<string, string>()
    for (const r of (recipes ?? [])) recipeTitleById.set(r.id, r.title)
    const memberNameById = new Map<string, string>()
    for (const m of (members ?? [])) memberNameById.set(m.id, m.name)

    const entriesBlock = entryRows.length === 0
      ? '  (none — plan is empty)'
      : entryRows.map(e => {
          const title = e.recipe_id ? (recipeTitleById.get(e.recipe_id) ?? '(unknown recipe)') : (e.ad_hoc_title ?? '(unnamed)')
          const owner = e.family_member_id ? (memberNameById.get(e.family_member_id) ?? '?') : 'family'
          return `  - {entry_id: ${JSON.stringify(e.id)}, day_of_week: ${e.day_of_week}, slot: ${JSON.stringify(e.slot)}, title: ${JSON.stringify(title)}, recipe_id: ${e.recipe_id ? JSON.stringify(e.recipe_id) : 'null'}, family_member_id: ${e.family_member_id ? JSON.stringify(e.family_member_id) : 'null'} (${owner})}`
        }).join('\n')

    const fullContext = [
      planContext,
      '',
      `CURRENT PLAN ENTRIES (${entryRows.length}):`,
      entriesBlock,
    ].join('\n')

    // Conversation history → proper user/assistant turns.
    type AnthropicTurn = { role: 'user' | 'assistant'; content: string }
    const turns: AnthropicTurn[] = []

    // First turn anchors the planner state. Subsequent turns are pure dialogue.
    if (priorMessages.length === 0) {
      turns.push({ role: 'user', content: `${fullContext}\n\nPLANNER: ${body.message}` })
    } else {
      turns.push({ role: 'user', content: `${fullContext}\n\n(continuing the conversation — see prior turns below)` })
      turns.push({ role: 'assistant', content: '{ "text": "Got it.", "cards": [] }' })
      for (const m of priorMessages) {
        turns.push({ role: m.role, content: m.content })
      }
      turns.push({ role: 'user', content: body.message })
    }
    // Prefill so the model commits to JSON.
    turns.push({ role: 'assistant', content: '{\n  "text":' })

    // ── Call Anthropic ─────────────────────────────────────────────────
    const aiText = await callAnthropic(anthropicKey, turns, /*retried=*/ false)
    let parsed: { text: string; cards: unknown[] }
    try {
      parsed = JSON.parse(extractJson(aiText))
    } catch {
      // single retry with explicit error feedback
      const retryTurns = [...turns]
      retryTurns[retryTurns.length - 1] = {
        role: 'user',
        content: `${body.message}\n\nERROR: previous response wasn't valid JSON. Output ONLY the JSON object, starting with { and ending with }.`,
      }
      retryTurns.push({ role: 'assistant', content: '{\n  "text":' })
      const retryText = await callAnthropic(anthropicKey, retryTurns, /*retried=*/ true)
      try {
        parsed = JSON.parse(extractJson(retryText))
      } catch (e) {
        return jsonError(502, `model returned non-JSON twice: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const text  = typeof parsed.text === 'string' ? parsed.text : ''
    const cards = Array.isArray(parsed.cards) ? parsed.cards : []

    // ── Persist messages to chat_sessions ──────────────────────────────
    const now = new Date().toISOString()
    const newUserMsg: StoredMessage = { role: 'user', content: body.message, timestamp: now }
    const newAssistantMsg: StoredMessage = {
      role: 'assistant',
      content: text,
      timestamp: now,
      cards,
    }
    const updatedMessages = [...priorMessages, newUserMsg, newAssistantMsg]

    if (sessionId) {
      const { error: updErr } = await supabase
        .from('chat_sessions')
        .update({ messages: updatedMessages, updated_at: now })
        .eq('id', sessionId)
        .eq('user_id', userId)
      if (updErr) console.warn('session update failed:', updErr.message)
    } else {
      const title = body.message.trim().slice(0, 50)
      const { data: created, error: insErr } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: userId,
          title,
          entity_type: 'meal_week',
          entity_id: body.weekStart,
          mode: 'chat',
          messages: updatedMessages,
        })
        .select('id')
        .single()
      if (insErr) {
        console.warn('session insert failed:', insErr.message)
      } else if (created) {
        sessionId = created.id
      }
    }

    return new Response(JSON.stringify({ text, cards, sessionId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(500, `unexpected: ${e instanceof Error ? e.message : String(e)}`)
  }
})

async function callAnthropic(
  apiKey: string,
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
  _retried: boolean,
): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: turns,
    }),
  })
  if (!resp.ok) {
    const bodyText = await resp.text()
    const requestId = resp.headers.get('request-id') ?? resp.headers.get('x-request-id') ?? null
    console.error('anthropic upstream error', { status: resp.status, requestId, body: bodyText })
    throw new Error(`anthropic upstream ${resp.status}${requestId ? ` (request-id: ${requestId})` : ''}`)
  }
  const data = await resp.json()
  const text = data.content?.[0]?.text ?? ''
  // Re-prefix the prefilled assistant content so the JSON is complete.
  return `{\n  "text":${text}`
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
