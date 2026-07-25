# Spec — the horizon cascade, redrawn

**Written:** 2026-07-25 · **Branch:** `horizon-design`, off `cascade-unification` (`b2e2c62b`)
**Supersedes the direction in:** `tasks/2026-07-25-year-page-design-brief.md`
**Builds on the findings in:** `tasks/2026-07-25-cascade-parity-audit.md`

---

## The rule

> **A rung draws the unit it places into. Never finer.**

| Rung | Draws | Places into |
|---|---|---|
| Year | 4 season segments on a 12-month scale, claims plotted | nothing — look only |
| Season | 3 month strips | a month |
| Month | 4–6 **week strips** | a week |
| Week | 7 **day columns** | a day |
| Today | the hour grid | a time |

Today is the only rung that already obeys it. The other three draw one unit
too fine and then refuse what they drew:

- **Month** builds 42 day cells and a `Sun Mon Tue…` header. Both live callers
  run in week mode, where day cells are inert. `MonthPage` says so in a
  comment: *"Deliberately NOT passing onPlaceTask."*
- **Week** renders the 6 AM–10 PM hour grid, then `placementGrain="day"` throws
  the hour away — *"the clicked slot's hour is deliberately discarded."*
- **Year** gives twelve equal boxes to a year you are 56% through, eight of
  them holding a dash.

Phases 3–4 fixed the **writes**. Nobody redrew the **pictures**. Every
"deliberately discarded" comment on this branch is an apology for a drawing
that lies. This spec removes the apologies.

---

## Verified state of the data (prod, 2026-07-25)

Design decisions below are anchored to this, not to guesses.

| | |
|---|---|
| Calendar events in 2026 | 346 — Jan 66, Feb 83, Mar 48, Apr 21, May 24, Jun 17, Jul 49, Aug 26, **Sep 1, Oct 2, Nov 5, Dec 4** |
| Multi-day claims remaining | 5 — Iris on call (Jun 26–Jul 4), Beech (Jul 10–14), Catskills (Aug 8–15), Iris call week (Aug 28–Sep 5), Federico (Dec 10–12) |
| Scheduled tasks in 2026 | 226 — weekly density 5–42 through week 32, then **flatline from week 36** |
| Active goals | 16 (7 with nothing under them; 2 near-duplicate pairs) |
| Season picks (`bucket='quarter'` + `picked_at`) | 12 — **every `picked_at` stamped 2026-07-15 or 07-24** |
| Month moves (`bucket='month'`) | 30 total, 14 threading to a goal |
| Moves with a `week_start` | **0** |
| Completions in the whole goal thread | 1 |

**Consequence for the design:** the brief's goal-lane timeline ("you can see a
goal went dead in March") is **not buildable**. `picked_at` is ten days old, so
every mark would sit at day 196–206. Sixteen identical rows bunched under the
today line is the same failure as the errand titles, one layer up. The ledger
below reports what the data can honestly carry, and grows lanes later without a
rewrite.

---

## The blocking bug — the pages see one week of calendar

`useGoogleCalendar.fetchEvents` **replaces** the whole `events` array
(`setEvents(data.events || [])`). The only page-side caller is
`src/shell/useShellChrome.ts:136` — `fetchEvents(today, weekLater)`. **Seven
days.**

Every horizon page reads that array through `shared.tsx:130`. So `/year` has
been drawing a whole year out of one week of calendar, and `/month` and
`/season` are equally blind. The wizard looks richer only because
`CalendarStep`, `PlaceOnWeeksStep` and `ScheduleGridStep` each fetch their own
period range on mount.

**Ship the ribbon without fixing this and you get a beautiful empty axis.**

**Fix:** `useHorizonPageData` fetches its own rung's period on mount, the way
the wizard steps already do. Because `setEvents` replaces, the fetch must be
scoped per rung and re-run when the rung or period changes.

---

## Per-rung design

### `/year` — the ribbon and the ledger

**The ribbon**, full width (`PAGE_COLUMN_FULL`), one horizontal axis:

- 12 month tick labels as the scale.
- 4 season segments as bands; the current season named in primary.
- **Elapsed shading** to today (day 206 → 56.2%), with a today rule cutting
  through every band, and the day count in the masthead.
- **Claim bars** — multi-day calendar events (≥2 days) plotted at true
  position, labelled, staggered so they don't collide.
- **52-week density strip** beneath — events + scheduled tasks per ISO week.
  Past weeks muted, current week primary, future weeks pale. The flatline from
  week 36 is the signal, not a gap to hide.
- **Empty stretches cost a sliver**, not a card.
- **Read-only.** Nothing places from `/year`. (Enforced in `b2e2c62b` — do not
  undo.)

One prose line under the ribbon reports what it shows: claims remaining, and
where the written year stops.

**The ledger**, replacing the goal list. Grouped by area, one row per active
goal, four columns:

| Column | Source |
|---|---|
| Picked | `bucket='quarter'` && `picked_at` && `goal_id` matches, this domain |
| Moves | `bucket='month'` && `goal_id` matches |
| On a week | `week_start != null` && `goal_id` matches |
| Done | `goalRollup(goalId, tasks).done` — leaf-only |

- A goal with nothing under it dims to ~60% and shows em-dashes. It does not
  disappear and it is not an alarm.
- A zero in **On a week** when **Moves** > 0 renders in the warning tone: this
  is the stall, and it is the one fact no surface in Symphony reports today.
- Below the ledger, a summary strip naming the stall and the untouched count.

**Deliberately not built:** per-goal timeline lanes. Revisit once `picked_at`
has ≥2 seasons of history. The ledger's columns are lane-shaped so this is
additive.

### `/season` — three month strips

