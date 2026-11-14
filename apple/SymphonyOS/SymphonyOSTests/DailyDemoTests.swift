#if os(iOS) && DEBUG
import Testing
import Foundation
import SwiftData
@testable import Symphony

// The Debug seeds behind light Today's screenshots: each gives the sign it is named for,
// written as real rows through the walk's own writer.

private func day(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
}

@MainActor
struct DailyDemoTests {
    let me = DemoMode.userId

    private func seeded(_ seed: String, on today: Date) throws -> ModelContext {
        let ctx = try walkTestContext()
        DemoMode.seedDaily(ctx, seed: seed, today: today)
        return ctx
    }

    private func facts(_ ctx: ModelContext, on today: Date) -> Signpost.Facts {
        Signpost.facts(tasks: (try? ctx.fetch(FetchDescriptor<SymphonyTask>())) ?? [],
                       goals: (try? ctx.fetch(FetchDescriptor<Goal>())) ?? [],
                       focus: (try? ctx.fetch(FetchDescriptor<TaskFocus>())) ?? [],
                       commitments: (try? ctx.fetch(FetchDescriptor<TaskCommitment>())) ?? [],
                       today: today, me: me, seasons: nil)
    }

    private func sign(_ seed: String, on today: Date = day(2026, 11, 10)) throws -> Signpost.Sign? {
        Signpost.pick(facts(try seeded(seed, on: today), on: today))
    }

    @Test func eachSeedShowsItsSign() throws {
        #expect(try sign("morning")?.kind == .firstToday)
        #expect(try sign("done")?.kind == .dayDone)
        #expect(try sign("open")?.kind == .todayOpen)
        #expect(try sign("newweek")?.kind == .newWeek)
        #expect(try sign("nopiece")?.kind == .noPiece)
        #expect(try sign("empty") == nil)
    }

    @Test func quietSaysNothingUntilTheMonthEnds() throws {
        #expect(try sign("quiet") == nil)
        #expect(try sign("quiet", on: day(2026, 11, 28))?.kind == .periodEnds)
    }

    @Test func theSignsNameTheSeedsOwnWords() throws {
        #expect(try sign("morning")?.title == "Send the contractor the deposit")
        #expect(try sign("done")?.title == DailyCopy.tomorrow("Choose the tile"))
        #expect(try sign("open")?.title == "Measure the bathroom window")
        #expect(try sign("nopiece")?.title == "More slow weekends together")
    }

