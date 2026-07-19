// deno-lint-ignore-file no-explicit-any
// MEAL-SLOT-SUGGEST — one-shot AI ideas for a SINGLE meal slot on the week grid.
// Given a week + day + slot (+ optional free-text intent), returns up to 3
// replacement candidates, each either an existing shelf recipe or a new recipe
// to invent, with a one-line "why it fits". NO DB writes — the client applies a
// pick via its own RLS-scoped write only when the user taps (same propose-only
// pattern as sharpen-goal).
//
// Auth mirrors sharpen-goal/meal-planner-chat: the SERVICE-role client only
// verifies the caller's JWT; the context read goes through an ANON client
// carrying the caller's Authorization header, so RLS (household-shared on
// meal_plans/meal_plan_entries/recipes, owner-only on notes) is the fence.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SLOTS = ['breakfast', 'lunch', 'dinner']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

interface PlanContext {
  entries: Array<{ day_of_week: number; slot: string; recipe_id: string | null; ad_hoc_title: string | null; leftover_from: string | null }>
  recipes: Array<{ id: string; title: string; tags: string[] | null; prep_minutes: number | null }>
  preferences: string | null
}

async function loadContext(db: SupabaseClient, weekStart: string): Promise<PlanContext> {
  const { data: planRows, error: planErr } = await db
    .from('meal_plans').select('id')
    .eq('week_start', weekStart)
    .order('created_at', { ascending: true })
    .limit(1)
  if (planErr) throw planErr
  const planId: string | null = planRows?.[0]?.id ?? null

  let entries: PlanContext['entries'] = []
  if (planId) {
    const { data, error } = await db
      .from('meal_plan_entries')
      .select('day_of_week, slot, recipe_id, ad_hoc_title, leftover_from')
      .eq('meal_plan_id', planId)
      .order('day_of_week', { ascending: true })
    if (error) throw error
    entries = data ?? []
  }

  const { data: recipes, error: recipeErr } = await db
    .from('recipes').select('id, title, tags, prep_minutes').order('title').limit(1000)
  if (recipeErr) throw recipeErr

  const { data: prefRows, error: prefErr } = await db
    .from('notes').select('content')
    .eq('title', 'Household Meal Preferences')
    .order('created_at', { ascending: false })
    .limit(1)
  if (prefErr) throw prefErr

  return { entries, recipes: recipes ?? [], preferences: prefRows?.[0]?.content ?? null }
}

function buildPrompt(ctx: PlanContext, dayOfWeek: number, slot: string, intent: string): string {
  const recipeTitleById = new Map(ctx.recipes.map((r) => [r.id, r.title]))
  const dayName = DAY_NAMES[dayOfWeek] ?? `day ${dayOfWeek}`

  const weekLines = ctx.entries.length > 0
    ? ctx.entries.map((e) => {
      const what = e.recipe_id
        ? (recipeTitleById.get(e.recipe_id) ?? '(a recipe)')
        : (e.ad_hoc_title ?? '(untitled)')
      const leftover = e.leftover_from ? ' [leftover]' : ''
      return `- ${DAY_NAMES[e.day_of_week] ?? `day ${e.day_of_week}`} ${e.slot}: ${what}${leftover}`
    }).join('\n')
    : '(nothing else planned yet this week)'

  const shelfLines = ctx.recipes.length > 0
    ? ctx.recipes.map((r) => {
      const tags = r.tags && r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : ''
      const time = r.prep_minutes ? ` ~${r.prep_minutes}min` : ''
      return `- ${r.title} (id: ${r.id})${tags}${time}`
    }).join('\n')
    : '(the shelf is empty)'

  const prefsBlock = ctx.preferences && ctx.preferences.trim()
    ? `\nHousehold meal preferences:\n${ctx.preferences.trim()}\n`
    : ''

  const intentLine = intent.trim()
    ? `\nThe user described what they want: "${intent.trim()}"\n`
    : '\nThe user didn't say anything specific — just suggest good fits for this slot.\n'

  return `You are the meal-planning consultant for Symphony, a household planner. The user is changing ONE meal: ${dayName} ${slot}. Suggest UP TO 3 replacement ideas.
${intentLine}
This week's other meals (avoid repeating these; enable a leftover if it fits):
${weekLines}

Recipes already on the household shelf:
${shelfLines}
${prefsBlock}
Rules:
- Prefer a recipe already on the shelf when one genuinely fits — use its exact id.
- Otherwise invent a NEW recipe. New recipes: at most 10 ingredients, at most 6 instruction steps, put quantities inline in each ingredient (this feeds a shopping list and a wall display).
- Fit the slot (${slot}) and the season (it is mid-July, high summer — fresh produce).
- Honor the preferences above.
- Each suggestion needs a concrete one-line "why" that references THIS week — variety vs. what's planned, a leftover it uses, a preference it honors, or the season. No generic filler.

Respond with ONLY a JSON object (no markdown fences, no prose):
{
  "suggestions": [
    { "source": "shelf", "recipeId": "<id from the shelf list>", "title": "<its title>", "why": "<one concrete clause>" },
    { "source": "new", "title": "<name>", "why": "<one concrete clause>", "ingredients": ["1 lb ...", "..."], "instructions": ["...", "..."], "prepMinutes": 25, "tags": ["..."] }
  ]
}
Return between 1 and 3 suggestions. Omit the "suggestions" array entirely only if truly nothing fits.`
}

