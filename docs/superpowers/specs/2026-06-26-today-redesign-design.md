# Today Page Redesign — Design Spec

**Date:** 2026-06-26
**Status:** Design — awaiting review
**Branch/worktree:** `feat/today-redesign` (`.worktrees/today-redesign`)
**Target:** Rebuild the Symphony (Vite/React) Today page to match an approved mockup.

## Context

Scott provided a mockup screenshot of a redesigned Today page. The mockup is **not** in the Symphony codebase (verified: the labels "FOCUS TODAY" / "ROUTINES & HABITS" exist in zero source files across all branches; the only running UI server was an unrelated Stacks Data Next.js app). So this is a **build to match the mockup**, working from the screenshot as the design reference, against the current live components.

The live Today renders via `HomeViewContainer → HomeView → TodayView` (`src/components/schedule/TodayView.tsx`, ~983 lines), with `HomeHeader` (masthead), `StatsRow`, `ScheduleItem` rows grouped into Morning/Afternoon/Evening/Night **section buckets**, `OverdueSection`, and `EndOfDayCard`.

## Goal

Match the mockup: a centered date masthead, a content-revised stats row, a new **FOCUS TODAY** 3-card row, an **hour-rail** timeline (replacing section buckets), and a new **ROUTINES & HABITS** at-a-glance overview panel. Desktop-first (matches the mockup); keep mobile functional.

## Decisions (resolved with Scott)

- **Timeline = hour-rail**, not a true pixel-positioned grid. Hour labels (e.g. 7AM–8PM) down the left; items render in time order in the rail. This reproduces the mockup's look without the overlapping-event bugs a true time-grid has caused before.
- **Routines & Habits panel = at-a-glance overview.** Routine groups still render inline in the timeline at their time; the bottom panel is a compact summary/quick-toggle of routines by part-of-day — a different role, not a duplicate of the timeline cards.
- **Focus Today selection:** items flagged as focus for today, falling back to the next timed events when nothing is flagged. No focus flag exists today, so this introduces a lightweight `is_focus` concept (see §Focus Today).
- **Plan today / Show daily / from email already exist** in `TodayView` — these are placement/styling work, not new wiring.

## Sections

### 1. Masthead (XS)
`HomeHeader` already renders the date + Day/Week/Month toggle. Delta: ensure the Today variant is centered with the weekday eyebrow ("WEDNESDAY") above the date, and the right-side cluster (globe / AI-sparkle / help) matches. Mostly CSS/layout; no data changes.

### 2. Stats row (S)
Rework `StatsRow` **content** to show the mockup's four counts with icons — **events · focus items · routines · from email** — plus the trailing **Show daily** and **Plan today** actions. Reuse the existing trigger/endControls composition; `emailTrigger` ("N from email") and the Plan-today handler already exist. Demote/remove the current done/week/Clarity content from the Today variant. Counts come from the already-computed timeline data (events, routines) + the new focus count + `useEmailActionItems`.

### 3. FOCUS TODAY (M) — new
A row of up to **3 highlighted cards** above the timeline, each: time range, title, a meta line (e.g. "Zoom", location), and a colored left accent + status glyph (star/ring). Below: an expander "N focus items · M total events" that toggles the row open/closed.

**Focus selection:** add an `is_focus` boolean to the timeline item model (persisted per task/event — a star toggle on the card marks an item as today's focus). FOCUS TODAY shows up to 3 `is_focus` items for the day; if fewer than 3 are flagged, fill from the next upcoming timed events. (Schema: a nullable `is_focus boolean` on `tasks`; events use a per-day flag consistent with how event day-state is already stored — confirm during planning.)

New component: `FocusTodayRow` (+ `FocusCard`). Lives between the stats row and the timeline in `TodayView`.

### 4. Today's Schedule — hour-rail timeline (L, the core)
Replace the Morning/Afternoon/Evening **section-bucket** rendering in `TodayView` with an **hour-rail**: a left gutter of hour labels spanning the day's active range (first to last item, e.g. 7AM–8PM), with `ScheduleItem` cards flowing in time order in the right column, aligned to their start hour. Routine collections render as the existing collapsed group rows (avatar + "N items" + chevron) at their time. Preserve all existing item affordances (status toggle, assignee chips like "SK", meta icons for Zoom/location/car, tap-to-detail, multi-select). All-day / untimed items get a clearly separated lane (top or bottom), not forced onto an hour.

This is the highest-risk slice and gets its **own implementation plan**. The hour-rail is a layout transform over the existing item list — no change to data fetching.

### 5. Routines & Habits overview (M) — new
A bottom panel with **Morning / Afternoon / Evening** columns, each showing a scheduled count and the routines in that part of day, collapsible (the mockup shows a "Collapse" control). Sourced from the same routine data the timeline uses, grouped by part-of-day. Each routine row has a **quick mark-done toggle** (check it off directly from the panel).

**Shared completion state (important):** the panel's toggle reuses the *same* per-day routine-completion mechanism the timeline already uses (`actionable_instances` / the existing routine-complete handler) — it does not introduce a parallel state. Checking a routine off in the panel reflects in the timeline group, and vice versa; both read the same completion source. New component: `RoutinesHabitsPanel`.

## Architecture / boundaries

- `TodayView` stays the composition root but gets **lighter**: the hour-rail render logic, FocusTodayRow, and RoutinesHabitsPanel each live in their own focused components/files (TodayView is already ~983 lines — extracting these reduces it).
- Pure helpers go in `src/lib/today/`: `hourRail.ts` (item → hour-row mapping for the active range), `focusItems.ts` (select up-to-3 focus items with fallback), `routinesByPartOfDay.ts` (group routines for the overview). Each is unit-testable in isolation.
- No change to data fetching (`HomeViewContainer`/hooks). The redesign is a presentation-layer transform plus the one small `is_focus` addition.

## Testing

- Unit: `hourRail` (ordering, active-range bounds, untimed lane), `focusItems` (flagged-first, fallback fill, cap at 3), `routinesByPartOfDay` (bucketing).
- Component: FocusTodayRow renders N cards + expander; RoutinesHabitsPanel renders three columns + collapse; StatsRow shows the four new counts.
- Follow TDD per slice (test → fail → implement → pass).

## Sequencing (each slice ships independently; previews only until approved)

1. **Chrome slice** — Masthead centering (§1) + Stats row content (§2) + RoutinesHabitsPanel (§5) + FocusTodayRow shell with the simple fallback selection (§3 minus the `is_focus` star). Lower risk, gets the page visually close fast.
2. **Focus flag** — add `is_focus` + the star toggle on cards; wire FocusTodayRow to real focus selection (§3 remainder).
3. **Hour-rail timeline** (§4) — its own spec/plan; the core rework.

## Out of scope

- Email assistant work (separately designed + parked).
- Week/Month views (this is the Today/Day view only).
- A true pixel-positioned calendar grid.

## Open questions for review

- **Focus persistence:** is a per-item `is_focus` star the right model, or should "focus" be derived (e.g. top-priority/next-N) with no new flag? Default in this spec is a persisted star with fallback. **(Still open — proceeding on the star default unless changed.)**
- ~~**Routines & Habits panel:** read-only vs quick mark-done.~~ **Resolved: quick mark-done toggles, sharing the timeline's per-day completion state (§5).**
