import Testing
import Foundation
@testable import Symphony

/// A Google side that never touches the network and counts what it is asked.
@MainActor
final class FakeGoogle: GoogleCalendarReading {
    private(set) var refreshCalls = 0
    var answer: [TimelineItem]? = nil
    func items(for date: Date) -> [TimelineItem]? { answer }
    func isLoading(_ date: Date) -> Bool { false }
    func refresh(_ date: Date, maxAge: TimeInterval) async { refreshCalls += 1 }
    func refreshWeek(_ weekStart: Date) async { refreshCalls += 1 }
    func entries(from start: Date, to end: Date) -> [PeriodCalendar.Entry]? { nil }
    func periodFailed(from start: Date, to end: Date) -> Bool { false }
    func refreshPeriod(from start: Date, to end: Date, maxAge: TimeInterval) async { refreshCalls += 1 }
}

@MainActor
struct CalendarFeedTests {
    var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/New_York")!
        return c
    }
    func at(_ d: Int, _ h: Int = 0) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 11, day: d, hour: h))!
    }
    var dentist: AppleEvent {
        AppleEvent(id: "a", title: "Dentist", start: at(13, 9), end: at(13, 10),
                   isAllDay: false, location: nil, declined: false)
    }
    func make(_ source: FakeAppleSource, _ google: FakeGoogle, _ edition: Edition?) -> (CalendarFeed, AppleCalendarService) {
        let service = AppleCalendarService(source: source, calendar: cal)
        let feed = CalendarFeed(apple: service, google: google)
        feed.edition = edition
        return (feed, service)
    }

    @Test func fullIsGoogleAndLightIsApple() {
        #expect(CalendarFeed.source(for: .full) == .google)
        #expect(CalendarFeed.source(for: .light) == .apple)
    }

    @Test func unknownEditionReadsNothingFromEitherSource() async {
        let source = FakeAppleSource(access: .allowed, events: [dentist])
        let google = FakeGoogle()
        let (feed, _) = make(source, google, nil)
        #expect(feed.items(for: at(13)) == nil)
        #expect(feed.entries(from: at(1), to: at(30)) == nil)
        #expect(!feed.isLoading(at(13)))
        #expect(!feed.periodFailed(from: at(1), to: at(30)))
        await feed.refresh(at(13))
        await feed.refreshWeek(at(9))
        await feed.refreshPeriod(from: at(1), to: at(30))
        #expect(google.refreshCalls == 0)
        #expect(source.eventReads == 0)
    }

    @Test func lightNotAskedIsEmptyNotLoadingNotFailed() {
        let source = FakeAppleSource(access: .notAsked)
        let (feed, _) = make(source, FakeGoogle(), .light)
        #expect(feed.items(for: at(13))?.isEmpty == true)
        #expect(feed.entries(from: at(1), to: at(30))?.isEmpty == true)
        #expect(!feed.isLoading(at(13)))
        #expect(!feed.periodFailed(from: at(1), to: at(30)))
    }

    @Test func lightNeverCallsGoogleAndShowsAppleAfterGrant() async {
        let source = FakeAppleSource(access: .notAsked, events: [dentist])
        let google = FakeGoogle()
        let (feed, service) = make(source, google, .light)
        await service.requestAccess()
        await feed.refresh(at(13))
        await feed.refreshWeek(at(9))
        await feed.refreshPeriod(from: at(1), to: at(30))
        #expect(google.refreshCalls == 0)
        #expect(source.eventReads > 0)
        #expect(feed.items(for: at(13))?.map(\.title) == ["Dentist"])
    }

    @Test func fullReadsGoogleOnlyAndIgnoresAppleCache() async {
        let source = FakeAppleSource(access: .allowed, events: [dentist])
        let google = FakeGoogle()
        let (feed, service) = make(source, google, .full)
        service.refresh(at(13))                        // Apple has the day cached
        let readsBefore = source.eventReads
        #expect(service.items(for: at(13))?.count == 1)
        await feed.refresh(at(13))
        #expect(google.refreshCalls == 1)
        #expect(source.eventReads == readsBefore)      // the feed read nothing from Apple
        #expect(feed.items(for: at(13)) == nil)        // Google's answer, not Apple's
    }

    @Test func refreshKeyFollowsEditionAndLightAccess() async {
        let source = FakeAppleSource(access: .notAsked)
        let (feed, service) = make(source, FakeGoogle(), nil)
        let unknown = feed.refreshKey
        feed.edition = .light
        let notAsked = feed.refreshKey
        #expect(notAsked != unknown)
        await service.requestAccess()
        #expect(feed.refreshKey != notAsked)
    }

    @Test func refreshKeyIgnoresAppleAccessForFull() async {
        let source = FakeAppleSource(access: .notAsked)
        let (feed, service) = make(source, FakeGoogle(), .full)
        let before = feed.refreshKey
        await service.requestAccess()
        #expect(feed.refreshKey == before)
    }

    @Test func readKeyChangesWithDayAndSourceAndIsStableOtherwise() {
        let (feed, _) = make(FakeAppleSource(access: .notAsked), FakeGoogle(), nil)
        let unknown = feed.readKey(for: at(13))
        feed.edition = .full
        let full = feed.readKey(for: at(13))
        #expect(full != unknown)
        #expect(feed.readKey(for: at(13, 15)) == full)      // same day, other hour
        #expect(feed.readKey(for: at(14)) != full)           // other day
        feed.edition = .light
        #expect(feed.readKey(for: at(13)) != full)           // other source
    }
}
