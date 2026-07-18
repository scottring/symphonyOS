// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ════════════════════════════════════════════════════════════════
// MEAL-PLANNER CHAT — a Claude tool-calling loop that writes DIRECTLY to
// the week's meal plan as the user chats. Replaces the three edge
// functions torn down in Phase 1 (ask-symphony-meal, meal-plan-generate,
// meal-plan-undo) with one function, no act-then-undo indirection.
//
// Auth: mirrors symphony-agent/index.ts. The SERVICE-role client is used
// ONLY to verify the caller's JWT. Every read/write below goes through an
// ANON client carrying the caller's own Authorization header — RLS is the
// fence (household-shared on meal_plans/meal_plan_entries/recipes,
// owner-only on lists/list_items/notes).
//
// day_of_week semantics — VERIFIED against the live code, not assumed:
//   src/lib/weekHelpers.ts: "Convention: 0=Sun, 1=Mon, ..., 6=Sat — matches
//   Date.getDay() directly, no offset arithmetic." sundayOfWeek() confirms
//   week_start is always that week's SUNDAY. scripts/seed-weekly-dinners.mjs
//   seeds real prod rows using `d.getDay()` (0=Sun..6=Sat) and
//   `week_start = sundayOfWeek(date)` — matching weekHelpers exactly. The
//   original task-11 brief assumed "0=Monday..6=Sunday"; that was WRONG
//   (the brief predates this schema check) — do not use it. The stale
//   comment on DbMealPlanEntry.day_of_week in src/types/meal-planner.ts
//   ("0=Mon, 6=Sun") is *also* wrong and should be fixed separately.
//
// SSE event shape consumed by the (future) chat rail:
//   {type:'text', text} | {type:'tool', name} | {type:'done', reply} | {type:'error', message}
// ════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-sonnet-4-6'
const MAX_TURNS = 12

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SLOTS = ['breakfast', 'lunch', 'dinner'] as const
type MealSlot = typeof SLOTS[number]

// ── Tool schemas (Anthropic tool-use format) ───────────────────────
const TOOLS: any[] = [
  {
    name: 'set_slot',
    description: 'Fill one meal slot for the week being planned. Replaces whatever is in that slot. Use recipe_id when the meal matches a saved recipe, otherwise title free text. For a leftovers lunch, set leftover_from_entry_id to the id of the source dinner entry (returned by previous set_slot calls or listed in the current plan below).',
    input_schema: {
      type: 'object',
      properties: {
        day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday — matches JS Date.getDay(). weekStart is always that week\'s Sunday.' },
        slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
        recipe_id: { type: 'string' },
        title: { type: 'string' },
        leftover_from_entry_id: { type: 'string' },
      },
      required: ['day_of_week', 'slot'],
    },
  },
  {
    name: 'clear_slot',
    description: 'Empty one meal slot for the week.',
    input_schema: {
      type: 'object',
      properties: {
        day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0=Sunday .. 6=Saturday' },
        slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
      },
      required: ['day_of_week', 'slot'],
    },
  },
  {
    name: 'save_recipe',
    description: 'Save a new recipe to the household recipe library.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        ingredients: { type: 'array', items: { type: 'string' } },
        instructions: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'ingredients', 'instructions'],
    },
  },
  {
    name: 'add_grocery_items',
    description: 'Add items to the household Groceries list. Call ONLY after the user has confirmed the final list (including which staples to skip).',
    input_schema: {
      type: 'object',
      properties: { items: { type: 'array', items: { type: 'string' } } },
      required: ['items'],
    },
  },
  {
    name: 'update_preferences',
    description: 'Rewrite the Household Meal Preferences note. Pass the FULL new content (read the current content from the system prompt, apply the change, send the whole note back).',
    input_schema: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
  },
]

// ── Context loading (RLS-scoped via the anon+Authorization client) ─
interface PlanContext {
  planId: string | null
  entries: Array<{ id: string; day_of_week: number; slot: string; recipe_id: string | null; ad_hoc_title: string | null; leftover_from: string | null }>
  recipes: Array<{ id: string; title: string; tags: string[] | null; prep_minutes: number | null }>
  preferences: string | null
}

