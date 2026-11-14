import Foundation
import CoreGraphics

/// What light Today draws, read in one place from the store: today's rows, the ring, the
/// next event and the sign. The row being pulled up (hidden while its Undo can still be
/// used, `DailyModel.pulledUp`) is left out of all of them, so nothing on the page counts it.
struct DailyTodayPage: Equatable {
    struct Ring: Equatable {
        let done: Int
        let total: Int
    }

    let rows: [DailyDay.Row]
    /// nil with no rows: an empty day draws no ring.
    let ring: Ring?
    let next: DailyDay.Next?
    let sign: Signpost.Sign?

    static func read(tasks: [SymphonyTask], goals: [Goal], focus: [TaskFocus], commitments: [TaskCommitment],
                     events: [TimelineItem], instances: [ActionableInstance], today: Date, now: Date, me: UUID,
                     seasons: [SeasonBoundary]?, pulledUp: UUID?, dismissed: Set<Signpost.Kind>) -> DailyTodayPage {
        let shown = tasks.filter { $0.id != pulledUp }
        let facts = Signpost.facts(tasks: shown, goals: goals, focus: focus, commitments: commitments,
                                   today: today, me: me, seasons: seasons)
        return DailyTodayPage(
            rows: facts.rows,
            ring: DailyDay.ring(facts.rows).map { Ring(done: $0.done, total: $0.total) },
            next: DailyDay.nextEvent(events, ticked: ticked(instances, on: today), now: now),
            sign: Signpost.pick(facts, dismissed: dismissed))
    }

    /// Calendar events ticked off (or skipped) on this day, by event key: the rule the walk's
    /// next event reads (`WalkModel.nextUp`).
    static func ticked(_ instances: [ActionableInstance], on day: Date) -> Set<String> {
        Set(instances
            .filter { $0.entityType == "calendar_event" && ($0.status == "completed" || $0.status == "skipped")
                && PlanCalendar.sameDay($0.date, day) }
            .map(\.entityId))
    }

    /// A row's "First today" / "Not first today": the mark moves to `row` from the row now
    /// first, or, on the first row, comes off it. For `DailyModel.setFirst(_:previous:)`.
    func firstMark(toggling row: DailyDay.Row) -> (id: UUID?, previous: UUID?) {
        if row.first { return (nil, row.id) }
        return (row.id, rows.first(where: \.first)?.id)
    }

    /// A sideways swipe of more than this many points puts the sign away for the day.
    static let putAwaySwipe: CGFloat = 60

    static func putsSignAway(swipe dx: CGFloat) -> Bool { abs(dx) > putAwaySwipe }
}
