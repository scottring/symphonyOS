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

**Leaving it.** "Not now" on Welcome, "Open Today" at the end, or, on every step after Welcome, "Leave for now" (the compass's upper-left point, "Your place is kept."): the walk closes onto Today with everything added kept; only the position is saved, as paused.

**Periods.** `WalkPeriods.pick`: the year from November on is next year; with fewer than three weeks of a season left the walk plans the coming season, and the month always lies inside the season it plans (the coming season's first month; in the current season this month, or the next once fewer than seven days are left). On 14 November: winter, December. The writer and the everyday screens read the same periods.

**Saved position.** In `UserDefaults` under `walk.position.<user id>` (`WalkPositionStore`), saved from the moment a depth is chosen. Undo lives in memory only and does not survive a relaunch. A Debug demo saves only to `DemoMode.walkStore`, emptied at launch.

**The controls say what they do** (2026-11-14). The copy teaches two things: hold the light to say it, tap the light for other choices. No instruction uses "plant", "flag", "peak", "ground", "ridge", "piece", "walk on" or "slide" (`WalkCopyTests.instructionsUsePlainWords`); the slide still works and is never mentioned.
- Welcome: the light is the quick start (a tap or a hold begins it; it carries a walking figure), with "Quick start" and "One goal, down to today. About 3 minutes." under it in the Next line's place (also a tap). The other two choices stand above it as discs with their second lines (`Point.detail`): Plan my whole year upper-left, Not now upper-right. The hint reads "Tap the light for a quick start". On the ground the light is quiet (no symbol) and nothing says to hold it (it is taught on the first question step); holding it still names an area.
- The light is taught once per walk (`WalkState.teaching`, `taught`, saved in the position): on the first step where holding answers, the scene steps back under the veil and two lines stand above the light ("Press and hold the light, and say it out loud." / "Let go when you’re done. To type, tap More."; with speech off "Tap More and choose Type it.") while the ring pulses (not with Reduce Motion). A tap anywhere, the light included, only puts it away; holding the light puts it away and listens. The light means one thing: hold to speak; everything else is under More (a tap on the light still opens the choices; with speech off it types). A resume or Leave for now does not teach it again; a replay does. `-SymphonyWalkOrb quick,next` shows it.
- "More" (`ellipsis.circle` and the word, `WalkEvent.moreTapped`, `WalkLayout.moreFrame`) sits left of the Next line whenever the compass is closed after Welcome, and opens it as a tap on the light does (with speech off too).
- The Next line (`WalkCopy.nextLine`, `WalkLayout.nextFrame`): text and the light's gold `arrow.down.circle.fill` under the light's ring, 44 pt tall, naming where it goes ("Next: this winter", "Next: December", "Next: this week", "Next: today", "Finish", "Next: your goals", "Start with this one"; a tour names the next area, cut to 14 characters, or "Next goal"); "Skip this step" at 70% while nothing is added. It sends exactly what the south point does (`WalkEvent.nextTapped`). The compass's points name what they do or where they go ("Back to this winter", "Switch to another goal", "Show examples", "Show my calendar on Today", "Leave for now").
- The open compass: the scene steps right back under a navy veil (ground colour at 80%, `WalkState.showsVeil`), a tap on which closes it (`.veilTapped`). Leave for now is the upper-left point, Undo the lower-right. Every point's words are placed line by line by `WalkLayout.pointWords` (above the disc for the top, upper and bottom points, under it otherwise, moved outward until clear of the ring and the other discs, 12 pt inside the stage, above the home-indicator zone; second lines 13 pt at 90%), checked by the layout sweep, and drawn above the scrim and the soft ground-colour blots behind them (`WalkUnderlay`, under the light's layer, so nothing on the compass is dimmed). The hint ("Tap one, or tap the light to close") sits above the top point on a soft band.
- The light carries a microphone while holding would listen; once speech is off for the walk, a keyboard, and then a tap types and a hold opens the other choices (`WalkState.lightSymbol`).
- The hint is 15 pt and always one line (no hint or note is longer than `WalkCopy.hintMaxLength`, 46), on a bottom scrim (ground colour 0→80% over the last 120 pt). The ground's areas are outlined pills with a plus until kept, gold with a checkmark once kept, all at full opacity. Example flags carry "EXAMPLE · TAP TO USE" ("TAP TO USE" where narrow) inside their own frame.
- Look back up draws every flag and area label at full strength; a post's one shown flag takes two lines where its words need them (lower on its pole, down to its base, to stay under the level above), at its column's width up to the neighbour gaps, with "+n more", and never reaching onto a peak's label. Each peak's label stands just above its column's top flag as the column's heading (`WalkLayout.headings`, after planting), clear of every flag, label and the header line; where it cannot (a crowded ridge), it stays, and no flag's second line reaches it. The rising flag shows no caret (a caret means typing). The light's VoiceOver label follows speech being off. The light edition's Today line ("Your walk is waiting. Pick it back up.") is amber with a chevron.
- Known gap: a folded stub still says "+n" (26 pt wide); "+n more" is on banners only.

**Behaviour a change must keep:**
- Letting go while speaking waits for the last words: the orb is `finishing` until the recogniser ends or `WalkOrb.finishMs` (1 s) passes. Anything the person does in that second (a tap on a flag or a peak, Undo, a compass point through VoiceOver) plants the flag first, under the parent shown when they let go, then takes effect (`WalkEvent.leavesAWaitingFlag`).
- The walk listens on the phone only. Where on-device recognition is missing, holding opens typing.
- A first empty hold shows a quiet note; a second in a row opens typing. Refused or unavailable speech opens typing; for the rest of that walk a tap on the light types and a hold opens the other choices (and leaves them open).
- The lesson is put away by any touch before it does anything else; only the press that began on it may type on a tap (`orbWasTeaching`). A session that dies mid-hold with nothing heard opens typing with "Nothing came through" and does not switch speech off: the next hold listens again.
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

**The art** (2026-11-14). The owner's tall painting, summit to ledge, 2896 × 8688 (1:3), is the master: `~/Documents/Codex/2026-11-14/referenced-chatgpt-conversation-this-is-an/outputs/shin-hanga-mountain-panorama-4x.png`. It is not in the repository or the app. `scripts/cut-overlook.sh <master.png>` (from `apple/SymphonyOS`) writes every image cut from it: `WalkOverlookTall` (the whole painting at 2048 × 6144, for the walk) and one square cut per everyday view (`WalkArt.Cut`: Today tall and short, Week, the half-open look half as laptop and book), each drawn into that view's unchanged `picture` frame. A cut's numbers live twice, in `WalkArt.Cut` and on the script's `cut` lines; `WalkArtCutTests` keeps them equal and checks the bundled sizes, so change both and run the script again. The walk itself, and the Month, Season and Year pages, still stand on the square print (`WalkOverlook`): on the tall painting the levels stand so far apart that the layout's fixed zoom and its rule that every level above the step is drawn put the level above in the question or off the stage (`WalkArt.overlookTall` holds the measured bands and stops for when that is designed).

Not designed yet:
- On the Duo's inside screen the stage is letterboxed with navy bars, which show seams beside the stage's lighter sky and its rocks.
- There the system status column overlaps the raised ending sheet's top-right corner.
- The walk stays reachable by VoiceOver under the half-open display.

**Speech is shared with Tell.** `Dictation` (`Views/Capture/TellSheet.swift`) serves both. What Tell must keep: its record-only session (others ducked, the session let go on stop), `stop()` as a cancel, and recognition that may use the server when on-device is unsupported. The walk's instance sets `playsAlongside` (its sounds play while it listens) and `onDeviceOnly` (never a server: no on-device recogniser opens typing), and uses `finish()` and `onEnd`.

**Launch arguments** (Debug, with `-SymphonyDemo`; add `-SymphonyLight` for the light edition):
- `-SymphonyWalk`: open the walk over an empty store.
- `-SymphonyWalkStep N` (0…6): open at step N over the mockup's preview plan.
- `-SymphonyWalkOrb a,b,…`: drive the orb after opening: `ground`, `open`, `hold`, `speak` (a stand-in listener says "Pick up the tile samples"), `type`, `select`, `undo`, `next`, `leave` (Leave for now: onto Today with its waiting line), `quick` (Quick start; `quick,next` shows the lesson on Year).
- `-SymphonyWalkExamples`: examples on for the step.
- `-SymphonyWalkSheet up`: on step 6, the ending sheet raised.

`SymphonyOSUITests/WalkUITests` taps through a quick start and a replay; nothing is typed or spoken.

## The everyday screens (light) (`Daily/`)

The pages the walk leads to, for a light household: Today with its signpost, rows, ring and add bar;
Week; Month, Season and Year as the walk's own mountain; the walk's light handed over to the bar; and the
iPhone Duo's windows. A pure core (`Daily/Core`, Mac-safe, unit-tested), one writer (`Daily/Data/DailyWriter`),
one observable model (`Daily/DailyModel`), and views that only draw. Plan:
`docs/superpowers/plans/2026-11-14-iphone-light-daily.md` (its "As built" records every ruling).

**The gate.** `DailyGate.shows` is the one test: a light household (`Edition.light`), on a phone (ruling
D17: an iPad keeps the old pages and the dock), on a built window shape (`layouts`: one column, the Duo's
outside screen `.glance`, its inside screen upright `.dayPage`, opened flat `.journal`; never `.glanceWide`,
a phone on its side, which keeps the old wide glance and the dock). `LightPlannerView` draws the page
`DailyGate.page` names, or the full Planner where the gate says no; `hidesDock` takes the dock away only on
a light page. A full household, and a mixed or unknown one (which `Edition.resolve` makes full), keeps
every screen it had: Today, Week, the horizons, the dock, the Duo glance and journal, the half-open
display, Inbox (`FullHouseholdUnchangedUITests`). Off light (an invite accepted) `AppState.leaveDaily()`
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
  real parent by its links, and the walk's current upper flags; drawn by `WalkLayout.make(…, footing: .natural)`.
- *Writes* all go through `DailyWriter`, which calls only `WalkWriter`, `PlanWriter` and `ItemCompletion`,
  on the person's own rows, `context = "personal"`: the bar adds a week task (on the day said, at the
  time said, never the first thing) or a goal on a mountain page (filed into that page's periods, under
  the focused flag); a tick completes; Move to sets a day or Any day; "Remove" (`WalkCopy.pullUp`) takes
  a row out of the plan; Move to on a mountain flag changes its area; a row's press-and-hold menu (or
  VoiceOver's actions) sets or clears the first thing. Every add, move, area change and Remove offers Undo.
