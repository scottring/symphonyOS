import Foundation
import SwiftUI
import Supabase

/// Reads the user's Google Calendar through the same Supabase edge functions the
/// web app uses (`google-calendar-events`) and reports whether a connection exists
/// (`calendar_connections`).
///
/// OAuth itself is performed via the proven web connect flow (opened in an in-app
/// browser from CalendarSettingsView). The connection is stored server-side, keyed
/// by user — so once connected on any client (web or iOS), the events are available
/// here. The native app never holds Google tokens; the edge functions do.
@Observable
@MainActor
final class GoogleCalendarService {
    var isConnected = false
    var isLoading = false
    /// Google events for the last-fetched day, already mapped to timeline items.
    var eventItems: [TimelineItem] = []

    /// The web app's settings page (hosts the Google Calendar connect card).
    /// Opened in an in-app Safari view so the connection lands in `calendar_connections`.
    static let connectURL = URL(string: "https://app.symphony-os.com/settings")!

    // MARK: - Connection status

    func checkConnection() async {
        struct Row: Decodable { let id: UUID }
        do {
            let rows: [Row] = try await supabase
                .from("calendar_connections")
                .select("id")
                .eq("provider", value: "google")
                .execute()
                .value
            isConnected = !rows.isEmpty
        } catch {
            isConnected = false
        }
    }

    func disconnect() async {
        do {
            try await supabase
                .from("calendar_connections")
                .delete()
                .eq("provider", value: "google")
                .execute()
            isConnected = false
            eventItems = []
        } catch {
            // Best-effort; leave state as-is on failure.
        }
    }

    // MARK: - Events

    func fetchEvents(for date: Date) async {
        let cal = Calendar.current
        let start = cal.startOfDay(for: date)
        guard let end = cal.date(byAdding: .day, value: 1, to: start) else { return }

        struct Body: Encodable {
            let startDate: String
            let endDate: String
            let domain: String
        }
        let iso = ISO8601DateFormatter()
        let body = Body(
            startDate: iso.string(from: start),
            endDate: iso.string(from: end),
            // 'all' mirrors the kiosk: show every calendar regardless of domain
            // mappings (events bypass the app's work/family/personal switcher).
            domain: "all"
        )

        isLoading = true
        defer { isLoading = false }
        do {
            let resp: EventsResponse = try await supabase.functions.invoke(
                "google-calendar-events",
                options: FunctionInvokeOptions(body: body)
            )
            isConnected = true   // a successful call means a connection exists
            eventItems = (resp.events ?? []).map { $0.toTimelineItem() }
        } catch {
            // No connection or transient error → no events for this day.
            eventItems = []
        }
    }
}

// MARK: - Decoding

private struct EventsResponse: Decodable {
    let events: [GoogleCalendarEvent]?
}

/// Subset of the `google-calendar-events` payload the timeline needs.
struct GoogleCalendarEvent: Decodable {
    let googleEventId: String
    let title: String
    let startTime: String
    let allDay: Bool?
    let location: String?

    enum CodingKeys: String, CodingKey {
        case googleEventId = "google_event_id"
        case title
        case startTime = "start_time"
        case allDay = "all_day"
        case location
    }

    func toTimelineItem() -> TimelineItem {
        let start = Self.parseISO(startTime)
        let isAllDay = allDay ?? (start == nil)
        return TimelineItem(
            id: "gcal-\(googleEventId)",
            type: .event,
            title: title,
            startTime: isAllDay ? nil : start,
            isAllDay: isAllDay,
            completed: false,
            context: nil,
            entityId: UUID(),          // Google events have no Symphony UUID
            location: location,
            eventKey: googleEventId
        )
    }

    /// Google timed events come as `…-04:00` (no fractional seconds); the edge
    /// function's synthetic all-day times come as `…T12:00:00.000Z`. Try both.
    private static func parseISO(_ s: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: s) { return d }
        return ISO8601DateFormatter().date(from: s)
    }
}
