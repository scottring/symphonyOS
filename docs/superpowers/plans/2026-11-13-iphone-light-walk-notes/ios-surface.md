# iOS surface the walk must use (research, read-only)

Checkout: /Users/scottkaufman/.claude-worktrees/symphonyOS/ios-light-build (HEAD d6454cab).
R = apple/SymphonyOS/SymphonyOS. T = apple/SymphonyOS/SymphonyOSTests. Line numbers are from this checkout.
"NOT FOUND" means searched and absent.

## Headline findings (read first)

1. **The three goal links are PULL-ONLY on iOS.** `SymphonyTask.isGoal`, `.goalTaskId`, `.goalId` exist (R/Models/SymphonyTask.swift:107,109,111) and are read in `RowMapper.taskFromRow` (R/Services/SyncEngine/RowMapper.swift:85-87), but `SyncEngine.taskRow` (R/Services/SyncEngine/SyncEngine.swift:485-566) never sends `is_goal`, `goal_task_id`, `goal_id`. Nothing on iOS writes them (only DemoMode.swift:162,171 and tests set `isGoal`). The walk cannot link anything until taskRow pushes them.
2. **Month goal -> season goal link has no iOS field at all.** The web/DB use a third column, `tasks.supports_goal_task_id` (migration supabase/migrations/2026-09-24_goal_supports_goal.sql; web write at src/hooks/useSupabaseTasks.ts:999, :2066). NOT FOUND anywhere in apple/. Web model (src/lib/planning/goalSupport.ts:5-12): month goal --supports_goal_task_id--> season goal (tasks row, is_goal, bucket 'quarter'); season goal --goal_id--> year goal (goals row); week task --goal_task_id--> its goal (a "step", must point at an is_goal row).
3. DB guard triggers (supabase/migrations/2026-09-27_guard_goal_conversion.sql) enforce: `supports_goal_task_id` must point at an is_goal row with bucket 'quarter' (error "this can only support a season goal"); `goal_task_id` must point at an is_goal row ("a next action can only be filed under a goal"). Header says "PREPARED - NOT APPLIED" (line 1). I did NOT verify which of these migrations are live. Verify against the live DB before building.
4. **Existing planner code treats `isGoal` rows specially**, so the walk's month/season rows will change what pages show: `PlanSnapshot.weekList`/`week` exclude `isGoal` (PlanSelectors.swift:278,292), `reviewRows` excludes them (:310), `unfinished` excludes them (:92), and `stepsInstead` replaces a week-held goal by its open steps where `s.goalTaskId == goal.id` (:226-236). The product rule (CLAUDE.md) says no goal/task split above the week, and the current Season/Month pages create plain rows with `isGoal == false` and no link (PlanWriter.createPeriodTask, test PaperFoldTests.swift:83-108 asserts `!t.isGoal`, `goalTaskId == nil`). Walk must decide: set `isGoal` on month/season rows (matches web + guard triggers, but then Month/Season sheets and `stepsInstead` need checking) or leave plain and store links only.
5. **No area model on iOS** (goal_areas / area_id NOT FOUND in apple/ except one test string, PlanningTests.swift:458). Server has `goal_areas`, `tasks.area_id`, `goals.area_id` (supabase/migrations/20261101130000_guided_planning.sql:18-43). iOS `Goal` has `context`, `scope` but no `areaId`.
6. **Today shows no "for <goal>" lineage** and has no "first thing today" concept; Today's list order ignores `sortOrder` (see section 3).
7. **Tall scenery already exists** in ~/Pictures/Symphony scenery (overlook-tall, 3375x6000 upscaled) - the spec says only the square exists. See section 7. iOS bundle has no scenery.
8. **Apple Calendar (EventKit) already exists** in this branch (R/Services/AppleCalendar.swift; `AppleCalendarService.shared.requestAccess()`), contrary to the spec's "Today the app reads Google Calendar only".
9. `Dictation` keeps the previous `transcript` across `start()` calls and exposes no on-device flag; it is reusable but needs a reset (section 5).
10. No CaptureParser tests exist (section 10).

---

## 1. Goals and planning writes

### PlanWriter (R/Services/Planning/PlanWriter.swift, 631 lines)
```swift
struct PlanWriter {                                   // :17
    let context: ModelContext
    let userId: UUID
```
Public/internal API (all in the struct; `private` ones listed under Plumbing):
```swift
struct Snapshot {                                     // :24
    struct TaskState {                                // :25
        let id: UUID; let bucket: String?; let scheduledFor: Date?; let isAllDay: Bool; let isSomeday: Bool
        let weekStart: Date?; let monthStart: Date?; let seasonStart: Date?; let weekendStart: Date?
        let deferCount: Int; let context: String?; let scope: String?
        var dismissedAt: Date? = nil; var sortOrder: Int? = nil
    }
    var tasks: [TaskState] = []
    var createdCommitments: [UUID] = []
    var changedCommitments: [(UUID, String, Date?, Date?)] = []   // (id, prev status, prev endedAt, prev carriedTo)
    var createdFocus: [UUID] = []
    mutating func merge(_ other: Snapshot)            // :47
}
enum Destination: Equatable { case today; case day(Date, allDay: Bool); case thisWeek; case someday   // :64
    var needsLifeArea: Bool { true } }
static func needsLifeArea(_ task: SymphonyTask) -> Bool   // :76  (task.context == nil && task.parentTaskId == nil)
@discardableResult func move(_ task: SymphonyTask, to destination: Destination, lifeArea: String? = nil, members: [FamilyMember] = []) -> Snapshot   // :83
@discardableResult func planTask(_ task: SymphonyTask, on date: Date) -> Snapshot     // :127  (week task -> a day; keeps week commitment; focuses if today)
@discardableResult func clearDay(_ task: SymphonyTask) -> Snapshot                    // :141
@discardableResult func reorder(_ task: SymphonyTask, in ordered: [SymphonyTask], toIndex: Int) -> Snapshot  // :163
static let sortOrderGap = 1000                                                        // :176
static func orderWrites(_ list: [(UUID, Int?)], moving id: UUID, toIndex: Int) -> [(UUID, Int)]  // :179
@discardableResult func createPeriodTask(title: String, level: String, periodStart: Date, context lifeArea: String? = nil) -> SymphonyTask  // :208
func undo(_ snap: Snapshot)                                                           // :246
func chooseRoutine(_ routine: Routine, on date: Date, flexible: Bool)                 // :313
func unchooseRoutine(_ routine: Routine, on date: Date, flexible: Bool)              // :324
func setOccurrence(entityType: String, entityId: String, on date: Date, status: String)  // :340
func moveRoutine(_ routine: Routine, from viewed: Date, to day: Date)                // :378
static func moveTarget(for routine: Routine, on day: Date) -> (when: Date, dayOnly: Bool)  // :405
@discardableResult func keep(_ task: SymphonyTask, from old: TaskCommitment, into week: Date) -> Snapshot  // :438
@discardableResult func letGo(_ task: SymphonyTask) -> Snapshot                       // :465
@discardableResult func someday(_ task: SymphonyTask) -> Snapshot                     // :485
@discardableResult func someday(_ task: SymphonyTask, from commitment: TaskCommitment) -> Snapshot  // :491
func complete(_ task: SymphonyTask)                                                   // :516 (-> TaskViewModel.toggleComplete)
@discardableResult func createGoal(name: String, notes: String?, context: String?, year: Int) -> Goal  // :523
func updateGoal(_ g: Goal, name: String, notes: String?, context: String?, status: String)             // :538
```
Plumbing (private): `capture(_:)` :55, `revive` :232, `placeOnDay(_:day:allDay:)` :234, `ensureCommitment(_:level:periodStart:) -> Snapshot` :559, `removeOpenCommitments` :580, `queueCommitment` :596, `focus(_:on:) -> [UUID]` :603, `unfocus` :613, `touch(_:)` :624, `save()` :630.