async function loadContext(db: SupabaseClient, weekStart: string): Promise<PlanContext> {
  // "Oldest wins" — same determinism rule as useMealPlan.refresh if more
  // than one household member somehow created a plan for the same week.
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
      .select('id, day_of_week, slot, recipe_id, ad_hoc_title, leftover_from')
      .eq('meal_plan_id', planId)
      .order('day_of_week', { ascending: true })
    if (error) throw error
    entries = data ?? []
  }

  // Dozens of rows, not thousands — no pagination needed, cap defensively.
  const { data: recipes, error: recipeErr } = await db
    .from('recipes').select('id, title, tags, prep_minutes').order('title').limit(1000)
  if (recipeErr) throw recipeErr

  const { data: prefRows, error: prefErr } = await db
    .from('notes').select('content')
    .eq('title', 'Household Meal Preferences')
    .order('created_at', { ascending: false })
    .limit(1)
  if (prefErr) throw prefErr

  return { planId, entries, recipes: recipes ?? [], preferences: prefRows?.[0]?.content ?? null }
}

function buildSystemPrompt(weekStart: string, ctx: PlanContext): string {
  const recipeTitleById = new Map(ctx.recipes.map((r) => [r.id, r.title]))

  const entryLines = ctx.entries.length > 0
    ? ctx.entries.map((e) => {
      const what = e.recipe_id
        ? (recipeTitleById.get(e.recipe_id) ?? `(recipe ${e.recipe_id})`)
        : (e.ad_hoc_title ?? '(untitled)')
      const leftoverNote = e.leftover_from ? ` [leftover from entry ${e.leftover_from}]` : ''
      const dayName = DAY_NAMES[e.day_of_week] ?? `day ${e.day_of_week}`
      return `- ${dayName} ${e.slot}: ${what} (entry id ${e.id})${leftoverNote}`
    }).join('\n')
    : '(nothing planned yet this week)'

  const recipeLines = ctx.recipes.length > 0
    ? ctx.recipes.map((r) => {
      const tags = r.tags && r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : ''
      const time = r.prep_minutes ? ` ~${r.prep_minutes}min` : ''
      return `- ${r.title} (id ${r.id})${tags}${time}`
    }).join('\n')
    : '(no saved recipes yet)'

  const preferencesBlock = ctx.preferences && ctx.preferences.trim()
    ? ctx.preferences
    : '(no preferences recorded yet)'

  return `You are the meal-planning assistant for the household's week of ${weekStart} (that Sunday through the following Saturday).

Rules:
- No em dashes. No AI cliches. No sycophancy. Be direct and action-oriented.
- Just do it; don't narrate what you're about to do. After acting, confirm briefly what changed.
- Only state facts you can see in the plan/recipe/preferences context below or in a tool result. Never invent a recipe, ingredient, or preference the data doesn't show.

Day/slot model:
- Each day has three slots: breakfast, lunch, dinner.
- day_of_week is 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday — this matches JS Date.getDay(). weekStart (${weekStart}) is always that week's Sunday.
- Use set_slot to fill or replace a slot (it replaces whatever was there), clear_slot to empty one.

Leftover default policy: when planning a full week, default lunches to leftovers from the previous night's dinner unless told otherwise. Link them by passing leftover_from_entry_id (the entry id of the source dinner — from a set_slot result or the current-plan list below).

Breakfast policy: breakfasts are usually repetitive. Offer "the usual" as a filling default across weekdays rather than inventing a new breakfast every day, unless the user asks for variety.

Grocery policy: when asked for a shopping list, consolidate ingredients from the week's recipe-backed meals, present the list grouped, flag staples the household likely already has (oil, salt, rice, soy sauce, flour, butter, etc.), and ask which to skip BEFORE calling add_grocery_items. Only call add_grocery_items after the user confirms the final list.

Current plan for week of ${weekStart}:
${entryLines}

Recipe library (id, title, tags, prep time):
${recipeLines}

Household Meal Preferences note:
${preferencesBlock}`
}

// ── Tool executor (RLS-scoped via db) ──────────────────────────────
// planCache holds the resolved/created meal_plans.id for this request so
// repeated set_slot/clear_slot calls in the same turn loop don't each
// re-query or re-create the plan row.
async function resolvePlanId(
  db: SupabaseClient,
  userId: string,
  weekStart: string,
  planCache: { id: string | null },
): Promise<string> {
  if (planCache.id) return planCache.id
  const { data: rows, error } = await db
    .from('meal_plans').select('id')
    .eq('week_start', weekStart)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  const existingId: string | undefined = rows?.[0]?.id
  if (existingId) {
    planCache.id = existingId
    return existingId
  }
  const { data: created, error: createErr } = await db
    .from('meal_plans')
    .insert({ user_id: userId, week_start: weekStart })
    .select('id').single()
  if (createErr) throw createErr
  const newId: string = created.id
  planCache.id = newId
  return newId
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** Strict day_of_week guard: only an actual integer number 0-6 passes.
 *  `Number(...)` coercion would silently accept `null` (-> 0), `true`
 *  (-> 1), `""` (-> 0), etc — reject those instead of miscoercing them. */
function strictDayOfWeek(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 6) return null
  return v
}

