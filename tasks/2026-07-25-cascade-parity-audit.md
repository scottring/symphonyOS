# Audit — page/wizard parity across the planning cascade

**Written:** 2026-07-25 · **Status:** findings only, nothing built
**Why it exists:** handoff for a holistic design/UI/functionality pass. Everything
below was verified against the code on `origin/main` at `aea47491`, not recalled.

---

## The model, as shipped

Five rungs, and **exactly one decision per descent** — the organizing rule.

| Rung | Unit | The one decision | Stored as | Session cadence |
|---|---|---|---|---|
| Year | **Goal** | which few things matter this year | row in `goals`, grouped by area | Sep 1 |
| Season | **PICK** | which goals get worked this season | `bucket='quarter'` + `picked_at` | season start |
| Month | **Move** | what concretely gets done | `bucket='month'`, filed under a pick | first Saturday |
| (between) | — | which **week** | `bucket='week'` + `week_start` | — |
| Week | **Placement** | which **day** | `bucket='timed'` + midnight + `is_all_day` | week-start day |
| Today | — | what **time** | `scheduled_for` with a clock time | daily |

Cross-cutting: **"look, don't link"** — each rung keeps its own list, the level
above is a read-only reference panel, and "copy down" *duplicates* on purpose.
Copies inherit `source_id` (the row above) and `goal_id` (the year goal, carried
flat all the way down), which buys `lineageTrail` breadcrumbs and `goalRollup`.

Recent work: `tasks/2026-07-24-placement-cascade-week-rows.md` (the month→week
rung), then stale-week carry-over (`aea47491`).

---

## Finding 1 — FOUR fate vocabularies, and the two you use most are the weakest

| | Surface | Used by | Whens | Demote | Put aside | Delete | Complete |
|---|---|---|---|---|---|---|---|
| **A** | `PlanningShelf` pill | **WeekPage, MonthPage** | push-dropdown only | ✓ | ✓ | ✓ | **✗** |
| **B** | `renderRow` → `TriageWhenMenu` | SomedayPage | all 11 | via whens | via whens | ✓ | ✓ |
| **C** | `renderRow` → `parkingMenu` | *nothing* — see below | ✗ | ✓ | ✓ | ✓ | ✓ |
| **D** | `TaskTriageRow` (every wizard review/write step) | all sessions | all 11 | via whens | via whens | **✗** | ✓ + note |

- **`WeekPage` and `MonthPage` never call `renderRow`** — they render only
  `PlanningShelf`. So the two rungs you live in are stuck on **A**, the only
  vocabulary in the app where you *cannot mark something done*.
- **C is dead code.** `parkingMenu` fires only for `horizon === 'season' | 'month'`,
  but SeasonPage's `renderRow` sections are — per its own comments — "never
  populated for season", and MonthPage never calls `renderRow`. Its "To month /
  To week" tooltips carry real altitude reasoning worth preserving somewhere.
- **D's narration promises a fate it cannot perform.** Every review step ends
  "…or let it go." `TriageWhenMenu` accepts an `onDelete`; `TaskTriageRow` never
  passes one, and `GuidedHost` has no `onDeleteTask` at all. The nearest reachable
  fate is Someday, which is not letting go.

## Finding 2 — the flow does not complete from either surface alone

| Descent | Page | Wizard |
|---|---|---|
| goal → season pick | SeasonPage `OverflowTray` | `PickByGoalStep` | ✓ both |
| pick → month move (copy down) | month reference fold | `LookAboveStep` / `MoveByPickStep` | ✓ both |
| **file an existing move under a pick** | **✗ none** | `MoveByPickStep` | wizard-only |
| **month move → a week** | month grid row drop | **✗ none** | **page-only** |
| week move → a day | week grid | `ScheduleGridStep` | ✓ both |
| day item → a time | Today's plan-day grid | daily session | ✓ both |

- The **monthly arc** is welcome → wins → month-review → look-at-season →
  month-ahead → look-within → projects → move-by-pick → write-month →
  maintenance → book-next. **Nothing places anything.** `month-ahead` passes
  `readOnly` to `MonthZoomSheet` by design (it's the "what's already claimed"
  scan that runs *before* you write). So the monthly ritual can complete with not
  one move given a week. Compare the weekly arc: `write-week` → **`place-rocks`**.
  The monthly arc is missing its `place-rocks`. **Decided: add a `place-on-weeks`
  step after `write-month`.**
