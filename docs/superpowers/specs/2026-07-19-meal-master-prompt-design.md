# Meal Master Prompt — Design

**Date:** 2026-07-19
**Status:** Approved, implementing

## Problem

Standing meal-planning preferences ("wholesome, veggie-heavy, family of four,
dinners that make leftovers, Friday date night") already live in the
"Household Meal Preferences" note and are read by both AI surfaces
(`meal-planner-chat`, `meal-slot-suggest`). But:

1. There is **no UI** to see or edit that master prompt — it changes only via a
   chat tool, so it's invisible and hard to adjust.
2. There's **no clear master-vs-one-off distinction**: a scenario tweak ("kids
   home this Friday") could get baked into the standing prompt.
3. It's **private to Scott's account**, so it doesn't apply when Iris plans
   logged in as herself — even though the meals themselves are household-shared.

## Goal

Make the "master prompt" a first-class, easily-editable, household-shared
instruction that always applies, while keeping in-conversation tweaks one-off by
default.

## Design

### 1. Reuse the existing note (no new table)

The "Household Meal Preferences" note IS the master prompt. There is one
canonical note per household; everything reads/writes that single row. Canonical
resolution = the **oldest** household note titled "Household Meal Preferences"
(`order by created_at asc limit 1`) — the same "oldest wins" rule
`useMealPlan`/`resolvePlanId` already use, so read and write never diverge.

### 2. Household-shared — no migration, just scope

`notes` already has household RLS: `auth.uid() = user_id OR (scope IN
('couple','compound') AND users_share_household(...))`. The note's scope is
currently `individual`. Setting it to **`couple`** (the two adults) lets Iris
read *and* update the same note from her own login. One idempotent data update:

```sql
update notes set scope = 'couple'
where title = 'Household Meal Preferences' and scope = 'individual';
```

New-note creation (editor or `update_preferences`, only if none exists yet) sets
`scope = 'couple'`; updates never downgrade scope.

### 3. Preferences editor (client)

- **`useMealPreferences()`** — resolves the canonical household note; exposes
  `content`, `loading`, `error`, `save(content)`. `save` updates the note by id
  (or inserts a `couple`-scoped one if none exists).
- **`MealPreferencesModal`** — a simple panel: a large textarea holding the
  master prompt, a one-line explainer ("Standing instructions the planner always
  follows. Tweaks you make in chat for a single week don't change this."),
  Save / Cancel.
- **Entry point** — a "Preferences" button in the Meals plan header (beside
  "Build shopping list"), opening the modal.

### 4. One-off guardrail (both edge functions)

`meal-planner-chat` system prompt gains an explicit rule:

> The Household Meal Preferences note is the MASTER prompt — always apply it. For
> a request about a single week ("kids home this Friday", "we're away Monday"),
> adjust ONLY that week's plan — do NOT call update_preferences. Call
> update_preferences ONLY when the user states a STANDING change ("from now on",
> "always", "never again", "update my preferences / master prompt"). When you do,
> tell them plainly, e.g. "Updated your standing preferences."

`update_preferences` writes to the canonical note by id (preserving scope);
inserts a `couple`-scoped note only if none exists. Both edge functions resolve
the prefs note oldest-first so they agree on the canonical row.

## Out of scope (YAGNI)

- Structured/section-based preference editor (free-text is what "a master prompt"
  means; the AI reads it verbatim).
- "Promote a chat tweak to the master" affordance (chosen model is one-off by
  default; explicit "from now on" already promotes).
- Broadening notes RLS generally (only this one note becomes shared, via scope).

## Testing

- `useMealPreferences.test.ts` — loads canonical content; `save` updates by id.
- `MealPreferencesModal.test.tsx` — renders content, Save calls `save`, Cancel
  closes without saving.
- Edge functions verified live (Deno, not in vitest): the guardrail prompt, and
  an RLS probe that Iris can read + update the `couple`-scoped note.

## Verification

Open Meals → Preferences → edit → Save → reopen shows the change. RLS probe: as
Iris, select and update the note (allowed once scope=couple); as an unrelated
user, not visible. In chat, "kids home this Friday" adjusts only the week;
"from now on, no red meat" updates the master and says so.
