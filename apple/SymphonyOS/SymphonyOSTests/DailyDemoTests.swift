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
                                      "Renew the passport", "Call Mom about Sunday lunch"])
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

    /// `-SymphonyDailyState select`: Week shows today's first task chosen, its Move to panel up;
    /// `unfold`: the fold open. Both are read from the states like the others.
    @Test func theWeeksDemoStates() throws {
        #expect(DemoMode.dailyStates(in: ["app", "-SymphonyDailyState", "select,unfold"]) == ["select", "unfold"])
        let today = day(2026, 11, 10)
        let ctx = try seeded("morning", on: today)
        let week = DailyWeek.make(tasks: try ctx.fetch(FetchDescriptor<SymphonyTask>()),
                                  goals: try ctx.fetch(FetchDescriptor<Goal>()),
                                  commitments: try ctx.fetch(FetchDescriptor<TaskCommitment>()),
                                  focus: try ctx.fetch(FetchDescriptor<TaskFocus>()), events: { _ in [] },
                                  weekStart: PlanCalendar.weekStart(today), today: today, me: me)
        let chosen = try #require(DemoMode.weekChoice(week))
        #expect(chosen.row.title == "Send the contractor the deposit")
        #expect(chosen.day.map { PlanCalendar.sameDay($0, today) } == true)
        #expect(week.past?.doneLine == DailyCopy.done(3))                  // the board's "3 done"
        #expect(DemoMode.weekChoice(DailyWeek.make(tasks: [], goals: [], commitments: [], focus: [], events: { _ in [] },
                                                   weekStart: PlanCalendar.weekStart(today), today: today, me: me))?.row == nil)
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
        // `hear`: the same stand-in, and nothing tapped (a Tell from outside starts it).
        let waiting = try #require(DemoMode.dailyListener(in: ["app", "-SymphonyDailyState", "hear"]) as? DemoWalkListener)
        #expect(waiting.words == DemoMode.dailySpoken)

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
        let untapped = DailyModel(context: ctx, userId: me, clock: { day(2026, 11, 10, 9) }, scheduler: scheduler,
                                  listener: waiting)
        DemoMode.showDaily(untapped, ["hear"])
        await scheduler.settle()
        #expect(untapped.bar.mic == .idle)

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

    // MARK: The mountain pages

    /// A mountain page as `MountainPageView` builds it, on the page the row of words opens.
    private func mountain(_ level: WalkLevel, seed: String = "morning", on today: Date = day(2026, 11, 10)) throws -> MountainPage {
        let ctx = try seeded(seed, on: today)
        let areas = MountainPage.areas((try? ctx.fetch(FetchDescriptor<GoalArea>())) ?? [], me: me, saved: [])
        let horizon: Horizon = level == .year ? .year : level == .season ? .season : .month
        let flags = MountainPage.flags(level: level, goals: (try? ctx.fetch(FetchDescriptor<Goal>())) ?? [],
                                       tasks: (try? ctx.fetch(FetchDescriptor<SymphonyTask>())) ?? [],
                                       selected: WalkPeriods.pick(now: today).pageDate(for: horizon), today: today,
                                       seasons: nil, me: me, areas: areas)
        return MountainPage(level: level, flags: flags, areas: areas, saved: [])
    }

    private func chosen(_ page: MountainPage) -> String? { page.items.first { $0.id == page.selected }?.title }

    /// `-SymphonyDailyState select`: the first flag of the page's level with nothing under it
    /// (else the first) is chosen, so the panel shows its line; `move` opens Move to; `zoom` taps that
    /// flag's side post, so the page stands in its area.
    @Test func theMountainsDemoStates() throws {
        var year = try mountain(.year)
        DemoMode.showMountain(&year, ["select"])
        #expect(chosen(year) == "More slow weekends together")
        let periods = try #require(year.periods)
        #expect(year.panel?.line == DailyCopy.nothingUnder(.year, periods: periods))
        #expect(year.panel?.moveTo.isEmpty == true)

        var moving = try mountain(.year)
        DemoMode.showMountain(&moving, ["select", "move"])
        let people = try #require(moving.items.first { $0.id == moving.selected }?.areaId)
        #expect(moving.moving)
        #expect(moving.panel?.moveTo.map(\.id) == moving.areas.map(\.id).filter { $0 != people })

        var zoomed = try mountain(.year)
        DemoMode.showMountain(&zoomed, ["zoom"])
        // Each page is seeded afresh, with ids of its own.
        #expect(zoomed.focusArea != nil)
        #expect(zoomed.focusArea == zoomed.items.first { $0.title == "More slow weekends together" }?.areaId)
        #expect(zoomed.selected == nil)

        var month = try mountain(.month)
        DemoMode.showMountain(&month, ["select", "zoom"])
        #expect(chosen(month) == "Clear out the old vanity")
        #expect(month.items.first { $0.id == month.focus }?.title == "Bathroom done by February")

        // The quiet seed's long words stand as month goals too, for the Month page.
        let quiet = try mountain(.month, seed: "quiet").items.filter { $0.level == .month }.map(\.title)
        #expect(quiet.contains(DemoMode.longTitle) && quiet.contains(DemoMode.longWord))

        var bare = try mountain(.month, seed: "empty")
        DemoMode.showMountain(&bare, ["select", "move", "zoom"])
        #expect(bare.selected == nil && bare.focus == nil && !bare.moving)
    }

    /// The demo's handover memory is its own and empty at launch, so UI test runs do not depend on
    /// each other; `-SymphonyHandoverRemembers` keeps what an earlier launch remembered, for a
    /// second launch that finishes the walk again as the same person.
    @Test func theDemosHandoverMemoryStartsEmptyUnlessAskedToRemember() {
        let suite = "DailyDemoTests.handover.\(UUID())"
        let first = DemoMode.handoverMemory(in: [], suite: suite)
        #expect(first.seen(for: me) == false)
        first.markSeen(for: me)
        #expect(DemoMode.handoverMemory(in: ["-SymphonyHandoverRemembers"], suite: suite).seen(for: me))
        #expect(DemoMode.handoverMemory(in: [], suite: suite).seen(for: me) == false)
    }

    /// `-SymphonyDailyState handover` settles it; `travel` holds the light halfway with the sheet still low.
    @Test func theHandoverStatesAreNamed() {
        #expect(DemoMode.handoverHold(in: ["-SymphonyDailyState", "handover"]) == .settled)
        #expect(DemoMode.handoverHold(in: ["-SymphonyDailyState", "travel"]) == .travel(0.5))
        #expect(DemoMode.handoverHold(in: ["-SymphonyDailyState", "speak"]) == nil)
        #expect(DemoMode.handoverHold(in: []) == nil)
    }
}
#endif
