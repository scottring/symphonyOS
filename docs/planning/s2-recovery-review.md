# Storyline 2 recovery — completion report

Branch `claude/onboarding-program`, cut from `origin/main` ca075d26. **Nothing merged,
nothing deployed, no schema or permission changes, no other branch touched.**
Review surface: `vite preview` on **http://localhost:5199** (left running).

Scope was the three confirmed defects that cost Scott his place in storyline 2, and
nothing else. Findings detail lives in
[`onboarding-program-findings.md`](./onboarding-program-findings.md) as S2-16 … S2-19.

## The repair

| # | Defect | Cause | Resolution |
| --- | --- | --- | --- |
| S2-16 | Back from goal details returned to **September** | The viewed period lived only in `PeriodPlanPage`'s `anchor` state; `goTo` wrote it nowhere, so returning re-ran `planningPeriod`, which opens the current month | `goTo` now writes `?start=YYYY-MM-DD`, which the page already read on mount as `explicitStart` |
| S2-17 | No way to put an October task into the week of **Oct 4–10** | Both routes to "a week" resolve to the week containing *now* — the row verb calls `pushTask(id,'week')`, Shelves anchors on today. Not undiscoverable: absent | New `PlanWeekMenu` ("Plan ▾") offers the weeks of the period in front of you — the month being viewed on a plan page, the goal's own period in goal details — plus "Another week…", "Keep it in October" and "A day…" |
| S2-18 | Goal details showed **today's task chooser** | Only `PeriodPlanPage` supplied period Shelves; `ReferenceLists` chose by pathname, so `/task/:id` fell through to `TodayPlanList` | The Shelves block was **extracted unchanged** into `PeriodShelves`; a goal renders that same component for its own period. `ReferenceLists` hands over the slot on a *claim*, not a pathname test |
| S2-19 | Life-area gate interrupts a week choice | — | **Logged only**, as instructed. Not redesigned. |

### Codex review of `cefcdbcc` — two gaps, both closed

| Gap | What was wrong | Resolution |
| --- | --- | --- |
| Plan was hover-only | `PlanRow` put the slot inside `hidden sm:flex opacity-0 group-hover:opacity-100`, and `TaskViewRedesign` wrapped it the same way — so the one control the repair existed to provide was invisible until hover and absent below the `sm` breakpoint | Plan now renders **outside** the hover span and is no longer gated on `verbs.length`, at every width. The secondary verbs keep their hover behaviour untouched |
| `anchor` read the URL only on mount | `goTo` wrote `?start=`, but `anchor`'s initial state was the only reader. Browser Back and Forward change the URL **without remounting**, so October → November → Back left the heading and list on the wrong month | An effect syncs `anchor` whenever `?start=` *changes*, never on its mount value — so `planningPeriod`'s look-ahead on a cold open is preserved. A missing parameter is answered the same way a cold open answers it |

Goal status semantics, the life-area flow, ordinary task behaviour, onboarding and the
calendar were left alone.

## Commits (local only)

