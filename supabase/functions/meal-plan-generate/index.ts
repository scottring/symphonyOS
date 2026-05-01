// supabase/functions/meal-plan-generate/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildPromptContext, validateGeneratedEntries, type GeneratedEntry } from '../_shared/mealPlanGenerate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Extract the outermost balanced { ... } object from a string. Tolerates
 *  trailing prose Haiku occasionally emits after the JSON. Returns the input
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

const SYSTEM_PROMPT = `You draft a one-week meal plan for a household based on a planner's free-form brief. Output strict JSON matching the schema.

SLOTS
The five canonical slots are breakfast, lunch, snack, dinner, prep. day_of_week is 0..6 (Mon..Sun).
- breakfast/lunch/snack/dinner are eaten meals.
- prep is a batch-cooking session — typically Sunday (day_of_week=6). Use it when the brief implies cooking once and eating across the week, or when an is_prep_friendly recipe will feed multiple meals.

LEFTOVER THREADING
When you create a prep entry, give it a placeholder id like "prep_1", "prep_2", etc. in a top-level field "placeholder_id". Then, on every other entry that gets eaten from that batch, set "leftover_from" to that placeholder. The server resolves placeholders to real ids after insert. Example: a Sunday prep of "Big pot of beans" with placeholder_id "prep_1" → Mon lunch and Wed dinner each set leftover_from="prep_1". Don't set leftover_from on entries that aren't from a batch.

RECIPES
Every recipe_id you reference must come from the supplied shelf — never invent a recipe_id. Foods named in the brief that aren't on the shelf become ad_hoc entries (no recipe_id, just an ad_hoc_title). If you're unsure whether a shelf item matches, prefer ad_hoc_title.

COOK ASSIGNMENT
prepared_by_family_member_id is who cooks the meal. Set it ONLY when the brief explicitly assigns cooks ("Iris cooks weeknights", "Scott does Sundays"). Otherwise leave it null and the household will decide.

RESTRICTIONS
The RESTRICTIONS block lists per-person and household-wide dietary rules. Treat them as hard filters: never produce an entry whose recipe or ad_hoc_title violates a restriction for the person eating it. Household-wide restrictions apply to every entry.

HABITS
Apply each standing habit to the right person each day, unless the brief explicitly overrides it.

NOTES
The notes_for_planner field should contain a short paragraph (1-3 sentences) describing what's different about this week — what the planner explicitly asked for, what's new, what's being skipped, anything noteworthy. Write it as if explaining the plan to a partner who hasn't read the brief.`

interface RequestBody {
  weekStart: string  // YYYY-MM-DD (Monday)
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
    if (!body.weekStart) return jsonError(400, 'weekStart required')

    // ── Load context (RLS filters to household-visible rows) ───────────
    const [
      { data: planRows,     error: planErr    },
      { data: briefRows,    error: briefErr   },
      { data: recipes,      error: recErr     },
      { data: habits,       error: habErr     },
      { data: members,      error: memErr     },
      { data: restrictions, error: restErr    },
    ] = await Promise.all([
      supabase.from('meal_plans').select('id,user_id').eq('week_start', body.weekStart).order('created_at', { ascending: true }).limit(1),
      supabase.from('weekly_briefs').select('id,body,status,generated_at').eq('week_start', body.weekStart).order('created_at', { ascending: true }).limit(1),
      supabase.from('recipes').select('id,title,tags,prep_minutes,acceptance_sentence,is_prep_friendly'),
      supabase.from('standing_habits').select('user_id,name,slot,grams_hint,paused_for_weeks').eq('paused', false),
      supabase.from('family_members').select('id,name,auth_user_id'),
      supabase.from('dietary_restrictions').select('family_member_id,label'),
    ])
    if (planErr || briefErr || recErr || habErr || memErr || restErr) {
      return jsonError(500, `context load failed: ${(planErr || briefErr || recErr || habErr || memErr || restErr)?.message}`)
    }

    let plan = planRows?.[0]
    const brief = briefRows?.[0]
    if (!plan) {
      // Auto-create the plan row so first-time generation Just Works.
      // (Mirrors the auto-create behavior in src/hooks/useMealPlan.ts.)
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id
      if (!userId) return jsonError(401, 'no authenticated user')
      const { data: created, error: createErr } = await supabase
        .from('meal_plans')
        .insert({ user_id: userId, week_start: body.weekStart })
        .select('id,user_id')
        .single()
      if (createErr || !created) return jsonError(500, `failed to create meal_plan: ${createErr?.message}`)
      plan = created
    }
    if (!brief || !brief.body?.trim()) return jsonError(400, 'brief is empty')

    const memberById = new Map((members ?? []).map(m => [m.id, m.name]))

