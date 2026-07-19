# Meal Plan Week Range (Partial Weeks) — Design

**Date:** 2026-07-19
**Status:** Approved by Scott (chat, 2026-07-19)

## Problem

A meal-plan week is always Sunday→Saturday. Real weeks aren't: the family was
away through Monday evening, so the week of Jul 12 effectively ran Tuesday→
Saturday. Today the grid still shows Sunday and Monday, the chat consultant
proposes meals for them, and the grocery list includes them.

## Decision

A plan stays anchored to its Sunday (`week_start` unchanged, `day_of_week`
0=Sun–6=Sat unchanged), but gains an **active range** — a contiguous
`starts_on`…`ends_on` span **within** that calendar week. The range is settable
from both the chat and a header control. Days outside the range are hidden.

Explicitly rejected:

- **Cross-week ranges** (e.g. Fri→next Tue): breaks the `week_start`/
  `day_of_week` model, ripples into the wall card, seeder, and chat tools.
  Scott's case (late start / early end within a week) doesn't need it.
- **Per-day active mask** (skip Wednesday): slot-level clearing already covers
  one-off skips.
- **Client-side-only range**: the chat consultant couldn't see or set it.

## Schema

```sql
ALTER TABLE meal_plans
  ADD COLUMN starts_on date,
  ADD COLUMN ends_on date,
  ADD CONSTRAINT meal_plans_range_within_week CHECK (
    (starts_on IS NULL OR (starts_on >= week_start AND starts_on <= week_start + 6))
    AND (ends_on IS NULL OR (ends_on >= week_start AND ends_on <= week_start + 6))
    AND (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
  );
```

- `NULL` means "no bound on that side" — both null is the full week, so every
  existing plan behaves exactly as today.
- Applied via the Supabase Management API (`POST /v1/projects/{ref}/database/query`)
  because local migrations are out of sync.
- `meal_plans` is added to the realtime publication if not already present, so
  a chat-set range updates the open grid live (entries already stream via
  `meal_plan_entries`).

## Client

**Types / hook (`useMealPlan`)** — `MealPlan` gains `startsOn: string | null`
and `endsOn: string | null` (ISO dates). The hook exposes
`setWeekRange(startsOn, endsOn)` which updates the plan row (creating the row
first if the week is still virgin, same as `addMeal` does). A realtime
subscription on `meal_plans` (filtered by plan id) refreshes the range when the
edge function writes it.

**Range helpers (`lib/weekHelpers.ts`)** — one derivation used everywhere:
`activeDayRange(plan)` → `{ firstDay, lastDay }` as day-of-week numbers
(defaults 0/6 when unset). No component computes the range itself.

**Header (PlanPage)** — when the range is partial, the heading area shows
"Tue Jul 14 – Sat Jul 18"; a small edit control (lucide icon, no emoji) opens a
popover with start-day and end-day pickers limited to that week's 7 days, plus
"Full week" to reset (writes nulls).

**Grid (WeekGrid)** — receives the active range and renders only rows for days
inside it. One subtle line notes the skipped days ("Sun – Mon not planned").
Entries on hidden days are **kept** in the database and reappear if the range
widens. The "→ lunch tomorrow" leftover action stops at the range's last day
(previously hard-coded Saturday).

**Groceries (`useGroceryStatus`)** — consolidation skips entries whose
`day_of_week` falls outside the active range.

## Chat (edge function `meal-planner-chat`)

- New tool `set_week_range({ starts_on, ends_on })` — nullable args, validated
  against the week bounds, RLS-scoped update of the plan row (create-if-missing
  like other tools).
- The plan's current range is injected into the consultant context, and the
  system prompt is extended so: (a) "we're away until Monday night" → set the
  range and plan only active days; (b) proposals never cover out-of-range days.

## Untouched

Wall dinner card, `scripts/seed-weekly-dinners.mjs`, cook mode, wall v1
widgets, `day_of_week` semantics, `synthesizeMealEvents` (timeline flag is off;
if flipped later, filtering by range is a follow-up noted here).

## Edge cases

- **Entries stranded outside a narrowed range**: kept, hidden from grid and
  groceries. The wall could still surface them on their day; accepted as rare
  and non-destructive (narrowing usually happens *because* nobody is home to
  look at the wall).
- **`ends_on` before today mid-week**: allowed — Scott's own example ended the
  week on Saturday retroactively.
- **Week navigation**: each week's range is its own; navigating never carries a
  range over.

## Testing

- `weekHelpers` unit tests for `activeDayRange` (null/partial/full).
- `WeekGrid` tests: partial range renders only active rows + skipped-days note;
  leftover-tomorrow hidden on last active day.
- `useMealPlan` test: `setWeekRange` writes columns and creates the plan row on
  a virgin week.
- Edge function: prompt/tool changes covered by existing deploy checks
  (`--use-api`); tool validation mirrors client constraint.
