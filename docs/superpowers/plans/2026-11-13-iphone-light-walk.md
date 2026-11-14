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
- No dictation and no typing, in UI tests or by hand in the simulator (typing stalls this simulator: `apple/SymphonyOS/PLANNING.md:50-63`). Checks that need words use the example flags and the demo launch arguments.
- The test targets also build for macOS. Every new test file that references an iOS-only type (`WalkModel`, `WalkScheduling`, `WalkListening`, `WalkSoundPlaying`, `UIImage`, anything in `WalkTestSupport.swift`) is wrapped whole in `#if os(iOS) … #endif`: `WalkTestSupport.swift`, `WalkModelTests.swift`, `WalkFlowTests.swift`, `WalkSoundTests.swift`, `WalkUITests.swift`. Test files for `R/Walk/Core` and `R/Walk/Data` are not wrapped.
- One name per shared number and per string. Numbers: `WalkLoad.maxAreas` (areas on the ridge), `WalkWords.maxTitle` and `WalkWords.maxAreaName` (lengths), `WalkCopy.shortLength` (a title quoted in a question), `WalkState.undoMs`, `WalkState.noteMs` and `WalkState.calendarNoteMs` (how long the Undo pill and a note show), `WalkOrb.holdMs` (the hold). Strings: every word the walk shows or speaks comes from `WalkCopy` (Task 9). Code and unit tests use the names; only Task 9's tests and the UI test (which cannot see the app's types) spell a string out.
- Anything that waits (a timer, a delayed sound, starting speech, asking for the calendar) goes through the injected `WalkScheduling` (Task 14), so tests drive time with `ManualWalkScheduler` and never sleep. Fakes shared by tests live in one file, `SymphonyOSTests/WalkTestSupport.swift`: Task 14 creates it with `ManualWalkScheduler` and `walkTestContext()`, Task 16 adds `FakeWalkListener`, Task 19 adds `FakeWalkSound`, Task 20 adds `FakeWalkCalendar`. Tasks 16 to 20 use them from there and declare no fake of their own.
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
- `R/Walk/Core/`: `WalkTypes.swift` (levels, items, areas, compass points, actions), `WalkPeriods.swift` (which year, season, month, week), `WalkWords.swift` (tidying, pulling out a day), `WalkClassifier.swift` (keyword lists, placement), `WalkState.swift` + `WalkState+Plant.swift` + `WalkState+Orb.swift` (state, events, effects, the reducer), `WalkCopy.swift` (every string, the compass point sets), `WalkOrb.swift` (orb geometry), `WalkStage.swift` (device ↔ stage), `WalkArt.swift` + `WalkLayout.swift` (art data; state → camera, labels, posts, banners), `WalkPosition.swift` (saved position, restore rule, when the walk appears).
- `R/Walk/Data/`: `WalkWriter.swift` (rows and links), `WalkLoad.swift` (reading the plan back), `WalkEnding.swift` (the ending's rows).
- `R/Walk/`: `WalkModel.swift` (the one observable object), `WalkScheduling.swift` (the clock seam), `WalkSound.swift`; `Views/WalkView.swift`, `WalkSceneView.swift`, `WalkBannerViews.swift`, `WalkOrbView.swift`, `WalkHintRow.swift`, `WalkEndingSheet.swift` (drawing only).

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
- Test: `SymphonyOSTests/SyncOrderTests.swift` (new; not wrapped, it uses no iOS-only type)

**Interfaces:**
- Consumes: Task 1's `SymphonyTask.goalId / sourceId / areaId / linksDirty`, `Goal.areaId / areaDirty`, `GoalArea`.
- Produces:
  ```swift
  extension SyncEngine {
      /// The rows this one's SENT links point at: a task's goalId, sourceId, areaId when `linksDirty`;
      /// a goal's areaId when `areaDirty`; otherwise none (a clean row sends no link, so it has nothing to wait for).
      static func parentIds(table: String, id: UUID, context: ModelContext) -> [UUID]
      static func mustWait(parents: [UUID], unpushedInserts: Set<UUID>) -> Bool
      /// The ids of every goal, task and life area on this phone.
      static func knownIds(context: ModelContext) -> Set<UUID>
      /// Parents that will never arrive: no insert waiting and no row on this phone.
      static func lostParents(_ parents: [UUID], unpushedInserts: Set<UUID>, known: Set<UUID>) -> [UUID]
      /// Sets the row's links to `lost` to nil and leaves its dirty flag set, so the null is what gets sent.
      static func clearLinks(to lost: [UUID], table: String, id: UUID, context: ModelContext)
  }
  @discardableResult func start(userId: UUID) async -> Bool     // true when the first pull really ran
  @discardableResult func resync() async -> Bool
  // AppState:  var initialSyncFinished = false
  ```

**Why.** The queue is pushed oldest first (`SyncEngine.swift:141-147`), so a parent queued before its child goes first. But each change is pushed on its own: when the parent's push fails, the child is still tried, the foreign key refuses it, and an update that fails ten times is dropped (`:179`), which would silently lose a link. So a change whose row points at a parent with an insert still waiting is skipped for this pass, without counting an attempt.

**The parent that never comes.** Inserts are never dropped by the engine, so a waiting child is released when its parent's insert lands. The one way a parent can be gone for good is that its row is no longer on this phone at all: it was deleted on another device and the pull removed it, or its row and queued insert were taken back. Such a parent has no insert waiting and is not in `knownIds`. The child does not wait for it: the link is set to nil on the local row (`clearLinks`), the row keeps its dirty flag, and it is sent with that column null, so the phone and the server agree and the child is never stuck behind a foreign key.

- [ ] **Step 1: Write the failing tests:**
  - `aTaskNamesItsGoalItsSourceAndItsArea`: for a task with `linksDirty`, `parentIds(table: "tasks", …)` is `[goalId, sourceId, areaId]` without the nils. `aCleanRowNamesNoParents`: the same task with `linksDirty == false` → `[]`. `aGoalNamesItsArea`: with `areaDirty` → `[areaId]`, without → `[]`. `otherTablesNameNoParents` (`"task_commitments"` → `[]`).
  - `aChildWaitsForItsUnpushedParent`: `mustWait(parents: [g], unpushedInserts: [g])` is true; with `unpushedInserts: []` false; with `parents: []` false.
  - `aParentThatIsGoneIsLost`: `lostParents([g], unpushedInserts: [], known: []) == [g]`; with `known: [g]` → `[]`; with `unpushedInserts: [g]` and `known: []` → `[]` (still waiting, not lost).
  - `aLostLinkIsClearedAndTheNullIsSent`: a task with `linksDirty`, `goalId = g` (no such goal in the store) and `sourceId = s` (a task in the store); `clearLinks(to: [g], table: "tasks", …)` → `goalId == nil`, `sourceId == s`, `linksDirty` still true, and its serialized row has `goal_id == .null` and `source_id == .string(s.uuidString)`.
  - `theQueueKeepsParentsFirst`: `PlanWriter.createGoal` then `createPeriodTask`; the pending changes sorted by `createdAt` list the `goals` insert before the `tasks` insert.
  - `aFreshAppHasNotSynced`: `AppState().initialSyncFinished == false`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/SyncOrderTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement the order.** In `pushPendingChanges`, build `unpushedInserts` from the fetched changes of type `insert`. Before each non-delete change: `let parents = parentIds(…)`; `continue` when `mustWait(parents:unpushedInserts:)`; then `clearLinks(to: lostParents(parents, unpushedInserts:, known: knownIds(context:)), …)`, logging each lost link through `syncLog`; then push. Remove a record id from `unpushedInserts` when its insert succeeds.
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
      static let maxTitle = 200; static let maxAreaName = 24
      struct Said: Equatable { let title: String; let day: Date? }
      static func tidy(_ raw: String) -> String?
      static func said(_ raw: String, level: WalkLevel, today: Date, calendar: Calendar = PlanCalendar.calendar,
                       detect: (String) -> Date? = WalkWords.detectedDate) -> Said?
      static func detectedDate(_ tail: String) -> Date?
      static func tag(for day: Date, today: Date, calendar: Calendar = PlanCalendar.calendar) -> String
  }
  ```

**The rules** (spec: "tidies spoken filler and pulls out a day … it doesn't rewrite"; D8).
- `tidy`: split the text on whitespace into words. A word's *core* is the word lowercased with any `,` `.` `…` `!` `?` at its ends removed. If there are no words, or every word's core is in `fillers` or `softFillers`, return nil: fillers alone are nothing to plant. Otherwise, repeatedly: drop the first word when its core is in `fillers`; drop it when its core is in `softFillers` and either the word ends with a comma or the next word's core is in `fillers` (a soft filler otherwise stays, because "Like myself again" and "Well water tested" are real titles). Then join the words with single spaces, drop one trailing full stop, capitalise the first letter, and if the result is longer than `maxTitle` cut it at the last space before that (at `maxTitle` when there is none). Return nil when no letter or digit is left. Nothing else changes.
- `said`: for every level, `title = tidy(…)`. A day is looked for only on `.week`, and only at the end: (a) if there is a comma, the text after the last comma; otherwise (b) the last one, two or three words. That tail is a day when, after an optional leading `on`, `this` or `by`, it is exactly `today`, `tonight`, `tomorrow`, `weekend`, `the weekend`, or a weekday name; or (comma tail only) when `detect(tail)` returns a date. `today` / `tonight` → today; `tomorrow` → the next day; a weekday → its next date on or after today (today's own name means today); the weekend → today on a Saturday or Sunday, else the coming Saturday. The day leaves the title, with the comma and any `on` / `this` / `by` before it. If that leaves nothing, the whole text is the title and the day is kept.
- On `.today` nothing is pulled out: whatever is said is the first thing, whole, and the reducer dates it today (Task 10).
- `detectedDate` is `CaptureParser.parse(tail)`: its date when the parser's title equals the tail (the whole tail was the date), else nil.
- `tag` is uppercase, as the banner shows it (contract §5, line 320): `TODAY`, `TOMORROW`, a weekday name within the next six days (`TUESDAY`), else `EEE d` uppercased (`MON 23`). Nothing downstream changes its case.

- [ ] **Step 1: Write the failing tests** (`today` = Friday 2026-11-13; `detect` injected as `{ _ in nil }` unless said):
  - `fillerGoes`: `tidy("um finish the bathroom.") == "Finish the bathroom"`; `tidy("So, um, feel strong again") == "Feel strong again"`; `tidy("Okay, run a 5K.") == "Run a 5K"`; `tidy("  read more  ") == "Read more"`.
  - `realWordsStay`: `tidy("like myself again") == "Like myself again"`; `tidy("well water tested") == "Well water tested"`; `tidy("so much more reading") == "So much more reading"`; `tidy("What next?") == "What next?"`.
  - `nothingToPlant`: `tidy("")`, `tidy("   ")`, `tidy("um")`, `tidy("uh, um.")`, `tidy("…")`, `tidy("okay")`, `tidy("so, um")` and an emoji-only string are all nil; a title with an emoji among its words is unchanged.
  - `longSpeechIsCutAtAWord`: 60 repetitions of "walk more " give a title of at most 200 characters ending in a whole word; one 260-letter word gives 200 characters.
  - `theDepositToday`: `said("the deposit, today", level: .week, …) == Said(title: "The deposit", day: 2026-11-13)`.
  - `trailingDays`: "Gym on Tuesday" → ("Gym", 2026-11-17); "call the tile shop tomorrow" → ("Call the tile shop", 2026-11-14); "choose the tile, Saturday" → ("Choose the tile", 2026-11-14); "breakfast out this weekend" → ("Breakfast out", 2026-11-14); "measure the wall on Friday" → ("Measure the wall", 2026-11-13); "ring mum, Monday" → ("Ring mum", 2026-11-16).
  - `aDayInTheMiddleStays`: "Friday night dinner with Sam" → that title, day nil; "plan Saturday breakfast out" → "Plan Saturday breakfast out", nil.
  - `aDayAloneIsATitle`: `said("today", level: .week, …) == Said(title: "Today", day: 2026-11-13)`.
  - `upperLevelsKeepTheirWords`: `said("ship the deck by Friday", level: .month, …)` → title "Ship the deck by Friday", day nil. `todayKeepsItsWords`: `said("call mum tomorrow", level: .today, …)` → title "Call mum tomorrow", day nil.
  - `aWrittenDateAfterAComma`: with `detect` returning 2026-11-20 for "November 20", "pay the deposit, November 20" → ("Pay the deposit", 2026-11-20); the same words with no comma keep the whole title and no day.
  - `tags`: today → "TODAY"; +1 → "TOMORROW"; 2026-11-17 → "TUESDAY"; 2026-11-23 → "MON 23".
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
- Consumes: Task 1's fields; `WalkItem`, `WalkArea`, `WalkPeriods`; `PlanWriter` (with its `complete(_:)`, :516), `ModelContext.queueSync` / `queueKeyedDelete` (`R/Models/PendingChange.swift:39-60`).
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
      func toggleDone(_ id: UUID)                      // any task, planted by the walk or not
  }
  ```
  A struct over one small reference box (the removed-row snapshots and the ids of the areas it made), so copies share them.

**What each call writes.**
- `links`: year → (nil, nil). Season → (goalId: parentId, nil). Month and week → (goalId: parentGoalId, sourceId: parentId).
- `ensureArea`: nothing if a `GoalArea` with that id exists; else insert one with `context = "personal"` and `sortOrder` one more than the highest among this person's areas (0 when none), queue its insert, and remember that this walk made it. Always called before the row that points at it, so the area is queued first.
- `dropAreaIfUnused`: does nothing unless this walk made the area and no goal or task names it. Then, if the area's insert is still queued, the queued change and the local row are both deleted, so nothing about it reaches the server; otherwise the local row is deleted and a `goal_areas` delete is queued.
- `create`: year → `PlanWriter.createGoal(name:, notes: nil, context: "personal", year: periods.year, id: item.id)`, then `areaId` and `areaDirty = true`. Season → `createPeriodTask(level: "season", periodStart: periods.season.start, context: "personal", id:)`. Month → `level: "month", periodStart: periods.monthStart`. Week → `level: "week", periodStart: PlanCalendar.weekStart(item.day ?? periods.today)`, then, when it has a day, `planTask(task, on: day, focusToday: false)`: a week task said for today is on today but is not the first thing. On every task: `goalId` / `sourceId` from `links` (the parent's goal id read from the parent's row), `areaId`, `linksDirty = true`.
- `remove`: when the row's own insert is still queued, delete every queued change for it and for its commitments and focus rows, and the local rows, so nothing reaches the server; otherwise delete locally and queue a delete (as `TaskViewModel.deleteTask` does; the same for a `Goal`). Rows that pointed at it (`goalId` or `sourceId`) lose that link locally with `linksDirty = true` and a queued update, mirroring the server's `SET NULL`. The snapshot holds the row's fields, its commitment periods, whether it was focused today, and the ids it unlinked.
- `restore`: re-inserts the row with the same id (queued as an insert), its commitments and focus, and puts the unlinked children's links back.
- `setFirstThing`: removes today's `TaskFocus` for `previous` (through `queueKeyedDelete`, as `PlanWriter.unfocus` does); for `id`, if the task is not on today `planTask(task, on: periods.today, focusToday: true)`, else insert today's `TaskFocus` and queue it. `toggleDone` finds the task by id and calls `PlanWriter(context:userId:).complete(task)`; an id that is not a task does nothing.

