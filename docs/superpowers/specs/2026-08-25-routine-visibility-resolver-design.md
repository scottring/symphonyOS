# Routine visibility resolver

**Date:** 2026-08-25
**Status:** design approved, ready for an implementation plan
**Scope:** step A of the routines overhaul (A → B → C: resolver → board → close the chat gap)

## The problem

"Should this routine show up?" is answered in 15 places across 18 files. Each
place implements a different subset of the rule, so the same routine appears on
one surface and not another for no reason a user could name. The subsets are not
side by side either — each surface applies the rule in pieces spread down its own
data pipeline, which is why the divergence went unnoticed for so long.

This spec defines one rule set, in one pure function, and the order and method
for adopting it without silently changing what anyone sees.

**The call-site divergences are bugs to fix, not behavior to preserve.** Where
adoption changes what renders, that change is named explicitly (see
[Behavior changes](#behavior-changes-adoption-lands)) rather than absorbed.

## Section 1 — the resolver

### Signature

```ts
resolveRoutine(
  routine: Routine,
  ctx: { date: Date; member?: string; prefs: RoutinePrefs },
): { shows: boolean; reason: RoutineHideReason; owners: string[] }
```

where

```ts
interface RoutinePrefs {
  hideRoutines: boolean          // the "hide daily routines" toggle (rung 7)
  domain: PlanningDomain         // the active domain lens (rung 4)
}
```

`member` is optional: omit it and rung 5 is skipped, which is what a surface
showing everyone's routines wants. `prefs.domain === 'universal'` makes rung 4 a
no-op, matching `filterRoutinesForDomain`'s existing semantics.

Lives in `src/lib/routineUtils.ts`, alongside `matchesRecurrenceForDate` and
`isEverydayRoutine`, which it calls.

**There is no `surface` parameter.** Every real visibility rule is
surface-independent. A resolver that took a surface would return a matrix, and
the board (step B) could only report "it depends"; without one it reports a
single verdict and a single reason. Keeping this true is a constraint on the
design, not an accident of it — see [The `show_on_timeline` conflict](#the-show_on_timeline-conflict).

### The ladder

First match wins. The matching rung *is* the reason.

| # | Condition | `reason` |
|---|---|---|
| 1 | `visibility !== 'active'` | `resting` |
| 2 | recurrence does not match `date` | `not-today` |
| 3 | `show_on_timeline === false` | `off` |
| 4 | fails the domain lens | `other-domain` |
| 5 | `member` given and not in `owners` | `not-theirs` |
| 6 | `parent_routine_id != null` | `in-collection` |
| 7 | `prefs.hideRoutines` ∧ everyday ∧ ¬pinned | `everyday` |
| 8 | — | `shows` |

Ordering rationale: the rungs run cheapest-and-most-absolute first, so the reason
a user is shown is the most fundamental one true of that routine. A resting
routine that also doesn't recur today reads better as "resting" than "not today."

Rung 7's "pinned" means `pin_to_timeline === true || (times_per_day?.length ?? 0) > 0`
— the existing `isPinnedToTimeline` rule in `src/lib/today/statusMaps.ts`, which
treats a dosed routine (PT exercises) as a tracked obligation rather than ambient
noise.

### `owners`

```
owners = assigned_to_all (if non-empty)
       ?? [assigned_to] (if set)
       ?? [default_assignee] (if set)
       ?? []
```

`routineToTimelineItem` (`src/types/timeline.ts:148`) starts carrying `owners`.
It currently drops `assigned_to_all` entirely, which is why multi-assigned
routines behave inconsistently downstream.

**Read-side only. No migration.** The three assignment columns stay as they are;
the resolver is the single place that knows how to collapse them.

### Deliberately outside the resolver

Two predicates are caller-side, because they are not visibility questions:

- **`isDraggable(routine)`** — planning surfaces want untimed routines only
  (`!time_of_day`). A timed routine is visible but not a drag source.
- **`canHeadline(routine, prefs)`** — the wall's glance-card ranking. Becomes
  pref-aware (today it skips everyday routines unconditionally; after, it honors
  `prefs.hideRoutines`). Small, intended behavior change.

## Section 2 — adoption

### 2a. The migration unit is a surface, not a call site

`selectVisibleRoutines` handles only rungs 3/6/7 because 1/2/4/5 already ran
upstream in `useRoutines`, `useScheduleFiltering`, and `filterRoutinesForDomain`.
Swapping it in isolation would mean threading `date`, `member`, and `domain` down
into it. So the unit of work is a surface: **one `resolveRoutine` call at the
surface's entry point replaces that surface's whole pipeline.**

#### Current state, enumerated against `origin/main` on 2026-08-25

| Surface | Where the rungs live today | Applied |
|---|---|---|
| **Today** | `useRoutines.activeRoutines` → `getRoutinesForDate` → `useScheduleFiltering` → `filterRoutinesForDomain` (`HomeView.tsx:90`, `HomeViewContainer.tsx:262`) → `statusMaps.selectVisibleRoutines` → `grouping.ts:66` + `routineCollections.ts:132` | all 8, across 6 files |
| **Week grid** | `WeekViewV2.tsx:235`, `WeekViewMobile.tsx:89` | 1,4 upstream; 3,7,2 local; **5, 6 never** |
| **Month / legacy Week** | `MonthView.tsx:165`, `WeekView.tsx:239` | 1,3,5; **6, 7 never** |
| **Planning** | `PlanningSession.tsx:465,479`, `GuidedSessionContainer.tsx:92,152` | 3,7; **5, 6 never** |
| **River** | `CascadingRiverView.tsx:669-672` | 3 + assignee, but reads `assigned_to` **only** — `assigned_to_all` ignored |
| **Wall** | `useWallData.ts:299` → `wallV2Adapter.ts:345`, `wallLanes.ts:118`, `wallGantt.ts:87` | 2,7; **3 skipped deliberately; 5, 6 never** |
| **Rhythm / Tend** | `RhythmPage.tsx:196`, `tendHeuristics.ts:49` | management surface — does not adopt |

#### Order

**Today → Week + Month → Planning → River → Wall.**

- **Today first.** It is the only surface with a pure, already-fixtured core
  (`computeTodayData`), and it exercises all eight rungs. If the resolver is
  wrong, it is wrong here first and cheapest.
- **Wall last.** It is the only surface that is glanced at rather than clicked
  through, it runs on the Pi where a bad render is not obvious for hours, and it
  holds the one genuine rule conflict. Landing it alone means one revert.
- **Rhythm/Tend does not adopt.** Its job is to show resting routines so you can
  wake them; `!parent_routine_id && visibility === 'active'` is correct there.
  It gets a comment saying so, so the next reader doesn't "fix" it.

Each surface is its own commit.

### 2b. Test strategy — characterization first, migration second, the diff is the deliverable

A single **conformance corpus**: roughly 30 routine fixtures crossed with
`(date, member, prefs)`, each row carrying an expected `{ shows, reason }`.
Fixtures use raw DB column shapes, not hand-built objects that drift from the
schema.

The corpus does two jobs.

1. **It is the resolver's own spec.** `resolveRoutine.test.ts` walks it; every
   rung and every reason is exercised, including rung-ordering cases where two
   rungs both apply.

2. **It is a parity harness for each surface.** Before a surface migrates, a test
   runs that surface's *existing* pipeline over the corpus and records which
   routines survive. The migration commit then swaps the internals. The parity
   test must still pass — or the diff it reports **is** the behavior change, and
   it goes in the commit message.

That second job is what makes "one rule set" runnable rather than asserted:
divergence cannot land silently, it has to be named.

**Tripwire.** A test that fails if `show_on_timeline`, `pin_to_timeline`,
`isEverydayRoutine`, or `visibility === 'active'` appears in a render-path file
outside `src/lib/routineUtils.ts`. Without it, call site #16 appears within a
month. Modelled on the existing scope tripwire; the allowlist is explicit so
adding a legitimate exception is a deliberate edit.

### 2c. Behavior changes adoption lands

Every change below is intended. Nothing else should move; anything that does is a
parity-test failure and a bug in the resolver.

**Wall:**

1. **Collection steps stop rendering as loose rows.** Nothing on the wall path
   knows `parent_routine_id` — `dedupeRoutines` (`wallV2Adapter.ts:192`) is
   name-based only. Rung 6 hides steps. Fewer rows; the largest single visual
   delta.
2. **`pin_to_timeline` starts working.** `wallV2Adapter.ts:349` sweeps everyday
   routines with no pin escape and never checks `times_per_day`. After, a
   pinned or dosed routine survives "hide daily routines" on the wall as it
   already does on Today. More rows when hide-daily is on.
3. **`canHeadline` becomes pref-aware** — a member's glance card may headline an
   everyday routine when hide-daily is off.

**Week grid, Month, Planning:**

4. **Rung 5 (assignee) and rung 6 (collections) start applying.** Collection
   steps stop appearing as loose blocks; the assignee filter starts narrowing
   routines on surfaces where it previously narrowed only tasks and events.

**River:**

5. **Multi-assigned routines reappear.** `CascadingRiverView.tsx:669` reads
   `assigned_to` only, so a routine assigned via `assigned_to_all` is invisible
   there today. `owners` fixes it.

### The `show_on_timeline` conflict

`useWallData.ts:299` carries an explicit comment: it skips `show_on_timeline` on
purpose, because the kids' morning and bedtime routines are marked
`show_on_timeline = false` to keep Today uncluttered, and the wall needs them.

So the flag currently means two different things depending on the surface.
Adopting rung 3 unconditionally would delete the kids' morning and bedtime
routines from the wall.

**Resolution: fix the data, not the rule.** The flag is not the problem. Those
routines were never meant to be globally hidden — `show_on_timeline = false` was
the nearest available switch for getting them off Scott's Today view. The correct
mechanism is the assignee filter: they are the kids' routines, and the assignee
filter already scopes by person and is opt-in.

Implementation consequence, in order:

1. **Audit before backfilling.** Enumerate every routine with
   `show_on_timeline = false` and classify each as (i) genuinely hidden
   everywhere, or (ii) using the flag as a Today-declutter workaround. Do not
   assume the kid routines are the only case.
2. **Backfill category (ii)** to `show_on_timeline = true`, confirming each has
   assignment set so the assignee filter can do the work instead.
3. **Confirm Today does not get noisy** for Scott's own default filter state
   before the wall commit lands.
4. **Then** the wall adopts rung 3 with no exception.

Alternatives considered and rejected: giving the wall a documented exemption from
rung 3 (the same divergence with a nicer name), and adding an
`includeOffTimeline` flag to the resolver (one surface bit becomes three, and the
board loses its single verdict).

## Out of scope

- Any change to the three assignment columns. Read-side only.
- Step B (the board) and step C (the chat gap). They depend on this and follow it.
- Rhythm/Tend visibility rules.
- Splitting the specials event on Today. Decided against; wall only.
