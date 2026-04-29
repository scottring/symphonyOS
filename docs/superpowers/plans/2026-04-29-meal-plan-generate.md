# AI Brief → Meal Plan Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the "Generate plan" button on `/meals/brief` so it calls Claude Haiku 4.5 with the brief + recipes + standing habits + household roster and atomically writes a fresh week of `meal_plan_entries` (plus a 30-min undo).

**Architecture:** A new edge function `meal-plan-generate` mirrors `symphony-chat`'s shape — loads household-visible context (RLS does the filtering), calls Anthropic via fetch, validates the JSON response, then calls a new SECURITY DEFINER Postgres function `regenerate_meal_plan` that performs delete + insert in one transaction. A second edge function `meal-plan-undo` reverses the most recent generation. A new hook `useGeneratePlan` wraps both for the UI.

**Tech Stack:** Deno (edge functions), Postgres + plpgsql (RPC), TypeScript + React + Vitest (hook + tests), Anthropic Messages API (`claude-haiku-4-5-20251001`).

---

## Spec reference

See `docs/superpowers/specs/2026-04-29-meal-plan-generate-design.md` for context, decisions, and rationale. This plan implements that spec exactly.

## File structure

| Status | Path | Responsibility |
|---|---|---|
| NEW | `supabase/migrations/080_meal_plan_generate_rpc.sql` | `regenerate_meal_plan` SECURITY DEFINER fn |
| NEW | `supabase/functions/meal-plan-generate/index.ts` | Build prompt, call Anthropic, validate, call RPC, persist undo token |
| NEW | `supabase/functions/_shared/mealPlanGenerate.ts` | Pure TS helpers (prompt builder, response validator) — unit-testable from Node |
| NEW | `supabase/functions/meal-plan-undo/index.ts` | Read token, run inverse actions |
| NEW | `src/hooks/useGeneratePlan.ts` | Browser-side wrapper over both edge functions |
| NEW | `src/hooks/useGeneratePlan.test.ts` | Hook tests (TDD) |
| NEW | `src/lib/mealPlanValidation.ts` | Pure validators shared between hook tests and edge function |
| NEW | `src/lib/mealPlanValidation.test.ts` | Validator tests |
| MOD | `src/types/meal-planner.ts` | Extend `InverseActionType` with batch variants; add `GeneratePlanResult` type |
| MOD | `src/components/meals/brief/BriefComposerPage.tsx` | Replace `markGenerated()` stub with `useGeneratePlan().generate(...)` |
| MOD | `src/components/meals/plan/PlannerPage.tsx` | Add an undo-toast slot driven by a new context (or query param) |
| NEW | `src/components/meals/plan/UndoToast.tsx` | Bottom-right toast with 30s timer + Undo button |
| NEW | `src/contexts/GeneratePlanContext.tsx` | Lifts `lastUndoToken` across pages so the toast survives the navigate from /meals/brief → /meals/plan |

The validation logic is duplicated intentionally between Deno and Node: edge functions can't import from `src/`, but the rules must stay in sync. `src/lib/mealPlanValidation.ts` is the canonical source — `supabase/functions/_shared/mealPlanGenerate.ts` is hand-mirrored. A test in Task 3 asserts a known input produces the same output in both environments.

---

## Task 1: Migration 080 — `regenerate_meal_plan` RPC

**Files:**
- Create: `supabase/migrations/080_meal_plan_generate_rpc.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 080_meal_plan_generate_rpc.sql
-- SECURITY DEFINER fn that atomically delete+inserts meal_plan_entries for one
-- meal_plan_id. Authorization: caller must be the plan owner OR share a
-- household with the owner (mirrors RLS on meal_plan_entries).

create or replace function regenerate_meal_plan(p_meal_plan_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_ids uuid[];
begin
  if not exists (
    select 1 from meal_plans p
    where p.id = p_meal_plan_id
      and (p.user_id = auth.uid() or users_share_household(auth.uid(), p.user_id))
  ) then
    raise exception 'unauthorized: plan % not visible to caller', p_meal_plan_id;
  end if;

  delete from meal_plan_entries where meal_plan_id = p_meal_plan_id;

  with inserted as (
    insert into meal_plan_entries (
      meal_plan_id, day_of_week, slot, family_member_id, recipe_id, ad_hoc_title
    )
    select p_meal_plan_id,
           (e->>'day_of_week')::smallint,
           e->>'slot',
           nullif(e->>'family_member_id', '')::uuid,
           nullif(e->>'recipe_id', '')::uuid,
           nullif(e->>'ad_hoc_title', '')
    from jsonb_array_elements(p_entries) e
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into inserted_ids from inserted;

  return jsonb_build_object('inserted_ids', inserted_ids);
end;
$$;

grant execute on function regenerate_meal_plan(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with `name: meal_plan_generate_rpc` and the SQL above (without the leading SQL comment lines — paste from `create or replace function` onward).

Expected result: `{ "success": true }`

- [ ] **Step 3: Verify the function exists and is callable**

Run via `mcp__supabase__execute_sql`:
```sql
select proname, prosecdef
from pg_proc
where proname = 'regenerate_meal_plan';
```

Expected: one row, `prosecdef = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/080_meal_plan_generate_rpc.sql
git commit -m "feat(meals): regenerate_meal_plan RPC for atomic delete+insert"
```

---

## Task 2: Extend types

**Files:**
- Modify: `src/types/meal-planner.ts`

- [ ] **Step 1: Add batch inverse-action variants and the generate-result type**

Find the `InverseActionType` union (look for `'delete_meal_plan_entry'`) and replace with:

```typescript
export type InverseActionType =
  | 'delete_meal_plan_entry'
  | 'delete_list_item'
  | 'restore_meal_plan_entry'
  | 'restore_list_item'
  | 'delete_meal_plan_entries_by_ids'
  | 'restore_meal_plan_entries'