**Not in PlanWriter:** nothing that takes a parent/link argument. `createGoal` and `createPeriodTask` take no `goalId`/`goalTaskId`/`supportsGoalTaskId`/`areaId`; no public "focus a task today" (private `focus(_:on:)`; reachable only via `move(.today)` which also sets `bucket="timed"`, `scheduledFor=day`, `isAllDay=true`, `deferCount += 1`, or `planTask(on:)`/`move(.day)` when the day is today).

Verbatim bodies that matter:
```swift
// createGoal :522-536
@discardableResult
func createGoal(name: String, notes: String?, context: String?, year: Int) -> Goal {
    let all = (try? context_fetchGoals()) ?? []
    let g = Goal(id: UUID(), userId: userId, name: name, year: year, syncStatus: .pending)
    g.notes = notes
    g.context = context
    g.sortOrder = all.filter { $0.year == year }.count
    g.scope = ScopeRule.scopeForDomain(context: context, assignees: [], selfMemberId: nil)
    g.lastSyncedAt = nil
    self.context.insert(g)
    self.context.queueSync(table: "goals", recordId: g.id, type: "insert")
    save()
    return g
}
// createPeriodTask :207-226
func createPeriodTask(title: String, level: String, periodStart: Date, context lifeArea: String? = nil) -> SymphonyTask {
    let start = PlanCalendar.day(periodStart)
    let t = SymphonyTask(userId: userId, title: title, context: lifeArea)
    t.bucket = PlanSnapshot.bucket(for: level)       // "season" -> "quarter"; "month"/"week" unchanged
    switch level {
    case "week": t.weekStart = start
    case "month": t.monthStart = start
    default: t.seasonStart = start
    }
    t.placementDirty = true
    t.scope = ScopeRule.scopeForDomain(context: lifeArea, assignees: [], selfMemberId: nil)
    context.insert(t)
    context.queueSync(table: "tasks", recordId: t.id, type: "insert")
    _ = ensureCommitment(t, level: level, periodStart: start)
    save()
    return t
}
// placeOnDay :234-242
private func placeOnDay(_ task: SymphonyTask, day: Date, allDay: Bool) {
    task.bucket = "timed"; task.scheduledFor = day; task.isAllDay = allDay; task.isSomeday = false
    task.weekStart = PlanCalendar.weekStart(day)
}
```
Note: createPeriodTask does NOT return a Snapshot (no undo); the returned task is inserted and a commitment created (`snap.createdCommitments` discarded).

### Undo mechanics (:246-303)
`undo(_ snap: Snapshot)` re-fetches all `SymphonyTask`, restores bucket/scheduledFor/isAllDay/isSomeday/weekStart/monthStart/seasonStart/weekendStart/deferCount; dismissedAt and sortOrder (flags dirty when changed); context+scope (sets `scopeDirty`); sets `placementDirty = true`, `touch(t)`. Created commitments: if a still-queued `PendingChange` insert exists for it, deletes the insert and the commitment, else sets `status="removed"`, `endedAt=now` and queues an update. Changed commitments restored from the tuple. Created focus rows -> `unfocus` (queues a keyed delete, or drops the queued insert). **A task created by createPeriodTask/createTask is not removed by undo** (snapshot tasks only restore fields); a walk "Back" would need to delete the row itself (`TaskViewModel.deleteTask`) and its commitment.

### TaskViewModel (R/ViewModels/TaskViewModel.swift:6-173)
```swift
@Observable final class TaskViewModel {                // :6
    init(modelContext: ModelContext)                   // :9
    func createTask(title: String, userId: UUID, scheduledFor: Date? = nil, isAllDay: Bool = false, context: String? = nil) -> SymphonyTask   // :16
    func createTask(fields: PageTaskFields, userId: UUID) -> SymphonyTask      // :34
    func toggleComplete(_ task: SymphonyTask)           // :50
    func schedule(_ task: SymphonyTask, for date: Date?, isAllDay: Bool = false)   // :58
    func setContext(_ task: SymphonyTask, context: String?, members: [FamilyMember])   // :73
    func assign(_ task: SymphonyTask, to memberId: UUID?, members: [FamilyMember])     // :82
    func deferTask / markSomeday / moveToBucket / updateTitle(:124) / updateNotes(:132) / reconcileScope(_:members:) :145
    func deleteTask(_ task: SymphonyTask)               // :161
}
```
`createTask(title:userId:scheduledFor:isAllDay:context:)` body (:16-31): builds `SymphonyTask(userId:title:scheduledFor:context:)`, `isAllDay`, `bucket = scheduledFor != nil ? "timed" : "inbox"`, insert, `queueSync("tasks", insert)`, save. It sets no `scope`, no `weekStart`, no commitment.

### Models (R/Models/Planning.swift, 130 lines)
```swift
@Model final class TaskCommitment {                    // :17-53
    @Attribute(.unique) var id: UUID
    var taskId: UUID
    var level: String            // "season" | "month" | "week"
    var periodStart: Date        // local midnight of the period's first day
    var status: String           // "open" | "done" | "carried" | "removed"
    var carriedTo: Date?; var createdBy: UUID?; var endedAt: Date?; var createdAt: Date
    var syncStatus: SyncStatus; var lastSyncedAt: Date?
    init(id: UUID = UUID(), taskId: UUID, level: String, periodStart: Date, status: String = "open", createdBy: UUID? = nil, syncStatus: SyncStatus = .pending)
    var holds: Bool { status == "open" || status == "done" }
}
@Model final class TaskFocus {                         // :60-92
    @Attribute(.unique) var id: UUID                   // derived: TaskFocus.key(taskId:userId:date:)
    var taskId: UUID; var userId: UUID; var date: Date; var createdAt: Date
    var syncStatus: SyncStatus; var lastSyncedAt: Date?
    init(taskId: UUID, userId: UUID, date: Date, syncStatus: SyncStatus = .pending)
    static func key(taskId: UUID, userId: UUID, date: Date) -> UUID
}
@Model final class Goal {                              // :96-130
    @Attribute(.unique) var id: UUID
    var userId: UUID; var name: String; var year: Int
    var status: String           // "active" | "completed" | "archived"
    var notes: String?; var context: String?; var sortOrder: Int
    var scope: String? = nil     // derived from context at creation; sent on insert only
    var syncStatus: SyncStatus; var lastSyncedAt: Date?; var createdAt: Date; var updatedAt: Date
    init(id: UUID, userId: UUID, name: String, year: Int, syncStatus: SyncStatus = .synced)
}
```
`SymphonyTask` stored properties (R/Models/SymphonyTask.swift:26-149), the planning-relevant ones verbatim:
```swift
var id: UUID; var userId: UUID; var title: String; var completed: Bool
var completedAt: Date? = nil; var completedAtDirty: Bool = false
var scheduledFor: Date?; var deferredUntil: Date?; var deferCount: Int; var isAllDay: Bool; var isSomeday: Bool
var bucket: String?          // "inbox" | "week" | "month" | "quarter" | "someday" | "timed"
var context: String?         // "work" | "family" | "personal"
var parentTaskId: UUID?
var scope: String?; var scopeDirty: Bool = false
var weekStart: Date?
var monthStart: Date? = nil; var seasonStart: Date? = nil; var weekendStart: Date? = nil
var isGoal: Bool = false           // :107  "A month/season goal row (an outcome), not an action."
var goalTaskId: UUID? = nil        // :109  "A step under a goal row."
var goalId: UUID? = nil            // :111  "The year goal (`goals` row) this serves."
var plannedOn: Date? = nil         // :115  legacy shared "chosen for this day"; read-only
var placementDirty: Bool = false
var sortOrder: Int? = nil; var sortOrderDirty: Bool = false
var dismissedAt: Date? = nil; var dismissedAtDirty: Bool = false
var syncStatus: SyncStatus; var lastSyncedAt: Date?; var createdAt: Date; var updatedAt: Date
init(id: UUID = UUID(), userId: UUID, title: String, completed: Bool = false, scheduledFor: Date? = nil, context: String? = nil, notes: String? = nil, syncStatus: SyncStatus = .pending)
```
Also: `supportsGoalTaskId` NOT FOUND. SwiftData additions need inline defaults (comment at :88-91, :36-37: "an existing install losing its local store on this build bricks it").

