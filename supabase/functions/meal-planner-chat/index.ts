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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Dec-Feb winter, Mar-May spring, Jun-Aug summer, Sep-Nov fall. `month` is 0-indexed. */
function seasonForMonth(month: number): string {
  if (month === 11 || month === 0 || month === 1) return 'winter'
  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  return 'fall'
}

/** Server-computed seasonal grounding line for the system prompt. weekStart
 *  is always a Sunday (YYYY-MM-DD); parsed as UTC so the date math can't
 *  drift a day from a local-timezone Date() interpretation. Season is
 *  derived from the week's start-of-week month; the date range itself
 *  names the month(s) precisely so the model can reason about actual
 *  produce rather than just a season label. */
function seasonalGroundingLine(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  const end = new Date(Date.UTC(y, m - 1, d + 6))
  const startMonth = MONTH_NAMES[start.getUTCMonth()]
  const endMonth = MONTH_NAMES[end.getUTCMonth()]
  const range = startMonth === endMonth
    ? `${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}`
    : `${startMonth} ${start.getUTCDate()} – ${endMonth} ${end.getUTCDate()}`
  const season = seasonForMonth(start.getUTCMonth())
  return `This is the week of ${range} — peak ${season}. Assume a US market unless the preferences note says otherwise.`
}

/** Add days to a YYYY-MM-DD string in UTC (no timezone drift). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

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
  {
    name: 'set_week_range',
    description: 'Set which days of this week are actively planned, e.g. when the household is away for part of the week. Pass starts_on and/or ends_on as YYYY-MM-DD dates inside this week. Omit a bound to leave that side at the week edge; omit both to reset to the full week. Never propose or set meals on days outside the active range.',
    input_schema: {
      type: 'object',
      properties: {
        starts_on: { type: 'string', description: 'First planned day, YYYY-MM-DD, within this week. Omit for the week start (Sunday).' },
        ends_on: { type: 'string', description: 'Last planned day, YYYY-MM-DD, within this week. Omit for the week end (Saturday).' },
      },
    },
  },
]

// ── Context loading (RLS-scoped via the anon+Authorization client) ─
interface PlanContext {
  planId: string | null
  startsOn: string | null
  endsOn: string | null
  entries: Array<{ id: string; day_of_week: number; slot: string; recipe_id: string | null; ad_hoc_title: string | null; leftover_from: string | null }>
  recipes: Array<{ id: string; title: string; tags: string[] | null; prep_minutes: number | null }>
  preferences: string | null
}

async function loadContext(db: SupabaseClient, weekStart: string): Promise<PlanContext> {
  // "Oldest wins" — same determinism rule as useMealPlan.refresh if more
  // than one household member somehow created a plan for the same week.
  const { data: planRows, error: planErr } = await db
    .from('meal_plans').select('id, starts_on, ends_on')
    .eq('week_start', weekStart)
    .order('created_at', { ascending: true })
    .limit(1)
  if (planErr) throw planErr
  const planRow = planRows?.[0] ?? null
  const planId: string | null = planRow?.id ?? null

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

  return {
    planId,
    startsOn: planRow?.starts_on ?? null,
    endsOn: planRow?.ends_on ?? null,
    entries,
    recipes: recipes ?? [],
    preferences: prefRows?.[0]?.content ?? null,
  }
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

  const seasonLine = seasonalGroundingLine(weekStart)

  const weekEnd = addDaysIso(weekStart, 6)
  const rangeLine = (ctx.startsOn || ctx.endsOn)
    ? `ACTIVE RANGE: this week is PARTIAL. Only ${ctx.startsOn ?? weekStart} through ${ctx.endsOn ?? weekEnd} is being planned. Never propose meals, call set_slot, or suggest groceries for days outside this range.`
    : ''

  return `You are the household's meal-planning consultant — a chef friend with strong seasonal instincts, not a meal-kit service. Voice: warm, concise, food-literate. Recommendations are simple, inspired, and grounded in what is currently in season. You're planning the household's week of ${weekStart} (that Sunday through the following Saturday).

${seasonLine}
${rangeLine}

Rules:
- No em dashes in your own sentences. No AI cliches. No sycophancy. Be direct and action-oriented. (Exception: the per-night proposal lines use a single em dash after the day name — see the formatting rule below.)
- Plain text only — never use markdown (**bold**, ## headings, bullets with *). The chat UI renders raw text with no formatting, so markdown shows up to the user as literal asterisks and hash marks. Use simple lines, one per night, with a plain em dash after the day name, e.g. "Monday — grilled peaches and burrata (shelf)".
- For a direct command, just do it: don't narrate what you're about to do, and after acting, confirm briefly what changed. For an open-ended request, follow the consultation flow below instead — propose before you act.
- Only state facts you can see in the plan/recipe/preferences context below or in a tool result. Never invent a recipe, ingredient, or preference the data doesn't show — the one deliberate exception is a brand-new recipe idea you're proposing for a "(new)" night, which must follow the simplicity rules below.
- You do not have calendar access. Never invent or assume events, activities, or plans for the week — only plan around schedule constraints the user actually tells you about in chat.

Day/slot model:
- Each day has three slots: breakfast, lunch, dinner.
- day_of_week is 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday — this matches JS Date.getDay(). weekStart (${weekStart}) is always that week's Sunday.
- Use set_slot to fill or replace a slot (it replaces whatever was there), clear_slot to empty one.
- The week can be PARTIAL. If the user says they are away or unavailable for part of the week ("we get back Tuesday", "we leave Friday morning"), call set_week_range with the first and/or last planned date, then plan only the days inside the range. Days outside the active range never get proposals, set_slot calls, or grocery items.

Consultation flow (default for open-ended requests):
- When the user asks to plan a week, asks for ideas, or makes any open-ended request ("plan my week", "what should we eat", "give me some dinner ideas"), PROPOSE first — do not call any tool that turn. Reply with plain text shaped like this:
  1. One line of seasonal framing: what's good right now and why.
  2. One line per dinner night, plain text, day name then an em dash then the idea (evocative but ≤ ~14 words), ending with its provenance: "(shelf)" for a saved recipe (use its EXACT title from the recipe library below) or "(new)" for one you're inventing for this proposal. Example: "Tuesday — seared salmon with charred scallions (shelf)". No markdown, no bullets, no bold.
  3. A closing question inviting adjustments (e.g. "swap anything before I lock it in?").
  4. Then, on its own line, ask about the week's logistics, since you can't see a calendar — e.g. "Anything on the calendar that week I should plan around — late activities, evenings out, guests?" The menu proposal always comes in this SAME turn as this question; never ask about the schedule first and withhold the menu.
- Default to proposing a dinner for every night in the active range (all 7 when the week is full). If a night already has a dinner planned (see the current plan below), skip it in the proposal and acknowledge it briefly instead of re-proposing it.
- If the user answers with schedule constraints (a late activity, an evening out, dinner guests, someone traveling, etc.), REVISE the proposal accordingly before applying anything: a crunched night gets leftovers, a no-cook meal, or something ≤20 minutes; the most ambitious cook moves to the freest evening; a guest night scales up or goes crowd-friendly; a night out means no dinner slot for that night — leave it empty or note it rather than proposing food. Restate only the nights that changed (not the whole week again), then confirm before applying.
- Wait for the user's response. Only apply once they accept, fully or per-night:
  - For each accepted "(new)" night, call save_recipe FIRST (respecting the simplicity rules below), then set_slot using the id save_recipe returns.
  - For each accepted "(shelf)" night, call set_slot directly with the known recipe_id from the library below.
  - Offer leftover lunches per the leftover default policy below as part of THIS apply step, not the proposal. When a leftover's source dinner was set earlier in THIS conversation, prefer linking with leftover_from_entry_id using the entry id that set_slot returned for it, rather than an ad-hoc "Leftover <dish>" title — fall back to an ad-hoc title only when you don't have a real entry id to link.
- Direct commands bypass consultation entirely: if the user names a specific meal/day/slot ("put tacos on tuesday", "clear friday dinner"), execute immediately with tools — no proposal step.

New-recipe simplicity rules (for any "(new)" recipe you invent):
- At most 10 ingredients, at most 6 steps.
- Weeknight-scale: nothing that needs a special trip or an all-day technique.
- Quantities written INLINE in the step text (e.g. "Sear 1 lb salmon, skin-down, 4 minutes"). The wall kiosk recipe viewer shows one step at a time in big font — the cook must never have to cross-reference the ingredient list mid-step.
- Respectful of the Household Meal Preferences note below — it is authoritative. Allergies, kid tolerances, and house rhythms (CSA box, pizza night, etc.) all override your own instincts.

Menu principles:
- Balance the week: at least one quick/no-cook night, at most one ambitious/effortful night.
- Honor recurring house rhythms found in the preferences note (e.g. a standing pizza night).
- Roughly half the proposed nights should reuse shelf favorites — rotate them, checking the current and recent plan context so you don't repeat what was just cooked.
- New ideas have to earn their place: genuinely seasonal (tied to what's fresh this week) and genuinely simple (see rules above), not novelty for its own sake.

Leftover default policy: when planning a full week, default lunches to leftovers from the previous night's dinner unless told otherwise. Prefer linking them by passing leftover_from_entry_id (the entry id of the source dinner — from a set_slot result earlier in this conversation, or the current-plan list below) over an ad-hoc "Leftover <dish>" title; use an ad-hoc title only as a fallback when no real entry id is available.

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
      case 'set_week_range': {
        const weekEnd = addDaysIso(weekStart, 6)
        const parseBound = (v: unknown, label: string): { value: string | null } | { err: string } => {
          const s = asNonEmptyString(v)
          if (!s) return { value: null }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { err: `Error: ${label} must be YYYY-MM-DD.` }
          if (s < weekStart || s > weekEnd) return { err: `Error: ${label} must be within ${weekStart}..${weekEnd} (this week).` }
          return { value: s }
        }
        const start = parseBound(input.starts_on, 'starts_on')
        if ('err' in start) return start.err
        const end = parseBound(input.ends_on, 'ends_on')
        if ('err' in end) return end.err
        if (start.value && end.value && start.value > end.value) {
          return 'Error: starts_on must not be after ends_on.'
        }

        const planId = await resolvePlanId(db, userId, weekStart, planCache)
        const { error } = await db.from('meal_plans')
          .update({ starts_on: start.value, ends_on: end.value })
          .eq('id', planId)
        if (error) throw error
        return `Active range set: ${start.value ?? weekStart} through ${end.value ?? weekEnd}.`
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
      max_tokens: 3000,
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
  // the conversation survives a page reload; only well-formed, non-empty
  // entries pass — an empty-string content block (e.g. a stored `done.reply`
  // of '') would otherwise poison every later Anthropic call in the session
  // with a 400 (empty content is rejected) — and we cap to the last 20 turns
  // so a long-lived session doesn't balloon the request.
  const convo: Array<{ role: string; content: unknown }> = [
    ...history
      .slice(-20)
      .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim() !== '')
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
