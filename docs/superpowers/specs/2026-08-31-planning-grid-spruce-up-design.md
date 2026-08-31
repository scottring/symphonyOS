# Planning Grid Spruce-Up — Design

**Date:** 2026-08-31
**Status:** Approved in brainstorming (Scott, this session)
**Surfaces:** the "Plan Your Time" overlay (mounted from Today via `HomeViewContainer`, time grain, drawer mode) AND the This Week bench at `/week` (shelf mode, day grain). Both mount the same `PlanningSession`; every behavior below lands on both unless noted.

## Problem

The planning grid works but overwhelms and under-delivers:

- The Unscheduled pool shows 65 items — the relevance filter admits every week-seeded meal task, burying the few things worth placing. The rail is ~190px wide and truncates everything.
- Routines can render on the grid, but the only toggle is an unlabeled eye icon on the overlay (none at all on /week), so in practice they're invisible.
- Rearranging exists but is undiscoverable and incomplete: placed blocks give no drag affordance; the Today-overlay mount never passes `canMoveEvent`, so **no** event is draggable there; items collapsed into a "+N" overflow chip are not draggable at all (the popover renders title + time only).
- There is no way to plan at a chosen altitude — the pool is one undifferentiated pile.
- Dropped tasks land with no domain and no help choosing a slot.

## Design

### 1. Pool: views, relevance, width

**View switcher** at the top of the pool (drawer on the overlay, shelf on /week). Three official views:

- **This week** (default): `bucket='week'` tasks for the current week (`belongsToWeek` + `isStaleWeekPlacement`) + carried-over scheduled tasks + all-day tasks in range.
- **This month**: `bucket='month'` tasks.
- **Everything**: the full current pool (absorbs today's separate "Show more"/backlog toggle — one mechanism, not two).

View choice persists per surface in localStorage.

**Relevance rules** (deterministic — no model calls), applied within each view:

- **Meal grouping:** tasks seeded by weekly dinner planning (the "Cook X dinner / prep Y" family) collapse under one collapsible "Meals · N" group header instead of N loose cards.
- **Sort by actionability:** carried-over/stranded first, then week items, then all-day.
- **Cap:** ~15 visible items with a quiet "N more" expander per group. Never a 65-item wall.

**Width:** drawer widens to ~300px; cards get two-line titles without truncation. /week's shelf already spans full width and gains the switcher + grouping.

### 2. Grid: routines visible/hideable, everything rearrangeable

- **Labeled Routines toggle** ("Routines" with clear on/off state) replaces the bare eye icon on the overlay and is **added** to /week, which currently has none. Keeps the app-wide `hideRoutinesSignal` sync.
- **Verify multi-day routine delivery** on the overlay mount: it passes the viewed date's routines; with 2–3 days visible, days 2+ may be starving. Confirm and fix.
- **Wire `canMoveEvent`** on the overlay mount with the real calendar-role check so events on writable calendars are draggable there (today the omitted prop makes every event immovable).
- **Drag affordances:** grab cursor + hover treatment on placed blocks so draggability is discoverable.
- **"+N" overflow chip:** popover rows become draggable, using the same drag IDs as their full-size blocks (bare task id / `event-` / `placed-routine-` prefixes), so all existing drop branches work unchanged — an item can be dragged straight out of the popover onto a slot.
- **Lane-cap revisit:** the chip appears too eagerly (observed: 1 visible block + a "+2" beside empty column width). Rework the overlap-lane math so the chip only appears when there is genuinely no room; wider columns show more items outright.
- Grain rules unchanged: time grain on the overlay (one-day routine overrides), day grain on /week (recurrence-rule rewrites).

### 3. Drop smarts (rules-first, no model calls)

- **Domain on drop:** when a task with no `context` lands on the grid, the schedule write commits immediately, then the **existing** Work/Family/Personal picker (the same `ContextPicker` popover used across the app) opens anchored to the freshly placed block. Pick → set; dismiss → task stays placed, unassigned. No silent inference, no new UI.
- **Suggested slots:** while a drag is active, highlight 2–3 good open slots (subtle tint, pure paint — suggestions never capture the drop):
  - Open = no event/routine/task collision, within the 6am–10pm grid.
  - Fit by nature: call-ish tasks → business hours; cook/prep → pre-dinner window; errands → daytime; otherwise earliest sensible opening.
  - Computed at render time from what's already on the grid. No persistence, no network.

### 4. Privacy constraint

Items in a person's **work** or **personal** context are visible only to that person; **family** is shared. This is already enforced by the domain-layer architecture (RLS + `scopeForDomain` derives scope from context — scope is never written literally). The on-drop picker reuses the exact same write path as the existing `ContextPicker`, so scope derivation and privacy ride along automatically. **This design adds no new visibility logic.**

### 5. Code structure

- `src/lib/planning/poolViews.ts` — NEW. View definitions, relevance/grouping/sort rules. Pure functions over `Task[]`; replaces the inline `relevantUnscheduled` logic in `PlanningSession`.
- `src/lib/planning/dropSmarts.ts` — NEW. Slot-suggestion heuristics. Pure, unit-tested. A later LLM tagging pass can replace the keyword heuristics without touching the UI.
- `PlanningTaskDrawer` / `PlanningShelf` — view switcher UI, meal grouping, wider layout. Both consume the same `poolViews` output so the two surfaces cannot drift.
- `PlanningColumn` — draggable popover rows, lane-cap rework, drag affordances.
- `PlanningSession` / `PlanningHeader` — labeled Routines toggle, ContextPicker-on-drop wiring, suggested-slot paint.
- `HomeViewContainer` — pass `canMoveEvent`; verify per-day routine delivery.

### 6. Testing

- Unit tests on `poolViews` (bucket / week-start / stale / carried-over cases; the 65-item pool becomes a fixture — raw column values per the fixtures rule) and `dropSmarts` (collision, business hours, dinner window).
- Existing planning suites (`PlanningSession`, `planningParity`, `overlapLanes`) guard regressions; new cases for popover-row drag IDs and the ContextPicker trigger.
- Live verification on prod in the browser — type-checks are not inspection.

### 7. Rollout

One worktree (`planning-spruce`), independent commits in order, each pushed to main only when verified:

1. Pool views + width.
2. Grid fixes (toggle, +N drag, lane cap, `canMoveEvent`, affordances, multi-day routines).
3. Drop smarts (ContextPicker on drop, suggested slots).

No feature flags.

### Not doing (YAGNI)

- No LLM calls anywhere (rules first; AI later only if rules fall short).
- No persistence beyond the localStorage view choice.
- No monthly *grid* — the month view only filters the pool.
- No changes to Today itself.
