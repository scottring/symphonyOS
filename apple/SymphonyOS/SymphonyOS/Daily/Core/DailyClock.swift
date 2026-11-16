import Foundation

/// What time the light pages think it is. Debug builds take `-SymphonyDailyNow YYYY-MM-DD`
/// and pin it to noon that day, so screenshots read the boards' date.
enum DailyClock {
    @MainActor static func now() -> Date {
        #if DEBUG
        if let pinnedDay { return pinnedDay }
        #endif
        return Date()
    }

    /// The date `AppState.selectedDate` starts on: the pinned day when a debug build is launched with
    /// `-SymphonyDailyNow`, so Week and the spread's left page open on the day the pages read (the day
    /// turn, ruling D18, never moves a selected date back to a pinned day before the real one).
    static func launchDay(arguments: [String], real: Date) -> Date {
        #if DEBUG
        if let day = pinned(in: arguments) { return day }
        #endif
        return real
    }

    /// The selected date (`AppState.selectedDate`, which Week and the spread's left page follow) once
    /// the day has turned from `old` to `new`, by ruling D18: a selected date that was today or later
    /// when the day turned, and is now before today, becomes today (today itself, the sign's
    /// "tomorrow" with the app reopened days later, a coming period once its date has passed). A
    /// selected date already before the old today (a past week or period the person went to) stays,
    /// and so does any date that is still today or later. Unchanged if the day has not turned.
    static func selected(_ selected: Date, turnedFrom old: Date, to new: Date) -> Date {
        let day = PlanCalendar.day(selected), old = PlanCalendar.day(old), new = PlanCalendar.day(new)
        return day >= old && day < new ? new : selected
    }

    #if DEBUG
    private static let pinnedDay: Date? = pinned(in: ProcessInfo.processInfo.arguments)

    /// Noon on the day that follows `-SymphonyDailyNow`, or nil when it is missing or not YYYY-MM-DD.
    static func pinned(in arguments: [String]) -> Date? {
        guard let i = arguments.firstIndex(of: "-SymphonyDailyNow"), i + 1 < arguments.count else { return nil }
        let parts = arguments[i + 1].split(separator: "-", omittingEmptySubsequences: false).map { Int($0) }
        guard parts.count == 3, let y = parts[0], let m = parts[1], let d = parts[2],
              (1...12).contains(m), (1...31).contains(d) else { return nil }
        return PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: 12))
    }
    #endif
}
