# /week redesign: shelf + full-width time-slot grid + Tend sweep

**Date:** 2026-07-22
**Status:** Approved direction (brainstormed with Scott via visual companion; mockups in `.superpowers/brainstorm/68945-1784749094/content/`)
**Branch:** `week-shelf`

## Problem

The /week page renders every task twice and buries the grid under four list
sections. Concretely:

1. **Duplication.** `weekGridTasks` puts every week-bucket task in the planner
   drawer and every scheduled task on a grid day — then the same tasks render
   again below as "Carried over", "Placed this week", per-project sections, and
   the loose pool. "Placed this week" is a list of what the grid already shows.
2. **Row chrome.** Each `DenseInboxRow` carries ~10 controls (grip, checkbox,
   note/tag/assignee icons, the four `TriageWhenMenu` chips, pick-a-date,
   trash). On the week page the "Week" chip is self-referential.
3. **Lineage echo.** Copy-down parents share the task's title, so the
   breadcrumb repeats the title verbatim under itself.
4. **No tending.** Nothing helps shrink the pool: cascade copy-downs create
   literal duplicates, stale items carry over week after week, and wrong-sized
   items sit unplaced.

## Approved design

One surface. Every task appears in exactly **one** place: on a day (grid) or in
the unplaced pool (shelf). Nothing renders below the grid.

### Page structure (top to bottom)

1. **Slim masthead** — "This Week", date range, "N placed, M to place" count,
   Plan-the-week + "What is this level?" links. The `CascadeRail` block is
   replaced on this page by a one-line breadcrumb top-right
   (`Year ▸ Season ▸ Month ▸ **Week** ▸ Today`, each rung navigable). The
   `CascadeRail` component itself is untouched (other pages keep it).
2. **The shelf** — a full-width lane of wrapping task pills between masthead
   and grid (calendar "all-day lane" pattern). This IS the pool.
3. **Full-width time-slot week grid** — 7 day columns × hour rows, filling the
   remaining viewport height.

**Deleted outright from WeekPage:** Carried over section, Placed this week
section, per-project sections, loose-pool list, bottom add-input (moves onto
the shelf). `placedThisWeek`/`carryOver`/`grouped` list rendering goes away on
this page; the selectors stay (shelf + counts still use them).

### The shelf

- Full-width, wrapping pills. **Titles never truncate** — pills show the full
  title (explicit constraint from Scott).
- Order: carried-over pills first (amber tint, `Carried over (N)` label in the
  shelf header), then project-grouped pills (project name as a quiet suffix on
  the pill), then loose pills.
- **Collapsed cap ~2 rows** with a `+N more ▾` expander so a long pool can
  never bury the grid. Expanded state shows everything.
- Pill interactions: **drag** onto a day/hour to place; **click** opens the
  existing task detail panel (Tap panel); hover reveals a `⋯` menu — Open,
  Pick a date…, To month, Put aside, Delete. This replaces the ten-control
  strip; tag/assignee/notes remain reachable through the detail panel.
- `+ Add…` pill at the end of the lane (same grain-aware placeholder copy as
  today's bottom input; adds into the week bucket).
- `✦ Tend` button in the shelf header.

### The grid

- The existing `PlanningSession` hour grid, full width, behaviorally untouched:
  routines stay **out** (`routines={[]}` — the 2026-07-22 rollback lesson),
  events show, no drops on past days (`minDropDate`), `?start=` anchoring and
  the `→ day` seams unchanged.
- **Drag bridging:** `PlanningSession` keeps dnd-kit internally, so the shelf
  renders *inside* `PlanningSession` as a new pool layout. Add a
  `poolLayout: 'drawer' | 'shelf'` prop: `'drawer'` (default) is the current
  side drawer — the guided wizard keeps it; `'shelf'` renders the pool as the
  full-width lane above the grid. Shelf pills are dnd-kit draggables in the
  session's existing DndContext, so shelf→grid drag needs no native-drop
  bridging. Drag from grid back to shelf unschedules (existing drawer drop
  behavior, retargeted at the shelf).

### The Tend sweep (AI tending)

- Pressing `✦ Tend` flips the shelf into **review mode**: pills are replaced by
  proposal cards (the shelf may grow while reviewing). `✕ done` returns the
  (now shorter) pool.
- New edge function **`tend-week`** (Deno, Supabase; billed on the
  `symphony-supabase` API key like `sharpen-goal`). Input: the pool +
  carried-over items with metadata (title, notes excerpt, project, created_at,
  age-while-unfinished, current scheduled date if overdue) plus the week's
  free/busy shape.
  Output: typed proposals.
- **Proposal types:**
  - `merge` — `{ keepId, dropIds[], why }` (duplicates; keeps the older item
    and its context, deletes the rest)
  - `put_aside` — `{ taskId, why }` (stale → someday bucket)
  - `regrade` — `{ taskId, to: 'month' | 'someday', why }` (wrong-sized)
  - `place` — `{ taskIds[], date, why }` (day/time suggestion; may pair
    related items)
- Each card: **Apply / Dismiss**. Applies go through the existing mutations
  (`updateTask` / `setBucket` / `pushTask` / `deleteTask`) and surface in the
  existing `UndoToast`. Nothing applies silently; there is no batch-apply.
- **Deterministic pre-pass** (client-side, no AI): duplicate titles (equal
  after lowercasing and stripping punctuation/whitespace, or ≥0.85 normalized
  trigram similarity) and stale items become proposals even if the AI call
  fails. "Stale" = in the week/overdue set with `created_at` ≥21 days ago and
  never completed — we don't store per-week carry history, so age-while-
  unfinished is the proxy. The AI adds judgment, pairings, placements, and the
  "why" copy.
- Failure → toast "Couldn't tend the list — try again." Empty result →
  "Nothing to tend — this list looks healthy."

### Mobile (<768px)

The shelf collapses to a single row with the expander; the grid scrolls
horizontally/vertically as `PlanningSession` already does when embedded.
Desktop is the primary target.

## What this touches

- `src/apps/tasks/horizons/WeekPage.tsx` — page restructure (sections deleted,
  masthead slimmed, full-height session).
- `src/apps/tasks/horizons/shared.tsx` — WeekPage stops consuming
  `renderRow`/`grouped` (other horizon pages unaffected).
- `src/components/planning/PlanningSession.tsx` + new
  `PlanningShelf.tsx` — `poolLayout` prop; shelf component (pills, groups,
  expander, add-pill, Tend entry, review mode host).
- New `supabase/functions/tend-week/` — edge function.
- New `src/lib/tend/` — proposal types, deterministic pre-pass, proposal→
  mutation application (unit-tested).

**Not touched:** guided wizard (keeps drawer layout), Month/Season/Year/Someday
pages, `CascadeRail`, `DenseInboxRow`/`TriageWhenMenu` (still used by other
surfaces), grid drop rules, routines exclusion.

## Testing

- Unit: proposal→mutation mapping; deterministic pre-pass (dupe detection,
  stale threshold); shelf grouping/order; expander cap.
- Smoke: WeekPage renders **no** Carried over / Placed this week sections; a
  week-bucket task appears exactly once on the page.
- Edge fn: schema contract test on the proposal JSON (types + required fields).
- Manual: drag shelf→grid, grid→shelf, `?start=` anchored week, Tend
  round-trip on the demo account.

## Out of scope (noted for later)

- Tend on Month/Someday pages (same component could host it; not in this pass).
- Routines in the week grid (explicitly parked — sore point).
- Season drag work (Canvas program Cycle 2) and wizard-as-coach-rail (Cycle 3).
