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

---

## J — the guide's five corrections  ·  12:05 ET

Codex's 11:22 review, all five addressed.

**“Write the season in digits”, and “Year Year”.** Band 1 now asks in each
horizon's own terms: *Week beginning (date)* · *Month · Year* · *Season · Year* ·
*Year*. A season is named however the reader thinks of it — “autumn”, “Sep–Dec”,
“the term” — and the year page asks for the year once. A test pins the field list
for all four and asserts no sheet repeats a label.

**Importer guarantees.** The hand-back section no longer says what the app will
do. It says what the reader should **check**: read the proposed list against your
page before you keep anything, and look for a line that came back as the wrong
kind of thing, a date or repeat or owner on a line where you wrote none, and
anything you meant to leave undecided — then correct it there or leave it out.
It ends “keep the paper either way; it is the record, and what comes back is a
draft to check against it.” The test now asserts the *absence* of the four
claims nobody verified: “duplicate”, “automatic”, “you are asked”, “notes which
are kept”.

**“Five things” against six or seven sections.** Gone. The intro says what is
true: the week sheet is one side and is the one to start with, the month is two,
the season and year three each; every sheet opens with which period this is and
what it already holds before asking what matters, and the questions change with
the horizon. The test asserts the shape rather than a count.

**Four sheets, twelve sides.** Each sheet now states its own — “One side · about
10 minutes · works on its own” — the masthead says “Print all nine sides”, and
`sides` is part of the content. **The print check compares the claim to what
Chromium actually prints**, at Letter and A4, so the page cannot drift back into
saying one thing and printing another.

**The week exercise, one page at readable type.** Print type went back UP —
10pt labels, 9.5pt questions, 9pt hints and leads — and the week sheet earns its
single side by asking less: the look-back folded into one “What the week already
holds” band, two priorities, three next actions, and the family prompt as one
line instead of a band of its own. Every band on it pairs into two columns.

| | Letter | A4 |
| --- | --- | --- |
| Week | 1 side | 1 side |
| Month | 2 | 2 |
| Season | 3 | 3 |
| Year | 3 | 3 |

One more real fix fell out of this: bands were `break-inside: avoid`, which threw
a 460pt band onto a fresh side and left the one before it half empty — three
sides for two sides of content. Bands may now run over a page break; blocks still
may not.

**Verified:** 6872 tests passing (only the pre-existing `connectors/whatsapp`
collection error), tsc clean, eslint 0 errors, build clean, all print checks
passing at both paper sizes. **Not verified:** nothing has been printed on real
paper.

---

## K — two corrections from the November round trip  ·  12:25 ET

**(1) The dated Week Journal action had no timing control.** The week's list wore
the shared control; the day rows beneath it did not. So the answer to “when is
this to be done” was visible right up until the moment it was decided, and then
disappeared — move a task out of *Any day* onto Monday and the control went with
it.

`WeekJournal` now takes the same `timingControl` the week's list takes, and
`WeekViewV2` hands it the same `weekTimingControl` callback at both widths. Task
entries only: an event or a routine occurrence is not placed this way. A finished
row does not get one — it is a record, not something to re-time.

**The Schedule grid is untouched.** The journal row carries dnd-kit's drag
listeners, so the control swallows the pointer before they see it — the same
guard the row's checkbox already uses. That is tested on the channel that
actually matters: dnd-kit's listeners are REACT handlers, so a native listener
would see the event either way; the test puts a React spy on an ancestor, presses
the control (the spy must not fire) and then presses the row (it must).

**(2) “What Save will change” listed rows it would not touch.** A look-back row
with no verdict is never written — `applySession` only walks `verdicts` — yet it
appeared under that heading as “Left open in October”, directly under the
sentence “Nothing will be written”.

`SummaryLine` now carries `unchanged`, set on exactly that branch, and the save
step draws two groups: **What Save will change** (real writes only, now with an
accessible name) and **Save won’t touch these**, quieter, still showing the rows
as review context. With no edits at all the change heading does not render and
only the unchanged group remains — no contradiction left to read.

Three focused tests: an untouched row never appears under the change heading; a
mixed session puts each row in the right group; and `summarize` marks the no-op
branch and only that branch.

### A red suite that was the calendar, not the code

While verifying, 35 `PeriodPlanPage` tests went red — and stayed red on a clean
rerun. Not the changes above: the file reads the current month off the real
clock and asserts the page shows it, but `planningPeriod` looks AHEAD to the
next month once six days or fewer remain. At 12:00 today, September crossed that
line: `round((Oct 1 − now) / 1 day)` fell from 7 to 6, the page began opening on
October, and every assertion of “September” failed. It would have done the same
on the 24th of every month.

The file now pins the clock to a fixed mid-month date (Sep 10, `Date` only —
faking timers would hang `waitFor`), in all four of its top-level blocks, and
restores real time after each. The blocks that need another date still set their
own.

**Verified:** 6876 tests passing (only the pre-existing `connectors/whatsapp`
collection error), tsc clean, eslint 0 errors, build clean, and both headless
harnesses. **Not verified:** neither change has been walked in a browser by me.

Codex's November fixture is untouched.

### Still pending on Codex's list

Single routine toast + Undo live · day URL/reload through View day · standalone
task later linked to a goal · the entry buttons and the print dialog of the
revised guide.

---

## L — the timing picker in the approved RescheduleGrid language  ·  12:55 ET

Scott's approved reference: the two-column rounded icon tiles with a small
segmented bar beneath each, from `RescheduleGrid`. Now in the shared planning
timing picker, with the one requirement he was explicit about — **relative
density of things, not an hours or capacity forecast**.

### Why `DayLoadBar`'s math could not be reused

Codex asked me to inspect it first, and it was the right call. `computeDayLoad`
measures **minutes booked against an 8am–9pm window** and yields a percentage;
`DayLoadBar` renders that as `aria-label="60% booked"`. Putting counts under
that bar would have labelled hours as items. It also deliberately **excludes
routines** and gives an all-day item **zero weight** — both wrong for this
question. So the fill is new, and the load bar is untouched.

`src/lib/planning/dayDensity.ts` counts instead:

- **events, tasks and routine occurrences**, deduped by a caller-supplied key
  (the same meeting on two calendars, an occurrence two resolvers both report);
- all-day items count — a day with four of them is a full day that books no
  hours;
- routines count, because the caller passes resolved **occurrences**, not
  rules. (That was `computeDayLoad`'s stated reason for leaving them out: the
  routine LIST is identical on every day. Occurrences are not.)
- the scale is **relative to the days being offered** — the busiest day fills
  the bar, a day with anything on it always fills at least one segment, and
  nothing absolute is ever claimed.

**Loaded vs unknown vs empty** are three states, not two: `known: false` draws a
dashed outline and says “hasn’t loaded yet”, distinct from “nothing on it yet”.

**Accessible labels are counts, in words** — “Mon, Nov 9 — 2 events and 1 task
already”. A test asserts no tile's label can contain `%`, `hour`, `booked`,
`capacity` or `free`.

### The days offered are the days in VIEW

`WeekViewV2` supplies the seven days of the week being **viewed** — from a
November row the tiles say Nov 8…Nov 14 — with the density counted off
`journalDays`, the very list the page draws beneath, so the tiles cannot
disagree with the days under them. No silent jump to today.

Everything else is preserved: the week choices above, the explicit date field
below (relabelled “Another day…” when tiles are present, so any other date is
still one field away), and the remove/Undo items with their before-the-press
consequences.

### Tests

11 on the density math (dedupe, relative scale, one-thing-≠-nothing, unknown
days, the words), 6 on the tiles, 2 on `/week` end to end — the viewed week's
dates appear, the current day is marked, a busy day states its counts, an empty
day says so, no tile claims hours, and pressing a tile writes that day.

### Limitations, stated

- **Only `/week` supplies tiles so far.** Today, the month, season and year
  pickers keep the date field alone. The prop is optional and the menu is
  byte-identical without it; those surfaces need their own per-day counts
  before they can be wired honestly.
- **`eventsAvailable` defaults to true on `/week`.** The week receives a plain
  events array with no availability signal, so the “unknown” state is reachable
  (and tested) but nothing on that surface currently sets it. Wiring it needs
  `useDayLoadEvents`-style availability threaded to the week.
- Dinners are excluded — the day's meal is not a commitment to plan around.
- Nothing here has been seen in a browser by me.

**Ready for your browser verification.**

---

## M — availability plumbing, and a dedupe claim made true  ·  13:20 ET

Both of Codex's closing findings. Both were right.

### The claim I could not back

The helper takes a dedupe `key`, but `WeekViewV2` passed only `{ id, kind }` —
so the fallback was `kind:id`, and the same meeting synced to two calendars
(two ids, one meeting) would have been **counted twice**. `journalDays` does not
merge them either; it draws both. The commit message described the helper's
capability as though it were live behaviour. That was wrong to write.

It is now true rather than withdrawn: an event is keyed by **what and when** —
`event|<title>|<instant>`, all-day by `event|<title>|allday|<day>` — so the
count merges what the journal draws twice. A test puts the same meeting on two
calendars and asserts the day says “1 event already”.

