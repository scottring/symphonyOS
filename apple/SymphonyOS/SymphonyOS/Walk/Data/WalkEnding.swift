import Foundation

/// The ending sheet's rows: today's tasks, each with what it is for.
enum WalkEnding {
    struct Row: Equatable, Identifiable {
        let id: UUID
        let title: String
        let forGoal: String?
        let done: Bool
        let first: Bool
    }

    /// Today's personal tasks straight from the store, the first thing first.
    static func rows(tasks: [SymphonyTask], goals: [Goal], today: Date, me: UUID, firstThing: UUID?) -> [Row] {
        tasks
            .filter {
                $0.userId == me && ($0.context == nil || $0.context == "personal")
                    && $0.dismissedAt == nil && $0.parentTaskId == nil
                    && PlanCalendar.sameDay($0.scheduledFor, today)
            }
            .sorted {
                let a = $0.id == firstThing, b = $1.id == firstThing
                if a != b { return a }
                if $0.createdAt != $1.createdAt { return $0.createdAt < $1.createdAt }
                return $0.id.uuidString < $1.id.uuidString
            }
            .map {
                Row(id: $0.id, title: $0.title, forGoal: forGoal($0, tasks: tasks, goals: goals),
                    done: $0.completed, first: $0.id == firstThing)
            }
    }

    /// The goal a task is for: its own `goalId`, else the first row up its
    /// links whose `goalId` resolves; failing that, the title of the highest
    /// row reached. A self-link or a cycle ends the climb.
    static func forGoal(_ task: SymphonyTask, tasks: [SymphonyTask], goals: [Goal]) -> String? {
        // Only this person's own personal rows are ever named.
        let me = task.userId
        func personal(_ c: String?) -> Bool { c == nil || c == "personal" }
        func goalName(_ id: UUID?) -> String? {
            guard let id else { return nil }
            return goals.first { $0.id == id && $0.userId == me && personal($0.context) }?.name
        }
        func link(_ t: SymphonyTask) -> UUID? {
            let source = t.sourceId == t.id ? nil : t.sourceId
            let goalTask = t.goalTaskId == t.id ? nil : t.goalTaskId
            return source ?? goalTask
        }
        if let name = goalName(task.goalId) { return name }
        var visited: Set<UUID> = [task.id]
        var current = task
        var highest: SymphonyTask?
        for _ in 0..<4 {
            guard let next = link(current),
                  !visited.contains(next),
                  let parent = tasks.first(where: { $0.id == next && $0.userId == me && personal($0.context) })
            else { break }
            visited.insert(next)
            highest = parent
            if let name = goalName(parent.goalId) { return name }
            current = parent
        }
        return highest?.title
    }

    /// The first year item with nothing under it on the season.
    static func nextToWalk(_ items: [WalkItem]) -> WalkItem? {
        items.first { y in
            y.level == .year && !items.contains { $0.level == .season && $0.parentId == y.id }
        }
    }
}