    const promptContext = buildPromptContext({
      weekStart: body.weekStart,
      mealPlanId: plan.id,
      members: (members ?? []).map(m => ({ name: m.name, family_member_id: m.id, auth_user_id: m.auth_user_id })),
      shelf:   (recipes ?? []).map(r => ({
        recipe_id: r.id, title: r.title, tags: r.tags ?? [],
        prep_minutes: r.prep_minutes, kid_acceptance: r.acceptance_sentence,
        is_prep_friendly: r.is_prep_friendly,
      })),
      habits: (habits ?? []).map(h => ({
        owner_auth_user_id: h.user_id, name: h.name, slot: h.slot, grams_hint: h.grams_hint,
      })),
      restrictions: (restrictions ?? []).map(r => ({
        scope: r.family_member_id ? 'person' as const : 'household' as const,
        person_name: r.family_member_id ? (memberById.get(r.family_member_id) ?? null) : null,
        label: r.label,
      })),
      brief: brief.body,
    })

    // ── Call Anthropic ──────────────────────────────────────────────────
    const aiResp = await callAnthropic(anthropicKey, promptContext, /*retried=*/ false)
    let parsed: { entries: unknown[]; notes_for_planner?: string }
    try {
      parsed = JSON.parse(extractJson(aiResp))
    } catch {
      // single retry with explicit error feedback
      const retryResp = await callAnthropic(anthropicKey, promptContext, /*retried=*/ true)
      try {
        parsed = JSON.parse(extractJson(retryResp))
      } catch (e) {
        return jsonError(502, `model returned non-JSON twice: ${e}`)
      }
    }

