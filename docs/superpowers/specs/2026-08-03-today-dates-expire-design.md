# Today: a date expires

**Date:** 2026-08-03
**Branch:** `today-dates-expire`
**Status:** approved, ready for planning

## The problem

Scott, looking at Today on 2026-08-03: *"it's overloaded right now and almost
useless as a result. It makes me want to blow up the entire symphony project."*

Measured against live production data that morning:

| Source | Rows |
|---|---|
| Tasks **genuinely scheduled for today** | **1** (all-day) |
| **Carried over** — incomplete, past-dated | **50** |
| Active top-level routines | 67 (28 untimed → Unscheduled) |
| Inbox | 46 |
| Week / Month staging (`StagingFloat`) | 5 / 36 |
| Active proactive suggestions | 65 (57 attached to tasks) |

One row on the page is today. Fifty are things that didn't get done. A 2%
signal ratio.

Age of the carried-over 50: 3 are 1 day old, 12 are 2 days old, **nothing
between 3 and 6 days**, then 35 are 7+ days old — of which 22 are over a
month. The oldest are `call window blinds` (245 days), `write tony back`
(238), and the literal test rows `defer test` and `test out flows` (235),
which have rendered on the kitchen wall every morning since December.

### Four structural faults

**1. A date never expires.** `selectOverdue` (`src/lib/today/taskPools.ts:7`)
has no age floor: any incomplete task with a past date is a Today row,
forever. No path exists by which an item leaves Today except completion or
deletion. Today's length is therefore monotonically increasing —
architecturally it can only get worse. Everything else is downstream.

**2. Today fuses three jobs into one visual language.** It is simultaneously
(a) the day's plan, (b) the failure backlog, and (c) the suggestion engine's
output. Only (a) is bounded. (b) renders in the *identical* row component to
(a) — same checkbox, same chips, same weight — so nothing on screen separates
"you committed to this today" from "you committed to this in December."

**3. Every layer answers overload by adding rows.** The suggestion engine
correctly detects staleness and responds by rendering a **"Still relevant?"**
chip beneath each stale item instead of retiring it. In the screenshot the
mosquito-repeller item appears three times: as a carried-over task, as a chip
under itself, and again in the top suggestion strip.

**4. Sub-work has no container.** Routines already solved this — a collection
renders as ONE row with its steps inside (`stepChecklist.ts`,
`stepSchedule.ts`). Tasks with subtasks never got that, so each step becomes a
peer row competing with real commitments. The `symphony-agent` edge function
compounds it by stamping the parent's `scheduled_for` onto every child it
creates; the in-app `addSubtask` (`useSupabaseTasks.ts:684`) correctly creates
children undated. One decomposed task ("Brainstorm vacation ideas + start
exploring") is single-handedly producing six permanent Today rows.

Note also that the page cap built in Stage 3 (`curateUnits` / `pageCap.ts`) is
wired only into `TodaySectionList` — the day sections. **`OverdueSection` is
uncapped.** The cap guards the shelf holding 1 item and not the one holding 50.

## Design

### 1. The rule: a date expires, the data does not

A dated task has three states, derived from one number — days since its date.
**No schema change.**

| Age | State | Renders |
|---|---|---|
| Today | **Today** | Its day section |
| 1–2 days past | **Carried over** | Today, in a capped lane, visually distinct |
| 3+ days past | **Slipped** | **Not on Today.** One line: "N slipped · review" |

**Grace window = 2 days**, a single exported constant. The live histogram
argues for it: items exist at 1 and 2 days old, then nothing until day 7.
Two days covers a weekend of slippage without re-admitting anything abandoned.

**Expiry is a read-side contract and never a write.** `scheduled_for` is never
cleared by expiry. Three reasons:

- **Safety.** A nightly job that wrongly nulls 50 real dates is
  unrecoverable; a wrong filter is a one-line fix. This runs against the only
  copy of Scott's actual life, and that asymmetry decides it.
- **The original date is the aging signal.** "Slipping for 245 days" is only
  knowable because the date was kept. Nulling it destroys exactly the
  information the review needs.
- No cron, no midnight/timezone edge case, works offline, works on the wall.

`selectOverdue` stays as-is and keeps returning the full pool — `ReviewStep`
and the horizon pages want all of it and are untouched. Two new siblings
partition it:

- `selectCarriedOver(tasks, isToday, match, now, graceDays)` → Today's lane
- `selectSlipped(tasks, isToday, match, now, graceDays)` → the review queue
- Invariant, enforced by test: `selectOverdue === selectCarriedOver ∪ selectSlipped`,
  disjoint, no item in both.

**Effect: Today's carried-over lane goes 50 → 15 rows; with §3, ~10.**

### 2. Where slipped work goes

**Not the Inbox.** Inbox means "never triaged" (46 items). Slipped means "I
decided, and it didn't happen." Different question, different answer — merging
them makes an 81-item pile and destroys the only distinction that matters.

It is a **derived view, not a new bucket** — the complement of the §1 filter,
so again zero schema change. Two entry points:

1. A single line closing Today's carried-over lane:
   `35 slipped · oldest 245 days → Review`. Always visible, never expands
   inline, cannot be dismissed. Today stays short by construction.
2. The existing review flows pick it up free — they already call
   `selectOverdue`.

The review screen sorts oldest-first with age shown prominently. It is a new
surface — slipped rows no longer live in `OverdueSection` — but it reuses that
component's existing multi-select machinery (`bulkSelectedIds`,
`onToggleBulkSelect`, `BulkActionToolbar`) rather than inventing a second one.
Four actions: **Today / This week / Someday / Delete.** Success bar: 50 items
clearable in under two minutes.

