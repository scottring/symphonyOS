# Meal Planner: Sunday Prep, Cook Assignment, Restrictions, Clear Week

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps that block the v3 meal planner from being usable end-to-end: AI generates Sunday batch prep with leftover threading, every meal can be assigned to a cook, dietary restrictions filter the shelf during generation, the Today timeline shows meals filtered to the current user, the unused Ingredient Threads section is removed, and the planner can wipe the week with one click.

**Architecture:** Two new migrations (preparer column on `meal_plan_entries`, new `dietary_restrictions` table with household RLS). Validator and prompt extended for `prep` slot + `leftover_from` placeholder threading + soft recipe_id drop. New `clearWeek()` on `useMealPlan` reuses the existing `regenerate_meal_plan` RPC with `[]`. Restrictions get a new section on the existing Habits page. Today filters meal-event synthesis by `family_member_id`.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS + Edge Functions/Deno), Anthropic Claude Haiku 4.5, Vitest.

---

## Scope Check

This is one feature spanning data, generator, hook, and three UI surfaces. It's tightly coupled — splitting would force migration ordering between PRs. One plan, one PR.

---

## File Structure

**Created**
- `supabase/migrations/084_meal_plan_entry_preparer.sql` — adds `prepared_by_family_member_id` FK
- `supabase/migrations/085_dietary_restrictions.sql` — new table + household RLS
- `src/hooks/useDietaryRestrictions.ts` — CRUD hook
- `src/components/meals/habits/RestrictionsSection.tsx` — UI on Habits page
- `src/components/meals/plan/CookChip.tsx` — chip + reassign popover for any meal entry
- `src/components/meals/plan/ClearWeekButton.tsx` — secondary text button + confirm dialog
- `src/lib/__tests__/mealPlanValidation.test.ts` — extends existing tests for prep + leftover + soft drop

**Modified**
- `src/types/meal-planner.ts` — add `preparedBy`, `DietaryRestriction`, raw `prepared_by_family_member_id`
- `src/lib/mealPlanValidation.ts` (and mirror at `supabase/functions/_shared/mealPlanGenerate.ts`)
- `supabase/functions/meal-plan-generate/index.ts` — load restrictions, new prompt, placeholder ID resolution
- `src/hooks/useMealPlan.ts` — `clearWeek()`, round-trip `preparedBy`
- `src/components/meals/plan/PlannerPage.tsx` — delete Ingredient Threads, add Clear Week button
- `src/components/meals/plan/SlotSection.tsx` and `MealCard.tsx` — surface CookChip
- `src/components/meals/habits/StandingHabitsPage.tsx` — mount RestrictionsSection
- `src/App.tsx` — filter `mealEvents` by current user's family_member_id

**Deleted**
- The Ingredient Threads code in PlannerPage (memo + section JSX).

---

## Task 1: Migration 084 — preparer column

**Files:**
- Create: `supabase/migrations/084_meal_plan_entry_preparer.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 084_meal_plan_entry_preparer.sql
-- Add a "who is cooking this" axis. Distinct from family_member_id, which
-- answers "for whom" (per-person variants). Nullable: NULL = unassigned.

alter table meal_plan_entries
  add column prepared_by_family_member_id uuid
    references family_members(id) on delete set null;

create index meal_plan_entries_prepared_by_idx
  on meal_plan_entries (prepared_by_family_member_id)
  where prepared_by_family_member_id is not null;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `084_meal_plan_entry_preparer` and the SQL above.

Expected: success, no advisor warnings (it's just an additive column + partial index).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/084_meal_plan_entry_preparer.sql
git commit -m "feat(meals): add prepared_by_family_member_id to meal_plan_entries"
```

---

## Task 2: Migration 085 — dietary_restrictions

**Files:**
- Create: `supabase/migrations/085_dietary_restrictions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 085_dietary_restrictions.sql
-- Per-person and household-wide constraints that filter the shelf during
-- AI generation. family_member_id NULL = applies to whole household.
-- A short freeform `label` is the user-facing string, fed to the model.

create table dietary_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid references family_members(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  created_at timestamptz not null default now()
);

create index dietary_restrictions_user_idx on dietary_restrictions(user_id);
create index dietary_restrictions_member_idx on dietary_restrictions(family_member_id)
  where family_member_id is not null;

alter table dietary_restrictions enable row level security;

-- Same household-visibility pattern used by recipes / standing_habits / etc.
create policy "dietary_restrictions household select"
  on dietary_restrictions for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "dietary_restrictions household insert"
  on dietary_restrictions for insert
  with check (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "dietary_restrictions household update"
  on dietary_restrictions for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "dietary_restrictions household delete"
  on dietary_restrictions for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `085_dietary_restrictions`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/085_dietary_restrictions.sql
git commit -m "feat(meals): add dietary_restrictions table with household RLS"
```