- `YearPage`'s month zoom still places the old way —
  `onPlaceTask={(id, day) => updateTask(id, { bucket: 'timed', scheduledFor: day })}`
  — which skips the week rung *and* omits `isAllDay`, so a midnight drop lands at
  the 12 AM row outside the visible 6 AM–10 PM grid. Written and invisible; the
  same bug fixed on WeekPage in `bb7bc0ea`.

## Finding 3 — the vocabulary contradicts itself on screen

The UI says **"On the shelf"** (`OverflowTray`). The code says `bench`
everywhere: `partitionSeason()` returns `{ picks, bench }`, plus `useBenchAudit`,
`benchId`, `setBenchOpen`, `referenceBenchItems`, and a dozen comments. Nothing
user-facing says bench.

Worse, **"shelf" means three different things**, two of them on one screen:

| Use | Means |
|---|---|
| "On the shelf" (`OverflowTray` heading) | open quarter items that aren't picks — *still this season* |
| `PlanningShelf` / `partitionMonth().shelf` | the week/month unplaced pool |
| `onShelf(id)` → `bucket: 'someday'` | **off the season entirely** |

`OverflowTray`'s own copy reads *"Pick one up, turn it into a month move, shelf
it, or let it go"* — directly under the heading **"On the shelf."** So "shelf it"
moves an item *off* the shelf.

## Finding 4 — progress mixes altitudes

`goalRollup(goalId, tasks)` is a flat filter over every task carrying that
`goal_id`. Copy-down duplicates by design, and **nothing propagates completion**
(`toggleTask` cascades only through `parentTaskId`, never `sourceId`). So a pick
AND the move copied from it both land in `total`: finish the one real action and
the year page reads **"1 of 2 moves done."** Every copy-down inflates the
denominator. Separately, `partitionSeason` keeps a pick "active" until ticked by
hand, even when every move under it is done.

Scott asked for this to be worked on. Not propagating automatically is probably
right — a porch being *set up* isn't done because one errand is — so the fix is
likely leaf-altitude counting, or offering "close the pick too?" when its last
move completes.

## Non-finding (checked, not a problem)

The pages and wizards use **different domain filters** — pages `matchesDomain`
(`context === domain`), wizards `filterTasksForPlanning` (that **plus** untagged
*inbox* items). They differ only for inbox-bucket rows, and no horizon page ever
shows those (`HORIZONS` has no inbox rung). Identical in effect. Leave alone.

---

## Decisions already made (don't re-litigate)

1. **The pages stay.** Hiding `/season` and `/year` was considered and rejected.
2. **Parity of verbs, not layout.** The week/month shelf keeps its compact
   wrap-lane of pills (the all-day-lane pattern); the unified fate menu goes
   *inside* the pill. It does not become a row list.
3. **Add delete to the wizard review row** rather than removing "let it go" from
   the narration.
4. **Add a `place-on-weeks` step** to the monthly arc after `write-month`,
   mirroring `place-rocks` in the weekly arc.

A partial implementation of #1–#3 exists as a patch (menu unification, wired
`onDeleteTask`, dead `parkingMenu` removal). It does not compile and is
deliberately NOT applied — treat it as a sketch of intent, not a starting point.

## Constraints

- **Nordic Journal** design system, `src/index.css`. **No emojis — lucide icons
  only.** Serif (`font-display`) for content mastheads; app chrome stays sans.
- Tailwind v4: unlayered CSS beats every utility — overridable defaults belong in
  `@layer base`.
- Every push to `main` **deploys to production**. Feature branches deploy as
  harmless previews. Work in a worktree off `origin/main`, never in the main
  worktree. See CLAUDE.md.
- `npx vitest run` (NOT `npm test` — watch mode). `npx tsc -b`, `npm run build`,
  `npm run lint` (CI lints; pre-push doesn't).
- Scott manages Parkinson's and treats energy as a finite resource. Friction and
  decision-count are real costs, not aesthetics.
