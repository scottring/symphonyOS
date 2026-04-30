# Design: AI brief → meal plan generation

**Date:** 2026-04-29
**Status:** Approved (sections 1–4 walked through with the user)

## Context

Symphony's meal planner ships with 10 surfaces but the killer flow — turn a free-form Sunday-morning brief into a drafted week — is a stub. The "Generate plan" button on `BriefComposerPage` currently just sets `weekly_briefs.status='generated'` and navigates away.

The planner's actual workflow is: write a brief like *"800g challenge · No stir fry this week · Bittman shrimp — finally!"* → AI drafts breakfast/lunch/snack/dinner across 7 days, drawn from the household's shared recipe shelf, honoring each user's standing habits → planner reviews on the plan page, edits inline if anything is off, optionally regenerates or undoes.

This spec defines that flow end to end.

## Scope

**In scope:**
- A new edge function `meal-plan-generate` that takes the current week's brief, recipes, habits, and household roster, calls Claude Haiku 4.5, and writes a fresh set of `meal_plan_entries` for that week.
- A new edge function `meal-plan-undo` that reverses the most recent generation atomically.
- Hook `useGeneratePlan()` and a small UX update to `BriefComposerPage` and the planner page (toast).
- Validation, error handling, and an undo escape valve good for 30 minutes.