**No migration.** Read-side means the existing 50 stop appearing on Today the
moment this ships and surface in the review queue carrying their true age.

### 3. Subtask containment

**Creation.** `symphony-agent` sends `scheduled_for` alongside
`parent_task_id`. Make it match the app: a subtask is born undated
(`bucket: 'inbox'`, no `scheduled_for`). Backfill the 6 existing rows that
carry an inherited parent date.

**Rendering.** A subtask never earns its own Today row by *inheriting* its
parent's date. Routines already model this correctly — a collection is one row
with `stepChecklist` inside — and tasks get the same treatment: the parent
holds the slot, shows `0/5`, steps collapse behind it, collapsed by default.

Deliberately preserved: a step scheduled for its own *different* day still
gets its own row on that day. The rule targets inherited dates, not scheduled
steps.

### 4. Cascade

- **Kitchen wall** (`useWallData.ts:193`) runs the same floorless
  `.lt('scheduled_for', …)`. It needs the same grace floor or the wall shows
  50 while the laptop shows 10.
- **Mac tray badge** (`trayPayload.ts:17`) corrects to 15 automatically; no
  change needed, but assert it in a test.
- **"Still relevant?"** (`overdueSuggestions.ts:59`,
  `proactive-engine/index.ts:353`) exists *only* because dates never expired.
  Expiry answers the question structurally. Delete the rule from both sites.
- `ReviewStep` and `apps/tasks/horizons/shared.tsx` are unchanged — they call
  `selectOverdue`, which still returns everything.

### 5. Assistant help, so nothing important is permanently buried

Two measurements on the 35 slipped items decide the shape of this:

```
slipped items                35
  with defer_count > 0        0
  linked to a project         5
  linked to a contact         3
  with notes                  4
  waiting on someone          0
```

The queue is almost entirely signal-free, and `defer_count` is zero for a
structural reason: it is **read** in six places (`urgency.ts:111`,
`useReviewData.ts:66`, `coachLines.ts:60`, `overdueSuggestions.ts:48`,
proactive-engine Rule 6) and **incremented nowhere**. Every `>= 3` branch in
the codebase is dead. Symphony's entire notion of "this keeps getting buried"
is wired up and non-functional.

#### 5a. Make the signal real (deterministic)

