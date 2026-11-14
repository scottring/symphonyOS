import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
}

// The owner's decision (2026-11-14), "Where I am, if it has goals": Month, Season and Year open on
// the current month, season and year whenever the person has goals there; with none there yet they
// open on the coming one (the walk's). When both are periods of their own the heading switches between
// them. Week's flags and the signposts read the current month first. The walk's own periods stay.
@MainActor
struct DailyPeriodsTests {
    let me = UUID()

    enum Setup: CaseIterable { case none, hereOnly, aheadOnly, both }

    /// A year goal, a season goal and a month goal of mine in `p`'s periods, titled by `tag`.
    private func plan(_ p: WalkPeriods, _ tag: String) -> (goals: [Goal], tasks: [SymphonyTask]) {
        let g = Goal(id: UUID(), userId: me, name: "\(tag) year", year: p.year)
        g.context = "personal"
        let s = SymphonyTask(id: UUID(), userId: me, title: "\(tag) season", completed: false, scheduledFor: nil,
                             context: "personal", notes: nil)
        s.bucket = "quarter"; s.seasonStart = p.season.start; s.goalId = g.id
        let m = SymphonyTask(id: UUID(), userId: me, title: "\(tag) month", completed: false, scheduledFor: nil,
                             context: "personal", notes: nil)
        m.bucket = "month"; m.monthStart = p.monthStart; m.sourceId = s.id
        return ([g], [s, m])
    }

    private func rows(_ setup: Setup, here: WalkPeriods, ahead: WalkPeriods) -> (goals: [Goal], tasks: [SymphonyTask]) {
        let h = plan(here, "Here"), a = plan(ahead, "Ahead")
        switch setup {
        case .none: return ([], [])
        case .hereOnly: return h
        case .aheadOnly: return a
        case .both: return (h.goals + a.goals, h.tasks + a.tasks)
        }
    }

    /// The days the sweep reads, for the default seasons and for a household's own boundaries.
    private func days(_ seasons: [SeasonBoundary]?) -> [Date] {
        // The first day the walk looks ahead to the coming season, found rather than assumed.
        let lookAhead = (0..<120).map { PlanCalendar.addDays(day(2026, 9, 1), $0) }
            .first { !WalkPeriods.pick(now: $0, seasons: seasons).seasonIsCurrent }!
        let season = PlanCalendar.season(containing: lookAhead, boundaries: seasons)
        return [PlanCalendar.addDays(lookAhead, -10),       // more than three weeks left
                lookAhead,                                  // the first day the walk looks ahead
                PlanCalendar.addDays(lookAhead, 1),
                season.lastDay,                             // the season's last day
                season.end,                                 // the first day of the new season
                day(2026, 12, 30), day(2026, 12, 31), day(2027, 1, 1)]
    }

    static let custom = [SeasonBoundary(name: "Spring", month: 3, day: 20), SeasonBoundary(name: "Summer", month: 6, day: 21),
                         SeasonBoundary(name: "Fall", month: 9, day: 22), SeasonBoundary(name: "Winter", month: 12, day: 21)]