### How each level is represented today
| Thing | Rows written by iOS today | Created at |
|---|---|---|
| Year goal | `Goal` row (year, name, context, scope, sortOrder) + `PendingChange(goals, insert)`. No commitments. | R/Views/Planner/PeriodPlanView.swift:249-253 (`PlanWriter(...).createGoal(name: text, notes: nil, context: lens, year: year)`), R/Views/Planner/GoalEditorSheet.swift:135-140 |
| Season item | `SymphonyTask` bucket `"quarter"`, `seasonStart = start`, `placementDirty`, scope, + `TaskCommitment(level:"season", periodStart:start)`. isGoal false, no link. | PeriodPlanView.swift:221-223 `createPeriodTask(title: text, level: level, periodStart: start, context: lens)` (level string passed through; `level` is "season") |
| Month item | same with bucket `"month"`, `monthStart`, commitment level `"month"` | same call, level "month" |
| Week task (undated) | bucket `"week"`, `weekStart`, commitment level `"week"` | WeekPlanView.swift:227-229 and :339-341 `createPeriodTask(title: text, level: "week", periodStart: weekStart, context: appState.domainFilter.contextValue)` |
| Week task placed on a day | `planTask(task, on: day)` -> `bucket="timed"`, `scheduledFor=day`, `isAllDay=true`, `weekStart` recomputed; the week commitment stays open; + `TaskFocus` row if the day is today | WeekPlanView.swift:279, :390; ChooserSheet.swift:156 |
| Today | `move(task, to: .today)`: dated today, all-day, `deferCount += 1`, `TaskFocus` insert | R/Views/Planner/TriageController.swift:61 |

Call-site quotes: PeriodPlanView.swift:217-224 (`periodContent`), :246-254 (`yearContent`); `PeriodPlanView.Level` is `enum Level { case month, season, year }` (PeriodPlanView.swift:11). `WriteLine(placeholder:) { text in ... }` is the one-line writer. Period start passed for year = Jan 1 of `date`'s year (`PeriodPlanView.swift:206`), season = `PlanCalendar.season(containing:boundaries:).start`, month = `PlanCalendar.monthStart(date)`.
WeekPlanView re-uses `PaperFoldView` components (R/Views/Planner/PaperFoldView.swift, 1030 lines; `enum Paper` colours/fonts at :119-135, `PaperSoundToggle` :1013). PaperFoldView writes tasks only through `SheetLine` / `WriteLine` (no createPeriodTask call there; grep of PlanWriter/createPeriodTask in PaperFoldView: none).

### Sync of these writes (what pushes)
- `taskRow` (SyncEngine.swift:485-566) sends: id, user_id, title, completed, scheduled_for, deferred_until, defer_count, is_all_day, bucket, estimated_duration, context, category, notes, links, phone_number, location, location_place_id, contact_id, assigned_to, assigned_to_all, project_id, parent_task_id, link_type, created_at, updated_at; capture_meta only if `captureStatus`; week_start/month_start/season_start/weekend_start (all four when `placementDirty`, else only a set week_start); `scope` when `forInsert || scopeDirty`; `sort_order` when `sortOrderDirty`; `completed_at` when `forInsert || completedAtDirty`; `dismissed_at` when `dismissedAtDirty`. **Not sent: is_goal, goal_task_id, goal_id, supports_goal_task_id, area_id, planned_on.**
- Pushes are one PendingChange per (table, recordId, type), run in creation order ("task's insert queues before its commitment's", PaperFoldTests.swift:104-106). A `goals` insert must queue before any task whose `goal_id` points at it.
- `commitmentRow` :703-713, `goalRow` :720-734 (sends id, user_id, name, year, status, notes, context, sort_order, updated_at; `scope` on insert only; "area/strategy/domain/layer/carried_from are web-owned and omitted").
- Test pinning goal columns: PlanningTests.swift:451-472 (`prod` set includes `area_id`, so the DB accepts it).

---

## 2. Periods

