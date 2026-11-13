import Foundation
import SwiftData

/// The one place the walk writes: each flag it plants is a real row in the
/// store every household uses, linked up the chain the way the web links
/// them, and queued for sync like any other edit.
///
/// Year goal = a `goals` row with its life area. Season goal = a plain task
/// on the season, `goal_id` → the year goal. Month goal and week task = plain
/// tasks, `source_id` → the line above, `goal_id` copied from it. Everything
/// is `context = "personal"`; `is_goal`, `goal_task_id` and
/// `supports_goal_task_id` are never written.
///
/// Whenever it sets a link or a link flag (`linksDirty`, `areaDirty`) it
/// queues an update for that row in the same save, even when the row's
/// insert is still queued: the insert may already be in flight, and a flag
/// with nothing queued is overwritten by the next pull. The sync engine
/// holds that update until the insert lands.
///
/// It only ever edits or deletes the signed-in person's own rows: an existing
/// goal, task or area whose `userId` is someone else's (a partner's shared
/// row) is left exactly as it is, whatever id it is handed.
///
/// A struct over one small reference box, so copies share what was pulled up
/// (for Undo) and which areas this walk made.
struct WalkWriter {
    let context: ModelContext
    let userId: UUID
    let periods: WalkPeriods
    private let memory: Memory

    /// Everything the walk creates is personal; it never asks.
    static let lifeArea = "personal"

    init(context: ModelContext, userId: UUID, periods: WalkPeriods) {
        self.context = context
        self.userId = userId
        self.periods = periods
        self.memory = Memory()
    }

    private var plan: PlanWriter { PlanWriter(context: context, userId: userId) }

    // MARK: Links

    /// The web's links (journalGroups / applyChangeSet): a season line names
    /// its year goal in `goal_id`; a month line or week task names the line
    /// above in `source_id` and copies that line's `goal_id`.
    static func links(level: WalkLevel, parentId: UUID?, parentGoalId: UUID?) -> (goalId: UUID?, sourceId: UUID?) {
        switch level {
        case .year: return (nil, nil)
        case .season: return (parentId, nil)
        case .month, .week, .today: return (parentGoalId, parentId)
        }
    }

    /// The links for a row under `parent`, read from the parent's row. Only a
    /// parent that exists here is named, and only in the column that can hold
    /// it (`goal_id` → goals, `source_id` → tasks): a link the server would
    /// refuse would hold the insert in the queue for ever.
    private func links(for level: WalkLevel, under parent: WalkItem?) -> (goalId: UUID?, sourceId: UUID?) {
        guard let parent, level != .year else { return (nil, nil) }
        if let g = goal(parent.id) {
            return Self.links(level: .season, parentId: g.id, parentGoalId: nil)
        }
        if level != .season, let p = task(parent.id) {
            return Self.links(level: level, parentId: p.id, parentGoalId: p.goalId)
        }
        return (nil, nil)
    }

    // MARK: Areas

    /// Makes the area unless a `goal_areas` row with that id exists. Called
    /// before the row that points at it, so the area is queued first.
    func ensureArea(_ area: WalkArea) {
        guard self.area(area.id) == nil else { return }
        let all = (try? context.fetch(FetchDescriptor<GoalArea>())) ?? []
        let highest = all.filter { $0.userId == userId }.map(\.sortOrder).max()
        let a = GoalArea(id: area.id, userId: userId, name: area.name,
                         sortOrder: highest.map { $0 + 1 } ?? 0, context: Self.lifeArea)
        context.insert(a)
        queueRevival(table: "goal_areas", id: a.id)
        memory.madeAreas.insert(a.id)
        memory.droppedAreas[a.id] = nil
        save()
    }

