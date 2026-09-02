import Foundation

// Page-from-paper, the pure half. Mirrors the web:
//   src/lib/planParse.ts  — PLAN_WINDOW_DAYS, PlanPlacement, planItemToAddTaskArgs
//   src/lib/pageParse.ts  — validatePageResult caps
//   src/lib/cadence/config.ts — DEFAULT_CADENCE.weekStartsOn (Sunday), weekStartAnchor
// If any of those change, change this file too — they are two copies of one contract.

enum PagePlacement: Equatable {
    case date(String)   // local YYYY-MM-DD inside the echoed window
    case week
    case inbox
}

struct PageItem: Identifiable, Equatable {
    let id: UUID
    var title: String
    var placement: PagePlacement
    var assigneeId: UUID?
    var note: String?
}

struct PageNote: Identifiable, Equatable {
    let id: UUID
    var title: String
    var content: String
}

struct PageResult: Equatable {
    var items: [PageItem]
    var notes: [PageNote]
    var unclear: [String]
    /// The dates the parser was ALLOWED to place on — echoed by the response.
    var windowDates: [String]
    var storagePath: String?

    static let empty = PageResult(items: [], notes: [], unclear: [], windowDates: [], storagePath: nil)
}

extension PageResult: Identifiable {
    var id: String { storagePath ?? "page" }
}

/// Wire shape of the `parse-page` edge function response.
struct PageParseResponse: Decodable {
    struct Item: Decodable {
        var title: String?
        var day: String?
        var assignee_id: String?
        var note: String?
    }
    struct Note: Decodable {
        var title: String?
        var content: String?
    }
    var ok: Bool?
    var error: String?
    var items: [Item]?
    var notes: [Note]?
    var unclear: [String]?
    var window: [String]?
    var storagePath: String?
}

/// What a placed page item becomes on the `tasks` row.
struct PageTaskFields: Equatable {
    var title: String
    var scheduledFor: Date?
    var isAllDay: Bool
    var bucket: String
    var weekStart: Date?
    var assignedTo: UUID?
    var notes: String?
}

enum PageParse {
    /// Twin of `PLAN_WINDOW_DAYS` in src/lib/planParse.ts.
    static let windowDays = 14
    /// Twin of `DEFAULT_CADENCE.weekStartsOn = 0` (Sunday) — as a Foundation
    /// `Calendar` weekday, Sunday is 1. The web stores this per browser in
    /// localStorage, so the phone cannot read it and uses the default.
    static let defaultWeekStartsOn = 1

    static let maxNotes = 20
    static let maxUnclear = 20
    static let titleMax = 80
    static let contentMax = 5000
    static let unclearMax = 200

    // MARK: Dates

    private static func ymdFormatter(_ calendar: Calendar) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    static func localYmd(_ d: Date, calendar: Calendar = .current) -> String {
        ymdFormatter(calendar).string(from: d)
    }

    static func parseLocalYmd(_ s: String, calendar: Calendar = .current) -> Date? {
        guard s.count == 10 else { return nil }
        return ymdFormatter(calendar).date(from: s)
    }

    /// The window's dates as local YYYY-MM-DD, today first.
    static func windowDates(from today: Date, calendar: Calendar = .current) -> [String] {
        let start = calendar.startOfDay(for: today)
        return (0..<windowDays).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: start).map { localYmd($0, calendar: calendar) }
        }
    }

    /// Midnight of the most recent `weekStartsOn` weekday on or before `now`.
    static func weekStartAnchor(now: Date, weekStartsOn: Int = defaultWeekStartsOn, calendar: Calendar = .current) -> Date {
        let day = calendar.startOfDay(for: now)
        let weekday = calendar.component(.weekday, from: day)
        let delta = (weekday - weekStartsOn + 7) % 7
        return calendar.date(byAdding: .day, value: -delta, to: day) ?? day
    }

    // MARK: Validation (cheap repeat of the server's checks)

    static func validate(_ r: PageParseResponse, fallbackWindow: [String], memberIds: Set<UUID>) -> PageResult {
        let window = (r.window?.isEmpty == false) ? r.window! : fallbackWindow
        let windowSet = Set(window)

        let items: [PageItem] = (r.items ?? []).compactMap { e in
            let title = (e.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !title.isEmpty else { return nil }
            let day = e.day ?? "inbox"
            let placement: PagePlacement
            if day == "week" { placement = .week }
            else if day == "inbox" { placement = .inbox }
            else if windowSet.contains(day) { placement = .date(day) }
            else { placement = .week }
            let assignee = e.assignee_id.flatMap(UUID.init(uuidString:)).flatMap { memberIds.contains($0) ? $0 : nil }
            let note = e.note?.trimmingCharacters(in: .whitespacesAndNewlines)
            return PageItem(id: UUID(), title: String(title.prefix(titleMax)), placement: placement,
                            assigneeId: assignee, note: (note?.isEmpty == false) ? note : nil)
        }

        let notes: [PageNote] = (r.notes ?? []).prefix(maxNotes).compactMap { n in
            let content = (n.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !content.isEmpty else { return nil }
            let clipped = String(content.prefix(contentMax))
            let explicit = n.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let title = explicit.isEmpty
                ? String(clipped.split(separator: "\n").first.map(String.init) ?? clipped).prefix(titleMax)
                : explicit.prefix(titleMax)
            return PageNote(id: UUID(), title: String(title), content: clipped)
        }

        let unclear = (r.unclear ?? [])
            .map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(unclearMax)) }
            .filter { !$0.isEmpty }
            .prefix(maxUnclear)

        return PageResult(items: items, notes: notes, unclear: Array(unclear), windowDates: window, storagePath: r.storagePath)
    }

    // MARK: Placement → task fields (twin of planItemToAddTaskArgs)

    static func taskFields(for item: PageItem, currentWeekStart: Date, defaultAssignee: UUID?) -> PageTaskFields {
        // Unassigned lines default to the planner; only a named member overrides.
        let assignee = item.assigneeId ?? defaultAssignee
        switch item.placement {
        case .date(let ymd):
            return PageTaskFields(title: item.title, scheduledFor: parseLocalYmd(ymd), isAllDay: true,
                                  bucket: "timed", weekStart: nil, assignedTo: assignee, notes: item.note)
        case .week:
            // bucket='week' rows must say WHICH week (placement cascade).
            return PageTaskFields(title: item.title, scheduledFor: nil, isAllDay: false,
                                  bucket: "week", weekStart: currentWeekStart, assignedTo: assignee, notes: item.note)
        case .inbox:
            return PageTaskFields(title: item.title, scheduledFor: nil, isAllDay: false,
                                  bucket: "inbox", weekStart: nil, assignedTo: assignee, notes: item.note)
        }
    }
}
