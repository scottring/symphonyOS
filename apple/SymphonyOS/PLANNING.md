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

**When it opens.** By itself only in a household that is light only, with no goals, after the first sync has finished. The first pull is reported (`SyncEngine.start` / `resync`, `onFirstPull`) as soon as it is in, before the realtime channels join, so the walk does not wait on them. A saved walk in progress resumes at launch in a light household only, at once, without waiting for the sync; in a full (or mixed, or not yet known) household it is never reopened by itself, but it counts as waiting (`WalkEntry.isWaiting`): Settings offers "Pick the walk back up" for it, as for a paused walk (a replay, or a picked-up walk, that the day turned on or the app was closed under keeps its way back). "Walk the mountain again" (Settings) opens at once when the household row is already on the phone, and starts from the top. It never starts by itself in a full household. A replay starts with nothing counted as planted. A walk left with Leave for now (`WalkStatus.paused`) never reopens by itself, in any household; "Pick the walk back up" (Settings, above "Walk the mountain again", and one quiet line at the top of the light edition's Today, in `TodayView.topControls`) reopens it at the step it was on (`AppState.walkPaused`, `AppState.resumeWalk()`, `WalkEntry.decide(resume:)`); from then on it is a walk in progress again. "Walk the mountain again" over a paused walk starts from the top and clears the pause (`WalkEntry.clearsPause`). Sign-out forgets the pause the app was showing and any resume asked for, as it does a replay; a replay or resume asked for while a walk is up is dropped (`WalkEntry.dropsRequests`). When it opens, the keyboard is dismissed and the dock's capture sheet closes; Today's Tell and Add sheets, and the half-open display's Tell sheet, can still sit above it.

**Leaving it.** "Not now" on Welcome, "Open Today" at the end, or, on every step after Welcome, "Leave for now" (the compass's upper-left point, "Your place is kept.", said only where it is: never in a walk-down, `WalkState.placeKept`): the walk closes onto Today with everything added kept; only the position is saved, as paused.

**Periods.** `WalkPeriods.pick`: the year from November on is next year; with fewer than three weeks of a season left the walk plans the coming season, and the month always lies inside the season it plans (the coming season's first month; in the current season this month, or the next once fewer than seven days are left). On 14 November: winter, December. The walk's writer files into these. The everyday pages open where the person is when they have goals there (see "The everyday screens", "Which period a page opens on"); a walk-down from a page showing the period that holds today plans inside it (`DailyPeriods.walking`, `WalkModel(periods:)`).

**Saved position.** In `UserDefaults` under `walk.position.<user id>` (`WalkPositionStore`), saved from the moment a depth is chosen. Undo lives in memory only and does not survive a relaunch. A Debug demo saves only to `DemoMode.walkStore`, emptied at launch.

**The controls** (hand-walk fixes, 2026-11-15/16; plan `docs/superpowers/plans/2026-11-15-iphone-light-hand-walk-fixes.md`, its "As built" lists every ruling). The copy teaches two things: hold the light to say it, tap it (or More) for other choices. No instruction uses "plant", "flag", "peak", "ground", "ridge", "piece", "walk on" or "slide" (`WalkCopyTests.instructionsUsePlainWords`).
- A top row on steps 1 to 5 (`WalkLayout+Controls.swift`, `WalkTopRow`): Back at the left, More in the middle (it opens the light's choices), Leave for now at the right. On a wider window Back and Leave for now go to the window's corners. Hidden while the keyboard is up (F10).
- The light in the middle (centre 195, 678): hold to speak. Its choices: Type it (left), Show examples, or on Today the calendar (right), Undo (top), each only while it would do something.
- One gold Next button at the foot, naming where it goes ("Next: this winter" … "Finish"); outlined "Skip this step" while nothing was added. Welcome keeps its own glowing line under the light (F8).
- Above the light at rest: one hint line; or the Undo pill for what was done on this step (F23); or, while a goal is chosen, its Move to row (the kept areas, scrolling sideways) with Remove always in sight (F11, F24).
- Typing (F22): the field at the foot, an X that closes it and plants nothing, a gold Add; the mountain's words are veiled.
- The lesson (taught once per walk, on the first step where holding the light answers): the light is taught by showing, in two beats that take turns until any touch puts the lesson away (`WalkLessonBeat`, run by `WalkLessonDriver` on the stage). Hold: a fingertip presses the light and stays, the light listens, a flag of sample words unfurls (`WalkCopy.teachSample`), the fingertip lifts; the line reads "Hold the light and say it." Tap: the fingertip taps and the light's own choices come out, shown but not offered; the line reads "Tap it for other choices." `WalkHintRow` draws the line, `WalkOrbView` the fingertip, the flag and the choices. With Reduce Motion, and once speech is off, nothing moves and the words stand alone (both lines; "Tap More and choose Type it." with speech off). VoiceOver hears the lines once, as an announcement.
- The foot's shade darkens the painting under the controls on steps 1 to 6, never on Welcome.

**Standing in one area** (`WalkState.standing`, `WalkLayout+Standing.swift`). Off the ground the walk always stands in one kept area (`focusArea`, settled after every event by `WalkState.settled`). One tall post in the middle: a small gold caret, the area's name on a gold-edged pill (two lines for a long name), on Season, Month and Week the goal above, then the step's own goals, newest lowest, up to four and "+n more". Every other area with something to show is a small side post: a pill with its name, a short pole, a coloured pennant per goal (four at most, else three and "+n"). A tap on a side post walks there. Goals with no kept area stand on a nameless side post that opens the paper (F12). A goal is planted in the area stood in (F2).

**The goal above shows only its own** (ruling F40, the owner's decision of 2026-11-16). On Season, Month and Week the post shows only the goals whose parent is the goal above shown. A tap on it goes round the area's goals above in planting order, then a "Not under a goal yet" stop for the area's goals hanging under none of them. While there is more than one stop the cloth carries "1 of 3". An empty goal above stays in the round (it is how a first goal is added under it) and says so: "Hold the light to add one." in the walk, "No fall goal under this yet" on a page (P48). Year, Today and Look back up are outside this rule (P50: on Today the cloth above is the task the question asks about).

**The layout's guarantees** (`WalkLayoutTests`, `Invariants.check`, swept over every generated state on a phone and three wider windows, both footings): nothing rises above the question's floor (y 282); no cloth, pill, caret, side post or control meets another; every control takes a touch 44 real points across (`WalkStage.touch`); every cloth's lines fit its width; what a tap does agrees with what VoiceOver says (`Banner.taps`, roles); the counts agree with the paper; the shape of F40. Lines are broken by the app itself (F39: `WalkLayout.breakLines`, the fonts' own widths in `WalkLayout+Lines.swift`), a cut line ends in "…" without a stray comma, and views draw the lines unscaled. The question block ends by y 278 (F30). Area names on the standing pill and the side pills are counted from DM Sans SemiBold's real capital widths and never shrunk by a view (P28, P30). A side pill has two sizes, chosen by the layout (P53, `WalkLayout.sidePillSet`): 9.5 pt, or 7.6 pt where the whole name does not fit at 9.5; a name that fits at neither is set at 7.6 and cut so it fills the pill by letters ("SIDE PRO…"). The ground's chips are still counted by estimate and shrink to 0.85 where a name is wider (a known gap).

**The paper** (`PlanPaper`, `PlanPaperView`, F7). A plain list of one level by area, raised over the mountain: "+n more", the nameless post, or a Look back up cloth opens it; "Show the mountain" closes it. A row walks to its goal and chooses it, or brings it into sight under its goal above; each row's VoiceOver hint says which. While it is up nothing under it takes a touch.

**The examples** (`WalkExampleLibrary`, `Walk/Core/Examples`; added 2026-11-17). All on the phone: nothing is sent anywhere. Each built-in area has twenty themes ("running" in Health), each with the words that find it and four lines for each of Year, Season, Month and Week: 1,920 lines. On Season, Month and Week the walk reads the goal above shown and the goals above it, nearest first (`WalkState.titlesAbove`): a goal that is one of a theme's own lines, or says one of its words, finds the theme, and the examples are that theme's lines for the step. With no goal above (Year) or none that finds a theme, they are the area's general examples (`WalkCopy.examples`, unchanged) and then one line from each theme in turn. A theme marked `~` in the text (weight, alcohol, a partner, kids, a debt and the like) is quiet: its lines are offered only when the person's own words find it, never unasked. Three show at once on Year and two below (`pageSize`). The choice on the light reads "Show examples"; while they show, "Other examples" brings the next page with one left, for up to three pages a showing, then it reads "Hide examples"; hiding keeps the page. Using the last example showing takes them down, and asking again brings the next ones. A few plain other names stand for a built-in area ("Family" is People: `WalkExampleLibrary.area`); any other area of the person's own still has none. `WalkExampleLibraryTests` holds the library to its shape: every line 44 characters at most, a Week line ending in a day the walk reads, no line twice in an area, no word in two themes.

**Look back up** (step 6, F6). The area stood in, top to bottom: one cloth per level holding a goal there, the newest on each with "+n more" on a line of its own; Today's cloth shows the first thing when it is one of today's. Cloths hang square, at least 36 high and 8 apart (each a 44-point touch, P36); a cloth opens its level's paper (F21). The other areas are side posts; the hint under the header says a tap walks there. The post's foot stands on land: the board's 556 where that is land, else the nearest land above (P37); on the phone the river's lower bend lifts it to 537.5 (P42). The ending sheet peeks at the foot.

**Behaviour a change must keep:**
- Letting go while speaking waits for the last words: the orb is `finishing` until the recogniser ends or `WalkOrb.finishMs` (1 s) passes. Anything the person does in that second (a tap on a flag or a peak, Undo, a compass point through VoiceOver) plants the flag first, under the parent shown when they let go, then takes effect (`WalkEvent.leavesAWaitingFlag`).
- The walk listens on the phone only. Whether it can is decided at the first real hold, never when the walk is made (ruling D23, `Dictation.onDeviceStart`): on-device support reported, the prompts as needed; none reported with Speech Recognition already decided, typing with no prompt; none reported and never asked, Speech Recognition is asked for, the support read again, and the microphone never asked for while it is still none. Unavailable opens typing, as before.
- The stage's words stop growing at extra large (`.dynamicTypeSize(...xLarge)` on the stage): its layout is fixed stage points.
- An area's name is broken by the app at its pill's width and drawn unscaled; a name its lines cannot hold is cut with "…" (a side pill has one line, at 9.5 or 7.6 pt as the layout says: P53). A ground chip still shrinks a name to 0.85 where it is wider.
- The top shade is drawn between the painting and the world: it darkens the painting behind the words and never dims a flag or a label.
- A state the layout's hand cannot settle (one the generated sweep missed) is logged as a fault (`WalkLayout.log`), never a crash.
- A first empty hold shows a quiet note; a second in a row opens typing. Refused or unavailable speech opens typing; for the rest of that walk a tap on the light types and a hold opens the other choices (and leaves them open).
- The lesson is put away by any touch before it does anything else; only the press that began on it may type on a tap (`orbWasTeaching`). A session that dies mid-hold with nothing heard opens typing with "Nothing came through" and does not switch speech off: the next hold listens again.
- A typed flag carries its words with return (`.typeSubmitted(text)`), so it is planted whether return or the field losing focus reaches the walk first.
- "Plan another goal down to today" (`.walkAnother`) starts clean: no undo, examples, note, selection or open post carried over.
- Undoing or pulling up the newest flag of a level hands "last planted" back to the newest one the person still has there, so the next step still links.
- Moving a year goal to another peak does not move the flags already under it (known gap).
- With examples on, examples give way before the person's own goals; at least one example shows while examples are on (F36).
- Posts are planted by hand (`WalkFooting.natural`): the stack lifted a little, the pole leaning up to 0.4°, each cloth a little askew and off the pole, side posts leaning and a little off their row; fixed by identity, never random. The hand never breaks a layout guarantee; `WalkFooting.level` is the board's ruled geometry, and the generated sweep runs on both. Look back up's cloths hang square.
- Sounds are synthesized placeholders until the recordings land in `Resources/WalkSounds`. They are silent while the walk's own listening holds the audio session; haptics always play, sound off or not.
- The ending's rows are today's own personal tasks (planted by the walk or not) and exist only on step 6.

**Accessibility.** VoiceOver reads a walk step in this order: the top row (Back, More, Leave for now); the eyebrow, the question and the why line; the area's pill ("Work, you are here"); the goal above ("Month: …, the goal this step is about, goal 1 of 3, tap to switch"); each goal; "+n more"; each side post; the hint, the Undo pill or the Move row; the light; Next. The light is one button (`walk.orb`, with `.startsMediaSession` wherever holding listens); its choices are custom actions, so "Type it" plants without a press and hold. A goal's custom actions are Move to each area and Remove. Goals that take no tap (`Banner.taps`, which agrees with the reducer) read as text. The paper is modal (Escape closes it) and its rows say what their tap does. The scene is hidden from VoiceOver under the raised ending sheet and under the paper. The stage's words stop growing at extra large; the top row's words shrink to 0.85 before anything is cut. With Reduce Motion nothing drops in or glides: the camera, the cloths and the sheets cross-fade in 0.25 s, cloths do not flutter, the light does not breathe.

**Other screens.** The stage is the 390 x 844 board. A wider window gives it wings (`WalkStage.wing`) and the painting runs edge to edge: no navy bars anywhere (F13, F14). Only the side posts, the goal cloths' width and Back / Leave for now use the extra width; the question, the light, the hint and Next stay in the middle. The picture's three rules: a wider window shows the same stretch of mountain enlarged (never mirrored or faded), never past 1.6 times its pixels unless the window needs more to be covered, then slid the least that keeps the window on the painting. On the Duo's inside screen upright the painting is at about 1.6x its pixels on Month, Week and Today: a little soft. On windows about 670 points high (the narrow phone, the Duo's outside screen, half the inside screen, opened flat) the walk is the board at 79% (F15). On the outside screen it is centred beside the system's column (F18). With `-HalfOpen laptop` the half-open display covers the walk. Re-run the layout's generated-state sweep (`WalkLayoutTests`) whenever a new picture (`WalkArt`) is added.

**The art** (2026-11-14). One painting everywhere: the owner's tall woodblock overlook, summit to ledge, 2896 × 8688 (1:3). The master lives at `~/Documents/Codex/2026-11-14/referenced-chatgpt-conversation-this-is-an/outputs/shin-hanga-mountain-panorama-4x.png` and is not in the repository or the app. `scripts/cut-overlook.sh <master.png>` (run from `apple/SymphonyOS`) writes every image made from it, each into a scratch folder first and into the catalog only once it is encoded:
- `WalkOverlookTall`: the whole painting at 2048 × 6144, the one image the walk, the Month, Season and Year pages and "See my whole plan" draw.
- One cut per everyday band (`WalkArt.Cut`): Today on a phone, on the Duo's wide inside screen and short; Week on a phone and wide; the half-open look half as laptop and book; the spread opened flat. Each cut is only the part of that view's unchanged square `picture` frame that can ever show (Today's with the handover's lowered sheet), drawn into that part of the frame (ruling D20). A cut's numbers live twice, in `WalkArt.Cut` and on the script's `cut` lines; `WalkArtCutTests` keeps them equal, checks the bundled sizes and checks on every window that the level stands in what shows, so change both and run the script again.

Two cameras. The walk's layout keeps the square print's world, numbers and guarantees (`WalkArt.squarePrint`; the square image itself is no longer bundled). The picture has a camera of its own, derived from the layout's (`WalkBackdrop`, `Walk/Core/WalkBackdrop.swift`): for each step a stop that stands that step's own band on its level of the painting, with its columns on that level's open ground; zoomed into a column, the same move as the layout's, about the same stage point, held inside the painting. Both glide on the same curve. The levels above the step stand a little up-slope of their own level. From Season down a held shade (`WalkBackdrop.shade`) sits behind the words to the question's foot, so they read at 4.5:1 on the brighter valley.

Known not to look right (for the owner's eye):
- Two picture stops moved from the approved board so side posts stand on land (P27): Year is closer (k 0.55, x 464), Month further left (x 290). On Year three high side posts touch the skyline and on Month some slots stand over the river's thin channels (P32); the pale braided flats count as land (P33).
- Look back up: a tall bare pole under few cloths; the view ends in the valley.
- The handover: the walk ends on Look back up (sky behind its sheet), then Today's band shows the forest and the ledge, at another scale.
- On the spread one band cannot hold both the meadow under the month flags and the ledge under the sign: it shows the meadow.

Not designed yet (each wants its own board):
- The walk at 79% on windows about 670 high (44 stage points are 34.8 real points there).
- The Duo opened flat: the walk and the pages stay one column centred on the fold, with the post and the light on the crease; the pages' bar, strip and hint cross the fold.
- The walk stays reachable by VoiceOver under the half-open display.

**Speech is shared with Tell.** `Dictation` (`Views/Capture/TellSheet.swift`) serves both. What Tell must keep: its record-only session (others ducked, the session let go on stop), `stop()` as a cancel, and recognition that may use the server when on-device is unsupported. The walk's instance sets `playsAlongside` (its sounds play while it listens) and `onDeviceOnly` (never a server: no on-device recogniser opens typing), and uses `finish()` and `onEnd`. With `onDeviceOnly`, `start()` decides by `onDeviceStart` (D23) at that start: never before the first use, and at most one prompt on a phone that cannot recognise on the device; with `onDeviceOnly` false (Tell in a household known to be full) none of it runs and its start is exactly as before.

**Launch arguments** (Debug, with `-SymphonyDemo`; add `-SymphonyLight` for the light edition):
- `-SymphonyWalk`: open the walk over an empty store.
- `-SymphonyWalkStep N` (0…6): open at step N over the mockup's preview plan.
- `-SymphonyWalkOrb a,b,…`: drive the orb after opening: `ground`, `open`, `hold`, `speak` (a stand-in listener says "Pick up the tile samples"), `type`, `select`, `undo`, `next`, `leave` (Leave for now: onto Today with its waiting line), `quick` (Quick start; `quick,next` shows the lesson on Year), `name:<words>` (types those words, on the ground an area of one's own; lowercased).
- `-SymphonyWalkExamples`: examples on for the step.
- `-SymphonyWalkSheet up`: on step 6, the ending sheet raised.
- `-SymphonyWalkSeed full|long`: the stress plans (`DemoStress`) in place of the preview plan.
- More `-SymphonyWalkOrb` steps: `back`, `paper` (the step's paper raised), `row:N` (its row N tapped), `lookback:<level>` (a Look back up cloth tapped), `area:<name>` (that area's side post tapped), `draft:<words>`.
- `-WalkSize WxH` and `-WalkSafe L,R`: the walk pinned to another window's size and side insets (`466x678` with `0,84` is the Duo's outside screen).

`SymphonyOSUITests/WalkUITests` taps through a quick start and a replay; nothing is typed or spoken.

## The everyday screens (light) (`Daily/`)

The pages the walk leads to, for a light household: Today with its signpost, rows, ring and add bar;
Week; Month, Season and Year as the walk's own mountain; the walk's light handed over to the bar; and the
iPhone Duo's windows. A pure core (`Daily/Core`, Mac-safe, unit-tested), one writer (`Daily/Data/DailyWriter`),
one observable model (`Daily/DailyModel`), and views that draw. The rules live in the core, with known
exceptions the ledger keeps as deferred (for one, the bar's keyboard-rise condition is decided in
`DailyBarView`). Plan:
`docs/superpowers/plans/2026-11-14-iphone-light-daily.md` (its "As built" records every ruling).

**The edition, before the first pull.** `AppState.edition` comes from `Edition.current`: until this
sign-in's `households` rows have been pulled (`SyncEngine` reports that step on its own, before the other
fifteen tables: `AppState.householdsPulled`, ruling D24), only what was remembered for this person
(`EditionMemory`), and with nothing remembered it is full; nothing is remembered before the rows are in;
`applyEdition` runs again then, fetching the rows (not the `@Query`, which may lag). So a fresh install, or
another account's household row left on the phone (sign-out keeps the store), never shows a light page, and
a brand-new light person sees the full app only for the one households request: from sign-in, the old Today
and the full dock; as the households rows land, light Today (scenery, "nothing today", the bar, no dock);
when the whole first pull is in, the walk fades in over it. A failed households pull leaves the edition not
light; the next try is the resync when the app comes back to the foreground. Until the edition is known
(pulled, or remembered: `AppState.editionKnown`) speech stays on the phone everywhere, Tell included
(`DailyGate.speechOnPhoneOnly(edition:known:)`, ruling D25). Sign-out (`AppState.signedOut`) resets the page, the date, the edition,
Inbox or More and the dock flag; a waiting Tell is dropped in a light household and kept in a full one
(as before the light edition: a Tell asked while signed out opens after sign-in).

**The gate.** `DailyGate.shows` is the one test: a light household (`Edition.light`), on a phone (ruling
D17: an iPad keeps the old pages and the dock), on a built window shape (`layouts`: one column, the Duo's
outside screen `.glance`, its inside screen upright `.dayPage`, opened flat `.journal`; never `.glanceWide`,
a phone on its side, which keeps the old wide glance and the dock). `LightPlannerView` draws the page
`DailyGate.page` names, or the full Planner where the gate says no; `hidesDock` takes the dock away only on
a light page. A full household, and a mixed or unknown one (which `Edition.resolve` makes full), keeps
every screen it had: Today, Week, the horizons, the dock, the Duo glance and journal, the half-open
display, Inbox. What covers that: `DailyGateTests.fullIsNeverReplaced` and `mixedOrUnknownEditionsAreFull`
(for a full household no horizon, from Year down to Today, is light on any window shape, the journal
included, and the dock never gives way); `FullHouseholdUnchangedUITests` (the app
itself: the old Today and its dock on the phone and at the outside screen's size, the old half-open
display, a walk ending on the old Today; it does not open Week, the horizons, the journal or Inbox); and
the plan's "must not change" files (the old Today, glance, journal, Week, period pages, half-open display
and Inbox), which have no diff over the whole plan. The dock on light's old pages, flagged once as "must
not ship as is", was checked: `DailyGate.hidesDock(on:)` takes the page on screen, so the dock gives way
only on a light page (`DailyGateTests.theDockGivesWayOnEveryLightPageAndOnNoOther`,
`LightEditionUITests.testEveryWordAndWeeksFlagsOpenLightPagesWithNoDock`). Off light (an invite accepted) `AppState.leaveDaily()`
brings the dock back and leaves nothing light open or waiting.

**What each page reads and writes.**
- *Today* reads `DailyTodayPage.read`: the signed-in person's own personal rows for today (`DailyDay.mine`,
  the walk's ending's rows), the first thing first, each with "for ‹goal›" (`WalkEnding.forGoal`); the
  ring (none on an empty day); the next timed event not ticked off (`DailyDay.nextEvent`, the walk's rule);
  and the sign (`Signpost.pick`).
- *Week* reads `DailyWeek.make` (today to the week's end, each day's events then its tasks, Any day last,
  the days behind folded to one line with anything still open from earlier weeks) and
  `DailyWeek.bandGoals` (at most two month goals on the band).
- *Month, Season, Year* read `MountainPage.flags`: the page's period from the selected date, each flag's
  real parent by its links, and the upper flags of the periods it walks down in (`DailyPeriods.walking`); drawn by `WalkLayout.make(…, footing: .natural)`
  of the walk's own settled state (`MountainPage.walkState`), so a page is the walk's picture: standing in one
  area, its side posts walking there, the goal above showing only its own goals (F40). Until the person walks a
  page starts on the parent of the area's newest goal on the level. The hint over the foot reads, first that
  applies: how to begin on an empty page; on a goal above with nothing under it "No fall goal under this yet" /
  "No November goal under this yet"; "Tap the goal above to switch" while it is one of several (on the stop for
  the goals under none, "Tap “Not under a goal yet” to switch", the walk's own words); "Tap a post to
  walk to that area"; "Tap a flag to move it or walk it down". While a goal is chosen there is no hint: its
  panel stands over the goal above and carries the words. A chosen goal's panel names it and offers Walk it
  down (which opens the walk standing in the goal's own area, on its own line), Move to (every area, P45) and Remove.
- *The pages' paper foot*: a paper foot at the bottom of the window holding a strip ("Read the whole year",
  "17 goals, as a plain list by area"; one line on windows under 700 high) that raises the level's paper, and
  the add bar in its paper look with More and Inbox either side. No strip on an empty page. The paper is the
  walk's (`PlanPaper`); a row walks there or brings its goal into sight. The page's heading hides under it.
- *See my whole plan* (the handle on Today's and Week's sheet): the sheet lowers over the walk's Look back up
  picture for the plan (`DailyLookBack`): the area top to bottom, the other areas as side posts, a cloth opens
  its level's paper; a tap on the lowered strip raises the sheet. The page's top shade stands under the whole
  plan's posts (`DailyWholePlan`, `DailyMetrics.wholePlanShade`), so the area's pill and caret are gold, as on the walk.
- *Which period a page opens on* (the owner's "Where I am, if it has goals", 2026-11-14): for Month, Season
  and Year, `here` is the period holding today and `ahead` the walk's (`WalkPeriods.pick`). The same period:
  that one. Two periods: the page opens on `here` when the person has a goal of their own on that level in
  it, else on `ahead`, and its heading is a button with a quiet line ("December ›"; VoiceOver "November. Shows
  December next.") that switches to the other and back, for this visit only (`DailyPeriods.opening`,
  `DailyPeriods.other`). The row of words opens a page by the rule. Week's band and the signposts read the
  current month and season first (`DailyPeriods.current`), the walk's only when the current one holds
  nothing of the person's; "Walk it down" from a page showing `here` plans inside it (a fall goal into
  November, a November goal into this week). Nothing is stored; the walk's own periods are unchanged.
- *Writes* all go through `DailyWriter`, which calls only `WalkWriter`, `PlanWriter` and `ItemCompletion`,
  on the person's own rows, `context = "personal"`: the bar adds a week task (on the day said, at the
  time said, never the first thing; with no day, into the week the page shows, so on next week's Week it is
  filed there and the field reads "Add to next week") or a goal on a mountain page (filed into that page's
  periods, under the focused flag); a tick completes; Move to sets a day or Any day; "Remove" (`WalkCopy.pullUp`) is a
  permanent delete of the task or goal row (rows that named it are unlinked, never removed), written once its
  Undo can no longer be used; Move to on a mountain flag changes its area; a row's press-and-hold menu (or
  VoiceOver's actions) sets or clears the first thing. Every add, move, area change and Remove offers Undo.
- *The half-open display* reads Today's page through `DailyTentPage`; a tick there offers Undo.

**The bar's words.** Read by `DailyAdd` over the app's `CaptureParser`: a found day lands the task there; a
found time is kept as a time even where the parser does not mark one ("at 3 tomorrow": 3 pm; "at noon":
noon, its leftover "at" going too); where nothing of a matched phrase is kept (a date still past), every
word stays in the title. What the real parser does with seven phrases is pinned in
`DailyAddRealParserTests` ("dentist at 3" is not matched at all and stays whole). Typed words are kept when
the light is tapped, and what is heard follows them (D22).

**The signpost.** Six kinds in a fixed order; the first true one not put away today shows
(`Signpost.Kind`: That's the day, First today, Today is open, A new week, ‹Month› ends, No piece). Every
title is the person's own words. A sideways swipe puts that kind away for the day; following a sign that
goes somewhere puts it away too, so the next true kind shows on coming back. What is put away is kept per
person per day in `UserDefaults` (`daily.signpost.<user id>`, `SignpostMemory`); another day reads as
nothing put away.

**Speech.** In a light household Symphony's own speaking features (the walk's light, the bar's light, and
Tell Symphony wherever a light household can still open it: the Lock Screen control, a `symphony://tell`
link, the old Tell sheet on an iPad) recognise speech on the phone only (`DailyGate.speechOnPhoneOnly`,
`Dictation.onDeviceOnly`); with no on-device recogniser they type. The keyboard's own dictation key is
Apple's, outside the app's control, and follows the phone's own settings, so an App Store line must speak
of the app's speaking features, not of all speech. On a light page a Tell makes the bar listen, never the
sheet. A full household's Tell is unchanged.

**The waiting walk's line.** One quiet line under the sheet's handle (`DailyGate.walkLine`): a walk left
with Leave for now reads "Your walk is waiting. Pick it back up." and resumes it; a walk declined at
Welcome by someone with no goals reads "Walk down from the year when you’re ready." and starts it from the
top. Never in a full household.

**The first thing.** The oldest open "chosen for today" mark (`TaskFocus`) of the person's own that is dated
today (`DailyDay.firstThing`); yesterday's mark is not today's. In the light edition sending an Inbox item to
Today does not make it the first thing and counts no deferral (`TriageController.lightMove`, reached only
with an assumed life area; a full household's triage is unchanged). Marking a row first leaves exactly one
of my marks for today (`DailyWriter.setFirst`).

**Unfinished tasks.** Nothing is counted or marked late. Yesterday's open tasks wait in Week's folded past
days, with anything still open from earlier weeks; Move to brings one back. The fold says only what was
done ("3 done"), never what was missed.

**The handover, and the art.** An ordinary walk that finishes onto light Today hands its light down to the
bar (`DailyHandover.plays`); its line shows once per person per phone (`HandoverMemory`,
`daily.handover.seen.<user id>`), and a line shown even for a second counts as seen. The bands' picture: see The art.

**Accessibility.** Every gesture has a button or a VoiceOver action. Reading order on Today: the row of
words (a container, "Where you are"; the current word selected), the signpost (one button, its label the
eyebrow, the title and what a tap does; action "Put this sign away for today"), the sheet's handle, the
waiting walk's line, the heading and the ring, the next event, each row (label "‹title›, for ‹goal›",
value Done or Not done, actions First today, Details, Remove), then the bar: the line above it, the field
(always read by its whole sentence, though a narrow field shows the short one), its light ("Speak it",
"Add what you said" while listening, "Type it" with speech off), More and Inbox. Week: the row of words
first, then the band's flags, the fold (its state as the value), each day by its whole name ("Today,
Tuesday, 10 November"), each task one element with an action per Move to chip and Remove; an event and
"open" read as text. The mountain pages: flags carry Walk it down, Move to ‹area› and Remove. Lowered,
the sheet is one button and the whole plan behind it is read. The half-open display reads the time, the
next event, the sign (without what a tap would do), then To do today. A note (a refused microphone's
among them), Undo and the handover's line are announced each time one is put in the line above the bar,
a second add's Undo too (`DailyBar.announcement`). The listening line is never announced: the microphone
is open then and could take the announcement down as words; the light's label ("Add what you said") and
value ("Listening") say it instead. Decorative pictures are hidden from VoiceOver. With Reduce Motion nothing
slides or travels: the handover's light does not travel, the ring does not sweep, and the Move to panel
cross-fades in 0.25 s. Text: the row of words, the signpost, the bar, the sheet's handle and header, the
next event, the ring, Week's band flags, its day labels and its Move to panel, and the mountain pages stop
growing at extra large (`DailyPalette.largestChrome`); the rows grow on, their titles wrapping to three lines
at the accessibility sizes (`DailyMetrics.titleLines`), and Week's fold, an event and a row's "for" line to
two (`DailyMetrics.quietLines`).

**Behaviour a change must keep:**
- A full household never sees a light page, on any window, and keeps its dock (`DailyGateTests.fullIsNeverReplaced`, `FullHouseholdUnchangedUITests`).
- Light pages are for the phone idiom only; an iPad keeps the old pages (D17).
- A Remove is written only when its Undo can no longer be used (the window ends, another change takes the Undo, the app goes to the background, the page goes, the day turns); until then the row is hidden everywhere (D7).
- A move on a light page never adds to `deferCount`, and writes the page's own week, never the wall clock's (D13).
- A light page under the light half-open display stays in the tree, inert (no touch) and silent (its bar cannot listen and takes no Tell); only the display's bar can (D14).
- A tick on the half-open display offers Undo (D15).
- A selected date that was today or later when the day turned, and is now past, becomes today; a past date the person went to is left alone (D18). The step runs only where light pages live, a light household on a phone (`DailyGate.dayTurn`, `DailySpreadTests`): a full household's and an iPad's selected date are never touched.
- In a light household Symphony's own speaking features recognise speech on the phone only, Tell on an iPad included (D19); the keyboard's dictation key is Apple's.
- The listening line is never announced to VoiceOver (the microphone is open); the light's label and value carry the state.
- A walk-down is never stored, never becomes a waiting walk, and returns to the page it started from (D2).
- Only an ordinary walk finishing hands the light over, never behind the half-open display, and the light travels only on windows where `DailyHandover.travels` says so (not on the spread).
- A Tell never makes a bar listen where it cannot be seen: during a walk it waits, while the whole plan shows the sheet rises first, under the half-open display only the display's bar takes it.
- After the second tap on its light the bar waits up to 1 s for the last words (`WalkOrb.finishMs`), as the walk does; nothing empty is ever added.
- `AppState.dailyLastDay` and a pending handover are cleared on sign-out and by `leaveDaily()`.
- Before this sign-in's first pull the edition is only this person's memory, else full (`Edition.current`); nothing is remembered before the pull.
- A task with no day said on Week is filed into the week the page shows (`DailyAdd.otherWeek`).
- Undo of an add, and a Remove, queue a delete (`DailyWriter.queueDeleteAfterRemove`): the insert may already be on the wire. Never in `WalkWriter.remove`, whose `restore` reads a queued delete as "reached the server".
- A Tell's tap goes through the scheduler (`DailyModel.answerTell`), so a same-update `.left` from the page that goes lands first; Details (`sheetOpening`), an inactive scene (except while a listen is starting: the permission prompts make it inactive) and a change of page send `.left`.
- On the Duo's inside screens a size change that is only the keyboard is ignored (`DailyGate.plannerSize`); only a real Duo can confirm it.
- The bar's light carries `.startsMediaSession` while a tap would start listening (`DailyBar.tapStartsListening`); the bands' painting is `Image(decorative:)`.
- A Tell asked during a walk-down is answered only if it returns to Today (`DailyWalkDown.keepsTell`); otherwise it is dropped.
- "‹Month› ends" shows only when that month holds a goal of mine; "It’s on …" names the month when it is not this one.
- Every write (`add`, `move`, `setFirst`, `toggle`) reads the day first. The model keeps the seasons it was made with (it is not made again behind the person's back: the household list empties for a moment in every resync, and a remake would drop a draft, an Undo and a listen). Walk-downs and the pages read the live seasons; the model's own periods (what the writer files into, and "See my whole plan") follow only when the pages are next made, and on a first sign-in the model is made before the pull lands.
- A change of horizon lets the bar go only when the page changes (`DailyGate.pageChanges`): on the spread Today and Week are one page.
- A Tell's deferred tap is dropped if a walk opened meanwhile.
- Before the edition is known speech stays on the phone (D25); on-device speech is decided at the first use (D23).
- Month, Season and Year open where the person is when they have goals there, else on the walk's period, and the heading switches between the two (`DailyPeriods`); Week's band and the signposts read the current month first. The walk's own periods are unchanged.

**Debug launch arguments** (with `-SymphonyDemo -SymphonyLight`):
- `-SymphonyDaily`: the light pages' demo seed in place of the family one, with two sample calendar events.
- `-SymphonyDailyNow YYYY-MM-DD`: pins the light pages' clock (`DailyClock`) to noon that day. The walk keeps the real clock.
- `-SymphonyDailySeed morning|done|open|newweek|quiet|nopiece|empty|both` (`morning` by default; `quiet` files its two long goals into the calendar's month, so on the 28th November holds something and "November ends" shows; `both` adds goals in the calendar's own year, season and month beside the walk's).
- `-SymphonyDailyPage today|week|month|season|year`: the page the demo opens on.
- `-SymphonyDailyState a,b,…`: `point`, `waiting`, `speak`, `hear`, `refused`, `undo`, `more`, `inbox`, `lookback`, `handover`, `travel`; `details` (with `speak`: the first row's Details over a listening bar); on Week `select`, `unfold`, `nextweek` (with `undo`: a task added there with no day); on a mountain page `select`, `move`, `zoom`, `walkdown`, `switch` (the heading tapped once) (see `DailyDemo.swift`).
- Also: `-TodaySize WxH` and `-HalfOpen laptop|book` (Duo sizes on a phone), `-HalfOpenSplit N`, `-SpreadFold N`, `-SymphonyHandoverRemembers`.

`SymphonyOSUITests/LightDailyUITests`, `LightEditionUITests`, `LightSpreadUITests` and
`FullHouseholdUnchangedUITests` walk these pages by taps; nothing is typed or spoken. In a demo launch Sign
Out is local (Debug only, `AuthService.signOut`): it calls nothing on the server. `CarriedOverUITests`,
`PlannerScreensUITests` and `SkinScreenshotsUITests` sign the repo's shared test account into the live server:
they are not run for the light work (P52).

**Not designed:** a way to step to another week, month, season or year (only the "‹Month› ends" sign opens a
past one); a task's time (stored, not shown); opening or ticking a calendar event from Week; the pages and the
walk opened flat (one column on the fold, its bar, strip and hint across it) and at 79% on windows about 670
high; large text on Today and Week; an iPad; and tent mode. (A light household's phone-sized screens stay
upright, F26; the Duo's inside screen turns.) The owner's words for tent mode were "~1/4 open resting on
the surface like a tent"; reading it as the Duo standing hinge up with its outside screen facing the
person is the controller's, unconfirmed. The owner parked it until after this work. (`DailyTentPage` and
`DailyMetrics+Tent` are the boards' word for the laptop and book half-open display, which is built and is
not the owner's tent mode.)

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
