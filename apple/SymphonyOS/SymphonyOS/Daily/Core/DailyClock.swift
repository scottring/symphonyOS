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
