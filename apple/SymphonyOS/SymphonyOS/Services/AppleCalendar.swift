import Foundation
import EventKit

// Apple Calendar, read straight from the device (EventKit, read-only).
// The light edition has no server and no Google connection; this is where its
// Today and Week events come from. `EventKitSource` is the only code that
// touches EventKit; everything else sees plain `AppleEvent` values.

/// One calendar event as the phone reports it, with nothing EventKit attached.
struct AppleEvent: Equatable {
    let id: String
    let title: String
    let start: Date
    let end: Date
    let isAllDay: Bool
    let location: String?
    let declined: Bool
}

enum AppleCalendarAccess { case notAsked, allowed, denied }

/// Where events come from. Tests use a fake; the app uses `EventKitSource`.
protocol AppleEventSource: Sendable {
    var access: AppleCalendarAccess { get }
    func requestAccess() async -> Bool
    func events(from start: Date, to end: Date) -> [AppleEvent]
}

/// The real thing: one `EKEventStore`. `EKEventStore` is not marked Sendable,
/// but Apple documents it as safe to use from any thread, and no EventKit type
/// leaves this struct.
struct EventKitSource: AppleEventSource, @unchecked Sendable {
    private let store = EKEventStore()

    var access: AppleCalendarAccess {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess:    return .allowed
        case .notDetermined: return .notAsked
        default:             return .denied
        }
    }

    func requestAccess() async -> Bool {
        (try? await store.requestFullAccessToEvents()) ?? false
    }

    func events(from start: Date, to end: Date) -> [AppleEvent] {
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        return store.events(matching: predicate).map { e in
            let declined = e.attendees?.contains { $0.isCurrentUser && $0.participantStatus == .declined } ?? false
            // A repeating event keeps one identifier for every occurrence.
            let stamp = Int(e.startDate.timeIntervalSince1970)
            let location = e.location?.trimmingCharacters(in: .whitespacesAndNewlines)
            return AppleEvent(
                id: "\(e.eventIdentifier ?? e.calendarItemIdentifier)@\(stamp)",
                title: e.title ?? "",
                start: e.startDate,
                end: e.endDate,
                isAllDay: e.isAllDay,
                location: (location?.isEmpty ?? true) ? nil : location,
                declined: declined
            )
        }
    }
}

// MARK: - Mapping

enum AppleCalendarMapper {
    /// The events that touch `day`, as timeline items: all-day first, then by
    /// start, then by title. An event that crosses midnight appears on each
    /// day it touches, clipped to that day; one that covers a whole day is
    /// all-day on it. Declined events are dropped.
    static func items(_ events: [AppleEvent], on day: Date, calendar: Calendar = .current) -> [TimelineItem] {
        let dayStart = calendar.startOfDay(for: day)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return [] }
        let key = dayKey(dayStart, calendar)

        let items: [TimelineItem] = events.compactMap { e in
            guard !e.declined, touches(e, dayStart, dayEnd) else { return nil }
            let coversDay = e.start <= dayStart && e.end >= dayEnd
            let allDay = e.isAllDay || coversDay
            var item = TimelineItem(
                id: "ekcal-\(e.id)-\(key)",
                type: .event,
                title: e.title,
                startTime: allDay ? nil : max(e.start, dayStart),
                isAllDay: allDay,
                completed: false,
                context: nil,
                entityId: UUID(),          // device events have no Symphony UUID
                location: e.location
            )
            item.endTime = allDay ? nil : min(e.end, dayEnd)
            return item
        }

