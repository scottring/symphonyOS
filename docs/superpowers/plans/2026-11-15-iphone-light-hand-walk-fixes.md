# iPhone Light Version, Step 4: The Hand-Walk Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix, in one pass, everything Scott found walking the preview on his real Duo: the walk's controls are obvious (a top row, three choices on the light, one gold Next), the walk stands in one area at a time, and a full plan stays readable (words for one area, small posts for the rest, a paper list for reading).

**Architecture:** Three pure changes with unit tests, then views that only draw. (1) `WalkState` always stands in one area (`focusArea` on every step). (2) The controls' rules and frames move out of the light: a top row, a three-point compass, a foot button. (3) `WalkLayout`'s many-column stacking (tips, stubs, risers, zoom) is replaced by a standing layout: one worded post in the centre, small wordless side posts, and a pure `PlanPaper` list that the walk and the Month, Season and Year pages both open. The pages keep drawing the walk's own stage, so they change with it.

**Tech Stack:** SwiftUI, SwiftData, Swift Testing, XcodeGen. No server, database, schema or web change.

**Spec:** `docs/superpowers/specs/2026-11-13-iphone-light-version-design.md`, section "Hand-walk fixes (2026-11-15)" (binding, with "Anti-goals" and "Constraints"). The approved board's source is `docs/superpowers/specs/2026-11-15-iphone-light-hand-walk-board/`; its numbers are lifted into "The board as numbers" below, so no builder needs to open the HTML. Read with it: `apple/SymphonyOS/PLANNING.md` ("The walk", "The everyday screens (light)") and the "As built" section of `docs/superpowers/plans/2026-11-14-iphone-light-daily.md`.

## Global Constraints

