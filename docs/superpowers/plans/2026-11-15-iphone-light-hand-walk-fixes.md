# iPhone Light Version, Step 4: The Hand-Walk Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix, in one pass, everything Scott found walking the preview on his real Duo: the walk's controls are obvious (a top row, three choices on the light, one gold Next), the walk stands in one area at a time, and a full plan stays readable (words for one area, small posts for the rest, a paper list for reading).

**Architecture:** Three pure changes with unit tests, then views that only draw. (1) `WalkState` always stands in one area (`focusArea` on every step). (2) The controls' rules and frames move out of the light: a top row, a three-point compass, a foot button. (3) `WalkLayout`'s many-column stacking (tips, stubs, risers, zoom) is replaced by a standing layout: one worded post in the centre, small wordless side posts, and a pure `PlanPaper` list that the walk and the Month, Season and Year pages both open. The pages keep drawing the walk's own stage, so they change with it.

**Tech Stack:** SwiftUI, SwiftData, Swift Testing, XcodeGen. No server, database, schema or web change.

**Spec:** `docs/superpowers/specs/2026-11-13-iphone-light-version-design.md`, section "Hand-walk fixes (2026-11-15)" (binding, with "Anti-goals" and "Constraints"). The approved board's source is `docs/superpowers/specs/2026-11-15-iphone-light-hand-walk-board/`; its numbers are lifted into "The board as numbers" below, so no builder needs to open the HTML. Read with it: `apple/SymphonyOS/PLANNING.md` ("The walk", "The everyday screens (light)") and the "As built" section of `docs/superpowers/plans/2026-11-14-iphone-light-daily.md`.

**Amended 2026-11-15 (afternoon), before Task 2A was built.** Two things were added after the plan was first written: the owner's tenth comment (the walk and the mountain pages sat in a phone-shaped strip with navy either side: Task 2A, rulings F13 to F19, "On a wider window") and what five cold readers of the screenshot sweep found that the plan missed (69 findings, `.superpowers/sdd/2026-11-15-hand-walk-fix/sweep/review/findings-consolidated.md`: "Added from the cold read" blocks in Tasks 3 to 10, new Tasks 11 to 13, rulings F20 to F29). Where a cold-read block gives a width of 150 or 126 or the edges 4…386, read it as the wing-0 value of Task 5's `standingWidth(wing:)`, `parentWidth(wing:)` and `edges(wing:)`.

**Order of building:** 1, 2, 2A, 12, 3, 11, 4, 5, 6, 7, 8, 9, 13, 10.

