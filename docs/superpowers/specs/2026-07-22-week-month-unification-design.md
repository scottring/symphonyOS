# Week + Month Unification (Horizon Cycle 1)

**Date:** 2026-07-22
**Status:** Approved by Scott via visual companion ("ship-it" on the unified
Week+Month mockup, `.superpowers/brainstorm/3989-1784728700/content/week-month-unified.html`),
plus explicit direction: never hardcode the week start day. Program context:
Today and Year stay as-is; Season is Cycle 2; wizard-as-coach-rail is Cycle 3.

## Problem

All four horizon pages live in one 1,314-line `src/apps/tasks/HorizonView.tsx`
with zero tests on the assembled pages. Week and Month diverge from the
Rhythm design language (cards, drop states) and from each other; the seams
between horizons are missing (Month days don't open their week; Week days
don't open their Today); and `MonthCalendarGrid.tsx` hardcodes Sunday-start,
ignoring the `weekStartsOn` cadence setting — as does the Routines week strip
(`DAY_ORDER` is rendered sun-first unconditionally).

## Approved deviations from the mockup (disclosed to Scott)

- The Week page keeps its **hour-grid** (`PlanningSession`, 30-min slots,
  resize, duration-preserving drag) rather than the mockup's simple columns —
  it is strictly more capable and shared with the weekly wizard.
- `PlanningSession`'s internal dnd-kit engine **stays** (it also powers
  resize); "one drag engine" applies to day-granular surfaces (month grid,
  pools), which use the native pattern. User-felt drag behavior is unchanged.
- The **Pulse toggles are deferred** out of this cycle (the hour grid and
  month calendar already communicate density differently than flat columns).
- Pool rows are **restyled in the chip language but keep DenseInboxRow's
  triage actions** (When-menu, bucket buttons) — function over purity.

## Scope

### 1. Split the monolith (no behavior change)

`src/apps/tasks/HorizonView.tsx` →

- `src/apps/tasks/horizons/WeekPage.tsx`
- `src/apps/tasks/horizons/MonthPage.tsx`
- `src/apps/tasks/horizons/SeasonPage.tsx` (verbatim extraction, untouched visually)
- `src/apps/tasks/horizons/YearPage.tsx` (verbatim extraction of the early-return branch)
- `src/apps/tasks/horizons/shared.tsx` — the helpers/hooks/JSX pieces the
  pages genuinely share (header scaffold, CascadeRail wiring, pool selectors,
  add-composer, parking menu). Extract only what ≥2 pages use.

`HorizonView.tsx` shrinks to re-exports (`export { WeekPage as WeekView }` …)
so `TasksApp.tsx` route wiring is untouched. Every extracted page gets a
render smoke test (mock the actions context; assert the page's landmark
sections mount) — the first tests these assemblies have ever had.

### 2. Week-start correctness everywhere (Scott: "don't hardcode Sunday")

- New helper in `src/lib/cadence/config.ts`:
  `orderedWeekDays(weekStartsOn: WeekStart): number[]` returning the 7
  JS day numbers (0-6) in display order, plus
  `orderedDayKeys(weekStartsOn): DayKey[]` (sun/mon/… keys) for surfaces
  keyed by name. Unit tests for 0 (Sunday) and 1 (Monday) starts.
- `MonthCalendarGrid.tsx`: derive `gridStart` and the weekday header row
  from `weekStartsOn` (kill `1 - first.getDay()` and the literal
  `['Sun', …]` array).
- Routines week strip: `WeekStrip.tsx` (and its pulse mode) renders columns
  in `orderedDayKeys` order instead of raw `DAY_ORDER`; `rhythmModel`'s
  internal keying is untouched (keys are unordered storage).
- The Year grid's `MonthZoomSheet` uses MonthCalendarGrid and inherits the
  fix automatically.
- No new setting UI — `weekStartsOn` already exists in cadence config.

### 3. The chip language (shared card grammar)

New `src/components/planning/PlacementChip.tsx`: the rhythm-style chip —
optional grip glyph, name, optional avatars (via `resolveMembers`-style
member list), event variant (purple tint), optional time badge, `draggable`
with the native `text/task-id` payload used by MonthCalendarGrid, click
handler. Used by:

- Month grid day cells (replaces the current in-cell item markup).
- The Week and Month pool/carried-over rows: `DenseInboxRow` keeps its
  actions but its visual shell adopts the chip anatomy (grip, avatar
  placement, border/hover tokens matching the rhythm cards).

### 4. The seams

- **Month → Week:** hovering a day cell highlights its whole week row
  (amber wash); each row gains an "Open week →" affordance (a small floating chip pinned at the row's right edge, visible while the row is hover-highlighted) that navigates to
  `/week?start=YYYY-MM-DD` (the week's first day per `weekStartsOn`).
- **/week?start= support:** WeekPage reads `?start=`; a valid date anchors
  the page (grid `initialDate`, header range label, pool selectors) to that
  week instead of the current one; the param persists while navigating
  within the page. Invalid/absent → current week (today's behavior).
- **Week → Today:** each day header in the embedded week grid gains a quiet
  "→ day" affordance that navigates to `/today?date=YYYY-MM-DD` (already
  supported by HomeViewContainer). Exposed via a new optional
  `onOpenDay?: (date: Date) => void` prop on `PlanningSession` — the page
  passes it; the wizard's ScheduleGridStep does not (no seam mid-wizard).

### 5. Chrome alignment

Week and Month mastheads adopt the Routines page pattern: `font-display`
title, one-line context subtitle (date range · placed/to-place counts),
actions right-aligned ("Plan the week/month" keeps its current
`/today?plan=` behavior). No layout cap changes; the pages keep their
current column widths.

## What does NOT change

- Today, Year, Season pages (Season got only the shelf vocabulary, already
  shipped separately).
- PlanningSession's grid mechanics, wizard step configs, cascade rail,
  bucket model (`horizons.ts`), reference folds, add-composers, undo paths.
- `weekStartsOn` default value (0). The point is respecting the setting,
  not changing it.

## Tests

- Smoke tests per extracted page (Task 1).
- `orderedWeekDays`/`orderedDayKeys` unit tests; MonthCalendarGrid renders
  Monday-start correctly when configured (header order + first cell date);
  WeekStrip column order follows the setting.
- PlacementChip unit tests (payload, variants, avatars).
- Seam tests: month week-row "Open week →" navigates with the right
  `?start=`; WeekPage anchored by `?start=`; PlanningSession `onOpenDay`
  fires with the day's date and is absent when the prop is omitted.
- Full suite green before push.

## Out of scope (later cycles)

Season drag (Cycle 2); wizard-as-coach-rail (Cycle 3); Pulse on Week/Month;
migrating PlanningSession off dnd-kit; any Today/Year change.
