import Foundation
import SwiftData

/// The light pages' one writer. It adds, moves, ticks and pulls up rows only
/// by calling the writers the app already has (`WalkWriter`, `PlanWriter`,
/// `ItemCompletion`), so every change is the walk's own row, queued for sync
/// the way every other edit is.
///
/// A task is the walk's week task; a goal is the walk's flag, filed and linked
/// as the walk files and links them. Everything is the signed-in person's own
/// and `context = "personal"`; a row that is not the person's own (anyone else's,
/// or theirs in a family or other life area, as `DailyDay.mine` reads it) is left
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
    }

    // MARK: Adding

    /// Writes what the bar read. A task is a week task (on its day when one was
    /// said, at its time when one was said, never the first thing). A goal goes in the
    /// area the page stands in (`focusArea`, when it is among `kept`); a season or month
    /// goal under `parent` takes the parent's area instead and links up as the walk's do.
    /// Standing nowhere and under nothing, it has no area. Words never place a goal.
    /// `periods`, when set (a page for another period), files the row into those periods.
    @discardableResult
    func add(_ add: DailyAdd.Add, kept: [WalkArea] = [], focusArea: UUID? = nil, parent: WalkItem? = nil,
             periods: WalkPeriods? = nil) -> Added {
        let creator = periods.flatMap { $0 == self.periods ? nil : WalkWriter(context: context, userId: userId, periods: $0) } ?? walk
        switch add {
        case .task(let title, let day, let at, _):
            let item = WalkItem(id: UUID(), level: .week, title: title, day: day)
            creator.create(item, parent: nil)
            if let at, let t = myTask(item.id) {
                // A time said is kept; it never makes the task the first thing. `move` marks
                // the clock's today, so exactly the focus rows it made are taken back.
                let snap = plan.move(t, to: .day(at, allDay: false))
                if !snap.createdFocus.isEmpty { plan.undo(PlanWriter.Snapshot(createdFocus: snap.createdFocus)) }
            }
            return Added(id: item.id, level: .week, areaId: nil)

        case .goal(let title, let level):
            // A parent counts only when its stored row is mine, and lends its stored area.
            let parent = level == .year ? nil : parent.flatMap(storedParent)
            let standing = focusArea.flatMap { id in kept.contains { $0.id == id } ? id : nil }
            let areaId = parent?.areaId ?? standing
            if let areaId, let area = kept.first(where: { $0.id == areaId }) { walk.ensureArea(area) }
            let item = WalkItem(id: UUID(), level: level, title: title, areaId: areaId,
                                parentId: level == .year ? nil : parent?.id)
            creator.create(item, parent: level == .year ? nil : parent)
            return Added(id: item.id, level: level, areaId: areaId)
        }
    }

    /// Undo of an add: the row goes whole, and the area it alone used, if this writer made it.
    /// A delete is queued too (`queueDeleteAfterRemove`): the insert may be on the wire as Undo
    /// is tapped, and would otherwise reach the server and come back by itself.
    func takeBack(_ added: Added) {
        guard owns(added.id) else { return }
        walk.remove(added.id, level: added.level)
        queueDeleteAfterRemove(added.id, level: added.level)
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
    /// week with no day. Its week stays open either way. With no day it keeps the
    /// week of the day it was on, but a task from before this writer's week (Week's
    /// fold) comes onto this week (`periods.weekStart`): the page's own week, never
    /// the wall clock's. No move counts a deferral (ruling D13). nil when the task is not mine.
    func move(_ taskId: UUID, to day: Date?) -> PlanWriter.Snapshot? {
        guard let t = myTask(taskId) else { return nil }
        guard let day else {
            let own = t.scheduledFor.map { PlanCalendar.weekStart($0) } ?? periods.weekStart
            return plan.clearDay(t, weekStart: max(own, periods.weekStart))
        }
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
        queueDeleteAfterRemove(id, level: level)
    }

    /// After `WalkWriter.remove` has taken a row back: a delete is queued for it even when its
    /// insert was still queued (and so dropped). That insert may already be on the wire (the push
    /// runs every few seconds); the delete then takes the row off the server, and while it waits it
    /// keeps the realtime echo of the insert from bringing the row back. For a row that never went
    /// up it deletes nothing. Kept out of `WalkWriter.remove`, whose `restore` reads a queued delete
    /// as "the row reached the server"; the light pages never restore a removed row.
    private func queueDeleteAfterRemove(_ id: UUID, level: WalkLevel) {
        context.queueSync(table: level == .year ? "goals" : "tasks", recordId: id, type: "delete")
        try? context.save()
    }

    /// Whether `pullUp` would take this row: it exists on the level named and is mine.
    func canPullUp(_ id: UUID, level: WalkLevel) -> Bool {
        level == .year ? myGoal(id) != nil : myTask(id) != nil
    }

    /// Undo of a pull-up: the row comes back with its id and its links, but only with
    /// what the walk's writer remembers (the walk's own short field list). Right for a
    /// row the walk planted; an ordinary task would come back without its links, phone
    /// number, location, capture fields and the rest, so it must never be offered for
    /// ordinary rows. `DailyModel` does not use it: a pull-up is written only once its
    /// Undo can no longer be used.
    func putBack(_ id: UUID) {
        walk.restore(id)
    }

    // MARK: Area and first thing

    /// Files a goal or task under another area (or none). The area is made if it
    /// has no row yet; the one it left goes if this writer made it and nothing else uses it.
    func setArea(_ id: UUID, level: WalkLevel, to area: WalkArea?) {
        // The row must be mine on the level named before any area is made.
        let old: UUID?
        if level == .year {
            guard let g = myGoal(id) else { return }
            old = g.areaId
        } else {
            guard let t = myTask(id) else { return }
            old = t.areaId
        }
        if let area { walk.ensureArea(area) }
        walk.setArea(id, level: level, to: area?.id)
        if let old, old != area?.id { walk.dropAreaIfUnused(old) }
    }

    /// Moves today's first-thing mark from `previous` to `id` (either may be nil), and leaves
    /// exactly one of my "chosen for today" rows for today: `id`'s (none when `id` is nil). The
    /// first thing is read as my oldest such row (`DailyDay.firstThing`), so any other one (an
    /// Inbox item sent to Today, a row made elsewhere) would be read as first instead.
    func setFirst(_ id: UUID?, previous: UUID?) {
        if let id, myTask(id) == nil { return }
        walk.setFirstThing(id, previous: previous)
        let today = periods.today
        // Only my rows on my own tasks: those are the ones `DailyDay.firstThing` can read.
        let others = Set(((try? context.fetch(FetchDescriptor<TaskFocus>())) ?? [])
            .filter { $0.userId == userId && PlanCalendar.sameDay($0.date, today) && $0.taskId != id && $0.taskId != previous }
            .map(\.taskId))
            .filter { myTask($0) != nil }
        for other in others { walk.setFirstThing(nil, previous: other) }
    }

    // MARK: Plumbing

    /// A goal or task with this id exists and is the signed-in person's own.
    private func owns(_ id: UUID) -> Bool {
        myTask(id) != nil || myGoal(id) != nil
    }

    /// Mine as `DailyDay.mine` reads it: my id, and personal or no life area.
    private func isMine(userId: UUID, context: String?) -> Bool {
        userId == self.userId && (context == nil || context == "personal")
    }

    private func myTask(_ id: UUID) -> SymphonyTask? {
        var d = FetchDescriptor<SymphonyTask>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        return (try? context.fetch(d))?.first.flatMap { isMine(userId: $0.userId, context: $0.context) ? $0 : nil }
    }

    private func myGoal(_ id: UUID) -> Goal? {
        var d = FetchDescriptor<Goal>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        return (try? context.fetch(d))?.first.flatMap { isMine(userId: $0.userId, context: $0.context) ? $0 : nil }
    }

    /// The parent as stored: nil unless its row is mine; its area is the stored row's.
    private func storedParent(_ parent: WalkItem) -> WalkItem? {
        var item = parent
        if let g = myGoal(parent.id) {
            item.areaId = g.areaId
        } else if let t = myTask(parent.id) {
            item.areaId = t.areaId
        } else {
            return nil
        }
        return item
    }
}
