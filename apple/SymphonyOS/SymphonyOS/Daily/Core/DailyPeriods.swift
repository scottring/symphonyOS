import Foundation

/// Which month, season and year the light pages open on: the owner's "Where I am, if it has goals"
/// (2026-11-14). For each of those levels, on a given day:
/// - `here` is the period that holds today (the calendar month, the season holding today by the
///   household's boundaries, the calendar year);
/// - `ahead` is the walk's period for that level (`WalkPeriods.pick`), which may be the same one;
/// - the same period: that one, with nothing to switch to;
/// - two periods: the page opens on `here` when the person has a goal of their own on that level in
///   it, else on `ahead`; and its heading offers the other one.
/// The walk's own periods do not change: the walk still plans ahead. Nothing here is stored.
enum DailyPeriods {
    /// Where a mountain page opens, as dates its period holds (what `AppState.selectedDate` takes).
    struct Opening: Equatable {
        /// Today: a day `here` holds.
        let here: Date
        /// The walk's period's page date (`WalkPeriods.pageDate`): a day `ahead` holds.
        let ahead: Date
        /// `here` and `ahead` are two periods: the heading switches between them.
        let differ: Bool
        /// The date the page opens on.
        let opens: Date
    }

    /// The periods that hold today, at every level (the walk's shape, none of its look-ahead).
    static func here(today: Date, seasons: [SeasonBoundary]?) -> WalkPeriods {
        let day = PlanCalendar.day(today)
        return WalkPeriods(today: day, year: PlanCalendar.year(of: day),
                           season: PlanCalendar.season(containing: day, boundaries: seasons), seasonIsCurrent: true,
                           monthStart: PlanCalendar.monthStart(day), monthIsCurrent: true,
                           weekStart: PlanCalendar.weekStart(day))
    }

    /// Whether `a` and `b` are the same period of `level` (year, season or month).
    static func same(_ level: WalkLevel, _ a: WalkPeriods, _ b: WalkPeriods) -> Bool {
        switch level {
        case .year: a.year == b.year
        case .season: PlanCalendar.sameDay(a.season.start, b.season.start)
        default: PlanCalendar.sameDay(a.monthStart, b.monthStart)
        }
    }

    /// The person has a goal of their own on `level` in `periods`' period of that level: a personal row
    /// of theirs, however it got there. The caller leaves out a row whose Remove can still be undone.
    static func hasGoals(_ level: WalkLevel, in periods: WalkPeriods, goals: [Goal], tasks: [SymphonyTask], me: UUID) -> Bool {
        WalkLoad.items(goals: goals, tasks: DailyDay.mine(tasks, me: me), periods: periods, me: me, planted: [])
            .contains { $0.level == level }
    }

    /// Where the page of `level` (year, season or month) opens on `today`.
    static func opening(_ level: WalkLevel, today: Date, seasons: [SeasonBoundary]?,
                        goals: [Goal], tasks: [SymphonyTask], me: UUID) -> Opening {
        let here = here(today: today, seasons: seasons)
        let ahead = WalkPeriods.pick(now: today, seasons: seasons)
        let horizon: Horizon = level == .year ? .year : level == .season ? .season : .month
        let differ = !same(level, here, ahead)
        let stays = !differ || hasGoals(level, in: here, goals: goals, tasks: tasks, me: me)
        return Opening(here: here.today, ahead: ahead.pageDate(for: horizon), differ: differ,
                       opens: stays ? here.today : ahead.pageDate(for: horizon))
    }

    /// The date a tap on the heading switches to from the page showing `shown`: the other of `here`
    /// and `ahead`, or nil when they are one period (or the page shows neither).
    static func other(_ level: WalkLevel, shown: Date, today: Date, seasons: [SeasonBoundary]?) -> Date? {
        let here = here(today: today, seasons: seasons)
        let ahead = WalkPeriods.pick(now: today, seasons: seasons)
        guard !same(level, here, ahead) else { return nil }
        let page = MountainPage.periods(level: level, selected: shown, today: today, seasons: seasons)
        let horizon: Horizon = level == .year ? .year : level == .season ? .season : .month
        if same(level, page, here) { return ahead.pageDate(for: horizon) }
        if same(level, page, ahead) { return here.today }
        return nil
    }

    /// The year, season and month the signposts and Week's band read: each by the rule, so the
    /// current one first when it holds a goal of the person's, else the walk's.
    static func current(today: Date, seasons: [SeasonBoundary]?, goals: [Goal], tasks: [SymphonyTask], me: UUID) -> WalkPeriods {
        let here = here(today: today, seasons: seasons)
        let ahead = WalkPeriods.pick(now: today, seasons: seasons)
        func takesHere(_ level: WalkLevel) -> Bool {
            same(level, here, ahead) || hasGoals(level, in: here, goals: goals, tasks: tasks, me: me)
        }
        let season = takesHere(.season) ? here.season : ahead.season
        let month = takesHere(.month) ? here.monthStart : ahead.monthStart
        return WalkPeriods(today: here.today, year: takesHere(.year) ? here.year : ahead.year, season: season,
                           seasonIsCurrent: PlanCalendar.sameDay(season.start, here.season.start),
                           monthStart: month, monthIsCurrent: PlanCalendar.sameDay(month, here.monthStart),
                           weekStart: here.weekStart)
    }

    /// The periods "Walk it down" plans in from a page showing `shown` on `level`: inside the flag's
    /// own period. A page on `here` (when it differs from the walk's) walks down into the periods that
    /// hold today (a fall goal into November, a November goal into this week); any other page into
    /// what the walk plans today.
    static func walking(_ level: WalkLevel, shown: Date, today: Date, seasons: [SeasonBoundary]?) -> WalkPeriods {
        let here = here(today: today, seasons: seasons)
        let ahead = WalkPeriods.pick(now: today, seasons: seasons)
        let page = MountainPage.periods(level: level, selected: shown, today: today, seasons: seasons)
        return !same(level, here, ahead) && same(level, page, here) ? here : ahead
    }
}
