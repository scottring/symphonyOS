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
        // The writer's own week (8 to 14 November), stamp and commitment both.
        #expect(t.weekStart.map { PlanCalendar.sameDay($0, periods.weekStart) } == true)
        #expect(PlanCalendar.sameDay(periods.weekStart, day(2026, 11, 8)))
        #expect(commitments(ctx, t.id).contains {
            $0.level == "week" && $0.status == "open" && PlanCalendar.sameDay($0.periodStart, periods.weekStart)
        })
    }

    /// Final review C1: Week on next week hands the writer that week's periods, and a task with no day
    /// is filed there: stamp and commitment on 15 November, never the week that is ending.
    @Test func aTaskWithNoDayIsFiledIntoTheWeekItIsGiven() throws {
        let ctx = try walkTestContext()
        let next = day(2026, 11, 15)
        let added = writer(ctx).add(.task(title: "Buy paint", day: nil, at: nil, here: true),
                                    periods: WalkPeriods.pick(now: next))
        let t = try #require(task(ctx, added.id))
        #expect(t.scheduledFor == nil)
        #expect(t.bucket == "week")
        #expect(t.weekStart.map { PlanCalendar.sameDay($0, next) } == true)
        let week = commitments(ctx, t.id).filter { $0.level == "week" }
        #expect(week.count == 1)
        #expect(week.first.map { PlanCalendar.sameDay($0.periodStart, next) } == true)
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

    /// F2: a goal from the bar on the Year page goes under the area the page stands in, whatever its words.
    @Test func aYearGoalFromTheBarGoesWhereThePageStands() throws {
        let ctx = try walkTestContext()
        let added = writer(ctx).add(.goal(title: "Run a marathon", level: .year), kept: [health, home], focusArea: home.id)
        let g = try #require(goal(ctx, added.id))
        #expect(added.level == .year)
        #expect(added.areaId == home.id)
        #expect(g.areaId == home.id)
        #expect(g.year == periods.year)
        #expect(g.context == "personal")
        #expect(areas(ctx).contains { $0.id == home.id && $0.userId == me })
        // Standing nowhere (no area kept), it has none.
        let loose = writer(ctx).add(.goal(title: "Run a marathon", level: .year), kept: [], focusArea: nil)
        #expect(loose.areaId == nil)
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
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == m.id && $0.changeType == "update" })
        #expect(m.monthStart.map { PlanCalendar.sameDay($0, periods.monthStart) } == true)
    }

    /// Fix round 1: the parent's area is its stored row's, not what the caller passed.
    @Test func aParentLendsItsStoredArea() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let year = w.add(.goal(title: "Run a marathon", level: .year), kept: [health, home], focusArea: health.id)
        var told = flag(year, "Run a marathon")
        told.areaId = home.id
        let season = w.add(.goal(title: "Build to ten miles", level: .season), kept: [health, home], parent: told)
        #expect(season.areaId == health.id)
        #expect(task(ctx, season.id)?.areaId == health.id)
        #expect(task(ctx, season.id)?.goalId == year.id)
    }

    /// Fix round 1: a parent that is not mine (anyone else's, or mine in a family
    /// life area) is no parent: no link to it, and no area (words never place a goal).
    @Test func aParentThatIsNotMineIsNoParent() throws {
        let ctx = try walkTestContext()
        let theirs = SymphonyTask(userId: other, title: "Their season goal", scheduledFor: nil, context: "personal")
        theirs.areaId = health.id
        ctx.insert(theirs)
        let family = SymphonyTask(userId: me, title: "Our season goal", scheduledFor: nil, context: "family")
        family.areaId = health.id
        ctx.insert(family)
        try ctx.save()
        let w = writer(ctx)
        for parent in [theirs, family] {
            let flag = WalkItem(id: parent.id, level: .season, title: parent.title, areaId: health.id)
            let added = w.add(.goal(title: "Fix the garden fence", level: .month), kept: [health, home], parent: flag)
            let t = try #require(task(ctx, added.id))
            #expect(t.sourceId == nil)
            #expect(t.goalId == nil)
            #expect(added.areaId == nil)
        }
    }

    /// Fix round 1, finding B: a writer made yesterday, used for a time said for the
    /// real today (past midnight, a time-zone change), still leaves no first-thing mark.
    @Test func aTimedAddFromYesterdaysWriterIsNotTheFirstThing() throws {
        let ctx = try walkTestContext()
        let realToday = PlanCalendar.day(Date())
        let yesterday = WalkPeriods.pick(now: PlanCalendar.addDays(realToday, -1))
        let at = try #require(PlanCalendar.calendar.date(bySettingHour: 15, minute: 0, second: 0, of: realToday))
        let added = writer(ctx, periods: yesterday).add(.task(title: "Dentist", day: realToday, at: at, here: true))
        #expect(PlanCalendar.sameDay(task(ctx, added.id)?.scheduledFor, realToday))
        #expect(focus(ctx).isEmpty)
        #expect(!pending(ctx).contains { $0.tableName == "task_focus" })
    }

    /// F2: below Year a goal takes its parent's area; with no parent it has none, whatever its words.
    @Test func aGoalWithNoParentHasNoArea() throws {
        let ctx = try walkTestContext()
        let added = writer(ctx).add(.goal(title: "Fix the garden fence", level: .month), kept: [health, home],
                                    focusArea: health.id)
        #expect(added.areaId == nil)
        #expect(task(ctx, added.id)?.areaId == nil)
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

        // Take-back stays on the long-lived writer, and so does the area it made. Only a delete of the
        // row is left queued (final review I2: its insert may already have been on the wire).
        w.takeBack(added)
        #expect(task(ctx, added.id) == nil)
        #expect(areas(ctx).isEmpty)
        #expect(onlyADelete(ctx, of: added.id, in: "tasks"))

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
        // Its insert, commitments and focus never go up; one delete is queued in case the insert was on the wire.
        #expect(onlyADelete(ctx, of: added.id, in: "tasks"))

        // A year goal's area this writer made goes with it.
        for c in pending(ctx) { ctx.delete(c) }
        let g = w.add(.goal(title: "Run a marathon", level: .year), kept: [health], focusArea: health.id)
        w.takeBack(g)
        #expect(goal(ctx, g.id) == nil)
        #expect(areas(ctx).isEmpty)
        #expect(onlyADelete(ctx, of: g.id, in: "goals"))
    }

    /// The only change queued is one delete of this row, in this table.
    private func onlyADelete(_ ctx: ModelContext, of id: UUID, in table: String) -> Bool {
        let queued = pending(ctx)
        return queued.count == 1 && queued[0].tableName == table && queued[0].recordId == id && queued[0].changeType == "delete"
    }

    /// Final review I2: Undo of an add is tapped while its insert is being pushed (the change is
    /// still queued, so the writer drops it, but the request is already on the wire). A delete is
    /// queued, so the row comes off the server and its realtime echo cannot bring it back.
    @Test func undoOfAnAddInFlightQueuesADelete() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Book the plumber", day: nil, at: nil, here: true))
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == added.id && $0.changeType == "insert" })
        w.takeBack(added)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == added.id && $0.changeType == "delete" })
        #expect(!pending(ctx).contains { $0.recordId == added.id && $0.changeType == "insert" })
    }

    /// The same for a pull-up written while the row's insert is still queued (added a moment ago).
    @Test func aPullUpOfARowInFlightQueuesADelete() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Book the plumber", day: periods.today, at: nil, here: true))
        let g = w.add(.goal(title: "Run a marathon", level: .year), kept: [health], focusArea: health.id)
        w.pullUp(added.id, level: .week)
        w.pullUp(g.id, level: .year)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == added.id && $0.changeType == "delete" })
        #expect(pending(ctx).contains { $0.tableName == "goals" && $0.recordId == g.id && $0.changeType == "delete" })
        #expect(!pending(ctx).contains { [added.id, g.id].contains($0.recordId) && $0.changeType == "insert" })
    }

    /// After the insert reached the server, Undo still queues exactly one delete.
    @Test func undoOfAnAddAfterThePushQueuesOneDelete() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Book the plumber", day: nil, at: nil, here: true))
        try pushAll(ctx)
        w.takeBack(added)
        #expect(pending(ctx).filter { $0.tableName == "tasks" && $0.recordId == added.id && $0.changeType == "delete" }.count == 1)
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
        #expect(t.bucket == "timed")
        #expect(t.isAllDay)
        #expect(t.weekStart.map { PlanCalendar.sameDay($0, PlanCalendar.weekStart(thursday)) } == true)
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
        #expect(t.isAllDay == false)
        #expect(t.weekStart.map { PlanCalendar.sameDay($0, periods.weekStart) } == true)
        #expect(commitments(ctx, t.id).filter { $0.level == "week" && $0.status == "open" }.count == 1)
    }

    @Test func undoMoveRefusesARowNotMine() throws {
        let ctx = try walkTestContext()
        let theirs = SymphonyTask(userId: other, title: "Their errand", scheduledFor: periods.today, context: "personal")
        theirs.bucket = "timed"
        theirs.isAllDay = true
        ctx.insert(theirs)
        try ctx.save()
        // Their own writer moves it; ours is handed that snapshot.
        let snap = PlanWriter(context: ctx, userId: other).planTask(theirs, on: day(2026, 11, 12), focusToday: false)
        try pushAll(ctx)
        writer(ctx).undoMove(snap)
        #expect(PlanCalendar.sameDay(task(ctx, theirs.id)?.scheduledFor, day(2026, 11, 12)))
        #expect(pending(ctx).isEmpty)
    }

    @Test func takeBackRefusesARowNotMine() throws {
        let ctx = try walkTestContext()
        let theirs = SymphonyTask(userId: other, title: "Their errand", scheduledFor: periods.today, context: "personal")
        ctx.insert(theirs)
        try ctx.save()
        try pushAll(ctx)
        writer(ctx).takeBack(DailyWriter.Added(id: theirs.id, level: .week, areaId: nil))
        #expect(task(ctx, theirs.id) != nil)
        #expect(pending(ctx).isEmpty)
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

    /// Ruling D13: a move from a light page writes the page's own week (the writer's `periods`, never
    /// the wall clock) and never adds to `deferCount`. The periods here are pinned to a week that is
    /// not the real clock's, so a write through `Date()` would land somewhere else.
    private let away = WalkPeriods.pick(now: day(2027, 3, 10))

    /// An open task left on a day of an earlier week, as Week's fold shows it.
    private func leftBehind(_ ctx: ModelContext, on periods: WalkPeriods) throws -> SymphonyTask {
        let left = SymphonyTask(userId: me, title: "Send the deposit",
                                scheduledFor: PlanCalendar.addDays(periods.weekStart, -4), context: "personal")
        left.bucket = "timed"
        left.isAllDay = true
        left.weekStart = PlanCalendar.weekStart(PlanCalendar.addDays(periods.weekStart, -4))
        left.deferCount = 2
        ctx.insert(left)
        try ctx.save()
        return left
    }

    private struct Placed: Equatable {
        let scheduledFor: Date?, weekStart: Date?, bucket: String?, deferCount: Int, commitments: Int
    }

    private func placed(_ ctx: ModelContext, _ id: UUID) -> Placed {
        let t = task(ctx, id)!
        return Placed(scheduledFor: t.scheduledFor, weekStart: t.weekStart, bucket: t.bucket, deferCount: t.deferCount,
                      commitments: commitments(ctx, id).count)
    }

    /// Sent to Any day from the fold, it comes onto the page's week with no day: not back onto the
    /// week it was left on, not onto the wall clock's week, and nothing counts the carry.
    @Test func anEarlierTaskSentToAnyDayComesOntoThePagesWeek() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx, periods: away)
        let left = try leftBehind(ctx, on: away)
        let before = placed(ctx, left.id)

        let snap = try #require(w.move(left.id, to: nil))
        let t = try #require(task(ctx, left.id))
        #expect(t.scheduledFor == nil)
        #expect(t.weekStart.map { PlanCalendar.sameDay($0, away.weekStart) } == true)
        #expect(t.deferCount == 2)
        #expect(commitments(ctx, t.id).contains { $0.level == "week" && $0.status == "open"
                                                  && PlanCalendar.sameDay($0.periodStart, away.weekStart) })
        let week = DailyWeek.make(tasks: tasks(ctx), goals: [], commitments: (try? ctx.fetch(FetchDescriptor<TaskCommitment>())) ?? [],
                                  focus: [], events: { _ in [] }, weekStart: away.weekStart, today: away.today, me: me)
        #expect(week.days.last?.date == nil)
        #expect(week.days.last?.lines.contains { $0.id == "task:\(left.id.uuidString.lowercased())" } == true)
        #expect(week.past?.earlier.contains { $0.id == left.id } != true)

        // Undo puts back every field the move touched, and leaves no commitment behind.
        w.undoMove(snap)
        #expect(placed(ctx, left.id) == before)
    }

    /// Sent to a day of the page's week from the fold: on that day, its week the page's, nothing counted.
    @Test func anEarlierTaskSentToADayStaysOnThePagesWeek() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx, periods: away)
        let left = try leftBehind(ctx, on: away)
        let before = placed(ctx, left.id)
        let thursday = PlanCalendar.addDays(away.weekStart, 4)

        let snap = try #require(w.move(left.id, to: thursday))
        let t = try #require(task(ctx, left.id))
        #expect(PlanCalendar.sameDay(t.scheduledFor, thursday))
        #expect(t.weekStart.map { PlanCalendar.sameDay($0, away.weekStart) } == true)
        #expect(t.deferCount == 2)

        w.undoMove(snap)
        #expect(placed(ctx, left.id) == before)
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
        #expect(t.completedAt != nil)                   // stamped on completion, as the app's own path does
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == t.id && $0.changeType == "update" })

        try pushAll(ctx)
        w.setDone(row(ctx, added.id), false, today: periods.today)
        #expect(task(ctx, added.id)?.completed == false)
        #expect(task(ctx, added.id)?.completedAt == nil)
        #expect(pending(ctx).contains { $0.tableName == "tasks" && $0.recordId == added.id && $0.changeType == "update" })
    }

    /// Fix round 1: an id named on the wrong level makes no area and changes nothing.
    @Test func aChangeOfAreaChecksTheLevelFirst() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let added = w.add(.task(title: "Call the vet", day: periods.today, at: nil, here: true))
        try pushAll(ctx)
        w.setArea(added.id, level: .year, to: health)
        #expect(task(ctx, added.id)?.areaId == nil)
        #expect(areas(ctx).isEmpty)
        #expect(pending(ctx).isEmpty)
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

    /// Final review I1: a second "chosen for today" row of mine (an Inbox item sent to Today, a row
    /// made on the web) is read as first if it is older. Marking a row first leaves exactly one of my
    /// rows for today, its own; marking it not first leaves none.
    @Test func theFirstThingLeavesExactlyOneFocusRow() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let a = w.add(.task(title: "Call the vet", day: periods.today, at: nil, here: true))
        let b = w.add(.task(title: "Water the plants", day: periods.today, at: nil, here: true))
        let c = w.add(.task(title: "Post the parcel", day: periods.today, at: nil, here: true))
        // Two rows already there, B's the older: B reads as first though nobody chose it here.
        let older = TaskFocus(taskId: b.id, userId: me, date: periods.today)
        older.createdAt = Date(timeIntervalSinceNow: -3600)
        ctx.insert(older)
        ctx.insert(TaskFocus(taskId: a.id, userId: me, date: periods.today))
        // Someone else's row on that day is not mine to touch.
        let theirs = TaskFocus(taskId: c.id, userId: other, date: periods.today)
        ctx.insert(theirs)
        try ctx.save()
        try pushAll(ctx)
        let mineToday = { self.focus(ctx).filter { $0.userId == self.me } }
        #expect(DailyDay.firstThing(focus: focus(ctx), tasks: tasks(ctx), today: periods.today, me: me) == b.id)

        w.setFirst(c.id, previous: a.id)
        #expect(mineToday().map(\.taskId) == [c.id])
        #expect(DailyDay.firstThing(focus: focus(ctx), tasks: tasks(ctx), today: periods.today, me: me) == c.id)
        #expect(focus(ctx).contains { $0.id == theirs.id })
        // Each removed row goes from the server too.
        #expect(pending(ctx).filter { $0.tableName == "task_focus" && $0.changeType == "delete" }.count == 2)

        w.setFirst(nil, previous: c.id)
        #expect(mineToday().isEmpty)
        #expect(DailyDay.firstThing(focus: focus(ctx), tasks: tasks(ctx), today: periods.today, me: me) == nil)
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

    /// Fix round 1: my own row in a family life area is refused like anyone else's.
    @Test func myRowInAFamilyAreaIsNeverTouched() throws {
        let ctx = try walkTestContext()
        let ours = SymphonyTask(userId: me, title: "Our errand", scheduledFor: periods.today, context: "family")
        ours.bucket = "timed"
        ours.isAllDay = true
        ctx.insert(ours)
        let ourGoal = Goal(id: UUID(), userId: me, name: "Our goal", year: periods.year)
        ourGoal.context = "family"
        ctx.insert(ourGoal)
        try ctx.save()
        try pushAll(ctx)
        let w = writer(ctx)

        w.setDone(DailyDay.Row(id: ours.id, title: ours.title, forGoal: nil, done: false, first: false), true,
                  today: periods.today)
        #expect(w.move(ours.id, to: day(2026, 11, 12)) == nil)
        #expect(w.move(ours.id, to: nil) == nil)
        w.pullUp(ours.id, level: .week)
        w.pullUp(ourGoal.id, level: .year)
        w.setArea(ours.id, level: .week, to: health)
        w.setArea(ourGoal.id, level: .year, to: health)
        w.setFirst(ours.id, previous: nil)
        w.takeBack(DailyWriter.Added(id: ours.id, level: .week, areaId: nil))

        let t = try #require(task(ctx, ours.id))
        #expect(t.completed == false)
        #expect(PlanCalendar.sameDay(t.scheduledFor, periods.today))
        #expect(t.bucket == "timed")
        #expect(t.areaId == nil)
        #expect(goal(ctx, ourGoal.id)?.areaId == nil)
        #expect(focus(ctx).isEmpty)
        #expect(areas(ctx).isEmpty)
        #expect(pending(ctx).isEmpty)
    }

    @Test func canPullUpOnlyWhatIsMineOnItsLevel() throws {
        let ctx = try walkTestContext()
        let w = writer(ctx)
        let mine = w.add(.task(title: "Call the vet", day: periods.today, at: nil, here: true))
        let g = w.add(.goal(title: "Run a marathon", level: .year), kept: [health], focusArea: health.id)
        let theirs = SymphonyTask(userId: other, title: "Their errand", scheduledFor: periods.today, context: "personal")
        let ours = SymphonyTask(userId: me, title: "Our errand", scheduledFor: periods.today, context: "family")
        ctx.insert(theirs)
        ctx.insert(ours)
        try ctx.save()
        #expect(w.canPullUp(mine.id, level: .week))
        #expect(w.canPullUp(g.id, level: .year))
        #expect(!w.canPullUp(mine.id, level: .year))
        #expect(!w.canPullUp(g.id, level: .week))
        #expect(!w.canPullUp(theirs.id, level: .week))
        #expect(!w.canPullUp(ours.id, level: .week))
        #expect(!w.canPullUp(UUID(), level: .week))
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

/// Final review I1: the Inbox sends an item to Today through `TriageController`, which the full app
/// shares. Only the light edition (an assumed life area) takes the light move: a plain day today, no
/// deferral counted (ruling D13), never the first thing unasked. A full household's is as it was.
@MainActor
struct LightTriageTests {
    let me = UUID()

    private func inboxTask(_ ctx: ModelContext, _ title: String, context: String? = "personal") throws -> SymphonyTask {
        let t = SymphonyTask(userId: me, title: title, context: context)
        ctx.insert(t)
        try ctx.save()
        return t
    }

    private func focus(_ ctx: ModelContext) -> [TaskFocus] { (try? ctx.fetch(FetchDescriptor<TaskFocus>())) ?? [] }

    @Test func lightTodayFromTheInboxIsNotFirstAndCountsNoDeferral() throws {
        let ctx = try walkTestContext()
        let a = try inboxTask(ctx, "Renew the passport")
        let b = try inboxTask(ctx, "Order the logs", context: nil)
        let triage = TriageController()
        triage.request([a], to: .today, context: ctx, userId: me, members: [], assumedLifeArea: "personal")
        triage.request([b], to: .today, context: ctx, userId: me, members: [], assumedLifeArea: "personal")
        let today = PlanCalendar.day(Date())
        for t in [a, b] {
            #expect(PlanCalendar.sameDay(t.scheduledFor, today))
            #expect(t.isAllDay)
            #expect(t.deferCount == 0)
            #expect(t.context == "personal")
        }
        #expect(focus(ctx).isEmpty)
        #expect(DailyDay.firstThing(focus: focus(ctx), tasks: [a, b], today: today, me: me) == nil)
        #expect(triage.toast?.message == "Moved “Order the logs” to Today")
        // Undo puts it back where it was.
        triage.undo(context: ctx, userId: me)
        #expect(b.scheduledFor == nil)
        #expect(b.deferCount == 0)
    }

    @Test func aFullHouseholdsTodayFromTheInboxIsUnchanged() throws {
        let ctx = try walkTestContext()
        let a = try inboxTask(ctx, "Renew the passport")
        let triage = TriageController()
        triage.request([a], to: .today, context: ctx, userId: me, members: [], assumedLifeArea: nil)
        #expect(PlanCalendar.sameDay(a.scheduledFor, PlanCalendar.day(Date())))
        #expect(a.deferCount == 1)
        #expect(focus(ctx).map(\.taskId) == [a.id])
    }

    @Test func onlyTodayTakesTheLightMove() {
        let now = Date()
        #expect(TriageController.lightMove(.today, now: now) == .day(PlanCalendar.day(now), allDay: true))
        #expect(TriageController.lightMove(.thisWeek, now: now) == nil)
        #expect(TriageController.lightMove(.someday, now: now) == nil)
        #expect(TriageController.lightMove(.day(now, allDay: false), now: now) == nil)
    }
}
#endif
