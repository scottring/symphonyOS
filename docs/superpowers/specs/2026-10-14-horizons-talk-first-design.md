# Symphony v2, stage 5: Month, Season and Year

2026-10-14. Approved ("ship it") mockup: https://claude.ai/artifact/AbSCFssPqYyGC61o7vBu2d
(six frames).

## What we are doing and why

Month, Season and Year are lists to look at, and each is planned in a
conversation that comes on a schedule and ends in one change card.

## Data, as it is

Year goals are `goals` rows (`year`, `status`, `carriedFrom`). Season and month
goals are `tasks` committed to a period (`task_commitments`: level, periodStart,
status open/done/carried/removed). A month item serves a season item
(`source_id`); a season item serves a year goal (`goal_id`). Seasons come from
`households.seasons` (`src/lib/cadence/seasons.ts`). The three routes render
`ConstellationPage`.

## The pages (frame "After 1")

- **Header:** the period, then one rule-based sentence ("11 open, 5 done. Four
  serve a Fall goal.").
- **Rows:** no ⋯ menu and no quick buttons. Tapping a month or season goal
  opens its task panel, which offers what the menu did: done, delete, day,
  serves which goal ("Part of a goal"), and — opened from a horizon page —
  "Move to {next period}" and "Remove from {period}". Year goals expand in
  place with Done and Archive, as now.
- **Amended 2026-10-16 (Scott):** open rows carry quick triage again — month
  and season goals: Done · Move to {next} · Someday · Remove from {period};
  year goals: Done · Archive. Hover/focus with a mouse, always on touch. The
  level-above toggle names its list ("Show Fall list") and, open on wide
  screens, carries its own "Hide Fall list" in the panel heading.
- **Done folds** into one line ("5 done · … Show").
- The parent list beside, and each goal's "This week" line, stay.

## Review by hand (amended 2026-10-17, Scott)

Beside the conversation, every horizon — Week, Month, Season, Year — offers
"Review {period}": the period's open lines with the rows' verbs always shown
(Done · Move to {next} · Someday · Remove from {period}; a year goal: Done ·
Move to {next year} · Archive), what was decided, "What went well?" / "What
didn't?", and Finish. Each verb saves at once with Undo; Finish stores
`notes.periodReview` on the reviewed period's `planning_sessions` row — never
`savedAt`, so a review never marks a period planned. Week lines are tasks
committed to the week or given a day in it, plus each routine occurrence so
far that is not the week's daily rhythm (every day / every weekday, unless
"Show daily" is on): Done or Skip.
Home's "Look back" opens the previous month's or season's review.
(`PeriodReview.tsx`, `periodReview.ts`, `usePeriodReview.ts`.)

## Plan by hand (amended 2026-10-17, Scott)

Beside "Review {period}", every horizon not yet over offers "Plan {period}"
(`?plan=1`): the talk's steps on one page, no conversation. 1. Left from
{last period}: each line still open there — Bring into {period} · Done ·
Someday · Let go (a year goal: Bring into {year}, a copy with `carriedFrom` ·
Done · Let go = Archive). 2. For {the level above} (not on Year): each open
goal above, what is under it here already, and "+ Add". 3. Anything else: the
list so far and "+ Add". 4. Week only: Give them a day — each open task with no
day, one button per remaining day. Then "I'm happy with {period}" — the same
`savedAt` mark as the page's link — and the next horizon down (Year → Season →
Month → Week → Today). Every verb and add saves at once with Undo. A finished
review's onward step is "Plan {next period} →"; Home's open "Plan …" steps
open it. (`PeriodPlan.tsx`.)

## The schedule (frame "After 2")

A quiet chip invites the conversation, on that horizon's page (the bar chip)
and on Today (in the header line):

| Talk | Shows | Until |
|---|---|---|
| Plan {Month} | 3 days before the month starts | day 7 of the month |
| Plan {Season} | 7 days before the season starts (seasons from `households.seasons`) | day 14 of the season |
| Plan {Year} | Dec 25 | Jan 14 |

It shows only while the coming period's list is still empty. "Later" hides it
until tomorrow; "Not this time" until the next period (both per browser,
localStorage). When several are due, Today offers one at a time: Year, then
Season, then Month. The pages' own bar chip outside the window reads "Plan this
{period} with me", as now. Month, Season and Year are personal: the wall never
shows them.

## The change card learns goals (frames "After 3–5")

| Op | Fields | Card | Writes |
|---|---|---|---|
| `plan_add` | level, period_start, title, parent_id? | NEW · Book the cabin → November, for Plan winter vacation | year: `addGoal`; season/month: `addTask` committed to the period, linked to its parent |
| `plan_carry` | item_id, to_period_start, new_title? | CARRY · Plan sabbatical → November (MOVE when it skips ahead) | task: `keepForward` (moves the row; the old commitment reads carried); year goal: a copy with `carriedFrom`; rename if new_title |
| `plan_let_go` | item_id | LET GO · Toss umbrella | task: `dropCommitment`; year goal: archived |
| `plan_done` | item_id | DONE (MET for a year goal) | task: done like a tick; year goal: completed |

Month and season goals are tasks, so `merge` and `someday` (LATER) reuse the
task ops. Rows group under the list they change ("November", "October",
"Fall"). All or nothing, one Undo, stale refusal on `updated_at`.

## Symphony's side

- `symphony_read_plan(level, period_start)`: this period's items (open / done,
  parent, how many week tasks moved them), the next period's list, and the
  parent level's list, with ids.
- Prompt: "Plan {period}" reads first, says the period back (what moved, what
  didn't), asks what the next one is for, points out overlaps and duplicates,
  and ends in one card. It writes down only what the person says; it never
  invents goals. Seasons are a brainstorm: everything said goes on the list in
  the person's words. Year: a handful, looking back at the year before.

## Retired

The Plan October steps, planning-meeting mode and step bar, the one-card deck,
the "Choose Fall's goals" and refining controls, goal-quality hints, the
getting-started path chooser, the guide bar, and the "Build my plan" voice
session — deleted where nothing still in use depends on them.

## Testing

Unit tests for the sentence, schedule windows, plan-op validation and apply +
Undo, the card wording; page tests for the removed controls and the fold; a
browser pass on Scott's real lists before shipping.
