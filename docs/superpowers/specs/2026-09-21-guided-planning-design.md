# Guided planning: Year → Season → Month → Week → Day

Written 2026-09-21. Approved as a direction by Scott after walking prototype v4
("the whole chain makes sense, i like it"). The prototypes are in the vault at
`~/Documents/scotts-world/projects/symphony-os/briefs/2026-09-21-planning-prototype-v4.html`
(v3 covers the Month → Week → Day chain). The walk log is
`briefs/2026-09-21-walkthrough.md` (entries R2.11, P3.x, P4.x).

This replaces journey 4 ("Plan") of `2026-09-21-core-journeys-design.md`.
Settled decisions S1–S15 there still hold unless this document says otherwise.

## The contract (Scott's model, settled)

- **Year, season and month are persistent plans.** Each holds **goals**
  and, where it makes sense, **tasks**. Goals are an editable reference list
  and never become calendar entries. Tasks are concrete actions, and a month
  task can later be given a week or a day.
- **The lists are separate.** A lower level never swallows the one above it.
  You plan a level by looking at the level above, which sits beside you. When
  a task is added to a lower level it stays on its own list, which shows
  where it went ("in October", "on this week").
- **The week list is mostly unscheduled tasks you tick off.** A
  time-sensitive task may get a day. The list stays whole all week.
- **Daily planning picks from the week list.** A picked task appears on Today
  **and stays on the week list**, marked Today. Ticking it off shows in both
  places, and on its month list too.
- **Period review looks back at the actual previous list.** It asks what went
  well and what didn't. Each open item then gets a deliberate choice:
  - **Keep:** the same item carries into the new period, and the old period
    shows "carried".
  - **Keep, and add a next action** (goals only): the goal carries, and a
    new task toward it is created. The goal and its history stay.
  - **Done**
  - **Someday:** the item moves to the Someday page.
  - **Drop:** only that period's commitment ends. The item itself is kept.
- **Planning is guided, not required.** First use leads Year → Season →
  Month → Week → Day. Every save offers the next level down as an optional
  line: guidance only, and nothing moves. Experienced users start at any
  level. Urgent work still goes straight to Today.
- **Paper is equivalent to typing.** Bringing in a paper page fills the same
  draft. Each line is matched to items already on the draft, the level above
  and the previous period before anything new is created.
- **AI is optional.** It suggests, and only a tap adds.
- **Routines stay as they are now** (Scott, 2026-09-21: "Keep as now").
- **No counts or scores** anywhere in planning.

## One session shape, every level

`Look back at <previous> · Plan <period> · Save`, with the level above on
the right the whole time.

1. **Look back.** It shows the previous period's actual list: "Finished"
   (goals and tasks), then "Still open", with the verdicts above. There are
   two short notes, *What went well?* and *What didn't?* This step is
   skipped (the strip says "Nothing to look back at") when the previous
   period has no list.
2. **Plan.** It shows the period's **Goals** (with an optional "for <parent
   goal>") and its **Tasks** (with an optional "toward <this period's
   goal>"). Kept items arrive in the draft already, labelled "kept from
   <previous>". The rail above holds the parent level's goals and, for
   Week, the month's tasks with **+ Add to this week**.
3. **Save.** "Here's the plan for <period>" lists every item with where it
   lands. Nothing is written before this. Save writes everything at once and
   returns to the period's normal page, which shows "Planned <date>" and the
   optional line "Plan <next level> →".

**Close · keep my draft** is always available. The draft is kept for this
user and period, and the page shows "Continue planning <period>".

## Mapping to the existing code

(Verified against origin/main `7ec16913` by read-only exploration. Items
marked *verify* must be confirmed before the phase that uses them.)

