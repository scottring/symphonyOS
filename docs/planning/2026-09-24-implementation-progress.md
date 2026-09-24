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

### A2 — Week and Day rows, and task details

Status: **next.**
