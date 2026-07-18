# Meal Planner Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tear down the unused meal subsystem to three core tables + surviving surfaces, then rebuild a chat-first weekly planner (chat rail + live grid, leftovers first-class, grocery build with skip-staples).

**Architecture:** Phase 1 deletes dead surfaces/hooks/edge-fns/tables while keeping recipes, cook-mode, wall dinner display, groceries-v2, and MCP tools working on `recipes`/`meal_plans`/`meal_plan_entries`. Phase 2 adds a `meal-planner-chat` edge function (Claude tool-calling loop, direct DB writes, SSE) and a new Plan page (7×3 grid + chat rail; realtime updates).

**Tech Stack:** React 19 + TS strict, Vite, Tailwind v4 (Nordic Journal), Supabase (RLS, realtime, Deno edge fns), Anthropic Messages API (direct fetch), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-meal-planner-rebuild-design.md`

## Global Constraints

- Work ONLY in worktree `.worktrees/meal-planner-rebuild` (branch `meal-planner-rebuild`). Never touch the main worktree.
- Run tests with `npx vitest run <path>` (plain `npm test` is watch mode). Full gate: `npm run build && npm run lint && npx vitest run`.
- No emojis in UI — lucide-react icons only.
- Chat model: `claude-sonnet-4-6` (same as symphony-agent; API-billed — do not downgrade).
- Edge fns: Anthropic via direct `fetch`, `anthropic-version: 2023-06-01`, `x-api-key` from `ANTHROPIC_API_KEY`. DB access via anon client scoped with the user's JWT (RLS is the fence); service-role client ONLY to verify the JWT. Mirror `supabase/functions/symphony-agent/index.ts`.
- DDL is applied via Supabase MCP `apply_migration` (or Management API `POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query`; token in keychain, disk token stale). Also save each migration as a dated file in `supabase/migrations/` (e.g. `2026-07-18_meal_teardown.sql`) as the source-of-record copy.
- Edge fn deploy: `npx supabase functions deploy <name> --project-ref mwadppyrqzuzgstmwpuy --use-api`.
- `/wall` (v1, `WallCalendar`) and `/wall-v2` are BOTH live routes. Do not break either. Deviation from spec: `WallDinnerWidget.tsx`, `WallRecipeViewer.tsx`, `DinnerFlowView.tsx` STAY (live consumers); only dead wall-v1 meal files are deleted.
- Commit after every task. Do NOT push to main until the final task of each phase (push auto-deploys prod).

---

# Phase 1 — Teardown

### Task 1: Realtime publication + rewire `useMealPlan` off GeneratePlanContext

**Files:**
- Migration: `supabase/migrations/2026-07-18_meal_realtime_publication.sql` (apply via MCP/Management API)
- Modify: `src/hooks/useMealPlan.ts`
- Modify: `src/hooks/useMealPlan.test.ts`

**Interfaces:**
- Produces: `useMealPlan(weekStart: Date)` returning `{ plan, loading, error, refresh, addMeal, removeMeal }` — `setParameter`, `updateMealPreparer`, `clearWeek` removed. `AddMealInput` keeps `{ dayOfWeek, slot, recipeId?, adHocTitle?, notes?, leftoverFromId? }` (drop `familyMemberId`, `preparedByFamilyMemberId`). Self-refreshes via realtime on `meal_plan_entries` — later tasks (chat, wall) rely on this instead of the refresh signal.

- [ ] **Step 1: Apply the publication migration**

```sql
-- 2026-07-18_meal_realtime_publication.sql
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'meal_plan_entries') then
    alter publication supabase_realtime add table meal_plan_entries;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'meal_plans') then
    alter publication supabase_realtime add table meal_plans;
  end if;
end $$;
```

Verify: `select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename like 'meal%';` returns both rows.

- [ ] **Step 2: Rewire `useMealPlan`**

In `src/hooks/useMealPlan.ts`:
1. Remove the `useGeneratePlanContext` import, `refreshSignal` effect dep, and every `bumpRefreshSignal()` call.
2. Remove `setParameter`, `updateMealPreparer`, `clearWeek` (and the `ai_undo_tokens` insert + `regenerate_meal_plan` RPC call inside it) from the hook and its result type.
3. Drop `familyMemberId`/`preparedByFamilyMemberId` from `AddMealInput` and from the insert row in `addMeal`.
4. Add a per-instance realtime subscription (canonical pattern from `src/hooks/useInstancesRealtime.ts`):

```ts
let mealPlanChannelSeq = 0

