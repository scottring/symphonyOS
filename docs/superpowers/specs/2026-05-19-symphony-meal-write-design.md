# Symphony AI Meal-Write — Design Spec (v2, corrected)

**Date:** 2026-05-19
**Status:** Approved direction (re-scoped), pending spec review
**Branch / worktree:** `feat/symphony-meal-write` @ `.worktrees/symphony-meal-write`

## Correction notice

v1 of this spec assumed `ask-symphony-meal` was read-only and its apply
handlers were stubbed. **Grounding the plan disproved that.** The meal-write
feature already works end-to-end *in the meal-planner rail*:

- `ask-symphony-meal`'s system prompt already instructs the model to emit
  `add`/`swap`/`remove` SuggestionCards with `apply` payloads; it validates and
  returns them.
- `useAskSymphony` parses them; `MealPlanRitualPage.onApplySuggestion`
  (lines ~213–271) applies them via `useMealPlan.addMeal/removeMeal` and **is**
  passed to `<AskSymphonyRail>`.

The failure that triggered this work came from a **different surface**:
`symphony-chat` (the general contextual assistant), which has vault-note RAG but
**no meal context and no meal-write path**, so it read the stale "800g
Challenge" note and replied "I don't have access to a meal planning system."

## Problem (corrected)

Meal-write is **siloed** in the meal-planner rail. The general assistant the
user naturally talks to (`symphony-chat`) cannot reach it, so from the user's
seat "Symphony AI can't add dinners."

## Goal

When the user asks the **general** Symphony assistant to add/change meals, it
fulfills the request by **delegating to the existing `ask-symphony-meal`
card/apply pipeline** — no duplicate meal-write logic, no changes to the proven
pipeline's behavior.

## Approach (chosen: client router + shared apply hook)

1. **Extract the apply path into one shared hook.** Move the existing
   add/swap/remove logic from `MealPlanRitualPage.onApplySuggestion` into
   `src/hooks/useApplyMealSuggestion.ts`. `MealPlanRitualPage` consumes the hook
   (zero behavior change there). This guarantees a **single** meal-write apply
   path — directly addresses the divergence class behind the `72bed33` bug.

2. **`symphony-chat` recognizes meal intent and hands off (no refusal).** Add a
   system-prompt rule: when the user asks to add/replace/remove a planned meal,
   do not answer from notes — emit a structured handoff block reusing the
   existing fenced-block convention (`parseVaultDraft` already does this for
   `:::vault-draft:::`):

   ```
   :::meal-request
   <the user's meal request, verbatim or lightly normalized>
   :::
   ```

3. **Client routes the handoff to the existing meal pipeline.** `useChat`
   parses `:::meal-request:::` (mirror of `parseVaultDraft`). The general chat
   surface then invokes the **existing** `ask-symphony-meal` flow for the
   current week (`weekStart = sundayOfWeek(new Date())`, `clientToday` = local
   today — the function already accepts both), and renders the returned
   `SuggestionCard`s inline in the general chat, applied via
   `useApplyMealSuggestion`.

## Components & Contract

### New: `src/hooks/useApplyMealSuggestion.ts`

```ts
export function useApplyMealSuggestion(weekStart: Date): {
  applySuggestion: (s: AskSymphonySuggestion) => Promise<void>
}
```

Exactly the current `onApplySuggestion` body (add/swap/remove → `useMealPlan`),
lifted verbatim including the family-member-name fallback and the
`swap` = `removeMeal(originalEntryId)` then `addMeal` sequence. No new behavior.

### Modify: `MealPlanRitualPage.tsx`

Replace the inline `onApplySuggestion` with `useApplyMealSuggestion(weekStart)`;
pass `applySuggestion` as `onApplySuggestion` to `<AskSymphonyRail>`. Behavior
identical (covered by existing meal-rail behavior + new hook unit tests).

### Modify: `supabase/functions/symphony-chat/index.ts`

System-prompt addition only. When the message is a meal-plan write request,
respond with a short ack line plus a `:::meal-request:::` block; do **not**
attempt to answer it from notes and do **not** say it can't. No new data access,
auth unchanged.