- `92e10323` fix(plan): keep the viewed period, and let a task reach a week of it
- `7bbee085` docs(onboarding): record S2-18's approach and why it is its own batch
- `cefcdbcc` refactor(plan): reuse the Month page's Shelves for a goal
- *(this report's commit)* fix(plan): Plan is visible without hover; the URL drives the month

## Files

**New** — `src/components/plan/PeriodShelves.tsx` (the verbatim block, now a component)
· `src/components/plan/GoalPeriodShelves.tsx` (computes a goal's period inputs, portals
into the Shelves target) · `src/components/plan/PlanWeekMenu.tsx` ·
`src/lib/planning/monthWeeks.ts` · `src/lib/planning/goalShelves.ts` ·
`src/components/plan/PeriodShelves.test.tsx` · `src/lib/planning/monthWeeks.test.ts`

**Changed** — `src/components/plan/PeriodPlanPage.tsx` (renders `PeriodShelves`; `goTo`
writes `?start=`; exports `taskRow`; hosts the Plan slot) ·
`src/components/plan/PlanRow.tsx` (optional `planWeek` slot, passed to steps too) ·
`src/components/task/TaskViewRedesign.tsx` (step rows carry `PlanWeekMenu`) ·
`src/apps/tasks/TaskViewContainer.tsx` (goals render `GoalPeriodShelves`) ·
`src/components/reference/ReferenceLists.tsx` + `ReferenceListsContext.tsx` (the claim) ·
`src/lib/planning/periodPage.ts` (the removed data-dependent jump)

## Tests

`npx vitest run src` — **6370 passed, 3 skipped**. One failing file,
`connectors/src/whatsapp/adapter.test.ts`, is a pre-existing collection error confirmed
by stashing this branch's changes and re-running; it needs its own `node_modules`.
`npx tsc --noEmit -p tsconfig.app.json` clean. `eslint` on the new and changed files:
0 errors, warnings at repo baseline (the extraction had left `Repeat`, `X`, `formatShortDate`, `PlanRail` and `TITLE` unused in `PeriodPlanPage`; those are now removed — they were missed in `cefcdbcc` because only the new files were linted). `npm run build` succeeds.

`PeriodPlanPage.test.tsx` gained 3 cases for the URL/anchor contract: opening on the
month the URL names, **following a `?start=` change while the page stays mounted** (the
mechanism Back and Forward use), and the stepper writing the month into the URL. The
middle one was confirmed to FAIL without the sync effect — the heading stayed on
October while the URL said November — so it is a real regression test rather than a
restatement. `useNavigate` is mocked in that suite, so the history buttons themselves
were exercised in the browser instead (below).

New coverage: `monthWeeks.test.ts` (5) pins October's five weeks including the
boundary week Sep 27 – Oct 3 and a Monday-start household. `PeriodShelves.test.tsx`
(11) covers the extracted component for **month and season**, the calendar list with
events and dated tasks, a dated task being a link where an event is not, both
"limits" notes — and `goalShelvesPeriod`, which reads the period from the goal's own
stamps so a **direct open and a reload** cannot drift. The 79 existing
`PeriodPlanPage` tests passing unchanged is the evidence that the extraction moved
behaviour rather than altering it.

## UI evidence (localhost:5199)

- **Back preserves October** — `/month?start=2026-10-01` → goal → Back → back at
  `/month?start=2026-10-01`.
- **Plan ▾ on a step** lists "A WEEK IN OCTOBER · Sep 27 – Oct 3 · Oct 4 – 10 ·
  Oct 11 – 17 · Oct 18 – 24 · Oct 25 – 31", then "Another week…" and "A day…".
- **Week write, verified in the database on a scratch task** (created via the UI,
  deleted afterwards): `bucket: week`, `week_start: 2026-10-04`,
  `month_start: 2026-10-01` **preserved**, `scheduled_for: null`, and
  `task_commitments` holding both `month/2026-10-01 open` and `week/2026-10-04 open`.
  Afterwards it appeared on "List for the week of Oct 4" under **ANY DAY** with
  "from October", and in Shelves' **Month** tab.
- **Goal details, direct open and after ⌘R** — Shelves reads "October 2026 · Keep the
  season in view as you plan this month · THIS SEASON · Fall 2026 · ON THE CALENDAR · 2
  (Mon, Oct 12 · Columbus Day; Sat, Oct 31 · Halloween)".
- **Ordinary task unchanged** — `/task/891ddbdd…` ("book the car for an oil change")
  still shows today's chooser in Shelves, Subtasks, and WHEN · Fri, Sep 25.
- **Month and Season still render** — October reads "1 goals · 2 tasks" with the goal
  and its two supporting tasks; Fall 2026 reads "THIS YEAR · 2026 · ON THE CALENDAR · 3".
- **Plan visible with the pointer away** — pointer parked at (120, 880), inside the
  Shelves panel and far from the rows: "Plan" shows on both step rows while the hover
  verbs (↘ ☀ 🗑) are correctly absent.
- **Plan visible at 390px** — checked in a same-origin 390×844 iframe rather than
  `resize_window`, which misreports. Both step rows show "Plan" beside the narrow
  "Move ▾" select.
- **Browser Back and Forward** — October → (Next month) → `?start=2026-11-01`
  "November 2026" → `history.back()` → `?start=2026-10-01` "October 2026" →
  `history.forward()` → November again → back once more → October reading
  "1 goals · 2 tasks" with the goal visible. Heading **and** content follow the URL, not
  just the address bar.

## Scott's records

Untouched, re-read from the database after all work:

| Title | is_goal | bucket | month_start | week_start | scheduled_for | goal_task_id |
| --- | --- | --- | --- | --- | --- | --- |
| Take Kaleb to an Islanders game in DC | true | month | 2026-10-01 | — | — | — |
| Research games dates and tickets | false | month | 2026-10-01 | — | — | b941b06f |
| Buy game tickets | false | month | 2026-10-01 | — | — | b941b06f |

The three storyline-1 tasks are also unchanged. No reset, no cleanup. The only row
created was `ZZ scratch verify week`, used for the database verification above and
deleted.

## Remaining gaps

1. **Automatic month navigation is not fully resolved.** Only the data-dependent jump
   was removed. The **time-based** advance still fires — a month with ≤6 days left, a
   season with ≤14 — so late in a month `/month` still opens the next one. Scott's
   "no surprise jumps" would argue for removing it; not done, because it was not part
   of this batch and is a product decision.
2. **S2-19 life-area gate** interrupts a week choice mid-decision. Logged, untouched.
3. **S2-08 false empty states on load** (high): `/task/:id` renders "Task not found"
   and a plan page reads "0 goals · 0 tasks" for several seconds before data arrives.
   Likely the real cause of the original month-page wandering.
4. **S2-10** planning pages open a full page while Today and Week open the pane.
5. **S2-15 / S2-01** a month's body shows only *planned* counts, so it reads empty while
   commitments sit in Shelves; a review should open with what is already true.
6. **S1-15 parked** — the need to show the horizon row as Planner's subrow stands; the
   hairline treatment was rejected.
7. `GoalPeriodShelves` recomputes its period inputs rather than sharing
   `PeriodPlanPage`'s memos. Both call the same pure helpers, so they agree today, but a
   future change to one should be mirrored. A shared `usePeriodShelvesModel` hook would
   close this; deliberately not done, to keep the extraction behaviour-preserving.

## Where to resume

**Corrected** (the earlier "decide what progress matters / create goals" resume point
was wrong — Scott already has the goal and both tasks; there is nothing to create).

Resume by **choosing "Research games dates and tickets" for the week of Oct 4–10**,
using Plan ▾ on October's page or on the goal's detail page, and **leaving "Buy game
tickets" month-only** so the flexible case stays represented. Then check the week reads
correctly: the chosen task should appear on "List for the week of Oct 4" under ANY DAY
with "from October", while "Buy game tickets" stays on October's list alone.

All three records must be preserved as they are. Stopped here for review rather than
starting storyline 3.
