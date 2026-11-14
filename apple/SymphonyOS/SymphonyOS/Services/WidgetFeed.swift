#if os(iOS)
import Foundation
import WidgetKit

/// Keeps the Home Screen widgets' days (`WidgetSnapshot`) in step with
/// Today. Today calls `publish` whenever today is rebuilt; the widgets keep
/// time on their own from what was last written, so they are as fresh as the
/// last time the app was open.
@MainActor
enum WidgetFeed {
    /// Today and the two days after it: enough for the widgets to roll over
    /// at midnight and show tomorrow's first thing without the app.
    static let dayCount = 3

    /// One day, from the same pieces Today draws: its schedule and its
    /// untimed work.
    static func day(date: Date, schedule: [TimelineItem], forToday: [TimelineItem],
                    dinner: String?, eventsLoaded: Bool, calendar: Calendar = .current) -> WidgetDay {
        let timed = schedule
            .filter { !$0.isAllDay && $0.startTime != nil }
            .sorted { $0.startTime! < $1.startTime! }
            .map { WidgetDay.Timed(id: $0.id, title: $0.title, start: $0.startTime!, end: $0.endTime,
                                   location: $0.location, completed: $0.completed) }
        return WidgetDay(
            date: calendar.startOfDay(for: date),
            timed: timed,
            allDay: schedule.filter { $0.isAllDay && !$0.completed }.map(\.title),
            toDo: forToday.map { WidgetDay.ToDo(id: $0.id, title: $0.title, completed: $0.completed, waiting: $0.isWaiting) },
            dinner: dinner,
            eventsLoaded: eventsLoaded
        )
    }

    static func publish(_ days: [WidgetDay], now: Date = .now) {
        if WidgetStore.write(WidgetSnapshot(writtenAt: now, days: days)) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    /// On sign-out.
    static func clear() {
        if WidgetStore.clear() { WidgetCenter.shared.reloadAllTimelines() }
    }
}
#endif