### Modify: `src/hooks/useChat.ts`

Add `parseMealRequest(text)` mirroring `parseVaultDraft`: extracts the
`:::meal-request:::` body, strips the block from the visible message, returns
`{ content, mealRequest?: string }`. Extend `ChatMessage` with optional
`mealRequest?: string`.

### Modify: general chat panel — pinned files

- `src/components/chat/ChatPanel.tsx` — the general assistant panel (state via
  `useChat`, owned by `App.tsx:213`).
- `src/components/chat/ChatMessage.tsx` — renders one message; already renders
  `VaultDraftCard` for parsed `:::vault-draft:::` blocks. **Direct precedent:**
  add a sibling render branch for `mealRequest` exactly as `VaultDraftCard` is
  done.
- `src/components/chat/VaultDraftCard.tsx` — pattern to mirror for a new
  `MealRequestCards` element (invokes `ask-symphony-meal` for the current
  `weekStart`, renders the returned cards via the existing `SuggestionCard`
  component, Apply wired to `useApplyMealSuggestion(weekStart).applySuggestion`).

When a `ChatMessage` carries `mealRequest`, `ChatMessage` renders
`MealRequestCards` (new, modeled on `VaultDraftCard`) just as it renders
`VaultDraftCard` for `draft`.

## Agency model

Inherit the existing pipeline's behavior unchanged: the model surfaces cards;
the user clicks **Apply** to commit (uniform confirm). The v1 "auto-apply to
empty slots" optimization is **explicitly deferred** — reusing the proven
pipeline as-is is worth more than the keystroke saved, given this session's
lessons about not over-reaching into working code.

## Error Handling

- Meal request detected but `ask-symphony-meal` returns no cards (e.g., model
  couldn't structure it): show its text reply inline; no silent failure.
- `applySuggestion` failure: surfaced exactly as today (the hook keeps the
  current `try/catch` + user-visible error). `swap`'s remove-then-add ordering
  is preserved from the original code.
- Malformed `:::meal-request:::` (no body): treat as a normal chat message
  (no handoff), so a prompt glitch never blackholes the user's message.
- `ask-symphony-meal` auth/RLS unchanged (its own JWT path).

## Testing

- **Unit** — `useApplyMealSuggestion`: add → `addMeal` with mapped args;
  swap → `removeMeal(originalEntryId)` then `addMeal`; remove →
  `removeMeal(entryId)`; family-member-name fallback resolves; missing
  `dayOfWeek/slot` throws (parity with current code).
- **Unit** — `parseMealRequest`: extracts body, strips block, ignores absent /
  empty block.
- **Component** — general chat: a message whose AI reply contains
  `:::meal-request:::` triggers the meal pipeline and renders ≥1
  `SuggestionCard`; clicking Apply calls `applySuggestion` with the card.
- **Edge (deno)** — `symphony-chat` contract: a meal-write message yields a
  reply containing a well-formed `:::meal-request:::` block and no refusal
  language (mirrors the `note-match` `index_test.ts` pattern).
- **Regression** — `MealPlanRitualPage` meal-rail apply still works after the
  hook extraction (existing behavior; covered by the hook unit tests +
  type-check).

## Scope Guard (YAGNI)

In scope: general-assistant → existing meal pipeline delegation for the current
week; one extracted shared apply hook.

Explicitly out: modifying `ask-symphony-meal`'s prompt/behavior; auto-apply to
empty slots (deferred); recipe-linking; multi-week / past weeks; voice/MCP
surfaces; reconciling the legacy 800g-note ↔ structured-planner split (separate
effort — this work makes the structured planner the single write target via the
one shared apply hook, which is the first step).

## Definition of Done

- Asking the **general** Symphony assistant "add <meal> to <day> this week"
  produces inline Apply-able meal cards (not a refusal); Apply writes to
  `meal_plan_entries`, visible in app + wall.
- `MealPlanRitualPage` meal-rail behavior unchanged.
- One apply path (`useApplyMealSuggestion`) used by both surfaces.
- Unit + component + edge tests green; build + lint clean.
