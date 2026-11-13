# iPhone Light Version, Step 2: The Walk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the guided first run on the iPhone: a walk down a mountain from the year ahead to the first thing today, where the person speaks or types their own words and each answer is saved at once as a real goal or task, linked up the chain.

**Architecture:** A pure core with no SwiftUI in it (periods, words, classifier, a state reducer, a layout function from state to frames, saved position, link planner), each piece unit-tested, under a thin SwiftUI layer that only draws what the layout says and sends events to one `WalkModel`. The model's coordinate system is the mockup's: a 390 × 844 stage looking at a 1300 × 1720 world, scaled to the device. Rows are written through the existing `PlanWriter` and sync queue; the only sync change is three link columns and one new table, sent only for rows the walk itself touched.

**Tech Stack:** SwiftUI, SwiftData, Swift Testing, Speech (on-device), AVFoundation, EventKit (through the existing `AppleCalendarService`), XcodeGen. No server, database or web change.

**Spec:** `docs/superpowers/specs/2026-11-13-iphone-light-version-design.md` (binding; this plan implements item 2 of its "Order of work"). Read with it: `docs/superpowers/plans/2026-11-13-iphone-light-walk-notes/controller-decisions.md` (calls made for Scott; cited as **D1…D23**), `docs/superpowers/specs/2026-11-13-iphone-light-walk-mockup/mockup-contract.md` (the approved prototype as numbers and strings; cited as **contract §n** or by its line numbers), and `docs/superpowers/plans/2026-11-13-iphone-light-walk-notes/ios-surface.md` (a map of the existing code).

