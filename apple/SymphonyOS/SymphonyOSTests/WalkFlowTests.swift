#if os(iOS)
import Testing
import Foundation
import SwiftData
@testable import Symphony

// The five steps end to end: a real `WalkModel` over an in-memory store, words
// through the fake listener, time through the manual scheduler, from Welcome
// to Look back up. What is checked is the rows that result.

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// Friday 13 November 2026: the year ahead is 2027, the season this winter, the month November.
private let now = day(2026, 11, 13)

/// A class so each test's private `UserDefaults` suite is removed when the test is done.
@MainActor
final class WalkFlowTests {
    let me = UUID()
    let scheduler = ManualWalkScheduler()
    let listener = FakeWalkListener()
    let suite = "WalkFlowTests.\(UUID())"
    let store: WalkPositionStore

    init() {
        store = WalkPositionStore(defaults: UserDefaults(suiteName: suite)!)
    }

    deinit {
        UserDefaults().removePersistentDomain(forName: suite)
    }

    private func model(_ ctx: ModelContext, entry: WalkEntry = .start) -> WalkModel {
        WalkModel(context: ctx, userId: me, entry: entry, position: entry == .resume ? store.load(for: me) : nil,
                  edition: .light, now: now, store: store, scheduler: scheduler, listener: listener, sound: FakeWalkSound())
    }

    private func fetch<T: PersistentModel>(_ ctx: ModelContext, _ type: T.Type) -> [T] {
        (try? ctx.fetch(FetchDescriptor<T>())) ?? []
    }

    private func area(_ m: WalkModel, _ name: String) -> UUID { m.state.areas.first { $0.name == name }!.id }

    private func task(_ ctx: ModelContext, _ title: String) -> SymphonyTask? {
        fetch(ctx, SymphonyTask.self).first { $0.title == title }
    }

    /// Says `words` as a person would: press, hold, the listener starts, the words
    /// arrive, let go, and the session ends. `whileFinishing` runs between the
    /// release and the end, while the flag is still waiting for the last words.
    private func say(_ m: WalkModel, _ words: String, whileFinishing: (() -> Void)? = nil) async {
        m.send(.orbDown)
        scheduler.advance(WalkOrb.holdMs)
        await scheduler.settle()
        listener.hear(words)
        m.send(.orbUp(heldMs: 900))
        whileFinishing?()
        listener.end()
        await scheduler.settle()
    }

    /// Quick start with these peaks kept, down to Year off the ground.
    private func quickStart(_ m: WalkModel, keeping names: [String]) {
        m.choose(.quick)
        for name in names { m.send(.areaTapped(area(m, name))) }
        m.choose(.next)
    }

    /// Oldest first, as the push loop reads the queue: every change whose row
    /// points at a row with a queued insert comes after that insert. Returns
    /// the changes that would have to wait.
    private func childrenAheadOfParents(_ ctx: ModelContext) throws -> [String] {
        let queue = try ctx.fetch(FetchDescriptor<PendingChange>(sortBy: [SortDescriptor(\.createdAt)]))
        let inserts = Set(queue.filter { $0.changeType == "insert" }.map(\.recordId))
        var landed = Set<UUID>()
        var early: [String] = []
        for change in queue {
            if change.changeType != "delete" {
                let parents = SyncEngine.parentIds(table: change.tableName, id: change.recordId, context: ctx)
                for p in parents where inserts.contains(p) && !landed.contains(p) {
                    early.append("\(change.tableName) \(change.changeType) before its parent \(p)")
                }
            }
            if change.changeType == "insert" { landed.insert(change.recordId) }
        }
        return early
    }

    // MARK: Quick start

    @Test func aQuickStartLeavesOneLinkedChain() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        quickStart(m, keeping: ["Health", "Home"])
        await say(m, "feel strong again") {
            // Let go, still listening for the last words: nothing is planted yet.
            #expect(self.fetch(ctx, Goal.self).isEmpty)
            #expect(m.state.items.isEmpty)
        }
        m.choose(.next)
        await say(m, "lift twice a week")
        m.choose(.next)
        await say(m, "book the gym induction")
        m.choose(.next)
        await say(m, "gym induction, today")
        m.choose(.next)
        m.choose(.startThere)
        m.choose(.next)