- Work only in `/Users/scottkaufman/.claude-worktrees/symphonyOS/ios-light-build` on branch `claude/ios-light-build`. Never edit the main worktree. **Nothing is pushed or deployed.** No migration, no edge function, no remote database, no Supabase tool.
- **R** = `apple/SymphonyOS/SymphonyOS`, **T** = `apple/SymphonyOS/SymphonyOSTests`, **U** = `apple/SymphonyOS/SymphonyOSUITests`. After adding, moving or deleting a file: `cd apple/SymphonyOS && xcodegen generate` (commit the regenerated project with the task).
- **TEST** (one suite): `cd apple/SymphonyOS && xcodebuild test -scheme SymphonyOS -destination 'platform=iOS Simulator,id=29378388-0323-4E79-AD34-D46BA52A3461' -parallel-testing-enabled NO -only-testing:SymphonyOSTests/<Suite> 2>&1 | grep -E "error:|✔|✘|passed|failed|BUILD" | tail -40`. Swift Testing (`import Testing`, `@Test`, `#expect`, `@testable import Symphony`). The Mac destination must still build.
- **Simulators (this Mac froze on 2026-11-15 with eight booted).** At most TWO simulators booted on the whole machine, counting every session: run `xcrun simctl list devices booted` before booting one; if two are up, reuse one or wait. Only ONE `xcodebuild` at a time. Phone-sized work uses the iPhone 17 simulator `29378388-0323-4E79-AD34-D46BA52A3461`; the Duo's outside screen uses "iPhone Duo" `B88F7BDF-8739-4F90-BE7E-B8DFDEB789AD` (`--display=1`). The Duo's inside screen and the narrow phone are the window pins on the iPhone 17 simulator (`-WalkSize WxH` for the walk, Task 1; `-TodaySize WxH` and `-HalfOpen laptop|book` for the pages): 484x669 (half the inside screen, the shape Scott held), 669x951, 951x669, 375x667 (narrow). Never create, erase or reset a simulator. Shut down any simulator you booted when your task ends.
- **Shots.** Never during a test run. Originals go to `.superpowers/sdd/2026-11-15-hand-walk-fix/shots/task-<N>/` (git-ignored, survives a restart); never open an original with Read (Read shrinks an image file in place on this Mac): `cp` it into `…/shots/task-<N>/look/` and open the copy. A shot of the sign-in screen means the launch arguments did not arrive (zsh does not split an unquoted variable). List every shot in your report with one line on what you saw.
- **Light households only.** A full household, and any mixed or unknown edition, sees no change. The must-not-change files of the everyday-screens plan (its Global Constraints, "Light households only") still must show no diff: `git diff a86f6bce..HEAD -- <those files>` is empty. If a task seems to need one changed, stop and report NEEDS_CONTEXT.
- Anti-goals, in the spec's words: "It feels like filling out a form." / "Symphony supplies ideas the person didn't ask for." / "Nagging: streaks, guilt counts, red "overdue", confetti." Counts on this plan's screens say how many goals stand somewhere, never how many are undone or late. No glass, no blur, no pale mist, no old-style buttons; flags never float or overlap.
- **Every write** still goes through `WalkWriter` / `PlanWriter` / `DailyWriter` and the sync queue, on the signed-in person's own rows. This plan adds no new kind of write.
- **Strings.** Every word is a `WalkCopy` or `DailyCopy` member; tests name the member, never copy its text, except the tests in this plan that pin new wording. Curly quotes and apostrophes. SF Symbols only, no emoji.
- **Look.** The six bundled faces (`CrimsonPro-Regular`, `DMSans-Regular / Medium / SemiBold`). Colours are `WalkPalette` and `DailyPalette`. The light and the Next button are the only glowing gold controls.
- **Hand-planted, not ruled.** Every post, cloth and pill keeps a small fixed variation seeded by its identity through `WalkFooting.hand(_:_:)`, the same on every launch; `.level` footing gives the ruled numbers below exactly. The hand never breaks a layout guarantee (Task 5's invariants hold for both footings).
- **Touch and VoiceOver.** Every control is at least 44 x 44 points to the touch. Everything a gesture does, VoiceOver can do by a button or a custom action.
- **Platforms.** Files in `R/Walk/Core`, `R/Walk/Data`, `R/Daily/Core`, `R/Daily/Data` import only Foundation, CoreGraphics and SwiftData and compile for the Mac. Every view file is wrapped in `#if os(iOS) … #endif`.
- No typing in UI tests or by hand in the simulator (it stalls: `PLANNING.md`, "Known limitation"). States that need words come from launch arguments.
- TDD for every pure piece: show the test failing, then passing. A view holds no rule. Commit after each task with the message given, followed by a blank line and exactly:

  ```
  Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01QJk9i8yV3N2H4KhErQDgot
  ```

## Rulings made for the owner (F1 onward)

Each is the controller's call where the board drew nothing; the spec lists them under "Calls Claude made for the fix pass".

- **F1** The count ("1 of 3") shows only on the whole-year walk's Year step. Cost if wrong: a quick-start person never sees how many areas they kept.
- **F2** A goal is planted in the area you stand in; `WalkClassifier.place` and the "That went under …" note go. Cost if wrong: "run a 5K" said while standing in Work stays under Work until moved.
- **F3** Steps 2 to 5 show one flag from the level above (the one the question is about) on the standing post; a tap on it switches to the standing area's next one. Cost if wrong: switching goals inside one area takes a tap people may not guess (the why line says it when there is more than one).
- **F4** On steps 2 to 5 a side post stands only for an area with a flag on this level or the one above; on Year and on Look back up every other kept area has one. Cost if wrong: on a lower step an empty area cannot be walked to without going back up.
- **F5** The ground draws area names only. Cost if wrong: back on the ground you cannot see which areas already hold goals.
- **F6** Look back up, and "See my whole plan" behind Today and Week, read the standing area top to bottom (one flag per level, the newest, with "+n more"), the other areas as side posts. Cost if wrong: the first look back shows one area's words, not all at once.
- **F7** In the walk "+n more" opens the paper over the mountain; a tap on a row walks to that flag and chooses it. Cost if wrong: one more surface inside the walk.
- **F8** Welcome is unchanged. Cost if wrong: the first screen's quick start still reads as words under the light, not as a gold button.
- **F9** A title longer than three lines on its flag (about 55 characters) is cut with an ellipsis there; the paper shows it whole. Cost if wrong: a long goal is read in full only on the paper.
- **F10** While the keyboard is up the top row is hidden (there is no Back with unsent words). Cost if wrong: leaving while typing takes a keyboard dismiss first.
- **F11** While a flag is chosen its Move to / Remove row stands above the light where the hint was (today it sits in the home-indicator zone). Cost if wrong: none known.
- **F12** A loose flag (no area, or an area no longer kept) while areas are kept stands on a side post with no name; a tap on it opens the paper. Cost if wrong: such a flag is reached only through the paper.

## Review Focus

1. **Eight areas and a loose pile.** Someone keeps all eight areas and has flags with no area. Expected: seven side posts and the nameless one lay out, nothing overlaps, nothing rises into the question or sits under the hint. Pinned in Task 5 (`eightAreasAndALoosePileStillLayOut`).
2. **A 200-character title, or one 60-letter word.** Expected: its flag is cut at three lines and never spills past its cloth or the screen; the paper wraps it whole. Pinned in Task 5 (`aVeryLongTitleIsCutNotSpilled`) and Task 7 (`thePaperShowsEveryTitleWhole`).
3. **A walk saved by yesterday's build is picked back up** (no standing area saved on a lower step, a tour half done). Expected: it opens standing where its focused goal is, nothing is lost, nothing traps. Pinned in Task 2 (`anOlderSavedWalkFindsItsFooting`).
4. **The standing area empties** (its last goal is removed or moved, or the area is let go on the ground). Expected: never a centre post with no way on: the walk stands in the next area that has something, or on a bare post under the question. Pinned in Task 2 (`whenTheStandingAreaEmptiesTheWalkStillStandsSomewhere`).
5. **Back or Leave for now tapped in the second after a spoken flag is let go.** Expected: the flag is planted first, then the walk moves. Pinned in Task 3 (`backPlantsAWaitingFlagFirst`, `leavingPlantsAWaitingFlagFirst`).

## The board as numbers

All in stage points (390 x 844). "Hand" means the value under `.level` footing; `.natural` varies it slightly.

**Top row** (steps 1 to 5, hidden while typing). Row at y 44, height 44. Back: x 8, width 76: SF Symbol `chevron.left` 14 semibold + "Back". More: centred, width 84: `ellipsis.circle` 15 + "More". Leave for now: right edge at 382, width 124. DM Sans SemiBold 14, white, `walkGlow()`; More is `WalkPalette.gold` while the choices are open.

**The words.** The question block's top padding is 96 (was 64). Flags and pills never rise above `WalkLayout.question` = 282 (was 250). The eyebrow's count, when there is one, follows the eyebrow as " · 1 OF 3" in gold.

**The light.** Unchanged: centre (195, 678), radius 48, ring 66. Points: Type it at `.w`, Show examples (or the calendar offer on Today) at `.e`, Undo at `.n` with its word under its disc (between the disc and the ring).

**At rest, above the light.** The hint: one line, top 572, DM Sans SemiBold 15. The Undo pill while it shows: 86 x 36 centred at x 195, top 564 (the hint is not drawn then; a note is drawn instead of the pill). The Move to row while a flag is chosen: x 10, y 558, 370 x 38 (neither hint nor pill then).

**The foot.** Next: a button 50 high, top 750, centred, width its words plus 56 (at least 160, at most 280), corner radius 25; fill top to bottom `#FFF7E0`, `#F8E2AD` at 46%, `#EBBF72`; glow `rgba(255,214,140)` 0.8 radius 16 and 0.45 radius 42; words DM Sans SemiBold 17 in `WalkPalette.ink`, then `arrow.down` 17 semibold. When it skips: no fill, a 1.5 pt white 0.7 outline, words white 0.9 at 16, no arrow, no glow. While the light is open, held, speaking or finishing, Next is not drawn and the hint stands at the foot instead: one line, top 766.

**The foot's shade.** From y 560 to the foot: `rgba(0,14,70)` at 0, 0.55 at 45%, 0.86 at the bottom (replaces the 120-point scrim).

**The standing post** (steps 1 to 5 off the ground; the pages). Pole at x 195, foot at y 556, bare pole 24 under the lowest cloth. From the top down: a caret (10 x 7, gold) 2 above the area's pill; the pill (height 23, its words plus 24 wide, at least 58, at most 150; gold 1.5 pt outline, `WalkPalette.navy` 0.9 fill, DM Sans SemiBold 11 capitals, tracking 1.1, gold words); on steps 2 to 5 the parent flag (width 126, DM Sans SemiBold 11, 14 line height, up to 2 lines, height 12 + 14 x lines, in its own level's colour); the step's flags, oldest highest, newest lowest (width 150, DM Sans SemiBold 13, 17 line height, up to 3 lines, height 19 + 17 x lines, plus 12 with a Week day tag or FIRST THING); then "+n more" (78 x 22, `#25563F`-style: the level's colour at 0.8 brightness, DM Sans SemiBold 11). 4 between cloths, 6 under the pill. Lines by estimate: `floor((width - 16) / 7.0)` characters a line.

**How many flags.** The newest n, n the largest of 4, 3, 2, 1 for which every shown title stands in full (up to three lines) and the whole stack, with "+k more" when k > 0, fits between y 282 and the lowest cloth's place (532). If not even one fits in full, one is shown cut to the lines that fit. A chosen flag is always among those shown (it takes the oldest shown one's place). Examples, while on: the person's newest `4 - e` flags, then `e` examples, `e = min(examples, max(2, 4 - flags))`, fewer if they do not fit.

**Side posts.** Left: inner pole x 90, outer pole x 33. Right: inner x 300, outer x 357. Low row pill tops: inner 524, outer 506; high row 84 above each. Fill order on a side: inner low, outer low, inner high, outer high. Areas before the standing one in ridge order go left, nearest first; those after go right; a side that is full spills to the other. Pill: height 21, at most 58 wide, centred on its pole and slid inside x 4…386; white 0.7 outline 1 pt, navy 0.86 fill, DM Sans SemiBold 9.5 capitals, tracking 1, white; a longer name shrinks to 0.8 then is cut with an ellipsis. Pole: 2.5 wide, from 4 above the pill up 60. Pennants: 20 x 13 triangles pointing right, their left edge 3 right of the pole, 14 apart from the pole's top down, in the colour of the level each stands for; at most 4; with more than 4 goals, 3 pennants and "+n" (9.5 SemiBold, white, glow) in the fourth place.