### Real readiness, five states, honestly separated

`eventsAvailable?: boolean` is gone. `DensitySources` carries a status per
source — `ready · loading · stale · error · not-connected` — and
`densitySourcesFor` derives it from what the hooks actually report:

- **not-connected is not a failure.** It is checked FIRST, so a stale error
  left over from a previous session cannot turn a disconnected calendar into a
  broken one. The count is complete — there are no events to miss — and the
  tile says `nothing on it yet · no calendar connected`, with a test asserting
  that label contains no “error”, “couldn’t”, “fail” or “loading”.
- **error** → the count is short: `the calendar couldn’t be read`.
- **loading / stale** → `still loading`. Stale is the one Codex named: paging
  the week leaves the previous range's events on screen until the fetch lands,
  and a count drawn from them describes last week. `HomeViewContainer` now
  records which range the events it HOLDS were fetched for, clears it while a
  fetch is in flight, and compares it to the range in view. A held range that
  *contains* the needed one is ready — the week fetch is deliberately wider.
- tasks and routines report from their own loading flags, and every missing
  source is named, not just the first.

### Proving the parent actually supplies it

That was the whole failure: a prop with a safe default and no caller. So:

- `densitySourcesFor` is extracted and tested as a rule in its own right —
  6 cases including the disconnected-with-a-stale-error trap and the
  wider-range-is-fine case;
- **`HomeView.densitySources.test.tsx` renders the real `HomeView` on its week
  view** and walks the whole hop to the tiles: a paged week reads as still
  loading and NOT as quiet; no calendar reads as complete and scoped; a failed
  read reads as an error; and with nothing passed the days read as counted —
  the old always-ready shape, so no existing caller changed behaviour.

`HomeViewContainer` itself has no test harness (≈15 hooks), so the container's
own wiring — that it passes `densitySources` at all — is covered by the type
system and by the extracted rule, not by a mounted test. That is the one hop
still unproven by a test, and I would rather say so than imply otherwise.

Fixture untouched; scheduling and drag interactions unchanged.

---

## N — event drag and drop wrote nothing  ·  13:45 ET

Scott's blocker, Codex's static lead. **The lead was exactly right**, and it was
worse than one missing line.

### What was actually broken

`HomeView` passed `onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}` and
**no host has ever supplied one.** `ScheduleActionsValue` declares the field
optional, so TypeScript never said a word. Dropping the Pippa event on Friday
called a no-op, and the grid then announced `Moved "Pippa"` with an Undo — for
a write that was never attempted. Verified by reading the chain, not inferred:

- `useWeekDragDrop.ts:217` → `args.onUpdateEvent(...)`
- `HomeView.tsx:407,454` → `ctx.onUpdateEvent ?? (() => {})`
- `HomeViewContainer.tsx` → never sets `onUpdateEvent`, and never destructured
  `updateEvent` from `useGoogleCalendar`.

A second fault sat underneath: even with a writer, the confirmation did not
wait for it. `onUpdateEvent(...)` was fired without `await` and `pushAction`
ran on the next line — the same shape as the routine toast fixed this morning.

### The repair

- **A writer exists.** `lib/calendar/moveEvent.ts` — `makeEventMover` — built
  in the container over `useGoogleCalendar().updateEvent`, following the
  convention `TaskDetailPanel.onReschedule` already proved in production:
  `eventId: google_event_id ?? id`, `calendarId: calendar_id ?? calendarId`,
  so an event on a shared or secondary calendar is written back to **that**
  calendar. Both ends are sent, so the duration the drop computed is what
  lands; the event's own time zone rides along when it has one, and otherwise
  the writer defaults to the browser's, exactly as before.
- **It re-reads the range on success only**, or the grid — which draws from the
  fetched events — would spring the event back to where it was.
- **The confirmation waits for the save.** The drop awaits the write; on
  success it offers `Moved "Pippa"` with an Undo that writes the old pair back,
  and on failure it offers neither. The writer says what went wrong in a
  visible toast, telling a reconnect, a 403 on a calendar you don't own, a
  disconnected calendar and an unknown failure apart.
- **A missing writer is now loud.** `onUpdateEvent` is optional on the hook and
  on `WeekViewV2`, and absent means “this host cannot move events” — said in a
  toast rather than swallowed. The no-op default is what made a broken feature
  look like a working one for as long as it has existed.

### The boundary Codex asked to be tested

`makeEventMover` is a plain function precisely so the parent-to-real-update
boundary can be held: **10 tests** — it writes by the Google id and the event's
own calendar, accepts either id the grid may drag by, falls back when there is
no Google id, preserves the duration and the time zone, refetches on success
and *not* on failure, reports each failure in the right words, and refuses an
event it cannot find rather than going quiet.

**5 more on the drop itself**: the new time is written with the hour it ran
for; the confirmation and Undo appear only after the write resolves (a deferred
promise proves the ordering); a failed write offers neither; Undo restores the
original day and hour; and a host with no writer refuses out loud.

### Boundaries respected

- **No live event data touched, and no browser driven.** Everything here is
  unit-level; Scott owns all clicking and entry from now on.
- Inline time editing and the explicit Saturday/Sunday picker choices are
  **left alone** as logged usability follow-ups, per Codex.
- Local only: tests, build, commit. No push, no production, no migration.
- I hold repository write permission in this worktree and used nothing beyond
  it; no approval was needed and none was bypassed.

**Not verified by me:** that a real drag in a real browser now moves a real
event. That is Scott's retry, and it needs a connected calendar — the writer
throws "Not connected to Google Calendar" without one, which now surfaces as
“No calendar is connected, so this event can’t be moved” instead of silence.

---

## O — Details › Reschedule › Tomorrow  ·  14:10 ET

Traced as its own path, and Codex was right not to let me assume the drag fix
covered it. **It did not.** Different component, different cause, same silence.

### The cause

`SchedulePicker` has two callbacks. `onSchedule(date, isAllDay)` is what the
“Pick date & time…” tile calls. Every **relative** tile — Today, Tonight,
Tomorrow, This weekend, Next weekend, Next week, This month, Someday — calls
`onReschedule(when)` instead (`SchedulePicker.tsx:170`).

`TapEventPanel` passed **only `onSchedule`**. So for an event, "Pick date &
time…" worked and *every other tile in the popover did nothing at all* — which
is precisely what Scott saw.

### The trap underneath it

Wiring the tiles straight through would have introduced a worse bug. Every
relative tile resolves to **midnight** (`getBaseDate` sets `00:00`), and
`handleReschedule` takes the hour and minute from the date it is given — so
"Tomorrow" on a 1–2 PM event would have moved it to **midnight**. A relative
tile means *move the day, keep the hour*, and that is what it now does.

### The repair

- `dateForWhen(when)` is exported from `RescheduleGrid` — it already owned the
  mirror of `applyTriageWhen`, so the day a tile PRINTS and the day a caller
  WRITES cannot drift apart. Pool tiles return null, because they mean no day.
- `TapEventPanel` handles a relative tile: resolve the day, keep the event's
  own hour and minute, and route through the same `computeEventReschedule` the
  date picker uses — so the duration is preserved exactly as before. The panel
  already `await`s the write and toasts on failure (`TaskDetailPanel`'s
  `onReschedule`), so error handling and refresh needed no change on this path.
- **A tile nobody handles is no longer shown.** `SchedulePicker` renders no
  relative tiles without an `onReschedule`, and a caller may name the subset it
  can honour. The event panel names five — Today, Tomorrow, This weekend, Next
  weekend, Next week. **Tonight and the pool tiles are deliberately absent**:
  an event cannot go to Someday, and "Tonight" would mean inventing an hour
  nobody asked for. A new time is what "Pick date & time…" is for.

11 tests: 3 on the picker's tile contract (no handler → no tiles; a named
subset shows and acts; unnamed → all), and 8 on the day resolution and the
move (Tomorrow keeps 1 PM, the hour survives, the length survives, a pool tile
does nothing, an event with no times falls back sensibly).

### The 403 claim, softened

`eventMoveErrorMessage` asserted a 403 meant “a calendar you don’t own (an
invite or shared calendar)”. Codex is right that this is too strong — a shared
calendar can perfectly well permit edits, and Google does not tell us the
cause. It now says **“Google refused this edit — you may not have permission to
change this event”**, and a test asserts the words *shared*, *invite*, *don’t
own* and *not the owner* do not appear. `TaskDetailPanel` carried its own copy
of the same over-strong sentence; both paths now share this one.

---

## P — evidence and usability logged, not acted on

### Routines: user-reported PASS

Scott's run: selected weekdays are correct; completing **one occurrence**
completes only that one; reload preserves **only** the completed occurrence;
reopening leaves the others unchanged. Recorded as a pass — the
occurrence-vs-rule grain is holding end to end.

### UX gap — “Daily” vs weekly with days selected

Ambiguous: a routine set to **Daily** and one set to **Weekly with all seven
days selected** describe the same thing, and the UI does not say which the
reader has. Not touched. Needs a product call on whether the two collapse into
one control or the wording separates them.

