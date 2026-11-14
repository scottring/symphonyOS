import Foundation
import SwiftData

/// The light pages' one writer. It adds, moves, ticks and pulls up rows only
/// by calling the writers the app already has (`WalkWriter`, `PlanWriter`,
/// `ItemCompletion`), so every change is the walk's own row, queued for sync
/// the way every other edit is.
///
/// A task is the walk's week task; a goal is the walk's flag, filed and linked
/// as the walk files and links them. Everything is the signed-in person's own
/// and `context = "personal"`; a row whose `userId` is anyone else's is left
/// exactly as it is, whatever id it is handed.
///
/// It holds one `WalkWriter` for its whole life, so a pull-up and its put-back
/// share that writer's memory, as do the areas it made.
@MainActor struct DailyWriter {
    let context: ModelContext
    let userId: UUID
    let periods: WalkPeriods
    private let walk: WalkWriter

    init(context: ModelContext, userId: UUID, periods: WalkPeriods) {
        self.context = context
        self.userId = userId
        self.periods = periods
        self.walk = WalkWriter(context: context, userId: userId, periods: periods)
    }

    private var plan: PlanWriter { PlanWriter(context: context, userId: userId) }

    struct Added: Equatable {
        let id: UUID
        let level: WalkLevel
        let areaId: UUID?
        /// The area's name, when the words moved it off the focused peak.
        let placed: String?
    }

    // MARK: Adding

    /// Writes what the bar read. A task is a week task (on its day when one was
    /// said, at its time when one was said, never the first thing). A year goal
    /// goes where its words belong among `kept`, else to `focusArea`; a season or
    /// month goal under `parent` takes the parent's area and links up as the
    /// walk's do; with no parent it is placed by its words alone. `periods`, when
    /// set (a page for another period), files the row into those periods.
    @discardableResult
    func add(_ add: DailyAdd.Add, kept: [WalkArea] = [], focusArea: UUID? = nil, parent: WalkItem? = nil,
             periods: WalkPeriods? = nil) -> Added {
        let creator = periods.flatMap { $0 == self.periods ? nil : WalkWriter(context: context, userId: userId, periods: $0) } ?? walk
        switch add {
        case .task(let title, let day, let at, _):
            let item = WalkItem(id: UUID(), level: .week, title: title, day: day)
            creator.create(item, parent: nil)
            if let at, let t = myTask(item.id) {
                // A time said is kept; it never makes the task the first thing.
                let snap = plan.move(t, to: .day(at, allDay: false))
                if !snap.createdFocus.isEmpty { walk.setFirstThing(nil, previous: item.id) }
            }
            return Added(id: item.id, level: .week, areaId: nil, placed: nil)

        case .goal(let title, let level):
            var areaId: UUID?
            var placed: String?
            if level != .year, let parent {
                areaId = parent.areaId
            } else if case .area(let id, let moved) = WalkClassifier.place(title, kept: kept,
                                                                           focus: level == .year ? focusArea : nil) {
                areaId = id
                if moved { placed = kept.first { $0.id == id }?.name }
            }
            if let areaId, let area = kept.first(where: { $0.id == areaId }) { walk.ensureArea(area) }
            let item = WalkItem(id: UUID(), level: level, title: title, areaId: areaId,
                                parentId: level == .year ? nil : parent?.id)
            creator.create(item, parent: level == .year ? nil : parent)
            return Added(id: item.id, level: level, areaId: areaId, placed: placed)
        }
    }

    /// Undo of an add: the row goes whole, and the area it alone used, if this writer made it.
    func takeBack(_ added: Added) {
        guard owns(added.id) else { return }
        walk.remove(added.id, level: added.level)
        if let areaId = added.areaId { walk.dropAreaIfUnused(areaId) }
    }

    // MARK: Ticking

    /// Ticks a row off (or back on) through the app's own completion path.
    func setDone(_ row: DailyDay.Row, _ done: Bool, today: Date) {
        guard let t = myTask(row.id) else { return }
        let item = TimelineItem(id: "task-\(t.id.uuidString)", type: .task, title: t.title, startTime: nil,
                                isAllDay: true, completed: t.completed, context: t.context, entityId: t.id)
        ItemCompletion.set(item, completed: done, modelContext: context, userId: userId, date: today)
    }

    // MARK: Moving

    /// Onto a day (all day, never the first thing), or with `day` nil onto the
    /// week with no day. Its week stays open either way. nil when the task is not mine.
    func move(_ taskId: UUID, to day: Date?) -> PlanWriter.Snapshot? {
        guard let t = myTask(taskId) else { return nil }
        guard let day else { return plan.clearDay(t) }
        return plan.planTask(t, on: day, focusToday: false)
    }

    func undoMove(_ snapshot: PlanWriter.Snapshot) {
        guard snapshot.tasks.allSatisfy({ owns($0.id) }) else { return }
        plan.undo(snapshot)
    }

    // MARK: Pulling up

    func pullUp(_ id: UUID, level: WalkLevel) {
        guard owns(id) else { return }
        walk.remove(id, level: level)
    }

    /// Undo of a pull-up: the row comes back with its id and its links.
    func putBack(_ id: UUID) {
        walk.restore(id)
    }

    // MARK: Area and first thing

    /// Files a goal or task under another area (or none). The area is made if it
    /// has no row yet; the one it left goes if this writer made it and nothing else uses it.
    func setArea(_ id: UUID, level: WalkLevel, to area: WalkArea?) {
        guard owns(id) else { return }
        let old = level == .year ? myGoal(id)?.areaId : myTask(id)?.areaId
        if let area { walk.ensureArea(area) }
        walk.setArea(id, level: level, to: area?.id)
        if let old, old != area?.id { walk.dropAreaIfUnused(old) }
    }

    /// Moves today's first-thing mark from `previous` to `id` (either may be nil).
    func setFirst(_ id: UUID?, previous: UUID?) {
        if let id, myTask(id) == nil { return }
        walk.setFirstThing(id, previous: previous)
    }

    // MARK: Plumbing

    /// A goal or task with this id exists and is the signed-in person's own.
    private func owns(_ id: UUID) -> Bool {
        myTask(id) != nil || myGoal(id) != nil
    }

    private func myTask(_ id: UUID) -> SymphonyTask? {
        var d = FetchDescriptor<SymphonyTask>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        return (try? context.fetch(d))?.first.flatMap { $0.userId == userId ? $0 : nil }
    }

    private func myGoal(_ id: UUID) -> Goal? {
        var d = FetchDescriptor<Goal>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        return (try? context.fetch(d))?.first.flatMap { $0.userId == userId ? $0 : nil }
    }
}
