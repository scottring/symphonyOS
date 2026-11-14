import Foundation

/// The week for the light pages: which tasks and calendar events stand under which day,
/// the days already behind folded to one line (with anything still open from before the
/// week), Any day last, where a task may move, and the month goals on the band. Pure over
/// the rows it is given, and it reads only the signed-in person's own (`DailyDay.mine`).
/// Nothing here counts what was missed or marks anything late.
enum DailyWeek {
    enum Line: Equatable, Identifiable {
        case event(id: String, time: String, title: String), task(DailyDay.Row), open

        var id: String {
            switch self {
            case let .event(id, _, _): "event:\(id)"
            case let .task(row): "task:\(row.id.uuidString.lowercased())"
            case .open: "open"
            }
        }
    }

    struct Day: Equatable, Identifiable {
        /// nil: Any day.
        let date: Date?
        let label: String
        let number: String
        let isToday: Bool
        let lines: [Line]

        var id: String { date.map(PlanCalendar.ymd) ?? "any" }
    }

    struct Past: Equatable {
        let label: String
        /// The fold's count, the only one it gives: "3 done" (tasks done on the folded days, never
        /// the earlier rows), or nil when nothing was done, so it never reads as a tally of what was missed.
        let doneLine: String?
        /// The days behind today that held a task, their tasks only: a past day's calendar events are
        /// not shown, and a day that held nothing is left out (no lone "open" in the fold).
        let days: [Day]
        /// Still open from before this week: dated before it, or left on an earlier week with no day.
        let earlier: [Earlier]
    }

    /// A row still open from before this week, with the day it was left on (nil: left on an
    /// earlier week with no day), which its Move to chips start from.
    struct Earlier: Equatable, Identifiable {
        let row: DailyDay.Row
        let day: Date?
        var id: UUID { row.id }
        var title: String { row.title }
    }

    struct Week: Equatable {
        let start: Date
        let eyebrow: String
        let range: String
        let past: Past?
        /// Today to the week's last day (every day for a week that is not today's), then Any day when it holds anything.
        let days: [Day]
    }

    struct Chip: Equatable, Identifiable {
        let label: String
        /// nil: Any day.
        let day: Date?
        var id: String { label }
    }

    // MARK: The week

    /// Days come from `PlanCalendar.weekDays(weekStart)` as given, so a Monday start runs to
    /// Sunday. A day holds its events by start time, then the tasks dated on it (`isDated`) in
    /// the list's own order, done ones in place; with neither it is `.open`. Any day is the
    /// week's list (`weekList`) with no day, done ones in place. A folded past day holds its
    /// tasks only; events are read only for today onward. A task being pulled up (`pulledUp`, its
    /// Undo still open: `DailyModel.pulledUp`) is left out of every day, the fold and Any day.
    static func make(tasks: [SymphonyTask], goals: [Goal], commitments: [TaskCommitment], focus: [TaskFocus],
                     events: (Date) -> [TimelineItem], weekStart: Date, today: Date, me: UUID,
                     pulledUp: UUID? = nil) -> Week {
        let mine = DailyDay.mine(tasks.filter { $0.id != pulledUp }, me: me)
        let plan = PlanSnapshot(tasks: mine, commitments: commitments, focus: focus, routines: [], instances: [],
                                userId: me, domain: nil)
        let today = PlanCalendar.day(today)
        let start = PlanCalendar.day(weekStart)
        let dates = PlanCalendar.weekDays(start)
        let work = plan.lensTasks.filter { !$0.isGoal }
        let first = DailyDay.firstThing(focus: focus, tasks: mine, today: today, me: me)

        func row(_ t: SymphonyTask) -> DailyDay.Row {
            DailyDay.Row(id: t.id, title: t.title, forGoal: WalkEnding.forGoal(t, tasks: mine, goals: goals),
                         done: t.completed, first: t.id == first)
        }
        func lines(on date: Date, withEvents: Bool) -> [Line] {
            let timed = (withEvents ? events(date) : [])
                .filter { $0.type == .event }
                .sorted { ($0.startTime ?? .distantPast, $0.isAllDay ? 0 : 1) < ($1.startTime ?? .distantPast, $1.isAllDay ? 0 : 1) }
                .map { Line.event(id: $0.id, time: $0.isAllDay ? "" : $0.startTime.map(DailyCopy.clock) ?? "",
                                  title: $0.title) }
            let dated = work
                .filter { plan.isDated($0, on: date) }
                .sorted(by: PlanSnapshot.inManualOrder)
                .map { Line.task(row($0)) }
            let all = timed + dated
            return all.isEmpty ? [.open] : all
        }
        func day(_ date: Date, withEvents: Bool = true) -> Day {
            let words = DailyCopy.dayLabel(date)
            return Day(date: date, label: words.label, number: words.number,
                       isToday: PlanCalendar.sameDay(date, today), lines: lines(on: date, withEvents: withEvents))
        }

        let holdsToday = dates.contains { PlanCalendar.sameDay($0, today) }
        var days = (holdsToday ? dates.filter { $0 >= today } : dates).map { day($0) }
        let anyDay = plan.weekList(start)
            .filter { $0.scheduledFor == nil }
            .sorted(by: PlanSnapshot.inManualOrder)
        if !anyDay.isEmpty {
            days.append(Day(date: nil, label: DailyCopy.anyDayLabel.label, number: DailyCopy.anyDayLabel.number,
                            isToday: false, lines: anyDay.map { .task(row($0)) }))
        }

        // The fold exists only for something done or something still open behind today:
        // days that held neither leave no line at all.
        var past: Past?
        if holdsToday {
            let behind = dates.filter { $0 < today }
            let earlier = earlierOpen(plan, work: work, before: start).map { Earlier(row: row($0), day: $0.scheduledFor) }
            let doneBehind = work.filter { t in t.completed && behind.contains { plan.isDated(t, on: $0) } }.count
            let openBehind = work.contains { t in !t.completed && behind.contains { plan.isDated(t, on: $0) } }
            if doneBehind > 0 || openBehind || !earlier.isEmpty {
                let held = behind.map { day($0, withEvents: false) }.filter { $0.lines != [.open] }
                past = Past(label: DailyCopy.pastDays(behind), doneLine: doneBehind > 0 ? DailyCopy.done(doneBehind) : nil,
                            days: held, earlier: earlier)
            }
        }

        return Week(start: start, eyebrow: DailyCopy.weekEyebrow(start, today: today),
                    range: DailyCopy.weekRange(start), past: past, days: days)
    }

