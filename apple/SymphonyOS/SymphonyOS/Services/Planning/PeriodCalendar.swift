import Foundation

/// This period's calendar as the sheet on the right reads it (paper-style
/// horizons, "The calendar fold", 2026-11-04): what is already claimed, one
/// line per day and event ("Nov 3 · Election Day"), for reading only. An
/// event that comes back on three or more days of the period (school
/// drop-off, a weekly class) is named once under "Repeating", so the
/// one-offs that shape the period stay readable.
enum PeriodCalendar {
    struct Line: Equatable, Identifiable {
        let day: Date
        let text: String
        var id: String { "\(PlanCalendar.ymd(day))|\(text)" }
    }

    struct Read: Equatable {
        var lines: [Line]
        var repeating: [String]
    }

    static let repeatDays = 3

    static func read(_ events: [TimelineItem]) -> Read {
        let dated = events.compactMap { e -> (day: Date, title: String)? in
            guard let at = e.startTime else { return nil }
            let title = e.title.trimmingCharacters(in: .whitespacesAndNewlines)
            return title.isEmpty ? nil : (PlanCalendar.day(at), title)
        }
        var daysByTitle: [String: Set<String>] = [:]
        for e in dated { daysByTitle[e.title, default: []].insert(PlanCalendar.ymd(e.day)) }
        let repeats = Set(daysByTitle.filter { $0.value.count >= repeatDays }.keys)

        var seen = Set<String>()
        let lines = dated
            .filter { !repeats.contains($0.title) }
            .sorted { ($0.day, $0.title) < ($1.day, $1.title) }
            .compactMap { e -> Line? in
                let line = Line(day: e.day, text: "\(e.day.formatted(.dateTime.month(.abbreviated).day())) · \(e.title)")
                return seen.insert(line.id).inserted ? line : nil
            }
        // Repeats in the order they first come up.
        var order: [String] = []
        for e in dated.sorted(by: { $0.day < $1.day }) where repeats.contains(e.title) && !order.contains(e.title) {
            order.append(e.title)
        }
        return Read(lines: lines, repeating: order)
    }
}