    /// Takes back an area this walk made once nothing is filed under it. An
    /// area it did not make is never touched.
    func dropAreaIfUnused(_ id: UUID) {
        guard memory.madeAreas.contains(id), let a = area(id), a.userId == userId else { return }
        let goals = (try? context.fetch(FetchDescriptor<Goal>())) ?? []
        let tasks = (try? context.fetch(FetchDescriptor<SymphonyTask>())) ?? []
        guard !goals.contains(where: { $0.areaId == id }), !tasks.contains(where: { $0.areaId == id }) else { return }
        memory.droppedAreas[id] = a.name
        if insertQueued(table: "goal_areas", id: id) {
            dropQueued { $0.tableName == "goal_areas" && $0.recordId == id }
        } else {
            context.queueSync(table: "goal_areas", recordId: id, type: "delete")
        }
        context.delete(a)
        save()
    }

    // MARK: Planting

    /// Plants a flag. Planting the same item twice (a resumed walk) is one
    /// row: an id already in the store is left as it is.
    func create(_ item: WalkItem, parent: WalkItem?) {
        guard goal(item.id) == nil, task(item.id) == nil else { return }
        switch item.level {
        case .year:
            let g = plan.createGoal(name: item.title, notes: nil, context: Self.lifeArea,
                                    year: periods.year, id: item.id)
            g.areaId = item.areaId
            markAreaToSend(g)
        case .season, .month, .week, .today:
            let t: SymphonyTask
            switch item.level {
            case .season:
                t = plan.createPeriodTask(title: item.title, level: "season", periodStart: periods.season.start,
                                          context: Self.lifeArea, id: item.id)
            case .month:
                t = plan.createPeriodTask(title: item.title, level: "month", periodStart: periods.monthStart,
                                          context: Self.lifeArea, id: item.id)
            default:
                t = plan.createPeriodTask(title: item.title, level: "week",
                                          periodStart: PlanCalendar.weekStart(item.day ?? periods.today),
                                          context: Self.lifeArea, id: item.id)
                // On its day, but not the first thing: that is setFirstThing.
                if let day = item.day { plan.planTask(t, on: day, focusToday: false) }
            }
            let l = links(for: item.level, under: parent)
            t.goalId = l.goalId
            t.sourceId = l.sourceId
            t.areaId = item.areaId
            markLinksToSend(t)
        }
        save()
    }

    // MARK: Pulling up and Undo

    /// Pulls a flag up. A row whose insert is still queued is taken back
    /// whole (its queued changes, commitments and focus rows), so nothing
    /// about it reaches the server; a row that reached it is deleted there
    /// too. Rows that named it lose the link, as the server's `SET NULL`
    /// does. What `restore` needs is kept in memory by id.
    func remove(_ id: UUID, level: WalkLevel) {
        let removed: Removed
        if level == .year {
            guard let g = myGoal(id) else { return }
            let fields = GoalFields(g)
            let unlinked = unlinkChildren(of: id)
            if insertQueued(table: "goals", id: id) {
                dropQueued { $0.tableName == "goals" && $0.recordId == id }
            } else {
                context.queueSync(table: "goals", recordId: id, type: "delete")
            }
            context.delete(g)
            removed = Removed(row: .goal(fields), commitments: [], focusDays: [], unlinked: unlinked)
        } else {
            guard let t = myTask(id) else { return }
            let fields = TaskFields(t)
            let commitments = ((try? context.fetch(FetchDescriptor<TaskCommitment>())) ?? []).filter { $0.taskId == id }
            let focusRows = ((try? context.fetch(FetchDescriptor<TaskFocus>())) ?? []).filter { $0.taskId == id }
            let unlinked = unlinkChildren(of: id)
            // Commitments and focus rows go with the task either way: never
            // sent, or removed on the server by its ON DELETE CASCADE.
            let rowIds = Set(commitments.map(\.id) + focusRows.map(\.id))
            dropQueued { ($0.tableName == "task_commitments" || $0.tableName == "task_focus") && rowIds.contains($0.recordId) }
            if insertQueued(table: "tasks", id: id) {
                dropQueued { $0.tableName == "tasks" && $0.recordId == id }
            } else {
                context.queueSync(table: "tasks", recordId: id, type: "delete")
            }
            removed = Removed(
                row: .task(fields),
                commitments: commitments.map(CommitmentFields.init),
                focusDays: focusRows.filter { $0.userId == userId }.map(\.date),
                unlinked: unlinked)
            for c in commitments { context.delete(c) }
            for f in focusRows { context.delete(f) }
            context.delete(t)
        }
        memory.removed[id] = removed
        save()
    }