    @Test func morningIsTheBoardsDay() throws {
        let today = day(2026, 11, 10)
        let rows = facts(try seeded("morning", on: today), on: today).rows
        #expect(rows.map(\.title) == ["Send the contractor the deposit", "Tour the gym on Main Street",
                                      "Renew the passport", "Call Mum about Sunday lunch"])
        #expect(rows.first?.forGoal == "Finish the bathroom")
        #expect(rows.first?.first == true)
        #expect(rows.map(\.forGoal) == ["Finish the bathroom", "Feel strong again", nil, "More slow weekends together"])
        #expect(rows.map(\.done) == [false, false, false, true])
    }

    @Test func theEarlierDaysOfTheWeekHoldThreeDoneTasks() throws {
        let today = day(2026, 11, 10)          // a Tuesday: Sunday and Monday are earlier
        let tasks = try seeded("morning", on: today).fetch(FetchDescriptor<SymphonyTask>())
        let earlier = tasks.filter { t in
            guard let d = t.scheduledFor else { return false }
            return PlanCalendar.day(d) < today && PlanCalendar.day(d) >= PlanCalendar.weekStart(today)
        }
        #expect(earlier.count == 3)
        #expect(earlier.allSatisfy { $0.completed })
    }

    @Test func quietCarriesTheLongTitles() throws {
        let today = day(2026, 11, 10)
        let titles = facts(try seeded("quiet", on: today), on: today).rows.map(\.title)
        #expect(titles.contains { $0.count == 200 })
        #expect(titles.contains { $0.count == 60 && !$0.contains(" ") && $0.allSatisfy { $0.isLetter } })
    }

    @Test func theDemoCalendarHasTheMeetingTodayAndTheDentistTwoDaysOn() {
        let today = day(2026, 11, 10, 12)
        let todays = DemoMode.dailyEvents(on: today, today: today)
        #expect(todays.map(\.title) == ["Bathroom design meeting"])
        #expect(todays.first?.startTime == day(2026, 11, 10, 15))
        let later = DemoMode.dailyEvents(on: day(2026, 11, 12), today: today)
        #expect(later.map(\.title) == ["Dentist"])
        #expect(later.first?.startTime == day(2026, 11, 12, 9, 30))
        #expect(DemoMode.dailyEvents(on: day(2026, 11, 11), today: today).isEmpty)
        #expect(DailyDay.nextEvent(todays, ticked: [], now: today)?.title == "Bathroom design meeting")
    }

    @Test func theLaunchArgumentsAreRead() {
        #expect(DemoMode.dailySeed(in: ["app"]) == "morning")
        #expect(DemoMode.dailySeed(in: ["app", "-SymphonyDailySeed", "quiet"]) == "quiet")
        #expect(DemoMode.dailySeed(in: ["app", "-SymphonyDailySeed", "nonsense"]) == "morning")
        #expect(DemoMode.dailyPage(in: ["app", "-SymphonyDailyPage", "week"]) == .week)
        #expect(DemoMode.dailyPage(in: ["app"]) == nil)
        #expect(DemoMode.dailyStates(in: ["app", "-SymphonyDailyState", "point, Waiting"]) == ["point", "waiting"])
        #expect(DemoMode.dailyStates(in: ["app"]).isEmpty)
    }

    /// `-SymphonyDailyState speak`: the bar listens through a stand-in that hears the board's
    /// words (nobody can speak to the simulator); `undo`: one task added, Undo showing.
    @Test func theBarsDemoStates() async throws {
        #expect(DemoMode.dailyListener(in: ["app"]) == nil)
        #expect(DemoMode.dailyPanel(in: ["app", "-SymphonyDailyState", "undo,more"]) == .more)
        #expect(DemoMode.dailyPanel(in: ["app", "-SymphonyDailyState", "inbox"]) == .inbox)
        #expect(DemoMode.dailyPanel(in: ["app", "-SymphonyDailyState", "speak"]) == nil)
        let stand = try #require(DemoMode.dailyListener(in: ["app", "-SymphonyDailyState", "speak"]) as? DemoWalkListener)
        #expect(stand.words == DemoMode.dailySpoken)

        let ctx = try walkTestContext()
        let scheduler = ManualWalkScheduler()
        let speaking = DailyModel(context: ctx, userId: me, clock: { day(2026, 11, 10, 9) }, scheduler: scheduler,
                                  listener: stand)
        DemoMode.showDaily(speaking, ["speak"])
        await scheduler.settle()
        #expect(speaking.bar.mic == .listening)
        #expect(speaking.bar.draft == DemoMode.dailySpoken)
        #expect(((try? ctx.fetch(FetchDescriptor<SymphonyTask>())) ?? []).isEmpty)   // heard, not yet added

        let undo = DailyModel(context: ctx, userId: me, clock: { day(2026, 11, 10, 9) }, scheduler: scheduler,
                              listener: FakeWalkListener())
        DemoMode.showDaily(undo, ["undo"])
        #expect(undo.bar.undoShowing)
        #expect(((try? ctx.fetch(FetchDescriptor<SymphonyTask>())) ?? []).map(\.title) == [DemoMode.dailySpoken])

        let refusedListener = try #require(DemoMode.dailyListener(in: ["app", "-SymphonyDailyState", "refused"]))
        let refused = DailyModel(context: ctx, userId: me, clock: { day(2026, 11, 10, 9) }, scheduler: scheduler,
                                 listener: refusedListener)
        DemoMode.showDaily(refused, ["refused"])
        await scheduler.settle()
        #expect(refused.bar.speechOff)
        #expect(refused.bar.note == WalkCopy.speechOff)
        #expect(refused.bar.fieldAsked == 1)
    }
}
#endif