async function runTool(
  db: SupabaseClient,
  userId: string,
  weekStart: string,
  name: string,
  input: Record<string, unknown>,
  planCache: { id: string | null },
): Promise<string> {
  try {
    switch (name) {
      case 'set_slot': {
        const dayOfWeek = strictDayOfWeek(input.day_of_week)
        const slot = String(input.slot ?? '') as MealSlot
        if (dayOfWeek === null) {
          return 'Error: day_of_week must be an integer 0-6 (0=Sunday..6=Saturday).'
        }
        if (!SLOTS.includes(slot)) return 'Error: slot must be one of breakfast, lunch, dinner.'
        const recipeId = asNonEmptyString(input.recipe_id)
        const title = asNonEmptyString(input.title)
        const leftoverFrom = asNonEmptyString(input.leftover_from_entry_id)
        if (!recipeId && !title) return 'Error: provide either recipe_id or title.'

        const planId = await resolvePlanId(db, userId, weekStart, planCache)

        // leftover_from must point at a REAL entry in THIS SAME plan —
        // otherwise a stale/cross-week id from earlier history would link
        // silently to the wrong week (or nothing, if RLS just hides it).
        if (leftoverFrom) {
          const { data: sourceEntry, error: sourceErr } = await db
            .from('meal_plan_entries').select('id, meal_plan_id')
            .eq('id', leftoverFrom).maybeSingle()
          if (sourceErr) throw sourceErr
          if (!sourceEntry || sourceEntry.meal_plan_id !== planId) {
            return `Error: leftover_from_entry_id ${leftoverFrom} does not refer to an entry in this week's plan. Look up a real entry id from the current plan or a prior set_slot result before linking a leftover.`
          }
        }

        // Insert FIRST, then remove whatever else was in the cell. This way
        // a failed insert (bad recipe_id / leftover_from FK) leaves the
        // slot's existing entry untouched instead of vacating it. There is
        // no unique constraint on (meal_plan_id, day_of_week, slot), so a
        // transient "two rows in the cell" state between insert and delete
        // is safe — nothing else reads mid-request.
        const { data, error: insErr } = await db.from('meal_plan_entries').insert({
          meal_plan_id: planId,
          day_of_week: dayOfWeek,
          slot,
          recipe_id: recipeId,
          ad_hoc_title: title,
          leftover_from: leftoverFrom,
        }).select().single()
        if (insErr) return `Error: could not set ${DAY_NAMES[dayOfWeek]} ${slot}: ${insErr.message}. The existing entry in that slot (if any) was left untouched.`

        const { error: delErr } = await db.from('meal_plan_entries').delete()
          .eq('meal_plan_id', planId).eq('day_of_week', dayOfWeek).eq('slot', slot)
          .neq('id', data.id)
        if (delErr) throw delErr

        return `Set ${DAY_NAMES[dayOfWeek]} ${slot} -> ${title ?? recipeId}. Entry: ${JSON.stringify(data)}`
      }
      case 'clear_slot': {
        const dayOfWeek = strictDayOfWeek(input.day_of_week)
        const slot = String(input.slot ?? '') as MealSlot
        if (dayOfWeek === null) {
          return 'Error: day_of_week must be an integer 0-6 (0=Sunday..6=Saturday).'
        }
        if (!SLOTS.includes(slot)) return 'Error: slot must be one of breakfast, lunch, dinner.'

        const planId = await resolvePlanId(db, userId, weekStart, planCache)
        const { error, count } = await db.from('meal_plan_entries')
          .delete({ count: 'exact' })
          .eq('meal_plan_id', planId).eq('day_of_week', dayOfWeek).eq('slot', slot)
        if (error) throw error
        return `Cleared ${DAY_NAMES[dayOfWeek]} ${slot} (${count ?? 0} entr${count === 1 ? 'y' : 'ies'} removed).`
      }
      case 'save_recipe': {
        const title = asNonEmptyString(input.title)
        if (!title) return 'Error: title is required.'
        const ingredients = Array.isArray(input.ingredients) ? input.ingredients.map(String) : []
        const instructions = Array.isArray(input.instructions) ? input.instructions.map(String) : []
        const tags = Array.isArray(input.tags) ? input.tags.map(String) : []
        if (ingredients.length === 0 || instructions.length === 0) {
          return 'Error: ingredients and instructions must be non-empty arrays.'
        }
        const { data, error } = await db.from('recipes').insert({
          user_id: userId,
          title,
          ingredients,
          instructions,
          tags,
          kid_acceptance: {},
          is_prep_friendly: false,
          times_cooked: 0,
          source_label: 'chat',
        }).select().single()
        if (error) throw error
        return `Saved recipe "${title}" (id ${data.id}).`
      }
      case 'add_grocery_items': {
        const items = Array.isArray(input.items)
          ? input.items.map((v: unknown) => String(v).trim()).filter((s: string) => s.length > 0)
          : []
        if (items.length === 0) return 'Error: items must be a non-empty array.'

        const { data: list, error: listErr } = await db.from('lists').select('id')
          .eq('external_source', 'apple_reminders').eq('external_id', 'Groceries')
          .maybeSingle()
        if (listErr) throw listErr
        if (!list) {
          // Graceful, non-throwing failure: the model can relay this to the
          // user instead of the tool loop crashing.
          return 'Error: no Groceries list found (external_source=apple_reminders, external_id=Groceries). Tell the user their Groceries list is missing before retrying.'
        }

        const rows = items.map((text: string, idx: number) => ({
          list_id: list.id, user_id: userId, text, sort_order: idx, completed: false,
        }))
        const { data, error } = await db.from('list_items').insert(rows).select()
        if (error) throw error
        return `Added ${data?.length ?? items.length} items to Groceries: ${items.join(', ')}.`
      }
      case 'update_preferences': {
        const content = typeof input.content === 'string' ? input.content : ''
        if (!content.trim()) return 'Error: content is required.'
        const { data: existing, error: findErr } = await db.from('notes')
          .select('id')
          .eq('title', 'Household Meal Preferences')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (findErr) throw findErr
        if (existing) {
          const { error } = await db.from('notes')
            .update({ content, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
          if (error) throw error
          return 'Updated the Household Meal Preferences note.'
        }
        const { error } = await db.from('notes').insert({
          title: 'Household Meal Preferences',
          content,
          type: 'general',
          user_id: userId,
        })
        if (error) throw error
        return 'Created the Household Meal Preferences note.'
      }
      default:
        return `Error: unknown tool ${name}`
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ── Anthropic helpers ──────────────────────────────────────────────
interface AnthropicBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>,
): Promise<{ content: AnthropicBlock[]; stop_reason: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS.map((t, i) =>
        i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t,
      ),
      messages,
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json()
  return { content: json.content ?? [], stop_reason: json.stop_reason ?? 'end_turn' }
}

// ── HTTP handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !anon || !serviceKey) return json({ error: 'Server not configured' }, 500)

  // Verify the user, then build an RLS-scoped client that acts AS them.
  const token = authHeader.replace('Bearer ', '')
  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
  const db = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })

  const body = await req.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const weekStart = typeof body.weekStart === 'string' ? body.weekStart : ''
  const history = Array.isArray(body.history) ? body.history : []

  if (!message) return json({ error: 'message is required' }, 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: 'weekStart must be YYYY-MM-DD' }, 400)

  let ctx: PlanContext
  try {
    ctx = await loadContext(db, weekStart)
  } catch (err) {
    return json({ error: `Failed to load meal plan context: ${err instanceof Error ? err.message : String(err)}` }, 500)
  }

  const systemPrompt = buildSystemPrompt(weekStart, ctx)

  // `history` (client-persisted, no server-side session) is prepended so
  // the conversation survives a page reload; only well-formed entries pass.
  const convo: Array<{ role: string; content: unknown }> = [
    ...history
      .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .map((h: any) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]

  const planCache = { id: ctx.planId }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (ev: Record<string, unknown>) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`))
      let finalText = ''
      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const { content, stop_reason } = await callAnthropic(apiKey, systemPrompt, convo)
          const toolResults: Array<Record<string, unknown>> = []
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              finalText = block.text
              send({ type: 'text', text: block.text })
            } else if (block.type === 'tool_use' && block.name) {
              send({ type: 'tool', name: block.name })
              const result = await runTool(db, user.id, weekStart, block.name, block.input ?? {}, planCache)
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
            }
          }
          convo.push({ role: 'assistant', content })
          // Termination: stop as soon as a turn produces no tool calls (the
          // normal end-of-turn case), OR after MAX_TURNS as a hard backstop
          // against a runaway tool-use loop — same two-part guarantee as
          // symphony-agent/index.ts.
          if (stop_reason === 'tool_use' && toolResults.length > 0) {
            convo.push({ role: 'user', content: toolResults })
            continue
          }
          break
        }
        send({ type: 'done', reply: finalText })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Meal planner agent failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
  })
})
