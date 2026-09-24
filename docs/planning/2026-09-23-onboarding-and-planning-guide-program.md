# Onboarding + Planning Guide program

Started 2026-09-23. Branch `claude/onboarding-program`, cut from `origin/main` ca075d26.
Scott's brief: walk four storylines together, fix what confuses, and turn what we learn
into a first-class onboarding system and a permanent, printable Planning Guide.

Companion log: [`onboarding-program-findings.md`](./onboarding-program-findings.md).

## Ground rules

- Scott drives. I give the situation; he finds the action before I coach.
- Test household / demo account only. **Never import his two-page Fall brainstorm into
  his real account**, and never touch his year goals or history.
- Log, don't fix, during a walk — except blockers. Fixes land in batches between walks.
- Fix confusing behaviour rather than teach a workaround.
- Preserve the approved visual design (Nordic Journal, `src/index.css`).
- No production deploy without Scott's approval.

## What already exists (inspected 2026-09-23 on origin/main ca075d26)

| Piece | Where | State |
| --- | --- | --- |
| Household first-run | `src/components/setup/FirstRunGate.tsx`, `FirstRunSetup.tsx`, `src/lib/firstRun.ts` | Shipped. Signup is allowlisted (`signup_allowed()`). |
| First-arrival invitation | `src/components/schedule/FirstWeekCard.tsx` | Shipped, **two** paths: "Add something for today" / "Start with a goal" / "Explore on my own". |
| "Your first week" checklist | `src/lib/firstWeek.ts`, `useFirstWeekSignals.ts` | Logic still computed; `FirstWeekCard` no longer renders `steps` or `onSamplePage`. Dead path. |
| Guided planning sessions | `src/hooks/usePlanningSession.ts`, `src/lib/planning/*`, `public/narration/*.mp3` | Shipped for year / season / month / week (PRs #48–#53). Look-back verdicts Keep / Done / Someday / Drop. |
| Coach lines + session AI | `src/lib/planning/coachLines.ts`, `GuideChat` | Shipped (see `tasks/planning-guide.md`). |
| Plan from paper | `src/components/capture/PageReviewSheet.tsx`, `src/lib/planning/paperIntoDraft.ts` | Shipped; lives inside Add. |
| Help | `src/components/layout/DesktopFooter.tsx` | Four lines in a footer dialog. No link to onboarding or to a guide. |
| Written onboarding | `docs/onboarding.md` | A doc, not a surface. Carries per-step Status from walkthrough Run 1. |
| Prior assessment | `docs/planning/2026-09-22-onboarding-assessment.md` | Design proposal; the contextual teaching sequence is **not** built. |

### Gaps against the brief

1. **Three entry paths** (storylines 1–3) — only two exist, and neither covers calendar,
   capture, routines, or "plan the next few weeks".
2. **Skippable and available again later** — "Explore on my own" hides for a week; there
   is no deliberate way back in. Help does not offer it.
3. **Permanent printable Planning Guide** — does not exist in any form in the app.
4. **Review/planning prompts per horizon** — the four-row prompt table in the brief has
   no home yet.
5. **Storyline 4 teaching** (review and adjust) — the verdict machinery exists; nothing
   introduces it.

## The four storylines

Each is walked one meaningful action at a time. After every step we establish:
discoverable? · result matched expectation? · related views updated, including after
reload? · revisable/undoable? · language and presentation clear?

1. **"I want to jump right in."** Calendar or event · capture without planning · choose a
   task for Today / a date / this week · create a routine and complete one occurrence ·
   complete, edit, reschedule. *Success: useful immediately, no goals, no onboarding.*
2. **"I want to plan the next few weeks or month."** Review commitments · decide what
   progress matters · month goals and tasks · choose week work, leave some flexible ·
   choose today's work from the week · commitments survive. *Success: a realistic plan;
   work without a day is findable.*
3. **"I want to plan the next season or year."** Reflect · year goals · seasonal outcomes
   · month plan beneath them · weekly actions · both direct entry and Plan from paper
   (AI instructions, conversational revision, approval before import), using Scott's
   two-page Fall/September brainstorm as the review example. *Success: goals and actions
   stay distinct and connected; any horizon is a valid starting point.*
4. **"Life changed; I need to adjust."** Leave work unfinished · review last week/month ·
   carry forward / complete / Someday / drop the period's commitment · remove a Today
   commitment keeping the week one · pause or revise a routine keeping its history ·
   revisit a goal that no longer fits. *Success: nothing silently becomes a new
   commitment, history survives, changing a plan is easy.*

## Product model to preserve (checked at every step)

- A task keeps its broader commitments when chosen for a week or a day.
- Completion shows wherever the same task appears.
- Goals stay goals; they never become scheduled tasks.
- Today's chooser offers week tasks and relevant routine occurrences, kept separate.
- Month tasks reach Today through Week's reference material, not Today's chooser.
- Choosing or completing a routine affects that occurrence, not the pattern.
- Weekend means flexible Saturday–Sunday — no invented Saturday date.
- Carry-forward is explicit; dropping a commitment never deletes the item.
- Work can be added directly at any horizon.

## What we build alongside

**A. Three optional entry paths** matching storylines 1–3, offered on first arrival,
skippable, and reachable again from Help and from the relevant horizon pages.
Storyline 4's lessons appear contextually, when a review is actually due.

**B. A permanent, printable Planning Guide.** Reachable from onboarding, from Help, and
from each horizon page. Encourages reflection and, for month/season/year, offers paper
and pencil — while direct entry stays equally available. Carries the prompt table:

| Horizon | Review prompts | Planning prompts |
| --- | --- | --- |
| Year | What mattered? What changed? What deserves to continue? | What do we want this year to add up to? What would meaningful progress look like? |
| Season | Which yearly aims matter now? What remains relevant from the previous season? | What deserves attention during this stretch? What will we leave for later? |
| Month | What finished, remains open, or no longer matters? | What progress is realistic this month? Which outcomes and actions belong here? |
| Week | What happened last week? What needs an explicit decision? | What fits around the calendar? What can remain flexible? What routines need attention? |

Each prompt is followed by how an answer becomes a goal, task, routine, event, or
reference note, with concrete examples. The guide never claims every task must serve a
goal, or that a seasonal goal needs a monthly twin.

**C. Optional AI-guided sessions** over the same storylines, on the user's own data
(direction set 2026-09-23). The deterministic guide stays available and equal — not a
fallback. First to prove: "plan my week with my own tasks", with contextual questions,
verified saves, error recovery and resume-later. The other storylines stay in the
design but wait for that one. What the assistant can and cannot do today, and the tool
gaps that block this, are recorded in
[`2026-09-23-guided-sessions-assistant-gaps.md`](./2026-09-23-guided-sessions-assistant-gaps.md);
the short version is that the agent has no `week_start`, `planned_on`, `is_goal` or
planning-session access, so nothing goal-aware, horizon-aware or resumable can be
promised yet. Walks 2–4 supply the questions the session must ask; the agent is not
built until after review.

**D. Regression tests** for every behaviour a walk proves wrong, plus tests for the new
onboarding and guide surfaces.

## Sequence

1. Inspect what exists. *(done)*
2. Record this plan. *(done)*
3. Walk storyline 1 with Scott; log findings.
4. Fix confusing behaviour from storyline 1; build entry path 1.
5. Walk storyline 2 → fix → build entry path 2.
6. Walk storyline 3 (including Plan from paper on the Fall brainstorm) → fix → entry path 3.
7. Walk storyline 4 → fix → contextual review teaching.
8. Write and wire the Planning Guide; print stylesheet; link from onboarding, Help, horizons.
8b. Specify the deterministic "plan my week" session from the walk findings; close the
   agent's tool gaps; prototype the AI session over it; review before extending.
9. Full test pass, visual check including narrow screens, then ask Scott about deployment.

## Session log

### 2026-09-23 — session 1
- Inspected existing onboarding, guidance, and guide surfaces (table above).
- Cut `claude/onboarding-program` from `origin/main` ca075d26; recorded this plan.
- Cleared the demo household's work (15 tasks, 2 routines, planning sessions) into
  `demo_backup_20260923_*` tables, RLS enabled. Household, 4 members, 8 calendar events kept.
- **Walked storyline 1 end to end with Scott** on a `vite preview` build at :5199.
  14 entries logged (S1-01 … S1-14).
- **Passed:** adding a dated event writes a calendar event, not a task; Week reads as
  "my week"; placing inbox items to today / flexible week / a named day "all made sense";
  completing a routine occurrence leaves tomorrow's alone; a day added to a week-committed
  task keeps the week commitment; un-completing is safe.
- **Open, in build order:** S1-11 one-click Today · S1-07 capture with a destination ·
  S1-09 Inbox triage → existing `RescheduleGrid` with day loads · S1-12 focus the detail
  pane on open · S1-13 the pane must state the item's own date · S1-05a the nav ladder
  breaks between Week and Month · S1-01 the entry paths themselves.
- **Direction update (mid-session):** onboarding gains optional AI-guided sessions on
  the user's own data; deterministic guide stays equal; don't build the agent yet.
  Inspected the assistant and recorded the blocking tool gaps.
- **Fix batch 1 shipped on the branch:** S1-11 (Planner reaches Today in one click),
  S1-13 (`taskWhen` — the pane states day *and* the commitments around it),
  S1-12 (pane takes focus and names itself on open), S1-07 (capture confirms where it
  went, with a link there), S1-09 (Inbox triage now uses the shared `RescheduleGrid`
  with day-load bars). 12 new tests; full suite 6690 passed, 1 pre-existing collection
  failure in `connectors/` (its own node_modules, unrelated).
- **Storyline 2 walked through the cascade.** 13 entries (S2-01 … S2-13), including
  one blocker: a goal's own page could not create a step, so the creator of the app
  could not move work from a goal into a week.
- **Fixed on the branch:** goal-aware detail page (Steps, goal_task_id, Period, status
  Active/Completed/Archived, dated steps with a push control); the silent month jump
  removed in favour of an explicit neighbour link; "Back to tasks" → "Back"; the week's
  list now names the goal each row serves.
- **Verified in data, not just on screen:** a step pushed to This Week keeps
  `month_start`, `goal_task_id`, and BOTH `task_commitments` rows (month + week).
- **Open and notable:** S2-08 false empty states on load (raised to high — likely the
  real cause of the month-page wandering) · S2-10 planning pages open a full page while
  Today/Week open the pane · S2-01 a review should expand commitments · S2-05a the
  ladder breaking between Week and Month · S1-15 parked, treatment rejected.
### 2026-09-24 — bounded repair, storyline 2 restarted
- Scott restarted storyline 2 on a stable example: October goal "Take Kaleb to an
  Islanders game in DC" with "Research games dates and tickets" and "Buy game tickets".
  Both left deliberately with no week and no day.
- **Fixed + verified:** S2-16 (the viewed period now lives in `?start=`, so Back from a
  goal returns to October) · S2-17 (new `PlanWeekMenu` — the weeks of the period in
  front of you, plus "Another week…"; a chosen week leaves the task undated and keeps
  both its month commitment and its goal link, confirmed in `task_commitments` on a
  scratch task that was then deleted; reachable from Week's list and Shelves' Month tab).
- **Correction:** automatic month navigation is NOT resolved. Only the data-dependent
  jump was removed; the time-based advance (month ≤6 days left, season ≤14) still fires.
- **Open, decided but not built:** S2-18 — a goal's Shelves must show its own period by
  reusing the Month page's Shelves. Needs the Shelves block extracted out of
  `PeriodPlanPage` and `ReferenceLists` taught to host it on a goal route. See the log
  entry for the full approach and why it did not fit this batch.
- **Logged for later, not to be redesigned now:** S2-19 the life-area gate interrupting
  a week choice.
- **Resume at:** S2-18, then storyline 2 steps 2–6 on the stable example.

### 2026-09-24 — Codex takes over the walkthrough
- Codex now owns clicking and input, at Scott's request. Its coverage record is
  [`2026-09-24-autonomous-walkthrough.md`](./2026-09-24-autonomous-walkthrough.md) —
  **that file, not this one, is the current evidence register for what has been walked.**
- Three blockers were repaired this day, all one root cause — `planPlacement` filling a
  missing period stamp from `ctx.now` (`intentions.ts:175`): S2-20 (keep-period, two
  callers) and S3-01 (`pullDown`). Each fix names the period; each batch left a test
  documenting the trap rather than changing the default.
- **The defaulting itself is now the standing risk.** Three callers in one day is a
  pattern, not a coincidence. Recommend it be decided deliberately: either an unnamed
  stamp falls back to the task's own open commitment at that level, or it is refused
  outright. Not changed here — it affects every placement path and is Scott's call.
- **Correctness before redesign.** Year-to-season persistence is unverified (S3-02,
  `goal_id: null`); external calendar write is blocked and must stay untested (S3-07);
  a session opened over a full month still reports it empty (S3-04, save now proven
  safe, wording still wrong). The usability mockup Scott asked for is deliberately
  deferred behind these — a redesign built on an unpersisted relationship would encode
  the bug. Storyline 4 is part-covered only: Keep/Someday/Do-today/complete passed on
  Codex's own task; Drop and Done were never walked as branches.
- **Resume at:** S3-02 as a correctness investigation — find where, if anywhere, the
  year→season link is written — then the remaining correctness gaps, then the mockup
  and a re-walk. Do not build onboarding around workarounds.