    /// The days after today, then Any day: the Duo's left page.
    static func rest(_ week: Week) -> [Day] {
        week.days.filter { !$0.isToday }
    }

    /// Each day from today to the week's last except the task's own, then Any day unless the
    /// task has no day. A day already past is never offered.
    static func chips(for taskDay: Date?, weekStart: Date, today: Date) -> [Chip] {
        let today = PlanCalendar.day(today)
        let days = PlanCalendar.weekDays(PlanCalendar.day(weekStart))
            .filter { $0 >= today && !PlanCalendar.sameDay(taskDay, $0) }
            .map { Chip(label: DailyCopy.chip($0, today: today), day: $0) }
        return taskDay == nil ? days : days + [Chip(label: DailyCopy.chip(nil, today: today), day: nil)]
    }

    // MARK: The band

    /// Two at most of the walk's open month goals (`WalkLoad.items` over
    /// `WalkPeriods.pick(now: today)`, so late in a season they can be next month's): those
    /// this week's tasks serve most first, then the walk's own order. A week's task is one on
    /// its list or dated in it, done or not; it serves the goal it links up to directly. A task
    /// being pulled up (`pulledUp`, its Undo still open) counts for nothing.
    static func bandGoals(tasks: [SymphonyTask], goals: [Goal], commitments: [TaskCommitment], focus: [TaskFocus],
                          weekStart: Date, today: Date, me: UUID,
                          seasons: [SeasonBoundary]? = nil, pulledUp: UUID? = nil) -> [Signpost.Named] {
        let mine = DailyDay.mine(tasks.filter { $0.id != pulledUp }, me: me)
        let plan = PlanSnapshot(tasks: mine, commitments: commitments, focus: focus, routines: [], instances: [],
                                userId: me, domain: nil)
        let start = PlanCalendar.day(weekStart)
        let dates = PlanCalendar.weekDays(start)
        let dated = plan.lensTasks.filter { t in !t.isGoal && dates.contains { plan.isDated(t, on: $0) } }
        var seen = Set<UUID>()
        let onTheWeek = (plan.weekList(start) + dated).filter { seen.insert($0.id).inserted }

        func link(_ t: SymphonyTask) -> UUID? {
            let up = t.sourceId ?? t.goalTaskId
            return up == t.id ? nil : up
        }
        let served = Dictionary(grouping: onTheWeek.compactMap(link), by: { $0 }).mapValues(\.count)

        let periods = WalkPeriods.pick(now: today, seasons: seasons)
        let month = WalkLoad.items(goals: goals, tasks: mine, periods: periods, me: me, planted: [])
            .filter { $0.level == .month && !$0.done }
        return month.enumerated()
            .sorted { a, b in
                let x = served[a.element.id] ?? 0, y = served[b.element.id] ?? 0
                return x != y ? x > y : a.offset < b.offset
            }
            .prefix(2)
            .map { Signpost.Named(id: $0.element.id, title: $0.element.title) }
    }

    // MARK: Helpers

    /// My open tasks dated before the week, and those left on an earlier week with no day
    /// (held there, and on no week from this one on); oldest first, then the list's order.
    private static func earlierOpen(_ plan: PlanSnapshot, work: [SymphonyTask], before weekStart: Date) -> [SymphonyTask] {
        let open = work.filter { !$0.completed }
        // Every week a task was written on: its week commitments, and the older single stamp.
        let starts = Set(plan.commitments.filter { $0.level == "week" }.map { PlanCalendar.day($0.periodStart) }
                         + open.compactMap { $0.weekStart.map(PlanCalendar.day) })
        let stillHeld = Set(starts.filter { $0 >= weekStart }.flatMap { plan.weekList($0).map(\.id) })
        var leftOn: [UUID: Date] = [:]
        for week in starts where week < weekStart {
            for t in plan.weekList(week) where t.scheduledFor == nil && !stillHeld.contains(t.id) {
                leftOn[t.id] = max(leftOn[t.id] ?? week, week)
            }
        }
        let left: [(task: SymphonyTask, since: Date)] = open.compactMap { t in
            if let d = t.scheduledFor {
                let day = PlanCalendar.day(d)
                return day < weekStart ? (t, day) : nil
            }
            return leftOn[t.id].map { (t, $0) }
        }
        return left
            .sorted { $0.since != $1.since ? $0.since < $1.since : PlanSnapshot.inManualOrder($0.task, $1.task) }
            .map(\.task)
    }
}
