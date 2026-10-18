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
- **This week**: `bucket='week'`, `week_start`, and an open `week` commitment.
- **Someday**: every open commitment → `removed`, then `bucket='someday'`.
- **Review**:
  - Keep: old commitment → `carried`, plus a new open commitment.
  - Drop: that week's commitment → `removed`.
  - Done: complete the task.
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
