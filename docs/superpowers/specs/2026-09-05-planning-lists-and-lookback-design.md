# Planning lists and the look-back

**Date:** 2026-09-05 · **Status:** approved in conversation, awaiting Scott's read of this document · **Supersedes:** the "drain the pool" posture of the week/month surfaces. Extends [[2026-08-29-domain-layers-design]] and the placement cascade (`tasks/2026-07-24-placement-cascade-week-rows.md`). Honors `planning_model_look_not_link` (2026-07-08).

## The problem, in Scott's words

> This setup is both a task manager and a goal planner at the same time. When we plan at a monthly level we're putting out specific tasks and some goals. If it's a task we can move it to the day or to the weekly list. If it's a goal, it lives on the monthly list — it's never going to be moved to a time, because it's not a task.
>
> We need to reference that list of goals when we want, in a separate place, not with the calendar. Same for the quarter and the year. Reference lists. We can edit them, but we should always be able to reference them.
>
> The weekly list is more like tasks, and most of them don't need to be scheduled, because we don't know if we'll do it Saturday, Sunday or Monday — but we're going to do it. It's a task you check off. On Tuesday I say "I'm going to get these two done" from the weekly list. The next week we look at last week's list to see what has or hasn't been ticked.
>
> At the end of September we do a look-back: what got done, what went well, what didn't. We look at the September list and migrate forward, drop, put on Someday, or turn into a specific task. We're not trying to make the weekly list disappear by moving it all places.

## What the build does today, and where it disagrees

1. **Posture.** Every week/month surface is a pool to *drain*. The `/week` strip is titled UNSCHEDULED, its empty state says "Everything is placed", and the Week/Month dropdowns on Today offer triage verdicts (Today · Tomorrow · Someday · Delete). Nothing says *this is your list; keep it.*
2. **Goals and tasks are indistinguishable.** One `month` bucket, one `quarter` bucket. Nothing can enforce "a goal never moves" or show goals as a distinct reference.
3. **No reference surface.** The month and season lists exist only inside the drain-dropdowns; the year list is `/goals`, reachable from the Library. Nothing is beside the calendar.
4. **No period on the list.** `bucket='month'` has no month; `bucket='quarter'` has no season. A September look-back is impossible because nothing knows what was September's.
5. **No look-back ritual** at any level. The week carry-over was flagged "not built" in July and still is.
6. **Seasons are hard-coded meteorological** (Mar/Jun/Sep/Dec 1 in `lib/cadence/config.ts`). Scott's next season starts October, and the household chooses its own groupings.

## The model

| Level | What it is | Behaviour |
|---|---|---|
| **Year** | reference list of goals | `goals` table, `/goals`. Unchanged. |
| **Season** | reference list — tasks *and* goals | read beside the calendar; editable; never calendared. A goal never moves. A task may be copied down. |
| **Month** | reference list — tasks *and* goals | same. |
| **Week** | **a checklist** of tasks | most items stay and are ticked during the week; only the date-bound get scheduled to a day. |
| **Day** | the schedule | planned each morning *by looking at* the week list. |

**Levels connect by looking, not linking** (unchanged rule). Planning a level means reading the level above while writing this level's list fresh. The level above is rendered as a read-only rail wherever a level is planned.

