import Foundation

// What the Home Screen widgets draw from (Scott, 2026-11-14, the iPhone Duo
// widgets). The app writes a few days of Today into the shared App Group
// whenever Today is rebuilt; the widget extension reads it back and works out
// what to show at any minute without the app running. Compiled into both the
// app and the widget extension, so it stays Foundation-only.

/// A few days of Today, as the app last saw them.
struct WidgetSnapshot: Codable, Equatable {
    var writtenAt: Date
    var days: [WidgetDay]

    func day(containing date: Date, calendar: Calendar = .current) -> WidgetDay? {
        days.first { calendar.isDate($0.date, inSameDayAs: date) }
    }
}

/// One day: its timed things, all-day things, untimed work and dinner.
struct WidgetDay: Codable, Equatable {
    /// The start of the day, local time.
    var date: Date
    /// Timed events, tasks and routine occurrences, in start order.
    var timed: [Timed]
    var allDay: [String]
    /// Untimed work for the day ("For today"), chosen first.
    var toDo: [ToDo]
    var dinner: String?
    /// False when the calendar had not answered for this day when the
    /// snapshot was written: tasks are right, events may be missing.
    var eventsLoaded: Bool

    struct Timed: Codable, Equatable, Identifiable {
        var id: String
        var title: String
        var start: Date
        var end: Date?
        var location: String?
        var completed: Bool
    }

    struct ToDo: Codable, Equatable, Identifiable {
        var id: String
        var title: String
        var completed: Bool
        /// Waiting on someone else: shown, but not counted as left to do.
        var waiting: Bool
    }

    var openToDo: [ToDo] { toDo.filter { !$0.completed && !$0.waiting } }
    var doneToDo: Int { toDo.filter(\.completed).count }
}

/// What a widget says at one minute of one day. The same rules as the
/// outside screen's card (`DayGlance`): what's under way now, else the next
/// thing to start; ticked-off things drop out.
struct WidgetMoment: Equatable {
    enum Lead: Equatable { case now, next }

    var now: Date
    /// Nil when the snapshot holds nothing for this day: the app has not
    /// been opened since it rolled over (or ever).
    var day: WidgetDay?
    var lead: Lead?
    var featured: WidgetDay.Timed?
    /// Every timed thing after the featured one, in order.
    var later: [WidgetDay.Timed]
    /// The first timed thing tomorrow, for the evening.
    var tomorrowFirst: WidgetDay.Timed?

    static func make(_ snapshot: WidgetSnapshot?, now: Date, calendar: Calendar = .current) -> WidgetMoment {
        guard let snapshot, let day = snapshot.day(containing: now, calendar: calendar) else {
            return WidgetMoment(now: now, day: nil, lead: nil, featured: nil, later: [], tomorrowFirst: nil)
        }
        let timed = day.timed.filter { !$0.completed }.sorted { $0.start < $1.start }
        var lead: Lead?
        var index: Int?
        if let i = timed.firstIndex(where: { $0.start <= now && ($0.end ?? $0.start) > now }) {
            lead = .now; index = i
        } else if let i = timed.firstIndex(where: { $0.start > now }) {
            lead = .next; index = i
        }
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: now)
            .flatMap { snapshot.day(containing: $0, calendar: calendar) }
        return WidgetMoment(
            now: now, day: day, lead: lead,
            featured: index.map { timed[$0] },
            later: index.map { Array(timed.dropFirst($0 + 1)) } ?? [],
            tomorrowFirst: tomorrow?.timed.filter { !$0.completed }.min { $0.start < $1.start }
        )
    }

    /// "in 25 min" inside the last hour before the next thing; nil otherwise
    /// (further out, its clock time says enough and never goes stale).
    var countdown: String? {
        guard lead == .next, let start = featured?.start else { return nil }
        let minutes = Int((start.timeIntervalSince(now) / 60).rounded(.up))
        guard minutes >= 1, minutes <= 60 else { return nil }
        return minutes == 60 ? "in 1 hr" : "in \(minutes) min"
    }
}

extension WidgetSnapshot {
    /// When what a widget says changes between `now` and `until`: each timed
    /// thing's start and end, every minute of the hour before a start (the
    /// countdown), and each midnight. Sorted, without duplicates.
    func changeDates(from now: Date, until: Date, calendar: Calendar = .current) -> [Date] {
        var dates: Set<Date> = []
        for day in days {
            for item in day.timed where !item.completed {
                dates.insert(item.start)
                if let end = item.end { dates.insert(end) }
                for minute in 1...60 { dates.insert(item.start.addingTimeInterval(TimeInterval(-60 * minute))) }
            }
        }
        var midnight = calendar.startOfDay(for: now)
        while midnight <= until {
            dates.insert(midnight)
            guard let next = calendar.date(byAdding: .day, value: 1, to: midnight) else { break }
            midnight = next
        }
        return dates.filter { $0 > now && $0 <= until }.sorted()
    }
}

/// The snapshot's place in the App Group both targets share.
enum WidgetStore {
    static let appGroup = "group.com.scottkaufman.symphonyos"
    static let fileName = "widget-days.json"

    static var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent(fileName)
    }

    static func read(from url: URL? = WidgetStore.url) -> WidgetSnapshot? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    /// Returns true when the file changed (so the caller reloads the widgets
    /// only then). `writtenAt` alone moving is not a change.
    @discardableResult
    static func write(_ snapshot: WidgetSnapshot, to url: URL? = WidgetStore.url) -> Bool {
        guard let url else { return false }
        if let old = read(from: url), old.days == snapshot.days { return false }
        guard let data = try? JSONEncoder().encode(snapshot) else { return false }
        return (try? data.write(to: url, options: .atomic)) != nil
    }

    /// On sign-out: nothing of the last account stays on the Home Screen.
    @discardableResult
    static func clear(at url: URL? = WidgetStore.url) -> Bool {
        guard let url, FileManager.default.fileExists(atPath: url.path) else { return false }
        return (try? FileManager.default.removeItem(at: url)) != nil
    }
}
