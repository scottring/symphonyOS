import Testing
import Foundation
import SwiftData
@testable import Symphony

// The walk writes real rows into the store every household uses: a year goal
// with its area, season and month lines and week tasks linked up the chain the
// way the web links them (source_id / goal_id), each queued for sync.

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

@MainActor
struct WalkWriterTests {
    let me = UUID()
    let periods = WalkPeriods.pick(now: day(2026, 11, 13), weekStartsOn: 0)

    private func makeContext() throws -> ModelContext {
        let container = try ModelContainer(
            for: SymphonyTask.self, Goal.self, GoalArea.self, TaskCommitment.self, TaskFocus.self,
            PendingChange.self, Routine.self, ActionableInstance.self, FamilyMember.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return ModelContext(container)
    }

    private func writer(_ ctx: ModelContext) -> WalkWriter {
        WalkWriter(context: ctx, userId: me, periods: periods)
    }

    private func pending(_ ctx: ModelContext) -> [PendingChange] {
        (try? ctx.fetch(FetchDescriptor<PendingChange>(sortBy: [SortDescriptor(\.createdAt)]))) ?? []
    }

    private func tasks(_ ctx: ModelContext) -> [SymphonyTask] {
        (try? ctx.fetch(FetchDescriptor<SymphonyTask>())) ?? []
    }

    private func task(_ ctx: ModelContext, _ id: UUID) -> SymphonyTask? {
        tasks(ctx).first { $0.id == id }
    }

    private func goal(_ ctx: ModelContext, _ id: UUID) -> Goal? {
        ((try? ctx.fetch(FetchDescriptor<Goal>())) ?? []).first { $0.id == id }
    }

    private func areas(_ ctx: ModelContext) -> [GoalArea] {
        (try? ctx.fetch(FetchDescriptor<GoalArea>())) ?? []
    }

    private func commitments(_ ctx: ModelContext, _ taskId: UUID) -> [TaskCommitment] {
        ((try? ctx.fetch(FetchDescriptor<TaskCommitment>())) ?? []).filter { $0.taskId == taskId }
    }

    private func focus(_ ctx: ModelContext) -> [TaskFocus] {
        (try? ctx.fetch(FetchDescriptor<TaskFocus>())) ?? []
    }

    /// As if the push loop sent everything: the queue is empty and the rows are clean.
    private func pushAll(_ ctx: ModelContext) throws {
        for c in pending(ctx) { ctx.delete(c) }
        for t in tasks(ctx) { t.linksDirty = false; t.placementDirty = false; t.syncStatus = .synced; t.lastSyncedAt = Date() }
        for g in (try ctx.fetch(FetchDescriptor<Goal>())) { g.areaDirty = false; g.syncStatus = .synced; g.lastSyncedAt = Date() }
        for a in areas(ctx) { a.syncStatus = .synced; a.lastSyncedAt = Date() }
        try ctx.save()
    }

    /// Every row whose link flag is set has a change queued (not a delete):
    /// without one, the next pull would overwrite it and the links never go up.
    private func everyFlagIsQueued(_ ctx: ModelContext, sourceLocation: SourceLocation = #_sourceLocation) {
        let queue = pending(ctx)
        for t in tasks(ctx) where t.linksDirty {
            #expect(queue.contains { $0.tableName == "tasks" && $0.recordId == t.id && $0.changeType != "delete" },
                    "task \(t.title) has linksDirty and nothing queued", sourceLocation: sourceLocation)
        }
        for g in ((try? ctx.fetch(FetchDescriptor<Goal>())) ?? []) where g.areaDirty {
            #expect(queue.contains { $0.tableName == "goals" && $0.recordId == g.id && $0.changeType != "delete" },
                    "goal \(g.name) has areaDirty and nothing queued", sourceLocation: sourceLocation)
        }
    }

    private struct Chain {
        let area: WalkArea
        let y: WalkItem, s: WalkItem, m: WalkItem, w: WalkItem
    }

    private func plantChain(_ w: WalkWriter, weekDay: Date? = nil) -> Chain {
        let area = WalkArea(id: UUID(), name: "Health")
        w.ensureArea(area)
        let y = WalkItem(id: UUID(), level: .year, title: "Run a half marathon", areaId: area.id)
        w.create(y, parent: nil)
        let s = WalkItem(id: UUID(), level: .season, title: "Build to ten miles", areaId: area.id, parentId: y.id)
        w.create(s, parent: y)
        let m = WalkItem(id: UUID(), level: .month, title: "Run three times a week", areaId: area.id, parentId: s.id)
        w.create(m, parent: s)
        let wk = WalkItem(id: UUID(), level: .week, title: "Buy running shoes", areaId: area.id, parentId: m.id,
                          day: weekDay ?? periods.today)
        w.create(wk, parent: m)
        return Chain(area: area, y: y, s: s, m: m, w: wk)
    }

    // MARK: Links

    @Test func linkPlan() {
        let parent = UUID(), goal = UUID()
        let year = WalkWriter.links(level: .year, parentId: parent, parentGoalId: goal)
        #expect(year.goalId == nil && year.sourceId == nil)
        let season = WalkWriter.links(level: .season, parentId: parent, parentGoalId: goal)
        #expect(season.goalId == parent && season.sourceId == nil)
        let month = WalkWriter.links(level: .month, parentId: parent, parentGoalId: goal)
        #expect(month.goalId == goal && month.sourceId == parent)
        let week = WalkWriter.links(level: .week, parentId: parent, parentGoalId: goal)
        #expect(week.goalId == goal && week.sourceId == parent)
    }

    // MARK: Creating

    @Test func aYearGoalIsAPersonalGoalForTheYearAhead() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let area = WalkArea(id: UUID(), name: "Health")
        w.ensureArea(area)
        let y = WalkItem(id: UUID(), level: .year, title: "Run a half marathon", areaId: area.id)
        w.create(y, parent: nil)
        let g = try #require(goal(ctx, y.id))
        #expect(g.year == 2027)
        #expect(g.name == "Run a half marathon")
        #expect(g.context == "personal")
        #expect(g.scope == "individual")
        #expect(g.areaId == area.id)
        #expect(g.areaDirty)
        let row = try #require(SyncEngine.serializeRow(table: "goals", id: y.id, context: ctx, forInsert: true))
        #expect(row["area_id"] == .string(area.id.uuidString))
        everyFlagIsQueued(ctx)
    }

    @Test func theChainLinksUp() throws {
        let ctx = try makeContext()
        let c = plantChain(writer(ctx))

        let s = try #require(task(ctx, c.s.id))
        #expect(s.bucket == "quarter")
        #expect(s.seasonStart == day(2026, 12, 1))
        #expect(s.goalId == c.y.id)
        #expect(s.sourceId == nil)
        #expect(s.isGoal == false)
        let sc = commitments(ctx, s.id)
        #expect(sc.count == 1)
        #expect(sc.first?.level == "season" && sc.first?.status == "open")

        let m = try #require(task(ctx, c.m.id))
        #expect(m.bucket == "month")
        #expect(m.monthStart == day(2026, 11, 1))
        #expect(m.sourceId == s.id)
        #expect(m.goalId == c.y.id)

        let wk = try #require(task(ctx, c.w.id))
        #expect(wk.bucket == "timed")
        #expect(wk.scheduledFor == periods.today)
        #expect(wk.isAllDay)
        #expect(wk.sourceId == m.id)
        #expect(wk.goalId == c.y.id)
        let wc = commitments(ctx, wk.id)
        #expect(wc.contains { $0.level == "week" && $0.periodStart == day(2026, 11, 8) })
        #expect(!focus(ctx).contains { $0.taskId == wk.id })

        for t in [s, m, wk] {
            #expect(t.context == "personal")
            #expect(t.areaId == c.area.id)
            #expect(t.linksDirty)
        }

        let queue = pending(ctx)
        func index(_ table: String, _ id: UUID) throws -> Int {
            try #require(queue.firstIndex { $0.tableName == table && $0.recordId == id && $0.changeType == "insert" })
        }
        let order = try [index("goal_areas", c.area.id), index("goals", c.y.id),
                         index("tasks", c.s.id), index("tasks", c.m.id), index("tasks", c.w.id)]
        #expect(order == order.sorted())
        everyFlagIsQueued(ctx)
    }

    /// A first thing said on Today under a week flag is a week task too: as the web's,
    /// it names the month line (the week flag's own `source_id`) and copies the goal,
    /// never naming another week task.
    @Test func aFirstThingUnderAWeekFlagNamesItsMonthLine() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let c = plantChain(w)
        let first = WalkItem(id: UUID(), level: .week, title: "Find the cheque book", areaId: c.area.id,
                             parentId: c.w.id, day: periods.today)
        w.create(first, parent: c.w)
        w.setFirstThing(first.id, previous: nil)
        let t = try #require(task(ctx, first.id))
        #expect(t.sourceId == c.m.id)
        #expect(t.goalId == c.y.id)
        #expect(t.areaId == c.area.id)
        #expect(t.linksDirty)
        #expect(focus(ctx).map(\.taskId) == [first.id])

        // A week flag with no month line above it: the first thing names none either.
        let loose = WalkItem(id: UUID(), level: .week, title: "Call the plumber", day: periods.today)
        w.create(loose, parent: nil)
        let under = WalkItem(id: UUID(), level: .week, title: "Find the number", parentId: loose.id, day: periods.today)
        w.create(under, parent: loose)
        let u = try #require(task(ctx, under.id))
        #expect(u.sourceId == nil)
        #expect(u.goalId == nil)
        everyFlagIsQueued(ctx)
    }

    @Test func aWeekTaskWithNoDayIsOnTheWeek() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let item = WalkItem(id: UUID(), level: .week, title: "Call the plumber")
        w.create(item, parent: nil)
        let t = try #require(task(ctx, item.id))
        #expect(t.bucket == "week")
        #expect(t.weekStart == day(2026, 11, 8))
        #expect(t.scheduledFor == nil)
        #expect(t.context == "personal")
        everyFlagIsQueued(ctx)
    }

    @Test func aDayNextWeekGoesToThatWeek() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let item = WalkItem(id: UUID(), level: .week, title: "Dentist", day: day(2026, 11, 16))
        w.create(item, parent: nil)
        let t = try #require(task(ctx, item.id))
        #expect(t.scheduledFor == day(2026, 11, 16))
        #expect(t.weekStart == day(2026, 11, 15))
        #expect(commitments(ctx, t.id).contains { $0.level == "week" && $0.periodStart == day(2026, 11, 15) })
    }

    // MARK: Pulling up and Undo

    @Test func pullingUpAnUnsentRowLeavesNothingBehind() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let s = WalkItem(id: UUID(), level: .season, title: "Build to ten miles")
        w.create(s, parent: nil)
        let commitmentIds = commitments(ctx, s.id).map(\.id)
        #expect(!commitmentIds.isEmpty)

        w.remove(s.id, level: .season)
        #expect(tasks(ctx).isEmpty)
        #expect(((try? ctx.fetch(FetchDescriptor<TaskCommitment>())) ?? []).isEmpty)
        #expect(!pending(ctx).contains { $0.recordId == s.id || commitmentIds.contains($0.recordId) })
    }

    @Test func pullingUpASentRowQueuesADelete() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let s = WalkItem(id: UUID(), level: .season, title: "Build to ten miles")
        w.create(s, parent: nil)
        try pushAll(ctx)

        w.remove(s.id, level: .season)
        #expect(task(ctx, s.id) == nil)
        let deletes = pending(ctx).filter { $0.tableName == "tasks" && $0.changeType == "delete" }
        #expect(deletes.count == 1)
        #expect(deletes.first?.recordId == s.id)
    }

    @Test func pullingUpASentYearGoalQueuesADelete() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let y = WalkItem(id: UUID(), level: .year, title: "Run a half marathon")
        w.create(y, parent: nil)
        try pushAll(ctx)

        w.remove(y.id, level: .year)
        #expect(goal(ctx, y.id) == nil)
        #expect(pending(ctx).filter { $0.tableName == "goals" && $0.changeType == "delete" }.map(\.recordId) == [y.id])

        // Undo before the delete went up: the server row was never removed,
        // so the delete is dropped and an update goes instead of an insert.
        w.restore(y.id)
        let g = try #require(goal(ctx, y.id))
        #expect(g.name == "Run a half marathon" && g.year == 2027 && g.context == "personal")
        let queued = pending(ctx).filter { $0.tableName == "goals" && $0.recordId == y.id }
        #expect(queued.map(\.changeType) == ["update"])
        everyFlagIsQueued(ctx)

        // Pulled up again, that row is still one the server has: a delete.
        w.remove(y.id, level: .year)
        let again = pending(ctx).filter { $0.tableName == "goals" && $0.recordId == y.id }.map(\.changeType)
        #expect(again.last == "delete")
        #expect(!again.contains("insert"))
    }

    @Test func undoAfterTheDeleteWentUpInsertsAgain() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let s = WalkItem(id: UUID(), level: .season, title: "Build to ten miles")
        w.create(s, parent: nil)
        try pushAll(ctx)
        w.remove(s.id, level: .season)
        try pushAll(ctx)

        w.restore(s.id)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == s.id && $0.changeType == "insert" })
        #expect(pending(ctx).contains { $0.tableName == "task_commitments" && $0.changeType == "insert" })
        everyFlagIsQueued(ctx)
    }

    @Test func pullingUpAParentUnlinksItsChildrenAndUndoRelinksThem() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let c = plantChain(w)

        w.remove(c.s.id, level: .season)
        let m = try #require(task(ctx, c.m.id))
        #expect(m.sourceId == nil)
        #expect(m.linksDirty)
        everyFlagIsQueued(ctx)

        w.restore(c.s.id)
        let s = try #require(task(ctx, c.s.id))
        #expect(s.title == "Build to ten miles")
        #expect(s.goalId == c.y.id)
        #expect(s.seasonStart == day(2026, 12, 1))
        #expect(commitments(ctx, s.id).contains { $0.level == "season" && $0.status == "open" })
        #expect(m.sourceId == s.id)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == s.id && $0.changeType == "insert" })
        everyFlagIsQueued(ctx)
    }

    @Test func pullingUpASentParentQueuesEachChildsUnlink() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let c = plantChain(w)
        try pushAll(ctx)

        w.remove(c.y.id, level: .year)
        for id in [c.s.id, c.m.id, c.w.id] {
            let t = try #require(task(ctx, id))
            #expect(t.goalId == nil)
            #expect(t.linksDirty)
        }
        everyFlagIsQueued(ctx)

        try pushAll(ctx)
        w.restore(c.y.id)
        for id in [c.s.id, c.m.id, c.w.id] {
            #expect(task(ctx, id)?.goalId == c.y.id)
        }
        everyFlagIsQueued(ctx)
    }

    @Test func undoBringsBackTodaysFocus() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let item = WalkItem(id: UUID(), level: .week, title: "Buy running shoes", day: periods.today)
        w.create(item, parent: nil)
        w.setFirstThing(item.id, previous: nil)
        #expect(focus(ctx).count == 1)

        w.remove(item.id, level: .week)
        #expect(focus(ctx).isEmpty)
        #expect(pending(ctx).isEmpty)

        w.restore(item.id)
        #expect(focus(ctx).map(\.taskId) == [item.id])
        #expect(pending(ctx).contains { $0.tableName == "task_focus" && $0.changeType == "insert" })
    }

    // MARK: Areas

    @Test func anAreaIsMadeOnceAndInOrder() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let health = WalkArea(id: UUID(), name: "Health")
        w.ensureArea(health)
        w.ensureArea(health)
        #expect(areas(ctx).count == 1)
        let first = try #require(areas(ctx).first)
        #expect(first.sortOrder == 0)
        #expect(first.context == "personal")
        #expect(first.userId == me)

        let home = WalkArea(id: UUID(), name: "Home")
        w.ensureArea(home)
        #expect(areas(ctx).first { $0.id == home.id }?.sortOrder == 1)

        let y = WalkItem(id: UUID(), level: .year, title: "A calmer house", areaId: home.id)
        w.create(y, parent: nil)
        w.dropAreaIfUnused(home.id)
        #expect(areas(ctx).contains { $0.id == home.id })
    }

    @Test func aTaskThatNamesAnAreaKeepsIt() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let home = WalkArea(id: UUID(), name: "Home")
        w.ensureArea(home)
        w.create(WalkItem(id: UUID(), level: .week, title: "Fix the gate", areaId: home.id), parent: nil)
        w.dropAreaIfUnused(home.id)
        #expect(areas(ctx).contains { $0.id == home.id })
    }

    @Test func droppingAnUnsentAreaLeavesNothingQueued() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let area = WalkArea(id: UUID(), name: "Health")
        w.ensureArea(area)
        w.dropAreaIfUnused(area.id)
        #expect(areas(ctx).isEmpty)
        #expect(!pending(ctx).contains { $0.tableName == "goal_areas" })
    }

    @Test func droppingASentAreaQueuesADelete() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let area = WalkArea(id: UUID(), name: "Health")
        w.ensureArea(area)
        try pushAll(ctx)
        w.dropAreaIfUnused(area.id)
        #expect(areas(ctx).isEmpty)
        let queued = pending(ctx).filter { $0.tableName == "goal_areas" }
        #expect(queued.count == 1)
        #expect(queued.first?.changeType == "delete")
        #expect(queued.first?.recordId == area.id)
    }

    @Test func anAreaItDidNotMakeIsNeverDropped() throws {
        let ctx = try makeContext()
        let existing = GoalArea(userId: me, name: "Health", sortOrder: 3, context: "personal", syncStatus: .synced)
        ctx.insert(existing)
        try ctx.save()

        let w = writer(ctx)
        w.ensureArea(WalkArea(id: existing.id, name: "Health"))
        w.dropAreaIfUnused(existing.id)
        #expect(areas(ctx).map(\.id) == [existing.id])
        #expect(pending(ctx).isEmpty)
    }

    @Test func aNewAreaFollowsThePersonsHighest() throws {
        let ctx = try makeContext()
        ctx.insert(GoalArea(userId: me, name: "Work", sortOrder: 4, context: "work", syncStatus: .synced))
        // A partner's shared area is not this person's order.
        ctx.insert(GoalArea(userId: UUID(), name: "Family", sortOrder: 9, context: "family", syncStatus: .synced))
        try ctx.save()
        let area = WalkArea(id: UUID(), name: "Health")
        writer(ctx).ensureArea(area)
        #expect(areas(ctx).first { $0.id == area.id }?.sortOrder == 5)
    }

    @Test func undoAfterItsAreaWasDroppedBringsTheAreaBackFirst() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let area = WalkArea(id: UUID(), name: "Health")
        w.ensureArea(area)
        let y = WalkItem(id: UUID(), level: .year, title: "Run a half marathon", areaId: area.id)
        w.create(y, parent: nil)
        w.remove(y.id, level: .year)
        w.dropAreaIfUnused(area.id)
        #expect(areas(ctx).isEmpty)

        w.restore(y.id)
        #expect(areas(ctx).map(\.name) == ["Health"])
        #expect(goal(ctx, y.id)?.areaId == area.id)
        let queue = pending(ctx)
        let a = try #require(queue.firstIndex { $0.tableName == "goal_areas" && $0.recordId == area.id && $0.changeType == "insert" })
        let g = try #require(queue.firstIndex { $0.tableName == "goals" && $0.recordId == y.id && $0.changeType == "insert" })
        #expect(a < g)
    }

    // MARK: Moving, first thing, ticking

    @Test func movingSetsTheAreaAndMarksItToSend() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let c = plantChain(w)
        try pushAll(ctx)
        let other = WalkArea(id: UUID(), name: "Home")
        w.ensureArea(other)

        w.setArea(c.y.id, level: .year, to: other.id)
        let g = try #require(goal(ctx, c.y.id))
        #expect(g.areaId == other.id)
        #expect(g.areaDirty)
        #expect(pending(ctx).filter { $0.tableName == "goals" && $0.recordId == c.y.id }.count == 1)

        w.setArea(c.m.id, level: .month, to: other.id)
        let m = try #require(task(ctx, c.m.id))
        #expect(m.areaId == other.id)
        #expect(m.linksDirty)
        #expect(pending(ctx).filter { $0.tableName == "tasks" && $0.recordId == c.m.id }.count == 1)
        everyFlagIsQueued(ctx)
    }

    @Test func aMoveWhileTheInsertIsStillQueuedIsQueuedToo() throws {
        // The insert may already be in flight: an update queued beside it is
        // what carries a re-link the insert did not send.
        let ctx = try makeContext()
        let w = writer(ctx)
        let s = WalkItem(id: UUID(), level: .season, title: "Build to ten miles")
        w.create(s, parent: nil)
        let other = WalkArea(id: UUID(), name: "Home")
        w.ensureArea(other)
        w.setArea(s.id, level: .season, to: other.id)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == s.id && $0.changeType == "update" })
    }

    /// Each public writer, run on rows that already reached the server (so no
    /// insert is left to carry anything), leaves a queued change for every
    /// row whose link flag it set.
    @Test func everyWriterQueuesEachRowWhoseFlagItSets() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let c = plantChain(w)
        everyFlagIsQueued(ctx)

        let other = WalkArea(id: UUID(), name: "Home")
        try pushAll(ctx); w.ensureArea(other); everyFlagIsQueued(ctx)
        try pushAll(ctx); w.setArea(c.y.id, level: .year, to: other.id); everyFlagIsQueued(ctx)
        try pushAll(ctx); w.setArea(c.w.id, level: .week, to: other.id); everyFlagIsQueued(ctx)
        try pushAll(ctx); w.setFirstThing(c.w.id, previous: nil); everyFlagIsQueued(ctx)
        try pushAll(ctx); w.toggleDone(c.w.id); everyFlagIsQueued(ctx)
        try pushAll(ctx); w.remove(c.m.id, level: .month); everyFlagIsQueued(ctx)
        #expect(task(ctx, c.w.id)?.linksDirty == true)
        try pushAll(ctx); w.restore(c.m.id); everyFlagIsQueued(ctx)
        #expect(task(ctx, c.m.id)?.linksDirty == true && task(ctx, c.w.id)?.linksDirty == true)
        try pushAll(ctx); w.remove(c.y.id, level: .year); everyFlagIsQueued(ctx)
        try pushAll(ctx); w.restore(c.y.id); everyFlagIsQueued(ctx)
        try pushAll(ctx); w.dropAreaIfUnused(c.area.id); everyFlagIsQueued(ctx)
        try pushAll(ctx); w.create(WalkItem(id: UUID(), level: .week, title: "Stretch", areaId: other.id, parentId: c.m.id), parent: c.m)
        everyFlagIsQueued(ctx)
    }

    @Test func firstThingMovesTheMark() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let a = WalkItem(id: UUID(), level: .week, title: "Buy running shoes", day: periods.today)
        let b = WalkItem(id: UUID(), level: .week, title: "Call the plumber")
        w.create(a, parent: nil)
        w.create(b, parent: nil)

        w.setFirstThing(a.id, previous: nil)
        let today = focus(ctx).filter { PlanCalendar.sameDay($0.date, periods.today) }
        #expect(today.map(\.taskId) == [a.id])

        w.setFirstThing(b.id, previous: a.id)
        let after = focus(ctx).filter { PlanCalendar.sameDay($0.date, periods.today) }
        #expect(after.map(\.taskId) == [b.id])
        #expect(task(ctx, a.id)?.scheduledFor == periods.today)
        #expect(task(ctx, b.id)?.scheduledFor == periods.today)
        #expect(pending(ctx).contains { $0.tableName == "task_focus" && $0.changeType == "insert" })
        everyFlagIsQueued(ctx)
    }

    @Test func aTaskMarkedFirstFromAnotherDayGoesBackWhenTheMarkMoves() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let thursday = day(2026, 11, 12)
        let t = WalkItem(id: UUID(), level: .week, title: "Call the tile shop", day: thursday)
        let b = WalkItem(id: UUID(), level: .week, title: "Buy running shoes", day: periods.today)
        w.create(t, parent: nil)
        w.create(b, parent: nil)
        try pushAll(ctx)

        w.setFirstThing(t.id, previous: nil)
        #expect(task(ctx, t.id)?.scheduledFor == periods.today)

        try pushAll(ctx)
        w.setFirstThing(b.id, previous: t.id)
        #expect(task(ctx, t.id)?.scheduledFor == thursday)
        #expect(task(ctx, t.id)?.weekStart == PlanCalendar.weekStart(thursday))
        #expect(task(ctx, t.id)?.placementDirty == true)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == t.id && $0.changeType == "update" })
        let marked = focus(ctx).filter { PlanCalendar.sameDay($0.date, periods.today) }
        #expect(marked.map(\.taskId) == [b.id])
        everyFlagIsQueued(ctx)

        // Remembered once: marking it again and clearing the mark puts it back again.
        w.setFirstThing(t.id, previous: b.id)
        #expect(task(ctx, t.id)?.scheduledFor == periods.today)
        w.setFirstThing(nil, previous: t.id)
        #expect(task(ctx, t.id)?.scheduledFor == thursday)
        #expect(focus(ctx).isEmpty)
    }

    @Test func clearingTheMarkPutsTheTaskBack() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let thursday = day(2026, 11, 12)
        let t = WalkItem(id: UUID(), level: .week, title: "Call the tile shop", day: thursday)
        w.create(t, parent: nil)
        w.setFirstThing(t.id, previous: nil)
        try pushAll(ctx)

        w.setFirstThing(nil, previous: t.id)
        #expect(task(ctx, t.id)?.scheduledFor == thursday)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == t.id && $0.changeType == "update" })

        // A relaunch remembers nothing: a new writer leaves the task on today.
        w.setFirstThing(t.id, previous: nil)
        writer(ctx).setFirstThing(nil, previous: t.id)
        #expect(task(ctx, t.id)?.scheduledFor == periods.today)
    }

    @Test func aTaskAlreadyOnTodayIsNotTouchedEitherWay() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let a = WalkItem(id: UUID(), level: .week, title: "Buy running shoes", day: periods.today)
        w.create(a, parent: nil)
        try pushAll(ctx)

        w.setFirstThing(a.id, previous: nil)
        w.setFirstThing(nil, previous: a.id)
        #expect(task(ctx, a.id)?.scheduledFor == periods.today)
        #expect(!pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == a.id })
    }

    @Test func tickingTogglesAnyTask() throws {
        let ctx = try makeContext()
        let t = SymphonyTask(userId: me, title: "Water the plants", context: "family", syncStatus: .synced)
        ctx.insert(t)
        try ctx.save()
        let w = writer(ctx)

        w.toggleDone(t.id)
        #expect(t.completed)
        w.toggleDone(t.id)
        #expect(!t.completed)

        let before = pending(ctx).count
        w.toggleDone(UUID())
        #expect(!t.completed)
        #expect(pending(ctx).count == before)
    }

    @Test func copiesShareWhatWasRemoved() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let s = WalkItem(id: UUID(), level: .season, title: "Build to ten miles")
        w.create(s, parent: nil)
        w.remove(s.id, level: .season)
        let copy = w
        copy.restore(s.id)
        #expect(task(ctx, s.id) != nil)
    }

    // MARK: Only the walk's own rows, only the signed-in person's

    /// A row of the person's own plan that the walk did not make: its own
    /// commitment, today's focus and an edit still queued.
    private func plantBystander(_ ctx: ModelContext) throws -> (task: SymphonyTask, commitment: TaskCommitment, focus: TaskFocus) {
        let t = SymphonyTask(userId: me, title: "Renew the passport", context: "personal", syncStatus: .synced)
        t.bucket = "week"
        t.weekStart = day(2026, 11, 8)
        let c = TaskCommitment(taskId: t.id, level: "week", periodStart: day(2026, 11, 8), createdBy: me, syncStatus: .synced)
        let f = TaskFocus(taskId: t.id, userId: me, date: periods.today, syncStatus: .synced)
        ctx.insert(t); ctx.insert(c); ctx.insert(f)
        ctx.queueSync(table: "tasks", recordId: t.id, type: "update")
        try ctx.save()
        return (t, c, f)
    }

    private func bystanderSurvives(_ ctx: ModelContext, _ b: (task: SymphonyTask, commitment: TaskCommitment, focus: TaskFocus),
                                   sourceLocation: SourceLocation = #_sourceLocation) {
        #expect(task(ctx, b.task.id)?.title == "Renew the passport", sourceLocation: sourceLocation)
        #expect(commitments(ctx, b.task.id).map(\.id) == [b.commitment.id], sourceLocation: sourceLocation)
        #expect(focus(ctx).filter { $0.taskId == b.task.id }.map(\.id) == [b.focus.id], sourceLocation: sourceLocation)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == b.task.id && $0.changeType == "update" },
                sourceLocation: sourceLocation)
    }

    @Test func pullingUpSparesRowsTheWalkDidNotMake() throws {
        let ctx = try makeContext()
        let b = try plantBystander(ctx)
        let w = writer(ctx)
        let c = plantChain(w)
        w.setFirstThing(c.w.id, previous: nil)

        // Unsent walk rows: taken back whole.
        w.remove(c.w.id, level: .week)
        bystanderSurvives(ctx, b)
        w.restore(c.w.id)
        bystanderSurvives(ctx, b)
        w.remove(c.y.id, level: .year)
        bystanderSurvives(ctx, b)
        w.restore(c.y.id)
        bystanderSurvives(ctx, b)

        // Sent walk rows: deleted with a queued delete.
        try pushAll(ctx)
        ctx.queueSync(table: "tasks", recordId: b.task.id, type: "update")
        try ctx.save()
        w.remove(c.s.id, level: .season)
        bystanderSurvives(ctx, b)
        w.restore(c.s.id)
        bystanderSurvives(ctx, b)
        #expect(!pending(ctx).contains { $0.recordId == b.task.id && $0.changeType == "delete" })
    }

    private struct TaskLook: Equatable {
        let title: String, completed: Bool, scheduledFor: Date?, bucket: String?, context: String?
        let goalId: UUID?, sourceId: UUID?, areaId: UUID?, linksDirty: Bool, placementDirty: Bool
        let updatedAt: Date, syncStatus: SyncStatus
        init(_ t: SymphonyTask) {
            title = t.title; completed = t.completed; scheduledFor = t.scheduledFor; bucket = t.bucket
            context = t.context; goalId = t.goalId; sourceId = t.sourceId; areaId = t.areaId
            linksDirty = t.linksDirty; placementDirty = t.placementDirty; updatedAt = t.updatedAt; syncStatus = t.syncStatus
        }
    }

    private struct GoalLook: Equatable {
        let name: String, year: Int, sortOrder: Int, areaId: UUID?, areaDirty: Bool, updatedAt: Date
        init(_ g: Goal) {
            name = g.name; year = g.year; sortOrder = g.sortOrder; areaId = g.areaId; areaDirty = g.areaDirty; updatedAt = g.updatedAt
        }
    }

    private struct AreaLook: Equatable {
        let name: String, sortOrder: Int, context: String?, userId: UUID
        init(_ a: GoalArea) { name = a.name; sortOrder = a.sortOrder; context = a.context; userId = a.userId }
    }

    @Test func aPartnersRowsAreNeverTouched() throws {
        let ctx = try makeContext()
        let partner = UUID()
        let w = writer(ctx)
        let c = plantChain(w)
        try pushAll(ctx)

        let area = GoalArea(userId: partner, name: "Family", sortOrder: 0, context: "family", syncStatus: .synced)
        let t = SymphonyTask(userId: partner, title: "Pack the school bags", context: "family", syncStatus: .synced)
        t.bucket = "timed"
        t.scheduledFor = periods.today
        t.areaId = area.id
        // Pointed at a walk row on the web: the server's SET NULL owns that link.
        t.sourceId = c.m.id
        t.goalId = c.y.id
        let g = Goal(id: UUID(), userId: partner, name: "A calmer house", year: 2027)
        g.context = "family"
        g.areaId = area.id
        ctx.insert(area); ctx.insert(t); ctx.insert(g)
        try ctx.save()
        let taskBefore = TaskLook(t), goalBefore = GoalLook(g), areaBefore = AreaLook(area)

        func untouched(_ step: String, sourceLocation: SourceLocation = #_sourceLocation) {
            let tt = task(ctx, t.id), gg = goal(ctx, g.id), aa = areas(ctx).first { $0.id == area.id }
            #expect(tt.map(TaskLook.init) == taskBefore, "task after \(step)", sourceLocation: sourceLocation)
            #expect(gg.map(GoalLook.init) == goalBefore, "goal after \(step)", sourceLocation: sourceLocation)
            #expect(aa.map(AreaLook.init) == areaBefore, "area after \(step)", sourceLocation: sourceLocation)
            #expect(!pending(ctx).contains { [t.id, g.id, area.id].contains($0.recordId) },
                    "queue after \(step)", sourceLocation: sourceLocation)
            #expect(!focus(ctx).contains { $0.taskId == t.id }, "focus after \(step)", sourceLocation: sourceLocation)
        }

        w.remove(t.id, level: .week); untouched("remove task")
        w.restore(t.id); untouched("restore task")
        w.remove(g.id, level: .year); untouched("remove goal")
        w.restore(g.id); untouched("restore goal")
        w.setArea(t.id, level: .week, to: c.area.id); untouched("setArea task")
        w.setArea(g.id, level: .year, to: c.area.id); untouched("setArea goal")
        w.setFirstThing(t.id, previous: nil); untouched("setFirstThing")
        w.setFirstThing(nil, previous: t.id); untouched("setFirstThing previous")
        w.toggleDone(t.id); untouched("toggleDone")
        w.create(WalkItem(id: t.id, level: .week, title: "Replanted"), parent: nil); untouched("create task id")
        w.create(WalkItem(id: g.id, level: .year, title: "Replanted"), parent: nil); untouched("create goal id")
        w.ensureArea(WalkArea(id: area.id, name: "Renamed")); untouched("ensureArea")
        w.dropAreaIfUnused(area.id); untouched("dropAreaIfUnused")
        // Pulling up the walk rows it names leaves its links to the server.
        w.remove(c.m.id, level: .month); untouched("remove the row it names")
        w.remove(c.y.id, level: .year); untouched("remove the goal it names")
        w.restore(c.y.id); untouched("restore the goal it names")
        w.restore(c.m.id); untouched("restore the row it names")
    }

    @Test func plantingTwiceIsOneRow() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let y = WalkItem(id: UUID(), level: .year, title: "Run a half marathon")
        w.create(WalkItem(id: UUID(), level: .year, title: "Another goal"), parent: nil)
        w.create(y, parent: nil)
        let order = try #require(goal(ctx, y.id)).sortOrder
        w.create(WalkItem(id: y.id, level: .year, title: "Replanted"), parent: nil)
        let goals = try ctx.fetch(FetchDescriptor<Goal>()).filter { $0.id == y.id }
        #expect(goals.count == 1)
        #expect(goals.first?.name == "Run a half marathon")
        #expect(goals.first?.sortOrder == order)

        let s = WalkItem(id: UUID(), level: .season, title: "Build to ten miles")
        w.create(s, parent: nil)
        w.create(WalkItem(id: s.id, level: .season, title: "Replanted"), parent: nil)
        #expect(tasks(ctx).filter { $0.id == s.id }.map(\.title) == ["Build to ten miles"])
        #expect(commitments(ctx, s.id).count == 1)
    }

    @Test func aMissingParentGivesAnUnlinkedRow() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let gone = WalkItem(id: UUID(), level: .season, title: "Pulled up elsewhere")
        let m = WalkItem(id: UUID(), level: .month, title: "Run three times a week", parentId: gone.id)
        w.create(m, parent: gone)
        let t = try #require(task(ctx, m.id))
        #expect(t.goalId == nil)
        #expect(t.sourceId == nil)
        #expect(t.linksDirty)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == m.id && $0.changeType == "insert" })
    }

    @Test func undoKeepsOnlyLinksWhoseRowsStillExist() throws {
        let ctx = try makeContext()
        let w = writer(ctx)
        let c = plantChain(w)
        w.remove(c.w.id, level: .week)
        w.remove(c.m.id, level: .month)

        w.restore(c.w.id)
        let t = try #require(task(ctx, c.w.id))
        #expect(t.sourceId == nil)          // its month line is still pulled up
        #expect(t.goalId == c.y.id)
        #expect(t.areaId == c.area.id)
        #expect(t.linksDirty)
    }

    // MARK: Existing callers

    @Test func existingCallersAreUnchanged() throws {
        let ctx = try makeContext()
        let t = SymphonyTask(userId: me, title: "Renew the passport", context: "family")
        t.bucket = "week"
        ctx.insert(t)
        PlanWriter(context: ctx, userId: me).planTask(t, on: Date())
        #expect(focus(ctx).map(\.taskId) == [t.id])
    }
}
