# AI Suggestions for a Single Meal Slot — Design

**Date:** 2026-07-19
**Status:** Approved, implementing

## Problem

Changing one meal on the week grid means opening `RecipePickerModal` and
scrolling the shelf. When you're changing a slot you've usually rejected what's
there and want an *alternative* — but the picker offers no help generating one.

## Goal

In the recipe picker, let the user ask AI for 2–3 replacement ideas for that
exact slot — each with a one-line "why it fits" — and apply one with a tap. The
AI proposes; only the user's tap writes (same "propose, don't auto-apply"
pattern as `sharpen-goal`).

## UX

Add a third tab to `RecipePickerModal` — **"✨ Ideas"** (next to "From shelf"
and "Leftovers"). It contains:

- an optional intent box — *"what are you in the mood for?"* (blank = "just
  suggest good fits");
- a **Suggest** button (no auto-fetch on tab open, to control model cost);
- results as 2–3 tappable cards: title, a `shelf`/`new` badge, and the "why".

Tapping a card applies it and closes the modal. The grid updates live via
`useMealPlan`'s realtime subscription (already wired). Covers both entry points
the modal already serves: filling an empty slot and "change recipe".

## Suggestion sources

Each candidate is one of:

- **shelf** — an existing recipe (`recipeId` from the loaded shelf). Applying
  reuses the modal's existing `onPick(recipeId, forWho)` path (removes the old
  entry when replacing, adds the recipe).
- **new** — an AI-invented recipe (title + ingredients + steps, following the
  consultant rules: ≤10 ingredients, ≤6 steps, quantities inline). Applying
  saves it to the shelf via `useRecipes.addManual`, then sets the slot — so it's
  reusable and feeds the grocery list.

## Edge function `meal-slot-suggest` (new)

Single-shot, same skeleton as `sharpen-goal` (CORS, JWT verify so only
authenticated calls bill the model, one `claude-sonnet-4-6` call, JSON out,
**no DB writes**).

- **Input:** `{ weekStart, dayOfWeek, slot, intent }`.
- **Context load** (RLS-scoped anon+Authorization client, mirroring
  `meal-planner-chat`'s `loadContext`): the week's entries with titles resolved
  (for variety + leftover awareness), the shelf recipes (`id, title, tags,
  prep_minutes`), and the "Household Meal Preferences" note.
- **Output:** `{ suggestions: Array<Suggestion> }`, up to 3:
  - `{ source: 'shelf', recipeId, title, why }`
  - `{ source: 'new', title, why, ingredients: string[], instructions: string[], prepMinutes?, tags? }`
- **Validation:** cap to 3; drop a `shelf` suggestion whose `recipeId` isn't in
  the loaded shelf (no hallucinated ids); drop a `new` suggestion missing
  ingredients/instructions. If nothing survives, return an empty list (the UI
  shows a gentle "no ideas — try describing it").

The prompt asks for concrete "why" clauses that reference the actual week
(avoid repeats, use a leftover, honor prefs, fit the season and the slot).

## Client

- **`useMealSlotSuggestions()`** — new hook. `suggest({ weekStart, dayOfWeek,
  slot, intent })` calls the edge fn with the user's JWT; returns `{ suggest,
  suggestions, loading, error, reset }`. Mirrors the fetch/auth shape of
  `useMealPlannerChat` (session token, `VITE_SUPABASE_URL`).
- **`RecipePickerModal`** — new optional props `weekStart?`, `dayOfWeek?`,
  `onApplyNewRecipe?(input: ManualRecipeInput)`. Uses the hook internally for
  the Ideas tab. The tab only renders when `weekStart`/`dayOfWeek` are provided,
  so other callers of the modal are unaffected.
- **`PlanPage`** — passes `weekStart`, `picker.dayOfWeek`, and a
  `handleApplyAiNew` that (respecting `picker.replaceEntryId`) removes the old
  entry, `addManual`s the new recipe, `addMeal`s it, and refreshes recipes —
  the new-recipe analogue of the existing `handlePick`.

## Out of scope (YAGNI)

- Auto-suggesting on tab open (one tap).
- Multi-turn chat inside the picker (the main rail is for that).
- AI proposing leftovers (the Leftovers tab already covers that).

## Testing

- `useMealSlotSuggestions.test.ts` — posts the right shape; returns parsed
  suggestions; surfaces errors.
- `RecipePickerModal.test.tsx` — Ideas tab shows when context is passed and
  hides otherwise; Suggest calls the hook; tapping a `shelf` card calls
  `onPick`; tapping a `new` card calls `onApplyNewRecipe`.
- Edge function is not in the vitest suite (Deno); validated by the RLS-scoped
  context load + manual verification.

## Verification

Open the grid, click a dinner → Ideas tab → Suggest → tap a card → the slot
changes and the grid reflects it. Try an intent ("something lighter") and a
blank intent.
