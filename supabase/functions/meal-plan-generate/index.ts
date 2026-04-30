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

const SYSTEM_PROMPT = `You draft a one-week meal plan for a household based on a planner's free-form brief. Output strict JSON matching the schema. Every recipe you reference must come from the supplied shelf — never invent a recipe_id. Foods named in the brief that aren't on the shelf become ad_hoc entries (no recipe_id, just a title). Apply each standing habit to the right person each day, unless the brief explicitly overrides it. The four canonical slots are breakfast, lunch, snack, dinner. day_of_week is 0..6 (Mon..Sun). The notes_for_planner field should contain a short paragraph (1-3 sentences) describing what's different about this week — what the planner explicitly asked for, what's new, what's being skipped, anything noteworthy. Write it as if explaining the plan to a partner who hasn't read the brief.`

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
      { data: planRows, error: planErr },
      { data: briefRows, error: briefErr },
      { data: recipes,   error: recErr   },
      { data: habits,    error: habErr   },
      { data: members,   error: memErr   },
    ] = await Promise.all([
      supabase.from('meal_plans').select('id,user_id').eq('week_start', body.weekStart).order('created_at', { ascending: true }).limit(1),
      supabase.from('weekly_briefs').select('id,body,status,generated_at').eq('week_start', body.weekStart).order('created_at', { ascending: true }).limit(1),
      supabase.from('recipes').select('id,title,tags,prep_minutes,acceptance_sentence,is_prep_friendly'),
      supabase.from('standing_habits').select('user_id,name,slot,grams_hint,paused_for_weeks').eq('paused', false),
      supabase.from('family_members').select('id,name,auth_user_id'),
    ])
    if (planErr || briefErr || recErr || habErr || memErr) {
      return jsonError(500, `context load failed: ${(planErr || briefErr || recErr || habErr || memErr)?.message}`)
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

    // ── Validate ────────────────────────────────────────────────────────
    const roster = new Set((members ?? []).map(m => m.id))
    const shelf  = new Set((recipes ?? []).map(r => r.id))
    const { kept, dropped } = validateGeneratedEntries(parsed.entries, roster, shelf)
    const validationNotes = dropped.map(d => d.reason)

    if (kept.length === 0) {
      return jsonError(422, `all ${dropped.length} entries failed validation`)
    }

    // ── Habit injection ─────────────────────────────────────────────────
    // For each non-paused standing habit, ensure there's an entry at
    // (every day of week, habit.slot, owner's family_member_id). Skip if
    // an entry already exists at that coordinate (don't override AI/user).
    // Habits whose owner has no matching family_members row are skipped
    // and logged.
    const familyByAuthUser = new Map<string, string>()  // auth_user_id → family_members.id
    for (const m of (members ?? [])) {
      if (m.auth_user_id) familyByAuthUser.set(m.auth_user_id, m.id)
    }

    const occupiedKeys = new Set<string>()
    for (const e of kept) {
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
        })
        occupiedKeys.add(key)
      }
    }

    const allEntries = [...kept, ...habitInjected]

    // ── Snapshot prior entries for undo ─────────────────────────────────
    const { data: prior } = await supabase
      .from('meal_plan_entries').select('*').eq('meal_plan_id', plan.id)

    // Capture prior brief state too — if the planner undoes, the
    // generated/generated_at timestamps should revert.
    const priorBriefStatus = brief.status as string | null
    const priorBriefGeneratedAt = (brief as { generated_at?: string | null }).generated_at ?? null

    // ── Atomic delete + insert via RPC ──────────────────────────────────
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('regenerate_meal_plan', {
      p_meal_plan_id: plan.id,
      p_entries: allEntries,
    })
    if (rpcErr) return jsonError(500, `regenerate_meal_plan failed: ${rpcErr.message}`)
    const insertedIds = (rpcResult?.inserted_ids ?? []) as string[]

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
      max_tokens: 4000,
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
  // Re-prefix the prefilled assistant content so the JSON is complete.
  return `{\n  "entries":${text}`
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
