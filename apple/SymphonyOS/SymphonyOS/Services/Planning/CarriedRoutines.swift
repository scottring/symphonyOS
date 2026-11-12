import Foundation

/// "Keep it until it's done" (Scott, 2026-11-11: "Pay FFG" was due on the
/// 10th, he forgot, and it stayed quietly on the 10th). Port of the web's
/// src/lib/today/carriedRoutines.ts: a routine with `keepUntilDone` carries
/// its last missed occurrence onto today, "from Tue", until it is ticked off
/// or skipped — or until its next occurrence comes due, which then stands
/// for it. Done and Skip write the ORIGINAL occurrence, so history stays true.
enum CarriedRoutines {
    /// How far back a missed occurrence is looked for (web CARRY_LOOKBACK_DAYS).
    static let lookbackDays = 62

    struct Carried: Identifiable, Equatable {
        let routine: Routine
        /// The occurrence's own date (the instance key).
        let date: Date
        /// Where it was last due: its own date, or the day it was moved to.
        let dueOn: Date
        var id: String { "\(routine.id.uuidString):\(PlanCalendar.ymd(date))" }
        static func == (a: Carried, b: Carried) -> Bool { a.id == b.id && a.dueOn == b.dueOn }
    }

    /// web `namesDueDays`: a routine with no set day is offered to choose,
    /// never "missed".
    static func namesDueDays(_ p: RecurrencePattern) -> Bool {
        if RoutineRules.hasMonthlyPosition(p) { return p.dayOfWeek != "weekend" }
        switch p.type {
        case "daily", "monthly", "quarterly", "yearly", "specific_days": return true
        case "weekly": return !(p.days ?? []).isEmpty
        default: return false
        }
    }

    /// Switched on, running, a routine of its own (not a collection's step),
    /// with days of its own; and in the view's domain.
    static func carriesForward(_ r: Routine, domain: String? = nil) -> Bool {
        guard r.keepUntilDone, r.visibility == "active", r.parentRoutineId == nil,
              namesDueDays(r.recurrencePattern) else { return false }
        if let domain, r.context != domain { return false }
        return true
    }

    static func select(routines: [Routine], instances: [ActionableInstance], today: Date,
                       domain: String? = nil, lookbackDays: Int = lookbackDays) -> [Carried] {
        let cal = PlanCalendar.calendar
        let start = PlanCalendar.day(today)
        let todayYmd = PlanCalendar.ymd(start)
        var out: [Carried] = []
        for r in routines where carriesForward(r, domain: domain) {
            if let paused = r.pausedUntil, paused > start { continue }
            // Due today: today's own occurrence stands for it.
            if RoutineRules.matches(r.recurrencePattern, on: start) { continue }
            let created = PlanCalendar.day(r.createdAt)
            // The latest occurrence before today, from the rule…
            var last: Date?
            for n in 1...lookbackDays {
                guard let d = cal.date(byAdding: .day, value: -n, to: start) else { break }
                if d < created { break }
                if RoutineRules.matches(r.recurrencePattern, on: d) { last = d; break }
            }
            guard let last else { continue }
            let key = r.id.uuidString.lowercased()
            let inst = instances.first {
                $0.entityType == "routine" && $0.entityId.lowercased() == key && PlanCalendar.sameDay($0.date, last)
            }
            if let s = inst?.status, s == "completed" || s == "skipped" { continue }
            // Moved to another day: it is that day's until that day has passed.
            let moved = inst?.deferredTo ?? inst?.plannedOn
            let dueOn = moved.map(PlanCalendar.day) ?? last
            if PlanCalendar.ymd(dueOn) >= todayYmd { continue }
            out.append(Carried(routine: r, date: last, dueOn: dueOn))
        }
        return out.sorted { $0.dueOn < $1.dueOn }
    }

    /// "from yesterday", "from Tue", "from Nov 10" (a week or more back).
    static func fromLabel(_ dueOn: Date, today: Date) -> String {
        let days = PlanCalendar.calendar.dateComponents([.day], from: PlanCalendar.day(dueOn), to: PlanCalendar.day(today)).day ?? 0
        if days == 1 { return "from yesterday" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.calendar = PlanCalendar.calendar
        f.timeZone = PlanCalendar.calendar.timeZone
        f.dateFormat = days < 7 ? "EEE" : "MMM d"
        return "from \(f.string(from: dueOn))"
    }
}