All in `enum PlanCalendar` (R/Services/Planning/PlanCalendar.swift, 203 lines); `PeriodCalendar` (R/Services/Planning/PeriodCalendar.swift) is only the "calendar fold" reader (events per period), not boundaries.
```swift
static var calendar: Calendar                                      // :9  gregorian, .current tz, firstWeekday = weekStartsOn + 1
static let weekStartsOnKey = "symphony.weekStartsOn"               // :21
static var weekStartsOn: Int { get set }                           // :22  UserDefaults, 0 Sun / 1 Mon / 6 Sat; default 0
static let defaultSeasons: [SeasonBoundary]                        // :31  Spring 3/1, Summer 6/1, Fall 9/1, Winter 12/1
static func day(_ date: Date) -> Date                              // :38
static func addDays(_ date: Date, _ n: Int) -> Date                // :40
static func weekStart(_ date: Date, startsOn: Int = weekStartsOn) -> Date          // :47
static func weekDays(_ start: Date) -> [Date]                      // :53
static func weekendSaturday(ofWeek start: Date, startsOn: Int = weekStartsOn) -> Date  // :58
static func monthStart(_ date: Date) -> Date                       // :66
static func nextMonthStart(_ date: Date) -> Date                   // :71
struct Season: Equatable { let name: String; let start: Date; let end: Date /* exclusive */; var lastDay: Date }   // :75-81
static func season(containing date: Date, boundaries: [SeasonBoundary]? = nil) -> Season   // :84
static func year(of date: Date) -> Int                             // :107
static func ymd(_ date: Date) -> String                            // :112  "YYYY-MM-DD" local
static func sameDay(_ a: Date?, _ b: Date) -> Bool                 // :117
static func weekendWindow(for date: Date) -> [Date]?               // :127
```
- `SeasonBoundary` (R/Models/Household.swift:44): `struct SeasonBoundary: Codable, Hashable { var name: String; var month: Int; var day: Int }`. `Household.seasons: [SeasonBoundary]?` (Household.swift:12; nil -> defaults) and `Household.weekStartsOn: Int?` (:15), `Household.edition: String?` (:18). Views read them with `@Query private var households: [Household]` -> `households.first?.seasons` (PlannerView.swift:19, PeriodPlanView.swift:37, WeekPlanView.swift:87).
- `SyncEngine.adoptHouseholdWeekStart()` (SyncEngine.swift:780-784) sets `PlanCalendar.weekStartsOn = households.first?.weekStartsOn ?? 0` after the household pull.
- **Season name casing**: names are capitalised and carry the web's meteorological defaults ("Fall" from Sep 1; "Winter" from Dec 1). Test: PlanningTests.swift:50-65 (`season(containing: day(2026, 9, 23))` -> name "Fall", start 2026-09-01, lastDay 2026-11-30). The walk's lowercase "winter" must be `name.lowercased()`. On 2026-11-13 the current season is **Fall** (18 days left to Dec 1 - under the spec's 3-week threshold, so the walk would ask about Winter).
- **NOT FOUND** (must be written for the walk): days remaining in a period; "the season to plan (current vs next when < 3 weeks left)"; "year ahead = next calendar year if Nov/Dec"; a "rest of this month" label. `Season.lastDay` and `Season.end` are the only boundary helpers. `nextMonthStart` exists; no next-season helper (use `season(containing: current.end)`). `AppState.step(_:seasons:)` (R/App/AppState.swift:136-152) shows the pattern: next season = `season.end`, previous = `addDays(season.start, -1)`.
- Today/Week/Month/Season/Year anchoring: `AppState.selectedDate`, `AppState.horizon: Horizon` (`enum Horizon { case today, week, month, season, year }`, AppState.swift:27), `goToToday()`.
- Week title/range helpers: `WeekPlanView.title(for:)`, `WeekPlanView.range(_:)` (used PlannerView.swift:70-71).

---

## 3. "For <goal>" lineage on Today; "first thing today"

**Lineage: NOT FOUND.** `grep goalTaskId|goalId|isGoal` across R/Views and R/ViewModels finds no use in TodayView, TodayDayColumn, TimelineItemCard, TimelineViewModel, NextUpCard, StillToDo, OutsideGlance, DuoJournal, HalfOpenView. The only readers of the links are PlanSelectors.swift:92,232,278,292,310. `TimelineItem` (R/ViewModels/TimelineViewModel.swift:214-262) has no parent-goal field; its fields: id, type, title, startTime, isAllDay, completed, context, entityId, assignedTo, location, eventKey, notes, links, phoneNumber, locationPlaceId, source, children, recurringEventId, isFree, `isFocused`, isWaiting, waitingFor, endTime. A "for <goal>" line needs a new `TimelineItem` field filled in `TimelineViewModel.buildTimeline` (the task loop at :60-105 builds the `TimelineItem(... isFocused: chosen || plan.isFocused(task, on: date), ...)`), plus rendering in `TimelineItemCard` / `GlanceToDoList`. Note `buildTimeline` creates its `PlanSnapshot` with `commitments: []` and no goals (:48-49) so it has no data to resolve a parent unless the lookup is passed in (tasks array is available: `goal = tasks.first { $0.id == task.goalTaskId }`).

**"First thing today":**
- `TaskFocus` = my "chosen for this day" mark, per (task, user, date) (Planning.swift:60-92). Boolean only; no rank.
- `TimelineViewModel.forToday` (:23-27): `timelineItems.filter { $0.type != .event && $0.startTime == nil }.sorted { ($0.isFocused ? 0 : 1) < ($1.isFocused ? 0 : 1) }` - focused first, otherwise array order. No use of `sortOrder` anywhere under R/Views or R/ViewModels except Lists (grep). So `SymphonyTask.sortOrder` (shared manual order; Week list reads it via `PlanSnapshot.inManualOrder`, PlanSelectors.swift:248-257; written by `PlanWriter.reorder`, pushed only when `sortOrderDirty`) does not order Today on iOS.
- `plannedOn` is the legacy shared chosen-for-day date: read-only (`RowMapper` :88 reads `planned_on`; taskRow never sends it); `PlanSnapshot.isFocused` (PlanSelectors.swift:68-72) falls back to it only when the task has no focus rows at all.
- NOT FOUND: any pin/first/priority concept for tasks. Minimal representation using what exists: focus the task for today (`move(.today)` or `planTask(on: today)` creates the `TaskFocus`) and give it the lowest `sortOrder` with `sortOrderDirty = true` (taskRow then pushes `sort_order`) - but Today would also need to read `sortOrder` in `forToday` to put it first. Pure focus already puts focused items ahead of unfocused ones.
- Existing consumer: `GlanceToDoList(items: viewModel.forToday, date:userId:)` (TodayView.swift:235), `dayAndToDo`, etc.

---

## 4. Life areas and adding a synced model

**Confirmed: no `GoalArea`, `goal_areas`, `area_id`, `areaId` in apple/** (grep over *.swift/*.yml/*.json; only hit is the string `"area_id"` in the test's allowed-columns set, PlanningTests.swift:458). The "life area" on iOS is just `context` ("work"/"family"/"personal"): `Edition.assumedLifeArea` (R/Models/Edition.swift:31, light = "personal"), `PlanWriter.needsLifeArea`, `DomainFilter`. Server side `goal_areas` has a `context` column (guided_planning migration :18-19) and policy `"Users can read their own goal areas"` (:22-23).

### Every place a new synced model `GoalArea` (+ `areaId` on Goal and SymphonyTask) touches
Model registration (SwiftData schema; must list the type or the store has no table):
1. R/App/SymphonyApp.swift:34-51 `.modelContainer(for: [ SymphonyTask.self, Project.self, Routine.self, Contact.self, FamilyMember.self, ActionableInstance.self, EventNote.self, WeeklyTemplate.self, Household.self, UserProfile.self, SymphonyList.self, SymphonyListItem.self, TaskCommitment.self, TaskFocus.self, Goal.self, PendingChange.self, ])`
2. R/App/DemoMode.swift:26-30 `static let types: [any PersistentModel.Type] = [ ... TaskCommitment.self, TaskFocus.self, Goal.self, PendingChange.self ]`
3. Every test that builds a container lists its own types (add `GoalArea.self` only where goals/areas are used): PlanningTests.swift:343-348, PaperFoldTests.swift:75-80 and :139-144, RoutineMoveTests.swift:16-.
Sync registry (R/Services/SyncEngine/SyncEngine.swift):
4. :23-39 `static let syncedTables: [(tableName: String, modelType: any PersistentModel.Type)]` - add `("goal_areas", GoalArea.self)` (list is "in dependency order": before `("goals", Goal.self)` at :38 and before tasks if tasks.area_id references it; tasks is at :28, so it'd go before it). NOTE: confirm what reads `syncedTables` (grep: only declared; pull is the explicit list below).
5. :193-227 `performInitialSync()` - an explicit `await pullTable("goal_areas", as: GoalArea.self, userId: userId)` line (existing lines :224-226 for commitments/focus/goals; goals pull must come after areas, tasks pull is at :213).
6. :231 `private func pullTable<T: PersistentModel & HasUUID>(_ table: String, as type: T.Type, userId: UUID, reconcile: Bool = true)` - generic; uses `RowMapper.toModel(type, from:)` and `PendingChange` protection; needs `GoalArea: HasUUID`.
7. :419-460 `static func serializeRow(table:id:context:forInsert:)` - add `case "goal_areas": guard let a = find(GoalArea.self) else { return nil }; return goalAreaRow(a)`; default returns nil ("other tables aren't edited from iOS") and push silently skips (`guard let row = ... else { return }`, :320, :352).
8. new `private static func goalAreaRow(_:) -> [String: AnyJSON]` next to `goalRow` (:720-734) and update `goalRow` to send `area_id: u(g.areaId)` (it currently omits area_id: doc comment :716-719) and `taskRow` (:485-566) to send `area_id`, plus the goal-link columns from section "Headline findings" (is_goal, goal_task_id, goal_id, supports_goal_task_id).
9. :404-413 `naturalKey(for:)` - only if goal_areas needs a natural key (it has an id; probably not).
10. :311-402 `pushChange` - handles insert (upsert), update (`.update().eq("id")` after dropping id and user_id), delete; generic by table name, no per-table case needed unless special.
11. Realtime (optional): :747-749 `tablesToWatch = ["tasks", "projects", "routines", "contacts", "family_members", "actionable_instances", "event_notes"]` - goals, commitments, focus are NOT realtime-watched today; and :805-830 `handleInsertOrUpdate` / :848-870 `handleDelete` switch on table names (no goals/areas case).
Mapping:
12. R/Services/SyncEngine/RowMapper.swift:10-45 `toModel` switch (`case is Goal.Type: return goalFromRow(row) as? T` at :39-40) - add `case is GoalArea.Type`; add `areaId = row.uuid("area_id")` to `goalFromRow` (:327-342) and `taskFromRow` (:49-101; goal links already read at :85-87).
13. R/Services/SyncEngine/SyncEngine.swift:937-952 `protocol HasUUID` + `extension X: HasUUID {}` list (`extension Goal: HasUUID {}` at :945) - add `extension GoalArea: HasUUID {}`.
Other:
14. R/Models/PendingChange.swift:42-60 `ModelContext.queueSync(table:recordId:type:)` / `queueKeyedDelete` - generic; PendingChange.tableName is a free string.
15. Account reset / delete flows that enumerate models: grep found none in apple/ besides the above lists; the server-side `delete_account_data` migration (20261113160000) already mentions goal_areas.
16. `Goal` (Planning.swift:96) and `SymphonyTask` (SymphonyTask.swift) need `var areaId: UUID? = nil` with an inline default (SwiftData lightweight migration; see comment SymphonyTask.swift:88-91). `SymphonyTask.columnMap` (:205-235) and `Household.columnMap` are documentation-style maps (not used by push); not required.

`pendingIds` rule (SyncEngine.swift:262-267): rows with a queued local change are never replaced or deleted by a pull. Pull deletes local rows not on the server (`reconcile: true`).

`SymphonyApp` model list is quoted in item 1 above (SymphonyApp.swift:34-51).

---

## 5. Speech

`TellSheet` + `Dictation` live in R/Views/Capture/TellSheet.swift (180 lines). `Dictation` is defined at the bottom of that file, `internal`, not nested; `import Speech`/`AVFoundation` are `#if os(iOS)` only.
```swift
@MainActor @Observable
final class Dictation {                                  // :93-94
    var transcript = ""                                  // :95  live words; never cleared by Dictation itself
    var isListening = false                              // :96
    var problem: String?                                 // :97  user-facing text for any failure
    func start() async                                   // :106
    func stop()                                          // :167
    // private: recognizer = SFSpeechRecognizer(), engine = AVAudioEngine(), request, task; static feed(_:into:), listen(_:to:update:)
}
```
Behaviour of `start()` (:106-146): guards `!isListening`; sets `problem = nil`; requests `SFSpeechRecognizer.requestAuthorization` (non-authorized -> `problem = "Allow Speech Recognition in Settings to speak — or type it."`); `AVAudioApplication.requestRecordPermission()` (denied -> `"Allow the microphone in Settings to speak — or type it."`); recognizer nil/unavailable -> `"Speech isn't available right now — type it instead."`; sets `AVAudioSession` category `.record`, mode `.measurement`, options `.duckOthers` (**this changes the shared session; PaperSound sets `.ambient` - they will fight; see section 6**); `request.shouldReportPartialResults = true`; `if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }` (on-device when available, silently; **no property exposes whether it is on-device**); starts engine, `isListening = true`; result callback sets `transcript = words` and calls `stop()` on `done` (final or error). Errors during setup -> `problem = "Couldn't start listening — type it instead."` and `stop()`. Non-iOS: `problem = "Type it here."`.
`stop()` (:167-179): guards `isListening || task != nil`, stops engine, removes tap, `endAudio`, cancels task, `isListening = false`, deactivates session.
Gaps for reuse: no `transcript` reset (a second `start()` leaves the previous question's words until new ones arrive - TellSheet only copies non-empty transcripts, :60); no silence/auto-stop (stops only on `done`/error; Apple's recognizer ends on its own after ~1 min or silence behaviour is system-defined); no locale parameter (default `SFSpeechRecognizer()`); no audio-level meter; the permission prompts happen inside `start()` (first call). Info.plist already has `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` (R/App/Info.plist:38-41). **Reusable as written** by creating `@State private var listener = Dictation()` and observing `listener.transcript` / `listener.isListening` / `listener.problem` in any view; add a `transcript = ""` reset (or create a fresh instance per question).

How TellSheet drives it (:13-89): `@State private var listener = Dictation()`; `.onChange(of: listener.transcript) { _, words in if !words.isEmpty { text = words } }` (:60); `.task { await listener.start() }` (:61, starts listening on appear); `.onDisappear { listener.stop() }`; mic button `toggleListening()` (:73); `send()` (:77-88): `listener.stop()`, `let parsed = CaptureParser.parse(trimmed)`, `TaskViewModel(modelContext:).createTask(title: parsed.title, userId:, scheduledFor: parsed.date, isAllDay: parsed.date != nil ? !parsed.hasTime : false)`, success haptic, `dismiss()`. Note: TellSheet takes a bare title for undated; the walk needs the unparsed vs parsed result too.

`CaptureParser` - R/Views/Capture/QuickCaptureBar.swift:114-145 (not its own file):
```swift
enum CaptureParser {
    struct Result { let title: String; let date: Date?; let hasTime: Bool }
    static func parse(_ raw: String) -> Result
}
```
Behaviour: trims; `NSDataDetector(types: .date)`; takes the FIRST date match only; removes the matched text from the title (collapsing double spaces, trimming " ,.-\t"); `hasTime` is true if the matched text contains ":", "am", "pm" or "N o'clock". No match -> `Result(title: text, date: nil, hasTime: false)`; empty title after removal falls back to the full text. Doc comment example: `"call mom tomorrow at 3pm" -> ("call mom", tomorrow 3pm, hasTime: true)`; "call mom friday 3pm" -> title "call mom". It does NOT remove filler words ("um", "uh", "so"), does not handle "today" specially beyond NSDataDetector (a bare "today" matches as a date at a default time with `hasTime` false - unverified, no test), and a day-name like "the deposit, today" would become title "the deposit" (trailing comma trimmed) - unverified. Callers: QuickCaptureBar.swift:90, TellSheet.swift:79, SymphonyApp.swift:84 (Siri intent).
**No tests for CaptureParser exist** (`grep CaptureParser|NSDataDetector` in T: none).

---

## 6. Sound and haptics

- Sound: `PaperSound` (R/Services/PaperSound.swift): `@MainActor final class PaperSound { static let shared; static let storageKey = "planner.paperSound"; var isOn: Bool (UserDefaults, default true); func swish(duration:level:lo:hi:), crinkle(count:over:level:), land(level:), pencil() }`. **No audio files**: every sound is synthesised into an `AVAudioPCMBuffer` from white noise (`struct PaperSynth`, `struct Biquad`) and played on an `AVAudioEngine` with 6 `AVAudioPlayerNode`s; `AVAudioSession` category `.ambient`, `.mixWithOthers` (respects silent switch); `ready()` starts the engine lazily "always from a gesture" (:70-108). If it fails it stays silent (`failed = true`).
- Toggle: `@AppStorage(PaperSound.storageKey) private var on = true` in `struct PaperSoundToggle` (R/Views/Planner/PaperFoldView.swift:1013-1019); also read at PlannerComponents.swift:160 (`@AppStorage(PaperSound.storageKey) private var soundOn = true`). Call sites: PlannerComponents.swift:325 (`pencil()` on completing), PaperFoldView.swift:344,410,971,1019.
- Other sound: `AudioServicesPlayAlertSound(SystemSoundID(1005))` in R/Views/HalfOpen/CookView.swift:384 (timer done). NOT FOUND: `AVAudioPlayer`, bundled .caf/.wav/.mp3/.m4a/.aif (find over apple/ returned none), `.sensoryFeedback`.
- Haptics: UIKit generators, no helper type: `UIImpactFeedbackGenerator(style: .light/.medium).impactOccurred()` and `UINotificationFeedbackGenerator().notificationOccurred(.success)` called inline - e.g. QuickCaptureBar.swift:76,102; TellSheet.swift:85; GoalEditorSheet.swift:144; ChooserSheet.swift:159,214; PlannerComponents.swift:322; PaperFoldView.swift:369; SlideRow.swift:183; TimelineItemCard.swift:423,446; OutsideGlance.swift:242; MainView.swift:511; CookView.swift:282,383; DuoJournal.swift:256; TaskDetailView.swift:51; InboxView.swift:327; TaskAttachmentsSection.swift:131.
- Bundling: project is XcodeGen (apple/SymphonyOS/project.yml). Target `SymphonyOS` `sources: - path: SymphonyOS, excludes: ["**/*.md"]` - **every non-source file under R/ ships as a bundle resource automatically** (fonts, any new .caf/.png outside an xcassets). New images normally go in R/App/Assets.xcassets. No `resources:` rules exist. A new target/extension would need `project.yml` edits (and a registered bundle ID).
- Audio session conflict: `Dictation.start()` sets `.record` + `.duckOthers`, and `stop()` deactivates; PaperSound sets `.ambient` once, on first sound, and does not re-assert it. If the walk plays sounds after dictation it must re-set the category (or PaperSound's `ready()` is only run when `engine == nil`, so it won't).

---

## 7. Scenery / images / fonts

- Asset catalog: R/App/Assets.xcassets contains only `AppIcon.appiconset/icon-1024.png` and `TreeLogo.imageset/tree-logo.png`. **No scenery image exists in the iOS bundle** (confirmed). `Image("TreeLogo")` is used by ContentView's LaunchScreen (ContentView.swift:95). No other images in R/Resources (only `Fonts/`).
- Fonts (R/Resources/Fonts): CrimsonPro-Regular.ttf, CrimsonPro-Italic.ttf, CrimsonPro-SemiBold.ttf, DMSans-Regular.ttf, DMSans-Medium.ttf, DMSans-SemiBold.ttf. Registered via `UIAppFonts` in R/App/Info.plist:48-56. The widgets target (project.yml) bundles Fonts via `buildPhase: resources` and only lists CrimsonPro-Regular. Test `DesignSystemTests.bundledFontResolves` guards them.
- Font helpers (R/DesignSystem/Typography.swift:12-33) on `Font`: `displayLarge` (CrimsonPro-Regular 34), `displayMedium` (CrimsonPro-Regular 24), `displaySmall` (CrimsonPro-SemiBold 18), `displayItalic` (CrimsonPro-Italic 14), `bodyLarge` (DMSans-Regular 17), `bodyMedium` (15), `bodySmall` (13), `bodyLargeBold` (DMSans-SemiBold 17), `bodyMediumBold` (15), `bodySmallBold` (13), `captionText` (DMSans-Regular 11), `captionBold` (DMSans-Medium 11), `eyebrow` (DMSans-Medium 11) + `View.eyebrowStyle()`. These are fixed sizes (no Dynamic Type); views also use `Font.custom("CrimsonPro-Regular", size: N, relativeTo: .title2)` directly (PlannerView.swift:~84, `Paper.line` etc.). `enum Paper` (PaperFoldView.swift:119-135): `sheet 0xFEFEFD, above 0xF9F7F4, calendar 0xF6F8FA, back 0xE7E4DF, rule 0xDEE2E8, ruleAbove 0xE2DDD5, accent 0x364963, faint 0x848D9A, shadow 0x18222F`; fonts `kicker`, `line` (Crimson 18.5), `lineAbove` (16), `titleAbove` (26), `empty` (Crimson Italic 17).
- Colour tokens (R/DesignSystem/NordicColors.swift:20-85, `Color` extension): `bgBase 0xFAF7F2, bgElevated 0xFFFFFF, bgSurface 0xF0EBE3, bgWarm 0xF5EFE7, textPrimary 0x2C2520, textSecondary 0x6B5E54, textTertiary 0x7D7066, textLight 0xBEB3A9, primaryTint 0xD97706, primaryLight 0xF59E0B, accentBg 0xFEF3C7, amberStrong 0xB45309, ink 0x2C2520, infoBlue, infoBlueBg, successGreen, successGreenBg, cardBorder 0xE8E0D8, cardShadow, contextWork/Family/Personal, feedbackGreen/Amber/Red, statusActive/OnHold/Completed, block* colours, memberColor(_:)`. (File is still named NordicColors; the design is the scenery/paper-journal look.) No place-theme / scenery colours or per-place tokens exist on iOS.
- `~/Pictures/Symphony scenery` (listed, nothing copied):
  | file | pixels | bytes |
  |---|---|---|
  | overlook-square-original.png | 1932 x 1932 | 812,639 |
  | overlook-square-3x.png | 5796 x 5796 | 35,512,489 |
  | overlook-square-3x.jpg | 5796 x 5796 | 4,187,637 |
  | overlook-tall-original.png | 1125 x 2000 | 2,157,219 |
  | overlook-tall-3x.png | 3375 x 6000 | 17,155,746 |
  | overlook-tall-3x.jpg | 3375 x 6000 | 1,396,548 |
  A **tall** overlook exists (1125x2000 original, 3375x6000 upscaled), not mentioned in the spec (which wants ~3000x9000 summit-to-ledge). The train-yard print is not in this folder. Bundle-size note: the 3x PNGs are 17-35 MB; the JPGs are 1.4-4.2 MB. (Scenery in the web app lives in the web repo's public/ - not checked.)

---

## 8. First-run hook

### Root structure
- `SymphonyApp` (R/App/SymphonyApp.swift:10-53): `WindowGroup { ContentView().environment(authService).environment(appState).background(Color.bgBase).demoContainerIfRequested().onOpenURL {...} }.modelContainer(for: [...])`. `@State private var authService = AuthService()`, `@State private var appState = AppState()`.
- `ContentView.body` (R/App/ContentView.swift:17-28):
```swift
Group {
    if auth.isLoading { LaunchScreen() }
    else if auth.isAuthenticated { MainView() }
    else { AuthView() }
}
.animation(.easeInOut(duration: 0.3), value: auth.isAuthenticated) ...
```
  `startSync(userId:)` builds `SyncEngine(modelContainer:)` once per user (:55-75); sync is OFF in demo mode (:57).
- `MainView` -> `iOSMainView` (R/App/MainView.swift:20-); body skeleton (:93-):
```swift
var body: some View {
    @Bindable var state = appState
    Group {
        switch state.activeTab {
        case .planner: NavigationStack { PlannerView() }
        case .inbox:   NavigationStack { InboxView() }
        case .routines: NavigationStack { RoutineListView() }
        case .more:    NavigationStack { MoreView() }
        }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {            // :123
        if appState.dockLayout.edge == .bottom && !appState.keyboardVisible { dock }
    }
    .padding(.leading, sidePadding(.leading)).padding(.trailing, sidePadding(.trailing))
    .overlay { sideDock }                                  // :129
    .background { Color.bgBase.ignoresSafeArea(); DockLayoutReader { layout in appState.dockLayout = layout }; HingeReader { reading in hinge = reading } }
    .overlay { if appState.posture.isHalfOpen { HalfOpenView(posture: appState.posture).transition(.opacity) } }   // :136-141
    .onChange(of: hinge) ... .onAppear { updatePosture(); applyEdition() }
    .onChange(of: households.map(\.edition)) { _, _ in applyEdition() }
    ...
    .sheet(isPresented: $showCapture) { if let userId = auth.currentUser?.id { CaptureSheet(userId: userId).presentationDetents([.medium]) } }   // :~158
    .onChange(of: appState.posture) ...
    .onChange(of: scenePhase) ... PhotoCaptureService.retryPending ...
}
```
  Root-level presentation today: ONE `.sheet` (`showCapture`) on `iOSMainView`; `.fullScreenCover` is used only inside CaptureSheet for the document scanner (MainView.swift:368), QuickCaptureBar.swift:71, TaskAttachmentsSection.swift:76,79. TodayView presents its own sheets (ChooserSheet, OpenedItemSheet, UnfinishedSheet, TellSheet `presentationDetents([.medium, .large])`, CaptureSheet) at TodayView.swift:~108-130.
- `iOSMainView.applyEdition()` (:67-91) resolves `Edition` from `households.map(\.edition)` with `EditionMemory` (UserDefaults key `edition.lastKnown.<uid>`), sets `appState.edition` and `CalendarFeed.shared.edition`; demo: `-SymphonyLight` launch argument picks `.light`. This is the natural place/pattern for a first-run check (it already reacts to the synced household).
- `AppState` (R/App/AppState.swift:77-156, `@Observable final class`) stored properties: `activeTab: AppTab = .planner`, `activeSidebarItem: SidebarItem = .today`, `selectedDate: Date = .now`, `horizon: Horizon = .today`, `dockHeight: CGFloat = DockMetrics.height`, `keyboardVisible = false`, (iOS) `dockLayout = DockLayout()`, `posture: DuoPosture = .flat`, `cook: CookSession?`, `domainFilter: DomainFilter = .all`, `edition: Edition = .full`, `showingQuickCapture = false`, `tellRequested = false`, `showingSettings = false`. Computed: `bottomInset`, `isToday`. Methods: `goToToday()`, `goToPreviousDay()`, `goToNextDay()`, `step(_:seasons:)`, `goToCurrentPeriod()`. `AppTab` (:7): `.planner .inbox .routines .more`; light = `AppTab.visible(in:)` (R/Models/Edition.swift:36-40).
- **Where the "no goals" check could run**: `iOSMainView` (has `@Query households`, `auth`, `modelContext`) with `@Query private var goals: [Goal]` + tasks; condition `edition == .light && goals.isEmpty && no walk-done flag`. **There is no signal for "initial sync finished"**: `SyncEngine.performInitialSync` (:193-227) has no completion callback or published state (`isSyncing` is private, SyncEngine.swift:18); a returning account on a new device would look like "no goals" until goals are pulled. No `hasSynced`/`initialSyncDone` anywhere. A walk-done flag has no home on the server from iOS: `UserProfile` has `onboardingStep: String?` / `onboardingCompletedAt: Date?` (R/Models/UserProfile.swift:7-8) but `serializeRow` has no `"user_profiles"` case (not pushable) and the model is pulled read-only. Local flag options: `@AppStorage`/UserDefaults per user id (mirror `EditionMemory`).
- Auth/new-account: `AuthService` (R/Services/AuthService.swift): `currentUser: User?`, `isAuthenticated`, `isLoading`, `error`, `inviteOnly`, `signIn`, `signUp(email:password:)` (:117; `isAuthenticated = response.session != nil`), `signOut()` (:150). `signUp` does not expose "this is a brand-new account".
- Settings screens: `MoreView` (MainView.swift:558-621): List with Section(Projects/Lists/Contacts gated by edition), Section(`CalendarSettingsView` "Calendar", `SettingsView` "Settings"), Section(Sign Out). `SettingsView` (R/Views/Settings/SettingsView.swift:4-87): `Form { Section("Account") {email}; Section("Integrations") {Google Calendar, gated .googleCalendar}; Section("Family Members") {gated .people}; Section("About") {Version "1.0.0"}; Section { Button("Sign Out") } }`. "Replay the walk" fits as a new `Section` here (no sound toggle exists in Settings; `PaperSoundToggle` lives only in PaperFoldView).
- Apple Calendar: `AppleCalendarService.shared` (@Observable, R/Services/AppleCalendar.swift:145-): `access: AppleCalendarAccess` (`.notAsked/.allowed/.denied`), `func requestAccess() async` (:174), `items(for:)`, `refresh(_:)`, `refreshWeek(_:)`, `entries(from:to:)`, `refreshPeriod(from:to:)`. Info.plist has `NSCalendarsFullAccessUsageDescription` (Info.plist:36-37). `CalendarFeed.source(for: edition) == .apple` for light (CalendarSettingsView.swift:15).

### DemoMode (R/App/DemoMode.swift, `#if DEBUG`)
- Launch arguments: `-SymphonyDemo` (`DemoMode.isOn`, :11), `-SymphonyLight` (read in MainView.swift:~70; light edition), `-TodaySize WxH` (TodayView.swift:~76), `-HalfOpen laptop|book` and `-HalfOpenCook` (HalfOpenPosture.swift:64-74). In-memory store (`ModelConfiguration(isStoredInMemoryOnly: true)`), `DemoMode.userId = 00000000-0000-4000-8000-00000000D3E0`, sync off, `seed(_:)` called by `container(for:)` (:20-24); `sharedContainer` :32.
- Seeds (seed(), :86-229): 4 `FamilyMember`s (Alex, Iris, Liam, Mia), tasks for today/this week (with week commitments), a month goal row `Ship the board pack` (`isGoal = true`, bucket month, commitment :161-163), a season goal `A calmer school morning` (`isGoal = true`, bucket quarter, :170-172) plus season items/done item, month items, **year goals: 3 `Goal` rows for the current year ("Family dinner four nights a week", "Run a half marathon", "Grow the consulting practice") and 4 for last year** (:185-197), inbox items, routines. **So demo data already has goals; a "new account with no goals" never triggers in demo mode** (there is no empty-demo option; a `-SymphonyEmpty` style argument would be needed). No links (`goalTaskId`/`goalId`) are set on any demo row.

---

## 9. Layout constraints for a full-screen cover

- `TodayLayout.decide(width:height:sideBars:)` (R/Views/Timeline/TodayLayout.swift:30-36) with thresholds `shortHeight = 520`, `wideWidth = 600`, `spreadWidth = 760`; cases `.oneColumn, .glance, .glanceWide, .dayPage, .journal`:
```swift
guard width > 0, height > 0 else { return .oneColumn }
if width >= wideWidth && height < shortHeight { return .glanceWide }
if width >= spreadWidth && width > height { return .journal }
if width >= wideWidth { return .dayPage }
return sideBars ? .glance : .oneColumn
```
  TodayView measures its own size with `.onGeometryChange(for: CGSize.self) { $0.size } action: { size = Self.pinnedSize ?? $0 }` and reads `appState.dockLayout.edge != .bottom` for `sideBars` (TodayView.swift:~60-72). A walk must decide its own layout from the window shape (Duo outside 466x678 upright / 678x466 sideways; inside 626x890 / 890x626; regular iPhone ~393x852), not from device or orientation (Apple Duo guidance, per the doc comment).
- `DockLayout` (R/Platform/iOS/DockEdge.swift:25-58): `edge: DockEdge (.bottom/.leading/.trailing)`, `frame: CGRect` (window coords), `contentInset`, `safeInset`, `fold: CGRect?`, `window: CGSize`, `iconsOnly` (short window with side bars), `static let sideWidth: CGFloat = 72`, `static func side(_:onLeft:window:barInsets:safeInset:)`. Reported by `DockLayoutReader` (UIViewRepresentable, iOS 27.1+ `verticalBarEdge`; before that, bottom dock) into `appState.dockLayout`. The dock is drawn by iOSMainView as a bottom `safeAreaInset` or a side overlay (`sideDock`, ignoresSafeArea, positioned by window-coordinate frame); content is padded by `sidePadding(_:)` = `max(0, contentInset - safeInset)`.
- `AppState.bottomInset` = 0 when keyboard visible or dock is not at the bottom, else `dockHeight`; screens pad floating bars by it (`.safeAreaPadding(.bottom, appState.bottomInset)`). A `fullScreenCover` is its own presentation layer ABOVE the dock, side dock and HalfOpen overlay, so none of that applies inside it; but on a Duo the cover still gets the system's side bars (the status-bar column), so use safe areas, not hard-coded insets. It will cover the half-open display if posture becomes half-open while the walk is up (`HalfOpenView` is an `.overlay` of iOSMainView, `appState.posture.isHalfOpen`, order: dock inset -> side dock overlay -> background readers -> HalfOpen overlay -> sheet/cover). Decide whether the walk pauses/ignores posture.
- `HalfOpen` (R/Views/HalfOpen/HalfOpenPosture.swift): `DuoPosture { flat, laptop, book }` + `isHalfOpen`; `HalfOpen.minDegrees = 45`, `enterBelow = 140`, `leaveAbove = 155`; `posture(angle:partlyOpen:fold:window:current:)`; `across(fold:window:)`; `split(fold:origin:size:across:)`; only the inside screen (`min(window) >= TodayLayout.shortHeight`). `HalfOpenView` (R/Views/HalfOpen/HalfOpenView.swift:12-) shows time/now, To do, dinner, Tell bar; `CookView` takes over when `appState.cook != nil`. To appear in tent view the scenery/lineage needs `HalfOpenView`'s own `TimelineViewModel` list (`@Query` of tasks/routines/instances/eventNotes/focusRows, :23-27).
- `GlanceTellBar(onTell:onAdd:)` is the outside screen's Tell bar (used in TodayView.swift:~228).
- Keyboard: `appState.keyboardVisible` set by `UIResponder.keyboardWillShow/HideNotification` observers on iOSMainView (:~150); these hide the dock. Inside a cover, those observers still fire (app-wide).

---

## 10. Tests

Test target: R-tests in apple/SymphonyOS/SymphonyOSTests, Swift Testing (`import Testing`, `@Test`, `#expect`, `@testable import Symphony`); XcodeGen target `SymphonyOSTests`.
- **PlanWriter**: `struct PlanWriterTests` in T/PlanningTests.swift:337-~560 (`@MainActor`). Examples: `todayDatesTheTaskAndFocusesItForMe` (:355), `thisWeekAddsAnOpenWeekCommitmentAndSendsStamps` (:369), `undoRestoresTheTaskAndTakesBackUnpushedRows` (:409), `newGoalPushesWebColumnsWithDerivedScope` (:451-472), `noDayKeepsTheWeekAndTakesTheDayAway` (:505), `reorderingMarksTheRowsToPushAndUndoPutsTheOrderBack` (:518). `struct WriteLineTests` in T/PaperFoldTests.swift:~70-135 covers `createPeriodTask`: `aMonthLineIsOneMonthCommitmentTiedToNothing` (:83), `aSeasonLineGoesInTheQuarterBucket` (:110), `aWeekLineIsOnTheWeeksList` (:122).
  Example (PlanningTests.swift:355-367):
  ```swift
  @Test func todayDatesTheTaskAndFocusesItForMe() throws {
      let ctx = try makeContext()
      let t = task("Renew the passport"); ctx.insert(t)
      PlanWriter(context: ctx, userId: me).move(t, to: .today)
      #expect(t.bucket == "timed")
      let focus = try ctx.fetch(FetchDescriptor<TaskFocus>())
      #expect(focus.count == 1 && focus[0].userId == me)
      #expect(pending(ctx).contains { $0.tableName == "task_focus" && $0.changeType == "insert" })
  }
  ```
- **Period maths**: `struct PlanCalendarTests` T/PlanningTests.swift:28-75 - `weeksStartOnSunday`, `aSaturdayHouseholdsWeeksStartOnSaturday`, `seasonsUseHouseholdBoundariesOrDefaults` (:50-65: `PlanCalendar.season(containing: day(2026, 9, 23))` -> "Fall"/start "2026-09-01"/lastDay "2026-11-30"; custom boundaries -> "Autumn"), `labourDayMakesAThreeDayWeekend`. `MonthlyPositionTests.swift` exists (routines). `struct PlanSelectorTests` (:121-330) incl. `aGoalOnTheWeekShowsItsOpenStepsInstead` (:305-320, uses `goal.isGoal = true` and `goalTaskId`). Edition tests: T/EditionTests.swift. Layout tests: T/TodayLayoutTests.swift (`duoScreens` :7, `regularIPhoneKeepsItsToday` :18), T/DockLayoutTests.swift, T/HalfOpenTests.swift.
- **CaptureParser**: NONE. (`SymphonyOSTests.swift` is the generic file; PageParseTests.swift/PageIngestTests.swift cover the paper-page parser `PageParse`, not CaptureParser.)
- **In-memory container helper** (PlanningTests.swift:339-353; the same shape at PaperFoldTests.swift:74-82 and :138-146 and RoutineMoveTests.swift:16):
  ```swift
  @MainActor
  struct PlanWriterTests {
      let me = UUID()
      private func makeContext() throws -> ModelContext {
          let container = try ModelContainer(
              for: SymphonyTask.self, Routine.self, ActionableInstance.self, FamilyMember.self,
              TaskCommitment.self, TaskFocus.self, Goal.self, PendingChange.self,
              configurations: ModelConfiguration(isStoredInMemoryOnly: true)
          )
          return ModelContext(container)
      }
      private func pending(_ ctx: ModelContext) -> [PendingChange] {
          (try? ctx.fetch(FetchDescriptor<PendingChange>(sortBy: [SortDescriptor(\.createdAt)]))) ?? []
      }
  ```
  File-level helpers in PlanningTests.swift:11-26: `private func day(_ y: Int, _ m: Int, _ d: Int) -> Date`, `private func task(_ title: String, context: String? = "family") -> SymphonyTask` (sets bucket "inbox"), `private func routine(...)`. Serialization assertions go through `SyncEngine.serializeRow(table:id:context:forInsert:)` (internal static; used in tests e.g. :377, :466), plus T/SyncSerializationTests.swift.
- Not run (per instructions): no xcodebuild was run; nothing in the repo was modified except this file.