---

## Task 3: Types — preparedBy + DietaryRestriction

**Files:**
- Modify: `src/types/meal-planner.ts`

- [ ] **Step 1: Add to `DbMealPlanEntry` and `MealPlanEntry`**

Inside `DbMealPlanEntry`, add field `prepared_by_family_member_id: string | null`.
Inside `MealPlanEntry`, add field `preparedBy?: string | null`.

In the `dbMealPlanEntryToMealPlanEntry` mapper (around line 366–375), include:

```ts
preparedBy: row.prepared_by_family_member_id ?? null,
```

- [ ] **Step 2: Add `DietaryRestriction` types**

Append to the file:

```ts
export interface DbDietaryRestriction {
  id: string
  user_id: string
  family_member_id: string | null
  label: string
  created_at: string
}

export interface DietaryRestriction {
  id: string
  familyMemberId: string | null
  label: string
}

export function dbRestrictionToRestriction(row: DbDietaryRestriction): DietaryRestriction {
  return { id: row.id, familyMemberId: row.family_member_id, label: row.label }
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/types/meal-planner.ts
git commit -m "feat(meals): add preparedBy + DietaryRestriction types"
```

---

## Task 4: Validator — prep slot, leftover threading, soft recipe_id drop

**Files:**
- Modify: `src/lib/mealPlanValidation.ts`
- Modify: `supabase/functions/_shared/mealPlanGenerate.ts` (mirror)
- Modify: `src/lib/__tests__/mealPlanValidation.test.ts`

The validator gains four behaviors:
1. `prep` is a canonical slot.
2. `leftover_from` is allowed and may be a placeholder string like `"prep_1"`; we don't validate that it resolves here — that happens in the generator.
3. `prepared_by_family_member_id` is allowed and validated against the roster (NULL ok).
4. When `recipe_id` doesn't match the shelf BUT `ad_hoc_title` is set, the entry is kept as ad-hoc instead of being dropped.

- [ ] **Step 1: Update `GeneratedEntry` shape (both files)**

```ts
export interface GeneratedEntry {
  day_of_week: number
  slot: 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'prep'
  family_member_id: string | null
  recipe_id: string | null
  ad_hoc_title: string | null
  prepared_by_family_member_id: string | null
  leftover_from: string | null
}
```

- [ ] **Step 2: Update `CANONICAL_SLOTS` (both files)**

```ts
const CANONICAL_SLOTS = new Set(['breakfast', 'lunch', 'snack', 'dinner', 'prep'])
```

- [ ] **Step 3: Replace `validateGeneratedEntries` body (both files)**

```ts
export function validateGeneratedEntries(
  entries: unknown[],
  roster: Set<string>,
  shelf: Set<string>,
): ValidationResult {
  const kept: GeneratedEntry[] = []
  const dropped: ValidationDrop[] = []

  for (const raw of entries) {
    const e = raw as Partial<GeneratedEntry> & { prepared_by_family_member_id?: string | null; leftover_from?: string | null }

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

    if (e.prepared_by_family_member_id != null && !roster.has(e.prepared_by_family_member_id)) {
      dropped.push({ entry: raw, reason: `prepared_by_family_member_id not in roster: ${e.prepared_by_family_member_id}` })
      continue
    }

    // Soft drop: recipe_id miss with an ad_hoc_title fallback becomes ad-hoc.
    let recipeId: string | null = e.recipe_id ?? null
    const hasAdHoc = e.ad_hoc_title != null && e.ad_hoc_title !== ''
    if (recipeId != null && !shelf.has(recipeId)) {
      if (hasAdHoc) {
        recipeId = null  // demote to ad-hoc
      } else {
        dropped.push({ entry: raw, reason: `recipe_id not in shelf: ${recipeId}` })
        continue
      }
    }

    const hasRecipe = recipeId != null
    if (hasRecipe === hasAdHoc) {
      dropped.push({ entry: raw, reason: 'exactly one of recipe_id or ad_hoc_title required' })
      continue
    }

    kept.push({
      day_of_week: e.day_of_week,
      slot: e.slot as GeneratedEntry['slot'],
      family_member_id: e.family_member_id ?? null,
      recipe_id: recipeId,
      ad_hoc_title: e.ad_hoc_title ?? null,
      prepared_by_family_member_id: e.prepared_by_family_member_id ?? null,
      leftover_from: typeof e.leftover_from === 'string' && e.leftover_from.length > 0 ? e.leftover_from : null,
    })
  }

  return { kept, dropped }
}
```

