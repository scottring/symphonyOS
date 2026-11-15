# iPhone Light Version, Step 3: The Everyday Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a light household the everyday screens the walk leads to: Today with its signpost, list, ring and add bar; Week; Month, Season and Year as the mountain itself; the walk's light handing over to the bar; and the four Duo layouts. A full household sees no change at all.

**Architecture:** A new `Daily/` folder beside `Walk/`: a pure core (the gate, every string, today's rows, the signpost's rule, what the bar's words mean, the week's days, the page numbers, the mountain page's state) with unit tests, one small writer over the existing `WalkWriter` and `PlanWriter`, one observable `DailyModel`, and views that only draw. Today and Week are native pages (a band of scenery, the paper sheet). Month, Season and Year are the walk's own 390 × 844 stage, drawn by the walk's layout with no question and no light. One function, `DailyGate`, decides whether a light page shows; everything else in the app is left as it is.

**Tech Stack:** SwiftUI, SwiftData, Swift Testing, Speech through the existing `Dictation` (on the phone only), XcodeGen. No server, database, schema or web change.

**Spec:** `docs/superpowers/specs/2026-11-13-iphone-light-version-design.md` (binding: "Mockup round 1 (2026-11-14)", with "Anti-goals", "Light and full in one app", "Screens and layouts", "Constraints"). The approved boards are `docs/superpowers/specs/2026-11-14-iphone-light-daily-mockup/`; their numbers are lifted into "The boards as numbers" below, so no builder needs to open the HTML. Read with it: `apple/SymphonyOS/PLANNING.md` ("The walk") and the "As built" section of `docs/superpowers/plans/2026-11-13-iphone-light-walk.md`.

## Global Constraints

- Work only in `/Users/scottkaufman/.claude-worktrees/symphonyOS/ios-light-build` on branch `claude/ios-light-build`. Never edit the main worktree. **Nothing is pushed or deployed.** No migration, no edge function, no remote database.
- **R** = `apple/SymphonyOS/SymphonyOS`, **T** = `apple/SymphonyOS/SymphonyOSTests`, **U** = `apple/SymphonyOS/SymphonyOSUITests`. After adding a file: `cd apple/SymphonyOS && xcodegen generate` (commit the regenerated project with the task).
- **TEST** (one suite): `cd apple/SymphonyOS && xcodebuild test -scheme SymphonyOS -destination 'platform=iOS Simulator,id=29378388-0323-4E79-AD34-D46BA52A3461' -only-testing:SymphonyOSTests/<Suite> 2>&1 | grep -E "error:|✔|✘|passed|failed|BUILD" | tail -40`. Swift Testing (`import Testing`, `@Test`, `#expect`, `@testable import Symphony`).
- **Simulators.** Only ONE `xcodebuild` at a time on this machine. Everything phone-sized uses the iPhone 17 simulator, id `29378388-0323-4E79-AD34-D46BA52A3461`. Duo-sized screens may use the booted "iPhone Duo" simulator, id `B88F7BDF-8739-4F90-BE7E-B8DFDEB789AD` (outside screen `--display=1`, inside `--display=3`): install, launch with demo arguments, screenshot, then `xcrun simctl terminate` the app; never erase, reset or shut it down. The DEBUG arguments `-TodaySize WxH` and `-HalfOpen laptop|book` also show Duo sizes on the iPhone 17. Never create a simulator. Never touch an iPad simulator. In zsh pass launch arguments as separate literal words.
- **SHOT** (never during a test run): `cd apple/SymphonyOS && xcodebuild build -scheme SymphonyOS -destination 'platform=iOS Simulator,id=29378388-0323-4E79-AD34-D46BA52A3461' -derivedDataPath "$TMPDIR/daily-dd" 2>&1 | tail -3 && xcrun simctl install 29378388-0323-4E79-AD34-D46BA52A3461 "$TMPDIR/daily-dd/Build/Products/Debug-iphonesimulator/Symphony.app" && xcrun simctl launch 29378388-0323-4E79-AD34-D46BA52A3461 com.scottkaufman.symphonyos -SymphonyDemo -SymphonyLight -SymphonyDaily -SymphonyDailyNow 2026-11-10 <more> && sleep 4 && xcrun simctl io 29378388-0323-4E79-AD34-D46BA52A3461 screenshot <path>.png`. Save under the session's scratch folder, `daily-shots/task-<N>/`, never in the repo; list the paths in the report. Judge each against "The boards as numbers", not taste.
- **Light households only.** The one gate is `DailyGate` (Task 1). A full household, and any mixed or unknown edition (which `Edition.resolve` already makes full), keeps today's Today, Week, horizons, dock, Duo glance, journal and half-open view. These files must not change in this plan: `R/Views/Timeline/TodayView.swift`, `OutsideGlance.swift`, `DuoJournal.swift`, `TimelineItemCard.swift`, `R/Views/Planner/WeekPlanView.swift`, `PeriodPlanView.swift`, `PlannerComponents.swift`, `R/Views/HalfOpen/HalfOpenView.swift`, `R/Views/Inbox/InboxView.swift`. Every reviewer runs `git diff --stat BASE..HEAD -- <those paths>` and expects no output (BASE is recorded in Task 1). `R/Views/Capture/TellSheet.swift` may change only by the one hunk Task 9 names, and its `Dictation` class not at all.
- Anti-goals, in the spec's words: "It feels like filling out a form." / "Symphony supplies ideas the person didn't ask for." / "Nagging: streaks, guilt counts, red "overdue", confetti." / "The free version costs real money per user (no AI calls in it)." Every title a signpost or a flag shows is the person's own words. No praise beyond the walk's own closing line.
- **In a light household speech stays on the phone, everywhere** (owner, 2026-11-14; the App Store listing will say so). The bar, and Tell Symphony wherever a light household can still open it, use `Dictation` with `onDeviceOnly = true`; where the phone cannot recognise on its own, they type. Never Apple's servers. In a full household Tell Symphony behaves exactly as today. `Dictation`'s code is not edited: what Tell must keep (its record-only session, `stop()` as a cancel, and, in a full household, recognition that may use the server) is in `PLANNING.md` and stays true.
- **Every write** goes through `WalkWriter` / `PlanWriter` / `ItemCompletion` and the sync queue, on the signed-in person's own rows, `context = "personal"`. Never a service role. Rows belonging to anyone else are never shown, edited or deleted.
- **Dates** come only from `PlanCalendar` (`day`, `addDays`, `weekStart`, `weekDays`, `monthStart`, `nextMonthStart`, `season(containing:boundaries:)`, `year(of:)`, `sameDay`, `ymd`), `WalkPeriods.pick` and `PlanSnapshot` (`week(_:)`, `isDated`, `inManualOrder`). No new date arithmetic.
- **Strings.** Every word these screens show or speak is a `DailyCopy` member (Task 1), or an existing `WalkCopy` member used **by name**. Never copy a `WalkCopy` string into code or a unit test: a clarity pass is rewording them. Curly quotes and apostrophes (’ “ ”). SF Symbols only, no emoji.
- **Look.** Fonts are the six bundled faces: board "Crimson Pro 400/500" is `CrimsonPro-Regular`; "DM Sans 400 / 500 / 600" is `DMSans-Regular / Medium / SemiBold`. Colours are `DailyPalette` (Task 8) with the hex values below. Flags and poles reuse the walk's views and `WalkPalette`.
- **Hand-planted, not ruled.** Every flag and signpost stands with a small fixed variation seeded by its identity through `WalkFooting.hand(_:_:)`; the same on every launch. The mountain pages call `WalkLayout.make(..., footing: .natural)`.
- **Touch and VoiceOver.** Every control is at least 44 × 44 points to the touch (a smaller drawing gets a larger hit shape). Everything a gesture does, VoiceOver can do by a button or a custom action.
- **Platforms.** Files in `R/Daily/Core` and `R/Daily/Data` import only Foundation, CoreGraphics and SwiftData and compile for the Mac too. Every other file under `R/Daily` is wrapped in `#if os(iOS) … #endif`, and so is any test file that uses `DailyModel` or `WalkTestSupport.swift`.
- **In flight in this folder.** "Task 22, natural footing" (`WalkLayout.make(..., footing:)`, `R/Walk/Core/WalkFooting.swift`) has just landed. A walk clarity pass is landing before this plan is built: it rewords `WalkCopy` (the plan-handle member becomes "See my whole plan"), and adds "Leave for now" (a walk left part-way is stored as paused, never reopened by itself, and picked back up from Settings). Where a task names a walk symbol, re-read the committed file first; where a name has moved, use the symbol that has the stated role and say so in the report. Do not change the walk's own controls except where Task 12 and Task 16 say.
- No typing in UI tests or by hand in the simulator (it stalls: `PLANNING.md`, "Known limitation"). States that need words come from the launch arguments.
- TDD for every pure piece. A view holds no rule: an `if` about behaviour belongs in the core with a test. Commit after each task with the message given, ending with the session's attribution lines.

## Review Focus

1. **Speech is refused, missing, or hears nothing at the bar.** The first tap on the small light for many people. Expected: the field takes the keyboard with one plain line, nothing empty is added, the light is never dead, and no audio leaves the phone. Pinned in Task 6 (`refusedSpeechOpensTypingAndStaysOff`, `nothingHeardAddsNothing`, `theBarListensOnThePhoneOnly`) and Task 9 (`lightSpeechStaysOnThePhone`).
2. **A day is said that is not on this page** ("dentist next Friday" on Today, or a weekday already past). Expected: it lands on that day, the bar says where it went and offers Undo; it never vanishes silently and never lands in the past. Pinned in Task 4 (`aDaySaidOffThisPageSaysSo`, `aDayAlreadyPastMeansNextWeeks`) and Task 6 (`anAddElsewhereSaysWhere`).
3. **The day turns while the app sits open, or it is reopened days later.** Expected: Today is today, yesterday's first thing is not today's, a signpost put away yesterday may show again, and yesterday's unfinished tasks are still reachable without a count or a red mark. Pinned in Task 2 (`yesterdaysFocusIsNotTodaysFirst`), Task 3 (`dismissalEndsWithTheDay`), Task 6 (`aNewDayIsReadWhenTheAppComesBack`) and Task 10 (`earlierOpenTasksWaitInTheFold`).
4. **Nothing at all, or a great deal.** Someone who left the walk on its first step has no goals and no tasks; someone else has 30 tasks today and eight areas. Expected: never an empty page with no way back: the scenery, a working bar, no empty ring, and the line that picks the walk back up; a bare mountain that still takes a goal; a long list that scrolls clear of the bar; a full ridge that still lays out. Pinned in Task 1 (`aWalkLeftPartWayIsWaiting`), Task 2 (`anEmptyDayHasNoRing`), Task 3 (`noKindNoSign`), Task 7 (`aShortPhoneStillShowsThreeRows`, `aWaitingWalkMakesRoomForItsLine`) and Task 13 (`aBareMountainAndAFullRidgeBothLayOut`).
5. **The household is, or becomes, full.** An invite is accepted while a light page, the Inbox sheet or the half-open display is up; or the household row has not synced. Expected: the full screens and the dock are there at once, no light page is left on top, and a full household never sees one. Pinned in Task 1 (`fullIsNeverReplaced`, `mixedOrUnknownEditionsAreFull`), Task 9 (`leavingTheLightPagesBringsTheDockBack`) and Task 21 (`FullHouseholdUnchangedUITests`).

Long and odd titles (one 60-letter word, 200 characters) are in the demo seed `quiet` and judged in Task 8's and Task 14's screenshots.

## The boards as numbers

All in points. Phone boards are 390 × 844 with the status area 44 and the home area 34.

**Colours (`DailyPalette`).** sky `#00106E` · paper `#FBF8F2` · ink `#1F2A2B` · muted `#56625F` · soft `#3F4B49` · lineage ink `#4A5654` · done ink `#6B7472` · strike `#A9B0AD` · open circle `#857D72` · line `#E6E0D6` · grabber `#D4CDC0` · green `#32664D` · deep green `#244B38` · ring track `#E2DCCF` · rust `#9A3D1F` · next fill `#FBEBE3` · next line `#F0CDBD` · chip fill `#F3F8F4` · chip line `#9CBCA8` · gold `#F6DFA6` · plank ink `#2C2219` · plank eyebrow `#6B4A1F` · post `#5A4735 → #2C2219` (left to right) · nail `#EFE9DB → #8C8474` (radial, 1 pt `#2C2219` rim) · field line `#CFC8BA` · placeholder `#5F6966` · first-thing flag `#E0A24A` · lineage flag `#A8452C` · shadow navy `rgb(0,14,70)`. The light as mic: radial at (42 %, 36 %) `#FFFDF4` 0, `#FFF0CC` 0.38, `#F7CF83` 0.72, `#E0A24A` 1, with a 1 pt ring `rgba(185,118,40,.3)`.

**The row of words.** Top at the safe-area top (44). Words Year · Season · Month · Week · Today, DM Sans 11.5, tracking 1.5, capitals, 18 apart (22 on the outside screen, 26 on the spread), each padded 14 above and below. Others white at 0.8; the page you are on white, SemiBold, with a 2 pt gold line 10 below the word. Shadow 0 1 6 navy at 0.7.

**The signpost** (phone). Post 7 wide at x 52, y 128 to 304, rounded 3 at the top. Plank at (24, 148) 304 × 64, gold, 2 pt plank-ink line on its top, left and bottom, left corners 4, its right end a point 31 deep; shadow 0 4 5 navy at 0.38. A strip 7 wide at x 26 inside the plank, plank ink at 0.14, with a 7 pt nail 5 from the plank's top and 5 from its bottom. Eyebrow at (46, 9) DM Sans SemiBold 10.5, tracking 1.4; title at (46, 26) Crimson Pro 19, plank ink; one line each. Board leans and tilts: post +1°, plank −1.6° (others: −1.4/+1.1, 0.6/−0.8, −0.8/+1.7, 1.5/−1.2, −0.5/+0.7): always opposed.

**The six signs** (eyebrow / title / a tap):

| Kind | Eyebrow | Title | A tap |
|---|---|---|---|
| day done | THAT’S THE DAY | Tomorrow: ‹tomorrow's first task› | Week, on tomorrow |
| first today | FIRST, TODAY | ‹the first thing› | lights that row |
| today open | TODAY IS OPEN · WAITING IN THE WEEK | ‹a week task with no day› | Week |
| new week | A NEW WEEK · WHAT MOVES THIS FORWARD? | ‹a month goal› | the walk's Week step about it |
| period ends | NOVEMBER ENDS ON MONDAY | Look back before it turns | that period's page |
| no piece | NO PIECE THIS WINTER YET | ‹a year goal› | walks that goal down |

**Today** (phone). Picture: the square `WalkOverlook` 430 wide at (−20, 0); band 340 high. Sheet: top 286, corners 28, shadow 0 −8 26 navy at 0.3; grabber 44 × 5 at y +9; the handle's words (the boards' "Look back up"; in the app the `WalkCopy` member for seeing the whole plan, see Task 8) DM Sans Medium 12 muted, centred at y +16…+40. Not on the boards (owner, 2026-11-14): while a walk left part-way is waiting, one quiet line 44 high sits under the handle, DM Sans Medium 13 deep green, centred, and everything below it starts 44 lower. Header at (22, +46): TODAY (DM Sans Medium 11, tracking 1.5, muted) over "Tuesday, 10 November" (Crimson Pro 27 / 32). Ring 56 at the right (radius 23, stroke 6, round cap, green on track; "1/4" DM Sans SemiBold 14). Next event card at (16, +110) 358 × 44, corners 14: time Crimson Pro 19 rust "3:00", title DM Sans 15.5, "NEXT" DM Sans SemiBold 11 tracking 1.2 rust at the right. Rows from y +164 (y +110 with no card), 358 × 54, 6 apart, white, 1 pt line, corners 16, padding 12: circle 26 (2 pt open-circle line; done: green with a white check), title DM Sans Medium 16 / 20 (done: done ink, struck), then a 10 × 12 flag mark, "for" DM Sans 12.5 / 16 lineage ink and the goal in Crimson Pro 14.5 green; the first thing carries a 14 × 16 first-thing flag at the right. A lit row has a 3 pt gold halo.

**The bar.** Field (64, 754) 262 × 48, white, 1.5 pt field line, corners 24, text DM Sans 16, padding 18 left and 5 right; the light 38 across at its right end with an SF `mic` glyph 20 in plank ink. More (SF `ellipsis`) at (6, 750) and Inbox (SF `tray`) at (328, 750), each 56 × 56 with a 10.5 label, muted. A line slot at y 724 (DM Sans 12.5 muted, centred). The paper fades in from y 696 to 740. **Speaking:** field (14, 754) 362 × 48 with a rust line, the light rust with a white glyph and a 5 pt halo `rgba(154,61,31,.18)`, More and Inbox hidden, the line "Listening. Say a day and it goes there." **Handover:** the light with a 7 pt halo `rgba(246,223,166,.6)` and a glow radius 26 `rgba(255,214,140,.95)`, the line "The light lives here now. Type, or tap it to speak." **On the mountain pages** the field is paper with a 1.5 pt plank-ink line, the icons and the hint white.

**Week** (phone). Picture 700 wide at (−150, −330); band 250 high; a navy veil from the top, 0.97 at 22 % fading out by 180. Up to two month-goal flags on the band: poles 3 wide at x 95 (y 128…190) and x 289 (y 112…180), a 17 × 5 shadow under each; cloths 32 high, at most 156 wide, 10 above the pole's top, DM Sans Medium 12.5 white, one line. Sheet top 204. Header at (22, +44): THIS WEEK over "8–14 November". List from y +104, 358 wide: the folded past days first (34 high, DM Sans 13 muted: "Sunday and Monday" … "3 done", a line under it); then each day: a 44-wide label (TUE DM Sans SemiBold 10.5 tracking 1.3 over "10" Crimson Pro 20 / 22; today's in rust, others muted), an 8 gap, then its lines; 8 above each day and a 1 pt line between days. An event: 30 high, time Crimson Pro 16 rust, title DM Sans 14.5 soft. An empty day: "open" DM Sans 13 open-circle colour, 34 high. A task: 46 high card (white, line, corners 14), a 40 × 44 circle button (circle 22), then its words (DM Sans Medium 15.5 / 19, lineage 12 / 15 with the goal in Crimson Pro 14), 5 below. Last group: ANY over "day". **Move to** panel: (12, 604) 366 wide, white, line, corners 18, shadow 0 8 22 navy at 0.16, padding 10 12 12; "MOVE TO" DM Sans SemiBold 11 tracking 1.3 muted; chips 36 high, corners 18, padding 13, DM Sans Medium 14: days in chip fill / chip line / deep green, "Pull it up" in next fill / next line / rust. The chosen task has the gold halo.

