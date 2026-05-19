# Symphony AI Meal-Write — Design Spec

**Date:** 2026-05-19
**Status:** Approved (brainstorm), pending spec review
**Branch / worktree:** `feat/symphony-meal-write` @ `.worktrees/symphony-meal-write`

## Problem

Symphony's in-app meal assistant (`ask-symphony-meal`) is **read-only**. Asked to
"add these dinners to this week," it replies it has no way to do so. Worse, the
investigation that prompted this work found meal data **fragmented**: the
structured planner (`meal_plan_entries`) was empty for recent weeks while the
assistant read dinners from a stale freeform note ("800g Challenge — Meal Plan,
Week of April 10"). There is no coherent write path between conversation and the
structured plan the app/wall actually render.

## Goal

Symphony AI can change the **structured** weekly meal plan from conversation,
with a hybrid agency model: act directly on safe changes, require confirmation
for destructive ones. Scope is intentionally narrow (see Scope Guard).

## Key Architectural Finding

The plumbing largely exists but is **stubbed**:

- `ask-symphony-meal` already streams structured JSON (model is prefilled with
  `{ "text": ...`) and supports a suggestion/`cards` channel.
- `useAskSymphony` already hydrates `AskSymphonySuggestion` (with an `apply`
  payload) from stored messages.
- `AskSymphonyRail` already exposes `onApply` / `onPreview` handler slots — they
  currently only `console.log('… no handler')`.
- `MealPlanRitualPage` already holds `useMealPlan` (`addMeal`, `removeMeal`) in
  scope **and** renders `<AskSymphonyRail>`.

This feature wires that existing seam. It does not add new infrastructure.

## Approach (chosen: B — propose, client applies)

The edge function proposes typed structured actions; the **client** applies them
through the existing `useMealPlan` write path. Rejected alternatives: (A)
tool-use writing server-side — duplicates write/auth/refresh logic and reproduces
the divergence class behind the `72bed33` clearWeek refresh bug; (C) dedicated
`meal-write` endpoint — YAGNI now, a valid Phase-2 extraction for voice/MCP.

## Components & Contract

### 1. Action contract (shared type)

Extend the existing suggestion union with two variants:

```ts
type MealActionSuggestion =
  | { kind: 'meal_set'; dayOfWeek: number; slot: MealSlot; adHocTitle: string }
  | { kind: 'meal_remove'; entryId: string }
```

- `dayOfWeek`: `0=Sun … 6=Sat` (confirmed encoding — `weekHelpers.DAY_LABELS`
  / `Date.getDay()`; the `0=Mon` comments in `types/meal-planner.ts` are stale
  and will be corrected as part of this work).
- `slot`: defaults to `'dinner'` when the user doesn't specify.
- `adHocTitle`: freeform meal text (no recipe linking — see Scope Guard).

### 2. Edge function (`ask-symphony-meal`) — propose only

- Add the `MealActionSuggestion` schema to the JSON response contract.
- System-prompt rules: when the user asks to add/replace/remove a meal, emit one
  suggestion per meal; resolve relative dates ("this week", "Tuesday") against
  the `weekStart` already provided in context using `0=Sun..6=Sat`; default
  `slot=dinner`.
- **No write logic, no new DB access, auth unchanged.** Stays read-and-propose.

### 3. Agency policy (client, single location)

Implemented as a **pure function** over `plan.entries`, invoked from
`MealPlanRitualPage`'s (currently stubbed) apply handler:

| Proposed action | Existing `(dayOfWeek, slot)` | Behavior |
|---|---|---|
| `meal_set` | empty | **Auto-apply**: `addMeal(...)`; passive chip "✓ Tuesday dinner set" |
| `meal_set` | occupied | **Confirm card** in rail: "Replace Wed dinner *X* → *Y*? [Replace] [Keep]". Replace = `removeMeal(existing.id)` then `addMeal(new)` |
| `meal_remove` | (any) | **Always confirm** |

All writes go through existing `useMealPlan` so RLS, optimistic UI, the
`bumpRefreshSignal` propagation (hardened in `72bed33`), and the existing undo
toast all apply unchanged.

### 4. Client wiring

- Typed `MealActionSuggestion` variant added in `useAskSymphony`.
- `MealPlanRitualPage`: replace the two `no handler` stubs with the agency-policy
  handler.
- Small `MealActionConfirmCard` rendered inline in `AskSymphonyRail` for the
  occupied/remove cases.
- `onPreview` (optional, low priority): highlight the target day cell.

## Error Handling

- **Replace is two-step**: `removeMeal` then `addMeal`. If `addMeal` fails after
  a successful `removeMeal`, restore the prior entry (mirrors the StagingFloat
  note-route two-step restore from `770b376`). Surface an error chip; never
  leave a day blank due to a partial failure.
- **Malformed model action**: validated against the typed schema client-side;
  invalid suggestions are dropped with a soft "I couldn't structure that
  change — try rephrasing" message rather than throwing.
- **Auth/RLS**: unchanged; a write the user isn't permitted to make fails via
  the existing `useMealPlan` error path (error chip, no state change).

## Testing

- **Unit** — agency policy as a pure function over `plan.entries`: empty→auto,
  occupied→confirm, `meal_remove`→confirm; plus `MealActionSuggestion` schema
  validation (valid, missing field, bad `dayOfWeek`, unknown `slot`).
- **Component** — `AskSymphonyRail` renders a confirm card when the slot is
  occupied and calls `addMeal`/`removeMeal` with the correct args on Replace;
  auto-applies (no card) when the slot is empty.
- **Edge** — contract test: a "add X to Tuesday" message yields a well-formed
  `meal_set` suggestion with `dayOfWeek=2, slot='dinner'` (mirrors the
  `note-match` `index_test.ts` pattern; deno test).

## Scope Guard (YAGNI)

In scope: dinner-centric, `ad_hoc_title` only, single (current) week, in-app
meal chat surface only. Reuses existing chat, auth, write path, undo.

Explicitly out: recipe linking (`recipe_id`), multi-week / relative-week beyond
"this week", voice/MCP entry points (deferred Approach C), and reconciling the
legacy "800g note" ↔ structured-planner split (separate effort; this spec makes
the structured planner the coherent write target, which is the first step).

## Definition of Done

- Asking the meal chat "add <meal> to <day>" with an empty slot writes it to
  `meal_plan_entries` and shows a passive confirmation, visible in app + wall.
- The same against an occupied slot shows a confirm card; Replace swaps it,
  Keep is a no-op.
- `meal_remove` always confirms.
- Stale `0=Mon` comments in `types/meal-planner.ts` corrected.
- Unit + component + edge tests green; build + lint clean.
