#if os(iOS)
import Testing
import Foundation
import SwiftData
@testable import Symphony

// The one model the light pages read: it runs the bar's reducer and carries out
// what it asks for (the listener, the writer, the timers), keeps the one last
// change Undo can take back, and reads the day again when the app comes back.

private func day(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
}

/// What time the model thinks it is; a test moves it.
@MainActor final class DailyTestClock {
    var now: Date
    init(_ now: Date) { self.now = now }
}

@MainActor
struct DailyModelTests {
    let me = UUID()
    let scheduler = ManualWalkScheduler()
    let listener = FakeWalkListener()
    /// Tuesday 10 November 2026, at noon.
    let clock = DailyTestClock(day(2026, 11, 10, 12))
    let today = day(2026, 11, 10)
    let health = WalkArea(id: UUID(), name: "Health")
    let home = WalkArea(id: UUID(), name: "Home")

    /// A stand-in parser that finds no day: nothing depends on the real one.
    private static let noDate: (String) -> CaptureParser.Result = {
        CaptureParser.Result(title: $0, date: nil, hasTime: false)
    }

    private func memory() -> SignpostMemory {
        SignpostMemory(defaults: UserDefaults(suiteName: "DailyModelTests.\(UUID())")!)
    }

    private func model(_ ctx: ModelContext, memory: SignpostMemory? = nil,
                       parse: @escaping (String) -> CaptureParser.Result = DailyModelTests.noDate) -> DailyModel {
        DailyModel(context: ctx, userId: me, clock: { [clock] in clock.now }, scheduler: scheduler,
                   listener: listener, memory: memory ?? self.memory(), parse: parse)
    }

    private func tasks(_ ctx: ModelContext) -> [SymphonyTask] {
        (try? ctx.fetch(FetchDescriptor<SymphonyTask>())) ?? []
    }

    private func task(_ ctx: ModelContext, titled title: String) -> SymphonyTask? {
        tasks(ctx).first { $0.title == title }
    }

    private func type(_ m: DailyModel, _ words: String) {
        m.send(.typed(words))
        m.send(.submitted)
    }

    private func row(_ t: SymphonyTask) -> DailyDay.Row {
        DailyDay.Row(id: t.id, title: t.title, forGoal: nil, done: t.completed, first: false)
    }

    // MARK: Adding

    @Test func speakingAddsATaskToday() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        #expect(listener.starts == 1)
        listener.hear("Call the plumber about the leak")
        m.send(.micTapped)
        #expect(listener.finishes == 1)
        #expect(tasks(ctx).isEmpty)                    // the last words are waited for
        listener.end()

