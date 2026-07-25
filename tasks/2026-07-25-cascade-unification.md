# Cascade unification — one vocabulary, a descent that completes, words that mean one thing

**Written:** 2026-07-25 · **Status:** BUILT, green, verified in the browser on localhost
**Input:** `tasks/2026-07-25-cascade-parity-audit.md` (all four findings addressed; all four
settled decisions honored — one with an argued refinement, noted below).

---

## The model this converges on

The audit's diagnosis was that the cascade is implemented twice and the copies drifted.
The unification is not a third implementation — it is three collapses:

1. **One fate vocabulary, two densities.** `TriageWhenMenu` (the chips row: whens with
   fan-outs + pick-date + Done + Delete) is THE vocabulary. Rows render it inline, as
   they already did. Compact surfaces (shelf pills) render it through **`TaskFateMenu`**
   (`src/components/schedule/TaskFateMenu.tsx`) — a ⋯ trigger opening a portal panel
   that contains the *actual* `TriageWhenMenu` component, plus the verbs that only exist
   where the task is standing: Open, "Bring to this week" (stale placements), and
   "File under a pick". Because the panel hosts the same component, the temporal verbs
   *cannot* drift between a wizard review row and a shelf pill — there is nothing to
   keep in sync.
2. **Every rung's decision reachable on both surfaces.** The two holes are closed in the
   two directions: the monthly session gained the placement step the page already had
   (`place-on-weeks`), and the month page gained the threading verb the wizard already
   had (File under a pick).
3. **One meaning per word.** *Shelf* = this rung's pool of not-yet-chosen/placed items
   (season's unpicked outcomes, month's unplaced moves, week's unplaced rocks — same
   concept at every altitude). *Put aside* = send to Someday. *Let it go* = delete.
   Code now says shelf where the product says shelf; `bench` is gone.

## What changed, by finding

### Finding 1 — four fate vocabularies → one

- **`TaskFateMenu`** (new): portal + fixed positioning (the `PushDropdown` pattern —
  measured after mount, clamped to the viewport, flipped when the bottom is tight),
  because shelf pills sit at both edges of a wrap lane and an absolute panel clipped
  under the sidebar (caught by looking at the UI, not by tests).
- **`PlanningShelf` pill** (vocabulary A): the bespoke 4-item menu and the separate
  `PushDropdown` are gone; the pill now has one trigger carrying the full vocabulary —
  including **Done**, which the week and month pages could not perform at all before.
  New props: `onCompleteTask` (required), `fileUnder` (optional, month), `onSetBucket`
  widened to `TaskBucket`; `moveDown` deleted — "To week"/"To month"/"Put aside" are the
  This week / This month / Someday whens by their real names, routed through
  `applyTriageWhen` like every other surface.
- **`renderRow`'s `parkingMenu`** (vocabulary C): deleted. It was dead — no season or
  month surface ever called `renderRow` — and its altitude verbs were whens by another
  name. Its tooltip reasoning ("month-sized, not season-sized") lives on in the horizon
  explainers and in the audit doc; it did not earn a fifth surface.
- **Wizard rows** (vocabulary D): `GuidedHost.onDeleteTask` added (container wires
  `deleteTask`), `TaskTriageRow` passes `onDelete` — every review/write row can now
  actually perform the "or let it go" its narration has been promising. This also gives
  the inbox and write-list steps delete, which matches the standalone inbox surface.

### Finding 2 — the descent completes from either surface

- **`place-on-weeks` step** (new step type + `PlaceOnWeeksStep`): the monthly arc's
  `place-rocks`. Renders `MonthCalendarGrid` in week mode for the session's target
  month — the grid's own rocks rail is the shelf — and performs the *identical write*
  as `/month`: `bucket='week' + week_start`, `scheduled_for` cleared, `isAllDay` reset;
  drag-back clears the week. A "N placed · M to place" line uses the same two-kinds-of-
  placed arithmetic as the `/month` masthead AND the same copied-down exclusion as the
  rocks rail (found live: the counter said 32 while the rail said 25).
  - **Argued refinement of settled decision #4** ("after `write-month`"): the step sits
    after **`maintenance`**, not immediately after `write-month`. The upkeep sweep also
    writes month moves; placement must come after the *last* step that writes the list,
    or upkeep items would never be offered a week. This is still "after write-month",
    and a test now pins the ordering against both writers.