**Look back up** (step 6, and the plan behind Today's lowered sheet). Same pole and side slots. The pill's top is at y 110. Under it one cloth per level that has a flag in the standing area, year first: width 150, DM Sans SemiBold 12, up to 2 lines, height 23 + 13 x (lines - 1), the newest flag's words, carrying "+n more" in its last line when the level holds more. Nothing below y 700 (the ending sheet peeks at 716).

**The paper.** A sheet in `DailyPalette.paper`, top corners 22, shadow 0 -6 22 navy 0.35. Raised: its top is 72 under the row of words on a page (y 116 on the phone board), and y 116 in the walk. A grabber 40 x 5 at 9 from the top, then "Show the mountain" (DM Sans 12.5, muted), the whole first 44 points one button. Heading at 24 from the left, 52 from the sheet's top: Crimson Pro 30; the count right-aligned on its baseline, DM Sans 13 muted. Sections 12 apart from y 100: a heading row (DM Sans SemiBold 11, tracking 1.3, capitals, `DailyPalette.rust`; the section's count at its right in muted; a 1 pt line under it) then one row a title, DM Sans 16, line height 27, wrapping, each row at least 44 high to the touch. It scrolls.

**The pages' paper foot** (Month, Season, Year). A paper foot 188 high at the bottom of the window holding the strip (the first 78 points: grabber, "Read the whole year" in Crimson Pro 21, then "17 goals, as a plain list by area" in DM Sans 12.5 muted; one button) and under it the add bar in its paper look, More and Inbox either side as on Today. The page's hint ("Tap a post to walk to that area", DM Sans 12.5, white, glow) stands 38 above the foot. On a window shorter than 700 points the strip is one line, 44 high: "Read the whole year · 17 goals". With no goals on the page there is no strip.

## File structure

