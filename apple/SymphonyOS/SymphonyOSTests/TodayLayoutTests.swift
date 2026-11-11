import Testing
import Foundation
@testable import Symphony

/// One Today per Duo screen and way of holding it (Scott, 2026-11-11).
struct TodayLayoutTests {
    @Test func duoScreens() {
        // Outside screen upright: the system's bars in a side column.
        #expect(TodayLayout.decide(width: 394, height: 678, sideBars: true) == .glance)
        // Outside screen sideways: short and wide.
        #expect(TodayLayout.decide(width: 678, height: 466, sideBars: false) == .glanceWide)
        // Inside screen upright.
        #expect(TodayLayout.decide(width: 626, height: 890, sideBars: false) == .dayPage)
        // Inside screen sideways (the side column taken off its width).
        #expect(TodayLayout.decide(width: 818, height: 626, sideBars: true) == .journal)
    }

    @Test func regularIPhoneKeepsItsToday() {
        #expect(TodayLayout.decide(width: 402, height: 874, sideBars: false) == .oneColumn)
        // On its side it is short: the glance, not two cramped columns.
        #expect(TodayLayout.decide(width: 874, height: 402, sideBars: false) == .glanceWide)
        #expect(TodayLayout.decide(width: 0, height: 0, sideBars: false) == .oneColumn)
    }

    @Test func agendaPutsNowBeforeWhatIsStillToCome() {
        let cal = Calendar.current
        let day = cal.startOfDay(for: Date())
        func at(_ h: Int, _ m: Int = 0) -> Date { cal.date(bySettingHour: h, minute: m, second: 0, of: day)! }
        func item(_ id: String, _ start: Date?, allDay: Bool = false) -> TimelineItem {
            TimelineItem(id: id, type: .event, title: id, startTime: start, isAllDay: allDay, completed: false, context: nil, entityId: UUID())
        }
        let rows = DayAgenda.rows(items: [item("lunch", at(11, 30)), item("specials", nil, allDay: true), item("feed", at(7))], now: at(10, 35))
        #expect(rows.map(\.id) == ["specials", "feed", "now", "lunch"])
        // Another day: no now line.
        #expect(DayAgenda.rows(items: [item("feed", at(7))], now: nil).map(\.id) == ["feed"])
    }

    /// The Lock Screen's next up: on from two hours before, with what's after.
    @MainActor @Test func nextUpShowsWithinTwoHours() {
        let now = Date()
        func item(_ id: String, in minutes: Double) -> TimelineItem {
            TimelineItem(id: id, type: .event, title: id, startTime: now.addingTimeInterval(minutes * 60), isAllDay: false,
                         completed: false, context: nil, entityId: UUID())
        }
        let soon = NextUpActivity.state(items: [item("Lunch with Mom", in: 55), item("Pick up", in: 300)], now: now)
        #expect(soon?.title == "Lunch with Mom")
        #expect(soon?.then?.hasSuffix("Pick up") == true)
        #expect(NextUpActivity.state(items: [item("Later", in: 180)], now: now) == nil)
    }
}
