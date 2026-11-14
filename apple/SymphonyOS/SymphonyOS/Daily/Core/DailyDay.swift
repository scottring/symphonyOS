import Foundation

/// Today for the light pages: the rows, what each is for, which comes first,
/// the ring, the next event, and tomorrow's first task.
enum DailyDay {
    typealias Row = WalkEnding.Row

    struct Next: Equatable {
        let title: String
        let start: Date
    }

    /// The signed-in person's own rows the light pages may show: theirs, personal or with no life area, not let go, not a step.
    static func mine(_ tasks: [SymphonyTask], me: UUID) -> [SymphonyTask] {
        tasks.filter {
            $0.userId == me && ($0.context == nil || $0.context == "personal")
                && $0.dismissedAt == nil && $0.parentTaskId == nil
        }
    }

    /// The open task of my oldest `TaskFocus` row for today (by `createdAt`, then id), if that task is mine and dated today.
    static func firstThing(focus: [TaskFocus], tasks: [SymphonyTask], today: Date, me: UUID) -> UUID? {
        let open = Set(mine(tasks, me: me)
            .filter { !$0.completed && PlanCalendar.sameDay($0.scheduledFor, today) }
            .map(\.id))
        return focus
            .filter { $0.userId == me && PlanCalendar.sameDay($0.date, today) && open.contains($0.taskId) }
            .min {
                if $0.createdAt != $1.createdAt { return $0.createdAt < $1.createdAt }
                return $0.id.uuidString < $1.id.uuidString
            }?
            .taskId
    }

    /// Today's rows, the first thing first, each with what it is for (`WalkEnding.forGoal`).
    static func rows(tasks: [SymphonyTask], goals: [Goal], focus: [TaskFocus], today: Date, me: UUID) -> [Row] {
        WalkEnding.rows(tasks: tasks, goals: goals, today: today, me: me,
                        firstThing: firstThing(focus: focus, tasks: tasks, today: today, me: me))
    }

    /// Done and total; nil with no rows, so an empty day draws no ring.
    static func ring(_ rows: [Row]) -> (done: Int, total: Int)? {
        rows.isEmpty ? nil : (rows.filter(\.done).count, rows.count)
    }

    /// The half-open display: the open rows in order, and the done ones as a count.
    static func split(_ rows: [Row]) -> (open: [Row], done: Int) {
        (rows.filter { !$0.done }, rows.filter(\.done).count)
    }

    /// The earliest timed event still to come: not all day, not ticked off (by `eventKey`).
    /// The rule `WalkModel.nextUp` uses.
    static func nextEvent(_ events: [TimelineItem], ticked: Set<String>, now: Date) -> Next? {
        events
            .compactMap { item -> Next? in
                guard item.type == .event, !item.isAllDay, let start = item.startTime, start > now,
                      !(item.eventKey.map(ticked.contains) ?? false) else { return nil }
                return Next(title: item.title, start: start)
            }
            .min { $0.start < $1.start }
    }

    /// The first open task of `mine` dated tomorrow, in the list's own order.
    static func tomorrowFirst(tasks: [SymphonyTask], today: Date, me: UUID) -> SymphonyTask? {
        let tomorrow = PlanCalendar.addDays(today, 1)
        return mine(tasks, me: me)
            .filter { !$0.completed && PlanCalendar.sameDay($0.scheduledFor, tomorrow) }
            .min(by: PlanSnapshot.inManualOrder)
    }
}