**Scope.** In: the scene, the orb, areas, posts and banners, planting by voice or typing, placement by words, undo / move / pull up, examples, zoom, the five steps, "Look back up", the ending sheet, save and resume, both depths, replay from Settings, the calendar ask at the Today step, and the data plumbing the walk needs. Out (needs mockups and Scott's approval first): redesigning Today, Week or the Year/Season/Month pages, Duo layouts, tent view, daily signposts, large Dynamic Type design, a designed VoiceOver path, Plus early access, the App Store listing, doorstep art, any server or database change.

## Global Constraints

- Work only in `/Users/scottkaufman/.claude-worktrees/symphonyOS/ios-light-build` on branch `claude/ios-light-build`. Never edit the main worktree. **Nothing is pushed or deployed**: no migration, no edge function, no push to main, no TestFlight. Never touch a remote database.
- **R** = `apple/SymphonyOS/SymphonyOS`; tests in `apple/SymphonyOS/SymphonyOSTests`; UI tests in `apple/SymphonyOS/SymphonyOSUITests`. After adding a file: `cd apple/SymphonyOS && xcodegen generate`. Run one suite: `cd apple/SymphonyOS && xcodebuild test -scheme SymphonyOS -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:SymphonyOSTests/<Suite> 2>&1 | grep -E "error:|✔|✘|passed|failed|BUILD" | tail -40`. Swift Testing (`import Testing`, `@Test`, `#expect`, `@testable import Symphony`). **Only one xcodebuild at a time** on this machine.
- Anti-goals, in the spec's words. The walk fails if: "It feels like filling out a form." / "Symphony supplies ideas the person didn't ask for. It structures their own words, never its own" (the one exception is the example flags, shown only when asked for) / "Nagging: streaks, guilt counts, red "overdue", confetti." (and no praise: the ending says "That's the day." and nothing more) / "The free version costs real money per user (no AI calls in it)."
- "The orb is the only control." The only other things that take a tap are the ones the mockup has: area labels, banners, the Undo pill, the Move chips, and the ending sheet. No toolbar, no close button, no glass controls, no step labels.
- Look: "crisp, saturated woodblock", "white Crimson Pro / DM Sans text with a soft dark shadow, a faint dark band at the top for legibility. No pale mist." No blur anywhere. SF Symbols only, no emoji. Fonts are the six bundled faces (`CrimsonPro-Regular/Italic/SemiBold`, `DMSans-Regular/Medium/SemiBold`): where the mockup asks for Crimson 500 use `CrimsonPro-Regular`, for DM Sans 700 use `DMSans-SemiBold`. Curly quotes and apostrophes in every string (’ “ ”).
- "Existing full households must see no change unless they choose "Walk the mountain again"." The walk never starts by itself in a full household, and Task 1 sends nothing new for rows the walk did not touch.
- Everything the walk creates has `context = "personal"`. It never asks work / family / personal.
- The walk is iPhone-only. Files in `R/Walk/Core` and `R/Walk/Data` import only Foundation, CoreGraphics and SwiftData and compile everywhere; every other file under `R/Walk` is wrapped in `#if os(iOS) … #endif` (as `R/Platform/iOS` is). Add no new Mac compile problem.
- TDD for every pure piece: failing test, see it fail, implement, see it pass, commit. Views hold no rules: if a view needs an `if` about how the walk behaves, the rule belongs in the core with a test.
- No dictation and no typing in UI tests (typing stalls this simulator: `apple/SymphonyOS/PLANNING.md:50-63`).
- **Screenshots.** Every task that changes what is seen ends by saving screenshots to the session's scratch folder under `walk-shots/task-<N>/` (never inside the repo) and listing the paths in its report. Recipe (never during a test run: UI tests hang if the app is launched by hand meanwhile): `cd apple/SymphonyOS && xcodebuild build -scheme SymphonyOS -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath "$TMPDIR/walk-dd" 2>&1 | tail -3 && xcrun simctl install booted "$TMPDIR/walk-dd/Build/Products/Debug-iphonesimulator/Symphony.app" && xcrun simctl launch booted com.scottkaufman.symphonyos -SymphonyDemo -SymphonyLight -SymphonyWalk -SymphonyWalkStep <0…6> && sleep 4 && xcrun simctl io booted screenshot <path>.png`. Judge each against the contract's numbers, not taste.
- Line numbers below were read at commit `657548be`; another session was still committing to this branch, so find a cited function by name if a number is off. Commit after each task, ending the message with the session's attribution lines.

## Review Focus

1. **Speech is refused, missing, or hears nothing.** Microphone or speech permission denied, no recogniser, or the person lets go having said nothing. Expected: the hold opens the one-line typing field with one plain line; nothing empty is ever planted; the orb is never dead. Pinned in Task 11 (`speechOffOpensTyping`), Task 10 (`lettingGoWithNothingPlantsNothing`) and Task 4 (`nothingToPlant`).
2. **Coming back days later.** The app was closed mid-walk; a week, month or season boundary has passed; the focused goal was deleted on another device. Expected: the walk reopens on the right step for today's periods, asks again for a period that has moved on, and points at nothing that no longer exists. Pinned in Task 13 (`aNewWeekAsksTheWeekAgain`, `aDeletedFocusIsDropped`).
3. **A household with a real plan replays the walk, or the same account opens a second phone.** Expected: the walk shows their own personal plan for these periods but can only move or pull up flags it planted itself; it makes no duplicate area and deletes no area it did not make; it does not start by itself on the second phone. Pinned in Task 7 (`onlyPlantedRowsAreMine`, `anExistingAreaIsReusedByName`), Task 6 (`anAreaItDidNotMakeIsNeverDropped`), Task 10 (`aFlagIDidNotPlantCannotBeSelected`) and Task 13 (the truth table).
4. **First run with no network, or a slow first sync.** Expected: the walk does not start over a store that has not been filled yet; flags planted offline are saved and go up later parents first, with no attempt wasted on a child whose parent has not arrived. Pinned in Task 2 (`aChildWaitsForItsUnpushedParent`) and Task 13 (`anUnfinishedFirstSyncNeverStartsIt`).
5. **Odd words.** A minute of speech, only "um", only an emoji, only a day ("today"), a title that is one 60-letter word. Expected: nothing unreadable or empty is planted, long titles are cut at a word and fit their banner, and the layout still holds. Pinned in Task 4 (`longSpeechIsCutAtAWord`, `aDayAloneIsATitle`) and Task 12 (`longTitlesStayInsideTheirBanner`).

Eight areas with many goals on one post is Task 12's own test; VoiceOver and Reduce Motion are Task 21.

## What the web does (the convention this plan follows)

D3 maps the links to `supports_goal_task_id` and `goal_task_id`, and D4 makes season and month rows `is_goal`. The web's current writers do neither, and D3 says the web wins:

- New links are written to `source_id` only (`src/lib/planning/journalGroups.ts:8-16`, `:90`). A week task names its month line in `source_id` (`src/lib/canvas/applyChangeSet.ts:644-645`); a month line names its season line in `source_id` and copies that line's `goal_id` (`:742`); a season line names its year goal in `goal_id` (`:741`). `goal_task_id` means "is a step of, carried along when its goal moves"; `supports_goal_task_id` is a legacy field the web still reads and no longer writes (`src/components/plan/constellation/connections.ts:31-38`).
- Season and month lines are plain rows, not `is_goal` (`src/components/plan/constellation/ConstellationPage.tsx:352-360`). So are the iPhone's own (`R/Services/Planning/PlanWriter.swift:201-226`), and `CLAUDE.md` asks for it ("No goal/task split above the week"). The live guards would refuse D3's columns on plain rows: `supports_goal_task_id` needs an `is_goal` month row (`supabase/migrations/2026-09-24_goal_supports_goal.sql:67-68`) and `goal_task_id` must point at an `is_goal` row (`supabase/migrations/2026-09-27_goal_link_visible.sql:53-61`).
- `source_id` and `goal_id` are plain foreign keys, `ON DELETE SET NULL`, with no guard trigger (`supabase/migrations/2026-07-15_task_lineage.sql:20-23`); `tasks.area_id` and `goals.area_id` likewise (`supabase/migrations/20261101130000_guided_planning.sql:31`, `:41-43`). So the one thing the server can refuse is a child that arrives before its parent. `source_id` is live: the web names it on every task insert (`src/hooks/useSupabaseTasks.ts:992`).
- A life area is a `goal_areas` row `{user_id, name, context, sort_order}`, `sort_order` one more than the person's highest (`src/hooks/useLifeAreas.ts:58-61`).

**So the walk writes:** year goal = `goals` row with `area_id`. Season goal = plain task, bucket `quarter`, `season_start`, `goal_id` → the year goal. Month goal = plain task, bucket `month`, `month_start`, `source_id` → the season goal, `goal_id` copied from it. Week task = a task on a day (or on the week), `source_id` → the month goal, `goal_id` copied. First thing today = a `TaskFocus` row. `is_goal`, `goal_task_id` and `supports_goal_task_id` are never sent.

## File map

- `R/Models/GoalArea.swift`: the synced `goal_areas` model.
- `R/Walk/Core/`: `WalkTypes.swift` (levels, items, areas, compass points, actions), `WalkPeriods.swift` (which year, season, month, week), `WalkWords.swift` (tidying, pulling out a day), `WalkClassifier.swift` (keyword lists, placement), `WalkState.swift` + `WalkState+Plant.swift` + `WalkState+Orb.swift` (state, events, effects, the reducer), `WalkCopy.swift` (every string, the compass point sets), `WalkOrb.swift` (orb geometry), `WalkArt.swift` + `WalkLayout.swift` (art data; state → camera, labels, posts, banners), `WalkPosition.swift` (saved position, restore rule, when the walk appears).
- `R/Walk/Data/`: `WalkWriter.swift` (rows and links), `WalkLoad.swift` (reading the plan back), `WalkEnding.swift` (the ending's rows).
- `R/Walk/`: `WalkModel.swift` (the one observable object), `WalkSound.swift`; `Views/WalkView.swift`, `WalkSceneView.swift`, `WalkBannerViews.swift`, `WalkOrbView.swift`, `WalkHintRow.swift`, `WalkEndingSheet.swift` (drawing only).

---

## Stage A: data (this touches sync for every user)

### Task 1: Sync: life areas, `areaId`, `sourceId`, and links that are sent only when the phone set them
**Files:**
- Create: `R/Models/GoalArea.swift`
- Modify: `R/Models/SymphonyTask.swift` (after `goalId`, :111), `R/Models/Planning.swift` (`Goal`, :96-130), `R/Services/SyncEngine/RowMapper.swift` (`toModel` :10-45, `taskFromRow` :85-87, `goalFromRow` :327-342), `R/Services/SyncEngine/SyncEngine.swift` (`syncedTables` :23-39, the flag reset :154-165, `performInitialSync` :213, `serializeRow` :419-460, `taskRow` :485-562, `goalRow` :720-734, the `HasUUID` list :939-953), `R/App/SymphonyApp.swift` (`modelTypes`), `R/App/DemoMode.swift` (`types`, :26-30)
- Test: `SymphonyOSTests/SyncSerializationTests.swift`, `SymphonyOSTests/AccountDeletionTests.swift` (`modelTypesIsComplete`, `wipeEmptiesEveryModel`)

**Interfaces:**
- Produces (every new stored property has an inline default, so an existing install migrates its local store: `SymphonyTask.swift:88-91`):
  ```swift
  @Model final class GoalArea {            // server table goal_areas
      @Attribute(.unique) var id: UUID
      var userId: UUID; var name: String; var sortOrder: Int
      var context: String?                 // "work" | "family" | "personal" | nil
      var createdAt: Date; var syncStatus: SyncStatus; var lastSyncedAt: Date?
      init(id: UUID = UUID(), userId: UUID, name: String, sortOrder: Int = 0, context: String? = nil, syncStatus: SyncStatus = .pending)
  }
  // SymphonyTask:  var areaId: UUID? = nil;  var sourceId: UUID? = nil;  var linksDirty: Bool = false
  // Goal:          var areaId: UUID? = nil;  var areaDirty: Bool = false
  ```

**The rule, and why it is safe.** `taskRow` adds `goal_id`, `source_id` and `area_id` **only when `linksDirty`**, and then all three, nulls included (as `placementDirty` does for the period stamps). `goalRow` adds `area_id` only when `areaDirty`. Both flags are cleared where the other dirty flags are, after a successful push. A row pulled from the server arrives with both flags false, so the phone sends back none of its links: an edit on the phone can never overwrite or null a link made on the web, including one that changed on the web between the pull and the push. This is the pattern `scopeDirty`, `placementDirty` and `sortOrderDirty` already follow. Nothing sends `is_goal`, `goal_task_id` or `supports_goal_task_id`.

- [ ] **Step 1: Write the failing tests** in `SyncSerializationTests.swift` (in-memory container of `SymphonyTask`, `Goal`, `GoalArea`, `PendingChange`; rows through `RowMapper.toModel` and `SyncEngine.serializeRow`):
  - `aTaskPulledWithLinksSendsNoneOfThemBack`: map a server row carrying `goal_id`, `source_id`, `area_id`, `goal_task_id` and `"is_goal": true`. The model has `goalId`, `sourceId`, `areaId` set and `linksDirty == false`; its serialized row, with `forInsert` false and true, has none of the keys `goal_id`, `source_id`, `area_id`, `goal_task_id`, `supports_goal_task_id`, `is_goal`.
  - `aLinkedTaskSendsExactlyTheThreeLinkColumns`: `linksDirty = true`, `goalId = g`, `sourceId = nil`, `areaId = a` serializes `goal_id == .string(g.uuidString)`, `source_id == .null`, `area_id == .string(a.uuidString)`, and still none of `is_goal`, `goal_task_id`, `supports_goal_task_id`.
  - `aGoalSendsItsAreaOnlyWhenThePhoneSetIt`: a goal mapped from a row with `area_id` has `areaId` set and serializes without `area_id` (insert and update); with `areaDirty = true` it serializes it.
  - `aGoalAreaRowHasTheLiveColumns`: `Set(row.keys) == ["id", "user_id", "name", "sort_order", "context", "created_at"]`.
  - `goalAreasMapFromRows`: a full row maps every field; a row with no `name` maps to nil.
  And in `AccountDeletionTests.swift`: `"GoalArea"` joins the expected set in `modelTypesIsComplete`; the wipe test also inserts a `GoalArea` and finds none afterwards.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/SyncSerializationTests`. Expected: FAIL to compile (`GoalArea` missing).
- [ ] **Step 3: Implement.** The model and fields. `RowMapper`: `case is GoalArea.Type`, `goalAreaFromRow`, the three reads. `SyncEngine`: `("goal_areas", GoalArea.self)` in `syncedTables` before `tasks`; `await pullTable("goal_areas", as: GoalArea.self, userId: userId)` before the tasks pull; `case "goal_areas"` in `serializeRow`; `private static func goalAreaRow(_ a: GoalArea) -> [String: AnyJSON]`; the two conditional column blocks; `task.linksDirty = false` beside the other task flags and a matching block for `goals` clearing `areaDirty`; `extension GoalArea: HasUUID {}`. Add `GoalArea.self` to `SymphonyApp.modelTypes` and `DemoMode.types`. The pull also brings a partner's Family areas (readable by RLS); nothing on the phone edits an area whose `userId` is not the signed-in person.
- [ ] **Step 4: Run** `SyncSerializationTests`, `AccountDeletionTests` and `PlanWriterTests` (its `newGoalPushesWebColumnsWithDerivedScope` must pass unchanged: an ordinary new goal still sends no `area_id`). Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Sync: life areas, and goal links that go up only when the phone set them"`

### Task 2: Sync: parents go up before children, and the app knows when the first pull has finished
**Files:**
- Modify: `R/Services/SyncEngine/SyncEngine.swift` (`start` :48-62, `resync` :75-80, `pushPendingChanges` :135-189, `performInitialSync` :193-227, `pullTable` :231-307), `R/App/AppState.swift`, `R/App/ContentView.swift` (the foreground resync :38-41, `startSync` :55-76, `stopSync` :78-86)
- Test: `SymphonyOSTests/SyncOrderTests.swift` (new)

**Interfaces:**
- Produces:
  ```swift
  extension SyncEngine {
      /// The rows this one points at that must be on the server first: a task's goalId, sourceId, areaId; a goal's areaId.
      static func parentIds(table: String, id: UUID, context: ModelContext) -> [UUID]
      static func mustWait(parents: [UUID], unpushedInserts: Set<UUID>) -> Bool
  }
  @discardableResult func start(userId: UUID) async -> Bool     // true when the first pull really ran
  @discardableResult func resync() async -> Bool
  // AppState:  var initialSyncFinished = false
  ```

**Why.** The queue is pushed oldest first (`SyncEngine.swift:141-147`), so a parent queued before its child goes first. But each change is pushed on its own: when the parent's push fails, the child is still tried, the foreign key refuses it, and an update that fails ten times is dropped (`:179`), which would silently lose a link. So a change whose row points at a parent with an insert still waiting is skipped for this pass, without counting an attempt.

- [ ] **Step 1: Write the failing tests:**
  - `aTaskNamesItsGoalItsSourceAndItsArea`: `parentIds(table: "tasks", …)` is `[goalId, sourceId, areaId]` without the nils. `aGoalNamesItsArea`. `otherTablesNameNoParents` (`"task_commitments"` → `[]`).
  - `aChildWaitsForItsUnpushedParent`: `mustWait(parents: [g], unpushedInserts: [g])` is true; with `unpushedInserts: []` false; with `parents: []` false.
  - `theQueueKeepsParentsFirst`: `PlanWriter.createGoal` then `createPeriodTask`; the pending changes sorted by `createdAt` list the `goals` insert before the `tasks` insert.
  - `aFreshAppHasNotSynced`: `AppState().initialSyncFinished == false`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/SyncOrderTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement the order.** In `pushPendingChanges`, build `unpushedInserts` from the fetched changes of type `insert`; before each non-delete change, `continue` when `mustWait(parents: parentIds(…), unpushedInserts:)`; remove a record id from the set when its insert succeeds.
- [ ] **Step 4: Implement the signal.** `pullTable` returns whether its fetch and saves succeeded. `performInitialSync` returns true only when it was online and the `households`, `goal_areas`, `tasks` and `goals` pulls all succeeded; `start` and `resync` return that. In `ContentView`: after `await engine.start(userId:)` and after the foreground `resync()`, set `appState.initialSyncFinished = true` on the main actor when the result is true (a failed resync never sets it back); in demo mode (`startSync`'s early return) set it true; `stopSync()` sets it false.
- [ ] **Step 5: Run** `SyncOrderTests`, then the whole unit suite (`-only-testing:SymphonyOSTests`). Expected: PASS, no existing test changed.
- [ ] **Step 6: Commit.** `git commit -m "Sync: a child waits for its parent, and the first pull says when it is done"`

---

## Stage B: the pure core

### Task 3: Types, and which periods the walk files into
**Files:**
- Create: `R/Walk/Core/WalkTypes.swift`, `R/Walk/Core/WalkPeriods.swift`
- Test: `SymphonyOSTests/WalkPeriodsTests.swift`

**Interfaces:**
- Consumes: `PlanCalendar` (`R/Services/Planning/PlanCalendar.swift`), `SeasonBoundary`, `Horizon`.
- Produces:
  ```swift
  enum WalkLevel: Int, Codable, CaseIterable { case year = 1, season, month, week, today }
  enum WalkDepth: String, Codable { case quick, full }
  enum WalkStatus: String, Codable { case inProgress, finished, left }
  struct WalkArea: Codable, Equatable, Identifiable { let id: UUID; var name: String }
  struct WalkItem: Equatable, Identifiable {
      let id: UUID; let level: WalkLevel              // year…week; a first thing is a week item
      var title: String; var areaId: UUID?; var parentId: UUID?; var day: Date?; var done = false
      var mine = true                                  // planted by this walk: may be moved or pulled up
  }
  struct WalkPostKey: Hashable { let level: WalkLevel; let column: UUID? }      // nil = the unlabeled post
  enum CompassPoint: String, CaseIterable { case n, ne, e, se, s, sw, w, nw; var degrees: CGFloat { get } }  // -90, -45, 0, 45, 90, 135, 180, -135
  enum WalkAction: Equatable { case quick, full, notNow, back, next, type, examples, nudge, undo, calendar, startThere }
  enum WalkSoundName: String, CaseIterable { case bag, poles, unfurl, plant, tick }
  struct WalkPeriods: Equatable {
      let today: Date; let year: Int
      let season: PlanCalendar.Season; let seasonIsCurrent: Bool
      let monthStart: Date; let monthIsCurrent: Bool; let weekStart: Date
      static func pick(now: Date, seasons: [SeasonBoundary]? = nil, weekStartsOn: Int = PlanCalendar.weekStartsOn) -> WalkPeriods
      var seasonWord: String { get }; var monthName: String { get }     // "winter", "November"
      var monthLastDay: Int { get }; var weekLastDay: Date { get }      // 30
      static func ordinal(_ n: Int) -> String                           // "30th"
      func pageDate(for horizon: Horizon) -> Date                       // a day inside the period the walk files into
  }
  ```

**The rule** (spec "Periods near a boundary", D6). `year`: in November or December the next calendar year, else this one. Season: the one containing today, unless fewer than 21 days of it are left (today counted, up to its exclusive end), then the next (`PlanCalendar.season(containing: current.end, …)`). Month: this month unless fewer than 7 days are left (today counted), then next month. Week: the week containing today. Names come from `en_US` formatters so tests are stable.

- [ ] **Step 1: Write the failing tests** (a `day(y, m, d)` helper as in `PlanningTests.swift:11`; default seasons and Sunday weeks unless said):
  - `midNovemberLooksToNextYearAndWinter`: 2026-11-13 → `year == 2027`; season "Winter", start 2026-12-01, `lastDay` 2027-02-28, `seasonIsCurrent == false`, `seasonWord == "winter"`; `monthName == "November"`, `monthIsCurrent`, `monthLastDay == 30`; `weekStart` 2026-11-08, `weekLastDay` 2026-11-14.
  - `exactlyThreeWeeksLeftStaysInTheSeason`: 2026-11-10 → "Fall", current; 2026-11-11 → "Winter".
  - `aWeekLeftStaysInTheMonth`: 2026-11-24 → November; 2026-11-25 → December, `monthIsCurrent == false`, `monthLastDay == 31`.
  - `octoberEndPlansNovemberButThisYear`: 2026-10-31 → `year == 2026`, "Fall" current, `monthName == "November"`.
  - `yearEnd`: 2026-12-28 → `year == 2027`, "Winter" current, `monthName == "January"`. `midsummer`: 2026-06-15 → 2026, "Summer", "June", all current.
  - `householdSeasonsAndMondayWeeks`: with boundaries Spring 3/20, Summer 6/21, Autumn 9/22, Winter 12/21, 2026-11-13 → `seasonWord == "autumn"`, current; 2026-12-05 → "winter", start 2026-12-21. With `weekStartsOn: 1`, 2026-11-13 → `weekStart` 2026-11-09, `weekLastDay` 2026-11-15.
  - `ordinals`: 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 28th 30th 31st.
  - `pagesOpenOnTheFiledPeriod`: on 2026-11-13, `pageDate(for: .year)` is in 2027, `.season` is 2026-12-01, `.month` is in November 2026, `.week` and `.today` are today.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkPeriodsTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: levels, items, and which year, season, month and week it files into"`

### Task 4: Words: tidy what was said and pull out a day
**Files:**
- Create: `R/Walk/Core/WalkWords.swift`
- Test: `SymphonyOSTests/WalkWordsTests.swift`

**Interfaces:**
- Consumes: `WalkLevel`; `CaptureParser.parse` (`R/Views/Capture/QuickCaptureBar.swift:114-145`).
- Produces:
  ```swift
  enum WalkWords {
      static let fillers: Set<String> = ["um", "uh", "uhm", "er", "erm", "hmm"]
      static let softFillers: Set<String> = ["so", "okay", "ok", "well", "like"]
      static let maxTitle = 200
      struct Said: Equatable { let title: String; let day: Date? }
      static func tidy(_ raw: String) -> String?
      static func said(_ raw: String, level: WalkLevel, today: Date, calendar: Calendar = PlanCalendar.calendar,
                       detect: (String) -> Date? = WalkWords.detectedDate) -> Said?
      static func detectedDate(_ tail: String) -> Date?
      static func tag(for day: Date, today: Date, calendar: Calendar = PlanCalendar.calendar) -> String
  }
  ```

**The rules** (spec: "tidies spoken filler and pulls out a day … it doesn't rewrite"; D8).
- `tidy`: trim; while the first word (ignoring a comma or "…" after it) is in `fillers`, drop it; a first word in `softFillers` is dropped only when a comma follows it or the next word is itself a filler, because "Like myself again" and "Well water tested" are real titles; drop one trailing full stop; capitalise the first letter; if longer than `maxTitle`, cut at the last space before it (at `maxTitle` when there is none). Returns nil when no letter or digit is left. Nothing else changes.
- `said`: for every level, `title = tidy(…)`. A day is looked for only on `.week` and `.today`, and only at the end: (a) if there is a comma, the text after the last comma; otherwise (b) the last one, two or three words. That tail is a day when, after an optional leading `on`, `this` or `by`, it is exactly `today`, `tonight`, `tomorrow`, `weekend`, `the weekend`, or a weekday name; or (comma tail only) when `detect(tail)` returns a date. `today` / `tonight` → today; `tomorrow` → the next day; a weekday → its next date on or after today (today's own name means today); the weekend → today on a Saturday or Sunday, else the coming Saturday. The day leaves the title, with the comma and any `on` / `this` / `by` before it. If that leaves nothing, the whole text is the title and the day is kept.
- `detectedDate` is `CaptureParser.parse(tail)`: its date when the parser's title equals the tail (the whole tail was the date), else nil.
- `tag`: "Today", "Tomorrow", a weekday name within the next six days, else `EEE d` ("Mon 23"). The banner uppercases it.

- [ ] **Step 1: Write the failing tests** (`today` = Friday 2026-11-13; `detect` injected as `{ _ in nil }` unless said):
  - `fillerGoes`: `tidy("um finish the bathroom.") == "Finish the bathroom"`; `tidy("So, um, feel strong again") == "Feel strong again"`; `tidy("Okay, run a 5K.") == "Run a 5K"`; `tidy("  read more  ") == "Read more"`.
  - `realWordsStay`: `tidy("like myself again") == "Like myself again"`; `tidy("well water tested") == "Well water tested"`; `tidy("so much more reading") == "So much more reading"`; `tidy("What next?") == "What next?"`.
  - `nothingToPlant`: `tidy("")`, `tidy("   ")`, `tidy("um")`, `tidy("uh, um.")`, `tidy("…")` and an emoji-only string are all nil; a title with an emoji among its words is unchanged.
  - `longSpeechIsCutAtAWord`: 60 repetitions of "walk more " give a title of at most 200 characters ending in a whole word; one 260-letter word gives 200 characters.
  - `theDepositToday`: `said("the deposit, today", level: .week, …) == Said(title: "The deposit", day: 2026-11-13)`.
  - `trailingDays`: "Gym on Tuesday" → ("Gym", 2026-11-17); "call the tile shop tomorrow" → ("Call the tile shop", 2026-11-14); "choose the tile, Saturday" → ("Choose the tile", 2026-11-14); "breakfast out this weekend" → ("Breakfast out", 2026-11-14); "measure the wall on Friday" → ("Measure the wall", 2026-11-13); "ring mum, Monday" → ("Ring mum", 2026-11-16).
  - `aDayInTheMiddleStays`: "Friday night dinner with Sam" → that title, day nil; "plan Saturday breakfast out" → "Plan Saturday breakfast out", nil.
  - `aDayAloneIsATitle`: `said("today", level: .week, …) == Said(title: "Today", day: 2026-11-13)`.
  - `upperLevelsKeepTheirWords`: `said("ship the deck by Friday", level: .month, …)` → title "Ship the deck by Friday", day nil.
  - `aWrittenDateAfterAComma`: with `detect` returning 2026-11-20 for "November 20", "pay the deposit, November 20" → ("Pay the deposit", 2026-11-20); the same words with no comma keep the whole title and no day.
  - `tags`: today → "Today"; +1 → "Tomorrow"; 2026-11-17 → "Tuesday"; 2026-11-23 → "Mon 23".
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkWordsTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement** `WalkWords`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: tidy spoken words and pull a day off the end"`

### Task 5: Placement by words
**Files:**
- Create: `R/Walk/Core/WalkClassifier.swift`
- Test: `SymphonyOSTests/WalkClassifierTests.swift`

**Interfaces:**
- Consumes: `WalkArea`.
- Produces:
  ```swift
  enum WalkClassifier {
      static let defaults = ["Health", "Home", "People", "Work", "Money", "Fun"]
      static let keywords: [String: Set<String>]
      static func score(_ text: String, areaName: String) -> Int
      enum Placement: Equatable { case area(UUID, moved: Bool), unlabeled }
      static func place(_ text: String, kept: [WalkArea], focus: UUID?) -> Placement
  }
  ```

**The lists** (everyday words; no word is in two lists):
- Health: health, healthy, fit, fitness, strong, stronger, strength, run, running, 5k, marathon, gym, lift, workout, exercise, yoga, swim, sleep, weight, doctor, dentist, physio, meditate, sober, steps
- Home: home, house, bathroom, kitchen, bedroom, garage, garden, yard, roof, renovate, renovation, repair, declutter, clean, tidy, furniture, plumber, tile, basement, attic, fence, deck
- People: people, family, friend, friends, kids, children, son, daughter, mom, mum, dad, parents, wife, husband, partner, marriage, together, neighbour, neighbor, brother, sister, grandma, grandpa
- Work: work, job, career, boss, promotion, client, clients, business, launch, ship, team, office, resume, interview, hire, meeting, deadline, portfolio, colleague, startup
- Money: money, save, saving, savings, budget, debt, pay, loan, mortgage, invest, retirement, income, tax, taxes, bills, spend, spending, fund, afford
- Fun: fun, play, travel, trip, holiday, vacation, hobby, read, book, books, music, guitar, piano, game, games, hike, camp, camping, ski, movie, concert, dance, adventure

**The rule** (D9). Lowercase the text and split it on anything that is not a letter or digit. An area's score is the number of distinct tokens that are in its list or among the words of its own name (three letters or more); an area the person named has only its own name's words. The text clearly belongs to a kept area when that area scores at least 1 and strictly more than every other kept area: then `place` returns `.area(thatArea, moved: focus != nil && focus != thatArea)`. Otherwise it returns `.area(focus, moved: false)` when a peak is focused, else `.unlabeled`. An area that is not kept is never scored and never returned.

- [ ] **Step 1: Write the failing tests** (kept = Health, Home, People unless said):
  - `listsAreDisjointAndSized`: every list has 15 to 25 words and contains its area's lowercased name; no word appears in two lists.
  - `itGoesWhereItSays`: "Finish the bathroom" → Home; "Feel strong again" → Health; "More slow weekends together" → People; "Run a 5K" → Health; all `moved: false` with no focus.
  - `aClearAreaBeatsTheFocusedPeak`: focus Health, "Finish the bathroom" → `.area(home, moved: true)`.
  - `theFocusedPeakCatchesTheRest`: focus Health, "Learn the cello" → `.area(health, moved: false)`; with no focus → `.unlabeled`.
  - `aTieIsNotClear`: "Run to the garage" (one Health word, one Home word), no focus → `.unlabeled`.
  - `anAreaNotKeptIsNeverChosen`: kept = Health only, "Pay off the car" → `.unlabeled`; with focus Health → Health, `moved: false`.
  - `aNamedAreaMatchesItsOwnName`: kept adds "Faith"; "Go deeper in my faith" → Faith. `wordsNotPieces`: "Workshop for the choir" does not score for Work.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkClassifierTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: a goal goes to the area its words name"`

### Task 6: Writing rows and links
**Files:**
- Create: `R/Walk/Data/WalkWriter.swift`
- Modify: `R/Services/Planning/PlanWriter.swift` (`planTask` :126-136, `createPeriodTask` :207-226, `createGoal` :522-536: one defaulted parameter each, nothing changes for existing callers)
- Test: `SymphonyOSTests/WalkWriterTests.swift`

**Interfaces:**
- Consumes: Task 1's fields; `WalkItem`, `WalkArea`, `WalkPeriods`; `PlanWriter`, `TaskViewModel.toggleComplete`, `ModelContext.queueSync` / `queueKeyedDelete` (`R/Models/PendingChange.swift:39-60`).
- Produces:
  ```swift
  // PlanWriter, new defaulted parameters:
  //   planTask(_ task: SymphonyTask, on date: Date, focusToday: Bool = true) -> Snapshot
  //   createPeriodTask(title: String, level: String, periodStart: Date, context lifeArea: String? = nil, id: UUID = UUID()) -> SymphonyTask
  //   createGoal(name: String, notes: String?, context: String?, year: Int, id: UUID = UUID()) -> Goal
  struct WalkWriter {
      init(context: ModelContext, userId: UUID, periods: WalkPeriods)
      static func links(level: WalkLevel, parentId: UUID?, parentGoalId: UUID?) -> (goalId: UUID?, sourceId: UUID?)
      func ensureArea(_ area: WalkArea)
      func dropAreaIfUnused(_ id: UUID)
      func create(_ item: WalkItem, parent: WalkItem?)
      func remove(_ id: UUID, level: WalkLevel)        // keeps what `restore` needs, in memory, by id
      func restore(_ id: UUID)
      func setArea(_ id: UUID, level: WalkLevel, to areaId: UUID?)
      func setFirstThing(_ id: UUID?, previous: UUID?)
      func setDone(_ id: UUID, _ done: Bool)
  }
  ```
  A struct over one small reference box (the removed-row snapshots and the ids of the areas it made), so copies share them.

**What each call writes.**
- `links`: year → (nil, nil). Season → (goalId: parentId, nil). Month and week → (goalId: parentGoalId, sourceId: parentId).
- `ensureArea`: nothing if a `GoalArea` with that id exists; else insert one with `context = "personal"` and `sortOrder` one more than the highest among this person's areas (0 when none), queue its insert, and remember that this walk made it. Always called before the row that points at it, so the area is queued first. `dropAreaIfUnused` removes an area only when this walk made it and no goal or task names it.
- `create`: year → `PlanWriter.createGoal(name:, notes: nil, context: "personal", year: periods.year, id: item.id)`, then `areaId` and `areaDirty = true`. Season → `createPeriodTask(level: "season", periodStart: periods.season.start, context: "personal", id:)`. Month → `level: "month", periodStart: periods.monthStart`. Week → `level: "week", periodStart: PlanCalendar.weekStart(item.day ?? periods.today)`, then, when it has a day, `planTask(task, on: day, focusToday: false)`: a week task said for today is on today but is not the first thing. On every task: `goalId` / `sourceId` from `links` (the parent's goal id read from the parent's row), `areaId`, `linksDirty = true`.
- `remove`: when the row's own insert is still queued, delete every queued change for it and for its commitments and focus rows, and the local rows, so nothing reaches the server; otherwise delete locally and queue a delete (as `TaskViewModel.deleteTask` does; the same for a `Goal`). Rows that pointed at it (`goalId` or `sourceId`) lose that link locally with `linksDirty = true` and a queued update, mirroring the server's `SET NULL`. The snapshot holds the row's fields, its commitment periods, whether it was focused today, and the ids it unlinked.
- `restore`: re-inserts the row with the same id (queued as an insert), its commitments and focus, and puts the unlinked children's links back.
- `setFirstThing`: removes today's `TaskFocus` for `previous` (through `queueKeyedDelete`, as `PlanWriter.unfocus` does); for `id`, if the task is not on today `planTask(task, on: periods.today, focusToday: true)`, else insert today's `TaskFocus` and queue it. `setDone` goes through `TaskViewModel.toggleComplete`.

- [ ] **Step 1: Write the failing tests** (in-memory container: `SymphonyTask`, `Goal`, `GoalArea`, `TaskCommitment`, `TaskFocus`, `PendingChange`, `Routine`, `ActionableInstance`, `FamilyMember`; periods for 2026-11-13):
  - `linkPlan`: the four cases of `links` above.
  - `aYearGoalIsAPersonalGoalForTheYearAhead`: `year == 2027`, `context == "personal"`, `scope == "individual"`, `areaId` set, `areaDirty`; its serialized insert row has `area_id`.
  - `theChainLinksUp`: `ensureArea`, then year Y, season S under Y, month M under S, week W under M with day today. S: bucket "quarter", `seasonStart` 2026-12-01, `goalId == Y.id`, `sourceId == nil`, `isGoal == false`, one open "season" commitment. M: bucket "month", `monthStart` 2026-11-01, `sourceId == S.id`, `goalId == Y.id`. W: bucket "timed", `scheduledFor` today, `isAllDay`, `sourceId == M.id`, `goalId == Y.id`, a "week" commitment for 2026-11-08, and **no** `TaskFocus`. Every task has `context == "personal"` and `linksDirty`. The pending changes in `createdAt` order have `goal_areas` before `goals` before S's `tasks` insert before M's before W's.
  - `aWeekTaskWithNoDayIsOnTheWeek`: bucket "week", `weekStart` 2026-11-08, `scheduledFor == nil`. `aDayNextWeekGoesToThatWeek`: day 2026-11-16 → `scheduledFor` that day, `weekStart` 2026-11-15.
  - `pullingUpAnUnsentRowLeavesNothingBehind`: create S then `remove` → no `SymphonyTask`, no `TaskCommitment`, and no `PendingChange` for either. `pullingUpASentRowQueuesADelete`: empty the queue after creating S (as if pushed), `remove` → one `tasks` delete queued.
  - `pullingUpAParentUnlinksItsChildrenAndUndoRelinksThem`: remove S with M under it → `M.sourceId == nil`, `M.linksDirty`; `restore(S.id)` → S exists with the same id and title, `M.sourceId == S.id`.
  - `anAreaIsMadeOnceAndInOrder`: `ensureArea` twice makes one row; a second area gets `sortOrder` 1; `dropAreaIfUnused` removes an unused area it made and leaves one that a goal names.
  - `anAreaItDidNotMakeIsNeverDropped`: a `GoalArea` already in the store, unused, survives `ensureArea` + `dropAreaIfUnused` with its id.
  - `movingSetsTheAreaAndMarksItToSend`: `setArea` on a goal sets `areaDirty`, on a task `linksDirty`, each with one queued change.
  - `firstThingMovesTheMark`: `setFirstThing(W.id, previous: nil)` → one `TaskFocus` today; `setFirstThing(W2.id, previous: W.id)` → the only focus today is W2's, and W is still dated today.
  - `existingCallersAreUnchanged`: `planTask(t, on: today)` with no third argument still focuses.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkWriterTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement** the three `PlanWriter` parameters, then `WalkWriter`.
- [ ] **Step 4: Run** `WalkWriterTests`, `PlanWriterTests` and `WriteLineTests`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: every flag is a real row, linked up the chain the way the web links them"`

### Task 7: Reading the plan back, and the ending's rows
**Files:**
- Create: `R/Walk/Data/WalkLoad.swift`, `R/Walk/Data/WalkEnding.swift`
- Test: `SymphonyOSTests/WalkLoadTests.swift`

**Interfaces:**
- Consumes: `WalkItem`, `WalkArea`, `WalkPeriods`, `WalkClassifier.defaults`, the models.
- Produces:
  ```swift
  enum WalkLoad {
      static let maxAreas = 8
      static func areas(_ rows: [GoalArea], me: UUID, newId: () -> UUID = UUID.init) -> [WalkArea]
      static func items(goals: [Goal], tasks: [SymphonyTask], periods: WalkPeriods, me: UUID, planted: Set<UUID>) -> [WalkItem]
  }
  enum WalkEnding {
      struct Row: Equatable, Identifiable { let id: UUID; let title: String; let forGoal: String?; let done: Bool; let first: Bool }
      static func rows(tasks: [SymphonyTask], goals: [Goal], today: Date, me: UUID, firstThing: UUID?) -> [Row]
      static func forGoal(_ task: SymphonyTask, tasks: [SymphonyTask], goals: [Goal]) -> String?
      static func nextToWalk(_ items: [WalkItem]) -> WalkItem?
  }
  ```

**The rules.**
- `areas`: the six defaults in order, then this person's other areas by `sortOrder`, eight at most. A label takes the id of an existing row of this person's with the same name, compared without case, whose `context` is "personal" or nil; otherwise a new id. A partner's areas and Work or Family areas are never offered.
- `items`: only rows where `userId == me`, `context` is "personal" or nil, and (tasks) `dismissedAt == nil` and `parentTaskId == nil`. Year: goals with `year == periods.year` and `status == "active"`, by `sortOrder`. Season: bucket "quarter" with `seasonStart` on `periods.season.start`. Month: bucket "month" with `monthStart` on `periods.monthStart`. Week: tasks in the walk's week (`weekStart` on `periods.weekStart`, or dated inside it) that are in `planted` or whose `sourceId` is a month item shown; the week's other to-dos are not the walk's to show. `parentId` is `goalId` for a season item and `sourceId ?? goalTaskId` for month and week (the web's reading order, `journalGroups.ts:33`), kept only when that parent is among the items. `mine` is `planted.contains(id)`; `day` is the task's date; `done` its `completed`.
- `forGoal`: the task's own `goalId` names a goal → that goal's name. Otherwise climb `sourceId ?? goalTaskId`, at most four steps, until a row whose `goalId` resolves; failing that, the title of the highest row reached; nil when the task has no parent.
- `rows`: this person's tasks dated today (not dismissed, no parent task), the first thing first, then by `createdAt`. `nextToWalk`: the first year item with no season item whose `parentId` is it.

- [ ] **Step 1: Write the failing tests:**
  - `sixDefaultsThenMyOwn`: no rows → the six names in order with distinct ids; rows "Faith" and "Learning" of mine follow; a ninth label is left out.
  - `anExistingAreaIsReusedByName`: my personal row "health" gives the "Health" label that row's id; my row "Work" with `context == "work"` does not (a new id); a partner's "Home" does not.
  - `onlyPlantedRowsAreMine`: a personal year goal for 2027 not in `planted` loads with `mine == false`; one in `planted` with `mine == true`; a goal with `context == "family"`, an archived goal, a 2026 goal and another person's goal do not load.
  - `eachLevelComesFromItsPeriod`: a "quarter" task stamped 2026-12-01 loads as season and one stamped 2026-09-01 does not; a month task for November loads; a week task loads only when planted or linked to a shown month item; a let-go task never loads.
  - `parentsResolveOrAreNil`: season `parentId == goalId`; month reads `sourceId`, then `goalTaskId`; a link to a row that is not shown gives nil.
  - `forWalksUp`: week → month → season by `sourceId` alone, the season naming year goal "Feel strong again" → "Feel strong again"; a chain that ends at a season item with no year goal gives that item's title; an unlinked task gives nil; a row that links to itself gives nil and does not loop.
  - `todaysRowsFirstThingFirst`: three tasks today, the marked one first; another person's task and one dated tomorrow are absent.
  - `theNextGoalWithNothingUnderIt`: of three year items where the first has a season item, the second is returned; nil when all have one.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkLoadTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: read the plan back, and say what each of today's tasks is for"`

### Task 8: The state and the steps
**Files:**
- Create: `R/Walk/Core/WalkState.swift`
- Test: `SymphonyOSTests/WalkStepsTests.swift`

**Interfaces:**
- Consumes: Task 3's types.
- Produces:
  ```swift
  struct WalkEnv { var periods: WalkPeriods; var now: Date; var newId: () -> UUID = UUID.init; var canAskCalendar = false }
  struct WalkState: Equatable {
      var step = 0; var ground = false       // 0 Welcome, 1 Year, 2 Season, 3 Month, 4 Week, 5 Today, 6 Look back up
      var depth: WalkDepth = .quick
      var areas: [WalkArea] = []; var kept: [UUID] = []     // ground labels in order; kept ids in the order kept
      var items: [WalkItem] = []             // in planting order
      var focusArea: UUID?
      var focus: [WalkLevel: UUID] = [:]     // a step's level → the focused item one level up
      var tour: [UUID] = []                  // whole-year stops still ahead on this step
      var firstThing: UUID?; var lastPlanted: [WalkLevel: UUID] = [:]
      var examplesOn: Set<Int> = []; var selected: UUID?; var expanded: WalkPostKey?
      var orb: Orb = .idle; var typing: String?
      var note: String?; var undoShowing = false; var undo: [WalkUndoEntry] = []
      var sheetOpen = false; var calendarOffer = false
      enum Orb: Equatable { case idle, holding(hover: CompassPoint?), open, speaking(live: String) }
      var level: WalkLevel? { get }          // nil on Welcome and Look back up
      var keptAreas: [WalkArea] { get }      // kept, in `areas` order
      func items(on level: WalkLevel) -> [WalkItem];  func item(_ id: UUID?) -> WalkItem?;  func area(_ id: UUID?) -> WalkArea?
      mutating func apply(_ event: WalkEvent, _ env: WalkEnv) -> [WalkEffect]
      mutating func act(_ action: WalkAction, _ env: WalkEnv) -> [WalkEffect]
  }
  enum WalkEvent: Equatable {
      case orbDown, orbHeld, orbMoved(CGPoint), orbUp(heldMs: Int), orbCancelled
      case heard(String), speechUnavailable, typeChanged(String), typeSubmitted, typeDismissed, point(CompassPoint)
      case areaTapped(UUID), bannerTapped(UUID), stubTapped(WalkPostKey), exampleTapped(String)
      case moveTo(UUID), pullUp, undo, undoExpired, noteExpired, calendarAnswered
      case sheetHandle, rowToggled(UUID), walkAnother, walkAgain, goToToday
  }
  enum WalkTimer: Equatable { case hold, undo, note }
  enum WalkWrite: Equatable {
      case area(WalkArea), dropArea(UUID), create(WalkItem, parent: WalkItem?), remove(UUID, WalkLevel), restore(UUID)
      case setArea(UUID, WalkLevel, UUID?), firstThing(UUID?, previous: UUID?), done(UUID, Bool)
  }
  enum WalkEffect: Equatable {
      case sound(WalkSoundName, afterMs: Int), listen(Bool), write(WalkWrite)
      case timer(WalkTimer, ms: Int?)        // nil cancels
      case askCalendar, save, end(WalkStatus), replay
  }
  enum WalkUndoEntry: Equatable {
      case plant(UUID), nameArea(WalkArea), keep(UUID), unkeep(UUID, index: Int)
      case move(UUID, from: UUID?, keptAdded: UUID?), pullUp(WalkItem, index: Int, wasFirstThing: Bool)
      case firstThing(previous: UUID?, created: UUID?)
  }
  ```
  This task implements `act` for `.quick`, `.full`, `.notNow`, `.back`, `.next`, `.nudge`, `.examples` and `apply` for `.areaTapped`, `.bannerTapped` (focusing a parent), `.noteExpired`. Tasks 10, 11 and 20 add the rest.

**The rules** (contract §2 "Advancing", §3 "Triggers", §7 "Actions"; D14).
- `quick` / `full`: set `depth`, `ground = true`, `kept = []`, `focusArea = nil`, `step = 1`. `notNow` (Welcome only): `[.end(.left)]`.
- Ground: `areaTapped` toggles the area in `kept` (append / remove), pushes `.keep` or `.unkeep`, and emits `.sound(.tick, afterMs: 0)`, `.timer(.undo, ms: 7000)`, `.save`. No row is written for a kept area until something is planted on it.
- `next` on ground: `ground = false`. Whole year: `focusArea = kept.first`, `tour` = the rest of `kept`. Quick: `focusArea = nil`.
- `next` with a non-empty `tour`: take its first stop; on Year it becomes `focusArea`, on Season `focus[.season]`.
- `next` otherwise: `step = min(6, step + 1)`, clearing `focusArea`, `selected`, `expanded`, `undoShowing`, `typing`, and setting `orb = .idle`, `sheetOpen = false`. Entering Season in a whole-year walk: `tour` = the year items in column order (the order of `areas`, unlabeled last, planting order inside a column); the first becomes `focus[.season]`. Entering Season, Month, Week or Today in a quick walk with no focus remembered for that step: focus the item most recently planted on the level above (`lastPlanted`), so one goal is walked down. Entering Today with `env.canAskCalendar`: `calendarOffer = true`.
- `back`: Year → ground (`focusArea = nil`, `tour = []`); ground → Welcome; otherwise `step - 1`. Focus per step is remembered; a tour starts again when its step is entered again.
- `areaTapped` on Year (not ground), for a kept area only: toggles `focusArea`. On other steps it does nothing.
- `bannerTapped` on an item one level above the step's level: toggles `focus[level]`.
- `nudge`: Year → the next kept area after `focusArea` in `kept` order, starting at the first, wrapping. Steps 2 to 5 → the next item of the level above: nil → first → … → last → first.
- `examples`: toggles `step` in `examplesOn`; ignored on Today and on ground.
- Every change of step, depth, focus or kept emits `.save`.

- [ ] **Step 1: Write the failing tests** (a fixture with three kept areas and the mockup's script as items, `Walk.dc.html:230-234`):
  - `quickStartOpensTheGround`; `notNowLeaves` (`[.end(.left)]`).
  - `keepingIsATapAndCanBeTakenBack`: tap Health → kept, effects contain `.sound(.tick, afterMs: 0)`; tap again → not kept; the undo stack has two entries.
  - `quickWalksOneGoalDown`: with `lastPlanted[.year]` "Feel strong again", `next` from Year → step 2 with `focus[.season]` that goal; with nothing planted on Year, no focus.
  - `wholeYearVisitsEachArea`: kept [Home, Health, People] in that order: leaving ground focuses Home with `tour == [Health, People]`; `next` → Health; `next` → People; `next` → step 2.
  - `wholeYearWalksEachYearGoalThroughTheSeason`: arriving at Season focuses the first year item in column order and `tour` holds the others; `next` moves to each; after the last, step 3.
  - `backRemembersFocus`: focus a parent on Month, `back`, `next` → the same focus. `backFromYearReturnsToGround`. `backFromGroundReturnsToWelcome`.
  - `tappingAPeakZoomsAndTappingAgainReleases`; `aPeakNotKeptCannotBeFocused`; `peaksAreInertBelowTheYear`; `tappingAParentFlagFocusesIt`.
  - `nudgeCyclesAreasInKeptOrder`; `nudgeCyclesParents` (nil → first → second → first); `examplesToggleButNotOnToday`.
  - `walkingOnFromTodayLooksBackUp` (step 6, `sheetOpen == false`); `stepsNeverPassSix`; `enteringTodayOffersTheCalendarOnlyWhenAsked`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkStepsTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement** `WalkState.swift`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: the steps, both depths, focus and nudge as one tested state"`

### Task 9: Every string, and what the compass offers
**Files:**
- Create: `R/Walk/Core/WalkCopy.swift`
- Test: `SymphonyOSTests/WalkCopyTests.swift`

**Interfaces:**
- Consumes: `WalkState`, `WalkPeriods`.
- Produces:
  ```swift
  enum WalkCopy {
      static let wordmark = "Symphony"
      static let welcomeTitle = "Let’s start up high and walk down to today."
      static let welcomeSub = "Plant a flag for what matters, then follow it down."
      static func eyebrow(_ s: WalkState, _ p: WalkPeriods) -> String      // question(_:_:) and why(_:_:) have the same shape
      static func hint(_ s: WalkState) -> String
      struct Point: Equatable { let at: CompassPoint; let label: String; let action: WalkAction; let symbol: String }
      static func points(_ s: WalkState) -> [Point]
      static func phrase(for areaName: String) -> String;  static func placed(_ areaName: String) -> String
      static func examples(_ level: WalkLevel) -> [String]
      static func short(_ title: String) -> String                         // at most 40 characters, then "…"
  }
  ```

**The strings.** Period names come from `WalkPeriods`; a title inside a question goes through `short`.

| Step | Eyebrow | Question | Why |
|---|---|---|---|
| Ground | `The year ahead` | `First, your ground. Which parts of life matter most this year?` | `Tap the peaks to keep them. Hold the light to name your own.` |
| Year | `The year ahead` (whole year: `The year ahead · area by area`) | `What would make the year ahead a good one?` | `Something that would feel true twelve months from now. Big or small.` |
| Season | current: `This season · to <MMM d of its last day>`; coming: `<Name> · <MMM d> to <MMM d>` | `And this <seasonWord>? What’s it about?` | `A season is a few months. What is this stretch really for?` |
| Month | `<monthName>` | current: `What’s one thing for the rest of <monthName>?`; coming: `What’s one thing for <monthName>?` | `Small enough to finish by the <ordinal(monthLastDay)>.` |
| Week | `This week · to <EEE d of weekLastDay>` | `What would move that forward this week?` | `Say the day for each: “the deposit, today.”` |
| Today | `<EEEE, d MMMM>` | `What’s the first thing you’ll do today?` | `Just one. The rest of today can wait its turn.` |

- Focused questions: Year with a focused area `What about <phrase>, this year?` (`phrase`: Health → `your health`, Home → `home`, People → `the people in your life`, Work → `work`, Money → `money`, Fun → `fun`, any other name lowercased); Season `For “<t>”, what’s this <seasonWord>’s piece?`; Month `For “<t>”, what’s <monthName>’s piece?`; Week `For “<t>”, what happens this week?`; Today `Start the day with “<t>”?`.
- On Season, Month, Week and Today, when the level above has a flag and nothing is focused, the why line ends with ` Tap one of your flags to focus on it.`
- `placed("Home")` is `That sounded like home, so it went on the Home peak.`
- Examples (contract §9): Year `Run a 5K`, `Read a book a month`, `Pay off the car`; Season `Clear out the garage`, `Get outside every weekend`; Month `Book the plumber`, `Two early nights a week`; Week `Call the tile shop`, `Gym on Tuesday`; Today none.
- `hint`, first match wins: `note` set → the note; `typing != nil` → ``; orb `.holding(hover: some)` → `Let go to choose`; `.holding(hover: nil)` → ``; `.open` → `Tap a point, or tap the light to close`; `.speaking` → `Let go to plant it`; Welcome → `Hold the light to begin`; ground → `Tap the peaks that matter`; Today with a focused week flag that is not the first thing → `Slide down to start there · hold to say something else`; Today with a first thing → `That’s your first thing · slide down to walk on`; the step's level has a flag → `Hold to plant another · slide down to walk on`; else `Hold the light and speak · slide to its edge for more`.
- Notes the reducer sets (Tasks 10, 11, 20): `Nothing to plant yet. Hold and speak, or slide left to type.` / `Speaking isn’t available here, so type it.` / `The ridge is full. Tap a peak to let one go first.` / `See your calendar on Today too`.
- `points`. Welcome: S `Quick start` (.quick, `figure.walk`), E `Plan my whole year` (.full, `mountain.2`), N `Not now` (.notNow, `xmark`). Ground: N `Start` (.back), S `Plant goals` when anything is kept else `Skip` (.next), W `Name your own` (.type). Steps 1 to 5: N `Start` on Year else `Back up` (.back, `arrow.up`); S `Walk on` when the step's level has a flag (on Today: a first thing) else `Skip` (.next, `arrow.down`), except on Today with a focused week flag that is not the first thing, where S is `Start there` (.startThere); W `Type it` (.type, `keyboard`); NE `Nudge me` (.nudge, `sparkle`); E `Examples` / `Hide examples` on steps 1 to 4 (.examples, `flag`), and on Today `Calendar` (.calendar, `calendar`) while `calendarOffer`. On every set but Welcome: NW `Undo` (.undo, `arrow.uturn.backward`) while the undo stack is not empty. Step 6: none.

- [ ] **Step 1: Write the failing tests:** one per table row for 2026-11-13 (Season is the coming one: eyebrow `Winter · Dec 1 to Feb 28`, question `And this winter? What’s it about?`; Month `What’s one thing for the rest of November?`, `Small enough to finish by the 30th.`; Week `This week · to Sat 14`; Today `Friday, 13 November`); the coming-month wording on 2026-11-25 (`What’s one thing for December?`, `…by the 31st.`); the current-season eyebrow on 2026-10-01 (`This season · to Nov 30`); each focused question, including `What about the people in your life, this year?`, a named area `What about creative work, this year?`, and a 70-character title cut to 40 and `…`; the appended why sentence present and absent; `placed`; the example lists; every `hint` line; each `points` set, including `Skip` → `Walk on`, `Start` on Year, no Examples on Today, `Calendar` only while offered, `Undo` only with something to undo, and `Start there`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkCopyTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: the questions, why lines, hints and compass points"`

### Task 10: Planting, examples, undo, move and pull up
**Files:**
- Create: `R/Walk/Core/WalkState+Plant.swift`
- Test: `SymphonyOSTests/WalkPlantTests.swift`

**Interfaces:**
- Consumes: Tasks 4, 5, 8, 9.
- Produces: `extension WalkState { mutating func plant(_ raw: String, _ env: WalkEnv) -> [WalkEffect] }`; `apply` for `.exampleTapped`, `.bannerTapped` (own level), `.stubTapped`, `.moveTo`, `.pullUp`, `.undo`, `.undoExpired`, `.rowToggled`; `act` for `.undo`, `.startThere`.

**The rules** (spec "Where a goal goes…", "Undo and fix"; D9 to D13; contract §6, §9, §10).
- Nothing to plant (`WalkWords.said` is nil): the note `Nothing to plant yet. …` with `.timer(.note, ms: 3200)`; nothing is written.
- On ground the words name an area (tidied, at most 24 characters). A label with that name (without case) is simply kept. Otherwise, with eight labels already, the note `The ridge is full. …`; else append the label and keep it, push `.nameArea`. Effects: `.sound(.plant, afterMs: 0)`, the undo timer, `.save`.
- On Year: `WalkClassifier.place(title, kept: keptAreas, focus: focusArea)` decides the area; `moved: true` sets the note `WalkCopy.placed(name)` for 3200 ms. Effects, in order: `.write(.area(a))` when there is an area, `.write(.create(item, parent: nil))`, `.sound(.plant, afterMs: 0)`, timers, `.save`.
- On Season, Month, Week: the parent is the focused item (`focus[level]`), or none; the item takes the parent's area and is never classified; Week keeps the day `WalkWords.said` pulled out.
- On Today: a new week-level item dated today; with a week flag focused it takes that flag's area and parent. It becomes the first thing: push `.firstThing(previous:, created:)`, effects `.write(.create…)` then `.write(.firstThing(id, previous:))`.
- `startThere` (Today, a focused week flag): that task becomes the first thing: `.write(.firstThing(id, previous:))`, push `.firstThing(previous:, created: nil)`. There is one first thing: marking another moves the mark and leaves the earlier task where it is.
- Every plant sets `lastPlanted[level]` and `undoShowing = true`, emits `.timer(.undo, ms: 7000)`, pushes `.plant(id)` and clears `selected`.
- `exampleTapped(text)`: only while examples are on for this step; planted through the same path as spoken words (so "Gym on Tuesday" becomes "Gym" on Tuesday), with the area of the focused peak or parent and no classification; effects start with `.sound(.poles, afterMs: 0)` and the plant sound comes at 160 ms.
- `bannerTapped` on an item of the step's own level: ignored unless `mine`; else toggles `selected`, `.sound(.tick, afterMs: 0)`, hides the Undo pill. `stubTapped` sets `expanded` (again to close) and makes that column the open one (`lastPlanted[level]` = its newest item).
- `moveTo(area)`: the selected item's area changes; an area not kept is kept; effects `.write(.area)`, `.write(.setArea)`, `.sound(.poles, afterMs: 0)`, `.sound(.plant, afterMs: 140)`; push `.move`; clear `selected`.
- `pullUp`: removes the selected item (`.write(.remove)`, `.sound(.poles, afterMs: 0)`), drops any focus pointing at it and clears `firstThing` if it was that; items that named it as parent stay, with `parentId = nil`; push `.pullUp`.
- `undo` (the pill or the compass point) pops the newest entry and reverses it: `.plant` → remove, then `.write(.dropArea)` for its area; `.nameArea` → remove the label and unkeep; `.keep` / `.unkeep` → the opposite, at its old place; `.move` → the old area back, the area the move kept unkept, `.write(.dropArea)`; `.pullUp` → `.write(.restore(id))`, the item back at its index with its children's `parentId` restored; `.firstThing` → the previous mark back and a created task removed. Always `.sound(.poles, afterMs: 0)` and `.save`. `undoExpired` only hides the pill: the stack stays for the whole walk.
- `rowToggled(id)` (the ending sheet): flips `done`, `.write(.done(id, newValue))`.

- [ ] **Step 1: Write the failing tests:**
  - `aGoalGoesToItsAreaEvenWhenAnotherPeakIsFocused`: focus Health, plant "finish the bathroom." → an item "Finish the bathroom" on Home, `note == "That sounded like home, so it went on the Home peak."`, and `.write(.area(home))` comes before `.write(.create(…))`.
  - `theFocusedPeakCatchesAnUnclearGoal`; `withNoFocusItGoesOnTheUnlabeledPost` (`areaId == nil`).
  - `lowerLevelsInheritAndAreNeverClassified`: on Season with a Health parent focused, "clear out the garage" lands on Health with `parentId` the parent; with no parent focused, no area and no parent.
  - `aWeekTaskKeepsItsDay`: "the deposit, today" → title "The deposit", `day` today.
  - `theFirstThingIsOneTask`: on Today, plant → a week-level item dated today and `firstThing` it; plant again → `firstThing` is the second, effects contain `.write(.firstThing(second, previous: first))`, both items remain. `startThereMarksTheFocusedTask`.
  - `namingAnAreaKeepsIt`; `namingAnExistingAreaJustKeepsIt`; `theRidgeHoldsEight`.
  - `lettingGoWithNothingPlantsNothing`: `plant("um")` → no item, no `.write`, the "Nothing to plant yet" note.
  - `examplesPlantAsYourOwn`: "Gym on Tuesday" on Week → "Gym" with Tuesday's date, `mine`, sounds `.poles` at 0 and `.plant` at 160; ignored when examples are off.
  - `aFlagIDidNotPlantCannotBeSelected`: tapping an item with `mine == false` leaves `selected` nil.
  - `movingToAnUnkeptAreaKeepsIt`; `pullingUpClearsFocusAndFirstThing`.
  - `undoStepsBackThroughEverything`: name an area, walk on, plant, move, pull up; four undos return `items`, `kept` and `areas` to the start; the third's effects contain `.write(.remove…)`.
  - `undoIsStillThereAfterThePillHides`: `undoExpired`, then `.undo` still reverses the plant. `undoOfAPullUpRestoresTheRowAndItsChildren`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkPlantTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `WalkPlantTests` and `WalkStepsTests`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: plant, place by words, examples, move, pull up, and undo for all of it"`

### Task 11: The orb: hold, slide, tap, speak, type
**Files:**
- Create: `R/Walk/Core/WalkOrb.swift`, `R/Walk/Core/WalkState+Orb.swift`
- Test: `SymphonyOSTests/WalkOrbTests.swift`

**Interfaces:**
- Consumes: Tasks 8 to 10.
- Produces:
  ```swift
  enum WalkOrb {
      static let centre = CGPoint(x: 195, y: 678); static let radius: CGFloat = 48
      static let holdMs = 420; static let slideOut: CGFloat = 1.4; static let window: CGFloat = 32; static let pointDistance: CGFloat = 116
      static func position(of point: CompassPoint) -> CGPoint                       // stage coordinates
      static func point(at location: CGPoint, among points: [CompassPoint]) -> CompassPoint?
  }
  ```
  and `apply` for `.orbDown`, `.orbHeld`, `.orbMoved`, `.orbUp`, `.orbCancelled`, `.heard`, `.speechUnavailable`, `.typeChanged`, `.typeSubmitted`, `.typeDismissed`, `.point`; `act` for `.type`.

**The rules** (contract §7 "Press", "Slide", "Release", §8; D7).
- `point(at:among:)`: nil inside `slideOut × radius` (67.2 pt) of the centre; otherwise the offered point nearest in angle, only if within 32°.
- `orbDown`: ignored while speaking or typing. Orb → `.holding(hover: nil)`. On ground and steps 1 to 5: `.sound(.bag, afterMs: 0)`, `.sound(.poles, afterMs: 120)`, `.timer(.hold, ms: 420)`.
- `orbHeld` (still holding, nothing hovered, not Welcome): orb → `.speaking(live: "")`, effects `.listen(true)`, `.sound(.unfurl, afterMs: 280)`. `heard(text)` while speaking sets `live`.
- `speechUnavailable`: orb → `.idle`, `typing = ""`, the note `Speaking isn’t available here, so type it.` with the note timer, `.listen(false)`.
- `orbMoved(location)`: the hovered point is `point(at:among:)` over `WalkCopy.points(self)`. Sliding out while speaking cancels the speech (`.listen(false)`, live cleared) and the points show again. Entering a point emits `.sound(.tick, afterMs: 0)`.
- `orbUp(heldMs)`, first match: hovering a point → `act` its action; speaking → `.listen(false)` then `plant(live, env)`; `heldMs < 420` → toggle `.open` / `.idle`; else → `.idle` (on Welcome a long hold leaves the points open). Always `.timer(.hold, ms: nil)`.
- `point(p)` while `.open`: `act` that point's action and close. `orbCancelled`: `.idle`, `.listen(false)`, the hold timer cancelled.
- `act(.type)`: `typing = ""`, orb `.idle`. `typeChanged` updates it. `typeSubmitted`: `plant(typing, env)`, then `typing = nil`. `typeDismissed`: `typing = nil`.

- [ ] **Step 1: Write the failing tests:**
  - `pointsSitOnTheCompass`: `position(of: .s) == (195, 794)`, `.n == (195, 562)`, `.w == (79, 678)`, `.ne` is (277, 596) within 0.5.
  - `slidingPicksTheNearestOfferedPoint`: (195, 750) among [.n, .s, .w] → `.s`; (195, 740) → nil; a location at −45° and 100 pt out, among [.n, .e] → nil, among [.n, .ne, .e] → `.ne`; 31° off `.s` → `.s`, 33° off → nil.
  - `aShortPressOpensThePoints`, then `aSecondShortPressClosesThem`.
  - `holdingStartsListeningAndTheSoundsLineUp`: `orbDown` → bag at 0, poles at 120, the hold timer at 420; `orbHeld` → `.speaking`, `.listen(true)`, unfurl at 280.
  - `lettingGoPlantsWhatWasHeard`: `heard("feel strong again")`, `orbUp(heldMs: 900)` → an item "Feel strong again", with `.listen(false)` first.
  - `slidingOutWhileSpeakingCancelsIt`: no item, `.listen(false)`, orb `.holding(hover: .n)` when over N.
  - `lettingGoOnAPointChoosesIt`: hover S on Year with a flag → step 2.
  - `speechOffOpensTyping`: `speechUnavailable` → `typing == ""`, `note == "Speaking isn’t available here, so type it."`, orb idle, effects contain `.listen(false)`.
  - `typingPlantsOnReturn`: `.type`, `typeChanged("run a 5K")`, `typeSubmitted` → item "Run a 5K", `typing == nil`; `typeSubmitted` with "" plants nothing.
  - `theOrbIgnoresPressesWhileTyping`; `onWelcomeAHoldKeepsThePointsOpen`; `aCancelledTouchLeavesNothingListening`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkOrbTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the four reducer suites (`WalkStepsTests`, `WalkCopyTests`, `WalkPlantTests`, `WalkOrbTests`). Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: the orb's hold, slide and tap, with speech and typing behind it"`

### Task 12: The layout: camera, peaks, posts and banners that never overlap
**Files:**
- Create: `R/Walk/Core/WalkArt.swift`, `R/Walk/Core/WalkLayout.swift`
- Test: `SymphonyOSTests/WalkLayoutTests.swift`

**Interfaces:**
- Consumes: `WalkState`, `WalkCopy.examples`, `WalkWords.tag`, `WalkOrb`.
- Produces:
  ```swift
  struct WalkArt: Equatable {
      let imageName: String; let stage: CGSize; let world: CGSize
      let image: CGRect                                  // the picture's frame in the world
      let bands: [WalkLevel: CGFloat]                    // where a level stands, as a fraction of the picture's height
      let land: [WalkLevel: ClosedRange<CGFloat>]        // the fractions that are ground for that level
      let stops: [WalkLayout.Camera]                     // seven, Welcome … Look back up
      func bandY(_ level: WalkLevel) -> CGFloat          // world y
      static let overlookSquare: WalkArt
  }
  struct WalkLayout: Equatable {
      struct Camera: Equatable { var x: CGFloat; var y: CGFloat; var k: CGFloat }      // stage = (world − (x, y)) × k
      enum Kind: Equatable { case full, compact, tip, stub(Int), ghost }
      struct Banner: Equatable, Identifiable { let id: String; let itemId: UUID?; let level: WalkLevel; let kind: Kind
          let frame: CGRect; let lines: Int; let text: String; let tag: String?; let glows: Bool }
      struct Post: Equatable, Identifiable { let id: String; let key: WalkPostKey; let base: CGPoint; let top: CGFloat
          let opacity: Double; let saturation: Double; let pale: Bool; let banners: [Banner] }
      struct Label: Equatable, Identifiable { let id: UUID; let name: String; let frame: CGRect
          let kept: Bool; let focused: Bool; let opacity: Double; let tappable: Bool }
      let camera: Camera; let labels: [Label]; let posts: [Post]; let needleDown: Bool
      static func make(_ state: WalkState, today: Date, art: WalkArt = .overlookSquare) -> WalkLayout
      static func lines(for text: String, width: CGFloat) -> Int
  }
  ```
  Every frame is in stage coordinates (390 × 844) and already includes its scale. Views draw each banner in exactly its frame with `lineLimit(lines)`.

**Art data** (`overlookSquare`; contract §3). `imageName` "WalkOverlook"; stage 390 × 844; world 1300 × 1720; picture at (0, 420), 1300 × 1300. `bands`: year 0.277, season 0.408, month 0.523, week 0.623, today 0.700. `land`: year 0.24…0.31, season 0.37…0.45, month 0.49…0.56, week 0.59…0.66, today 0.685…0.74. `stops`: (0, −1093, 0.30), (186, −553, 0.42), (217, −294, 0.45), (244, −67, 0.48), (260, 110, 0.50), (275, 253, 0.52), (186, 15, 0.42). A taller painting is a second `WalkArt` value; no code reads a number that is not in it.

**The rules.**
- *Columns.* The kept areas in `areas` order (on ground: every label), then the unlabeled column when any item has no area or an area with no column (never on ground). With `cnt` columns, column `i` stands at Year-view stage x `lo + i × (hi − lo) / (cnt − 1)`, or 195 when alone; `lo…hi` is 87…302 for up to four columns off the ground, 50…340 on the ground and for five or more. World x = `stops[1].x + vx / stops[1].k`, the same on every level, so each area is one column down the slope. `gap` below is the Year-view spacing (200 for one column).
- *Camera.* `stops[step]`, unless a column is zoomed: on Year (not ground) the focused area; on steps 2 to 5 the focused parent's area when it has a column. Then `k = 0.8`, `x = columnX − 195 / 0.8`, `y = bandY(step's level) − 520 / 0.8`.
- *Posts never stagger.* Every post's base is on its level's band line in its column: `((columnX − camera.x) × k, (bandY(level) − camera.y) × k)`. The mockup raised alternate posts by 70 pt, which lifts them into the sky on the Year step; here only labels sit in rows.
- *Levels.* Year to Week hold their items. The Today level holds one banner: the week item named by `firstThing`, in its column, tagged `FIRST THING`. Week banners carry their day tag; no other level has tags.
- *Labels* (look: contract lines 274-281): two rows when there are more than three columns (`i % 2`); width 90, or `min(90, floor(2 × gap − 6))` with more than three columns; height 30; top at the Year band's stage y `+ 3 + row × 34`; then scaled about the top centre by `max(0.6, 1 − 0.1·d)` and faded to `max(0.5, 1 − 0.1·d)`, `d` = steps below Year (on ground: scale 1, kept 1 / not kept 0.62). `tappable` on ground and on Year.
- *What a level wants.* On step 6 every level is `compact`; otherwise the step's own level is `full` and the others `tip`. Widths: full `bw = clamp(floor(gap − 8), 62, 124)`; compact `round(0.85 × bw)`; tip and stub 26. Heights: full `19 + 16 × lines + (tag == nil ? 0 : 12)`; compact 23; tip 20; stub 20. `lines(for:width:)` is `min(3, max(1, ceil(count / floor((width − 16) / 6.6))))`.
- *Room.* A level has room for a kind when neighbouring columns, on stage at the current camera, are at least that kind's width + 6 apart. Without room, only the level's **open column** draws that kind, and every other post on that level draws one `stub(n)` with its count. The open column holds the selected item, else the focused item or area, else `lastPlanted[level]`, else it is the first with anything on it.
- *Stacking.* Banners rise from the post's base, newest lowest. The first bottom edge is `base.y − 24` (tips and stubs: `base.y`), with 4 pt between banners (tips: 3). The ceiling is stage y 250 for the step's own level and for Year; for any other level it is the band line of the level above plus 6. Banners are added newest first while the next one, plus a stub (20 + gap) if any would remain, stays below the ceiling; what remains becomes one `stub(n)` on top. The newest always shows, cut to one line if it must be. A post named by `expanded` draws all its banners `compact`.
- *A focused or selected flag on a tip post* is drawn `compact` and glowing, its bottom edge 4 pt above the tallest tip stack among its own post and the posts within its width.
- *Examples.* While examples are on for the step, up to three texts of `WalkCopy.examples` not already planted on this level are `ghost` banners on the post they would join: the focused column's, else the unlabeled post, which appears `pale` in the next column if nothing is on it yet. They are stacked first, so real banners fold before a ghost does, and that post is the open column while they show.
- *Edges.* Unzoomed, a frame that would leave x 4…386 is slid back inside. Nothing may meet the orb (a circle of radius 48 at `WalkOrb.centre`).
- *Distance.* A post `d` levels from the step's level has opacity `max(0.6, 1 − 0.09·d)` and saturation `max(0.55, 1 − 0.1·d)`; tip frames are scaled about the base by `max(0.6, 1 − 0.1 × (d − 1))`. No blur. `needleDown`: Welcome, or the step's level has a flag (on Today, a first thing).

- [ ] **Step 1: Write the failing tests:**
  - `everyBandLandsAt560OnItsOwnStep`: for steps 1…5 with one column, the level's post base y is 560 ± 0.5; on step 6 the five bases are 321, 393, 456, 510, 552 ± 1.
  - `threeKeptAreasStandWhereTheMockupPutThem`: Year, three columns → base x 87, 194.5, 302 and full banners 99 wide; on ground with six labels → label centres 50, 108, 166, 224, 282, 340.
  - `zoomCentresTheColumn`: focus Home on Year → camera `k == 0.8`, Home's base at (195, 520) ± 0.5; a focused parent with no area does not zoom.
  - `nothingOverlaps`: for every step 1…6, every count of kept areas 1…8, with and without an unlabeled column, 1…6 flags on every post of every level up to the step, with and without a focus, examples and a selection: no two banner frames of the same level intersect; no two label frames intersect; no banner or label frame meets the orb circle; unzoomed, every frame lies in x 0…390; every banner of the step's level has `frame.minY ≥ 250` unless it is the only one on its post.
  - `postsStandOnTheirBand`: in all those cases each post base, taken back to the world and expressed as a fraction of the picture's height, lies in `art.land[level]`.
  - `aCrowdedRidgeOpensOnePost`: six columns on Year with three flags each → exactly one post has `full` banners and the other five show one stub each; selecting a flag on another column makes that one the open post.
  - `whatDoesNotFitFoldsIntoAStub`: eight one-line flags on one of three posts → six banners and `stub(2)`; with that post `expanded`, eight `compact` banners, all below the ceiling.
  - `levelsAboveAreSmallFlags`: on Month, Year and Season items are `tip`; a focused Season item is `compact` and glows; on step 6 everything is `compact`.
  - `theFirstThingStandsOnTheTodayBand`: one banner on the Today level, tag "FIRST THING", in the item's column.
  - `examplesHangOnAPostNotInTheSky`: Year with examples on and nothing kept or planted → one pale post on the Year band with three `ghost` banners; with "Run a 5K" already planted → two.
  - `longTitlesStayInsideTheirBanner`: a 200-character title and a single 60-letter word give `lines == 3` and a frame 67 tall (79 with a tag).
  - `theNeedlePointsDownOnceSomethingIsPlanted`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkLayoutTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement** `WalkArt` and `WalkLayout.make` as one pass: columns → camera → labels → per level, per post, the stack.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: one layout from state to frames, where flags cannot overlap or leave the ground"`

### Task 13: The saved position, and when the walk appears
**Files:**
- Create: `R/Walk/Core/WalkPosition.swift`
- Modify: `R/Services/AccountDeletion.swift` (`clearDeviceLeftovers`)
- Test: `SymphonyOSTests/WalkPositionTests.swift`, `SymphonyOSTests/AccountDeletionTests.swift` (`leftoversAreCleared`)

**Interfaces:**
- Consumes: `WalkState`, `WalkPeriods`.
- Produces:
  ```swift
  struct WalkPosition: Codable, Equatable {
      var version = 1
      var status: WalkStatus; var depth: WalkDepth; var step: Int; var ground: Bool
      var areas: [WalkArea]; var kept: [UUID]; var focusArea: UUID?
      var focus: [String: UUID]                              // key = String(WalkLevel.rawValue)
      var tour: [UUID]; var planted: [UUID]; var firstThing: UUID?
      var year: Int; var seasonStart: String; var monthStart: String; var weekStart: String; var day: String   // YYYY-MM-DD
      var savedAt: Date
      init(_ state: WalkState, status: WalkStatus, planted: Set<UUID>, periods: WalkPeriods, now: Date)
      func restored(for periods: WalkPeriods, existing: Set<UUID>) -> WalkPosition
      func apply(to state: inout WalkState)
  }
  struct WalkPositionStore {
      var defaults: UserDefaults = .standard
      static func key(_ userId: UUID) -> String              // "walk.position.<lowercased uuid>"
      func load(for userId: UUID?) -> WalkPosition?
      func save(_ position: WalkPosition, for userId: UUID?);  func forget(for userId: UUID?)
  }
  enum WalkEntry: Equatable { case none, start, resume
      static func decide(replay: Bool, demoWalk: Bool, position: WalkPosition?, householdEditions: [String?],
                         initialSyncFinished: Bool, goalCount: Int) -> WalkEntry }
  ```
  Stored as JSON (`JSONEncoder`, ISO 8601 dates) in `UserDefaults` under `walk.position.<user id>`. Data that does not decode, or has another `version`, loads as nil.

**The rules.**
- `restored`: when a saved period no longer matches, step back to ask it again: a different `year` → `min(step, 1)`; `seasonStart` → `min(step, 2)`; `monthStart` → `min(step, 3)`; `weekStart` → `min(step, 4)`; `day` → `min(step, 5)` and `firstThing = nil`. Then drop every focus, tour stop and first thing whose id is not in `existing`, and every `focus` entry for a step now ahead. Kept areas stay (an area not yet used has no row). The periods in the result are the new ones.
- `decide`, first match: `replay` → `.start`. `demoWalk` → `.start`. A position that is `.inProgress` → `.resume`. A position that is `.finished` or `.left` → `.none`. No position: `.start` only when `householdEditions` is not empty and every one is `"light"`, and `initialSyncFinished`, and `goalCount == 0`; otherwise `.none`.
- `clearDeviceLeftovers` also calls `WalkPositionStore(defaults: defaults).forget(for: userId)`.

- [ ] **Step 1: Write the failing tests:**
  - `itRoundTrips`: a state at Month with kept areas, a focus, a tour and a first thing saves and loads equal; another user's key is separate; garbage data loads nil. `theKeyIsPerPerson`: `key(id) == "walk.position." + id.uuidString.lowercased()`.
  - `sameDaySamePlace`: `restored` with the same periods and every id existing changes nothing, a saved step 6 included.
  - `aNewDayAsksForTheFirstThingAgain`: saved at step 6 on 2026-11-13, restored on 2026-11-14 → step 5, `firstThing == nil`.
  - `aNewWeekAsksTheWeekAgain`: saved at Today on Friday 2026-11-13, restored on Tuesday 2026-11-17 → step 4, no focus for Today.
  - `aNewMonthAsksTheMonthAgain`: saved 2026-11-20 at Week, restored 2026-11-26 → step 3, `monthStart == "2026-12-01"`. `aNewYearAsksTheYearAgain`.
  - `aDeletedFocusIsDropped`: the focused season goal's id is not in `existing` → no focus for Month; a tour loses that stop; kept areas are untouched.
  - The truth table, one `#expect` per line:

    | replay | demoWalk | position | editions | synced | goals | result |
    |---|---|---|---|---|---|---|
    | true | false | finished | ["full"] | false | 9 | start |
    | false | true | nil | [] | false | 0 | start |
    | false | false | inProgress | ["full"] | false | 3 | resume |
    | false | false | finished | ["light"] | true | 0 | none |
    | false | false | left | ["light"] | true | 0 | none |
    | false | false | nil | ["light"] | true | 0 | start |
    | false | false | nil | ["light"] | true | 1 | none |
    | false | false | nil | ["light"] | false | 0 | none (`anUnfinishedFirstSyncNeverStartsIt`) |
    | false | false | nil | [] | true | 0 | none (no household row yet) |
    | false | false | nil | ["full"] | true | 0 | none |
    | false | false | nil | [nil] | true | 0 | none |
    | false | false | nil | ["light", "full"] | true | 0 | none |
  - In `AccountDeletionTests.leftoversAreCleared`: a saved position for `uid` is gone afterwards.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkPositionTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `WalkPositionTests` and `AccountDeletionTests`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: remember where you were, and only appear for a new light account that has synced"`

---

## Stage C: the scene and the orb

### Task 14: The mountain on screen
**Files:**
- Create: `R/App/Assets.xcassets/WalkOverlook.imageset/` (`walk-overlook.jpg`, `Contents.json`), `R/Walk/WalkModel.swift`, `R/Walk/Views/WalkView.swift`, `R/Walk/Views/WalkSceneView.swift`, `R/Walk/Views/WalkBannerViews.swift`
- Modify: `R/App/DemoMode.swift`, `R/App/MainView.swift` (`iOSMainView`, beside the half-open overlay near :137)
- Test: `SymphonyOSTests/WalkModelTests.swift`

**Interfaces:**
- Consumes: everything in Stage B.
- Produces:
  ```swift
  @MainActor @Observable final class WalkModel {
      private(set) var state: WalkState
      private(set) var periods: WalkPeriods
      var layout: WalkLayout { get }
      var onEnd: ((WalkStatus) -> Void)?;  var onReplay: (() -> Void)?
      init(context: ModelContext, userId: UUID, entry: WalkEntry, position: WalkPosition?, edition: Edition,
           now: Date = .now, seasons: [SeasonBoundary]? = nil, store: WalkPositionStore? = WalkPositionStore())
      func send(_ event: WalkEvent)
      func choose(_ action: WalkAction)
  }
  struct WalkView: View { init(model: WalkModel) }
  // DemoMode:  static var isWalk: Bool   (-SymphonyWalk);   static var walkStep: Int?   (-SymphonyWalkStep 0…6)
  ```
  `send` runs the reducer, then each effect: `.write` through one `WalkWriter` kept for the walk; `.save` through the store (`store == nil` saves nothing); `.timer` with cancellable `Task`s that send `.orbHeld`, `.undoExpired`, `.noteExpired`; `.end(status)` saves the position with that status, then calls `onEnd`; `.replay` calls `onReplay`. `.sound`, `.listen` and `.askCalendar` do nothing yet (Tasks 16, 19, 20). On init: `.start` loads `WalkLoad.areas` and `WalkLoad.items` into a fresh state at Welcome with an empty planted set; `.resume` loads them with the position's planted set, then `position.restored(…).apply(to:)`. The model keeps the set of ids it planted and passes it to every saved position.

**The picture** (D20). Source: `~/Pictures/Symphony scenery/overlook-square-3x.png` (5796 × 5796; the `-original` file beside it is now a 1200-pixel copy and is not used). Bundle one **3120 × 3120 JPEG at quality 88**, about 1.8 MB: 3120 = 1300 world units × the deepest zoom 0.8 × 3 pixels per point, so at the closest zoom on a 390-point, 3x phone one picture pixel is one screen pixel; larger adds megabytes and no sharpness, and a PNG this size is over 12 MB. Make it with `mkdir -p R/App/Assets.xcassets/WalkOverlook.imageset && sips -Z 3120 -s format jpeg -s formatOptions 88 "$HOME/Pictures/Symphony scenery/overlook-square-3x.png" --out R/App/Assets.xcassets/WalkOverlook.imageset/walk-overlook.jpg`, with a `Contents.json` naming that one file as a single universal image (no 2x / 3x entries, so the catalog never shrinks it). Draw it `.resizable().interpolation(.high)`, never blurred.

- [ ] **Step 1: Write the failing tests** (in-memory container, `store: nil`, now = 2026-11-13):
  - `aFreshWalkStartsAtWelcomeWithSixPeaks`.
  - `plantingWritesTheRow`: `choose(.quick)`, `send(.areaTapped(health))`, `choose(.next)`, `choose(.type)`, `send(.typeChanged("feel strong again"))`, `send(.typeSubmitted)` → one `Goal` "Feel strong again" for 2027 with an `areaId`, one `GoalArea` "Health", and the layout has one full banner with that text. `undoTakesTheRowBack`: then `send(.undo)` → no `Goal`, no `GoalArea`, no queued change for either.
  - `aResumedWalkShowsWhatWasPlanted`: a stored position at Season with one planted year goal, init with `.resume` → step 2, the goal is an item with `mine == true`.
  - `endingSavesTheStatus`: `choose(.notNow)` at Welcome with a real store → `onEnd(.left)` and a stored position with status `.left`.
  - `theBundledPictureResolves`: `UIImage(named: "WalkOverlook")` is not nil and is 3120 pixels wide.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkModelTests`. Expected: FAIL to compile.
- [ ] **Step 3: Add the picture** (the command above) and implement `WalkModel`.
- [ ] **Step 4: Draw it.** `WalkView` is the 390 × 844 stage scaled by `min(width / 390, height / 844)`, centred on a full-bleed `#00106e` ground, ignoring safe areas (D21). `WalkSceneView`, back to front, with the numbers in contract §3 "Stage and world" and §14 (lines 589-605): the stage gradient; the world (sky gradient, then the picture in `art.image`) drawn at 1300 × 1720 with `.scaleEffect(k, anchor: .topLeading).offset(x: -x * k, y: -y * k)`; the labels and posts at their layout frames in stage space; the dark band at the top (height 260); the text block (Welcome: lines 128 and 594; asking: eyebrow, question and why from `WalkCopy`, sizes on line 595) in white with the two-layer dark shadow of line 592. One animation carries the camera, labels and posts together: `.timingCurve(0.45, 0.05, 0.2, 1, duration: 1.4)` on the layout's camera. `WalkBannerViews`: full banner with its V notch, compact banner, tip pennant, stub (a pennant with its number), ghost (pale, dashed), pole and ground shadow, with the colours and paddings of contract §5 (lines 313-326) and §9 (lines 478-482), the flutter and drop-in of line 322, and the labels of lines 274-281. Labels and banners are buttons that send `.areaTapped`, `.bannerTapped`, `.stubTapped`, `.exampleTapped`.
- [ ] **Step 5: Show it.** In `iOSMainView` add `@State private var walk: WalkModel?` and an overlay placed before the half-open overlay, so the walk covers the dock and the half-open display still covers the walk: `.overlay { if let walk { WalkView(model: walk).transition(.opacity) } }`. For now it is created only in demo, on appear, when `DemoMode.isWalk`. `DemoMode`: with `-SymphonyWalk` the store is not seeded; with `-SymphonyWalkStep N` it holds the mockup's preview (kept Health, Home, People; the script lines for levels 1…min(N, 5) from `Walk.dc.html:230-234`, written through `WalkWriter`) and the walk opens at step N with the mockup's preview focus (`Walk.dc.html:243-244`).
- [ ] **Step 6: Run** `WalkModelTests`. Expected: PASS.
- [ ] **Step 7: Screenshots** of steps 0 to 6 into `walk-shots/task-14/`. Check against the contract: the picture's top edge at stage y 454, 409, 321, 234, 155, 87, 170; the current level's posts standing at 560; white text readable over the sky; no mist, no blur.
- [ ] **Step 8: Commit.** `git commit -m "Walk: the mountain, the camera and the flags on screen"`

### Task 15: The orb, the compass, the live flag and the hint row
**Files:**
- Create: `R/Walk/Views/WalkOrbView.swift`, `R/Walk/Views/WalkHintRow.swift`
- Modify: `R/Walk/Views/WalkView.swift`, `R/App/DemoMode.swift`
- Test: none new (the behaviour is Tasks 10 and 11); screenshots.

**Interfaces:**
- Consumes: `WalkModel.send`, `WalkOrb`, `WalkCopy.points`, `WalkCopy.hint`, `state.orb`, `state.typing`, `state.selected`, `state.undoShowing`, `layout.needleDown`.
- Produces: `struct WalkOrbView: View { init(model: WalkModel) }`, `struct WalkHintRow: View { init(model: WalkModel) }`. Neither is shown on step 6.

- [ ] **Step 1: The orb.** A 300 × 300 dial at stage (45, 528): halo, body, highlight, ring, four ticks and the needle exactly as contract §7 "Geometry", "Breathing", "Compass" (lines 357-378). One `DragGesture(minimumDistance: 0)` on the orb: began → `.orbDown`; changed → `.orbMoved(location in stage coordinates)`; ended → `.orbUp(heldMs:)`; a cancelled gesture → `.orbCancelled`. The view measures nothing and decides nothing.
- [ ] **Step 2: The compass points.** For each of `WalkCopy.points(state)`, a button at `WalkOrb.position(of:)` with its SF Symbol and label (contract lines 431-435), shown while the orb is `.holding` or `.open`, the hovered one enlarged. A tap sends `.point`.
- [ ] **Step 3: The live flag.** While `.speaking`: the pole rising from the top of the orb and the swallow-tailed cloth unfurling with the live words and a caret, in the step's level colour (contract lines 397-404).
- [ ] **Step 4: The hint row** at the bottom (contract lines 596, 494, 501-504): `WalkCopy.hint(state)`, with the `Undo` pill beside it while `undoShowing` (sends `.undo`). When a flag is selected the row becomes `Move to`, one chip for every label except the flag's own, then `Pull it up` (`.moveTo`, `.pullUp`), scrolling sideways. When `typing != nil` the row becomes one text field (placeholder `Type it, then return`, return key "done"), focused at once, bound to `.typeChanged`, submitting `.typeSubmitted`, sending `.typeDismissed` when it loses focus; any hint text stays as a line above it, and the stage moves up with the keyboard so the field stays in view.
- [ ] **Step 5: Screenshots** into `walk-shots/task-15/`: the idle orb on Year; the points open on Welcome, on ground and on Year (a DEBUG launch argument `-SymphonyWalkOrb open`, read in `DemoMode`, opens them); the hint with the Undo pill; the Move row. Check the orb's centre is at stage (195, 678) and the hint is readable above the home indicator.
- [ ] **Step 6: Commit.** `git commit -m "Walk: the orb, its compass points, the rising flag and the hint line"`

### Task 16: Speech
**Files:**
- Modify: `R/Views/Capture/TellSheet.swift` (`Dictation`, :93-180), `R/Walk/WalkModel.swift`
- Test: `SymphonyOSTests/WalkModelTests.swift`

**Interfaces:**
- Produces:
  ```swift
  // Dictation:  var playsAlongside = false      // the walk sets it; Tell leaves it false
  @MainActor protocol WalkListening: AnyObject { var transcript: String { get }; var problem: String? { get }
                                                 func start() async; func stop() }
  extension Dictation: WalkListening {}
  // WalkModel.init gains:  listener: WalkListening? = nil      // nil → a Dictation with playsAlongside = true
  ```

- [ ] **Step 1: Write the failing tests** with a fake listener (an `@Observable` class): `listeningStartsOnTheHoldNotBefore` (no `start()` until `.orbHeld`); `whatIsHeardFillsTheFlag` (the fake's transcript reaches `state.orb == .speaking(live:)`); `aProblemOpensTyping` (the fake sets `problem` in `start()` → `state.typing == ""` and the "Speaking isn’t available" note); `stopIsCalledOnRelease`.
- [ ] **Step 2: Run** `WalkModelTests`. Expected: the new cases FAIL.
- [ ] **Step 3: Fix `Dictation`** (D7). `start()` begins with `transcript = ""`. With `playsAlongside`, the session is `.playAndRecord`, mode `.default`, options `[.defaultToSpeaker, .mixWithOthers]`, with `setAllowHapticsAndSystemSoundsDuringRecording(true)`, and `stop()` leaves the session active and sets it back to `.ambient` with `.mixWithOthers`, so the walk's sounds play straight after. With `playsAlongside == false` nothing changes for Tell.
- [ ] **Step 4: Wire it.** `.listen(true)` → `await listener.start()`; if `problem != nil`, `send(.speechUnavailable)`. The model follows `transcript` with `withObservationTracking` and sends `.heard`. `.listen(false)` → `stop()`. Permission is asked by `start()` on the first hold, never at launch.
- [ ] **Step 5: Run** `WalkModelTests`. Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "Walk: hold the light and speak; if speech is off, type"`

### Task 17: The five steps, end to end
**Files:**
- Test: `SymphonyOSTests/WalkFlowTests.swift` (new)
- Modify: `R/Walk/Core/WalkState+Plant.swift` (`.walkAnother`), and whatever the tests show is wrong under `R/Walk`.

**Interfaces:**
- Consumes: `WalkModel` over the in-memory container, a fake listener, a store on a private `UserDefaults` suite.
- Produces: `apply(.walkAnother)`: at step 6, with `WalkEnding.nextToWalk(items)` non-nil → `depth = .quick`, `step = 2`, `focus[.season]` that goal, `sheetOpen = false`, `.save`; nil does nothing.

- [ ] **Step 1: Write the failing tests** (now = Friday 2026-11-13; "say" = `orbDown`, `orbHeld`, the fake hears the text, `orbUp(heldMs: 900)`):
  - `aQuickStartLeavesOneLinkedChain`: quick; keep Health and Home; next; say "feel strong again"; next; say "lift twice a week"; next; say "book the gym induction"; next; say "gym induction, today"; next; `choose(.startThere)`; next. Then: one `Goal` (2027, personal, area Health); a season task with `goalId` it; a month task with `sourceId` the season task and the same `goalId`; a week task "Gym induction" dated today with `sourceId` the month task; exactly one `TaskFocus` today, for that task; `state.step == 6`; `WalkEnding.rows` gives one row with `forGoal == "Feel strong again"` and `first == true`. No task has `isGoal`; every one has `context == "personal"`. In the pending changes, oldest first, no row comes before a row it points at.
  - `theWholeYearVisitsEveryAreaAndEveryGoal`: full; keep Health, Home, People; say one goal at each of the three stops (`WalkCopy.question` names the area each time); at Season the question is `For “…”, what’s this winter’s piece?` for each of the three goals in turn; three season tasks each link to their own goal and carry its area.
  - `aGoalSaidOnTheWrongPeakMoves`: focus Health, say "finish the bathroom" → the goal's `areaId` is Home's.
  - `everyStepCanBeSkipped`: quick, then next six times with nothing said → step 6, no goal, task or `GoalArea` rows.
  - `leavingAndComingBack`: after the Month answer, a new `WalkModel` with `.resume` over the same store and container → step 3, the three flags present and `mine`, the Month focus intact.
  - `walkAnotherOneDown`: two year goals and a chain under the first; `send(.walkAnother)` at step 6 → step 2, `focus[.season]` the second goal, depth quick.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkFlowTests`. Expected: FAIL (`walkAnother` at least).
- [ ] **Step 3: Implement `.walkAnother` and fix** what else fails.
- [ ] **Step 4: Run** every `Walk…` suite. Expected: PASS.
- [ ] **Step 5: Walk it by hand** in the simulator (`-SymphonyDemo -SymphonyLight -SymphonyWalk`), typing through the compass: a quick start to step 5. Screenshots of each step into `walk-shots/task-17/`.
- [ ] **Step 6: Commit.** `git commit -m "Walk: both depths proven end to end against real rows"`

---

## Stage D: arriving, sounds, the ending

### Task 18: When it appears, resuming, replaying, and where the pages open
**Files:**
- Modify: `R/App/AppState.swift`, `R/App/MainView.swift` (`iOSMainView`), `R/Views/Settings/SettingsView.swift` (a section above "About", :69), `R/Views/Planner/PlannerView.swift` (`option`, :88-93)
- Test: `SymphonyOSTests/WalkPositionTests.swift`

**Interfaces:**
- Consumes: `WalkEntry.decide`, `WalkPositionStore`, `AppState.initialSyncFinished`, `WalkPeriods.pageDate(for:)`, `WalkModel.onEnd` / `onReplay`.
- Produces: `AppState.walkReplayRequested: Bool` (default false).

- [ ] **Step 1: Write the failing test** `aFinishedWalkIsRememberedAndAReplayStartsFresh`: a model ended with `.finished` leaves a stored position with that status; `decide` then gives `.none`; with `replay: true` it gives `.start`, and a model started that way saves an `.inProgress` position whose `planted` is empty.
- [ ] **Step 2: Run** `WalkPositionTests`. Expected: the new case FAILS.
- [ ] **Step 3: The trigger.** `iOSMainView.considerWalk()`: return when `walk != nil` or nobody is signed in. Fetch the households' editions and the `Goal` count **from the model context at that moment** (not from a `@Query`, which can lag behind the pull), load the position, and call `WalkEntry.decide(replay: appState.walkReplayRequested, demoWalk: DemoMode.isWalk, …)`. `.start` and `.resume` create the `WalkModel` (demo: `store: nil`), with `onEnd` setting `walk = nil`, `appState.activeTab = .planner`, `appState.horizon = .today` and calling `appState.goToToday()`, and `onReplay` setting `appState.walkReplayRequested = true`. Call it on appear and on change of `appState.initialSyncFinished`, `appState.edition` and `appState.walkReplayRequested` (which it sets back to false). While the walk is up, the content beneath it is `.accessibilityHidden(true)`.
- [ ] **Step 4: Replay.** `SettingsView`, both editions: a section with one button, `Walk the mountain again`, and the footer `Start at the top and walk down to today. Nothing you have is changed.` It sets `appState.walkReplayRequested = true`.
- [ ] **Step 5: The pages show what the walk filed** (spec: "The Year, Season and Month pages must show what the walk filed"). In `PlannerView.option`, in the light edition only, choosing Month, Season or Year sets `appState.selectedDate = WalkPeriods.pick(now: .now, seasons: seasons).pageDate(for: h)`; the steppers still move from there. Full households are untouched.
- [ ] **Step 6: Run** `WalkPositionTests`, then the whole unit suite. Expected: PASS.
- [ ] **Step 7: Look at it.** `-SymphonyDemo` alone: no walk; Settings has the button; tapping it opens Welcome; `Not now` returns to Today. `-SymphonyDemo -SymphonyLight`: Year opens on 2027. Screenshots into `walk-shots/task-18/`.
- [ ] **Step 8: Commit.** `git commit -m "Walk: appears once for a new light account, resumes, and replays from Settings"`

### Task 19: Sounds and haptics
**Files:**
- Create: `scripts/render-walk-placeholder-sounds.py`; in `R/Resources/WalkSounds/`: `walk-bag.PLACEHOLDER.wav`, `walk-poles.PLACEHOLDER.wav`, `walk-unfurl.PLACEHOLDER.wav`, `walk-plant.PLACEHOLDER.wav`, `walk-tick.PLACEHOLDER.wav`; `R/Walk/WalkSound.swift`
- Modify: `R/Walk/WalkModel.swift`
- Test: `SymphonyOSTests/WalkSoundTests.swift`

**Interfaces:**
- Produces:
  ```swift
  @MainActor protocol WalkSoundPlaying: AnyObject { func play(_ name: WalkSoundName) }
  @MainActor final class WalkSound: WalkSoundPlaying {
      static let shared = WalkSound()
      static func fileName(for name: WalkSoundName, in files: [String]) -> String?
      func play(_ name: WalkSoundName)
  }
  // WalkModel.init gains:  sound: WalkSoundPlaying? = nil      // nil → WalkSound.shared
  ```

**The placeholders** (D19: no recordings exist yet and none may be taken from the internet). The script is plain Python 3, standard library only (`wave`, `struct`, `math`, `random` seeded with 13, so every run gives the same bytes). It renders the five recipes of contract §12 (lines 515-523: filtered noise bursts through its own biquad, tones with exponential glides and envelopes, master gain 0.6) to **mono, 44.1 kHz, 16-bit WAV**: bag 0.40 s, poles 0.45 s, unfurl 0.40 s, plant 0.40 s, tick 0.05 s. Run `python3 scripts/render-walk-placeholder-sounds.py apple/SymphonyOS/SymphonyOS/Resources/WalkSounds`. Files under R ship in the bundle automatically.

**Replacing them.** `fileName(for:in:)` prefers a recording named `walk-<name>.wav`, `.caf` or `.m4a` and falls back to `walk-<name>.PLACEHOLDER.wav`. Scott drops five recordings beside the placeholders; nothing else changes.

**Playing.** One preloaded `AVAudioPlayer` per sound, volume 0.6. Sound is skipped when `PaperSound.shared.isOn` is false (the existing setting); the session is `.ambient` with `.mixWithOthers` (the silent switch is respected) unless speech holds it. A haptic goes with every sound, sound on or off: bag `UIImpactFeedbackGenerator(style: .soft)` at 0.5; poles `.rigid` at 0.6; unfurl `.light` at 0.7; plant `.medium` at 1.0, 130 ms after the sound starts (the thud); tick `UISelectionFeedbackGenerator().selectionChanged()`.

- [ ] **Step 1: Write the failing tests:** `aRecordingBeatsAPlaceholder` (`fileName(for: .bag, in: ["walk-bag.PLACEHOLDER.wav", "walk-bag.caf"]) == "walk-bag.caf"`; with only the placeholder, the placeholder; with neither, nil); `everySoundIsInTheBundle` (for each `WalkSoundName` a file resolves in `Bundle.main`); `theModelPlaysWhatTheReducerAsks` (a fake `WalkSoundPlaying` gets `.bag` at once and `.poles` after its delay on `orbDown`, `.plant` on a plant, `.tick` on keeping a peak).
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkSoundTests`. Expected: FAIL to compile.
- [ ] **Step 3: Write the script, render the five files, implement `WalkSound`,** and have `WalkModel` perform `.sound(name, afterMs:)`.
- [ ] **Step 4: Run.** Expected: PASS. Then listen once in the simulator: bag and poles on a press, the flap as the flag opens, the thud on planting, quiet ticks on the compass.
- [ ] **Step 5: Commit.** `git commit -m "Walk: five sounds with haptics, on placeholder audio until the recordings arrive"`

### Task 20: The calendar ask and the ending
**Files:**
- Create: `R/Walk/Views/WalkEndingSheet.swift`
- Modify: `R/Walk/WalkModel.swift`, `R/Walk/Core/WalkState.swift` (the Today entry in `next`), `R/Walk/Core/WalkState+Plant.swift`, `R/Walk/Views/WalkView.swift`
- Test: `SymphonyOSTests/WalkFlowTests.swift`

**Interfaces:**
- Consumes: `WalkEnding.rows`, `WalkEnding.nextToWalk`, `AppleCalendarService.shared` (`access`, `requestAccess()`), `CalendarFeed.shared.items(for:)`.
- Produces: `WalkModel.endingRows: [WalkEnding.Row]`, `WalkModel.nextUp: (title: String, start: Date)?`, `WalkModel.ring: (done: Int, total: Int)`; `apply` for `.sheetHandle`, `.walkAgain`, `.goToToday`, `.calendarAnswered`; `act` for `.calendar`.

**The rules** (spec "It ends with Today rising in as a sheet…"; D17, D18; contract §13, lines 527-574).
- The model sets `WalkEnv.canAskCalendar` when the edition is light and `AppleCalendarService.shared.access == .notAsked`. Arriving at Today with it, the note `See your calendar on Today too` shows for 6 s and the compass offers `Calendar`. `act(.calendar)` → `[.askCalendar]`; the model awaits `requestAccess()` and sends `.calendarAnswered`, which clears `calendarOffer`. It is asked at most once, and never in a full household.
- Step 6: the camera's seventh stop, every level compact, no orb. Header: `Look back up: that’s your plan.` while the sheet is down and there are posts, else `Here’s today.`; and the link `Walk it again` (`.walkAgain` → `[.end(.finished), .replay]`). The sheet peeks at stage y 716; its handle (`Show my day` / `Look back up at your plan`) sends `.sheetHandle`, which raises it to y 130 and lowers it again.
- In the sheet: `Today` and the date; the ring (`ring.done` of `ring.total`, accessibility label `k of n done`); the next calendar event today, if any (`Next · <time>`, its title); today's rows from `endingRows`, each with its check circle and `for <goal>` line, a tap sending `.rowToggled`; `Walk another one down` with `Next flag: <name>` when `nextToWalk` is not nil (`.walkAnother`); when there is at least one row and all are done, the line `That’s the day.`; with no rows, `Nothing planted for today yet.`; last, the link `Go to Today` (`.goToToday` → `[.end(.finished)]`). No praise, no count of what is left, nothing red.

- [ ] **Step 1: Write the failing tests** in `WalkFlowTests`: `theCalendarIsOfferedOnceInLightOnly`; `theSheetStartsDown` (`sheetOpen == false` on reaching step 6, true after `.sheetHandle`); `tickingARowCompletesTheTask` (the `SymphonyTask` is `completed`, `ring == (1, 1)`); `closingTheSheetFinishesTheWalk` (`.goToToday` → `onEnd(.finished)`, the stored position is finished); `walkItAgainEndsAndAsksForAReplay` (`onEnd(.finished)` then `onReplay`).
- [ ] **Step 2: Run** `WalkFlowTests`. Expected: the new cases FAIL.
- [ ] **Step 3: Implement** the reducer cases, the model's three readings, and `WalkEndingSheet` with the measurements and colours of contract lines 535-574 (first appearance 900 ms, raise 600 ms, `cubic-bezier(.2,.8,.2,1)`).
- [ ] **Step 4: Run** `WalkFlowTests`. Expected: PASS.
- [ ] **Step 5: Screenshots** into `walk-shots/task-20/`: step 6 with the sheet down (`-SymphonyWalkStep 6`), the sheet up with one row done, and every row done showing `That’s the day.`
- [ ] **Step 6: Commit.** `git commit -m "Walk: look back up, then Today rises with what each task is for"`

### Task 21: Accessibility minimum, other screen sizes, the UI test, the record
**Files:**
- Modify: `R/Walk/Views/*.swift`, `apple/SymphonyOS/PLANNING.md`
- Create: `SymphonyOSUITests/WalkUITests.swift`

- [ ] **Step 1: VoiceOver minimum** (D22). The orb is one element, labelled `Hold to begin` on Welcome and otherwise `Hold and speak to plant a flag; tap for more`, with one `accessibilityAction(named:)` per entry of `WalkCopy.points(state)` calling `model.choose`. Area labels: the name, with the selected trait when kept or focused. Banners: `<Level>: <text>` plus `, tap to focus` or `, tap to move or pull up`; ghosts `Example: <text>, tap to make it yours`; stubs `<n> more, tap to show`. The live flag announces its words politely.
- [ ] **Step 2: Reduce Motion.** With `accessibilityReduceMotion`, the camera, labels and posts change with a 0.25 s cross-fade instead of the 1.4 s glide; banners do not flutter; the orb does not breathe.
- [ ] **Step 3: Other sizes.** Screenshots on iPhone 17, iPhone 17 Pro Max and a Duo simulator if one is installed (say so if not): the stage is whole, centred, letterboxed in `#00106e`. With `-HalfOpen laptop` the half-open display covers the walk.
- [ ] **Step 4: The UI test** `WalkUITests` (no typing, no dictation; allow 60 s for launch). `testAQuickStartPlantsAFlag` launches with `-SymphonyDemo -SymphonyLight -SymphonyWalk`; finds `Let’s start up high and walk down to today.`; taps the orb (`Hold to begin`), then `Quick start`; taps `Health`; taps the orb, then `Plant goals`; taps the orb, then `Examples`; taps `Example: Run a 5K, tap to make it yours`; asserts a button `Year: Run a 5K, tap to move or pull up` exists. `testAFullHouseholdSeesNoWalk` launches with `-SymphonyDemo` and asserts `Today. Switch horizon` exists and the welcome title does not. Run `-only-testing:SymphonyOSUITests/WalkUITests -test-timeouts-enabled YES -default-test-execution-time-allowance 300`.
- [ ] **Step 5: Run the whole unit suite, then `LightEditionUITests`.** Expected: every earlier test still passes (250 before this plan).
- [ ] **Step 6: Write it down.** In `apple/SymphonyOS/PLANNING.md`: a "The walk" section (what it writes at each level and the three link columns; `linksDirty` / `areaDirty`; parents-first pushing; the launch arguments `-SymphonyWalk`, `-SymphonyWalkStep`, `-SymphonyWalkOrb`; where the saved position lives), and a note at line 27 that the write line still makes no `source_id` and the walk is the exception.
- [ ] **Step 7: Commit.** `git commit -m "Walk: VoiceOver actions, reduced motion, other screens, and the UI test"`

---

## Calls made in this plan (owner to check)

- **Links follow the web, not the decisions file.** Season and month goals are plain rows (not `is_goal`); a month goal names its season goal, and a week task its month goal, in `source_id`; `goal_id` is copied down the chain.
- **Undo is always on the compass** (up-left) while there is something to undo, as well as the 7-second pill. "Back up" still means go back a step; it never deletes anything.
- **The welcome offers Quick start, Plan my whole year, and Not now.** The mockup's "Just today" is gone; Not now is how you leave.
- **Posts do not stagger.** The mockup raised every other post by 70 points, which lifts them into the sky on the Year step. Only the labels sit in two rows.
- **On a crowded ridge one post is open at a time.** With six or more columns only the post you last touched shows its banners; the others show one small flag with a count.
- **Example flags hang on the post they would join.** In the mockup they float above the mountain, which is sky on the Year and Season steps.
- **At most eight areas** on the ridge.
- **A tall stack may pass in front of the small flags of the level above** in the same column, as in the mockup. Flags never overlap others of their own level, the labels, the question or the orb.
- **Flags fade with distance by colour only**, not the mockup's slight blur. The bare pole under the lowest banner is 24 points, not 18.
- **"So", "okay", "well", "like" are only dropped before a comma or another filler,** so "Like myself again" stays whole. "Uhm", "erm" and "ok" count as fillers too.
- **A day is only pulled out on the Week and Today steps,** and only from the end of what was said. A weekday already past means next week's.
- **Words that are only a day** ("today") become a task called "Today" on that day.
- **Titles longer than 200 characters are cut at a word;** a question quotes at most 40 characters of a flag.
- **Quick start focuses the flag you just planted** when you walk on, so the next question is about it. Tap it to let go.
- **Whole year** visits areas in the order you kept them, then asks about each year goal in turn at the Season step. Month, Week and Today then run as in a quick start.
- **The first thing today** is one task. Saying a new one at the Today step makes a new task for today; marking another moves the mark. On the ordinary Today page, other tasks already chosen for today may sort beside it.
- **Week tasks said for today are not marked as chosen;** only the first thing is.
- **The walk shows your own personal plan** for the periods it files into, but only moves or pulls up flags it planted itself. Work and Family items never appear in it. A replay starts with nothing counted as planted.
- **A kept area is only saved once something is planted on it.** An existing personal area with the same name is reused.
- **The Week step always plans the week you are in,** even on its last day.
- **In the light app, Year, Season and Month open on the period the walk files into** (in mid-November: next year, the coming winter).
- **The hint line says "Let go to choose" and "Tap a point, or tap the light to close"** while the compass is open. The mockup showed nothing there.
- **The ending has a "Go to Today" link** at the foot of the sheet; the mockup had no way to close it. With nothing for today the sheet says "Nothing planted for today yet."
- **The bundled picture is 3120 pixels wide, JPEG, about 1.8 MB.**
- **Haptics play even when sound is off.**
- **The calendar is offered as a compass point, "Calendar",** on the Today step, with the quiet line, once.
- **The ordinary Today page does not show "for <goal>" yet;** only the ending sheet does. Today's design is the next stage.
- **The UI test plants an example flag instead of typing one,** because typing stalls this simulator.

## Stops for the owner

- **Recorded sounds.** Five recordings are needed (bag rustle, poles clacking, cloth flap, swish and thud, tick; lengths and character in contract §12). Until then the app plays synthesized placeholders, which the spec says not to ship. Drop `walk-bag`, `walk-poles`, `walk-unfurl`, `walk-plant`, `walk-tick` (`.wav`, `.caf` or `.m4a`) into `R/Resources/WalkSounds`.
- **The tall painting.** The walk is built on the square overlook, upscaled, at 3120 pixels. It is a little soft at the closest zoom on the largest phones, and plain colour shows below the picture on the Week and Today steps. The tall painting replaces it by adding one `WalkArt` value.
- **Speech with sound, on a real iPhone.** Recording and playing at once cannot be proven in the simulator. On a device: hold, speak, let go; the words appear, the flap and thud are heard, and the next hold listens again.
- **"The full plan is offered again at each new season"** is not built. It needs the daily signpost, which is not designed. Until then "Walk the mountain again" in Settings is the way back.
- **Nothing here is pushed.** TestFlight and main wait for Scott.
