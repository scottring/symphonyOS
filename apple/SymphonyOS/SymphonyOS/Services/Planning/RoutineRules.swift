import Foundation

/// Port of the web's routine rules (src/lib/routineUtils.ts,
/// src/lib/week/unhomedRoutines.ts). One answer to "is this routine due on
/// this day?", so the phone and the web offer the same occurrences.
enum RoutineRules {
    static let weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

    static func weekdayKey(_ date: Date) -> String {
        weekdayKeys[PlanCalendar.calendar.component(.weekday, from: date) - 1]
    }

    /// Older rows spell days out ("monday"); compare on the first three letters.
    private static func normalizedDays(_ days: [String]?) -> Set<String> {
        Set((days ?? []).map { String($0.lowercased().prefix(3)) })
    }

    /// `matchesRecurrenceForDate`. `lastCompletedAt` is only read by
    /// `since_last` and `weekend`; nil means never done.
    static func matches(_ pattern: RecurrencePattern, on date: Date, lastCompletedAt: Date? = nil) -> Bool {
        let cal = PlanCalendar.calendar
        let d = PlanCalendar.day(date)
        let dayOfMonth = cal.component(.day, from: d)
        let month = cal.component(.month, from: d)

        func daysSinceStart() -> Int? {
            guard let s = pattern.startDate, let start = Date.fromDateString(s) else { return nil }
            return cal.dateComponents([.day], from: PlanCalendar.day(start), to: d).day
        }

        switch pattern.type {
        case "daily":
            if let interval = pattern.interval, interval > 1, let diff = daysSinceStart() {
                return diff >= 0 && diff % interval == 0
            }
            return true
        case "weekly":
            if let interval = pattern.interval, interval > 1, let diff = daysSinceStart() {
                let weeks = Int(floor(Double(diff) / 7))
                if weeks < 0 || weeks % interval != 0 { return false }
            }
            return normalizedDays(pattern.days).contains(weekdayKey(d))
        case "weekend":
            // A window, settled once: doing it on one day of the weekend quiets
            // the other days; the day it was done still shows it, ticked.
            guard PlanCalendar.isWeekendWindowDay(d) else { return false }
            guard let done = lastCompletedAt else { return true }
            if PlanCalendar.sameDay(done, d) { return true }
            let window = PlanCalendar.weekendWindow(for: d) ?? []
            return !window.contains { PlanCalendar.sameDay(done, $0) }
        case "monthly":
            return pattern.dayOfMonth == dayOfMonth
        case "quarterly":
            guard [1, 4, 7, 10].contains(month) else { return false }
            return dayOfMonth == (pattern.dayOfMonth ?? 1)
        case "yearly":
            return month == (pattern.monthOfYear ?? 1) && dayOfMonth == (pattern.dayOfMonth ?? 1)
        case "specific_days":
            return pattern.dates?.contains(PlanCalendar.ymd(d)) ?? false
        case "since_last":
            guard let last = lastCompletedAt else { return true }
            let interval = pattern.interval ?? 1
            let due: Date?
            switch pattern.unit ?? "weeks" {
            case "days": due = cal.date(byAdding: .day, value: interval, to: last)
            case "months": due = cal.date(byAdding: .month, value: interval, to: last)
            default: due = cal.date(byAdding: .day, value: interval * 7, to: last)
            }
            return d >= PlanCalendar.day(due ?? last)
        default:
            return false
        }
    }

    /// `isEverydayRoutine`: recurs at least every weekday.
    static func isEveryday(_ pattern: RecurrencePattern) -> Bool {
        if pattern.type == "daily" { return true }
        if pattern.type == "weekly" || pattern.type == "specific_days" {
            let set = normalizedDays(pattern.days)
            return ["mon", "tue", "wed", "thu", "fri"].allSatisfy { set.contains($0) }
        }
        return false
    }

    /// A weekly routine with no day chosen: it needs a home each week.
    static func isFlexibleWeekly(_ pattern: RecurrencePattern) -> Bool {
        pattern.type == "weekly" && (pattern.days ?? []).isEmpty
    }

    struct Context {
        var domain: String?            // nil = every life area
        var hideEveryday = true        // the web's default "hide daily routines"
        var deferredInto: Set<UUID> = []
        var lastCompletedAt: [UUID: Date] = [:]
    }

    /// `resolveRoutine` for one date. `date == nil` asks the date-agnostic
    /// question (skips only the recurrence rung). The owner rung is not
    /// ported: the phone has no member lens.
    static func shows(_ r: Routine, on date: Date?, _ ctx: Context) -> Bool {
        guard r.visibility == "active" else { return false }
        if let date, !ctx.deferredInto.contains(r.id),
           !matches(r.recurrencePattern, on: date, lastCompletedAt: ctx.lastCompletedAt[r.id]) {
            return false
        }
        if !r.showOnTimeline { return false }
        if let domain = ctx.domain, r.context != domain { return false }
        if r.parentRoutineId != nil { return false }
        if ctx.hideEveryday && isEveryday(r.recurrencePattern) && !r.pinToTimeline { return false }
        return true
    }

    /// Routine ids placed onto `date` by a deferral ("Give it a day").
    static func deferredInto(_ instances: [ActionableInstance], on date: Date) -> Set<UUID> {
        Set(instances.compactMap { i in
            guard i.entityType == "routine", PlanCalendar.sameDay(i.deferredTo, date) else { return nil }
            return UUID(uuidString: i.entityId)
        })
    }

    static func lastCompletions(_ instances: [ActionableInstance]) -> [UUID: Date] {
        var out: [UUID: Date] = [:]
        for i in instances where i.entityType == "routine" && i.status == "completed" {
            guard let id = UUID(uuidString: i.entityId) else { continue }
            if let prev = out[id], prev >= i.date { continue }
            out[id] = i.date
        }
        return out
    }

    /// `placedInWeek`: the routine already has an occurrence this week —
    /// placed onto one of its days, or done there. A skip is not a home.
    static func placedInWeek(_ routineId: UUID, weekStart: Date, _ instances: [ActionableInstance]) -> Bool {
        let start = PlanCalendar.weekStart(weekStart)
        let end = PlanCalendar.addDays(start, 7)
        func inWeek(_ d: Date) -> Bool { d >= start && d < end }
        return instances.contains { i in
            guard i.entityType == "routine", i.entityId.lowercased() == routineId.uuidString.lowercased(),
                  i.status != "skipped" else { return false }
            if let to = i.deferredTo, inWeek(to) { return true }
            return i.status == "completed" && inWeek(i.date)
        }
    }
}
