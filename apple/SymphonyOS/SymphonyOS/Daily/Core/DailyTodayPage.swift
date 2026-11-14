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
    /// next event reads. Kept word for word with its copy in `WalkModel.nextUp` (the walk's
    /// own code is left as it is): change one, change the other.
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

    /// What one gesture on the sign does: exactly one of these, never two.
    enum SignGesture: Equatable { case followed, putAway, nothing }

    /// A finger that moves this far (any way) from where it went down is dragging, not tapping.
    static let dragStarts: CGFloat = 12

    /// A touch that never became a drag follows the sign (when it can be followed); a drag puts
    /// it away when it went more than `putAwaySwipe` sideways, and otherwise does nothing. Any
    /// movement past `dragStarts` is a drag, whatever the gesture reported, so it never follows.
    static func signGesture(translation: CGSize, endedAsDrag: Bool, tappable: Bool = true) -> SignGesture {
        if endedAsDrag || isDrag(translation) { return putsSignAway(swipe: translation.width) ? .putAway : .nothing }
        return tappable ? .followed : .nothing
    }

    /// The finger has moved `dragStarts` or more from where it went down.
    static func isDrag(_ translation: CGSize) -> Bool {
        (translation.width * translation.width + translation.height * translation.height).squareRoot() >= dragStarts
    }

    /// A sideways swipe of more than this many points puts the sign away for the day.
    static let putAwaySwipe: CGFloat = 60

    static func putsSignAway(swipe dx: CGFloat) -> Bool { abs(dx) > putAwaySwipe }
}
