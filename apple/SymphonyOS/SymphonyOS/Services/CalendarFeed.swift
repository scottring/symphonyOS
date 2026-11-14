import Foundation

/// The Google side of the feed: exactly what the views read. `GoogleCalendarService`
/// is the real one; tests use a fake that counts calls.
@MainActor
protocol GoogleCalendarReading: AnyObject {
    func items(for date: Date) -> [TimelineItem]?
    func isLoading(_ date: Date) -> Bool
    func refresh(_ date: Date, maxAge: TimeInterval) async
    func refreshWeek(_ weekStart: Date) async
    func entries(from start: Date, to end: Date) -> [PeriodCalendar.Entry]?
    func periodFailed(from start: Date, to end: Date) -> Bool
    func refreshPeriod(from start: Date, to end: Date, maxAge: TimeInterval) async
}

extension GoogleCalendarService: GoogleCalendarReading {}

/// The one calendar the views read. A full household reads Google Calendar
/// (events fetched from the server, exactly as before); a light household
/// reads Apple Calendar on the device and never calls the Google function.
/// Until the edition is known (`edition == nil`) the feed reads nothing and
/// returns nothing, so no first read can go to the wrong source. Views re-run
/// their refresh when `refreshKey` changes.
@Observable
@MainActor
final class CalendarFeed {
    static let shared = CalendarFeed()

    enum Source { case google, apple }

    static func source(for edition: Edition) -> Source {
        edition.allows(.googleCalendar) ? .google : .apple
    }

    /// nil until the signed-in household's edition is known.
    var edition: Edition?

    @ObservationIgnored private let google: GoogleCalendarReading
    private let apple: AppleCalendarService

    init(apple: AppleCalendarService = .shared, google: GoogleCalendarReading = GoogleCalendarService.shared) {
        self.apple = apple
        self.google = google
    }

    private var source: Source? { edition.map(Self.source(for:)) }

    /// Changes whenever the answer to "where do events come from, and may I
    /// read them" changes: the edition, and (light only) Apple Calendar access.
    var refreshKey: String {
        switch source {
        case nil:     return "unknown"
        case .google: return "google"
        case .apple:  return "apple-\(apple.access)"
        }
    }

    /// The id for a view's single `.task(id:)`: it changes with the day (or
    /// week start) and with the source, and is stable otherwise.
    func readKey(for day: Date) -> String { "\(refreshKey)|\(PlanCalendar.ymd(day))" }

    /// Cached events for `date`. Google: nil until loaded. Apple: an empty
    /// list while access is off, so a view never waits on a calendar that
    /// will not come; nil only until the day is first read.
    func items(for date: Date) -> [TimelineItem]? {
        #if DEBUG && os(iOS)
        // The light pages' demo (`-SymphonyDemo -SymphonyDaily`) reads its two sample events.
        if DemoMode.isOn && DemoMode.isDaily { return DemoMode.dailyEvents(on: date) }
        #endif
        switch source {
        case nil: return nil
        case .google: return google.items(for: date)
        case .apple:  return apple.access == .allowed ? apple.items(for: date) : []
        }
    }

    func isLoading(_ date: Date) -> Bool {
        switch source {
        case .google: return google.isLoading(date)
        case .apple, nil: return false
        }
    }

    func refresh(_ date: Date, maxAge: TimeInterval = 120) async {
        switch source {
        case nil: break
        case .google: await google.refresh(date, maxAge: maxAge)
        case .apple:  apple.refresh(date)
        }
    }

    func refreshWeek(_ weekStart: Date) async {
        switch source {
        case nil: break
        case .google: await google.refreshWeek(weekStart)
        case .apple:  apple.refreshWeek(weekStart)
        }
    }

    func entries(from start: Date, to end: Date) -> [PeriodCalendar.Entry]? {
        switch source {
        case nil: return nil
        case .google: return google.entries(from: start, to: end)
        case .apple:  return apple.access == .allowed ? apple.entries(from: start, to: end) : []
        }
    }

    func periodFailed(from start: Date, to end: Date) -> Bool {
        switch source {
        case .google: return google.periodFailed(from: start, to: end)
        case .apple, nil: return false
        }
    }

    func refreshPeriod(from start: Date, to end: Date, maxAge: TimeInterval = 300) async {
        switch source {
        case nil: break
        case .google: await google.refreshPeriod(from: start, to: end, maxAge: maxAge)
        case .apple:  apple.refreshPeriod(from: start, to: end)
        }
    }
}
