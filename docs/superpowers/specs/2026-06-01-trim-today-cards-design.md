# Trim Today's Top Cards — Delete Focus, Weather → Chip — Design

**Date:** 2026-06-01
**Status:** Approved design, pre-implementation
**Surface:** Legacy `App.tsx` → `TodayView` (the working default; new shell parked).

---

## Problem

After deleting the right rail, the next clutter is the two-up card block at the top of Today (`TodayView`, the `grid-cols-[1.6fr_1fr]` block):

- **Today's Focus card** ("A few things need your attention · 3 priorities · 1 event") is read-only count-restatement — the rail disease relocated. It restates what the timeline below already shows, isn't actionable, and is a weak placeholder for the proactive assistant (which will do this job properly). Cut it.
- **Weather card** is genuinely useful external planning context, but a full card taking ~half the width at the top is oversized for "71° Partly Cloudy." Demote to a glance chip.

Goal: the top of Today reads **add-input → Carried over → timeline** — calm — with weather surviving as a compact chip in the stats row.

## Non-Goals (YAGNI)

- No proactive assistant / feed (separate effort; will reclaim this top space on-demand).
- No mobile changes — the card block is already `hidden md:grid` (desktop-only); weather stays desktop-only.
- No change to the `useWeather` hook or `weatherIcon` lib.

---

## Design

### 1. Delete the Focus card
- Remove `<TodaysFocusCard>` from `TodayView`.
- Delete `src/components/schedule/TodaysFocusCard.tsx` + `TodaysFocusCard.test.tsx` (used only by `TodayView`).
- Remove the now-orphaned focus computations/handlers in `TodayView` that fed only the card — candidates: `focusHeadline` import + usage, `focusPriorities`, `focusMeals`, `focusEvents`, `handleFocusActivate`, and `health.healthColor` if used only here. **Compiler/linter-driven:** after removing the card, run `tsc` + lint and delete exactly what they report as now-unused in `TodayView`. Leave anything still referenced (e.g. `useSystemHealth`/`health` if used elsewhere in the file).

### 2. Weather → `WeatherChip` in the stats row
- Create `src/components/schedule/WeatherChip.tsx`: a compact inline chip using the **same `useWeather()` hook** and `weatherIcon`. Renders: weather icon + `{temp}° · H{high}/L{low}` (e.g. `🌤 71° · H78/L55`, icon via `weatherIcon`, not a literal emoji — no-emoji rule). On click, toggles a small popover showing the existing **hourly forecast** (reuse the `weather.hourlyForecast` render from the old card). Loading → render nothing (or a tiny skeleton); error/no-weather → render nothing (chip simply absent, calm).
- Add a `weatherTrigger?: React.ReactNode` slot to `StatsRow` (mirroring the existing `discussionTrigger`/`clarityTrigger` slots) and render it after `discussionTrigger`.
- In `TodayView`, render `<WeatherChip />` into `weatherTrigger`.
- Delete `src/components/schedule/WeatherCard.tsx` (+ `WeatherCard.test.tsx` if it exists). Keep `weatherIcon` + `useWeather` + `weatherIcon.test`.

### 3. Remove the grid block
- Delete the whole `{data.counts.totalItems > 0 && ( <div className="hidden md:grid grid-cols-[1.6fr_1fr] ...">...</div> )}` block (TodayView ~lines 542–553).

Result: top of Today = add-input → Carried over → timeline; weather lives as a chip in the stats row next to `💬 N to discuss`.

---

## Components touched

| File | Change |
|---|---|
| `src/components/schedule/TodayView.tsx` | remove grid block + orphaned focus vars; render `<WeatherChip>` via StatsRow `weatherTrigger` |
| `src/components/schedule/StatsRow.tsx` | add `weatherTrigger?: ReactNode` slot |
| `src/components/schedule/WeatherChip.tsx` | **new** — compact weather chip + hourly popover |
| **Delete** | `TodaysFocusCard.tsx` (+test), `WeatherCard.tsx` (+test if present) |

**Keep:** `useWeather`, `weatherIcon`, `weatherIcon.test`.

---

## Testing

- `WeatherChip` test: with a mocked `useWeather` returning weather, asserts the compact temp/high-low render; clicking opens the hourly forecast; renders nothing on error/no-weather. (Mirror how `WeatherCard.test` mocked `useWeather` — reuse that mock shape before deleting it.)
- `TodayView.test`: still renders after the card block removal; confirm no `TodaysFocusCard`/`WeatherCard` imports remain; weather chip appears in the stats row (desktop).
- Deleting `TodaysFocusCard.test`/`WeatherCard.test` removes their tests — confirm suite green after.
- Guard: `rg` for `TodaysFocusCard`/`WeatherCard` → zero importers before deleting.
- Full `npx vitest run` + `npm run build` + `npm run lint` (no new errors) before push.

## Out of scope
- The proactive assistant that will eventually occupy the freed top space.
