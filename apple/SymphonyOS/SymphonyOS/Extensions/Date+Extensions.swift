import Foundation

extension Date {
    /// Start of day in the current calendar
    var startOfDay: Date {
        Calendar.current.startOfDay(for: self)
    }

    /// End of day (23:59:59)
    var endOfDay: Date {
        Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: self) ?? self
    }

    /// YYYY-MM-DD string for Supabase date columns
    var dateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: self)
    }

    /// ISO 8601 string for Supabase timestamptz columns
    var isoString: String {
        ISO8601DateFormatter().string(from: self)
    }

    /// Parse ISO 8601 from Supabase
    static func fromISO(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }

    /// Parse YYYY-MM-DD date string
    static func fromDateString(_ string: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: string)
    }

    /// Relative day label
    var dayLabel: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(self) { return "Today" }
        if calendar.isDateInYesterday(self) { return "Yesterday" }
        if calendar.isDateInTomorrow(self) { return "Tomorrow" }

        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: self)
    }

    /// Day of week (lowercase, e.g. "monday")
    var dayOfWeek: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter.string(from: self).lowercased()
    }

    /// Check if this is a weekend
    var isWeekend: Bool {
        Calendar.current.isDateInWeekend(self)
    }

    /// Add days
    func addingDays(_ days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: days, to: self) ?? self
    }

    /// Monday of the week containing this date
    var mondayOfWeek: Date {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: self)
        // weekday: 1=Sun, 2=Mon, ...
        let daysToSubtract = (weekday + 5) % 7 // 0 for Monday, 1 for Tuesday, etc.
        return calendar.date(byAdding: .day, value: -daysToSubtract, to: startOfDay) ?? self
    }
}
