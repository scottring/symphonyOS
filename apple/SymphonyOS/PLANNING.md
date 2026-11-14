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
- First thing today: a `task_focus` row. One said on Today is a week task dated today; under a week flag it names that flag's month line (`source_id`) and goal, never the week task.
- Marking a first thing also dates that task today; when the mark leaves it, its earlier day comes back (within one session: a relaunch leaves it on today).
- A life area is a `goal_areas` row, saved only once something is planted on it; an existing personal area with the same name is reused.
- Never sent: `is_goal`, `goal_task_id`, `supports_goal_task_id`.

**The three link columns** `goal_id`, `source_id` and `area_id` are sent only when the phone set them: a task sends all three (nulls included) when `linksDirty`, a goal sends `area_id` when `areaDirty`. Rows pulled from the server have both flags off, so an ordinary edit never overwrites a link made on the web.

**Parents first.** A row whose sent links name a parent whose insert is still queued waits for it; a `task_focus` row waits for its task the same way. A child stops waiting once the parent's insert has failed 10 times. A parent is lost only when the server refuses the child with a foreign-key error (23503) and the parent is neither on the phone nor queued: that link is cleared and the null is sent.

**When it opens.** By itself only in a household that is light only, with no goals, after the first sync has finished. The first pull is reported (`SyncEngine.start` / `resync`, `onFirstPull`) as soon as it is in, before the realtime channels join, so the walk does not wait on them. A saved walk in progress resumes at launch in a light household only, at once, without waiting for the sync; in a full (or mixed, or not yet known) household it is left. "Walk the mountain again" (Settings) opens at once when the household row is already on the phone, and starts from the top. It never starts by itself in a full household. A replay starts with nothing counted as planted. A walk left with Leave for now (`WalkStatus.paused`) never reopens by itself, in any household; "Pick the walk back up" (Settings, above "Walk the mountain again", and one quiet line at the top of the light edition's Today, in `TodayView.topControls`) reopens it at the step it was on (`AppState.walkPaused`, `AppState.resumeWalk()`, `WalkEntry.decide(resume:)`); from then on it is a walk in progress again. "Walk the mountain again" over a paused walk starts from the top and clears the pause (`WalkEntry.clearsPause`). Sign-out forgets the pause the app was showing and any resume asked for, as it does a replay. When it opens, the keyboard is dismissed and the dock's capture sheet closes; Today's Tell and Add sheets, and the half-open display's Tell sheet, can still sit above it.

**Leaving it.** "Not now" on Welcome, "Go to Today" at the end, or, on every step after Welcome, "Leave for now" (the compass's lower-right point, "Your place is kept."): the walk closes onto Today with everything added kept; only the position is saved, as paused.

**Saved position.** In `UserDefaults` under `walk.position.<user id>` (`WalkPositionStore`), saved from the moment a depth is chosen. Undo lives in memory only and does not survive a relaunch. A Debug demo saves only to `DemoMode.walkStore`, emptied at launch.

**The controls say what they do** (2026-11-14). The copy teaches two things: hold the light to say it, tap the light for other choices. No instruction uses "plant", "flag", "peak", "ground", "ridge", "piece", "walk on" or "slide" (`WalkCopyTests.instructionsUsePlainWords`); the slide still works and is never mentioned.
- Welcome opens with its three choices showing (Quick start left, Plan my whole year right, Not now above), each with a second line (`Point.detail`); the hint reads "Choose how to start".
- The Next line (`WalkCopy.nextLine`, `WalkLayout.nextFrame`): text under the light's ring, 44 pt tall, naming where it goes ("Next: this winter", "Next: November", "Next: this week", "Next: today", "Finish", "Next: your goals", "Start with this one"; a tour names the next area, or "your next goal"); "Skip this step" at 70% while nothing is added. It sends exactly what the south point does (`WalkEvent.nextTapped`). The compass's points name what they do or where they go ("Back to this winter", "Ask about another goal", "Show examples", "Show my calendar on Today", "Leave for now").
- The open compass: the scene steps back under a navy veil (ground colour at 55%, `WalkState.showsVeil`), a tap on which closes it (`.veilTapped`); the top and bottom points' words sit above their discs; the hint ("Tap one, or tap the light to close") sits above the top point on a soft band of the ground colour.
- The light carries a microphone while holding would listen; once speech is off for the walk, a keyboard, and then a tap types and a hold opens the other choices (`WalkState.lightSymbol`).
- The hint is 15 pt on a bottom scrim (ground colour 0→80% over the last 120 pt). The ground's areas are outlined pills with a plus until kept, gold with a checkmark once kept, all at full opacity. Example flags carry "EXAMPLE · TAP TO USE" ("TAP TO USE" where narrow) inside their own frame.
- Known gap: a hint that wraps to two lines at 15 pt (the empty-step hint, "Nothing added yet…", "That’s as many as fit…", the speech-off hint, "Tap Next to start with this one…") has its second line in the bottom 34 pt (the home-indicator zone): under the 44-pt Next line below the ring there are 18 pt left before it, and moving the light up breaks the Year peak labels' 74-pt clearance (a 4-column lower row clears it by 1.5 pt). A folded stub still says "+n" (26 pt wide); "+n more" is on banners only.

**Behaviour a change must keep:**
- Letting go while speaking waits for the last words: the orb is `finishing` until the recogniser ends or `WalkOrb.finishMs` (1 s) passes. Anything the person does in that second (a tap on a flag or a peak, Undo, a compass point through VoiceOver) plants the flag first, under the parent shown when they let go, then takes effect (`WalkEvent.leavesAWaitingFlag`).
- The walk listens on the phone only. Where on-device recognition is missing, holding opens typing.
- A first empty hold shows a quiet note; a second in a row opens typing. Refused or unavailable speech opens typing; for the rest of that walk a tap on the light types and a hold opens the other choices (and leaves them open). A session that dies mid-hold with nothing heard opens typing with "Nothing came through" and does not switch speech off: the next hold listens again.
- A typed flag carries its words with return (`.typeSubmitted(text)`), so it is planted whether return or the field losing focus reaches the walk first.
- "Plan another goal down to today" (`.walkAnother`) starts clean: no undo, examples, note, selection or open post carried over.
- Undoing or pulling up the newest flag of a level hands "last planted" back to the newest one the person still has there, so the next step still links.
- Moving a year goal to another peak does not move the flags already under it (known gap).
- The Year camera stop is −495 (`WalkArt`), not the mockup's −553, so the peak labels clear the orb.
- When examples are short of room, your own flags on that post fold to one line carrying "+n"; at least one example always shows.
- On a crowded ridge (six or more columns) one post is open at a time, and its banners narrow to the gap between its neighbours (never below 44 pt).
- Posts are planted by hand (`WalkFooting.natural`, `Walk/Core/WalkFooting.swift`): a base up to 10 pt off its band line (neighbours at least 6 apart where the peak labels leave room), a bare pole of 18 to 34, a lean of up to 1.5°, each cloth up to 0.9° askew and 2.5 pt off the pole. It is fixed by identity (a hash of the post key or item id), never random, and the same on every step; a label moves with its peak's Year post.
- The hand only moves and turns what the ruled layout stacked: folds, counts and the open post never change. Where it would break a rule or pile one thing onto another, that post's hand shrinks toward level. `WalkFooting.level` is the contract's ruled geometry; the tests that pin the contract's numbers use it, and the generated-state sweep runs on both, measured on what is drawn.
- Sounds are synthesized placeholders until the recordings land in `Resources/WalkSounds`. They are silent while the walk's own listening holds the audio session; haptics always play, sound off or not.
- The ending's rows are today's own personal tasks (planted by the walk or not) and exist only on step 6.

**Accessibility.** The light is one VoiceOver button (`walk.orb`, "Hold and speak to add a goal. Double tap for other choices."): a double-tap opens or closes the points, and each compass point is a custom action, so "Type it" plants without a press and hold. A point's second line is its hint. The Next line is its own button (`walk.next`). Flags that take no tap (`Banner.taps`, which agrees with the reducer) and peaks that take none (`Label.tappable`) read as text; a peak that is kept (ground) or focused (Year) carries the selected trait (`Label.selected`). The flag's words are announced once (`WalkCopy.announcement`): as the person lets go, or when they arrive after an empty let-go, or as the flag is planted when the session had ended first. The scene is hidden from VoiceOver under the raised ending sheet; with it down the heading is read first. With Reduce Motion the camera cross-fades in 0.25 s instead of gliding 1.4 s, banners do not flutter, the light does not breathe, and the live flag and the ending sheet arrive in the same 0.25 s.

**Other screens.** The 390 × 844 stage scales to fit and letterboxes in `#00106e`; there is no Duo or landscape layout. With `-HalfOpen laptop` the half-open display covers the walk. The picture's pale edge margins (left and bottom) are painted over by `scripts/repair-walk-overlook-edges.swift`; run it again on any new picture, and re-run the layout's generated-state sweep (`WalkLayoutTests`) whenever a new picture (`WalkArt`) is added.

Not designed yet:
- On the Duo's inside screen the stage is letterboxed with navy bars, which show seams beside the stage's lighter sky and its rocks.
- There the system status column overlaps the raised ending sheet's top-right corner.
- The walk stays reachable by VoiceOver under the half-open display.

**Speech is shared with Tell.** `Dictation` (`Views/Capture/TellSheet.swift`) serves both. What Tell must keep: its record-only session (others ducked, the session let go on stop), `stop()` as a cancel, and recognition that may use the server when on-device is unsupported. The walk's instance sets `playsAlongside` (its sounds play while it listens) and `onDeviceOnly` (never a server: no on-device recogniser opens typing), and uses `finish()` and `onEnd`.

**Launch arguments** (Debug, with `-SymphonyDemo`; add `-SymphonyLight` for the light edition):
- `-SymphonyWalk`: open the walk over an empty store.
- `-SymphonyWalkStep N` (0…6): open at step N over the mockup's preview plan.
- `-SymphonyWalkOrb a,b,…`: drive the orb after opening: `ground`, `open`, `hold`, `speak` (a stand-in listener says "Pick up the tile samples"), `type`, `select`, `undo`, `next`, `leave` (Leave for now: onto Today with its waiting line).
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
