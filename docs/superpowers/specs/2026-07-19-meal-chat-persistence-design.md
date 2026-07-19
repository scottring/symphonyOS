# Meal Chat Persistence — Design

**Date:** 2026-07-19
**Status:** Approved, implementing
**Author:** Claude (with Scott)

## Problem

The meal-planner chat (`useMealPlannerChat`) holds its entire conversation in
React memory only (`useState` + `messagesRef`), re-sent to a stateless edge
function each turn. Leaving `/meals` unmounts `PlanPage` and the conversation is
gone permanently — there is no server copy and nothing in `localStorage`.

Real incident (2026-07-18): Iris built a full week's menu via chat, navigated
away, came back, and the chat was gone. Because consultant-mode *proposes* a
plain-text menu that is only written to the DB on acceptance, an un-applied
proposal is especially vulnerable — the meals it describes never existed in the
DB, and the proposal text that would let her apply them is lost with the
transcript.

(The meals themselves, when applied, were fine — they persist to
`meal_plan_entries`, and household RLS makes them visible across both accounts
and the wall. That half was never broken. This spec is only about the chat.)

## Goal

Persist the chat transcript robustly: household-shared and cross-device, so
leaving and returning to `/meals` — on any device, by any household member —
restores the conversation, including un-applied proposed menus.

## Data model

New table `meal_chat_messages`:

| column | type | notes |
|--------|------|-------|
| `id` | uuid pk default `gen_random_uuid()` | |
| `user_id` | uuid not null (FK `auth.users`) | author |
| `week_start` | date not null | which week's plan this thread is about |
| `role` | text not null, CHECK in (`'user'`,`'assistant'`) | |
| `content` | text not null | |
| `created_at` | timestamptz not null default `now()` | thread order |

Index: `(week_start, created_at)` for the per-week load.

The thread is keyed by `week_start` and merged across the household by
`created_at` — one shared conversation per week, mirroring the "one shared plan
per week" model. Only finalized messages are stored (never the transient
`pending` UI state).

## RLS — mirror the meal tables exactly

This is what makes the transcript household-shared, identical to
`meal_plans`/`recipes`/`meal_plan_entries`:

- **SELECT / DELETE:** `auth.uid() = user_id OR users_share_household(auth.uid(), user_id)`
- **INSERT:** `with check (auth.uid() = user_id)` (author must be self)
- No UPDATE policy — messages are immutable.

RLS handles household visibility, so the client queries by `week_start` only
(never filters by `user_id`), exactly like `useMealPlan`.

## Client changes — contained to `useMealPlannerChat`

The edge function is **untouched**: it is already stateless and the client owns
the history it re-sends each turn. We simply persist that history to the DB and
reload it.

1. **Load on mount / week change:** `select role, content from meal_chat_messages
   where week_start = X order by created_at asc` → seed `messages` +
   `messagesRef`. New `loadingHistory` flag so the rail shows a loading state
   instead of flashing empty.
2. **Persist user message on send:** written immediately, so it is never lost
   even if the tab closes mid-reply.
3. **Persist assistant reply on `done`:** the authoritative final reply. A
   consultant-mode proposed menu is just assistant text, so it survives a reload
   and can be applied later ("apply it").
4. **`clear()`:** delete this week's household rows (`delete where week_start = X`,
   RLS-scoped) + clear local state.

Persistence failures are non-fatal: a failed insert logs and is swallowed so the
live chat keeps working (the transcript is a convenience, not the source of
truth — the meals are).

## PlanPage wiring

Expose `loadingHistory` from the hook; `MealChatRail` / `MealChatSheet` show a
brief loading state while history loads. No change to `PlanPage`'s plan/grid
logic.

## Out of scope (YAGNI)

- Live realtime cross-device sync of the chat (open-the-page-to-load is enough;
  meals already have realtime for the grid). Can be added later by subscribing
  to `meal_chat_messages` the way `useMealPlan` subscribes to entries.
- Message caps / retention (a week's planning thread is naturally bounded).
- The pre-existing duplicate/empty `meal_plans` rows (unrelated to this bug).

## Testing

Extend `useMealPlannerChat.test.ts` (mocked supabase client):
- loads history on mount and seeds `messages`;
- persists the user message on `send` and the assistant message on `done`;
- `clear()` deletes the week's rows and empties local state;
- existing SSE-parsing (`parseSseEvents`) tests unchanged.

Suite runs green only under node 22.14.0 (documented trap).

## Verification

Run the app, open `/meals`, chat a message, navigate away and back — the
conversation restores. Confirm a second device / the wall (household RLS) sees
the same thread.
