# Meal Planner Rebuild — Design Spec

**Date:** 2026-07-18
**Status:** Approved by Scott
**Strategy:** Teardown first (Phase 1), then rebuild chat-first planner (Phase 2). Both phases ship to main.

## Why nuke it

The existing meal subsystem is the largest single feature in the app and it is (a) over-built — eight pages/tabs with no working end-to-end loop, (b) structurally wrong — four overlapping data models (`meal_plans`/`meal_plan_entries`, `meal_day_logs`, `lists`, synthesized `meal:` events) bridged by glue, and (c) unused — the family never adopted it. The Today-timeline surface is already dark in prod (`SHOW_PLANNED_MEALS_ON_TIMELINE = false`); only the wall-v2 dinner display is live.

## The core loop (the only loop)

Plan the week by **chatting with the AI** → the week grid fills in live → **wall shows tonight's dinner** (tap → recipe → cook-mode) → **grocery list falls out of the plan** into the existing groceries list.

Three slots per day: **breakfast / lunch / dinner**. **Leftovers are first-class**: last night's dinner becomes today's lunch via one tap or by default when the chat plans a week.

Explicitly cut: per-person slot variants (`lunch_iris`, `kid_alternate`), snack/prep slots, meal parameters (800g/low-carb), day-logs ("what we ate"), grams tracking, standing habits, weekly briefs, pantry inventory, store overrides, cooking history, AI suggestion/apply/undo-token machinery, the discover-recipes dialog.

## Data model

Keep three tables, slimmed:

- **`recipes`** — unchanged (title, ingredients, steps, source_url, image).
- **`meal_plans`** — one row per household-week, Sunday start. Unchanged.
- **`meal_plan_entries`** — `plan_id`, `date`, `slot` (`breakfast` | `lunch` | `dinner` only), `recipe_id` (nullable) or free-text `title`, plus new nullable `leftover_of` → `meal_plan_entries.id`. A leftover entry renders as "Leftovers: <source dinner title>" and follows the source if it changes. Old slot values/columns for variants and parameters are dropped.

**Drop eight tables:** `meal_day_logs`, `standing_habits`, `weekly_briefs`, `pantry_inventory`, `cooking_history`, `ai_undo_tokens`, `grocery_store_overrides`, `dietary_restrictions`.

**Preferences are prose, not tables.** All dietary restrictions, kid quirks, and rhythms ("pizza Fridays") live in the existing **Household Meal Preferences** note. The chat loads it as context every conversation and updates it on request ("remember Liam hates mushrooms").

**Groceries reuse `lists`/`list_items`.** No meal-specific grocery tables or UI. Building the list consolidates + dedupes ingredients from the week's recipe-backed entries (existing `consolidateIngredients`), asks a **skip-staples question** ("you probably have olive oil, rice, soy sauce — skip?") with no pantry table behind it (AI judgment only), then inserts into the normal grocery list → wall + Apple Reminders as today.

## Surfaces

The meals app shrinks to **two tabs: Plan and Recipes**.

### Plan (the page that matters)
- Desktop: 7-day × 3-slot week grid with a **chat rail** alongside. The AI writes directly to the plan as you talk; slots fill in live via a realtime subscription on `meal_plan_entries` (per-instance channel pattern, as in planning surfaces).
- Mobile: grid with chat as a bottom sheet.
- Grid cells support direct edits: pick recipe, free text, "→ lunch tomorrow" (leftover), clear.
- "Build shopping list" lives in the plan header and in chat.
- No propose/approve cards, no undo tokens. Undo = tell the chat to change it back.

### Recipes (slim library)
- List + detail. URL import via existing `fetch-recipe` scraper. Chat can save recipes.
- **Cook-mode stays**: opens from recipe detail and from the wall; step list, tap to advance. No history tracking.

