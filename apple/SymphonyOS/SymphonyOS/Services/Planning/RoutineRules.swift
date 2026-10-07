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
            // By position ("first weekend", "last Friday"). A weekend position
            // is a window like `weekend` above: done on one of its days, the
            // others go quiet.
            if let window = monthlyPositionWindow(containing: d, pattern) {
                guard window.count > 1, let done = lastCompletedAt else { return true }
                if PlanCalendar.sameDay(done, d) { return true }
                return !window.contains { PlanCalendar.sameDay(done, $0) }
            }
            if hasMonthlyPosition(pattern) { return false }
            guard let target = pattern.dayOfMonth else { return false }
            // A 31st rule is due on the month's last day when it is shorter.
            let lastDay = cal.range(of: .day, in: .month, for: d)?.count ?? 31
            return min(target, lastDay) == dayOfMonth
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

    // MARK: Monthly by position (port of lib/cadence/monthlyPosition.ts)

    static let monthWeeks: Set<Int> = [1, 2, 3, 4, -1]
    static let monthDaysOfWeek: Set<String> = ["weekend", "sun", "mon", "tue", "wed", "thu", "fri", "sat"]

    /// `hasMonthlyPosition`: a monthly rule set by position.
    static func hasMonthlyPosition(_ p: RecurrencePattern) -> Bool {
        guard p.type == "monthly", let w = p.weekOfMonth, let d = p.dayOfWeek else { return false }
        return monthWeeks.contains(w) && monthDaysOfWeek.contains(d)
    }

    /// The nth weekday (0 = Sunday) of a month; n = -1 is the last. Month may overflow.
    static func nthWeekdayInMonth(year: Int, month: Int, weekday: Int, n: Int) -> Date {
        let cal = PlanCalendar.calendar
        let first = cal.date(from: DateComponents(year: year, month: month, day: 1))!
        if n == -1 {
            let next = cal.date(byAdding: .month, value: 1, to: first)!
            let last = PlanCalendar.addDays(next, -1)
            let back = ((cal.component(.weekday, from: last) - 1) - weekday + 7) % 7
            return PlanCalendar.addDays(last, -back)
        }
        let forward = (weekday - (cal.component(.weekday, from: first) - 1) + 7) % 7
        return PlanCalendar.addDays(first, forward + (n - 1) * 7)
    }

    /// `monthlyPositionDays`: the day, or the weekend window anchored on that
    /// month's nth Saturday, earliest first. `month` is 1-based and may overflow.
    static func monthlyPositionDays(year: Int, month: Int, _ p: RecurrencePattern) -> [Date] {
        guard let n = p.weekOfMonth, let key = p.dayOfWeek else { return [] }
        if key == "weekend" {
            let saturday = nthWeekdayInMonth(year: year, month: month, weekday: 6, n: n)
            return PlanCalendar.weekendWindow(for: saturday) ?? [saturday, PlanCalendar.addDays(saturday, 1)]
        }
        guard let weekday = weekdayKeys.firstIndex(of: key) else { return [] }
        return [nthWeekdayInMonth(year: year, month: month, weekday: weekday, n: n)]
    }

    /// `monthlyPositionWindowFor`: the occurrence containing `date`, or nil.
    static func monthlyPositionWindow(containing date: Date, _ p: RecurrencePattern) -> [Date]? {
        guard hasMonthlyPosition(p) else { return nil }
        let cal = PlanCalendar.calendar
        let y = cal.component(.year, from: date), m = cal.component(.month, from: date)
        // A window can spill a day or two across a month boundary either way.
        for offset in [0, -1, 1] {
            let days = monthlyPositionDays(year: y, month: m + offset, p)
            if days.contains(where: { PlanCalendar.sameDay($0, date) }) { return days }
        }
        return nil
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
    static func shows(_ r: Routine, on date: Date?, _ ctx: Context, now: Date = Date()) -> Bool {
        guard isActive(r, now: now) else { return false }
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

    /// Active, or resting with a wake date that has passed. The web wakes
    /// those on its next load (useRoutines' auto-resume, which writes
    /// `visibility: 'active'`); the phone reads them as awake without writing,
    /// so "Hide for today" never hides a routine for good on a phone-only day.
    static func isActive(_ r: Routine, now: Date = Date()) -> Bool {
        if r.visibility == "active" { return true }
        guard r.visibility == "reference", let wake = r.pausedUntil else { return false }
        return wake <= now
    }

    // MARK: One occurrence's day and time (port of lib/today/routineTime.ts
    // and lib/today/deferredRoutines.ts)

    /// `isDayOnlyMove`: moved to a DAY with no time — a midnight `deferred_to`
    /// stamped with the same day's `planned_on`.
    static func isDayOnlyMove(_ i: ActionableInstance?) -> Bool {
        guard let i, let to = i.deferredTo, let planned = i.plannedOn else { return false }
        let cal = PlanCalendar.calendar
        return cal.component(.hour, from: to) == 0 && cal.component(.minute, from: to) == 0
            && PlanCalendar.sameDay(to, planned)
    }

    /// Dated on its own day but moved to another: it is not on its own day.
    static func movedAway(_ i: ActionableInstance?, from date: Date) -> Bool {
        guard let i, i.status == "deferred", let to = i.deferredTo else { return false }
        return !PlanCalendar.sameDay(to, date)
    }

    private static func ruleTime(_ timeOfDay: String?, on date: Date) -> Date? {
        guard let timeOfDay else { return nil }
        let parts = timeOfDay.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        return PlanCalendar.calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: PlanCalendar.day(date))
    }

    /// `resolveRoutineTime`: the time a routine occupies on `date`, or nil for
    /// untimed. `instance` is the occurrence on (or moved onto) that day. A
    /// drag writes a one-day override (`deferred_to`) rather than touching the
    /// rule, so the rule's time is the fallback, never the answer alone.
    static func time(timeOfDay: String?, instance i: ActionableInstance?, on date: Date) -> Date? {
        if isDayOnlyMove(i) { return nil }
        let cal = PlanCalendar.calendar
        if let i, i.status == "deferred", let to = i.deferredTo {
            let midnight = cal.component(.hour, from: to) == 0 && cal.component(.minute, from: to) == 0
            let ruleAtMidnight = ruleTime(timeOfDay, on: date).map { cal.component(.hour, from: $0) == 0 && cal.component(.minute, from: $0) == 0 } ?? false
            // A bare date moved to ANOTHER day is a day, not 12:00 AM.
            if midnight && !PlanCalendar.sameDay(to, i.date) && !ruleAtMidnight { return nil }
            // Moved: only on the day it went to, never a ghost on the day it left.
            return PlanCalendar.sameDay(to, date) ? to : nil
        }
        if let i, let to = i.deferredTo, i.status == "pending", PlanCalendar.sameDay(to, date) { return to }
        // An untimed routine placed at a time keeps that place once done or skipped.
        if timeOfDay == nil, let i, let to = i.deferredTo, i.status == "completed" || i.status == "skipped",
           PlanCalendar.sameDay(to, date) { return to }
        return ruleTime(timeOfDay, on: date)
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
            // Chosen for a day of this week without a time: placed for the
            // week, though its rule still names no day.
            if i.deferredTo == nil, let planned = i.plannedOn, inWeek(planned) { return true }
            return i.status == "completed" && inWeek(i.date)
        }
    }
}