- [ ] **Step 4: Update `buildPromptContext` (both files)**

Add a `restrictions` field to `PromptContextInput` and render it as a section:

```ts
export interface PromptContextInput {
  weekStart: string
  mealPlanId: string
  members: Array<{ name: string; family_member_id: string; auth_user_id: string | null }>
  shelf:   Array<{ recipe_id: string; title: string; tags: string[]; prep_minutes: number | null; kid_acceptance: string | null; is_prep_friendly: boolean }>
  habits:  Array<{ owner_auth_user_id: string; name: string; slot: string; grams_hint: number | null }>
  restrictions: Array<{ scope: 'household' | 'person'; person_name: string | null; label: string }>
  brief:   string
}
```

In the rendering function, insert before `BRIEF:`:

```ts
const restrictions = input.restrictions.length === 0
  ? '  (none)'
  : input.restrictions.map(r =>
      r.scope === 'household'
        ? `  - household: ${JSON.stringify(r.label)}`
        : `  - ${r.person_name}: ${JSON.stringify(r.label)}`
    ).join('\n')

// ... in the joined output array:
'RESTRICTIONS:',
restrictions,
'',
```

- [ ] **Step 5: Add tests covering the new behaviors**

Add to `src/lib/__tests__/mealPlanValidation.test.ts`:

```ts
describe('validateGeneratedEntries — prep + leftover + soft drop', () => {
  const roster = new Set(['fm-iris', 'fm-scott'])
  const shelf = new Set(['rec-1'])

  it('accepts prep as a canonical slot', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 6, slot: 'prep', family_member_id: null, recipe_id: 'rec-1', ad_hoc_title: null }],
      roster, shelf,
    )
    expect(r.kept).toHaveLength(1)
    expect(r.kept[0].slot).toBe('prep')
  })

  it('preserves leftover_from string', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 1, slot: 'lunch', family_member_id: null, recipe_id: 'rec-1', ad_hoc_title: null, leftover_from: 'prep_1' }],
      roster, shelf,
    )
    expect(r.kept[0].leftover_from).toBe('prep_1')
  })

  it('demotes a hallucinated recipe_id to ad-hoc when title is present', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 1, slot: 'dinner', family_member_id: null, recipe_id: 'rec-fake', ad_hoc_title: 'Salmon something', leftover_from: null }],
      roster, shelf,
    )
    expect(r.dropped).toHaveLength(0)
    expect(r.kept[0].recipe_id).toBeNull()
    expect(r.kept[0].ad_hoc_title).toBe('Salmon something')
  })

  it('still drops recipe_id miss with no title', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 1, slot: 'dinner', family_member_id: null, recipe_id: 'rec-fake', ad_hoc_title: null, leftover_from: null }],
      roster, shelf,
    )
    expect(r.kept).toHaveLength(0)
    expect(r.dropped[0].reason).toMatch(/recipe_id not in shelf/)
  })

  it('rejects prepared_by not in roster', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 1, slot: 'dinner', family_member_id: null, recipe_id: 'rec-1', ad_hoc_title: null, prepared_by_family_member_id: 'fm-fake' }],
      roster, shelf,
    )
    expect(r.kept).toHaveLength(0)
    expect(r.dropped[0].reason).toMatch(/prepared_by_family_member_id not in roster/)
  })
})
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/lib/__tests__/mealPlanValidation.test.ts
```

Expected: all pass (existing + 5 new).

- [ ] **Step 7: Commit**

```bash
git add src/lib/mealPlanValidation.ts supabase/functions/_shared/mealPlanGenerate.ts src/lib/__tests__/mealPlanValidation.test.ts
git commit -m "feat(meals): validator accepts prep slot, leftover_from, soft recipe_id drop"
```

---

## Task 5: Edge function — restrictions + prep + leftover threading + cook

**Files:**
- Modify: `supabase/functions/meal-plan-generate/index.ts`

- [ ] **Step 1: Update `SYSTEM_PROMPT`**

Replace it with:

```ts
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
```

- [ ] **Step 2: Load restrictions**

Inside `Promise.all([...])` add a sixth fetch:

```ts
supabase.from('dietary_restrictions').select('family_member_id,label'),
```

Destructure as `{ data: restrictions, error: restErr }`. Add `restErr` to the error union check.

- [ ] **Step 3: Render restrictions in the prompt**

Replace the `buildPromptContext` call's args with:

```ts
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
```

- [ ] **Step 4: Resolve placeholder leftover_from after first insert**

The current single-call to `regenerate_meal_plan` writes everything at once. We need a two-pass approach:

```ts
// 1. Separate prep entries (with placeholder_ids) from the rest.
type AnyParsedEntry = GeneratedEntry & { placeholder_id?: string | null }
const prepEntries = (parsed.entries as AnyParsedEntry[])
  .filter(e => e.slot === 'prep')
const nonPrepEntries = (parsed.entries as AnyParsedEntry[])
  .filter(e => e.slot !== 'prep')

// Validate each side normally — placeholder_id is server-only metadata, not in the validated shape.
const { kept: prepKept, dropped: prepDropped } = validateGeneratedEntries(prepEntries, roster, shelf)
const { kept: restKept, dropped: restDropped } = validateGeneratedEntries(nonPrepEntries, roster, shelf)

const dropped = [...prepDropped, ...restDropped]
const validationNotes = dropped.map(d => d.reason)

if (prepKept.length + restKept.length === 0) {
  // ... existing summary error path, unchanged
}

// 2. Apply habits (unchanged) to restKept only (never to prep), then atomic delete + insert prep first.
//    The RPC currently does delete + insert in one shot — to thread leftovers we have to split:
//    Pass A inserts prep, returns ids; Pass B inserts everything else with leftover_from resolved.

// Build placeholder→index map paired with prepKept
const placeholderToIndex = new Map<string, number>()
prepEntries.forEach((e, idx) => {
  // Note: prepEntries (pre-validation) and prepKept may differ in length if any were dropped.
  // We re-walk prepKept to build the placeholder map only for kept entries.
})
const keptPlaceholders: string[] = []
{
  // Re-pair prepKept with their original placeholder_ids by structural matching.
  // Easier: validateGeneratedEntries strips fields it doesn't know. We instead read
  // placeholder_id from the raw parsed entries and align with the kept slots.
  let cursor = 0
  for (const raw of prepEntries) {
    if (cursor >= prepKept.length) break
    // We assume validate keeps order; align by walking until next match.
    const k = prepKept[cursor]
    if (raw.day_of_week === k.day_of_week && raw.slot === k.slot &&
        (raw.family_member_id ?? null) === k.family_member_id) {
      keptPlaceholders.push(typeof raw.placeholder_id === 'string' ? raw.placeholder_id : '')
      cursor++
    }
  }
  while (keptPlaceholders.length < prepKept.length) keptPlaceholders.push('')
}

// Snapshot prior + delete all entries first via existing RPC with [], then insert in two passes.
// To stay atomic, we'll change strategy: a single RPC call but pass the entries with a
// transient "placeholder_id" field, and resolve leftover_from server-side. That requires
// updating the RPC. SIMPLER alternative kept here: rely on RPC's existing delete-then-insert
// behavior with [] for the wipe, then INSERT prep, capture ids, then INSERT rest.

// Step A: clear via RPC with []
const { error: clearErr } = await supabase.rpc('regenerate_meal_plan', {
  p_meal_plan_id: plan.id, p_entries: [],
})
if (clearErr) return jsonError(500, `clear failed: ${clearErr.message}`)

// Step B: insert prep entries directly (RLS allows owner/household members to insert)
const prepRows = prepKept.map(e => ({
  meal_plan_id: plan.id,
  day_of_week: e.day_of_week,
  slot: e.slot,
  family_member_id: e.family_member_id,
  recipe_id: e.recipe_id,
  ad_hoc_title: e.ad_hoc_title,
  prepared_by_family_member_id: e.prepared_by_family_member_id,
}))
const { data: prepInserted, error: prepErr } = await supabase
  .from('meal_plan_entries').insert(prepRows).select('id')
if (prepErr) return jsonError(500, `prep insert failed: ${prepErr.message}`)
const prepInsertedIds = (prepInserted ?? []).map(r => r.id)

// Step C: build placeholder_id → real_id map
const placeholderToRealId = new Map<string, string>()
keptPlaceholders.forEach((ph, idx) => {
  if (ph) placeholderToRealId.set(ph, prepInsertedIds[idx])
})

// Step D: now apply habit injection on restKept (existing logic, unchanged conceptually)
//   ... copy existing habit-injection code, operating on restKept + occupiedKeys built from restKept.

// Step E: insert non-prep entries with resolved leftover_from
const restRows = [...restKept, ...habitInjected].map(e => ({
  meal_plan_id: plan.id,
  day_of_week: e.day_of_week,
  slot: e.slot,
  family_member_id: e.family_member_id,
  recipe_id: e.recipe_id,
  ad_hoc_title: e.ad_hoc_title,
  prepared_by_family_member_id: e.prepared_by_family_member_id ?? null,
  leftover_from: e.leftover_from ? (placeholderToRealId.get(e.leftover_from) ?? null) : null,
}))
const { data: restInserted, error: restErr } = await supabase
  .from('meal_plan_entries').insert(restRows).select('id')
if (restErr) return jsonError(500, `entries insert failed: ${restErr.message}`)
const restInsertedIds = (restInserted ?? []).map(r => r.id)

const insertedIds = [...prepInsertedIds, ...restInsertedIds]
```

