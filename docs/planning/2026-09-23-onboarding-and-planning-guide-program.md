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

**C. Regression tests** for every behaviour a walk proves wrong, plus tests for the new
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
- **Resume at:** fix batch 1 (above), then storyline 2.