**Out of scope (named so they're not built by accident):**
- Streaming generation.
- Multi-week look-ahead.
- Auto-rerun on brief edit.
- Per-member opt-out from a given week.
- Recipe creation from brief mentions (we use ad-hoc entries instead).

## Decisions (made during brainstorming)

1. **Direct write with undo.** Generation inserts entries straight into `meal_plan_entries`. A 30-minute undo token reverts atomically.
2. **Ad-hoc entries for unmatched mentions.** When the brief names food (e.g., "Bittman shrimp") that doesn't match any shelf recipe, the entry gets `ad_hoc_title` set, no `recipe_id`. The shelf is not auto-extended.
3. **Habits-driven per-person variants.** Each standing habit has a `user_id` (the owner). Habits applied to the plan get `family_member_id` set to the owner's family-member row (where `family_members.auth_user_id = habit.user_id`). Brief-named meals stay family-default unless the brief explicitly addresses a person.
4. **Overwrite on regenerate.** Re-running generation deletes the week's entries and re-inserts. Prior state is captured in the undo token.
5. **Edge function, not client-side.** Mirrors the existing `symphony-chat` shape; keeps the API key server-side.
6. **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`). Matches existing chat function. Upgrade to Sonnet only if quality is bad.
7. **No streaming.** A spinner with friendly copy ("Drafting your week…") is calm; streaming token jitter is not.

## Architecture

```
Browser (BriefComposerPage)
  ↓ supabase.functions.invoke('meal-plan-generate', { weekStart })
Edge function (Deno)
  ↓ load: brief, recipes (household-visible via RLS), standing_habits (household), family_members (household)
  ↓ POST https://api.anthropic.com/v1/messages   (claude-haiku-4-5-20251001)
  ↓ JSON.parse + schema-validate
  ↓ snapshot existing entries → ai_undo_tokens (inverse_actions)
  ↓ rpc('regenerate_meal_plan', { meal_plan_id, entries })  ← new SECURITY DEFINER pg fn, atomic
  ↓ update weekly_briefs.status='generated', generated_at=now()
  ↓ return { insertedCount, undoToken: { id, expiresAt }, notes }
Browser
  ↓ navigate('/meals/plan')
  ↓ toast "Plan drafted. ↶ Undo" (30s)
```

## Prompt design

**System prompt** (~300 tokens, static):

> You draft a one-week meal plan for a household based on a planner's free-form brief. Output strict JSON matching the schema. Every recipe you reference must come from the supplied shelf — never invent a recipe_id. Foods named in the brief that aren't on the shelf become ad_hoc entries (no recipe_id, just a title). Apply each standing habit to the right person each day, unless the brief explicitly overrides it.

**Context block** (dynamic, ~500–2000 tokens):

```
WEEK: 2026-04-27 (Mon-Sun)
MEAL_PLAN_ID: <uuid>

HOUSEHOLD MEMBERS:
- {name, family_member_id, auth_user_id}  (one row per family_members row)

SHELF (household, N recipes):
- {recipe_id, title, tags, prep_minutes, kid_acceptance, is_prep_friendly}

STANDING HABITS:
- {owner_auth_user_id, name, slot, grams_hint}

BRIEF:
"<verbatim brief body>"
```

**Output schema** (assistant prefill `{\n  "entries":` forces the model to continue valid JSON):

```json
{
  "entries": [
    {
      "day_of_week": 0,
      "slot": "breakfast",
      "family_member_id": "<uuid or null>",
      "recipe_id": "<uuid or null>",
      "ad_hoc_title": "<string or null>"
    }
  ],
  "notes_for_planner": "<one short paragraph>"
}
```

Token budget: ~3–5k in, ~2k out. Cost ~$0.005–0.015 per generation on Haiku 4.5.

## Validation + write

After Haiku responds, the edge function:

1. **Parse + schema-validate.** If parse fails, retry once with an "ERROR: previous response wasn't valid JSON" appended. For each entry, validate:
   - `day_of_week ∈ [0,6]`
   - `slot ∈ {breakfast, lunch, snack, dinner}`
   - `family_member_id` is null or a member of the supplied roster
   - `recipe_id` is null or a member of the supplied shelf
   - exactly one of `recipe_id` / `ad_hoc_title` is set
   - Drop invalid entries; collect drop reasons in a `validation_notes` array (code-side, distinct from `notes_for_planner` which the model generates). Don't fail the whole generation.

2. **Snapshot prior entries** for the undo token. `select * from meal_plan_entries where meal_plan_id = $1` — keep the rows in memory.

3. **Atomic delete + insert** via new `rpc('regenerate_meal_plan', { meal_plan_id, entries })`. The RPC returns the inserted ids. (See SQL below.)

4. **Persist undo token** (now that we have the inserted ids):
   ```
   description: "Drafted week of <date> from your brief"
   inverse_actions: [
     { type: "delete_meal_plan_entries_by_ids", payload: { ids: <inserted_ids> } },
     { type: "restore_meal_plan_entries",       payload: { rows: <prior snapshot> } }
   ]
   expires_at: now() + 30 minutes
   ```

5. **Mark brief generated.** `update weekly_briefs set status='generated', generated_at=now() where id=$1`.

6. **Return** `{ insertedCount, undoToken: { id, expiresAt }, notesForPlanner, validationNotes }`. The browser combines `notesForPlanner` (model-authored) and `validationNotes` (code-authored) for display. If `validationNotes.length / total > 0.5`, the toast is prefixed with a warning.

### `regenerate_meal_plan` RPC

```sql
create function regenerate_meal_plan(p_meal_plan_id uuid, p_entries jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  inserted_ids uuid[];
begin
  if not exists (
    select 1 from meal_plans p
    where p.id = p_meal_plan_id
      and (p.user_id = auth.uid() or users_share_household(auth.uid(), p.user_id))
  ) then
    raise exception 'unauthorized';
  end if;

  delete from meal_plan_entries where meal_plan_id = p_meal_plan_id;

  with inserted as (
    insert into meal_plan_entries (meal_plan_id, day_of_week, slot, family_member_id, recipe_id, ad_hoc_title)
    select p_meal_plan_id,
           (e->>'day_of_week')::smallint,
           e->>'slot',
           nullif(e->>'family_member_id', '')::uuid,
           nullif(e->>'recipe_id', '')::uuid,
           nullif(e->>'ad_hoc_title', '')
    from jsonb_array_elements(p_entries) e
    returning id
  )
  select array_agg(id) into inserted_ids from inserted;

  return jsonb_build_object('inserted_ids', inserted_ids);
end;
$$;
```

### Undo flow

`meal-plan-undo` edge function reads `ai_undo_tokens.id`, runs the inverse actions in order (delete the just-inserted ids, then restore the snapshotted rows), marks the token `used_at = now()`. Idempotent: a second undo call sees `used_at` set and returns the same shape with `noop: true`.

The existing `InverseActionType` enum in `src/types/meal-planner.ts` has only singular variants (`delete_meal_plan_entry`, `restore_meal_plan_entry`). For this feature, either:
- (a) extend the union to add `delete_meal_plan_entries_by_ids` + `restore_meal_plan_entries` batch variants, OR
- (b) emit one inverse-action per row.
Implementer's choice during writing-plans; (a) is fewer rows and cleaner, (b) reuses existing handlers if any exist.

## UX flow

On `/meals/brief`:

1. Planner types brief, taps **"✦ Generate plan"**.
2. Button morphs to spinner with copy: *"Drafting your week…"* (italic `font-display`, `text-primary-500`). Page stays put — no navigation yet.
3. Edge function runs (5-15s typical).
4. On success → `navigate('/meals/plan')` + toast bottom-right: *"Plan drafted from your brief. ↶ Undo"* — 30s auto-dismiss, manually dismissible.
5. On error → toast on the brief page, button returns to idle. Brief text is preserved.

Error copy:
- Empty brief → "Write something in the brief first." (no AI call)
- Empty shelf → proceed; result is all ad-hoc entries, surfaced in the toast.
- AI returned 0 entries → "Couldn't draft a week from this brief — try adding more detail." (no overwrite)
- Network/timeout (>30s) → "Generation took too long — try again." (no overwrite)
- Validation dropped >50% of entries → write surviving entries, prepend a warning to the toast.

## Component changes

| File | Change |
|---|---|
| `src/components/meals/brief/BriefComposerPage.tsx` | Replace stub `markGenerated()` with `generatePlan()` from new hook. Add error toast. |
| `src/hooks/useGeneratePlan.ts` | New. Wraps `supabase.functions.invoke('meal-plan-generate')`, returns `{ generate, undo, generating, error, lastUndoToken }`. |
| `src/components/meals/plan/PlannerPage.tsx` | Add a top-of-page undo toast slot when `lastUndoToken` is present and not yet expired. |
| `supabase/functions/meal-plan-generate/index.ts` | New. Mirror `symphony-chat`'s shape. |
| `supabase/functions/meal-plan-undo/index.ts` | New. Reads token, runs inverse actions. |
| `supabase/migrations/080_meal_plan_generate_rpc.sql` | New. `regenerate_meal_plan` SECURITY DEFINER function. |

## Testing strategy

**Hooks (TDD):**
- `useGeneratePlan.test.ts` — mock `supabase.functions.invoke`. Assert: empty brief refuses without invoking; success path calls `refresh()` on the plan; error path surfaces in `error`; undo path invokes `meal-plan-undo`.

**Edge function:**
- Vitest test mocking `fetch` to Anthropic. Assert: prompt contains brief + shelf + habits + roster; JSON parse failure triggers retry; validator drops malformed entries.

**Integration / manual:**
- Two-account walkthrough on dev Supabase: account A writes brief + generates, sees plan; account B in same household reloads `/meals/plan`, sees the same plan; A regenerates → B sees update after refresh; A undoes → both see prior state restored.

**Components:** no unit tests; eyes-on via `npm run dev`.

## Verification

- `npx tsc --noEmit` exits 0
- `npx vitest run src/hooks/useGeneratePlan.test.ts` passes
- Manual end-to-end: type brief → spinner → plan page populated → undo restores prior state → all four meal slots present per day with at least one habit row carrying `family_member_id`
- SQL spot-check via Supabase MCP: `select count(*), count(distinct family_member_id) from meal_plan_entries where meal_plan_id = '<id>'` shows expected counts after generation

## Files referenced

Reused (read-only here, will be touched by implementation):
- `supabase/functions/symphony-chat/index.ts` — Anthropic fetch pattern
- `supabase/migrations/075_meal_planner.sql` — `ai_undo_tokens` table shape
- `src/types/meal-planner.ts` — `MealPlanEntry`, `WeeklyBrief`, `StandingHabit` types
- `src/hooks/useMealPlan.ts` — `addMeal`, `removeMeal` patterns; will need a `refresh()` after generate
- `src/hooks/useWeeklyBrief.ts` — `markGenerated` will be replaced by the new hook
- `src/components/meals/brief/BriefComposerPage.tsx` — current stub generate flow
- Existing `users_share_household()` SQL function (migration 027)

New:
- `supabase/migrations/080_meal_plan_generate_rpc.sql`
- `supabase/functions/meal-plan-generate/index.ts`
- `supabase/functions/meal-plan-undo/index.ts`
- `src/hooks/useGeneratePlan.ts`
- `src/hooks/useGeneratePlan.test.ts`
