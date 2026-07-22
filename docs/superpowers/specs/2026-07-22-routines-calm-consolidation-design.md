# Routines Page: Calm Consolidation

**Date:** 2026-07-22
**Status:** Approved by Scott (goal, loose-item treatment, Tend home, quick-add removal all explicitly confirmed)

## Problem

Two days of reactive feature accretion turned the Rhythm page into a
management workbench wearing a rhythm costume. One screen carries five
zones, eight card/chip types, and ~15 interactive concepts. Root causes
identified in the audit:

1. The page renders the database's shape (loose routines vs. collections)
   instead of the day's shape — "Unnamed cluster" cards with dashed borders
   and orange prompts greet the user with chores about the app.
2. Duplication is built in (arc + 7 every-day mirrors + resting ghosts),
   then managed with toggles that exist only to hide it.
3. Looking and gardening are interleaved everywhere; the page never lets
   you just look.
4. The underlying data is messy (5 loose evening chores beside an empty
   Kids Bedtime Routine shell) and the page faithfully paints the mess.

## Goal (the ruler for every decision)

**/routines is a calm rhythm picture.** In 10 seconds a family member sees
how the family's day and week run, and who's on what. Everything that is
not the picture lives behind deliberate doorways: the routine panel (tap a
card) and a Tend drawer (masthead button).

Decisions locked with Scott:

- **Loose routines appear as calm auto-groups**: time-clustering stays,
  the repair costume goes. Auto-groups render exactly like named rhythm
  cards, titled by daypart.
- **All curation lives in a Tend drawer** opened from the masthead.
  The picture is read-only except tap-to-open-panel.
- **The nine inline quick-adds are removed** (explicitly approved).
  Creation happens via New routine and the panel's add-step.

## The Picture (default page)

### Masthead
- Title "Routines", date subtitle, person filter pills, search box +
  type-anywhere search — all unchanged.
- Buttons: **New routine**, **Build with AI**, and new **Tend** button with
  a count badge. Badge = number of open suggestions (tend findings +
  nameable auto-groups). Sleepers do NOT count toward the badge (resting is
  a deliberate state, not a problem). Badge hidden at zero.
- The sticky section nav is **deleted** — three calm zones don't need it.
  (Remove `zones`/scroll-spy/`jumpTo` machinery from RhythmPage.)

### Zone 1 — Every day (DailyArc)
- Keeps: gradient ruler, staggered 2-col-span cards, stems/dots anchored at
  true start times, NOW marker, anytime pill row, person-filter dimming,
  search dimming.
- Cards are visually identical regardless of kind:
  - `collection` (named rhythm): title = routine name, avatars, steps as
    rows. Tap title → collection panel (unchanged).
  - `cluster` (calm auto-group): title = daypart via existing
    `suggestName(startMinutes)` ("Morning", "Midday", "After School",
    "Evening", "Bedtime") rendered as plain muted text — NOT a button, NOT
    an input. Applies to every cluster (2+ members), not only 3+.
  - `single`: title = routine name (unchanged).
- **Deleted from DailyArc:** dashed amber borders, the Pencil icon,
  click-to-edit title, the sparkles "name this rhythm?" nudge, the inline
  name input, fold-target suggestions, the anytime-row QuickAddInput.
  Props `onNameCluster`, `onQuickAddDaily`, `foldTargets`, `onFoldInto`
  are removed from DailyArcProps.
- Row taps still open the routine panel (unchanged).

### Zone 2 — Through the week (WeekStrip)
- Keeps: 7 columns, week-cadenced chips with avatars, step-count captions,
  chevron step expansion (read-only step list), today highlight, full-day
  marker, "sometime this week" pocket.
- **Deleted from WeekStrip:** every-day mirror chips + `dailyItems` prop +
  `occursOn` helper + the "Hide every-day items" toggle; resting ghost
  chips + `restingDays` prop + wake buttons + the "Hide resting items"
  toggle; the per-column QuickAddInput + `onQuickAdd` prop; the in-chip
  add-step QuickAddInput + `onAddStep` prop. localStorage keys
  `rhythm-week-show-daily` and `rhythm-week-show-resting` become unused
  (no migration needed; stale keys are harmless).
- `model.week.restingDays` stays in the model — the Tend drawer consumes it.

### Zone 3 — Sometimes (SometimesShelf)
- Unchanged pill row.

### Removed from the page body
- The Resting shelf section (SeasonalShelf moves into the Tend drawer).
- The bottom Tend section (TendCard moves into the Tend drawer).

## The Tend Drawer

New component `src/components/routine/rhythm/TendDrawer.tsx`. Right-side
overlay drawer (same interaction family as AssistDrawer: fixed inset
overlay, click-outside closes, max-w panel, own scroll). Opened by the
masthead Tend button. Contains three sections, in order:

### 1. Suggestions
- The existing TendCard content (lookalike merges, domain stamps,
  unfinished names, per-row dismiss) rendered inside the drawer instead of
  the page body. TendCard's internals are unchanged; it is relocated.
