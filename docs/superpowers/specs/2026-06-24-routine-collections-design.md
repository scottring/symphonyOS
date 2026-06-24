# Routines as Collections — Model, Timeline & Completion (Spec #1)

**Date:** 2026-06-24
**Status:** Approved design, ready for implementation plan
**Branch:** `routine-collections` (off `origin/main`)

## Problem

Today a "routine" is a single recurring event. To fake a sequence (the kids'
morning), people create five separate routines staggered a minute apart
(6:00 Get dressed, 6:02 Straighten room, 6:03 Brush teeth…). There's no concept
of a routine as a **named collection of steps**, so: routines clutter Today (each
recurring item is its own row, which is why a "hide daily routines" toggle had to
exist), and related steps (an exercise program, a bedtime sequence) have no home.

We want a **Routine** to be a named, purpose-owned collection of **Steps**, shown
on Today as **one collapsed row** ("Morning items — Next up: 7:00 AM Chin Tuck")
that expands to its steps. This unifies PT exercises, kids' routines, and habits,
and dissolves the clutter problem by consolidation instead of a hide toggle.

## Locked design decisions (from brainstorm)

1. **A Routine is a collection; a Step is an item inside it.** "Step" is the word
   in the UI, the agent, and the type names. There is no user-visible "child
   routine."
2. **Under the hood, a Step is a routine row tagged with `parent_routine_id`.**
   Steps reuse the routine machinery (dosing `times_per_day`, per-slot completion,
   `image_url`, `pin_to_timeline`). No separate steps table; existing routines
   become Steps by setting a parent — no data move.
