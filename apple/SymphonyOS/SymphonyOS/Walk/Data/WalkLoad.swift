import Foundation
import SwiftData

/// Reads the person's own plan back for the walk, so a resumed or replayed
/// walk shows what is already there. Read-only. Only the signed-in person's
/// own personal rows are ever shown; "mine" (may be moved or pulled up) is
/// decided only by the ids the walk itself planted.
enum WalkLoad {
    /// Areas on the ridge.
    static let maxAreas = 8

    private static func isPersonal(_ context: String?) -> Bool {
        context == nil || context == "personal"
    }

    private static func key(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// The six defaults in order, then this person's other personal areas by
    /// `sortOrder`, eight at most. A label reuses the id of an existing row of
    /// the person's with the same name.
    static func areas(_ rows: [GoalArea], me: UUID, newId: () -> UUID = UUID.init) -> [WalkArea] {
        let mine = rows
            .filter { $0.userId == me && isPersonal($0.context) }
            .sorted { ($0.sortOrder, $0.createdAt) < ($1.sortOrder, $1.createdAt) }
        var out: [WalkArea] = []
        var seen = Set<String>()
        for name in WalkClassifier.defaults {
            seen.insert(key(name))
            let existing = mine.first { key($0.name) == key(name) }
            out.append(WalkArea(id: existing?.id ?? newId(), name: name))
        }
        for row in mine where out.count < maxAreas {
            let k = key(row.name)
            guard !k.isEmpty, !seen.contains(k) else { continue }
            seen.insert(k)
            out.append(WalkArea(id: row.id, name: row.name.trimmingCharacters(in: .whitespacesAndNewlines)))
        }
        return out
    }

    static func items(goals: [Goal], tasks: [SymphonyTask], periods: WalkPeriods, me: UUID,
                      planted: Set<UUID>, areas: [WalkArea]? = nil) -> [WalkItem] {
        // An area the walk does not show (a ninth, a work area, a duplicate name)
        // leaves the item on the unlabeled post.
        let shown = areas.map { Set($0.map(\.id)) }
        func area(_ id: UUID?) -> UUID? {
            guard let id else { return nil }
            return shown.map { $0.contains(id) ? id : nil } ?? id
        }
        let own = tasks.filter {
            $0.userId == me && isPersonal($0.context) && $0.dismissedAt == nil && $0.parentTaskId == nil
        }

        let years = goals
            .filter { $0.userId == me && isPersonal($0.context) && $0.year == periods.year && $0.status == "active" }
            .sorted { ($0.sortOrder, $0.createdAt) < ($1.sortOrder, $1.createdAt) }
        let yearItems = years.map {
            WalkItem(id: $0.id, level: .year, title: $0.name, areaId: area($0.areaId), parentId: nil,
                     day: nil, done: false, mine: planted.contains($0.id))
        }
        let yearIds = Set(yearItems.map(\.id))

        func ordered(_ rows: [SymphonyTask]) -> [SymphonyTask] {
            rows.sorted { ($0.sortOrder ?? 0, $0.createdAt) < ($1.sortOrder ?? 0, $1.createdAt) }
        }
        func item(_ t: SymphonyTask, _ level: WalkLevel, parent: UUID?, keep: Set<UUID>) -> WalkItem {
            WalkItem(id: t.id, level: level, title: t.title, areaId: area(t.areaId),
                     parentId: parent.flatMap { keep.contains($0) ? $0 : nil },
                     day: t.scheduledFor, done: t.completed, mine: planted.contains(t.id))
        }

        let seasonItems = ordered(own.filter {
            $0.bucket == "quarter" && PlanCalendar.sameDay($0.seasonStart, periods.season.start)
        }).map { item($0, .season, parent: $0.goalId, keep: yearIds) }
        let seasonIds = Set(seasonItems.map(\.id))

        let monthItems = ordered(own.filter {
            $0.bucket == "month" && PlanCalendar.sameDay($0.monthStart, periods.monthStart)
        }).map { item($0, .month, parent: $0.sourceId ?? $0.goalTaskId, keep: seasonIds) }
        let monthIds = Set(monthItems.map(\.id))

        // Week tasks are found by link, not by the week they sit in.
        let lastDay = PlanCalendar.addDays(periods.weekStart, 13)
        let weekItems = ordered(own.filter { t in
            guard t.bucket != "quarter", t.bucket != "month" else { return false }
            let linked = planted.contains(t.id) || (t.sourceId.map { monthIds.contains($0) } ?? false)
            guard linked else { return false }
            if let d = t.scheduledFor {
                let day = PlanCalendar.day(d)
                return day >= periods.weekStart && day <= lastDay
            }
            return PlanCalendar.sameDay(t.weekStart, periods.weekStart)
        }).map { item($0, .week, parent: $0.sourceId ?? $0.goalTaskId, keep: monthIds.union(seasonIds)) }

        return yearItems + seasonItems + monthItems + weekItems
    }
}
