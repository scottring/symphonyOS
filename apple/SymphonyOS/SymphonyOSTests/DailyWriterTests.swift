#if os(iOS)
import Testing
import Foundation
import SwiftData
@testable import Symphony

// The light pages write only through the writers the app already has: a task
// is the walk's week task, a goal is the walk's flag, a tick is the app's own
// completion, and every row is the signed-in person's own, personal, queued.

private func day(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
}

@MainActor
struct DailyWriterTests {
    let me = UUID()
    let other = UUID()
    /// 10 November 2026: the walk still files into Fall and November.
    let periods = WalkPeriods.pick(now: day(2026, 11, 10))
    let health = WalkArea(id: UUID(), name: "Health")
    let home = WalkArea(id: UUID(), name: "Home")

    private func writer(_ ctx: ModelContext, periods: WalkPeriods? = nil) -> DailyWriter {
        DailyWriter(context: ctx, userId: me, periods: periods ?? self.periods)
    }

    private func pending(_ ctx: ModelContext) -> [PendingChange] {
        (try? ctx.fetch(FetchDescriptor<PendingChange>())) ?? []
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
        for g in try ctx.fetch(FetchDescriptor<Goal>()) { g.areaDirty = false; g.syncStatus = .synced; g.lastSyncedAt = Date() }
        try ctx.save()
    }

    private func flag(_ added: DailyWriter.Added, _ title: String) -> WalkItem {
        WalkItem(id: added.id, level: added.level, title: title, areaId: added.areaId)
    }

    private func row(_ ctx: ModelContext, _ id: UUID) -> DailyDay.Row {
        let t = task(ctx, id)!
        return DailyDay.Row(id: t.id, title: t.title, forGoal: nil, done: t.completed, first: false)
    }

    // MARK: Adding