    if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
      return jsonError(422, 'model returned 0 entries — try a more specific brief')
    }

    // ── Validate ──────────────────────────────────────────────────────
    type AnyParsedEntry = GeneratedEntry & { placeholder_id?: string | null }
    const allParsed = parsed.entries as AnyParsedEntry[]
    const rawPrepEntries = allParsed.filter(e => e.slot === 'prep')
    const rawNonPrepEntries = allParsed.filter(e => e.slot !== 'prep')

    const roster = new Set((members ?? []).map(m => m.id))
    const shelfSet = new Set((recipes ?? []).map(r => r.id))
    const { kept: prepKept, dropped: prepDropped } = validateGeneratedEntries(rawPrepEntries, roster, shelfSet)
    const { kept: restKept, dropped: restDropped } = validateGeneratedEntries(rawNonPrepEntries, roster, shelfSet)

    const dropped = [...prepDropped, ...restDropped]
    const validationNotes = dropped.map(d => d.reason)

    if (prepKept.length + restKept.length === 0) {
      // Surface category counts + sample so the planner can debug.
      const counts = new Map<string, number>()
      for (const d of dropped) {
        const key = d.reason.replace(/: .*$/, '')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const summary = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([r, n]) => `${r} (${n})`)
        .join('; ')
      const sample = dropped.slice(0, 2).map(d => d.reason).join(' | ')
      return jsonError(422, `all ${dropped.length} entries failed validation — ${summary}; sample: ${sample}`)
    }

    // Map kept prep entries back to their original placeholder_id by structural
    // matching (validate strips unknown fields). Walk both lists in order; the
    // validator preserves order for kept entries.
    const keptPlaceholders: string[] = []
    {
      let cursor = 0
      for (const raw of rawPrepEntries) {
        if (cursor >= prepKept.length) break
        const k = prepKept[cursor]
        if (
          raw.day_of_week === k.day_of_week &&
          raw.slot === k.slot &&
          (raw.family_member_id ?? null) === k.family_member_id
        ) {
          keptPlaceholders.push(typeof raw.placeholder_id === 'string' ? raw.placeholder_id : '')
          cursor++
        }
      }
      while (keptPlaceholders.length < prepKept.length) keptPlaceholders.push('')
    }

    // ── Snapshot prior entries for undo ─────────────────────────────
    const { data: prior } = await supabase
      .from('meal_plan_entries').select('*').eq('meal_plan_id', plan.id)

    const priorBriefStatus = brief.status as string | null
    const priorBriefGeneratedAt = (brief as { generated_at?: string | null }).generated_at ?? null

    // ── Step A: clear via RPC (acquires row lock; serializes concurrent gens)
    const { error: clearErr } = await supabase.rpc('regenerate_meal_plan', {
      p_meal_plan_id: plan.id, p_entries: [],
    })
    if (clearErr) return jsonError(500, `clear failed: ${clearErr.message}`)

    // ── Step B: insert prep entries first to capture real ids
    const prepRows = prepKept.map(e => ({
      meal_plan_id: plan.id,
      day_of_week: e.day_of_week,
      slot: e.slot,
      family_member_id: e.family_member_id,
      recipe_id: e.recipe_id,
      ad_hoc_title: e.ad_hoc_title,
      prepared_by_family_member_id: e.prepared_by_family_member_id,
    }))
    let prepInsertedIds: string[] = []
    if (prepRows.length > 0) {
      const { data: prepInserted, error: prepErr } = await supabase
        .from('meal_plan_entries').insert(prepRows).select('id')
      if (prepErr) return jsonError(500, `prep insert failed: ${prepErr.message}`)
      prepInsertedIds = (prepInserted ?? []).map(r => r.id)
    }

    // Build placeholder_id → real id map
    const placeholderToRealId = new Map<string, string>()
    keptPlaceholders.forEach((ph, idx) => {
      if (ph) placeholderToRealId.set(ph, prepInsertedIds[idx])
    })

    // Warn if any leftover_from references a placeholder that didn't survive validation
    // (e.g. its source prep entry was dropped). The reference will resolve to null in the
    // final insert, but the planner deserves to know why.
    const knownPlaceholders = new Set(placeholderToRealId.keys())
    for (const e of restKept) {
      if (e.leftover_from && !knownPlaceholders.has(e.leftover_from)) {
        validationNotes.push(`leftover_from "${e.leftover_from}" could not be resolved — source prep entry was dropped`)
      }
    }

    // ── Step C: habit injection (operates on restKept; never on prep)
    const familyByAuthUser = new Map<string, string>()
    for (const m of (members ?? [])) {
      if (m.auth_user_id) familyByAuthUser.set(m.auth_user_id, m.id)
    }

    const occupiedKeys = new Set<string>()
    for (const e of restKept) {
      occupiedKeys.add(`${e.day_of_week}|${e.slot}|${e.family_member_id ?? 'family'}`)
    }

    const habitInjected: GeneratedEntry[] = []
    for (const h of (habits ?? [])) {
      const pausedThisWeek = (h.paused_for_weeks ?? []).includes(body.weekStart)
      if (pausedThisWeek) {
        validationNotes.push(`habit "${h.name}" paused this week`)
        continue
      }
      const ownerFamilyMemberId = familyByAuthUser.get(h.user_id)
      if (!ownerFamilyMemberId) {
        validationNotes.push(`habit "${h.name}" skipped: no family_members row for owner`)
        continue
      }
      for (let day = 0; day <= 6; day++) {
        const key = `${day}|${h.slot}|${ownerFamilyMemberId}`
        if (occupiedKeys.has(key)) continue
        habitInjected.push({
          day_of_week: day,
          slot: h.slot as GeneratedEntry['slot'],
          family_member_id: ownerFamilyMemberId,
          recipe_id: null,
          ad_hoc_title: h.name,
          prepared_by_family_member_id: null,
          leftover_from: null,
        })
        occupiedKeys.add(key)
      }
    }

    // ── Step D: insert non-prep entries with leftover_from resolved
    const restRows = [...restKept, ...habitInjected].map(e => ({
      meal_plan_id: plan.id,
      day_of_week: e.day_of_week,
      slot: e.slot,
      family_member_id: e.family_member_id,
      recipe_id: e.recipe_id,
      ad_hoc_title: e.ad_hoc_title,
      prepared_by_family_member_id: e.prepared_by_family_member_id,
      leftover_from: e.leftover_from ? (placeholderToRealId.get(e.leftover_from) ?? null) : null,
    }))
    let restInsertedIds: string[] = []
    if (restRows.length > 0) {
      const { data: restInserted, error: restInsertErr } = await supabase
        .from('meal_plan_entries').insert(restRows).select('id')
      if (restInsertErr) return jsonError(500, `entries insert failed: ${restInsertErr.message}`)
      restInsertedIds = (restInserted ?? []).map(r => r.id)
    }

    const insertedIds = [...prepInsertedIds, ...restInsertedIds]

    // ── Persist undo token ──────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('ai_undo_tokens')
      .insert({
        user_id: userId,
        description: `Drafted week of ${body.weekStart} from your brief`,
        inverse_actions: [
          { type: 'delete_meal_plan_entries_by_ids', payload: { ids: insertedIds } },
          { type: 'restore_meal_plan_entries', payload: { rows: prior ?? [] } },
          {
            type: 'restore_weekly_brief_status',
            payload: {
              brief_id: brief.id,
              status: priorBriefStatus,
              generated_at: priorBriefGeneratedAt,
            },
          },
        ],
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (tokenErr) {
      // Plan was written; just no undo. Don't fail the whole request.
      console.warn('undo token persist failed:', tokenErr.message)
    }

    // ── Mark brief generated ────────────────────────────────────────────
    await supabase.from('weekly_briefs')
      .update({
        status: 'generated',
        generated_at: new Date().toISOString(),
        diff_prose: parsed.notes_for_planner ?? null,
      })
      .eq('id', brief.id)

    return new Response(JSON.stringify({
      insertedCount: insertedIds.length,
      undoToken: tokenRow ? { id: tokenRow.id, expiresAt } : null,
      notesForPlanner: parsed.notes_for_planner ?? '',
      validationNotes,
      habitsApplied: habitInjected.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return jsonError(500, `unexpected: ${e instanceof Error ? e.message : String(e)}`)
  }
})

async function callAnthropic(apiKey: string, context: string, retried: boolean): Promise<string> {
  const userMessage = retried
    ? `${context}\n\nERROR: previous response wasn't valid JSON. Output ONLY the JSON object, starting with { and ending with }.`
    : context

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: '{\n  "entries":' },
      ],
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
  // If we hit the output cap the JSON will be truncated; surface that explicitly
  // so callers don't see a misleading "non-JSON" error.
  if (data.stop_reason === 'max_tokens') {
    throw new Error('model response truncated at max_tokens — bump cap or shorten brief')
  }
  // Re-prefix the prefilled assistant content so the JSON is complete.
  return `{\n  "entries":${text}`
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