        #expect(m.state.step == 6)
        let goals = fetch(ctx, Goal.self)
        #expect(goals.count == 1)
        let goal = try #require(goals.first)
        #expect(goal.name == "Feel strong again")
        #expect(goal.year == 2027)
        #expect(goal.context == "personal")
        #expect(goal.areaId == area(m, "Health"))
        #expect(fetch(ctx, GoalArea.self).map(\.name) == ["Health"])     // Home was kept but nothing went on it

        let season = try #require(task(ctx, "Lift twice a week"))
        #expect(season.goalId == goal.id)
        #expect(season.sourceId == nil)
        let month = try #require(task(ctx, "Book the gym induction"))
        #expect(month.sourceId == season.id)
        #expect(month.goalId == goal.id)
        let week = try #require(task(ctx, "Gym induction"))
        #expect(PlanCalendar.sameDay(week.scheduledFor, now))
        #expect(week.sourceId == month.id)
        #expect(week.goalId == goal.id)

        let focusToday = fetch(ctx, TaskFocus.self).filter { PlanCalendar.sameDay($0.date, now) }
        #expect(focusToday.map(\.taskId) == [week.id])
        #expect(focusToday.map(\.userId) == [me])

        let tasks = fetch(ctx, SymphonyTask.self)
        #expect(tasks.count == 3)
        #expect(tasks.allSatisfy { !$0.isGoal })
        #expect(tasks.allSatisfy { $0.goalTaskId == nil })      // the iPhone model has no supports_goal_task_id at all
        #expect(tasks.allSatisfy { $0.context == "personal" })

        let rows = WalkEnding.rows(tasks: tasks, goals: goals, today: now, me: me, firstThing: m.state.firstThing)
        #expect(rows.count == 1)
        #expect(rows.first?.id == week.id)
        #expect(rows.first?.forGoal == "Feel strong again")
        #expect(rows.first?.first == true)