- **File under a pick, on the page**: `MonthPage` passes `fileUnder` (season picks with
  their goal names) into the shelf; the pill menu threads `sourceId + goalId` exactly
  like `MoveByPickStep`. Filing visibly moves the pill into its pick's rolled-up group.
- **Year page month peek**: `MonthZoomSheet` gained an `onPlaceTaskInWeek` passthrough
  and `YearPage` uses it — the zoomed month now places onto a WEEK like `/month`,
  instead of the old day-drop that skipped the week rung and wrote invisible midnight
  tasks (`bucket:'timed'` with no `isAllDay` — the bb7bc0ea bug, still live here).
  Unschedule from the zoom also clears `weekStart` now.

### Finding 3 — the words

- `partitionSeason` returns `{ picks, shelf }`; `useBenchAudit` → `useShelfAudit`
  (file + identifiers; the localStorage keys keep the old name on purpose — renaming
  them would silently discard every cached verdict, each one a paid API call).
- `OverflowTray`: `onShelf`/`onShelfLinked` → `onPutAside`/`onPutAsideLinked`; the
  self-contradicting copy under the "On the shelf" heading now reads *"Pick one up,
  turn it into a month move, **put it aside**, or let it go"*; "Shelf instead" →
  "Put aside instead". Also: the copy claimed "a season holds 5–8 picks" while
  `PICK_CAP` is 10 and the grid renders ten positions — it now speaks `PICK_CAP`.
- Every remaining `bench` identifier/comment across `shared.tsx`, `LookAboveStep`,
  `PickByGoalStep`, `WriteListStep`, `ListSuggestions`, `types/task.ts`, and the tests
  renamed. (Task titles in tests that mean literal furniture were left alone.)

### Finding 4 — progress that tells the truth

- `goalRollup` counts **leaves only**: a task that some other task points at via
  `sourceId` is a rung of the descent, not a move of its own. A pick → month copy →
  week copy chain now counts as ONE move, done when its leaf is done. Set-aside clears
  the copy's `sourceId`, so an abandoned descent hands the count back to the parent —
  no orphaned zeros. Completion still does NOT propagate (deliberate: a porch being
  set up isn't done because one errand is). Tests pin all three behaviors.

## Deliberately not done

- **Auto-closing a pick when its last move completes** ("close the pick too?"): the
  audit floated it as an alternative to leaf counting. Leaf counting fixes the number
  Scott asked about; auto-close is a behavior change to the season review's contract
  (a pick's verdict is a season-level decision) and deserves its own conversation.
- **PlacementChip fates**: chips on the calendar grids still have no complete/delete —
  they are placement objects, and the detail panel is one tap away. Widening the
  vocabulary there would trade drag ergonomics for menu clutter.
- **The 7 pre-existing lint errors** on origin/main (`OverdueSection`,
  `RoutineCollectionRow`, `useSystemHealth`, `extract-capture/whatsapp`) — untouched
  files, out of scope, left alone per the minimal-impact rule.
- **`useShelfAudit` localStorage keys** keep the `benchAudit` name (see above).

## Found beyond the audit

- The **fate-menu clipping** (portal fix above) — invisible to unit tests.
- **`PlaceOnWeeksStep` count drift** vs the rocks rail (copied-down exclusion).
- **Season copy vs `PICK_CAP`** ("5–8" vs ten slots on screen).
- The **worktree dev server serves stale modules** even across hard reloads; a
  `--force` restart with `node_modules/.vite` cleared is required before trusting the
  browser (existing memory, re-confirmed).

## No schema changes. No production data touched.

Everything rides existing columns (`bucket`, `week_start`, `scheduled_for`,
`source_id`, `goal_id`, `picked_at`). The browser pass ran against localhost with
Scott's session read-only: menus opened and screenshotted, nothing clicked that writes;
the wizard walkthrough used the fresh August session and was returned to step 1.