- **New suggestion row type: name-this-group.** For every `cluster` card
  currently on the arc, a row: "These travel together ({time range}):
  {member names}" with (a) a name input — Enter/submit calls the existing
  group-into-collection flow (stamps cluster start time + daily recurrence,
  exact-name match folds into the existing routine instead of creating a
  duplicate — same logic that lived on ArcCard), (b) fold-target
  suggestion buttons filtered by typed text (same behavior as the removed
  ArcCard suggestions), and (c) a dismiss X. Dismissal persists via the
  existing `rhythm-tend-dismissed` localStorage list with key
  `g:{sorted member ids joined by '.'}`. A dismissed group stops counting
  toward the badge but the group card still renders calmly on the arc.
- Moving OUT of a named rhythm: already covered by TapStepPanel's
  "Promote to standalone" (unchanged); no new mechanism.

### 2. Loose items
- List of every top-level active routine that has no steps and is not a
  named collection (i.e., `standalone` actives from groupRoutineSteps).
- Each row: name, schedule summary (reuse the recurrence text pattern from
  TapRoutinePanel's `recurrenceSummary` — reimplemented locally, it is not
  exported), avatars, and a "Move into…" select of fold targets (same
  `foldTargets` list RhythmPage already computes; excludes the routine
  itself). Choosing a target calls the existing `onAddToCollection`.
- Rows are informational + one action; no delete here (delete lives in the
  panel).

### 3. Sleeping
- SeasonalShelf relocated into the drawer (component reused as-is: title
  from earliest `paused_until`, expandable rows, per-row wake via
  onOpenRoutine/panel, Wake all button).
- Week-day sleepers no longer ghost into columns, so this is their only
  home besides the panel.

Drawer empty state: when all three sections are empty, show a single quiet
line ("Nothing to tend — the rhythm is clean."). Each section hides itself
when it has no rows.

## Wiring changes (RhythmPage)

- New state `tendOpen: boolean`; masthead Tend button toggles it.
- Badge count = `findings.length + activeGroupSuggestions.length` where
  `activeGroupSuggestions` = arc clusters whose `g:` key is not dismissed.
- Props kept as-is (RoutinesApp unchanged except where noted):
  `onGroupIntoCollection`, `onAddToCollection`, `onUpdateRoutine`,
  `onDelete`, `onAddStep`, panels — all still used (by the drawer and
  panels). `onQuickCreate` becomes unused by RhythmPage → remove the prop
  from RhythmPageProps AND remove `handleQuickCreate`/`onQuickCreate` from
  RoutinesApp (dead code is deleted, not stranded).
- `foldTargets` memo stays (used by drawer + panel move-into).
- Panel overlay wiring unchanged.

## Deletions / cleanup

- `src/components/routine/rhythm/QuickAddInput.tsx` — deleted (no longer
  used anywhere).
- `src/components/routine/PauseRoutineModal.tsx` — deleted (orphaned
  repo-wide since the Rest/wake redesign; verified unimported).
- RhythmPage: sticky nav block, zone scroll-spy effect, `zones` array,
  `jumpTo`, `setZoneRef` (keep plain section wrappers), the body Tend and
  Resting sections.
- DailyArc: all naming/folding/quick-add machinery (props + UI).
- WeekStrip: mirrors, ghosts, toggles, quick-adds (props + UI).

## What does NOT change

- `rhythmModel.ts` bucketing/clustering — only rendering changes. (One
  model tweak: `suggestedName` is set for ALL clusters, not just 3+, since
  it now serves as the calm title. Verify no test depends on the 3+ rule.)
- `tendHeuristics.ts` — unchanged (drawer adds the group rows itself from
  `model.daily.timed`).
- TapRoutinePanel / TapStepPanel — unchanged (Make this a step of,
  Promote, Active/Resting + wake date all stay).
- RoutinesApp handlers other than the quick-create removal.
- Search, person pills, empty/loading states, full-width layout.

## Tests

- DailyArc: update — cluster renders daypart title as text (no button/
  input/nudge); no quick-add. Remove tests for removed behaviors.
- WeekStrip: update — no mirrors/ghosts/toggles/quick-adds; keep chips,
  expansion, sometime pocket, today/full markers. Remove tests for removed
  behaviors (wake flick moves to drawer tests).
- TendDrawer (new test file): renders suggestion sections; name-this-group
  submits via onGroupIntoCollection with time opts; typing an existing
  routine's exact name calls onAddToCollection instead; fold suggestion
  click calls onAddToCollection; dismiss persists `g:` key; loose item
  "Move into…" calls onAddToCollection; sleeping section wake-all works;
  empty state renders.
- RhythmPage: update — Tend button badge count; opening drawer; picture
  contains no naming input; nav pills gone (update zone-assertion tests).
- Full suite green before push.

## Out of scope

- Any change to Today, the Wall, or the routine data model.
- New tend heuristics (e.g., cross-shape Jax reconciliation) — the drawer's
  group/fold/sleeper tools are sufficient for the one-time cleanup.
- Mobile-specific drawer behavior beyond the overlay pattern already used.
