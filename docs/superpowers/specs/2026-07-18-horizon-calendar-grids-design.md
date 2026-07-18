# Horizon calendar-grid views — design

**Date:** 2026-07-18
**Ask (Scott):** make the "big rock" views at each time horizon a **grid of calendar views**, per the *Best Laid Plans* (Sarah Hart-Unger) methodology, in Symphony's own voice (not the book's branded phrases).

## Per-horizon grid (from the book, Ch 2–6)

| Horizon | Grid | What sits on it |
|---|---|---|
| **Year** | 12-month overview (one page, 12 cells) | the year's landscape — big rocks per month (trips, due-dates, transitions, heavy weeks); domain goals alongside |
| **Season** | the season's ~3 months (month columns) + an **ideal-week** template (7 days × hours from 5am) | season moves dropped on months; ideal-week is a reality-check that intentions fit the hours; a "focus for the season" line |
| **Month** | a real month calendar (weeks × 7 days) | where ideas become *dated* items — fun, reservations, maintenance, chunks; goals list beside |
| **Week** | 7 days × hourly + a left task column + notes/meals strip | the ≤15 tasks + fun placed on day/time — today's "place the big rocks" as a full 7-day grid |

**Through-line:** every level is the same ritual re-skinned (reflect → look above → look at the calendar landscape → check energy → place this level's rocks), and items **soften from "goals" (year/season) to "tasks" (week)**. So: **one horizon-aware calendar-grid component, four granularities.** It serves both the standing pages (`/year`…) and the wizard's placement step.

## Language (Symphony's own, not the book's)
- Symphony already owns most: "A year, on purpose" / "A fresh season" / **"A clean slate"** (month) — keep. So "Twelve Clean Slates" is already ours.
- **Week:** replace "Time Tetris" (the one book phrase in the app) → **"The week's shape"** (quiet, fits the grid). Also swap "168 hours" phrasing where it appears.

## Build plan (incremental — visual-heavy, verify per horizon)

Shared component `HorizonCalendarGrid` with a `granularity` prop:
- `month` → weeks × 7 day-cells (BUILD FIRST — clearest, most standard).
- `year` → 12 month-cells.
- `season` → 3 month-cells + ideal-week strip.
- `week` → reuse the existing `PlanningSession` 7-day×time grid.

**Increment 1 (this pass):** the **Month** calendar grid — render the month as a real calendar, place the month's dated items (tasks with `scheduledFor` in the month + calendar events) in their day cells, and show the month's undated "big rocks" (`bucket='month'`) in a rail to assign onto days. Rendered inside `HorizonView` for `horizon==='month'`. Ship to a **preview branch** for Scott's visual review before generalizing.

**Later increments:** year (12-month), season (3-month + ideal-week), week (wire PlanningSession), and the "The week's shape" rename. Each verified visually before prod.

## Data
- Month dated items: `tasks` with `scheduledFor` in the visible month + `events` on their days.
- Month rocks (undated): `tasks` with `bucket='month'` and no `scheduledFor`.
- Place a rock on a day: `updateTask(id, { bucket:'timed', scheduledFor: <day> })` (same as the schedule grid).

## Verify
`npm run build` (NOT `tsc --noEmit` — it's a no-op here), the unit suite, and **Scott's visual review on the preview branch** (the real gate for this visual feature).
