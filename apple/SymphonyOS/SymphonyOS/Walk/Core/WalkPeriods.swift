import Foundation

/// Which year, season, month and week the walk files a person's answers into.
/// Near the end of a period the walk looks ahead to the next one (spec
/// "Periods near a boundary", D6), and the month always lies inside the season.
/// Boundaries come from `PlanCalendar`.
struct WalkPeriods: Equatable {
    let today: Date
    let year: Int
    let season: PlanCalendar.Season
    let seasonIsCurrent: Bool
    let monthStart: Date
    let monthIsCurrent: Bool
    let weekStart: Date

    /// Fewer than this many days left (today counted) and the walk plans the next one.
    private static let seasonMinDaysLeft = 21
    private static let monthMinDaysLeft = 7

    static func pick(
        now: Date,
        seasons: [SeasonBoundary]? = nil,
        weekStartsOn: Int = PlanCalendar.weekStartsOn
    ) -> WalkPeriods {
        let cal = PlanCalendar.calendar
        let today = PlanCalendar.day(now)

        let thisYear = PlanCalendar.year(of: today)
        let month = cal.component(.month, from: today)
        let year = month >= 11 ? thisYear + 1 : thisYear

        let current = PlanCalendar.season(containing: today, boundaries: seasons)
        let seasonDaysLeft = cal.dateComponents([.day], from: today, to: current.end).day ?? 0
        let seasonIsCurrent = seasonDaysLeft >= seasonMinDaysLeft
        let season = seasonIsCurrent
            ? current
            : PlanCalendar.season(containing: current.end, boundaries: seasons)

        // The month always lies inside the season the walk plans: planning the coming season,
        // it is that season's first month; in the current one, this month, or the next once
        // fewer than a week of this one is left (which, with three weeks of the season left,
        // is still inside it).
        let thisMonth = PlanCalendar.monthStart(today)
        let nextMonth = PlanCalendar.nextMonthStart(today)
        let monthDaysLeft = cal.dateComponents([.day], from: today, to: nextMonth).day ?? 0
        let monthIsCurrent = seasonIsCurrent && monthDaysLeft >= monthMinDaysLeft
        let monthStart = !seasonIsCurrent ? PlanCalendar.monthStart(season.start) : (monthIsCurrent ? thisMonth : nextMonth)

        return WalkPeriods(
            today: today,
            year: year,
            season: season,
            seasonIsCurrent: seasonIsCurrent,
            monthStart: monthStart,
            monthIsCurrent: monthIsCurrent,
            weekStart: PlanCalendar.weekStart(today, startsOn: weekStartsOn)
        )
    }

    /// "winter"
    var seasonWord: String { season.name.lowercased() }

    /// "November"
    var monthName: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.calendar = PlanCalendar.calendar
        f.timeZone = PlanCalendar.calendar.timeZone
        f.dateFormat = "LLLL"
        return f.string(from: monthStart)
    }

    /// 30
    var monthLastDay: Int {
        PlanCalendar.calendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30
    }

    var weekLastDay: Date { PlanCalendar.addDays(weekStart, 6) }

    /// "30th"
    static func ordinal(_ n: Int) -> String {
        let suffix: String
        switch n % 100 {
        case 11, 12, 13: suffix = "th"
        default:
            switch n % 10 {
            case 1: suffix = "st"
            case 2: suffix = "nd"
            case 3: suffix = "rd"
            default: suffix = "th"
            }
        }
        return "\(n)\(suffix)"
    }

    /// A day inside the period the walk files into, so a page opens on it.
    func pageDate(for horizon: Horizon) -> Date {
        switch horizon {
        case .year:
            return PlanCalendar.calendar.date(from: DateComponents(year: year, month: 1, day: 1)) ?? today
        case .season: return season.start
        case .month: return monthStart
        case .week, .today: return today
        }
    }

    /// Where a Planner switcher row opens: the date `selectedDate` takes, or nil to leave it.
    /// Full: only Today moves it, to now. Light: Today always comes back to today; the row
    /// of any other horizon on screen leaves it where the steppers put it; every other row
    /// opens on the walk's period for it (Week on today), so the pages show what it filed.
    static func switcherDate(for horizon: Horizon, viewing: Horizon, edition: Edition, now: Date,
                             seasons: [SeasonBoundary]?) -> Date? {
        guard edition == .light else { return horizon == .today ? now : nil }
        guard horizon != viewing || horizon == .today else { return nil }
        return pick(now: now, seasons: seasons).pageDate(for: horizon)
    }
}