**Month, Season, Year** (the 390 × 844 stage). The row of words at y 44. Heading centred at y 102: Crimson Pro 40 / 46 white ("November", "2027") over DM Sans 14.5 white at 0.9 ("to Monday the 30th", "The year ahead"), shadow 0 2 10 navy at 0.6. A navy scrim from y 650 to the foot, to 0.82. Hint at y 722, DM Sans 12.5 white: "Tap a flag to move it or walk it down" (Month, Season), "Tap a peak to look closer" (Year). The bar at y 754 as above. A chosen flag glows gold and a panel stands at (20, 590) 350 wide: paper, corners 18, shadow 0 8 22 navy at 0.35, padding 10 12 12; one line DM Sans 12.5 soft ("Nothing under this one for winter yet."); chips as Week's: "Walk it down" (chip fill), "Move to" (white, line, ink), "Pull it up" (next fill, rust).

**The handover.** The walk's light (`WalkOrb.centre`, radius 48 on the stage) shrinks and travels to the bar's light (38 across) while Today's sheet rises from 154 lower; then the handover halo and line.

**Duo, outside screen** (466 × 678, status area 22). Picture 500 wide at (−17, −34); band 240. Row of words at y 22. Post at x 70, y 82…212; plank (42, 96) 350 × 60, point 29 deep, text at x 44, eyebrow y 8, title y 24 at 20. Sheet top 190, corners 26, no "Look back up"; header at (22, +26); ring 52; card (16, +90) 434 × 42; rows from +142, 434 × 52. Field (68, 604) 330 × 48; More (8, 600); Inbox (402, 600).
*As found (Task 17):* the real outside screen (the Duo simulator) has no top inset and a 34-point foot, and the system keeps an 84-point column on the right instead of a 22-point status band; the light page stands left of that column, 382 wide, so these numbers hold only on the board's own window (see "Calls made in this plan").

**Duo, opened flat** (890 × 626). Picture 1000 wide at (−55, −150); band 230; a navy veil 70 high from 0.7. Four words at y 10: Year · Season · Month · "Week and today". Signpost on the right page: post x 520, y 66…196; plank (492, 82) 338 × 60. Month flags on the left: poles x 190 (108…172) and x 352 (96…166). Sheet top 176 across both, corners 26; a 40-wide soft shade down the fold at x 445. Left page: header (24, 198) "THE REST OF THIS WEEK" over the range; list (16, 262) 400 wide, rows at least 44 high with a line above each (day label 50 wide, circle 22, the same type as Week), the past-days line last. Right page: header (476, 198) 392 wide with a 52 ring; card (470, 262) 404 × 40; rows (470, 310) 404 × 50, 5 apart; field (470, 566) 338 × 48. More at (20, 562), Inbox at (814, 562).

**Duo, half open.** *Laptop (626 × 890, fold at 445):* above the fold the picture 900 wide at (−137, −120) under a navy veil (0.78, 300 high); the time Crimson Pro 124 at (40, 26) with the date DM Sans 17 under it; "NEXT · 3:00" DM Sans SemiBold 13 tracking 1.8 gold at (40, 200) over the event in Crimson Pro 38 / 44; post x 74, y 310…460, 8 wide; plank (44, 330) 470 × 78, point 39 deep, nails 8, eyebrow (50, 11) 12.5, title (50, 31) Crimson Pro 27. A 22 pt shade under the fold. Below, on paper: "TO DO TODAY" DM Sans SemiBold 13 tracking 1.8 muted at (32, +31) with a 60 ring; open rows from (24, +103), 578 × 72, 8 apart, corners 20 (circle 34, title DM Sans Medium 22 / 27, lineage 15 with the goal in Crimson Pro 18); "1 done" DM Sans 14 muted; field (24, 808) 578 × 58, corners 29, text 20, the light 44. No row of words, no Inbox or More. *Book (890 × 626, fold at 445):* left the picture 1000 wide at (−330, −150), veil 0.8 over 380; time 112 at (32, 26); next at (32, 196) in 34 / 40; post x 56, y 440…640; plank (28, 462) 350 × 68, point 34 deep, title 22. Right: header (477, 30) 385 wide; rows (467, 106) 405 × 70 (circle 32, title 20 / 25, goal 17); field (467, 544) 405 × 58.

## File map