// inside useMealPlan, after the load effect; refreshRef avoids resubscribes
const refreshRef = useRef(refresh)
refreshRef.current = refresh
useEffect(() => {
  if (!user) return
  const channel = supabase
    .channel(`meal-plan-changes-${++mealPlanChannelSeq}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'meal_plan_entries' },
      () => { void refreshRef.current() })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [user])
```

- [ ] **Step 3: Fix compile fallout from removed hook members**

`grep -rn "setParameter\|updateMealPreparer\|clearWeek" src/` — expected consumers: `src/components/meals/plan/*` (MealPlanPage, ClearWeekButton, ParameterDropdown, preparer UI). Those files are deleted in Tasks 5–6; if the build breaks before then, stub the call sites out in place (delete the JSX that used them) — do not keep dead members in the hook.

- [ ] **Step 4: Update `useMealPlan.test.ts`**

Delete the `clearWeek`/`ai_undo_tokens` test cases (lines ~97–168 test the undo-token flow). Keep fetch/create + addMeal/removeMeal cases. Run: `npx vitest run src/hooks/useMealPlan.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "refactor(meals): useMealPlan on realtime, drop undo/parameter/preparer"`

---

### Task 2: Strip meal machinery from onboarding v2

**Files:**
- Modify: `src/components/onboarding/v2/NowWhatScreen.tsx` (inserts into `standing_habits` at lines ~23,61,75; uses `useStandingHabits`, `useMealPlan`)
- Modify: `src/components/onboarding/v2/BriefScreen.tsx` (uses `useGeneratePlan`)
- Inspect: `src/contexts/OnboardingContext.tsx` (flow step list; `standing_habits` comment at line 159), `src/components/onboarding/v2/SamplePlanPage.tsx` + `sample/whitmanFixture.ts`

**Interfaces:**
- Produces: onboarding v2 compiles and runs with no reference to `standing_habits`, `useGeneratePlan`, `weekly_briefs`, or meal-plan generation.

- [ ] **Step 1: Map the flow.** Read `OnboardingContext.tsx` to find the ordered screen list and where `BriefScreen`/`NowWhatScreen`/`SamplePlanPage` appear. Decide per screen: if the screen is meal-only, remove it from the flow and delete the file; if mixed, remove only the meal sections.
- [ ] **Step 2: Remove the `standing_habits` insert and `useStandingHabits`/`useMealPlan`/`useGeneratePlan` usage** from the surviving screens. The sample-plan fixture may stay if it's display-only (no DB writes, no deleted hooks) — verify with grep before deciding.
- [ ] **Step 3: Verify** — `grep -rn "standing_habits\|useGeneratePlan\|useStandingHabits" src/components/onboarding/ src/contexts/OnboardingContext.tsx` → only comments at most (delete stale comments too). `npm run build` → clean. Run any onboarding tests: `npx vitest run src/components/onboarding` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(onboarding): remove meal habits/brief/generate steps"`

---

### Task 3: Delete meal suggestion cards from assistant chat + `askSymphonyMeal`

**Files:**
- Delete: `src/components/chat/MealRequestCards.tsx`, `src/components/chat/MealRequestCards.test.tsx`, `src/lib/askSymphonyMeal.ts`, `src/lib/askSymphonyMeal.test.ts`, `src/hooks/useAskSymphony.ts`, `src/hooks/useApplyMealSuggestion.ts`, `src/hooks/useApplyMealSuggestion.test.ts`, `src/lib/parseMealRequest.ts`, `src/lib/parseMealRequest.test.ts` (verify `parseMealRequest` has no non-chat consumers first: `grep -rn "parseMealRequest" src/`)
- Modify: whichever chat pane renders `<MealRequestCards>` (find via `grep -rn "MealRequestCards" src/`) — remove the render + any meal-detection branch feeding it (check `src/lib/actionDetection.ts` for meal routing; remove only the meal branch, keep the rest).

- [ ] **Step 1: Find and remove all render/imports of MealRequestCards**, then delete the files listed above.
- [ ] **Step 2: Verify** — `grep -rn "askSymphonyMeal\|MealRequestCards\|useApplyMealSuggestion\|useAskSymphony\b" src/` → no hits. `npm run build` → clean. `npx vitest run src/components/chat src/lib` → PASS.
- [ ] **Step 3: Commit** — `git commit -m "refactor(chat): remove meal suggestion cards and ask-symphony-meal client"`

---

### Task 4: Remove meal/grocery integration from week view + detail panels

**Files:**
- Modify: `src/components/home/week/WeekViewV2.tsx` (uses `useGroceryStatus` + `useMealPlan`) and `src/components/home/week/WeekSummaryRow.tsx` (+ its test) — remove the grocery/meal summary row and those hook usages. `useGroceryStatus` itself SURVIVES (groceries-v2 backbone).
- Modify: `src/components/detail/MealEventSection.tsx` — remove `useMealTracking` usage (tracking UI: eaten-state, grams); keep the meal display (title/recipe/link) which reads via `useMealPlan`.
- Keep untouched: `src/components/surface/TapMealPanel.tsx`, `src/shell/providers/MealEventsProvider.tsx`, `src/components/schedule/EveningMealCard.tsx` (all read only `meal_plan_entries`/`recipes`).

- [ ] **Step 1: Edit the two week-view files** — delete the grocery row JSX and `useGroceryStatus`/`useMealPlan` imports; update `WeekSummaryRow.test.tsx` (or delete it if the component becomes meal-free trivially — prefer trimming the test to remaining behavior).
- [ ] **Step 2: Edit `MealEventSection.tsx`** — delete `useMealTracking` import and the tracking JSX.
- [ ] **Step 3: Verify** — `grep -rn "useMealTracking" src/ --include=*.tsx --include=*.ts | grep -v hooks/useMealTracking` → no hits. `npx vitest run src/components/home src/components/detail` → PASS. Commit — `git commit -m "refactor(week,detail): drop meal tracking + grocery summary integrations"`

---

### Task 5: Delete dead meal surfaces (pages, subtrees, routes, tabs, nav)

**Files:**
- Delete directories: `src/components/meals/today/`, `habits/`, `grams/`, `tonight/`, `day-detail/`, `groceries/` (v1 — groceries-v2 stays), `chat/` (AskSymphonyRail etc.)
- Delete from `src/components/meals/plan/`: `InlineBriefComposer.tsx`, `UndoToast.tsx`, `MealActionMenu.tsx`, `ParameterDropdown.tsx`, `PlanDocSections.tsx`, `DistributeLeftoversModal.tsx`, `ClearWeekButton.tsx`
- Delete from `src/components/meals/shelf/`: `RecipeDiscoverDialog.tsx`
- Modify: `src/apps/meals/MealsApp.tsx`, `src/components/meals/MealsTabs.tsx` (+ test), `src/components/meals/index.ts` (barrel), `src/components/layout/Sidebar.tsx` (L418-419 habits link; keep shelf link), `src/components/meals/plan/MealPlanPage.tsx` (strip deleted imports)

- [ ] **Step 1: Delete the directories/files listed.**
- [ ] **Step 2: New `MealsApp.tsx` routes** (only plan/shelf/cook survive):

```tsx
import { Routes, Route } from 'react-router-dom'
import { PlannerPage, MemoryShelfPage, CookPage } from '@/components/meals'

// Meals surface, mounted by the Shell at /meals/*. Two tabs (Plan, Recipes)
// plus the cook-mode route opened from recipe detail and the wall.
export function MealsApp() {
  return (
    <Routes>
      <Route path="shelf" element={<MemoryShelfPage />} />
      <Route path="cook/:recipeId" element={<CookPage />} />
      <Route path="plan" element={<PlannerPage />} />
      <Route index element={<PlannerPage />} />
      <Route path="*" element={<PlannerPage />} />
    </Routes>
  )
}
```

- [ ] **Step 3: `MealsTabs.tsx`** — reduce `TABS` to `plan` (`/meals/plan`) and `recipes` (`/meals/shelf`); active check: `startsWith('/meals/shelf') ? 'recipes' : 'plan'`. Update `MealsTabs.test.tsx` to the two tabs. Keep the existing styling classes verbatim.
- [ ] **Step 4: Strip `MealPlanPage.tsx`** down to a compiling core grid: remove imports/JSX for every deleted component and hook (`useGeneratePlan`, `useStandingHabits`, `useApplyMealSuggestion`, `useGroceryStatus`, brief/undo/parameter/distribute/clear-week UI). Keep: week navigation, `useMealPlan` grid rendering (`DayCard`/`DayStanza`/`EmptyDayStanza`/`MealRow`/`SlotSection`/`CookChip`), `RecipePickerModal`, `PlannerHeader` (strip its brief/generate props if any). This page is REPLACED in Phase 2 — goal here is only "compiles and renders the week".
- [ ] **Step 5: Update the barrel `src/components/meals/index.ts`** — remove exports of deleted pages (`TodayPage`, `StandingHabitsPage`, `DayDetailPage`, `GramTrackingPage`, `TonightPage`, `AskSymphonyRail`); keep `PlannerPage`, `MemoryShelfPage`, `CookPage`, `MealsTabs`, `SendToGroceriesModalV2`. Remove the Sidebar habits sub-item (L418-419).
- [ ] **Step 6: Verify** — `npm run build` → clean. `npx vitest run src/components/meals` → PASS (remaining tests: MealsTabs, RecipeCard). Manually: `npm run dev`, visit `/meals`, `/meals/shelf`, `/meals/cook/<any-recipe-id>` — all render.
- [ ] **Step 7: Commit** — `git commit -m "refactor(meals): delete today/habits/grams/tonight/day-detail/groceries-v1/chat surfaces"`

---

### Task 6: Delete dead hooks, context, and libs

**Files:**
- Delete: `src/hooks/useMealDayLog.ts`, `useMealTracking.ts`, `usePantryInventory.ts`, `useDietaryRestrictions.ts`, `useStandingHabits.ts`, `useGeneratePlan.ts` (+ `useGeneratePlan.test.ts`), `useStoreOverrides.ts`, `useWeeklyBrief.ts`, `src/contexts/GeneratePlanContext.tsx`
- Modify: `src/apps/wall/WallApp.tsx` and `src/apps/wall-v2/WallV2App.tsx` (or wherever `GeneratePlanProvider` wraps them — `grep -rn "GeneratePlanProvider" src/`) — unwrap.
- Modify: `src/hooks/useRecipe.ts` — `recordCooked` currently inserts into `cooking_history` (line ~58). Keep `recordCooked` but reduce it to the `recipes.times_cooked + last_cooked_at` bump only. Check callers (`grep -rn "recordCooked" src/`) still compile (outcome param can be dropped; update callers).
- Check-then-delete: `src/lib/mealPlanValidation.ts` (+ test) — delete if its only consumers were the generate edge fn / deleted files (`grep -rn "mealPlanValidation" src/`).

- [ ] **Step 1: Unwrap `GeneratePlanProvider`** from both wall apps, then delete the context file and the hooks listed. Fix any straggler importer the greps in Tasks 2–5 missed.
- [ ] **Step 2: Slim `useRecipe.recordCooked`** as described; run `npx vitest run src/hooks/useRecipe.test.ts` (update the test's `cooking_history` expectations).
- [ ] **Step 3: Verify** — `grep -rn "useMealDayLog\|useMealTracking\|usePantryInventory\|useDietaryRestrictions\|useStandingHabits\|useGeneratePlan\|useStoreOverrides\|useWeeklyBrief\|GeneratePlanContext" src/` → zero hits. Full `npm run build && npx vitest run` → clean/PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(meals): delete dead hooks and GeneratePlanContext"`

---

### Task 7: Wall v1 dead files + MCP tools + edge functions

**Files:**
- Delete: `src/components/wall/WallDinnerPromptWidget.tsx`, `src/components/wall/views/MealPlanColumn.tsx` (both have zero importers). KEEP `WallDinnerWidget.tsx`, `WallRecipeViewer.tsx`, `DinnerFlowView.tsx` (live consumers in `/wall` and `/wall-v2`).
- Modify: `tools/symphony-mcp-server.ts` — remove `symphony_list_pantry` (L674), `symphony_set_pantry_level` (L687), `symphony_list_dietary_restrictions` (L661): tool definitions, handlers, and any listing. Recipe/week-plan/list/note tools stay. Update `tools/test-mcp-tools.ts` if it exercises removed tools.
- Delete edge fns: `supabase/functions/ask-symphony-meal/`, `supabase/functions/meal-plan-generate/`, `supabase/functions/meal-plan-undo/`, `supabase/functions/recipe-discover/`, `supabase/functions/_shared/mealPlanGenerate.ts`

- [ ] **Step 1: Delete the files; strip the MCP tools.**
- [ ] **Step 2: Undeploy the four edge functions**: `npx supabase functions delete ask-symphony-meal --project-ref mwadppyrqzuzgstmwpuy` (×4). If CLI auth fails, note it in the task report — deletion from the repo is the required part; undeploy can be finished later.
- [ ] **Step 3: Verify** — `npm run build && npx vitest run src/components/wall` → PASS (`wallDinnerMealPlan.test.ts`, `ShoppingListView.test.tsx` untouched). `npx tsx tools/test-mcp-tools.ts` if runnable.
- [ ] **Step 4: Commit** — `git commit -m "refactor(meals): drop dead wall widgets, pantry/dietary MCP tools, AI edge fns"`

---

### Task 8: Slim `src/types/meal-planner.ts`

**Files:**
- Modify: `src/types/meal-planner.ts`

**Interfaces:**
- Produces: `MealSlot = 'breakfast' | 'lunch' | 'dinner'`; `DAY_MEAL_SLOTS: MealSlot[] = ['breakfast','lunch','dinner']`; `MEAL_SLOT_LABEL` trimmed to 3 keys. Types surviving: `DbRecipe`, `Recipe`, `DbMealPlan`, `MealPlan`, `DbMealPlanEntry`, `MealPlanEntry`, `KidAcceptanceMap`/`KidAcceptanceEntry`/`AcceptanceLevel`, and the three `db*To*` mappers.

- [ ] **Step 1: Delete dead exports** — everything bound to dropped tables: `BriefStatus`, `DbWeeklyBrief`, `WeeklyBrief`, `dbWeeklyBriefToWeeklyBrief`, `HabitMap`, `DbStandingHabit`, `StandingHabit`, `dbStandingHabitToStandingHabit`, `DbMealDayLog`, `MealDayLog`, `dbMealDayLogToMealDayLog`, `DbCookingHistory`, `CookingHistoryEntry`, `dbCookingHistoryToEntry`, `CookingOutcome`, `InverseActionType`, `InverseAction`, `DbUndoToken`, `UndoToken`, `dbUndoTokenToToken`, `GeneratedEntry`, `GeneratePlanResult`, `UndoPlanResult`, `DbDietaryRestriction`, `DietaryRestriction`, `dbRestrictionToRestriction`, `DbStoreOverride`, `StoreOverride`, `dbStoreOverrideToOverride`, `PantryLevel`, `DbPantryInventory`, `PantryInventory`, `dbPantryToPantry`, `MealParameter`, `TrackingState`, `DAY_MEAL_SLOTS_WITH_PREP`.
- [ ] **Step 2: Narrow `MealSlot`** to the 3 values; fix `MealPlan`/`MealPlanEntry`/`Db*` fields that referenced removed types (`parameter`, tracking state, `familyMemberId`, `preparedByFamilyMemberId` — delete the fields and their mapper lines).
- [ ] **Step 3: Fix ripples** — `npm run build`; expected touch points: `EveningMealCard`, `TapMealPanel`, `MealEventsProvider`, wall widgets, remaining plan components, `seed script types if imported`. Remove references to deleted slots (`snack`, `prep`, `lunch_iris`, …) — grep: `grep -rn "lunch_iris\|kid_alternate\|'snack'\|'prep'" src/`.
- [ ] **Step 4: Full verify** — `npm run build && npm run lint && npx vitest run` → clean/PASS. Commit — `git commit -m "refactor(types): meal-planner slimmed to 3-slot core model"`

---

### Task 9: Drop the eight tables + dead columns (DDL)

**Files:**
- Migration: `supabase/migrations/2026-07-18_meal_teardown.sql` (apply via MCP/Management API)

- [ ] **Step 1: Inspect actual columns first** (names below are from code archaeology — verify): `select table_name, column_name from information_schema.columns where table_name in ('meal_plans','meal_plan_entries') order by 1,2;`
Keep on `meal_plan_entries`: `id, meal_plan_id, day_of_week, slot, recipe_id, ad_hoc_title, notes, leftover_from_id, user_id, created_at, updated_at` (+ any sort column in active use by `useMealPlan`). Keep on `meal_plans`: `id, user_id, week_start, created_at, updated_at` (+ household scoping column if present — RLS depends on it, DO NOT drop).

- [ ] **Step 2: Apply** (adjust column names to Step 1 findings):

```sql
-- 2026-07-18_meal_teardown.sql
delete from meal_plan_entries where slot not in ('breakfast','lunch','dinner');
alter table meal_plan_entries drop constraint if exists meal_plan_entries_slot_check;
alter table meal_plan_entries add constraint meal_plan_entries_slot_check
  check (slot in ('breakfast','lunch','dinner'));
alter table meal_plan_entries
  drop column if exists family_member_id,
  drop column if exists prepared_by_family_member_id,
  drop column if exists tracking_state;
alter table meal_plans drop column if exists parameter;
drop function if exists regenerate_meal_plan(uuid, jsonb);
drop table if exists meal_day_logs cascade;
drop table if exists standing_habits cascade;
drop table if exists weekly_briefs cascade;
drop table if exists pantry_inventory cascade;
drop table if exists cooking_history cascade;
drop table if exists ai_undo_tokens cascade;
drop table if exists grocery_store_overrides cascade;
drop table if exists dietary_restrictions cascade;
```

- [ ] **Step 3: Verify** — the information_schema query shows only kept columns; `select count(*) from meal_plan_entries` sane; wall still shows tonight's dinner (`npm run dev`, open `/wall-v2` or run `node scripts/seed-weekly-dinners.mjs` first if the current week is empty).
- [ ] **Step 4: Commit** the migration file — `git commit -m "chore(db): drop dead meal tables and columns"`

---

### Task 10: Phase 1 gate — full verify + push

- [ ] **Step 1:** `npm run build && npm run lint && npx vitest run` → all clean. Fix anything found.
- [ ] **Step 2: Manual smoke** (dev server): `/meals` plan grid renders + direct add/remove works; `/meals/shelf` renders + URL import dialog opens; `/meals/cook/:id` renders; `/wall-v2` dinner card + `WallRecipeViewer` work; groceries-v2 flow (from wherever `SendToGroceriesModalV2` is now reachable — if unreachable post-teardown, note it; Phase 2 rewires it).
- [ ] **Step 3: Push** — `git fetch && git rebase origin/main && git push origin HEAD:main`. Verify deploy: `gh api repos/:owner/:repo/deployments -q '.[0]'` or Vercel dashboard (project `symphony-rebuild`); memory: pushes may silently not deploy — verify.

---

# Phase 2 — Rebuild

### Task 11: `meal-planner-chat` edge function

**Files:**
- Create: `supabase/functions/meal-planner-chat/index.ts`

**Interfaces:**
- Consumes: tables `meal_plans`, `meal_plan_entries`, `recipes`, `notes`, `lists`, `list_items`.
- Produces: POST endpoint; request `{ message: string, weekStart: 'YYYY-MM-DD', sessionId?: string, history?: {role:'user'|'assistant', content:string}[] }`; SSE response events `{type:'text',text}`, `{type:'tool',name}`, `{type:'done',reply}`, `{type:'error',message}`. Tools write directly (RLS-scoped).

- [ ] **Step 1: Write the function.** Model it structurally on `supabase/functions/symphony-agent/index.ts` (auth, CORS, SSE, tool loop, prompt caching). Key content:

```ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'
const MAX_TURNS = 12

const TOOLS: any[] = [
  {
    name: 'set_slot',
    description: 'Fill one meal slot for the week being planned. Replaces whatever is in that slot. Use recipe_id when the meal matches a saved recipe, otherwise title free text. For a leftovers lunch, set leftover_from_entry_id to the id of the source dinner entry (returned by previous set_slot calls or listed in the current plan).',
    input_schema: {
      type: 'object',
      properties: {
        day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0=Monday .. 6=Sunday' },
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
        day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
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
```

Tool handlers (all through the user-JWT-scoped `db` client):
- `set_slot`: resolve plan id — `select id from meal_plans where week_start = weekStart order by created_at limit 1`, insert `{ user_id, week_start: weekStart }` if missing; `delete from meal_plan_entries where meal_plan_id = X and day_of_week = d and slot = s`; then insert. **Match the insert row shape to `useMealPlan.addMeal`'s insert exactly** (read the hook — columns `meal_plan_id, day_of_week, slot, recipe_id, ad_hoc_title, notes, leftover_from_id, user_id`). Return the inserted row (`.select().single()`) so the model learns entry ids for leftover linking.
- `clear_slot`: same plan resolution, delete matching row(s).
- `save_recipe`: insert into `recipes` matching `recipeDataToInsertRow`'s column shape (`user_id, title, ingredients, instructions, tags, kid_acceptance: {}, is_prep_friendly: false, times_cooked: 0, source_label: 'chat'`).
- `add_grocery_items`: find list via `lists.select('id').eq('external_source','apple_reminders').eq('external_id','Groceries').maybeSingle()`; error string if missing; insert `list_items` rows `{ list_id, user_id, text, sort_order: idx, completed: false }`.
- `update_preferences`: newest `notes` row with `title='Household Meal Preferences'` → update `content` + `updated_at`; else insert `{ title, content, type: 'general', user_id }`.

System prompt (built per request; cache_control on the system block): who it is ("meal-planning assistant for the household's week of {weekStart}"), the 3-slot model with day indices, **leftover default policy** ("when planning a full week, default lunches to leftovers from the previous night's dinner unless told otherwise; link them via leftover_from_entry_id"), **breakfast policy** ("breakfasts are usually repetitive — offer 'the usual' filling across weekdays"), **grocery policy** ("when asked for a shopping list: consolidate ingredients from the week's recipe-backed meals, present the list grouped, flag staples the household likely has (oil, salt, rice, soy sauce, flour, butter…) and ask which to skip BEFORE calling add_grocery_items"), then context sections: current plan entries (id, day, slot, title/recipe), recipe library (id, title, tags, prep_minutes — all rows, they number dozens not thousands), and the full preferences note content.

Context loading + auth + SSE + the tool loop: copy the skeleton from `symphony-agent/index.ts` (service client verifies JWT; anon client with `Authorization` header does all reads/writes; `for (turn...)` loop pushing `tool_result` blocks; SSE `send()` helper).

`history` from the request body is prepended to `convo` so the conversation survives page reloads client-side; no server session persistence in v1.

- [ ] **Step 2: Deploy** — `npx supabase functions deploy meal-planner-chat --project-ref mwadppyrqzuzgstmwpuy --use-api`.
- [ ] **Step 3: Smoke test with curl** (get a session token from the dev app's localStorage or `supabase.auth.getSession()` in the console):

```bash
curl -N -X POST "$VITE_SUPABASE_URL/functions/v1/meal-planner-chat" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"put tacos on tuesday dinner","weekStart":"<current-week-start>"}'
```
Expected: SSE stream ending in `{"type":"done",...}`; a `meal_plan_entries` row exists for that plan/day/slot.
- [ ] **Step 4: Commit** — `git commit -m "feat(meals): meal-planner-chat edge function with direct tool writes"`

---

### Task 12: Chat client hook `useMealPlannerChat`

**Files:**
- Create: `src/hooks/useMealPlannerChat.ts`
- Test: `src/hooks/useMealPlannerChat.test.ts`

**Interfaces:**
- Produces: `useMealPlannerChat(weekStart: Date): { messages: ChatMsg[]; busy: boolean; send: (text: string) => Promise<void>; clear: () => void }` where `ChatMsg = { role: 'user' | 'assistant'; content: string; pending?: boolean }`. Exported pure helper `parseSseEvents(chunk: string, buffer: string): { events: any[]; rest: string }` for testability.

- [ ] **Step 1: Write the failing test** for `parseSseEvents` (split `data: {...}\n\n` frames across chunk boundaries; ignores non-data lines; returns remainder) and for `send()` appending user + streamed assistant text (mock `fetch` returning a `ReadableStream` of two `text` events + `done`).
- [ ] **Step 2: Run** `npx vitest run src/hooks/useMealPlannerChat.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Copy the SSE consumption pattern from the deleted `useAskSymphony` (git history: `git show HEAD~N:src/hooks/useAskSymphony.ts` or re-derive): `supabase.auth.getSession()` → raw `fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meal-planner-chat`, ...)` with `Bearer access_token`, body `{ message, weekStart: toIsoDate(weekStart), history: messages.map(({role, content}) => ({role, content})) }`; read `res.body.getReader()`, accumulate assistant text into the last message as `text` events arrive; `busy` true during flight; errors appended as an assistant message prefixed "Something went wrong: ".
- [ ] **Step 4: Run tests** → PASS. Commit — `git commit -m "feat(meals): useMealPlannerChat SSE client hook"`

---

### Task 13: New Plan page — grid + chat rail

**Files:**
- Create: `src/components/meals/plan/PlanPage.tsx` (replaces `MealPlanPage.tsx`), `src/components/meals/plan/WeekGrid.tsx`, `src/components/meals/plan/SlotCell.tsx`, `src/components/meals/chat/MealChatRail.tsx`, `src/components/meals/chat/MealChatSheet.tsx`
- Delete: `src/components/meals/plan/MealPlanPage.tsx`, `DayCard.tsx`, `DayStanza.tsx`, `EmptyDayStanza.tsx`, `MealRow.tsx`, `SlotSection.tsx`, `PlannerHeader.tsx` (keep `RecipePickerModal.tsx`, `CookChip.tsx`)
- Modify: `src/components/meals/index.ts` (export `PlanPage` as `PlannerPage`), `MealsApp.tsx` unchanged (route name stable)
- Test: `src/components/meals/plan/WeekGrid.test.tsx`

**Interfaces:**
- Consumes: `useMealPlan(weekStart)` (Task 1 shape), `useRecipes()`, `useMealPlannerChat(weekStart)` (Task 12), `useGroceryStatus(plan, recipes)` + `SendToGroceriesModalV2` (surviving groceries-v2), `useIsMobile()`, `RecipePickerModal`.
- Produces: `/meals` and `/meals/plan` render `PlanPage`.

Layout (desktop ≥768px): header row — `font-display` week title, prev/next week chevrons (lucide `ChevronLeft/Right`), `Build shopping list` button (lucide `ShoppingBasket`) opening `SendToGroceriesModalV2` with `useGroceryStatus`'s `consolidated`/`groceriesListId`/`currentItems`; below, a two-column flex: `WeekGrid` (flex-1) + `MealChatRail` (`w-[380px]`, sticky, full-height scroll). Mobile: grid only + a floating chat button (lucide `MessageCircle`) opening `MealChatSheet` (copy the `MoreSheet` scrim + `rounded-t-2xl` + `translate-y` + `safe-area-bottom` skeleton).

`WeekGrid`: 7 day sections (Mon..Sun per `day_of_week` 0..6), each with 3 `SlotCell`s (breakfast/lunch/dinner). `SlotCell` filled state: title (recipe title or `ad_hoc_title`; leftover entries render `Leftovers: {source dinner title}` — resolve `leftover_from_id` against the plan's entries), tap → small action menu (Change recipe → `RecipePickerModal`, Clear → `removeMeal`, dinner cells also "→ lunch tomorrow" → `addMeal({ dayOfWeek: d+1, slot:'lunch', leftoverFromId: entry.id })`, disabled on Sunday). Empty state: ghost "+" → menu (Pick recipe / Type name — inline input → `addMeal({ adHocTitle })` / Leftovers from last night when the previous day has a dinner). Realtime from Task 1 keeps the grid live while chat writes.

- [ ] **Step 1: Write the failing `WeekGrid.test.tsx`**: renders 7 days × 3 slots from a fixture `MealPlan`; leftover entry shows `Leftovers: Sheet-pan chicken` when its source entry is the fixture's Monday dinner; empty slot shows the add affordance. Run → FAIL.
- [ ] **Step 2: Implement `WeekGrid` + `SlotCell`** (pure presentational; callbacks up to `PlanPage`). Run test → PASS.
- [ ] **Step 3: Implement `MealChatRail`** (message list + input, Nordic Journal styles: `.card` surface, `input-base` input, busy spinner via lucide `Loader2`) and `MealChatSheet` (same body inside the bottom-sheet skeleton).
- [ ] **Step 4: Implement `PlanPage`**, wire everything, delete the old plan components, update the barrel. Reuse the week-start derivation the old `MealPlanPage` used (same helper, so DB `week_start` keys stay consistent with the wall + seeder).
- [ ] **Step 5: Verify** — `npm run build && npx vitest run src/components/meals` → PASS. Dev-server: plan a week via chat ("taco tuesday, salmon wednesday, leftovers thursday lunch"), watch the grid fill live; direct-edit a cell; build a shopping list end-to-end (skip-staples question happens in chat when asked via chat; button path goes through the modal).
- [ ] **Step 6: Commit** — `git commit -m "feat(meals): chat-first plan page with live week grid"`

---

### Task 14: Phase 2 gate — full verify + push + prod smoke

- [ ] **Step 1:** `npm run build && npm run lint && npx vitest run` → clean/PASS.
- [ ] **Step 2:** Manual pass on dev: chat plans a full week including leftover lunches + "the usual" breakfasts; grocery build inserts into the Groceries list (verify in DB or Apple Reminders); `/meals/shelf` URL import still works; `/meals/cook/:id` works; `/wall-v2` shows tonight's dinner from the chat-planned week.
- [ ] **Step 3: Push** — `git fetch && git rebase origin/main && git push origin HEAD:main`. Verify the Vercel deployment landed; smoke prod `/meals`.
- [ ] **Step 4:** Update memory (`planning`/meals notes) and remove stale memory files that describe deleted surfaces (day-logs, habits, pantry, briefs).

---

## Self-review notes

- Spec coverage: teardown list → Tasks 2–9; chat-first planner → 11–13; groceries skip-staples → chat policy (11) + modal path (13); preferences-as-note → tool in 11; wall untouched → constraint + Task 7 keeps live widgets; timeline stays dark → no task touches `mealsVisibility.ts`.
- Known deviation from spec: wall-v1 meal widgets survive because `/wall` is still a live route (spec assumed they were retirable). Revisit wall-v1 retirement separately.
- `SendToGroceriesModalV2` may be orphaned between Task 5 and Task 13 (its old entry point dies with MealPlanPage's grocery UI in Task 5 if it was mounted there) — acceptable: it stays exported and compiling, rewired in Task 13.