**Rituals:**
- **Daily** — plan today by looking at the week list (Today's Week dropdown; tick + "Do today").
- **Weekly** — on `/week`: look at *last* week's list (ticked/unticked; carry forward, drop, Someday) and at the Month rail; write this week's list.
- **Monthly** — on `/plans` Month tab: look back at the month just ended (every row's fate); keep-and-migrate, drop, Someday, or make-it-a-task. Read the Season rail.
- **Seasonal** — same, Season tab, Year goals as the rail. Fires on the household's season boundaries.
- **Annual** — on `/plans` Year tab: look back at the year just ended (each goal met / not; keep into the new year or drop), then write the new year's goals. The annual anchor stays September 1 (the school-year turn the cadence already uses) unless Scott moves it.

## 1. Data

Three additive, NULL-safe columns on `tasks`, all following the `week_start` pattern (`2026-07-24_tasks_week_start.sql`): a `date` column, NULL = the current period (legacy rows unchanged), serialized with `localYmd`/`parseLocalYmd`, never `toISOString()`.

```sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS month_start  DATE,           -- which month a bucket=month row belongs to (its 1st)
  ADD COLUMN IF NOT EXISTS season_start DATE,           -- which season a bucket=quarter row belongs to (its start, per the household's boundaries)
  ADD COLUMN IF NOT EXISTS is_goal      BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS tasks_month_start_idx  ON tasks (month_start)  WHERE month_start  IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_season_start_idx ON tasks (season_start) WHERE season_start IS NOT NULL;
```

**Predicates, mirroring `weekPlacement.ts` exactly** — mixing them up is the bug:
- `belongsToMonth(task, monthStart)` / `belongsToSeason(task, seasonStart)` — NULL returns **true**. For pools ("should I show this?"). Scoping legacy rows would make an existing month plan vanish.
- `isPlacedOnMonth` / `isPlacedOnSeason` — NULL returns **false**. For surfaces with one row per period (the `/plans` period navigator showing a *past* month). A NULL counted as a member would repeat in every month.

**`is_goal` invariants:**
- A goal row can be **completed** (ticked) and **edited**. It can be **kept** (copied to the next period) or **dropped**.
- A goal row **cannot be placed**: `pushTask`, `setBucket`, `scheduleTask`, drag-to-grid, DomainGate-gated placements and the paper review sheet's When select all refuse it (no-op + quiet toast "Goals aren't scheduled — tick it off when it's done"). Enforced in `useSupabaseTasks` writers, not only in UI, so an edge path can't bypass it.
- **"Make it a task"** flips `is_goal` to false and leaves the row where it is; it can then be placed like any task.
- `is_goal` is meaningful only where `bucket ∈ {month, quarter}`. A week row is a task by definition; the writers clear `is_goal` if a row somehow reaches `week`/`timed`.

**Seasons are a household setting.** `households.seasons jsonb` — an array of four `{ name, month, day }` boundaries, e.g. `[{"name":"Fall","month":10,"day":1}, …]`. Editable in Settings (the household owner). Default seeded on first read if NULL: starts Oct 1 · Jan 1 · Apr 1 · Jul 1 named Fall · Winter · Spring · Summer — Scott's stated next boundary is October; the other three are placeholders he adjusts in Settings. `lib/cadence/seasons.ts` replaces `isSeasonStart`/`seasonToken`: `seasonStartFor(date, seasons)`, `seasonLabel`, `nextSeasonStart`, `isSeasonBoundary`. Everything that says "season" reads the configured boundaries — the cadence anchor, the paper `season` window (currently a flat 92 days), `HORIZONS`, the Season tab. Nothing hard-codes Mar/Jun/Sep/Dec after this ships.

## 2. Copying vs moving — the fork, decided

**Placing a month or season *task* lower copies it; the original stays.** The copy carries `source_id = original.id` (lineage already exists from plan-from-paper). The original renders as **→ placed** and inherits its done-state from the copy, *derived at read time* (`placedCopyOf(task, tasks)` in `lib/planning/lineage.ts`), never stored. This is what makes the look-back honest — otherwise September's review shows only what you *didn't* do. It is invisible linking, not the sub-goal alignment refused in July; the list is the list.

Consequences:
- **Month pool counts** (`selectHorizonPool('month')`, the Today dropdown badge, the `/plans` list) show placed originals **as their own row with a placed mark**, not as duplicates of the copy. They do **not** count toward "open" for the badge — `Month · N` counts untouched + goal rows, not placed ones.
- **Week → week is a plain move.** Carrying an unticked item into next week rewrites `week_start`. The weekly glance is that list's only review; nothing revisits it afterward. (Today's existing "Not this week" pill action already does this.)
- **Week → day** stays as it is: the timed-bucket invariant flips bucket to `timed`; `selectPlacedInWeek` keeps it visible on `/week`.
- **Someday → month/season** stays a move (Someday has no review).
- Existing `source_id` semantics untouched: "a descent never touches `source_id`/`goal_id`" still holds for week→day.

## 3. Surfaces

### 3a. `/week` — this week's list, beside the grid
- **Rename.** The strip is **"This week"** (never "bench"; `feedback_week_shelf_terminology` says "shelf" for the physical strip — the on-screen label is *This week · N*). The empty state becomes **"Nothing on the list yet."** No "Everything is placed" anywhere.
- **Tick in place** — `PoolPill` already has the Complete checkbox (`aria-label="Complete …"`). Ticked pills linger struck-through until the strip re-collapses, so the week still reads as a list with things done on it.
- **Month rail** — a collapsible right-hand column (`WeekMonthRail`) rendering the current month's list read-only: goals first with a Target badge, then tasks, placed rows marked →. Rows are not draggable and have no actions except "open" (panel). Collapsed state persisted per device. This is the "look" of look-don't-link.
- **Last week toggle** — in the strip header, **"Last week"** swaps the strip's content for the previous week's list (`belongsToWeek(task, prevWeekStart)` including completed rows): ticked rows struck, unticked rows with three actions **Carry forward · Drop · Someday**. Carry forward = move (`week_start = thisWeek`). Toggle persists only for the session.
- The four pool tabs (This week · This month · Everything · Routines) stay; "This month" here is the same data as the rail, kept for anyone who wants it as pills.

### 3b. `/plans` — the reference lists
New page, `src/apps/plans/` + `src/components/plans/`, using `PageMasthead` + `PAGE_COLUMN` (never a bespoke header). Three tabs: **Month · Season · Year**.

- **Period navigator** in the masthead: ‹ September 2026 › / ‹ Fall 2026 › / ‹ 2026 ›. Any past or future period is readable. The current period is the default; a chip returns to it.
- **Month tab:** the month's rows via `isPlacedOnMonth` for non-current months and `belongsToMonth` for the current one (so legacy NULL rows appear in *this* month only). **Goals** section first (Target badge), then **Tasks**. Each row: checkbox, title, domain tint, and a **fate mark** — none · ✓ done · → placed (copy open) · → placed ✓ (copy done) · · · Someday. Inline add at the bottom writes `bucket:'month', month_start: viewed, is_goal` per a small Task/Goal toggle beside the input, domain pre-filled from `soleDomain` (a deliberate create, per domain-layers).
- **Look-back actions** appear on any **past** period's rows (and on the current period's rows during its last 3 days): **Keep** (copy to next period: new row, `source_id`, next `month_start`, same `is_goal`) · **Drop** (delete with undo) · **Someday** (goals excluded — a goal is an outcome, not a task) · **Make it a task** (goal → task, stays in period). Ticked and placed-done rows have no actions — they're the win column.
- **Season tab:** identical, with `bucket:'quarter'`, `season_start`, the household boundaries for navigation. **Year goals rail** on the right (read-only, from `goals`).
- **Year tab:** embeds the existing Goals list (`GoalsList`) — no second implementation. The Library "Goals" row redirects here; `/goals` keeps working. **The year gets the same look-back as the other periods:** the navigator pages to a past year; each goal shows its fate (✓ met · untouched · with the count of season picks that served it, from `goal_id`) and offers **Keep** (copy into the new year's goals) · **Drop**. Nothing is placed from here — a year goal is looked at, never moved (Scott, 2026-09-05: "at the end of each period have a review of that period's goals/tasks").
- **Season rail** on the Month tab (read-only) — the level above, always.
- Nothing on `/plans` is draggable and nothing opens a time picker. Editing = title, notes, domain, tick, the look-back actions.

### 3c. Today
- The **Week dropdown** leads with the checkbox (exists) and **"Do today"**; Tomorrow · Someday · Delete move behind a ⋯ on the row. Label **"This week · N"**. Empty state "Nothing on this week's list."
- The **Month dropdown** shows the month list read-only-ish: checkbox + "This week" (copy down) + goals badged and unplaceable. Label **"This month · N"**. The dropdowns stay — Scott has said twice they live in the header, never in the review.
- No other Today change. The Today refinement pass stays last (streamlined vision).

### 3d. Navigation
Sidebar becomes **Inbox · Today · This Week · Plans · Library ▸ · Settings**. This adds a sixth row to the pare-down's five. Scott's call (2026-09-05): a reference list you have to dig for isn't one. The Library's Goals row is removed (Year lives under Plans).

## 4. Plan from paper
- Month pages stamp `month_start` = **the month the page is for**: the current month, unless the page is snapped in the last 7 days of a month, in which case the coming month (a page written on the 28th is for October). The review sheet shows the month as a chip (‹ September › ‹ October ›) so a wrong guess is one tap to fix before commit. Season pages stamp `season_start` the same way, from the household boundaries (last 14 days of a season → the coming season).
- Goal lines (`PlanPlacement.kind === 'goal'`) are accepted on **month and season** pages, not only year pages: they write `is_goal: true` in that page's bucket. On year pages they still write `goals` rows. The review sheet's row badge (amber Target) already exists.
- `planWindowDates('season')` reads the configured boundaries instead of 92 days.

## 5. Cadence
- `lib/cadence/config.ts` season anchors read `households.seasons`. `isSeasonStart` → `isSeasonBoundary(now, seasons)`; `seasonToken` → the boundary's `YYYY-<name>`.
- Monthly and seasonal planning routines (already seeded per the streamlined vision) deep-link to `/plans?tab=month&period=<prev>` / `?tab=season&period=<prev>` — the look-back is the first thing the ritual shows.

## Out of scope
- Any cascade UI, sub-goal alignment, or "why chain" — refused in July, still refused.
- Rebuilding a wizard. `/plans` is a page, not a flow.
- Wall changes. The wall is untouched (`useWallData` unaffected; goals never reach it because they're never placed).
- iOS. Web first; the iOS Today mirror needs no change because Today's data model is unchanged.
- Backfilling `month_start`/`season_start` on legacy rows — NULL = current, by design.

## Testing
- Pure modules first, each with a test file: `lib/planning/periods.ts` (`belongsToMonth`/`isPlacedOnMonth`/season twins — the NULL semantics pinned in both directions), `lib/cadence/seasons.ts` (boundaries, a boundary on Feb 29, the year wrap from Fall→Winter), `lib/planning/lineage.ts` (placed-copy derivation, a copy that was deleted, a copy that was itself copied), `lib/planning/lookback.ts` (fate for every combination of is_goal × completed × copy state).
- Writer tests in `useSupabaseTasks.test.ts`: `is_goal` refusal on every placement writer; copy-down produces a new row with `source_id`, original untouched; week→week is a move.
- Component tests: `/plans` period navigator (legacy NULL rows appear in the current month only), look-back actions per fate, Task/Goal toggle on inline add; `/week` Last-week toggle and Month rail; Today dropdown ordering.
- `scopeDefaultCoverage.test.ts` tripwire must stay green — no literal `scope:` anywhere new.
- Browser verification on the demo account for every surface before each push to `main` (type-checks are not inspection). Drags are verified with the synthetic-PointerEvent recipe.

## Build order (each shippable alone)
1. **Data + seasons config** — migration, types, `useSupabaseTasks` mapping/writers, `is_goal` refusal, `periods.ts`, `seasons.ts`, Settings editor, cadence reads config. No visible change except Settings.
2. **`/week` posture** — rename, empty state, Month rail, Last-week toggle, copy-down on month→week.
3. **`/plans`** — page, three tabs, period navigator, fates, look-back actions, nav row, Library Goals row → Plans.
4. **Today dropdowns** — ordering and labels.
5. **Paper** — `month_start`/`season_start` stamping, goal lines on month/season pages, season window from config; redeploy `parse-page`.

## Open questions for Scott
- The four season names and boundaries (Settings will let you change them any time; the seed is a guess with October right).
- Whether ticked rows on `/plans` should be hideable ("show done") — proposed default: always visible, because the list is the record.
