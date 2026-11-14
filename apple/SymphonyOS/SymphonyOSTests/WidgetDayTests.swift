import Testing
import Foundation
@testable import Symphony

/// What the Home Screen widgets say at a given minute, from the days the app
/// last wrote.
struct WidgetDayTests {
    let cal = Calendar.current
    func at(_ h: Int, _ m: Int = 0, day: Int = 14) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 11, day: day, hour: h, minute: m))!
    }
    func timed(_ title: String, _ start: Date, _ end: Date? = nil, done: Bool = false) -> WidgetDay.Timed {
        .init(id: title, title: title, start: start, end: end, location: nil, completed: done)
    }
    func toDo(_ title: String, done: Bool = false, waiting: Bool = false) -> WidgetDay.ToDo {
        .init(id: title, title: title, completed: done, waiting: waiting)
    }
    var snapshot: WidgetSnapshot {
        WidgetSnapshot(writtenAt: at(7), days: [
            WidgetDay(date: at(0),
                      timed: [timed("Dentist", at(14, 30), at(15, 15)), timed("Boxing", at(9), at(10, 15)),
                              timed("Pickup", at(17, 15), at(17, 30)), timed("Skipped", at(11), at(12), done: true)],
                      allDay: ["Library books due"],
                      toDo: [toDo("Call the plumber"), toDo("Water the plants", done: true), toDo("Hear from Sam", waiting: true)],
                      dinner: "Tacos", eventsLoaded: true),
            WidgetDay(date: at(0, day: 15), timed: [timed("Team call", at(9, day: 15))],
                      allDay: [], toDo: [], dinner: nil, eventsLoaded: true),
        ])
    }

    @Test func leadsWithTheNextThingAndListsTheRestInOrder() {
        let m = WidgetMoment.make(snapshot, now: at(8))
        #expect(m.lead == .next)
        #expect(m.featured?.title == "Boxing")
        #expect(m.later.map(\.title) == ["Dentist", "Pickup"])   // the ticked-off one drops out
        #expect(m.tomorrowFirst?.title == "Team call")
    }

    @Test func saysNowWhileSomethingIsUnderWay() {
        let m = WidgetMoment.make(snapshot, now: at(9, 30))
        #expect(m.lead == .now)
        #expect(m.featured?.title == "Boxing")
        #expect(m.countdown == nil)
    }

    @Test func countsDownOnlyInsideTheLastHour() {
        #expect(WidgetMoment.make(snapshot, now: at(12)).countdown == nil)
        #expect(WidgetMoment.make(snapshot, now: at(13, 30)).countdown == "in 1 hr")
        #expect(WidgetMoment.make(snapshot, now: at(14, 5)).countdown == "in 25 min")
        #expect(WidgetMoment.make(snapshot, now: at(14, 29)).countdown == "in 1 min")
    }

    @Test func afterTheLastThingNothingIsFeatured() {
        let m = WidgetMoment.make(snapshot, now: at(18))
        #expect(m.day != nil)
        #expect(m.featured == nil)
        #expect(m.lead == nil)
    }

    @Test func rollsOverToTomorrowWithoutTheApp() {
        let m = WidgetMoment.make(snapshot, now: at(8, day: 15))
        #expect(m.featured?.title == "Team call")
        #expect(m.day?.toDo.isEmpty == true)
    }

    @Test func aDayTheAppNeverWroteIsNotGuessed() {
        #expect(WidgetMoment.make(snapshot, now: at(8, day: 16)).day == nil)
        #expect(WidgetMoment.make(nil, now: at(8)).day == nil)
    }

    @Test func waitingAndDoneAreNotLeftToDo() {
        let day = snapshot.days[0]
        #expect(day.openToDo.map(\.title) == ["Call the plumber"])
        #expect(day.doneToDo == 1)
    }

    @Test func changesAtStartsEndsCountdownMinutesAndMidnight() {
        let dates = snapshot.changeDates(from: at(13), until: at(17))
        #expect(dates == dates.sorted())
        #expect(Set(dates).count == dates.count)
        #expect(dates.contains(at(14, 30)))          // Dentist starts
        #expect(dates.contains(at(15, 15)))          // and ends
        #expect(dates.contains(at(14, 5)))           // "in 25 min"
        #expect(!dates.contains(at(13)))             // nothing at or before now
        #expect(!dates.contains(at(11)))             // nor for the ticked-off one
        #expect(dates.allSatisfy { $0 > at(13) && $0 <= at(17) })
        #expect(snapshot.changeDates(from: at(23), until: at(1, day: 15)).contains(at(0, day: 15)))
    }

    @Test func writesOnlyWhenTheDaysChange() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("widget-days-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(WidgetStore.write(snapshot, to: url))
        #expect(WidgetStore.read(from: url) == snapshot)
        var later = snapshot
        later.writtenAt = at(9)
        #expect(!WidgetStore.write(later, to: url))            // same days: no rewrite, no reload
        later.days[0].toDo[0].completed = true
        #expect(WidgetStore.write(later, to: url))
        #expect(WidgetStore.clear(at: url))
        #expect(WidgetStore.read(from: url) == nil)
    }

    @Test @MainActor func aDayIsBuiltFromTodaysSchedule() {
        var event = TimelineItem(id: "e", type: .event, title: "Dentist", startTime: at(14, 30), isAllDay: false,
                                 completed: false, context: nil, entityId: UUID())
        event.endTime = at(15, 15)
        event.location = "Charles St."
        let allDay = TimelineItem(id: "a", type: .event, title: "Library books due", startTime: nil, isAllDay: true,
                                  completed: false, context: nil, entityId: UUID())
        var waiting = TimelineItem(id: "w", type: .task, title: "Hear from Sam", startTime: nil, isAllDay: false,
                                   completed: false, context: nil, entityId: UUID())
        waiting.isWaiting = true
        let day = WidgetFeed.day(date: at(10), schedule: [allDay, event], forToday: [waiting],
                                 dinner: "Tacos", eventsLoaded: true)
        #expect(day.date == at(0))
        #expect(day.timed == [.init(id: "e", title: "Dentist", start: at(14, 30), end: at(15, 15),
                                    location: "Charles St.", completed: false)])
        #expect(day.allDay == ["Library books due"])
        #expect(day.toDo.first?.waiting == true)
        #expect(day.dinner == "Tacos")
    }
}
