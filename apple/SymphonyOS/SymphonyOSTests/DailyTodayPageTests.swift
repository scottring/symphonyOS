import Testing
import Foundation
import CoreGraphics
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
}

// What light Today draws, read in one place: the rows, the ring, the next event and the
// sign, with the row being pulled up left out of all of them while its Undo can be used.
@MainActor
struct DailyTodayPageTests {
    let me = UUID()
    let today = day(2026, 11, 10)
    let noon = day(2026, 11, 10, 12)

    private func task(_ title: String, on date: Date?, created: Double) -> SymphonyTask {
        let t = SymphonyTask(id: UUID(), userId: me, title: title, completed: false, scheduledFor: date,
                             context: "personal", notes: nil)
        t.createdAt = Date(timeIntervalSince1970: created)
        return t
    }

    private func event(_ title: String, at hour: Int) -> TimelineItem {
        TimelineItem(id: "e-\(title)", type: .event, title: title, startTime: day(2026, 11, 10, hour), isAllDay: false,
                     completed: false, context: nil, entityId: UUID(), eventKey: "key-\(title)")
    }

    private func read(_ tasks: [SymphonyTask], focus: [TaskFocus] = [], events: [TimelineItem] = [],
                      instances: [ActionableInstance] = [], pulledUp: UUID? = nil,
                      dismissed: Set<Signpost.Kind> = []) -> DailyTodayPage {
        DailyTodayPage.read(tasks: tasks, goals: [], focus: focus, commitments: [], events: events,
                            instances: instances, today: today, now: noon, me: me, seasons: nil, pulledUp: pulledUp,
                            dismissed: dismissed)
    }

    @Test func aPulledUpRowIsLeftOutOfTheRowsTheRingAndTheSign() {
        let first = task("Send the contractor the deposit", on: today, created: 1)
        let other = task("Renew the passport", on: today, created: 2)
        let focus = [TaskFocus(taskId: first.id, userId: me, date: today)]

        let before = read([first, other], focus: focus)
        #expect(before.rows.map(\.title) == ["Send the contractor the deposit", "Renew the passport"])
        #expect(before.ring == .init(done: 0, total: 2))
        #expect(before.sign?.kind == .firstToday)

        let after = read([first, other], focus: focus, pulledUp: first.id)
        #expect(after.rows.map(\.title) == ["Renew the passport"])
        #expect(after.ring == .init(done: 0, total: 1))
        #expect(after.sign?.kind != .firstToday)
        #expect(after.sign?.title != "Send the contractor the deposit")
    }

    @Test func anEmptyDayDrawsNoRing() {
        #expect(read([]).ring == nil)
        #expect(read([]).rows.isEmpty)
    }

    @Test func theNextEventIsTheEarliestStillToComeAndNotTickedOff() {
        let events = [event("Earlier", at: 9), event("Meeting", at: 15), event("Pickup", at: 16)]
        #expect(read([], events: events).next?.title == "Meeting")

        let ticked = ActionableInstance(userId: me, entityType: "calendar_event", entityId: "key-Meeting", date: today)
        ticked.status = "completed"
        #expect(read([], events: events, instances: [ticked]).next?.title == "Pickup")

        let yesterdays = ActionableInstance(userId: me, entityType: "calendar_event", entityId: "key-Meeting",
                                            date: day(2026, 11, 9))
        yesterdays.status = "completed"
        #expect(read([], events: events, instances: [yesterdays]).next?.title == "Meeting")
    }

    @Test func aSignPutAwayGivesWayToTheNext() {
        let first = task("Send the contractor the deposit", on: today, created: 1)
        let focus = [TaskFocus(taskId: first.id, userId: me, date: today)]
        #expect(read([first], focus: focus).sign?.kind == .firstToday)
        #expect(read([first], focus: focus, dismissed: [.firstToday]).sign?.kind != .firstToday)
    }

    @Test func firstTodayMovesTheMarkAndNotFirstTakesItOff() {
        let first = task("Send the contractor the deposit", on: today, created: 1)
        let other = task("Renew the passport", on: today, created: 2)
        let page = read([first, other], focus: [TaskFocus(taskId: first.id, userId: me, date: today)])
        let marked = page.rows[0], plain = page.rows[1]
        #expect(page.firstMark(toggling: plain).id == other.id)
        #expect(page.firstMark(toggling: plain).previous == first.id)
        #expect(page.firstMark(toggling: marked).id == nil)
        #expect(page.firstMark(toggling: marked).previous == first.id)

        let none = read([first, other])
        #expect(none.firstMark(toggling: none.rows[1]).id == other.id)
        #expect(none.firstMark(toggling: none.rows[1]).previous == nil)
    }

    @Test func aGestureOnTheSignDoesExactlyOneThing() {
        typealias G = DailyTodayPage
        // A touch that never became a drag follows the sign.
        #expect(G.signGesture(translation: .zero, endedAsDrag: false) == .followed)
        #expect(G.signGesture(translation: CGSize(width: 3, height: 2), endedAsDrag: false) == .followed)
        // A drag past the threshold puts it away; a shorter one does nothing.
        #expect(G.signGesture(translation: CGSize(width: 61, height: 0), endedAsDrag: true) == .putAway)
        #expect(G.signGesture(translation: CGSize(width: -90, height: 12), endedAsDrag: true) == .putAway)
        #expect(G.signGesture(translation: CGSize(width: 40, height: 0), endedAsDrag: true) == .nothing)
        #expect(G.signGesture(translation: CGSize(width: 0, height: 80), endedAsDrag: true) == .nothing)
        // Not tappable: a touch does nothing, a swipe still puts it away.
        #expect(G.signGesture(translation: .zero, endedAsDrag: false, tappable: false) == .nothing)
        #expect(G.signGesture(translation: CGSize(width: 70, height: 0), endedAsDrag: false, tappable: false) == .putAway)
        // Any movement past the drag's start is a drag, whatever the gesture reported: never followed.
        for dx in stride(from: -200.0, through: 200.0, by: 1) {
            for dy in [-30.0, -G.dragStarts, 0, G.dragStarts, 30] {
                let t = CGSize(width: dx, height: dy)
                let moved = (dx * dx + dy * dy).squareRoot() >= G.dragStarts
                for ended in [false, true] where moved || ended {
                    #expect(G.signGesture(translation: t, endedAsDrag: ended) != .followed)
                }
            }
        }
    }

    @Test func aSwipeOfMoreThanSixtyPointsPutsTheSignAway() {
        #expect(!DailyTodayPage.putsSignAway(swipe: 60))
        #expect(!DailyTodayPage.putsSignAway(swipe: -60))
        #expect(DailyTodayPage.putsSignAway(swipe: 61))
        #expect(DailyTodayPage.putsSignAway(swipe: -61))
    }
}
