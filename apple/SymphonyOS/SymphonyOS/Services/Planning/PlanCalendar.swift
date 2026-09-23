import Foundation

/// The planning periods, matching the web and the database triggers:
/// weeks start on **Sunday** (`tasks_fill_period_stamps`), months on the 1st,
/// seasons on the household's four boundaries, years on Jan 1. Every period
/// is a real, dated range — never an open-ended bucket.
enum PlanCalendar {
    static var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        cal.firstWeekday = 1   // Sunday
        return cal
    }

    /// The web's defaults (lib/cadence/seasons.ts; SQL `season_start_for`).
    static let defaultSeasons: [SeasonBoundary] = [
        SeasonBoundary(name: "Spring", month: 3, day: 1),
        SeasonBoundary(name: "Summer", month: 6, day: 1),
        SeasonBoundary(name: "Fall", month: 9, day: 1),
        SeasonBoundary(name: "Winter", month: 12, day: 1),
    ]

    static func day(_ date: Date) -> Date { calendar.startOfDay(for: date) }

    static func addDays(_ date: Date, _ n: Int) -> Date {
        calendar.date(byAdding: .day, value: n, to: day(date)) ?? date
    }

    // MARK: Week

    /// The Sunday that starts `date`'s week.
    static func weekStart(_ date: Date) -> Date {
        let d = day(date)
        let weekday = calendar.component(.weekday, from: d)   // 1 = Sunday
        return addDays(d, -(weekday - 1))
    }

    static func weekDays(_ start: Date) -> [Date] { (0..<7).map { addDays(start, $0) } }

    /// The week's Saturday — what `tasks.weekend_start` stores.
    static func weekendSaturday(ofWeek start: Date) -> Date { addDays(weekStart(start), 6) }

    // MARK: Month / season / year

    static func monthStart(_ date: Date) -> Date {
        let c = calendar.dateComponents([.year, .month], from: date)
        return calendar.date(from: c) ?? day(date)
    }

    static func nextMonthStart(_ date: Date) -> Date {
        calendar.date(byAdding: .month, value: 1, to: monthStart(date)) ?? date
    }

    struct Season: Equatable {
        let name: String
        let start: Date
        /// First day of the NEXT season (exclusive end).
        let end: Date
        var lastDay: Date { PlanCalendar.addDays(end, -1) }
    }

    /// The season containing `date`, from the household's boundaries.
    static func season(containing date: Date, boundaries: [SeasonBoundary]? = nil) -> Season {
        let bounds = (boundaries?.count == 4 ? boundaries! : defaultSeasons)
            .sorted { ($0.month, $0.day) < ($1.month, $1.day) }
        let d = day(date)
        let year = calendar.component(.year, from: d)
        // Candidate starts across last, this and next year, in order.
        var starts: [(String, Date)] = []
        for y in [year - 1, year, year + 1] {
            for b in bounds {
                if let s = calendar.date(from: DateComponents(year: y, month: b.month, day: b.day)) {
                    starts.append((b.name, s))
                }
            }
        }
        starts.sort { $0.1 < $1.1 }
        for (i, entry) in starts.enumerated() where i + 1 < starts.count {
            if entry.1 <= d && d < starts[i + 1].1 {
                return Season(name: entry.0, start: entry.1, end: starts[i + 1].1)
            }
        }
        return Season(name: bounds[0].name, start: d, end: addDays(d, 90))
    }

    static func year(of date: Date) -> Int { calendar.component(.year, from: date) }

    // MARK: Keys

    /// Local YYYY-MM-DD, the way every DATE column and instance key is written.
    static func ymd(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func sameDay(_ a: Date?, _ b: Date) -> Bool {
        guard let a else { return false }
        return calendar.isDate(a, inSameDayAs: b)
    }

    // MARK: Weekend windows (port of lib/cadence/weekendWindow.ts)

    /// The Saturday–Sunday weekend `date` belongs to, grown through federal
    /// days off that touch it (a Monday holiday makes a three-day window).
    /// Nil when `date` is in no weekend.
    static func weekendWindow(for date: Date) -> [Date]? {
        let d = day(date)
        let weekday = calendar.component(.weekday, from: d)   // 1 Sun … 7 Sat
        var saturday: Date?
        if weekday == 7 { saturday = d }
        else if weekday == 1 { saturday = addDays(d, -1) }
        else if isFederalDayOff(d) {
            for i in 1...4 {
                let ahead = addDays(d, i)
                if calendar.component(.weekday, from: ahead) == 7 { saturday = ahead; break }
                if !isFederalDayOff(ahead) { break }
            }
            if saturday == nil {
                for i in 1...4 {
                    let behind = addDays(d, -i)
                    if calendar.component(.weekday, from: behind) == 1 { saturday = addDays(behind, -1); break }
                    if !isFederalDayOff(behind) { break }
                }
            }
        }
        guard let sat = saturday else { return nil }
        var start = sat
        while isFederalDayOff(addDays(start, -1)) { start = addDays(start, -1) }
        var end = addDays(sat, 1)
        while isFederalDayOff(addDays(end, 1)) { end = addDays(end, 1) }
        var days: [Date] = []
        var cursor = start
        while cursor <= end { days.append(cursor); cursor = addDays(cursor, 1) }
        return days
    }

    static func isWeekendWindowDay(_ date: Date) -> Bool {
        let weekday = calendar.component(.weekday, from: date)
        return weekday == 1 || weekday == 7 || weekendWindow(for: date) != nil
    }

    static func isFederalDayOff(_ date: Date) -> Bool {
        let y = year(of: date)
        let key = ymd(date)
        return federalDaysOff(y).contains(key) || federalDaysOff(y + 1).contains(key)
    }

    private static func federalDaysOff(_ year: Int) -> Set<String> {
        func date(_ m: Int, _ d: Int) -> Date { calendar.date(from: DateComponents(year: year, month: m, day: d))! }
        func observed(_ d: Date) -> Date {
            switch calendar.component(.weekday, from: d) {
            case 7: return addDays(d, -1)
            case 1: return addDays(d, 1)
            default: return d
            }
        }
        /// nth weekday (1 = Sunday … 7 = Saturday) of month; n = -1 → last.
        func nth(_ m: Int, _ weekday: Int, _ n: Int) -> Date {
            if n == -1 {
                let last = addDays(date(m == 12 ? 1 : m + 1, 1).addingYear(m == 12 ? 1 : 0), -1)
                let back = (calendar.component(.weekday, from: last) - weekday + 7) % 7
                return addDays(last, -back)
            }
            let first = date(m, 1)
            let forward = (weekday - calendar.component(.weekday, from: first) + 7) % 7
            return addDays(first, forward + (n - 1) * 7)
        }
        let thanksgiving = nth(11, 5, 4)
        let days = [
            observed(date(1, 1)), nth(1, 2, 3), nth(2, 2, 3), nth(5, 2, -1),
            observed(date(6, 19)), observed(date(7, 4)), nth(9, 2, 1), nth(10, 2, 2),
            observed(date(11, 11)), thanksgiving, addDays(thanksgiving, 1), observed(date(12, 25)),
        ]
        return Set(days.map(ymd))
    }
}

private extension Date {
    func addingYear(_ n: Int) -> Date {
        n == 0 ? self : (PlanCalendar.calendar.date(byAdding: .year, value: n, to: self) ?? self)
    }
}
