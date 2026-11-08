# Planning on the iPhone app

The phone follows the web's one-enduring-action model
(`supabase/migrations/2026-09-21_one_enduring_action.sql` on main).

## What it reads

| Question | Source |
|---|---|
| Which week/month/season holds a task | `task_commitments` (status `open`/`done`); a task with none falls back to the `tasks` cache (`bucket` + `week_start`/`month_start`/`season_start`) |
| Chosen for my day | my own `task_focus` row; `tasks.planned_on` only when a task has no focus rows |
| Routine due on a date | `RoutineRules` — a port of `matchesRecurrenceForDate` + `resolveRoutine` |
| Routine chosen for a date | `actionable_instances.planned_on` |
| Seasons | `households.seasons`, else Mar/Jun/Sep/Dec 1 |
| Year goals | `goals` |

Weeks start on **Sunday**, as the database triggers do.

## What it writes (`Services/Planning/PlanWriter.swift`)

- **Today**: `bucket='timed'`, `scheduled_for` = midnight, `is_all_day`, plus my `task_focus` row.
- **A week task onto a day**: the same, with no commitment change, so the week stays open.
- **No day** (the Week list's Day menu, 2026-11-07): `bucket='week'`, `scheduled_for` cleared, `week_start`, and an open `week` commitment for that week.
- **This week**: `bucket='week'`, `week_start`, and an open `week` commitment.
- **Someday** (Inbox triage): every open commitment → `removed`, then `bucket='someday'`.
- **The write line** on Month, Season and Week ("Write a November goal", "Write a task for this week"): a new task with the level's `bucket` and period stamp, scope from the life-area lens, and one open commitment. No `goal_task_id`, no `source_id`. On Year it writes a `goals` row.
- **Review** (last week's leftovers):
  - Next week: old commitment → `carried`, plus a new open commitment.
  - Someday: that week's commitment → `removed`; `bucket='someday'` (period stamps cleared) only if no other open commitment holds the task.
  - Let go (as the web, "not ever"): every open commitment → `removed`, `bucket='someday'`, `dismissed_at` set. A task with `dismissed_at` is on no planning list. Undo clears it, and so does any later placement (a day, today, this week, next week, the task detail's date or bucket other than Someday/Inbox), except on a school paper (`category='paper'`). The rule is `SymphonyTask.bringBackIfLetGo()`, called by PlanWriter and TaskViewModel.
  - Done: complete the task.

The Week is one list (2026-11-07, as the web): everything on the week and everything dated in it, in the order written, a day as its mark ("Wed", "Today"), never a time (`PlanSnapshot.weekLines`). A goal or parent on the week shows its open steps instead (`stepsInstead`). Routines are on Today; events are on the week's calendar fold. The day-by-day cards are the optional view (`planner.week.layout`). Today's chooser reads the same list: Sometime this week, then Later this week. Every sheet is named ("Month · Nov 1 – 30 / November goals").

Nothing moves an item from one list above the week onto another (paper-style horizons, 2026-11-04). The sheet above (Month ← season, Season ← year goals, Year ← last year's open goals, Week ← month) and this period's calendar fold out beside the page for reading only (`Views/Planner/PaperFoldView.swift`). Open or folded is remembered per horizon in `planner.unfolded.<horizon>` and `planner.unfolded.<horizon>.calendar`; the paper sounds' mute is `planner.paperSound`.
- **Choose a routine occurrence**: `planned_on` on that day's instance. For a flexible weekly routine it also sets `deferred_to` to local noon. The routine row is never written.

Period stamps are pushed only after a placement change (`placementDirty`). So an ordinary edit never nulls a placement made on the web.

## Reviewing on the simulator

In a Debug build, launching with `-SymphonyDemo` gives you:
- an in-memory store with sample data;
- a local stand-in user;
- no sync.

`SymphonyOSUITests/PlannerScreensUITests` walks every screen with this data, at default and accessibility text sizes. It saves screenshots to `$TEST_RUNNER_SCREENSHOT_DIR`.

### Known limitation: the simulator stalls after text entry (2026-09-23)

On Xcode 27 with the iOS 27.0 simulator, after a test types into a text field, XCUITest's "wait for app to idle" times out. It waits 60 s at every later step.

What we know:
- Seen after typing into the capture bar and into the new goal's name.
- The app sits at 0% CPU during the stall, so it is not a render loop.
- Turning off the simulator keyboard's predictions and autocorrect doesn't help.
- The accessibility-size walk usually passes; the default-size walk usually stalls.

How to run it:
- Run with `-test-timeouts-enabled YES -default-test-execution-time-allowance 300` so a stall ends the run instead of hanging.
- Verify text-entry flows (capture bar, search, goal create/edit) on a real iPhone rather than rerunning the walk.
- Treat a stall here as a test-harness problem, not an app failure, unless a device check shows otherwise.