    @Test(arguments: [false, true])
    func eachPageOpensWhereThePersonIsIfItHasGoals(customSeasons: Bool) throws {
        let seasons = customSeasons ? Self.custom : nil
        for today in days(seasons) {
            let here = DailyPeriods.here(today: today, seasons: seasons)
            let ahead = WalkPeriods.pick(now: today, seasons: seasons)
            for setup in Setup.allCases {
                let (goals, tasks) = rows(setup, here: here, ahead: ahead)
                for (level, horizon) in [(WalkLevel.year, Horizon.year), (.season, .season), (.month, .month)] {
                    let what = "\(PlanCalendar.ymd(today)) \(setup) \(level)"
                    let differ = !DailyPeriods.same(level, here, ahead)
                    let hereHas = setup == .hereOnly || setup == .both
                    let opensHere = !differ || hereHas
                    let opening = DailyPeriods.opening(level, today: today, seasons: seasons, goals: goals, tasks: tasks, me: me)
                    #expect(opening.differ == differ, "\(what)")
                    #expect(PlanCalendar.sameDay(opening.opens, opensHere ? today : ahead.pageDate(for: horizon)), "\(what)")

                    // The page built for that date is that period, and what its bar files goals into.
                    let flags = MountainPage.flags(level: level, goals: goals, tasks: tasks, selected: opening.opens,
                                                   today: today, seasons: seasons, me: me, areas: [])
                    #expect(DailyPeriods.same(level, flags.periods, opensHere ? here : ahead), "\(what)")
                    var page = MountainPage(level: level, flags: flags, areas: [], saved: [])
                    if let own = flags.own.first { _ = page.apply(.flag(own.id)) }
                    #expect(page.hanging.map { DailyPeriods.same(level, $0.periods, flags.periods) } == true, "\(what)")
                    // Its own goals are shown: here's when it opened here, the walk's otherwise.
                    if differ {
                        let tag = opensHere ? "Here" : "Ahead"
                        #expect(flags.own.allSatisfy { $0.title.hasPrefix(tag) }, "\(what)")
                        #expect(flags.own.isEmpty == (setup == .none || (!opensHere && setup == .hereOnly)), "\(what)")
                    } else {
                        #expect(flags.own.isEmpty == (setup == .none), "\(what)")
                    }

                    // The heading offers the other exactly when they differ, and a second tap comes back.
                    let other = DailyPeriods.other(level, shown: opening.opens, today: today, seasons: seasons)
                    #expect((other != nil) == differ, "\(what)")
                    if let other {
                        let back = DailyPeriods.other(level, shown: other, today: today, seasons: seasons)
                        #expect(back.map { DailyPeriods.same(level,
                            MountainPage.periods(level: level, selected: $0, today: today, seasons: seasons),
                            MountainPage.periods(level: level, selected: opening.opens, today: today, seasons: seasons)) } == true,
                                "\(what)")
                    }

                    // Walk it down plans inside the shown flag's own period: the periods that hold today on a
                    // page showing them (while the walk has moved on), else the walk's own.
                    #expect(flags.walkPeriods == (differ && opensHere ? here : ahead), "\(what)")
                }
            }
        }
    }

    /// Week's band and the signposts read the current month first, the walk's only when the current one
    /// has nothing of mine; a sign's walk-down is found in the periods the sign read.
    @Test(arguments: [false, true])
    func theBandAndTheSignsReadTheCurrentMonthFirst(customSeasons: Bool) throws {
        let seasons = customSeasons ? Self.custom : nil
        for today in days(seasons) {
            let here = DailyPeriods.here(today: today, seasons: seasons)
            let ahead = WalkPeriods.pick(now: today, seasons: seasons)
            let differ = !DailyPeriods.same(.month, here, ahead)
            for setup in Setup.allCases where setup != .none {
                let what = "\(PlanCalendar.ymd(today)) \(setup)"
                let (goals, tasks) = rows(setup, here: here, ahead: ahead)
                let expected = !differ ? nil : (setup == .aheadOnly ? "Ahead month" : "Here month")
                let band = DailyWeek.bandGoals(tasks: tasks, goals: goals, commitments: [], focus: [],
                                               weekStart: PlanCalendar.weekStart(today), today: today, me: me, seasons: seasons)
                let facts = Signpost.facts(tasks: tasks, goals: goals, focus: [], commitments: [], today: today, me: me,
                                           seasons: seasons)
                if let expected {
                    #expect(band.first?.title == expected, "\(what)")
                    #expect(facts.monthGoal?.title == expected, "\(what)")
                } else {
                    #expect(!band.isEmpty, "\(what)")
                    #expect(facts.monthGoal != nil, "\(what)")
                }
                // "A new week" walks that goal down: it is found in the periods the sign read.
                let read = DailyPeriods.current(today: today, seasons: seasons, goals: goals, tasks: tasks, me: me)
                let month = try #require(facts.monthGoal)
                let down = DailyWalkDown.sign(.walkDown(month.id, .month), goals: goals, tasks: tasks, areaRows: [],
                                              saved: nil, periods: read, now: today, seasons: seasons, me: me)
                #expect(down?.periods == read, "\(what)")
                // The season word the "No piece" sign speaks is the season the pages read.
                #expect(facts.seasonWord == read.seasonWord, "\(what)")
            }
        }
    }

    /// The walk itself still plans ahead: its periods are `WalkPeriods.pick`, whatever the pages open on.
    @Test func theWalksOwnPeriodsAreUnchanged() {
        let today = day(2026, 11, 20)
        let ahead = WalkPeriods.pick(now: today)
        #expect(ahead.season.name == "Winter" && ahead.monthName == "December")
        let here = DailyPeriods.here(today: today, seasons: nil)
        #expect(here.season.name == "Fall" && here.monthName == "November" && here.year == 2026)
        #expect(DailyPeriods.walking(.month, shown: ahead.monthStart, today: today, seasons: nil) == ahead)
        #expect(DailyPeriods.walking(.month, shown: today, today: today, seasons: nil) == here)
    }

    /// A row whose Remove can still be undone is left out by the caller: it does not count as a goal there.
    @Test func onlyMyOwnPersonalRowsCount() {
        let today = day(2026, 11, 20)
        let here = DailyPeriods.here(today: today, seasons: nil)
        let theirs = SymphonyTask(id: UUID(), userId: UUID(), title: "Their November goal", completed: false,
                                  scheduledFor: nil, context: "personal", notes: nil)
        theirs.bucket = "month"; theirs.monthStart = here.monthStart
        let work = SymphonyTask(id: UUID(), userId: me, title: "A work goal", completed: false, scheduledFor: nil,
                                context: "work", notes: nil)
        work.bucket = "month"; work.monthStart = here.monthStart
        #expect(!DailyPeriods.hasGoals(.month, in: here, goals: [], tasks: [theirs, work], me: me))
        let opening = DailyPeriods.opening(.month, today: today, seasons: nil, goals: [], tasks: [theirs, work], me: me)
        #expect(!PlanCalendar.sameDay(PlanCalendar.monthStart(opening.opens), here.monthStart))
    }
}
