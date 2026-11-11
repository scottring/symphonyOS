#if os(iOS)
import ActivityKit
import Foundation

/// Keeps one "next up" Live Activity in step with today's schedule: on from
/// two hours before the next timed thing until it ends; off otherwise. Run
/// from the phone (no push server): Today calls `sync` whenever the day is
/// rebuilt, and the activity's own countdown keeps time in between. Each one
/// carries a stale date at its end, so a forgotten one never lingers.
@MainActor
enum NextUpActivity {
    static let leadTime: TimeInterval = 2 * 60 * 60

    /// What the Lock Screen should say now, from the day's schedule, or nil.
    static func state(items: [TimelineItem], now: Date) -> NextUpAttributes.ContentState? {
        let glance = DayGlance.make(items: items, now: now, isToday: true)
        guard let item = glance.featured, let start = item.startTime,
              glance.lead == .now || start.timeIntervalSince(now) <= leadTime else { return nil }
        let then = glance.then.first.flatMap { next in
            next.startTime.map { "Then \($0.formatted(date: .omitted, time: .shortened)) \(next.title)" }
        }
        return .init(title: item.title, start: start, end: item.endTime, location: item.location, then: then)
    }

    static func sync(items: [TimelineItem], isToday: Bool, now: Date = .now) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let wanted = isToday ? state(items: items, now: now) : nil
        let running = Activity<NextUpAttributes>.activities
        guard let wanted else {
            // Another day on screen says nothing about today: leave today's
            // alone; on today with nothing near, end it.
            if isToday { for activity in running { Task { await activity.end(nil, dismissalPolicy: .immediate) } } }
            return
        }
        let stale = (wanted.end ?? wanted.start).addingTimeInterval(15 * 60)
        let content = ActivityContent(state: wanted, staleDate: stale)
        if let current = running.first {
            for extra in running.dropFirst() { Task { await extra.end(nil, dismissalPolicy: .immediate) } }
            if current.content.state != wanted { Task { await current.update(content) } }
        } else {
            _ = try? Activity.request(attributes: NextUpAttributes(), content: content, pushType: nil)
        }
    }
}
#endif
