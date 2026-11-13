import Testing
import Foundation
import EventKit   // for the notification name only; no EKEventStore is created
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
        let service = AppleCalendarService(source: src, calendar: cal)
        service.refresh(at(13))
        service.refreshWeek(at(9))
        service.refreshPeriod(from: at(1), to: at(30))
        #expect(service.items(for: at(13)) == nil)
        #expect(service.entries(from: at(1), to: at(30)) == nil)
        #expect(src.eventReads == 0)
    }

    @MainActor @Test func grantingAccessLetsADayLoad() async {
        let src = FakeAppleSource(access: .notAsked, events: [ev("a", "Dentist", at(13, 9), at(13, 10))])
        let service = AppleCalendarService(source: src, calendar: cal)
        await service.requestAccess()
        #expect(service.access == .allowed)
        service.refresh(at(13))
        #expect(service.items(for: at(13))?.map(\.title) == ["Dentist"])
        service.refreshWeek(at(9))
        #expect(service.items(for: at(15))?.isEmpty == true)
    }

    @MainActor @Test func deniedGivesNilAndDoesNotThrow() async {
        let src = FakeAppleSource(access: .denied, grants: false)
        let service = AppleCalendarService(source: src, calendar: cal)
        await service.requestAccess()
        service.refresh(at(13))
        #expect(service.access == .denied)
        #expect(service.items(for: at(13)) == nil)
        #expect(src.eventReads == 0)
    }

    @MainActor @Test func rereadsCachedDaysWhenTheCalendarChanges() {
        let src = FakeAppleSource(access: .allowed)
        let service = AppleCalendarService(source: src, calendar: cal)
        service.refresh(at(13))
        #expect(service.items(for: at(13))?.isEmpty == true)
        src.stored = [ev("a", "New", at(13, 9), at(13, 10))]
        service.calendarDidChange()
        #expect(service.items(for: at(13))?.map(\.title) == ["New"])
    }

    @MainActor @Test func theStoreChangedNotificationReachesTheService() async {
        let src = FakeAppleSource(access: .allowed)
        let service = AppleCalendarService(source: src, calendar: cal)
        service.refresh(at(13))
        src.stored = [ev("a", "New", at(13, 9), at(13, 10))]
        NotificationCenter.default.post(name: .EKEventStoreChanged, object: nil)
        for _ in 0..<100 where service.items(for: at(13))?.isEmpty != false {
            try? await Task.sleep(for: .milliseconds(20))
        }
        #expect(service.items(for: at(13))?.map(\.title) == ["New"])
    }

    @MainActor @Test func revokedAccessShowsNothingAndForgetsTheCache() {
        let src = FakeAppleSource(access: .allowed, events: [ev("a", "Dentist", at(13, 9), at(13, 10))])
        let service = AppleCalendarService(source: src, calendar: cal)
        service.refresh(at(13))
        service.refreshPeriod(from: at(1), to: at(30))
        #expect(service.items(for: at(13))?.count == 1)
        #expect(service.entries(from: at(1), to: at(30)) != nil)

        src.access = .denied
        service.calendarDidChange()
        #expect(service.items(for: at(13)) == nil)
        #expect(service.entries(from: at(1), to: at(30)) == nil)

        src.access = .allowed
        service.calendarDidChange()
        #expect(service.items(for: at(13)) == nil)   // nothing stale before a refresh
        #expect(service.entries(from: at(1), to: at(30)) == nil)
        service.refresh(at(13))
        #expect(service.items(for: at(13))?.count == 1)
    }

    // MARK: Daylight saving (America/New_York)

    func nyDate(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h))!
    }

    @Test(arguments: [(2026, 11, 1, 25.0), (2026, 3, 8, 23.0)])
    func daylightSavingDays(year: Int, month: Int, day: Int, hours: Double) {
        let dayStart = nyDate(year, month, day)
        let next = cal.date(byAdding: .day, value: 1, to: dayStart)!
        #expect(next.timeIntervalSince(dayStart) == hours * 3600)

        // 22:00 the night before to 01:00 on the DST day.
        let prev = cal.date(byAdding: .day, value: -1, to: dayStart)!
        let late = ev("a", "Late", cal.date(bySettingHour: 22, minute: 0, second: 0, of: prev)!,
                      cal.date(byAdding: .hour, value: 1, to: dayStart)!)
        let before = AppleCalendarMapper.items([late], on: prev, calendar: cal)
        let after = AppleCalendarMapper.items([late], on: dayStart, calendar: cal)
        #expect(before.count == 1)
        #expect(after.count == 1)
        #expect(after[0].startTime == dayStart)
        #expect(after[0].endTime == dayStart.addingTimeInterval(3600))

        // An event covering the whole DST day is all-day on it.
        let whole = ev("b", "Away", prev, next.addingTimeInterval(3600))
        let item = AppleCalendarMapper.items([whole], on: dayStart, calendar: cal)[0]
        #expect(item.isAllDay)
        #expect(item.startTime == nil)
    }
}
