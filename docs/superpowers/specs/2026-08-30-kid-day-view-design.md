# Kid Day View — per-member checklist page on the wall

**Date:** 2026-08-30
**Status:** approved in chat, pending spec review
**Scope:** replaces the legacy `/morning` and `/bedtime` kid checklists with one
data-driven, per-member day page inside wall-v2, and adds target steps
("read a chapter book for at least 20 minutes") with per-day progress logging.

Ordering note: this ships **before** overhaul steps B (the visibility board) and
C (closing the chat gap). Step A (`resolveRoutine`) is already on main.

## Problem

Two half-built things, one underlying gap:

1. `MorningLaunchView` and `BedtimeView` (`src/components/wall/contexts/`) are
   the live kid checklists. When a kid's assigned steps come back empty they
   substitute **hardcoded default steps whose taps do not persist**. They also
   only cover two dayparts.
2. There is no way to track a quantity goal — "read ≥20 min today" — anywhere.
   Routines are binary; nothing carries a target or a running total.

These are the same feature: the tracking surface *is* the kid checklist done
properly.

## Decisions already made (in chat, 2026-08-30)

- **One screen per member, whole day** (not per-daypart screens, not a separate
  goals board). Entry: tap the member's portrait/name in their wall lane header.
- **Logging model: tap-done with a minutes chip**, not a kiosk timer and not
  parent verification. Sessions add up; the step ticks itself at target.
- Surface lives **inside `WallV2Shell` as a full-screen view** (recipe-viewer /
  list-sheet pattern), not a separate route. The kiosk tab never navigates away.
- Streaks appear **only on the member's own page**, one quiet line, target steps
  only. Nothing count-like on the main board (standing no-scoreboards rule).
- `/morning` and `/bedtime` redirect to `/wall-v2`; the two legacy views and
  their hardcoded-default code are deleted.

## Data model

One migration. **DDL is run by Scott in the Supabase SQL editor before any code
lands** (the classifier blocks the Management API curl; standing rule).

```sql
alter table routines
  add column target_amount integer,
  add column target_unit text check (target_unit in ('minutes', 'count'));

alter table actionable_instances
  add column progress integer;
```

- `target_amount` + `target_unit` on `routines`: "Read 20 min" = `20/'minutes'`;
  "Practice 3 songs" = `3/'count'`. Both null = plain checkbox step (all
  existing rows). A row with exactly one of the two set is invalid — the UI
  never writes that; no DB constraint beyond the check above (keep the
  migration additive and trivial).
- `actionable_instances.progress`: the day's running total, in the step's unit.
  One row per member-step-day (existing
  `unique(user_id, entity_type, entity_id, date)` holds). Status flips to
  `completed` when `progress >= target_amount`.
- Target editing: a "Target" control (amount + minutes/count) in
  `TapStepPanel` and `TapRoutinePanel`, hidden-by-default like other optional
  fields. Clearing it nulls both columns.

No new tables. No change to assignment/scope/context columns.

## The page: `KidDayView`

`src/components/wall-v2/KidDayView.tsx` (name notwithstanding, it renders for
**any** family member — Scott and Iris get one for free; no kid special-casing).

**Entry/exit:** tapping the portrait/name in a `WallV2PersonLane` header opens
the view for that member. Back arrow and the existing idle auto-return both go
back to the board.

**Content, top to bottom:**

- Member name + date masthead.
- Items for that member today, resolved with `resolveRoutine`
  (`member` = them, `prefs.domain = 'universal'`, `date` = today):
  - **Collections** render as titled checklists with their ordered steps
    (raw-row retention as on Today — the rung-6 caveat applies here too).
  - **Loose steps and assigned tasks** group into Morning / Afternoon /
    Evening / Anytime bands via `effectiveTimeOfDay`.
- Empty band = not rendered. Fully empty day = "Nothing on your list — go
  play." Never hardcoded defaults.

**Rows** (kiosk-scale tap targets, wall touch conventions):

- Plain step/task: tap toggles done, via the existing `markDone`/`undoDone`
  wall path. Optimistic, refetch after.
- Target step: shows progress ("12 of 20 min") + a progress ring. Tap opens a
  chip row — **+5 / +10 / +20 / custom** for minutes, **+1 / custom** for
  count — each tap adds to today's progress. Auto-completes at target.
  Tapping the number itself sets an exact value (the correction path, including
  overshoot fix-ups by a parent).
- Streak line on target steps only ("4 days in a row"), computed from the last
  30 days of instances.

## Data flow

- **Read:** reuse the wall's already-polled routine/task/instance data for
  today. On open, fetch that member's last-30-day `actionable_instances` for
  streak + progress history (one query, on-demand, not in the poll loop —
  egress rule).
- **Write:** one new mutation `addProgress(entityId, date, amount)` — upsert
  the day's instance row, increment `progress`, set `status='completed'` +
  `completed_at` when the total reaches target. `setProgress` variant for the
  exact-value correction. Both live beside `markDone` in the wall's instance
  hook so the wall keeps a single mutation path.
- Pure model in `src/lib/wall/kidDayModel.ts`: banding, collection grouping,
  progress math (`progressFor`, `streakFor`), all testable without the kiosk.

## Edge cases

- Target step with no assignee: appears on nobody's page (rung 5, same as
  everywhere). The Rhythm/Tend drawer already surfaces unassigned routines.
- Progress on a day the step doesn't recur: unreachable from the UI (the page
  only shows today's resolved items).
- Un-completing a target step: tapping the completed row reopens the chip row;
  "reset today" lives behind the custom/exact-value control, and undo uses
  explicit state (never re-toggle — standing rule).
- Deleting the legacy views removes 2 of the 6 `days[].items` consumers; the
  remaining four (`wallGantt.itemsFor` and `wallV2Adapter.dedupeRoutines`
  among them) get enumerated and re-surveyed in the plan so nothing regresses.

## Testing

- Unit: `kidDayModel` (banding, grouping, progress, streak), chip math,
  target-edit persistence in the panels.
- Component: `KidDayView` — bands render, chips add up, auto-complete at
  target, exact-value correction, streak line, empty state, back/idle return.
- Routing: `/morning` and `/bedtime` redirect to `/wall-v2`.
- Visual: the 1024×768 iframe/screenshot check on the board after the
  lane-header tap wiring (standing wall rule).

## Out of scope

- A kiosk countdown timer for reading (possible later add on top of the same
  progress column).
- Overhaul steps B (visibility board) and C (chat gap) — queued next.
- The `show_on_timeline` rung-3 audit/backfill (still open from step A,
  independent of this).
- Any streak/count surfacing on the main board or Today.
- Parent verification flows.
