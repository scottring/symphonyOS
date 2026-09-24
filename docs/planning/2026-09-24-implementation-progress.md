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

### Still open from Codex's review

- **(5) Day rows have no timing control yet.** A is not complete on WeekList alone.

### B (rest) — completion and reopening across views

Status: **next**, with C (planning-session truthfulness) after it.
