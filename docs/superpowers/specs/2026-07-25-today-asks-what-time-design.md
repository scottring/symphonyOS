# Spec — Today asks "what time", and you answer by dragging

**Written:** 2026-07-25 · **Branch:** `today-what-time` (worktree `.worktrees/today-time`), off `origin/main` `1f3e23be`
**Builds on:** `tasks/2026-07-25-horizon-cascade-redesign.md` (the rung rule) and
`tasks/2026-07-25-horizon-cascade-handoff.md` (open item #2, "Today is overloaded")

---

## The rule, and its missing half

The cascade pass shipped on this rule:

> **A rung draws the unit it places into. Never finer.**

It has an unwritten second half, which this spec makes explicit:

> **And you place by dragging into what it drew.**

| Rung | Draws | Places into | Drag |
|---|---|---|---|
| Year | season segments, claims, density | nothing — look only | n/a by design |
| Season | 3 month strips | a month | yes |
| Month | 5 week rows | a week | yes — `MonthCalendarGrid` |
| Week | 7 day columns | a day | yes — `WeekViewV2`, `useWeekDragDrop` |
| **Today** | **the hour grid** | **a time** | **none** |

Verified by grep: `TodayView.tsx`, `ScheduleItem.tsx`, `HomeView.tsx` and
`TimelineInsertPoint.tsx` contain no `@dnd-kit`, no `onDragStart`, no `onDrop`.
Today is the only rung in the system with no drag-and-drop at all — including
the routines rhythm canvas, which has it.

The cascade pass found that three rungs *drew* the wrong unit. This spec finds
that the finest rung has no *gesture*. Both halves fail in the same place.

---

## Verified state (prod, 2026-07-25)

| | |
|---|---|
| Open tasks dated today | **28 — 27 of them all-day** |
| Still-open items from earlier in July | **17** |
| Active routines firing on a Saturday | **44** (32 daily) |
| Untimed routines → Unscheduled | **21** |
| Rows on the page with "Show daily" **off** | **~57** |

### Why the bands are empty — they are bypassed, not unused

`lib/timeUtils.ts:264-277` (`getDaySection`):

- no `startTime` → `'unscheduled'`
- `allDay` → `'allday'` (unless a meal keyword reroutes it)
- otherwise → `getTimeOfDay(startTime)`

So the page is really a **27-row All Day slab**, three thin bands holding the
~1 timed task plus calendar events, then a **21-row Unscheduled slab**.
Morning/Afternoon/Evening are not empty by accident — every write upstream
routes around them.

### What manufactures the pileup

Two sources, both correct in isolation:

1. **The week rung writes all-day, correctly.** Its decision is "which day", so
   every placement sets `isAllDay: true`. Right answer at that altitude.
2. **The daily guided session moves items onto today and gives them no time.**
   `sessions.ts` `daily` is four steps — look-back, look-ahead, look-within,
   `pick-today`. The last one picks from the week list onto today. No step asks
   for a time.

Meanwhile **the thing that asks for a time already exists and cannot be
reached**: `PlanningSession` with `placementGrain='time'` — the dnd-kit hour
grid — is mounted at `HomeViewContainer.tsx:584` behind `planningOpen`, whose
only setter is `onOpenPlanning` (line 483). Grep finds **zero consumers**
outside `TodayView.test.tsx`. "Plan today" opens the narration session instead.

**The missing rung is built. It is wired to nothing.**

---

## Design

Four moves. The first is a prerequisite, not a feature.

### 0. Fix drop → render before building on it (prerequisite)

Two known defects share one shape: a drop lands in the database and not on the
screen.

- Creating an item group on Today doesn't render until refresh (Scott, this pass).
- A card dropped in the weekly session's place-the-big-rocks doesn't render
  until refresh (handoff open #1, **never reproduced**).

**The cheap explanation is already dead.** `groupTasks.ts:19-27` documents a
`refetch` dep whose stated purpose is "the group appears immediately, not only
after a manual page refresh", and `HomeViewContainer.tsx:439` **does** pass it —
a genuine full refetch (`refetch: fetchTasks`, `useSupabaseTasks.ts:1244`).

Remaining candidates, narrowed by reading, **to be confirmed by reproduction,
not patched on suspicion**:

- The optimistically-created wrapper fails `selectTimed`'s `bucket === 'timed'`
  gate (`taskPools.ts:92`), so the wrapper is invisible and `grouping.ts` step 5
  restores its children as orphans — which looks exactly like "the group didn't
  render". Consistent with the standing `addTask`-then-`setBucket` hazard.
- A trailing realtime write races the refetch.

This is a `systematic-debugging` task: reproduce on port 5173 first, then fix.
**Making drag the primary gesture of Today on top of an unreliable drop
pipeline converts an annoyance into a blocker.** Nothing below ships until this
is green.

### 1. Drag to a time — the missing rung, in place

The bands stop being labels and become drop targets.

- Dragging an all-day or unscheduled card onto **Morning / Afternoon / Evening**
  sets a coarse time (band start, or the next free slot in that band).
- Dragging onto **an hour** in the finer rail sets that hour exactly.
- Dropping a timed card back onto **All day** clears its time. All-day stays
  reachable as a deliberate choice, rather than being the silent default.

`PlanningSession` grain=`'time'` becomes the **bulk** pass, reached from "Plan
today" — the same component the week rung uses at grain=`'day'`, so Today's
placement and the week's placement cannot drift, exactly as the cascade pass
earned parity everywhere else. In-place drops on the page handle one-offs
without entering a session.

**Stack: dnd-kit.** Two DnD stacks already exist in this codebase (dnd-kit and
native HTML5, both inside `WeekViewV2` and `PlanningSession`). Today reuses
dnd-kit because `PlanningSession` is dnd-kit. No third pattern.

### 2. Drag to group — create, add, remove

Groups are the collapsing mechanism: they are how 27 all-day rows become ~6
things that can each take a time.

| Gesture | Result | Backing |
|---|---|---|
| Card onto card | create a group | `groupItems` (exists) |
| Card onto an existing group | **add to that group** | **`addToGroup` — does not exist** |
| Card dragged out of a group | remove, keeps its own schedule | `removeFromGroup` (exists) |

`lib/today/groupTasks.ts` today has `groupTasks`, `groupItems`,
`removeFromGroup`, `ungroupTasks`, `deleteTaskGroup` — **create-once**. The only
way to add a member is to ungroup and re-group. `addToGroup` is the one genuine
gap, and it is small: the wrapper already carries both attachment mechanisms —
`parentTaskId` for tasks, `group_members` refs for events and routines
(`grouping.ts` relocates the latter under the wrapper card).

Every drag gesture keeps a tap equivalent in the existing menus. Today is the
mobile-primary surface; drag is an accelerant, never the only route.

### 3. Drag to reorder — everything, including timed items

**Rule: reordering a timed item rewrites its time. The list is always sorted by
time, because the drag makes that true.**

An earlier draft of this spec forbade reordering timed items — you could not
drag a 9am above an 8am — on the grounds that it would be a reschedule, not a
reorder. That prohibition was wrong. Rejected by Scott, correctly: the gesture
people actually want is "this goes before that", and making them hunt for an
hour target to express it is a worse interaction with no compensating benefit.

The two readings, and why only one survives:

- **Manual order layered on top of times** — a 9am renders above an 8am. This
  breaks the list as a timeline: vertical position stops carrying meaning, and
  the "time is the spine" principle the rest of this spec rests on collapses.
- **Reordering rewrites the time** ← adopted. One gesture and one mental model
  for timed and untimed items alike, no refusals to explain, and the list stays
  genuinely time-sorted afterwards.

**Placement rules on drop:**

- Into a gap between two timed items → the previous neighbor's end time (band
  start, if dropped first).
- Directly onto another timed item → the two swap times.
- **No cascade.** Items the user did not touch keep their times. A rundown-style
  push of everything downstream is surprising and hard to undo.

**Two hazards this exposes** — both previously hidden by the untimed-only rule,
both must be handled:

1. **Read-only calendar events cannot take a new time.** The work calendar is a
   read-only share; a write fails at Google and the optimistic update reverts,
   so the event "pops right back up" for no visible reason. Read-only events
   must **refuse the drag visibly** (no drag affordance, or a clear rejection),
   never accept it and bounce.
2. **Routines carry `time_of_day` on the recurring rule, not on today's
   instance.** Dragging a routine on Today must write a **one-day override** —
   the per-date deferral mechanism in `useScheduleFiltering.ts:88-145` is the
   existing precedent — not silently retime every future occurrence. Changing
   the rule permanently stays an explicit, separate choice.

Manual order (`sort_order`) still exists, and governs exactly where there is no
time to sort by: the all-day set, the unscheduled set, and members within a
group.

**Schema:** tasks have **no ordering column** (verified against `DbTask` and
`types/task.ts`). Add one — `sort_order int`.

**Precedent to copy, not invent:** routines already have `step_order`, and
`src/lib/today/stepOrdering.ts` is this exact pattern — `arrayMove`, normalize
to gap-free `0..n-1`, bulk write. A `taskOrdering.ts` mirrors it.
`updateTasksBulk` already exists in `useSupabaseTasks`.

### 4. Cap the page, and say so honestly

57 rows is its own defect, independent of time.

- Today renders the timed spine plus a bounded set of untimed items; the
  remainder collapses to a counted row (`+14 more today`) that expands.
- The 21 untimed routines collapse to **one** row, not 21.
- Carried-over items keep the existing collapsed "N carried over" treatment
  (`OverdueSection.tsx`), which already works.

A cap that hides its own truncation is worse than a long page. The count is
always visible.

---

## What this does not do

- **Redesign routines.** 21 routines claiming a slot with no time is a
  routines-design problem; it will flood Unscheduled daily until those routines
  get times or stop claiming a slot. This spec collapses them to one row and
  leaves the cause alone. Own pass.
- **Give the 17 carried items the month-review fates** (Keep · Done · Someday ·
  Let go). Proposed in the handoff, deferred here: it is a session-arc change,
  not a Today-surface change.
- **Touch the guided daily session's narration arc.** Only its `pick-today`
  step gains a time question.
- **Duplicate goals and areas.** Unchanged from the handoff — own pass.
- **`assigned_to` vs `assigned_to_all`.** Live trap (handoff #4), independent.

---

## Components

**New**
- `src/lib/today/taskOrdering.ts` — mirrors `stepOrdering.ts`. Pure, unit-tested.
- `addToGroup` in `src/lib/today/groupTasks.ts`.
- Today's dnd-kit context + drop targets (bands, hours, group cards).

**Changed**
- `TodayView.tsx` (~1199 lines — the largest file in the chain; this work should
  reduce it, not grow it: lift the section loop and the drag wiring out).
- `groupTasks.ts` — `addToGroup`, and whatever the render fix requires.
- `HomeViewContainer.tsx` — wire a real trigger to the time grid.
- `sessions.ts` — `pick-today` asks for a time.
- Migration: `tasks.sort_order int`.

**Schema:** one column. Apply via the Management API — migrations are known to
be out of sync in this project.

---

## Verification

Type-checks are not inspection. Six UI defects shipped green under `tsc` on
2026-07-25.

1. `npx tsc -b`
2. `npx vitest run` (**never `npm test`** — watch mode)
3. `npm run build`
4. `npm run lint` — baseline is **8 pre-existing errors**; confirm the count is
   unchanged with your work stashed before blaming yourself.
5. **Dev server on port 5173** — Scott's browser holds a session for that origin
   only. Other ports and preview URLs hit the sign-in wall, and you must not
   sign in as him.

Then open the page and drag:

- An all-day card onto Evening → it lands, **renders without a refresh**, and
  survives a reload.
- A card onto another card → group forms and renders immediately.
- A card onto that group → it joins. Drag it out → it leaves and keeps its date.
- Reorder two untimed cards → order persists across reload.
- Drag a timed card above an earlier one → **its time changes to match its new
  position**, the list stays sorted, and no untouched item's time moves.
- Drag a routine to a new time → today only; tomorrow's occurrence is unchanged.
- Attempt to drag a read-only work-calendar event → refused visibly; it does not
  accept the drop and then spring back.
- Confirm the row count is capped and the hidden count is stated.

**Baseline before starting:** 3,966 tests passing, build clean, 8 lint errors.

## Constraints

Nordic Journal (`src/index.css`). **Lucide icons, never emojis.** `font-display`
serif for content mastheads, sans for chrome. Tailwind v4 — unlayered CSS beats
every utility, so overridable defaults belong in `@layer base`. Work in the
`today-time` worktree, never the main worktree. Every push to `main` deploys to
production.