### Wall: untouched
Wall-v2 tonight-dinner card + `WallRecipeViewer` keep reading the same tables. Helpers wall-v2 imports from wall-v1 (`findDinnerEvent`, `getMealIcon`, `WallRecipeViewer`) move into the wall-v2 tree before wall-v1 meal widgets are deleted. The seeder (`scripts/seed-weekly-dinners.mjs`) keeps working.

### Today timeline: stays dark
`SHOW_PLANNED_MEALS_ON_TIMELINE` stays `false`. After the new planner survives a couple of real weeks, flipping dinner-only onto the timeline is a one-line follow-up (out of scope here).

## Chat backend

One new edge function **`meal-planner-chat`**, replacing `ask-symphony-meal`, `meal-plan-generate`, and `meal-plan-undo`. Claude Sonnet, API-billed (same billing stance as `symphony-agent` — do not downgrade). Direct tool-calling writes:

- `set_slot(date, slot, recipe_id | title)` / `clear_slot(date, slot)`
- `mark_leftover(date, slot, source_entry_id)`
- `search_recipes(query)` / `save_recipe(...)`
- `read_preferences()` / `update_preferences(text)` (Household Meal Preferences note)
- `build_grocery_list(week)` → consolidation + skip-staples confirmation → `list_items`

System context: current week's plan + the preferences note. Default behavior when planning a week: propose leftover lunches from the previous night's dinner unless told otherwise; breakfasts support "the usual" repetition.

## Phase 1 — Teardown (ships first)

Delete wholesale:
- Pages/subtrees: `/meals/today`, `/meals/habits`, `/meals/grams`, `/meals/tonight`, `day-detail/`, `groceries/` (v1), `chat/` (old AskSymphonyRail), plan-page suggestion/undo/brief components.
- Wall-v1 meal widgets (`WallDinnerWidget`, `WallDinnerPromptWidget`, `MealPlanColumn`, `DinnerFlowView`) after relocating the helpers wall-v2 uses.
- Edge functions: `meal-plan-generate`, `meal-plan-undo`, `ask-symphony-meal`, `recipe-discover` (+ `_shared/mealPlanGenerate.ts`).
- Hooks: `useMealDayLog`, `useMealTracking`, `usePantryInventory`, `useDietaryRestrictions`, `useStandingHabits`, `useApplyMealSuggestion`, `useGeneratePlan`, `useStoreOverrides` (and `useGroceryStatus`/`useShoppingList` if only serving deleted surfaces — verify consumers first).
- MCP tools: `symphony_list_pantry`, `symphony_set_pantry_level`, `symphony_list_dietary_restrictions`. Recipe/week-plan/list tools stay.
- Tables: the eight listed above (DDL via Management API; migrations are out of sync — use `POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query`).
- Types: slim `meal-planner.ts` to the surviving model.
- Tests of deleted code.

Survives Phase 1 working: recipe library, cook-mode, wall-v2 dinner display, MCP recipe/plan tools, seeder — all on the 3 core tables.

## Phase 2 — Rebuild

1. Migration: `slot` narrowed to 3 values, add `leftover_of`, drop dead columns.
2. `meal-planner-chat` edge function with tools above.
3. Plan page: week grid + chat rail (desktop) / bottom sheet (mobile), realtime updates, direct cell edits, leftover affordance.
4. Grocery build flow with skip-staples confirmation.
5. Recipes tab slimmed (list, detail, URL import); cook-mode preserved.
6. `MealsTabs` → Plan / Recipes.

## Testing

- Keep/port: `consolidateIngredients`, `recipeParser`, `recipeDetection`, wall-v2 adapter tests.
- New: chat tool handlers (unit), grid rendering + leftover linking, grocery build.
- Pre-push hook (tsc + unit tests) gates every push to main; `npm run build` before type-sensitive pushes; lint before pushing (CI runs lint, pre-push doesn't).

## Non-goals

- Today/Week timeline meal events (flag stays off).
- Pantry state, nutrition/health tracking, per-person meals, multi-store shopping logic.
- Michael/Telegram as a planning surface (possible later via the same edge fn/MCP).
