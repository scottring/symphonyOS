# Connected planning implementation — live progress

Claude's running log for the unattended build. Codex can read this without
interrupting. Updated as each batch lands; newest batch at the bottom.

**Brief:** `2026-09-24-connected-planning-design.md` § Implementation authorization
and delegation, plus § Expanded unattended authorization.

**Standing constraints observed:** no push, no merge, no production deploy, no shared
migration, no real-account edits, no demo-fixture cleanup, no demo mutation without
coordinating with Codex, no other session's worktree touched. Local rebuild of the
:5199 preview is authorised after checks.

---

## Order of work

1. **Connected planning UI** — (A) presentation/timing/navigation, (B)
   removal/completion/Undo, (C) planning-session truthfulness.
2. **Three optional entry paths** — Capture now / Plan weeks-month / Plan season-year.
3. **Permanent printable Planning Guide** in the app.

---

## Source read before touching anything

- `PlanWeekMenu.tsx` already does more of requirement 2 than the brief assumes: an
  in-place week/day chooser, anchored on the **viewed** period rather than `ctx.now`,
  with "Another week…" and "Keep it in <Month>". It is already rendered outside the
  hover block, and goal steps already receive it (`PlanRow.tsx:286`, `:322`).
- `lowerPlacement` (`lib/placement/model.ts:141`) is the existing source of a task's
  saved timing and already prefers a date over a week, so a dated task does not claim
  a week commitment it does not have.
- `/week?start=YYYY-MM-DD` is the existing week URL (S2-25). A day is reached with
  `?date=YYYY-MM-DD` on the Today container, which consumes and strips the param
  (`HomeViewContainer.tsx:111`).
- Period pages mount at `/month`, `/season`, `/year` via `apps/plan/index.ts` app
  defs — **not** the `TasksApp` routes of the same names, which redirect to `/today`.

### Gaps found against the brief

| # | Gap | Batch |
| --- | --- | --- |
| 1 | The timing trigger says "Plan", not the saved timing. Requirement is a visible, accurate label. | A |
| 2 | `planWeekSlot` returns `null` unless `level === 'month'`, so season goal steps have no timing control at all. | A |
| 3 | No contextual "View week / View day" beside the control. | A |
| 4 | No shared module for "what timing is actually saved", so each surface would re-derive it. | A |
| 5 | Week/Day rows and task details do not offer the same control. | A |

### Recorded, not acted on yet

- `lowerPlacement` line 154: a task with `bucket === 'week'` and **no** week commitment
  and no `weekStart` is labelled "This week", anchored on today. That is the exact
  shape the brief warns about — claiming a commitment that is not saved. Changing it
  touches every placement reader, so it is recorded here rather than folded into a
  presentation batch. Needs a product call.

---

## Batches

### A1 — the timing control states the saved answer  ·  committed

Status: **done.** Files:

- `src/lib/planning/taskTiming.ts` (new) + `taskTiming.test.ts` — 15 tests. One
  place that answers "when have I chosen to do this?", keeping the day, the week
  commitment and the period separate. A dated task reports `weekOfDay` (the week its
  date lands in) but **no** `week`, so nothing can claim a commitment that is not
  saved. It also refuses the `bucket==='week'`-with-nothing-saved case that
  `lowerPlacement` still turns into "This week".
- `src/components/plan/PlanWeekMenu.tsx` — the trigger now wears the answer
  ("Choose when" / "Oct 4 – Oct 10 · any day" / "Tue, Oct 6 · any time") instead of
  the verb "Plan", and the weeks-list heading is separated from the "keep it in …"
  label so a season row names the season rather than its anchor month.
- `src/components/plan/PeriodPlanPage.tsx` — the control is no longer month-only:
  season rows get one (year has no task steps). "Keep it here" is offered whenever
  there is timing to remove, read from `taskTiming` rather than the cache columns,
  and on a season it writes `seasonStart`, not `monthStart`. Contextual
  `View week →` / `View day →` beside the control, using `/week?start=` and
  `/today?date=`.
