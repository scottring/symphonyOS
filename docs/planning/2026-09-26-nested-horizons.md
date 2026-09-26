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

**Verified (automated):**
- The full suite passes (689 files, 7289 tests), as do tsc, eslint (0 errors)
  and the build.
- New tests:
  - Break into next actions converts the same row and adds no new row; the
    new goal opens with focus in its next-action box; Undo works.
  - A one-step task still goes straight to a week.
  - The "Open week" toast navigates to the right week.
  - The Month page's week list shows the Week page's count, never counts
    goals, and opens the week; the season lists months and the year lists
    seasons.
  - `nextLevelChoices` has its own unit tests.
- The previous branch's tests (month before a season, `goalConversion`) still
  pass.

**Not verified:**
- **Live in the running app.** After the reboot the browser is signed out of
  the demo at `localhost:5199`, and Claude cannot sign in. It needs Scott to
  sign in there first.
- Narrow-screen rendering of the new list.

## Open

- A three-level chain (a next action under a next action) stays out, as
  designed. Depth comes from the horizons (a season goal → a month goal → next
  actions), not from nesting tasks.
- The Week page could name the parent more prominently when planning days.
  Today it is a quiet "for …" line.