        return items.sorted { a, b in
            if a.isAllDay != b.isAllDay { return a.isAllDay }
            if let x = a.startTime, let y = b.startTime, x != y { return x < y }
            return a.title.localizedCaseInsensitiveCompare(b.title) == .orderedAscending
        }
    }

    /// One entry per day that an all-day or multi-day event touches, for the
    /// calendar sheet. A timed event within one day is read from the timeline.
    static func entries(_ events: [AppleEvent], calendar: Calendar = .current) -> [PeriodCalendar.Entry] {
        var out: [PeriodCalendar.Entry] = []
        for e in events where !e.declined {
            let first = calendar.startOfDay(for: e.start)
            // An event ending exactly at midnight does not touch that next day.
            let lastMoment = e.end > e.start ? e.end.addingTimeInterval(-1) : e.start
            let last = calendar.startOfDay(for: lastMoment)
            guard e.isAllDay || last > first else { continue }
            var d = first
            while d <= last {
                out.append(PeriodCalendar.Entry(day: d, title: e.title))
                guard let next = calendar.date(byAdding: .day, value: 1, to: d) else { break }
                d = next
            }
        }
        return out
    }

    /// Overlaps [dayStart, dayEnd); an empty event counts if it starts inside.
    private static func touches(_ e: AppleEvent, _ dayStart: Date, _ dayEnd: Date) -> Bool {
        if e.end <= e.start { return e.start >= dayStart && e.start < dayEnd }
        return e.start < dayEnd && e.end > dayStart
    }

    private static func dayKey(_ day: Date, _ calendar: Calendar) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: day)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

// MARK: - Service

/// Today and Week read the device calendar through this. It never asks for
/// permission on its own (`requestAccess()` is called from a deliberate tap),
/// caches by day, and re-reads what it has cached when the calendar changes.
@Observable
@MainActor
final class AppleCalendarService {
    static let shared = AppleCalendarService()

    private let source: AppleEventSource
    private(set) var access: AppleCalendarAccess

    private var byDay: [String: [TimelineItem]] = [:]
    private var dayStarts: [String: Date] = [:]
    private var byPeriod: [PeriodKey: [PeriodCalendar.Entry]] = [:]
    @ObservationIgnored private var observer: NSObjectProtocol?

    private struct PeriodKey: Hashable { let start: Date; let end: Date }

    init(source: AppleEventSource = EventKitSource()) {
        self.source = source
        self.access = source.access
        // EventKit's change notification, by name, so only `EventKitSource`
        // needs to import EventKit.
        observer = NotificationCenter.default.addObserver(
            forName: Notification.Name("EKEventStoreChangedNotification"), object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.reloadCached() }
        }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    func requestAccess() async {
        _ = await source.requestAccess()
        access = source.access
        reloadCached()
    }

    /// Cached events for `date`, or nil when not allowed or never loaded.
    func items(for date: Date) -> [TimelineItem]? {
        guard access == .allowed else { return nil }
        return byDay[key(date)]
    }

    func refresh(_ date: Date) {
        load(days: [Calendar.current.startOfDay(for: date)])
    }

    /// The seven days from `weekStart`, in one read.
    func refreshWeek(_ weekStart: Date) {
        let cal = Calendar.current
        let first = cal.startOfDay(for: weekStart)
        load(days: (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: first) })
    }

    func entries(from start: Date, to end: Date) -> [PeriodCalendar.Entry]? {
        guard access == .allowed else { return nil }
        return byPeriod[PeriodKey(start: start, end: end)]
    }

    func refreshPeriod(from start: Date, to end: Date) {
        guard syncAccess() else { return }
        byPeriod[PeriodKey(start: start, end: end)] = AppleCalendarMapper.entries(source.events(from: start, to: end))
    }

    // MARK: Private

    private func key(_ date: Date) -> String {
        PlanCalendar.ymd(Calendar.current.startOfDay(for: date))
    }

    /// Re-reads the source's access (the user can change it in Settings) and
    /// says whether events may be read.
    private func syncAccess() -> Bool {
        access = source.access
        return access == .allowed
    }

    private func load(days: [Date]) {
        guard syncAccess(), let first = days.first, let last = days.last,
              let end = Calendar.current.date(byAdding: .day, value: 1, to: last) else { return }
        let events = source.events(from: first, to: end)
        for day in days {
            byDay[key(day)] = AppleCalendarMapper.items(events, on: day)
            dayStarts[key(day)] = day
        }
    }

    private func reloadCached() {
        guard syncAccess() else { return }
        for day in dayStarts.values.sorted() { load(days: [day]) }
        for p in Array(byPeriod.keys) { refreshPeriod(from: p.start, to: p.end) }
    }
}