- `R/Daily/Core/`: `DailyGate.swift` (who sees the light pages), `DailyCopy.swift` (every string), `DailyClock.swift` (now, pinnable in Debug), `DailyDay.swift` (today's rows, first thing, ring, next event), `Signpost.swift` (the rule, its memory, its hand), `DailyAdd.swift` (what the bar's words mean), `DailyBar.swift` (the bar's reducer), `DailyWeek.swift` (days, fold, chips), `DailyMetrics.swift` (frames), `MountainPage.swift` (a mountain page's state), `DailyHandover.swift` (the light's path).
- `R/Daily/Data/DailyWriter.swift`: rows, through `WalkWriter`, `PlanWriter` and `ItemCompletion`.
- `R/Daily/DailyModel.swift`: the one observable object. `R/Daily/DailyDemo.swift`: Debug seeds and launch arguments.
- `R/Daily/Views/`: `DailyPalette.swift`, `LightPlannerView.swift`, `DailyNavRow.swift`, `SignpostView.swift`, `DailyBand.swift`, `DailySheet.swift`, `DailyRows.swift`, `DailyBarView.swift`, `LightTodayView.swift`, `LightWeekView.swift`, `MountainPageView.swift`, `LightSpreadView.swift`, `LightHalfOpenView.swift`, `HandoverLight.swift`.
- Modified outside `Daily/`: `R/App/AppState.swift`, `R/App/MainView.swift`, `R/App/DemoMode.swift`, `R/Views/Planner/PlannerView.swift`, `R/Services/CalendarFeed.swift` (Debug demo events only), `R/Walk/Views/WalkSceneView.swift` and `WalkEndingSheet.swift` (Tasks 12 and 21), `R/Views/Capture/TellSheet.swift` (Task 9, one hunk), `R/Services/AuthService.swift` and `R/Views/Shared/AuthView.swift` (Task 20), `U/LightEditionUITests.swift`, `apple/SymphonyOS/PLANNING.md`.

---

## Stage A: the Today a new person lands on

### Task 1: One gate, every string, and the full household's picture before anything changes

**Files:**
- Create: `R/Daily/Core/DailyGate.swift`, `R/Daily/Core/DailyCopy.swift`, `R/Daily/Core/DailyClock.swift`
- Test: `T/DailyGateTests.swift`, `T/DailyCopyTests.swift`

**Interfaces:**
- Consumes: `Edition`, `Horizon`, `TodayLayout`, `WalkPeriods`, `WalkLevel`, `PlanCalendar`.
- Produces:

```swift
enum DailyGate {
    static let horizons: Set<Horizon> = []                 // light pages that are built; Tasks 8, 11, 14 add
    static let layouts: Set<TodayLayout> = [.oneColumn]    // window shapes that are built; Tasks 17, 18 add. Never .glanceWide
    static let barBuilt = false                            // Task 9
    static let halfOpenBuilt = false                       // Task 19
    static func shows(_ horizon: Horizon, edition: Edition, layout: TodayLayout,
                      horizons: Set<Horizon> = horizons, layouts: Set<TodayLayout> = layouts) -> Bool
    static func hidesDock(edition: Edition, layout: TodayLayout, barBuilt: Bool = barBuilt,
                          horizons: Set<Horizon> = horizons, layouts: Set<TodayLayout> = layouts) -> Bool
    static func halfOpen(edition: Edition, built: Bool = halfOpenBuilt) -> Bool
    /// Speech never leaves the phone in a light household, wherever it is heard.
    static func speechOnPhoneOnly(edition: Edition) -> Bool
    /// A walk this person left part-way is stored and can be picked back up.
    static func walkIsWaiting(_ position: WalkPosition?) -> Bool
}
enum DailyClock { @MainActor static func now() -> Date }   // Debug: `-SymphonyDailyNow YYYY-MM-DD` pins it to noon that day
enum DailyCopy {
    static func nav(_ h: Horizon) -> String                // "Year" "Season" "Month" "Week" "Today"
    static let weekAndToday = "Week and today", navLabel = "Where you are"
    static let today = "Today", showMyWeek = "Show my week", next = "Next", open = "open"
    static let walkWaiting = "Your walk is waiting. Pick it back up."
    static let restOfWeek = "The rest of this week", toDoToday = "To do today", moveTo = "Move to", anyDay = "Any day"
    static let firstToday = "First today", notFirst = "Not first today", details = "Details"
    static let speakIt = "Speak it", stopListening = "Stop listening", inbox = "Inbox", more = "More"
    static let handover = "The light lives here now. Type, or tap it to speak."
    static let walkItDown = "Walk it down", lookBackBeforeItTurns = "Look back before it turns"
    static let dayDone = "That’s the day", firstTodaySign = "First, today"
    static let todayOpen = "Today is open · Waiting in the week", newWeek = "A new week · What moves this forward?"
    static let putSignAway = "Put this sign away for today"
    static func placeholder(_ h: Horizon, periods: WalkPeriods) -> String
    static func listening(_ h: Horizon) -> String
    static func hint(_ level: WalkLevel) -> String
    static func date(_ d: Date) -> String                  // "Tuesday, 10 November"
    static func clock(_ d: Date) -> String                 // "3:00"
    static func weekEyebrow(_ start: Date, today: Date) -> String
    static func weekRange(_ start: Date) -> String
    static func pastDays(_ days: [Date]) -> String
    static func done(_ n: Int) -> String                   // "3 done"
    static func dayLabel(_ d: Date) -> (label: String, number: String)   // ("TUE", "10")
    static func chip(_ d: Date?, today: Date) -> String    // "Today", "Wed", "Any day"
    static func tomorrow(_ title: String) -> String        // "Tomorrow: Choose the tile"
    static func periodEnds(_ name: String, lastDay: Date) -> String
    static func noPiece(_ seasonWord: String) -> String
    static func heading(_ level: WalkLevel, periods: WalkPeriods, today: Date) -> (title: String, sub: String)
    static func nothingUnder(_ level: WalkLevel, periods: WalkPeriods) -> String
    static func itsOn(_ day: Date, today: Date) -> String  // "It’s on Friday the 20th."
    static func signHint(_ kind: String) -> String         // what a tap does, for VoiceOver; keyed by Signpost.Kind.rawValue
}
```

Exact copy the signatures do not fix: `placeholder`: today "Add to today", week "Add to this week", month "Add a goal for November", season "Add a goal for winter" (`periods.seasonWord`), year "Add a goal for 2027". `listening`: today and week "Listening. Say a day and it goes there."; otherwise "Listening." `hint`: year "Tap a peak to look closer"; season, month "Tap a flag to move it or walk it down". `weekEyebrow`: "This week", "Next week" (the week after today's), else "Week". `weekRange`: "8–14 November" (en dash); across months "29 November – 5 December". `pastDays`: one day "Sunday"; two "Sunday and Monday"; three or more "Sunday to Tuesday"; none "Earlier". `heading`: month ("November", "to Monday the 30th", with `WalkPeriods.ordinal`); season ("Winter", "to Sunday, 28 February"); year ("2027", "The year ahead" when later than today's calendar year, else "This year"). `nothingUnder`: year "Nothing under this one for winter yet."; season "Nothing under this one for November yet."; month "Nothing under this one this week yet." `periodEnds("November", …)` → "November ends on Monday". `noPiece("winter")` → "No piece this winter yet". Views put eyebrows in capitals; `DailyCopy` stores sentence case. Date words use `Locale(identifier: "en_US")` and `PlanCalendar.calendar`, as `WalkCopy` does.

- [ ] **Step 1: Record BASE.** `git rev-parse HEAD` goes at the top of the report: every later reviewer's "must not change" diff starts there.

- [ ] **Step 2: Take the full household's pictures now.** With SHOT, but arguments `-SymphonyDemo` alone and `xcrun simctl status_bar 29378388-0323-4E79-AD34-D46BA52A3461 override --time 9:41` first: Today, and Today with each of `-TodaySize 466x678`, `-TodaySize 626x890`, `-TodaySize 890x626`, `-HalfOpen laptop`, `-HalfOpen book`. Save as `daily-shots/baseline/<name>.png`. Task 21 retakes them.

- [ ] **Step 3: Write the failing tests** (`DailyGateTests`, `DailyCopyTests`)

```swift
@Test func fullIsNeverReplaced() {
    let all = Set(Horizon.allCases), shapes: Set<TodayLayout> = [.oneColumn, .glance, .glanceWide, .dayPage, .journal]
    for h in all { for l in shapes {
        #expect(!DailyGate.shows(h, edition: .full, layout: l, horizons: all, layouts: shapes))
        #expect(!DailyGate.hidesDock(edition: .full, layout: l, barBuilt: true, horizons: all, layouts: shapes))
    } }
    #expect(!DailyGate.halfOpen(edition: .full, built: true))
}
@Test func mixedOrUnknownEditionsAreFull() {     // the gate is the household edition
    for rows: [String?] in [["light", "full"], [nil], ["light", nil], ["plus"]] {
        #expect(!DailyGate.shows(.today, edition: Edition.resolve(rows), layout: .oneColumn, horizons: [.today]))
    }
}
@Test func lightGetsOnlyWhatIsBuilt() {
    #expect(DailyGate.shows(.today, edition: .light, layout: .oneColumn, horizons: [.today], layouts: [.oneColumn]))
    #expect(!DailyGate.shows(.week, edition: .light, layout: .oneColumn, horizons: [.today], layouts: [.oneColumn]))
    #expect(!DailyGate.shows(.today, edition: .light, layout: .journal, horizons: [.today], layouts: [.oneColumn]))
}
@Test func sidewaysKeepsTheOldScreens() { #expect(!DailyGate.layouts.contains(.glanceWide)) }
@Test func lightSpeechIsPhoneOnlyAndFullIsAsBefore() {
    #expect(DailyGate.speechOnPhoneOnly(edition: .light)); #expect(!DailyGate.speechOnPhoneOnly(edition: .full))
}
@Test func aWalkLeftPartWayIsWaiting() {      // build each position with WalkPosition(WalkState(), status:, planted: [], periods:, now:)
    // the status a walk left part-way is stored with → true, on step 0 and step 1 too; nil, in progress and finished → false
}
@Test func theDockGivesWayOnlyWithTheBarAndToday() {
    #expect(!DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: false, horizons: [.today]))
    #expect(!DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: true, horizons: []))
    #expect(DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: true, horizons: [.today]))
}
```

`DailyCopyTests`, with `periods = WalkPeriods.pick(now: day(2026, 11, 10), weekStartsOn: 0)`: `weekRange(day(2026,11,8)) == "8–14 November"`; `weekRange(day(2026,11,29)) == "29 November – 5 December"`; `pastDays([day(2026,11,8), day(2026,11,9)]) == "Sunday and Monday"`; the one-day, three-day and empty forms above; `periodEnds("November", lastDay: day(2026,11,30)) == "November ends on Monday"`; `heading(.month, …) == ("November", "to Monday the 30th")`; `heading(.year, …) == ("2027", "The year ahead")`; `placeholder(.month, …) == "Add a goal for November"`; `chip(day(2026,11,10), today: day(2026,11,10)) == "Today"`, `chip(day(2026,11,11), …) == "Wed"`, `chip(nil, …) == "Any day"`; `clock` of 15:00 `== "3:00"`; every `static let` contains no straight apostrophe.

- [ ] **Step 4: Run** TEST with `DailyGateTests`, then `DailyCopyTests`. Expected: BUILD fails, "cannot find 'DailyGate' in scope".

- [ ] **Step 5: Implement the three files.** `shows` is `edition == .light && horizons.contains(horizon) && layouts.contains(layout)`; `hidesDock` is `barBuilt && shows(.today, …)`; `halfOpen` is `edition == .light && built`; `speechOnPhoneOnly` is `edition == .light`. `walkIsWaiting`: a clarity task landing just before this plan lets the walk be left part-way ("Leave for now") and stores that walk as paused; it is never reopened by itself, and Settings offers "Pick the walk back up". Re-read `WalkTypes.swift`, `WalkPosition.swift` and `SettingsView.swift` as committed: if the walk already exposes the test Settings uses to offer that button, call it here and write no second rule; otherwise it is "the stored position's status is the paused one". If that clarity task has not landed when this task is built, stop and say so.

- [ ] **Step 6: Run** both suites. Expected: all pass.

- [ ] **Step 7: Commit** `Daily: one gate for the light pages, and every word they show`

### Task 2: Today's rows, what each is for, the first thing, the ring and the next event

**Files:**
- Create: `R/Daily/Core/DailyDay.swift`
- Test: `T/DailyDayTests.swift`

**Interfaces:**
- Consumes: `WalkEnding.Row`, `WalkEnding.rows(tasks:goals:today:me:firstThing:)`, `WalkEnding.forGoal` (the lineage lookup: do not write another), `TaskFocus`, `TimelineItem`, `PlanSnapshot.inManualOrder`.
- Produces:

```swift
enum DailyDay {
    typealias Row = WalkEnding.Row
    struct Next: Equatable { let title: String; let start: Date }
    /// The signed-in person's own rows the light pages may show: theirs, personal or with no life area, not let go, not a step.
    static func mine(_ tasks: [SymphonyTask], me: UUID) -> [SymphonyTask]
    /// The open task of my oldest `TaskFocus` row for today (by `createdAt`, then id), if that task is mine and dated today.
    static func firstThing(focus: [TaskFocus], tasks: [SymphonyTask], today: Date, me: UUID) -> UUID?
    static func rows(tasks: [SymphonyTask], goals: [Goal], focus: [TaskFocus], today: Date, me: UUID) -> [Row]
    static func ring(_ rows: [Row]) -> (done: Int, total: Int)?            // nil with no rows
    static func split(_ rows: [Row]) -> (open: [Row], done: Int)           // the half-open display
    static func nextEvent(_ events: [TimelineItem], ticked: Set<String>, now: Date) -> Next?
    static func tomorrowFirst(tasks: [SymphonyTask], today: Date, me: UUID) -> SymphonyTask?
}
```

`rows` is `WalkEnding.rows` with `firstThing` from above. `nextEvent` is the rule `WalkModel.nextUp` uses: a timed event that starts after `now`, not all day, its `eventKey` not in `ticked`; the earliest. `tomorrowFirst` is the first open task of `mine` dated tomorrow, in `PlanSnapshot.inManualOrder`.

- [ ] **Step 1: Write the failing tests.** Fixtures as `WalkLoadTests` (`day(y,m,d)`; `me`, `other`; `today = day(2026, 11, 10)`).
  - `aTaskShowsWhatItIsFor`: goal "Finish the bathroom"; season task `goalId` → it; month task `sourceId` → season, `goalId` copied; week task today `sourceId` → month with `goalId` nil. `rows(...).first?.forGoal == "Finish the bathroom"`.
  - `aTaskWithNoLinkHasNoFor`: `forGoal == nil`.
  - `theFirstThingIsMyOldestOpenFocusToday`: two focus rows today, the older one's task done → the newer task's id; both open → the older; the first row of `rows` has `first == true` and no other has.
  - `yesterdaysFocusIsNotTodaysFirst`: a focus row dated `day(2026,11,9)` on a task now dated today → `firstThing == nil`.
  - `onlyMyPersonalRows`: tasks of `other`, and mine with `context` "family" and "work", and a dismissed one, and a step (`parentTaskId` set) → none in `rows`; a goal of `other` is never named as `forGoal`.
  - `anEmptyDayHasNoRing`: `ring([]) == nil`; four rows with one done → `(1, 4)`.
  - `nextEventSkipsPastAllDayAndTicked`; `tomorrowFirstFollowsTheListOrder`; `doneRowsFoldToACount` (`split`).
- [ ] **Step 2: Run** TEST `DailyDayTests`. Expected: "cannot find 'DailyDay' in scope".
- [ ] **Step 3: Implement `DailyDay`.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `Daily: today's rows say what each is for, and which comes first`

### Task 3: The signpost's rule

**Files:**
- Create: `R/Daily/Core/Signpost.swift`
- Test: `T/SignpostTests.swift`

**Interfaces:**
- Consumes: `DailyDay`, `DailyCopy`, `WalkCopy.thatsTheDay` (by name), `WalkLoad.items(goals:tasks:periods:me:planted:areas:)`, `WalkEnding.nextToWalk`, `WalkPeriods.pick`, `PlanSnapshot(...).week(_:)`, `PlanCalendar`, `WalkFooting.hand`.
- Produces:

```swift
enum Signpost {
    enum Kind: String, CaseIterable, Codable { case dayDone, firstToday, todayOpen, newWeek, periodEnds, noPiece }   // the fixed order
    enum Target: Equatable { case week(Date), light(UUID), walkDown(UUID, WalkLevel), page(Horizon, Date) }
    struct Named: Equatable { let id: UUID; let title: String }
    struct Ending: Equatable { let horizon: Horizon; let name: String; let lastDay: Date }
    struct Facts: Equatable {
        var today: Date
        var rows: [DailyDay.Row] = []          // today's
        var tomorrowFirst: String?
        var anyDay: Named?                     // the week's first open task with no day
        var weekCount = 0                      // every task on this week, dated or not, done or not
        var monthGoal: Named?                  // the first month goal of the walk's month
        var ending: Ending?
        var noPiece: Named?                    // the first year goal with nothing under it this season
        var seasonWord = ""
    }
    struct Sign: Equatable { let kind: Kind; let eyebrow: String?; let title: String; let target: Target; let seed: String
        var label: String { get } }            // VoiceOver: eyebrow, title, then DailyCopy.signHint
    static func pick(_ f: Facts, dismissed: Set<Kind> = []) -> Sign?
    static func ending(today: Date, seasons: [SeasonBoundary]?) -> Ending?
    static func facts(tasks: [SymphonyTask], goals: [Goal], focus: [TaskFocus], commitments: [TaskCommitment],
                      today: Date, me: UUID, seasons: [SeasonBoundary]?) -> Facts
    /// Degrees, fixed by the seed: the post leans 0.5…1.5 either way; the plank tilts 0.7…1.7 the other way.
    static func hand(_ seed: String) -> (lean: Double, tilt: Double)
}
/// Which kinds were put away, per person, for one day: `UserDefaults` key `daily.signpost.<user id lowercased>`.
struct SignpostMemory {
    var defaults: UserDefaults = .standard
    func dismissed(for userId: UUID?, on day: Date) -> Set<Signpost.Kind>
    func dismiss(_ kind: Signpost.Kind, for userId: UUID?, on day: Date)
}
```

The rule, first true and not dismissed wins:
1. `dayDone`: `rows` is not empty and every row is done. Eyebrow `DailyCopy.dayDone`, title `DailyCopy.tomorrow(tomorrowFirst)`; with no task tomorrow the eyebrow is nil and the title is `WalkCopy.thatsTheDay`. Target `.week(tomorrow)`.
2. `firstToday`: a row with `first` and not done. Title its own; target `.light(id)`.
3. `todayOpen`: `rows` is empty and `anyDay != nil`. Title that task's; target `.week(today)`.
4. `newWeek`: `weekCount == 0` and `monthGoal != nil`. Title that goal's; target `.walkDown(id, .month)`.
5. `periodEnds`: `ending != nil`. Eyebrow `DailyCopy.periodEnds(name, lastDay:)`, title `DailyCopy.lookBackBeforeItTurns`, target `.page(horizon, today)`.
6. `noPiece`: `noPiece != nil`. Eyebrow `DailyCopy.noPiece(seasonWord)`, title that goal's; target `.walkDown(id, .year)`.

`ending`: the year, then the season (`PlanCalendar.season(containing:boundaries:).lastDay`), then the month; the first whose last day is today or within the next two days. `facts` reads `DailyDay.mine` only; the week through `PlanSnapshot(tasks: mine, commitments:, focus:, routines: [], instances: [], userId: me, domain: nil).week(PlanCalendar.weekStart(today))`; `monthGoal` and `noPiece` from `WalkLoad.items(..., periods: WalkPeriods.pick(now: today, seasons: seasons), ...)` and `WalkEnding.nextToWalk`. `seed` is the kind's raw value, a colon, and the id it points at (or `PlanCalendar.ymd` of the day).

- [ ] **Step 1: Write the failing tests**

```swift
@Test func theFirstTrueKindShows() {
    var f = Signpost.Facts(today: day(2026, 11, 10))
    f.noPiece = .init(id: g, title: "More slow weekends together"); f.seasonWord = "winter"
    #expect(Signpost.pick(f)?.kind == .noPiece)
    f.ending = .init(horizon: .month, name: "November", lastDay: day(2026, 11, 30));  #expect(Signpost.pick(f)?.kind == .periodEnds)
    f.monthGoal = .init(id: m, title: "Pick the tile and pay the deposit");           #expect(Signpost.pick(f)?.kind == .newWeek)
    f.anyDay = .init(id: w, title: "Measure the bathroom window"); f.weekCount = 1;   #expect(Signpost.pick(f)?.kind == .todayOpen)
    f.rows = [row("Send the contractor the deposit", first: true)];                  #expect(Signpost.pick(f)?.kind == .firstToday)
    f.rows = [row("Send the contractor the deposit", first: false, done: true)]; f.tomorrowFirst = "Choose the tile"
    let s = Signpost.pick(f)
    #expect(s?.kind == .dayDone); #expect(s?.title == DailyCopy.tomorrow("Choose the tile")); #expect(s?.target == .week(day(2026, 11, 11)))
}
```

  - `everyTitleIsThePersonsOwn`: for the five kinds that carry a title of theirs, `sign.title` contains the fixture's title unchanged; for `periodEnds` it is `DailyCopy.lookBackBeforeItTurns`.
  - `noKindNoSign`: `pick(Facts(today:)) == nil`.
  - `dayDoneWithNothingTomorrow`: eyebrow nil, title `WalkCopy.thatsTheDay`.
  - `aSignPutAwayLetsTheNextShow`: with `firstToday` and `noPiece` both true, `pick(f, dismissed: [.firstToday])?.kind == .noPiece`.
  - `dismissalEndsWithTheDay` and `dismissalIsPerPerson` (`SignpostMemory` over `UserDefaults(suiteName:)`): put away on 10 November → in the set on the 10th, empty on the 11th, empty for another id.
  - `theLastThreeDays`: `ending(today: day(2026,11,27), …) == nil`; the 28th, 29th and 30th give `(.month, "November", day(2026,11,30))`; `day(2026,12,31)` gives `.year` named "2026"; a household season ending 14 March gives `.season` on 12 March.
  - `theHandIsFixedAndOpposed`: same seed, same pair; for 50 seeds `0.5...1.5` contains `abs(lean)`, `0.7...1.7` contains `abs(tilt)`, and `lean * tilt < 0`.
  - `factsReadOnlyMyPersonalRows`: another person's month goal and a family task this week change nothing.
- [ ] **Step 2: Run** TEST `SignpostTests`. Expected: "cannot find 'Signpost' in scope".
- [ ] **Step 3: Implement.** `hand`: `lean = sign × (0.5 + |WalkFooting.hand(seed, "sign.lean")|)`, its sign that of the same hand; `tilt = −sign × (0.7 + |WalkFooting.hand(seed, "sign.tilt")|)`.
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `Daily: one signpost at a time, six kinds in a fixed order, in the person's own words`

### Task 4: What the bar's words mean

**Files:**
- Create: `R/Daily/Core/DailyAdd.swift`
- Test: `T/DailyAddTests.swift`

**Interfaces:**
- Consumes: `WalkWords.tidy`, `WalkWords.maxTitle`, `CaptureParser.parse`, `CaptureParser.Result`, `PlanCalendar`.
- Produces:

```swift
enum DailyAdd {
    enum Page: Equatable { case today, week, goal(WalkLevel) }       // .goal(.year | .season | .month)
    enum Add: Equatable {
        /// `day` nil: on the week, no day. `at`: the moment said, when a time was said. `here`: it shows on the page it was added from.
        case task(title: String, day: Date?, at: Date?, here: Bool)
        case goal(title: String, level: WalkLevel)
    }
    static func read(_ raw: String, on page: Page, today: Date, weekStart: Date,
                     parse: (String) -> CaptureParser.Result = CaptureParser.parse) -> Add?
}
```

Rules: `WalkWords.tidy(raw)` first; nil (nothing, or only fillers) adds nothing. A goal page keeps every word and pulls no day. Today and Week pass the tidied words to `parse`: with no date, Today lands on `today` and Week on no day; with a date it lands on that day. A day before `today` moves on one week; if it is still before today the date is ignored and the tidied words stay whole. `here` is "the day is today" on Today, and "no day, or a day in `weekStart`'s seven days" on Week.

- [ ] **Step 1: Write the failing tests**, each with a stand-in `parse` so nothing depends on the clock: `todayLandsOnTodayUnlessADayIsSaid`; `weekLandsOnTheWeekWithNoDay` (`.task(title: "Renew the passport", day: nil, at: nil, here: true)`); `aDaySaidOffThisPageSaysSo` ("Dentist" parsed to 20 November from Today → `here == false`, `day == day(2026,11,20)`); `aDayAlreadyPastMeansNextWeeks` (parsed to 9 November with today the 10th → the 16th; parsed to 3 March → no day pulled, title the whole words); `aTimeIsKept` (`at` is 15:00 that day); `fillersAloneAddNothing` ("um", "   ", "okay"); `aGoalKeepsEveryWord` ("Run a 5K on Saturday" on `.goal(.year)` → that title, and `parse` is never called); `longWordsAreCutAtAWord` (a 400-character input → `title.count <= WalkWords.maxTitle`); `aDayAloneIsATitle` ("tomorrow").
- [ ] **Step 2: Run** TEST `DailyAddTests`. Expected: "cannot find 'DailyAdd' in scope".
- [ ] **Step 3: Implement `read`.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `Daily: the bar reads a day out of what was said, and never into the past`

### Task 5: Rows, through the writers the app already has

**Files:**
- Create: `R/Daily/Data/DailyWriter.swift`
- Test: `T/DailyWriterTests.swift` (wrapped in `#if os(iOS)`; store from `walkTestContext()`)

**Interfaces:**
- Consumes: `WalkWriter` (`create`, `ensureArea`, `dropAreaIfUnused`, `remove`, `restore`, `setArea`, `setFirstThing`), `PlanWriter` (`planTask(_:on:focusToday:)`, `clearDay`, `move(_:to:)` with `.day(_, allDay: false)`, `undo`), `ItemCompletion.set`, `WalkClassifier.place`, `DailyAdd.Add`, `DailyDay.Row`.
- Produces:

```swift
@MainActor struct DailyWriter {
    init(context: ModelContext, userId: UUID, periods: WalkPeriods)
    struct Added: Equatable { let id: UUID; let level: WalkLevel; let areaId: UUID?
        let placed: String? }        // the area's name, when the words moved it off the focused peak
    @discardableResult func add(_ add: DailyAdd.Add, kept: [WalkArea] = [], focusArea: UUID? = nil, parent: WalkItem? = nil) -> Added
    func takeBack(_ added: Added)
    func setDone(_ row: DailyDay.Row, _ done: Bool, today: Date)
    func move(_ taskId: UUID, to day: Date?) -> PlanWriter.Snapshot?       // nil day: on the week, no day
    func undoMove(_ snapshot: PlanWriter.Snapshot)
    func pullUp(_ id: UUID, level: WalkLevel)
    func putBack(_ id: UUID)
    func setArea(_ id: UUID, level: WalkLevel, to area: WalkArea?)
    func setFirst(_ id: UUID?, previous: UUID?)
}
```

It holds one `WalkWriter` for its whole life (pull-up and put-back share that writer's memory). A task is `WalkWriter.create` with a `.week` item; a time said is then set with `PlanWriter.move(_, to: .day(at, allDay: false))`. A year goal's area is `WalkClassifier.place(title, kept:, focus: focusArea)`; a season or month goal under `parent` takes the parent's area and links as the walk's do; with no parent it is placed by its words with no focus. `setDone` builds a `.task` `TimelineItem` for the row and calls `ItemCompletion.set`. Every method first checks the row's `userId` is this person's and otherwise does nothing.

- [ ] **Step 1: Write the failing tests:** `aTaskAddedTodayIsPersonalOnTodayAndQueued` (`context == "personal"`, `PlanCalendar.sameDay(scheduledFor, today)`, a `PendingChange` insert for `tasks`, an open week `TaskCommitment`, no `TaskFocus`); `aTaskWithNoDayIsOnTheWeek` (`scheduledFor == nil`, `bucket == "week"`); `aTimeSaidIsKept` (`isAllDay == false`, hour 15); `aYearGoalGoesWhereItsWordsBelong` ("Run a marathon", Health and Home kept, focus Home → Health's id and `placed == "Health"`; `Goal.year == periods.year`); `aGoalUnderAFlagLinksUp` (a month goal under a season item: `sourceId` the season task, `goalId` copied, `areaId` the parent's, `linksDirty`); `undoTakesTheRowBack` (after `takeBack`: no task and no `PendingChange` for it); `pullUpThenPutBackRestoresTheLinks`; `movingToADayKeepsTheWeek` (commitment still open, `scheduledFor` the new day, no `TaskFocus` made); `anyDayClearsTheDay`; `tickingGoesThroughTheAppsOwnPath` (`completed` true and an update queued); `someoneElsesRowIsNeverTouched` (`setDone`, `move`, `pullUp`, `setArea` on a task whose `userId` is `other`: unchanged, nothing queued); `nothingTheWalkNeverSends` (`isGoal == false`, `goalTaskId == nil` on every row made).
- [ ] **Step 2: Run** TEST `DailyWriterTests`. Expected: "cannot find 'DailyWriter' in scope".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `Daily: adds, moves, ticks and pull-ups go through the walk's writer and the sync queue`

### Task 6: How the bar behaves, and the one model behind the pages

**Files:**
- Create: `R/Daily/Core/DailyBar.swift`, `R/Daily/DailyModel.swift` (`#if os(iOS)`)
- Test: `T/DailyBarTests.swift`, `T/DailyModelTests.swift` (`#if os(iOS)`; `ManualWalkScheduler`, `FakeWalkListener`, `walkTestContext()`)

**Interfaces:**
- Consumes: `WalkScheduling`, `WalkListening`, `Dictation`, `WalkState.undoMs`, `WalkState.noteMs`, `WalkOrb.finishMs`, `WalkCopy.speechOff`, `WalkCopy.nothingHeard`, `WalkCopy.placed` (by name), `DailyAdd`, `DailyWriter`, `SignpostMemory`, `DailyClock`.
- Produces:

```swift
struct DailyBar: Equatable {
    enum Mic: Equatable { case idle, listening, finishing }
    var draft = ""; var mic: Mic = .idle; var speechOff = false
    var note: String?; var undoShowing = false
    var fieldAsked = 0                                  // bumped when the field should take the keyboard
    enum Event: Equatable { case typed(String), submitted, micTapped, heard(String), speechUnavailable,
                            listenEnded, finishExpired, did(note: String?), undoTapped, undoExpired, noteExpired, left }
    enum Timer: Equatable { case undo, note, finish }
    enum Effect: Equatable { case add(String), listen(Bool), finishListening, undo, timer(Timer, ms: Int?) }   // nil cancels
    mutating func apply(_ event: Event) -> [Effect]
}
@MainActor @Observable final class DailyModel {
    private(set) var bar = DailyBar()
    private(set) var today: Date
    private(set) var periods: WalkPeriods               // WalkPeriods.pick(now: today, seasons:)
    private(set) var dismissed: Set<Signpost.Kind>
    private(set) var lit: UUID?                         // the row a signpost tap lit
    var page: DailyAdd.Page = .today
    /// Set by a mountain page: where a goal added from the bar hangs.
    var hanging: (kept: [WalkArea], focusArea: UUID?, parent: WalkItem?, periods: WalkPeriods)?
    init(context: ModelContext, userId: UUID, seasons: [SeasonBoundary]? = nil,
         clock: @escaping @MainActor () -> Date = DailyClock.now, scheduler: WalkScheduling? = nil,
         listener: WalkListening? = nil, memory: SignpostMemory = SignpostMemory())
    static func makeListener() -> Dictation             // onDeviceOnly = true, playsAlongside = false
    func send(_ event: DailyBar.Event)
    func toggle(_ row: DailyDay.Row)
    func move(_ taskId: UUID, to day: Date?)
    func pullUp(_ id: UUID, level: WalkLevel)
    func setArea(_ id: UUID, level: WalkLevel, to area: WalkArea?, from old: UUID?)
    func setFirst(_ id: UUID?, previous: UUID?)
    func light(_ id: UUID?)                             // a second tap on the same sign, or any tick, puts it out
    func dismiss(_ kind: Signpost.Kind)
    func refreshDay()                                   // re-reads the clock; on a new day: today, periods, dismissed, lit and the note start over
}
```

The reducer: `micTapped` while idle starts listening and clears the draft, unless `speechOff`, when it only asks for the field. Words heard fill the draft. `micTapped` while listening is `finishing`: `[.finishListening, .timer(.finish, ms: WalkOrb.finishMs)]`. `listenEnded` or `finishExpired` while finishing: back to idle and, if the draft is not empty, `[.add(draft)]` with the draft cleared; if empty, the note `WalkCopy.nothingHeard` and the field asked. `listenEnded` while still listening (the session died): idle, the words stay in the field, nothing is added. `speechUnavailable`: `speechOff`, the note `WalkCopy.speechOff`, the field asked. `typed` only changes the draft while idle. `submitted` with a draft: `[.add(draft)]`. `did(note:)` shows Undo for `WalkState.undoMs` and the note for `WalkState.noteMs`. `undoTapped`: `[.undo]`. `left`: `[.listen(false)]`, idle, the draft kept.

The model carries effects out: `.add` reads the words with `DailyAdd.read` for `page` and writes with `DailyWriter` (a goal uses `hanging`); the note after an add is `DailyCopy.itsOn` when the task is not `here`, `WalkCopy.placed(name)` when `Added.placed` is set, otherwise nil. Undo takes back only the last thing: an add, a move, a pull-up, or a change of area. After `await listener.start()`, a `listener.problem` is `.speechUnavailable`. Timers run through the scheduler under keys `daily.undo`, `daily.note`, `daily.finish`.

- [ ] **Step 1: Write the failing reducer tests** (`DailyBarTests`): `tappingTheLightListensAndASecondTapFinishes`; `theLastWordsAreWaitedFor` (finishing until `listenEnded`, or `finishExpired`); `nothingHeardAddsNothing` (effects contain no `.add`; `note == WalkCopy.nothingHeard`; `fieldAsked == 1`); `refusedSpeechOpensTypingAndStaysOff` (after `speechUnavailable`, a later `micTapped` returns no `.listen`); `aSessionThatDiesKeepsItsWordsInTheField`; `returnAddsWhatWasTyped`; `anEmptyReturnAddsNothing`; `undoShowsThenGoes`; `leavingStopsListening`.
- [ ] **Step 2: Write the failing model tests** (`DailyModelTests`): `speakingAddsATaskToday` (drive `micTapped`, `settle()`, `listener.hear("Call the plumber about the leak")`, `micTapped`, `listener.end()`: one task of that title dated today; `bar.undoShowing`); `undoTakesItBackAndOnlyIt`; `undoGoesAfterSevenSeconds` (`advance(WalkState.undoMs)`); `anAddElsewhereSaysWhere` (typed words a stand-in parser dates 20 November: `bar.note == DailyCopy.itsOn(day(2026,11,20), today:)`); `aGoalAddedFromAMountainPageHangsWhereThePageSays`; `theBarListensOnThePhoneOnly` (`DailyModel.makeListener().onDeviceOnly == true` and `playsAlongside == false`); `aNewDayIsReadWhenTheAppComesBack` (a clock closure moved to the 11th, `refreshDay()`: `today` is the 11th, `dismissed` empty, `lit == nil`); `aTickPutsTheLitRowOut`.
- [ ] **Step 3: Run** TEST `DailyBarTests`, then `DailyModelTests`. Expected: "cannot find 'DailyBar' in scope".
- [ ] **Step 4: Implement both files.**
- [ ] **Step 5: Run.** Expected: pass.
- [ ] **Step 6: Commit** `Daily: the bar types or listens on the phone, adds at once, and offers Undo for seven seconds`

### Task 7: Where everything sits

**Files:**
- Create: `R/Daily/Core/DailyMetrics.swift`
- Test: `T/DailyMetricsTests.swift`

**Interfaces:**
- Consumes: `TodayLayout`, `Signpost.Named`, `Signpost.hand`, `WalkFooting.hand`.
- Produces:

```swift
struct DailyMetrics: Equatable {
    enum Shape: Equatable { case tall, short }      // short: the Duo's outside screen, and any window under 760 high
    struct Sign: Equatable { let post: CGRect; let plank: CGRect; let point: CGFloat; let strip: CGRect   // strip: in the plank's own space
        let nail: CGFloat; let eyebrow: CGPoint; let title: CGPoint; let eyebrowSize: CGFloat; let titleSize: CGFloat }
    struct Bar: Equatable { let field: CGRect; let speaking: CGRect; let light: CGFloat
        let more: CGRect; let inbox: CGRect; let line: CGFloat; let fade: CGRect }
    let size: CGSize; let navTop: CGFloat; let navGap: CGFloat
    let band: CGRect; let picture: CGRect               // the square picture's frame on the page
    let sheetTop: CGFloat; let sheetRadius: CGFloat
    let sign: Sign; let bar: Bar
    let lookBack: CGRect?                               // nil on a short window
    let waiting: CGRect?                                // the waiting walk's line, 44 high under the handle; nil without one
    let header: CGRect; let ring: CGFloat
    let card: CGRect; let rowsTop: CGFloat; let rowsTopNoCard: CGFloat; let row: CGFloat; let rowGap: CGFloat; let inset: CGFloat
    static func shape(for layout: TodayLayout, height: CGFloat) -> Shape
    static func today(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat, shape: Shape = .tall, waiting: Bool = false) -> DailyMetrics
    static func week(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat) -> DailyMetrics
    var touchTargets: [CGRect] { get }                  // field, light, More, Inbox, the handle, the waiting line, the sign, each ≥ 44 × 44
    struct BandFlag: Equatable, Identifiable { let id: UUID; let title: String; let pole: CGRect; let cloth: CGRect
        let lean: Double; let tilt: Double }
    static func bandFlags(_ goals: [Signpost.Named], width: CGFloat, navTop: CGFloat) -> [BandFlag]   // two at most
}
```

How the boards stretch to a real window: `navTop` is the safe-area top. Offsets down the page are from `navTop` (tall: sign post +84, plank +104, sheet +242; short: post +60, plank +74, sheet +168). Left and right insets are fixed and widths take the rest (tall plank: left 24, right 62; field: 64 each side; speaking: 14 each side). The bar's foot is `max(safeBottom + 8, tall 42 | short 26)` above the window's bottom; More and Inbox are 56 × 56, 4 above the field's top, 6 in from each edge (short: 8). The picture's frame scales with the window's width from the board's (Today 430 wide at x −20, y 0 on a 390 board; Week 700 at −150, −330; short 500 at −17, −34 on 466). `light` is 38; its touch shape is 44 wide and the field's full height. `bandFlags`: poles at 0.244 and 0.741 of the width, feet at `navTop + 146` and `navTop + 136`, 62 and 68 long, the cloth `min(156, 18 + 6 × letters)` wide, centred on its pole and 10 above its top; each foot moves up to ±6 by `WalkFooting.hand(id, "band.ground")`, each pole leans up to ±1.8°, each cloth tilts 0.9…1.3° the other way.

- [ ] **Step 1: Write the failing tests**

```swift
@Test func theTodayBoard() {
    let m = DailyMetrics.today(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34)
    #expect(m.band == CGRect(x: 0, y: 0, width: 390, height: 340));       #expect(m.picture == CGRect(x: -20, y: 0, width: 430, height: 430))
    #expect(m.sheetTop == 286);                                           #expect(m.sheetRadius == 28)
    #expect(m.sign.post == CGRect(x: 52, y: 128, width: 7, height: 176)); #expect(m.sign.plank == CGRect(x: 24, y: 148, width: 304, height: 64))
    #expect(m.sign.eyebrow == CGPoint(x: 46, y: 9));                      #expect(m.sign.title == CGPoint(x: 46, y: 26))
    #expect(m.lookBack?.midX == 195);                                     #expect(m.header.minY == 332)
    #expect(m.card == CGRect(x: 16, y: 396, width: 358, height: 44));     #expect(m.rowsTop == 450); #expect(m.rowsTopNoCard == 396)
    #expect(m.row == 54);                                                 #expect(m.rowGap == 6)
    #expect(m.bar.field == CGRect(x: 64, y: 754, width: 262, height: 48)); #expect(m.bar.speaking == CGRect(x: 14, y: 754, width: 362, height: 48))
    #expect(m.bar.more == CGRect(x: 6, y: 750, width: 56, height: 56));   #expect(m.bar.inbox == CGRect(x: 328, y: 750, width: 56, height: 56))
    #expect(m.bar.line == 724);                                           #expect(m.bar.fade == CGRect(x: 0, y: 696, width: 390, height: 44))
}
@Test func theWeekBoard() {
    let m = DailyMetrics.week(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34)
    #expect(m.band.height == 250); #expect(m.picture == CGRect(x: -150, y: -330, width: 700, height: 700))
    #expect(m.sheetTop == 204);    #expect(m.header.minY == 248); #expect(m.rowsTopNoCard == 308)
}
```

  - `aBiggerPhoneKeepsItsInsets`: 402 × 874, safe 62 / 34 → `bar.field == CGRect(x: 64, y: 784, width: 274, height: 48)`, `sheetTop == 304`, `abs(picture.width - 443.23) < 0.01`.
  - `aShortPhoneStillShowsThreeRows`: `shape(for: .oneColumn, height: 667) == .short`; for 375 × 667, safe 20 / 0, short: `rowsTop + 3 * row + 2 * rowGap <= bar.fade.minY` and `lookBack == nil`.
  - `aWaitingWalkMakesRoomForItsLine`: the Today board with `waiting: true`: `waiting == CGRect(x: 16, y: 326, width: 358, height: 44)`, `header.minY == 376`, `card.minY == 440`, `rowsTop == 494`; the bar and the sign are where they were; with `waiting: false`, `waiting == nil`.
  - `everyTouchTargetIsAtLeast44`: for the three sizes above, with and without a waiting walk, every `touchTargets` rect has width and height ≥ 44 and none meets another.
  - `bandFlagsAreHandPlantedAndTwoAtMost`: three goals → two flags; same goals, same frames on a second call; the two feet differ in y; each `lean * tilt < 0`; a 40-letter title's cloth is 156 wide.
- [ ] **Step 2: Run** TEST `DailyMetricsTests`. Expected: "cannot find 'DailyMetrics' in scope".
- [ ] **Step 3: Implement** (the short shape's numbers are "Duo, outside screen" above; its own board test comes in Task 17).
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `Daily: the boards' numbers, stretched to the window from its safe edges`

### Task 8: Today on the page

**Files:**
- Create: `R/Daily/Views/DailyPalette.swift`, `LightPlannerView.swift`, `DailyNavRow.swift`, `SignpostView.swift`, `DailyBand.swift`, `DailySheet.swift`, `DailyRows.swift`, `LightTodayView.swift`; `R/Daily/DailyDemo.swift`
- Modify: `R/Views/Planner/PlannerView.swift` (one branch), `R/App/DemoMode.swift` (the daily seed instead of the family one), `R/Services/CalendarFeed.swift` (Debug only: with `-SymphonyDaily`, `items(for:)` returns `DemoMode.dailyEvents(on:)`), `R/Daily/Core/DailyGate.swift` (`horizons = [.today]`)
- Test: `T/DailyDemoTests.swift` (`#if os(iOS) && DEBUG`)

**Interfaces:**
- Consumes: Tasks 1 to 7; `WalkPeriods.switcherDate`, `OpenedItemSheet`, `CalendarFeed.shared`, `WalkCopy.rowLabel`, `rowDone`, `rowOpen`, `ring`, `ringLabel`, `forGoal`, `nothingToday`, `pullUp` (by name); the `WalkCopy` member for the handle that shows the whole plan (it reads "See my whole plan" after the clarity pass, which renames `lookBackHandle`: use the member, never the string); the walk's stored position for this person (today `WalkPositionStore().load(for:)`) and the request Settings' "Pick the walk back up" makes to resume it.
- Produces:
  - `struct LightPlannerView<Full: View>: View { init(@ViewBuilder full: @escaping () -> Full) }`: owns the `DailyModel` (`@State`), measures the window, works out `TodayLayout.decide`, and for the horizon on screen draws the light page when `DailyGate.shows(...)`, otherwise `full()`. It calls `model.refreshDay()` when the scene becomes active and once a minute.
  - `PlannerView.body` becomes `if appState.edition == .light { LightPlannerView { full } } else { full }`, where `full` is today's body, unchanged.
  - `struct DailyNavRow: View { init(current: Horizon, gap: CGFloat, words: [Horizon] = [.year, .season, .month, .week, .today], go: @escaping (Horizon) -> Void) }`. A tap sets `appState.selectedDate` from `WalkPeriods.switcherDate(for:viewing:edition:now:seasons:)` when it returns a date, then `appState.horizon`.
  - `struct SignpostView: View { init(sign: Signpost.Sign, metrics: DailyMetrics.Sign, tappable: Bool = true, tap: @escaping () -> Void, putAway: @escaping () -> Void) }`
  - `struct DailyBand: View { init(picture: CGRect, height: CGFloat, veil: Double = 0) }`
  - `struct DailySheet<Content: View>: View` (paper, grabber, optional "Look back up"), `struct DailyRow: View`, `struct DailyRing: View { init(done: Int, total: Int, diameter: CGFloat = 56) }`, `struct DailyNextCard: View`, `struct DailyFlagMark: Shape`.
  - Debug (`DailyDemo.swift`): `DemoMode.isDaily` (`-SymphonyDaily`), `dailySeed` (`-SymphonyDailySeed morning|done|open|newweek|quiet|nopiece|empty`, default `morning`), `dailyPage` (`-SymphonyDailyPage today|week|month|season|year`), `dailyStates` (`-SymphonyDailyState a,b,…`), `@MainActor static func seedDaily(_ ctx: ModelContext, seed: String, today: Date)`, `static func dailyEvents(on: Date) -> [TimelineItem]`.
  - Accessibility identifiers: `daily.today`, `daily.nav.<horizon raw value>`, `daily.signpost`, `daily.ring`, `daily.lookBack`, `daily.walkWaiting`.

What the views do (rules are already in the core):
- The page ignores the safe area: band, row of words, signpost, then the sheet from `sheetTop` to the foot, its rows scrolling under the fade. With no sign, the scenery stands alone. With no rows, the sheet shows `WalkCopy.nothingToday` where the rows would start, and no ring.
- **A waiting walk.** While `DailyGate.walkIsWaiting(the stored position)`, the sheet's first line is a button reading `DailyCopy.walkWaiting` (`metrics.waiting`); a tap makes exactly the request Settings' "Pick the walk back up" makes, so the walk reopens at its saved step. It is not a signpost kind, it is never put away by a swipe, and the signpost shows or not as its own rule says. It is read again whenever the page appears and whenever a walk closes. So a brand-new person who left on the first step lands on the scenery, this line, `WalkCopy.nothingToday`, and (from Task 9) the bar.
- The sheet's handle shows the walk's "see my whole plan" member; its tap is wired in Task 15.
- A row is one button: a tap ticks or unticks it (`model.toggle`). Press and hold opens a menu: `DailyCopy.firstToday` or `notFirst`, `DailyCopy.details` (the existing `OpenedItemSheet`), `WalkCopy.pullUp`.
- The signpost is one button. A tap follows its `target`: `.light` → `model.light(id)`; `.week(date)` and `.page(h, date)` set `appState.selectedDate` and `appState.horizon`; `.walkDown` does nothing until Task 15. A sideways swipe of more than 60 points puts it away (`model.dismiss`). Its post and plank turn by `Signpost.hand(sign.seed)` about the post's foot and the plank's left end. Eyebrow and title are one line each, shrinking to 0.75 before they cut.
- The old dock is still under the page in this task; the bar comes in Task 9.
- The seed (`morning`), written through `WalkWriter` as `DemoMode.walkPreview` writes: Health, Home, People kept. Year: "Feel strong again" (Health), "Finish the bathroom" (Home), "More slow weekends together" (People). Season: "Strength twice a week" under the first, "Bathroom done by February" under the second. Month: "Find a gym that fits", "Pick the tile and pay the deposit", "Clear out the old vanity". Today: "Send the contractor the deposit" (under "Pick the tile…", the first thing), "Tour the gym on Main Street" (under "Find a gym…"), "Renew the passport" (no link), "Call Mum about Sunday lunch" (`goalId` the People goal; done). Tomorrow: "Choose the tile". Four days on, or the week's last day if sooner: "Slow morning, pancakes". No day: "Measure the bathroom window". Each earlier day of the week has done tasks, three in all when there are two such days. Events: today 15:00 "Bathroom design meeting", two days on 9:30 "Dentist". The other seeds change only what their sign needs: `done` ticks all four; `open` has nothing today; `newweek` has no week tasks; `quiet` gives every year goal a season piece, marks no first thing, and adds one 200-character task and one 60-letter single word; `nopiece` is `morning` with no first thing; `empty` seeds nothing.

- [ ] **Step 1: Write the failing test** `DailyDemoTests`: for each seed, `seedDaily` into `walkTestContext()` with `today = day(2026, 11, 10)`, then `Signpost.pick(Signpost.facts(...))?.kind` is: `morning` `.firstToday`, `done` `.dayDone`, `open` `.todayOpen`, `newweek` `.newWeek`, `nopiece` `.noPiece`, `empty` nil; `quiet` nil on the 10th and `.periodEnds` when seeded and read on `day(2026, 11, 28)`. `morning`'s first row has `forGoal == "Finish the bathroom"`.
- [ ] **Step 2: Run** TEST `DailyDemoTests`. Expected: "type 'DemoMode' has no member 'seedDaily'".
- [ ] **Step 3: Implement** the seed and arguments, then the views, then the gate (`horizons = [.today]`) and the `PlannerView` branch.
- [ ] **Step 4: Run** `DailyDemoTests`, `DailyGateTests`, and `EditionTests`. Expected: pass.
- [ ] **Step 5: Screenshots** (SHOT): `today-morning`, `-SymphonyDailySeed done`, `open`, `newweek`, `nopiece`, `empty`, `quiet` with `-SymphonyDailyNow 2026-11-28`, `morning` with `-SymphonyDailyState point` (the first row lit), and `empty` with `-SymphonyDailyState waiting` (a Debug state that shows the waiting line: the demo keeps no stored walk). Check the picture's crop, the signpost's nails on the post line, the lean and tilt, the ring, the lineage line and the first-thing flag against the numbers. Then launch with `-SymphonyDemo` alone: Today is the old Today.
- [ ] **Step 6: Commit** `Light Today: the scenery, the signpost, the list with what each task is for, and the ring`

### Task 9: The bar on Today; Inbox and More beside it; the dock gives way

**Files:**
- Create: `R/Daily/Views/DailyBarView.swift`
- Modify: `R/Daily/Views/LightTodayView.swift`, `LightPlannerView.swift`, `R/App/AppState.swift`, `R/App/MainView.swift`, `R/Daily/Core/DailyGate.swift` (`barBuilt = true`), `R/Views/Capture/TellSheet.swift` (one hunk in the `TellSheet` view), `U/LightEditionUITests.swift`
- Test: `T/DailyGateTests.swift` (add), `T/EditionTests.swift` (add)

**Interfaces:**
- Consumes: `DailyModel`, `DailyMetrics.Bar`, `InboxView`, `MoreView`, `WalkCopy.undo` (by name).
- Produces:
  - `enum DailyPanel: String, Identifiable { case inbox, more }` (in `DailyGate.swift`).
  - `AppState`: `var dailyHidesDock = false`, `var dailyPanel: DailyPanel?`, `func leaveDaily()` (both back to off). `bottomInset` is 0 while `dailyHidesDock`.
  - `struct DailyBarView: View { init(model: DailyModel, metrics: DailyMetrics.Bar, placeholder: String, listening: String, night: Bool = false, icons: Bool = true) }`. Identifiers `daily.bar.field`, `daily.bar.light`, `daily.bar.inbox`, `daily.bar.more`, `daily.undo`.
  - `MainView`: the bottom dock and the side dock are not drawn, and no side padding is added, while `appState.dailyHidesDock`; `applyEdition()` calls `appState.leaveDaily()` whenever the edition is not light; `considerWalk` sets `appState.dailyPanel = nil` where it closes the capture sheet.

Behaviour: `LightPlannerView` sets `dailyHidesDock` from `DailyGate.hidesDock(edition:layout:)` for the window it measured, and off when it goes away. Inbox and More open as large sheets over the page (`NavigationStack { InboxView() }`, `NavigationStack { MoreView() }`, drag indicator shown), from `appState.dailyPanel`. The line slot shows, in this order of need: the listening line, the bar's note, Undo (a 44-high button reading `WalkCopy.undo`, beside the note when there is one). The field and the line rise with the keyboard. While speaking the field takes the speaking frame and More and Inbox hide. Leaving the page sends `.left`.

**Tell Symphony in a light household.** A light household can still reach `TellSheet` three ways: the old wide glance when the phone is on its side, the old half-open display until Task 19, and the Lock Screen control or a `symphony://tell` link (`appState.tellRequested`). (a) In `TellSheet`'s body, before its first `listener.start()`, set `listener.onDeviceOnly = DailyGate.speechOnPhoneOnly(edition: appState.edition)` (the view gains `@Environment(AppState.self)`); nothing else in that file changes, so a full household's Tell is as it was, and where the phone cannot recognise on its own a light Tell shows `Dictation`'s own problem line and its text field. (b) `LightTodayView` answers `appState.tellRequested` as the old Today does, but by clearing it and sending `.micTapped` to the bar when it is idle: no sheet.

- [ ] **Step 1: Write the failing tests:** `leavingTheLightPagesBringsTheDockBack` (`AppState` with `dailyHidesDock = true`, `dailyPanel = .inbox`; after `leaveDaily()` both are off and `bottomInset == dockHeight`); `noDockNoInset` (`dailyHidesDock = true` → `bottomInset == 0`); in `DailyGateTests`, `theDockGivesWayNow` (`DailyGate.hidesDock(edition: .light, layout: .oneColumn)` is true with the real statics, false for `.full` and for `.glanceWide`) and `lightSpeechStaysOnThePhone` (`Dictation.mayListen(onDeviceOnly: DailyGate.speechOnPhoneOnly(edition: .light), supportsOnDevice: false) == false`, so a light household with no on-device recogniser never listens through a server; the same call with `.full` is `true`, as Tell has always been; and `DailyModel.makeListener().onDeviceOnly == true`).
- [ ] **Step 2: Run** TEST `EditionTests`, `DailyGateTests`. Expected: "value of type 'AppState' has no member 'leaveDaily'".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Update `LightEditionUITests.testLightDockHasPlannerInboxAndMoreOnly`** (rename `testLightHasTheBarAndNoDock`; launch adds `-SymphonyDaily`; wait for `daily.today`): `daily.bar.field`, `daily.bar.inbox` and `daily.bar.more` exist; no button "Planner", "Routines" or "Add"; tapping `daily.bar.more` shows "Settings" and no "Projects", "Lists", "Contacts". `testFullDockStillHasRoutines` is untouched and must still pass.
- [ ] **Step 5: Run** the unit suites, then `-only-testing:SymphonyOSUITests/LightEditionUITests` and `SymphonyOSUITests/WalkUITests`. Expected: pass.
- [ ] **Step 6: Screenshots:** `today-morning` (now with the bar and no dock), `-SymphonyDailyState speak` (the stand-in listener says "Call the plumber about the leak": the speaking board), `-SymphonyDailyState undo` (one task added, Undo showing), and More's sheet. Until Tasks 11 and 14, light's Week, Month, Season and Year are the old pages with no dock under them; their title menu still switches. That is expected here and must not ship.
- [ ] **Step 7: Commit** `Light Today: a plain bar to add with the light as its mic, Inbox and More beside it, and no dock`

## Stage B: Week

### Task 10: The week's days

**Files:**
- Create: `R/Daily/Core/DailyWeek.swift`
- Test: `T/DailyWeekTests.swift`

**Interfaces:**
- Consumes: `DailyDay`, `DailyCopy`, `PlanCalendar.weekDays`, `PlanSnapshot.week(_:)`, `isDated`, `inManualOrder`, `WalkEnding.forGoal`.
- Produces:

```swift
enum DailyWeek {
    enum Line: Equatable, Identifiable { case event(id: String, time: String, title: String), task(DailyDay.Row), open }
    struct Day: Equatable, Identifiable { let date: Date?        // nil: Any day
        let label: String; let number: String; let isToday: Bool; let lines: [Line] }
    struct Past: Equatable { let label: String; let done: Int    // tasks done on the folded days
        let days: [Day]; let earlier: [DailyDay.Row] }           // earlier: still open from before this week
    struct Week: Equatable { let start: Date; let eyebrow: String; let range: String
        let past: Past?; let days: [Day] }                       // today to the week's last day, then Any day when it holds anything
    static func make(tasks: [SymphonyTask], goals: [Goal], commitments: [TaskCommitment], focus: [TaskFocus],
                     events: (Date) -> [TimelineItem], weekStart: Date, today: Date, me: UUID) -> Week
    static func rest(_ week: Week) -> [Day]                      // the days after today, then Any day (the Duo's left page)
    struct Chip: Equatable, Identifiable { let label: String; let day: Date?; var id: String { label } }
    static func chips(for taskDay: Date?, weekStart: Date, today: Date) -> [Chip]
}
```

Rules: only `DailyDay.mine`. A day's lines are its events by start time (an all-day event's time is empty), then its tasks in `PlanSnapshot.inManualOrder`, done ones left in place; a day with neither is `.open`. Days before today fold into `past` (`label` from `DailyCopy.pastDays`, `done` their done tasks). `earlier` is every open task of mine dated before `weekStart`, or left on an earlier week with no day; with any of those, `past` exists even on the week's first day, and its count never includes them. A week that is not today's has no `past`. Chips: each day from today to the week's last except the task's own ("Today", "Wed", …), then "Any day" unless the task has no day; a past day is never offered.

- [ ] **Step 1: Write the failing tests** (week of Sunday 8 November 2026, today the 10th): `daysRunFromTodayToTheWeeksEnd` (labels TUE WED THU FRI SAT; with `weekStart` Monday the 9th they run to SUN); `pastDaysFoldToOneLine` (`past?.label == "Sunday and Monday"`, `done == 3`); `earlierOpenTasksWaitInTheFold` (an open task dated 6 November is in `past.earlier`; `past.done` unchanged; with today the 8th and that task, `past?.label == "Earlier"`); `theFirstDayWithNothingBehindHasNoFold`; `anEmptyDayIsOpen`; `eventsComeFirstAndAreNotTasks`; `anyDayComesLastAndOnlyWhenItHoldsSomething`; `aDoneTaskStaysWhereItWas`; `rowsSayWhatTheyAreFor`; `chipsOfferTheOtherDaysThenAnyDay` (a task on Tuesday: Wed, Thu, Fri, Sat, Any day; a task with no day: Today, Wed, Thu, Fri, Sat); `onlyMyPersonalRows`; `theRestOfTheWeekLeavesTodayOut`.
- [ ] **Step 2: Run** TEST `DailyWeekTests`. Expected: "cannot find 'DailyWeek' in scope".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `Daily: the week by day, past days folded to a line, and nothing unfinished lost`

### Task 11: Week on the page

**Files:**
- Create: `R/Daily/Views/LightWeekView.swift`
- Modify: `R/Daily/Views/LightPlannerView.swift`, `DailyBand.swift` (band flags), `R/Daily/Core/DailyGate.swift` (`horizons` adds `.week`), `R/Daily/DailyDemo.swift` (states `select`, `unfold`)

**Interfaces:**
- Consumes: `DailyWeek`, `DailyMetrics.week`, `DailyMetrics.bandFlags`, `DailyModel.move`, `pullUp`, `toggle`, `WalkBannerView` or `WalkNotchedCloth` and `WalkPoleView` for the band's flags, `WalkPalette.level(.month)`, `WalkCopy.pullUp` (by name).
- Produces: `struct LightWeekView: View`; identifiers `daily.week`, `daily.week.fold`, `daily.moveTo`.

Behaviour: the week is `PlanCalendar.weekStart(appState.selectedDate)`. The band carries up to two of the walk's month goals as flags (those with the most tasks this week first, then list order); a tap on one opens Month. A task's circle ticks it. A tap on its words chooses it (gold halo) and raises the Move to panel with `DailyWeek.chips` and `WalkCopy.pullUp`; a chip moves it and closes the panel; a second tap on the words lets go. Every move and pull-up shows Undo. The fold is a button: opened, the past days and then the earlier rows show above today, each with the same circle and words. Events take no tap. The bar's placeholder is the week's; `model.page = .week`.

- [ ] **Step 1: Implement**, then `horizons` adds `.week`.
- [ ] **Step 2: Run** TEST `DailyGateTests`, `DailyWeekTests`. Expected: pass.
- [ ] **Step 3: Screenshots:** `-SymphonyDailyPage week`; the same with `-SymphonyDailyState select` (the panel, a chip for every other day, "Any day", the rust chip); with `unfold`; and seed `empty` (every day "open", no flags on the band). Check the two band flags are not level with each other.
- [ ] **Step 4: Commit** `Light Week: the days of the week, a tap to move a task, and this month's flags on the hill`

## Stage C: Month, Season and Year

### Task 12: The mountain can be drawn without the walk's model

**Files:**
- Modify: `R/Walk/Views/WalkSceneView.swift` (re-read it as committed first: it is in flight)

**Interfaces:**
- Produces:

```swift
struct WalkWorldView: View {       // the stage's sky, the world (picture, labels, posts, banners) and the top band; no words
    init(layout: WalkLayout, art: WalkArt, dropsIn: Bool = true,
         actions: @escaping (WalkLayout.Banner) -> [(name: String, run: () -> Void)] = { _ in [] },   // VoiceOver custom actions
         onLabel: @escaping (WalkLayout.Label) -> Void,
         onBanner: @escaping (WalkLayout.Banner, WalkLayout.Post) -> Void)
}
```

`WalkSceneView` keeps its `init(model:)` and becomes `WalkWorldView` plus its own words, sending the same events as now. This is a move of code, not a change: the camera glide, the Reduce Motion cross-fade, hit testing and every accessibility label stay as they are.

- [ ] **Step 1: Before:** SHOT with `-SymphonyDemo -SymphonyLight -SymphonyWalk -SymphonyWalkStep 1` and `-SymphonyWalkStep 3` (no `-SymphonyDaily`), saved as `before-1.png`, `before-3.png`.
- [ ] **Step 2: Extract `WalkWorldView`.**
- [ ] **Step 3: Run** TEST `WalkLayoutTests`, `WalkModelTests`, `WalkFlowTests`, then `-only-testing:SymphonyOSUITests/WalkUITests`. Expected: pass, with no test edited.
- [ ] **Step 4: After:** the same two screenshots. Expected: the same pictures.
- [ ] **Step 5: Commit** `Walk: the mountain draws from a layout alone, so other pages can stand on it`

### Task 13: A mountain page's state

**Files:**
- Create: `R/Daily/Core/MountainPage.swift`
- Test: `T/MountainPageTests.swift`

**Interfaces:**
- Consumes: `WalkState`, `WalkItem`, `WalkArea`, `WalkPostKey`, `WalkLoad.areas`, `WalkLoad.items`, `WalkLayout.make(_:today:art:footing:)`, `WalkLayout.tapEvent`, `WalkPosition`, `WalkPeriods`, `WalkTurn.meet`, `DailyCopy.nothingUnder`.
- Produces:

```swift
struct MountainPage: Equatable {
    let level: WalkLevel                               // .year, .season or .month
    var items: [WalkItem]; var areas: [WalkArea]; var kept: [UUID]
    var selected: UUID?; var focus: UUID?              // focus: a flag one level up (Season, Month)
    var focusArea: UUID?                               // a zoomed peak (Year)
    var expanded: WalkPostKey?; var moving = false
    /// The page's own level is the period holding `selected`; the levels above are the walk's (`WalkPeriods.pick(now: today)`).
    static func periods(level: WalkLevel, selected: Date, today: Date, seasons: [SeasonBoundary]?) -> WalkPeriods
    /// The saved walk's kept areas, and every area with a flag on it, in `areas` order.
    static func kept(items: [WalkItem], areas: [WalkArea], saved: [UUID]) -> [UUID]
    init(level: WalkLevel, items: [WalkItem], areas: [WalkArea], saved: [UUID])   // every item `mine`; nothing below `level` kept
    var walkState: WalkState { get }                   // step = level.rawValue, off the ground, this page's focus and selection
    static func lookBack(items: [WalkItem], areas: [WalkArea], kept: [UUID]) -> WalkState    // step 6, every level
    enum Event: Equatable { case flag(UUID), peak(UUID), post(WalkPostKey), moveTapped, moveTo(UUID), pullUp, walkDown, letGo }
    enum Effect: Equatable { case setArea(UUID, WalkLevel, to: UUID?, from: UUID?), pullUp(UUID, WalkLevel), walkDown(UUID), open(Horizon) }
    mutating func apply(_ event: Event) -> [Effect]
    var panel: (line: String?, canWalkDown: Bool, moveTo: [WalkArea])? { get }   // nil with nothing selected; needs `periods` for the line
    var periods: WalkPeriods?                          // set by the view; used by `panel` and `walkDown`
    /// Opens the walk one level below `item`, about it: a quick walk, in progress, `focus[level + 1] = item.id`.
    static func walkDown(_ item: WalkItem, items: [WalkItem], areas: [WalkArea], kept: [UUID],
                         periods: WalkPeriods, now: Date) -> WalkPosition
    static func canWalkDown(_ item: WalkItem, in walkItems: [WalkItem]) -> Bool   // only a flag of the walk's own periods
}
```

Rules: `.flag(id)` on this page's level selects it, and lets go on a second tap; on the level just above (Season, Month pages) it focuses it, or lets go; anything else is ignored. `.peak(id)` on Year zooms that area, or back out. `.post(key)` opens that post. `.moveTapped` shows the areas (every area but the flag's own); `.moveTo(area)` gives `.setArea` and, if the area was not kept, keeps it. `.pullUp` gives `.pullUp` and clears the selection. `.walkDown` gives `.walkDown(selected)` only when `canWalkDown`. `.letGo` clears selection and `moving`. The panel's line is `DailyCopy.nothingUnder` when the selected flag has nothing under it one level down, else nil.

- [ ] **Step 1: Write the failing tests:** `theOwnLevelFollowsTheDateAndTheLevelsAboveFollowTheWalk` (month page, `selected` 28 November, `today` 28 November: `monthStart` is 1 November while `WalkPeriods.pick(now:)` says December; `year` and `season` equal the pick's); `aYearPageShowsTheYearItWasOpenedOn` (`selected` 1 January 2027 → `year == 2027`; `selected` 29 December 2026 → 2026); `thePageDrawsItsLevelAndAbove` (`walkState.step == 3`, no `.week` item, every item `mine`); `aBareMountainAndAFullRidgeBothLayOut` (no items: `WalkLayout.make(page.walkState, today:, footing: .natural)` has no banners and does not trap; eight areas with four month goals each under season and year goals: every banner inside `WalkLayout.edges`, none above `WalkLayout.question`, and no two banners of the page's level meet by `WalkTurn.meet` on their `corners`); `aTapChoosesAFlagAndASecondLetsGo`; `aFlagOneLevelUpIsFocused`; `aPeakZoomsOnYear`; `moveToOffersTheOtherAreasAndKeepsANewOne`; `pullUpLetsGo`; `walkDownOpensTheNextLevelAboutTheFlag` (a year flag: `position.step == 2`, `position.focus["2"] == id`, `depth == .quick`, `status == .inProgress`, `kept` holds its area, `planted` holds every item's id); `walkDownIsOnlyForTheWalksOwnPeriods`; `keptIsTheSavedAreasAndThoseInUse`; `thePanelSaysWhatIsMissingBelow`; `lookBackShowsEveryLevel` (`step == 6`).
- [ ] **Step 2: Run** TEST `MountainPageTests`. Expected: "cannot find 'MountainPage' in scope".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `Daily: a mountain page is the walk's own layout with no question, at the period you opened`

### Task 14: Month, Season and Year on the page

**Files:**
- Create: `R/Daily/Views/MountainPageView.swift`
- Modify: `R/Daily/Views/LightPlannerView.swift`, `R/Daily/Core/DailyGate.swift` (`horizons` adds `.month`, `.season`, `.year`), `R/Daily/DailyDemo.swift` (states `select`, `move`, `zoom`)

**Interfaces:**
- Consumes: `WalkWorldView`, `WalkStage`, `WalkArt.overlookSquare`, `WalkPalette.ground`, the walk's keyboard lift (`\.walkKeyboardLift`, as its typing row uses), `MountainPage`, `WalkLoad`, `WalkPositionStore().load(for:)?.kept`, `DailyModel` (`hanging`, `setArea`, `pullUp`), `DailyBarView(night: true)`, `DailyNavRow`, `DailyCopy.heading`, `hint`, `WalkCopy.moveTo`, `pullUp` (by name).
- Produces: `struct MountainStage<Over: View>: View { init(state: WalkState, today: Date, actions:…, onLabel:…, onBanner:…, @ViewBuilder over: () -> Over) }` (the 390 × 844 stage scaled to fit and letterboxed in the sky colour, as `WalkView` does it, with `over` drawn in stage points); `struct MountainPageView: View { init(level: WalkLevel, model: DailyModel) }`; identifiers `daily.mountain.<year|season|month>`, `daily.panel`.

Behaviour: the page reads the person's rows with `WalkLoad.items(..., periods: MountainPage.periods(level:selected: appState.selectedDate, today: model.today, seasons:), planted: every id read, areas:)`, so it changes as rows change. Taps go through `WalkLayout.tapEvent` and are mapped: a banner's `.bannerTapped(id)` → `.flag(id)`, `.stubTapped(key)` → `.post(key)`, a label → `.peak(id)`. Effects: `.setArea` and `.pullUp` go to the model (each shows Undo in the hint's place); `.open` sets the horizon; `.walkDown` waits for Task 15 (the chip is drawn and does nothing yet). The bar adds a goal at this level: before each add the page sets `model.page = .goal(level)` and `model.hanging` (kept areas, the zoomed area, the focused flag, the page's periods). The panel shows the line, then "Walk it down" when `canWalkDown`, "Move to", "Pull it up"; "Move to" swaps the chips for the areas. A tap on the mountain lets go. Each banner carries VoiceOver actions for the same three things, and "Move to ‹area›" for each area.

- [ ] **Step 1: Implement**, then extend the gate.
- [ ] **Step 2: Run** TEST `DailyGateTests`, `MountainPageTests`, and `-only-testing:SymphonyOSUITests/LightEditionUITests`. Expected: pass.
- [ ] **Step 3: Screenshots:** `-SymphonyDailyPage month`, `season`, `year`; `year` with `-SymphonyDailyState select` (glow, panel, the line about winter or the season in force) and with `select,move`; `year` with `zoom`; `month` with seed `empty` (a bare mountain, the bar, no hint about flags that are not there is acceptable); `month` with seed `quiet` (the long titles stay on their cloths). Flags must not stand in a ruled row.
- [ ] **Step 4: Commit** `Light Month, Season and Year: the mountain itself, with your flags and a bar to plant another`

### Task 15: Walk it down, the two signs that walk, and Look back up

**Files:**
- Modify: `R/App/AppState.swift` (`var walkDown: WalkPosition?`), `R/App/MainView.swift`, `R/Daily/Views/MountainPageView.swift`, `LightTodayView.swift`, `LightWeekView.swift`, `DailySheet.swift`, `R/Daily/DailyDemo.swift` (state `lookback`)
- Test: `T/MountainPageTests.swift` (add)

**Interfaces:**
- Consumes: `MountainPage.walkDown`, `MountainPage.lookBack`, `MountainStage`, `WalkModel.init(context:userId:entry:position:edition:…)` with `entry: .resume`, `WalkCopy.showMyDay` (by name), `DailyCopy.showMyWeek`.
- Produces: in `MainView.considerWalk`, ahead of `WalkEntry.decide`: when no walk is up, the edition is light and `appState.walkDown` is set, that position opens as a resume (through the same code that opens any walk, saved position store included) and `walkDown` is cleared. `MainView` also runs `considerWalk()` when `appState.walkDown` changes.

Behaviour: if the clarity task gave `MainView` its own way to resume a stored walk (for "Pick the walk back up"), open through that with this position and add no second path. "Walk it down" and the `newWeek` and `noPiece` signs set `appState.walkDown = MountainPage.walkDown(item, …, periods: model.periods, now: model.today)`. The sheet's handle (the boards' "Look back up"; Today and Week, tall windows) lowers the sheet until only its grabber, a label and the header show (its top 128 above the window's foot), hides the bar, and shows `MountainStage` with `MountainPage.lookBack` behind it; the label reads `WalkCopy.showMyDay` on Today and `DailyCopy.showMyWeek` on Week, and a tap raises the sheet. There, a tap on "+n" opens its post; other flags are read, not tapped.

- [ ] **Step 1: Write the failing test** `aSignsWalkDownOpensWhereTheSignPoints`: for `Signpost.Target.walkDown(id, .month)`, `MountainPage.walkDown` of that month item gives `step == 4` and `focus["4"] == id`; for `.walkDown(id, .year)`, `step == 2`.
- [ ] **Step 2: Run** TEST `MountainPageTests`. Expected: the new test fails only if Task 13 left a gap; fix it there.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** TEST `WalkModelTests`, `MountainPageTests`, then `SymphonyOSUITests/WalkUITests`. Expected: pass.
- [ ] **Step 5: Screenshots:** Today with `-SymphonyDailyState lookback`; Week with `lookback`. By hand in the simulator (taps only): on Year choose a flag, tap "Walk it down", and the walk opens on the Season step about that flag; back up to Welcome, "Not now", and Year is there again.
- [ ] **Step 6: Commit** `Light pages: walk a flag down from where it stands, and look back up from Today and Week`

## Stage D: the handover

### Task 16: The walk hands its light to the bar

**Files:**
- Create: `R/Daily/Core/DailyHandover.swift`, `R/Daily/Views/HandoverLight.swift`
- Modify: `R/App/AppState.swift` (`var handover = false`), `R/App/MainView.swift` (the walk's `onEnd`), `R/Daily/Views/LightTodayView.swift`, `DailyBarView.swift`, `R/Daily/DailyDemo.swift` (state `handover`)
- Test: `T/DailyHandoverTests.swift`

**Interfaces:**
- Consumes: `WalkOrb.centre`, `WalkOrb.radius`, `WalkStage(device:)`, `DailyMetrics.Bar`, `DailyCopy.handover`, `WalkEndingView.move` (the sheet's curve).
- Produces:

```swift
enum DailyHandover {
    static let travelMs = 900, lineMs = 6000, sheetDrop: CGFloat = 154
    struct Light: Equatable { let centre: CGPoint; let diameter: CGFloat; let opacity: Double }
    /// Where the walk's light stands in this window, and how wide.
    static func start(window: CGSize) -> (centre: CGPoint, diameter: CGFloat)
    /// `progress` 0…1: from the walk's light to the bar's, shrinking all the way, along a curve that bows right; it fades in over the first 0.15.
    static func light(at progress: Double, from: (centre: CGPoint, diameter: CGFloat), to: (centre: CGPoint, diameter: CGFloat)) -> Light
}
/// The line is shown once per person per phone: `UserDefaults` key `daily.handover.seen.<user id lowercased>`.
struct HandoverMemory { var defaults: UserDefaults = .standard
    func seen(for userId: UUID?) -> Bool; func markSeen(for userId: UUID?) }
```

Behaviour: in `MainView`, the walk's `onEnd` is as now, and also sets `appState.handover = true` when the status is `.finished` and `DailyGate.shows(.today, edition:, layout:)` for the edition the walk was opened with. A full household ends exactly as it does today. `LightTodayView`, seeing `handover`, clears it and plays: the sheet starts `sheetDrop` lower and rises on the walk's sheet curve; the light travels for `travelMs`; then the bar's light wears the handover halo, and the line shows in the line slot for `lineMs` only if `HandoverMemory` has not seen it (then marks it). With Reduce Motion nothing travels and the sheet does not move: the halo and the line fade in over 0.25 s.

- [ ] **Step 1: Write the failing tests:** `theLightEndsExactlyOnTheBarsLight` (`light(at: 1, …).centre == to.centre`, `diameter == to.diameter`); `itStartsWhereTheWalksLightStood` (for a 390 × 844 window `start` is `(WalkOrb.centre, 2 × WalkOrb.radius)`; `light(at: 0, …).centre == from.centre`); `itOnlyShrinks` (diameters at 0, 0.25, 0.5, 0.75, 1 strictly fall); `theLineShowsOnce` (`HandoverMemory`: false, then true after `markSeen`, false for another id); `aFullHouseholdEndsAsItDoesNow` (`DailyGate.shows(.today, edition: .full, layout: .oneColumn) == false`).
- [ ] **Step 2: Run** TEST `DailyHandoverTests`. Expected: "cannot find 'DailyHandover' in scope".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass. Also `SymphonyOSUITests/WalkUITests`.
- [ ] **Step 5: Screenshots:** `-SymphonyDailyState handover` (the settled state: halo and line, the third frame of the board). Then, taps only: `-SymphonyDemo -SymphonyLight -SymphonyWalk -SymphonyWalkStep 6 -SymphonyWalkSheet up`, tap the ending's last control, and record the screen (`xcrun simctl io <id> recordVideo`) for the owner; the same launch without `-SymphonyLight` ends on the old Today with no light.
- [ ] **Step 6: Commit** `Walk to Today: the light shrinks into the bar's mic, with one quiet line the first time`

## Stage E: the Duo

### Task 17: The outside screen, and the inside screen upright

**Files:**
- Modify: `R/Daily/Core/DailyMetrics.swift` (if the short shape needs it), `R/Daily/Core/DailyGate.swift` (`layouts` adds `.glance`, `.dayPage`), `R/Daily/Views/LightPlannerView.swift`, `LightTodayView.swift`, `LightWeekView.swift`
- Test: `T/DailyMetricsTests.swift` (add), `T/DailyGateTests.swift` (add)

**Interfaces:**
- Consumes: `TodayLayout.decide`, `DailyMetrics.shape(for:height:)`, `appState.dockLayout`.
- Produces: nothing new. `LightPlannerView` passes `DailyMetrics.shape(for: layout, height:)` to the pages. On `.glance` the pages use the short shape; on `.dayPage` the tall shape at that width. The system's side column stays the system's: nothing of ours is drawn in it.

- [ ] **Step 1: Write the failing tests:** `theOutsideBoard`: `DailyMetrics.today(size: CGSize(width: 466, height: 678), safeTop: 22, safeBottom: 0, shape: .short)` has `picture == CGRect(x: -17, y: -34, width: 500, height: 500)`, `band.height == 240`, `sheetTop == 190`, `sheetRadius == 26`, `sign.plank == CGRect(x: 42, y: 96, width: 350, height: 60)`, `sign.post == CGRect(x: 70, y: 82, width: 7, height: 130)`, `card == CGRect(x: 16, y: 280, width: 434, height: 42)`, `rowsTop == 332`, `row == 52`, `bar.field == CGRect(x: 68, y: 604, width: 330, height: 48)`, `bar.more.origin == CGPoint(x: 8, y: 600)`, `bar.inbox.origin == CGPoint(x: 402, y: 600)`, `lookBack == nil`, `navGap == 22`. `theOutsideAndUprightInsideAreBuilt`: `DailyGate.shows(.today, edition: .light, layout: .glance)` and `.dayPage` true; `.journal` and `.glanceWide` false; all false for `.full`.
- [ ] **Step 2: Run** TEST `DailyMetricsTests`, `DailyGateTests`. Expected: the gate test fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Screenshots:** on the iPhone 17 with `-TodaySize 466x678` and `-TodaySize 626x890` (Today and Week). Then on the iPhone Duo simulator: install the same build, launch with the demo arguments, `xcrun simctl io B88F7BDF-8739-4F90-BE7E-B8DFDEB789AD screenshot --display=1 <path>` (outside) and `--display=3` (inside), then terminate the app. Report how the system's side column sits against the page. With `-SymphonyDemo` alone at `-TodaySize 466x678`, the old glance with "Tell Symphony" is there.
- [ ] **Step 6: Commit** `Light on the Duo: Today and Week on the outside screen and the upright inside screen`

### Task 18: Opened flat: the rest of the week beside today

**Files:**
- Create: `R/Daily/Views/LightSpreadView.swift`
- Modify: `R/Daily/Core/DailyMetrics.swift`, `R/Daily/Core/DailyGate.swift` (`layouts` adds `.journal`), `R/Daily/Views/LightPlannerView.swift`
- Test: `T/DailyMetricsTests.swift` (add)

**Interfaces:**
- Consumes: `DailyWeek.rest`, `DailyDay`, `Signpost`, `DailyBarView`, `DailyNavRow(words: [.year, .season, .month, .week])` with the last word reading `DailyCopy.weekAndToday`, `appState.dockLayout.fold`, `HalfOpen.split(fold:origin:size:across:)` for where the pages meet.
- Produces:

```swift
struct DailySpread: Equatable { let band: CGRect; let picture: CGRect; let navTop: CGFloat; let sheetTop: CGFloat; let fold: CGFloat
    let sign: DailyMetrics.Sign; let weekHeader: CGPoint; let weekList: CGRect
    let todayHeader: CGRect; let card: CGRect; let rowsTop: CGFloat; let row: CGFloat; let rowGap: CGFloat; let bar: DailyMetrics.Bar }
extension DailyMetrics { static func spread(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat, fold: CGFloat?) -> DailySpread }
```

Behaviour: on `.journal`, both the Today and the Week horizon draw the spread (one band across, the signpost over the right page, the month flags over the left); Month, Season and Year stay the stage, letterboxed. Left page: `DailyWeek.rest` then the past-days line; a tap on a task's words there chooses it and the Move to panel stands over the left page. Right page: Today as on the phone, with the bar. More at the left page's foot, Inbox at the right's.

- [ ] **Step 1: Write the failing test** `theSpreadBoard`: `spread(size: CGSize(width: 890, height: 626), safeTop: 10, safeBottom: 0, fold: nil)` has `fold == 445`, `picture == CGRect(x: -55, y: -150, width: 1000, height: 1000)`, `band.height == 230`, `sheetTop == 176`, `sign.plank == CGRect(x: 492, y: 82, width: 338, height: 60)`, `weekHeader == CGPoint(x: 24, y: 198)`, `weekList == CGRect(x: 16, y: 262, width: 400, height: 364)`, `todayHeader.minX == 476`, `card == CGRect(x: 470, y: 262, width: 404, height: 40)`, `rowsTop == 310`, `row == 50`, `rowGap == 5`, `bar.field == CGRect(x: 470, y: 566, width: 338, height: 48)`, `bar.more.origin == CGPoint(x: 20, y: 562)`, `bar.inbox.origin == CGPoint(x: 814, y: 562)`.
- [ ] **Step 2: Run** TEST `DailyMetricsTests`. Expected: "type 'DailyMetrics' has no member 'spread'".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `DailyMetricsTests`, `DailyGateTests`. Expected: pass.
- [ ] **Step 5: Screenshots:** `-TodaySize 890x626` on the iPhone 17 for Today, Week (the same spread) and Month (the stage); the inside screen of the Duo simulator held sideways if it is already so, otherwise the pinned size only. `-SymphonyDemo` alone at that size is the old journal.
- [ ] **Step 6: Commit** `Light on the Duo, opened flat: the rest of the week on the left, today on the right, one hill across both`

### Task 19: Set down half open

**Files:**
- Create: `R/Daily/Views/LightHalfOpenView.swift`
- Modify: `R/Daily/Core/DailyMetrics.swift`, `R/Daily/Core/DailyGate.swift` (`halfOpenBuilt = true`), `R/App/MainView.swift` (the half-open overlay picks the view)
- Test: `T/DailyMetricsTests.swift` (add), `T/DailyGateTests.swift` (add)

**Interfaces:**
- Consumes: `DuoPosture`, `HalfOpen.split`, `DailyDay.split`, `DailyDay.nextEvent`, `Signpost`, `SignpostView(tappable: false)`, `DailyBarView(icons: false)`, `DailyCopy.toDoToday`, `done`, `next`, `clock`, `date`.
- Produces:

```swift
struct DailyTent: Equatable { let look: CGRect; let touch: CGRect; let picture: CGRect; let veil: (opacity: Double, length: CGFloat)
    let time: CGPoint; let timeSize: CGFloat; let next: CGRect; let nextSize: CGFloat; let sign: DailyMetrics.Sign
    let header: CGRect; let ring: CGFloat; let rows: CGRect; let row: CGFloat; let rowGap: CGFloat; let titleSize: CGFloat
    let field: CGRect; let light: CGFloat }
extension DailyMetrics { static func tent(size: CGSize, split: CGFloat, across: Bool) -> DailyTent }
struct LightHalfOpenView: View { init(posture: DuoPosture) }
```

`MainView`: `if appState.posture.isHalfOpen { if DailyGate.halfOpen(edition: appState.edition) { LightHalfOpenView(posture:) } else { HalfOpenView(posture:) } }`. The light view keeps what the old one does around the edges: the screen stays on while it is up, the day turns at midnight, `-TodaySize` pins its size in Debug. It shows no dinner and starts no cooking. The half you look at takes no touch; the half you touch has the open rows (each a tick), the done count, and the bar.

- [ ] **Step 1: Write the failing tests:** `theLaptopBoard`: `tent(size: CGSize(width: 626, height: 890), split: 445, across: true)` has `look == CGRect(x: 0, y: 0, width: 626, height: 445)`, `picture == CGRect(x: -137, y: -120, width: 900, height: 900)`, `time == CGPoint(x: 40, y: 26)`, `timeSize == 124`, `next.origin == CGPoint(x: 40, y: 200)`, `sign.plank == CGRect(x: 44, y: 330, width: 470, height: 78)`, `sign.titleSize == 27`, `header.origin == CGPoint(x: 32, y: 476)`, `ring == 60`, `rows.origin == CGPoint(x: 24, y: 548)`, `row == 72`, `titleSize == 22`, `field == CGRect(x: 24, y: 808, width: 578, height: 58)`, `light == 44`. `theBookBoard`: `tent(size: CGSize(width: 890, height: 626), split: 445, across: false)` has `look.width == 445`, `picture == CGRect(x: -330, y: -150, width: 1000, height: 1000)`, `timeSize == 112`, `sign.plank == CGRect(x: 28, y: 462, width: 350, height: 68)`, `rows.origin == CGPoint(x: 467, y: 106)`, `row == 70`, `field == CGRect(x: 467, y: 544, width: 405, height: 58)`. `halfOpenIsLightOnly`: `DailyGate.halfOpen(edition: .light)` true, `.full` false.
- [ ] **Step 2: Run** TEST `DailyMetricsTests`, `DailyGateTests`. Expected: "type 'DailyMetrics' has no member 'tent'".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** those and `HalfOpenTests`. Expected: pass.
- [ ] **Step 5: Screenshots:** `-HalfOpen laptop -TodaySize 626x890` and `-HalfOpen book -TodaySize 890x626`, seeds `morning` and `done`. `-SymphonyDemo -HalfOpen laptop -TodaySize 626x890` alone is the old half-open display with its dinner.
- [ ] **Step 6: Commit** `Light on the Duo, half open: the time, what is next and the signpost where you look; to-dos and the bar where you touch`

## Stage F: finish

### Task 20: The sign-up screen says what is true

Sign-up is about to open to everyone (the foundations plan's release checklist). Today the iPhone turns any "Database error saving new user" into "Symphony is invite-only…" with a "Request an invite" link, which will be false then and would stop an App Review tester. No server change; signing in, and everything after it, is untouched.

**Files:**
- Modify: `R/Services/AuthService.swift`, `R/Views/Shared/AuthView.swift`
- Test: `T/SignUpCopyTests.swift`

**Interfaces:**
- Consumes: `AuthService.inviteOnlyMessage`, `isInviteGateFailure`, `isSignUpAllowed(email:)` (the `signup_allowed` question it already asks).
- Produces:

```swift
extension AuthService {
    static let signUpFaultMessage = "Symphony couldn’t create your account just now. Please try again in a moment."
    /// What a failed sign-up says. `gate`: what `signup_allowed` answered (nil: it could not be asked).
    /// `message`: the failure's own text (nil: the gate said no before anything was tried).
    static func signUpFailure(gate: Bool?, message: String?) -> (text: String, inviteOnly: Bool)
}
```

Rule: only a gate that answered **no** is "invite-only" (`inviteOnlyMessage`, with the link): that is still true while the gate is closed and can no longer happen once it opens. A gate that answered yes, or could not be asked, followed by the generic database failure, is a fault: `signUpFaultMessage`, no link. Any other failure keeps its own message, as now.

- [ ] **Step 1: Write the failing tests:** `onlyAClosedGateSaysInviteOnly` (`signUpFailure(gate: false, message: nil) == (AuthService.inviteOnlyMessage, true)`); `anOpenGateNeverSaysInviteOnly` (`gate: true`, message "Database error saving new user" → `(signUpFaultMessage, false)`); `anUnansweredGateIsAFaultNotAnInvitation` (`gate: nil`, the same message → `(signUpFaultMessage, false)`); `otherFailuresKeepTheirWords` (`gate: true`, "Password should be at least 6 characters" → that text, `false`); `theFaultLineHasNoInviteInIt` (`!signUpFaultMessage.lowercased().contains("invite")`).
- [ ] **Step 2: Run** TEST `SignUpCopyTests`. Expected: "type 'AuthService' has no member 'signUpFailure'".
- [ ] **Step 3: Implement,** and have `signUp(email:password:)` set `error` and `inviteOnly` from it in both places it fails. In `AuthView` change only the comment above the link, to say when it shows. No other string on the screen mentions invitations (checked: `AuthView.swift` has none).
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** `Sign-up: only a closed gate says invite-only; a fault says try again`

### Task 21: VoiceOver and Reduce Motion, the UI tests, the record, and the full household proved

**Files:**
- Create: `U/LightDailyUITests.swift`, `U/FullHouseholdUnchangedUITests.swift`
- Modify: views under `R/Daily/Views` as the pass finds, `R/Walk/Views/WalkEndingSheet.swift` (one identifier, `walk.goToToday`, on the ending's last control; nothing seen changes), `apple/SymphonyOS/PLANNING.md`, this plan ("As built")

**Interfaces:**
- Consumes: every identifier named above.

- [ ] **Step 1: The VoiceOver pass.** Reading order on each page: the row of words (a container labelled `DailyCopy.navLabel`; the current word has the selected trait), the signpost (one button; label `Sign.label`; custom action `DailyCopy.putSignAway`), the sheet's handle (a button), the waiting walk's line when there is one (a button), the sheet's heading (a header) and ring (`WalkCopy.ringLabel`), the next event (one element), each row, then the bar's field, its light (`DailyCopy.speakIt`, or `stopListening` while listening), More and Inbox. A Today row: label `WalkCopy.rowLabel`, value `WalkCopy.rowDone` or `rowOpen`, actions `DailyCopy.firstToday` or `notFirst`, `details`, `WalkCopy.pullUp`. A Week task: the same label and value on one element, with an action per `DailyWeek.Chip` ("Move to Wed") and `WalkCopy.pullUp`; an event and "open" read as text. Mountain flags as Task 14. Undo, a note and the handover line are announced when they appear. While the sheet is lowered the mountain is read and the lowered sheet is one button. With Reduce Motion: nothing slides or travels; changes cross-fade in 0.25 s. The row of words, the signpost and the bar stop growing at `DynamicTypeSize.xLarge`; the sheet's text uses `relativeTo:` and rows grow in height, titles wrapping to three lines at accessibility sizes.
- [ ] **Step 2: Write `LightDailyUITests`** (taps only; `#if os(iOS)`):
  - `testFromTheWalksEndToTodayWeekAndMonth`: launch `-SymphonyDemo -SymphonyLight -SymphonyWalk -SymphonyWalkStep 6 -SymphonyWalkSheet up`; wait for and tap `walk.goToToday`; `daily.today`, `daily.signpost`, `daily.bar.field`, `daily.bar.light` exist and no button "Planner" does; tap `daily.nav.week` → `daily.week` exists; tap `daily.nav.month` → `daily.mountain.month` exists and a button whose label contains "Pick the tile and pay the deposit" exists; tap `daily.nav.today` → `daily.today`.
  - `testAWaitingWalkHasItsLineOnAnEmptyToday`: launch `-SymphonyDemo -SymphonyLight -SymphonyDaily -SymphonyDailySeed empty -SymphonyDailyState waiting`; `daily.walkWaiting` and `daily.bar.field` exist.
  - `testATaskIsTickedAndTheRingMoves`: launch with `-SymphonyDaily`; read `daily.ring`'s label; tap the row whose label contains "Tour the gym on Main Street"; the ring's label has changed.
- [ ] **Step 3: Write `FullHouseholdUnchangedUITests`:** three launches with `-SymphonyDemo` and no `-SymphonyLight`: plain; `-TodaySize 466x678`; `-HalfOpen laptop -TodaySize 626x890`. In each: no element with identifier `daily.today`, `daily.bar.field`, `daily.signpost` or `daily.nav.week`; plain has "Today. Switch horizon" and the "Routines" tab; the other two have "Tell Symphony". A fourth launch, `-SymphonyDemo -SymphonyWalk -SymphonyWalkStep 6 -SymphonyWalkSheet up`: tap `walk.goToToday`, and "Today. Switch horizon" is there with no `daily.bar.field` (a full household's walk ends as it does now).
- [ ] **Step 4: Run** `-only-testing:SymphonyOSUITests/LightDailyUITests`, then `FullHouseholdUnchangedUITests`, `LightEditionUITests`, `WalkUITests`, `PlannerScreensUITests` (one at a time, with `-test-timeouts-enabled YES -default-test-execution-time-allowance 300`), then the whole unit target. Expected: pass.
- [ ] **Step 5: The full household, picture for picture.** Retake Task 1's baseline set the same way. Compare each pair with `cmp`; where bytes differ, open both and say exactly what differs (the half-open clock will). Then `git diff --stat BASE..HEAD --` the "must not change" paths: no output.
- [ ] **Step 6: `PLANNING.md`:** a section "The everyday screens (light)": the gate and what it leaves alone; what each page reads and writes (by the helpers named in this plan); the signpost's order and where its memory lives; the speech rule (in a light household the bar and Tell both stay on the phone; a full household's Tell is unchanged); the waiting walk's line on Today; the first-thing rule; where unfinished tasks go; the Debug launch arguments (`-SymphonyDaily`, `-SymphonyDailyNow`, `-SymphonyDailySeed`, `-SymphonyDailyPage`, `-SymphonyDailyState`); "Behaviour a change must keep"; and what is not designed.
- [ ] **Step 7: Add "As built"** to the end of this plan: what departs from it, each ruling made for the owner with what it costs if wrong, and what is known and not fixed.
- [ ] **Step 8: Commit** `Light everyday screens: VoiceOver can do everything, the UI tests walk it, and the full household is proved untouched`

---

## Calls made in this plan (owner to check)

Each line is a decision the spec and boards do not settle, with what it costs if wrong.

- **The mountain pages use the walk's own camera for that level, not the boards' closer crop.** The layout ties each post to its peak in the picture; the boards' crop would push columns off the screen. Flags are the boards' size; the mountain looks farther away. If wrong: a second `WalkArt` value with page stops, and the layout's sweep run again.
- **A mountain page shows the period holding the date it was opened on; the levels above it are the walk's.** The row of words opens the walk's periods (as light already does); the "period ends" sign opens the one that is ending. If wrong: one function.
- **On the mountain pages, and in a walk opened from one, every flag of yours can be moved or pulled up,** not only the ones a walk planted. If wrong: pass the saved walk's planted set instead.
- **"First thing" day to day is your oldest open "chosen for today" mark.** Sending an Inbox item to Today also makes that mark, so it can become first. A row's press-and-hold menu sets or clears it; nothing on the boards does. If wrong: one rule and one menu line.
- **A Today row's press-and-hold menu** (First today, Details, Pull it up) is not on the boards. Details opens the existing task screen, so a typo can be fixed. If wrong: remove the menu; then a task's words cannot be edited in light.
- **Tapping the bar's light a second time adds what was heard at once,** with Undo, as letting go plants in the walk. If wrong: leave the words in the field for return.
- **The bar tidies fillers as the walk does, then reads the day with `CaptureParser`.** A goal page pulls no day. If wrong: one function.
- **A time said with a task is stored on it** ("dentist at 3"), but the light rows do not show it. If wrong: one line on the row, or stop storing it.
- **A day said that is not on the page still lands there,** and the bar says "It’s on Friday the 20th." If wrong: refuse it instead.
- **The bar on Week always adds to the week you are in,** even when next week is on screen.
- **A sign put away hides that kind for the day; the next true kind may then show.** If wrong: one line to hide every sign for the day.
- **"That’s the day" with nothing tomorrow** shows only the walk's closing line on the plank.
- **A tap on "That’s the day" opens Week on tomorrow** (next week's, on the week's last day; the header then reads "Next week").
- **"Period ends" names the largest period ending:** the year, then the season, then the month.
- **Yesterday's unfinished tasks are not flagged or counted.** They sit in Week's folded past days with any still open from earlier weeks, and Move to brings one back. The old "Review unfinished" sheet is not in light. If wrong: restore that sheet's line.
- **Inbox and More open as sheets** over the page. If wrong: full-screen pages with a way back.
- **Undo, notes and the listening line share one line slot above the bar.**
- **On Season and Month, a tap on a flag one level up focuses it** (the walk's zoom), and the next goal added hangs under it. With none focused, a goal goes to the area its words clearly name, or the unlabeled post, and has no parent.
- **"Walk it down" is offered only for a flag in the walk's current periods.**
- **Week's band shows at most two month goals,** the ones this week's tasks serve most.
- **Flags use the walk's colours,** a shade off the boards' in places.
- **Season's bar reads "Add a goal for winter";** Season's heading ends "to Sunday, 28 February"; Year reads "This year" when it is not the year ahead.
- **Windows shorter than 760 points use the outside screen's tighter numbers,** and so have no "Look back up".
- **The handover's travel plays each time a walk ends on light Today; its line shows once per person per phone.** The light starts where the walk's light stood, though the ending screen no longer shows it.
- **In the Duo's side column nothing of ours is drawn** in light: More and Inbox are beside the bar.
- **The real Duo outside screen is not the board's window** (found in Task 17 on the Duo simulator). It has no top inset and a 34-point foot, and the system keeps an 84-point column on the right of the 466-wide window, holding its clock and Wi-Fi. Light pages stand inside the window's side edges, 382 wide there, with plain sky behind the system's column; the row of words starts at the top edge and the bar stands 42 above the foot. The sign's plank and the bar's field are proportionally narrower than the board's. Where a placeholder does not fit its field it takes a shorter form ("Add a goal for November" becomes "Add a goal"), as on a 375-point phone, so it is never cut short. If wrong: the side edges are one modifier, and the short form one function.
- **Completion uses `ItemCompletion`;** calendar events cannot be ticked on the light pages.
- **A Debug-only branch in `CalendarFeed`** feeds two sample events to light demo screenshots.
- **The waiting walk's line sits under the sheet's handle and above the date,** and pushes the page down 44 points while it shows. It shows for any stored walk the Settings button would pick back up. If wrong: one frame.
- **A light household's Tell Symphony (phone on its side, the Lock Screen control, a `symphony://tell` link) is also phone-only now.** On the new Today that control and link start the bar listening instead of opening the Tell sheet. If wrong: one line each.
- **Sign-up: a failure is called "invite-only" only when the gate itself said no.** If the gate cannot be asked while sign-up is still closed, an uninvited person is told to try again rather than to request an invite. If wrong: one case in one function.
- **Photos on a task stay reachable in light** (see "Known gaps"): hiding them is a product and privacy-label decision, not a build detail.

**Could not be built as drawn:** nothing needs a database or server change. Two things differ from the boards: the mountain pages' crop (first call above), and the eyebrows "TODAY IS OPEN · WAITING IN THE WEEK" and "A NEW WEEK · WHAT MOVES THIS FORWARD?", which are wider than the phone's plank at the drawn size and shrink to fit.

## Known gaps

- A regular iPhone held sideways, and the Duo's outside screen held sideways, keep the existing wide glance and the old dock.
- Set down half open, on every Duo window that has a light page (the inside screen upright, and opened flat as the spread), the light page stays as it was under the display, inert and silent (ruling D14), with any words typed into its bar. Inbox or More, and a row's Details, close as the display comes up (Details keeps what is typed in it as it is typed, except a link not yet added). Only a page that is not light is taken away under the display, and on the Duo none of those windows is.
- Dynamic Type beyond wrapping: the row of words, the signpost, the bar, the sheet's handle and header, the next event, the ring, Week's band flags, day labels and Move to panel, and everything on the mountain pages do not grow past extra large (they stand in the boards' fixed frames); the rows and the week's lines do, a row's title wrapping to three lines.
- The doorstep art, and the tall painting: the pages stand on the square overlook, as the walk does.
- Month, Season and Year, and the walk, are letterboxed on the Duo's screens.
- No way to step to another week, month, season or year in light, and no page for a past one except through the "period ends" sign.
- A task's time is stored and not shown. Calendar events cannot be opened or ticked from Week.
- **A light household can still take or choose a photo for a task.** Reached from a task's details ("Photos": a camera tile and a photo-library tile, `R/Views/Task/TaskAttachmentsSection.swift`), which opens from an Inbox row and from a Today row's Details; and from an event's details, which light reaches only through the old wide glance with the phone on its side. It is left reachable, not hidden: it keeps a picture with a task (one upload to the person's own storage, no AI call), which is not the "photographing a paper page" the spec hides, and that one is already hidden (the add sheet's "Snap a page" and "Choose photo", the capture bar's camera, and the background retry are all behind `edition.allows`). The cost of leaving it: the App Store privacy label must list photos, the camera and photo-library purpose strings stay, and each photo uses storage. Hiding it later is one `edition.allows(.photoCapture)` test around `AttachmentsSection` in `TaskDetailView` and `EventDetailView`.
- Sign-up copy is truthful only on the phone's own screen; the web's sign-up and the waitlist page are outside this plan.
- Routines, dinner, people and life-area switching stay hidden in light (the foundations stage).
- "Look back up" is missing on short windows and on the Duo's spread and outside screen.
- The guided walk still fills the whole of the Duo's outside window, under the system's column (the walk is unchanged by this plan).
- "The full plan is offered again at each new season" is still not built; the "no piece" sign is the nearest thing.
- Carried from the walk: moving a year goal leaves the flags under it on the old peak; a change made while its push is in flight can be lost.

## Stops for the owner

- **A real iPhone, by hand:** tap the bar's light and speak a task with a day; type one; Undo one; tick the first thing and watch the signpost turn; refuse the microphone once and see the bar type instead. Nobody speaks or types to the simulator.
- **The handover on a real phone:** finish a walk and judge the light's travel, its speed and the line.
- **A real iPhone Duo:** the outside screen beside the system's side column, the spread across the fold, and both half-open postures from across a desk.
- **Look at the mountain pages against the boards** and decide the crop (first call above).
- **The first-thing rule and the unfinished-tasks rule** are product calls made here; confirm or change them before release.
- **Photos on a task in light:** keep (and list photos on the privacy label) or hide (one line; see "Known gaps"). Decide before the listing is submitted.
- **A light account on a real iPhone with no on-device speech for its language:** the bar and Tell must both fall back to typing, with nothing sent to Apple.
- **Sign up on a real iPhone once sign-up is open,** with a new address: no invite wording anywhere on the way in.
- **VoiceOver, once through:** Today, Week, Month, and the bar.
- **Nothing here is pushed.** The foundations plan's release checklist (database, functions, signup) still comes first; TestFlight and main wait for Scott.

## Pre-flight amendments (binding; they override the task text above)

A scan of this plan against itself and the code found 22 conflicts. The scan, with the exact fragments
and line numbers, is `.superpowers/sdd/2026-11-14-iphone-light-daily/preflight.md` ("Findings to rule
on"); every builder and reviewer reads the findings listed for their task there and applies the
"Amendment" text exactly as written, with these rulings on the ones that were product decisions.

**By task** (finding numbers): Global Constraints ← 17, 19 · Task 1 ← 10 · Task 2 ← 20 · Task 3 ← 2,
15, 22 · Task 5 ← 1, 4 · Task 6 ← 1, 5, 16 · Task 7 ← 6, 13 · Task 8 ← 7, 10, 11, 14, 21, 22 ·
Task 9 ← 17, 19 · Task 10 ← 15, 20 · Task 11 ← 4, 20 · Task 13 ← 1, 12 · Task 14 ← 1, 12, 20, 21 ·
Task 15 ← 9, 18 · Task 16 ← 18, 20 · Task 17 ← 3, 11, 13 · Task 18 ← 3, 14 · Task 19 ← 8 ·
Task 21 ← 11, 18, 20.

**Rulings on the product decisions** (each is a call made for the owner; cost if wrong in brackets):

- **2. "Period ends" always names the month.** The sign reads "<Month> ends on <weekday>" on the
  month's last three days, whatever else ends that day, as the approved board shows ("NOVEMBER ENDS ON
  MONDAY"), and a tap goes up to that month's page. Task 3's rule is "the month whose last day is
  within two days", not "largest first"; its test expects `(.month, "November", …)` on 28–30 November
  2026, and 29–31 December gives December, not the year. [A season's or a year's end passes without
  its own sign: one rule.]
- **9. A walk-down returns to the page it was started from and is never stored** (option a): it runs
  with no position store, so it cannot become a "waiting" walk and cannot replace one; "Leave for now"
  inside it simply closes it; what it added stays. Task 15 Step 5's expectation stands as written.
  [If wrong: one flag.]
- **10. The line at the top of Today shows in two cases, with different words.** A walk left with
  "Leave for now" (stored paused): `DailyCopy.walkWaiting`, "Your walk is waiting. Pick it back up.",
  which resumes it. A walk declined at Welcome ("Not now", stored left) by someone who has no goals at
  all: `DailyCopy.walkWhenReady`, "Walk down from the year when you’re ready.", which starts it from
  the top; it goes away as soon as one goal exists, and never shows in a full household. Task 1's
  `aWalkLeftPartWayIsWaiting` covers the first; add `aDeclinedWalkWithNoGoalsOffersIt` and
  `aDeclinedWalkWithGoalsSaysNothing`. Review Focus 4 and Task 8 read accordingly. [If wrong: delete
  the second case.]
- **21. Screenshots stay pinned to 2026-11-10** (option a). On that day the season is fall, so every
  line the boards print with "winter" reads "fall" in the app; that is correct and is not a defect.
  Tasks 8 and 14 judge the season word as "fall".
- **22. Following a sign puts that kind away for the day** (option b): after a tap on a sign that
  takes you somewhere (the week, a page, a walk-down), `model.dismiss(kind)` is called, so on coming
  back Today shows the next true kind, as the spec says ("Get there and it turns to the next place").
  "First, today" does not navigate and is not put away by a tap; it goes when its task is done.
  Task 3 adds `aFollowedSignGivesWayToTheNext`; Task 8 wires it. [If wrong: one line.]

**Order.** This plan starts only after the walk's clarity pass (which adds "Leave for now" and the
paused position) and the natural-footing fix have both landed; Task 1 re-reads the committed walk
files for the names of: the paused status, "resume the paused walk", "a paused walk exists", and the
plan-handle `WalkCopy` member.

## As built (2026-11-14): what changed from the plan above

Everything is on one branch, `claude/ios-light-build`: all 21 tasks, each built and reviewed (two
build lanes ran side by side for a while and were joined into this branch), the owner's tall painting
on every band and behind the walk (Tasks A1 and A2, see `apple/SymphonyOS/PLANNING.md`, "The art"),
three final reviews of the whole branch (seams; the walk and the painting; what the pages read and
write), and one fix wave answering them (`.superpowers/sdd/2026-11-14-iphone-light-daily/final-fix-wave.md`,
its addendum, and `final-fix-report.md`). Nothing is pushed, merged into main or deployed, and nothing in
this plan needs a database, server or web change. On the iPhone 17 simulator the unit target passes 1115
tests in 75 suites after the fix wave and its residual patch, and so do the UI classes (`WalkUITests`, `LightEditionUITests`,
`LightDailyUITests`, `LightSpreadUITests`, `FullHouseholdUnchangedUITests`, `PlannerScreensUITests`), each
alone and all together in one run. Nobody has spoken to the bar, typed into it, heard it with VoiceOver
or held a real Duo: the hand walk below is still the gate.

### Where the build departs from the plan's text

- **"Period ends" names the month** on its last three days, whatever else ends then (D1); the "Calls"
  line "names the largest period ending" is no longer true.
- **A mountain page is built from the person's rows by their links** (D9): its own level by the page's
  period, above it each flag's real parent whatever its period plus the walk's current upper flags.
  It replaces the call "the levels above it are the walk's".
- **The take-out-of-plan action reads "Remove"** (`WalkCopy.pullUp`; the owner chose the word), not the
  boards' "Pull it up". It is a permanent delete of the task or goal row (on the web too), written only
  once its Undo can no longer be used (D7); rows that named it are unlinked, never removed. Undo puts back
  exactly what a move made (D8).
- **Moves on a light page never add to `deferCount`** and write the page's own week (D13).
- **Today's top line has two cases** (D3), and **a followed sign is put away for the day** (D5).
- **A walk-down is never stored** and returns to its page (D2).
- **Under the light half-open display a light page stays, inert and silent** (D14), instead of being
  taken away; a tick on the display offers Undo (D15).
- **Light pages are for phones only** (D17); a light household on an iPad keeps the old pages, and its
  Tell stays on the device (D19).
- **The day turning mends the selected date** (D18), only where light pages live (a light household on a
  phone: a full household's and an iPad's date are never touched), so Week and the spread's left page never strand
  someone on a "tomorrow" that has passed.
- **The real Duo outside screen is not the board's window** (Task 17): no top inset, a 34-point foot and
  the system's 84-point column on the right; the page stands 382 wide inside it, and a placeholder too
  long for the field takes its short form ("Add a goal").
- **The spread's left page follows the selected week** (Task 18 fix), not always "the rest of this week".
- **Touch sizes over the boards:** Week's tick circle is 44 wide (board 40) and its fold 44 high (board
  34); the Move to panel's foot stands on the bar's line slot, not at the board's y 604 (Task 11).
- **Week's band flags:** pole and cloth lean opposite ways, as Task 7's test asks, though the boards lean
  them the same way (owner to look).
- **The mountain pages' row of words, heading, panel, hint and bar** stand in window points, not stage
  points, so they keep the safe area and 44-point touch on every phone (Task 14).
- **The handover:** the travelling light has the microphone fade in over its last quarter; the bar is not
  dimmed and no trail is drawn (the owner kept it so). It does not travel on the spread.
- **The lowered sheet** stands 128 above the window's foot; on a 402 × 874 phone about 6 points of the
  walk's ground show above it (Task 15).
- **Task 21's identifiers and launches, as built:** the bar's light reads `DailyBar.lightLabel` ("Speak
  it" / "Add what you said" / "Type it"), not `speakIt`/`stopListening`; the walk ending's last control
  carries `walk.goToToday`; `FullHouseholdUnchangedUITests` expects the old Today, not "Tell Symphony",
  at `-TodaySize 466x678` (pre-flight finding 11); `testATaskIsTickedAndTheRingMoves` launches with
  `-SymphonyDemo -SymphonyLight -SymphonyDaily` (finding 20). Finding 18's two hand checks are UI tests
  already (`LightEditionUITests.testWalkItDownOpensSeasonAndComesBackToYear`,
  `testFinishingTheWalkHandsTheLightToTheBarOnce`); the handover's speed stays for the owner.
- **Dynamic Type (Task 21):** more stops growing at extra large than the plan named: the sheet's handle
  and header, the next event, the ring, Week's band flags, day labels and Move to panel, as well as the row
  of words, the signpost, the bar and the mountain pages. They stand in the boards' fixed frames; the
  rows grow instead, titles wrapping to three lines, and Week's fold, an event and a "for" line to two.
- **VoiceOver announcements (Task 21 fix round 1):** a note, Undo (a second add's too) and the handover's
  line are announced; the listening line is not, since the microphone is open then and could take the
  announcement down as words. The light's label and value ("Listening") carry that state. This replaces
  the brief's "the listening line is announced".
- **The dock on light's old pages** (flagged at Task 9 as "must not ship as is", to verify here): checked.
  `DailyGate.hidesDock(on:)` takes the page on screen, so the dock gives way only on a light page
  (`DailyGateTests.theDockGivesWayOnEveryLightPageAndOnNoOther`,
  `LightEditionUITests.testEveryWordAndWeeksFlagsOpenLightPagesWithNoDock`).
- **The painting (Tasks A1, A2).** The owner supplied a tall painting, summit to ledge, and chose
  "Scroll it behind the walk" (fallback, if it looks wrong: a new sharp square picture for the walk).
  The walk's layout is unchanged in the square print's world; the painting is drawn behind it by a
  camera of its own for each step and each zoom, so each step's own flags stand on their level and the
  levels above stand a little up-slope. From Season down a navy shade sits behind the question so it
  reads at 4.5:1 on the brighter valley. Every band (Today, Week, the half-open look half, the spread)
  draws its own cut of the same painting. The old square picture is no longer bundled.
- **The painting was already hidden from VoiceOver** in code (`accessibilityHidden` on the walk's
  picture, the bands and the half-open display's). XCUITest lists hidden elements anyway (it lists the
  bar's hidden microphone glyph too), so the "painting is read" finding came from the test tree; no
  change was made, and VoiceOver itself is for the hand walk.

### What the final fix wave changed (2026-11-14)

- **The edition is never guessed.** Until this sign-in's households rows are pulled (reported by the sync
  engine before the rest of the first pull, D24), the edition is only what was remembered for this person,
  and with nothing remembered it is full (`Edition.current`); nothing is remembered before then. A brand-new
  light person sees the full app only for that one request, then light Today, then the walk. So a full household on a fresh install, or signing in after a light
  account on the same phone, never sees a light page. Signing out resets the page, the date, the edition,
  Inbox or More and the dock flag; a full household's waiting Tell is kept across sign-in (as before the
  light edition), a light one's is dropped.
- **A task is filed where the page is.** Week tells the model the week it shows; a task with no day said
  there is filed into that week (stamp and commitment) and shows on the page; the field says "Add to next
  week" there. A said day off the page gets its note ("It’s on …", naming the month when it is not this one).
- **The first thing is one thing.** Marking a row first leaves exactly one of my "chosen for today" rows;
  in the light edition an Inbox item sent to Today is a plain day today (no first thing, no deferral counted).
- **Undo beats the sync.** Undo of an add, and a Remove, queue a delete even when the insert may be on the wire.
- **The bar's words.** A time the parser does not mark ("at 3 tomorrow", "at noon") is kept as a time;
  where nothing of a matched phrase is kept, every word stays. Typed words are kept when the light is
  tapped (D22). A Tell from Week or a mountain page ends on Today with the bar listening (the tap goes through
  the scheduler); Details, an inactive scene and a change of page let the bar go; on the Duo's inside
  screens the keyboard alone never changes the layout; the "‹Month› ends" sign needs something of mine in
  that month; every write reads the day first.
- **The walk.** Its text stops growing at extra large; an interrupted walk in a household that is not light
  only waits in Settings ("Pick the walk back up"); on-device speech is decided at the first hold, asking at
  most once on a phone that cannot (D23); a custom area's name stays in its pill; the top shade
  is drawn under the flags; a missed layout state is logged, not a crash; Leave for now in a walk-down does
  not say the place is kept; the light reads "task" on Week and Today and is a media-session control to VoiceOver.
- **Month, Season and Year open where you are** (the owner's decision below).

### Rulings made for the owner

"If wrong" is what it costs to change. D16 and D20 belong to lane A's painting work.

1. **D1** "Period ends" always names the month (the board shows it). If wrong: a season's or a year's end has no sign of its own; one rule.
2. **D2** A walk-down returns to the page it started from and is never stored. If wrong: one flag.
3. **D3** Today's top line: a paused walk reads "Your walk is waiting…", a walk declined at Welcome with no goals reads "Walk down from the year when you’re ready." (a new person never lands on an empty page with no way back). If wrong: delete the second case.
4. **D4** Screenshots are pinned to 10 November 2026, so the season reads "fall". If wrong: screenshots only.
5. **D5** Following a sign puts its kind away for the day. If wrong: one line.
6. **D6** A past day said with a time moves on a week keeping the time (one calendar step outside the listed helpers). If wrong: none recorded.
7. **D7** A Remove is written only once its Undo can no longer be used. If wrong: a row survives if the app is killed inside the Undo window.
8. **D8** Undo of a move takes back exactly what the move made. If wrong: none recorded.
9. **D9** A mountain page reads flags by their links. If wrong: one pure function.
10. **D10** Three rows fit on every window from 320 × 568 up; where short, the sheet rises. If wrong: no signpost on the very smallest windows with a waiting line.
11. **D11** On windows 604 points tall or less with the waiting line, the risen sheet may cover part of the row of words; windows 698 tall or less may lose the signpost. If wrong: the owner checks on a device (the outside screen's real insets were found later, Task 17).
12. **D12** The row of words always stands on the walk's dark top shade. If wrong: a slightly darker sky on Today.
13. **D13** A move on a light page never adds to `deferCount`. If wrong: a household later made full sees lower "deferred" counts for what it carried forward while light.
14. **D14** A light page under the half-open display stays in the tree, inert and silent. If wrong: a covered page that still reacts (tested in the core).
15. **D15** A tick on the half-open display offers Undo. If wrong: one more line after a tick.
16. **D16** (lane A) The walk and the mountain pages draw one 2048 × 6144 copy of the tall painting, not the 2896 × 8688 master (memory: 48 MiB decoded instead of about 100). If wrong: a zoomed-in column is enlarged up to 1.59 times (Month) and looks soft at full size; a sharper copy costs memory.
17. **D17** Light pages are for the phone idiom only. If wrong: a light household on an iPad sees the older screens until iPad is designed.
18. **D18** A selected date that was today or later and is now past becomes today; a past date the person went to stays. If wrong: someone who left the app on tomorrow's page finds today's page days later.
19. **D19** A light household's Tell on an iPad keeps speech on the device. If wrong: dictation there is less accurate than server recognition.
20. **D20** (lane A) A band's cut of the painting holds only the part of its square frame that can ever show (decoded 2.7 to 11.2 MB each, down from 9 to 33.5). If wrong: a sliver of unpainted frame if a band ever shows more than the core says (tested on every listed window).
21. **D21** The listening line is not announced to VoiceOver; the light's label and value carry the state (an announcement while the recogniser is live can be transcribed into the field). If wrong: a VoiceOver user hears no spoken "Listening", only the light's changed name.
22. **D22** Typed words are never thrown away: a tap on the light with words in the field starts listening, and what is heard is added after them. If wrong: an unexpected joined sentence the person can edit.
23. **D23** On-device speech is decided at the first real start, never latched when a model is made: support reported, as always; none with Speech Recognition already decided, unavailable with no prompt; none and never asked, Speech Recognition is asked for and the support read again before the microphone. Why: nobody can confirm the support reads true before authorization on a real iPhone, and a wrong "no" would switch speech off on every phone. If wrong: a phone that truly cannot gets one prompt before it types.
24. **D24** The edition is read as soon as this sign-in's households rows are pulled, not when the whole first pull is in. If wrong: a brand-new light person sees the full app for the whole first pull.
25. **D25** Speech stays on the phone unless the household is known to be full (rows pulled, or remembered). If wrong: a brand-new full household's Tell is on-device only for the seconds before its households rows land.
26. **D26** After a sign-out the next sign-in opens Today on today's date, for every household (one person's page and date never greet the next). A small change for a full household too; the owner is told. If wrong: two lines in `signedOut()`.

The 17 consistency amendments of the pre-flight scan were adopted as written. The controller also ruled
that a handover line shown even for a second counts as seen (Task 16; recorded earlier under the owner's
decisions by mistake).

### Decisions the owner made

- The everyday control is a plain bar whose microphone is the small light; the walk keeps the big light.
- "Remove" is the word for taking something out of the plan.
- The handover stays as built: no trail, the bar not dimmed.
- In a light household Symphony's own speaking features (the walk's light, the bar's light, Tell Symphony) recognise speech on the phone only, and the App Store listing will say so. The keyboard's dictation key is Apple's, outside the app's control, and follows the phone's own settings, so the listing must speak of the app's speaking features, not of all speech (ledger, Task 9).
- The walk is silent while you speak; the 1 s wait for the last words stays; "Leave for now" stays.
- Tent mode is not built: the owner parked it until after this work. His words were "~1/4 open resting on the surface like a tent"; reading that as the Duo standing hinge up with its outside screen showing is the controller's, unconfirmed, and raising it again with one board is the controller's plan, not the owner's decision. (`DailyTentPage` and `DailyMetrics+Tent` are the boards' word for the laptop and book half-open display, which is built and is not the owner's tent mode.)
- **"Where I am, if it has goals"** (2026-11-14, after final review 3's I4), in the words put to him: "Month,
  Season and Year open on the current month, season and year whenever you have goals there. If you have
  none there yet (you just did the walk and everything is planned ahead), they open on the coming one. When
  both have goals, the page shows the current one and a tap on its heading switches to the coming one.
  Week's flags and the signposts read the current month first." The rule is `DailyPeriods`; the walk's own
  periods are unchanged (it still plans ahead).
- The tall painting goes on the everyday bands and is scrolled behind the walk (lane A); the fallback, if it looks wrong, is a new sharp square picture for the walk.
- Two build lanes at once; the owner waits for a real-phone build rather than a simulator preview.

### Known and not fixed

Each is in the ledger (`.superpowers/sdd/2026-11-14-iphone-light-daily/progress.md`, collected in
`deferred-items.md` with the walk's own); the larger ones:

- On a 320 × 568 window with the waiting line the risen sheet covers the whole row of words (no current iPhone).
- Week does not answer a Tell itself: the Tell's link turns the page to Today, whose bar listens. In a light household a Tell asked just before a person switch is dropped.
- A day label half-cut under Week's Move to panel; a past week's left page on the spread says only "WEEK".
- On a Month page any week task under a goal counts as "something under", while the words say "this week".
- On an SE-sized window the mountain panel may cover the Year peak labels (not shot); Move to is drawn even with nowhere to go.
- A walk opening commits a pending Remove (its Undo is lost); so does lowering the handle.
- A tick or a first-thing mark ends the Undo of a move before it.
- The mountain pages cross the fold on the spread, as the walk does.
- The light pages' model keeps the household seasons it was made with: a custom-season change in Settings reaches walk-downs only after a relaunch (re-review B-I3: remaking it dropped drafts and Undo in every resync).
- A no-day add on Week in the minute after midnight at the week's turn may file into the week the page still shows (B-M5).
- A light household on an iPad: Inbox → Today makes no "chosen for today" row (B-M6).
- A sign's walk-down where the month and the season the signs read come from different sides of the rule (B-M8).
- A possible flash of the old Today as a light household signs out (B-M9; also on the hand-walk list below).
- When email confirmation is required, sign-up ends silently (release checklist).
- The demo's walk mints new ids each launch, so footing differs between demo shots; make them fixed before App Store screenshots.
- The launch helper's relaunch path has never run against a real bad launch.
- iOS's "Open in Symphony?" prompt, from a `symphony://tell` test, is still up on the Duo simulator's outside home screen: one click on Cancel in the Simulator window clears it.
- VoiceOver's reading order is set by sort priority and read from the code; nobody has listened to it.
- The Mac destination did not build at Task 1 (`DinnerCard.swift`, outside this plan); not re-checked here.

### What only a real phone can show (the owner's hand walk)

- **The painting, three known items to look at:** on Look back up the Health column's season flag hangs
  over the upper pine and today's flag stands on the river's bend, and the view ends in the valley, not
  on the ledge; a zoomed column is enlarged up to 1.59 times and is soft at full size; at the handover the
  scenery jumps from the walk's last view (sky behind the ending's sheet) to Today's band (forest and
  ledge). If any of these is wrong to the eye, the fallback is a new sharp square picture for the walk.

- **Speech:** tap the bar's light and say a task with a day; refuse the microphone once; a phone with no on-device speech for its language types, with nothing sent to Apple.
- **Sounds:** the walk's five recorded sounds are still synthesized placeholders.
- **VoiceOver, once through:** Today, Week, Month and the bar; with VoiceOver on, speak a task into the bar: nothing VoiceOver says ends up in the field; and under the half-open display, that VoiceOver skips the kept page (XCUITest lists it whatever is hidden).
- **A real iPhone Duo:** the fold's real position in both half-open postures, from across a desk; the side insets opened flat; Inbox, More and Details against the outside screen's system column; the inside screen (the simulator stays folded); the dark disc seen in that column on Month and Year.
- **The handover** on a real phone: the light's travel and speed.
- A demo on a real phone must be started from the Mac with its launch arguments; a tap on the icon opens the real sign-in.
  Do not pin the date on the device (`-SymphonyDailyNow`): the walk reads the real clock, so its flags would land in periods the pinned pages do not open.
- **First hold of the light on a real phone** (walk and bar): the prompts appear, then it listens (D23).
- A possible flash of the old Today when signing out of a light household (B-M9).
- **Owed by hand after the final fix wave:** the first hold's permission sequence (two prompts, then listening;
  and on a phone with no on-device speech, no prompt at all); the Duo's keyboard on its inside screens (the
  page must not flip to the old planner); a Tell from the Lock Screen while Week shows (Today, listening); text
  size above the default in the walk; signing in to a full account after a light one on the same phone (the
  old pages and the dock, never a light page); Month near a season's end with goals in both months (opens on
  the current one; the heading switches).

### Release

Nothing in this plan needs a database change. The foundations plan's release checklist
(`2026-11-13-iphone-light-foundations.md`, "Release checklist") stands and comes first; TestFlight and
main wait for Scott. The open product calls are in "Stops for the owner" above.