Three strips, `flex` weighted by days in month, elapsed shaded across the row.
Each strip: month name, count of what's already claimed, chips for multi-day
claims falling in it, and the count of moves placed into it. A month with
almost nothing reads *wide open* on a dashed border — September currently holds
one event, and that is worth seeing.

Picks (`BetsGrid`) and the shelf (`OverflowTray`) stay as they are — this pass
does not touch the season's pick vocabulary, which shipped 2026-07-20/21.

### `/month` — week strips, no day columns

(4–6 rows depending on how the month falls; July 2026 renders 5.)

`MonthCalendarGrid` stops building 42 cells. Each week in the month becomes one
full-width row:

- Left rail: date range, and a state label — `past` / `this week` / `ahead`.
- Body: what's already claimed in that week (count + multi-day chips), and the
  lane of moves placed on that week (existing `isPlacedOnWeek` read).
- **The row is the drop target** — which it already was. Past weeks dim; the
  current week takes the primary ring; future weeks show the drop affordance.
- The weekday header row and all day-cell drop handling are deleted, along with
  the now-unreachable `onPlaceTask` prop.

The shelf keeps its compact wrap-lane of pills (audit decision #2).

### `/week` — seven day columns, no hour grid

`PlanningGrid` gains a day-grain mode. When `placementGrain="day"`:

- The hour axis and 30-minute slots are not rendered.
- The existing `allDayTasksByDate` map — which in day-grain mode already holds
  *everything*, because every write in this mode sets `isAllDay: true` — grows
  into the full column body.
- Seven columns, today ringed, drop target is the column.
- Click-to-create on a column keeps its current behavior (midnight +
  `isAllDay: true`), which is now what the drawing promises rather than
  something quietly discarded.

Today's plan-day grid (`HomeViewContainer`, default `placementGrain='time'`) is
**untouched**.

---

## Parity — structural, not maintained

| Rung | Page | Wizard step | Status |
|---|---|---|---|
| Year | `YearRibbon` | `mountain-ranges` → `CalendarStep` → `YearRibbon` | shared after this pass (was already shared via `YearCalendarGrid`) |
| Season | `SeasonMonthStrips` | `season-ahead` → `CalendarStep` → `SeasonMonthStrips` | **gap closed by this pass** |
| Month | `MonthCalendarGrid` | `place-on-weeks` → `MonthCalendarGrid` | already shared |
| Week | `PlanningSession` grain=day | `place-rocks` → `PlanningSession` grain=day | already shared |

`CalendarStep` currently renders `YearCalendarGrid` for the annual session and
generic per-month event counts for every other horizon. After this pass it
renders the rung's own artifact at year and season altitude, and keeps its
per-day rows for month/week/day look-ahead.

Because both surfaces mount the same component, they cannot drift.

---

## Components

**New**
- `src/components/planning/horizon/YearRibbon.tsx` — the axis, segments, claims, density.
- `src/components/planning/horizon/GoalLedger.tsx` — grouped rows, four columns, stall summary.
- `src/components/planning/season/SeasonMonthStrips.tsx` — three proportional month strips.
- `src/lib/planning/timeAxis.ts` — shared maths: day-of-year → percent, elapsed fraction, ISO-week bucketing, multi-day claim extraction, month/season boundaries. Pure, fully unit-tested.

**Changed**
- `MonthCalendarGrid.tsx` — week rows replace the 42-cell grid.
- `PlanningGrid.tsx` / `PlanningSession.tsx` — day-grain rendering mode.
- `YearPage.tsx`, `SeasonPage.tsx` — new artifacts.
- `shared.tsx` (`useHorizonPageData`) — per-rung event fetch.
- `CalendarStep.tsx` — renders the rung artifact at year and season.

**Deleted**
- `YearCalendarGrid.tsx` and its test.
- `onPlaceTask` from `MonthCalendarGrid` (zero callers since `MonthZoomSheet` was removed — dead the same way `parkingMenu` was).

**No schema change.** `week_start` already exists; everything else is derived.

---

## Out of scope

- Duplicate goals (`get healthy`/`get healthier`, `make lots of money`/`money
  tons of money`) and duplicate areas (`Home` ×2, `Money & Estate` ×2,
  `health`/`Health`). The ledger shows them honestly; no auto-merge. Worth its
  own pass.
- Today's hour grid.
- `/someday`.
- The season pick vocabulary.
- Per-goal timeline lanes (see above).

---

## Verification

Type-checks are not inspection. A year page listing *"Lay out clothes for the
NYSRA interview"* survived two passes because nobody opened it.

1. `npx tsc -b`
2. `npx vitest run` (**not** `npm test` — watch mode)
3. `npm run build`
4. `npm run lint`
5. **Dev server on port 5173** — Scott's browser holds a session for that
   origin; any other port and every fresh preview URL lands on the sign-in
   wall. Open **all four pages** and confirm by eye:
   - `/year` — the ribbon carries all five remaining claims, the density strip
     flatlines at week 36, and the ledger's *On a week* column reads 0 against
     14 moves.
   - `/season` — September reads wide open.
   - `/month` — five week rows, no weekday header anywhere, Jul 19–25 ringed.
   - `/week` — seven day columns, no hour axis, Saturday ringed.
   - Then the same artifacts inside the wizard: `mountain-ranges`,
     `season-ahead`, `place-on-weeks`, `place-rocks`.

## Constraints

Nordic Journal (`src/index.css`). **Lucide icons, never emojis.** `font-display`
serif for content mastheads, sans for chrome. Tailwind v4 — unlayered CSS beats
every utility, so overridable defaults belong in `@layer base`. Work in the
`horizon-design` worktree, never the main worktree. Every push to `main` deploys
to production.
