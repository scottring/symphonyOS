# Spec — Placement cascade: month → week → day → time

**Written:** 2026-07-24 · **Author:** Scott + Claude (session ending in `ebbf04f2`)
**Status:** SHIPPED to prod 2026-07-24 (all five phases + one follow-up fix). See "What shipped" at the bottom.
**Kickoff line for a fresh session:** *"Read `tasks/2026-07-24-placement-cascade-week-rows.md` and implement it."*

---

## The model Scott asked for

Each horizon places into the **next rung down, and no further**:

| Surface | You place a… | onto a… | It gains |
|---|---|---|---|
| `/month` | month move | **week** (a grid ROW) | a week, no day |
| `/week` | week move | **day** | a day, no time |
| `/today` | day item | **time slot** | a time |

The point: a month move should not have to pretend it knows which Tuesday. Each
descent asks for exactly one more decision than the rung above.

## What actually happens today (the two broken rungs)

1. **Month places straight onto a day.** `MonthCalendarGrid` drop targets are day
   cells (`onPlaceTask?: (taskId: string, day: Date)` — `MonthCalendarGrid.tsx:22`,
   fired at `:189`). `MonthPage.tsx:264` writes
   `{ bucket: 'timed', scheduledFor: day, isAllDay: … }`. The week rung is skipped
   entirely. (Week ROWS already exist in that grid as a hover affordance —
   `hoverRow` + the "Open week →" chip, `MonthCalendarGrid.tsx:166-232` — so the
   row geometry is there; it just isn't a drop target.)
2. **Week places onto a day AND an hour.** `PlanningSession.tsx:176` builds
   `new Date(y, m, d, quickCreate.hour, quickCreate.minute)`. That's Today's job.

Rung 3 (Today assigns times) already matches the model. Nothing to do there.

## The data decision

Day-with-no-time already exists: `scheduled_for` + `is_all_day = true`.

**Week-with-no-day does not exist.** `bucket='week'` implicitly means *the current*
week — which is also the root of the known week-boundary schism (mid-period
sessions planning the past; see memory `planning_cascade_walkthrough_findings`).

**Decision: add a `week_start` date column.** `bucket='week'` + `week_start='2026-07-20'`
= "the week of the 20th". Additive; preserves the invariant that `scheduled_for`
implies `bucket='timed'` (`today_view_timed_bucket_invariant`); makes *any* week
addressable instead of only this one.

Rejected: overloading `scheduled_for` with a `granularity` enum — it breaks the one
invariant the codebase currently trusts, and every existing `bucket === 'timed'`
read would need auditing (8 call sites read `bucket === 'week'`; far more read timed).

### Migration

`supabase/migrations/2026-07-25_tasks_week_start.sql`:

```sql
alter table tasks add column if not exists week_start date;
comment on column tasks.week_start is
  'Which week a bucket=week task belongs to (that week''s start date, per the user''s weekStartsOn). NULL = the current week, legacy behavior.';
create index if not exists tasks_week_start_idx on tasks (week_start) where week_start is not null;
```

Apply via the Management API (migrations are out of sync — see CLAUDE.md /
memory `reference_supabase_management_token`), then commit the file so the
history stays honest.

**`week_start` is NULL for every existing row, and NULL must keep meaning "the
current week."** No backfill. That keeps today's behavior intact for anything
planned before this ships.

### The column's full footprint

`week_deferred_at` is the exact template — copy its five touch points:

- `src/hooks/useSupabaseTasks.ts:68` — `DbTask` type
- `src/hooks/useSupabaseTasks.ts:138` — `dbTaskToTask` mapping
- `src/hooks/useSupabaseTasks.ts:937` and `:1053` — **both** update paths
  (`if ('weekStart' in updates) dbUpdates.week_start = …`)
- `src/hooks/dbTaskToTask.test.ts` — the mapping test
- `src/types/task.ts` — `weekStart?: Date`

Serialize as a **date string (`YYYY-MM-DD`), not an ISO timestamp** — it's a
`date` column, and `toISOString()` would shift it west of Greenwich. Use the
`localYmd` pattern already in `MonthPage.tsx:30`.

## Phases

Do them in order; each one ends green and pushable on its own.

### 1. The column (no UI change)

Migration + the five touch points + `weekStart` on the `Task` type. Test:
`dbTaskToTask` round-trips `week_start`, and `updateTask({ weekStart })` writes
the date string. **Nothing reads it yet** — ship this rung solid before anything
depends on it.

### 2. `weekOf()` helper + the week pool reads it

New pure helper (put it next to `weekStartAnchor` in `src/lib/cadence/config.ts`,
which already respects the user's `weekStartsOn` — **never hardcode Monday**;
memory `horizon_canvas_program`).

`selectHorizonPool` (`src/lib/today/horizons.ts:21`) currently filters
`bucket === def.bucket`. For `horizon === 'week'` it must become:
`bucket === 'week' && (weekStart == null || weekStart === <the viewed week's start>)`.

Tests first, in `src/lib/today/horizons.test.ts`:
- a `week_start` matching the viewed week is in the pool
- a `week_start` for a *different* week is NOT
- `week_start = null` is still in the pool (legacy rows keep working)

Audit the other 7 `bucket === 'week'` readers (`InboxView`, `PlanningSession`,
`WriteListStep`, `ScheduleGridStep`, `WhenPicker`, `useSystemHealth`,
`shared.tsx`) and decide per site whether it wants "any week" or "this week."
Most want "this week." Write down the verdict for each in the PR body.

### 3. Month grid: week ROWS become the drop target

`MonthCalendarGrid.tsx` — change the drop surface from the day cell to the row.
The row-hover machinery (`hoverRow`, the row wash at `:194`) already exists;
extend it to `onDragOver`/`onDrop` on a row-level wrapper and drop the per-cell
drop handler. New prop:

```ts
onPlaceTaskInWeek?: (taskId: string, weekStart: Date) => void
```

Keep `onPlaceTask` (day-level) — the **week** grid and any other caller still
need it. The month page simply stops passing it.

`MonthPage.tsx:264` becomes:

```ts
onPlaceTaskInWeek={(id, weekStart) => updateTask(id, { bucket: 'week', weekStart })}
```

Note `scheduledFor` is deliberately NOT set — that's the whole point, and it
keeps the timed invariant true.

Also needs updating on that page: `monthPlacedCount` (`MonthPage.tsx:61`) counts
`bucket === 'timed'` inside the month. A month move placed on a week is now
"placed" too, so the masthead count must include `bucket='week'` rows whose
`week_start` falls inside the viewed month — otherwise placing something makes it
vanish from both counts and the page reads as if work disappeared (the
`allday_lane_drop_visibility` failure mode).

Tests: `MonthCalendarGrid.test.tsx` — dropping on a row calls
`onPlaceTaskInWeek` with that row's first day; day cells no longer call
`onPlaceTask` when the prop is absent.

### 4. Week grid: a day, no time

`PlanningSession.tsx:176` — when the drop is a day-level placement, write
`scheduled_for` at midnight + `is_all_day: true` instead of the hour. Times are
Today's job. The all-day lane already exists on the week grid
(`month_shelf_allday` memory), so this is a change of what a drop *means*, not
new UI.

Watch the `+N overflow` trap: an all-day drop that lands behind "+2 more" reads
as data loss (`allday_lane_drop_visibility`). Verify the dropped item is visible,
not just written.

### 5. Copy + explainers

The horizon explainers and the month/week identity lines still describe the old
model ("Moves — concrete chunks that fit in a sitting" on `MonthPage`). Update
them to name the rung: month = "which week", week = "which day", today = "what
time."

## Invariants that must survive

- `scheduled_for` non-null ⇒ `bucket === 'timed'`. A week placement sets neither.
- `week_start = null` ⇒ "the current week." Legacy rows must not vanish.
- Never hardcode the week start; read `weekStartsOn` from `readCadenceConfig()`.
- Threading (`source_id` / `goal_id`) is orthogonal to placement — a descent must
  never clear the thread. Add a test for that: placing a threaded month move on a
  week keeps `source_id` and `goal_id`.

## Verification before claiming done

- `npx vitest run` (NOT `npm test` — that's watch mode)
- `npx tsc -b` — build mode, stricter than the pre-push `tsc --noEmit`; this is
  the documented Vercel-build trap
- `npm run build`
- `npm run lint` (CI lints, pre-push doesn't)
- Walk it in prod on real data at **app.symphony-os.com** (`symphony-os.com` 404s):
  drag a month move onto a week row, confirm it appears on `/week` for that week
  and NOT on a day; drag it to a day, confirm no time; open Today, confirm you
  can give it a time.
- Verify the deploy actually happened (`gh api repos/scottring/symphonyOS/deployments`)
  — a push to `main` sometimes doesn't trigger one.

## Working rules for this repo

Work in a worktree off `origin/main` (`git worktree add .worktrees/<task> -b <branch>`,
`cp .env` into it), never in the main worktree. Push with `git push origin HEAD:main`
when green — every push to `main` deploys to prod.

## Open questions for Scott

1. **Does a week placement survive the week?** If Sunday arrives and the item was
   never given a day, does it stay on that (now past) week, roll to the next, or
   land back on the month shelf? My recommendation: it surfaces in the next weekly
   session's carry-over rather than silently rolling — the same "actively choose
   its fate" rule the review steps already use.
2. **Should the month grid keep any day-level drop?** e.g. a hard-dated item like
   "dentist Tuesday" placed from the month view. My recommendation: no — send it
   through the week rung like everything else, and use the existing "Pick date"
   triage affordance for genuinely dated things.
3. **Does the wall need to know?** The kiosk reads day-level items only, so a
   week-placed item is invisible there. Probably correct, but worth confirming.

---

## What shipped (2026-07-24)

All five phases are on `origin/main` and deployed to prod. Each shipped green and
separately:

| Commit | Phase |
|---|---|
| `2aaf204b` | 1 — `week_start` column, both update paths, local-date serialization |
| `a42cd124` | 2 — `belongsToWeek` + all six week readers scoped |
| `2c46e167` | 3 — month grid: week ROWS are the drop target, + the row lane |
| `03d39a1d` | 4 — week grid: a drop picks the day, + the all-day lane grows |
| `3d175141` | 5 — copy and explainers name each rung |
| `bb7bc0ea` | follow-up — a day-grain CREATE must be all-day (found in prod) |

### Answers to the open questions

1. **A week placement that never gets a day** → it stays on that week and the next
   weekly session surfaces it as carry-over. *Not implemented yet* — nothing rolls
   or clears `week_start` on its own, which is the correct interim state (the item
   stays visible on its week). The carry-over surfacing is the remaining work.
2. **Day-level drop from the month grid** → removed. `MonthCalendarGrid` still
   supports `onPlaceTask` for the year page's month peek and the guided calendar
   step; `MonthPage` passes only `onPlaceTaskInWeek`.
3. **The wall** → unchanged, day-level only. A week-placed item is invisible on
   the kiosk until it gets a day.

### Decisions made during implementation, not in the original spec

- **`belongsToWeek` vs `isPlacedOnWeek`.** Pools ask "should I show this?" and
  want legacy NULL rows included. The month grid asks "did this land in THIS
  row?" and a NULL must answer no, or it repeats in all six rows. Two functions,
  in `src/lib/today/weekPlacement.ts`.
- **A week placement CLEARS `scheduled_for`.** Dropping an already-dated chip on a
  row means "move it to that week"; keeping the date with `bucket='week'` would
  break the invariant that a date implies `bucket='timed'`.
- **The month row grew a lane.** A week-placed item has no date (no cell) and is
  no longer `bucket='month'` (no shelf) — without the lane it vanished.
- **`placementGrain` on `PlanningSession`.** It serves both the week rung and
  Today from one component, so the grain is a prop (`'day'` for /week and the
  weekly session, `'time'` — the default — for Today).
- **The all-day lane grows.** With every week placement landing there, the fixed
  two-chip lane hid the third. The grid now sizes the lane from its busiest day;
  math in `src/lib/planning/allDayLane.ts`.

### Verified in prod (app.symphony-os.com, Scott's account)

Dropped a move on the week-of-Jul-19 row: DB wrote
`bucket='week', week_start='2026-07-19', scheduled_for=null`; it left the shelf,
appeared in that row's "This week" lane, the masthead placed-count went 11 → 12,
and `/week?start=2026-07-19` showed it while `?start=2026-07-26` did not. The
day-grain create was verified by clicking a slot (midnight, not the slot's hour).
Test rows were deleted afterwards.

**Not exercised end-to-end:** the drag from the /week shelf onto a day. dnd-kit
drags can't be synthesized reliably from browser automation — that one gesture
is covered by unit tests only and is worth one manual drag.