3. **Routines are purpose-owned** (Shoulder HEP, Evening Shower, Kids' Morning).
   **Morning / Afternoon / Evening is an automatic grouping** the timeline derives
   from each step's time — never a curated entity. A step belongs to exactly one
   routine; its doses *land* in the right time band automatically (no
   double-ownership).
4. **Completion is per-Step (and per-dose).** The routine is "done" when its steps
   are done (derived, not a stored toggle). The collapsed row shows progress
   ("2 / 5") and **"Next up"** = the earliest incomplete step/dose remaining today;
   it advances as steps are checked. Order is a *pointer*, not a lock — you may
   check any step in any order. A "mark all done" affordance exists when expanded.
5. **No forced migration.** A routine with no steps renders exactly as today (hard
   backward-compat invariant). Only routines *with* steps render as collections.

## Dependencies (read before implementing)

A Step reuses fields/behavior introduced on the **`converse-ingest`** branch:
`routines.times_per_day` (dosing), `routines.image_url`, `routines.pin_to_timeline`,
`routines.project_id`, the per-slot completion scheme (slotted timeline ids
`routine-<id>#<slot>` → free-form `actionable_instances.entity_id`), and the dosed
materialization in `grouping.ts`. **Recommendation: land `converse-ingest` on
`main` before implementing this spec**, then rebase `routine-collections` onto it.
If that work is *not* present, the core collection model (parent_routine_id, steps,
non-dosed completion, time-grouping) still stands, but the **dosed-step seed
(Shoulder HEP)** must be deferred until dosing exists. The plan must state which
base it targets.

## Data model

**One additive migration:**
```sql
alter table routines add column if not exists parent_routine_id uuid
  references routines(id) on delete cascade;
alter table routines add column if not exists step_order integer; -- nullable; ordering within a parent
create index if not exists idx_routines_parent on routines(parent_routine_id);
```
- `parent_routine_id null` → a top-level routine (a collection if it has children,
  otherwise an ordinary recurring routine — unchanged behavior).
- `parent_routine_id = X` → a Step of collection X. `on delete cascade` so deleting
  a collection removes its steps.
- `step_order` orders steps within a collection (null sorts after ordered steps, by
  `time_of_day` then name as a stable tiebreak).

**Type layer** (`src/types/actionable.ts`):
- Add `parent_routine_id?: string | null` and `step_order?: number | null` to
  `Routine`.
- Add a derived view type:
  `interface RoutineWithSteps extends Routine { steps: Routine[] }` and a pure
  builder `groupRoutineSteps(routines: Routine[]): { collections: RoutineWithSteps[]; standalone: Routine[] }`
  that partitions a flat routine list into collections (with their ordered steps
  attached) and standalone routines (parentless, childless). Steps never appear in
  `standalone`.

## Timeline rendering

`grouping.ts` / `computeTodayData` change so a **collection** contributes **one
TimelineItem** of a new kind `'routine-collection'`, instead of its steps each
appearing individually:

- **Collapsed row** shows: routine name, **progress** (`done / total` where total =
  count of step *doses* due today, done = completed instances), and **Next up:
  `<HH:MM> <step name>`** = the earliest incomplete dose across all steps today.
- **Anchor time** = the time of that next-up dose (so the row sorts into the right
  spot chronologically and lands in the correct Morning/Afternoon/Evening band).
- **Expanded** (UI state, not stored): the ordered steps, each with its time(s) and
  a checkbox; a dosed step shows its individual doses. Reuses the existing
  per-dose completion path (slotted ids).
- **Standalone routines** (parentless, childless) render exactly as today via the
  existing `routineToTimelineItem` path — untouched.

**Auto time-grouping:** the existing `groupByDaySection` already buckets timeline
items into `allday/morning/afternoon/evening` by `startTime`. A collection's
`startTime` is its next-up dose time, so it naturally lands in the right band. No
new grouping entity. (A collection whose remaining doses span bands still shows as
*one* row at its *next* due time — the band it appears in moves through the day as
doses are completed. This is intentional: Today shows "what's next," not a static
all-day ledger.)

**TimelineItem shape** (`src/types/timeline.ts`): add `type: 'routine-collection'`
with fields `{ id: 'routine-collection-<routineId>', collectionId, title, startTime,
progress: { done: number; total: number }, nextUp?: { stepId, stepName, time, doseSlot } }`
and `steps: TimelineItem[]` (the per-dose routine items, pre-built so expand is pure
render). The collapsed/expanded toggle is local component state keyed by
`collectionId`.

## Completion flow

- Checking a step/dose writes an `actionable_instances` row exactly as a routine
  does today (entity_type `'routine'`, slotted `entity_id` for dosed steps) — **no
  new completion table or key**. The step's id is the routine-row id; the dose slot
  rides the existing slotted-id scheme.
- After any completion, `progress` and `nextUp` recompute (pure, from the day's
  instances). `nextUp` becomes the earliest *incomplete* dose by time; when none
  remain, the row is "Done" and follows the existing completed-item linger/fade.
- **Mark all done** (expanded affordance): writes a completed instance for every
  not-yet-completed dose of every step in the collection (a batch of the same
  single-dose write). Idempotent.
- **Non-sequential:** completing step 3 before step 1 is allowed; `nextUp` simply
  skips completed doses.

## Migration / seeding

- **No automatic grouping of existing routines.** Every current routine has
  `parent_routine_id = null`; childless ones render unchanged. This is a tested
  invariant.
- **Seed Shoulder HEP** (the one real collection we have, created this session):
  a one-off data step converts the existing "Shoulder HEP" into a collection and
  re-parents its three exercise routines (Median/Radial Nerve Glide, Chin Tuck) as
  its steps (`parent_routine_id = <hep routine id>`, `step_order` 1..3), and moves
  the source PDF attachment onto the collection. If `converse-ingest` is not yet on
  the base, this seed is deferred (it depends on those rows existing).
  - Note: this supersedes the `project_id`-as-program link for the HEP; the
    routine-collection becomes the program. `project_id` is left intact (harmless)
    and can be retired in a later cleanup.

## Error handling / edge cases

- **A collection with zero remaining doses today** → renders as "Done" (or is
  hidden after the linger cutoff), never as an empty/blank row.
- **A collection whose steps are all standalone-eligible** is impossible by
  construction (a step always has a parent).
- **Deleting a collection** cascades to its steps (FK). Deleting a single step
  leaves the collection intact and recomputes progress.
- **A step with no time and no dosing** sorts after timed steps within the
  collection and contributes to `total` but never to `nextUp`'s time anchor; it's
  checkable when expanded.
- **Backward-compat guard:** a routine with `parent_routine_id = null` and no
  children must produce the byte-for-byte same TimelineItem as before this change
  (regression test).

## Testing

- **Unit — `groupRoutineSteps`:** flat list → correct collections (steps attached,
  ordered by `step_order` then time) + standalone partition; a parentless childless
  routine lands in `standalone`, never as a step.
- **Unit — collection materialization:** a collection with a 2×/day step and a
  1×/day step yields one `routine-collection` item; `progress.total` counts doses;
  `nextUp` is the earliest incomplete dose; anchoring puts it in the right band.
- **Unit — next-up advance:** completing the earliest dose moves `nextUp` to the
  next; completing all → "Done"/progress complete.
- **Unit — backward-compat:** a parentless childless routine produces the identical
  TimelineItem it does today (snapshot/shape assertion).
- **Unit — mark all done:** writes a completed instance per remaining dose;
  idempotent on re-run.
- **Integration (manual):** Shoulder HEP shows as one collapsed row on Today with
  "Next up"; expanding reveals the three exercises with their doses; checking a dose
  advances Next-up; collapsing shows updated progress.

## Out of scope (later specs)

- **Creation & editing UI** (spec #2): building/reordering/grouping routines and
  steps by hand; turning existing flat routines (kids' morning) into collections.
- **Agent creates collections + "Routines & Habits" footer** (spec #3): the agent's
  `create_routine` producing a collection-with-steps in one shot (next HEP ingest
  yields a proper collection), and the time-of-day footer panel.
- Strict sequential enforcement, streaks-per-collection, per-step reminders.

## Acceptance

On Today, **Shoulder HEP** appears as a single collapsed row anchored at its next
due dose, reading "Next up: `<time>` `<exercise>`" with `done / total` progress.
Expanding shows its ordered exercise steps with their doses; checking a dose
advances Next-up and updates progress without expanding; when all doses are done
the row reads Done. Every pre-existing standalone routine on Today looks and
behaves exactly as before. No "hide daily" toggle is needed to keep Today
uncluttered — the collection consolidates its steps into one row.
