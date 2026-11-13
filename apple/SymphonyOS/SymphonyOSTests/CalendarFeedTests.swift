import Testing
import Foundation
@testable import Symphony

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
    func lightFeed(_ source: FakeAppleSource) -> CalendarFeed {
        let feed = CalendarFeed(apple: AppleCalendarService(source: source, calendar: cal))
        feed.edition = .light
        return feed
    }

    @Test func fullIsGoogleAndLightIsApple() {
        #expect(CalendarFeed.source(for: .full) == .google)
        #expect(CalendarFeed.source(for: .light) == .apple)
    }

    @Test func lightWithoutAccessIsEmptyNotLoadingNotFailed() {
        let source = FakeAppleSource(access: .notAsked)
        let feed = lightFeed(source)
        #expect(feed.items(for: at(13))?.isEmpty == true)
        #expect(feed.entries(from: at(1), to: at(30))?.isEmpty == true)
        #expect(!feed.isLoading(at(13)))
        #expect(!feed.periodFailed(from: at(1), to: at(30)))
        #expect(source.eventReads == 0)
    }

    @Test func lightShowsTheDayOnceAccessIsGranted() async {
        let event = AppleEvent(id: "a", title: "Dentist", start: at(13, 9), end: at(13, 10),
                               isAllDay: false, location: nil, declined: false)
        let source = FakeAppleSource(access: .notAsked, events: [event])
        let service = AppleCalendarService(source: source, calendar: cal)
        let feed = CalendarFeed(apple: service)
        feed.edition = .light
        await service.requestAccess()
        await feed.refresh(at(13))
        #expect(feed.items(for: at(13))?.map(\.title) == ["Dentist"])
    }

    @Test func fullNeverTouchesTheAppleService() {
        let source = FakeAppleSource(access: .allowed)
        let feed = CalendarFeed(apple: AppleCalendarService(source: source, calendar: cal))
        feed.edition = .full
        _ = feed.items(for: at(13))
        _ = feed.entries(from: at(1), to: at(30))
        #expect(source.eventReads == 0)
    }
}