| Need | Existing piece | Change |
|---|---|---|
| Year / Season / Month pages | `PeriodPlanPage` (`src/apps/plan`), levels year/season/month | Add a planning session mode; split each page into Goals and Tasks sections |
| Goals at month/season | `tasks.is_goal`, steps via `tasks.goal_task_id` | Show goals in their own section; the "toward" link = `goal_task_id` |
| Year goals | `goals` table (`year`, `area_id`) | Year session writes `goals` rows |
| Keep (month/season) | `keepForward` → `planKeep` (`intentions.ts:254`), same id, commitment `carried` | Reuse as is |
| Keep (week) | `task_commitments` supports `week`; `planKeep` does not | **Extend `planKeep` to the week level** |
| Keep (year) | Creates a new `goals` row and copies only area, name and context | Copy notes and strategy too, and record the link to last year's goal (*verify* schema; likely a `carried_from` column) |
| Keep + next action | goal keep + `addTask` with `goalTaskId` | New combined action |
| Drop | `PlanRow` "Drop" | *verify* it ends the commitment (`removed`) rather than deleting the task; fix if not |
| Someday | `bucket='someday'`, `/someday` page (Batch A) | Reuse |
| Reflection notes | `planning_sessions` (horizon, period_token, notes); read, never written today | **Write one row per saved session** (notes = went well / didn't); it also answers "Planned <date>" |
| "Planned <date>" | none | Read from `planning_sessions` |
| Week list | Week commitments (`bucket='week'`/`week_start`); today they surface only in the Choose tasks panel ("To plan") | **Add "This week's list" to the Week Journal**, showing done items struck; the panel reads the same list |
| Add to this week | Month rows' "Take it into this week" | Reuse, placed in the week session's rail |
| Pick for today | Choose tasks panel (`DayPlanPanel`), `chooseTaskDay` / S4 "Today" = date + focus | Unchanged. Dating a task does not remove its week commitment (`intentions.ts:139`); the row stays, marked Today |
| Paper | `parse-page` + `PageReviewSheet` (commits directly) | Route its lines into the session **draft**, with matching; a direct commit is still available outside a session |
| Goals reference | none | **◎ Goals** drawer in `PlanNavigation` (from #46): 2026, the current season, the current month |
| Guidance | Today nudges exist for other things | Nudges for first use and new periods; first-time hints dismissible per user |

## Phases (one PR each)

1. **Month planning session.**
   - Session mode on `PeriodPlanPage` for the month: look back, plan, save.
   - Goals and Tasks sections on the month page.
   - Keep, Keep + next action, Done, Someday, Drop. Verify Drop first.
   - A `planning_sessions` row is written on Save; the page shows "Planned
     <date>".
   - The draft is kept on Close.
2. **Week list and daily picking.** *Shipped 2026-09-21 (plan:
   `docs/superpowers/plans/2026-09-21-guided-planning-phase-2-week.md`).*
   - The week session: look back at last week, with Keep extended to the
     week level.
   - "This week's list" on the Journal, keeping ticked items visible.
   - The week session's rail shows the month with "+ Add to this week".
   - Choose tasks on Today reads the week list, and picked rows stay marked.
   - As built: one selector, `weekListTasks` (`src/lib/planning/weekList.ts`),
     defines "on this week's list" for the Week page, Choose tasks and the
     session (records-aware; tasks only; a row picked for today or given a
     day stays). The month beside a week is the month containing the week's
     fourth day. A saved week session is a `planning_sessions` row with
     horizon `weekly` and token `YYYY-M-D` of the week's first day. Month and
     week share one session host (`usePlanSessionHost`). A new week task may
     take a day; it is created on the week and then dated, so it is on both.
3. **Season and Year sessions.** The same shape, with the Year Keep fix.
   Year's look-back is skipped when last year has no goals.
   *Shipped 2026-09-21 (plan:
   `docs/superpowers/plans/2026-09-21-guided-planning-phase-3-season-year.md`).*
   - As built: one parameterised session block on `PeriodPlanPage` hosts
     month, season and year. The season looks back by season range and plans
     with the year's goals beside it (reference only; nothing is taken down
     from a year). The year session holds goals only: verdicts are **Keep ·
     Done · Drop** (no next action, no Someday at the year); **Drop archives
     the goal** (`status: 'archived'`), never deletes; Keep creates next
     year's goal in one insert carrying notes, strategy, area and context and
     records `goals.carried_from` (new nullable column, migration
     `2026-09-22_goals_carried_from.sql`). Tokens agree with the cadence
     nudge: `seasonal` = `seasonToken(start)` (`2026-fall`), `annual` = the
     year (`2027`). The year rail on the season page hides archived goals.
4. **Guidance and reference.**
   - Today nudges: first use ("start with the year"), a new season, a new
     month, a new week.
   - The "Plan <next> →" line after every save.
   - Dismissible first-time hints.
   - The ◎ Goals drawer.
   - Paper import into the draft, with matching.
   *Shipped 2026-09-21 (plan:
   `docs/superpowers/plans/2026-09-21-guided-planning-phase-4-guidance.md`).*
   - As built: one pure module (`src/lib/planning/nudges.ts`) decides the
     single nudge (first use → "Start with the year"; then year from Nov 20
     for next year / Jan 1–14, season ±14 days around a boundary, month last
     6 / first 7 days, week Sat–Tue), reading the household's saved sessions
     and a per-user dismissal (`symphony.planNudge.dismissed.<uid>`). Every
     post-save banner is one `PlanNextLine` (a text link plus "optional").
     Three first-time hints (`symphony.hint.<name>.<uid>`). ◎ Goals is one
     sheet from the Plan navigation at every width (year, current season,
     current month goals; a desktop pinned panel is a follow-up). A paper
     page can join the draft of the period its altitude plans ("Add to the
     plan I'm writing"), matched with `findLikelyDuplicate` against the
     draft, the level above, the previous period and the current list; the
     open session re-reads the draft on `symphony:plan-draft-changed`. Known
     gap: a page whose every line joins the draft files no attachment row
     (the attachment insert needs a created entity).
5. **Onboarding.** `docs/onboarding.md` gains the planning chain as its
   guided path. Walk it with `/walkthrough` on the wiped demo account.

## Testing

- Unit tests:
  - Each verdict writes the right commitment state: carried, done, Someday,
    removed with the item kept.
  - Keep + next action keeps the goal and creates one linked task.
  - Save writes nothing until pressed and writes everything once.
  - Paper matching never creates a second copy of an item already on the
    draft, the level above or the previous period.
  - Picking for today keeps the week commitment; ticking completes the
    item everywhere.
- Walk each phase on the demo account, at desktop width and 390px.
- A real-account read (Scott's, read-only) confirms that routines and
  existing backlog do not break the new sections, since routines stay as
  they are.

## Open items

- **Drop semantics** (Phase 1 *verify*).
- ~~The Year Keep schema~~ **Settled (Phase 3):** `goals.carried_from`
  (nullable, migration 2026-09-22).
- ~~Household sessions~~ **Settled (Scott, 2026-09-21: "yes agreed"):** a
  period is planned once per household for Family items. Each person's
  private (Work/Personal) items are visible only to them, in the same
  session.
