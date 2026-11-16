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
    let calendar = FakeWalkCalendar()
    /// What the calendar feed holds for a day, and the time it is, as the model reads them.
    var events: [TimelineItem]? = nil
    var clockNow = now
    let suite = "WalkFlowTests.\(UUID())"
    let store: WalkPositionStore

    init() {
        store = WalkPositionStore(defaults: UserDefaults(suiteName: suite)!)
    }

    deinit {
        UserDefaults().removePersistentDomain(forName: suite)
    }

    private func model(_ ctx: ModelContext, entry: WalkEntry = .start, edition: Edition = .light) -> WalkModel {
        WalkModel(context: ctx, userId: me, entry: entry, position: entry == .resume ? store.load(for: me) : nil,
                  edition: edition, now: now, store: store, scheduler: scheduler, listener: listener, sound: FakeWalkSound(),
                  calendarAccess: { [calendar] in calendar.access }, requestCalendar: { [calendar] in await calendar.request() },
                  calendarEvents: { [unowned self] _ in self.events }, clock: { [unowned self] in self.clockNow })
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

    /// F27: a quick walk in Home that taps the first example on Year, Season, Month and Week grows one
    /// chain: each new flag hangs under the one before, all in Home, and Week's carries its day.
    @Test func followingTheFirstExamplesMakesOneChain() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        quickStart(m, keeping: ["Home"])
        let home = area(m, "Home")
        var chain: [WalkItem] = []
        for level in [WalkLevel.year, .season, .month, .week] {
            #expect(m.state.level == level)
            m.choose(.examples)
            let first = try #require(WalkCopy.examples(level, area: "Home").first)
            m.send(.exampleTapped(first))
            let planted = try #require(m.state.items.last)
            #expect(planted.areaId == home, "\(level)")
            #expect(planted.parentId == chain.last?.id, "\(level): \(planted.title)")
            chain.append(planted)
            if level != .week { m.choose(.next) }
        }
        #expect(chain.map(\.title) == ["Finish the bathroom", "Bathroom tiled and plumbed",
                                       "Pick the tile and pay the deposit", "Call the tile shop"])
        #expect(chain.last?.day == day(2026, 11, 16))              // "on Monday", said on Friday the 13th

        let goal = try #require(fetch(ctx, Goal.self).first)
        #expect(goal.name == "Finish the bathroom" && goal.areaId == home)
        let season = try #require(task(ctx, "Bathroom tiled and plumbed"))
        let month = try #require(task(ctx, "Pick the tile and pay the deposit"))
        let week = try #require(task(ctx, "Call the tile shop"))
        #expect(season.goalId == goal.id && month.sourceId == season.id && week.sourceId == month.id)
        #expect([season, month, week].allSatisfy { $0.areaId == home })
    }

    // MARK: A replay over a real plan

    /// Every field of a seeded row a walk could touch, to compare before and after.
    private func fingerprint(_ ctx: ModelContext, _ ids: Set<UUID>) -> [String] {
        func s<T>(_ v: T?) -> String { v.map { "\($0)" } ?? "nil" }
        let goals = fetch(ctx, Goal.self).filter { ids.contains($0.id) }.map { g in
            "goal \(g.id) \(g.name) \(g.year) \(g.status) \(s(g.context)) \(s(g.areaId)) \(g.areaDirty) "
                + "\(g.syncStatus) \(s(g.lastSyncedAt)) \(g.updatedAt)"
        }
        let tasks = fetch(ctx, SymphonyTask.self).filter { ids.contains($0.id) }.map { t in
            "task \(t.id) \(t.title) \(t.completed) \(s(t.completedAt)) \(s(t.scheduledFor)) \(s(t.bucket)) "
                + "\(s(t.weekStart)) \(s(t.monthStart)) \(s(t.seasonStart)) \(s(t.context)) \(s(t.goalId)) "
                + "\(s(t.sourceId)) \(s(t.areaId)) \(t.linksDirty) \(t.placementDirty) \(s(t.dismissedAt)) "
                + "\(t.syncStatus) \(t.updatedAt)"
        }
        let areas = fetch(ctx, GoalArea.self).filter { ids.contains($0.id) }.map { a in
            "area \(a.id) \(a.name) \(s(a.context)) \(a.sortOrder) \(a.syncStatus)"
        }
        return (goals + tasks + areas).sorted()
    }

    /// A household with a real plan replays the walk: synced rows (nothing queued, flags clean)
    /// with a chain linked on the web, a Health area and one with no context, a Family and a
    /// Work task for today, and another member's task and area. A quick walk plants one new
    /// chain beside them and changes nothing it did not plant.
    @Test func aReplayOverARealPlanChangesNothingItDidNotPlant() async throws {
        let ctx = try walkTestContext()
        let periods = WalkPeriods.pick(now: now)
        let other = UUID()
        func synced(_ t: SymphonyTask) -> SymphonyTask {
            t.lastSyncedAt = now
            ctx.insert(t)
            return t
        }
        let health = GoalArea(userId: me, name: "Health", sortOrder: 0, context: "personal", syncStatus: .synced)
        let garden = GoalArea(userId: me, name: "Garden", sortOrder: 1, context: nil, syncStatus: .synced)
        let theirArea = GoalArea(userId: other, name: "Allotment", context: "personal", syncStatus: .synced)
        for a in [health, garden, theirArea] { ctx.insert(a) }
        let goal = Goal(id: UUID(), userId: me, name: "Run a half marathon", year: periods.year)
        goal.context = "personal"
        goal.areaId = health.id
        goal.lastSyncedAt = now
        ctx.insert(goal)
        let season = synced(SymphonyTask(userId: me, title: "Build to ten miles", context: "personal", syncStatus: .synced))
        season.bucket = "quarter"
        season.seasonStart = periods.season.start
        season.goalId = goal.id
        season.areaId = health.id
        let month = synced(SymphonyTask(userId: me, title: "Run three times a week", context: "personal", syncStatus: .synced))
        month.bucket = "month"
        month.monthStart = periods.monthStart
        month.sourceId = season.id
        month.goalId = goal.id
        let week = synced(SymphonyTask(userId: me, title: "Buy running shoes", scheduledFor: now, context: "personal",
                                       syncStatus: .synced))
        week.bucket = "timed"
        week.weekStart = periods.weekStart
        week.sourceId = month.id
        let family = synced(SymphonyTask(userId: me, title: "School run", scheduledFor: now, context: "family", syncStatus: .synced))
        let work = synced(SymphonyTask(userId: me, title: "Send the report", scheduledFor: now, context: "work", syncStatus: .synced))
        let theirs = synced(SymphonyTask(userId: other, title: "Their dentist", scheduledFor: now, context: "personal",
                                         syncStatus: .synced))
        try ctx.save()
        #expect(fetch(ctx, PendingChange.self).isEmpty)
        let seeded: Set<UUID> = [health.id, garden.id, theirArea.id, goal.id, season.id, month.id, week.id,
                                 family.id, work.id, theirs.id]
        let before = fingerprint(ctx, seeded)
        let hidden: Set<UUID> = [family.id, work.id, theirs.id]

        let m = model(ctx, entry: .start, edition: .full)
        var shown: Set<UUID> = []
        func look() {
            shown.formUnion(m.state.items.map(\.id))
            #expect(!m.state.areas.contains { $0.id == theirArea.id })
        }
        /// A seeded flag on the step's own level: a tap never selects it, so Move and Pull up do nothing.
        func tryToTake(_ id: UUID) {
            #expect(m.state.items.contains { $0.id == id && !$0.mine })
            m.send(.bannerTapped(id))
            #expect(m.state.selected == nil)
            m.send(.moveTo(garden.id))
            m.send(.pullUp)
            #expect(m.state.items.contains { $0.id == id })
        }

        look()
        quickStart(m, keeping: ["Health"])
        look()
        tryToTake(goal.id)
        await say(m, "feel strong again")
        m.choose(.next)
        look()
        tryToTake(season.id)
        await say(m, "lift twice a week")
        m.choose(.next)
        look()
        tryToTake(month.id)
        await say(m, "book the gym induction")
        m.choose(.next)
        look()
        tryToTake(week.id)
        await say(m, "gym induction, today")
        m.choose(.next)
        look()
        m.choose(.startThere)
        m.choose(.next)
        look()
        #expect(m.state.step == 6)
        let ending = Set(m.endingRows.map(\.id))
        #expect(ending.isDisjoint(with: hidden))
        #expect(shown.isDisjoint(with: hidden))
        m.send(.goToToday)

        // Nothing seeded changed, nor was queued; one Health, reused.
        #expect(fingerprint(ctx, seeded) == before)
        let queued = fetch(ctx, PendingChange.self)
        #expect(!queued.isEmpty)
        #expect(Set(queued.map(\.recordId)).isDisjoint(with: seeded))
        #expect(fetch(ctx, GoalArea.self).filter { $0.name == "Health" }.count == 1)
        let planted = Set(m.state.items.filter(\.mine).map(\.id))
        let focusRows = Set(fetch(ctx, TaskFocus.self).map(\.id))
        let commitments = Set(fetch(ctx, TaskCommitment.self).filter { planted.contains($0.taskId) }.map(\.id))
        #expect(Set(queued.map(\.recordId)).isSubset(of: planted.union(focusRows).union(commitments)))
        #expect(planted.count == 4)
        let newGoal = try #require(m.state.items.first { $0.level == .year && $0.mine })
        #expect(fetch(ctx, Goal.self).first { $0.id == newGoal.id }?.areaId == health.id)
    }

    // MARK: Speech refused

    /// With speech refused (the first hold opened the field by the listener's refusal): a tap on
    /// the light opens the field at once, and the words go in as the field sends them.
    private func typeIt(_ m: WalkModel, _ words: String) async {
        m.send(.orbDown)
        m.send(.orbUp(heldMs: 80))
        await scheduler.settle()
        #expect(m.state.typing == "")
        m.send(.typeChanged(words))
        m.send(.typeSubmitted(words))
    }

    /// Speech refused on the first hold: every level is typed, and the rows are the same
    /// linked chain a spoken quick start leaves, with a first thing typed under the week flag.
    @Test func speechRefusedTypesTheSameChain() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        listener.problemOnStart = "Allow the microphone in Settings to speak — or type it."
        quickStart(m, keeping: ["Health", "Home"])
        m.send(.orbDown)
        scheduler.advance(WalkOrb.holdMs)
        await scheduler.settle()
        #expect(m.state.typing == "" && m.state.note == WalkCopy.speechOff)
        m.send(.orbUp(heldMs: 900))
        m.send(.typeChanged("feel strong again"))
        m.send(.typeSubmitted("feel strong again"))
        m.choose(.next)
        await typeIt(m, "lift twice a week")
        m.choose(.next)
        await typeIt(m, "book the gym induction")
        m.choose(.next)
        await typeIt(m, "gym induction, today")
        m.choose(.next)
        #expect(m.state.step == 5)
        let weekFlag = try #require(task(ctx, "Gym induction"))
        #expect(m.state.focus[.today] == weekFlag.id)
        await typeIt(m, "find the trainers")
        m.choose(.next)
        #expect(m.state.step == 6)
        #expect(listener.starts == 1)                          // never asked to listen again

        let goals = fetch(ctx, Goal.self)
        #expect(goals.count == 1)
        let goal = try #require(goals.first)
        #expect(goal.name == "Feel strong again")
        #expect(goal.year == 2027)
        #expect(goal.context == "personal")
        #expect(goal.areaId == area(m, "Health"))
        #expect(fetch(ctx, GoalArea.self).map(\.name) == ["Health"])

        let season = try #require(task(ctx, "Lift twice a week"))
        #expect(season.goalId == goal.id)
        #expect(season.sourceId == nil)
        let month = try #require(task(ctx, "Book the gym induction"))
        #expect(month.sourceId == season.id)
        #expect(month.goalId == goal.id)
        #expect(PlanCalendar.sameDay(weekFlag.scheduledFor, now))
        #expect(weekFlag.sourceId == month.id)
        #expect(weekFlag.goalId == goal.id)
        let first = try #require(task(ctx, "Find the trainers"))
        #expect(PlanCalendar.sameDay(first.scheduledFor, now))
        #expect(first.sourceId == month.id)                     // the month line, not the week flag
        #expect(first.goalId == goal.id)
        #expect(m.state.firstThing == first.id)
        let focusToday = fetch(ctx, TaskFocus.self).filter { PlanCalendar.sameDay($0.date, now) }
        #expect(focusToday.map(\.taskId) == [first.id])

        let tasks = fetch(ctx, SymphonyTask.self)
        #expect(tasks.count == 4)
        #expect(tasks.allSatisfy { !$0.isGoal && $0.goalTaskId == nil && $0.context == "personal" })
        #expect(try childrenAheadOfParents(ctx) == [])
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
            #expect(WalkCopy.question(m.state, m.periods) == "What part of “\(goal.title)” belongs to this winter?")
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
        let banner = m.layout(wing: 0).posts.flatMap(\.banners).first { $0.level == .week && $0.itemId == item.id }
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
        #expect(m.state.focus[.season] == bathroom.id)         // the one planted last, in Health
        m.send(.bannerTapped(bathroom.id))                     // switched: the chain goes under the first goal
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
        m.send(.sheetHandle)                                   // walked from inside the raised sheet
        #expect(m.state.sheetOpen)

        m.send(.walkAnother)
        #expect(m.state.step == 2)
        #expect(m.state.depth == .quick)
        #expect(m.state.focus[.season] == bathroom.id)
        #expect(!m.state.sheetOpen)                            // the sheet is put away for the walk down
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
        let (strong, bathroom) = (m.state.items(on: .year)[0], m.state.items(on: .year)[1])
        m.choose(.next)
        m.send(.bannerTapped(bathroom.id))                     // switch to the first goal
        #expect(m.state.focus[.season] == strong.id)
        await say(m, "lift twice a week")
        m.choose(.next)
        await say(m, "book the gym induction")
        for _ in 0..<3 { m.choose(.next) }
        #expect(m.state.step == 6)

        m.send(.walkAnother)
        #expect(m.state.focus[.season] == bathroom.id)
        m.choose(.next)                                        // Season skipped
        #expect(m.state.step == 3)
        #expect(m.state.focus[.month] == nil)
        await say(m, "call the tiler")
        let tiler = try #require(task(ctx, "Call the tiler"))
        #expect(tiler.sourceId == nil)
        #expect(tiler.goalId != strong.id)
        #expect(try childrenAheadOfParents(ctx) == [])

        // What this walk down said on Month is its own line: Week is about it, not the first chain's.
        m.choose(.next)
        #expect(m.state.step == 4)
        #expect(m.state.focus[.week] == tiler.id)
    }

    // MARK: Undo stays on its step (F23)

    @Test func undoStaysOnItsStep() async throws {
        let m = model(try walkTestContext())
        quickStart(m, keeping: ["Health"])
        await say(m, "feel strong again")
        #expect(!m.state.undo.isEmpty)
        m.send(.nextTapped)
        #expect(m.state.step == 2)
        #expect(m.state.undo.isEmpty)
        #expect(!WalkCopy.points(m.state, m.periods).contains { $0.at == .n || $0.action == .undo })
        #expect(WalkLayout.undoFrame(m.state) == nil)
        m.send(.backTapped)
        #expect(m.state.step == 1)
        #expect(m.state.undo.isEmpty && WalkLayout.undoFrame(m.state) == nil)
        #expect(m.state.items.count == 1)
    }

    @Test func leavingTheGroundTakesItsUndo() throws {
        let m = model(try walkTestContext())
        m.choose(.quick)
        for name in ["Health", "Home"] { m.send(.areaTapped(area(m, name))) }
        #expect(m.state.undo.count == 2 && m.state.undoShowing)
        m.send(.nextTapped)
        #expect(m.state.step == 1 && !m.state.ground)
        #expect(m.state.undo.isEmpty && !m.state.undoShowing)
        #expect(m.state.kept.count == 2)
    }

    /// A whole-year tour going on to the next area stays on Year: what was done there can still be undone.
    @Test func aTourKeepsUndoOnYear() async throws {
        let m = model(try walkTestContext())
        m.choose(.full)
        for name in ["Health", "Home"] { m.send(.areaTapped(area(m, name))) }
        m.choose(.next)
        await say(m, "feel strong again")
        m.send(.nextTapped)
        #expect(m.state.step == 1 && m.state.focusArea == area(m, "Home"))
        #expect(m.state.undo.count == 1)
        m.send(.undo)
        #expect(m.state.items.isEmpty)
    }

    // MARK: The lesson shows the way on (S19)

    @Test func theLessonShowsTheWayOn() throws {
        let m = model(try walkTestContext())
        m.choose(.quick)
        m.choose(.next)                                        // off the ground, nothing kept: Year, first arrival
        #expect(m.state.step == 1 && m.state.teaching)
        #expect(WalkLayout.nextFrame(m.state) != nil)
        #expect(WalkCopy.nextLine(m.state, m.periods)?.text == WalkCopy.skipStep)
        m.send(.nextTapped)                                    // it puts the lesson away and walks on
        #expect(m.state.step == 2 && !m.state.teaching)
    }

    @Test func aTapDuringTheLessonOpensTheChoices() throws {
        let m = model(try walkTestContext())
        m.choose(.quick)
        m.choose(.next)
        #expect(m.state.teaching)
        m.send(.orbDown)
        m.send(.orbUp(heldMs: 80))
        #expect(!m.state.teaching && m.state.orb == .open && m.state.choicesOpen)
        #expect(m.state.typing == nil)
    }

    // MARK: Typing (F22)

    /// On Year off the ground, with Type it chosen: the field open, empty.
    private func typingOnYear(_ ctx: ModelContext) -> WalkModel {
        let m = model(ctx)
        quickStart(m, keeping: ["Health"])
        m.send(.veilTapped)                                    // the lesson put away
        m.choose(.type)
        return m
    }

    @Test func aVeilTapClosesAnEmptyField() throws {
        let m = typingOnYear(try walkTestContext())
        #expect(m.state.typing == "" && !m.state.typedHasWords)
        #expect(m.state.veilsWords && m.state.showsVeil)       // the mountain's words are veiled while typing
        m.send(.veilTapped)
        #expect(m.state.typing == nil && !m.state.veilsWords)
    }

    @Test func aVeilTapKeepsTypedWords() throws {
        let m = typingOnYear(try walkTestContext())
        m.send(.typeChanged("run a"))
        #expect(m.state.typedHasWords)
        m.send(.veilTapped)
        #expect(m.state.typing == "run a")
        m.send(.typeChanged("   "))
        #expect(!m.state.typedHasWords)
    }

    /// The field's X sends `.typeDismissed`: whatever it holds, nothing is planted or written.
    @Test func closingTheFieldPlantsNothing() throws {
        let ctx = try walkTestContext()
        let m = typingOnYear(ctx)
        m.send(.typeChanged("run a 5K"))
        var s = m.state
        let effects = s.apply(.typeDismissed, WalkEnv(periods: m.periods, now: now))
        #expect(!effects.contains { if case .write = $0 { return true }; return false })
        m.send(.typeDismissed)
        #expect(m.state.typing == nil && m.state.items.isEmpty)
        #expect(fetch(ctx, Goal.self).isEmpty && fetch(ctx, PendingChange.self).isEmpty)
    }

    // MARK: The calendar ask and the ending

    /// A quick start with nothing kept, every step skipped down to Today.
    private func downToToday(_ m: WalkModel) {
        m.choose(.quick)
        for _ in 0..<5 { m.choose(.next) }
    }

    private func offersCalendar(_ m: WalkModel) -> Bool {
        WalkCopy.points(m.state, m.periods).contains { $0.action == .calendar }
    }

    @Test func theCalendarIsOfferedOnceInLightOnly() async throws {
        let m = model(try walkTestContext())
        downToToday(m)
        #expect(m.state.step == 5)
        #expect(m.state.calendarOffer)
        #expect(m.state.note == nil)                           // S35: no note, only the point
        #expect(offersCalendar(m))

        // The offer was ignored: back up and down again, and it is offered again.
        m.choose(.back)
        m.choose(.next)
        #expect(m.state.calendarOffer && offersCalendar(m))
        #expect(calendar.asks == 0)

        m.choose(.calendar)
        await scheduler.settle()
        #expect(calendar.asks == 1)
        #expect(!m.state.calendarOffer)

        m.choose(.back)
        m.choose(.next)
        #expect(m.state.step == 5)
        #expect(!m.state.calendarOffer && !offersCalendar(m))
        m.choose(.calendar)
        await scheduler.settle()
        #expect(calendar.asks == 1)

        // A full household is never asked, even with the calendar never asked for.
        let fullCalendar = FakeWalkCalendar()
        let full = WalkModel(context: try walkTestContext(), userId: me, entry: .start, position: nil, edition: .full,
                             now: now, store: nil, scheduler: scheduler, listener: listener, sound: FakeWalkSound(),
                             calendarAccess: { fullCalendar.access }, requestCalendar: { await fullCalendar.request() })
        downToToday(full)
        #expect(full.state.step == 5)
        #expect(!full.state.calendarOffer && !offersCalendar(full) && full.state.note == nil)
        full.choose(.calendar)
        await scheduler.settle()
        #expect(fullCalendar.asks == 0)

        // Light, but the person already said no to the calendar elsewhere.
        let denied = FakeWalkCalendar()
        denied.access = .denied
        let light = WalkModel(context: try walkTestContext(), userId: me, entry: .start, position: nil, edition: .light,
                              now: now, store: nil, scheduler: scheduler, listener: listener, sound: FakeWalkSound(),
                              calendarAccess: { denied.access }, requestCalendar: { await denied.request() })
        downToToday(light)
        #expect(!light.state.calendarOffer && !offersCalendar(light) && light.state.note == nil)
        #expect(denied.asks == 0)
    }

    @Test func theSheetStartsDown() async throws {
        let m = model(try walkTestContext())
        quickStart(m, keeping: ["Health"])
        await say(m, "feel strong again")
        for _ in 0..<5 { m.choose(.next) }
        #expect(m.state.step == 6)
        #expect(!m.state.sheetOpen)
        #expect(m.nextToWalk == m.state.items(on: .year).first?.title)   // its season piece not walked yet
        m.send(.sheetHandle)
        #expect(m.state.sheetOpen)
        m.send(.sheetHandle)
        #expect(!m.state.sheetOpen)
    }

    @Test func tickingARowCompletesTheTaskWhoeverPlantedIt() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        quickStart(m, keeping: ["Health"])
        for _ in 0..<4 { m.choose(.next) }
        #expect(m.state.step == 5)
        await say(m, "stretch for ten minutes")
        let first = try #require(m.state.firstThing)
        // A task for today the walk did not plant.
        let other = SymphonyTask(userId: me, title: "Call the dentist", scheduledFor: now, context: "personal",
                                 syncStatus: .synced)
        ctx.insert(other)
        try ctx.save()
        m.choose(.next)
        #expect(m.state.step == 6)
        #expect(m.endingRows.map(\.id) == [first, other.id])
        #expect(m.ring == (done: 0, total: 2))
        #expect(m.dayLine == nil)

        m.send(.rowToggled(other.id))
        #expect(other.completed)
        #expect(other.completedAt != nil)
        #expect(m.ring == (done: 1, total: 2))
        #expect(m.endingRows.first { $0.id == other.id }?.done == true)
        // As Today ticks a task: the change waits in the sync queue.
        let queued = fetch(ctx, PendingChange.self).filter { $0.tableName == "tasks" && $0.recordId == other.id }
        #expect(queued.map(\.changeType) == ["update"])

        m.send(.rowToggled(other.id))
        #expect(!other.completed)
        #expect(other.completedAt == nil)
        #expect(m.ring == (done: 0, total: 2))

        // Every row done: the day's quiet line, and nothing more.
        m.send(.rowToggled(first))
        m.send(.rowToggled(other.id))
        #expect(m.ring == (done: 2, total: 2))
        #expect(m.dayLine == WalkCopy.thatsTheDay)
    }

    @Test func closingTheSheetFinishesTheWalk() async throws {
        let m = model(try walkTestContext())
        var ended: [WalkStatus] = []
        m.onEnd = { ended.append($0) }
        quickStart(m, keeping: ["Health"])
        await say(m, "feel strong again")                     // a plan to look back at, so the handle moves the sheet
        for _ in 0..<5 { m.choose(.next) }
        #expect(m.state.step == 6)
        #expect(m.endingRows.isEmpty && m.dayLine == WalkCopy.nothingToday)
        m.send(.sheetHandle)
        #expect(m.state.sheetOpen)
        m.send(.sheetHandle)
        #expect(!m.state.sheetOpen)
        #expect(ended.isEmpty)                                 // the handle only raises and lowers
        m.send(.goToToday)
        #expect(ended == [.finished])
        #expect(store.load(for: me)?.status == .finished)
    }

    @Test func theNextEventIsTheFirstOneStartingAfterNow() throws {
        func at(_ hour: Int) -> Date { PlanCalendar.calendar.date(bySettingHour: hour, minute: 0, second: 0, of: now)! }
        func item(_ title: String, _ start: Date?, type: TimelineItem.ItemType = .event, allDay: Bool = false) -> TimelineItem {
            TimelineItem(id: title, type: type, title: title, startTime: start, isAllDay: allDay, completed: false,
                         context: nil, entityId: UUID(), eventKey: "key-\(title)")
        }
        let ctx = try walkTestContext()
        let m = model(ctx)
        #expect(m.nextUp == nil)                               // nothing in the feed: no line
        events = [item("School drop-off", at(8)), item("Picture day", nil, allDay: true),
                  item("Dentist", at(15)), item("Boxing", at(11)), item("Lunch task", at(12), type: .task)]
        clockNow = at(10)
        #expect(m.nextUp?.title == "Boxing")
        #expect(m.nextUp?.start == at(11))
        // Ticked off on Today: Today would not lead with it, so neither does the sheet.
        let ticked = ActionableInstance(userId: me, entityType: "calendar_event", entityId: "key-Boxing", date: now)
        ticked.status = "completed"
        ctx.insert(ticked)
        try ctx.save()
        #expect(m.nextUp?.title == "Dentist")
        clockNow = at(16)
        #expect(m.nextUp == nil)                               // none left today
    }

    @Test func aTickIsHonouredOnlyForTodaysRows() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        // The person's own Work task for today: not one of the sheet's rows.
        let work = SymphonyTask(userId: me, title: "Send the report", scheduledFor: now, context: "work", syncStatus: .synced)
        ctx.insert(work)
        try ctx.save()
        m.send(.rowToggled(work.id))                           // before the ending
        quickStart(m, keeping: ["Health"])
        for _ in 0..<4 { m.choose(.next) }
        await say(m, "stretch for ten minutes")
        m.choose(.next)
        #expect(m.state.step == 6)
        #expect(!m.endingRows.contains { $0.id == work.id })
        m.send(.rowToggled(work.id))
        m.send(.rowToggled(UUID()))
        #expect(!work.completed)
        #expect(!fetch(ctx, PendingChange.self).contains { $0.recordId == work.id })
    }

    // MARK: The paper (Task 7)

    /// Month with two areas kept: Work holds a season goal and seven month goals, Health a season goal
    /// and one month goal; the walk stands in Health. All planted by this walk unless `theirs`.
    private func paperMonth(theirs: Bool = false, loose: Bool = false) -> (s: WalkState, health: UUID, work: UUID, goals: [WalkItem]) {
        let health = WalkArea(id: UUID(), name: "Health"), work = WalkArea(id: UUID(), name: "Work")
        var s = WalkState()
        s.areas = [health, work]
        s.kept = [health.id, work.id]
        s.step = 3
        let lift = WalkItem(id: UUID(), level: .season, title: "Lift twice a week", areaId: health.id)
        let pitch = WalkItem(id: UUID(), level: .season, title: "Pitch three new clients", areaId: work.id)
        let goals = (1...7).map { WalkItem(id: UUID(), level: .month, title: "Work goal \($0)", areaId: work.id,
                                           parentId: pitch.id, mine: !(theirs && $0 == 1)) }
        s.items = [lift, pitch, WalkItem(id: UUID(), level: .month, title: "Find a gym that fits", areaId: health.id, parentId: lift.id)]
            + goals + (loose ? [WalkItem(id: UUID(), level: .month, title: "No area yet", areaId: nil)] : [])
        s.focusArea = health.id
        s.focus[.month] = lift.id
        return (s.settled, health.id, work.id, goals)
    }

    private var paperEnv: WalkEnv { WalkEnv(periods: WalkPeriods.pick(now: now), now: now) }

    /// "+n more" opens the paper over the mountain (F7), and so does the nameless post (F12); the top
    /// row and Next go while it is open.
    @Test func plusMoreOpensThePaper() throws {
        var (s, _, work, _) = paperMonth(loose: true)
        _ = s.apply(.areaTapped(work), paperEnv)
        let layout = WalkLayout.make(s, today: now, footing: .level)
        let post = try #require(layout.posts.first)
        let more = try #require(post.banners.first { if case .more = $0.kind { return true }; return false })
        #expect(more.kind == .more(3) && more.taps && more.label == WalkCopy.moreLabel(3))
        #expect(WalkCopy.moreLabel(3) == "3 more, tap to read the list")
        #expect(WalkLayout.tapEvent(more, on: post) == .paperOpened)
        let nameless = try #require(layout.sides.first { $0.area == nil })
        #expect(WalkLayout.tapEvent(nameless) == .paperOpened)

        var opened = s
        #expect(opened.apply(.paperOpened, paperEnv).isEmpty)
        #expect(opened.paperOpen && !opened.showsTopRow && !opened.showsNextLine && !opened.showsMore)
        let under = WalkLayout.make(opened, today: now, footing: .level)
        #expect(under.back == nil && under.leave == nil && under.more == nil && under.nextLine == nil)
        #expect(opened.paper(paperEnv.periods)?.sections.map(\.rows.count) == [1, 7, 1])
        #expect(opened.paper(paperEnv.periods)?.title == paperEnv.periods.monthName)
        _ = opened.apply(.paperClosed, paperEnv)
        #expect(!opened.paperOpen && opened.showsTopRow && opened.paper(paperEnv.periods) == nil)

        // Not on the ground, and not on Welcome or Look back up.
        for (step, ground) in [(1, true), (0, false), (6, false)] {
            var other = s
            other.step = step
            other.ground = ground
            _ = other.apply(.paperOpened, paperEnv)
            #expect(!other.paperOpen, "step \(step), ground \(ground)")
        }
    }

    /// A row walks to its flag's area and chooses it (F7): the goal above becomes its own, and the
    /// chosen flag is on the post with the Move row under it.
    @Test func aRowWalksToItsFlagAndChoosesIt() throws {
        var (s, health, work, goals) = paperMonth()
        #expect(s.standing == health)
        _ = s.apply(.paperOpened, paperEnv)
        let oldest = goals[0]
        let effects = s.apply(.paperRow(oldest.id), paperEnv)
        #expect(!s.paperOpen)
        #expect(s.standing == work && s.focus[.month] == oldest.parentId)
        #expect(s.selected == oldest.id)
        #expect(effects.contains(.save))
        let layout = WalkLayout.make(s, today: now, footing: .level)
        #expect(layout.posts.first?.banners.contains { $0.itemId == oldest.id } == true)
        #expect(layout.moveRow != nil)
        #expect(health != work)
    }

    /// A row for a flag that cannot be chosen (not planted by this walk) still walks there and chooses
    /// nothing; a row with no kept area closes the paper and leaves the walk where it stood, choosing it.
    @Test func aRowThatCannotBeChosenStillWalksThere() {
        var (s, _, work, goals) = paperMonth(theirs: true, loose: true)
        _ = s.apply(.paperOpened, paperEnv)
        _ = s.apply(.paperRow(goals[0].id), paperEnv)
        #expect(!s.paperOpen && s.standing == work && s.selected == nil)

        var (l, health, _, _) = paperMonth(loose: true)
        let loose = l.items.first { $0.areaId == nil }!
        _ = l.apply(.paperOpened, paperEnv)
        _ = l.apply(.paperRow(loose.id), paperEnv)
        #expect(!l.paperOpen && l.standing == health && l.selected == loose.id)

        // A row id that is no longer there only closes the paper.
        var (g, stood, _, _) = paperMonth()
        _ = g.apply(.paperOpened, paperEnv)
        _ = g.apply(.paperRow(UUID()), paperEnv)
        #expect(!g.paperOpen && g.standing == stood && g.selected == nil)
    }

    /// Today's paper is the week's tasks dated today; a row walks to its area with that task as the
    /// one the step is about ("Start the day with …?"), and a first thing the walk planted is chosen.
    @Test func onTodayARowIsTheTaskTheStepIsAbout() {
        let health = WalkArea(id: UUID(), name: "Health"), home = WalkArea(id: UUID(), name: "Home")
        var s = WalkState()
        s.areas = [health, home]
        s.kept = [health.id, home.id]
        s.step = 5
        let gym = WalkItem(id: UUID(), level: .week, title: "Tour the gym", areaId: health.id, day: now)
        let deposit = WalkItem(id: UUID(), level: .week, title: "Send the deposit", areaId: home.id, day: now)
        let tile = WalkItem(id: UUID(), level: .week, title: "Choose the tile", areaId: home.id, day: PlanCalendar.addDays(now, 1))
        s.items = [gym, deposit, tile]
        s.firstThing = gym.id
        s.focusArea = health.id
        s = s.settled
        _ = s.apply(.paperOpened, paperEnv)
        let paper = s.paper(paperEnv.periods)
        #expect(paper?.title == "Today" && paper?.count == "2 tasks")
        #expect(paper?.sections.flatMap(\.rows).map(\.id) == [gym.id, deposit.id])
        _ = s.apply(.paperRow(deposit.id), paperEnv)
        #expect(!s.paperOpen && s.standing == home.id && s.focus[.today] == deposit.id && s.selected == nil)
        _ = s.apply(.paperOpened, paperEnv)
        _ = s.apply(.paperRow(gym.id), paperEnv)
        #expect(s.standing == health.id && s.selected == gym.id)
    }

    // MARK: Look back up (Task 8)

    /// Look back up with Health and Work kept, each holding a year goal, a season goal and a month goal;
    /// Work a second season goal. Standing in Health.
    private func lookBack() -> (s: WalkState, health: UUID, work: UUID, workSeason: WalkItem) {
        let health = WalkArea(id: UUID(), name: "Health"), work = WalkArea(id: UUID(), name: "Work"), home = WalkArea(id: UUID(), name: "Home")
        var s = WalkState()
        s.areas = [health, home, work]
        s.kept = [health.id, home.id, work.id]
        s.step = 6
        let strong = WalkItem(id: UUID(), level: .year, title: "Feel strong again", areaId: health.id)
        let contract = WalkItem(id: UUID(), level: .year, title: "Sign one more contract", areaId: work.id)
        let lift = WalkItem(id: UUID(), level: .season, title: "Lift twice a week", areaId: health.id, parentId: strong.id)
        let pitch = WalkItem(id: UUID(), level: .season, title: "Pitch three new clients", areaId: work.id, parentId: contract.id)
        let draft = WalkItem(id: UUID(), level: .season, title: "Draft the talk outline", areaId: work.id, parentId: contract.id)
        s.items = [strong, contract, lift, pitch, draft]
        s.focusArea = health.id
        return (s.settled, health.id, work.id, pitch)
    }

    /// F21: a cloth on Look back up opens its level's paper; "Show the mountain" closes it; a row closes
    /// it and stands the walk in that flag's area, choosing nothing.
    @Test func aLookBackClothOpensItsLevelsPaper() throws {
        let start = lookBack()
        var s = start.s
        let (health, work, pitch) = (start.health, start.work, start.workSeason)
        #expect(s.standing == health)
        #expect(s.apply(.lookBackPaper(.season), paperEnv).isEmpty)
        #expect(s.paperOpen && s.paperLevel == .season)
        let paper = try #require(s.paper(paperEnv.periods))
        #expect(paper.title == paperEnv.periods.season.name && paper.count == WalkCopy.paperCount(3, level: .season))
        #expect(paper.sections.map(\.area) == [health, work] && paper.sections.map(\.rows.count) == [1, 2])
        // Nothing under the paper moves: a side post's tap, another cloth, the sheet's handle.
        for event in [WalkEvent.areaTapped(work), .lookBackPaper(.year), .sheetHandle, .goToToday] {
            var after = s
            _ = after.apply(event, paperEnv)
            #expect(after == s, "\(event)")
        }
        let effects = s.apply(.paperRow(pitch.id), paperEnv)
        #expect(!s.paperOpen && s.paperLevel == nil && s.paper(paperEnv.periods) == nil)
        #expect(s.standing == work && s.selected == nil && effects == [.save])
        // "Show the mountain" closes it where it stood.
        _ = s.apply(.lookBackPaper(.year), paperEnv)
        #expect(s.paper(paperEnv.periods)?.title == "\(paperEnv.periods.year), the year ahead")
        _ = s.apply(.paperClosed, paperEnv)
        #expect(!s.paperOpen && s.paperLevel == nil && s.standing == work)
        // Only on Look back up, and not under the raised sheet.
        var month = paperMonth().s
        _ = month.apply(.lookBackPaper(.season), paperEnv)
        #expect(!month.paperOpen && month.paperLevel == nil)
        var raised = s
        _ = raised.apply(.sheetHandle, paperEnv)
        #expect(raised.sheetRaised)
        _ = raised.apply(.lookBackPaper(.year), paperEnv)
        #expect(!raised.paperOpen)
        // A row with no kept area only closes the paper.
        var loose = s
        loose.items.append(WalkItem(id: UUID(), level: .year, title: "No area yet", areaId: nil))
        _ = loose.apply(.lookBackPaper(.year), paperEnv)
        _ = loose.apply(.paperRow(loose.items.last!.id), paperEnv)
        #expect(!loose.paperOpen && loose.standing == work && loose.selected == nil)
    }

    /// Entering Look back up stands where the walk last stood when that area holds a flag, else in the
    /// first kept area with one; a tap on a side post stands there. An area with nothing in it is never
    /// stood in while another holds something.
    @Test func lookingBackStandsWhereTheWalkLastStood() {
        let start = lookBack()
        var s = start.s
        let (health, work) = (start.health, start.work)
        var down = s
        down.step = 5
        down.focusArea = work
        _ = down.act(.next, paperEnv)
        #expect(down.step == 6 && down.standing == work)
        // Last stood in Home, which holds nothing: the first kept area with a flag.
        var bare = s
        bare.step = 5
        bare.focusArea = s.kept[1]
        _ = bare.act(.next, paperEnv)
        #expect(bare.step == 6 && bare.standing == health)
        #expect(!s.walksThere(s.kept[1]) && s.walksThere(work))
        #expect(s.apply(.areaTapped(work), paperEnv) == [.save] && s.standing == work)
        #expect(s.apply(.areaTapped(s.kept[1]), paperEnv).isEmpty && s.standing == work)
    }

    /// The paper belongs to the step it was opened on: a step change closes it, and it is never saved.
    @Test func thePaperClosesWhenTheStepChanges() {
        let (base, _, _, _) = paperMonth()
        for action in [WalkAction.next, .back] {
            var s = base
            _ = s.apply(.paperOpened, paperEnv)
            _ = s.act(action, paperEnv)
            #expect(s.step != 3 && !s.paperOpen, "\(action)")
        }
        var s = base
        _ = s.apply(.paperOpened, paperEnv)
        var resumed = WalkState()
        WalkPosition(s, status: .inProgress, planted: [], periods: paperEnv.periods, now: now).apply(to: &resumed)
        #expect(resumed.step == 3 && !resumed.paperOpen)
    }

    /// While the paper is open nothing under it moves: Next, the light, the top row and the flags.
    @Test func nothingElseMovesWhileThePaperIsOpen() {
        var (s, health, work, goals) = paperMonth()
        _ = s.apply(.paperOpened, paperEnv)
        let open = s
        let touches: [WalkEvent] = [.nextTapped, .orbDown, .orbHeld, .orbUp(heldMs: 0), .backTapped, .leaveTapped, .moreTapped,
                                    .areaTapped(work), .bannerTapped(goals[0].id), .point(.w), .veilTapped, .undo]
        for event in touches {
            var after = open
            let effects = after.apply(event, paperEnv)
            #expect(after == open && effects.isEmpty, "\(event)")
        }
        #expect(open.standing == health)
    }
}
#endif