### Discoverability — “Add a step” under an October goal

On the current walkthrough goal *write a new song*, **“Add a step” was found
only after explicit coaching to press the caret.** The disclosure is the only
route to a goal's steps, and it does not announce that it holds the way to add
one. **Deliberately not altered mid-walk**, per Codex. Worth noting it is the
same caret lane the hierarchy fix (§H) made consistent, so any change here
should keep goal titles aligned.

---

## Q — event drag: found, fixed, and verified live  ·  15:05 ET

Scott handed me the browser. **Two** bugs stood between a dragged event and a
saved one; the first was the diagnosis, the second only appeared once the first
was fixed and I dragged twice.

### Bug 1 — the drop looked up the wrong id

`eventToTimelineItem` builds a block's id from `google_event_id || id`
(`types/timeline.ts:149`), and the drop handler matched `ev.id === <that id>`
(`useWeekDragDrop.ts:213`). For a real calendar event those differ; for one
cached by the edge function `ev.id` is **absent entirely** — the hazard already
written down at `useGoogleCalendar.tsx:610`. So the lookup failed, the handler
returned at the next line **in silence**, and the block snapped back. Every
repair in `a813f920` sat below that early return, unreachable.

`findEventByItemId` is now the one reverse lookup, beside the function that
builds the id, and both call sites use it — the grid's own re-mount lookup
(`WeekViewV2.tsx:536`) had been doing it correctly all along, which is why the
drag *looked* fine right up to the drop. A miss now says so out loud.

### Bug 2 — the handler held a stale events array

Found by dragging twice: the first move worked, the second said “Couldn’t find
that event to move”. `onDragEnd` depended on `[tasks, onUpdateTask]` while
reading `events`, `onUpdateEvent`, `weekStart` and `pushAction`
(`useWeekDragDrop.ts:258`). A successful move refetches the range — which my own
repair added — so `events` changed identity, the callback did not rebuild, and
the second drop searched **the previous array**. Every arg is now read through a
ref that each render updates.

### Live verification — QA fixture, Scott's data untouched

Fixture: **“QA drag fixture 2026-09-24 (delete me)”**, created through the
grid's own slot quick-create, Google id `34jfbkqosahkt9bfum6p0evmr8`.

| Step | Before | After | Result |
| --- | --- | --- | --- |
| Drag 1 | Mon Sep 21, 3:00 PM | Wed Sep 23, 3:15 PM | moved, toast “Moved …” |
| Reload | — | Wed Sep 23, 3:15 PM | **persisted** |
| Drag 2 (same session) | Thu Sep 24 | Sat Sep 26 | moved — the case that failed before |
| Undo | Sat Sep 26 | Thu Sep 24, 3:30 PM | restored |
| Reload | — | Thu Sep 24, 3:30 PM | **Undo persisted** |

Fixture **deleted** afterwards through the app's own Today row menu, and its
absence confirmed after a reload. Scott's party, goals and tasks were never
touched: no drag, no edit, no delete.

Drags were driven with synthetic PointerEvents, because dnd-kit's PointerSensor
does not see the automation tool's drag (the known `chrome_tool_dndkit_synthetic_drag`
trap). The app code path is identical either way — the same `onDragEnd`.

### Logged on the way past, not fixed

- **A created event does not appear until reload.** The quick-create said
  “Created …” but the block only showed after a page reload.
- **An event's detail panel offers no Delete.** `TapEventPanel`'s ⋯ menu holds
  only “Free”; deletion exists on the Today row menu and in
  `DetailPanelRedesign`, so the newest surface is the one missing it.

---

## R — the rest of the walkthrough, driven by me  ·  15:40 ET

QA fixtures, all created and destroyed by me; Scott's party, goals and tasks
were read but never written.

### Subtasks — LIVE PASS

Fixture **“QA parent task 2026-09-24 (delete me)”**, id
`abe44d22-059d-492c-8abd-e8e34a58a93a`, with child **“QA subtask A”**.

| Step | Subtask | Parent |
| --- | --- | --- |
| created | present under the parent | `Mark complete` |
| completed the subtask | `Mark … incomplete` | **`Mark complete` — unchanged, not struck** |
| reopened the subtask | `Complete …` | **`Mark complete` — unchanged** |
| reload | `Complete …` | `Mark complete` |

Completing a step never touched its parent, in either direction, and both
states survived a reload. Fixture deleted afterwards, parent and child both
gone.

### Today's viewed date on reload — FOUND, FIXED, VERIFIED

Reproduced: page back to Wednesday, reload, and the page is Thursday again.
The URL said `/today?detail=…` with **no day in it** — `viewedDate` lived only
in component state.

The machinery was already there: a `?date=` param is read on every change, and
`changeViewedDate` wrote it — but **only when the URL already named a day**, to
keep a clean URL. So paging from a clean `/today` never began naming the day,
and a reload lost it. Now: leaving today still clears the param, so the default
keeps its clean URL; any other day names itself.

Live: back → `?date=2026-09-23`, “Wednesday, September 23”; **reload →
still Wednesday**; forward to today → clean `/today`, “Thursday, September 24”.

### The planning guide had no way in — FIXED, VERIFIED

`/guide` rendered correctly (four sheets, “One side · about 10 minutes”, “Print
all nine sides”) but **nothing in this layout's navigation pointed at it**. The
sidebar entry added when the guide shipped belongs to a different layout; this
one uses the top bar and its “More” menu, which listed Getting started and Plan
from paper but not the guide.

Added to `MORE_GROUPS` beside them, with a printer icon. Live: More → Planning
guide → `/guide`, four sheets. 3 tests.

### Completed prep task — recovery CONFIRMED, display gap stands

Codex's source finding is right (`TapEventPanel` → `useEntityRelations` with
`includeCompleted` defaulting false). The work is **not lost**: Scott's
completed “buy birthday gift” is visible, struck through, on Thursday in the
week journal. So this is a display filter on one panel, not a broken link.
Unchanged mid-walk, as instructed.

### Not done, and why

- **Review Drop/Done and no-change save** — the look-back acts on rows from the
  period just ended. Exercising Drop or Done there would write to Scott's real
  tasks, and a QA fixture cannot be placed in a past period without editing
  history. Left untested rather than faked; needs a disposable account or an
  isolated harness.
- **Failed-save retry without duplicates** — no way to inject a failure against
  the live backend from the browser, and an isolated harness would only
  re-assert what `PlanSession`'s existing partial-failure tests already cover.
  Untested live; labelled as such rather than claimed.
- **Existing goal-link capability inventory** — Codex has already established
  from source that month→season and year→season linking has **no UI at all**.
  Nothing to verify in the browser; it is a missing capability, queued for the
  usability batch.

### Logged for the mockup review, not redesigned

- A created event does not appear until a reload.
- An event's detail panel offers no Delete (the Today row menu has one).
- “Add a step” under a goal is only reachable through the caret.
- “Daily” vs “weekly, all seven days selected” are indistinguishable.

---

# Coverage, by how it was actually checked  ·  15:50 ET

**Live (me)** — I drove it in Chrome at :5199 today, against QA fixtures I made
and deleted. **User-reported** — Scott drove it; I did not see it.
**Automated only** — tests pass, nobody has watched it. **Failed** — known
broken. **Untested** — nobody has checked, and I am not implying otherwise.

| Area | Status | Evidence |
| --- | --- | --- |
| Event drag in Week Schedule | **Live (me)** | QA event Mon→Wed, reload held; 2nd drag Thu→Sat; Undo → Thu, reload held |
| Event drag — 2nd drag in a session | **Live (me)** | the stale-closure bug; fixed and re-verified |
| Event move persistence | **Live (me)** | reload after each move |
| Event move Undo | **Live (me)** | restored day survived reload |
| Subtasks: create / complete / reopen | **Live (me)** | parent untouched throughout; reload held |
| Today viewed date across reload | **Live (me)** | was broken, now `?date=` survives reload |
| Planning guide reachable from nav | **Live (me)** | was unreachable; More → Planning guide |
| Guide renders, four sheets, side counts | **Live (me)** | `/guide`, “One side…”, “Print all nine sides” |
| Guide print layout at Letter/A4 | **Automated only** | headless Chromium; **never printed on paper** |
| Relative Reschedule → Tomorrow | **User-reported** | Scott: moved, reload held 1–2 PM |
| Prep-task drag + persistence + link | **User-reported** | Scott |
| Routines: weekdays, one occurrence, reload | **User-reported** | Scott |
| task → person → task round trip, note, link | **User-reported** | Scott |
| Removal / Undo placement engine | **Automated only** | Codex's 4 harness tests + round-trip unit tests |
| Day-tile density counts | **Live (Codex)** | counts matched the journal |
| Source readiness (loading/stale/error) | **Automated only** | the unknown state has no live trigger on /week |
| Completed prep task in the event panel | **Failed** | display filter; work itself recoverable |
| Existing goal links (month→season, year→season) | **Failed** | no UI exists |
| “Review the plan” experience | **Failed** | Codex: flat lists, completed step missing |
| Review Drop / Done / no-change save | **Untested** | would write Scott's real tasks |
| Failed-save retry without duplicates | **Untested** | no failure injection available live |
| Created event appears without reload | **Failed** | observed today |
| Delete an event from its detail panel | **Failed** | no control there |
| One routine toast + Undo | **Untested** | still open from Codex's list |
| Day URL / reload through “View day” | **Untested** | still open from Codex's list |
| Standalone task later linked to a goal | **Untested** | still open from Codex's list |