- `R/App/DemoStress.swift` (new, DEBUG): the full and long demo plans. `R/App/DemoMode.swift`, `R/Daily/DailyDemo.swift`: read them.
- `R/Walk/Core/WalkState.swift`, `WalkState+Plant.swift`, `WalkState+Orb.swift`: standing, the top row's events, the paper's events.
- `R/Walk/Core/WalkCopy.swift`: the question, the count, three points, new hints and labels.
- `R/Walk/Core/WalkLayout.swift`: the types and `make`. `WalkLayout+Controls.swift` (new: the controls' frames and the points' words, moved out). `WalkLayout+Standing.swift` (new: steps 1 to 6 off the ground). `WalkLayout+Ground.swift` (new: the ground's labels, moved out). The old `Builder`'s stacking, tips, stubs, risers, zoom and damping loop are deleted.
- `R/Walk/Core/PlanPaper.swift` (new): the list.
- `R/Walk/Core/WalkClassifier.swift`: keeps `defaults` only.
- `R/Walk/Views/WalkTopRow.swift` (new), `WalkHintRow.swift`, `WalkOrbView.swift`, `WalkSceneView.swift`, `WalkBannerViews.swift`, `WalkSideView.swift` (new), `PlanPaperView.swift` (new), `WalkView.swift`, `WalkEndingSheet.swift`.
- `R/Daily/Core/MountainPage.swift`, `DailyLookBack.swift`, `DailyCopy.swift`, `DailyMetrics.swift`; `R/Daily/Data/DailyWriter.swift`; `R/Daily/Views/MountainPageView.swift` and whatever else draws `MountainStage` or calls `WalkLayout.make`.
- Tests beside each in **T**; UI tests in **U**.

---

### Task 1: Stress plans in the demo

The screenshot sweep added throwaway demo seeding; this task adopts it properly so every later task can look at a full plan and long titles.

**Files:**
- Create: `R/App/DemoStress.swift`, `T/DemoStressTests.swift`
- Modify: `R/App/DemoMode.swift`, `R/Daily/DailyDemo.swift`, `R/Walk/Views/WalkView.swift`
- Read first: `.superpowers/sdd/2026-11-15-hand-walk-fix/sweep/seeding.patch` (what the sweep added) and `sweep/capturer-notes.md` if present.

**Interfaces:**
- Produces: `enum DemoStress` (DEBUG only) with `struct Plan`, `static let full: Plan`, `static let long: Plan`, `static func named(_: String?) -> Plan?`. Launch arguments: `-SymphonyWalkSeed full|long` (the walk's preview), `-SymphonyDailySeed full|long` (the pages), `-WalkSize WxH` (the walk pinned to a window of that size inside the simulator's screen, scaled to fit, as `-TodaySize` does for the pages).

- [ ] **Step 1: Write the failing tests** in `T/DemoStressTests.swift`:
  - `theFullPlanIsFull`: `DemoStress.full` has 5 areas; for each of year, season and month, every area has 3 or 4 goals; at least 12 week tasks; at least 9 dated today.
  - `theLongPlanIsLong`: every title in `DemoStress.long` is 36 to 44 characters; one area's name is exactly 24 characters.
  - `anUnknownNameIsNoPlan`: `DemoStress.named("nope") == nil`, `named(nil) == nil`.
- [ ] **Step 2: Run them, expect FAIL** (no `DemoStress`).
- [ ] **Step 3: Apply the patch's content under the new names** (`SweepSeed` becomes `DemoStress`; drop every "SWEEP (throwaway)" comment; everything inside `#if DEBUG`). Nothing outside DEBUG changes; a Release build must contain none of it.
- [ ] **Step 4: Run the tests, expect PASS;** build Release for the simulator, expect BUILD SUCCEEDED.
- [ ] **Step 5: Shots** (iPhone 17): the walk's Month step with `-SymphonyWalkSeed full`, and with `long`; the Year page with `-SymphonyDailySeed full`; the walk's Month step with `-WalkSize 484x669`. These are the BEFORE pictures for Tasks 5 to 9.
- [ ] **Step 6: Commit** `Demo: a full plan and long titles to look at (debug only)`.

### Task 2: The walk stands in one area

**Files:**
- Modify: `R/Walk/Core/WalkState.swift`, `WalkState+Plant.swift`, `WalkCopy.swift`, `WalkClassifier.swift`, `WalkTypes.swift`, `R/Walk/Core/WalkPosition.swift` (only if a resume needs it), `R/Daily/Data/DailyWriter.swift`
- Test: `T/WalkFlowTests.swift`, `WalkStepsTests.swift`, `WalkPlantTests.swift`, `WalkCopyTests.swift`, `WalkPositionTests.swift`, `WalkClassifierTests.swift`, `DailyWriterTests.swift`

**Interfaces:**
- Produces (on `WalkState`):
  - `var standing: UUID? { get }`: off the ground, `focusArea` when it is a kept area; else nil (the nameless post).
  - `func parentsHere() -> [WalkItem]`: on steps 2 to 5, the flags one level above the step's whose area is `standing` (a flag with no kept area counts for `standing == nil`), in planting order; `[]` on Year.
  - `func column(of item: WalkItem) -> UUID?`: the item's area if kept, else nil.
- Rules the reducer keeps after every event and action (one private `mutating func settleStanding()` called at the end of `apply` and `act`):
  1. Year, off the ground, `kept` not empty: `focusArea` is a kept area (if not, the first kept area in `kept` order).
  2. Steps 2 to 5: if `item(focus[level])` exists, `focusArea = column(of: it)`. If `focus[level]` is nil or gone: it becomes the remembered or newest flag of `parentsHere()`; if the standing area has none, the newest flag one level up anywhere, and `focusArea` follows it; if there is none at all, `focus[level] = nil` and `focusArea` stays (kept) or becomes the first kept area.
  3. Step 6: `focusArea` is kept, or the first kept area that has any flag.
- Changed behaviour:
  - Leaving the ground sets `focusArea = kept.first` for a quick start too. `enter(_:)` no longer clears `focusArea`.
  - `.areaTapped(id)` off the ground, on steps 1 to 6, for a kept `id`: stand there (`focusArea = id`; on steps 2 to 5 `focus[level]` becomes that area's remembered or newest parent, or nil). The area already stood in: nothing. A whole-year tour follows the tap as today (`follow`).
  - `.bannerTapped(id)` where `id == focus[level]` (steps 2 to 5): the next flag of `parentsHere()`, wrapping; with one, nothing. A tap never leaves the step with no parent while the area has one. A parent flag that is not the focused one is never drawn, so no other case arises.
  - Planting (`plantFlag`): on Year `areaId = standing`; below, `parent = item(focus[level])`, `areaId = parent?.areaId ?? standing`. No classifying.
  - `WalkAction.nudge`, `WalkClassifier.place`, `WalkCopy.placed` and the `placedNote` path are deleted. `DailyWriter` files a Year-page goal under the page's standing area (`hanging.focusArea`) with no classifying.
- `WalkCopy`:
  - `question`, Year off the ground with a standing area: `"What would make this a good year for \(phrase(for: area.name))?"`; with none: `"What would make the year ahead a good one?"` (unchanged).
  - `static func eyebrowCount(_ s: WalkState) -> String?`: `"1 of 3"` form (the standing area's place in `kept`, of `kept.count`) only when `s.step == 1 && !s.ground && s.depth == .full && s.kept.count > 1`; else nil. `eyebrow` for Year is `"The year ahead"` in both depths.
  - `focusAbove` becomes `" Tap the goal above to switch."`, added to the why line only when `parentsHere().count > 1`.
  - `areaHint(ground:kept:focused:)`: off the ground `focused ? "You are here" : "Tap to walk there"`.
  - `BannerRole`: `.focusable` is removed; `.focused` reads `"\(withTag), the goal this step is about"` and `taps == false`; new `.focusedOfSeveral` reads `"\(withTag), the goal this step is about, tap for the next one here"`, `taps == true`.

- [ ] **Step 1: Write the failing tests** (Swift Testing; build states with the existing helpers in `WalkFlowTests` / `WalkStepsTests`):
  - `aQuickStartStandsInItsFirstArea`: quick, keep Health then Work, Next off the ground: `standing == health`; the question is `"What would make this a good year for your health?"`; `WalkCopy.eyebrowCount` is nil.
  - `theWholeYearCountsItsAreas`: full, keep three, Next: `eyebrowCount == "1 of 3"`; Next (after planting) moves `standing` to the second and the count to `"2 of 3"`.
  - `tappingAnotherAreaWalksThere`: on Year `.areaTapped(work)` gives `standing == work`; tapping `work` again changes nothing.
  - `aGoalIsPlantedWhereYouStand`: standing in Work, plant "Run a 5K": its `areaId == work`, and `note == nil`.
  - `goingDownKeepsYouInTheArea`: standing in Work with one Work year goal, Next to Season: `focus[.season]` is that goal and `standing == work`.
  - `walkingToAnAreaOnALowerStepFocusesItsGoal`: on Month, `.areaTapped(health)` where Health has a season goal: `focus[.month]` is it, `standing == health`.
  - `tappingTheGoalAboveSwitchesToTheNextOneHere`: Work has two season goals; on Month `.bannerTapped(focused)` focuses the other; again wraps back; with one goal nothing changes.
  - `whenTheStandingAreaEmptiesTheWalkStillStandsSomewhere` (Review Focus 4): on Month remove the standing area's only season goal while Health has one: `standing == health` and `focus[.month]` is Health's; remove that too: `focus[.month] == nil`, `standing` is a kept area, and `WalkCopy.question` is the unfocused Month question.
  - `anOlderSavedWalkFindsItsFooting` (Review Focus 3): decode a `WalkPosition` JSON written by the old build (step 3, `focusArea` absent, `focus[.month]` a Work season goal, a `tour` half done), apply it, send `.noteExpired`: `standing == work`; no crash; `tour` unchanged.
  - `backUpToTheYearKeepsTheArea`: from Season standing in Work, Back: on Year `standing == work`.
  - In `WalkCopyTests`: `theWhyLineOffersTheSwitchOnlyWithSeveral`.
  - In `DailyWriterTests`: `aYearGoalFromTheBarGoesWhereThePageStands`.
- [ ] **Step 2: Run them, expect FAIL.**
- [ ] **Step 3: Implement** as the Interfaces block says. Delete the tests that pinned un-focusing a peak, `nudge`, classifying and the placed note; keep `WalkClassifierTests` only for `defaults`.
- [ ] **Step 4: Run** `WalkFlowTests`, `WalkStepsTests`, `WalkPlantTests`, `WalkCopyTests`, `WalkPositionTests`, `WalkOrbTests`, `DailyWriterTests`, `MountainPageTests`: PASS (tests of the old layout in `WalkLayoutTests` may fail until Task 5; say which in the report).
- [ ] **Step 5: Commit** `Walk: one area at a time, and the question names it`.

### Task 3: The controls, as rules and frames

**Files:**
- Create: `R/Walk/Core/WalkLayout+Controls.swift` (move "The controls under the light" out of `WalkLayout.swift` unchanged first, then edit)
- Modify: `R/Walk/Core/WalkState.swift`, `WalkState+Orb.swift`, `WalkCopy.swift`, `WalkOrb.swift`, `WalkLayout.swift`
- Test: `T/WalkOrbTests.swift`, `WalkCopyTests.swift`, `WalkLayoutTests.swift` (the controls' tests only), `WalkFlowTests.swift`

**Interfaces:**
- `WalkEvent` gains `.backTapped`, `.leaveTapped`. Neither `leavesAWaitingFlag`. `.backTapped` does what `act(.back)` does; `.leaveTapped` what `act(.leave)` does. `.moreTapped` opens the choices when closed and closes them when open.
- `WalkState`: `var showsTopRow: Bool { (1...5).contains(step) && typing == nil }`; `showsMore == showsTopRow`; `var choicesOpen: Bool { orb == .open }`.
- `WalkCopy.points(_:_:)` on steps 1 to 5 returns at most three, in this order of places: `.w` Type it ("Type your own" on the ground), `.e` Show/Hide examples (steps 1 to 4 off the ground) or "Show my calendar on Today" (Today, while offered), `.n` Undo (when `!s.undo.isEmpty`). Back, Next, Leave for now and the switch are never points. Welcome's two points are unchanged.
- `WalkCopy.back(_:_:)` becomes internal (the top row's VoiceOver label). New: `static let backWord = "Back"`. `hintAnother = "Hold the light to add another."`. `replayFooter` ends "To stop part-way, tap Leave for now at the top." `WalkCopy.hint` is unchanged in what it says.
- `WalkOrb.wordsAbove(_:)`: `.n` is no longer above (its word sits under its disc) on steps 1 to 5; Welcome's `.nw`/`.ne` unchanged.
- `WalkLayout` (all `static func … (_ s: WalkState) -> CGRect?`, nil when not shown, numbers from "The board as numbers"): `backFrame`, `moreFrame`, `leaveFrame` (when `showsTopRow`); `nextFrame` (steps 1 to 5: x 55, y 750, 280 x 50; Welcome unchanged); `hintFrame` (at rest: top 572; light open, held, speaking or finishing: top 766; Welcome unchanged; nil while the Undo pill or the Move row shows); `undoFrame` (x 152, y 564, 86 x 36, when `showsUndoPill && orb == .idle && note == nil && selected == nil`); `moveRowFrame` (x 10, y 558, 370 x 38, when `selected != nil && orb == .idle && typing == nil`); `teachFrame` unchanged. `static let question: CGFloat = 282`. `WalkLayout` stored properties gain `back`, `leave`, `moveRow` beside `more`.

- [ ] **Step 1: Write the failing tests:**
  - `theLightOffersAtMostThree`: for every state in `Generated.states()` on steps 1 to 5, `WalkCopy.points` has at most 3 entries and every action is one of `.type, .examples, .calendar, .undo`.
  - `undoWaitsInTheChoicesOnceThereIsSomethingToUndo`: no `.n` point before planting; one after.
  - `theTopRowIsThereOnEveryStepAfterWelcome`: frames non-nil on steps 1 to 5 and on the ground, nil on 0 and 6 and while typing; each at least 44 x 44; none meets another; all inside y 44…88.
  - `nextStandsAloneAtTheFoot`: over the generated states where `nextFrame` is non-nil on steps 1 to 5: `maxY <= 844 - 34`, `minY >= 678 + 66`, and it meets no other control's frame.
  - `theHintStandsAboveTheLightAtRest`, `theHintGoesToTheFootWhileTheLightIsBusy`.
  - `undoShowsAboveTheLight`: after planting, `undoFrame` is (152, 564, 86, 36) and `hintFrame == nil`; with a note showing, `undoFrame == nil` and the hint carries the note.
  - `theMoveRowStandsAboveTheLight`: with a flag chosen `moveRowFrame.maxY <= 678 - 66 - 8`.
  - `backTappedGoesBackOneStep`, `leaveTappedPausesTheWalk`, `moreTogglesTheChoices`.
  - `backPlantsAWaitingFlagFirst`, `leavingPlantsAWaitingFlagFirst` (Review Focus 5): hold, hear "Book the plumber", let go (state `.finishing`), send `.backTapped` / `.leaveTapped`: the effects contain a `.write(.create(…))` for that title before `.save` / `.end(.paused)`.
  - `noTopRowWhileTyping` (F10).
  - Update `theControlsUnderTheLightKeepClear` and `thePointsWordsKeepClear` to the new frames (the points' words keep clear of the ring, each other, the edges and the home-indicator zone).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `WalkOrbTests`, `WalkCopyTests`, `WalkFlowTests`, and the controls' tests in `WalkLayoutTests`: PASS.
- [ ] **Step 5: Commit** `Walk: a top row, three choices on the light, Next at the foot (rules)`.

### Task 4: The controls, drawn

**Files:**
- Create: `R/Walk/Views/WalkTopRow.swift`
- Modify: `R/Walk/Views/WalkHintRow.swift` (`WalkUnderlay` too), `WalkOrbView.swift`, `WalkSceneView.swift`, `WalkView.swift`, `R/App/DemoMode.swift` (the `-SymphonyWalkOrb` words still drive the same states; add `back`), `U/WalkUITests.swift`

**Interfaces:**
- Consumes: Task 3's frames and events; Task 2's `WalkCopy.eyebrowCount`.
- Produces: accessibility identifiers `walk.back`, `walk.more`, `walk.leave`, `walk.next` (kept), `walk.undo`.

- [ ] **Step 1: Draw** from "The board as numbers": `WalkTopRow` (three plain buttons at Task 3's frames; Back's VoiceOver label is `WalkCopy.back(s, p)`, Leave's hint is `WalkCopy.leaveDetail` when `placeKept`, More's label `WalkCopy.moreLabel` with the value "open" / "closed"); the gold Next and its outlined skip in `WalkHintRow`; the hint, the Undo pill and the Move row at their new frames; the foot's shade; the question at top padding 96 with the eyebrow's count in gold; the light's ring with three points (the top one's word under its disc) and VoiceOver's custom actions reduced to those the points offer. Remove `moreButton` from the hint row.
- [ ] **Step 2: UI tests** in `U/WalkUITests.swift` (launch with `launchDemo()` and the walk's arguments; no typing): `testTheTopRowIsOnEveryStep` (steps 1 to 5: `walk.back`, `walk.more`, `walk.leave` exist and are hittable; `walk.next` hittable and its frame's bottom is at least 34 points above the window's bottom); `testTheLightOffersThree` (tap `walk.more`: at most three point buttons, none labelled Back, Next or Leave for now); `testBackGoesBack` (step 3, tap `walk.back`, the eyebrow is the season's). Update the existing three tests to the new controls.
- [ ] **Step 3: Run** the unit suites of Task 3 and `WalkUITests`: PASS.
- [ ] **Step 4: Shots** (iPhone 17, then `-WalkSize 484x669` and `-WalkSize 375x667`): Year at rest (nothing planted: Skip), Month just planted (Undo pill), Month at rest (gold Next, hint above the light), the choices open, a flag chosen (Move row), typing, speaking, the ground, Welcome. Look at each: the three top words do not collide on the narrow phone; Next is clear of the home indicator; nothing sits on the light's glow.
- [ ] **Step 5: Commit** `Walk: the controls as the board draws them`.

### Task 5: The standing layout

**Files:**
- Create: `R/Walk/Core/WalkLayout+Standing.swift`, `R/Walk/Core/WalkLayout+Ground.swift`
- Modify: `R/Walk/Core/WalkLayout.swift` (types and `make`; the old `Builder` beyond the ground's labels is deleted), `R/Walk/Core/WalkFooting.swift` (only if the hand needs new ranges)
- Test: `T/WalkLayoutTests.swift` (rewritten: keep the art, band and controls tests; delete the tips, stubs, risers, zoom, crowded-ridge and golden-frame tests), `T/WalkFootingTests.swift`

**Interfaces:**
- `WalkLayout.Kind` becomes `full, parent, compact, more(Int), ghost`. (`tip` and `stub` go; so does `Banner.more` carried on a `tip`; `compact` keeps `more: Int?` for Look back up.)
- `WalkLayout.Label` gains `var standing: Bool = false`.
- New `struct Side: Equatable, Identifiable { let id: String; let area: UUID?; let name: String; let pill: CGRect?; let poleX: CGFloat; let poleTop: CGFloat; let poleFoot: CGFloat; let pennants: [Pennant]; let extra: Int; let count: Int; let label: String; var lean: Double }` with `struct Pennant: Equatable { let frame: CGRect; let level: WalkLevel }`. `area == nil` and `pill == nil` for the nameless post (F12). `label` is VoiceOver's, from new `WalkCopy.sideLabel(name:count:level:periods:)`: "Health, 4 goals this month" / "Work, 1 goal this year" / "Home, 3 tasks this week" / "No area, 2 goals this month".
- `WalkLayout` gains `let sides: [Side]`. `labels` holds the ground's choices (on the ground) or the one standing label (`standing == true`, not tappable). `posts` holds the one standing post, or none on the ground and on Welcome. `camera` is always the art's stop for the step (no zoom).
- `static func tapEvent(_ banner: Banner, on post: Post) -> WalkEvent?`: `.more` gives `.paperOpened` (Task 7 adds the case; until then return nil), `.ghost` `.exampleTapped`, `.full` and `.parent` `.bannerTapped`, `.compact` nil. New `static func tapEvent(_ side: Side) -> WalkEvent?`: `.areaTapped(area)` for a named post, `.paperOpened` (nil until Task 7) for the nameless one.
- `static let standingFoot: CGFloat = 556`, `standingWidth: CGFloat = 150`, `parentWidth: CGFloat = 126`, `lowestCloth: CGFloat = 532`. `static func lines(for text: String, width: CGFloat) -> Int` uses 7.0 points a character, at most 3.
- Which flags: Year: the standing area's year goals. Steps 2 to 4: the parent flag `item(focus[level])` (kind `.parent`), then the standing area's flags on the step's level (every parent's). Today: the parent is the focused week task; the one `.full` flag is the first thing, tagged. Which side posts: rule F4, in the places "The board as numbers" gives; each pennant stands for one flag on the step's level (on Year: year goals), newest first.
- The parent flag's role is Task 2's `.focusedOfSeveral` when `parentsHere().count > 1`, else `.focused`; a flag of the step's level keeps `.mine` / `.plain` and the Today roles. A chosen flag glows as today.
- `needleDown` as today.

- [ ] **Step 1: Write the failing tests** (replace `Generated.make` so it builds standing states: steps 1 to 6, 0 to 8 kept areas, with and without loose flags, 0 to 7 flags a post, titles of 8, 22, 44, 60 and 200 characters and one 60-letter word, a chosen flag, examples on, each standing area in turn; keep `Generated.ground()`):
  - `oneAreaShowsItsWords`: Month, full plan, standing in People: one post; its banners are one `.parent`, at most four `.full`, at most one `.more`; every `.full` banner's item is a People month goal.
  - `fewerFlagsRatherThanCutTitles`: Month with a parent and four two-line titles: three `.full` and `.more(1)`.
  - `atMostFourEachInFull`: over the generated states: `.full` count <= 4; unless only one is shown, every `.full` banner's `lines == min(3, WalkLayout.lines(for: text, width: 150))`; `.more(n)` exactly when flags are hidden, `n` = hidden.
  - `aVeryLongTitleIsCutNotSpilled` (Review Focus 2): a 200-character title and a 60-letter word each give a banner of 3 lines, width 150, inside x 4…386 and y 282…532.
  - `theAreaNameSitsOnItsOwnPost`: the standing label's `midX` is within 4 of the post's `base.x`, and its `maxY` is at most 8 above the top banner's `minY` (or, with no banner, the pole's top).
  - `noLevelAboveTheParentIsDrawn`: on Month every banner's level is season or month; on Week, month or week.
  - `otherAreasAreSmallPostsWithACount`: full plan on Month standing in People: four sides (Health, Home left; Work, Money right, nearest first); each has `min(4, count)` pennants, or 3 and `extra == count - 3`; `label` as the Interfaces say.
  - `aQuickWalkShowsNoEmptyPostsLowerDown` (F4): quick walk on Month, three kept, one chain in Work: `sides.isEmpty`. On Year the same walk has two sides.
  - `eightAreasAndALoosePileStillLayOut` (Review Focus 1): 8 kept plus loose flags: 7 named sides and 1 nameless; `Invariants.check` is empty.
  - `aChosenFlagIsAlwaysShown`: seven month goals, choose the oldest: it is among the `.full` banners.
  - `examplesTakeTheRoomLeft`: 0, 1, 3 and 5 own flags with examples on: the counts the rule gives.
  - `theGroundShowsNamesOnly` (F5): on the ground `posts.isEmpty && sides.isEmpty`; every area has a label.
  - `nothingOverlaps(_ footing:)` for `.natural` and `.level` over `Generated.states()`, with `Invariants.check` rewritten to: (a) no two cloths' drawn boxes meet; (b) no side's pill, pole or pennants meet another side's, the standing post's cloths or its label; (c) nothing above y 282 on steps 1 to 5 (y 92 on step 6); (d) no cloth below 532 + 0.5, no pill below 556, on steps 1 to 5 (nothing below 700 on step 6); (e) everything inside x 4…386; (f) nothing within 86 of the light's centre on steps 1 to 5; (g) every tappable thing is at least 44 points apart from the next one's centre, or its hit shape (the frame grown to 44) does not meet another's frame.
  - `theSameStateGivesTheSameLayout`; `underLevelFootingTheNumbersAreTheBoards` (pole x 195, foot 556, lowest cloth 532, side poles 90 / 33 / 300 / 357).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `WalkLayout+Standing.swift` (steps 1 to 5 here; step 6 arrives in Task 8 and may return the standing label and sides only until then) and move the ground's labels to `WalkLayout+Ground.swift`. Delete the old stacking. If the hand ever breaks an invariant in the sweep, narrow that hand's range rather than adding a damping loop, and say so in the report.
- [ ] **Step 4: Run** `WalkLayoutTests`, `WalkFootingTests`: PASS. The app will not draw sides yet (Task 6); it must still build and the walk must still open.
- [ ] **Step 5: Commit** `Walk: words for the area you stand in, small posts for the rest (layout)`.

### Task 6: The standing layout, drawn

**Files:**
- Create: `R/Walk/Views/WalkSideView.swift`
- Modify: `R/Walk/Views/WalkSceneView.swift` (`WalkWorldView`), `WalkBannerViews.swift` (`WalkBannerView`, `WalkLabelView`), `R/Daily/Views/MountainPageView.swift` (`MountainStage` passes the new callback through), `R/Walk/Core/WalkArt+Tall.swift` (only the per-step picture stops, if needed), `U/WalkUITests.swift`

**Interfaces:**
- `WalkWorldView` gains `onSide: (WalkLayout.Side) -> Void`. Every caller passes one (the walk sends `WalkLayout.tapEvent(side)`).
- Accessibility identifiers: `walk.side.<area name lowercased>`, `walk.standing` (the standing label).

- [ ] **Step 1: Draw** from "The board as numbers": the standing pill with its caret; `.parent` and `.more` cloths; `.full` cloths with `.lineLimit(banner.lines)` and `.minimumScaleFactor(0.9)`; `WalkSideView` (pole, pennants with `WalkPennant`, "+n", pill; one button with the side's `label`; hit shape at least 44 x 44). Remove the tip and stub drawing. A side's tap and the standing post's change animate with the walk's existing drop-in and the 0.25 s cross-fade under Reduce Motion; no camera glide inside a step.
- [ ] **Step 2: The picture under the flags.** Shoot each step 1 to 6 with the full plan and look: the standing post's foot (195, 556) and the side slots must stand on land in the painting, not on sky or water. Where they do not, move that step's picture stop in `WalkArt+Tall.swift` (the layout's numbers do not move) and keep `WalkBackdropTests` / `WalkArtCutTests` passing; list every stop changed in the report.
- [ ] **Step 3: UI test** `testWalkingToAnotherArea`: Year step with the full plan, tap `walk.side.home`: the question contains "home" and `walk.standing`'s label is "Home".
- [ ] **Step 4: Run** `WalkLayoutTests`, `WalkBackdropTests`, `WalkArtCutTests`, `WalkUITests`, `LightDailyUITests`: PASS.
- [ ] **Step 5: Shots** for the preview plan, `-SymphonyWalkSeed full` and `long`, on iPhone 17, `-WalkSize 484x669` and `-WalkSize 375x667`: Year, Season, Month, Week, Today at rest; Month just planted; Month with examples; Month with a flag chosen. Compare with Task 1's before shots. Look for: any title cut that the rule says should be whole (the estimate is too generous: lower the characters-per-line number and re-run Task 5's tests); a pill or pennant touching a cloth; a post on sky.
- [ ] **Step 6: Commit** `Walk: the standing post and the small posts, drawn`.

### Task 7: The paper

**Files:**
- Create: `R/Walk/Core/PlanPaper.swift`, `R/Walk/Views/PlanPaperView.swift`, `T/PlanPaperTests.swift`
- Modify: `R/Walk/Core/WalkState.swift`, `WalkCopy.swift`, `WalkLayout.swift` (`tapEvent`), `R/Walk/Views/WalkView.swift`, `R/App/DemoMode.swift` (`-SymphonyWalkOrb paper`), `T/WalkFlowTests.swift`, `U/WalkUITests.swift`

**Interfaces:**
- ```swift
  struct PlanPaper: Equatable {
      struct Row: Equatable, Identifiable { let id: UUID; let title: String; let tag: String? }
      struct Section: Equatable, Identifiable { let id: String; let area: UUID?; let name: String; let rows: [Row] }
      let title: String; let count: String; let sections: [Section]
      var total: Int { get }
      static func make(level: WalkLevel, items: [WalkItem], areas: [WalkArea], kept: [UUID],
                       title: String, today: Date) -> PlanPaper
  }
  ```
  Sections follow `areas` order, kept areas only, an area with no flag on `level` left out; flags with no kept area last under `WalkCopy.paperNoArea` ("Not under an area yet"). Rows in planting order. `tag` is a week task's day (`WalkWords.tag`), else nil. On `.today` the level read is `.week` filtered to today.
- `WalkCopy`: `paperCount(_ n: Int, level: WalkLevel) -> String` ("1 goal", "17 goals"; "1 task", "12 tasks" on Week and Today); `showMountain = "Show the mountain"`; `paperNoArea`; `paperTitle(_ s: WalkState, _ p: WalkPeriods) -> String` (the step's period in words: "2027, the year ahead", the season's name, the month's name, "This week", "Today").
- `WalkState`: `var paperOpen = false` (never saved; `settle()` closes it). `WalkEvent` gains `.paperOpened`, `.paperClosed`, `.paperRow(UUID)`; none `leavesAWaitingFlag`. `.paperOpened` only on steps 1 to 5 off the ground. `.paperRow(id)`: closes the paper; stands in that flag's column (on steps 2 to 5 `focus[level]` becomes its parent when it has one on the level above); if `selects(id)`, chooses it. While `paperOpen`, `showsTopRow`, `showsNextLine` and the light's gestures are off.
- Identifiers: `walk.paper`, `walk.paper.close`, `walk.paper.row.<n>`.

- [ ] **Step 1: Write the failing tests:**
  - `PlanPaperTests`: `sectionsFollowTheRidge`; `anAreaWithNothingHereIsLeftOut`; `looseFlagsComeLast`; `thePaperShowsEveryTitleWhole` (Review Focus 2: a 200-character title is in its row unshortened); `theCountSaysGoalsOrTasks` ("1 goal", "17 goals", "12 tasks"); `weekRowsCarryTheirDay`.
  - `WalkFlowTests`: `plusMoreOpensThePaper`; `aRowWalksToItsFlagAndChoosesIt` (seven month goals in Work, standing in Health, `.paperRow(oldestWorkGoal)`: `paperOpen == false`, `standing == work`, `selected` is it); `thePaperClosesWhenTheStepChanges`; `nothingElseMovesWhileThePaperIsOpen` (`.nextTapped` and `.orbDown` change nothing).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the core, then `PlanPaperView` from "The board as numbers" (a `ScrollView`; each row a button; the first 44 points close it; VoiceOver reads the heading, the count, then each section as a heading with its rows; Escape gesture closes) and show it in `WalkView` over the stage while `paperOpen` (it rises 0.3 s; with Reduce Motion it fades).
- [ ] **Step 4: UI test** `testPlusMoreOpensThePaperAndARowComesBack` (full plan, Month: tap the "+n more" cloth, `walk.paper` exists, tap `walk.paper.row.0`, the paper is gone and the Move row shows).
- [ ] **Step 5: Run** `PlanPaperTests`, `WalkFlowTests`, `WalkLayoutTests`, `WalkUITests`: PASS. **Shots:** the paper over Month and Week with the full plan and with long titles, on iPhone 17 and `-WalkSize 484x669`.
- [ ] **Step 6: Commit** `Walk: the paper, where the whole level is read`.

### Task 8: Look back up, in the same form

**Files:**
- Modify: `R/Walk/Core/WalkLayout+Standing.swift`, `WalkState.swift`, `WalkCopy.swift`, `R/Walk/Views/WalkEndingSheet.swift` (`WalkEndingView`), `R/Daily/Core/MountainPage.swift` (`lookBack`), `DailyLookBack.swift`, the views that draw the plan behind Today's and Week's lowered sheet
- Test: `T/WalkLayoutTests.swift`, `WalkFlowTests.swift`, `DailyTodayPageTests.swift` or wherever `DailyLookBack` is tested

**Interfaces:**
- Step 6 layout (F6): the standing label at y 110; one `.compact` cloth per level that has a flag in the standing area, year first, the newest flag's words, `more` = the others on that level; sides for every other kept area with a flag (pennants: up to 4, one per flag, year first, each in its level's colour; `count` = all its flags; `label` "Health, 9 goals and tasks"). `.compact` never takes a tap.
- `WalkState`: `.areaTapped` on step 6 stands there. Entering step 6 stands in the area walked last (`focusArea` if it has a flag), else the first kept area with one.
- `DailyLookBack`: `expanded` goes; new `private(set) var standing: UUID?`; `mutating func tap(_ event: WalkEvent?)` handles `.areaTapped(id)` only; `plan(...)` sets `focusArea = standing ?? first kept area with a flag`.
- `WalkCopy.lookBackHint = "Tap a post to see that area"`, drawn once under the header on step 6 when there are sides.

- [ ] **Step 1: Write the failing tests:** `lookingBackUpReadsOneAreaTopToBottom` (full plan: five `.compact` cloths, year above season above month above week above today, each within x 120…270; four sides); `theNewestCarriesTheCountOfTheRest` (`more == 3` on a level of four); `aQuickWalksLookBackIsOneChainAndNoPosts`; `nothingSitsUnderTheEndingSheet` (nothing below y 700); `tappingAPostOnTheLookBackWalksThere`; in the look-back's tests `theWholePlanBehindTodaySwitchesAreaOnATap`; `Invariants.check` empty over the generated step-6 states.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** `WalkLayoutTests`, `WalkFlowTests`, `MountainPageTests`, the look-back's suite, `WalkUITests`, `LightDailyUITests`: PASS.
- [ ] **Step 5: Shots:** Look back up (sheet down, sheet up) for the preview, full and long plans on iPhone 17 and `-WalkSize 484x669`; Today's "See my whole plan" with `-SymphonyDailySeed full` on iPhone 17 and the Duo outside screen.
- [ ] **Step 6: Commit** `Walk: looking back up reads one area, top to bottom`.

### Task 9: The Month, Season and Year pages

**Files:**
- Modify: `R/Daily/Core/MountainPage.swift`, `DailyCopy.swift`, `DailyMetrics.swift` (and its `+Spread`, `+Tent` parts where a mountain page is laid out), `DailyModel.swift` (only what the bar's look and the paper need), `R/Daily/Views/MountainPageView.swift`, `DailyBarView.swift` (the paper look on these pages), `LightSpreadView.swift` / `LightHalfOpenView.swift` where they draw a mountain page, `R/Daily/DailyDemo.swift` (`-SymphonyDailyState paper`)
- Test: `T/MountainPageTests.swift`, `DailyMetricsTests.swift`, `DailyCopyTests.swift`, `U/LightDailyUITests.swift`

**Interfaces:**
- `MountainPage`: `focusArea` is the standing area on every level (it starts as the first kept area with a flag on the page's level, else the first kept; `settle()` keeps it valid). `expanded` goes. `Event` gains `.paper(Bool)`, `.paperRow(UUID)`; `.peak(id)` works on every level (stands there; on Season and Month `focus` becomes that area's newest parent); `.flag(id)` on the focused parent switches to the area's next one. `var paperOpen = false`. `var paper: PlanPaper? { get }` (the page's level, its own items, title `DailyCopy.paperTitle`), nil when the page has no flag on its level. `static func event(for tap: WalkEvent) -> Event?` maps `.paperOpened` to `.paper(true)`. `walkState` passes `focusArea` and `focus` on every level. `hanging` gives the standing area on every level (a goal from the bar lands where the page stands, under the focused parent on Season and Month).
- `DailyCopy`: `hint(_ level:sides:)`: with side posts "Tap a post to walk to that area", else today's words; `readWhole(_ level:) -> String` ("Read the whole year" / "season" / "month"); `paperSub(_ count: String) -> String` ("17 goals, as a plain list by area"); `paperLine(_ level:count:)` for the one-line strip ("Read the whole year · 17 goals"); `paperTitle(_ level:periods:)`.
- `DailyMetrics`: `func mountainFoot(...) -> (foot: CGRect, strip: CGRect?, oneLine: Bool, bar: Bar, hintTop: CGFloat, paperTop: CGFloat)` on every window the pages open in (phone, narrow, Duo outside, the spread's pane, half-open), from "The pages' paper foot".
- Identifiers: `daily.mountain.paper.strip`, `daily.mountain.paper`, `daily.mountain.paper.close`.

- [ ] **Step 1: Write the failing tests:** `MountainPageTests`: `thePageStandsWhereItsFlagsAre`; `aPeakTapWalksThereOnEveryLevel`; `theFocusedGoalSwitchesToTheNextOneHere`; `aGoalFromTheBarLandsWhereThePageStands`; `thePaperListsThisLevelByArea` (full plan, Year: 5 sections, `total == 17` for the demo's numbers); `noGoalsNoPaper`; `aPaperRowWalksThereAndChoosesTheFlag`. `DailyMetricsTests`: `thePaperFootFitsEveryWindow` (strip and bar inside the window, clear of the safe area's foot, on 393x852, 375x667, 466x678, 484x669 and the spread's pane; `oneLine` on windows under 700 high). `DailyCopyTests` for the new words.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** core, then the view (the paper foot, the strip, the raised paper with the add bar staying at its foot, `PlanPaperView` reused; the mountain's flags and posts are not touchable under the raised paper and VoiceOver skips them).
- [ ] **Step 4: UI test** `testThePaperStripOpensTheList` (Year page, full plan: tap the strip, the list shows five headings, tap `daily.mountain.paper.close`, the mountain is back) and update the existing page tests. **Run** `MountainPageTests`, `DailyMetricsTests`, `DailyCopyTests`, `DailyModelTests`, `DailyWalkDownTests`, `LightDailyUITests`, `LightSpreadUITests`, `LightEditionUITests`, `FullHouseholdUnchangedUITests`: PASS.
- [ ] **Step 5: Shots:** Year, Season, Month pages (mountain, a flag chosen with its panel, the paper raised) for seeds `morning`, `full`, `long`, `empty` on iPhone 17, 375x667, the Duo outside screen, the spread 951x669, and half-open laptop and book. Look for: the panel, the hint and the foot never overlapping; the bar's field readable on paper; an empty page still taking a goal.
- [ ] **Step 6: Commit** `Light pages: the same standing mountain, and a paper to read the whole level`.

### Task 10: Everything else that draws the mountain, VoiceOver, and the record

**Files:**
- Modify: every remaining caller of `WalkLayout.make`, `MountainStage` or `WalkWorldView` (find them with a search; the walk-down and the handover among them), `R/Walk/Views/*` for VoiceOver, `apple/SymphonyOS/PLANNING.md`, this plan ("As built"), `docs/app-store/2026-11-14-light-listing-draft.md` only if it describes a changed control
- Test: `T/DailyWalkDownTests.swift`, `T/DailyHandoverTests.swift`, `U/*`

- [ ] **Step 1: Walk-down and handover.** A walk-down opens standing in its goal's area with that goal as the parent flag (test `aWalkDownStandsInItsGoalsArea`); the handover's light still travels from (195, 678) (its tests pass unchanged).
- [ ] **Step 2: VoiceOver, in reading order** on a walk step: the top row (Back, More, Leave for now), the eyebrow, question and why, the standing label ("Work, you are here"), the parent flag, each flag, "+n more", each side post, the hint or the Undo pill, the light, Next. Custom actions on a flag (Move to each area, Remove) are unchanged. The paper reads as Task 7 says. Check with the accessibility inspector's audit on Year, Month and the paper, and fix what it reports; list what it reported.
- [ ] **Step 3: Text size and motion.** The stage stays capped at extra large (existing). At the largest size the top row's three words still fit on 375 wide (they shrink to 0.85 before anything is cut). Reduce Motion: no drop-in, cross-fades only.
- [ ] **Step 4: The record.** Rewrite the parts of `PLANNING.md` ("The walk": the controls, standing, the layout's guarantees, the paper; "The everyday screens (light)": the pages' paper foot, the look back) that this plan changed, and append "As built" to this plan: every ruling F1 onward with what was built, anything that differs from the board's numbers and why, known gaps, and what Scott should look at on his phone.
- [ ] **Step 5: Run every unit suite and every UI class one at a time:** all PASS. The must-not-change diff is empty. Release build for the simulator succeeds.
- [ ] **Step 6: Commit** `Light: every mountain in the new form, VoiceOver, and the record`.

---

Tasks for what the cold read of the screenshot sweep finds are added below this line before the build starts, each with its own files, tests and shots.