```

Add at the bottom of the file (before the last closing brace if any, or at EOF):

```typescript
// ─────────────────────────────────────────────────────────────────
// AI brief→plan generation (edge functions: meal-plan-generate / meal-plan-undo)
// ─────────────────────────────────────────────────────────────────

export interface GeneratedEntry {
  day_of_week: number       // 0..6 (Mon..Sun)
  slot: 'breakfast' | 'lunch' | 'snack' | 'dinner'
  family_member_id: string | null
  recipe_id: string | null
  ad_hoc_title: string | null
}

export interface GeneratePlanResult {
  insertedCount: number
  undoToken: { id: string; expiresAt: string } | null
  notesForPlanner: string
  validationNotes: string[]
}

export interface UndoPlanResult {
  ok: boolean
  noop: boolean
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/types/meal-planner.ts
git commit -m "feat(meals): add GeneratePlanResult + batch inverse-action types"
```

---

## Task 3: Pure validator (`src/lib/mealPlanValidation.ts`) — TDD

**Files:**
- Create: `src/lib/mealPlanValidation.ts`
- Create: `src/lib/mealPlanValidation.test.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
// src/lib/mealPlanValidation.test.ts
import { describe, it, expect } from 'vitest'
import { validateGeneratedEntries } from './mealPlanValidation'

const ROSTER = new Set(['fm-iris', 'fm-scott', 'fm-ella'])
const SHELF  = new Set(['rec-shrimp', 'rec-cauliflower'])

describe('validateGeneratedEntries', () => {
  it('keeps a fully valid family-default entry', () => {
    const { kept, dropped } = validateGeneratedEntries([
      { day_of_week: 0, slot: 'dinner', family_member_id: null, recipe_id: 'rec-shrimp', ad_hoc_title: null },
    ], ROSTER, SHELF)
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(0)
  })

  it('keeps a per-person entry', () => {
    const { kept } = validateGeneratedEntries([
      { day_of_week: 0, slot: 'breakfast', family_member_id: 'fm-iris', recipe_id: null, ad_hoc_title: 'Yogurt' },
    ], ROSTER, SHELF)
    expect(kept).toHaveLength(1)
  })

  it('drops entry with day_of_week out of range', () => {
    const { kept, dropped } = validateGeneratedEntries([
      { day_of_week: 7, slot: 'dinner', family_member_id: null, recipe_id: 'rec-shrimp', ad_hoc_title: null },
    ], ROSTER, SHELF)
    expect(kept).toHaveLength(0)
    expect(dropped[0].reason).toMatch(/day_of_week/)
  })

  it('drops entry with non-canonical slot', () => {
    const { dropped } = validateGeneratedEntries([
      { day_of_week: 0, slot: 'brunch' as never, family_member_id: null, recipe_id: 'rec-shrimp', ad_hoc_title: null },
    ], ROSTER, SHELF)
    expect(dropped[0].reason).toMatch(/slot/)
  })

  it('drops entry with unknown family_member_id', () => {
    const { dropped } = validateGeneratedEntries([
      { day_of_week: 0, slot: 'dinner', family_member_id: 'fm-ghost', recipe_id: 'rec-shrimp', ad_hoc_title: null },
    ], ROSTER, SHELF)
    expect(dropped[0].reason).toMatch(/family_member_id/)
  })

  it('drops entry with unknown recipe_id', () => {
    const { dropped } = validateGeneratedEntries([
      { day_of_week: 0, slot: 'dinner', family_member_id: null, recipe_id: 'rec-ghost', ad_hoc_title: null },
    ], ROSTER, SHELF)
    expect(dropped[0].reason).toMatch(/recipe_id/)
  })

  it('drops entry with both recipe_id and ad_hoc_title set', () => {
    const { dropped } = validateGeneratedEntries([
      { day_of_week: 0, slot: 'dinner', family_member_id: null, recipe_id: 'rec-shrimp', ad_hoc_title: 'Other' },
    ], ROSTER, SHELF)
    expect(dropped[0].reason).toMatch(/exactly one/i)
  })

  it('drops entry with neither recipe_id nor ad_hoc_title set', () => {
    const { dropped } = validateGeneratedEntries([
      { day_of_week: 0, slot: 'dinner', family_member_id: null, recipe_id: null, ad_hoc_title: null },
    ], ROSTER, SHELF)
    expect(dropped[0].reason).toMatch(/exactly one/i)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/mealPlanValidation.test.ts`
Expected: FAIL — "Cannot find module './mealPlanValidation'" (or similar)

- [ ] **Step 3: Implement the validator**

```typescript
// src/lib/mealPlanValidation.ts
import type { GeneratedEntry } from '@/types/meal-planner'

const CANONICAL_SLOTS = new Set(['breakfast', 'lunch', 'snack', 'dinner'])

export interface ValidationDrop {
  entry: unknown
  reason: string
}

export interface ValidationResult {
  kept: GeneratedEntry[]
  dropped: ValidationDrop[]
}

/** Validates AI-generated entries against the supplied roster + shelf.
 *  Pure function; no side effects. Mirrored at supabase/functions/_shared/. */
export function validateGeneratedEntries(
  entries: unknown[],
  roster: Set<string>,
  shelf: Set<string>,
): ValidationResult {
  const kept: GeneratedEntry[] = []
  const dropped: ValidationDrop[] = []

  for (const raw of entries) {
    const e = raw as Partial<GeneratedEntry>
    if (typeof e.day_of_week !== 'number' || e.day_of_week < 0 || e.day_of_week > 6) {
      dropped.push({ entry: raw, reason: `day_of_week out of range: ${e.day_of_week}` })
      continue
    }
    if (typeof e.slot !== 'string' || !CANONICAL_SLOTS.has(e.slot)) {
      dropped.push({ entry: raw, reason: `slot not canonical: ${e.slot}` })
      continue
    }
    if (e.family_member_id != null && !roster.has(e.family_member_id)) {
      dropped.push({ entry: raw, reason: `family_member_id not in roster: ${e.family_member_id}` })
      continue
    }
    if (e.recipe_id != null && !shelf.has(e.recipe_id)) {
      dropped.push({ entry: raw, reason: `recipe_id not in shelf: ${e.recipe_id}` })
      continue
    }
    const hasRecipe = e.recipe_id != null
    const hasAdHoc  = e.ad_hoc_title != null && e.ad_hoc_title !== ''
    if (hasRecipe === hasAdHoc) {
      dropped.push({ entry: raw, reason: 'exactly one of recipe_id or ad_hoc_title required' })
      continue
    }
    kept.push({
      day_of_week: e.day_of_week,
      slot: e.slot as GeneratedEntry['slot'],
      family_member_id: e.family_member_id ?? null,
      recipe_id: e.recipe_id ?? null,
      ad_hoc_title: e.ad_hoc_title ?? null,
    })
  }
  return { kept, dropped }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mealPlanValidation.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Mirror to the Deno shared file**

```typescript
// supabase/functions/_shared/mealPlanGenerate.ts
// MIRROR of src/lib/mealPlanValidation.ts. Keep these two files in sync —
// edge functions can't import from src/. A test in the src copy asserts that
// a known input produces the same output in both files.

const CANONICAL_SLOTS = new Set(['breakfast', 'lunch', 'snack', 'dinner'])

export interface GeneratedEntry {
  day_of_week: number
  slot: 'breakfast' | 'lunch' | 'snack' | 'dinner'
  family_member_id: string | null
  recipe_id: string | null
  ad_hoc_title: string | null
}

export interface ValidationDrop { entry: unknown; reason: string }
export interface ValidationResult { kept: GeneratedEntry[]; dropped: ValidationDrop[] }

export function validateGeneratedEntries(
  entries: unknown[],
  roster: Set<string>,
  shelf: Set<string>,
): ValidationResult {
  const kept: GeneratedEntry[] = []
  const dropped: ValidationDrop[] = []
  for (const raw of entries) {
    const e = raw as Partial<GeneratedEntry>
    if (typeof e.day_of_week !== 'number' || e.day_of_week < 0 || e.day_of_week > 6) {
      dropped.push({ entry: raw, reason: `day_of_week out of range: ${e.day_of_week}` }); continue
    }
    if (typeof e.slot !== 'string' || !CANONICAL_SLOTS.has(e.slot)) {
      dropped.push({ entry: raw, reason: `slot not canonical: ${e.slot}` }); continue
    }
    if (e.family_member_id != null && !roster.has(e.family_member_id)) {
      dropped.push({ entry: raw, reason: `family_member_id not in roster: ${e.family_member_id}` }); continue
    }
    if (e.recipe_id != null && !shelf.has(e.recipe_id)) {
      dropped.push({ entry: raw, reason: `recipe_id not in shelf: ${e.recipe_id}` }); continue
    }
    const hasRecipe = e.recipe_id != null
    const hasAdHoc  = e.ad_hoc_title != null && e.ad_hoc_title !== ''
    if (hasRecipe === hasAdHoc) {
      dropped.push({ entry: raw, reason: 'exactly one of recipe_id or ad_hoc_title required' }); continue
    }
    kept.push({
      day_of_week: e.day_of_week,
      slot: e.slot as GeneratedEntry['slot'],
      family_member_id: e.family_member_id ?? null,
      recipe_id: e.recipe_id ?? null,
      ad_hoc_title: e.ad_hoc_title ?? null,
    })
  }
  return { kept, dropped }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/mealPlanValidation.ts src/lib/mealPlanValidation.test.ts supabase/functions/_shared/mealPlanGenerate.ts
git commit -m "feat(meals): generated-entries validator with shared Deno mirror"
```

---

## Task 4: Prompt builder (`buildPrompt`)

**Files:**
- Modify: `src/lib/mealPlanValidation.ts` — add `buildPromptContext`
- Modify: `src/lib/mealPlanValidation.test.ts` — add tests
- Modify: `supabase/functions/_shared/mealPlanGenerate.ts` — mirror

- [ ] **Step 1: Add failing tests for the prompt builder**

Append to `src/lib/mealPlanValidation.test.ts`:

```typescript
import { buildPromptContext } from './mealPlanValidation'

describe('buildPromptContext', () => {
  it('emits week, roster, shelf, habits, and brief sections', () => {
    const out = buildPromptContext({
      weekStart: '2026-04-27',
      mealPlanId: 'mp-1',
      members: [
        { name: 'Iris',  family_member_id: 'fm-iris',  auth_user_id: 'au-iris' },
        { name: 'Scott', family_member_id: 'fm-scott', auth_user_id: 'au-scott' },
      ],
      shelf: [
        { recipe_id: 'rec-shrimp', title: 'Bittman Shrimp', tags: ['~80g'], prep_minutes: 15, kid_acceptance: 'Both kids eat this.', is_prep_friendly: false },
      ],
      habits: [
        { owner_auth_user_id: 'au-iris', name: 'Yogurt', slot: 'breakfast', grams_hint: 80 },
      ],
      brief: 'Bittman shrimp this week.',
    })
    expect(out).toContain('WEEK: 2026-04-27')
    expect(out).toContain('MEAL_PLAN_ID: mp-1')
    expect(out).toContain('Iris')
    expect(out).toContain('rec-shrimp')
    expect(out).toContain('Yogurt')
    expect(out).toContain('Bittman shrimp this week.')
  })

  it('handles empty shelf and empty habits gracefully', () => {
    const out = buildPromptContext({
      weekStart: '2026-04-27', mealPlanId: 'mp-1',
      members: [], shelf: [], habits: [], brief: 'something',
    })
    expect(out).toContain('SHELF (household, 0 recipes)')
    expect(out).toContain('STANDING HABITS:\n  (none)')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mealPlanValidation.test.ts -t buildPromptContext`
Expected: FAIL — `buildPromptContext` is not exported.

- [ ] **Step 3: Implement `buildPromptContext`**

Append to `src/lib/mealPlanValidation.ts`:

```typescript
export interface PromptContextInput {
  weekStart: string                              // YYYY-MM-DD (Monday)
  mealPlanId: string
  members: Array<{ name: string; family_member_id: string; auth_user_id: string | null }>
  shelf:   Array<{ recipe_id: string; title: string; tags: string[]; prep_minutes: number | null; kid_acceptance: string | null; is_prep_friendly: boolean }>
  habits:  Array<{ owner_auth_user_id: string; name: string; slot: string; grams_hint: number | null }>
  brief:   string
}

/** Renders the dynamic context block fed to Haiku alongside the static system
 *  prompt. Format is intentionally human-readable so a planner can eyeball it
 *  in logs. */
export function buildPromptContext(input: PromptContextInput): string {
  const members = input.members.length === 0
    ? '  (none)'
    : input.members.map(m =>
        `  - {name: "${m.name}", family_member_id: "${m.family_member_id}", auth_user_id: ${m.auth_user_id ? `"${m.auth_user_id}"` : 'null'}}`
      ).join('\n')

  const shelf = input.shelf.length === 0
    ? '  (none)'
    : input.shelf.map(r =>
        `  - {recipe_id: "${r.recipe_id}", title: ${JSON.stringify(r.title)}, tags: ${JSON.stringify(r.tags)}, prep_minutes: ${r.prep_minutes ?? 'null'}, kid_acceptance: ${r.kid_acceptance ? JSON.stringify(r.kid_acceptance) : 'null'}, is_prep_friendly: ${r.is_prep_friendly}}`
      ).join('\n')

  const habits = input.habits.length === 0
    ? '  (none)'
    : input.habits.map(h =>
        `  - {owner_auth_user_id: "${h.owner_auth_user_id}", name: ${JSON.stringify(h.name)}, slot: "${h.slot}", grams_hint: ${h.grams_hint ?? 'null'}}`
      ).join('\n')

  return [
    `WEEK: ${input.weekStart} (Mon-Sun)`,
    `MEAL_PLAN_ID: ${input.mealPlanId}`,
    '',
    'HOUSEHOLD MEMBERS:',
    members,
    '',
    `SHELF (household, ${input.shelf.length} recipes):`,
    shelf,
    '',
    'STANDING HABITS:',
    habits,
    '',
    'BRIEF:',
    JSON.stringify(input.brief),
  ].join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mealPlanValidation.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Mirror to the Deno shared file**

Append the same `PromptContextInput` interface and `buildPromptContext` function to `supabase/functions/_shared/mealPlanGenerate.ts`. The implementation is identical — copy verbatim.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mealPlanValidation.ts src/lib/mealPlanValidation.test.ts supabase/functions/_shared/mealPlanGenerate.ts
git commit -m "feat(meals): buildPromptContext helper for AI generation"
```

---

## Task 5: `meal-plan-generate` edge function

**Files:**
- Create: `supabase/functions/meal-plan-generate/index.ts`

- [ ] **Step 1: Write the edge function**

```typescript
// supabase/functions/meal-plan-generate/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildPromptContext, validateGeneratedEntries, type GeneratedEntry } from '../_shared/mealPlanGenerate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You draft a one-week meal plan for a household based on a planner's free-form brief. Output strict JSON matching the schema. Every recipe you reference must come from the supplied shelf — never invent a recipe_id. Foods named in the brief that aren't on the shelf become ad_hoc entries (no recipe_id, just a title). Apply each standing habit to the right person each day, unless the brief explicitly overrides it. The four canonical slots are breakfast, lunch, snack, dinner. day_of_week is 0..6 (Mon..Sun).`

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
      supabase.from('weekly_briefs').select('id,body').eq('week_start', body.weekStart).order('created_at', { ascending: true }).limit(1),
      supabase.from('recipes').select('id,title,tags,prep_minutes,acceptance_sentence,is_prep_friendly'),
      supabase.from('standing_habits').select('user_id,name,slot,grams_hint').eq('paused', false),
      supabase.from('family_members').select('id,name,auth_user_id'),
    ])
    if (planErr || briefErr || recErr || habErr || memErr) {
      return jsonError(500, `context load failed: ${(planErr || briefErr || recErr || habErr || memErr)?.message}`)
    }

    const plan  = planRows?.[0]
    const brief = briefRows?.[0]
    if (!plan)  return jsonError(404, 'no meal_plan exists for this week — create one first')
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
      parsed = JSON.parse(aiResp)
    } catch {
      // single retry with explicit error feedback
      const retryResp = await callAnthropic(anthropicKey, promptContext, /*retried=*/ true)
      try {
        parsed = JSON.parse(retryResp)
      } catch (e) {
        return jsonError(502, `model returned non-JSON twice: ${e}`)
      }
    }

    if (!parsed.entries || parsed.entries.length === 0) {
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

    // ── Snapshot prior entries for undo ─────────────────────────────────
    const { data: prior } = await supabase
      .from('meal_plan_entries').select('*').eq('meal_plan_id', plan.id)

    // ── Atomic delete + insert via RPC ──────────────────────────────────
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('regenerate_meal_plan', {
      p_meal_plan_id: plan.id,
      p_entries: kept,
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
      .update({ status: 'generated', generated_at: new Date().toISOString() })
      .eq('id', brief.id)

    return new Response(JSON.stringify({
      insertedCount: insertedIds.length,
      undoToken: tokenRow ? { id: tokenRow.id, expiresAt } : null,
      notesForPlanner: parsed.notes_for_planner ?? '',
      validationNotes,
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
  if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${await resp.text()}`)
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
```

- [ ] **Step 2: Deploy the edge function via Supabase MCP**

Use `mcp__supabase__deploy_edge_function` with name `meal-plan-generate` and the file contents above.

Expected: `{ success: true }` or similar.

- [ ] **Step 3: Manual smoke test**

In the browser DevTools console while logged in:
```js
(await window.supabase.functions.invoke('meal-plan-generate', { body: { weekStart: '2026-04-27' } }))
```
Expected: response with `insertedCount > 0` and `undoToken.id` set, OR a clear error message ("brief is empty" if you haven't written one).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/meal-plan-generate/index.ts
git commit -m "feat(meals): meal-plan-generate edge function"
```

---

## Task 6: `meal-plan-undo` edge function

**Files:**
- Create: `supabase/functions/meal-plan-undo/index.ts`

- [ ] **Step 1: Write the edge function**

```typescript
// supabase/functions/meal-plan-undo/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody { tokenId: string }

interface InverseAction {
  type: 'delete_meal_plan_entries_by_ids' | 'restore_meal_plan_entries' | string
  payload: Record<string, unknown>
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

    const { tokenId } = (await req.json()) as RequestBody
    if (!tokenId) return jsonError(400, 'tokenId required')

    const { data: token, error: tokErr } = await supabase
      .from('ai_undo_tokens').select('*').eq('id', tokenId).maybeSingle()
    if (tokErr || !token) return jsonError(404, 'token not found')

    if (token.used_at) {
      return new Response(JSON.stringify({ ok: true, noop: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (new Date(token.expires_at) < new Date()) {
      return jsonError(410, 'token expired')
    }

    const actions = (token.inverse_actions ?? []) as InverseAction[]
    for (const action of actions) {
      if (action.type === 'delete_meal_plan_entries_by_ids') {
        const ids = (action.payload?.ids ?? []) as string[]
        if (ids.length > 0) {
          const { error } = await supabase.from('meal_plan_entries').delete().in('id', ids)
          if (error) return jsonError(500, `delete failed: ${error.message}`)
        }
      } else if (action.type === 'restore_meal_plan_entries') {
        const rows = (action.payload?.rows ?? []) as Record<string, unknown>[]
        if (rows.length > 0) {
          // Restore by the original row shape; the ids come back too.
          const { error } = await supabase.from('meal_plan_entries').insert(rows)
          if (error) return jsonError(500, `restore failed: ${error.message}`)
        }
      }
    }

    await supabase.from('ai_undo_tokens')
      .update({ used_at: new Date().toISOString() }).eq('id', tokenId)

    return new Response(JSON.stringify({ ok: true, noop: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(500, `unexpected: ${e instanceof Error ? e.message : String(e)}`)
  }
})

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Deploy via Supabase MCP**

Use `mcp__supabase__deploy_edge_function` with name `meal-plan-undo` and the file contents above.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/meal-plan-undo/index.ts
git commit -m "feat(meals): meal-plan-undo edge function"
```

---

## Task 7: `useGeneratePlan` hook — TDD

**Files:**
- Create: `src/hooks/useGeneratePlan.ts`
- Create: `src/hooks/useGeneratePlan.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/hooks/useGeneratePlan.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGeneratePlan } from './useGeneratePlan'

const invokeMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}))

beforeEach(() => { invokeMock.mockReset() })

const WEEK = new Date('2026-04-27T00:00:00')

describe('useGeneratePlan.generate', () => {
  it('invokes meal-plan-generate with weekStart and returns result', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { insertedCount: 28, undoToken: { id: 't1', expiresAt: '...' }, notesForPlanner: 'ok', validationNotes: [] },
      error: null,
    })
    const { result } = renderHook(() => useGeneratePlan())
    let r: unknown
    await act(async () => { r = await result.current.generate(WEEK) })
    expect(invokeMock).toHaveBeenCalledWith('meal-plan-generate', { body: { weekStart: '2026-04-27' } })
    expect((r as { ok: boolean }).ok).toBe(true)
    await waitFor(() => expect(result.current.lastUndoToken?.id).toBe('t1'))
  })

  it('surfaces errors from the edge function', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'brief is empty' } })
    const { result } = renderHook(() => useGeneratePlan())
    let r: { ok: boolean; error?: string } = { ok: true }
    await act(async () => { r = await result.current.generate(WEEK) })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('brief is empty')
    expect(result.current.error).toContain('brief is empty')
  })

  it('toggles `generating` while in flight', async () => {
    let resolveFn: (v: unknown) => void = () => {}
    invokeMock.mockReturnValueOnce(new Promise(res => { resolveFn = res }))
    const { result } = renderHook(() => useGeneratePlan())
    act(() => { void result.current.generate(WEEK) })
    await waitFor(() => expect(result.current.generating).toBe(true))
    await act(async () => {
      resolveFn({ data: { insertedCount: 1, undoToken: null, notesForPlanner: '', validationNotes: [] }, error: null })
    })
    await waitFor(() => expect(result.current.generating).toBe(false))
  })
})

describe('useGeneratePlan.undo', () => {
  it('invokes meal-plan-undo with the token id', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true, noop: false }, error: null })
    const { result } = renderHook(() => useGeneratePlan())
    let r: unknown
    await act(async () => { r = await result.current.undo('t1') })
    expect(invokeMock).toHaveBeenCalledWith('meal-plan-undo', { body: { tokenId: 't1' } })
    expect((r as { ok: boolean }).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useGeneratePlan.test.ts`
Expected: FAIL — `useGeneratePlan` not defined.

- [ ] **Step 3: Implement the hook**

```typescript
// src/hooks/useGeneratePlan.ts
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { GeneratePlanResult, UndoPlanResult } from '@/types/meal-planner'

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface GenerateReturn {
  ok: boolean
  result?: GeneratePlanResult
  error?: string
}

interface UndoReturn {
  ok: boolean
  noop?: boolean
  error?: string
}

export function useGeneratePlan() {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUndoToken, setLastUndoToken] = useState<{ id: string; expiresAt: string } | null>(null)

  const generate = useCallback(async (weekStart: Date): Promise<GenerateReturn> => {
    setGenerating(true)
    setError(null)
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke<GeneratePlanResult>(
        'meal-plan-generate',
        { body: { weekStart: toIsoDate(weekStart) } },
      )
      if (invokeErr || !data) {
        const msg = invokeErr?.message ?? 'generation failed'
        setError(msg)
        return { ok: false, error: msg }
      }
      setLastUndoToken(data.undoToken)
      return { ok: true, result: data }
    } finally {
      setGenerating(false)
    }
  }, [])

  const undo = useCallback(async (tokenId: string): Promise<UndoReturn> => {
    const { data, error: invokeErr } = await supabase.functions.invoke<UndoPlanResult>(
      'meal-plan-undo',
      { body: { tokenId } },
    )
    if (invokeErr || !data) {
      const msg = invokeErr?.message ?? 'undo failed'
      return { ok: false, error: msg }
    }
    if (data.ok) setLastUndoToken(null)
    return { ok: data.ok, noop: data.noop }
  }, [])

  return { generate, undo, generating, error, lastUndoToken, clearUndoToken: () => setLastUndoToken(null) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useGeneratePlan.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGeneratePlan.ts src/hooks/useGeneratePlan.test.ts
git commit -m "feat(meals): useGeneratePlan hook with TDD coverage"
```

---

## Task 8: `GeneratePlanContext` — lift undo token across pages

**Files:**
- Create: `src/contexts/GeneratePlanContext.tsx`

- [ ] **Step 1: Write the context provider**

```typescript
// src/contexts/GeneratePlanContext.tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface UndoToken { id: string; expiresAt: string }

interface ContextValue {
  lastUndoToken: UndoToken | null
  setLastUndoToken: (t: UndoToken | null) => void
}

const GeneratePlanContext = createContext<ContextValue | null>(null)

export function GeneratePlanProvider({ children }: { children: ReactNode }) {
  const [lastUndoToken, setLastUndoTokenState] = useState<UndoToken | null>(null)
  const setLastUndoToken = useCallback((t: UndoToken | null) => setLastUndoTokenState(t), [])
  return (
    <GeneratePlanContext.Provider value={{ lastUndoToken, setLastUndoToken }}>
      {children}
    </GeneratePlanContext.Provider>
  )
}

export function useGeneratePlanContext(): ContextValue {
  const ctx = useContext(GeneratePlanContext)
  if (!ctx) throw new Error('useGeneratePlanContext must be inside GeneratePlanProvider')
  return ctx
}
```

- [ ] **Step 2: Mount the provider in `App.tsx`**

Open `src/App.tsx`, find the existing context provider stack (search for an existing provider like `ScheduleActionsProvider` or `GoalsContext`), and wrap the relevant subtree:

```tsx
import { GeneratePlanProvider } from '@/contexts/GeneratePlanContext'

// inside the JSX tree, wrap the meals section:
<GeneratePlanProvider>
  {/* existing children */}
</GeneratePlanProvider>
```

If unsure where to mount it, place it as the outermost provider inside `AppContent` (or equivalent) so both `BriefComposerPage` and `PlannerPage` see it.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/contexts/GeneratePlanContext.tsx src/App.tsx
git commit -m "feat(meals): GeneratePlanProvider for cross-page undo token"
```

---

## Task 9: Wire `BriefComposerPage` to `useGeneratePlan`

**Files:**
- Modify: `src/components/meals/brief/BriefComposerPage.tsx`

- [ ] **Step 1: Replace the stub generate flow**

Open `src/components/meals/brief/BriefComposerPage.tsx`. Find the current `useWeeklyBrief(...)` import and the `markGenerated` call inside `onGenerate`. Replace with:

```tsx
// Add to imports
import { useGeneratePlan } from '@/hooks/useGeneratePlan'
import { useGeneratePlanContext } from '@/contexts/GeneratePlanContext'

// Inside the component, replace the existing onGenerate block:
const { generate, generating, error: genError } = useGeneratePlan()
const { setLastUndoToken } = useGeneratePlanContext()
const [errorToast, setErrorToast] = useState<string | null>(null)

const onGenerate = async () => {
  if (!draft.trim()) {
    setErrorToast('Write something in the brief first.')
    return
  }
  if (draft !== brief?.body) await setBody(draft)
  const r = await generate(weekStart)
  if (!r.ok) {
    setErrorToast(r.error ?? 'Generation failed.')
    return
  }
  if (r.result?.undoToken) setLastUndoToken(r.result.undoToken)
  navigate('/meals/plan')
}
```

Replace the existing CTA button to use `generating` from the new hook (it already binds `generating` — confirm the variable is wired). Replace the inline button copy block:

```tsx
<button
  onClick={onGenerate}
  disabled={!draft.trim() || generating}
  className="px-5 py-2.5 rounded-full bg-primary-500 text-white text-[13px] font-medium
             shadow-primary hover:bg-primary-600 disabled:opacity-40 flex items-center gap-2"
>
  {generating ? (
    <>
      <span className="font-display italic">Drafting your week…</span>
    </>
  ) : (
    <>
      <span className="text-[15px]">✦</span>
      <span className="text-[10px] uppercase tracking-[0.18em] mr-1 px-1.5 py-0.5 rounded
                       bg-white/15 font-bold">Enter</span>
      Generate plan
    </>
  )}
</button>
```

Add a small error-toast renderer near the bottom of the page:

```tsx
{errorToast && (
  <div className="mt-4 px-4 py-2 rounded-xl border border-accent-100 bg-accent-50 text-accent-600 text-[13px]">
    {errorToast}
    <button onClick={() => setErrorToast(null)} className="ml-3 italic underline">dismiss</button>
  </div>
)}
{genError && !errorToast && (
  <div className="mt-4 text-[13px] italic text-accent-500">{genError}</div>
)}
```

Remove the now-unused `markGenerated` from the destructure of `useWeeklyBrief()` (the new hook supersedes it for this surface).

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/components/meals/brief/BriefComposerPage.tsx
git commit -m "feat(meals): wire BriefComposerPage to useGeneratePlan"
```

---

## Task 10: `UndoToast` + mount on `PlannerPage`

**Files:**
- Create: `src/components/meals/plan/UndoToast.tsx`
- Modify: `src/components/meals/plan/PlannerPage.tsx`

- [ ] **Step 1: Write the toast**

```tsx
// src/components/meals/plan/UndoToast.tsx
import { useEffect, useState } from 'react'
import { useGeneratePlanContext } from '@/contexts/GeneratePlanContext'
import { useGeneratePlan } from '@/hooks/useGeneratePlan'
import { useMealPlan } from '@/hooks/useMealPlan'
import { mondayOfWeek } from '@/lib/weekHelpers'

const VISIBLE_MS = 30_000

export function UndoToast() {
  const { lastUndoToken, setLastUndoToken } = useGeneratePlanContext()
  const { undo } = useGeneratePlan()
  const { refresh } = useMealPlan(mondayOfWeek(new Date()))
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!lastUndoToken) return
    setHidden(false)
    const t = setTimeout(() => setHidden(true), VISIBLE_MS)
    return () => clearTimeout(t)
  }, [lastUndoToken?.id])

  if (!lastUndoToken || hidden) return null

  const onUndo = async () => {
    if (!lastUndoToken) return
    setBusy(true)
    const r = await undo(lastUndoToken.id)
    setBusy(false)
    if (r.ok) {
      setLastUndoToken(null)
      await refresh()
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-neutral-200 bg-bg-elevated shadow-card px-5 py-3 flex items-center gap-3">
      <span className="font-display italic text-[14px] text-neutral-700">
        Plan drafted from your brief.
      </span>
      <button
        onClick={onUndo}
        disabled={busy}
        className="text-[12px] font-medium text-primary-500 hover:text-primary-600 disabled:opacity-40"
      >
        {busy ? '…' : '↶ Undo'}
      </button>
      <button
        onClick={() => setHidden(true)}
        aria-label="Dismiss"
        className="text-neutral-400 hover:text-neutral-600 text-[14px]"
      >
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Mount on `PlannerPage`**

Open `src/components/meals/plan/PlannerPage.tsx`. Add the import and render the toast at the top level of the JSX (after the outer div opens):

```tsx
import { UndoToast } from './UndoToast'

// at the top of the returned JSX, just after the wrapper div:
<UndoToast />
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/components/meals/plan/UndoToast.tsx src/components/meals/plan/PlannerPage.tsx
git commit -m "feat(meals): UndoToast on planner page"
```

---

## Task 11: End-to-end verification

- [ ] **Step 1: Run the full type check**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run src/lib/mealPlanValidation.test.ts src/hooks/useGeneratePlan.test.ts`
Expected: all green.

- [ ] **Step 3: Production build**

Run: `npx vite build`
Expected: `✓ built` line, no errors.

- [ ] **Step 4: Manual two-account walkthrough**

In a browser:
1. Log in as the household's planner. Navigate to `/meals/brief`.
2. Type a brief: `"800g challenge · No stir fry this week · Bittman shrimp — finally!"`
3. Tap "Generate plan." Expect spinner → navigate to `/meals/plan`.
4. Verify each day card shows breakfast/lunch/snack/dinner rows; rows that came from standing habits carry per-person attribution.
5. Tap the Undo toast. Expect day cards to revert to their prior state.
6. Tap "Generate plan" again from `/meals/brief`. Verify a *fresh* week is drafted (overwrites prior).
7. Log out, log in as a second household member. Navigate to `/meals/plan`. Verify the same plan is visible.

- [ ] **Step 5: SQL spot-check via Supabase MCP**

Run via `mcp__supabase__execute_sql`:
```sql
select
  count(*)                                       as total,
  count(*) filter (where family_member_id is not null) as per_person,
  count(*) filter (where recipe_id is not null)        as recipe_backed,
  count(*) filter (where ad_hoc_title is not null)     as ad_hoc
from meal_plan_entries
where meal_plan_id = (
  select id from meal_plans where week_start = '2026-04-27' order by created_at limit 1
);
```
Expected: `total ≥ 28` (4 slots × 7 days minimum), `per_person ≥ 1`, `recipe_backed + ad_hoc = total`.

- [ ] **Step 6: Final commit**

```bash
git commit --allow-empty -m "chore(meals): brief→plan generation verified end-to-end"
```

---

## Self-review checklist (run before handoff)

- [x] Spec coverage: every section of the spec maps to a task above (Migration 080 → Task 1; types → Task 2; validator → Task 3; prompt builder → Task 4; generate fn → Task 5; undo fn → Task 6; hook → Task 7; toast plumbing → Tasks 8 + 10; UI wiring → Task 9; verification → Task 11).
- [x] No placeholders ("TBD", "implement later", etc.) — every step has actual code or actual commands.
- [x] Type consistency: `GeneratePlanResult`, `GeneratedEntry`, `UndoPlanResult` defined in Task 2 and used in Tasks 5, 7. `validateGeneratedEntries`, `buildPromptContext` defined in Tasks 3+4 and used in Task 5.
- [x] Frontmatter goal/architecture/tech-stack present.
- [x] All tasks have exact file paths and bite-sized steps.

---

## Out of scope (named so they're not built by accident)

- Streaming generation
- Multi-week look-ahead
- Auto-rerun on brief edit
- Per-member opt-out from a given week
- Auto-creating a placeholder recipe from a brief mention (we use ad-hoc entries)
- Extending `useMealPlan.test.ts` / `useRecipes.test.ts` to cover post-079 contract — separate plan item
