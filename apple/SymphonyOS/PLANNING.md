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
- **Order** (2026-11-08): press, hold and drag a line onto another, or Move up / Move down in its day menu (and VoiceOver's actions). `PlanWriter.reorder` is the web's `reorderTasksToIndex`: usually one write at the midpoint; `sort_order` is sent only when `sortOrderDirty`.
- **No day** (the Week list's Day menu, 2026-11-07): `bucket='week'`, `scheduled_for` cleared, `week_start`, and an open `week` commitment for that week.
- **This week**: `bucket='week'`, `week_start`, and an open `week` commitment.
- **Someday** (Inbox triage): every open commitment → `removed`, then `bucket='someday'`.
- **The write line** on Month, Season and Week ("Write a November goal", "Write a task for this week"): a new task with the level's `bucket` and period stamp, scope from the life-area lens, and one open commitment. No `goal_task_id`, no `source_id`. On Year it writes a `goals` row. The write line still makes no `source_id`; the walk (below) is the one writer that does.
- **Review** (last week's leftovers):
  - Next week: old commitment → `carried`, plus a new open commitment.
  - Someday: that week's commitment → `removed`; `bucket='someday'` (period stamps cleared) only if no other open commitment holds the task.
  - Let go (as the web, "not ever"): every open commitment → `removed`, `bucket='someday'`, `dismissed_at` set. A task with `dismissed_at` is on no planning list. Undo clears it, and so does any later placement (a day, today, this week, next week, the task detail's date or bucket other than Someday/Inbox), except on a school paper (`category='paper'`). The rule is `SymphonyTask.bringBackIfLetGo()`, called by PlanWriter and TaskViewModel.
  - Done: complete the task.

The Week is one list (2026-11-07, as the web): everything on the week and everything dated in it, in the shared order (`tasks.sort_order`, as the web's Week and Today; never-ordered last, oldest first), a day as its mark ("Wed", "Today"), never a time (`PlanSnapshot.weekLines`). A goal or parent on the week shows its open steps instead (`stepsInstead`). Routines are on Today, on their days; the By day view shows one only when it is tagged Show on the week (`routines.show_on_week`, a web switch; read-only here) or chosen for that day (2026-11-08). Events are on the week's calendar fold. The day-by-day cards are the optional view (`planner.week.layout`). Today's chooser reads the same list, in the same order: Sometime this week, then Later this week. Every sheet is named ("Month · Nov 1 – 30 / November goals").

Nothing moves an item from one list above the week onto another (paper-style horizons, 2026-11-04). The sheet above (Month ← season, Season ← year goals, Year ← last year's open goals, Week ← month) and this period's calendar fold out beside the page for reading only (`Views/Planner/PaperFoldView.swift`). Open or folded is remembered per horizon in `planner.unfolded.<horizon>` and `planner.unfolded.<horizon>.calendar`; the paper sounds' mute is `planner.paperSound`.
- **Choose a routine occurrence**: `planned_on` on that day's instance. For a flexible weekly routine it also sets `deferred_to` to local noon. The routine row is never written.

Period stamps are pushed only after a placement change (`placementDirty`). So an ordinary edit never nulls a placement made on the web.

## The walk (`Walk/`, the light edition's first run)

A walk down the mountain from the year to the first thing today. The core (`Walk/Core`) is pure and tested; the views only draw `WalkLayout` and send events to `WalkModel`.

**What it writes** (`Walk/Data/WalkWriter.swift`), all `context = "personal"`, through `PlanWriter` and the sync queue:
- Year: a `goals` row with its life area (`area_id`).
- Season: a plain task, bucket `quarter`, `season_start`; `goal_id` → the year goal.
- Month: a plain task, bucket `month`, `month_start`; `source_id` → the season task, `goal_id` copied from it.
- Week: a task on its day, or on the week; `source_id` → the month task, `goal_id` copied.
- First thing today: a `task_focus` row.
- A life area is a `goal_areas` row, saved only once something is planted on it; an existing personal area with the same name is reused.
- Never sent: `is_goal`, `goal_task_id`, `supports_goal_task_id`.

**The three link columns** `goal_id`, `source_id` and `area_id` are sent only when the phone set them: a task sends all three (nulls included) when `linksDirty`, a goal sends `area_id` when `areaDirty`. Rows pulled from the server have both flags off, so an ordinary edit never overwrites a link made on the web.

**Parents first.** A row whose sent links name a parent whose insert is still queued waits for it; a `task_focus` row waits for its task the same way. A child stops waiting once the parent's insert has failed 10 times. A parent is lost only when the server refuses the child with a foreign-key error (23503) and the parent is neither on the phone nor queued: that link is cleared and the null is sent.

**When it opens.** By itself only in a household that is light only, with no goals, after the first sync has finished. A saved walk in progress resumes at once, and "Walk the mountain again" (Settings) opens at once when the household row is already on the phone; neither waits for the sync. It never starts by itself in a full household. A replay starts with nothing counted as planted.

**Saved position.** In `UserDefaults` under `walk.position.<user id>` (`WalkPositionStore`), saved from the moment a depth is chosen. Undo lives in memory only and does not survive a relaunch.

**Behaviour a change must keep:**
- Letting go while speaking waits for the last words: the orb is `finishing` until the recogniser ends or `WalkOrb.finishMs` (1 s) passes.
- The walk listens on the phone only. Where on-device recognition is missing, holding opens typing.
- A first empty hold shows a quiet note; a second in a row opens typing. Refused or unavailable speech opens typing, and every hold for the rest of that walk types instead.
- "Walk another one down" (`.walkAnother`) starts clean: no undo, examples, note, selection or open post carried over.
- The Year camera stop is −495 (`WalkArt`), not the mockup's −553, so the peak labels clear the orb.
- When examples are short of room, your own flags on that post fold to one line carrying "+n"; at least one example always shows.
- On a crowded ridge (six or more columns) one post is open at a time, and its banners narrow to the gap between its neighbours (never below 44 pt).
- Sounds are synthesized placeholders until the recordings land in `Resources/WalkSounds`. They are silent while the walk's own listening holds the audio session; haptics always play, sound off or not.
- The ending's rows are today's own personal tasks (planted by the walk or not) and exist only on step 6.

**Accessibility.** The light is one VoiceOver button (`walk.orb`): a double-tap opens or closes the points, and each compass point is a custom action, so "Type it" plants without a press and hold. Flags that take no tap (`Banner.taps`, which agrees with the reducer) and peaks that take none (`Label.tappable`) read as text; a peak that is kept (ground) or focused (Year) carries the selected trait (`Label.selected`). The flag's words are announced once, as the person lets go. The scene is hidden from VoiceOver under the raised ending sheet; with it down the heading is read first. With Reduce Motion the camera cross-fades in 0.25 s instead of gliding 1.4 s, banners do not flutter, the light does not breathe, and the live flag and the ending sheet arrive in the same 0.25 s.

**Other screens.** The 390 × 844 stage scales to fit and letterboxes in `#00106e`; there is no Duo or landscape layout. With `-HalfOpen laptop` the half-open display covers the walk. The picture's pale edge margins (left and bottom) are painted over by `scripts/repair-walk-overlook-edges.swift`; run it again on any new picture.

Not designed yet:
- On the Duo's inside screen the stage is letterboxed with navy bars, which show seams beside the stage's lighter sky and its rocks.
- There the system status column overlaps the raised ending sheet's top-right corner.
- The walk stays reachable by VoiceOver under the half-open display.

**Launch arguments** (Debug, with `-SymphonyDemo`; add `-SymphonyLight` for the light edition):
- `-SymphonyWalk`: open the walk over an empty store.
- `-SymphonyWalkStep N` (0…6): open at step N over the mockup's preview plan.
- `-SymphonyWalkOrb a,b,…`: drive the orb after opening: `ground`, `open`, `hold`, `speak` (a stand-in listener says "Pick up the tile samples"), `type`, `select`, `undo`, `next`.
- `-SymphonyWalkExamples`: examples on for the step.
- `-SymphonyWalkSheet up`: on step 6, the ending sheet raised.

`SymphonyOSUITests/WalkUITests` taps through a quick start and a replay; nothing is typed or spoken.

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