- *The half-open display* reads Today's page through `DailyTentPage`; a tick there offers Undo.

**The signpost.** Six kinds in a fixed order; the first true one not put away today shows
(`Signpost.Kind`: That's the day, First today, Today is open, A new week, ‹Month› ends, No piece). Every
title is the person's own words. A sideways swipe puts that kind away for the day; following a sign that
goes somewhere puts it away too, so the next true kind shows on coming back. What is put away is kept per
person per day in `UserDefaults` (`daily.signpost.<user id>`, `SignpostMemory`); another day reads as
nothing put away.

**Speech.** In a light household the bar, and Tell Symphony wherever a light household can still open it
(the Lock Screen control, a `symphony://tell` link, the old Tell sheet on an iPad), listen on the phone
only (`DailyGate.speechOnPhoneOnly`, `Dictation.onDeviceOnly`); with no on-device recogniser they type. On
a light page a Tell makes the bar listen, never the sheet. A full household's Tell is unchanged.

**The waiting walk's line.** One quiet line under the sheet's handle (`DailyGate.walkLine`): a walk left
with Leave for now reads "Your walk is waiting. Pick it back up." and resumes it; a walk declined at
Welcome by someone with no goals reads "Walk down from the year when you’re ready." and starts it from the
top. Never in a full household.

**The first thing.** The oldest open "chosen for today" mark (`TaskFocus`) of the person's own that is dated
today (`DailyDay.firstThing`); yesterday's mark is not today's. Sending an Inbox item to Today makes that
mark too.

**Unfinished tasks.** Nothing is counted or marked late. Yesterday's open tasks wait in Week's folded past
days, with anything still open from earlier weeks; Move to brings one back. The fold says only what was
done ("3 done"), never what was missed.

**The handover, and the art.** An ordinary walk that finishes onto light Today hands its light down to the
bar (`DailyHandover.plays`); its line shows once per person per phone (`HandoverMemory`,
`daily.handover.seen.<user id>`). The bands' picture: see The art.

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
next event, the sign (without what a tap would do), then To do today. The line above the bar (listening,
a note, a refused microphone, Undo, the handover's line) is announced once as it appears
(`DailyBar.announcement`). Decorative pictures are hidden from VoiceOver. With Reduce Motion nothing
slides or travels: the handover's light does not travel, the ring does not sweep, and the Move to panel
cross-fades in 0.25 s. Text: the row of words, the signpost, the bar, the sheet's handle and header, the
next event, the ring, Week's band flags, its day labels and its Move to panel, and the mountain pages stop
growing at extra large (`DailyPalette.largestChrome`); the rows grow on, their titles wrapping to three lines
at the accessibility sizes (`DailyMetrics.titleLines`).

**Behaviour a change must keep:**
- A full household never sees a light page, on any window, and keeps its dock (`DailyGateTests.fullIsNeverReplaced`, `FullHouseholdUnchangedUITests`).
- Light pages are for the phone idiom only; an iPad keeps the old pages (D17).
- A Remove is written only when its Undo can no longer be used (the window ends, another change takes the Undo, the app goes to the background, the page goes, the day turns); until then the row is hidden everywhere (D7).
- A move on a light page never adds to `deferCount`, and writes the page's own week, never the wall clock's (D13).
- A light page under the light half-open display stays in the tree, inert (no touch) and silent (its bar cannot listen and takes no Tell); only the display's bar can (D14).
- A tick on the half-open display offers Undo (D15).
- A selected date that was today or later when the day turned, and is now past, becomes today; a past date the person went to is left alone (D18).
- A light household's speech stays on the phone everywhere, Tell on an iPad included (D19).
- A walk-down is never stored, never becomes a waiting walk, and returns to the page it started from (D2).
- Only an ordinary walk finishing hands the light over, never behind the half-open display, and the light travels only on windows where `DailyHandover.travels` says so (not on the spread).
- A Tell never makes a bar listen where it cannot be seen: during a walk it waits, while the whole plan shows the sheet rises first, under the half-open display only the display's bar takes it.
- After the second tap on its light the bar waits up to 1 s for the last words (`WalkOrb.finishMs`), as the walk does; nothing empty is ever added.
- `AppState.dailyLastDay` and a pending handover are cleared on sign-out and by `leaveDaily()`.

**Debug launch arguments** (with `-SymphonyDemo -SymphonyLight`):
- `-SymphonyDaily`: the light pages' demo seed in place of the family one, with two sample calendar events.
- `-SymphonyDailyNow YYYY-MM-DD`: pins the light pages' clock (`DailyClock`) to noon that day. The walk keeps the real clock.
- `-SymphonyDailySeed morning|done|open|newweek|quiet|nopiece|empty` (`morning` by default).
- `-SymphonyDailyPage today|week|month|season|year`: the page the demo opens on.
- `-SymphonyDailyState a,b,…`: `point`, `waiting`, `speak`, `hear`, `refused`, `undo`, `more`, `inbox`, `lookback`, `handover`, `travel`; on Week `select`, `unfold`; on a mountain page `select`, `move`, `zoom`, `walkdown` (see `DailyDemo.swift`).
- Also: `-TodaySize WxH` and `-HalfOpen laptop|book` (Duo sizes on a phone), `-HalfOpenSplit N`, `-SpreadFold N`, `-SymphonyHandoverRemembers`.

`SymphonyOSUITests/LightDailyUITests`, `LightEditionUITests`, `LightSpreadUITests` and
`FullHouseholdUnchangedUITests` walk these pages by taps; nothing is typed or spoken.

**Not designed:** a phone or the Duo's outside screen held sideways (the old wide glance); a way to step
to another week, month, season or year (only the "‹Month› ends" sign opens a past one); a task's time
(stored, not shown); opening or ticking a calendar event from Week; Month, Season, Year and the walk
letterboxed on the Duo; tent mode (the Duo standing like a tent, its outside screen showing), parked by
the owner until after this work; an iPad.

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