- [ ] **Step 1: Write the failing tests** (in-memory container: `SymphonyTask`, `Goal`, `GoalArea`, `TaskCommitment`, `TaskFocus`, `PendingChange`, `Routine`, `ActionableInstance`, `FamilyMember`; periods for 2026-11-13):
  - `linkPlan`: the four cases of `links` above.
  - `aYearGoalIsAPersonalGoalForTheYearAhead`: `year == 2027`, `context == "personal"`, `scope == "individual"`, `areaId` set, `areaDirty`; its serialized insert row has `area_id`.
  - `theChainLinksUp`: `ensureArea`, then year Y, season S under Y, month M under S, week W under M with day today. S: bucket "quarter", `seasonStart` 2026-12-01, `goalId == Y.id`, `sourceId == nil`, `isGoal == false`, one open "season" commitment. M: bucket "month", `monthStart` 2026-11-01, `sourceId == S.id`, `goalId == Y.id`. W: bucket "timed", `scheduledFor` today, `isAllDay`, `sourceId == M.id`, `goalId == Y.id`, a "week" commitment for 2026-11-08, and **no** `TaskFocus`. Every task has `context == "personal"` and `linksDirty`. The pending changes in `createdAt` order have `goal_areas` before `goals` before S's `tasks` insert before M's before W's.
  - `aWeekTaskWithNoDayIsOnTheWeek`: bucket "week", `weekStart` 2026-11-08, `scheduledFor == nil`. `aDayNextWeekGoesToThatWeek`: day 2026-11-16 → `scheduledFor` that day, `weekStart` 2026-11-15.
  - `pullingUpAnUnsentRowLeavesNothingBehind`: create S then `remove` → no `SymphonyTask`, no `TaskCommitment`, and no `PendingChange` for either. `pullingUpASentRowQueuesADelete`: empty the queue after creating S (as if pushed), `remove` → one `tasks` delete queued.
  - `pullingUpAParentUnlinksItsChildrenAndUndoRelinksThem`: remove S with M under it → `M.sourceId == nil`, `M.linksDirty`; `restore(S.id)` → S exists with the same id and title, `M.sourceId == S.id`.
  - `anAreaIsMadeOnceAndInOrder`: `ensureArea` twice makes one row; a second area gets `sortOrder` 1; `dropAreaIfUnused` leaves an area that a goal names.
  - `droppingAnUnsentAreaLeavesNothingQueued`: `ensureArea`, then `dropAreaIfUnused` → no `GoalArea` and no `PendingChange` for `goal_areas`. `droppingASentAreaQueuesADelete`: empty the queue after `ensureArea` (as if pushed), then drop → no `GoalArea`, one `goal_areas` delete queued.
  - `anAreaItDidNotMakeIsNeverDropped`: a `GoalArea` already in the store, unused, survives `ensureArea` + `dropAreaIfUnused` with its id.
  - `movingSetsTheAreaAndMarksItToSend`: `setArea` on a goal sets `areaDirty`, on a task `linksDirty`, each with one queued change.
  - `firstThingMovesTheMark`: `setFirstThing(W.id, previous: nil)` → one `TaskFocus` today; `setFirstThing(W2.id, previous: W.id)` → the only focus today is W2's, and W is still dated today. `tickingTogglesAnyTask`: `toggleDone` on a task the writer did not create sets `completed`, and again clears it; an unknown id changes nothing.
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
- `items`: only rows where `userId == me`, `context` is "personal" or nil, and (tasks) `dismissedAt == nil` and `parentTaskId == nil`. Year: goals with `year == periods.year` and `status == "active"`, by `sortOrder`. Season: bucket "quarter" with `seasonStart` on `periods.season.start`. Month: bucket "month" with `monthStart` on `periods.monthStart`. Week: a task is found by its link, not by the week it sits in: it must be in `planted` or have a `sourceId` that is a month item shown, and then it loads when it is dated from `periods.weekStart` through the last day of the following week (13 days later), or is undated with `weekStart` on `periods.weekStart`. So a task said on Friday for next Tuesday is still on the mountain after a reload, with its day. The week's other to-dos are not the walk's to show. `parentId` is `goalId` for a season item and `sourceId ?? goalTaskId` for month and week (the web's reading order, `journalGroups.ts:33`), kept only when that parent is among the items. `mine` is `planted.contains(id)`; `day` is the task's date; `done` its `completed`.
- `forGoal`: the task's own `goalId` names a goal → that goal's name. Otherwise climb `sourceId ?? goalTaskId`, at most four steps, until a row whose `goalId` resolves. A link from a row to itself counts as no link, and the climb stops rather than visit a row twice. Failing a goal, the answer is the title of the highest row reached other than the task itself; nil when the task has no parent.
- `rows`: today's tasks straight from the store, whether or not the walk planted them: `userId == me`, `context` "personal" or nil, dated today, `dismissedAt == nil`, `parentTaskId == nil`; the first thing first, then by `createdAt`. `Row.id` is the task's id and `Row.done` its `completed`. Work and Family tasks are not listed, as nowhere else in the walk. `nextToWalk`: the first year item with no season item whose `parentId` is it.

- [ ] **Step 1: Write the failing tests:**
  - `sixDefaultsThenMyOwn`: no rows → the six names in order with distinct ids; rows "Faith" and "Learning" of mine follow; a ninth label is left out.
  - `anExistingAreaIsReusedByName`: my personal row "health" gives the "Health" label that row's id; my row "Work" with `context == "work"` does not (a new id); a partner's "Home" does not.
  - `onlyPlantedRowsAreMine`: a personal year goal for 2027 not in `planted` loads with `mine == false`; one in `planted` with `mine == true`; a goal with `context == "family"`, an archived goal, a 2026 goal and another person's goal do not load.
  - `eachLevelComesFromItsPeriod`: a "quarter" task stamped 2026-12-01 loads as season and one stamped 2026-09-01 does not; a month task for November loads; a week task loads only when planted or linked to a shown month item; a let-go task never loads.
  - `aTaskSaidForNextWeekIsStillThere` (periods for Friday 2026-11-13): a planted task dated Tuesday 2026-11-17 (`weekStart` 2026-11-15) loads as a week item with `day` 2026-11-17; so does an unplanted one whose `sourceId` is a shown month item; one dated 2026-11-22 does not; an undated one with `weekStart` 2026-11-15 does not.
  - `parentsResolveOrAreNil`: season `parentId == goalId`; month reads `sourceId`, then `goalTaskId`; a link to a row that is not shown gives nil.
  - `forWalksUp`: week → month → season by `sourceId` alone, the season naming year goal "Feel strong again" → "Feel strong again"; a chain that ends at a season item with no year goal gives that item's title; an unlinked task gives nil; a row whose only link is to itself gives nil; two rows that link to each other give the other's title and do not loop.
  - `todaysRowsFirstThingFirst`: three tasks today, the marked one first, one of them never planted by the walk; another person's task, a task with `context == "family"` and one dated tomorrow are absent.
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
      static let undoMs = 7000; static let noteMs = 3200; static let calendarNoteMs = 6000    // the Undo pill, a note, the calendar line
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
      var note: String?; var undoShowing = false
      var undo: [WalkUndoEntry] = []         // in memory only, by design: never saved, so a relaunch starts with nothing to undo
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
      case sheetHandle, rowToggled(UUID), walkAnother, goToToday             // rowToggled carries a task id
  }
  enum WalkTimer: Equatable { case hold, undo, note }
  enum WalkWrite: Equatable {
      case area(WalkArea), dropArea(UUID), create(WalkItem, parent: WalkItem?), remove(UUID, WalkLevel), restore(UUID)
      case setArea(UUID, WalkLevel, UUID?), firstThing(UUID?, previous: UUID?), toggleDone(UUID)
  }
  enum WalkEffect: Equatable {
      case sound(WalkSoundName, afterMs: Int), listen(Bool), write(WalkWrite)
      case timer(WalkTimer, ms: Int?)        // nil cancels
      case askCalendar, save, end(WalkStatus)
  }
  enum WalkUndoEntry: Equatable {
      case plant(UUID), nameArea(WalkArea), keep(UUID), unkeep(UUID, index: Int)
      case move(UUID, from: UUID?, keptAdded: UUID?), pullUp(WalkItem, index: Int, wasFirstThing: Bool)
      case firstThing(previous: UUID?, created: UUID?)
  }
  ```
  This task implements `act` for `.quick`, `.full`, `.notNow`, `.back`, `.next`, `.nudge`, `.examples` and `apply` for `.areaTapped`, `.bannerTapped` (focusing a parent), `.noteExpired`. Tasks 10, 11, 17 and 20 add the rest.

**The rules** (contract §2 "Advancing", §3 "Triggers", §7 "Actions"; D14).
- `quick` / `full`: set `depth`, `ground = true`, `kept = []`, `focusArea = nil`, `step = 1`, and emit `.save`: choosing a depth is the moment a position is first saved. `notNow` (Welcome only): `[.end(.left)]`.
- Ground: `areaTapped` toggles the area in `kept` (append / remove), pushes `.keep` or `.unkeep`, and emits `.sound(.tick, afterMs: 0)`, `.timer(.undo, ms: WalkState.undoMs)`, `.save`. No row is written for a kept area until something is planted on it.
- `next` on ground: `ground = false`. Whole year: `focusArea = kept.first`, `tour` = the rest of `kept`. Quick: `focusArea = nil`.
- `next` with a non-empty `tour`: take its first stop; on Year it becomes `focusArea`, on Season `focus[.season]`.
- `next` otherwise: `step = min(6, step + 1)`, clearing `focusArea`, `selected`, `expanded`, `undoShowing`, `typing`, and setting `orb = .idle`, `sheetOpen = false`. Entering Season in a whole-year walk: `tour` = the year items in column order (the order of `areas`, unlabeled last, planting order inside a column); the first becomes `focus[.season]`. Entering Month, Week or Today in either depth, or Season in a quick walk, with no focus remembered for that step: focus the item most recently planted on the level above (`lastPlanted`), so the next flag links to it. Entering Today with `env.canAskCalendar`: `calendarOffer = true`.
- `back`: Year → ground (`focusArea = nil`, `tour = []`); ground → Welcome; otherwise `step - 1`. Focus per step is remembered; a tour starts again when its step is entered again.
- `areaTapped` on Year (not ground), for a kept area only: toggles `focusArea`. On other steps it does nothing.
- `bannerTapped` on an item one level above the step's level: toggles `focus[level]`.
- `nudge`: Year → the next kept area after `focusArea` in `kept` order, starting at the first, wrapping. Steps 2 to 5 → the next item of the level above: nil → first → … → last → first.
- `examples`: toggles `step` in `examplesOn`; ignored on Today and on ground.
- Every change of step, depth, focus or kept emits `.save`.

- [ ] **Step 1: Write the failing tests** (a fixture with three kept areas and the mockup's script as items, `Walk.dc.html:230-234`):
  - `quickStartOpensTheGround` (its effects contain `.save`); `notNowLeaves` (`[.end(.left)]`).
  - `keepingIsATapAndCanBeTakenBack`: tap Health → kept, effects contain `.sound(.tick, afterMs: 0)`; tap again → not kept; the undo stack has two entries.
  - `quickWalksOneGoalDown`: with `lastPlanted[.year]` "Feel strong again", `next` from Year → step 2 with `focus[.season]` that goal; with nothing planted on Year, no focus.
  - `wholeYearVisitsEachArea`: kept [Home, Health, People] in that order: leaving ground focuses Home with `tour == [Health, People]`; `next` → Health; `next` → People; `next` → step 2.
  - `wholeYearWalksEachYearGoalThroughTheSeason`: arriving at Season focuses the first year item in column order and `tour` holds the others; `next` moves to each; after the last, step 3. `wholeYearFocusesTheLastPlantedFromMonthDown`: in a whole-year walk with `lastPlanted[.season]` set, arriving at Month focuses it; the same from Month to Week and from Week to Today.
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
- Consumes: `WalkState`, `WalkPeriods`, `WalkLevel`, `CompassPoint`, `WalkAction`.
- Produces (the one place a string of the walk is written; every later task uses these names and types no string of its own):
  ```swift
  enum WalkCopy {
      static let shortLength = 40
      static let wordmark = "Symphony"
      static let welcomeTitle = "Let’s start up high and walk down to today."
      static let welcomeSub = "Plant a flag for what matters, then follow it down."
      static func eyebrow(_ s: WalkState, _ p: WalkPeriods) -> String
      static func question(_ s: WalkState, _ p: WalkPeriods) -> String
      static func why(_ s: WalkState, _ p: WalkPeriods) -> String
      static func hint(_ s: WalkState) -> String
      struct Point: Equatable { let at: CompassPoint; let label: String; let action: WalkAction; let symbol: String }
      static func points(_ s: WalkState) -> [Point]
      static func phrase(for areaName: String) -> String
      static func examples(_ level: WalkLevel) -> [String]
      static func short(_ title: String) -> String            // unchanged up to shortLength characters; longer: the first 39, then "…"
      // notes: the reducer puts these in `state.note`
      static func placed(_ areaName: String) -> String
      static let nothingToPlant = "Nothing to plant yet. Hold and speak, or slide left to type."
      static let speechOff = "Speaking isn’t available here, so type it."
      static let ridgeFull = "The ridge is full. Tap a peak to let one go first."
      static let calendarLine = "See your calendar on Today too"
      // the hint row and the banners
      static let undo = "Undo"; static let moveTo = "Move to"; static let pullUp = "Pull it up"
      static let typePlaceholder = "Type it, then return"; static let firstThingTag = "FIRST THING"
      // the ending
      static let lookBack = "Look back up: that’s your plan."; static let heresToday = "Here’s today."
      static let showMyDay = "Show my day"; static let lookBackHandle = "Look back up at your plan"
      static let todayEyebrow = "Today"; static let walkAnother = "Walk another one down"; static let goToToday = "Go to Today"
      static let thatsTheDay = "That’s the day."; static let nothingToday = "Nothing planted for today yet."
      static func nextFlag(_ name: String) -> String          // "Next flag: <name>"
      static func forGoal(_ name: String) -> String           // "for <name>"
      static func nextEvent(_ time: String) -> String         // "Next · <time>"
      static func ringLabel(done: Int, total: Int) -> String  // "1 of 3 done"
      // Settings
      static let replayButton = "Walk the mountain again"
      static let replayFooter = "Start at the top and walk down to today. Nothing you have is changed."
      // VoiceOver
      static let orbLabelWelcome = "Hold to begin"; static let orbLabel = "Hold and speak to plant a flag; tap for more"
      static let rowDone = "Done"; static let rowOpen = "Not done"
      static func levelName(_ level: WalkLevel) -> String     // "Year", "Season", "Month", "Week", "Today"
      enum BannerRole: Equatable { case mine, plain, focusable, focused, firstThing, example, stub(Int) }
      static func bannerLabel(_ text: String, level: WalkLevel, tag: String?, role: BannerRole) -> String
      static func areaHint(ground: Bool, kept: Bool, focused: Bool) -> String
      static func rowLabel(_ title: String, forGoal: String?) -> String
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
- `points`. Welcome: S `Quick start` (.quick, `figure.walk`), E `Plan my whole year` (.full, `mountain.2`), N `Not now` (.notNow, `xmark`). Ground: N `Start` (.back), S `Plant goals` when anything is kept else `Skip` (.next), W `Name your own` (.type). Steps 1 to 5: N `Start` on Year else `Back up` (.back, `arrow.up`); S `Walk on` when the step's level has a flag (on Today: a first thing) else `Skip` (.next, `arrow.down`), except on Today with a focused week flag that is not the first thing, where S is `Start there` (.startThere); W `Type it` (.type, `keyboard`); NE `Nudge me` (.nudge, `sparkle`); E `Examples` / `Hide examples` on steps 1 to 4 (.examples, `flag`), and on Today `Calendar` (.calendar, `calendar`) while `calendarOffer`. On every set but Welcome: NW `Undo` (.undo, `arrow.uturn.backward`) while the undo stack is not empty. Step 6: none.
- `bannerLabel`, where `L` is `levelName(level)` and `T` is the text, followed when there is a tag by `, ` and the tag with only first letters capital (`TUESDAY` → `Tuesday`, `MON 23` → `Mon 23`): `.mine` → `L: T, tap to move or pull up`; `.plain` → `L: T`; `.focusable` → `L: T, tap to focus`; `.focused` → `L: T, focused, tap to let go`; `.firstThing` → `Today: <text>, first thing`; `.example` → `Example: <text>, tap to make it yours`; `.stub(n)` → `<n> more, tap to show`.
- `areaHint`: on ground `Tap to keep`, kept `Tap to let go`; off the ground `Tap to look closer`, focused `Tap to step back`. `rowLabel`: `<title>, for <goal>`, or the title alone.

- [ ] **Step 1: Write the failing tests:**
  - One per table row for 2026-11-13 (Season is the coming one: eyebrow `Winter · Dec 1 to Feb 28`, question `And this winter? What’s it about?`; Month `What’s one thing for the rest of November?`, `Small enough to finish by the 30th.`; Week `This week · to Sat 14`; Today `Friday, 13 November`); the coming-month wording on 2026-11-25 (`What’s one thing for December?`, `…by the 31st.`); the current-season eyebrow on 2026-10-01 (`This season · to Nov 30`).
  - Each focused question, including `What about the people in your life, this year?` and a named area `What about creative work, this year?`; the appended why sentence present and absent; `placed`; the example lists.
  - `shortQuotesFortyCharacters`: a 40-character title is unchanged; a 41-character and a 70-character title each become their first 39 characters and `…`.
  - Every `hint` line; each `points` set, including `Skip` → `Walk on`, `Start` on Year, no Examples on Today, `Calendar` only while offered, `Undo` only with something to undo, and `Start there`.
  - `theNamedStringsAreExact`: every `static let` above equals the literal written beside it; `nextFlag("Finish the bathroom") == "Next flag: Finish the bathroom"`; `forGoal("Feel strong again") == "for Feel strong again"`; `nextEvent("2:30 pm") == "Next · 2:30 pm"`; `ringLabel(done: 1, total: 3) == "1 of 3 done"`; `levelName` gives `Year`, `Season`, `Month`, `Week`, `Today`.
  - `whatVoiceOverSays`: `bannerLabel("Run a 5K", level: .year, tag: nil, role: .mine) == "Year: Run a 5K, tap to move or pull up"`; `("Gym", .week, "TUESDAY", .mine)` → `Week: Gym, Tuesday, tap to move or pull up`; `.plain` → `Year: Run a 5K`; `.focusable` → `Year: Run a 5K, tap to focus`; `.focused` → `Year: Run a 5K, focused, tap to let go`; `("Gym induction", .today, WalkCopy.firstThingTag, .firstThing)` → `Today: Gym induction, first thing`; `.example` → `Example: Run a 5K, tap to make it yours`; `.stub(3)` → `3 more, tap to show`; the four `areaHint` answers; `rowLabel("Lift, 30 minutes", forGoal: "Feel strong again") == "Lift, 30 minutes, for Feel strong again"` and with nil the title alone.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkCopyTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: the questions, why lines, hints and compass points"`

### Task 10: Planting, examples, undo, move and pull up
**Files:**
- Create: `R/Walk/Core/WalkState+Plant.swift`
- Test: `SymphonyOSTests/WalkPlantTests.swift`

**Interfaces:**
- Consumes: `WalkWords.said`, `WalkWords.tidy`, `WalkWords.maxAreaName` (Task 4); `WalkClassifier.place` (Task 5); `WalkLoad.maxAreas` (Task 7); `WalkState`, `WalkState.undoMs`, `WalkState.noteMs`, the event, effect, write and undo types (Task 8); `WalkCopy.placed`, `WalkCopy.nothingToPlant`, `WalkCopy.ridgeFull` (Task 9).
- Produces: `extension WalkState { mutating func plant(_ raw: String, _ env: WalkEnv) -> [WalkEffect] }`; `apply` for `.exampleTapped`, `.bannerTapped` (own level), `.stubTapped`, `.moveTo`, `.pullUp`, `.undo`, `.undoExpired`, `.rowToggled`; `act` for `.undo`, `.startThere`.

**The rules** (spec "Where a goal goes…", "Undo and fix"; D9 to D13; contract §6, §9, §10).
- Nothing to plant (`WalkWords.said` is nil): `note = WalkCopy.nothingToPlant` with `.timer(.note, ms: WalkState.noteMs)`; nothing is written.
- On ground the words name an area: `WalkWords.tidy`, cut to `WalkWords.maxAreaName` characters. A label with that name (without case) is simply kept. Otherwise, with `WalkLoad.maxAreas` labels already, `note = WalkCopy.ridgeFull` with the note timer; else append the label and keep it, push `.nameArea`. Effects: `.sound(.plant, afterMs: 0)`, the undo timer, `.save`.
- On Year: `WalkClassifier.place(title, kept: keptAreas, focus: focusArea)` decides the area; `moved: true` sets `note = WalkCopy.placed(name)` with the note timer. Effects, in order: `.write(.area(a))` when there is an area, `.write(.create(item, parent: nil))`, `.sound(.plant, afterMs: 0)`, timers, `.save`.
- On Season, Month, Week: the parent is the focused item (`focus[level]`), or none; the item takes the parent's area and is never classified; Week keeps the day `WalkWords.said` pulled out.
- On Today: a new week-level item whose title is everything that was said (`WalkWords.said(…, level: .today)` pulls nothing out) and whose `day` is `env.periods.today`; with a week flag focused it takes that flag's area and parent. It becomes the first thing: push `.firstThing(previous:, created:)`, effects `.write(.create…)` then `.write(.firstThing(id, previous:))`.
- `startThere` (Today, a focused week flag): that task becomes the first thing: `.write(.firstThing(id, previous:))`, push `.firstThing(previous:, created: nil)`. There is one first thing: marking another moves the mark and leaves the earlier task where it is.
- Every plant sets `lastPlanted[level]` and `undoShowing = true`, emits `.timer(.undo, ms: WalkState.undoMs)`, pushes `.plant(id)` and clears `selected`.
- `exampleTapped(text)`: only while examples are on for this step; planted through the same path as spoken words (so "Gym on Tuesday" becomes "Gym" on Tuesday), with the area of the focused peak or parent and no classification; effects start with `.sound(.poles, afterMs: 0)` and the plant sound comes at 160 ms.
- `bannerTapped` on an item of the step's own level: ignored unless `mine`; else toggles `selected`, `.sound(.tick, afterMs: 0)`, hides the Undo pill. `stubTapped` sets `expanded` (again to close) and makes that column the open one (`lastPlanted[level]` = its newest item).
- `moveTo(area)`: the selected item's area changes; an area not kept is kept; effects `.write(.area)`, `.write(.setArea)`, `.sound(.poles, afterMs: 0)`, `.sound(.plant, afterMs: 140)`; push `.move`; clear `selected`.
- `pullUp`: removes the selected item (`.write(.remove)`, `.sound(.poles, afterMs: 0)`), drops any focus pointing at it and clears `firstThing` if it was that; items that named it as parent stay, with `parentId = nil`; push `.pullUp`.
- `undo` (the pill or the compass point) pops the newest entry and reverses it: `.plant` → remove, then `.write(.dropArea)` for its area; `.nameArea` → remove the label and unkeep; `.keep` / `.unkeep` → the opposite, at its old place; `.move` → the old area back, the area the move kept unkept, `.write(.dropArea)`; `.pullUp` → `.write(.restore(id))`, the item back at its index with its children's `parentId` restored; `.firstThing` → the previous mark back and a created task removed. Always `.sound(.poles, afterMs: 0)` and `.save`. With an empty stack `undo` does nothing. `undoExpired` only hides the pill: the stack stays for as long as the app keeps running the walk.
- `rowToggled(taskId)` (the ending sheet): emits `.write(.toggleDone(taskId))` for any id, and flips `done` on the item with that id when there is one. The sheet's rows and ring are read back from the store (Task 20), so a task the walk never planted is ticked the same way.

- [ ] **Step 1: Write the failing tests:**
  - `aGoalGoesToItsAreaEvenWhenAnotherPeakIsFocused`: focus Health, plant "finish the bathroom." → an item "Finish the bathroom" on Home, `note == WalkCopy.placed("Home")`, and `.write(.area(home))` comes before `.write(.create(…))`.
  - `theFocusedPeakCatchesAnUnclearGoal`; `withNoFocusItGoesOnTheUnlabeledPost` (`areaId == nil`).
  - `lowerLevelsInheritAndAreNeverClassified`: on Season with a Health parent focused, "clear out the garage" lands on Health with `parentId` the parent; with no parent focused, no area and no parent.
  - `aWeekTaskKeepsItsDay`: "the deposit, today" → title "The deposit", `day` today.
  - `theFirstThingIsOneTask`: on Today, plant → a week-level item dated today and `firstThing` it; plant again → `firstThing` is the second, effects contain `.write(.firstThing(second, previous: first))`, both items remain. `theFirstThingKeepsItsWords`: on Today, plant "call mum tomorrow" → title "Call mum tomorrow", `day` today. `startThereMarksTheFocusedTask`.
  - `namingAnAreaKeepsIt`; `namingAnExistingAreaJustKeepsIt`; `aLongAreaNameIsCut` (40 letters → `WalkWords.maxAreaName`); `theRidgeIsFull`: with `WalkLoad.maxAreas` labels, naming another adds none and `note == WalkCopy.ridgeFull`.
  - `lettingGoWithNothingPlantsNothing`: `plant("um")` → no item, no `.write`, `note == WalkCopy.nothingToPlant`, effects contain `.timer(.note, ms: WalkState.noteMs)`.
  - `examplesPlantAsYourOwn`: "Gym on Tuesday" on Week → "Gym" with Tuesday's date, `mine`, sounds `.poles` at 0 and `.plant` at 160; ignored when examples are off.
  - `aFlagIDidNotPlantCannotBeSelected`: tapping an item with `mine == false` leaves `selected` nil.
  - `movingToAnUnkeptAreaKeepsIt`; `pullingUpClearsFocusAndFirstThing`.
  - `undoStepsBackThroughEverything`: name an area, walk on, plant, move, pull up; four undos return `items`, `kept` and `areas` to the start; the third's effects contain `.write(.remove…)`; a fifth does nothing.
  - `undoIsStillThereAfterThePillHides`: `undoExpired`, then `.undo` still reverses the plant. `undoOfAPullUpRestoresTheRowAndItsChildren`. `everyPlantStartsTheUndoPill`: effects contain `.timer(.undo, ms: WalkState.undoMs)`.
  - `tickingARowAsksTheWriterWhoeverPlantedIt`: `rowToggled(id)` for an id that is no item → `[.write(.toggleDone(id))]` and `items` unchanged; for an item's id the same effect and its `done` flipped.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkPlantTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `WalkPlantTests` and `WalkStepsTests`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Walk: plant, place by words, examples, move, pull up, and undo for all of it"`

### Task 11: The orb: hold, slide, tap, speak, type
**Files:**
- Create: `R/Walk/Core/WalkOrb.swift`, `R/Walk/Core/WalkState+Orb.swift`
- Test: `SymphonyOSTests/WalkOrbTests.swift`

**Interfaces:**
- Consumes: `WalkState` and its types (Task 8); `WalkCopy.points`, `WalkCopy.speechOff` (Task 9); `WalkState.plant`, `WalkState.noteMs` (Tasks 10, 8).
- Produces (`holdMs` is the one hold threshold; the view and the model use it by name):
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
- `orbDown`: ignored while speaking or typing. Orb → `.holding(hover: nil)`. On ground and steps 1 to 5: `.sound(.bag, afterMs: 0)`, `.sound(.poles, afterMs: 120)`, `.timer(.hold, ms: WalkOrb.holdMs)`.
- `orbHeld` (still holding, nothing hovered, not Welcome): orb → `.speaking(live: "")`, effects `.listen(true)`, `.sound(.unfurl, afterMs: 280)`. `heard(text)` while speaking sets `live`.
- `speechUnavailable`: orb → `.idle`, `typing = ""`, `note = WalkCopy.speechOff` with `.timer(.note, ms: WalkState.noteMs)`, `.listen(false)`.
- `orbMoved(location)`: the hovered point is `point(at:among:)` over `WalkCopy.points(self)`. Sliding out while speaking cancels the speech (`.listen(false)`, live cleared) and the points show again. Entering a point emits `.sound(.tick, afterMs: 0)`.
- `orbUp(heldMs)`, first match: hovering a point → `act` its action; speaking → `.listen(false)` then `plant(live, env)`; `heldMs < WalkOrb.holdMs` → toggle `.open` / `.idle`; else → `.idle` (on Welcome a long hold leaves the points open). Always `.timer(.hold, ms: nil)`.
- `point(p)` while `.open`: `act` that point's action and close. `orbCancelled`: `.idle`, `.listen(false)`, the hold timer cancelled.
- `act(.type)`: `typing = ""`, orb `.idle`. `typeChanged` updates it. `typeSubmitted`: `plant(typing, env)`, then `typing = nil`. `typeDismissed`: `typing = nil`.

- [ ] **Step 1: Write the failing tests:**
  - `pointsSitOnTheCompass`: `position(of: .s) == (195, 794)`, `.n == (195, 562)`, `.w == (79, 678)`, `.ne` is (277, 596) within 0.5.
  - `slidingPicksTheNearestOfferedPoint`: (195, 750) among [.n, .s, .w] → `.s`; (195, 740) → nil; a location at −45° and 100 pt out, among [.n, .e] → nil, among [.n, .ne, .e] → `.ne`; 31° off `.s` → `.s`, 33° off → nil.
  - `aShortPressOpensThePoints`, then `aSecondShortPressClosesThem`.
  - `holdingStartsListeningAndTheSoundsLineUp`: `orbDown` → bag at 0, poles at 120, `.timer(.hold, ms: WalkOrb.holdMs)`; `orbHeld` → `.speaking`, `.listen(true)`, unfurl at 280.
  - `lettingGoPlantsWhatWasHeard`: `heard("feel strong again")`, `orbUp(heldMs: 900)` → an item "Feel strong again", with `.listen(false)` first.
  - `slidingOutWhileSpeakingCancelsIt`: no item, `.listen(false)`, orb `.holding(hover: .n)` when over N.
  - `lettingGoOnAPointChoosesIt`: hover S on Year with a flag → step 2.
  - `speechOffOpensTyping`: `speechUnavailable` → `typing == ""`, `note == WalkCopy.speechOff`, orb idle, effects contain `.listen(false)`.
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
- Consumes: `WalkState`; `WalkCopy.examples`, `WalkCopy.firstThingTag`, `WalkCopy.bannerLabel`, `WalkCopy.BannerRole`, `WalkCopy.areaHint` (Task 9); `WalkWords.tag`, `WalkWords.said` (Task 4); `WalkLoad.maxAreas` (Task 7); `WalkOrb.centre`, `WalkOrb.radius` (Task 11).
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
          let frame: CGRect; let lines: Int; let text: String; let tag: String?; let glows: Bool; let label: String }
      struct Post: Equatable, Identifiable { let id: String; let key: WalkPostKey; let base: CGPoint; let top: CGFloat
          let opacity: Double; let saturation: Double; let pale: Bool; let banners: [Banner] }
      struct Label: Equatable, Identifiable { let id: UUID; let name: String; let frame: CGRect
          let kept: Bool; let focused: Bool; let opacity: Double; let tappable: Bool; let hint: String? }
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
- *Levels.* Year to Week hold their items. The Today level holds one banner: the week item named by `firstThing`, in its column, with `tag = WalkCopy.firstThingTag`. A Week banner whose item has a day carries `WalkWords.tag(for: day, today: today)`, already uppercase; no other level has tags. `text` is always the item's whole title: the frame and `lines` do the cutting.
- *What VoiceOver hears.* `Banner.label` is `WalkCopy.bannerLabel(text, level:, tag:, role:)` with the role: a ghost `.example`; a stub `.stub(n)`; the Today band's banner `.firstThing`; everything on step 6 `.plain`; an item on the step's own level `.mine` when `item.mine`, else `.plain`; an item one level above the step's level `.focused` when it is the focused one, else `.focusable`; any other `.plain`. `Label.hint` is `WalkCopy.areaHint(ground:kept:focused:)` when the label is `tappable`, else nil.
- *Labels* (look: contract lines 274-281): two rows when there are more than three columns (`i % 2`); width 90, or `min(90, floor(2 × gap − 6))` with more than three columns; height 30; top at the Year band's stage y `+ 3 + row × 34`; then scaled about the top centre by `max(0.6, 1 − 0.1·d)` and faded to `max(0.5, 1 − 0.1·d)`, `d` = steps below Year (on ground: scale 1, kept 1 / not kept 0.62). `tappable` on ground and on Year.
- *What a level wants.* On step 6 every level is `compact`; otherwise the step's own level is `full` and the others `tip`. Widths: full `bw = clamp(floor(gap − 8), 62, 124)`; compact `round(0.85 × bw)`; tip and stub 26. Heights: full `19 + 16 × lines + (tag == nil ? 0 : 12)`; compact 23; tip 20; stub 20. `lines(for:width:)` is `min(3, max(1, ceil(count / floor((width − 16) / 6.6))))`.
- *Room.* A level has room for a kind when neighbouring columns, on stage at the current camera, are at least that kind's width + 6 apart. Without room, only the level's **open column** draws that kind, and every other post on that level draws one `stub(n)` with its count. The open column holds the selected item, else the focused item or area, else `lastPlanted[level]`, else it is the first with anything on it.
- *Stacking.* Banners rise from the post's base, newest lowest. The first bottom edge is `base.y − 24` (tips and stubs: `base.y`), with 4 pt between banners (tips: 3). The ceiling is stage y 250 for the step's own level and for Year; for any other level it is the band line of the level above plus 6. Banners are added newest first while the next one, plus a stub (20 + gap) if any would remain, stays below the ceiling; what remains becomes one `stub(n)` on top. The newest always shows, cut to one line if it must be. A post named by `expanded` draws all its banners `compact`.
- *A focused or selected flag on a tip post* is drawn `compact` and glowing, its bottom edge 4 pt above the tallest tip stack among its own post and the posts within its width.
- *Examples.* An example is already planted when some item on this level has its title: compare `WalkWords.said(example, level: level, today: today, detect: { _ in nil })?.title` with the item's title, without case, so "Gym on Tuesday" is matched by a flag called "Gym". While examples are on for the step, up to three texts of `WalkCopy.examples` not already planted on this level are `ghost` banners on the post they would join: the focused column's, else the unlabeled post, which appears `pale` in the next column if nothing is on it yet. They are stacked first, so real banners fold before a ghost does, and that post is the open column while they show.
- *Edges.* Unzoomed, a frame that would leave x 4…386 is slid back inside. Nothing may meet the orb (a circle of radius 48 at `WalkOrb.centre`).
- *Distance.* A post `d` levels from the step's level has opacity `max(0.6, 1 − 0.09·d)` and saturation `max(0.55, 1 − 0.1·d)`; tip frames are scaled about the base by `max(0.6, 1 − 0.1 × (d − 1))`. No blur. `needleDown`: Welcome, or the step's level has a flag (on Today, a first thing).

