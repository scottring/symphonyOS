# Nested horizons: outcomes above, next actions below

Agreed by Scott and Iris, 2026-09-26. Local branch `claude/nested-horizons`,
built on `claude/season-month-goal`. Not pushed, merged or deployed. No schema
change.

## The correction

Year, Season and Month mainly organize **outcomes**: goals, and the bigger
pieces of work. Week and Day organize **concrete next actions** and events.
A parent stays visible in its planning period while its actions are planned
into a week, a day or a time. The main move on a month is **Add a next action**
and **plan it into a week**, not pushing a whole broad item into a calendar
slot.

Hierarchy stays optional. A simple, one-step task is still planned straight
into a week or a day. Planning ahead still works, and no chain is mandatory.
This follows Best Laid Plans' nested horizons (sources Scott provided,
[episode 182](https://theshubox.com/2024/01/episode-182-nested-goals-explained.html)
and [episode 294](https://theshubox.com/2026/03/ep-294-lets-plan-the-week-together.html)):
concrete tasks are not banned at longer horizons.

Example: *Complete solo album* (a season goal) → *Finish writing a song* (a
month goal that supports it) → *Try chord progressions*, *Record a demo* (next
actions, planned into weeks). The song stays on the month while its actions sit
on the weeks.

## What already existed (reused, not rebuilt)

- **Parents:** season and month goals are `tasks` rows with `is_goal`. Next
  actions under them use `goal_task_id`, one level deep (`goalSteps.ts`). A
  month goal supports a season goal through `supports_goal_task_id`, and a
  season goal records its year goal on `goal_id`.
- **Placement:** a next action carries its own week or day commitment and
  keeps its month (`planPlacement`: moving down never closes a higher rung).
  Goals are never scheduled.
- **Week:** "This week's list" (`weekListTasks`) holds tasks only, never
  goals, and shows each action's goal ("for …"). The week planning session
  already speaks this language: "Keep, and add a next action" and "A next
  action is a new task toward the goal; the goal itself stays". It adds a
  next action under a month goal with `goalTaskId`, and never offers a goal
  itself into a week (`offerableFromAbove`).
- **Projects** exist in the data but have been hidden since 2026-09-02 ("GTD
  jargon"). This change does not bring the noun back; outcomes are goals.

## What this change adds

| Where | Change |
|---|---|
| Goal and next-action rows (Season, Month) | "+ Add a step" → **+ Add a next action**; the box reads "Add a next action"; screen readers hear "Show/Hide next actions under …" and "New next action for …". Counts read "No next actions yet". |
| Loose task rows (Season, Month) | **Break into next actions**, a visible, labelled link, only where `goalConversion` allows it. The SAME row becomes the goal that holds its next actions, stays on the list, opens, and puts the cursor in its next-action box. A toast says what happened ("… now holds its next actions — it is a goal on September"), with **Undo**. Nothing is reclassified unless someone presses it; imports are never converted in bulk. This replaces the "Make it a goal" row link from `claude/season-month-goal`. The task-details **Make it a goal** button, which explains why when a task cannot convert, is kept. |
| Timing control (Month, Season) | Choosing a week or a flexible weekend now confirms where the work went, with **Open week** ("Planned “Call the roofer” for September 13–19." → `/week?start=…`). |
| End of the Month page | **Plan work for a week**: each week of the month, how many items are on that week's own list (counted by `weekListTasks`, the Week page's selector, so the number matches where you land), and **Open week**. This closes the "Month → Week" finding. |
| End of the Season page | **Plan work for a month**: its months, with counts from `selectPeriodTasks` and **Open month**. |
| End of the Year page | **Plan a season**: its seasons, with **Open season**. |
| Month fold | "Already assigned · N" → **Planned into weeks · N** (on a season, **Planned into months**). "Assigned" now means people. |
| Section notes | Month goals: "…Add the next actions under each goal, then plan them into weeks." Month tasks: "Single actions for the month. Plan each into a week — or break a bigger one into next actions." Season wording matches. |

The previous branch's fixes are kept as they are: the month before a season in
"Into a month…", and `goalConversion` with its explained reasons.

## Accessibility and long lists

- Every new control is a real button with a specific name ("Open the week of
  September 13–19 — 2 on its list"), reachable by keyboard and touch. On a
  phone the Open buttons are at least 44px tall.
- After "Break into next actions", focus lands in the new goal's next-action
  box.
- The next-level list has at most six rows (the weeks of a month) and needs no
  cap. Long goal lists keep the existing bounds and filter (`goalListView`).

## Evidence

### Automated (harness and fixtures, not the live database)

- **Full suite** passes (689 files, 7295 tests), as do tsc (both configs),
  eslint (0 errors) and the build.
- **Page tests** (`PeriodPlanPage.test.tsx`, happy-dom):
  - Break into next actions converts the same row and adds no new one; the
    new goal opens with focus in its next-action box; Undo works.
  - A one-step task still goes straight to a week.
  - The "Open week" toast navigates to the right week.
  - The Month page's week list shows the Week page's own count and never
    counts goals; Season lists months and Year lists seasons.
- **Conversion against the fake database**
  (`useSupabaseTasks.planWrites.test.ts`, "goal conversion and its Undo
  preserve the row"):
  - `setGoal` writes `is_goal` only, in one row update, and adds no row.
  - The open and the carried season records, `assigned_to`/`assigned_to_all`,
    `goal_id`, notes, area and scope are identical after converting and after
    Undo.
  - A row planned into a week is refused, with nothing written.
- **Boundaries** (`nextLevel.test.ts`):
  - Year 2026 lists "Winter 2025–26 · Spring · Summer · Fall · Winter
    2026–27". This was a defect before the fix: two entries both read
    "Winter".
  - A Winter season's months read "December · January 2027 · February 2027".
  - December's last week is "Dec 27 – Jan 2", counted as the Week page counts
    it, including an item dated Jan 1.
  - A week shared by November and December shows the same count on both.

### Live acceptance on :5199 (2026-09-26)

Account confirmed before any write: `symphonygoals@gmail.com`
(`f9ff9f28-…`). Build: branch at `84771c00`. All fixtures were `QA-NH …` rows in
December 2026, created **through the UI** and deleted afterwards (4 rows).

- **Baseline:** before any write, the demo's 41 other tasks and their records
  were hashed. After cleanup the count and both hashes were **identical**, so
  none of Scott's imported plans were touched.

| Step | Observed live |
|---|---|
| Add "QA-NH Complete solo album" by keyboard in *Add a task for December* | one `POST tasks 201`; the row shows **Break into next actions** |
| Keyboard focus on *Break …*, then Enter | one `PATCH tasks {"is_goal":true}`; the row moves to Month goals; **focus lands in "New next action for …"**; toast: "…now holds its next actions — it is a goal on December. Add them below." with Undo |
| Type two next actions, Enter after each | two `POST tasks 201`; both under the goal (`goal_task_id` set), each with its December record; focus stays in the box |
| Plan *Try chord progressions* into Dec 13–19 | the life-area question appears first (existing rule for untagged items; the test goal had no area). Answered, it sent a `PATCH` plus a `POST task_commitments` week record, with December kept. The **parent stays on the month**; the action shows "→ December 13–19"; toast "Planned … for December 13–19." |
| The toast's **Open week** (second action) | lands on `/week?start=2026-12-13`. The Week list holds both actions, each showing its parent goal and "From December"; the parent itself is not a week item |
| Full reload of December | persisted: the parent is a goal; both actions read "Chosen for December 13–19"; header "1 goals · 2 tasks"; the weeks list reads "Dec 13 – 19 — 2 on its list", matching the Week page's "2 tasks on the week's list" |
| Keyboard Enter on "Open the week of Dec 27 – Jan 2" | lands on `/week?start=2026-12-27` (the year boundary) |
| Break into next actions → **Undo** on a second fixture | `PATCH {"is_goal":true}`, then `PATCH {"is_goal":false}`; the DB row is back to `is_goal=false` with its December record open |
| Year 2026, live | "Winter 2025–26 · Spring · Summer · Fall (this season) · Winter 2026–27" |
| 390px (same-origin iframe, signed in) | no horizontal scroll; all five Open week buttons 44px tall and on screen; the Break link is a 44px target; the goal title wraps, 157px wide; "+ Add a next action" is on screen |

**Not covered live:**
- A second account's view of shared next actions.
- Keyboard focus-ring painting. The harness (`outputs/plan-keyboard`) covers
  the goal list, not the new list at the bottom of the page.
- The fixture Chromium harness planned for this change was not built. Live
  acceptance became possible first and superseded it.

## Open

- A three-level chain (a next action under a next action) stays out, as
  designed. Depth comes from the horizons (a season goal → a month goal → next
  actions), not from nesting tasks.
- The Week page could name the parent more prominently when planning days.
  Today it is a quiet "for …" line.