**Fixture ledger.** Created and deleted by me today, both confirmed gone after a
reload: event “QA drag fixture 2026-09-24 (delete me)”, Google id
`34jfbkqosahkt9bfum6p0evmr8`; task “QA parent task 2026-09-24 (delete me)”,
`abe44d22-059d-492c-8abd-e8e34a58a93a`, with child “QA subtask A”. Scott's
party, goals and tasks were read only.

**Preview:** `:5199` rebuilt and serving `f85cb626`.

---

## S — Month and review, at a realistic size  ·  16:40 ET

Scott approved the inline Month/review direction and asked for the part two
sample goals cannot show. Read the mockup as direction only; everything here
is built on existing components and domain operations.

### The rules live in one pure function

`lib/planning/goalListView.ts` — so they can be held by tests against **30
goals, 200 tasks and a goal with 60 steps** instead of argued about in a
component.

- **Parent context survives the filter.** A matching step is never orphaned;
  its goal comes with it. A goal that matches keeps **all** its steps, because
  the reader asked for the goal, not a subset of it.
- **Hiding is always counted** — by the filter, the completed fold, or the
  reveal bound. That is the difference between a bound and a cap.
- **Completed work is always reachable in review**, and folds away outside it
  only when the reader says so.
- **The filter is presentation only.** `goalRows` and the draft stay the source
  for everything that writes.

### In the Month list

A collapsed goal states **“45 open · 15 done”**. **“+ Add a step” is reachable
without opening the goal**, and opens it with the cursor in the composer. A long
goal draws a bounded slice and offers **“Show all 60 steps · 37 more”**. The
filter appears once a list is long enough to need it; both controls are
full-size touch targets that stack on a phone; long titles wrap. **Which goals
are open is remembered per period**, so a detail round trip no longer collapses
thirty of them.

### In the review

Each step is drawn **under its own goal**, completed work **kept and marked**,
using the same model — the fix for “separate flat goal/task lists and no
visible completed song step”. A task with no goal, or one whose goal is not on
this list, still stands on its own. The filter carries the line *“Save still
writes your whole plan”*, and a regression proves it.

### Two defects found while checking it live, both fixed

1. **“+ Add a step” focused the wrong field.** The page's goal composer
   re-focuses itself on render and won the race against a `requestAnimationFrame`
   handoff. Focus now waits for an effect after the composer mounts.
2. **The completed-steps disclosure only appeared on long lists.** On a
   four-goal month, finished steps folded away *and the control to see them was
   absent* — hidden work with no way to reach it. The fold now appears whenever
   any step is finished; the filter still waits for a long list.

### Evidence

**Automated:** 6996 passing (only the pre-existing `connectors/whatsapp`
collection error), tsc clean, eslint 0 errors, build clean. 34 new tests — 19 on
the model with the dense fixtures, 5 on persistence, 5 on `PlanRow`, 3 on the
disclosure, 5 on the review including **filtered-save** and **failed-save
retry without duplicates**.

**Live, on `:5199`, with fixture “QA long-list goal 2026-09-24 (delete me)”**
(`973a86af-ce5a-4598-9b36-b3861e9b1ef7`): “+ Add a step” on a collapsed goal
expanded it and focused its composer; counts read “2 open · hide” and “1 done ·
show” across Scott's real October goals; completing a step folded it away and
the disclosure brought it back; **the goal was still open after a full page
reload**. Fixture deleted; Scott's three October goals confirmed intact.

### Unresolved, for your decision

- **Optional parent linking** is in the mockup as a per-goal “Link to a season
  goal (optional)” control. I have **not** built it: you established there is no
  UI for month→season or year→season linking anywhere, so this is the missing
  capability rather than a long-list concern, and it wants its own commit and
  its own acceptance. Say the word and it is next.
- **Per-goal status (Active/Completed/Archived)** in the mockup's goal head is
  likewise a separate capability from step completion; the list keeps them
  separate today but exposes no status control on the Month row.
- The dense fixtures are **synthetic, in tests only**. Nothing was seeded into
  the demo account, so the 30/200/60 behaviour has not been seen in a browser.

---

## T — parent linking, goal status, and the review follow-ups  ·  17:20 ET

### The optional link up, and the goal's own status

Both through fields that **already exist** — no migration, no new column:

| | field | row |
| --- | --- | --- |
| month goal → season goal | `supportsGoalTaskId` | tasks |
| season goal → year goal | `goalId` | tasks |

A disclosure under the goal's title: **“Link to a season goal (optional)”**
when there is none, **“Change or remove this link”** when there is. The
read-only line that names the parent and opens it **stays above it** — my first
pass replaced it with the editor and lost the route to the parent, which an
existing test caught. **“No linked goal”** clears the field, because optional
means removable.

**Identity is preserved by construction:** linking writes ONE field. A test
asserts the update object has exactly that key, that nothing is added or
deleted, and that `id`, `title`, `goalTaskId`, `bucket`, `monthStart`,
`completed` and `scheduledFor` are all absent from it. Steps, placement and
history are untouched. The reciprocal read already existed
(`goalsSupporting` / `seasonGoalsSupporting`) and is covered by the
name-and-open test.

**Status is Active or Completed**, said by a person about the goal. It never
reads a step: a goal whose only step is finished still reads Active, and a test
pins that. **Archive is absent** — the app has no archived state for a goal
task, and inventing one out of Someday would be a different feature with
different consequences. The select offers exactly two options and a test says so.

### Review follow-ups

- **The filter is offered when the LIST is long, not when the GOAL COUNT is.**
  It counted top-level goals, so one goal carrying sixty steps — the case that
  needs it most — had none. It now counts the rows a reader must scan.
- **“Filtering does not change what will be saved”**, in both places.

### Getting Started, independent of the planner

`shouldOpenFirstWeek` is now a named function rather than a boolean expression
in a render, and the independence is a property with a test: **asked for**
opens it whatever the planner holds, however often it was dismissed, and with
every step already done; **offered** keeps all its conditions (empty planner,
work left, no dismissal). The guide already had its own route and its own way
in from More.

### Evidence

**Automated:** 7012 passing (only the pre-existing `connectors/whatsapp`
collection error), tsc clean, eslint 0 errors, build clean. 16 new tests — 9 on
linking and status, 3 on the filter for one long goal, 4 on onboarding
independence.

**Dense layout, isolated:** `outputs/plan-dense/` renders 30 goals / 200 tasks
/ one 60-step goal with the built stylesheet and measures it in Chromium.
**Nothing was seeded into or read from the shared demo** — another session is
using it. At **1280px and 390px**: all 30 goals drawn; steps bounded with
exactly one “Show all”; no horizontal page scroll; **no per-card scroll trap**;
no title sitting under its own controls; every control ≥32px tall; long titles
wrapping on the phone.

### Remaining limitations

- The dense behaviour is proven **headlessly and in tests only**. Nobody has
  seen 30 goals in the running app, and I did not create them there.
- The linking control is on the **Month and Season pages**. A year goal has
  nothing above it; the season→year direction is wired and tested through the
  same control but has not been exercised live.
- Getting Started still **renders on Today**. It is now provably reachable
  independent of the planner's state, but moving onboarding onto its own route
  is a product change I have not made.

---

# Acceptance walk  ·  17:55 ET

Driven by me at `:5199` with disposable `QA-ACC …` fixtures, all deleted after.
Scott's data and the other session's `QA Year outcome` / Inbox walkthrough rows
were read, never written.

## One real defect found and fixed

**The review still showed no completed step.** The nesting I shipped was
correct, but `PeriodPlanPage.tsx:753` stripped completed rows before the
session ever saw them — `selectPeriodTasks(...).filter((t) => !t.completed)`.
So the display fix could not help: the data never arrived. Completed rows are
kept now, and live, "Write a new song in October" reads **“1 done · hide”** with
**“Use an old chord progression — completed”** struck through beneath it. That
is Codex's original failure, closed. Regression test added.

## One thing that looked like a defect and was not

Inbox → “This week” appeared to write nothing: `bucket` stayed `inbox`, no
commitment, no notice. It is the **domain gate** working as designed — an
unsorted capture must be given a life area first. A MutationObserver caught the
dialog opening correctly; my own automation had been dismissing it by clicking
the backdrop. Answering it wrote `bucket: week`, `context: personal`, and a real
week commitment. **No bug; no change made.**

## Acceptance matrix

Legend — **Live UI**: I drove it in Chrome today. **Harness**: isolated local
fixture in Chromium, no demo data. **Unit**: tests only. **Prior**: reusing
earlier evidence for an unchanged path.

