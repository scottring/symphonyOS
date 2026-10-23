import Testing
import Foundation
@testable import Symphony

/// The outside screen's "Now / Next" card.
struct DayGlanceTests {
    func at(_ h: Int, _ m: Int = 0) -> Date {
        Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 23, hour: h, minute: m))!
    }
    func item(_ title: String, _ start: Date?, _ end: Date? = nil, allDay: Bool = false, done: Bool = false) -> TimelineItem {
        var i = TimelineItem(id: title, type: .event, title: title, startTime: start, isAllDay: allDay,
                             completed: done, context: nil, entityId: UUID())
        i.endTime = end
        return i
    }

    var day: [TimelineItem] {
        [item("Pick up kids", at(15, 15), at(15, 30)),
         item("Boxing", at(9), at(10, 15)),
         item("Walk kids to school", at(7, 15), at(7, 35)),
         item("Dinner", at(18)),
         item("Ella PE", nil, allDay: true)]
    }

    @Test func leadsWithTheNextThingAndTheTwoAfterIt() {
        let g = DayGlance.make(items: day, now: at(8, 35), isToday: true)
        #expect(g.lead == .next)
        #expect(g.featured?.title == "Boxing")
        #expect(g.then.map(\.title) == ["Pick up kids", "Dinner"])
        #expect(g.allDay.map(\.title) == ["Ella PE"])
    }

    @Test func leadsWithWhatIsUnderWayNow() {
        let g = DayGlance.make(items: day, now: at(9, 30), isToday: true)
        #expect(g.lead == .now)
        #expect(g.featured?.title == "Boxing")
    }

    @Test func anotherDayLeadsWithItsFirstTimedThing() {
        let g = DayGlance.make(items: day, now: at(20), isToday: false)
        #expect(g.lead == .first)
        #expect(g.featured?.title == "Walk kids to school")
    }

    @Test func nothingLeftAfterTheLastThingAndTickedTasksDropOut() {
        let late = DayGlance.make(items: day, now: at(19), isToday: true)
        #expect(late.featured == nil && late.timedCount == 4)
        let ticked = DayGlance.make(items: [item("Call", at(10), done: true)], now: at(8), isToday: true)
        #expect(ticked.featured == nil && ticked.timedCount == 0)
    }

    @Test func countdownReadsPlainly() {
        #expect(DayGlance.countdown(from: at(8, 35), to: at(9)) == "in 25 min")
        #expect(DayGlance.countdown(from: at(7), to: at(9)) == "in 2 hr")
        #expect(DayGlance.countdown(from: at(7, 50), to: at(9)) == "in 1 hr 10 min")
    }
}