    /// Undo of a pull up: the row comes back with the same id, its
    /// commitments and today's focus, and the rows it unlinked name it again.
    func restore(_ id: UUID) {
        guard let r = memory.removed.removeValue(forKey: id) else { return }
        // An area this walk dropped meanwhile comes back first, so it is queued first.
        if let areaId = r.areaId, area(areaId) == nil, let name = memory.droppedAreas[areaId] {
            ensureArea(WalkArea(id: areaId, name: name))
        }
        switch r.row {
        case .goal(let f):
            guard goal(id) == nil else { break }
            let g = Goal(id: id, userId: f.userId, name: f.name, year: f.year, syncStatus: .pending)
            g.status = f.status
            g.notes = f.notes
            g.context = f.context
            g.scope = f.scope
            g.sortOrder = f.sortOrder
            g.createdAt = f.createdAt
            g.areaId = existing(f.areaId, area)
            g.areaDirty = true
            context.insert(g)
            queueRevival(table: "goals", id: id)
        case .task(let f):
            guard task(id) == nil else { break }
            let t = SymphonyTask(id: id, userId: f.userId, title: f.title, completed: f.completed,
                                 scheduledFor: f.scheduledFor, context: f.context, notes: f.notes)
            t.completedAt = f.completedAt
            t.isAllDay = f.isAllDay
            t.isSomeday = f.isSomeday
            t.bucket = f.bucket
            t.weekStart = f.weekStart
            t.monthStart = f.monthStart
            t.seasonStart = f.seasonStart
            t.weekendStart = f.weekendStart
            t.sortOrder = f.sortOrder
            t.scope = f.scope
            t.createdAt = f.createdAt
            t.placementDirty = true
            t.goalId = existing(f.goalId, goal)
            t.sourceId = existing(f.sourceId, task)
            t.areaId = existing(f.areaId, area)
            t.linksDirty = true
            context.insert(t)
            queueRevival(table: "tasks", id: id)
            for c in r.commitments {
                let row = TaskCommitment(id: c.id, taskId: id, level: c.level, periodStart: c.periodStart,
                                         status: c.status, createdBy: c.createdBy)
                row.carriedTo = c.carriedTo
                row.endedAt = c.endedAt
                context.insert(row)
                context.queueSync(table: "task_commitments", recordId: row.id, type: "insert")
            }
            for day in r.focusDays { focus(id, on: day) }
        }
        for u in r.unlinked {
            guard let child = myTask(u.id) else { continue }
            if u.goal, child.goalId == nil { child.goalId = id }
            if u.source, child.sourceId == nil { child.sourceId = id }
            markLinksToSend(child)
        }
        save()
    }

    // MARK: Moving, first thing, ticking

    /// Files a flag under another area (or none).
    func setArea(_ id: UUID, level: WalkLevel, to areaId: UUID?) {
        if level == .year {
            guard let g = myGoal(id) else { return }
            g.areaId = areaId
            markAreaToSend(g)
        } else {
            guard let t = myTask(id) else { return }
            t.areaId = areaId
            markLinksToSend(t)
        }
        save()
    }

    /// Moves today's first-thing mark from `previous` to `id` (either may be
    /// nil). The first thing is dated today if it is not already; when the
    /// mark leaves a task it dated, that task goes back to where it was (as
    /// long as this writer remembers: a relaunch leaves it on today).
    func setFirstThing(_ id: UUID?, previous: UUID?) {
        let today = periods.today
        if let previous, let f = focusRow(TaskFocus.key(taskId: previous, userId: userId, date: today)) {
            unfocus(f)
        }
        if let previous, previous != id, let placement = memory.datedToday.removeValue(forKey: previous),
           myTask(previous) != nil {
            plan.undo(placement)            // puts the placement back and queues the update
        }
        if let id, let t = myTask(id) {
            if !PlanCalendar.sameDay(t.scheduledFor, today) {
                memory.datedToday[id] = plan.planTask(t, on: today, focusToday: true)
            }
            // planTask focuses only on the clock's today; the walk's today is
            // the one it was opened on.
            focus(id, on: today)
        }
        save()
    }