- `src/components/plan/PeriodPlanPage.test.tsx` — 6 new tests covering all of the
  above, including that choosing a week writes neither `goalTaskId` nor `monthStart`.

Goal steps already received the control (`PlanRow.tsx:322`) and it already sat
outside the hover block, so requirement "no hover overlay may obscure timing" holds
on these surfaces.

Checks: 6788 tests passing (only the pre-existing `connectors/whatsapp` collection
error fails), tsc clean, eslint 0 errors, build clean.

### A2 — the same control on the week, and the whole answer in details  ·  committed

Status: **done.** Files:

- `src/lib/planning/taskWhen.ts` + its tests — **a real conflation fixed.**
  `deriveCache` gives a dated task the week of its day, so details announced
  "Week of Sep 20" over a task whose only decision was a date: a commitment nobody
  made, which is exactly what the transition contract forbids. A row carrying
  commitment records is now asked for a week COMMITMENT; a legacy row with no
  records keeps reading its cache, so nothing that predates commitments loses its
  week. Three tests, one per case.
- `src/components/home/week/WeekList.tsx` — a `timingControl` slot on each row,
  supplied by the host so the list stays presentational. Two tests, including that
  the control does not join the title's accessible name.
- `src/components/home/week/WeekViewV2.tsx` — supplies it: the same `PlanWeekMenu`,
  anchored on the week being **viewed**. "Keep it in <month>" is offered only when
  the task actually has a broader commitment to fall back to — with nothing above
  it, clearing the week has no destination to name and the brief forbids promising
  one.
- `src/components/task/TaskViewRedesign.tsx` — the goal-steps control now wears its
  step's saved timing, and the duplicate label beside it is reduced to the *broader*
  commitments only. The task's own **When** block states the whole chain beneath the
  date ("Also committed to Week of Oct 4 · October"), so details and the row agree.

Checks: 6792 passing (only the pre-existing `connectors/whatsapp` collection error),
tsc clean, eslint 0 errors, build clean.

### B (part) + Codex review findings 1–4  ·  committed

Status: **done.** Codex's review of A1/A2 raised five findings; four are closed here.

**(1) One reader contract.** `committedWeekOf` in `taskTiming.ts` is now the single
answer to "is a week actually committed", and `taskWhen` goes through it, so a row
and its details cannot disagree. It matches `committedTo` exactly — records count
only when the array is **non-empty**, so `[]` takes the legacy branch as it does
everywhere else. With records, the cached `weekStart` is not consulted at all, so a
removed or done week commitment can no longer be resurrected from a stale cache.
Tests cover `undefined`, `[]`, removed, done, an open record disagreeing with the
cache, and a dated-only cache on both legacy and record rows.