(The rest of the function — undo token, brief mark-generated, response — uses `insertedIds` unchanged.)

**Note:** This trades the atomic single-RPC for three separate writes. The row lock in `regenerate_meal_plan` no longer protects us against concurrent generation. The `clearErr` step still acquires the lock (we still call the RPC), so a second concurrent caller will block on the clear — good enough for our two-person household. If we need stronger guarantees later, we can extend the RPC to accept placeholder threading itself.

- [ ] **Step 5: Deploy**

Use `mcp__supabase__deploy_edge_function` with name `meal-plan-generate`, both `index.ts` and `../_shared/mealPlanGenerate.ts`.

Expected: status ACTIVE, version increments.

- [ ] **Step 6: Manual smoke test against demo account**

Paste a brief that mentions batch cooking AND a cook ("Iris cooks weeknights, Scott does Sundays. Big pot of chili Sunday — eat through Wednesday lunch."). Verify response: prep entry on Sunday with `prepared_by_family_member_id` for Scott, Mon dinner / Tue lunch / Wed lunch with `leftover_from` resolved to the prep id, weeknight dinners assigned to Iris.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/meal-plan-generate/index.ts
git commit -m "feat(meals): generator handles prep + leftover threading + cook + restrictions"
```

---

## Task 6: useMealPlan — clearWeek + preparedBy roundtrip

**Files:**
- Modify: `src/hooks/useMealPlan.ts`
- Modify: `src/hooks/useMealPlan.test.ts`

- [ ] **Step 1: Add `clearWeek` to result interface**

```ts
interface UseMealPlanResult {
  plan: MealPlan | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  addMeal: (input: AddMealInput) => Promise<void>
  removeMeal: (entryId: string) => Promise<void>
  clearWeek: () => Promise<{ ok: boolean; tokenId?: string; error?: string }>
  setParameter: (parameter: MealParameter | undefined) => Promise<void>
}
```

- [ ] **Step 2: Implement `clearWeek`**

```ts
const clearWeek = useCallback(async () => {
  if (!plan) return { ok: false, error: 'no plan loaded' }
  // Snapshot for undo.
  const { data: prior } = await supabase
    .from('meal_plan_entries').select('*').eq('meal_plan_id', plan.dbId)
  // Wipe via existing RPC.
  const { error: rpcErr } = await supabase.rpc('regenerate_meal_plan', {
    p_meal_plan_id: plan.dbId, p_entries: [],
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  // Persist undo.
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const { data: tokenRow } = await supabase.from('ai_undo_tokens').insert({
    user_id: userId,
    description: `Cleared week of ${weekStartIso}`,
    inverse_actions: [
      { type: 'restore_meal_plan_entries', payload: { rows: prior ?? [] } },
    ],
    expires_at: expiresAt,
  }).select('id').single()
  await refresh()
  return { ok: true, tokenId: tokenRow?.id }
}, [plan, refresh, weekStartIso])
```

Add `clearWeek` to the returned object.

- [ ] **Step 3: Update `addMeal` and the entry mapper**

In `addMeal`, accept `preparedByFamilyMemberId?: string | null` on `AddMealInput` and include it in the insert payload as `prepared_by_family_member_id`.

In wherever `meal_plan_entries.select(...)` is called, ensure the column list includes `prepared_by_family_member_id` (or use `*`).

- [ ] **Step 4: Add tests**

Add to `useMealPlan.test.ts`:

```ts
it('clearWeek wipes entries and writes an undo token', async () => {
  // ... arrange a plan with 3 entries
  const { result } = renderHook(() => useMealPlan(weekStart))
  await waitFor(() => expect(result.current.plan?.entries).toHaveLength(3))
  const r = await act(async () => result.current.clearWeek())
  expect(r.ok).toBe(true)
  expect(r.tokenId).toBeTruthy()
  await waitFor(() => expect(result.current.plan?.entries).toHaveLength(0))
  // verify ai_undo_tokens has a row with restore_meal_plan_entries action
})

it('addMeal round-trips preparedBy', async () => {
  // ... insert with preparedByFamilyMemberId set, refresh, expect entry.preparedBy to match
})
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/hooks/useMealPlan.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useMealPlan.ts src/hooks/useMealPlan.test.ts
git commit -m "feat(meals): useMealPlan.clearWeek + preparedBy roundtrip"
```

---

## Task 7: PlannerPage — delete Ingredient Threads, add Clear Week

**Files:**
- Modify: `src/components/meals/plan/PlannerPage.tsx`
- Create: `src/components/meals/plan/ClearWeekButton.tsx`

- [ ] **Step 1: Create `ClearWeekButton.tsx`**

```tsx
import { useState } from 'react'

interface Props {
  entryCount: number
  weekLabel: string
  onConfirm: () => Promise<void>
}

export function ClearWeekButton({ entryCount, weekLabel, onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (entryCount === 0) return null

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-[12px] uppercase tracking-[0.18em] text-neutral-400 hover:text-accent-500 transition-colors"
      >
        Clear week
      </button>
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog">
          <div className="bg-bg-elevated rounded-2xl shadow-elevated max-w-sm w-full p-6">
            <h2 className="font-display text-2xl text-neutral-800 mb-2">Clear the week?</h2>
            <p className="text-[14px] text-neutral-600 mb-5">
              This will remove all {entryCount} meal entries for the week of {weekLabel}. You'll have 30 minutes to undo.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-[13px] text-neutral-500 hover:text-neutral-800"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try { await onConfirm() } finally { setBusy(false); setConfirming(false) }
                }}
                className="px-4 py-2 text-[13px] rounded-lg bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50"
              >
                {busy ? 'Clearing…' : 'Clear week'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Wire it in PlannerPage**

Near the existing "Generate plan" button area, add:

```tsx
<ClearWeekButton
  entryCount={plan?.entries.length ?? 0}
  weekLabel={weekLabel}
  onConfirm={async () => {
    const r = await clearWeek()
    if (r.ok && r.tokenId) showUndoToast({ tokenId: r.tokenId, label: 'Week cleared' })
  }}
/>
```

(Use whatever undo-toast API the page already uses — match the pattern from generate.)

- [ ] **Step 3: Delete Ingredient Threads**

Remove the `ingredientThreads` `useMemo` block (lines ~126–165) and the `<CollapseSection title="Ingredient threads">` block (lines ~480–495).

- [ ] **Step 4: Build + smoke test**

```bash
npm run build
```

Expected: clean build, no unused-import warnings (clean up any imports left dangling from the deletion).

- [ ] **Step 5: Commit**

```bash
git add src/components/meals/plan/PlannerPage.tsx src/components/meals/plan/ClearWeekButton.tsx
git commit -m "feat(meals): clear-week button; remove unused Ingredient Threads section"
```

---

## Task 8: CookChip — assignment UI on every meal entry

**Files:**
- Create: `src/components/meals/plan/CookChip.tsx`
- Modify: `src/components/meals/plan/SlotSection.tsx` (or `MealCard.tsx` — whichever renders the per-entry row)

- [ ] **Step 1: Create `CookChip.tsx`**

```tsx
import { useState } from 'react'
import type { FamilyMember } from '@/types/family-member'

interface Props {
  preparedBy: string | null
  members: FamilyMember[]
  onAssign: (familyMemberId: string | null) => void
  size?: 'sm' | 'md'
}

export function CookChip({ preparedBy, members, onAssign, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false)
  const cook = preparedBy ? members.find(m => m.id === preparedBy) : null

  const initial = cook ? cook.name.charAt(0).toUpperCase() : '?'
  const dim = !cook
  const px = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-[11px]'

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        title={cook ? `Cook: ${cook.name}` : 'Assign a cook'}
        className={`${px} rounded-full flex items-center justify-center font-medium ${dim ? 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200' : 'bg-primary-100 text-primary-700 hover:bg-primary-200'} transition-colors`}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-neutral-200 bg-bg-elevated shadow-elevated overflow-hidden">
          <button
            onClick={() => { onAssign(null); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-[13px] text-neutral-500 hover:bg-neutral-50"
          >
            Unassigned
          </button>
          {members.map(m => (
            <button
              key={m.id}
              onClick={() => { onAssign(m.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-[13px] hover:bg-primary-50 ${m.id === preparedBy ? 'bg-primary-50 text-primary-700' : 'text-neutral-700'}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into SlotSection per-entry row**

Find where each entry is rendered. Add to the right of the title:

```tsx
<CookChip
  preparedBy={entry.preparedBy ?? null}
  members={familyMembers}
  onAssign={(id) => onUpdateEntry(entry.id, { preparedBy: id })}
/>
```

If `onUpdateEntry` doesn't exist, add a thin update method to `useMealPlan` that updates a single entry's `prepared_by_family_member_id`.

- [ ] **Step 3: Build + manual check**

```bash
npm run build
```

Open the planner; confirm a chip is visible on every meal entry; assigning + reloading persists.

- [ ] **Step 4: Commit**

```bash
git add src/components/meals/plan/CookChip.tsx src/components/meals/plan/SlotSection.tsx src/hooks/useMealPlan.ts
git commit -m "feat(meals): CookChip on every meal entry — preparer assignment"
```

---

## Task 9: Restrictions hook + UI on Habits page

**Files:**
- Create: `src/hooks/useDietaryRestrictions.ts`
- Create: `src/components/meals/habits/RestrictionsSection.tsx`
- Modify: `src/components/meals/habits/StandingHabitsPage.tsx`

- [ ] **Step 1: Create `useDietaryRestrictions.ts`**

```ts
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbRestrictionToRestriction, type DbDietaryRestriction, type DietaryRestriction } from '@/types/meal-planner'

export function useDietaryRestrictions() {
  const [items, setItems] = useState<DietaryRestriction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.from('dietary_restrictions').select('*').order('created_at', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setItems((data as DbDietaryRestriction[]).map(dbRestrictionToRestriction))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const add = useCallback(async (familyMemberId: string | null, label: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('dietary_restrictions').insert({ user_id: user.id, family_member_id: familyMemberId, label: label.trim() })
    refresh()
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    await supabase.from('dietary_restrictions').delete().eq('id', id)
    refresh()
  }, [refresh])

  return { items, loading, error, add, remove }
}
```

- [ ] **Step 2: Create `RestrictionsSection.tsx`**

```tsx
import { useState } from 'react'
import { useDietaryRestrictions } from '@/hooks/useDietaryRestrictions'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

export function RestrictionsSection() {
  const { items, add, remove, loading } = useDietaryRestrictions()
  const { members } = useFamilyMembers()
  const [draftLabel, setDraftLabel] = useState('')
  const [draftWho, setDraftWho] = useState<string | null>(null)  // null = household

  return (
    <section className="mt-12">
      <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-2">
        RESTRICTIONS
      </div>
      <h2 className="font-display text-[2rem] leading-[1.1] text-neutral-800 mb-4">
        What we <span className="italic text-primary-500">never</span> eat.
      </h2>
      <p className="font-display italic text-neutral-500 mb-5">
        Hard rules the meal planner respects. Per person, or for the whole household.
      </p>
      {loading ? (
        <p className="text-[13px] text-neutral-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] italic text-neutral-400 mb-4">No restrictions set.</p>
      ) : (
        <ul className="space-y-2 mb-5">
          {items.map(r => {
            const who = r.familyMemberId ? (members.find(m => m.id === r.familyMemberId)?.name ?? 'someone') : 'Household'
            return (
              <li key={r.id} className="flex items-center justify-between text-[14px]">
                <div>
                  <span className="font-medium text-neutral-700">{who}:</span>{' '}
                  <span className="text-neutral-800">{r.label}</span>
                </div>
                <button
                  onClick={() => remove(r.id)}
                  className="text-neutral-400 hover:text-accent-500 text-[16px]"
                  aria-label="Remove"
                >×</button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <select
          value={draftWho ?? ''}
          onChange={e => setDraftWho(e.target.value || null)}
          className="px-3 py-2 rounded-lg border border-neutral-200 bg-bg-base text-[13px]"
        >
          <option value="">Household</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input
          type="text"
          value={draftLabel}
          onChange={e => setDraftLabel(e.target.value)}
          placeholder="e.g. no shellfish, no added sugar"
          className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 bg-bg-base text-[14px]"
        />
        <button
          disabled={!draftLabel.trim()}
          onClick={async () => {
            await add(draftWho, draftLabel)
            setDraftLabel('')
          }}
          className="px-4 py-2 rounded-lg bg-primary-500 text-white text-[13px] font-medium hover:bg-primary-600 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Mount on StandingHabitsPage**

Just before the closing wrapper of `StandingHabitsPage`, add:

```tsx
<RestrictionsSection />
```

- [ ] **Step 4: Build + smoke test**

```bash
npm run build
```

Open `/meals/habits`, add a household restriction ("no shellfish") and a per-person one ("Liam: no nuts"). Generate a plan; verify the brief context block in edge-function logs includes a `RESTRICTIONS:` block.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDietaryRestrictions.ts src/components/meals/habits/RestrictionsSection.tsx src/components/meals/habits/StandingHabitsPage.tsx
git commit -m "feat(meals): dietary restrictions UI on Habits page"
```

---

## Task 10: Today timeline filtering by current user

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Filter mealEvents by family_member_id**

In the `mealEvents` useMemo (around line 298), filter the entries before grouping:

```ts
// Find current user's family_member_id, if they have one in the household.
const currentMemberId = familyMembers.find(m => m.auth_user_id === currentUserId)?.id ?? null

for (const e of mealPlanForEvents.entries) {
  if (e.dayOfWeek !== dow) continue
  if (!SLOT_TIMES[e.slot]) continue
  // Show entries that are family-shared (NULL) or for the current user.
  // Kids' entries always pass too — anyone in the household sees them.
  if (e.familyMemberId != null) {
    const target = familyMembers.find(m => m.id === e.familyMemberId)
    const isCurrent = e.familyMemberId === currentMemberId
    const isKid = target && !target.auth_user_id  // kids have no auth row
    if (!isCurrent && !isKid) continue
  }
  // ... rest of the loop body
}
```

(Adjust the variable names — `familyMembers`, `currentUserId` — to match what App.tsx already exposes.)

- [ ] **Step 2: Manual verification**

Log in as Iris; verify Today shows breakfast/lunch/dinner that are hers or family-shared, and kids' entries, but NOT Scott-only entries.

(If a second account isn't available, mock by temporarily flipping `currentMemberId` in dev tools.)

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(meals): Today timeline filters meal entries by current user"
```

---

## Task 11: End-to-end verification + summary

- [ ] **Step 1: Run full validation**

```bash
npx tsc --noEmit
npm run build
npx vitest run src/hooks/useMealPlan.test.ts src/lib/__tests__/mealPlanValidation.test.ts
```

All exit 0. All tests pass.

- [ ] **Step 2: End-to-end manual run**

In the demo account:

1. Add 2 household restrictions on `/meals/habits` ("no shellfish", "Liam: no nuts").
2. On `/meals/brief`, paste a brief that names a cook and implies prep:
   > "Iris cooks weeknights, Scott cooks Sundays. Big batch of chili Sunday — eat through Wednesday lunch. 800g protein challenge for Iris and Scott. No fish this week — kids are over it."
3. Click Generate plan. Verify the toast either succeeds OR shows a real edge-function error message.
4. Open `/meals/plan`. Confirm:
   - A Sunday prep entry exists (chili) with Scott assigned.
   - Mon dinner / Tue lunch / Wed lunch reference the prep ("from Sunday batch") via leftover_from.
   - Weeknight dinners are assigned to Iris (cook chip shows "I").
   - No shellfish anywhere.
5. Open `/today` (Sunday view). Confirm Sunday Prep appears in the timeline at 16:00.
6. Click "Clear week" on the planner. Confirm dialog. Verify undo toast appears, and if undone, all entries reappear.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test(meals): end-to-end verification of prep + cook + restrictions + clear" --allow-empty
```

(Empty commit is fine — it's a marker for completing the verification step.)

---

## Verification

- `npx tsc --noEmit` exits 0
- `npm run build` succeeds
- `npx vitest run` all relevant tests pass
- Manual two-step demo above completes
- No advisor warnings on the new migrations
