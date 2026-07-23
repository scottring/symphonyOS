# Month shelf + week all-day lane

**Date:** 2026-07-22 (evening)
**Status:** Approved (Scott, one-gate approval after /week shelf shipped in 5117f374)
**Branch:** `month-shelf`

Two features, one branch. Both extend the /week shelf system shipped earlier
today (spec: `2026-07-22-week-page-shelf-redesign-design.md`).

## Feature 1: All-day lane on the week hour grid

**Problem:** The hour grid's only drop targets are 30-minute slots. Tasks that
belong to a day but not a time ("return the sweater Thursday") can't be placed
without inventing a clock time. Worse, all-day tasks scheduled within the
visible week are currently forced back into the unscheduled pool
(`PlanningSession`'s `allUnscheduledTasks` includes every `isAllDay` task), so
placing one is impossible and existing ones read as unplaced.

**Design:**
- `PlanningGrid` gets an **"All day" lane** between the day headers and the
  first hour row: one droppable per visible day, id `allday-YYYY-MM-DD`
  (dnd-kit, same DndContext).
- Dropping a task there → `bucket:'timed'`, `scheduledFor` = that day (local
  midnight), `isAllDay: true` — one `onUpdateTask` call (timed-lockstep rule).
  Past-day drops refused via the same `minDropDate` check + notice as slots.
- Tasks with `isAllDay && scheduledFor` **within the visible range** render as
  compact chips in the lane on their day (draggable): chip → hour slot gives
  it a clock time (`isAllDay:false`), chip → shelf/drawer unschedules (existing
  `unscheduled-drawer` drop). Chips click through to the detail panel like
  placed blocks do.
- `PlanningSession`'s unscheduled derivation changes: an `isAllDay` task whose
  `scheduledFor` falls inside the grid's date range belongs to the LANE, not
  the pool. All-day tasks with no date (or out-of-range past dates) keep
  today's behavior (pool, so they can be placed).
- Lane renders in BOTH drawer mode (wizard) and shelf mode (/week) — it's part
  of the grid, not the pool. Scope: tasks only; all-day calendar events keep
  whatever rendering they have today.

## Feature 2: /month gets the shelf treatment

**Current state:** MonthPage = masthead, CascadeRail block, identity line
("Moves — concrete chunks…"), `MonthCalendarGrid` (drag-to-place works, native
HTML drag via `text/task-id`), reference fold (season picks), then list
sections. Of those sections, "Carried over" and "Placed this week" are ALREADY
dead on month (both selectors are week-only, always empty) — the live
duplication is the project-grouped + loose pool rendered as heavy
`DenseInboxRow`s that double as the drag source for the grid.

**Design:**
- **Masthead** like /week's: rail compacted to the top-right breadcrumb
  (CascadeRail inline), Plan-the-month + explainer links under it. Identity
  line ("Moves — …Serving X of Y picks.") stays.
- **Shelf above the month grid** (below the identity line): `PlanningShelf`
  reused with a new **`dragMode: 'native' | 'dndkit'`** prop (default
  `'dndkit'`, /week unchanged). In native mode pills are `draggable` elements
  setting `text/task-id` dataTransfer (the `PlacementChip` convention
  MonthCalendarGrid already accepts) instead of dnd-kit draggables; the shelf
  container is a native drop target that unschedules
  (`bucket:'month'`, `scheduledFor: undefined` — mirrors the page's existing
  `onUnscheduleTask`).
- Month shelf grouping/interactions identical to week: project pills grouped
  (no carried-over group on month — the concept is week-only), titles never
  truncate, ~8-pill cap + expander, click opens detail panel, ⋯ menu (Open /
  **To week** / Put aside / Delete — "To month" becomes "To week" at this
  altitude), add-pill with the month grain placeholder ("Add a chunk to this
  month — an order placed, a call made…").
- **Reference fold stays** directly below the grid — look-don't-link untouched.
- **Deleted:** the dead Carried over / Placed this week JSX, project sections,
  loose list, bottom add-input. Every month task renders exactly once: on a
  grid day or on the shelf.
- MonthCalendarGrid: gains `hideRail?: boolean` (default false). The grid has
  its OWN built-in rocks rail today (the dashed drag-source strip) — with the
  shelf in place that rail is redundant, so MonthPage passes `hideRail` to
  hide it while keeping cell drag/drop fully live (unlike `readOnly`, which
  kills both). The shelf's native drop target takes over the rail's
  unschedule role. Cell drop logic otherwise untouched; other callers
  unaffected.

### Tend on month

- Same ✦ Tend button on the month shelf; same review-mode cards.
- `tend-week` edge fn gains an optional **`grain: 'week' | 'month'`** body
  param (default `'week'`, existing callers unchanged). Month grain changes
  the prompt only: proposals may `regrade` to `'week'` (small enough to do
  this week), `'season'` (too big for a month), or `'someday'`; `place`
  proposals land on a `date` with **no time** (grid placement is day-granular)
  anywhere in the current month not before today.
- Client: `TendRegrade.to` union widens to `'week' | 'month' | 'season' |
  'someday'`; `applyProposal` maps regrade through `setBucket` (season =
  bucket `'quarter'`); validator accepts the widened union filtered by an
  allowed-set argument per grain (week grain allows month/someday as today;
  month grain allows week/season/someday). `place` with no `time` on month
  applies `bucket:'timed'` + `scheduledFor` midnight + `isAllDay: true`
  (matches what a manual grid placement produces… note: manual
  `onPlaceTask` today sets no `isAllDay`; the apply mirrors the LANE
  convention — day-placed without time = all-day).
- `useTendWeek` gains `grain` in its args, passes it through, and the
  place-date window for month grain is `[today, end of current month]`.
- Prepass (dupes/stale) reused as-is — horizon-agnostic already.

## Addendum 2026-07-23: Best Laid Plans reframe (approved)

After reviewing how Hart-Unger's *Best Laid Plans* treats the month (list
curated against a calendar landscape; day-slotting only for date-certain
items; pull-down = migration at weekly planning), the month page drops the
"placement queue" framing:

1. **Full width.** Masthead + identity line keep `PAGE_COLUMN`; shelf +
   calendar + reference fold take the full viewport width (mirrors /week).
2. **Cell chips wrap, never truncate.** `PlacementChip` gains `wrap?: boolean`
   (default false — other call sites unchanged); MonthCalendarGrid passes it
   for task and event chips. Month rows may grow vertically.
3. **Shelf reframed as the month list.** `PlanningShelf` gains
   `poolLabel?: string` (default `'To place'`); MonthPage passes
   `"<Month>'s moves"` (e.g. "July's moves") derived from `viewedDate`.
4. **Masthead subtitle** becomes `"{placed} on the calendar · {pool} in
   motion · {done} done"` where done = completed tasks belonging to the
   month (bucket month, or scheduledFor inside it) — the "celebrate wins"
   step. The "placed / to place" pressure framing is gone.
5. Unchanged: day-drops (date-certain items), Tend, ⋯ To week migration,
   reference fold, /week page.

## What this touches

- `src/components/planning/PlanningGrid.tsx` (+ column/header pieces as
  needed) — all-day lane.
- `src/components/planning/PlanningSession.tsx` — unscheduled derivation
  excludes in-range all-day tasks; drop handling for `allday-` targets.
- `src/components/planning/PlanningShelf.tsx` — `dragMode` prop; menu label
  per grain; carried-over group optional.
- `src/apps/tasks/horizons/MonthPage.tsx` — page restructure.
- `src/apps/tasks/horizons/shared.tsx` — return-object additions only if
  month needs something not yet exposed.
- `src/lib/tend/{types,validate,applyProposal}.ts`, `src/hooks/useTendWeek.ts`
  — grain support.
- `supabase/functions/tend-week/index.ts` — grain param + month prompt.
- Tests alongside each.

**Not touched:** guided wizard behavior (lane appears there too, but drawer
mode + routines + everything else unchanged), MonthCalendarGrid drop logic,
Week page (beyond the lane appearing), Season/Year/Someday pages, reference
fold.

## Testing

- Unit: lane drop id parsing + isAllDay placement writes; unscheduled
  derivation excludes in-range all-day tasks; shelf native-drag mode sets
  `text/task-id`; validator grain unions; applyProposal regrade/all-day place
  mappings; month smoke test (sections gone, task renders once, Tend button
  present).
- Existing suites must stay green (wizard/PlanningSession/week smoke).
- Manual (browser, pre-ship): lane drop on /week; month shelf pill →
  grid cell native drag; month Tend round-trip.

## Out of scope

- All-day calendar events in the lane; multi-day spans.
- Tend on Season/Someday.
- The /week follow-ups list from the earlier ship (masthead counts, vestigial
  planner header, etc.) — separate pass.