interface Suggestion {
  source: 'shelf' | 'new'
  recipeId?: string
  title: string
  why: string
  ingredients?: string[]
  instructions?: string[]
  prepMinutes?: number
  tags?: string[]
}

function parseSuggestions(text: string, ctx: PlanContext): Suggestion[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as { suggestions?: unknown }
  const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  const shelfIds = new Set(ctx.recipes.map((r) => r.id))
  const out: Suggestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const title = typeof s.title === 'string' ? s.title.trim() : ''
    const why = typeof s.why === 'string' ? s.why.trim() : ''
    if (!title) continue
    if (s.source === 'shelf') {
      const recipeId = typeof s.recipeId === 'string' ? s.recipeId : ''
      // Drop hallucinated ids — a shelf pick must reference a real recipe.
      if (!shelfIds.has(recipeId)) continue
      out.push({ source: 'shelf', recipeId, title: title.slice(0, 200), why: why.slice(0, 200) })
    } else if (s.source === 'new') {
      const ingredients = Array.isArray(s.ingredients) ? s.ingredients.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
      const instructions = Array.isArray(s.instructions) ? s.instructions.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
      if (ingredients.length === 0 || instructions.length === 0) continue
      const tags = Array.isArray(s.tags) ? s.tags.filter((x): x is string => typeof x === 'string') : []
      out.push({
        source: 'new',
        title: title.slice(0, 200),
        why: why.slice(0, 200),
        ingredients: ingredients.slice(0, 10),
        instructions: instructions.slice(0, 6),
        prepMinutes: typeof s.prepMinutes === 'number' && s.prepMinutes > 0 ? Math.round(s.prepMinutes) : undefined,
        tags: tags.slice(0, 6),
      })
    }
    if (out.length >= 3) break
  }
  return out
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!apiKey || !url || !serviceKey || !anonKey) return json({ error: 'Missing server config' }, 500)

  const token = authHeader.slice('Bearer '.length)
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  let body: { weekStart?: string; dayOfWeek?: number; slot?: string; intent?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const weekStart = typeof body.weekStart === 'string' ? body.weekStart : ''
  const dayOfWeek = body.dayOfWeek
  const slot = typeof body.slot === 'string' ? body.slot : ''
  const intent = typeof body.intent === 'string' ? body.intent.slice(0, 300) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: 'weekStart (YYYY-MM-DD) required' }, 400)
  if (typeof dayOfWeek !== 'number' || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return json({ error: 'dayOfWeek (0-6) required' }, 400)
  }
  if (!SLOTS.includes(slot)) return json({ error: 'slot must be breakfast|lunch|dinner' }, 400)

  // RLS-scoped client that reads AS the caller.
  const db = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })

  try {
    const ctx = await loadContext(db, weekStart)
    const text = await callClaude(buildPrompt(ctx, dayOfWeek, slot, intent), apiKey)
    return json({ suggestions: parseSuggestions(text, ctx) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Suggest failed' }, 502)
  }
})