- [ ] **Step 1: Write the failing tests:**
  - `everyBandLandsAt560OnItsOwnStep`: for steps 1…5 with one column, the level's post base y is 560 ± 0.5; on step 6 the five bases are 321, 393, 456, 510, 552 ± 1.
  - `threeKeptAreasStandWhereTheMockupPutThem`: Year, three columns → base x 87, 194.5, 302 and full banners 99 wide; on ground with six labels → label centres 50, 108, 166, 224, 282, 340.
  - `zoomCentresTheColumn`: focus Home on Year → camera `k == 0.8`, Home's base at (195, 520) ± 0.5; a focused parent with no area does not zoom.
  - `nothingOverlaps`: for every step 1…6, every count of kept areas 1…`WalkLoad.maxAreas`, with and without an unlabeled column, 1…6 flags on every post of every level up to the step, with and without a focus, examples and a selection: no two banner frames of the same level intersect; no two label frames intersect; no banner or label frame meets the orb circle; unzoomed, every frame lies in x 0…390; every banner of the step's level has `frame.minY ≥ 250` unless it is the only one on its post.
  - `postsStandOnTheirBand`: in all those cases each post base, taken back to the world and expressed as a fraction of the picture's height, lies in `art.land[level]`.
  - `aCrowdedRidgeOpensOnePost`: six columns on Year with three flags each → exactly one post has `full` banners and the other five show one stub each; selecting a flag on another column makes that one the open post.
  - `whatDoesNotFitFoldsIntoAStub`: eight one-line flags on one of three posts → six banners and `stub(2)`; with that post `expanded`, eight `compact` banners, all below the ceiling.
  - `levelsAboveAreSmallFlags`: on Month, Year and Season items are `tip`; a focused Season item is `compact` and glows; on step 6 everything is `compact`.
  - `theFirstThingStandsOnTheTodayBand`: one banner on the Today level, `tag == WalkCopy.firstThingTag`, in the item's column. `weekBannersCarryTheirDay`: on Week, an item dated 2026-11-17 has `tag == "TUESDAY"` and one with no day has nil; Year, Season and Month banners have nil.
  - `examplesHangOnAPostNotInTheSky`: Year with examples on and nothing kept or planted → one pale post on the Year band with three `ghost` banners; with "Run a 5K" already planted → two. `aPlantedExampleDoesNotComeBack`: Week with examples on and an item "Gym" → the only ghost is "Call the tile shop"; an item "call the tile shop" hides that one too.
  - `bannersSayWhatATapDoes`: on Year a planted flag has `label == "Year: Run a 5K, tap to move or pull up"` and one with `mine == false` `"Year: Run a 5K"`; on Season the same Year flag reads `…, tap to focus`, and `…, focused, tap to let go` once focused; a ghost reads `Example: Run a 5K, tap to make it yours`; a stub `2 more, tap to show`; a ground label's `hint` is `Tap to keep`, and a label on Month has no hint.
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
- The undo stack is not part of the position, by design. `apply(to:)` leaves `undo` empty and `undoShowing` false (and `WalkWriter`'s removed-row snapshots are in memory too), so after a relaunch there is nothing to undo until the person does something new.

- [ ] **Step 1: Write the failing tests:**
  - `itRoundTrips`: a state at Month with kept areas, a focus, a tour and a first thing saves and loads equal; another user's key is separate; garbage data loads nil. `theKeyIsPerPerson`: `key(id) == "walk.position." + id.uuidString.lowercased()`.
  - `sameDaySamePlace`: `restored` with the same periods and every id existing changes nothing, a saved step 6 included. `aRestoredWalkHasNothingToUndo`: a state with three undo entries, saved, loaded and applied to a fresh state → `undo.isEmpty`, `undoShowing == false`, and `WalkCopy.points` offers no `Undo`.
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
- Create: `R/App/Assets.xcassets/WalkOverlook.imageset/` (`walk-overlook.jpg`, `Contents.json`), `R/Walk/WalkScheduling.swift`, `R/Walk/WalkModel.swift`, `R/Walk/Views/WalkView.swift`, `R/Walk/Views/WalkSceneView.swift`, `R/Walk/Views/WalkBannerViews.swift`
- Modify: `R/App/DemoMode.swift`, `R/App/MainView.swift` (`iOSMainView`, beside the half-open overlay near :137)
- Test: `SymphonyOSTests/WalkTestSupport.swift` (new), `SymphonyOSTests/WalkModelTests.swift` (new); each wrapped whole in `#if os(iOS)`

**Interfaces:**
- Consumes: `WalkPeriods.pick` (Task 3); `WalkWriter` (6); `WalkLoad.areas`, `WalkLoad.items` (7); `WalkState`, `WalkEnv`, `WalkEvent`, `WalkEffect`, `WalkWrite`, `WalkTimer`, `WalkState.undoMs`, `WalkState.noteMs` (8); `WalkCopy` (9); `WalkLayout.make`, `WalkLayout.Banner.label`, `WalkArt.overlookSquare` (12); `WalkPosition`, `WalkPositionStore`, `WalkEntry` (13).
- Produces:
  ```swift
  @MainActor protocol WalkScheduling: AnyObject {                                   // R/Walk/WalkScheduling.swift
      func after(_ ms: Int, key: String, _ work: @escaping @MainActor () -> Void)   // a later call with the same key replaces the earlier one
      func cancel(key: String)
      func run(_ work: @escaping @MainActor () async -> Void)                       // async work: starting speech, asking for the calendar
  }
  @MainActor final class WalkClock: WalkScheduling { init() }                       // the real one: Task.sleep and Task { }
  @MainActor @Observable final class WalkModel {
      private(set) var state: WalkState
      private(set) var periods: WalkPeriods
      var layout: WalkLayout { get }
      var onEnd: ((WalkStatus) -> Void)?
      init(context: ModelContext, userId: UUID, entry: WalkEntry, position: WalkPosition?, edition: Edition,
           now: Date = .now, seasons: [SeasonBoundary]? = nil, store: WalkPositionStore? = WalkPositionStore(),
           scheduler: WalkScheduling? = nil)                                        // nil → WalkClock()
      func send(_ event: WalkEvent)
      func choose(_ action: WalkAction)
  }
  struct WalkView: View { init(model: WalkModel) }
  // DemoMode:  static var isWalk: Bool (-SymphonyWalk);  static var walkStep: Int? (-SymphonyWalkStep 0…6)
  // SymphonyOSTests/WalkTestSupport.swift:
  @MainActor final class ManualWalkScheduler: WalkScheduling {
      init()
      func advance(_ ms: Int)               // runs, in time order, every `after` that falls due within the next ms
      func settle() async                   // runs and awaits every `run` handed over so far
  }
  @MainActor func walkTestContext() throws -> ModelContext     // over an in-memory container of SymphonyApp.modelTypes
  ```
  Later tasks add defaulted `init` parameters after `scheduler:`, in this order: `listener:` (Task 16), `sound:` (Task 19), `calendarAccess:`, `requestCalendar:` (Task 20).

**How `send` runs an effect.** It runs the reducer, then each effect in order:
- `.write`, through one `WalkWriter` kept for the whole walk: `.area(a)` → `ensureArea(a)`; `.dropArea(id)` → `dropAreaIfUnused(id)`; `.create(item, parent:)` → `create(item, parent:)`; `.remove(id, level)` → `remove(id, level:)`; `.restore(id)` → `restore(id)`; `.setArea(id, level, area)` → `setArea(id, level:, to:)`; `.firstThing(id, previous:)` → `setFirstThing(id, previous:)`; `.toggleDone(id)` → `toggleDone(id)`. The model keeps the set of ids it planted: `.create` and `.restore` add the id, `.remove` takes it out.
- `.save` → `store?.save(WalkPosition(state, status: .inProgress, planted:, periods:, now:), for: userId)`. Nothing is saved when the model is made: the first `.save` is the reducer's, when a depth is chosen on Welcome.
- `.timer(t, ms:)` → `scheduler.after(ms, key:)` with the key `"hold"`, `"undo"` or `"note"`, sending `.orbHeld`, `.undoExpired` or `.noteExpired`; a nil `ms` → `scheduler.cancel(key:)`.
- `.end(status)` saves the position with that status, then calls `onEnd`.
- `.sound`, `.listen` and `.askCalendar` do nothing yet (Tasks 19, 16, 20).

On init: `.start` loads `WalkLoad.areas` and `WalkLoad.items` into a fresh state at Welcome with an empty planted set; `.resume` loads them with the position's planted set, then `position.restored(for:existing:).apply(to:)`.

**The picture** (D20). Source: `~/Pictures/Symphony scenery/overlook-square-3x.png` (5796 × 5796; the `-original` file beside it is now a 1200-pixel copy and is not used). Bundle one **3120 × 3120 JPEG at quality 88**, about 1.8 MB: 3120 = 1300 world units × the deepest zoom 0.8 × 3 pixels per point, so at the closest zoom on a 390-point, 3x phone one picture pixel is one screen pixel; larger adds megabytes and no sharpness, and a PNG this size is over 12 MB. Make it with `mkdir -p R/App/Assets.xcassets/WalkOverlook.imageset && sips -Z 3120 -s format jpeg -s formatOptions 88 "$HOME/Pictures/Symphony scenery/overlook-square-3x.png" --out R/App/Assets.xcassets/WalkOverlook.imageset/walk-overlook.jpg`, with a `Contents.json` naming that one file as a single universal image (no 2x / 3x entries, so the catalog never shrinks it). Draw it `.resizable().interpolation(.high)`, never blurred.

- [ ] **Step 1: Write the failing tests** in `WalkModelTests.swift` (`walkTestContext()`, a `ManualWalkScheduler`, `store: nil` unless said, now = 2026-11-13):
  - `theManualSchedulerRunsInOrder`: `after(300, key: "a")`, `after(100, key: "b")`, then `after(200, key: "a")` again; `advance(150)` runs b only; `advance(100)` runs a, once; a cancelled key never runs; `settle()` awaits a `run`.
  - `aFreshWalkStartsAtWelcomeWithSixPeaks`.
  - `nothingIsSavedBeforeADepthIsChosen`: with a store on a private `UserDefaults` suite, `load` is nil after init; after `choose(.quick)` it holds an `.inProgress` position at step 1, on the ground, with `planted` empty.
  - `plantingWritesTheRow`: `choose(.quick)`, `send(.areaTapped(health))`, `choose(.next)`, `choose(.type)`, `send(.typeChanged("feel strong again"))`, `send(.typeSubmitted)` → one `Goal` "Feel strong again" for 2027 with an `areaId`, one `GoalArea` "Health", and the layout has one full banner with that text. `undoTakesTheRowBack`: then `send(.undo)` → no `Goal`, no `GoalArea`, no queued change for either.
  - `theUndoPillAndANoteHideInTheirTime`: after the plant `state.undoShowing`; `scheduler.advance(WalkState.undoMs)` → false. After submitting "um", `state.note == WalkCopy.nothingToPlant`; `scheduler.advance(WalkState.noteMs)` → nil.
  - `aResumedWalkShowsWhatWasPlanted`: a stored position at Season with one planted year goal, init with `.resume` → step 2, the goal is an item with `mine == true`.
  - `endingSavesTheStatus`: `choose(.notNow)` at Welcome with a real store → `onEnd(.left)` and a stored position with status `.left`.
  - `theBundledPictureResolves`: `UIImage(named: WalkArt.overlookSquare.imageName)?.cgImage?.width == 3120` (the pixel width, not the point size).
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkModelTests`. Expected: FAIL to compile.
- [ ] **Step 3: Add the picture** (the command above); write `WalkScheduling.swift`, `WalkTestSupport.swift` and `WalkModel`.
- [ ] **Step 4: Draw it.** `WalkView` is the 390 × 844 stage scaled by `min(width / 390, height / 844)`, centred on a full-bleed `#00106e` ground, ignoring safe areas (D21). `WalkSceneView`, back to front, with the numbers in contract §3 "Stage and world" and §14 (lines 589-605): the stage gradient; the world (sky gradient, then the picture in `art.image`) drawn at 1300 × 1720 with `.scaleEffect(k, anchor: .topLeading).offset(x: -x * k, y: -y * k)`; the labels and posts at their layout frames in stage space; the dark band at the top (height 260); the text block (Welcome: `WalkCopy.wordmark`, `welcomeTitle`, `welcomeSub`, sizes on line 594; asking: `WalkCopy.eyebrow`, `question`, `why`, sizes on line 595) in white with the two-layer dark shadow of line 592. One animation carries the camera, labels and posts together: `.timingCurve(0.45, 0.05, 0.2, 1, duration: 1.4)` on the layout's camera. `WalkBannerViews`: full banner with its V notch, compact banner, tip pennant, stub (a pennant with its number), ghost (pale, dashed), pole and ground shadow, with the colours and paddings of contract §5 (lines 313-326) and §9 (lines 478-482), the flutter and drop-in of line 322, and the labels of lines 274-281. A banner draws `text` and, under it, `tag` exactly as given. Labels and banners are buttons that send `.areaTapped`, `.bannerTapped`, `.stubTapped`, `.exampleTapped`.
- [ ] **Step 5: Show it.** In `iOSMainView` add `@State private var walk: WalkModel?` and an overlay placed before the half-open overlay, so the walk covers the dock and the half-open display still covers the walk: `.overlay { if let walk { WalkView(model: walk).transition(.opacity) } }`. For now it is created only in demo, on appear, when `DemoMode.isWalk`, with `store: nil` and `onEnd` setting `walk = nil`. `DemoMode`: with `-SymphonyWalk` the store is not seeded; with `-SymphonyWalkStep N` it holds the mockup's preview (kept Health, Home, People; the script lines for levels 1…min(N, 5) from `Walk.dc.html:230-234`, written through `WalkWriter`) and the walk opens at step N with the mockup's preview focus (`Walk.dc.html:243-244`).
- [ ] **Step 6: Run** `WalkModelTests`. Expected: PASS.
- [ ] **Step 7: Screenshots** of steps 0 to 6 into `walk-shots/task-14/`. Check against the contract: the picture's top edge at stage y 454, 409, 321, 234, 155, 87, 170; the current level's posts standing at 560; white text readable over the sky; no mist, no blur.
- [ ] **Step 8: Commit.** `git commit -m "Walk: the mountain, the camera and the flags on screen"`

### Task 15: The orb, the compass, the live flag and the hint row
**Files:**
- Create: `R/Walk/Core/WalkStage.swift`, `R/Walk/Views/WalkOrbView.swift`, `R/Walk/Views/WalkHintRow.swift`
- Modify: `R/Walk/Views/WalkView.swift`, `R/App/DemoMode.swift`
- Test: `SymphonyOSTests/WalkStageTests.swift` (new; pure, not wrapped)

**Interfaces:**
- Consumes: `WalkModel.send`, `WalkModel.state`, `WalkModel.layout` (Task 14); `WalkOrb.centre`, `WalkOrb.position(of:)` (11); `WalkCopy.points`, `WalkCopy.hint`, `WalkCopy.undo`, `WalkCopy.moveTo`, `WalkCopy.pullUp`, `WalkCopy.typePlaceholder` (9); `WalkArt.overlookSquare.stage` (12).
- Produces:
  ```swift
  struct WalkStage: Equatable {                              // R/Walk/Core/WalkStage.swift
      let scale: CGFloat; let origin: CGPoint                // the stage's top-left corner on the device
      init(device: CGSize, stage: CGSize = WalkArt.overlookSquare.stage)
      func toStage(_ devicePoint: CGPoint) -> CGPoint
      func toDevice(_ stagePoint: CGPoint) -> CGPoint
  }
  extension WalkOrb { static let touchRadius: CGFloat = 56;  static func hits(_ stagePoint: CGPoint) -> Bool }
  struct WalkOrbView: View { init(model: WalkModel) }
  struct WalkHintRow: View { init(model: WalkModel) }
  ```
  `scale` is `min(device.width / stage.width, device.height / stage.height)` and `origin` centres the scaled stage. `hits` is true within `touchRadius` of `WalkOrb.centre`, the edge included. Neither view is shown on step 6.

- [ ] **Step 1: Write the failing tests** in `WalkStageTests.swift`:
  - `aRegularPhoneIsTheStage`: device 390 × 844 → `scale == 1`, `origin == .zero`.
  - `aBiggerPhoneScalesUp`: 430 × 932 → scale 1.1026 ± 0.001, origin (0, 0.72 ± 0.05).
  - `theDuoOutsideScreenLetterboxes`: 466 × 678 → scale 0.8033 ± 0.001, origin (76.35 ± 0.1, 0); `toDevice(WalkOrb.centre)` is (233.0, 544.65) ± 0.2.
  - `pointsRoundTrip`: on each of the three sizes `toStage(toDevice(p))` is `p` ± 0.001 for (195, 678) and (0, 0).
  - `aTouchOnTheLightCounts`: `hits((195, 678))`; `hits((195, 622))` (exactly 56 away); not `hits((195, 621))`; not `hits((252, 678))`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkStageTests`. Expected: FAIL to compile.
- [ ] **Step 3: Implement `WalkStage` and `WalkOrb.hits`;** `WalkView` now takes its scale and offset from `WalkStage(device:)` and names its full-bleed root coordinate space `"walk.device"`. Run the suite. Expected: PASS.
- [ ] **Step 4: The orb.** A 300 × 300 dial at stage (45, 528): halo, body, highlight, ring, four ticks and the needle (down when `layout.needleDown`) exactly as contract §7 "Geometry", "Breathing", "Compass" (lines 357-378). Its touch area is a circle of `WalkOrb.touchRadius`. One `DragGesture(minimumDistance: 0, coordinateSpace: .named("walk.device"))` on it; every location goes through `WalkStage.toStage` before it is sent: began → `.orbDown`; changed → `.orbMoved(stagePoint)`; ended → `.orbUp(heldMs:)`; a cancelled gesture → `.orbCancelled`. The view decides nothing else.
- [ ] **Step 5: The compass points.** For each of `WalkCopy.points(state)`, a button at `WalkOrb.position(of:)` with its SF Symbol and label (contract lines 431-435), shown while the orb is `.holding` or `.open`, the hovered one enlarged. A tap sends `.point`.
- [ ] **Step 6: The live flag.** While `.speaking`: the pole rising from the top of the orb and the swallow-tailed cloth unfurling with the live words and a caret, in the step's level colour (contract lines 397-404).
- [ ] **Step 7: The hint row** at the bottom (contract lines 596, 494, 501-504): `WalkCopy.hint(state)`, with a pill labelled `WalkCopy.undo` beside it while `undoShowing` (sends `.undo`). When a flag is selected the row becomes `WalkCopy.moveTo`, one chip for every label except the flag's own, then `WalkCopy.pullUp` (`.moveTo`, `.pullUp`), scrolling sideways. When `typing != nil` the row becomes one text field (placeholder `WalkCopy.typePlaceholder`, return key "done"), focused at once, bound to `.typeChanged`, submitting `.typeSubmitted`, sending `.typeDismissed` when it loses focus; any hint text stays as a line above it, and the stage moves up with the keyboard so the field stays in view.
- [ ] **Step 8: Screenshots** into `walk-shots/task-15/`, all by launch argument (a DEBUG argument `-SymphonyWalkOrb open` opens the points and `-SymphonyWalkOrb type` opens the field; both read in `DemoMode`): the idle orb on Year; the points open on Welcome, on ground and on Year; the typing field up, empty; the hint with the Undo pill and the Move row are seen in Task 21's UI test run. Check the orb's centre is at stage (195, 678) and the hint is readable above the home indicator.
- [ ] **Step 9: Commit.** `git commit -m "Walk: the orb, its compass points, the rising flag and the hint line"`

### Task 16: Speech
**Files:**
- Modify: `R/Views/Capture/TellSheet.swift` (`Dictation`, :93-180), `R/Walk/WalkModel.swift`, `SymphonyOSTests/WalkTestSupport.swift`
- Test: `SymphonyOSTests/WalkModelTests.swift`

**Interfaces:**
- Consumes: `WalkModel`, `WalkScheduling.run`, `ManualWalkScheduler`, `walkTestContext()` (Task 14); `.listen`, `.heard`, `.speechUnavailable` (8, 11); `WalkOrb.holdMs` (11); `WalkCopy.speechOff` (9).
- Produces:
  ```swift
  // Dictation:  var playsAlongside = false            // the walk sets it; Tell leaves it false
  //             var onWords: ((String) -> Void)?      // called on the main actor with each new transcript
  @MainActor protocol WalkListening: AnyObject {       // declared in R/Walk/WalkModel.swift
      var problem: String? { get }
      var onWords: ((String) -> Void)? { get set }
      func start() async
      func stop()
  }
  extension Dictation: WalkListening {}                // in R/Walk/WalkModel.swift
  // WalkModel.init gains, after scheduler:   listener: WalkListening? = nil     // nil → a Dictation with playsAlongside = true
  // SymphonyOSTests/WalkTestSupport.swift gains (Tasks 17 and 20 use it from there):
  @MainActor final class FakeWalkListener: WalkListening {
      init()
      var problem: String?; var onWords: ((String) -> Void)?
      var problemOnStart: String?                      // start() copies it into `problem`
      private(set) var starts = 0; private(set) var stops = 0
      func start() async; func stop()
      func hear(_ words: String)                       // calls onWords
  }
  ```

- [ ] **Step 1: Write the failing tests** (a `ManualWalkScheduler` and a `FakeWalkListener`; the walk taken to Year first):
  - `listeningStartsOnTheHoldNotBefore`: after `send(.orbDown)`, `listener.starts == 0`; `scheduler.advance(WalkOrb.holdMs)` then `await scheduler.settle()` → `starts == 1`.
  - `whatIsHeardFillsTheFlag`: then `listener.hear("feel strong")` → `state.orb == .speaking(live: "feel strong")`.
  - `aProblemOpensTyping`: with `problemOnStart = "no microphone"`, hold and settle → `state.typing == ""`, `state.note == WalkCopy.speechOff`, `state.orb == .idle`.
  - `stopIsCalledOnRelease`: `send(.orbUp(heldMs: 900))` → `listener.stops == 1`.
- [ ] **Step 2: Run** `WalkModelTests`. Expected: FAIL to compile (`listener:` missing).
- [ ] **Step 3: Fix `Dictation`** (D7). `start()` begins with `transcript = ""`. Wherever it sets `transcript`, it also calls `onWords`. With `playsAlongside`, the session is `.playAndRecord`, mode `.default`, options `[.defaultToSpeaker, .mixWithOthers]`, with `setAllowHapticsAndSystemSoundsDuringRecording(true)`, and `stop()` leaves the session active and sets it back to `.ambient` with `.mixWithOthers`, so the walk's sounds play straight after. With `playsAlongside == false` nothing changes for Tell.
- [ ] **Step 4: Wire it.** At init the model sets `listener.onWords` to send `.heard`. `.listen(true)` → `scheduler.run { await listener.start(); if listener.problem != nil { send(.speechUnavailable) } }`. `.listen(false)` → `listener.stop()`. Permission is asked by `start()` on the first hold, never at launch.
- [ ] **Step 5: Run** `WalkModelTests`. Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "Walk: hold the light and speak; if speech is off, type"`

### Task 17: The five steps, end to end
**Files:**
- Test: `SymphonyOSTests/WalkFlowTests.swift` (new; wrapped whole in `#if os(iOS)`)
- Modify: `R/Walk/Core/WalkState+Plant.swift` (`.walkAnother`), `R/App/DemoMode.swift` (`-SymphonyWalkExamples`). If a flow test exposes a fault in an earlier task, the fix goes in the file that owns the rule, one of `WalkState.swift`, `WalkState+Plant.swift`, `WalkState+Orb.swift`, `WalkWriter.swift`, `WalkLoad.swift`, `WalkEnding.swift`, `WalkModel.swift`, with a failing test added to that file's own suite first; no other file is touched.

**Interfaces:**
- Consumes: `WalkModel`, `ManualWalkScheduler`, `walkTestContext()` (Task 14); `FakeWalkListener` (16); `WalkEnding.rows`, `WalkEnding.nextToWalk` (7); `WalkCopy.question` (9); `WalkPositionStore` (13); `WalkOrb.holdMs` (11).
- Produces: `apply(.walkAnother)`: at step 6, with `WalkEnding.nextToWalk(items)` non-nil → `depth = .quick`, `step = 2`, `focus[.season]` that goal, `sheetOpen = false`, `.save`; nil does nothing. `DemoMode.walkExamples: Bool` (`-SymphonyWalkExamples`): the demo walk opens with examples on for its step.

- [ ] **Step 1: Write the failing tests** (now = Friday 2026-11-13; a store on a private `UserDefaults` suite; "say X" = `send(.orbDown)`, `scheduler.advance(WalkOrb.holdMs)`, `await scheduler.settle()`, `listener.hear(X)`, `send(.orbUp(heldMs: 900))`):
  - `aQuickStartLeavesOneLinkedChain`: quick; keep Health and Home; next; say "feel strong again"; next; say "lift twice a week"; next; say "book the gym induction"; next; say "gym induction, today"; next; `choose(.startThere)`; next. Then: one `Goal` (2027, personal, area Health); a season task with `goalId` it; a month task with `sourceId` the season task and the same `goalId`; a week task "Gym induction" dated today with `sourceId` the month task; exactly one `TaskFocus` today, for that task; `state.step == 6`; `WalkEnding.rows` gives one row with `forGoal == "Feel strong again"` and `first == true`. No task has `isGoal`; every one has `context == "personal"`. In the pending changes, oldest first, no row comes before a row it points at.
  - `theWholeYearVisitsEveryAreaAndEveryGoal`: full; keep Health, Home, People; say one goal at each of the three stops (`WalkCopy.question` names the area each time); at Season the question is `For “…”, what’s this winter’s piece?` for each of the three goals in turn, and three season tasks each link to their own goal and carry its area. Walking on to Month, `state.focus[.month]` is the season goal said last; "book the plumber" said there is a month task whose `sourceId` is that season task.
  - `aGoalSaidOnTheWrongPeakMoves`: focus Health, say "finish the bathroom" → the goal's `areaId` is Home's.
  - `everyStepCanBeSkipped`: quick, then next six times with nothing said → step 6, no goal, task or `GoalArea` rows.
  - `leavingAndComingBack`: after the Month answer, a new `WalkModel` with `.resume` over the same store and context → step 3, the three flags present and `mine`, the Month focus intact; `state.undo.isEmpty`, and `send(.undo)` changes no row.
  - `aTaskSaidForNextWeekSurvivesAReload`: a quick walk to Week, then say "gym on Tuesday" → a task "Gym" dated 2026-11-17. A new model with `.resume` has a week item "Gym" with `day` 2026-11-17, and its layout has a Week banner with `tag == "TUESDAY"`.
  - `walkAnotherOneDown`: two year goals and a chain under the first; `send(.walkAnother)` at step 6 → step 2, `focus[.season]` the second goal, depth quick.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkFlowTests`. Expected: FAIL (`walkAnother` at least).
- [ ] **Step 3: Implement `.walkAnother` and `DemoMode.walkExamples`.** Any other failure is fixed as the Files line says.
- [ ] **Step 4: Run** every `Walk…` suite. Expected: PASS.
- [ ] **Step 5: Screenshots, by launch argument only** (no typing, no hand walk): `-SymphonyDemo -SymphonyLight -SymphonyWalk -SymphonyWalkStep N -SymphonyWalkExamples` for N = 1…4 (ghost flags hanging on a post) and `-SymphonyWalkStep 5` and `6` without it, into `walk-shots/task-17/`.
- [ ] **Step 6: Commit.** `git commit -m "Walk: both depths proven end to end against real rows"`

---

## Stage D: arriving, sounds, the ending

### Task 18: When it appears, resuming, replaying, and where the pages open
**Files:**
- Modify: `R/App/AppState.swift`, `R/App/MainView.swift` (`iOSMainView`), `R/Views/Settings/SettingsView.swift` (a section above "About", :69), `R/Views/Planner/PlannerView.swift` (`option`, :88-93)
- Test: `SymphonyOSTests/WalkModelTests.swift`

**Interfaces:**
- Consumes: `WalkEntry.decide`, `WalkPositionStore`, `WalkPosition` (Task 13); `AppState.initialSyncFinished` (2); `WalkPeriods.pick`, `pageDate(for:)` (3); `WalkModel`, `WalkModel.onEnd`, `DemoMode.isWalk` (14); `WalkCopy.replayButton`, `WalkCopy.replayFooter` (9).
- Produces: `AppState.walkReplayRequested: Bool` (default false). Replay is asked for from Settings and nowhere else.

- [ ] **Step 1: Write the failing tests:**
  - `aFreshAppHasNotAskedForAReplay`: `AppState().walkReplayRequested == false`.
  - `aLeftWalkIsRememberedAndAReplayStartsFresh` (a store on a private `UserDefaults` suite): `choose(.notNow)` on a fresh model → the stored position is `.left`; `WalkEntry.decide(replay: false, demoWalk: false, position: thatPosition, householdEditions: ["light"], initialSyncFinished: true, goalCount: 0) == .none`; the same call with `replay: true` is `.start`. A second model made with `entry: .start` and that position leaves the stored position `.left` until `choose(.quick)`, after which it is `.inProgress`, step 1, with `planted` empty.
- [ ] **Step 2: Run** `WalkModelTests`. Expected: FAIL to compile (`walkReplayRequested` missing).
- [ ] **Step 3: The trigger.** `iOSMainView.considerWalk()`: return when `walk != nil` or nobody is signed in. Fetch the households' editions and the `Goal` count **from the model context at that moment** (not from a `@Query`, which can lag behind the pull), load the position, and call `WalkEntry.decide(replay: appState.walkReplayRequested, demoWalk: DemoMode.isWalk, position:, householdEditions:, initialSyncFinished: appState.initialSyncFinished, goalCount:)`. `.start` and `.resume` create the `WalkModel` (demo: `store: nil`) with `onEnd` setting `walk = nil`, `appState.activeTab = .planner`, `appState.horizon = .today` and calling `appState.goToToday()`. Call it on appear and on change of `appState.initialSyncFinished`, `appState.edition` and `appState.walkReplayRequested` (which it sets back to false). This replaces Task 14's demo-only creation. While the walk is up, the content beneath it is `.accessibilityHidden(true)`.
- [ ] **Step 4: Replay.** `SettingsView`, both editions: a section with one button titled `WalkCopy.replayButton` and the footer `WalkCopy.replayFooter`. It sets `appState.walkReplayRequested = true`.
- [ ] **Step 5: The pages show what the walk filed** (spec: "The Year, Season and Month pages must show what the walk filed"). In `PlannerView.option`, in the light edition only, choosing Month, Season or Year sets `appState.selectedDate = WalkPeriods.pick(now: .now, seasons: seasons).pageDate(for: h)` (`seasons` is `PlannerView`'s own property, :19); the steppers still move from there. Full households are untouched.
- [ ] **Step 6: Run** `WalkModelTests`, then the whole unit suite. Expected: PASS.
- [ ] **Step 7: Screenshots** into `walk-shots/task-18/`, by launch argument: `-SymphonyDemo` (Today, no walk) and `-SymphonyDemo -SymphonyLight -SymphonyWalk` (Welcome). The Settings button, the replay it starts and `Not now` are driven by Task 21's UI test, not by hand.
- [ ] **Step 8: Commit.** `git commit -m "Walk: appears once for a new light account, resumes, and replays from Settings"`

### Task 19: Sounds and haptics
**Files:**
- Create: `scripts/render-walk-placeholder-sounds.py`; in `R/Resources/WalkSounds/`: `walk-bag.PLACEHOLDER.wav`, `walk-poles.PLACEHOLDER.wav`, `walk-unfurl.PLACEHOLDER.wav`, `walk-plant.PLACEHOLDER.wav`, `walk-tick.PLACEHOLDER.wav`; `R/Walk/WalkSound.swift`
- Modify: `R/Walk/WalkModel.swift`, `SymphonyOSTests/WalkTestSupport.swift`
- Test: `SymphonyOSTests/WalkSoundTests.swift` (new; wrapped whole in `#if os(iOS)`)

**Interfaces:**
- Consumes: `WalkSoundName` (Task 3); `.sound(_:afterMs:)` (8); `WalkModel`, `WalkScheduling.after`, `ManualWalkScheduler`, `walkTestContext()` (14); `PaperSound.shared.isOn`.
- Produces:
  ```swift
  @MainActor protocol WalkSoundPlaying: AnyObject { func play(_ name: WalkSoundName) }
  @MainActor final class WalkSound: WalkSoundPlaying {
      static let shared = WalkSound()
      static func bundleFiles(_ bundle: Bundle = .main) -> [String]     // the names of the bundle's files that begin "walk-"
      static func fileName(for name: WalkSoundName, in files: [String]) -> String?
      func play(_ name: WalkSoundName)
  }
  // WalkModel.init gains, after listener:   sound: WalkSoundPlaying? = nil      // nil → WalkSound.shared
  // SymphonyOSTests/WalkTestSupport.swift gains:
  @MainActor final class FakeWalkSound: WalkSoundPlaying { init(); private(set) var played: [WalkSoundName]; func play(_ name: WalkSoundName) }
  ```

**The placeholders** (D19: no recordings exist yet and none may be taken from the internet). The script is plain Python 3, standard library only (`wave`, `struct`, `math`, `random` seeded with 13, so every run gives the same bytes). It renders the five recipes of contract §12 (lines 515-523: filtered noise bursts through its own biquad, tones with exponential glides and envelopes, master gain 0.6) to **mono, 44.1 kHz, 16-bit WAV**: bag 0.40 s, poles 0.45 s, unfurl 0.40 s, plant 0.40 s, tick 0.05 s. Run `python3 scripts/render-walk-placeholder-sounds.py apple/SymphonyOS/SymphonyOS/Resources/WalkSounds`. Files under R ship in the bundle automatically.

**Replacing them.** `fileName(for:in:)` prefers a recording named `walk-<name>.wav`, `.caf` or `.m4a` and falls back to `walk-<name>.PLACEHOLDER.wav`. Scott drops five recordings beside the placeholders; nothing else changes.

**Playing.** One preloaded `AVAudioPlayer` per sound, found with `fileName(for:in: bundleFiles())`, volume 0.6. Sound is skipped when `PaperSound.shared.isOn` is false (the existing setting); the session is `.ambient` with `.mixWithOthers` (the silent switch is respected) unless speech holds it. A haptic goes with every sound, sound on or off: bag `UIImpactFeedbackGenerator(style: .soft)` at 0.5; poles `.rigid` at 0.6; unfurl `.light` at 0.7; plant `.medium` at 1.0, 130 ms after the sound starts (the thud); tick `UISelectionFeedbackGenerator().selectionChanged()`. In the model, `.sound(name, afterMs: 0)` plays at once and any other delay goes through `scheduler.after(ms, key:)` with a key unique to that sound.

- [ ] **Step 1: Write the failing tests:**
  - `aRecordingBeatsAPlaceholder`: `fileName(for: .bag, in: ["walk-bag.PLACEHOLDER.wav", "walk-bag.caf"]) == "walk-bag.caf"`; with only the placeholder, the placeholder; with neither, nil.
  - `everySoundIsInTheBundle`: for each `WalkSoundName`, `fileName(for: name, in: WalkSound.bundleFiles())` is not nil.
  - `theModelPlaysWhatTheReducerAsks` (a `FakeWalkSound` and a `ManualWalkScheduler`, the walk on Year): `send(.orbDown)` → `played == [.bag]`; `scheduler.advance(120)` → `[.bag, .poles]`; a typed plant adds `.plant`; keeping a peak on the ground adds `.tick`.
- [ ] **Step 2: Run** `-only-testing:SymphonyOSTests/WalkSoundTests`. Expected: FAIL to compile.
- [ ] **Step 3: Write the script, render the five files, implement `WalkSound` and `FakeWalkSound`,** and have `WalkModel` perform `.sound`.
- [ ] **Step 4: Run.** Expected: PASS. (Hearing the sounds is part of the hand walk under "Stops for the owner".)
- [ ] **Step 5: Commit.** `git commit -m "Walk: five sounds with haptics, on placeholder audio until the recordings arrive"`

### Task 20: The calendar ask and the ending
**Files:**
- Create: `R/Walk/Views/WalkEndingSheet.swift`
- Modify: `R/Walk/WalkModel.swift`, `R/Walk/Core/WalkState.swift` (the Today entry in `next`), `R/Walk/Core/WalkState+Plant.swift`, `R/Walk/Views/WalkView.swift`, `R/App/DemoMode.swift` (`-SymphonyWalkSheet`), `SymphonyOSTests/WalkTestSupport.swift`
- Test: `SymphonyOSTests/WalkFlowTests.swift`

**Interfaces:**
- Consumes: `WalkEnding.rows`, `WalkEnding.nextToWalk` (Task 7); `WalkEnv.canAskCalendar`, `calendarOffer`, `.askCalendar`, `.rowToggled`, `WalkState.calendarNoteMs` (8); the ending strings, `WalkCopy.calendarLine`, `WalkCopy.rowLabel`, `rowDone`, `rowOpen`, `ringLabel` (9); `WalkWriter.toggleDone` through `.write(.toggleDone)` (6, 10, 14); `WalkScheduling.run`, `ManualWalkScheduler`, `walkTestContext()` (14); `FakeWalkListener` (16); `AppleCalendarAccess`, `AppleCalendarService.shared`, `CalendarFeed.shared.items(for:)`.
- Produces:
  ```swift
  // WalkModel:  private(set) var endingRows: [WalkEnding.Row]     // today's tasks, re-read from the store after every send
  //             var ring: (done: Int, total: Int) { get }         // done and total of endingRows
  //             var nextUp: (title: String, start: Date)? { get } // today's next calendar event, if any
  // WalkModel.init gains, after sound:
  //   calendarAccess: @escaping @MainActor () -> AppleCalendarAccess = { AppleCalendarService.shared.access },
  //   requestCalendar: @escaping @MainActor () async -> Void = { await AppleCalendarService.shared.requestAccess() }
  // SymphonyOSTests/WalkTestSupport.swift gains:
  @MainActor final class FakeWalkCalendar { init()
      var access: AppleCalendarAccess = .notAsked; var answer: AppleCalendarAccess = .allowed
      private(set) var asks = 0
      func request() async }                                       // asks += 1; access = answer
  ```
  and `apply` for `.sheetHandle`, `.goToToday`, `.calendarAnswered`; `act` for `.calendar`. Tests pass `calendarAccess: { fake.access }` and `requestCalendar: { await fake.request() }`.

**The rules** (spec "It ends with Today rising in as a sheet…"; D17, D18; contract §13, lines 527-574).
- Before each reducer call the model sets `WalkEnv.canAskCalendar` to `edition == .light && calendarAccess() == .notAsked`. On entering Today with it, `next` also sets `note = WalkCopy.calendarLine` with `.timer(.note, ms: WalkState.calendarNoteMs)`, and the compass offers `Calendar`. `act(.calendar)` → `[.askCalendar]`; the model does `scheduler.run { await requestCalendar(); send(.calendarAnswered) }`, and `.calendarAnswered` clears `calendarOffer`. It is asked at most once, and never in a full household.
- Step 6: the camera's seventh stop, every level compact, no orb. The header is one line, `WalkCopy.lookBack` while the sheet is down and there are posts, else `WalkCopy.heresToday`, and nothing else: there is no "Walk it again" there; replay is in Settings. The sheet peeks at stage y 716; its handle (`WalkCopy.showMyDay` / `WalkCopy.lookBackHandle`) sends `.sheetHandle`, which raises it to y 130 and lowers it again.
- In the sheet: `WalkCopy.todayEyebrow` and the date; the ring (`ring.done` of `ring.total`, labelled `WalkCopy.ringLabel`); the next calendar event today, if any (`WalkCopy.nextEvent(time)`, its title); `endingRows`, each with its check circle and `WalkCopy.forGoal(name)` line; `WalkCopy.walkAnother` with `WalkCopy.nextFlag(name)` when `nextToWalk` is not nil; when there is at least one row and all are done, `WalkCopy.thatsTheDay`; with no rows, `WalkCopy.nothingToday`; last, `WalkCopy.goToToday`. No praise, no count of what is left, nothing red.
- The only things that take a tap in the sheet are its handle, its rows (`.rowToggled(row.id)`, where `row.id` is the task's id), `WalkCopy.walkAnother` (`.walkAnother`) and `WalkCopy.goToToday` (`.goToToday` → `[.end(.finished)]`). A row is ticked whether or not the walk planted it; `endingRows` and `ring` come back from the store after the write.

- [ ] **Step 1: Write the failing tests** in `WalkFlowTests` (a `FakeWalkCalendar` behind the two closures):
  - `theCalendarIsOfferedOnceInLightOnly`: light, `.notAsked`: on reaching Today `state.calendarOffer`, `state.note == WalkCopy.calendarLine`, and `WalkCopy.points(state)` has `Calendar`; `choose(.calendar)`, `await scheduler.settle()` → `fake.asks == 1`, `calendarOffer == false`; back and next again → no offer. Full edition with `.notAsked` → never offered, `asks == 0`. Light with `.denied` → never offered.
  - `theCalendarLineStaysItsOwnTime`: `scheduler.advance(WalkState.noteMs)` → the note is still there; `scheduler.advance(WalkState.calendarNoteMs - WalkState.noteMs)` → nil.
  - `theSheetStartsDown`: `sheetOpen == false` on reaching step 6, true after `.sheetHandle`, false after another.
  - `tickingARowCompletesTheTaskWhoeverPlantedIt`: a walked first thing plus a second task dated today inserted straight into the store → `endingRows.count == 2`, `ring == (0, 2)`; `send(.rowToggled(secondId))` → that `SymphonyTask.completed`, `ring == (1, 2)`; again → not completed, `(0, 2)`.
  - `closingTheSheetFinishesTheWalk`: `.goToToday` → `onEnd(.finished)`, the stored position is `.finished`.
- [ ] **Step 2: Run** `WalkFlowTests`. Expected: FAIL to compile (`calendarAccess:` missing).
- [ ] **Step 3: Implement** the reducer cases, the two closures, `FakeWalkCalendar`, the model's three readings, and `WalkEndingSheet` with the measurements and colours of contract lines 535-574 (first appearance 900 ms, raise 600 ms, `cubic-bezier(.2,.8,.2,1)`).
- [ ] **Step 4: Run** `WalkFlowTests`. Expected: PASS.
- [ ] **Step 5: Screenshots** into `walk-shots/task-20/`, by launch argument: step 6 with the sheet down (`-SymphonyWalkStep 6`), and with a DEBUG argument `-SymphonyWalkSheet up` (read in `DemoMode`) the sheet raised.
- [ ] **Step 6: Commit.** `git commit -m "Walk: look back up, then Today rises with what each task is for"`

### Task 21: Accessibility minimum, other screen sizes, the UI test, the record
**Files:**
- Modify: `R/Walk/Views/*.swift`, `apple/SymphonyOS/PLANNING.md`
- Create: `SymphonyOSUITests/WalkUITests.swift` (wrapped whole in `#if os(iOS)`)

**Interfaces:**
- Consumes: `WalkLayout.Banner.label`, `WalkLayout.Label.hint`, `kept`, `focused` (Task 12); `WalkCopy.orbLabelWelcome`, `orbLabel`, `hint`, `points`, `rowLabel`, `rowDone`, `rowOpen`, `ringLabel` (9); `WalkModel.choose` (14).
- Produces: the accessibility identifier `walk.orb` on the orb. Every label and hint below is a `WalkCopy` value; this task types none.

- [ ] **Step 1: VoiceOver minimum** (D22), element by element:
  - The orb: one button, identifier `walk.orb`, label `WalkCopy.orbLabelWelcome` on Welcome and `WalkCopy.orbLabel` on every other step, hint `WalkCopy.hint(state)`, and one `accessibilityAction(named:)` per entry of `WalkCopy.points(state)` (named by its `label`) calling `model.choose(action)`.
  - A compass point, while shown: a button labelled with its `Point.label`.
  - An area label: where `tappable`, a button labelled with the area's name, hint `Label.hint`, with the selected trait when `kept` (on ground) or `focused` (on Year); elsewhere plain text with the name.
  - A banner, ghost or stub: a button labelled `Banner.label` (Task 12 has already chosen "tap to focus", "tap to move or pull up" or neither); a banner that does nothing on a tap is plain text with the same label.
  - The live flag: its words, announced politely as they change.
  - The hint row: the Undo pill and each chip are buttons labelled with their text.
  - The sheet: the handle a button labelled with its text; a row a button labelled `WalkCopy.rowLabel(title, forGoal:)` with the value `WalkCopy.rowDone` or `WalkCopy.rowOpen`; the ring labelled `WalkCopy.ringLabel(done:total:)`.
- [ ] **Step 2: Reduce Motion.** With `accessibilityReduceMotion`, the camera, labels and posts change with a 0.25 s cross-fade instead of the 1.4 s glide; banners do not flutter; the orb does not breathe.
- [ ] **Step 3: Other sizes.** Run the screenshot recipe on iPhone 17, iPhone 17 Pro Max and the `iPhone Duo` simulator, which is installed and booted on the build machine (`xcrun simctl install "iPhone Duo" …`, `xcrun simctl launch "iPhone Duo" …`, `xcrun simctl io "iPhone Duo" screenshot …`), at steps 0, 1 and 6: the stage is whole, centred, letterboxed in `#00106e`. With `-HalfOpen laptop` on the Duo the half-open display covers the walk. Save into `walk-shots/task-21/`.
- [ ] **Step 4: The UI test** `WalkUITests` (taps only; allow 60 s for launch). The UI test target cannot see `WalkCopy`, so the strings below are typed in it once and are the cross-check on Task 9.
  - `testAQuickStartPlantsAFlag` launches with `-SymphonyDemo -SymphonyLight -SymphonyWalk`; waits for the text `Let’s start up high and walk down to today.`; taps `buttons["walk.orb"]`, then `buttons["Quick start"]`; taps `buttons["Health"]`; taps the orb, then `buttons["Plant goals"]`; taps the orb, then `buttons["Examples"]`; taps `buttons["Example: Run a 5K, tap to make it yours"]`; asserts `buttons["Year: Run a 5K, tap to move or pull up"]` exists and `buttons["Undo"]` exists; taps that banner and asserts `buttons["Pull it up"]` exists.
  - `testAFullHouseholdSeesNoWalkUntilItAsks` launches with `-SymphonyDemo`; asserts `buttons["Today. Switch horizon"]` exists and the welcome text does not; taps `More`, `Settings`, then `Walk the mountain again`; the welcome text appears; taps `buttons["walk.orb"]`, then `buttons["Not now"]`; `buttons["Today. Switch horizon"]` exists again.
  Run `-only-testing:SymphonyOSUITests/WalkUITests -test-timeouts-enabled YES -default-test-execution-time-allowance 300`.
- [ ] **Step 5: Run the whole unit suite, then `LightEditionUITests`.** Expected: every test that passed before this plan still passes, unchanged.
- [ ] **Step 6: Write it down.** In `apple/SymphonyOS/PLANNING.md`: a "The walk" section (what it writes at each level and the three link columns; `linksDirty` / `areaDirty`; parents-first pushing and the lost-parent rule; the launch arguments `-SymphonyWalk`, `-SymphonyWalkStep`, `-SymphonyWalkOrb`, `-SymphonyWalkExamples`, `-SymphonyWalkSheet`; where the saved position lives and that undo does not survive a relaunch), and a note at line 27 that the write line still makes no `source_id` and the walk is the exception.
- [ ] **Step 7: Commit.** `git commit -m "Walk: VoiceOver actions, reduced motion, other screens, and the UI test"`

---

## Calls made in this plan (owner to check)

- **Links follow the web, not the decisions file.** Season and month goals are plain rows (not `is_goal`); a month goal names its season goal, and a week task its month goal, in `source_id`; `goal_id` is copied down the chain.
- **Sync changes for every household's phone:** it now also reads the household's life areas; a row with a link the phone set waits until the row it points at has gone up; and a link to a row that is no longer on the phone is sent as empty rather than blocking.
- **Undo is always on the compass** (up-left) while there is something to undo, as well as the 7-second pill. "Back up" still means go back a step; it never deletes anything. Undo does not survive closing the app.
- **The welcome offers Quick start, Plan my whole year, and Not now.** The mockup's "Just today" is gone; Not now is how you leave.
- **Posts do not stagger.** The mockup raised every other post by 70 points, which lifts them into the sky on the Year step. Only the labels sit in two rows.
- **On a crowded ridge one post is open at a time.** With six or more columns only the post you last touched shows its banners; the others show one small flag with a count.
- **Example flags hang on the post they would join.** In the mockup they float above the mountain, which is sky on the Year and Season steps.
- **At most eight areas** on the ridge.
- **A tall stack may pass in front of the small flags of the level above** in the same column, as in the mockup. Flags never overlap others of their own level, the labels, the question or the orb.
- **Flags fade with distance by colour only**, not the mockup's slight blur. The bare pole under the lowest banner is 24 points, not 18. The day on a banner is in capitals, as in the mockup.
- **"So", "okay", "well", "like" are only dropped before a comma or another filler,** so "Like myself again" stays whole. "Uhm", "erm" and "ok" count as fillers too. Fillers alone ("um", "okay") plant nothing.
- **A day is only pulled out on the Week step,** and only from the end of what was said. A weekday already past means next week's. At the Today step nothing is pulled out: what is said is today's first thing, whole.
- **Words that are only a day** ("today", at the Week step) become a task called "Today" on that day.
- **Titles longer than 200 characters are cut at a word;** an area name at 24; a question quotes at most 40 characters of a flag.
- **Walking on focuses the flag you just planted,** so the next question is about it and the next flag links to it: from Season on in a quick start, from Month on in a whole year. Tap it to let go.
- **Whole year** visits areas in the order you kept them, then asks about each year goal in turn at the Season step. Month, Week and Today then run as in a quick start.
- **The first thing today** is one task. Saying one at the Today step makes a new task for today; marking another moves the mark. On the ordinary Today page, other tasks already chosen for today may sort beside it.
- **Week tasks said for today are not marked as chosen;** only the first thing is.
- **Week flags are found by their link, not their week:** one said for a day up to the end of next week is still on the mountain after closing and reopening.
- **The walk shows your own personal plan** for the periods it files into, but only moves or pulls up flags it planted itself. Work and Family items never appear in it. A replay starts with nothing counted as planted.
- **The ending lists your personal tasks for today,** including ones the walk did not plant, and any of them can be ticked there.
- **No "Walk it again" in the ending.** Replay is from Settings only. The sheet's taps are its handle, its rows, "Walk another one down" and "Go to Today".
- **A kept area is only saved once something is planted on it.** An existing personal area with the same name is reused.
- **The Week step always plans the week you are in,** even on its last day.
- **In the light app, Year, Season and Month open on the period the walk files into** (in mid-November: next year, the coming winter).
- **The hint line says "Let go to choose" and "Tap a point, or tap the light to close"** while the compass is open. The mockup showed nothing there.
- **The ending has a "Go to Today" link** at the foot of the sheet; the mockup had no way to close it. With nothing for today the sheet says "Nothing planted for today yet."
- **The bundled picture is 3120 pixels wide, JPEG, about 1.8 MB.**
- **Haptics play even when sound is off.**
- **The calendar is offered as a compass point, "Calendar",** on the Today step, with the quiet line, once.
- **The ordinary Today page does not show "for <goal>" yet;** only the ending sheet does. Today's design is the next stage.
- **What VoiceOver says** for the light, peaks, flags and rows (Task 9) is this plan's wording.
- **Nothing is typed in the simulator,** by a test or by hand, because typing stalls it. The UI test plants an example flag; typing is proven by unit tests and by the hand walk below.

## Stops for the owner

- **Recorded sounds.** Five recordings are needed (bag rustle, poles clacking, cloth flap, swish and thud, tick; lengths and character in contract §12). Until then the app plays synthesized placeholders, which the spec says not to ship. Drop `walk-bag`, `walk-poles`, `walk-unfurl`, `walk-plant`, `walk-tick` (`.wav`, `.caf` or `.m4a`) into `R/Resources/WalkSounds`.
- **The tall painting.** The walk is built on the square overlook, upscaled, at 3120 pixels. It is a little soft at the closest zoom on the largest phones, and plain colour shows below the picture on the Week and Today steps. The tall painting replaces it by adding one `WalkArt` value.
- **A real walk by hand, on a real iPhone.** Nobody types or speaks to the simulator in this plan. On a device, start to finish: hold, speak, let go (the words appear, the flap and thud are heard, the next hold listens again); type one through the compass; a quick start down to Today; listen to all five sounds.
- **"The full plan is offered again at each new season"** is not built. It needs the daily signpost, which is not designed. Until then "Walk the mountain again" in Settings is the way back.
- **Nothing here is pushed.** TestFlight and main wait for Scott.

## Pre-flight amendments (2026-11-13)

Changes made after the pre-flight scan (`.superpowers/sdd/2026-11-13-iphone-light-walk/preflight.md`). Tasks 1 and 3 are untouched.

- **F1** Task 4: `tidy` now works on word cores and returns nil when only fillers remain; tests add "okay" and "so, um".
- **F2** Task 7: in `forGoal` a self-link is no link and the climb never revisits a row; the test adds two rows that link to each other.
- **F3** Task 7: week flags load by link (planted, or `sourceId` in view) from this week's start through the end of next week; tests in Tasks 7 and 17 ("gym on Tuesday" survives a reload).
- **F4** Task 6: `dropAreaIfUnused` deletes a still-queued insert, or queues a delete for a sent area; two tests.
- **F5** Tasks 4, 10 and the Calls: no day is pulled out on the Today step; tests `todayKeepsItsWords`, `theFirstThingKeepsItsWords`.
- **F6** Task 8: the last-planted parent is focused on entering Month, Week and Today in both depths; tests in Tasks 8 and 17.
- **F7** Tasks 6, 7, 8, 10, 14, 20: `WalkWrite.done` and `WalkWriter.setDone` became `toggleDone(UUID)` through `PlanWriter.complete`; the sheet's rows and ring are read from the store; `rowToggled` carries a task id and works for any task.
- **F8** Task 12: an example counts as planted when its tidied, day-less title equals a flag's, without case.
- **F9** Tasks 4, 12, 14: the day tag is uppercase from `WalkWords.tag` on; views draw it as given.
- **F10** Task 9: every note, hint-row, ending, Settings and VoiceOver string is a named `WalkCopy` member; Tasks 10, 11, 15, 16, 18, 20 and 21 use the names.
- **F11** Global Constraints and Tasks 14, 17, 19, 21: the test files that touch iOS-only types are named and wrapped in `#if os(iOS)`; Task 18's model test moved from `WalkPositionTests` to `WalkModelTests`.
- **F12** Global Constraints, Tasks 15, 17, 18, 20: no typing by hand; screenshots come from launch arguments (`-SymphonyWalkOrb open|type`, `-SymphonyWalkExamples`, `-SymphonyWalkSheet up`); the hand walk is under Stops.
- **F13** Tasks 8, 14, 18, 20: `walkAgain`, `WalkEffect.replay` and `WalkModel.onReplay` are gone; the ending has no replay control.
- **F14** Global Constraints: `SymphonyOSTests/WalkTestSupport.swift` holds the shared fakes; Task 14 creates it, Tasks 16, 19 and 20 add to it, Tasks 16 to 20 consume it.
- **F15** Tasks 9, 12, 21: exact VoiceOver labels and hints per element and state (`WalkCopy.bannerLabel`, `BannerRole`, `levelName`, `areaHint`, `rowLabel`), carried on `Banner.label` and `Label.hint`; the orb has the identifier `walk.orb`.
- **F16** Task 20: `WalkModel` takes `calendarAccess` and `requestCalendar` closures defaulting to `AppleCalendarService.shared`; tests pass `FakeWalkCalendar`.
- **F17** Tasks 8, 14, 18: a position is first saved when a depth is chosen on Welcome (`quick` / `full` emit `.save`); Task 14 pins that nothing is saved before, Task 18's test follows it.
- **D1** Shared numbers have one name each (`WalkLoad.maxAreas`, `WalkWords.maxTitle`, `WalkWords.maxAreaName`, `WalkCopy.shortLength`, `WalkState.undoMs`, `noteMs`, `calendarNoteMs`, `WalkOrb.holdMs`) and are used by name.
- **D2** Task 2: a clean row names no parents; a parent with no queued insert and no row on the phone is lost, its link is cleared and sent as null (`knownIds`, `lostParents`, `clearLinks`); tests.
- **D3** Task 14: `WalkScheduling` (`after`, `cancel`, `run`), `WalkClock`, and `ManualWalkScheduler` for tests; Tasks 16, 19 and 20 route speech, delayed sounds and the calendar ask through it. Speech reaches the model through `WalkListening.onWords`, not observation. Task 19 adds `WalkSound.bundleFiles`.
- **D4** Task 17's fixes are limited to seven named files; Task 21 uses the installed `iPhone Duo` simulator; a full banner's `text` is the whole title; `short` is 39 characters and an ellipsis.
- **D5** Task 15 has `WalkStage` (device ↔ stage) and `WalkOrb.hits` with `WalkStageTests`; the picture test reads `cgImage.width`.
- **D6** Tasks 8, 13, 17: the undo stack is in memory only; `aRestoredWalkHasNothingToUndo` and `leavingAndComingBack` pin it.
- **Also** Task 14 writes out which `WalkWriter` method each `WalkWrite` case calls and sets `onEnd` in the demo path; Task 9 writes out `question` and `why`; Task 7's ending rows are personal tasks only; Task 18 cites `PlannerView.seasons`; Task 21 no longer quotes a test count.

## As built (2026-11-13): what changed from the plan above

All 21 tasks are built on branch `claude/ios-light-build`, each reviewed, then reviewed once more as a
whole. Nothing is pushed, merged or deployed. On the iPhone 17 simulator the unit target passes (647 tests) and so do the two UI suites (`WalkUITests`, `LightEditionUITests`). Nobody has spoken or typed into the walk on a
real iPhone, and nobody has heard the sounds: the hand walk under "Stops for the owner" is still the
gate before any release.

### Where the build departs from the plan's text

These lines of "Calls made in this plan" are no longer true; the rulings below replaced them.

- **Lost links.** A link is not cleared because its row is missing from the phone. The row is pushed as
  it is; only if the server refuses it (a foreign-key error) are the links to rows that are not on the
  phone cleared. A child stops waiting once its parent has failed ten times. A day's "first thing" also
  waits for its task.
- **The hint line is blank while the compass is open,** and the Undo pill is hidden then, as in the
  mockup.
- **Overlap.** Labels are protected only on the ground and the Year step, where they take taps. The
  question line is a ceiling for every level. A stack folds under a focused flag risen from the level
  above. On a crowded ridge the open post's flags narrow to stay clear of their neighbours.
- **Examples.** At least one example always shows when asked for; on lower steps often one or two, not
  three. Your own flag folds to one line to make room.
- **The Year camera stop is −495,** not the mockup's −553, so the peaks' labels clear the light.
- **Letting go does not plant at once.** The flag waits up to one second for the last words.
- **Speech is on the phone only.** Where on-device recognition is not supported the walk opens typing.
- **Sounds are silent while the walk is listening;** the haptic still plays.
- **The calendar is asked for once;** the quiet line may show again until the Calendar point is chosen.
- **In the light app** the Today row always returns to today, Week opens on this week, and the row of
  the page you are on keeps reading what is on screen.
- **Look back up** shows each post's newest flag with "+n" for the others.
- **In a full household a walk left half-way is not resumed at launch.** Light households resume.
- The Architecture line "the only sync change is three link columns and one new table" understates it:
  see "Sync changes" in `apple/SymphonyOS/PLANNING.md`.

### Rulings made during the build (each is a call made for the owner)

In the order they were made. "If wrong" is what it costs to change.

1. **W1** Links follow the web (`source_id` down the chain, `goal_id` copied), not the decisions file's `is_goal` columns, which the live database would refuse. If wrong: a web page that reads the other columns would not see the walk's links.
2. **W2** The plan-writer's calls stand: Undo is a sixth compass point; "Go to Today" closes the ending; posts do not stagger; examples hang on a post; the UI test plants an example, not typed text; the picture is a 3120 px JPEG. If wrong: each is one small change.
3. **W3** The 23 mismatches between tasks found before building were each settled (the plan's "Pre-flight amendments"). If wrong: the affected task's test names the rule.
4. **W4, W5** A row re-linked while its push is in flight keeps its new links; the writer sets the "links changed" flag and queues the change in the same save. If wrong: nothing; these only prevent a lost link.
5. **W6** A custom area's name does not match on small words (the, and, my…). If wrong: an area named only with such words never attracts a goal by its words.
6. **W7** "Lost parent" is decided by the server, never by absence from the phone; a child gives up waiting after ten parent failures. If wrong: a link to a row deleted elsewhere costs one refused push before it clears.
7. **W8, W9** The writer refuses to touch rows that are not the signed-in person's own, and only flags the walk planted can be moved or pulled up. If wrong: nothing; these only refuse.
8. **W10** A goal whose area is not one of the kept peaks stands on the unlabeled post. If wrong: a goal filed under a ninth or a Work area shows without a peak, in the walk only.
9. **W11, W13, W14** Whole-year tours remember their place across nudges, taps, back-ups and a relaunch. If wrong: a tour could skip or repeat a goal.
10. **W12** The calendar is never offered again once answered. If wrong: none.
11. **W15, W17** A resumed walk loads its rows before restoring its place; what the walk planted is remembered across a relaunch. If wrong: after a relaunch your own flags could not be moved.
12. **W16** Undo of a move restores the old peak; an example already planted is not offered again; "first thing" puts a task's earlier day back when the mark leaves it. If wrong: one rule each.
13. **W18 → W26, W27** Holding and letting go without speaking shows a quiet note the first time and opens typing the second; a refusal opens typing at once and for the rest of that walk; a session that dies mid-hold keeps what it heard. If wrong: a dead microphone takes two holds to reach typing.
14. **W19, W20, W21, W22** The layout rules listed under "Overlap" above; the step's own newest flag is always shown with its words. If wrong: a look change in the layout only.
15. **W23, W24** Blank hint while the compass is open; only the typing row rises with the keyboard, the question stays. If wrong: on a small phone the typing row hides a flag until the keyboard closes.
16. **W25** Letting go waits up to one second for the recogniser's last words before planting. If wrong: every spoken flag lands up to a second late. **Needs a real iPhone to judge.**
17. **W28** The walk never sends audio to Apple's servers. If wrong: people whose language has no on-device recognition type instead of speak. **Owner to confirm.**
18. **W29, W32** Examples fold your own flag to make room; in the tightest spots the first example is cut to one line. If wrong: an example reads truncated.
19. **W30, W33** Labels stay off the light; the Year view sits 24.5 points higher than the mockup. If wrong: one number. **Owner to look.**
20. **W31** "Walk another one down" starts clean; a day's "first thing" waits in the sync queue for its task (every household). If wrong: a first-thing mark goes up slightly later after a failed task push.
21. **W34** On a seven- or eight-peak ridge the open post's flags narrow to about 48–54 points. If wrong: their titles are cut hard there. **Owner to look.**
22. **W35, W37** Only the automatic first start waits for the first sync; a resume opens at once; a replay request is forgotten at sign-out; the light switcher rules above. If wrong: a resumed walk could open over rows a pending sync would have changed.
23. **W36, W38** No sound while the walk listens (speech mode ignores the silent switch); Tell Symphony's code is untouched. If wrong: the cloth sound is felt, not heard, when speaking. **Owner to decide with the recordings.**
24. **W39** The ending's rows are your own personal tasks for today, read only on that screen; the next event comes from the same calendar feed Today uses. If wrong: cosmetic.
25. **W40** The bundled picture's pale left and bottom edges were repaired in place (same size). The original in `~/Pictures` still has them. If wrong: re-export the picture.
26. **W41** One final fix wave after the whole-branch review: the first pull is reported before the realtime channels join (so the walk does not arrive late over an empty Today); a first thing links to its month line; while a flag waits for its last words any other tap plants it first; typed words cannot be lost to event order; "the weekend" is a day only when clearly one; the keyboard and the dock's capture sheet give way when the walk opens. If wrong: three commits to revisit.
27. **W42** A full household is not pulled back into a half-finished replay at launch; a "Leave for now" point was NOT added to the compass. **Owner to decide** whether the walk needs a way out between Welcome and the end.

### Known and not fixed

- Moving a year goal to another peak leaves the flags already under it on the old peak.
- Undo and pull-up share the app's existing gap: a change made while its push is in flight can be lost.
- An empty life area can be left behind after a pull-up.
- A walk left open across midnight keeps yesterday's dates until the app next comes to the foreground.
- `PeriodPlanView` and `WeekPlanView` read households unsorted (matters only with two households).
- The sounds also ship in the Mac build (about 150 KB, unused there).

### For the owner to look at (none block the build)

- **Look back up:** the peaks' labels are too faint to read (the mockup's own fade).
- **The compass on Year and the ground:** the top and upper-right points sit over the peak labels (the mockup's positions).
- **The hint line** sits about 8 points from the bottom, inside the home-indicator zone (the mockup's position).
- **"This year" in the Year question** in November and December, while the goal is filed into next year (the spec's wording); and in light the Year page then opens on next year.
- **A second phone:** someone who chose "Not now" on one phone, and has no year goals, is offered the walk again on another.
- **The Duo's inside screen:** the stage is letterboxed between navy bars with visible seams; the status column overlaps the raised sheet's corner. No Duo layout is designed.
- **No password reset on the iPhone; email confirmation unchecked** (from the foundations stage).
- **Outside this work:** the database's week and period triggers use a fixed US Eastern day, which will mis-date week tasks near midnight for people elsewhere. Worth fixing before a public launch.

### Known gaps left after the final review (safe to merge with; recorded)

- A Tell Symphony link, or the Duo's outside-screen sheets, can still open above the walk.
- A Move or Pull-up chip tapped in the second after letting go is ignored.
- When words arrive after an empty let-go, VoiceOver may announce the first partial words.
- "By the weekend" and a bare "…weekend" are not read as days.
- A full household's half-finished replay position stays stored on the phone, unused.

### Before any release

The foundations plan's release checklist still stands and comes first (database changes, functions,
integration tests, opening signup last). The walk adds no database change: the columns and the
`goal_areas` table it writes to are already live. For the walk itself:

- [ ] **A hand walk on a real iPhone:** hold, speak, let go (the words appear and the flag plants with
      its last word); type one flag through the compass; a quick start down to Today; "Walk the mountain
      again" from Settings in a full household, then "Not now"; one pass with VoiceOver on.
- [ ] **Decide** the four calls marked "Owner to confirm / decide / look" above (speech on the phone
      only; the cloth sound while speaking; the one-second wait; a way out between Welcome and the end).
- [ ] **Five recorded sounds** in place of the placeholders (`R/Resources/WalkSounds`).
- [ ] **The tall painting**, if it is to replace the square overlook before launch.
- [ ] Mockups and approval for Today, Week, the Duo layouts, tent view and the daily signposts: none of
      those is designed or built.