Increment `defer_count` on every push/reschedule. One write turns five dead
consumers live and gives the review a true ranking. Forward-looking only — the
current 35 all sit at zero and this cannot retroactively rank them.

An earlier draft of this section also had expiry itself bump `defer_count`.
That contradicts §1 (expiry never writes) and is dropped. The two signals stay
separate and neither needs a background job:

- **`defer_count`** = how many times *Scott actively pushed it*. A deliberate
  act, written at the moment it happens.
- **age in days** = how long it has *passively slipped*. Already derivable from
  `scheduled_for`, which §1 preserves precisely so this stays knowable.

#### 5b. LLM triage pass over the queue (for the pile that exists now)

Rules cannot do this job here, measured rather than assumed: nothing
distinguishes `get car registration` (real, legally required, 235 days old)
from `defer test` (a test row from the same week) except the words. A rule
engine ranks them identically.

A batch pass over the slipped queue proposes **a disposition per item** —
Today / This week / Someday / Delete — each with a one-line reason, accepted
wholesale, partially, or discarded. It reuses the shape `proposeOrder.ts`
already anticipates: *"An agent-backed proposer can slot in behind the same
`Proposal` type later."* Same contract as `DuplicateSweep` and
`ProposalPreview`.

Plus a **rescue set**: at most **3** items per day promoted back onto Today,
each stating why. A hard number, not a judgment call — this is the mechanism
most likely to rebuild the pile.

Three guarantees:

1. **Nothing is ever hidden from the queue** — only from Today. The queue is
   complete, always browsable, sorted by age.
2. **Floor guarantee:** whenever the queue is non-empty Today renders the
   one-line pointer with count and oldest age. It cannot silently become
   invisible and cannot be dismissed away.
3. **The assistant never writes and never deletes.** No signal → no proposal
   (the existing honest stance in `proposeOrder.ts`). Anything it cannot
   classify stays untouched in the queue.

This replaces "Still relevant?", which asked a question 57 times and resolved
nothing. The new pass asks once, in one place, and clears the row.

## Sequencing

Two plans, not one. **§1–4 plus §5a** are the structural fix, are entirely
deterministic, and stand alone — Today becomes a day again the moment they
ship, with the queue reachable and complete. **§5b** (the LLM triage pass) is a
separate sub-project with its own edge function and surface, and it is
deliberately second: it is easier to judge how much intelligence the queue
needs after seeing the queue as a bounded, reviewable list rather than as an
infinite scroll.

## Testing

- `taskPools`: the partition invariant (union equals `selectOverdue`,
  disjoint), boundary days 0/1/2/3, and completed-today handling preserved.
- Grace boundary at a DST change and across midnight — `viewedDate` carries a
  wall clock (see `today_stage2b_drag_shipped`, defect 3); the age comparison
  must zero both sides.
- `OverdueSection` renders the slipped pointer whenever the queue is non-empty
  and never renders slipped rows inline.
- Subtask containment: a child with an inherited parent date produces no
  independent row; a child with its own distinct date does.
- `trayPayload` count reflects the grace window.
- Wall query floor: a 200-day-old family task is absent from `overdueTasks`.
- `defer_count` increments on push, on reschedule, and on expiry; the five
  existing consumers see a non-zero value.

## Risks and non-goals

- **Risk: something important ages out unnoticed.** Mitigated by the floor
  guarantee, the never-hidden queue, and §5. Not eliminated — it is a real
  trade against the current state, where nothing ages out and *everything*
  goes unnoticed.
- **Risk: the LLM pass mis-classifies.** It never writes; every disposition is
  accepted by hand, and Delete is one of four options rather than a default.
- **Deployment check:** the proactive-engine edge function may be undeployed
  (see memory `context_graph_cannot_see_other_members_tasks`). Verify before
  assuming a change there is live.
- **Non-goals:** the 28 untimed routines (a routines-design problem with its
  own pass), the 46-item Inbox, and `StagingFloat`'s 41 week/month items. Each
  deserves its own diagnosis; none is on the critical path for making Today a
  day again.