    @Test func aTaskAddedTodayIsPersonalOnTodayAndQueued() throws {
        let ctx = try walkTestContext()
        let added = writer(ctx).add(.task(title: "Call the vet", day: periods.today, at: nil, here: true))
        let t = try #require(task(ctx, added.id))
        #expect(added.level == .week)
        #expect(t.userId == me)
        #expect(t.context == "personal")
        #expect(PlanCalendar.sameDay(t.scheduledFor, periods.today))
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == t.id && $0.changeType == "insert" })
        #expect(commitments(ctx, t.id).contains { $0.level == "week" && $0.status == "open" })
        #expect(focus(ctx).isEmpty)
    }

    @Test func aTaskWithNoDayIsOnTheWeek() throws {
        let ctx = try walkTestContext()
        let added = writer(ctx).add(.task(title: "Book the boiler service", day: nil, at: nil, here: true))
        let t = try #require(task(ctx, added.id))
        #expect(t.scheduledFor == nil)
        #expect(t.bucket == "week")
        #expect(commitments(ctx, t.id).contains { $0.level == "week" && $0.status == "open" })
    }

    @Test func aTimeSaidIsKept() throws {
        let ctx = try walkTestContext()
        let at = day(2026, 11, 12, 15)
        let added = writer(ctx).add(.task(title: "Dentist", day: day(2026, 11, 12), at: at, here: false))
        let t = try #require(task(ctx, added.id))
        #expect(t.isAllDay == false)
        #expect(t.scheduledFor.map { PlanCalendar.calendar.component(.hour, from: $0) } == 15)
        #expect(PlanCalendar.sameDay(t.scheduledFor, day(2026, 11, 12)))
    }

    /// Finding 4: a time said for the real today must not make it the first thing.
    @Test func aTimedTaskTodayIsNotTheFirstThing() throws {
        let ctx = try walkTestContext()
        let now = WalkPeriods.pick(now: Date())
        let at = try #require(PlanCalendar.calendar.date(bySettingHour: 15, minute: 0, second: 0, of: now.today))
        let added = writer(ctx, periods: now).add(.task(title: "Dentist", day: now.today, at: at, here: true))
        let t = try #require(task(ctx, added.id))
        #expect(t.isAllDay == false)
        #expect(PlanCalendar.sameDay(t.scheduledFor, now.today))
        #expect(focus(ctx).isEmpty)
        #expect(!pending(ctx).contains { $0.tableName == "task_focus" })
    }

    @Test func aYearGoalGoesWhereItsWordsBelong() throws {
        let ctx = try walkTestContext()
        let added = writer(ctx).add(.goal(title: "Run a marathon", level: .year), kept: [health, home], focusArea: home.id)
        let g = try #require(goal(ctx, added.id))
        #expect(added.level == .year)
        #expect(added.areaId == health.id)
        #expect(added.placed == "Health")
        #expect(g.areaId == health.id)
        #expect(g.year == periods.year)
        #expect(g.context == "personal")
        #expect(areas(ctx).contains { $0.id == health.id && $0.userId == me })
    }

    @Test func aYearGoalOnItsOwnPeakIsNotPlaced() throws {
        let ctx = try walkTestContext()
        let added = writer(ctx).add(.goal(title: "Run a marathon", level: .year), kept: [health, home], focusArea: health.id)
        #expect(added.areaId == health.id)
        #expect(added.placed == nil)
    }

    @Test func aGoalUnderAFlagLinksUp() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let year = w.add(.goal(title: "Run a marathon", level: .year), kept: [health], focusArea: health.id)
        let season = w.add(.goal(title: "Build to ten miles", level: .season), kept: [health],
                           parent: flag(year, "Run a marathon"))
        try pushAll(ctx)
        let month = w.add(.goal(title: "Run three times a week", level: .month), kept: [health],
                          parent: flag(season, "Build to ten miles"))
        let s = try #require(task(ctx, season.id))
        let m = try #require(task(ctx, month.id))
        #expect(s.goalId == year.id)
        #expect(m.sourceId == season.id)
        #expect(m.goalId == s.goalId)
        #expect(m.areaId == health.id)
        #expect(month.areaId == health.id)
        #expect(m.linksDirty)
        #expect(m.monthStart.map { PlanCalendar.sameDay($0, periods.monthStart) } == true)
    }

    @Test func aGoalWithNoParentIsPlacedByItsWordsAlone() throws {
        let ctx = try walkTestContext()
        let added = writer(ctx).add(.goal(title: "Fix the garden fence", level: .month), kept: [health, home],
                                    focusArea: health.id)
        #expect(added.areaId == home.id)
        #expect(added.placed == nil)
        #expect(task(ctx, added.id)?.areaId == home.id)
    }

    /// Finding 1: a goal added on another period's page files into that period.
    @Test func aGoalAddedOnAnotherPeriodsPageFilesThere() throws {
        let ctx = try walkTestContext()
        let december = WalkPeriods.pick(now: day(2026, 11, 28))
        #expect(PlanCalendar.sameDay(december.monthStart, day(2026, 12, 1)))
        let november = periods
        #expect(PlanCalendar.sameDay(november.monthStart, day(2026, 11, 1)))
        let w = writer(ctx, periods: december)
        let added = w.add(.goal(title: "Clear the attic", level: .month), kept: [home], periods: november)
        let t = try #require(task(ctx, added.id))
        #expect(t.monthStart.map { PlanCalendar.sameDay($0, day(2026, 11, 1)) } == true)
        #expect(commitments(ctx, t.id).contains { $0.level == "month" && PlanCalendar.sameDay($0.periodStart, day(2026, 11, 1)) })

        // Take-back stays on the long-lived writer, and so does the area it made.
        w.takeBack(added)
        #expect(task(ctx, added.id) == nil)
        #expect(areas(ctx).isEmpty)
        #expect(pending(ctx).isEmpty)

        // With no periods, the writer's own.
        let own = w.add(.goal(title: "Clear the attic", level: .month), kept: [home])
        #expect(task(ctx, own.id)?.monthStart.map { PlanCalendar.sameDay($0, day(2026, 12, 1)) } == true)
    }

    // MARK: Undo

    @Test func undoTakesTheRowBack() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Dentist", day: day(2026, 11, 12), at: day(2026, 11, 12, 15), here: false))
        w.takeBack(added)
        #expect(task(ctx, added.id) == nil)
        #expect(commitments(ctx, added.id).isEmpty)
        #expect(!pending(ctx).contains { $0.recordId == added.id })
        #expect(pending(ctx).isEmpty)

        // A year goal's area this writer made goes with it.
        let g = w.add(.goal(title: "Run a marathon", level: .year), kept: [health], focusArea: health.id)
        w.takeBack(g)
        #expect(goal(ctx, g.id) == nil)
        #expect(areas(ctx).isEmpty)
        #expect(pending(ctx).isEmpty)
    }

    @Test func pullUpThenPutBackRestoresTheLinks() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let year = w.add(.goal(title: "Run a marathon", level: .year), kept: [health], focusArea: health.id)
        let season = w.add(.goal(title: "Build to ten miles", level: .season), kept: [health],
                           parent: flag(year, "Run a marathon"))
        let month = w.add(.goal(title: "Run three times a week", level: .month), kept: [health],
                          parent: flag(season, "Build to ten miles"))
        try pushAll(ctx)

        w.pullUp(season.id, level: .season)
        #expect(task(ctx, season.id) == nil)
        #expect(task(ctx, month.id)?.sourceId == nil)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == season.id && $0.changeType == "delete" })

        w.putBack(season.id)
        let s = try #require(task(ctx, season.id))
        #expect(s.goalId == year.id)
        #expect(s.areaId == health.id)
        #expect(task(ctx, month.id)?.sourceId == season.id)
        #expect(!pending(ctx).contains { $0.recordId == season.id && $0.changeType == "delete" })
    }

    // MARK: Moving

    @Test func movingToADayKeepsTheWeek() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Book the boiler service", day: nil, at: nil, here: true))
        let thursday = day(2026, 11, 12)
        _ = try #require(w.move(added.id, to: thursday))
        let t = try #require(task(ctx, added.id))
        #expect(PlanCalendar.sameDay(t.scheduledFor, thursday))
        #expect(commitments(ctx, t.id).contains { $0.level == "week" && $0.status == "open" })
        #expect(focus(ctx).isEmpty)

        // Onto the real today ("Today" on the week), still not the first thing.
        let today = PlanCalendar.day(Date())
        _ = try #require(w.move(added.id, to: today))
        #expect(PlanCalendar.sameDay(task(ctx, added.id)?.scheduledFor, today))
        #expect(focus(ctx).isEmpty)
    }

    @Test func undoMovePutsItBack() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Book the boiler service", day: nil, at: nil, here: true))
        let snap = try #require(w.move(added.id, to: day(2026, 11, 12)))
        w.undoMove(snap)
        let t = try #require(task(ctx, added.id))
        #expect(t.scheduledFor == nil)
        #expect(t.bucket == "week")
    }

    @Test func anyDayClearsTheDay() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Call the vet", day: periods.today, at: nil, here: true))
        _ = try #require(w.move(added.id, to: nil))
        let t = try #require(task(ctx, added.id))
        #expect(t.scheduledFor == nil)
        #expect(t.bucket == "week")
        #expect(commitments(ctx, t.id).contains { $0.level == "week" && $0.status == "open" })
    }

    // MARK: Ticking, area, first thing

    @Test func tickingGoesThroughTheAppsOwnPath() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Call the vet", day: periods.today, at: nil, here: true))
        try pushAll(ctx)
        w.setDone(row(ctx, added.id), true, today: periods.today)
        let t = try #require(task(ctx, added.id))
        #expect(t.completed)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == t.id && $0.changeType == "update" })

        w.setDone(row(ctx, added.id), false, today: periods.today)
        #expect(task(ctx, added.id)?.completed == false)
    }

    @Test func aChangeOfAreaFilesItElsewhere() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let g = w.add(.goal(title: "Run a marathon", level: .year), kept: [health, home], focusArea: health.id)
        w.setArea(g.id, level: .year, to: home)
        #expect(goal(ctx, g.id)?.areaId == home.id)
        // Health was made by this writer and now holds nothing; Home was made for the move.
        #expect(areas(ctx).map(\.id) == [home.id])
        w.setArea(g.id, level: .year, to: health)
        #expect(goal(ctx, g.id)?.areaId == health.id)
        #expect(areas(ctx).map(\.id) == [health.id])
    }

    @Test func theFirstThingIsMarkedAndMoved() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let a = w.add(.task(title: "Call the vet", day: periods.today, at: nil, here: true))
        let b = w.add(.task(title: "Water the plants", day: periods.today, at: nil, here: true))
        w.setFirst(a.id, previous: nil)
        #expect(focus(ctx).map(\.taskId) == [a.id])
        w.setFirst(b.id, previous: a.id)
        #expect(focus(ctx).map(\.taskId) == [b.id])
        w.setFirst(nil, previous: b.id)
        #expect(focus(ctx).isEmpty)
    }

    @Test func someoneElsesRowIsNeverTouched() throws {
        let ctx = try walkTestContext()
        let theirs = SymphonyTask(userId: other, title: "Their errand", scheduledFor: periods.today, context: "personal")
        theirs.bucket = "timed"
        theirs.isAllDay = true
        ctx.insert(theirs)
        let theirGoal = Goal(id: UUID(), userId: other, name: "Their goal", year: periods.year)
        ctx.insert(theirGoal)
        try ctx.save()
        try pushAll(ctx)
        let w = writer(ctx)

        w.setDone(DailyDay.Row(id: theirs.id, title: theirs.title, forGoal: nil, done: false, first: false), true,
                  today: periods.today)
        #expect(w.move(theirs.id, to: day(2026, 11, 12)) == nil)
        #expect(w.move(theirs.id, to: nil) == nil)
        w.pullUp(theirs.id, level: .week)
        w.pullUp(theirGoal.id, level: .year)
        w.setArea(theirs.id, level: .week, to: health)
        w.setArea(theirGoal.id, level: .year, to: health)
        w.setFirst(theirs.id, previous: nil)

        let t = try #require(task(ctx, theirs.id))
        #expect(t.completed == false)
        #expect(PlanCalendar.sameDay(t.scheduledFor, periods.today))
        #expect(t.bucket == "timed")
        #expect(t.areaId == nil)
        #expect(goal(ctx, theirGoal.id)?.areaId == nil)
        #expect(focus(ctx).isEmpty)
        #expect(areas(ctx).isEmpty)
        #expect(pending(ctx).isEmpty)
    }

    @Test func nothingTheWalkNeverSends() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let year = w.add(.goal(title: "Run a marathon", level: .year), kept: [health], focusArea: health.id)
        let season = w.add(.goal(title: "Build to ten miles", level: .season), kept: [health],
                           parent: flag(year, "Run a marathon"))
        _ = w.add(.goal(title: "Run three times a week", level: .month), kept: [health],
                  parent: flag(season, "Build to ten miles"))
        _ = w.add(.task(title: "Call the vet", day: periods.today, at: nil, here: true))
        _ = w.add(.task(title: "Dentist", day: day(2026, 11, 12), at: day(2026, 11, 12, 15), here: false))
        _ = w.add(.task(title: "Book the boiler service", day: nil, at: nil, here: true))
        let made = tasks(ctx)
        #expect(made.count == 5)
        for t in made {
            #expect(t.isGoal == false)
            #expect(t.goalTaskId == nil)
            #expect(t.context == "personal")
            #expect(t.userId == me)
        }
    }
}
#endif