**Left out of this pass on purpose** (told to the owner): large text on Today and Week and on the controls (S50, S51: its own pass; the stage's cap stays); the Inbox (S53) and the rest of Settings and More (S24), which are the full edition's views; moving between weeks (S54); half open in the middle of the walk (S56: check on the real Duo); editing a flag's words; a colour key on Look back up; the sign's eyebrow on the narrow phone (S48's second half); a count of unshown month goals on Week's band; a half-typed draft following from page to page (S42: ruling D22 keeps typed words); and the readers' matters of taste S64 to S69. Not cured by Task 2A: the walk at 79% size on windows about 670 points high, and opened flat as one column on the fold; each wants its own board.

## Global Constraints

- Work only in `/Users/scottkaufman/.claude-worktrees/symphonyOS/ios-light-build` on branch `claude/ios-light-build`. Never edit the main worktree. **Nothing is pushed or deployed.** No migration, no edge function, no remote database, no Supabase tool.
- **R** = `apple/SymphonyOS/SymphonyOS`, **T** = `apple/SymphonyOS/SymphonyOSTests`, **U** = `apple/SymphonyOS/SymphonyOSUITests`. After adding, moving or deleting a file: `cd apple/SymphonyOS && xcodegen generate` (commit the regenerated project with the task).
- **TEST** (one suite): `cd apple/SymphonyOS && xcodebuild test -scheme SymphonyOS -destination 'platform=iOS Simulator,id=29378388-0323-4E79-AD34-D46BA52A3461' -parallel-testing-enabled NO -only-testing:SymphonyOSTests/<Suite> 2>&1 | grep -E "error:|✔|✘|passed|failed|BUILD" | tail -40`. Swift Testing (`import Testing`, `@Test`, `#expect`, `@testable import Symphony`). The Mac destination must still build.
- **Simulators (this Mac froze on 2026-11-15 with eight booted).** At most TWO simulators booted on the whole machine, counting every session: run `xcrun simctl list devices booted` before booting one; if two are up, reuse one or wait. Only ONE `xcodebuild` at a time. Phone-sized work uses the iPhone 17 simulator `29378388-0323-4E79-AD34-D46BA52A3461`; the Duo's outside screen uses "iPhone Duo" `B88F7BDF-8739-4F90-BE7E-B8DFDEB789AD` (`--display=1`). `-WalkSafe L,R` with `-WalkSize` gives the pinned window side insets (`466x678` with `0,84` is the outside screen; Task 2A adds it). The Duo's inside screen and the narrow phone are the window pins on the iPhone 17 simulator (`-WalkSize WxH` for the walk, Task 1; `-TodaySize WxH` and `-HalfOpen laptop|book` for the pages): 484x669 (half the inside screen, the shape Scott held), 669x951, 951x669, 375x667 (narrow). Never create, erase or reset a simulator. Shut down any simulator you booted when your task ends.
- **Shots.** Never during a test run. Originals go to `.superpowers/sdd/2026-11-15-hand-walk-fix/shots/task-<N>/` (git-ignored, survives a restart); never open an original with Read (Read shrinks an image file in place on this Mac): `cp` it into `…/shots/task-<N>/look/` and open the copy. A shot of the sign-in screen means the launch arguments did not arrive (zsh does not split an unquoted variable). List every shot in your report with one line on what you saw.
- **Light households only.** A full household, and any mixed or unknown edition, sees no change. The must-not-change files of the everyday-screens plan (its Global Constraints, "Light households only") still must show no diff: `git diff a86f6bce..HEAD -- <those files>` is empty. If a task seems to need one changed, stop and report NEEDS_CONTEXT.
- Anti-goals, in the spec's words: "It feels like filling out a form." / "Symphony supplies ideas the person didn't ask for." / "Nagging: streaks, guilt counts, red "overdue", confetti." Counts on this plan's screens say how many goals stand somewhere, never how many are undone or late. No glass, no blur, no pale mist, no old-style buttons; flags never float or overlap.
- **Every write** still goes through `WalkWriter` / `PlanWriter` / `DailyWriter` and the sync queue, on the signed-in person's own rows. This plan adds no new kind of write.
- **Strings.** Every word is a `WalkCopy` or `DailyCopy` member; tests name the member, never copy its text, except the tests in this plan that pin new wording. Curly quotes and apostrophes. SF Symbols only, no emoji.
- **Look.** The six bundled faces (`CrimsonPro-Regular`, `DMSans-Regular / Medium / SemiBold`). Colours are `WalkPalette` and `DailyPalette`. The light and the Next button are the only glowing gold controls; the typing field's Add (F22) is gold with no glow.
- **Hand-planted, not ruled.** Every post, cloth and pill keeps a small fixed variation seeded by its identity through `WalkFooting.hand(_:_:)`, the same on every launch; `.level` footing gives the ruled numbers below exactly. The hand never breaks a layout guarantee (Task 5's invariants hold for both footings).
- **Touch and VoiceOver.** Every control is at least 44 x 44 real points to the touch (`WalkStage.touch` stage points, Task 2A; a flag on the standing post keeps its own frame). Everything a gesture does, VoiceOver can do by a button or a custom action.
- **Platforms.** Files in `R/Walk/Core`, `R/Walk/Data`, `R/Daily/Core`, `R/Daily/Data` import only Foundation, CoreGraphics and SwiftData and compile for the Mac. Every view file is wrapped in `#if os(iOS) … #endif`.
- **The stage (added 2026-11-15, owner's comment 10).** The board is 390 x 844 and its midline is x 195 on every window. A wider window gives it wings (`WalkStage.wing`) and a bleed. No view clips at 390 and nothing paints the ground colour beside the board. Only what "On a wider window" (in "The board as numbers") names may read the wing. On a 390 x 844 window every number in this plan is exact, and each task's tests pin it.
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

Added 2026-11-15 for the owner's comment 10 ("why do you have the content inside of a blue colored area instead of filling the whole screen?"); nothing here is on the approved board:

- **F13** Extra width is used three ways only: side posts stand up to 1.5 times as far apart with longer names, the standing area's flags are up to 226 wide (150 on a phone), and Back and Leave for now go to the window's corners. The question, the light, the hint and Next stay in the middle at the board's sizes. Cost if wrong: on the inside screen the middle still reads as a phone's column, with painting around it instead of navy.
- **F14** A wider window shows the same stretch of mountain enlarged, never mirrored or faded, and never past 1.6 times its pixels. Cost if wrong: on the inside screen upright the painting is softer than on a phone. Re-cutting the picture at the master's full 2896 width would bring that to about 1.2, for about 50 MB more memory.
- **F15** On windows 669 or 678 high (the narrow phone, the Duo's outside screen, the half window, opened flat) the walk keeps the approved board at 79% size; controls take a touch 44 real points across. Cost if wrong: on three of the Duo's four shapes the walk's words are smaller than a phone's until a short board is drawn and approved.
- **F16** On short windows the Month, Season and Year pages draw their mountain at full size, showing only the part of the board between the heading and the hint. Cost if wrong: a page frames the painting differently from the walk on the same window (more land, less sky).
- **F17** Opened flat, the walk and the pages stay one column centred on the fold, with the painting across both pages. Cost if wrong: the worded post, the light and Next sit on the crease, and over half the screen is painting with nothing on it.
- **F18** On the outside screen the walk is centred between the left edge and the system's column, as the pages are, and the painting runs under the column. Cost if wrong: the walk sits 42 points left of the glass's centre.
- **F19** Cloths on one post are their own touch shapes: Task 5's invariant (g) does not hold them 44 apart (one-line flags are 36 high and 4 apart). Cost if wrong: on a crowded post a tap can land on the neighbouring flag.

- **F20** (S18, S21, S14) Where the board's cloth numbers cut the person's own words at ordinary lengths, the words win:
  - the parent flag takes up to 3 lines (board: 2);
  - the standing pill takes up to 2 lines for a long area name (board: 1), and so does that name's chip on the ground;
  - a Look back up cloth takes up to 3 lines, with "+n more" on a line of its own (board: 2, sharing the last line).

  Cost if wrong: taller stacks, so sometimes one flag fewer is shown in full.
- **F21** (S14) A Look back up cloth takes a tap and opens the paper for that cloth's level, in the walk and behind Today's and Week's lowered sheet (the plan said `.compact` never takes a tap). Cost if wrong: one more tappable thing on the last screen.
- **F22** (S31, S32) Typing gets its own way out and in: an X in the field closes it and plants nothing; a gold Add at the field's right plants; the mountain's words are veiled while typing. F10 stands (no top row while typing). Cost if wrong: two small controls in the field.
- **F23** (S17) Undo (the pill and the light's point) is offered only for what was done on the step in view. It does not follow to the next step, and VoiceOver names what it undoes. Cost if wrong: a slip noticed after Next needs Back and Remove.
- **F24** (S13) Move to offers only the areas the person kept (never the flag's own); Remove is always in sight without scrolling. Cost if wrong: none known.
- **F25** (S40) Short windows (narrow phone, Duo outside, the 484 x 669 half window) get "See my whole plan" as a one-line handle instead of a grabber that does nothing. Cost if wrong: about 20 points of Today's and Week's sheet on short screens.
- **F26** (S29, S52) A light household's phone-sized screens stay upright: the walk and the pages do not turn on a phone or on the Duo's outside screen; the Duo's inside screen turns as now. Cost if wrong: no sideways use on a phone, which was never designed.
- **F27** (S34) Examples answer the question asked: only examples for the standing area and the step's level; a used example comes down; an example is never planted under another area's goal. Cost if wrong: fewer examples where a list is short (none for an area the person named).
- **F28** (S47, S48, S49, S59) On Today and Week a task's words take up to two lines instead of being cut at one: rows, the sign's task line, the "for …" line, the Week band's flags. Cost if wrong: about one row fewer visible on a long day.
- **F29** (S38) The word "piece" goes from the sign. The sign names the first year goal with nothing under it on this season (`WalkEnding.nextToWalk`, read in `Signpost.facts`), so its eyebrow becomes "No winter goal under this yet" (`DailyCopy.noPiece`, the season's word in it). Cost if wrong: none known.

## Review Focus

1. **Eight areas and a loose pile.** Someone keeps all eight areas and has flags with no area. Expected: seven side posts and the nameless one lay out, nothing overlaps, nothing rises into the question or sits under the hint. Pinned in Task 5 (`eightAreasAndALoosePileStillLayOut`).
2. **A 200-character title, or one 60-letter word.** Expected: its flag is cut at three lines and never spills past its cloth or the screen; the paper wraps it whole. Pinned in Task 5 (`aVeryLongTitleIsCutNotSpilled`) and Task 7 (`thePaperShowsEveryTitleWhole`).
3. **A walk saved by yesterday's build is picked back up** (no standing area saved on a lower step, a tour half done). Expected: it opens standing where its focused goal is, nothing is lost, nothing traps. Pinned in Task 2 (`anOlderSavedWalkFindsItsFooting`).
4. **The standing area empties** (its last goal is removed or moved, or the area is let go on the ground). Expected: never a centre post with no way on: the walk stands in the next area that has something, or on a bare post under the question. Pinned in Task 2 (`whenTheStandingAreaEmptiesTheWalkStillStandsSomewhere`).
5. **Back or Leave for now tapped in the second after a spoken flag is let go.** Expected: the flag is planted first, then the walk moves. Pinned in Task 3 (`backPlantsAWaitingFlagFirst`, `leavingPlantsAWaitingFlagFirst`).
6. **A window wider than a phone.** 484x669, 669x951, 951x669, 375x667, and 466x678 with the system's column. Expected: painting to every edge, no navy; nothing readable under the column; side posts and wider flags as "On a wider window" gives; Back and Leave for now take a tap in the corners. Pinned in Task 2A (`thePictureCoversEveryWindow`, `theOutsideScreenStandsClearOfTheColumn`), Task 4 (`testTheTopRowWorksInTheWings`) and Task 5 (`aWiderWindowSpreadsTheSidePosts`).
7. **A phone is unchanged.** Pinned in Task 2A (`aPhoneHasNoWings`, `onThePhoneThePictureIsUnchanged`) and Task 5 (`underLevelFootingTheNumbersAreTheBoards`).

## The board as numbers

All in stage points (390 x 844). x is measured from the board's left edge on every window, so on a wider one the stage runs from `−wing` to `390 + wing`. "Hand" means the value under `.level` footing; `.natural` varies it slightly.

**Top row** (steps 1 to 5, hidden while typing). Row at y 44, height 44. Back: x 8, width 76: SF Symbol `chevron.left` 14 semibold + "Back". More: centred, width 84: `ellipsis.circle` 15 + "More". Leave for now: right edge at 382, width 124. DM Sans SemiBold 14, white, `walkGlow()`; More is `WalkPalette.gold` while the choices are open.

**The words.** The question block's top padding is 96 (was 64). Flags and pills never rise above `WalkLayout.question` = 282 (was 250). The eyebrow's count, when there is one, follows the eyebrow as " · 1 OF 3" in gold.

**The light.** Unchanged: centre (195, 678), radius 48, ring 66. Points: Type it at `.w`, Show examples (or the calendar offer on Today) at `.e`, Undo at `.n` with its word under its disc (between the disc and the ring).

**At rest, above the light.** The hint: one line, top 572, DM Sans SemiBold 15. The Undo pill while it shows: 86 x 36 centred at x 195, top 564 (the hint is not drawn then; a note is drawn instead of the pill). The Move to row while a flag is chosen: x 10, y 558, 370 x 38 (neither hint nor pill then). Inside it (F24) "Move to" and the kept areas' chips take x 10…282, scrolling sideways with a 24-point fade at their right edge only while they overflow. Remove stands alone at x 290, 90 x 38, never scrolled; on Today (no areas to move to) Remove stands alone at x 150.

**The foot.** Next: a button 50 high, top 750, centred, width its words plus 56 (at least 160, at most 280), corner radius 25; fill top to bottom `#FFF7E0`, `#F8E2AD` at 46%, `#EBBF72`; glow `rgba(255,214,140)` 0.8 radius 16 and 0.45 radius 42; words DM Sans SemiBold 17 in `WalkPalette.ink`, then `arrow.down` 17 semibold. When it skips: no fill, a 1.5 pt white 0.7 outline, words white 0.9 at 16, no arrow, no glow. While the light is open, held, speaking or finishing, Next is not drawn and the hint stands at the foot instead: one line, top 766.

**The typing field** (F22; frames with the keyboard down, all rising by the keyboard's lift as today):
- The field is at x 10, y 750, 370 x 44, a navy 0.72 pill with a white 0.55 outline. Next is not drawn while typing.
- The X sits at x 10, 44 x 44: `xmark.circle.fill` 18, white 0.8.
- Add sits at x 316, 64 x 44: a capsule 32 high, `WalkPalette.gold` fill, "Add" in DM Sans SemiBold 15 in `WalkPalette.ink`, no glow; at 0.45 while the field holds no words.
- The words stand between x 58 and 312, DM Sans 16.
- A note while typing is one line at top 724.
- While typing, every word on the mountain is veiled (cloths, poles and pills stay under the veil; their words are not drawn).

**The spoken flag** (while the light is speaking or finishing, steps 1 to 5): one cloth at x 120, y 560, 150 x 36, in the step's level's colour. It holds one line of DM Sans SemiBold 13, the newest words, cut at the head with an ellipsis. It meets no side post's pill, pole or pennants, no label and no cloth: the low side pills end at 545, the standing post's foot is 556 and the ring's top is 612.

**The foot's shade.** From y 560 to the foot: `rgba(0,14,70)` at 0, 0.55 at 45%, 0.86 at the bottom (replaces the 120-point scrim).

**The standing post** (steps 1 to 5 off the ground; the pages). Pole at x 195, foot at y 556, bare pole 24 under the lowest cloth. From the top down: a caret (10 x 7, gold) 2 above the area's pill; the pill (height 23 for one line, 37 for two (F20): a name whose one line by estimate (8.4 points a capital) is wider than 126 wraps at a space to a second line at the same size, never scaled down, and is cut with an ellipsis only past two lines; the pill's height counts in the stack between y 282 and 532; its words plus 24 wide, at least 58, at most 150; gold 1.5 pt outline, `WalkPalette.navy` 0.9 fill, DM Sans SemiBold 11 capitals, tracking 1.1, gold words); on steps 2 to 5 the parent flag (width 126, DM Sans SemiBold 11, 14 line height, up to 3 lines (F20), height 12 + 14 x lines, in its own level's colour); the step's flags, oldest highest, newest lowest (width 150, DM Sans SemiBold 13, 17 line height, up to 3 lines, height 19 + 17 x lines, plus 14 with a tag line (a Week day, FIRST THING, or an example's TAP TO USE), the tag in DM Sans SemiBold 11, tracking 0.6); then "+n more" (78 x 22, `#25563F`-style: the level's colour at 0.8 brightness, DM Sans SemiBold 11). 4 between cloths, 6 under the pill. Lines by estimate: `floor((width - 16) / 7.0)` characters a line.

**How many flags.** The newest n, n the largest of 4, 3, 2, 1 for which every shown title stands in full (up to three lines) and the whole stack, with "+k more" when k > 0, fits between y 282 and the lowest cloth's place (532). If not even one fits in full, one is shown cut to the lines that fit. A chosen flag is always among those shown (it takes the oldest shown one's place). Examples, while on: the person's newest `4 - e` flags, then `e` examples, `e = min(examples, max(2, 4 - flags))`, fewer if they do not fit.

**Side posts.** Left: inner pole x 90, outer pole x 33. Right: inner x 300, outer x 357. Low row pill tops: inner 524, outer 506; high row 84 above each. Fill order on a side: inner low, outer low, inner high, outer high. Areas before the standing one in ridge order go left, nearest first; those after go right; a side that is full spills to the other. Pill: height 21, at most 58 wide, centred on its pole and slid inside x 4…386; white 0.7 outline 1 pt, navy 0.86 fill, DM Sans SemiBold 9.5 capitals, tracking 1, white; a longer name shrinks to 0.8 then is cut with an ellipsis. Pole: 2.5 wide, from 4 above the pill up 60. Pennants: 20 x 13 triangles pointing right, their left edge 3 right of the pole, 14 apart from the pole's top down, in the colour of the level each stands for; at most 4; with more than 4 goals, 3 pennants and "+n" (9.5 SemiBold, white, glow) in the fourth place.

**Look back up** (step 6, and the plan behind Today's lowered sheet). Same pole and side slots. The pill's top is at y 110. Under it one cloth per level that has a flag in the standing area, year first: width 150, DM Sans SemiBold 12, up to 3 lines of the newest flag's words (F20), height 23 + 13 x (lines - 1), plus 14 for a line of its own carrying "+n more" when the level holds more. A tap on a cloth opens the paper for that level (F21). Nothing below y 700 (the ending sheet peeks at 716).

**The paper.** A sheet in `DailyPalette.paper`, top corners 22, shadow 0 -6 22 navy 0.35. Raised: its top is 72 under the row of words on a page (y 116 on the phone board), and y 116 in the walk. A grabber 40 x 5 at 9 from the top, then "Show the mountain" (DM Sans 12.5, muted), the whole first 44 points one button. Heading at 24 from the left, 52 from the sheet's top: Crimson Pro 30; the count right-aligned on its baseline, DM Sans 13 muted. Sections 12 apart from y 100: a heading row (DM Sans SemiBold 11, tracking 1.3, capitals, `DailyPalette.rust`; the section's count at its right in muted; a 1 pt line under it) then one row a title, DM Sans 16, line height 27, wrapping, each row at least 44 high to the touch. It scrolls.

**The pages' paper foot** (Month, Season, Year). A paper foot 188 high at the bottom of the window holding the strip (the first 78 points: grabber, "Read the whole year" in Crimson Pro 21, then "17 goals, as a plain list by area" in DM Sans 12.5 muted; one button) and under it the add bar in its paper look, More and Inbox either side as on Today. The page's hint ("Tap a post to walk to that area", DM Sans 12.5, white, glow) stands 38 above the foot. On a window shorter than 700 points the strip is one line, 44 high: "Read the whole year · 17 goals". With no goals on the page there is no strip.

**On a wider window** (Task 2A's `WalkStage.wing`; F13 to F18).
- `m = min((390 + 2·wing) / 390, 1.5)`.
- Side poles: inner `195 ∓ 105m`, outer `195 ∓ 162m` (90 / 300 and 33 / 357 at m = 1).
- Side pill: at most `58 + 57(m − 1)` wide, slid inside `(4 − wing)…(386 + wing)`.
- Standing cloth `150 + 153(m − 1)` wide, parent flag 24 less, standing pill at most the cloth's width; "+n more" stays 78.
- Ground columns `195 ± 145m`.
- Back at x `8 − wing`; Leave for now ends at `382 + wing`.
- Question block `334 + min(2·wing, 166)` wide; reading column for the paper and the ending sheet `390 + min(2·wing, 170)` wide; both centred on x 195.
- Everything else is where the phone has it.
- The picture: the step's stop enlarged about (195, 556) by `(390 + 2·max(bleed.left, bleed.right)) / 390` ((195, 328) on Welcome, (195, 321) on Look back up); k at most `0.840 / scale` unless the window needs more to be covered; then slid the least that keeps the window on the painting.
- Shades, veil and paper sheets cover the board plus its bleed.

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

### Task 2A: The stage takes the window's width

Added 2026-11-15 for the owner's comment 10. The painting covers every window and the stage knows its wings; the old layout still stands in the middle. This is the picture the owner is shown before anything is built on it.

**Files:**
- Modify: `R/Walk/Core/WalkStage.swift`, `WalkBackdrop.swift`, `WalkLayout.swift` (`make` gains `wing:`, nothing else), `R/Walk/WalkModel.swift`, `R/Walk/Views/WalkView.swift`, `WalkSceneView.swift`, `WalkHintRow.swift` (`WalkUnderlay`), `WalkEndingSheet.swift`, `R/Daily/Views/MountainPageView.swift` (`MountainStage`), `R/Daily/Core/DailyHandover.swift`
- Test: `T/WalkStageTests.swift`, `WalkBackdropTests.swift`, `DailyHandoverTests.swift`

**Interfaces:**
- `WalkStage`:
  - `init(device: CGSize, stage: CGSize = WalkArt.stageSize, left: CGFloat = 0, right: CGFloat = 0)`
  - `scale = min((device.width − left − right) / 390, device.height / 844)`
  - `origin.x = left + (device.width − left − right − 390·scale) / 2`
  - `let wing: CGFloat` (`((device.width − left − right) / scale − 390) / 2`)
  - `struct Bleed: Equatable { left, right, top, bottom }` and `let bleed: Bleed` (left is `wing + left / scale`, right is `wing + right / scale`; top and bottom are `origin.y / scale`)
  - `var stretch: CGFloat { (390 + 2·wing) / 390 }`
  - `var touch: CGFloat { 44 / min(1, scale) }`
- `WalkArt.backdropCamera(step:layout:stage:)`: today's camera before it is held, then the three rules of "On a wider window" (the picture). `WalkBackdrop.sharpest = 1.6`, `pixelsAcross = 2048`.
- `WalkLayout.make(_:today:art:footing:wing:)`, `wing` defaulting to 0 and unused until Task 5.
- `WalkModel.layout` becomes `func layout(wing: CGFloat) -> WalkLayout`; views read `\.walkStage`.
- `DailyHandover.start(page:left:right:)` builds `WalkStage(device: window, left: left, right: right)`.
- Launch argument `-WalkSafe L,R` (DEBUG only): with `-WalkSize`, the pinned window's side insets (0,0 without it).

- [ ] **Step 1: Write the failing tests.**
  - `WalkStageTests`:
    - `aPhoneHasNoWings`: 390x844 gives scale 1, origin zero, wing 0, bleed all 0, touch 44. 402x874 gives wing 0 and bleed top and bottom 1.95.
    - `aWiderWindowHasWings`: 484x669 gives scale 0.7927, wing 110.3, origin.x 87.4. 669x951 gives wing 101.9. 951x669 gives 404.9. 375x667 gives 42.3 and touch 55.7.
    - `theOutsideScreenStandsClearOfTheColumn`: 466x678 with right 84 gives scale 0.8033, origin.x 34.35, wing 42.8, bleed.right 147.3, and the light at device x 191. With left 84 the light is at 275.
    - `pointsRoundTrip` over all six shapes.
    - Replace `theDuoOutsideScreenLetterboxes`.
  - `WalkBackdropTests`:
    - `onThePhoneThePictureIsUnchanged`: on a 390x844 stage every step and every generated state gives exactly `backdropCamera(step:layout:)`'s camera at HEAD.
    - `thePictureCoversEveryWindow`: on the six shapes (466x678 with right 84), every step, the board plus its bleed lies on the painting.
    - `thePictureIsNeverEnlargedPastItsPixels`: `3 × scale × k × 1300 / 2048 <= 1.6` on all six.
    - `aWiderWindowKeepsTheGroundUnderTheStandingFoot`: on 375x667, 466x678, 484x669 and 669x951 the painting point under (195, 556) on steps 1 to 5 is the phone's. On 951x669 it has moved at most 113 stage points and lies in `open[level]`.
    - `theWordsReadOnThePaintingAtEveryStep` runs at all six shapes.
  - `DailyHandoverTests`: `theStartComesFromThePageAndItsSideInsets` and `onTheOutsideScreenItTravelsFromTheWalksLightToTheShortBar` expect the light at the page's own middle (x 191 of 382), not the window's.
- [ ] **Step 2: Run them, expect FAIL.**
- [ ] **Step 3: Implement.**
  - `WalkView` reads the window's physical side insets (as `WindowInsetsReader` does) and clips at the window, not the board.
  - `WalkWorldView` takes the stage and draws its sky, picture and top shade over the board plus its bleed.
  - The veil and `WalkUnderlay`'s scrim and bands do the same; `WalkEndingView` takes its bleed from the stage.
  - `MountainStage` makes its layout inside the reader with the stage's wing.
  - No `.clipped()` remains at 390, and nothing paints the ground colour beside the board.
  - If the words fail 4.5:1 on a shape, raise that step's held shade for stretched stages; never move the picture. List every value changed.
- [ ] **Step 4: Run** `WalkStageTests`, `WalkBackdropTests`, `WalkArtCutTests`, `WalkLayoutTests`, `DailyHandoverTests`, `DailySpreadTests`, `WalkUITests`, `LightDailyUITests`: PASS (the three old-layout failures in `WalkLayoutTests` that Task 2 left stay until Task 5; no new one).
- [ ] **Step 5: Shots.**
  - iPhone 17, no pin: Welcome, Year, Month, Today, Look back up. They match Task 1's except the slivers at top and foot.
  - `-WalkSize 484x669`, `669x951`, `951x669`, `375x667`: the same five.
  - `-WalkSize 466x678 -WalkSafe 0,84`: Year and Today.
  - The Year page with `-TodaySize 484x669`.
  - Look for navy at any edge, a soft painting, snow or meadow behind the words, and sky or water at (195, 556).
  - The controller shows the owner 484x669 Month and 951x669 Year from these.
- [ ] **Step 6: Commit** `Walk: the painting fills the window, and the stage knows its wings`.

### Task 3: The controls, as rules and frames

**Files:**
- Create: `R/Walk/Core/WalkLayout+Controls.swift` (move "The controls under the light" out of `WalkLayout.swift` unchanged first, then edit)
- Modify: `R/Walk/Core/WalkState.swift`, `WalkState+Orb.swift`, `WalkCopy.swift`, `WalkOrb.swift`, `WalkLayout.swift`
- Test: `T/WalkOrbTests.swift`, `WalkCopyTests.swift`, `WalkLayoutTests.swift` (the controls' tests only), `WalkFlowTests.swift`

**Interfaces:**
- `WalkEvent` gains `.backTapped`, `.leaveTapped`. Neither `leavesAWaitingFlag`. `.backTapped` does what `act(.back)` does; `.leaveTapped` what `act(.leave)` does. `.moreTapped` opens the choices when closed and closes them when open.
- `WalkState`: `var showsTopRow: Bool { (1...5).contains(step) && typing == nil }`; `showsMore == showsTopRow`; `var choicesOpen: Bool { orb == .open }`.
- `WalkCopy.points(_:_:)` on steps 1 to 5 returns at most three, in this order of places: `.w` Type it ("Type your own" on the ground), `.e` Show/Hide examples (steps 1 to 4 off the ground) or "Show my calendar on Today" (Today, while offered), `.n` Undo (when `!s.undo.isEmpty`). Back, Next, Leave for now and the switch are never points. Welcome's two points are unchanged.
- `WalkCopy.back(_:_:)` becomes internal (the top row's VoiceOver label). New: `static let backWord = "Back"`. `hintAnother = "Hold the light to add another."`. `replayFooter` ends "To stop part-way, tap Leave for now at the top." `WalkCopy.hint` is unchanged in what it says, except where "Added from the cold read" below changes it (S35, S36).
- `WalkOrb.wordsAbove(_:)`: `.n` is no longer above (its word sits under its disc) on steps 1 to 5; Welcome's `.nw`/`.ne` unchanged.
- `WalkLayout` (all `static func … (_ s: WalkState) -> CGRect?`, nil when not shown, numbers from "The board as numbers"): `backFrame`, `moreFrame`, `leaveFrame` (when `showsTopRow`); `backFrame` and `leaveFrame` also take `wing: CGFloat = 0` (Back's x is `8 − wing`, Leave for now ends at `382 + wing`; every other frame is centred and takes no wing); `nextFrame` (steps 1 to 5: x 55, y 750, 280 x 50; Welcome unchanged); `hintFrame` (at rest: top 572; light open, held, speaking or finishing: top 766; Welcome unchanged; nil while the Undo pill or the Move row shows); `undoFrame` (x 152, y 564, 86 x 36, when `showsUndoPill && orb == .idle && note == nil && selected == nil`); `moveRowFrame` (x 10, y 558, 370 x 38, when `selected != nil && orb == .idle && typing == nil`); `teachFrame` unchanged. `static let question: CGFloat = 282`. `WalkLayout` stored properties gain `back`, `leave`, `moveRow` beside `more`.

- [ ] **Step 1: Write the failing tests:**
  - `theLightOffersAtMostThree`: for every state in `Generated.states()` on steps 1 to 5, `WalkCopy.points` has at most 3 entries and every action is one of `.type, .examples, .calendar, .undo`.
  - `undoWaitsInTheChoicesOnceThereIsSomethingToUndo`: no `.n` point before planting; one after.
  - `theTopRowIsThereOnEveryStepAfterWelcome`: frames non-nil on steps 1 to 5 and on the ground, nil on 0 and 6 and while typing; each at least 44 x 44; none meets another; all inside y 44…88. At wing 0 Back is (8, 44, 76, 44) and Leave for now ends at x 382; at wing 110.3 Back starts at −102.3 and Leave for now ends at 492.3; More's frame is the same at both.
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
**Added from the cold read (S13, S15, S17, S19, S31, S32, S33, S35, S36):**

**Interfaces:**
- **Move to (F24, S13).**
  - `WalkState.moveTargets` becomes `keptAreas.filter { $0.id != item.areaId }` (still `[]` on Today). `moveSelected(to:)` takes only those. Its "an area not kept is kept" path is then never taken; leave it and the undo entry's `keptAdded` as they are.
  - New `WalkLayout.moveChipsFrame(_ s:) -> CGRect?` = (10, 558, 272, 38) and `removeFrame(_ s:) -> CGRect?` = (290, 558, 90, 38), both non-nil exactly when `moveRowFrame` is. On Today `moveChipsFrame` is nil and `removeFrame` is (150, 558, 90, 38).
  - New `WalkCopy.moveLabel(_ title: String, to area: String) -> String` ("Move “Run a 5K” to Work") and `WalkCopy.removeLabel(_ title: String) -> String` ("Remove “Run a 5K”"), with titles through `short`.
- **Holding (S15).** `showsPoints` for `.holding` is true only when the press began with the points open (`orbWasOpen`) or the finger has slid out of the light (`pressWentOut`). A plain hold on its way to speaking shows no points. Welcome is unchanged.
- **Undo (F23, S17).**
  - `settle()` also empties `undo` and `pulledChildren`, and so does leaving the ground (`walkOn` from `step == 1, ground`), which also sets `undoShowing = false`.
  - A whole-year tour moving on to the next area on Year keeps them (same step).
  - The doc comment on `undoLast` ("whatever step it was taken on") is rewritten.
  - New `WalkCopy.undoLabel(_ s: WalkState) -> String?`, nil with nothing to undo, says what the newest `WalkUndoEntry` undoes:
    - `.plant`: "Undo adding “Run a 5K”"
    - `.keep`: "Undo keeping Health"
    - `.unkeep`: "Undo letting go of Health"
    - `.nameArea`: "Undo adding Side projects and making"
    - `.move`: "Undo moving “Run a 5K”"
    - `.pullUp`: "Undo removing “Run a 5K”"
    - `.firstThing`: "Undo the first thing"

    It is the VoiceOver label of the pill and of the `.n` point.
- **The lesson (S19).** `showsNextLine` no longer waits for `teaching`: Next, or the outlined Skip, stands at the foot while the lesson shows (`teachFrame` (10, 500, 370, 104) ends at 604, clear of Next at 750). In `orbUp` a short press that began during the lesson (`wasTeaching`) puts the lesson away and opens the points (`orb = .open`, not `.idle`).
- **Typing (F22, S31, S32).**
  - New `var veilsWords: Bool { (1...5).contains(step) && (orb == .open || teaching || typing != nil) }`. `showsVeil` is also true while `typing != nil` on steps 1 to 5.
  - New `var typedHasWords: Bool` (the field holds something not blank).
  - `.veilTapped` while typing closes an empty field (`typing = nil`) and does nothing when it holds words.
  - The field's X sends the existing `.typeDismissed` (plants nothing). Add sends `.typeSubmitted(text)` and is enabled only while `typedHasWords`. Return still plants.
  - New frames from "The board as numbers" ("The typing field"): `typeFieldFrame` (10, 750, 370, 44), `typeCloseFrame` (10, 750, 44, 44), `typeAddFrame` (316, 750, 64, 44); `hintFrame` while typing holds the note at top 724.
  - `WalkCopy.typePlaceholder = "Type it, then tap Add"`; new `typeAdd = "Add"`, `typeClose = "Close without adding"`.
- **The question's quote (S33).** `WalkCopy.shortLength` becomes 56. `short(_:)` keeps a title of up to 56 characters whole. A longer one is cut at the last space at or before the 55th character, trailing spaces trimmed, then "…"; a word of 56 letters or more with no space is cut at 55.
- **The Today step (S35).**
  - `WalkCopy.finish = "Finish the walk"`.
  - `hintFirstThing = "Tap “Finish the walk”, or hold to change it."` (44 characters, within `hintMaxLength`).
  - Today's question once the focused task is the first thing (`s.focus[.today] == s.firstThing`): `"You’ll start the day with “\(short(t.title))”."`.
  - `enter(_:)` no longer puts `WalkCopy.calendarLine` up as a note: the calendar is offered only by the `.e` point while `calendarOffer`. `calendarLine` is deleted.
- **Words after a skip (S36).**
  - Week's question with no goal above: `"What’s one thing for this week?"`.
  - `hint` gives `hintAnother` only when the standing post holds a flag on the step's level (`s.items(on: level).contains { s.column(of: $0) == s.standing }`), else `hintFirst`.
  - Week's why line: `"Say the day too, as in “on Friday”."`.

**Tests (show each failing first):**
- `WalkPlantTests`: `moveToOffersOnlyKeptAreas` (five areas, three kept, a Work flag chosen: the targets are the other two kept areas, in ridge order; on Today none).
- `WalkLayoutTests` (controls): `removeIsAlwaysInSight` (eight kept areas, a flag chosen: `removeFrame == (290, 558, 90, 38)`, inside `moveRowFrame`, meeting no other frame; on Today (150, 558, 90, 38)); `theFieldsControlsKeepClear` (the X, the words and Add meet nothing else; each is at least 44 x 44).
- `WalkOrbTests`: `aHoldShowsNoPointsUntilItSlidesOut` (from idle, `.orbDown`: `showsPoints == false`; `.orbMoved` out of the light: true; a press begun with the points open: true).
- `WalkFlowTests`:
  - `undoStaysOnItsStep`: plant on Year, Next: `undo.isEmpty`, no `.n` point, `WalkLayout.undoFrame == nil`; Back to Year: still none.
  - `leavingTheGroundTakesItsUndo`: keep two areas, Next: `undo.isEmpty && !undoShowing`.
  - `aTourKeepsUndoOnYear`: whole-year walk, plant in Health, Next to the next area: undo is still there.
  - `theLessonShowsTheWayOn`: first arrival on Year: `teaching`, `nextFrame != nil`, the line reads `skipStep`.
  - `aTapDuringTheLessonOpensTheChoices`.
  - `aVeilTapClosesAnEmptyField`, `aVeilTapKeepsTypedWords`.
  - `closingTheFieldPlantsNothing`: `.typeDismissed` with words gives no `.write`.
- `WalkCopyTests`:
  - `undoSaysWhatItUndoes`: one case per `WalkUndoEntry`.
  - `theQuestionQuotesAGoalWhole`: a 44-character parent is whole on Season, Month, Week and Today.
  - `aVeryLongGoalIsCutAtAWord`: at most 56 characters, ends "…", no space before it.
  - `todaySaysHowTheWalkEnds`: with a first thing, the next line is `finish`, the hint is `hintFirstThing`, and the question is the chosen form.
  - `noCalendarNoteOnToday`.
  - `wordsAfterASkipPointAtNothingMissing`: Week with no month goal gets the unfocused question; an area with nothing on this level gets `hintFirst`.
- Update the tests that pin the old behaviour:
  - `shortLength == 40` and the 39-character cut (`WalkCopyTests`, around lines 121–126 and 421);
  - the calendar note (`WalkFlowTests` around 598–651, `WalkStepsTests` around 522, the string lists in `WalkCopyTests` around 338 and 394);
  - any test that undoes across a step;
  - any test that expects `showsPoints` on a plain hold.

- [ ] **Step 5: Commit** `Walk: a top row, three choices on the light, Next at the foot (rules)`.

### Task 4: The controls, drawn

**Files:**
- Create: `R/Walk/Views/WalkTopRow.swift`
- Modify: `R/Walk/Views/WalkHintRow.swift` (`WalkUnderlay` too), `WalkOrbView.swift`, `WalkSceneView.swift`, `WalkView.swift`, `R/App/DemoMode.swift` (the `-SymphonyWalkOrb` words still drive the same states; add `back`), `U/WalkUITests.swift`

**Interfaces:**
- Consumes: Task 3's frames and events; Task 2's `WalkCopy.eyebrowCount`.
- Produces: accessibility identifiers `walk.back`, `walk.more`, `walk.leave`, `walk.next` (kept), `walk.undo`.

- [ ] **Step 1: Draw** from "The board as numbers": `WalkTopRow` (three plain buttons at Task 3's frames; Back's VoiceOver label is `WalkCopy.back(s, p)`, Leave's hint is `WalkCopy.leaveDetail` when `placeKept`, More's label `WalkCopy.moreLabel` with the value "open" / "closed"); the gold Next and its outlined skip in `WalkHintRow`; the hint, the Undo pill and the Move row at their new frames; the foot's shade; the question at top padding 96 with the eyebrow's count in gold; the light's ring with three points (the top one's word under its disc) and VoiceOver's custom actions reduced to those the points offer. Remove `moreButton` from the hint row. The top row asks for its frames with the stage's wing. Every hit shape this task draws is `stage.touch` high, not 44. The foot's shade runs over the board plus its bleed. The question block is `WalkLayout.wordsWidth(wing:)` wide (`334 + min(2·wing, 166)`), centred on x 195, and `theWordsReadOnThePaintingAtEveryStep` samples that width.
- [ ] **Step 2: UI tests** in `U/WalkUITests.swift` (launch with `launchDemo()` and the walk's arguments; no typing): `testTheTopRowIsOnEveryStep` (steps 1 to 5: `walk.back`, `walk.more`, `walk.leave` exist and are hittable; `walk.next` hittable and its frame's bottom is at least 34 points above the window's bottom); `testTheLightOffersThree` (tap `walk.more`: at most three point buttons, none labelled Back, Next or Leave for now); `testBackGoesBack` (step 3, tap `walk.back`, the eyebrow is the season's). Update the existing three tests to the new controls. `testTheTopRowWorksInTheWings`: with `-WalkSize 484x669`, step 3, `walk.back` and `walk.leave` are hittable and a tap on `walk.back` shows the season's eyebrow.
- [ ] **Step 3: Run** the unit suites of Task 3 and `WalkUITests`: PASS.
- [ ] **Step 4: Shots** (iPhone 17, then `-WalkSize 484x669`, `669x951`, `951x669` and `375x667`): Year at rest (nothing planted: Skip), Month just planted (Undo pill), Month at rest (gold Next, hint above the light), the choices open, a flag chosen (Move row), typing, speaking, the ground, Welcome. Look at each: the three top words do not collide on the narrow phone; Next is clear of the home indicator; nothing sits on the light's glow.
**Added from the cold read (S13, S15, S17, S19, S31, S32, S33, S35, S36):**

**Files (added):**
- `R/Walk/Views/WalkBannerViews.swift` (the veil on words);
- `R/App/DemoMode.swift`, which gains `-SymphonyWalkOrb draft:<words>`: the field open holding those words, not sent (`model.choose(.type)` then `.typeChanged(words)`).

**Draw:**
- **The Move row:**
  - The chips sit in `moveChipsFrame`, in a sideways scroll with a 24-point fade at the right edge only while they overflow; chip words never shrink.
  - Remove is its own chip at `removeFrame`, in `WalkPalette.pullUp`.
  - VoiceOver labels come from `WalkCopy.moveLabel` / `removeLabel`.
  - Identifiers: `walk.move.<area name lowercased>`, `walk.remove`.
- **Undo:** the Undo pill and the `.n` point read `WalkCopy.undoLabel(s) ?? WalkCopy.undo` to VoiceOver.
- **The typing row:**
  - The field, X and Add are at their frames; return still plants.
  - The X: identifier `walk.type.close`, label `WalkCopy.typeClose`.
  - Add: identifier `walk.type.add`, label `WalkCopy.typeAdd`, disabled and at 0.45 while `!typedHasWords`.
- **The veil on words:** while `veilsWords`, every banner's and label's words are drawn at opacity 0 and hidden from VoiceOver; their cloths, poles and pills stay under the veil. Task 6 makes `WalkSideView` do the same.

**UI tests** in `U/WalkUITests.swift` (no typing):
- `testTheFieldCloses` (`-SymphonyWalkOrb type`: tap `walk.type.close`; the field is gone and `walk.undo` does not exist);
- `testAddPlants` (`draft:Book the plumber` on Month: tap `walk.type.add`; the field is gone and `walk.undo` exists);
- `testRemoveIsInSight` (Month, `-SymphonyWalkSeed full`, `select`: `walk.remove` is hittable).

**Shots** (add to Step 4's list, on iPhone 17 and `-WalkSize 375x667`): typing with words (Add lit, flags veiled); the Move row with the full plan (Remove in sight); the lesson with Skip at the foot; Today after the first thing ("Finish the walk"); a Season question quoting a 44-character goal (`-SymphonyWalkSeed long`). On that last shot the why line must end above y 282 in stage points; if it does not, stop and report.

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
- `static func tapEvent(_ banner: Banner, on post: Post) -> WalkEvent?`: `.more` gives `.paperOpened` (Task 7 adds the case; until then return nil), `.ghost` `.exampleTapped`, `.full` and `.parent` `.bannerTapped`, `.compact` nil (Task 8 makes it `.lookBackPaper(banner.level)`, F21). New `static func tapEvent(_ side: Side) -> WalkEvent?`: `.areaTapped(area)` for a named post, `.paperOpened` (nil until Task 7) for the nameless one.
- `static let standingFoot: CGFloat = 556`, `lowestCloth: CGFloat = 532`. `static func stretch(wing:)`, `standingWidth(wing:)`, `parentWidth(wing:)`, `sidePoles(wing:)`, `sidePill(wing:)`, `edges(wing:)`, `column(wing:)`, as "On a wider window" gives them (150 and 126 at wing 0). The ground's columns are `195 ± 145 × stretch`. `static func lines(for text: String, width: CGFloat) -> Int` uses 7.0 points a character, at most 3.
- Which flags: Year: the standing area's year goals. Steps 2 to 4: the parent flag `item(focus[level])` (kind `.parent`), then the standing area's flags on the step's level (every parent's). Today: the parent is the focused week task; the one `.full` flag is the first thing, tagged. Which side posts: rule F4, in the places "The board as numbers" gives; each pennant stands for one flag on the step's level (on Year: year goals), newest first.
- The parent flag's role is Task 2's `.focusedOfSeveral` when `parentsHere().count > 1`, else `.focused`; a flag of the step's level keeps `.mine` / `.plain` and the Today roles. A chosen flag glows as today.
- `needleDown` as today.

- [ ] **Step 1: Write the failing tests** (replace `Generated.make` so it builds standing states: steps 1 to 6, 0 to 8 kept areas, with and without loose flags, 0 to 7 flags a post, titles of 8, 22, 44, 60 and 200 characters and one 60-letter word, a chosen flag, examples on, each standing area in turn; each state at wings 0, 42.3, 110.3 and 404.9; keep `Generated.ground()`):
  - `oneAreaShowsItsWords`: Month, full plan, standing in People: one post; its banners are one `.parent`, at most four `.full`, at most one `.more`; every `.full` banner's item is a People month goal.
  - `fewerFlagsRatherThanCutTitles`: Month with a parent and four two-line titles: three `.full` and `.more(1)`.
  - `atMostFourEachInFull`: over the generated states: `.full` count <= 4; unless only one is shown, every `.full` banner's `lines == min(3, WalkLayout.lines(for: text, width: standingWidth(wing:)))`; `.more(n)` exactly when flags are hidden, `n` = hidden.
  - `aVeryLongTitleIsCutNotSpilled` (Review Focus 2): a 200-character title and a 60-letter word each give a banner of 3 lines, width `standingWidth(wing:)`, inside `edges(wing:)` and y 282…532.
  - `theAreaNameSitsOnItsOwnPost`: the standing label's `midX` is within 4 of the post's `base.x`, and its `maxY` is at most 8 above the top banner's `minY` (or, with no banner, the pole's top).
  - `noLevelAboveTheParentIsDrawn`: on Month every banner's level is season or month; on Week, month or week.
  - `otherAreasAreSmallPostsWithACount`: full plan on Month standing in People: four sides (Health, Home left; Work, Money right, nearest first); each has `min(4, count)` pennants, or 3 and `extra == count - 3`; `label` as the Interfaces say.
  - `aQuickWalkShowsNoEmptyPostsLowerDown` (F4): quick walk on Month, three kept, one chain in Work: `sides.isEmpty`. On Year the same walk has two sides.
  - `eightAreasAndALoosePileStillLayOut` (Review Focus 1): 8 kept plus loose flags: 7 named sides and 1 nameless; `Invariants.check` is empty.
  - `aChosenFlagIsAlwaysShown`: seven month goals, choose the oldest: it is among the `.full` banners.
  - `examplesTakeTheRoomLeft`: 0, 1, 3 and 5 own flags with examples on: the counts the rule gives.
  - `theGroundShowsNamesOnly` (F5): on the ground `posts.isEmpty && sides.isEmpty`; every area has a label.
  - `nothingOverlaps(_ footing:)` for `.natural` and `.level` over `Generated.states()`, with `Invariants.check` rewritten to: (a) no two cloths' drawn boxes meet; (b) no side's pill, pole or pennants meet another side's, the standing post's cloths or its label; (c) nothing above y 282 on steps 1 to 5 (y 92 on step 6); (d) no cloth below 532 + 0.5, no pill below 556, on steps 1 to 5 (nothing below 700 on step 6); (e) everything inside `edges(wing:)`; (f) nothing within 86 of the light's centre on steps 1 to 5; (g) every tappable thing is at least 44 points apart from the next one's centre, or its hit shape (the frame grown to 44) does not meet another's frame. (g) is checked with touch 44 at wing 0 and 55.7 at the other wings; cloths on one post are exempt from it (F19).
  - `theSameStateGivesTheSameLayout`; `underLevelFootingTheNumbersAreTheBoards` (pole x 195, foot 556, lowest cloth 532, side poles 90 / 33 / 300 / 357). At wing 110.3: side poles 37.5 / −48 / 352.5 / 438, standing cloth 226.5, parent 202.5, side pill at most 86.5.
  - `aWiderWindowSpreadsTheSidePosts`: at wing 42.3 the poles are 67.2 / −2.1 / 322.8 / 392.1; at 404.9 they are those of 110.3.
  - `aWiderWindowShowsMoreOfALongPlan`: the long plan's Month, four goals: every `.full` banner has fewer or equal lines at wing 110.3 than at 0, and at least as many are shown.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `WalkLayout+Standing.swift` (steps 1 to 5 here; step 6 arrives in Task 8 and may return the standing label and sides only until then) and move the ground's labels to `WalkLayout+Ground.swift`. Delete the old stacking. If the hand ever breaks an invariant in the sweep, narrow that hand's range rather than adding a damping loop, and say so in the report.
- [ ] **Step 4: Run** `WalkLayoutTests`, `WalkFootingTests`: PASS. The app will not draw sides yet (Task 6); it must still build and the walk must still open.
**Added from the cold read (S18, S20, S21, S25, S26):**

**Interfaces:**
- **The parent flag (F20, S18):** up to 3 lines at width 126 (see "The board as numbers"); `lines(for:width:)` keeps its cap of 3.
- **Long area names (F20, S21):**
  - `WalkLayout.Label` gains `var lines: Int = 1`.
  - New `static func pillLines(for name: String, width: CGFloat) -> [String]`: the name in capitals, wrapped at spaces by the estimate of 8.4 points a character, at most 2 lines, the second cut with "…" past that.
  - The standing label takes two lines (height 37) when its one line is wider than 126, and its height counts in the stack between y 282 and 532.
  - On the ground, a chip whose one line is wider than its slot takes two lines at the same size (`lines = 2`, frame 44 high instead of 30) and is never scaled below the others.
- **Long words (S20):**
  - New `static func drawnTitle(_ text: String, width: CGFloat) -> String`: inside any word longer than `floor((width - 16) / 7.0)` characters, a soft hyphen (U+00AD) after every that-many-minus-one characters.
  - `Banner.text` carries the drawn form; the banner's VoiceOver `label` keeps the title as written. `lines(for:width:)` counts the drawn form.
- **The spoken flag (S25):** a new stored `spokenFlag: CGRect?` = (120, 560, 150, 36) while the light is speaking or finishing on steps 1 to 5, else nil. `Invariants.check` gains (h): it meets no side's pill, pole or pennants, no label and no cloth.
- **Tags (S26):** a tag line adds 14, in DM Sans SemiBold 11 (see "The board as numbers"). `exampleTag(forWidth:)` is estimated at 7.2 points a character plus 16: the long tag where it fits, else `exampleTagShort`.

**Tests** in `T/WalkLayoutTests.swift` (failing first):
- `aParentOfFortyFourLettersStandsWhole` (Month, the long plan: the `.parent` banner's lines equal `min(3, lines(for: title, width: 126))`, which is 3 for its 44 characters, inside x 4…386 and y 282…532);
- `aLongAreaNameWrapsOnItsPost` (standing in "Side projects and making": the standing label's `lines == 2`, its name is whole, the pill is at most 150 wide, `maxY` is at most 8 above the top banner, nothing is above 282);
- `aLongAreaNameWrapsOnTheGround` (the ground with that name: its label has `lines == 2`, frame height 44, and meets no other label);
- `aLongWordIsHyphenatedWhereItBreaks` (a 60-letter word: the drawn text contains U+00AD and `lines == 3`);
- `theSpokenFlagKeepsClear` (invariant (h) over the generated states with the light speaking);
- `tagsHaveTheirOwnLine` (a Week flag with a day: height 19 + 17 × lines + 14).

Update `underLevelFootingTheNumbersAreTheBoards` for the changed numbers.

- [ ] **Step 5: Commit** `Walk: words for the area you stand in, small posts for the rest (layout)`.

### Task 6: The standing layout, drawn

**Files:**
- Create: `R/Walk/Views/WalkSideView.swift`
- Modify: `R/Walk/Views/WalkSceneView.swift` (`WalkWorldView`), `WalkBannerViews.swift` (`WalkBannerView`, `WalkLabelView`), `R/Daily/Views/MountainPageView.swift` (`MountainStage` passes the new callback through), `R/Walk/Core/WalkArt+Tall.swift` (only the per-step picture stops, if needed), `U/WalkUITests.swift`

**Interfaces:**
- `WalkWorldView` gains `onSide: (WalkLayout.Side) -> Void`. Every caller passes one (the walk sends `WalkLayout.tapEvent(side)`).
- Accessibility identifiers: `walk.side.<area name lowercased>`, `walk.standing` (the standing label).

- [ ] **Step 1: Draw** from "The board as numbers": the standing pill with its caret; `.parent` and `.more` cloths; `.full` cloths with `.lineLimit(banner.lines)` and `.minimumScaleFactor(0.9)`; `WalkSideView` (pole, pennants with `WalkPennant`, "+n", pill; one button with the side's `label`; hit shape at least `stage.touch` square). Remove the tip and stub drawing. A side's tap and the standing post's change animate with the walk's existing drop-in and the 0.25 s cross-fade under Reduce Motion; no camera glide inside a step.
- [ ] **Step 2: The picture under the flags.** Shoot each step 1 to 6 with the full plan and look: the standing post's foot (195, 556) and the side slots must stand on land in the painting, not on sky or water. Where they do not, move that step's picture stop in `WalkArt+Tall.swift` (the layout's numbers do not move) and keep `WalkBackdropTests` / `WalkArtCutTests` passing; list every stop changed in the report. Do this on the phone first: at today's stops the side slots do not fit the open ground (`WalkBackdrop.open`) on Year (needs about k 0.50, x 428), Month (k at least 0.593) and Week (k at least 0.542). Then shoot `-WalkSize 484x669`, `669x951` and `951x669`. Add `sidePostsStandWhereThePhonesDo` to `WalkBackdropTests`: on every shape and step where the picture is enlarged at least `stretch(wing:)` times and not slid, each side pole's painting x lies between the phone's outer poles' painting x.
- [ ] **Step 3: UI test** `testWalkingToAnotherArea`: Year step with the full plan, tap `walk.side.home`: the question contains "home" and `walk.standing`'s label is "Home".
- [ ] **Step 4: Run** `WalkLayoutTests`, `WalkBackdropTests`, `WalkArtCutTests`, `WalkUITests`, `LightDailyUITests`: PASS.
- [ ] **Step 5: Shots** for the preview plan, `-SymphonyWalkSeed full` and `long`, on iPhone 17, `-WalkSize 484x669`, `669x951`, `951x669`, `375x667` and the Duo's outside screen (`-WalkSize 466x678 -WalkSafe 0,84`): Year, Season, Month, Week, Today at rest; Month just planted; Month with examples; Month with a flag chosen. Compare with Task 1's before shots. Look for: any title cut that the rule says should be whole (the estimate is too generous: lower the characters-per-line number and re-run Task 5's tests); a pill or pennant touching a cloth; a post on sky.
**Added from the cold read (S18, S20, S21, S25, S26):**

**Files (added):** `R/Walk/Views/WalkOrbView.swift`.

**Draw:**
- **Fixed sizes (S20):** every word on a cloth, pill, pennant count, "+n more" and tag inside the stage uses `Font.custom(_:fixedSize:)` at its board size. The layout's estimate then holds at every text size; the paper is where words follow the person's text size.
- **Line limits:** `.parent` takes `.lineLimit(banner.lines)` up to 3. The standing and ground labels take `.lineLimit(label.lines)` with no `.minimumScaleFactor(0.7)`.
- **Tags:** day, FIRST THING and TAP TO USE are drawn in DM Sans SemiBold 11, tracking 0.6.
- **The spoken flag:** `WalkLiveFlag` stands at `layout.spokenFlag` (one line, `.truncationMode(.head)`) instead of above the dial.
- **The veil:** `WalkSideView` hides its words while `veilsWords` (Task 3).

**Shots** (add to Step 5):
- with `-SymphonyWalkSeed long`: Month (a 44-character parent whole) and the ground with "Side projects and making" (two lines);
- with the full plan, speaking (the spoken flag clear of every post);
- Month at the accessibility size (`-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityXL`): no cloth word cut that its lines should hold;
- the daily seed `quiet` on the Month page (the 60-letter word breaks with a hyphen).

If the soft hyphen does not show, draw `-` followed by U+200B at those places instead, and say so in the report.

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
- [ ] **Step 3: Implement** the core, then `PlanPaperView` from "The board as numbers" (a `ScrollView`; each row a button; the first 44 points close it; VoiceOver reads the heading, the count, then each section as a heading with its rows; Escape gesture closes) and show it in `WalkView` over the stage while `paperOpen` (it rises 0.3 s; with Reduce Motion it fades). The paper's sheet runs over the board plus its bleed. Its heading, count and rows stand in `WalkLayout.column(wing:)`, 24 in from its left. Each row is at least `stage.touch` high.
- [ ] **Step 4: UI test** `testPlusMoreOpensThePaperAndARowComesBack` (full plan, Month: tap the "+n more" cloth, `walk.paper` exists, tap `walk.paper.row.0`, the paper is gone and the Move row shows).
- [ ] **Step 5: Run** `PlanPaperTests`, `WalkFlowTests`, `WalkLayoutTests`, `WalkUITests`: PASS. **Shots:** the paper over Month and Week with the full plan and with long titles, on iPhone 17, `-WalkSize 484x669` and `951x669`.
- [ ] **Step 6: Commit** `Walk: the paper, where the whole level is read`.

### Task 8: Look back up, in the same form

**Files:**
- Modify: `R/Walk/Core/WalkLayout+Standing.swift`, `WalkState.swift`, `WalkCopy.swift`, `R/Walk/Views/WalkEndingSheet.swift` (`WalkEndingView`), `R/Daily/Core/MountainPage.swift` (`lookBack`), `DailyLookBack.swift`, the views that draw the plan behind Today's and Week's lowered sheet
- Test: `T/WalkLayoutTests.swift`, `WalkFlowTests.swift`, `DailyTodayPageTests.swift` or wherever `DailyLookBack` is tested

**Interfaces:**
- Step 6 layout (F6): the standing label at y 110; one `.compact` cloth per level that has a flag in the standing area, year first, the newest flag's words, `more` = the others on that level; sides for every other kept area with a flag (pennants: up to 4, one per flag, year first, each in its level's colour; `count` = all its flags; `label` "Health, 9 goals and tasks"). `.compact` takes a tap and opens the paper for its level (F21; see "Added from the cold read" below).
- `WalkState`: `.areaTapped` on step 6 stands there. Entering step 6 stands in the area walked last (`focusArea` if it has a flag), else the first kept area with one.
- `DailyLookBack`: `expanded` goes; new `private(set) var standing: UUID?`; `mutating func tap(_ event: WalkEvent?)` handles `.areaTapped(id)` only; `plan(...)` sets `focusArea = standing ?? first kept area with a flag`.
- `WalkCopy.lookBackHint = "Tap a post to see that area"`, drawn once under the header on step 6 when there are sides. The ending sheet's content and the header line stand in `WalkLayout.column(wing:)`; its paper already runs to the window's edges.

- [ ] **Step 1: Write the failing tests:** `lookingBackUpReadsOneAreaTopToBottom` (full plan: five `.compact` cloths, year above season above month above week above today, each centred on x 195 and `standingWidth(wing:)` wide (120…270 at wing 0); four sides); `theNewestCarriesTheCountOfTheRest` (`more == 3` on a level of four); `aQuickWalksLookBackIsOneChainAndNoPosts`; `nothingSitsUnderTheEndingSheet` (nothing below y 700); `tappingAPostOnTheLookBackWalksThere`; in the look-back's tests `theWholePlanBehindTodaySwitchesAreaOnATap`; `Invariants.check` empty over the generated step-6 states.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** `WalkLayoutTests`, `WalkFlowTests`, `MountainPageTests`, the look-back's suite, `WalkUITests`, `LightDailyUITests`: PASS.
- [ ] **Step 5: Shots:** Look back up (sheet down, sheet up) for the preview, full and long plans on iPhone 17 and `-WalkSize 484x669`; Today's "See my whole plan" with `-SymphonyDailySeed full` on iPhone 17 and the Duo outside screen.
**Added from the cold read (S14, S27, S37, S40):**

**Files (added):** `R/Daily/Core/DailyMetrics.swift`, `R/Daily/Views/DailySheet.swift`, `R/Daily/Views/LightTodayView.swift`, `R/Daily/Views/LightWeekView.swift`; tests `T/DailyMetricsTests.swift`, `U/LightDailyUITests.swift`.

**Interfaces:**
- **Look back up cloths (F20, S14):** up to 3 lines of words at width 150, and "+n more" on its own 14-point line (see "The board as numbers"); nothing below y 700.
- **A cloth opens the paper (F21, S14):**
  - New `WalkEvent.lookBackPaper(WalkLevel)` (not `leavesAWaitingFlag`) and `WalkState.paperLevel: WalkLevel?` (never saved).
  - On step 6 the event sets `paperOpen = true, paperLevel = level`. `.paperClosed` clears both.
  - `.paperRow(id)` on step 6 closes the paper and stands in that flag's area (`focusArea = column(of:)`); it chooses nothing.
  - The walk's paper is `PlanPaper.make(level: paperLevel ?? level, …)`, with a new `WalkCopy.paperTitle(_ level: WalkLevel, _ p: WalkPeriods) -> String` beside Task 7's.
  - `WalkLayout.tapEvent(_:on:)` gives `.compact` → `.lookBackPaper(banner.level)`.
  - `WalkCopy.BannerRole` gains `.opensPaper(Int)`, read as "\(withTag), and \(n) more, tap to read the list" ("\(withTag), tap to read the list" with none), `taps == true`.
  - Identifier `walk.lookback.<level>`.
- **The same behind Today and Week:**
  - `DailyLookBack.tap(_:)` also takes `.lookBackPaper(level)`; there is a new `private(set) var paperLevel: WalkLevel?`.
  - New `func paper(goals:tasks:periods:me:) -> PlanPaper?` for that level over the kept areas the sheet read.
  - A row closes the paper and stands in its area, as `.areaTapped`.
  - `LightTodayView` and `LightWeekView` show Task 7's `PlanPaperView` over the lowered sheet while `paperLevel != nil`.
  - `DailyWholePlan` gains `.dynamicTypeSize(...DynamicTypeSize.xLarge)`, as the walk's stage has.
- **The ending sheet (S37):**
  - The handle becomes a labelled button: a capsule 36 high, its words plus 40 wide, `EndingPaper.walkFill` fill, words `sheetHandleLabel` in DM Sans SemiBold 14 `EndingPaper.deepGreen`, then `chevron.up` (`chevron.down` while raised), inside the 56-point tap height. Identifier `walk.sheetHandle`.
  - "Open Today" becomes a filled capsule 50 high, the sheet's width less 36, `EndingPaper.green` fill, white DM Sans SemiBold 17 words and `arrow.right`. It keeps `walk.goToToday`.
- **Large text on the lowered sheet (S27):** while the sheet is lowered, the handle and the head (eyebrow, date, ring) are drawn at `.dynamicTypeSize(...DynamicTypeSize.large)`, so the date stays above the home indicator at every text size.
- **Short windows (F25, S40):**
  - `DailyMetrics.board` gives `lookBack: handle(width:sheetTop:)` on both shapes. Today's short header moves from `sheetTop + 26` to `sheetTop + 46`; Week's short header from `sheetTop + 24` to `sheetTop + 44`.
  - `lowered(safeBottom:)` then works on short windows. The spread is unchanged (no handle).
  - The three-rows rise (`risen(by:)`) still holds.

**Tests (failing first):**
- `WalkLayoutTests`: `aLookBackClothHoldsAFortyFourLetterTitle` (long plan, step 6: every `.compact` banner's lines equal `min(3, lines(for: text, width: 150))`, with "+n more" on its own line, nothing below 700); the generated step-6 states still pass `Invariants.check`.
- `WalkFlowTests`: `aLookBackClothOpensItsLevelsPaper` (`.lookBackPaper(.season)` on step 6: `paperOpen && paperLevel == .season`; `.paperRow` closes it and stands in that flag's area; `selected == nil`).
- The look-back suite: `theWholePlanBehindTodayOpensAPaper`.
- `DailyMetricsTests`:
  - `everyPhoneWindowHasTheHandle` (393x852, 375x667, 466x678 `.glance`, 484x669: `lookBack` is 160 x 44, inside the window, among `touchTargets` and meeting no other; three rows still end above the fade);
  - `aShortWindowLowersToo` (`lowered(safeBottom:)` is non-nil there).

  Update the tests that pin `lookBack == nil` on short windows (around lines 123, 141, 354 and 638).
- `U/LightDailyUITests`:
  - `testTheWholePlanOnTheOutsideScreen` (Duo outside, `-SymphonyDailySeed full`: tap `daily.lookBack`, the whole plan shows);
  - `testALookBackClothOpensThePaper` (the walk's step 6, full plan: tap `walk.lookback.year`; `walk.paper` exists).

**Shots** (add to Step 5): Look back up with the long plan (three-line cloths); the paper opened from a cloth; the ending sheet lowered at the accessibility size (the date clear of the home bar); Today and Week on 375x667 and the Duo outside with the handle's words.

- [ ] **Step 6: Commit** `Walk: looking back up reads one area, top to bottom`.

### Task 9: The Month, Season and Year pages

**Files:**
- Modify: `R/Daily/Core/MountainPage.swift`, `DailyCopy.swift`, `DailyMetrics.swift` (and its `+Spread`, `+Tent` parts where a mountain page is laid out), `DailyModel.swift` (only what the bar's look and the paper need), `R/Daily/Views/MountainPageView.swift`, `DailyBarView.swift` (the paper look on these pages), `LightSpreadView.swift` / `LightHalfOpenView.swift` where they draw a mountain page, `R/Daily/DailyDemo.swift` (`-SymphonyDailyState paper`)
- Test: `T/MountainPageTests.swift`, `DailyMetricsTests.swift`, `DailyCopyTests.swift`, `U/LightDailyUITests.swift`

**Interfaces:**
- `MountainPage`: `focusArea` is the standing area on every level (it starts as the first kept area with a flag on the page's level, else the first kept; `settle()` keeps it valid). `expanded` goes. `Event` gains `.paper(Bool)`, `.paperRow(UUID)`; `.peak(id)` works on every level (stands there; on Season and Month `focus` becomes that area's newest parent); `.flag(id)` on the focused parent switches to the area's next one. `var paperOpen = false`. `var paper: PlanPaper? { get }` (the page's level, its own items, title `DailyCopy.paperTitle`), nil when the page has no flag on its level. `static func event(for tap: WalkEvent) -> Event?` maps `.paperOpened` to `.paper(true)`. `walkState` passes `focusArea` and `focus` on every level. `hanging` gives the standing area on every level (a goal from the bar lands where the page stands, under the focused parent on Season and Month).
- `DailyCopy`: `hint(_ level:sides:empty:)`: with no goal on the page, `emptyMountain` = "Add your first goal with the bar below" (S22); else with side posts "Tap a post to walk to that area"; else "Tap a flag to move it or walk it down" on every level (Year's "Tap a peak to look closer" goes with the zoom); `readWhole(_ level:) -> String` ("Read the whole year" / "season" / "month"); `paperSub(_ count: String) -> String` ("17 goals, as a plain list by area"); `paperLine(_ level:count:)` for the one-line strip ("Read the whole year · 17 goals"); `paperTitle(_ level:periods:)`.
- `DailyMetrics`: `func mountainFoot(...) -> (foot: CGRect, strip: CGRect?, oneLine: Bool, bar: Bar, hintTop: CGFloat, paperTop: CGFloat, stage: WalkStage)` on every window the pages open in (phone, narrow, Duo outside, the inside screen upright, opened flat), from "The pages' paper foot".
- The pages' stage (F16): `WalkStage(page: CGSize, field: ClosedRange<CGFloat>)`, `field` from `navTop + 144` to `hintTop − 4`. `scale = min(w / 390, max(h / 844, min(1, field length / 282)))`. Where that is above `h / 844`, the standing foot (y 556) stands 12 above the field's foot and the board is cropped top and foot; otherwise it is as `init(device:)`. `MountainStage` takes the stage. `DailyMetrics.mountainPanel` stands beside the standing cloths (its left edge 16 right of x `195 + standingWidth / 2` on the page) where that leaves 240, and may cover the right side posts while a flag is chosen.
- Identifiers: `daily.mountain.paper.strip`, `daily.mountain.paper`, `daily.mountain.paper.close`.

- [ ] **Step 1: Write the failing tests:** `MountainPageTests`: `thePageStandsWhereItsFlagsAre`; `aPeakTapWalksThereOnEveryLevel`; `theFocusedGoalSwitchesToTheNextOneHere`; `aGoalFromTheBarLandsWhereThePageStands`; `thePaperListsThisLevelByArea` (full plan, Year: 5 sections, `total == 17` for the demo's numbers); `noGoalsNoPaper`; `aPaperRowWalksThereAndChoosesTheFlag`. `DailyMetricsTests`: `thePaperFootFitsEveryWindow` (strip and bar inside the window, clear of the safe area's foot, on 393x852, 375x667, 466x678, 484x669 and the spread's pane; `oneLine` on windows under 700 high). It adds 669x951 and 951x669. `aShortWindowDrawsThePagesMountainAtFullSize`: 484x669 and 951x669 give scale 1.0, 375x667 gives 0.9615, 382x678 gives 0.979; the ceiling (y 282) is at or below the heading's foot and the standing foot is above the hint. `aPhoneKeepsThePagesMountainWhereItWas`: 393x852 and 669x951 equal `WalkStage(device:)`. Update `DailySpreadTests`' panel test. `DailyCopyTests` for the new words.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** core, then the view (the paper foot, the strip, the raised paper with the add bar staying at its foot, `PlanPaperView` reused; the mountain's flags and posts are not touchable under the raised paper and VoiceOver skips them).
- [ ] **Step 4: UI test** `testThePaperStripOpensTheList` (Year page, full plan: tap the strip, the list shows five headings, tap `daily.mountain.paper.close`, the mountain is back) and update the existing page tests. **Run** `MountainPageTests`, `DailyMetricsTests`, `DailyCopyTests`, `DailyModelTests`, `DailyWalkDownTests`, `LightDailyUITests`, `LightSpreadUITests`, `LightEditionUITests`, `FullHouseholdUnchangedUITests`: PASS.
- [ ] **Step 5: Shots:** Year, Season, Month pages (mountain, a flag chosen with its panel, the paper raised) for seeds `morning`, `full`, `long`, `empty` on iPhone 17, 375x667, the Duo outside screen, 484x669, 669x951, the spread 951x669, and half-open laptop and book. Look for: the panel, the hint and the foot never overlapping; the bar's field readable on paper; an empty page still taking a goal.
**Added from the cold read (S22, S23, S38, S45, S46, S60):**

**Files (added):** `R/Daily/Core/DailyMetrics+Spread.swift` (`mountainPanel`), `R/Daily/Core/Signpost.swift` (read only: the sign keeps its facts).

**Interfaces:**
- **Empty pages (S22):** `DailyCopy.hint(_:sides:empty:)` as Interfaces above says; `MountainHint` passes `empty` when the page has no flag on its level.
- **The panel names its goal (S45):**
  - `MountainPage.panel` becomes `(title: String, line: String?, canWalkDown: Bool, moveTo: [WalkArea])?`, where `title` is the chosen flag's title, whole.
  - `MountainPanel` draws it first: DM Sans SemiBold 15, `DailyPalette.ink`, wrapping (`.fixedSize(horizontal: false, vertical: true)`).
  - The panel's VoiceOver label is the title. Its Pull it up chip reads `WalkCopy.removeLabel(title)`.
- **Wrapping chips (S46):** while Move to is open, the chips always wrap (`DailyChipFlow`), never scroll sideways.
- **The panel keeps clear of the chosen flag (S23):**
  - `DailyMetrics.mountainPanel(size:line:layout:)` gains `chosen: CGRect?` (the chosen cloth in page points, through the page's `WalkStage`) and `height: CGFloat`.
  - New `static func mountainPanelHeight(titleLines: Int, hasLine: Bool, chipRows: Int) -> CGFloat` = 18 + 20 × titleLines + (hasLine ? 19 : 0) + 4 + 44 × chipRows, with lines and rows by estimate (8 points a character for the title, 7.5 plus 26 a chip, 6 between).
  - The panel stands bottom-anchored as now. If that box meets `chosen`, its bottom stands 8 above `chosen.minY` instead, as long as its top stays at least 8 under the row of words' foot (`navTop + navHeight`). If neither fits, it stays bottom-anchored and drops its `line`.
- **The sign (F29, S38):** `DailyCopy.noPiece(_ seasonWord:)` reads `"No \(seasonWord) goal under this yet"`.
- **Placeholders (S60):**
  - `placeholder(.season, periods:)` reads "Add a goal for this \(seasonWord)".
  - `shortPlaceholder(_ h: Horizon, periods: WalkPeriods)` reads "Add for \(monthName)" / "Add for this \(seasonWord)" / "Add for \(year)" on the mountain pages (Today and Week unchanged).
  - New `addAGoal = "Add a goal"`.
  - `DailyBarView.shown` fits `[placeholder, shortPlaceholder, DailyCopy.addAGoal]`; every caller of `shortPlaceholder` passes `periods`.

**Tests (failing first):**
- `MountainPageTests`: `thePanelNamesItsGoal` (a 200-character title is the panel's `title`, unshortened).
- `DailyMetricsTests`: `thePanelNeverCoversTheChosenFlag` (every Month and Year flag of `DemoStress.full` chosen, on 393x852, 375x667, 466x678 and 484x669: the panel's box does not meet the chosen cloth, or the line is dropped as the rule says).
- `DailyCopyTests`: `anEmptyPageSaysHowToBegin`, `noHintNamesTheZoom`, `theSignSaysNoGoalUnderThisYet`, `theBarSaysWhereAGoalGoesInFewerWords`. Update the pins on the old `noPiece`, `hint` and placeholder wording.

**UI test:** extend `testThePaperStripOpensTheList` with `-SymphonyDailySeed empty` (the hint reads the empty form).

**Shots** (add to Step 5): the empty seed's Year page; a Month flag chosen on 375x667 and the Duo outside (the panel names the goal and clears it); Move to open with five areas (the chips wrap); Today's sign with the `nopiece` seed.

- [ ] **Step 6: Commit** `Light pages: the same standing mountain, and a paper to read the whole level`.

### Task 10: Everything else that draws the mountain, VoiceOver, and the record

**Files:**
- Modify: every remaining caller of `WalkLayout.make`, `MountainStage` or `WalkWorldView` (find them with a search; the walk-down and the handover among them), `R/Walk/Views/*` for VoiceOver, `apple/SymphonyOS/PLANNING.md`, this plan ("As built"), `docs/app-store/2026-11-14-light-listing-draft.md` only if it describes a changed control
- Test: `T/DailyWalkDownTests.swift`, `T/DailyHandoverTests.swift`, `U/*`

- [ ] **Step 1: Walk-down and handover.** A walk-down opens standing in its goal's area with that goal as the parent flag (test `aWalkDownStandsInItsGoalsArea`); the handover's light still travels from the board's (195, 678); Task 2A moved that point on the outside screen and changed two tests; nothing more changes here.
- [ ] **Step 2: VoiceOver, in reading order** on a walk step: the top row (Back, More, Leave for now), the eyebrow, question and why, the standing label ("Work, you are here"), the parent flag, each flag, "+n more", each side post, the hint or the Undo pill, the light, Next. Custom actions on a flag (Move to each area, Remove) are unchanged. The paper reads as Task 7 says. Check with the accessibility inspector's audit on Year, Month and the paper, and fix what it reports; list what it reported.
- [ ] **Step 3: Text size and motion.** The stage stays capped at extra large (existing). At the largest size the top row's three words still fit on 375 wide (they shrink to 0.85 before anything is cut). Reduce Motion: no drop-in, cross-fades only.
- [ ] **Step 4: The record.** Rewrite the parts of `PLANNING.md` ("The walk": the controls, standing, the layout's guarantees, the paper; "The everyday screens (light)": the pages' paper foot, the look back) that this plan changed, and append "As built" to this plan: every ruling F1 onward with what was built, anything that differs from the board's numbers and why, known gaps, and what Scott should look at on his phone. Rewrite "Other screens" (the stage, its wings, the picture's three rules) and "Not designed yet" in `PLANNING.md`: the navy bars are gone; the walk at 0.79 on short windows and the single column on the fold opened flat are the known gaps, each wanting its own board; record the 1.6 on the inside screen.
- [ ] **Step 5: Run every unit suite and every UI class one at a time:** all PASS. The must-not-change diff is empty. Release build for the simulator succeeds.
**Added from the cold read (S44):**

- [ ] **Walk it down, checked by hand first.** On iPhone 17 open the Month page (`-SymphonyDailySeed morning`), choose a flag, tap Walk it down.
  - If the walk opens standing in that goal's area (Step 1's rule), the sweep's picture came from the demo state. Make `-SymphonyDailyState select,walkdown` reach the walk as a tap does (`MountainPageView.appear` applies `.walkDown`, so find why `appState.walkDown` did not open it in demo mode) and change nothing else.
  - If it does not open, find why `MountainPage` `.walkDown` does not reach `appState.walkDown`, fix it, and pin it with a `DailyWalkDownTests` test (`walkItDownOpensTheWalk`).
  - Report which it was and the two shots (before the tap, after it).

- [ ] **Step 6: Commit** `Light: every mountain in the new form, VoiceOver, and the record`.

---

Tasks for what the cold read of the screenshot sweep finds are added below this line before the build starts, each with its own files, tests and shots.

### Task 11: Examples that answer the question

F27, S34. Build it after Task 3 and before Task 4, Task 5's examples rule and Task 6's drawing. It edits `WalkCopy` and `WalkState+Plant.swift` as Tasks 2 and 3 do, so it must follow them, and Task 5 should count the new lists.

**Files:**
- Modify: `R/Walk/Core/WalkCopy.swift`, `R/Walk/Core/WalkState+Plant.swift`, `R/Walk/Core/WalkState.swift` (the `.examples` action's guard)
- Test: `T/WalkCopyTests.swift`, `T/WalkPlantTests.swift`, `T/WalkFlowTests.swift`

**Interfaces:**
- `WalkCopy.examples(_ level: WalkLevel)` becomes `static func examples(_ level: WalkLevel, area: String?) -> [String]`.
  - It is keyed by the six built-in area names, lowercased as `phrase(for:)` reads them; any other name, or nil (the nameless post), gives `[]`, and so does Today.
  - Each area's first example on each level follows from its first one level up, so a person who taps the first example at every step gets a plan that makes sense.
  - Draft lists, for the owner to read before the build (Week's carry a day, as `WalkWords.said` reads one):

| Area | Year | Season | Month | Week |
|---|---|---|---|---|
| Health | Feel strong again, Sleep seven hours most nights, Run a 5K | Lift twice a week, Walk every morning before work | Find a gym that fits, Book a check-up | Tour the gym on Tuesday, Buy proper running shoes on Saturday |
| Home | Finish the bathroom, Clear out the garage, Plant a kitchen garden | Bathroom tiled and plumbed, Garage empty enough for the car | Pick the tile and pay the deposit, Book the plumber | Call the tile shop on Monday, Measure the bathroom window today |
| People | More slow weekends together, See old friends each season, Call Mum every Sunday | One slow Sunday a month, Dinner with old friends | Keep one Sunday free, Invite friends round for dinner | Put the free Sunday on the calendar today, Text friends about Friday |
| Work | Sign one more client, Ask for a raise, Protect two focus mornings a week | Pitch three new clients, Ship the spring proposal | Send two proposals, Ask for a testimonial | Draft the first proposal on Wednesday, Email the client on Thursday |
| Money | Pay off the car, Save an emergency fund, Sort the pension | Clear a third of the car loan, Spend less on takeaways | Set up a bigger monthly payment, Call the pension line | Call the bank about the payment on Monday, Cancel unused subscriptions today |
| Fun | Read a book a month, Learn to play the guitar, Go camping twice | Finish two novels, Book the first camping trip | Join the library, Pick the campsite | Borrow the next book on Saturday, Pack the tent on Friday |

- **The `.e` point** (this amends Task 3's `points` rule): Show/Hide examples is offered on steps 1 to 4 off the ground only while `examples(level, area: area(standing)?.name)` is not empty. The `.examples` action's guard checks the same.
- **What shows:** the examples drawn on the standing post (Task 5's examples rule) are that list less any already planted on this step (same title, ignoring case; on Week the same day too). A used example comes down; the others stay.
- **Planting:** `plantExample(_:_:)` plants only a text in that list for the standing area, under the focused parent, in the standing area (`plantFlag` as Task 2 left it). Never under another area's goal.

- [ ] **Step 1: Write the failing tests:**
  - `WalkCopyTests`: `everyBuiltInAreaHasExamplesOnEveryLevel` (Health, Home, People, Work, Money and Fun have one or more for Year to Week; none on Today); `anAreaYouNamedHasNone` ("Side projects and making": `[]`); `examplesFitAFlag` (every example is at most 44 characters); `noExamplesNoExamplesPoint` (standing in an area of one's own: no `.e` point).
  - `WalkPlantTests`: `anExampleIsPlantedOnlyWhereItBelongs` (standing in Work, `.exampleTapped` with a Health example: no effect); `aUsedExampleComesDown` (plant Home's first Season example: it is no longer among the examples shown; the other stays).
  - `WalkFlowTests`: `followingTheFirstExamplesMakesOneChain` (quick walk in Home, tap the first example on Year, Season, Month and Week: each new flag's parent is the one before, all in Home).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Delete the old per-level lists; keep every string a `WalkCopy` member.
- [ ] **Step 4: Run** `WalkCopyTests`, `WalkPlantTests`, `WalkFlowTests`, `WalkOrbTests`: PASS.
- [ ] **Step 5: Shots** (iPhone 17, `-SymphonyWalkExamples`, the preview plan): Year, Season, Month and Week with examples on, standing in Home; then in an area of one's own (no Show examples among the choices).
- [ ] **Step 6: Commit** `Walk: examples that answer the question for the area you stand in`.

### Task 12: Light households stay upright on phone-sized screens

F26, S29, S52. Its files collide with no other task's, so it may be built first, right after Task 2. It is the readers' only BLOCKS.

**Cause (read before building):** a phone on its side lays out as `TodayLayout.glanceWide` (width at least 600, height under 520). `DailyGate.layouts` leaves `.glanceWide` out on purpose ("never `.glanceWide`, where a phone on its side keeps the old screens"), so `DailyGate.shows` is false. `MainView` then draws the full edition's Today, Tell Symphony bar and dock for a light household. The walk sideways is the 390 x 844 stage scaled into a strip. Holding the light household's phone-sized screens upright removes both. `DailyGate.layouts` stays as it is, so a full household is unchanged.

**Files:**
- Create: `R/App/OrientationHold.swift` (`#if os(iOS)`)
- Modify: `R/App/SymphonyApp.swift` (`AppDelegate`), `R/App/MainView.swift`, `R/Daily/Core/DailyGate.swift`
- Test: `T/DailyGateTests.swift`, `U/LightDailyUITests.swift`, `U/FullHouseholdUnchangedUITests.swift`
- `Info.plist` is unchanged (every orientation stays allowed; the hold is decided at run time). After adding the file: `xcodegen generate`.

**Interfaces:**
- `DailyGate.holdsUpright(edition: Edition, phone: Bool, screen: CGSize) -> Bool` = `phone && edition == .light && min(screen.width, screen.height) < TodayLayout.wideWidth`. `screen` is the window's screen in points, the same in either orientation: an iPhone (402 short side) and the Duo's outside screen (466) are held; the Duo's inside screen (626) is not; an iPad (`phone == false`) is not; a full or mixed household (`.full`) is not.
- `@MainActor enum OrientationHold`:
  - `static private(set) var mask: UIInterfaceOrientationMask = .all`.
  - `static func apply(_ upright: Bool, scene: UIWindowScene?)` sets `mask` (`.portrait` or `.all`), calls `setNeedsUpdateOfSupportedInterfaceOrientations()` on the scene's key window's root view controller, and, holding while the scene is sideways, `scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))`.
- `AppDelegate` gains `application(_:supportedInterfaceOrientationsFor:) -> UIInterfaceOrientationMask { OrientationHold.mask }`.
- `MainView` calls `OrientationHold.apply(DailyGate.holdsUpright(edition: appState.edition, phone: DailyDevice.phone, screen: <the window scene's screen bounds>), scene:)` in `applyEdition()` and in `updatePosture()`, so a fold onto the other screen and an edition change both decide again.

- [ ] **Step 1: Write the failing tests:**
  - `DailyGateTests`: `aLightPhoneStaysUpright` (light, phone: 402x874 and 874x402 → true; 466x678 → true; 626x890 → false); `aFullHouseholdStillTurns` (`.full`, phone, 402x874 → false); `anIPadIsNeverHeld` (`phone: false` → false).
  - `U/LightDailyUITests`: `testTurningThePhoneKeepsTheLightPage` (iPhone 17, light demo, `-SymphonyDailyPage month`: `XCUIDevice.shared.orientation = .landscapeLeft`, wait 1 s; `daily.mountain.month` exists; no element whose label contains "Tell Symphony"; `app.windows.firstMatch.frame` is taller than wide; set `.portrait` back at the end). The same with `-SymphonyWalk -SymphonyWalkStep 1`: `walk.next` is hittable and the window is upright.
  - `U/FullHouseholdUnchangedUITests`: `testAFullHouseholdStillTurns` (full demo, turned: the window is wider than tall).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `DailyGateTests`, `LightDailyUITests`, `LightEditionUITests`, `FullHouseholdUnchangedUITests`, `WalkUITests`: PASS. The must-not-change diff is empty.
- [ ] **Step 5: Shots:**
  - iPhone 17 turned on Month and in the walk (both upright);
  - the Duo outside screen turned (upright; its picture did not turn in the sweep either);
  - a full household turned (sideways, as before).

  Say plainly that the Duo's inside screen turning was not tested (the simulator cannot be unfolded).
- [ ] **Step 6: Commit** `Light: phone-sized screens stay upright, so the light pages never give way to the old ones`.

### Task 13: Today and Week readability

F28, S39, S41, S45 (Week), S47, S48, S49, S57, S58, S59. Build it after Task 9: it shares `DailyMetrics.swift` with Tasks 8 and 9 and `WalkEndingSheet.swift` with Task 8. No file here is on the everyday-screens plan's must-not-change list.

**Files:**
- Modify:
  - `R/Daily/Core/DailyMetrics.swift`;
  - `R/Daily/Views/DailyRows.swift`, `DailyWeekList.swift` (`DailyWeekChoice`, `DailyMovePanel`), `DailyBand.swift`, `SignpostView.swift`, `DailyPageParts.swift` (`DailyWalkLine`), `DailyBarView.swift` (`slot`), `LightTodayView.swift`, `LightWeekView.swift`;
  - `R/Walk/Views/WalkEndingSheet.swift` (`WalkEndingRow`).
- Test: `T/DailyMetricsTests.swift`, `U/LightDailyUITests.swift`

**Interfaces:**
- **Two lines (F28):**
  - `DailyMetrics.titleLines(accessibilitySize:)` gives `accessibilitySize ? 3 : 2`.
  - New `static func forLines(accessibilitySize: Bool) -> Int { accessibilitySize ? 3 : 2 }` is used by the "for …" lines in `DailyRows.lineage`, `DailyWeekList`'s lineage and `WalkEndingRow`.
  - `quietLines` stays for Week's fold and the event row.
  - The rows keep the board's minimum height and grow; the three-rows rise still holds by the minimum.
- **The sign's task line (F28, S48):** `SignpostView.title` takes `.lineLimit(2)` and `.minimumScaleFactor(0.7)` in a frame `plank.height - title.y - 4` high, so two lines stand inside the plank. The eyebrow is unchanged.
- **The Week band (F28, S49):**
  - New `static func bandLines(_ title: String) -> Int`: 1 when `18 + 6 × characters` is at most 156, else 2.
  - `bandFlags` gives the cloth a height of 32 for one line and 48 for two.
  - `DailyBandFlags` draws `.lineLimit(2)` in `cloth.height - 6`.
- **The waiting line (S39):** `DailyWalkLine` draws its words as a capsule 36 high, its words plus 40 wide, centred in its 44-high frame, `DailyPalette.chipFill` with a `DailyPalette.chipLine` 1-pt outline, `DailyPalette.deepGreen` words and `arrow.right` 12 semibold.
- **The keyboard (S41):** on Today and Week, a tap on the sheet outside the bar ends the field's focus (the draft stays, as ruling D22 keeps typed words), and the list's scroll has `.scrollDismissesKeyboard(.immediately)`.
- **The line above the bar (S57):** `DailyBarView.slot` draws its line on a `DailyPalette.paper` capsule at 0.96, with padding 10 by 4, so the listening, handover, Undo and note lines never lie on a row's words.
- **The list's top edge (S58):** Today's and Week's list get a 14-point paper fade at their top edge (as `DailyPaperFade`, reversed), so a row scrolled under the header reads as scrolled.
- **The Week panel names its task (S45):** `DailyWeekChoice` gains `title: String`, set where a task is chosen. `DailyMovePanel` draws the title first (DM Sans SemiBold 15, `DailyPalette.ink`, up to 2 lines) above "MOVE TO", and its Pull it up chip reads `WalkCopy.removeLabel(title)`.

- [ ] **Step 1: Write the failing tests** in `T/DailyMetricsTests.swift`:
  - `aTaskTakesTwoLines` (`titleLines(accessibilitySize: false) == 2`, `forLines(accessibilitySize: false) == 2`);
  - `aLongBandFlagTakesTwoLines` ("Pick the tile and pay the contractor" is 48 high, a 15-letter title is 32);
  - `bandFlagsStayAboveTheSheet` (every cloth's `maxY` is under `sheetTop` on 393x852, 375x667, 466x678 and 484x669, and on the spread's slots);
  - `threeRowsStillFitAboveTheFade` (unchanged, still passing).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: UI tests** in `U/LightDailyUITests.swift` (no typing):
  - `testATapOnTheSheetPutsTheKeyboardAway` (tap the bar's field, then the sheet clear of every row: `app.keyboards.count == 0`);
  - `testTheWaitingLineIsAButton` (`-SymphonyDailyState waiting`: `daily.walkWaiting` is hittable and at least 44 high).

  Run `DailyMetricsTests`, `DailyModelTests`, `DailyBarTests`, `LightDailyUITests`, `LightSpreadUITests`, `LightEditionUITests`, `FullHouseholdUnchangedUITests`: PASS. The must-not-change diff is empty.
- [ ] **Step 5: Shots:**
  - Today and Week with `-SymphonyDailySeed long` on iPhone 17, 375x667 and the Duo outside (two-line rows, "for" lines, sign and band flags);
  - Today listening and after an add on 484x669 and 375x667;
  - Week with a task chosen (its panel named);
  - the waiting line.

  Look for: a row's words cut where two lines would hold them; a band flag touching the sheet; the listening line on a row.
- [ ] **Step 6: Commit** `Light Today and Week: a task's words on two lines, and the small fixes the cold read found`.