        let made = tasks(ctx)
        #expect(made.count == 1)
        let t = try #require(made.first)
        #expect(t.title == "Call the plumber about the leak")
        #expect(t.userId == me)
        #expect(PlanCalendar.sameDay(t.scheduledFor, today))
        #expect(m.bar.undoShowing)
        #expect(m.bar.note == nil)
        #expect(m.bar.mic == .idle)
        #expect(m.bar.draft == "")
    }

    @Test func theLastWordsAreAddedWhenTheWaitRunsOut() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        listener.hear("Book the boiler service")
        m.send(.micTapped)
        scheduler.advance(WalkOrb.finishMs)
        #expect(task(ctx, titled: "Book the boiler service") != nil)
        #expect(listener.stops == 1)
        listener.end()                                 // a late end from that session adds nothing more
        #expect(tasks(ctx).count == 1)
    }

    @Test func aTapThatHearsNothingAddsNothing() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        m.send(.micTapped)
        listener.end()
        #expect(tasks(ctx).isEmpty)
        #expect(m.bar.note == WalkCopy.nothingHeard)
        #expect(m.bar.fieldAsked == 1)
        #expect(!m.bar.undoShowing)
        scheduler.advance(WalkState.noteMs)
        #expect(m.bar.note == nil)
    }

    @Test func aRefusedMicrophoneTypesFromThenOn() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        listener.problemOnStart = "Allow the microphone in Settings to speak — or type it."
        m.send(.micTapped)
        await scheduler.settle()
        #expect(m.bar.speechOff)
        #expect(m.bar.mic == .idle)
        #expect(m.bar.note == WalkCopy.speechOff)
        #expect(m.bar.fieldAsked == 1)

        m.send(.micTapped)
        await scheduler.settle()
        #expect(listener.starts == 1)                  // never asked again
        #expect(m.bar.fieldAsked == 2)                 // the light opens the field
        type(m, "Call the vet")
        #expect(task(ctx, titled: "Call the vet") != nil)
    }

    @Test func anAddElsewhereSaysWhere() throws {
        let ctx = try walkTestContext()
        let m = model(ctx, parse: { _ in CaptureParser.Result(title: "Dentist", date: day(2026, 11, 20, 12), hasTime: false) })
        type(m, "Dentist on the 20th")
        let t = try #require(task(ctx, titled: "Dentist"))
        #expect(PlanCalendar.sameDay(t.scheduledFor, day(2026, 11, 20)))
        #expect(m.bar.note == DailyCopy.itsOn(day(2026, 11, 20), today: today))
        #expect(m.bar.undoShowing)
        scheduler.advance(WalkState.noteMs)
        #expect(m.bar.note == nil)
        #expect(m.bar.undoShowing)
    }

    // MARK: Week on another week (final review C1)

    /// Saturday 14 November, the week's last day: the "Tomorrow" sign opens Week on next week
    /// (15 to 21 November). A task said there with no day is filed into THAT week (stamp and
    /// commitment), stands on the page, says nothing (it is here), and Undo takes it back.
    @Test func aTaskWithNoDayOnNextWeeksPageIsFiledThere() throws {
        let ctx = try walkTestContext()
        clock.now = day(2026, 11, 14, 12)
        let next = day(2026, 11, 15)
        let m = model(ctx)
        m.page = .week
        m.week = next
        type(m, "Buy paint")

        let t = try #require(task(ctx, titled: "Buy paint"))
        #expect(t.scheduledFor == nil)
        #expect(t.weekStart.map { PlanCalendar.sameDay($0, next) } == true)
        let week = ((try? ctx.fetch(FetchDescriptor<TaskCommitment>())) ?? []).filter { $0.taskId == t.id && $0.level == "week" }
        #expect(week.count == 1)
        #expect(week.first.map { PlanCalendar.sameDay($0.periodStart, next) } == true)
        #expect(m.bar.note == nil)
        #expect(m.bar.undoShowing)
        #expect(m.reveal?.id == t.id)

        // On the page it was added from: next week's Any day.
        let page = DailyWeek.make(tasks: tasks(ctx), goals: [], commitments: (try? ctx.fetch(FetchDescriptor<TaskCommitment>())) ?? [],
                                  focus: [], events: { _ in [] }, weekStart: next, today: m.today, me: me)
        #expect(page.days.contains { $0.date == nil && $0.lines.contains { if case .task(let r) = $0 { r.id == t.id } else { false } } })

        m.send(.undoTapped)
        #expect(task(ctx, titled: "Buy paint") == nil)
    }

    /// On next week's page a day said inside it lands there with no note; a day said off the page
    /// (today) lands on today and says where it went.
    @Test func aDaySaidOnAnotherWeeksPageSaysSoOnlyWhenItIsOffThePage() throws {
        let ctx = try walkTestContext()
        clock.now = day(2026, 11, 14, 12)
        var answer = CaptureParser.Result(title: "Bins", date: day(2026, 11, 17, 12), hasTime: false)
        let m = model(ctx, parse: { _ in answer })
        m.page = .week
        m.week = day(2026, 11, 15)
        type(m, "Bins Tuesday")
        let bins = try #require(task(ctx, titled: "Bins"))
        #expect(PlanCalendar.sameDay(bins.scheduledFor, day(2026, 11, 17)))
        #expect(m.bar.note == nil)

        answer = CaptureParser.Result(title: "Call mum", date: day(2026, 11, 14, 12), hasTime: false)
        type(m, "Call mum today")
        let call = try #require(task(ctx, titled: "Call mum"))
        #expect(PlanCalendar.sameDay(call.scheduledFor, day(2026, 11, 14)))
        #expect(m.bar.note == DailyCopy.itsOn(day(2026, 11, 14), today: m.today))
    }

    /// The week Week shows is read only on Week: Today's bar files into the clock's week whatever
    /// week was last on Week.
    @Test func theWeekShownIsReadOnlyOnWeek() throws {
        let ctx = try walkTestContext()
        clock.now = day(2026, 11, 14, 12)
        let m = model(ctx, parse: { _ in CaptureParser.Result(title: "Buy milk", date: nil, hasTime: false) })
        m.week = day(2026, 11, 15)
        m.page = .today
        type(m, "Buy milk")
        let t = try #require(task(ctx, titled: "Buy milk"))
        #expect(PlanCalendar.sameDay(t.scheduledFor, day(2026, 11, 14)))
        #expect(t.weekStart.map { PlanCalendar.sameDay($0, day(2026, 11, 8)) } == true)
    }

    /// In the minute after midnight, before the minute tick reads the new day, an add lands on the new
    /// day, never yesterday's.
    @Test func anAddJustAfterMidnightLandsOnTheNewDay() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        clock.now = day(2026, 11, 11, 0).addingTimeInterval(20)
        type(m, "Feed the cat")
        let t = try #require(task(ctx, titled: "Feed the cat"))
        #expect(PlanCalendar.sameDay(t.scheduledFor, day(2026, 11, 11)))
        #expect(PlanCalendar.sameDay(m.today, day(2026, 11, 11)))
    }

    @Test func aGoalAddedFromAMountainPageHangsWhereThePageSays() throws {
        let ctx = try walkTestContext()
        // 28 November: the walk's own periods have moved on to December, but the page is November's.
        clock.now = day(2026, 11, 28, 12)
        let november = WalkPeriods.pick(now: day(2026, 11, 10))
        let plan = DailyWriter(context: ctx, userId: me, periods: november)
        let year = plan.add(.goal(title: "Run a marathon", level: .year), kept: [health], focusArea: health.id)
        let yearFlag = WalkItem(id: year.id, level: .year, title: "Run a marathon", areaId: health.id)
        let season = plan.add(.goal(title: "Build to ten miles", level: .season), kept: [health], parent: yearFlag)
        let seasonFlag = WalkItem(id: season.id, level: .season, title: "Build to ten miles", areaId: health.id,
                                  parentId: year.id)

        let m = model(ctx)
        #expect(PlanCalendar.sameDay(m.periods.monthStart, day(2026, 12, 1)))
        m.page = .goal(.month)
        m.hanging = (kept: [health, home], focusArea: nil, parent: seasonFlag, periods: november)
        type(m, "Run three times a week")

        let t = try #require(task(ctx, titled: "Run three times a week"))
        #expect(t.sourceId == season.id)
        #expect(t.goalId == year.id)
        #expect(t.areaId == health.id)
        #expect(t.monthStart.map { PlanCalendar.sameDay($0, day(2026, 11, 1)) } == true)
        #expect(m.bar.undoShowing)

        m.send(.undoTapped)
        #expect(task(ctx, titled: "Run three times a week") == nil)
        #expect(task(ctx, titled: "Build to ten miles") != nil)
    }

    // MARK: Undo

    @Test func undoTakesItBackAndOnlyIt() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Buy milk")
        type(m, "Call the vet")
        #expect(tasks(ctx).count == 2)
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Call the vet") == nil)
        #expect(task(ctx, titled: "Buy milk") != nil)
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)                            // only the last thing: nothing more goes
        #expect(task(ctx, titled: "Buy milk") != nil)
    }

    @Test func undoGoesAfterSevenSeconds() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Buy milk")
        scheduler.advance(WalkState.undoMs - 1)
        #expect(m.bar.undoShowing)
        scheduler.advance(1)
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Buy milk") != nil)
    }

    @Test func undoTakesBackAMoveOrAnArea() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Buy milk")
        let id = try #require(task(ctx, titled: "Buy milk")).id

        m.move(id, to: day(2026, 11, 12))
        #expect(PlanCalendar.sameDay(task(ctx, titled: "Buy milk")?.scheduledFor, day(2026, 11, 12)))
        #expect(m.bar.undoShowing)
        m.send(.undoTapped)
        #expect(PlanCalendar.sameDay(task(ctx, titled: "Buy milk")?.scheduledFor, today))

        m.setArea(id, level: .week, to: health, from: nil)
        #expect(task(ctx, titled: "Buy milk")?.areaId == health.id)
        m.setArea(id, level: .week, to: home, from: health.id)
        #expect(task(ctx, titled: "Buy milk")?.areaId == home.id)
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Buy milk")?.areaId == health.id)
    }

    /// The row the Undo on show would change, for the page to keep in sight above the bar: an added
    /// row and a moved one (named again when moved again), never a row being pulled up (hidden).
    @Test func undoNamesTheRowItWouldChange() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        #expect(m.reveal == nil)
        type(m, "Buy milk")
        let id = try #require(task(ctx, titled: "Buy milk")).id
        #expect(m.reveal?.id == id)
        let added = m.reveal

        m.move(id, to: day(2026, 11, 12))
        #expect(m.reveal?.id == id)
        let moved = m.reveal
        #expect(moved != added)
        m.move(id, to: day(2026, 11, 13))
        #expect(m.reveal?.id == id)
        #expect(m.reveal != moved)

        m.pullUp(id, level: .week)
        #expect(m.reveal == nil)
    }

    /// The page sets where the bar adds: on Week a task goes onto the week with no day; back on
    /// Today (which sets `.today` as it appears) the next one is today's again.
    @Test func theBarAddsToTodayAgainAfterAVisitToWeek() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.page = .week
        type(m, "Measure the window")
        let onWeek = try #require(task(ctx, titled: "Measure the window"))
        #expect(onWeek.scheduledFor == nil)
        m.page = .today
        type(m, "Buy milk")
        #expect(PlanCalendar.sameDay(task(ctx, titled: "Buy milk")?.scheduledFor, today))
    }

    // MARK: Pulling up: nothing is written while its Undo can be used

    private func pending(_ ctx: ModelContext) -> [PendingChange] {
        (try? ctx.fetch(FetchDescriptor<PendingChange>())) ?? []
    }

    /// An ordinary task, already on the server, with what the walk's writer does not know about.
    private func seededTask(_ ctx: ModelContext, _ title: String = "Call the plumber") throws -> SymphonyTask {
        let t = SymphonyTask(userId: me, title: title, scheduledFor: today, context: "personal")
        t.bucket = "today"
        t.isAllDay = true
        t.links = [TaskLink(url: "https://example.com/leak", title: "The leak")]
        t.phoneNumber = "555-0100"
        t.location = "12 Elm Street"
        t.notes = "Ask about the boiler too"
        t.syncStatus = .synced
        ctx.insert(t)
        try ctx.save()
        return t
    }

    private struct Stored: Equatable {
        let title: String, scheduledFor: Date?, bucket: String?, links: [TaskLink]?, phone: String?,
            location: String?, notes: String?, dismissedAt: Date?
        init(_ t: SymphonyTask) {
            title = t.title; scheduledFor = t.scheduledFor; bucket = t.bucket; links = t.links
            phone = t.phoneNumber; location = t.location; notes = t.notes; dismissedAt = t.dismissedAt
        }
    }

    private func deletes(_ ctx: ModelContext, _ id: UUID) -> Int {
        pending(ctx).filter { $0.tableName == "tasks" && $0.recordId == id && $0.changeType == "delete" }.count
    }

    @Test func aPulledUpRowIsHiddenAndUndoBringsItBackUntouched() throws {
        let ctx = try walkTestContext()
        let t = try seededTask(ctx)
        let before = Stored(t)
        let m = model(ctx)
        m.light(t.id)

        m.pullUp(t.id, level: .week)
        #expect(m.pulledUp == t.id)
        #expect(m.lit == nil)
        #expect(m.bar.undoShowing)
        #expect(pending(ctx).isEmpty)                  // nothing written
        #expect(task(ctx, titled: "Call the plumber") != nil)

        m.send(.undoTapped)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
        let back = try #require(task(ctx, titled: "Call the plumber"))
        #expect(back.id == t.id)
        #expect(Stored(back) == before)
        #expect(pending(ctx).isEmpty)

        // Long after, nothing more happens.
        scheduler.advance(WalkState.undoMs)
        #expect(task(ctx, titled: "Call the plumber") != nil)
        #expect(pending(ctx).isEmpty)
    }

    @Test func theWindowEndingWritesThePullUpOnce() throws {
        let ctx = try walkTestContext()
        let t = try seededTask(ctx)
        let m = model(ctx)
        m.pullUp(t.id, level: .week)
        scheduler.advance(WalkState.undoMs - 1)
        #expect(pending(ctx).isEmpty)
        scheduler.advance(1)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
        #expect(task(ctx, titled: "Call the plumber") == nil)
        #expect(deletes(ctx, t.id) == 1)

        // Undo after the window does nothing; a second pull-up of the same row writes nothing more.
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Call the plumber") == nil)
        m.pullUp(t.id, level: .week)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
        scheduler.advance(WalkState.undoMs)
        #expect(deletes(ctx, t.id) == 1)
    }

    @Test func aPullUpTheWriterWouldRefuseNeverHidesTheRow() throws {
        let ctx = try walkTestContext()
        let theirs = SymphonyTask(userId: UUID(), title: "Their errand", scheduledFor: today, context: "personal")
        let family = SymphonyTask(userId: me, title: "Our errand", scheduledFor: today, context: "family")
        ctx.insert(theirs)
        ctx.insert(family)
        try ctx.save()
        let m = model(ctx)
        for t in [theirs, family] {
            m.pullUp(t.id, level: .week)
            #expect(m.pulledUp == nil)
            #expect(!m.bar.undoShowing)
        }
        // On the wrong level, too.
        let mine = try seededTask(ctx)
        m.pullUp(mine.id, level: .year)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
        scheduler.advance(WalkState.undoMs)
        #expect(pending(ctx).isEmpty)
        #expect(tasks(ctx).count == 3)
    }

    @Test func anotherChangeWritesThePullUpItReplaces() throws {
        let ctx = try walkTestContext()
        let first = try seededTask(ctx, "Call the plumber")
        let second = try seededTask(ctx, "Water the plants")
        let m = model(ctx)
        m.pullUp(first.id, level: .week)
        m.pullUp(second.id, level: .week)
        #expect(deletes(ctx, first.id) == 1)
        #expect(deletes(ctx, second.id) == 0)
        #expect(m.pulledUp == second.id)

        // Undo now takes back only the second, and an add replaces nothing pending.
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Water the plants") != nil)
        #expect(deletes(ctx, second.id) == 0)

        m.pullUp(second.id, level: .week)
        type(m, "Buy milk")
        #expect(deletes(ctx, second.id) == 1)
        #expect(m.pulledUp == nil)
        m.send(.undoTapped)                            // takes back the add, not the pull-up
        #expect(task(ctx, titled: "Buy milk") == nil)
        #expect(task(ctx, titled: "Water the plants") == nil)
    }

    @Test func goingToTheBackgroundWritesThePullUp() throws {
        let ctx = try walkTestContext()
        let t = try seededTask(ctx)
        let m = model(ctx)
        m.pullUp(t.id, level: .week)
        m.send(.left)
        #expect(deletes(ctx, t.id) == 1)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Call the plumber") == nil)
    }

    @Test func closingWritesThePullUp() throws {
        let ctx = try walkTestContext()
        let t = try seededTask(ctx)
        let m = model(ctx)
        m.pullUp(t.id, level: .week)
        m.close()
        #expect(deletes(ctx, t.id) == 1)
    }

    @Test func aNewDayWritesThePullUpBeforeTheWriterIsRebuilt() throws {
        let ctx = try walkTestContext()
        let t = try seededTask(ctx)
        let m = model(ctx)
        var writtenBy: [WalkPeriods] = []
        m.onPullUpWritten = { _, periods in writtenBy.append(periods) }
        let yesterday = m.periods
        m.pullUp(t.id, level: .week)
        clock.now = day(2026, 11, 11, 8)
        m.refreshDay()
        #expect(writtenBy == [yesterday])               // by the writer of the day it was pulled up on
        #expect(m.periods != yesterday)
        #expect(deletes(ctx, t.id) == 1)
        #expect(task(ctx, titled: "Call the plumber") == nil)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
    }

    @Test func droppingTheModelWritesThePullUp() throws {
        let ctx = try walkTestContext()
        let t = try seededTask(ctx)
        do {
            let m = model(ctx)
            m.pullUp(t.id, level: .week)
            #expect(deletes(ctx, t.id) == 0)
        }
        #expect(deletes(ctx, t.id) == 1)
        #expect(task(ctx, titled: "Call the plumber") == nil)
    }

    // MARK: A tick or a first thing ends the Undo before it

    @Test func aTickEndsTheUndoBeforeIt() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Took my pills")
        let t = try #require(task(ctx, titled: "Took my pills"))
        #expect(m.bar.undoShowing)
        m.toggle(row(t))
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)
        let kept = try #require(task(ctx, titled: "Took my pills"))
        #expect(kept.completed)
    }

    @Test func aTickWritesAPendingPullUpOnce() throws {
        let ctx = try walkTestContext()
        let gone = try seededTask(ctx, "Call the plumber")
        let other = try seededTask(ctx, "Water the plants")
        let m = model(ctx)
        m.pullUp(gone.id, level: .week)
        m.toggle(row(other))
        #expect(deletes(ctx, gone.id) == 1)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)
        scheduler.advance(WalkState.undoMs)
        #expect(deletes(ctx, gone.id) == 1)
        #expect(task(ctx, titled: "Water the plants")?.completed == true)
    }

    @Test func aFirstThingEndsTheUndoBeforeIt() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Took my pills")
        let t = try #require(task(ctx, titled: "Took my pills"))
        m.setFirst(t.id, previous: nil)
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Took my pills") != nil)
        let focus = (try? ctx.fetch(FetchDescriptor<TaskFocus>())) ?? []
        #expect(focus.map(\.taskId) == [t.id])
    }

    @Test func aFirstThingWritesAPendingPullUpOnce() throws {
        let ctx = try walkTestContext()
        let gone = try seededTask(ctx, "Call the plumber")
        let other = try seededTask(ctx, "Water the plants")
        let m = model(ctx)
        m.pullUp(gone.id, level: .week)
        m.setFirst(other.id, previous: nil)
        #expect(deletes(ctx, gone.id) == 1)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)
        scheduler.advance(WalkState.undoMs)
        #expect(deletes(ctx, gone.id) == 1)
    }

    // MARK: Leaving stops the listener

    @Test func leavingStopsTheListener() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        m.send(.left)
        #expect(listener.stops == 1)
        #expect(m.bar.mic == .idle)
    }

    @Test func leavingWhileThePromptsAreUpStopsTheListener() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        listener.whileStarting = { [weak m] in m?.send(.left) }
        m.send(.micTapped)
        await scheduler.settle()
        #expect(listener.stops == 1)
        #expect(m.bar.mic == .idle)
        listener.hear("Too late")                      // nothing from that session reaches the bar
        #expect(m.bar.draft == "")
    }

    // MARK: Speech stays on the phone

    @Test func theBarListensOnThePhoneOnly() {
        let dictation = DailyModel.makeListener()
        #expect(dictation.onDeviceOnly == true)
        #expect(dictation.playsAlongside == false)
    }

    /// Review Focus 1 (pre-flight finding 19: the iOS half of `DailyGateTests.lightSpeechStaysOnThePhone`):
    /// the bar's listener is on the phone only, as a light household's Tell is.
    @Test func lightSpeechStaysOnThePhone() {
        #expect(DailyModel.makeListener().onDeviceOnly == true)
        #expect(DailyModel.makeListener().onDeviceOnly == DailyGate.speechOnPhoneOnly(edition: .light))
    }

    /// A Tell asked for from outside (the Lock Screen control, a `symphony://tell` link).
    private func asked(walkShowing: Bool = false) -> AppState {
        let app = AppState()
        app.tellRequested = true
        app.walkShowing = walkShowing
        return app
    }

    /// The Lock Screen control or a `symphony://tell` link on light Today: the bar starts
    /// listening if it is idle, the request is taken once, and a listen already going is never
    /// finished or restarted by another.
    @Test func aTellFromOutsideStartsTheBarListeningOnlyWhenIdle() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        let app = asked()
        app.dailyPanel = .more
        #expect(m.answerTell(app))
        await scheduler.settle()
        #expect(m.bar.mic == .listening)
        #expect(listener.starts == 1)
        #expect(!app.tellRequested)
        #expect(app.dailyPanel == nil)                  // nothing left over the listening bar

        app.tellRequested = true                        // asked again while it listens
        #expect(m.answerTell(app))
        await scheduler.settle()
        #expect(!app.tellRequested)
        #expect(m.bar.mic == .listening)
        #expect(listener.starts == 1)
        #expect(listener.finishes == 0)
    }

    /// With speech off the bar types: a Tell from outside asks for the field instead.
    @Test func aTellFromOutsideWithSpeechOffAsksForTheField() async throws {
        let ctx = try walkTestContext()
        listener.problemOnStart = "No speech here"
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        #expect(m.bar.speechOff)
        let fieldAsked = m.bar.fieldAsked
        #expect(m.answerTell(asked()))
        await scheduler.settle()
        #expect(m.bar.fieldAsked == fieldAsked + 1)
        #expect(listener.starts == 1)
    }

    /// Review finding: a Tell asked for while the walk shows never starts a microphone under it.
    /// It waits, untouched, and is answered exactly once when the walk closes.
    @Test func aTellDuringTheWalkWaitsAndIsAnsweredOnceAfterIt() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        let app = asked(walkShowing: true)
        #expect(!m.answerTell(app))
        #expect(!m.answerTell(app))                     // asked again by the page: still waiting
        await scheduler.settle()
        #expect(app.tellRequested)
        #expect(m.bar.mic == .idle)
        #expect(listener.starts == 0)

        app.walkShowing = false                         // the walk closes
        #expect(m.answerTell(app))
        await scheduler.settle()
        #expect(m.bar.mic == .listening)
        #expect(listener.starts == 1)
        #expect(!m.answerTell(app))                     // answered once: nothing left to answer
        await scheduler.settle()
        #expect(listener.starts == 1)
        #expect(listener.finishes == 0)
    }

    /// Task 15 fix round 1: a walk opening over a light page (a walk-down, the waiting line's
    /// resume, a walk from Settings) stops a listening bar: it is idle, its listener stopped, and
    /// nothing it heard is added, then or when the walk closes. The cold-launch case too: a Tell
    /// answered just before a resumed walk shows is stopped as the walk shows.
    @Test func aWalkShowingStopsTheBarAndAddsNothingItHeard() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        listener.hear("Call the plumber about the leak")
        m.walkShowingChanged(true)
        #expect(m.bar.mic == .idle)
        #expect(listener.stops == 1)
        listener.end()
        scheduler.advance(WalkOrb.finishMs + 1000)
        m.walkShowingChanged(false)
        #expect(tasks(ctx).isEmpty)
        #expect(m.bar.mic == .idle)

        // Cold launch: the Tell is taken before the walk shows, then the walk shows.
        let cold = model(try walkTestContext())
        let app = asked()
        #expect(cold.answerTell(app))
        await scheduler.settle()
        #expect(cold.bar.mic == .listening)
        app.walkShowing = true
        cold.walkShowingChanged(app.walkShowing)
        #expect(cold.bar.mic == .idle)
        #expect(listener.stops == 2)
        listener.hear("Book the dentist")
        #expect(cold.bar.draft == "")                     // nothing from that session reaches the bar

        // Closing the walk starts nothing.
        cold.walkShowingChanged(false)
        await scheduler.settle()
        #expect(cold.bar.mic == .idle)
        #expect(listener.starts == 2)
    }

    // MARK: The day, the sign, the lit row

    @Test func aNewDayIsReadWhenTheAppComesBack() throws {
        let ctx = try walkTestContext()
        let memory = memory()
        let m = model(ctx, memory: memory)
        #expect(PlanCalendar.sameDay(m.today, today))
        type(m, "Buy milk")
        let milk = try #require(task(ctx, titled: "Buy milk")).id
        m.dismiss(.firstToday)
        m.light(milk)
        #expect(m.dismissed == [.firstToday])

        // Back the same day: nothing starts over.
        m.refreshDay()
        #expect(m.dismissed == [.firstToday])
        #expect(m.lit == milk)
        #expect(m.bar.undoShowing)

        clock.now = day(2026, 11, 11, 8)
        m.refreshDay()
        #expect(m.today == day(2026, 11, 11))
        #expect(m.periods.today == day(2026, 11, 11))
        #expect(m.dismissed.isEmpty)
        #expect(m.lit == nil)
        #expect(m.bar.note == nil)
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)                            // yesterday's add is not taken back
        #expect(task(ctx, titled: "Buy milk") != nil)

        // The writer reads the new day: the first thing is marked on the 11th, and adds land there.
        type(m, "Call the vet")
        let vet = try #require(task(ctx, titled: "Call the vet"))
        #expect(PlanCalendar.sameDay(vet.scheduledFor, day(2026, 11, 11)))
        m.setFirst(vet.id, previous: nil)
        let focus = (try? ctx.fetch(FetchDescriptor<TaskFocus>())) ?? []
        #expect(focus.count == 1)
        #expect(focus.allSatisfy { PlanCalendar.sameDay($0.date, day(2026, 11, 11)) })
    }

    @Test func aSignPutAwayStaysAwayForTheDay() throws {
        let ctx = try walkTestContext()
        let memory = memory()
        model(ctx, memory: memory).dismiss(.todayOpen)
        #expect(model(ctx, memory: memory).dismissed == [.todayOpen])
    }

    @Test func aTickPutsTheLitRowOut() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Buy milk")
        let t = try #require(task(ctx, titled: "Buy milk"))
        m.light(t.id)
        #expect(m.lit == t.id)
        m.light(t.id)                                  // a second tap on the same sign puts it out
        #expect(m.lit == nil)
        m.light(t.id)
        m.toggle(row(t))
        #expect(m.lit == nil)
        #expect(task(ctx, titled: "Buy milk")?.completed == true)
    }

    // MARK: Covered by the half-open display (ruling D14)

    /// The phone set down half open over a light page: the page stays as it was, drawn but inert.
    /// Its bar stops and cannot start, and it never takes a Tell (the display's bar does); a pending
    /// pull-up is written; an add's Undo is kept for after.
    @Test func aCoveredPageNeitherListensNorTakesATell() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        #expect(listener.starts == 1)
        m.cover()
        #expect(m.covered)
        #expect(listener.stops == 1)
        #expect(m.bar.mic == .idle)

        m.send(.micTapped)                              // nothing can start it while covered
        await scheduler.settle()
        #expect(listener.starts == 1)
        #expect(m.bar.mic == .idle)
        let app = asked()
        #expect(!m.answerTell(app))                     // the display's bar owns the Tell
        await scheduler.settle()
        #expect(app.tellRequested)
        #expect(listener.starts == 1)
        m.send(.typed("Buy milk"))
        m.send(.submitted)
        #expect(tasks(ctx).isEmpty)                     // nothing is added from under the display

        m.uncover()                                     // opened flat: the rule is as before
        #expect(!m.covered)
        #expect(m.bar.draft == "Buy milk")              // the words wait in the field
        #expect(m.answerTell(app))
        await scheduler.settle()
        #expect(m.bar.mic == .listening)
        #expect(listener.starts == 2)
    }

    @Test func aCoveredPageWritesItsPendingPullUp() throws {
        let ctx = try walkTestContext()
        let t = try seededTask(ctx)
        let m = model(ctx)
        m.pullUp(t.id, level: .week)
        #expect(m.pulledUp == t.id)
        m.cover()
        #expect(deletes(ctx, t.id) == 1)
        #expect(m.pulledUp == nil)
        #expect(!m.bar.undoShowing)
    }

    /// An add's Undo is kept while covered and can be used once the phone is open flat again,
    /// if its time has not run out.
    @Test func anAddsUndoOutlastsTheDisplay() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Buy milk")
        m.cover()
        #expect(m.bar.undoShowing)
        scheduler.advance(WalkState.undoMs / 2)
        m.uncover()
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Buy milk") == nil)

        type(m, "Call the vet")
        m.cover()
        scheduler.advance(WalkState.undoMs)             // its time runs out under the display
        m.uncover()
        #expect(!m.bar.undoShowing)
        m.send(.undoTapped)
        #expect(task(ctx, titled: "Call the vet") != nil)
    }

    @Test func openingFlatOnANewDayReadsIt() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.cover()
        clock.now = day(2026, 11, 11, 0)
        m.uncover()
        #expect(m.today == day(2026, 11, 11))
    }

    // MARK: A tick on the half-open display (ruling D15)

    /// There a ticked row goes into a count, so a stray tap at arm's length can be undone: Undo
    /// un-ticks exactly that task. Today and Week keep their own tick (no Undo; the row stays).
    @Test func aTickOnTheDisplayCanBeUndone() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Buy milk")
        m.send(.undoExpired)
        let t = try #require(task(ctx, titled: "Buy milk"))
        m.tickWithUndo(row(t))
        #expect(t.completed)
        #expect(m.bar.undoShowing)
        m.send(.undoTapped)
        #expect(!t.completed)
        #expect(!m.bar.undoShowing)
    }

    @Test func aSecondTickTakesTheUndoOver() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        type(m, "Buy milk")
        type(m, "Call the vet")
        let milk = try #require(task(ctx, titled: "Buy milk"))
        let vet = try #require(task(ctx, titled: "Call the vet"))
        m.tickWithUndo(row(milk))
        m.tickWithUndo(row(vet))
        m.send(.undoTapped)
        #expect(!vet.completed)                         // the last tick, and only it
        #expect(milk.completed)
        #expect(task(ctx, titled: "Call the vet") != nil)   // the add before it is no longer the last thing
        scheduler.advance(WalkState.undoMs)
        m.send(.undoTapped)
        #expect(milk.completed)
    }

    // MARK: The app coming and going

    @Test func theSceneComingBackReadsTheDayAndGoingAwayLetsTheBarGo() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        m.sceneChanged(.background)
        #expect(m.bar.mic == .idle)
        #expect(listener.stops == 1)
        clock.now = day(2026, 11, 11, 8)
        m.sceneChanged(.active)
        #expect(m.today == day(2026, 11, 11))
    }


    /// Residual patch (D23): speech found unavailable at the first tap says so on the bar's line, and the
    /// bar types from then on; nothing was decided before that tap.
    @Test func speechFoundUnavailableAtTheFirstTapSaysSo() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        #expect(!m.bar.speechOff)
        listener.problemOnStart = "Speech isn't available right now — type it instead."
        m.send(.micTapped)
        await scheduler.settle()
        #expect(listener.starts == 1)
        #expect(m.bar.speechOff)
        #expect(m.bar.note == WalkCopy.speechOff)
        #expect(m.bar.fieldAsked == 1)
    }

    /// Final review (minor): Control Centre, the app switcher or a call makes the scene inactive; the
    /// bar lets go then, as for the background, and nothing it heard is added.
    @Test func anInactiveSceneLetsTheBarGo() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        listener.hear("Call the plumber")
        m.sceneChanged(.inactive)
        #expect(m.bar.mic == .idle)
        #expect(listener.stops == 1)
        listener.end()
        scheduler.advance(WalkOrb.finishMs + 1000)
        #expect(tasks(ctx).isEmpty)
    }

    /// But not while the listen is starting: the first tap's permission prompts make the scene
    /// inactive, and the listen they are for goes on once they are answered.
    @Test func thePermissionPromptsDoNotCancelTheListenTheyAreFor() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        listener.whileStarting = { m.sceneChanged(.inactive) }      // the prompts are up
        m.send(.micTapped)
        await scheduler.settle()
        #expect(m.bar.mic == .listening)
        #expect(listener.stops == 0)
        listener.hear("Call the plumber")
        m.send(.micTapped)
        listener.end()
        #expect(task(ctx, titled: "Call the plumber") != nil)
        #expect(!DailyModel.letsGo(onInactive: true))
        #expect(DailyModel.letsGo(onInactive: false))
    }

    // MARK: A Tell while another page goes (final review I2)

    /// The link that asks for a Tell also turns Week (or a mountain page) to Today. Today answers as it
    /// appears; the page going away sends `.left` in the same update, after it. The listen still
    /// begins: the tap the Tell stands for runs after the `.left`.
    @Test func aTellAnsweredAsAnotherPageGoesStillListens() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.page = .week
        let app = asked()
        m.page = .today                              // Today appears and answers
        #expect(m.answerTell(app))
        m.send(.left)                                // then Week's disappearing lands
        await scheduler.settle()
        #expect(m.bar.mic == .listening)
        #expect(listener.starts == 1)
        #expect(listener.stops == 0)
    }

    /// Residual patch: a walk opening between the Tell's answer and its run keeps the bar quiet under it.
    @Test func aWalkOpeningBeforeTheTellRunsKeepsTheBarQuiet() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        let app = asked()
        #expect(m.answerTell(app))
        app.walkShowing = true
        await scheduler.settle()
        #expect(m.bar.mic == .idle)
        #expect(listener.starts == 0)
    }

    /// A tap on the light between the Tell's answer and its run is not undone by it.
    @Test func aTapBeforeTheTellRunsIsNotTurnedIntoASecondTap() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        #expect(m.answerTell(asked()))
        m.send(.micTapped)                           // the person tapped meanwhile
        await scheduler.settle()
        #expect(m.bar.mic == .listening)
        #expect(listener.finishes == 0)
    }

    // MARK: Details over the page (final review I4)

    /// Opening a row's Details lets the bar go first: it stops listening, and what it heard is never
    /// added by a later tap.
    @Test func detailsOverTheBarStopItListening() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        listener.hear("Call the plumber")
        m.sheetOpening()
        #expect(m.bar.mic == .idle)
        #expect(listener.stops == 1)
        listener.hear("Something said under the sheet")
        listener.end()
        m.send(.micTapped)                           // the next tap starts a new listen, adding nothing
        #expect(tasks(ctx).isEmpty)
    }
}
#endif
