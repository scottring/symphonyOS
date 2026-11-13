import Foundation

/// The one calendar the views read. A full household reads Google Calendar
/// (events fetched from the server, exactly as before); a light household
/// reads Apple Calendar on the device and never calls the Google function.
/// The signatures match `GoogleCalendarService`, so a view only changes the
/// type it holds.
@Observable
@MainActor
final class CalendarFeed {
    static let shared = CalendarFeed()

    enum Source { case google, apple }

    static func source(for edition: Edition) -> Source {
        edition.allows(.googleCalendar) ? .google : .apple
    }

    var edition: Edition = .full

    private let google = GoogleCalendarService.shared
    private let apple: AppleCalendarService

    init(apple: AppleCalendarService = .shared) {
        self.apple = apple
    }

    private var source: Source { Self.source(for: edition) }

    /// Cached events for `date`. Google: nil until loaded. Apple: an empty
    /// list while access is off, so a view never waits on a calendar that
    /// will not come; nil only until the day is first read.
    func items(for date: Date) -> [TimelineItem]? {
        switch source {
        case .google: return google.items(for: date)
        case .apple:  return apple.access == .allowed ? apple.items(for: date) : []
        }
    }

    func isLoading(_ date: Date) -> Bool {
        switch source {
        case .google: return google.isLoading(date)
        case .apple:  return false
        }
    }

    func refresh(_ date: Date, maxAge: TimeInterval = 120) async {
        switch source {
        case .google: await google.refresh(date, maxAge: maxAge)
        case .apple:  apple.refresh(date)
        }
    }

    func refreshWeek(_ weekStart: Date) async {
        switch source {
        case .google: await google.refreshWeek(weekStart)
        case .apple:  apple.refreshWeek(weekStart)
        }
    }

    func entries(from start: Date, to end: Date) -> [PeriodCalendar.Entry]? {
        switch source {
        case .google: return google.entries(from: start, to: end)
        case .apple:  return apple.access == .allowed ? apple.entries(from: start, to: end) : []
        }
    }

    func periodFailed(from start: Date, to end: Date) -> Bool {
        switch source {
        case .google: return google.periodFailed(from: start, to: end)
        case .apple:  return false
        }
    }

    func refreshPeriod(from start: Date, to end: Date, maxAge: TimeInterval = 300) async {
        switch source {
        case .google: await google.refreshPeriod(from: start, to: end, maxAge: maxAge)
        case .apple:  apple.refreshPeriod(from: start, to: end)
        }
    }
}