| # | Journey step | Method | Result |
| --- | --- | --- | --- |
| 1 | Month→season link: set | Live UI | **pass** — writes one field, toast after the save |
| 1 | …change to another parent | Live UI | **pass** |
| 1 | …remove (“No linked goal”) | Live UI | **pass** — “no longer supports… Nothing else changed” |
| 1 | …survives reload | Live UI | **pass** |
| 1 | …reciprocal readback | Live UI | **pass** — parent shows “Supported by October · …” |
| 1 | Season→year link | Unit | **pass** — same control, same writer; not walked live |
| 1 | Goal complete independent of steps | Live UI | **pass** — all steps done, status stayed Active |
| 1 | Goal complete → reopen from fold | Live UI | **pass** |
| 2 | Review shows nested goal + steps | Live UI | **pass** |
| 2 | Review shows completed work | Live UI | **pass after the fix above** |
| 2 | No-change close (“unchanged”, Done) | Live UI | **pass** — no Save offered, plan intact |
| 2 | Edit → save → reopen | Unit | **pass** — not walked live (would write Scott's plan) |
| 2 | Drop / Done verdicts | **Not tested** | acts on Scott's September rows; needs a disposable account |
| 2 | Cancel / draft recovery | Unit | **pass** — not walked live |
| 2 | Failed-save retry, no duplicates | Unit | **pass** — no live failure injection available |
| 3 | Capture → Inbox | Live UI | **pass** |
| 3 | Inbox → week (with domain gate) | Live UI | **pass** |
| 3 | Week → day, via the day tiles | Live UI | **pass** — real per-day counts for the viewed week |
| 3 | Complete → reopen on the day | Live UI | **pass** |
| 3 | Remove day, week kept | Live UI | **pass** — “Keeps it in September 20–26 and in September.” |
| 3 | Standalone task later linked to a goal | **Not tested** | ran out of walk before it |
| 3 | Date URL reload / Back | Prior | **pass** — verified 15:40 today |
| 4 | Dense list: 30 goals / 200 tasks / 60 steps | Harness | **pass** at 1280px and 390px |
| 4 | No control overlap, no scroll trap, ≥32px targets | Harness | **pass** |
| 4 | Filter / expand / show-all / completed **by keyboard** | **Not tested** | see limitations |

## Remaining release blockers

1. **Drop / Done and the full save path are unproven live.** Everything that
   writes a verdict has only unit evidence, because exercising it means writing
   Scott's real September rows. A disposable account would close this.
2. **Keyboard operation of the long-list controls is untested.** The harness
   measures geometry, not focus order or key handling.
3. Still open from before, none of which blocked these journeys: completed prep
   task hidden in the event panel; a created event needing a reload; no Delete
   on the event detail panel.

## Limitations of this evidence

- The dense list has **never been seen in the running app** — only the harness.
- The `QA-ACC` fixtures were small and short-lived; nothing exercised a
  realistic account over time.
- Season→year linking shares the tested control but was not walked.

## Superseded

The §S limitation “only /week supplies tiles” still holds. The §T limitation
“the dense behaviour has not been seen in a browser” is now **narrowed**: it has
been measured in Chromium from an isolated fixture, but still not in the app.

---

# §V — Codex's bounded batch, 2026-09-24 (evening)

Four items, all closed. Two bugs fixed that no earlier pass had reached, and
one found by the new integration test.

## What the evidence is, and is not

Codex asked for this to be explicit, so it leads:

| Kind | Where | What it can settle |
|---|---|---|
| **Real database** | the demo account at :5199, by hand | that a write reached Postgres and came back after a reload |
| **Hydrated, real browser** | `outputs/plan-keyboard/` — the app's own components mounted in Chromium with the built stylesheet | focus rings that actually paint, geometry at a real width, real key events |
| **Hydrated, no layout** | `PeriodPlanPage.test.tsx` — the real page, real handlers, real key events in happy-dom | tab order, activation, focus restoration, state |
| **Mocked backend** | `PeriodPlanPage.review.integration.test.tsx` — real page/session/writer code over an in-memory table | what the client does with a failed write and a retry |
| **Static** | `outputs/plan-dense/`, `outputs/planning-guide/` | layout and print geometry only |

Nothing in this section was proven by a mocked test alone where a live check
was possible, and nothing mocked is reported as a live pass.

## Acceptance matrix

| Item | Evidence | Result |
|---|---|---|
| Year review shows goals completed **this** year | Unit (`PeriodPlanPage.test.tsx`), proven red first | **fixed** — was `status === 'active'` |
| Archived year goals stay out of the review | Unit | **pass** |
| Tab order: filter → completed fold → goals | Hydrated + real browser, 1280 & 390 | **pass** |
| Shift-Tab back up the list | Hydrated + real browser | **pass** |
| Enter / Space on the counts control and the fold | Hydrated + real browser | **pass** |
| Focus stays and stays **marked** through both | Real browser (computed outline) | **pass** |
| "Show all N steps" keeps focus | Hydrated + real browser, proven red first | **fixed** — focus fell to `<body>` |
| Escape clears the filter, cursor stays | Hydrated + real browser, proven red first | **fixed** — there was no way to clear it |
| Escape closes the timing menu, focus returns | Hydrated | **pass** — `usePopoverFocus` already did this |
| Parent-link disclosure + status control by keyboard | Real browser, 1280 & 390 | **pass** |
| Every focused control on screen at 390px | Real browser | **pass** |
| Season → year: set / change / remove | **Live, real DB** | **pass** |
| …removal and re-link survive a reload | **Live, real DB** | **pass** |
| …reciprocal reads back on /year | **Live, real DB** | **pass** — "Supported by Fall 2026 · QA-LNK season goal" |
| Standalone task → goal, then reload | **Live, real DB** | **pass** — left "To plan into a week", came back as a step |
| Review: clean Save persists every verdict once | Mocked backend | **pass** |
| Review: one refused write keeps only that verdict | Mocked backend | **pass** |
| Review: retry writes nothing twice | Mocked backend | **pass** |
| Review: a refused **session record** can be retried | Mocked backend, proven red first | **fixed** — only "Done" was offered |
| Review: Close keeps the draft, writes nothing | Mocked backend | **pass** |
| /year does not claim "0 goals" while loading | Live, then unit | **fixed** |

## Known user-facing defects still open

Distinct from untested coverage below. None found today are still open — these
are carried forward from earlier sections:

1. A completed prep task is hidden in the event panel.
2. A newly created event needs a reload before it appears.
3. The event detail panel has no Delete.

## Unproven contracts, and what would prove them

The review integration test stops at the task store. These are the contracts
below that line, and none of them can be settled without a real Postgres:

- `keepForward` writes the new period's commitment and leaves the old one
  closed, and the `tasks.bucket` / `monthStart` cache triggers follow.
- `dropCommitment` closes exactly one commitment and no other.
- `completeTask`'s side effects (subtasks, a linked list item, waiting state).
- RLS admits each of these for the acting user, and refuses them for a
  household member who should not see the row.
- A retry after a partial failure does not duplicate rows *in the database* —
  the client-side idempotency is proven; the unique constraint behind it is not.

**Required environment:** an isolated Supabase project (or a branch of the
existing one) seeded with two authenticated test accounts in one household, and
the app pointed at it. The two-account RLS technique already documented —
one `execute_sql` with `begin / set local role / rollback` — covers the policy
half without a second project; the trigger and duplicate-row half needs real
writes, so it needs the isolated project.

## Fixture state on the demo account

Created and then dropped from every planning surface: `QA-LNK season goal`,
`QA-LNK loose task`, and the earlier `QA-ACC month goal (delete me)` /
`QA-ACC step` / `Goal-link verification: …` pair. Dropped, not hard-deleted —
the planning rows offer Drop, and the hard delete lives on `/task/:id`, which
these no longer link to. They appear on no planning page, the Inbox or Someday.
Scott's goals and the other session's two Inbox rows were not touched.

---

# §W — "Choose when" says which day has room, everywhere it offers a day

Scott's outstanding request, and the §S limitation this log has carried since:
*only /week supplied tiles*. It no longer does.

## The inventory that started it

Four surfaces render `PlanWeekMenu`. Exactly one passed `dayChoices`:

| Surface | Before | After |
|---|---|---|
| `/week` (WeekViewV2) | 7 tiles, counted off the week journal | unchanged |
| `/today` (TodayView) | weeks only, no tiles | 7 tiles for the week in view |
| `/month`, `/season` (PeriodPlanPage) | weeks only, no tiles | 7 tiles for the week a row is on |
| a goal's page (TaskViewRedesign) | weeks only, no tiles | 7 tiles for the step's own week |
| `/year` | **no timing control at all** | unchanged — a year plans in goals |

`RescheduleGrid`'s `DayLoadBar` is deliberately untouched. It is the other
thing — hours booked against a window, a capacity forecast — and Scott asked
for relative counts. The two stay apart.

## What is shared now

- **`lib/planning/weekDensity.ts`** — the counting rules, stated once: a task
  on the day it is scheduled for or chosen for; timed events on their day but
  never a multi-day one; single-day all-day events; a routine occurrence when
  it has a time, was put on that day, is pinned, or is done; never a meal.
  WeekViewV2's journal now reads `routineDayState` and `eventDensityKey` from
  here too, so the journal and the tiles cannot drift apart — the journal's
  lanes and the tiles' counts are the same three facts.
- **`hooks/useDayChoices.ts`** — the hook each surface calls once per page,
  not once per row. It counts over the weeks the menu could offer and hands a
  caller the seven tiles for a given week, or nothing.
- The tiles themselves, the scale and the wording are `DayDensityTiles` and
  `dayDensity` exactly as they already were. No new picker, no new design.

## The anchor

Day tiles show **the days of the week the choice would land in** — the week in
view on Today and /week, the week a row is already committed to on the
planning pages and a goal's page. A row with no week yet is asking *which
week*, and the menu answers that first; it gets no tiles and keeps the
existing "A day…" path. Nothing invents a month-wide day grid.

## Honesty about what could not be read

`useDayLoadEvents` — the separate cached calendar read that exists so a picker
never calls a day free because nobody asked — now reaches **7 days back** as
well as 45 forward. Without that, four of seven tiles on a Thursday said "not
read", while /week counted those same days from its own fetch. One extra week
on one cached call, and the two surfaces agree.

Outside that window, and while any source is loading or failed, a day says so
and draws no bar: "further back than the calendar was read", "past what the
calendar was read for", "the calendar couldn't be read", "tasks still
loading". Unknown and empty stay different answers.

## Coverage

| Claim | Evidence | Result |
|---|---|---|
| The counting rules (9 cases: scheduled, chosen, someone else's choice, one task one day, all-day, multi-day, two calendars one meeting, timed routine, untimed-unchosen routine) | `lib/planning/weekDensity.test.ts` (17) | **pass** |
| Unknown vs empty, and per-day out-of-range | `weekDensity.test.ts` | **pass** |
| The hook offers a week inside its window, a later week, and nothing outside it | `hooks/useDayChoices.test.tsx` (13) | **pass** |
| No window → no tiles AND no fetches (calendar not asked, instances not asked) | `useDayChoices.test.tsx` | **pass** |
| Instances the caller already holds are not fetched twice | `useDayChoices.test.tsx` | **pass** |
| Loading / failed / several-missing sources each say so | `useDayChoices.test.tsx` | **pass** |
| This week's already-past days are counted, not blanked | `useDayChoices.test.tsx` | **pass** |
| Month: a row with a week draws 7 tiles with counts; the other-day path stays | `PeriodPlanPage.test.tsx` | **pass** |
| Month: a row with **no** week draws none and keeps "A day…" | `PeriodPlanPage.test.tsx` | **pass** |
| Month: a failed calendar leaves every tile unknown, not empty | `PeriodPlanPage.test.tsx` | **pass** |
| Month: picking a tile plans that exact day | `PeriodPlanPage.test.tsx` | **pass** |
| Today: 7 tiles for the viewed week, counting both a scheduled and a chosen task on one day | `TodayView.test.tsx` | **pass** |
| The calendar read is 7 back + 45 forward | `useDayLoadEvents.test.ts` | **pass** |
| /week's journal is unchanged by the shared extraction | `components/home/week` (195) | **pass** |
| **Live, /month** — a step on Oct 4–10 opened from a September day: `Sun Oct 4 — nothing on it yet`, `Mon Oct 5 — 1 routine already`, … 7 tiles, anchored to **October**, not to today's week | demo account, read-only | **pass** |
| **Live, a goal's page** — the same seven tiles for the same step | demo account, read-only | **pass** |
| **Live, a goal's page** — the step with no week: 0 tiles, "Another week…" and "A day…" intact | demo account, read-only | **pass** |
| **Live, /today** — 7 tiles for Sep 20–26 with real counts (`2 events and 1 routine already`, `1 task and 1 routine already`, …), including days already past | demo account, one disposable row, deleted after | **pass** |
| **Live, /week vs /today** — the same week, the same counts on all seven days | demo account, read-only | **pass** |

Demo mutation this batch: one task, `QA-DENS today row`, created on Today and
deleted. Nothing else was written; every other check opened a menu and read it.

## Gaps this batch leaves

- **A row with no week gets no tiles.** By design — but it means the *first*
  question a month row asks is still answered without density.
- **`/year` has no timing control**, so nothing to add tiles to.
- **Two event sources.** /week counts the events its own view fetched, which
  are layer-filtered; the other surfaces count the planning calendar's read,
  which is universal. They agreed on every day checked live, but a household
  using domain filters could see a difference.
- **A disconnected calendar** reads on the planning surfaces as a complete
  count with no events, without /week's "no calendar connected" note.
- **Outside 7 days back / 45 forward** a day is unknown. Planning three months
  out will see tiles with no counts.

## Still outstanding for Scott, beyond the three calendar findings

The three logged calendar items — a completed prep task hidden in the event
panel, a created event needing a reload, no Delete on the event detail panel —
are **not** the whole backlog. Also still open, and none of it touched here:

- editing an event's time **inline**, rather than through the picker;
- "This weekend" resolving to one day when the request was to offer **both
  weekend days**;
- weekend / custom-range week restoration;
- goal archive semantics, and the controls Scott called misleading or obscured;
- external calendar creation (destination and approval unresolved);
- Plan-from-paper analysis and revision (a separate workstream);
- real-iPhone keyboard and safe areas;
- authenticated cross-household access testing.

---

# §X — the shared density data, made correct (2026-09-25)

§W put every "Choose when" on one counting path. Codex then reviewed what that
path actually reads, and found the cache underneath it was never built to be
shared. This closes that, and the two semantic gaps §W left open.

## What was wrong with the cache

`useDayLoadEvents` held `cache`, `inflight` and `cacheFailed` as module
globals with no subscribers, no key and no invalidation:

| Defect | What it meant on screen |
|---|---|
| Only the hook that STARTED the read re-rendered | A second picker opened while the first was still loading never learned the answer arrived — it sat on "not loaded yet" until something else re-rendered it |
| …and if that hook had unmounted, nobody re-rendered | An open menu is normally closed before a slow calendar answers, so this was the common case, not the edge |
| `cacheFailed` latched for the life of the tab | One failed read and every day tile, everywhere, said "couldn't be read" until a reload |
| No account key | Sign out, sign in as somebody else, and the first account's calendar was still being counted |
| No date key | A tab open overnight kept yesterday's window and called today's days covered |
| No invalidation on a write | Move an event in the app and the tiles kept reporting the day's old count |
| Coverage derived from the clock, not the data | The reader computed "is this day covered" from `today ± constants`, which a cache filled yesterday passes |

## What it is now

One read per **account** per **day-window**, with the window's real range
stored beside the data. Every consumer subscribes; whoever started the read is
irrelevant to who hears about it. A failure is remembered for that one window
for `DAY_LOAD_RETRY_AFTER_MS` (60s) and then may be tried again — demand
driven, never on a timer. Re-read on three things and nothing else:

- **a calendar write in this tab** — a new `calendarChangedSignal`, emitted by
  `createEvent` / `updateEvent` / `deleteEvent`, the same shape as
  `instancesChangedSignal`. The view calendar refetches because the component
  that wrote it owns the fetch; this cache has no owner, so it listens.
- **returning to the tab** — `useRefreshOnVisible`, the mechanism already used
  for the view calendar.
- **the key changing** — a new account, or a new day.

Requests are still deduped: three consumers mounting together make one call.
Nothing polls, and the view calendar's own data is untouched.

Two small modules carry what a module cache cannot ask a hook for:
`lib/currentAccount.ts` (published once by `ShellLayout`, which every app
route is mounted inside) and `lib/calendarConnection.ts` (published by
`GoogleCalendarProvider`). Both answer "unknown" rather than throwing, so a
picker in an isolated harness still renders.

## The two semantic gaps from §W

**Disconnected calendar.** The planning read succeeds with zero events for a
household that has no calendar, so those tiles said "nothing on it yet" while
/week said "no calendar connected". The connection is now published, the
shared read is not started at all when there is no calendar, and the status is
`not-connected` — a COMPLETE count, with the reason, on every surface.

**Domain filtering.** /week counted its own layer-filtered rows; every other
surface counted the universal planning calendar. The same Tuesday, two
answers. Density is now **universal everywhere — every domain, everyone** —
which is the rule the planning calendar was already written to (*"a day is
full regardless of which domain filled it"*), and the tiles PRINT it:
`Everyone, every domain`, under the heading, once, readable by a screen
reader.

To get there without touching what the journal draws:

- `useDayChoices` no longer takes `layers` or `member` at all. A caller
  cannot narrow the scope; routines resolve for everyone in every layer.
- Surfaces whose task list is the reader's filtered view now pass the
  unfiltered one for counting only — `densityTasks` on TodayView and
  WeekViewV2, supplied by HomeView.
- /week's tiles come from the shared hook too, given /week's OWN calendar read
  through a new `calendar` override. That keeps its wider coverage (two weeks
  around whatever week is on screen, which reaches past the planning window)
  while the counting is identical. Its journal is unchanged: 199 tests green,
  including the day-tile ones, on real dates outside the planning window.

The override's `status` carries coverage, because `densitySourcesFor` is given
the exact range on screen and answers `stale` when what is held does not cover
it. The shared cache cannot say that — its window is anchored on today and
outlives the day it was filled — so it reports the range it read and is
checked against it.

## Relative scaling — audited

`forWeek` slices seven days out of a window that may be a month. The scale is
computed by `PlanWeekMenu` over **the tiles it is given**, so the seven are
scaled against each other; an unseen busy day elsewhere in the window cannot
flatten them. That was already true, and is now held by two tests: one on the
composition (`densityScale(forWeek(…))` → max 2 for a quiet week, 12 for the
busy one beside it), and one on the rendered bars (a 1-task Friday fills all
six segments while twelve things sit on a day in the next week of the same
window).

## Coverage

| Contract | Evidence | Result |
|---|---|---|
| Two consumers, one read; both woken | `useDayLoadEvents.test.ts` | **pass** |
| The read lands and wakes the others after the initiator unmounts | `useDayLoadEvents.test.ts` | **pass** |
| No second read while one is in flight (3 consumers → 1 call) | `useDayLoadEvents.test.ts` | **pass** |
| A failure is not retried inside the cooldown | `useDayLoadEvents.test.ts` | **pass** |
| …and IS retried after it — not latched for the tab | `useDayLoadEvents.test.ts` | **pass** |
| A calendar write in this tab retries immediately | `useDayLoadEvents.test.ts` | **pass** |
| …and re-reads, so the tiles stop showing the old count | `useDayLoadEvents.test.ts` | **pass** |
| The signal is ignored when not enabled — nothing polls | `useDayLoadEvents.test.ts` | **pass** |
| A second account never sees the first's calendar | `useDayLoadEvents.test.ts` | **pass** |
| The window key changes at midnight; the read follows | `useDayLoadEvents.test.ts` | **pass** |
| The range returned is the range actually read | `useDayLoadEvents.test.ts` | **pass** |
| A day outside the read range is unknown, and says which side | `useDayChoices.test.tsx` | **pass** |
| Yesterday's cache does not pass as today's coverage | `useDayChoices.test.tsx` | **pass** |
| "Nothing read yet" is its own answer | `useDayChoices.test.tsx` | **pass** |
| No calendar → complete count, "no calendar connected", nothing fetched | `useDayChoices.test.tsx` | **pass** |
| Routines resolve for everyone, every layer; scope is not a parameter | `useDayChoices.test.tsx` | **pass** |
| A caller's own calendar status is trusted, and stale carries through | `useDayChoices.test.tsx` | **pass** |
| Seven offered days scale against each other, not the window | `useDayChoices.test.tsx` + `PeriodPlanPage.test.tsx` | **pass** |
| A shorter run (workweek) offers five tiles | `useDayChoices.test.tsx` | **pass** |
| /week's journal and its tiles unchanged by the move | `components/home/week` (199) | **pass** |
| **Live, /month** — 7 tiles for Oct 4–10, unchanged counts, and the new scope line reads "Everyone, every domain" | demo, read-only | **pass** |
| **Live, /week** — identical counts to before the move, on all seven days | demo, read-only | **pass** |

7098 tests pass (only the pre-existing `connectors/whatsapp` collection
error); tsc and eslint clean. No demo data was written this batch: every live
check opened a menu and read it.

## Exact remaining gaps

1. **Cross-tab writes.** A calendar change made in ANOTHER tab does not
   invalidate this tab's cache; it is a `window` event, not a storage one. The
   foreground return covers the common case.
2. **Changes made in Google itself** are not known until the tab is returned
   to, or the day rolls over. Nothing polls, by instruction.
3. **Two coverage mechanisms.** /week states coverage through
   `densitySourcesFor`; the shared cache through its stored range. Same
   semantic, two implementations — the seam is the `calendar` override.
4. **A tile can legitimately out-count the column beneath it** on /week, now
   that tiles are universal and the journal stays filtered. The scope line is
   what explains it; nothing else does.
5. **`densityTasks` is opt-in.** A host rendering TodayView or WeekViewV2
   without it falls back to the filtered list and under-counts. Only HomeView
   renders them today.
6. **Account isolation depends on `ShellLayout`** publishing the account.
   Every app route is mounted inside it; a surface rendered outside keys as
   `anon`.
7. **Retry is demand-driven.** A calendar that is failing continuously is
   retried at most once a minute, and only when something asks.

Still outstanding for Scott, unchanged from §W and not addressed here: inline
event time; both weekend days; weekend/custom-range restoration; goal archive
semantics and the obscured controls; external calendar creation; plan-from-paper
analysis; real-iPhone keyboard and safe areas; authenticated cross-household
access testing — plus the three logged calendar findings, which remain a
subset of that list rather than the whole of it.

## §X.1 — the concurrency bug Codex found in §X (same day)

§X gave the cache subscribers and a key, and fixed the wrong half of the
sharing problem. Two defects survived, both found by reading the source rather
than the tests:

1. **Forced reads bypassed the dedupe.** `ensure(account, true)` skipped the
   in-flight check, and every *enabled consumer* subscribed to
   `onCalendarChanged` and to visibility on its own account. One write with
   three pickers open started three reads.
2. **No generation protection.** With more than one request in the air — which
   (1) guaranteed, and which an account change causes anyway — whichever
   answered LAST won, not whichever was newest. An older response could
   overwrite newer data, including overwriting good data with a late failure.

And a third, implied by fixing the first two naively: a write arriving **while
a read is in flight** must not simply be deduped away. That read describes the
world before the write.

### What it is now

- **The signals belong to the module**, ref-counted by mounted consumers. One
  `calendarChanged`, one `visibilitychange`, one account subscription per tab,
  whatever the consumer count — and unwired when the last consumer goes.
- **`invalidate()` is the single entry point** for "the world changed". It
  bumps `changeSeq`, clears the failure cooldown, and either starts a read or,
  if one is already in flight, lets that read's completion start the follow-up.
- **`generation` guards every response.** Only the newest read started may
  write to the cache; an older one — success or failure — is dropped.
- **`changeSeq` guards staleness.** A read that lands having been started
  before the latest change is kept (better than nothing) and immediately
  followed by a fresh read. Several writes during one request still produce
  exactly one follow-up.
- **The cooldown still applies to mounting**, and deliberately does not apply
  to a forced read: a write or a foreground return is caused by the user, not
  by a timer, and refusing to retry right after somebody reconnected their
  calendar would be the wrong answer.

### Coverage

| Contract | Evidence | Result |
|---|---|---|
| One write, three consumers → one read | `useDayLoadEvents.test.ts`, proven red first | **pass** |
| Signals unwire with the last consumer, and re-wire for the next | same | **pass** |
| An older response never overwrites a newer one | same, proven red first | **pass** |
| A late failure from an orphaned read does not mark the current one failed | same | **pass** |
| A write mid-request causes a fresh read, not a discard | same, proven red first | **pass** |
| Several writes during one request → exactly one re-read | same, proven red first | **pass** |
| A forced read bypasses the cooldown | same | **pass** |
| …but a mounting consumer inside the cooldown still does not | same | **pass** |

26 tests on the cache, 7107 overall. The density cache is not "accepted" by me
— that is Codex's call — but every contract in the addendum now has a test
that fails without its fix.

---

# §Y — Completion checklist (durable; update in place)  ·  2026-09-25

The program's remaining authorized scope, kept current so a fresh session can
resume here. Evidence: **Live** = driven on :5199 against the demo account's
real database; **PG** = throwaway local Postgres with the live schema
(`scripts/test-planning-commitments-locally.sh`, 11/11); **390** = same-origin
390px frame, signed in; **Unit** = vitest (mocked backend). Mocked tests never
stand in for Live or PG. Per-finding status: `onboarding-program-findings.md`
§ "Status update — 2026-09-25".

Model: this session ran **Opus 5.5** (`claude-opus-5-5`).

## Verified

| Area | Evidence | Commits |
|---|---|---|
| Choose-when density: one path, universal scope printed, loading/failed/not-connected/out-of-range, seven-day scaling | Unit + Live | §W–§X.1 |
| Inline event date/start/end; refused save keeps edit; Escape → focus back | Unit + Live (open/cancel) + 390 | 52888c78 |
| Both weekend days for events; tasks keep "either day" (own line) | Unit + Live | 52888c78 |
| Event panel: completed prep stays, reopen in place; prep is any-time on the day | Unit + Live | efa6fe1b |
| Event panel Delete (writable calendars, two-step confirm, refusal stays open); one ⋯ | Unit + Live (menu only) | efa6fe1b |
| /week quick-create refetches | Unit | efa6fe1b |
| Task pane: "For <goal> · period", then its when (shared TaskTimingMenu, own period); Remove day with consequence + Undo | Unit + Live | 3c9b9f13, e57e83de |
| Plan pages open a task in the pane over the period (hostsSelectionKinds) | Unit + Live | 3a40401e |
| Capture → one post-write confirmation with "Go to inbox"; Quick Add closes on navigation | Unit + Live | 43adbda1, bd4bf593 |
| Journey: capture → Inbox → life-area gate (now explains itself) → week → day → complete/reopen → remove day keeps week | **Live**, current build | this pass |
| Review: Drop + Keep save; forced Drop failure keeps only it; retry writes once; reload | **Live** | 65f96555 |
| Review save screen: saved vs proposed; Drop names destination; "Your plan for <period> is unchanged" | Unit + Live + 390 | 65f96555 |
| keepForward / dropCommitment / complete-reopen / retry idempotency / cross-household RLS | **PG** 11/11 | 65f96555 |
| Carried period re-chosen reopens (model showed Inbox); focus re-send no RLS error | Unit (red first) + PG | 65f96555 |
| Planning session opens Shelves on the calendar; status line "N on the calendar"; period calendar de-duplicated | Unit + Live | f77a3658, 6d2d9a7e |
| S2-08, S3-08, S3-09, S3-10, S2-23, S2-19, S3-11 copy, weekend/custom range reload | Unit (several red first); S3-10/S2-19 Live | 6d2d9a7e, a77a3064, 8a2abc45, efa6fe1b |
| Season row → named month, never the clock's; "Into a month…" across the season (S3-03) | Unit + Live | f1956b33, 408c9f5d |
| Phone width: titles no longer squeezed on /month, /week; nothing past the edge on /today /week /month /season /inbox /guide; review + panes fit | **390** | b58a2e75 |
| Guide's Plan from paper opens the flow; empty Today links to Getting Started; capture path names events/routines | Unit + Live | 509a3fa9, 7a4beee7 |
| Earlier: links set/change/remove/reload/reciprocal, standalone → goal, goal complete independent, keyboard long list | Live / Hydrated | §V, Acceptance walk |

Integrated at final HEAD (2026-09-25): 7199 tests pass (only the known
`connectors/whatsapp` collection error; 36 in the write-order suite), tsc clean,
eslint 0 errors, build clean, preview rebuilt. PG: 096 11/11, 097 12/12,
098 7/7, 099 23/23.

## Implementation remaining (authorized, unblocked, not done)


## Acceptance remaining

- Inline event SAVE, reschedule, drag/resize and Delete against a real calendar:
  blocked by "no real event writes" — needs a disposable writable calendar or
  Scott's approval. Everything short of the write is verified.
- Dense list (200 tasks) in the running app — harness only; seeding 200 rows
  into the shared demo account was judged too disruptive.
- (Closed 2026-09-25, Codex follow-up — see "Codex follow-up acceptance" below.)

## Genuinely blocked / needs Scott

- **S2-22** month/season goal archive — schema/product decision; not faked.
- **S1-04** four add routes on empty Today; **S1-05/S1-05a** nav labels — product.
- **S2-02** needs a reproduction with Scott.
- **External calendar creation** (S3-07) — destination/approval.
- **Real iPhone keyboard/safe areas; paper printing** — manual.
- **Two-account live RLS** — PG proves the policies; live needs a second login.
- **Write order — DONE for Drop and Keep, deliberately NOT for updateTask**
  (Codex's instruction, 2026-09-25). Drop: commitments first, row last
  (90cfb136). Keep: ensure destination, then carry, stop at first failure,
  row last (3557f1b1). Both: a failure re-reads records AND row and stays a
  failure; the retry writes the row if it still differs. Evidence: hook tests
  (8 new, all red on the previous hook), PG 098 7/7 and 099 23/23, and live on
  :5199 — a Drop with its removal forced to fail sent NO row write and left the
  Inbox count unchanged; the retry sent removal → row → session record; a Keep
  sent ensure → carry → row. updateTask: ops-first is safe only for some
  placements; weekend/dated moves to another week trade one retry-repairable
  leftover for another — a design call for Codex/Scott
  (`2026-09-25-keep-update-order-investigation.md`, Decision).
- **Concurrency limit**: every writer is several independent requests, not
  one transaction. Order bounds what one client's failure leaves; it does not
  serialise two writers (another tab, the partner, the wall). Only the RPC
  option (097 c; migration + security review) is atomic.
- **Date vs week — CLARIFIED (Codex, 2026-09-25)**: connected-planning-design.md
  (lines 16–17, 119–130) already answers it: a date preserves explicit broader
  commitments and never infers a week. Behaviour kept. The timing chip and its
  description now say both when they differ ("Sun, Oct 18 · any time · still
  on Oct 4 – 10"); the week list already grouped "Scheduled outside this week".
- **Release**: nothing pushed, merged or deployed. Production needs Scott.

## Demo fixtures left (all disposable, named QA-)

`QA-REV drop me` (Inbox), `QA-REV keep me` (week of Sep 20), `QA-ACC2 walk`
(week of Sep 20), `QA-ACC2b walk` (Inbox), `QA-PREP bring forms` (prep for PT,
Fri Sep 25, created before the all-day fix so still 12:00 AM). Not
hard-deleted (browser rules); safe to Drop or complete.

## Codex follow-up acceptance  ·  2026-09-25 (later)

| Item | Method | Result |
|---|---|---|
| S3-12 tail: phone offline capture "two Failed to add task" | **390** frame, Inbox phone capture; only `POST /rest/v1/tasks` rejected with `TypeError: Failed to fetch`; MutationObserver + DOM census; Enter and the Add button | **Not a duplicate.** One POST, one toast event, text restored to the field. The two DOM nodes are the visible toast and its `sr-only role=alert` announcement; the visible toast is not itself a live region, so a screen reader hears it once. A text/a11y-tree extraction shows it twice — the likely source of the original report. No change. |
| S3-08 on real data | **Live**, fixtures `QA-S38 season goal` (Fall) + `QA-S38 step`, taken into October with the season "Into a month…" chooser (the life-area gate asked; Personal) | October row: "QA-S38 step · Supports Fall 2026 · QA-S38 season goal"; no "Link to goal"; survives reload. Scott's existing "List recurring home-maintenance jobs…" now also reads "Supports Fall 2026 · …". |
| S3-09 on real data | **Live**, October planning session, Plan step | The season rail offers no "Add to October" for `QA-S38 step` (it is listed under "October tasks"). No other season-only open task existed, so the positive case stays unit-proven. Closed without writing. |
| Goal-completion Undo | **Live**, fixture `QA-GU month goal` (October) | Tick → "Completed the goal “QA-GU month goal”. Its steps are unchanged. Undo"; goal moves to Completed goals. Undo → reopened; survives reload. (A first attempt clicked beside the link — automation, not the app.) |
| Dense list 30 goals / 200 tasks | **Harness** (`outputs/plan-dense`), rerun on the current code | pass at 1280 and 390. Limit: the harness renders desktop markup, so it does not exercise the phone-only timing placement (b58a2e75); that was measured live at 390 instead. Not seeded into the shared demo. |

New demo fixtures from this pass: `QA-S38 season goal`, `QA-S38 step`
(October), `QA-GU month goal` (October, open). No `QA-OFF` row was created
(the offline capture never reached the database; the field was cleared).

(Counts at that point superseded — see the final figures under "Verified".)

## Unresolved technical reliability risk — updateTask write order  ·  2026-09-25

Codex decision: keep updateTask's order (row first, then ops) for now; do not
pick a known-inconsistent intermediate state as a product preference.

**What can go wrong.** updateTask's placement path sends the row UPDATE, then
each commitment op, then focus ops — separate PostgREST requests. If a request
after the first fails (error, timeout, lost response, closed tab), the row and
its records can disagree until a later write or retry repairs them. Evidence:
`scripts/investigate-keep-update-order.sh` (099, 23/23), blocks U1–U7.

| Flow | Failure point | What is left |
|---|---|---|
| Move a week task up to its month / season (U7) | op after the row | row on the higher period, lower commitment still open → shows on both |
| Let go to Someday with two commitments (U5) | 2nd remove | row someday, one period still open |
| Remove day AND week (U4b) | the remove | row back on the month, week still open |
| Move back / to another week (U3c) | ensure or remove | row on one week, records on the other (or on both) |
| Dated task sent to another week (U3b) | remove after ensure | on two weeks — or, with ops first, on its old day with the week moved |
| Weekend task moved to another week (U6c) | row after ops | two weeks — or, with ops first, the old weekend on the new week |
| Focus (planned-on) | focus op | the day's focus missing while the placement landed (no trigger couples them) |

Every case converges on a retry of the same write (099); none loses data. The
risk is a visible split for other devices until then.

**Recommendation.** One transactional RPC per placement write — the shape
already proven in isolation as 097 option (c): SECURITY INVOKER (caller's RLS),
row lock, ops then the final row inside one transaction, idempotent on retry.
Then Drop and Keep move onto it too.

**Before rollout** (not authorised here): a shared migration; a security review
(invoker rights, no privilege widening, input validation of op payloads, RLS
on every table touched, grants); a PostgREST rollback check that a raised
exception rolls the whole call back; the 096–099 harnesses re-pointed at the
function; a live two-account test.

**Concurrency, all orders:** separate requests are not atomic, and two writers
(another tab, the partner, the wall) can interleave. Ordering bounds a single
client's failure; only the transaction serialises writers.