        #expect(try childrenAheadOfParents(ctx) == [])
        // The first thing's focus row is a child of its task: the engine names the
        // task, and in its order the focus comes after the task's insert.
        let focusRow = try #require(focusToday.first)
        #expect(SyncEngine.parentIds(table: "task_focus", id: focusRow.id, context: ctx) == [week.id])
        let queue = try ctx.fetch(FetchDescriptor<PendingChange>(sortBy: [SortDescriptor(\.createdAt)]))
        let weekInsert = try #require(queue.firstIndex { $0.tableName == "tasks" && $0.recordId == week.id && $0.changeType == "insert" })
        let focusInsert = try #require(queue.firstIndex { $0.tableName == "task_focus" && $0.recordId == focusRow.id })
        #expect(weekInsert < focusInsert)
    }

    // MARK: The whole year

    @Test func theWholeYearVisitsEveryAreaAndEveryGoal() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.choose(.full)
        for name in ["Health", "Home", "People"] { m.send(.areaTapped(area(m, name))) }
        m.choose(.next)

        let said = [("Health", "feel strong again"), ("Home", "finish the bathroom"),
                    ("People", "more slow weekends together")]
        for (i, (name, words)) in said.enumerated() {
            #expect(m.state.focusArea == area(m, name))
            #expect(WalkCopy.question(m.state, m.periods).contains(WalkCopy.phrase(for: name)))
            await say(m, words)
            if i < said.count - 1 { m.choose(.next) }
        }
        let goals = m.state.items(on: .year)
        #expect(goals.map(\.title) == ["Feel strong again", "Finish the bathroom", "More slow weekends together"])
        #expect(goals.map(\.areaId) == said.map { area(m, $0.0) })
        let goalRows = fetch(ctx, Goal.self)
        for goal in goals {
            #expect(goalRows.first { $0.id == goal.id }?.areaId == goal.areaId)
        }

        m.choose(.next)
        #expect(m.state.step == 2)
        let pieces = ["lift twice a week", "bathroom done by february", "a weekend away each month"]
        for (i, (goal, words)) in zip(goals, pieces).enumerated() {
            #expect(m.state.focus[.season] == goal.id)
            #expect(WalkCopy.question(m.state, m.periods) == "For “\(goal.title)”, what’s this winter’s piece?")
            await say(m, words)
            if i < goals.count - 1 { m.choose(.next) }
        }
        let seasonItems = m.state.items(on: .season)
        #expect(seasonItems.count == 3)
        for (piece, goal) in zip(seasonItems, goals) {
            let row = try #require(task(ctx, piece.title))
            #expect(row.goalId == goal.id)
            #expect(row.areaId == goal.areaId)
            #expect(row.bucket == "quarter")
        }

        m.choose(.next)
        #expect(m.state.step == 3)
        let lastSeason = try #require(m.state.items(on: .season).first { $0.title == "A weekend away each month" })
        #expect(m.state.focus[.month] == lastSeason.id)
        await say(m, "book the plumber")
        let plumber = try #require(task(ctx, "Book the plumber"))
        #expect(plumber.sourceId == lastSeason.id)
        #expect(plumber.goalId == goals.last?.id)
        #expect(try childrenAheadOfParents(ctx) == [])
    }

    @Test func aGoalSaidOnTheWrongPeakMoves() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        quickStart(m, keeping: ["Health", "Home"])
        m.send(.areaTapped(area(m, "Health")))
        #expect(m.state.focusArea == area(m, "Health"))
        await say(m, "finish the bathroom")
        let goal = try #require(fetch(ctx, Goal.self).first)
        #expect(goal.areaId == area(m, "Home"))
        #expect(m.state.note == WalkCopy.placed("Home"))
    }

    @Test func everyStepCanBeSkipped() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.choose(.quick)
        for _ in 0..<6 { m.choose(.next) }
        #expect(m.state.step == 6)
        #expect(fetch(ctx, Goal.self).isEmpty)
        #expect(fetch(ctx, SymphonyTask.self).isEmpty)
        #expect(fetch(ctx, GoalArea.self).isEmpty)
        #expect(fetch(ctx, TaskFocus.self).isEmpty)
        #expect(fetch(ctx, PendingChange.self).isEmpty)
    }

    // MARK: Leaving and coming back

    @Test func leavingAndComingBack() async throws {
        let ctx = try walkTestContext()
        let first = model(ctx)
        quickStart(first, keeping: ["Health", "Home"])
        await say(first, "feel strong again")
        first.choose(.next)
        await say(first, "lift twice a week")
        first.choose(.next)
        await say(first, "book the gym induction")
        let goal = try #require(fetch(ctx, Goal.self).first)
        let season = try #require(task(ctx, "Lift twice a week"))
        let month = try #require(task(ctx, "Book the gym induction"))

        // The app is closed and opened again: a new model, a new writer, the same store.
        let m = model(ctx, entry: .resume)
        #expect(m.state.step == 3)
        #expect(Set(m.state.items.map(\.id)) == [goal.id, season.id, month.id])
        #expect(m.state.items.allSatisfy { $0.mine })
        #expect(m.state.focus[.month] == season.id)
        #expect(m.state.undo.isEmpty)

        func rows() -> [String] {
            fetch(ctx, Goal.self).map { "goal \($0.id) \($0.name) \(String(describing: $0.areaId))" }.sorted()
                + fetch(ctx, SymphonyTask.self).map {
                    "task \($0.id) \($0.title) \(String(describing: $0.sourceId)) \(String(describing: $0.goalId))"
                }.sorted()
                + fetch(ctx, GoalArea.self).map { "area \($0.id) \($0.name)" }.sorted()
                + fetch(ctx, PendingChange.self).map { "change \($0.tableName) \($0.recordId) \($0.changeType)" }.sorted()
        }
        let before = rows()
        m.send(.undo)
        #expect(rows() == before)
    }

    @Test func aTaskSaidForNextWeekSurvivesAReload() async throws {
        let ctx = try walkTestContext()
        let first = model(ctx)
        quickStart(first, keeping: ["Health"])
        for _ in 0..<3 { first.choose(.next) }
        #expect(first.state.step == 4)
        await say(first, "gym on Tuesday")
        let gym = try #require(task(ctx, "Gym"))
        #expect(PlanCalendar.sameDay(gym.scheduledFor, day(2026, 11, 17)))

        let m = model(ctx, entry: .resume)
        #expect(m.state.step == 4)
        let item = try #require(m.state.items(on: .week).first { $0.title == "Gym" })
        #expect(PlanCalendar.sameDay(item.day, day(2026, 11, 17)))
        let banner = m.layout.posts.flatMap(\.banners).first { $0.level == .week && $0.itemId == item.id }
        #expect(banner?.tag == "TUESDAY")
    }

    // MARK: The ending

    @Test func walkAnotherOneDown() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        quickStart(m, keeping: ["Health", "Home"])
        await say(m, "feel strong again")
        await say(m, "finish the bathroom")
        let goals = m.state.items(on: .year)
        #expect(goals.count == 2)
        let (strong, bathroom) = (goals[0], goals[1])

        m.choose(.next)
        m.send(.bannerTapped(strong.id))                       // the chain goes under the first goal
        #expect(m.state.focus[.season] == strong.id)
        let focusBefore = m.state.focus
        let savedBefore = store.load(for: me)
        m.send(.walkAnother)                                   // not at the ending: nothing
        #expect(m.state.step == 2)
        #expect(m.state.focus == focusBefore)
        #expect(store.load(for: me) == savedBefore)
        await say(m, "lift twice a week")
        m.choose(.next)
        await say(m, "book the gym induction")
        m.choose(.next)
        await say(m, "gym induction, today")
        m.choose(.next)
        m.choose(.startThere)
        m.choose(.next)
        #expect(m.state.step == 6)

        m.send(.walkAnother)
        #expect(m.state.step == 2)
        #expect(m.state.depth == .quick)
        #expect(m.state.focus[.season] == bathroom.id)
        #expect(!m.state.sheetOpen)                            // never open here: Task 20 opens the sheet and pins this again
        #expect(store.load(for: me)?.step == 2)

        // The second goal's chain links to its own lines, not the first's.
        await say(m, "tile ordered by christmas")
        m.choose(.next)
        let piece = try #require(task(ctx, "Tile ordered by christmas"))
        #expect(m.state.focus[.month] == piece.id)
        await say(m, "pick the tile")
        #expect(task(ctx, "Pick the tile")?.sourceId == piece.id)
        #expect(task(ctx, "Pick the tile")?.goalId == bathroom.id)

        // Every year goal walked: at the ending, nothing more to walk.
        for _ in 0..<3 { m.choose(.next) }
        #expect(m.state.step == 6)
        let endFocus = m.state.focus
        let endSaved = store.load(for: me)
        m.send(.walkAnother)
        #expect(m.state.step == 6)
        #expect(m.state.focus == endFocus)
        #expect(store.load(for: me) == endSaved)
    }

    /// A second walk down that skips Season: the Month line is not hung under the
    /// first chain's season line, nor filed under the first goal.
    @Test func aSecondWalkDownThatSkipsSeasonLinksToNothingOfTheFirst() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        quickStart(m, keeping: ["Health", "Home"])
        await say(m, "feel strong again")
        await say(m, "finish the bathroom")
        let strong = m.state.items(on: .year)[0]
        m.choose(.next)
        m.send(.bannerTapped(strong.id))
        await say(m, "lift twice a week")
        m.choose(.next)
        await say(m, "book the gym induction")
        for _ in 0..<3 { m.choose(.next) }
        #expect(m.state.step == 6)

        m.send(.walkAnother)
        m.choose(.next)                                        // Season skipped
        #expect(m.state.step == 3)
        #expect(m.state.focus[.month] == nil)
        await say(m, "call the tiler")
        let tiler = try #require(task(ctx, "Call the tiler"))
        #expect(tiler.sourceId == nil)
        #expect(tiler.goalId != strong.id)
        #expect(try childrenAheadOfParents(ctx) == [])
    }
}
#endif
