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

    /// The selected date (`AppState.selectedDate`, which Week and the spread's left page follow) once
    /// the day has turned from `old` to `new`: if it was today it moves to the new today; if the person
    /// had gone to another date on purpose (a sign's "tomorrow", a mountain page's period) it stays,
    /// except that a "tomorrow" the day has now passed becomes today's. Unchanged if the day has not turned.
    static func selected(_ selected: Date, turnedFrom old: Date, to new: Date) -> Date {
        guard !PlanCalendar.sameDay(old, new) else { return selected }
        if PlanCalendar.sameDay(selected, old) { return PlanCalendar.day(new) }
        let tomorrow = PlanCalendar.addDays(PlanCalendar.day(old), 1)
        if PlanCalendar.sameDay(selected, tomorrow) && PlanCalendar.day(selected) < PlanCalendar.day(new) {
            return PlanCalendar.day(new)
        }
        return selected
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