    /// Ticks or unticks any of the person's own tasks, planted by the walk or not.
    func toggleDone(_ id: UUID) {
        guard let t = myTask(id) else { return }
        plan.complete(t)
    }

    // MARK: Memory

    private final class Memory {
        var removed: [UUID: Removed] = [:]
        var madeAreas: Set<UUID> = []
        /// Names of areas this walk made and then dropped, so Undo can bring one back.
        var droppedAreas: [UUID: String] = [:]
        /// Tasks the first-thing mark dated today, with where they were before.
        var datedToday: [UUID: PlanWriter.Snapshot] = [:]
    }

    private struct Removed {
        enum Row { case goal(GoalFields), task(TaskFields) }
        let row: Row
        let commitments: [CommitmentFields]
        let focusDays: [Date]
        let unlinked: [Unlinked]

        var areaId: UUID? {
            switch row {
            case .goal(let f): return f.areaId
            case .task(let f): return f.areaId
            }
        }
    }

    private struct Unlinked {
        let id: UUID
        let goal: Bool
        let source: Bool
    }

    private struct GoalFields {
        let userId: UUID, name: String, year: Int, status: String, notes: String?, context: String?
        let scope: String?, sortOrder: Int, createdAt: Date, areaId: UUID?

        init(_ g: Goal) {
            userId = g.userId; name = g.name; year = g.year; status = g.status; notes = g.notes
            context = g.context; scope = g.scope; sortOrder = g.sortOrder; createdAt = g.createdAt; areaId = g.areaId
        }
    }

    /// The fields a walk-planted task carries.
    private struct TaskFields {
        let userId: UUID, title: String, completed: Bool, completedAt: Date?, scheduledFor: Date?
        let isAllDay: Bool, isSomeday: Bool, bucket: String?, context: String?, notes: String?, scope: String?
        let weekStart: Date?, monthStart: Date?, seasonStart: Date?, weekendStart: Date?, sortOrder: Int?
        let createdAt: Date, goalId: UUID?, sourceId: UUID?, areaId: UUID?

        init(_ t: SymphonyTask) {
            userId = t.userId; title = t.title; completed = t.completed; completedAt = t.completedAt
            scheduledFor = t.scheduledFor; isAllDay = t.isAllDay; isSomeday = t.isSomeday; bucket = t.bucket
            context = t.context; notes = t.notes; scope = t.scope; weekStart = t.weekStart
            monthStart = t.monthStart; seasonStart = t.seasonStart; weekendStart = t.weekendStart
            sortOrder = t.sortOrder; createdAt = t.createdAt
            goalId = t.goalId; sourceId = t.sourceId; areaId = t.areaId
        }
    }

    private struct CommitmentFields {
        let id: UUID, level: String, periodStart: Date, status: String
        let carriedTo: Date?, createdBy: UUID?, endedAt: Date?

        init(_ c: TaskCommitment) {
            id = c.id; level = c.level; periodStart = c.periodStart; status = c.status
            carriedTo = c.carriedTo; createdBy = c.createdBy; endedAt = c.endedAt
        }
    }

    // MARK: Plumbing

    /// The person's own rows that named `id` lose that link, as the server's
    /// `SET NULL` does. A partner's row is left to the server.
    private func unlinkChildren(of id: UUID) -> [Unlinked] {
        let tasks = (try? context.fetch(FetchDescriptor<SymphonyTask>())) ?? []
        var unlinked: [Unlinked] = []
        for t in tasks where t.userId == userId && t.id != id && (t.goalId == id || t.sourceId == id) {
            let u = Unlinked(id: t.id, goal: t.goalId == id, source: t.sourceId == id)
            if u.goal { t.goalId = nil }
            if u.source { t.sourceId = nil }
            markLinksToSend(t)
            unlinked.append(u)
        }
        return unlinked
    }

