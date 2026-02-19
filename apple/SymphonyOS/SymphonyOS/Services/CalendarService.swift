import Foundation
import EventKit

/// Wraps EventKit for reading Apple Calendar events
@Observable
final class CalendarService {
    private let store = EKEventStore()
    var events: [EKEvent] = []
    var authorizationStatus: EKAuthorizationStatus = .notDetermined
    var error: String?

    // MARK: - Request Access

    func requestAccess() async {
        do {
            let granted = try await store.requestFullAccessToEvents()
            await MainActor.run {
                authorizationStatus = EKEventStore.authorizationStatus(for: .event)
                if granted {
                    error = nil
                } else {
                    error = "Calendar access denied. Enable in Settings."
                }
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                authorizationStatus = EKEventStore.authorizationStatus(for: .event)
            }
        }
    }

    // MARK: - Fetch Events

    func fetchEvents(for date: Date) {
        let status = EKEventStore.authorizationStatus(for: .event)
        authorizationStatus = status

        guard status == .fullAccess else { return }

        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else { return }

        let predicate = store.predicateForEvents(withStart: startOfDay, end: endOfDay, calendars: nil)
        events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
    }

    // MARK: - Convert to Timeline Items

    func timelineItems(for date: Date) -> [TimelineItem] {
        fetchEvents(for: date)
        return events.map { event in
            TimelineItem(
                id: "event-\(event.eventIdentifier ?? UUID().uuidString)",
                type: .event,
                title: event.title ?? "Untitled Event",
                startTime: event.isAllDay ? nil : event.startDate,
                isAllDay: event.isAllDay,
                completed: false,
                context: nil,
                entityId: UUID() // Events don't have a UUID in our system
            )
        }
    }
}
