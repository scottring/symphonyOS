import Testing
import Foundation
@testable import Symphony

/// A source that never touches EventKit.
final class FakeAppleSource: AppleEventSource, @unchecked Sendable {
    var access: AppleCalendarAccess
    var grants: Bool
    var stored: [AppleEvent]
    private(set) var eventReads = 0
    init(access: AppleCalendarAccess, grants: Bool = true, events: [AppleEvent] = []) {
        self.access = access; self.grants = grants; self.stored = events
    }
    func requestAccess() async -> Bool {
        access = grants ? .allowed : .denied
        return grants
    }
    func events(from start: Date, to end: Date) -> [AppleEvent] {
        eventReads += 1
        return stored.filter { $0.start < end && $0.end > start }
    }
}

struct AppleCalendarTests {
    var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/New_York")!
        return c
    }
    func at(_ d: Int, _ h: Int = 0, _ m: Int = 0) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 11, day: d, hour: h, minute: m))!
    }
    func ev(_ id: String, _ title: String, _ s: Date, _ e: Date, allDay: Bool = false, declined: Bool = false) -> AppleEvent {
        AppleEvent(id: id, title: title, start: s, end: e, isAllDay: allDay, location: nil, declined: declined)
    }

    @Test func timedEventMapsToOneEventItem() {
        let e = AppleEvent(id: "a", title: "Dentist", start: at(13, 9), end: at(13, 10), isAllDay: false, location: "Main St", declined: false)
        let items = AppleCalendarMapper.items([e], on: at(13), calendar: cal)
        #expect(items.count == 1)
        #expect(items[0].type == .event)
        #expect(items[0].title == "Dentist")
        #expect(items[0].startTime == at(13, 9))
        #expect(items[0].endTime == at(13, 10))
        #expect(items[0].location == "Main St")
        #expect(items[0].eventKey == nil)
        #expect(items[0].id.hasPrefix("ekcal-"))
        #expect(AppleCalendarMapper.items([e], on: at(14), calendar: cal).isEmpty)
    }

    @Test func allDayEventHasNoStartTime() {
        let e = ev("a", "Holiday", at(13), at(14), allDay: true)
        let item = AppleCalendarMapper.items([e], on: at(13), calendar: cal)[0]
        #expect(item.isAllDay)
        #expect(item.startTime == nil)
    }

    @Test func eventPastMidnightAppearsOnBothDays() {
        let e = ev("a", "Party", at(13, 22), at(14, 1))
        let first = AppleCalendarMapper.items([e], on: at(13), calendar: cal)[0]
        let second = AppleCalendarMapper.items([e], on: at(14), calendar: cal)[0]
        #expect(first.startTime == at(13, 22))
        #expect(second.startTime == at(14))
        #expect(second.endTime == at(14, 1))
        #expect(first.id != second.id)
    }

    @Test func middleDayOfAMultiDayEventIsAllDay() {
        let e = ev("a", "Trip", at(12, 15), at(14, 11))
        let mid = AppleCalendarMapper.items([e], on: at(13), calendar: cal)[0]
        #expect(mid.isAllDay)
        #expect(mid.startTime == nil)
    }

    @Test func eventEndingAtMidnightStaysOffTheNextDay() {
        let e = ev("a", "Late", at(13, 22), at(14))
        #expect(AppleCalendarMapper.items([e], on: at(13), calendar: cal).count == 1)
        #expect(AppleCalendarMapper.items([e], on: at(14), calendar: cal).isEmpty)
    }

    @Test func declinedEventIsDropped() {
        let e = ev("a", "No thanks", at(13, 9), at(13, 10), declined: true)
        #expect(AppleCalendarMapper.items([e], on: at(13), calendar: cal).isEmpty)
        #expect(AppleCalendarMapper.entries([ev("b", "No", at(13), at(14), allDay: true, declined: true)], calendar: cal).isEmpty)
    }

    @Test func ordersAllDayFirstThenStartThenTitle() {
        let events = [
            ev("1", "Zed", at(13, 9), at(13, 10)),
            ev("2", "Alpha", at(13, 9), at(13, 10)),
            ev("3", "Early", at(13, 8), at(13, 8, 30)),
            ev("4", "Birthday", at(13), at(14), allDay: true),
        ]
        let titles = AppleCalendarMapper.items(events, on: at(13), calendar: cal).map(\.title)
        #expect(titles == ["Birthday", "Early", "Alpha", "Zed"])
    }

    @Test func repeatingOccurrencesGetDifferentIds() {
        let a = ev("series", "Class", at(13, 9), at(13, 10))
        let b = ev("series", "Class", at(14, 9), at(14, 10))
        let ia = AppleCalendarMapper.items([a, b], on: at(13), calendar: cal)[0].id
        let ib = AppleCalendarMapper.items([a, b], on: at(14), calendar: cal)[0].id
        #expect(ia != ib)
    }

    @Test func entriesCoverEachDayOfAllDayAndMultiDayEvents() {
        let events = [
            ev("1", "Trip", at(12, 15), at(14, 11)),
            ev("2", "Holiday", at(20), at(21), allDay: true),
            ev("3", "Lunch", at(13, 12), at(13, 13)),
            ev("4", "Late", at(15, 22), at(16)),
        ]
        let entries = AppleCalendarMapper.entries(events, calendar: cal)
        #expect(entries == [
            .init(day: at(12), title: "Trip"), .init(day: at(13), title: "Trip"), .init(day: at(14), title: "Trip"),
            .init(day: at(20), title: "Holiday"),
        ])
    }

    // MARK: Service

    @MainActor @Test func neverReadsEventsUntilAllowed() {
        let src = FakeAppleSource(access: .notAsked)
        let service = AppleCalendarService(source: src)
        service.refresh(at(13))
        service.refreshWeek(at(9))
        service.refreshPeriod(from: at(1), to: at(30))
        #expect(service.items(for: at(13)) == nil)
        #expect(service.entries(from: at(1), to: at(30)) == nil)
        #expect(src.eventReads == 0)
    }

    @MainActor @Test func grantingAccessLetsADayLoad() async {
        let src = FakeAppleSource(access: .notAsked, events: [ev("a", "Dentist", at(13, 9), at(13, 10))])
        let service = AppleCalendarService(source: src)
        await service.requestAccess()
        #expect(service.access == .allowed)
        service.refresh(at(13))
        #expect(service.items(for: at(13))?.map(\.title) == ["Dentist"])
        service.refreshWeek(at(9))
        #expect(service.items(for: at(15))?.isEmpty == true)
    }

    @MainActor @Test func deniedGivesNilAndDoesNotThrow() async {
        let src = FakeAppleSource(access: .denied, grants: false)
        let service = AppleCalendarService(source: src)
        await service.requestAccess()
        service.refresh(at(13))
        #expect(service.access == .denied)
        #expect(service.items(for: at(13)) == nil)
        #expect(src.eventReads == 0)
    }

    @MainActor @Test func rereadsCachedDaysWhenTheCalendarChanges() async {
        let src = FakeAppleSource(access: .allowed)
        let service = AppleCalendarService(source: src)
        service.refresh(at(13))
        #expect(service.items(for: at(13))?.isEmpty == true)
        src.stored = [ev("a", "New", at(13, 9), at(13, 10))]
        NotificationCenter.default.post(name: Notification.Name("EKEventStoreChangedNotification"), object: nil)
        await Task.yield()
        #expect(service.items(for: at(13))?.map(\.title) == ["New"])
    }
}