    private func markLinksToSend(_ t: SymphonyTask) {
        t.linksDirty = true
        t.updatedAt = Date()
        t.syncStatus = .pending
        context.queueSync(table: "tasks", recordId: t.id, type: "update")
    }

    private func markAreaToSend(_ g: Goal) {
        g.areaDirty = true
        g.updatedAt = Date()
        g.syncStatus = .pending
        context.queueSync(table: "goals", recordId: g.id, type: "update")
    }

    /// Queues a row coming (back) into being. If its delete is still queued
    /// the server row was never removed: drop the delete and send an update,
    /// so a later pull up still sees a row that reached the server.
    private func queueRevival(table: String, id: UUID) {
        let queued = (try? context.fetch(FetchDescriptor<PendingChange>())) ?? []
        let deletes = queued.filter { $0.tableName == table && $0.recordId == id && $0.changeType == "delete" }
        if deletes.isEmpty {
            context.queueSync(table: table, recordId: id, type: "insert")
        } else {
            for d in deletes { context.delete(d) }
            context.queueSync(table: table, recordId: id, type: "update")
        }
    }

    private func insertQueued(table: String, id: UUID) -> Bool {
        let queued = (try? context.fetch(FetchDescriptor<PendingChange>())) ?? []
        return queued.contains { $0.tableName == table && $0.recordId == id && $0.changeType == "insert" }
    }

    private func dropQueued(where match: (PendingChange) -> Bool) {
        let queued = (try? context.fetch(FetchDescriptor<PendingChange>())) ?? []
        for c in queued where match(c) { context.delete(c) }
    }

    private func focus(_ taskId: UUID, on day: Date) {
        guard focusRow(TaskFocus.key(taskId: taskId, userId: userId, date: day)) == nil else { return }
        let f = TaskFocus(taskId: taskId, userId: userId, date: day)
        context.insert(f)
        context.queueSync(table: "task_focus", recordId: f.id, type: "insert")
    }

    /// As `PlanWriter.unfocus`: a still-queued insert is dropped, else a keyed delete goes up.
    private func unfocus(_ f: TaskFocus) {
        context.queueKeyedDelete(table: "task_focus", recordId: f.id, match: [
            "task_id": f.taskId.uuidString.lowercased(),
            "user_id": f.userId.uuidString.lowercased(),
            "date": PlanCalendar.ymd(f.date),
        ])
        context.delete(f)
    }

    /// `id` if a row with it exists here, else nil.
    private func existing<T>(_ id: UUID?, _ find: (UUID) -> T?) -> UUID? {
        guard let id, find(id) != nil else { return nil }
        return id
    }

    private func task(_ id: UUID) -> SymphonyTask? {
        var d = FetchDescriptor<SymphonyTask>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        return (try? context.fetch(d))?.first
    }

    private func goal(_ id: UUID) -> Goal? {
        var d = FetchDescriptor<Goal>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        return (try? context.fetch(d))?.first
    }

    /// The row only if it is the signed-in person's own.
    private func myTask(_ id: UUID) -> SymphonyTask? {
        task(id).flatMap { $0.userId == userId ? $0 : nil }
    }

    private func myGoal(_ id: UUID) -> Goal? {
        goal(id).flatMap { $0.userId == userId ? $0 : nil }
    }

    private func area(_ id: UUID) -> GoalArea? {
        var d = FetchDescriptor<GoalArea>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        return (try? context.fetch(d))?.first
    }

    private func focusRow(_ id: UUID) -> TaskFocus? {
        var d = FetchDescriptor<TaskFocus>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        return (try? context.fetch(d))?.first
    }

    private func save() { try? context.save() }
}