**(2) Week list duplication.** A dated row appeared as a full row under "Assigned a
day" *and* under its day beside the list. The full row now lives only under its day;
the list keeps a truthful count ("2 tasks are on a day this week — they appear under
their days"). A row committed to the week but **dated outside it** used to sit in
"Any day" claiming to have no date; it now has its own "Scheduled outside this week"
heading. Three tests.

**(3) View day survived one navigation only.** `HomeViewContainer` stripped `?date=`
the moment it read it, so reload or a return landed on today with no trace of the
day. The param now stays, is applied on every change (so Back/Forward move the day),
and `changeViewedDate` keeps it current as the reader pages — the contract `?start=`
already has on /week.

**(4) Removal text read the cache.** `broaderCommitment` reads what actually
survives, through the same records/legacy contract; the week view used cached
`monthStart`, which outlives a removed commitment. A goal link is never consulted —
work can serve a goal without being committed to that goal's month. When there is
**nothing** above the week, the copy says so instead of naming a destination.

**Removal itself (batch B):** `timingRemoval` in `planActions.ts` returns the write
and the way back together, so one Undo restores the whole gesture. Two distinct
menu items — "Remove <day>" and "Remove day and week" — each printing what it will
leave behind **before** it is pressed, and one confirmation afterwards repeating the
same sentence with an Undo. The period is always named explicitly, so the `ctx.now`
default cannot supersede the real commitment. Both plan pages and the week view use
it. 7 tests on `timingRemoval`, plus page tests asserting the before-press copy, a
single toast, the Undo, and that the day write touches neither week nor month.

A label bug found by those tests: the menu said "September" and the toast
"September 2026". One `timingPeriodLabel` now feeds both.

Checks: 6821 passing (only the pre-existing `connectors/whatsapp` collection error),
tsc clean, eslint 0 errors, build clean.

### Codex review finding 5 — day rows  ·  committed

Status: **done.** Day rows now carry the same control the month, season and week
rows do, so all four surfaces answer "when" with one component and one reader.

- `TodaySectionList.tsx` takes a `timingFor` slot and renders it through
  `ScheduleItem`'s existing `belowTitleAccessory` — under the title, deliberately
  NOT in the trailing rail, which is a fixed four-slot column of glyphs while the
  timing answer is a sentence.
- `TodayView.tsx` supplies it, including both removals with their before-press
  consequences and one confirmation with Undo, reading `broaderCommitment` so a day
  task with no week is told the truth rather than promised one.
- `TodaySectionList.timing.test.tsx` — 2 tests: the row states its saved timing
  without opening anything, and removing the day on a task with no week commitment
  refuses to name a week.

All five of Codex's A1/A2 findings are now closed.

Checks: 6823 passing (only the pre-existing `connectors/whatsapp` collection error),
tsc clean, eslint 0 errors, build clean.

### C — the planning session tells the truth  ·  committed

Status: **done.** S3-04 closed, plus requirement 7.

`PlanSession.tsx`'s save step used to say "Nothing is saved yet" over a period that
already held a goal and three tasks, with "Nothing chosen" beneath it — a reader was
told their plan was blank at the moment they were asked to commit to it. Now:

- **The existing plan is on the save step**, in its own "Already in your October
  plan" section, completed work included and struck through. A session starts from
  saved work and keeps it visible while edits are reviewed.
- **The proposed edits are a separate list**, headed "What Save will change", so the
  two can never be read as one.
- **An unchanged plan says so** — "Your October plan is unchanged. Nothing will be
  written." — and the primary button becomes **Done**, which closes without a write.
  A reflection note counts as a change, because it is written to the session record.
- Draft keeping, partial-failure retry and the "Some of this didn't save" alert are
  untouched.

5 tests in `PlanSession.test.tsx`.

### B (rest) — one notification per gesture  ·  committed

Status: **done for the duplicate-notification half.** S3-12's root cause found.

`HomeViewContainer` and `HomeView` each own a `useUndo()` **and each rendered an
`UndoToast`**. The container's ScheduleActions already registers an undo for a
routine completion; `HomeView` then wrapped the same handler and registered a second
one in its own stack — so one completion raised two Undo notifications, which is
exactly what Codex saw live.

`HomeView` now takes `registerUndo` and, when the host provides one, uses that stack
and draws no second toast. A double registration then lands in a single stack, where
the later replaces the earlier: one notification. `useUndo.test.ts` pins that
property (a second push replaces the first; exactly one undo runs, and it is the
later one).

**Not covered by an automated test:** that only one toast is now mounted. There is no
`HomeView` harness and building one is disproportionate, so **this needs Codex's live
confirmation** — the repro is the routine completion on Today.

Completion/reopening itself already satisfied requirement 5: one row means one
record, so every view of a task updates together, and completing a task never
touches its goal's status (`goalStatusOf`/`goalStatusUpdate` are a separate control).
The duplicate CAPTURE notifications remain open and are a different path.

### Next

The three optional entry paths, then the printable guide.

### Codex urgent independent review — 09:09 ET

Before declaring B complete, read `2026-09-24-codex-implementation-review.md` latest section. Three of four isolated tests of timingRemoval THROUGH planPlacement fail: dated remove-all leaves week open; no-broader remove-all leaves week open; dated Undo fails to restore an explicitly removed week. Current unit tests only inspect patch shape. Full reproduction is in repo root tmp/codex-connected-review/removal.test.ts. No DB writes. Mac is locked, so terminal message/live UI testing are temporarily unavailable; this file is the handoff. Please address before release handoff. Codex has not started demo mutation.

---

## D — the removal blockers Codex reproduced  ·  10:45 ET

Status: **fixed.** All four tests in `tmp/codex-connected-review/removal.test.ts` pass
(independently rerun from the repository root, unchanged fixture, no DB writes).

### One root cause, not three

`timingRemoval` spoke the legacy dialect — a bucket plus stamps — and the legacy
dialect **cannot express a removal**. `planPlacement` reads a stamp that is present
and ignores one that is absent, so `weekStart: undefined` said nothing at all, and
the week stayed open behind every "Remove day and week". The same gap ran the other
way on Undo: a dated row's `previous` carried `bucket: 'timed'`, which is not a rung,
so the restore path matched no branch and put the date back without the week.

A third trap sat underneath: a dated row's cached `weekStart` is the week its **date**
falls in, not a week anyone chose. Restoring it would have moved a task committed to
Oct 11 into the week of Oct 4 — so restoring the cache was never an option either.

### The repair — commitments are stated outright

- **`planPlacement` understands a STATED commitment list** (`intentions.ts`), the
  exact counterpart of the `focus` snapshot beside it. Open commitments named in the
  list are ensured, which reopens one that was removed; open commitments the list
  omits are removed; records in any other state — done, carried, already removed —
  are the row's history and are never touched. `commitments` joins `PLACEMENT_KEYS`,
  so such a write reconciles from the database first and carries the cache columns.
- **`timingRemoval` states commitments** instead of a bucket and stamps. `'all'`
  names every live commitment except the open week; `previous` names them all. It
  plans against `bootstrapCommitments`, the same list `planPlacement` will build, so
  a legacy row with no records is removed and restored as what it actually is.
- **A dated row's rung is its lowest open commitment.** `deriveCache` caches a dated
  row as `'timed'`, which is not a rung, so `currentLevel` was `undefined` and moving
  such a row UP to a month never took it off the week's list. That was Codex's stated
  root cause and it is a real bug beyond removal: it is fixed at the source.
- The `period` argument is gone from `timingRemoval` and its three call sites. It
  existed to name a fallback rung; with commitments stated, what survives is said
  outright and the row's bucket follows from what is left. A task with nothing above
  it now lands in the Inbox rather than a month nobody chose.

### Tests

`timingRemoval.test.ts` was rewritten to test **round trips**, not patch shapes — the
thing Codex asked for. Ten tests run every patch through real `planPlacement` and read
the result with `openCommitment`, covering: remove-day keeps the week and month;
remove-all releases the week and keeps the month, the season, or nothing; one Undo
restores day + week + month + focus together; **Undo restores the week that was
CHOSEN, not the week the date fell in**; and done/carried history survives a removal.
`PeriodPlanPage.test.tsx`'s season-removal test now reads the same way.

## E — the routine confirmation follows the write  ·  10:45 ET

Status: **fixed**, source concern from Codex's 09:43 review.

`HomeView.handleCompleteRoutineWithUndo` called `ctx.onCompleteRoutine` **without
awaiting it** and registered a generic success/Undo immediately — so the notification
preceded the write and could announce a completion the database refused. The event
wrapper beside it had the same shape.

Both wrappers are **deleted**. `useScheduleActions` already awaited the instance write
and registers the one named confirmation ("Completed “Morning walk”"), and it now:

- **checks the result** — `markDone`/`undoDone` return `false` on failure — and
  registers nothing when the write failed, while still refreshing the day so the row
  snaps back to what the database holds;
- **confirms a reopen too** ("Reopened “Morning walk”", Undo re-completes), which the
  deleted wrapper used to provide and the writer did not.

This also removes the duplicate registration at its source rather than relying on the
single-stack replacement from `c776fbe5`; that replacement stays as the backstop.

Three new tests in `useScheduleActions.test.ts`: a reopen is confirmed once and its
Undo re-completes; a failed write says nothing; and the confirmation is registered
only after the write resolves (a deferred `markDone` promise — `pushAction` is not
called until it lands).

**Still needs Codex live:** that exactly one toast is mounted on a routine completion
in the running app. The wrapper that caused the second one is gone, but there is no
`HomeView` harness to prove the mount count.

### Not changed, on purpose

- `onSkipRoutine`/`onSkipEvent` still announce without checking the write's result.
  Same one-line shape, but outside what was reported; flagging rather than widening.
- `lowerPlacement:154` still resolves a bucket-week row with nothing saved to "This
  week" against today. Unchanged, still needs a product call.

---

## F — three optional entry paths  ·  11:05 ET

Status: **done.** `src/components/plan/PlanningEntryPaths.tsx`, shown on the month,
season and year pages above the planning status line.

“Somewhere to start”, three doors, and nothing that behaves like onboarding: no
order, no progress, nothing to complete, and the card says in as many words that
skipping all three leaves you where you are. Each door does something the app
already does, and offers the matching printable sheet beside it.

- **Capture something now** — goes through `requestQuickAdd()`, the same signal the
  ⌘K unibox listens to, rather than a second capture path. Beside it, the Inbox.
- **Plan the next few weeks** — the month. On the month page the door says “You’re on
  this page” and offers nothing: not a link to where the reader already is, and not a
  second copy of the “Plan October” button this page already has. (The first version
  DID clone it, and 19 `PeriodPlanPage` tests caught two identical buttons on one
  page — the right complaint.) Beside it, `/guide#month`.
- **Set a season or a year** — the season, the same way. Beside it, `/guide#season`.

It can be hidden for good (localStorage) and always brought back — “Show where to
start” stays in its place. It is not shown over a period that has ended, or while a
planning session is open and the reader is mid-draft. Storage that throws — a private
window — renders the card rather than blowing up.

7 tests in `PlanningEntryPaths.test.tsx`.

**Placement is a judgement call, flagged for Codex:** the doors are on the three
period plan pages, where the approved prototype put them, and NOT on Today. Today is
the execution surface and already carries the capture bar; putting a “where to start”
card above someone’s day reads as a step. Easy to move if you disagree.

## G — the printable planning guide  ·  11:05 ET

Status: **done**, at `/guide`, permanent, with a sidebar entry beside “Plan from
paper” — pen and camera are the pair.

Content lives in `src/lib/planning/guideSheets.ts` as data, so the wording is
readable and testable in one place. Four sheets — week, month, season, year — each
carrying the same five bands in the same order, with **this horizon’s own questions**
printed above the writing space (Codex’s four sets, verbatim in intent).

Codex’s guide decisions, each one implemented and pinned by a test:

- No horizon belongs to a household. The family prompt is one small optional band —
  “If more than one of you is filling this in” — not a column each, and ownership is
  “who has **agreed** to take the next action”.
- A few priorities are **suggested**: “A few is the suggestion, not the limit — carry
  on below the lines if you need to.”
- “Supports” is plain words, optional, and printed as usually left blank. No codes.
- Next actions and undecided ideas are kept apart by **position**, with the printed
  note that neither a date nor an owner is required to write an action down, and that
  nothing in “Not yet decided” becomes a commitment.
- A blank is kept as a blank, on every sheet.
- A missing period is a question, not a wasted sheet: “If you forget to fill this in,
  the sheet is still useful — you will just be asked which period it belongs to.”
- The hand-back describes a **review of what was read** with the original notes kept
  and one choice of what to keep before anything is saved. It promises no duplicate
  detection and nothing automatic; a test asserts those words are absent.
- One-sentence source note. The reader-facing page carries no methodological essay.

12 tests on the content, 8 on the page.

### The print check, and the bug it caught

`outputs/planning-guide/` renders the guide to a self-contained page with the BUILT
stylesheet inlined and opens it in Chromium under print media — no sign-in, and
nothing to do with the demo browser. It asserts that the interface is off the paper,
that “Print this sheet” leaves exactly one sheet, that nothing runs off the side at
Letter **and** A4, that every writing line still has room at the printed width, and
that the number of sides matches the height of the sheet.

That last check earned its place. The first version lifted the printable subtree out
with `position: absolute; inset: 0`, copying `PrintableDayList`. That works for a
list that fits on one side; here it left the document no height, so Chromium
paginated nothing — **a 2464px sheet printed as one page and everything past the
first side was silently clipped**, while looking perfectly correct on screen. The
guide now stays in the document flow: `PlanningGuide` tags its ancestors on mount and
the print stylesheet has each of them give up its layout and its other children.

Each sheet is **three sides** at both paper sizes. Line spacing and the size of the
four areas in “What that means” were kept; the explanatory prose was cut to 8pt on
paper instead.

**Not verified:** nothing has been printed on actual paper, and nobody has walked
`/guide` in a signed-in browser. The Chromium check is the evidence, and it is
headless.

---

## Where this stands  ·  11:10 ET

Branch `claude/onboarding-program`, four new commits, nothing pushed, no PR.

| | |
| --- | --- |
| `0c546ab1` | removal releases the week; Undo puts back the week that was chosen |
| `8f7e4d32` | one routine confirmation, after the write |
| `10d203bf` | the printable planning guide at `/guide` |
| `8cece318` | three optional entry paths |

Codex's two documents in `docs/planning/` are left uncommitted and untouched.

**Verified:** 6861 tests passing (only the pre-existing `connectors/whatsapp`
collection error), tsc `-p tsconfig.app.json` clean, eslint 0 errors, build clean,
all four of Codex's independent removal tests passing from the repo root, and the
headless print check passing at Letter and A4. `dist` rebuilt at 11:03, so **:5199
now serves this code** rather than the 06:43 build Codex was walking.

**Not verified — needs Codex's browser:**

1. That exactly one toast is mounted on a routine completion (no HomeView harness).
2. The whole removal/Undo flow in the running app: create → goal/action → future week
   → untimed day → complete/undo → day and week removal → Plan October unchanged →
   reload. The unit round trips are honest about the placement engine, not about the
   page.
3. `/guide` in a signed-in browser, and one sheet on real paper.
4. The three doors in place on `/month` and `/season` — including the judgement call
   about keeping them off Today.

**Still open:** duplicate CAPTURE notifications (a different path from S3-12);
`lowerPlacement:154` resolving a bucket-week row with nothing saved to "This week"
against today; `onSkipRoutine`/`onSkipEvent` still announce without checking the
write's result.

---

## H — the hierarchy read backwards  ·  11:20 ET

Scott's visual finding, logged and fixed: **a goal's title started further right
than its own children's.** A goal row wears a tick, a caret and a goal glyph; a
step wears only a tick. Measured in Chromium before the fix:

```
desktop   goal 105 · goal without a disclosure 91 · step 57   ← the child sat 48px LEFT of its parent
phone     goal  79 · goal without a disclosure 55 · step 45   ← 34px left
```

So the nesting direction was right in the DOM and backwards on the screen, and a
goal with no disclosure did not even agree with the goal above it.

**The fix, within the approved nesting direction.** The lanes a row carries in
front of its title are named once in `index.css` — `--plan-lane-caret`,
`--plan-lane-glyph`, `--plan-lane-gap`, `--plan-step-indent` — and both halves of
the fix are derived from them:

- a goal with no disclosure (a year row, a completed one) **holds the caret's
  place**, so goals in one list start at the same x;
- a step's indent takes it back past the caret and the glyph its goal wears, then
  puts it 24px to the **right** of the goal's title. Row padding is identical on
  both rows, so it cancels out of the arithmetic;
- the "Add a step" field starts exactly where a step's title does, with the “+”
  standing in the step's tick column.

The hardcoded `pl-7` that used to do this job is gone. It was the drift between
that number and the lanes above it that reversed the hierarchy, so a test now
asserts no hardcoded indent sits beside the derived one.

```
desktop   goal 105 · goal without 105 · step 129 · add-step 129
phone     goal  79 · goal without  79 · step 103 · add-step 103
```

**Verification.** happy-dom does no layout, so "is this title to the right of that
one" cannot be asked in the suite. `outputs/plan-hierarchy/` renders the rows with
the built stylesheet and measures them in Chromium at 1200px and 390px — all four
assertions pass at both widths. `PlanRow.test.tsx` gained 4 structural tests
(the placeholder exists and is `aria-hidden`, a plain task reserves nothing, the
real disclosure shares the lane, no hardcoded indent).

Nothing else on the row moved: the tick, the verbs, the Plan control, the phone
Move picker, the support lines and the placement chip are untouched, and no
scheduling or assignment path was involved.

### On the rest of Codex's 11:15 note

The three optional entry paths and the printable guide were **already delivered**
in commits `10d203bf` and `8cece318` — see sections F and G above. `/guide` is a
permanent page with a sidebar entry; the doors are on the month, season and year
pages. Nothing further is pending on them but your review.

---

## I — the hover shortcut over "Choose when"  ·  11:50 ET

Codex's live blocker, reproduced headlessly and fixed. Two faults, both needed.

**The geometry.** `.period-row-actions` was `position:absolute; right:4px; top:4px`
— a chip floating over a row that also carries a persistent timing control. The
two overlapped by **44×12px**, measured in Chromium, so the right-hand part of
"Choose when" belonged to the shortcut sitting on top of it. The rail is now in
flow, after the control: its width is reserved whether or not it is showing, so
hovering reveals it without moving anything and nothing is ever on top of
anything.

**The verb.** On the month page "Take it into this week" means *the week
containing now*. From November that is September — which is exactly the damage
Codex saw. It is also redundant: the control offers the weeks of the month in
view, by name. So it is dropped from a row whose control reaches the same rung.

Scoped deliberately: `timingReachesLower` is true on the **month** page only. The
season page's rung below is the month, which the control does not offer, so its
verb stays — suppressing it there would have taken away the only way down. Steps
inherit their page's answer.

**Tested as pointer hit targets, not DOM presence.**
`outputs/plan-hierarchy/check-hit-targets.mjs` hovers the row and asks
`elementFromPoint` what is actually under five points of the control — centre and
all four edges — at 974px (Codex's repro width), 1200px and 1440px, and asserts
the two rectangles share no pixels. **Reverting the CSS makes it fail** (`right
edge of "Choose when" hits the hover shortcuts`, `overlap by 44×12px`), so it is
a real guard rather than a green light. Three unit tests in `PlanRow.test.tsx`
cover the suppression, the season page keeping its verb, and steps inheriting.

`PeriodPlanPage.test.tsx`'s month shortcut test now asserts the opposite of what
it used to: the verb is absent and the control is present.

**Not fixed, flagged:** the season page's own "Take it into this month" has the
same shape of bug — it means the *current* month, not a month of the season in
view. Different rung, different write path, and it was not what was reported.

**Codex's November fixture is untouched.** `QA connected journey: …` is still
assigned Sep 20–26 for your recovery/Undo test.
