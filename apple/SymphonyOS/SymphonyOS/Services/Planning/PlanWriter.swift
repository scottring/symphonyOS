import Foundation
import SwiftData

/// Placement writes, mirroring the web's payloads (lib/placement/intentions.ts,
/// lib/planning/planActions.ts, components/schedule/InboxView.tsx). Every
/// write lands locally first and queues its push; database triggers keep the
/// `tasks` placement cache in step with `task_commitments`.
///
/// Rules carried over from the web:
/// • Moving DOWN (week → a day) keeps the higher commitments.
/// • Someday removes every open commitment.
/// • "Chosen for today" is my own `task_focus` row, never the shared column.
/// • A routine occurrence is chosen on its instance; the rule never changes.
struct PlanWriter {
    let context: ModelContext
    let userId: UUID

    // MARK: Undo

    /// What a move changed, so Undo can put it back exactly.
    struct Snapshot {
        struct TaskState {
            let id: UUID
            let bucket: String?
            let scheduledFor: Date?
            let isAllDay: Bool
            let isSomeday: Bool
            let weekStart: Date?
            let monthStart: Date?
            let seasonStart: Date?
            let weekendStart: Date?
            let deferCount: Int
            let context: String?
            let scope: String?
        }
        var tasks: [TaskState] = []
        var createdCommitments: [UUID] = []
        /// (id, previous status, previous endedAt, previous carriedTo)
        var changedCommitments: [(UUID, String, Date?, Date?)] = []
        var createdFocus: [UUID] = []

        mutating func merge(_ other: Snapshot) {
            tasks += other.tasks
            createdCommitments += other.createdCommitments
            changedCommitments += other.changedCommitments
            createdFocus += other.createdFocus
        }
    }

    private func capture(_ t: SymphonyTask) -> Snapshot.TaskState {
        .init(id: t.id, bucket: t.bucket, scheduledFor: t.scheduledFor, isAllDay: t.isAllDay,
              isSomeday: t.isSomeday, weekStart: t.weekStart, monthStart: t.monthStart,
              seasonStart: t.seasonStart, weekendStart: t.weekendStart, deferCount: t.deferCount,
              context: t.context, scope: t.scope)
    }

    // MARK: Destinations

    enum Destination: Equatable {
        case today
        case day(Date, allDay: Bool)
        case thisWeek
        case someday

        /// Web `needsDomain`: every destination here places the task, so an
        /// unclassified task (not a step) must get a life area first.
        var needsLifeArea: Bool { true }
    }

    /// Does this task need a life area before it can be placed?
    static func needsLifeArea(_ task: SymphonyTask) -> Bool {
        task.context == nil && task.parentTaskId == nil
    }

    /// Move a task (Inbox triage, unfinished review). `lifeArea` rides in the
    /// same write. Returns what changed, for Undo.
    @discardableResult
    func move(_ task: SymphonyTask, to destination: Destination, lifeArea: String? = nil,
              members: [FamilyMember] = []) -> Snapshot {
        var snap = Snapshot(tasks: [capture(task)])
        if let lifeArea, task.context == nil {
            task.context = lifeArea
            TaskViewModel(modelContext: context).reconcileScope(task, members: members)
        }
        switch destination {
        case .today:
            let day = PlanCalendar.day(Date())
            placeOnDay(task, day: day, allDay: true)
            task.deferCount += 1
            snap.createdFocus += focus(task, on: day)
        case .day(let date, let allDay):
            let day = PlanCalendar.day(date)
            placeOnDay(task, day: allDay ? day : date, allDay: allDay)
            if PlanCalendar.calendar.isDateInToday(day) { snap.createdFocus += focus(task, on: day) }
        case .thisWeek:
            let ws = PlanCalendar.weekStart(Date())
            task.bucket = "week"
            task.scheduledFor = nil
            task.isAllDay = false
            task.isSomeday = false
            task.weekStart = ws
            task.weekendStart = nil
            task.placementDirty = true
            task.deferCount += 1
            snap.merge(ensureCommitment(task, level: "week", periodStart: ws))
        case .someday:
            snap.merge(removeOpenCommitments(task))
            task.bucket = "someday"
            task.scheduledFor = nil
            task.isAllDay = false
            task.isSomeday = true
        }
        touch(task)
        save()
        return snap
    }

    /// Plan a week task into a day from the chooser. No commitment changes:
    /// its week stays open (moving down keeps the higher commitments).
    @discardableResult
    func planTask(_ task: SymphonyTask, on date: Date) -> Snapshot {
        var snap = Snapshot(tasks: [capture(task)])
        let day = PlanCalendar.day(date)
        placeOnDay(task, day: day, allDay: true)
        if PlanCalendar.calendar.isDateInToday(day) { snap.createdFocus += focus(task, on: day) }
        touch(task)
        save()
        return snap
    }

    /// Move a task DOWN into a lower period (season → month → week). Its
    /// higher commitments stay; the new one is added. Mirrors the web's
    /// planPlacement for a downward move.
    @discardableResult
    func placeDown(_ task: SymphonyTask, level: String, periodStart: Date) -> Snapshot {
        var snap = Snapshot(tasks: [capture(task)])
        let start = PlanCalendar.day(periodStart)
        task.bucket = PlanSnapshot.bucket(for: level)
        task.scheduledFor = nil
        task.isAllDay = false
        task.isSomeday = false
        switch level {
        case "week": task.weekStart = start; task.weekendStart = nil
        case "month": task.monthStart = start
        default: task.seasonStart = start
        }
        task.placementDirty = true
        snap.merge(ensureCommitment(task, level: level, periodStart: start))
        touch(task)
        save()
        return snap
    }

    private func placeOnDay(_ task: SymphonyTask, day: Date, allDay: Bool) {
        task.bucket = "timed"
        task.scheduledFor = day
        task.isAllDay = allDay
        task.isSomeday = false
        // tasks_align_week_to_day sets this server-side too; set it locally so
        // the phone's own week views agree before the round trip.
        task.weekStart = PlanCalendar.weekStart(day)
    }

    // MARK: Undo

    func undo(_ snap: Snapshot) {
        let tasks = (try? context.fetch(FetchDescriptor<SymphonyTask>())) ?? []
        for state in snap.tasks {
            guard let t = tasks.first(where: { $0.id == state.id }) else { continue }
            t.bucket = state.bucket
            t.scheduledFor = state.scheduledFor
            t.isAllDay = state.isAllDay
            t.isSomeday = state.isSomeday
            t.weekStart = state.weekStart
            t.monthStart = state.monthStart
            t.seasonStart = state.seasonStart
            t.weekendStart = state.weekendStart
            t.deferCount = state.deferCount
            if t.context != state.context {
                t.context = state.context
                t.scope = state.scope
                t.scopeDirty = true
            }
            t.placementDirty = true
            touch(t)
        }
        let commitments = (try? context.fetch(FetchDescriptor<TaskCommitment>())) ?? []
        let now = Date()
        let queued = (try? context.fetch(FetchDescriptor<PendingChange>())) ?? []
        for id in snap.createdCommitments {
            guard let c = commitments.first(where: { $0.id == id }) else { continue }
            if let insert = queued.first(where: { $0.tableName == "task_commitments" && $0.recordId == id && $0.changeType == "insert" }) {
                // Never reached the server: take it back entirely.
                context.delete(insert)
                context.delete(c)
            } else {
                c.status = "removed"
                c.endedAt = now
                queueCommitment(c)
            }
        }
        for (id, status, ended, carried) in snap.changedCommitments {
            guard let c = commitments.first(where: { $0.id == id }) else { continue }
            c.status = status
            c.endedAt = ended
            c.carriedTo = carried
            queueCommitment(c)
        }
        let focusRows = (try? context.fetch(FetchDescriptor<TaskFocus>())) ?? []
        for id in snap.createdFocus {
            guard let f = focusRows.first(where: { $0.id == id }) else { continue }
            unfocus(f)
        }
        save()
    }

    // MARK: Routines

    /// Choose a routine occurrence for `date` (web: `update {planned_on}` on
    /// the day's instance). A flexible weekly routine — no day of its own —
    /// also gets "given this day" (`deferred_to`, the web's placeRoutineOnce),
    /// which is what gives it a home for the week. The repeating rule itself
    /// is never touched.
    func chooseRoutine(_ routine: Routine, on date: Date, flexible: Bool) {
        let day = PlanCalendar.day(date)
        let i = instance(for: routine, on: day)
        i.plannedOn = day
        if flexible {
            i.status = "pending"
            // Local noon: the same calendar day in any US zone, even read as UTC.
            i.deferredTo = PlanCalendar.calendar.date(bySettingHour: 12, minute: 0, second: 0, of: day)
        }
        i.updatedAt = Date()
        i.syncStatus = .pending
        queueInstance(i)
        save()
    }

    func unchooseRoutine(_ routine: Routine, on date: Date, flexible: Bool) {
        let day = PlanCalendar.day(date)
        let i = instance(for: routine, on: day)
        i.plannedOn = nil
        if flexible, PlanCalendar.sameDay(i.deferredTo, day) { i.deferredTo = nil }
        i.updatedAt = Date()
        i.syncStatus = .pending
        queueInstance(i)
        save()
    }

    private func instance(for routine: Routine, on day: Date) -> ActionableInstance {
        let key = routine.id.uuidString
        let all = (try? context.fetch(FetchDescriptor<ActionableInstance>())) ?? []
        if let existing = all.first(where: {
            $0.entityType == "routine" && $0.entityId.lowercased() == key.lowercased() && PlanCalendar.sameDay($0.date, day)
        }) { return existing }
        let created = ActionableInstance(userId: userId, entityType: "routine", entityId: key.lowercased(), date: day)
        context.insert(created)
        return created
    }

    private func queueInstance(_ i: ActionableInstance) {
        let queued = (try? context.fetch(FetchDescriptor<PendingChange>())) ?? []
        let hasInsert = queued.contains { $0.tableName == "actionable_instances" && $0.recordId == i.id && $0.changeType == "insert" }
        // A brand-new local row pushes as an insert (natural-key upsert);
        // one pulled from the server pushes as an update.
        let isNew = i.lastSyncedAt == nil && i.syncStatus == .pending
        context.queueSync(table: "actionable_instances", recordId: i.id, type: (isNew || hasInsert) ? "insert" : "update")
    }

    // MARK: Week review verdicts (web WeekPlanHost)

    /// Keep: carry last week's commitment into this week. Same task.
    @discardableResult
    func keep(_ task: SymphonyTask, from old: TaskCommitment, into week: Date) -> Snapshot {
        var snap = Snapshot(tasks: [capture(task)])
        let ws = PlanCalendar.weekStart(week)
        snap.changedCommitments.append((old.id, old.status, old.endedAt, old.carriedTo))
        old.status = "carried"
        old.carriedTo = ws
        old.endedAt = Date()
        queueCommitment(old)
        snap.merge(ensureCommitment(task, level: "week", periodStart: ws))
        task.bucket = "week"
        task.scheduledFor = nil
        task.isAllDay = false
        task.weekStart = ws
        task.weekendStart = nil
        task.placementDirty = true
        touch(task)
        save()
        return snap
    }

    /// Drop: end only that week's commitment. The task survives; with nothing
    /// else holding it the database returns it to the Inbox.
    @discardableResult
    func drop(_ commitment: TaskCommitment) -> Snapshot {
        var snap = Snapshot()
        snap.changedCommitments.append((commitment.id, commitment.status, commitment.endedAt, commitment.carriedTo))
        commitment.status = "removed"
        commitment.endedAt = Date()
        queueCommitment(commitment)
        save()
        return snap
    }

    @discardableResult
    func someday(_ task: SymphonyTask) -> Snapshot { move(task, to: .someday) }

    func complete(_ task: SymphonyTask) {
        TaskViewModel(modelContext: context).toggleComplete(task)
    }

    // MARK: Commitments + focus

    private func ensureCommitment(_ task: SymphonyTask, level: String, periodStart: Date) -> Snapshot {
        var snap = Snapshot()
        let all = (try? context.fetch(FetchDescriptor<TaskCommitment>())) ?? []
        if let existing = all.first(where: {
            $0.taskId == task.id && $0.level == level && PlanCalendar.sameDay($0.periodStart, periodStart)
        }) {
            if existing.status != "open" {
                snap.changedCommitments.append((existing.id, existing.status, existing.endedAt, existing.carriedTo))
                existing.status = "open"
                existing.endedAt = nil
                queueCommitment(existing)
            }
            return snap
        }
        let c = TaskCommitment(taskId: task.id, level: level, periodStart: PlanCalendar.day(periodStart), createdBy: userId)
        context.insert(c)
        context.queueSync(table: "task_commitments", recordId: c.id, type: "insert")
        snap.createdCommitments.append(c.id)
        return snap
    }

    private func removeOpenCommitments(_ task: SymphonyTask) -> Snapshot {
        var snap = Snapshot()
        let all = (try? context.fetch(FetchDescriptor<TaskCommitment>())) ?? []
        let now = Date()
        for c in all where c.taskId == task.id && c.status == "open" {
            snap.changedCommitments.append((c.id, c.status, c.endedAt, c.carriedTo))
            c.status = "removed"
            c.endedAt = now
            queueCommitment(c)
        }
        return snap
    }

    /// Commitments push on their natural key, so an update and an insert are
    /// the same upsert-or-update; a still-queued insert already carries the
    /// latest values.
    private func queueCommitment(_ c: TaskCommitment) {
        c.syncStatus = .pending
        let queued = (try? context.fetch(FetchDescriptor<PendingChange>())) ?? []
        if queued.contains(where: { $0.tableName == "task_commitments" && $0.recordId == c.id && $0.changeType == "insert" }) { return }
        context.queueSync(table: "task_commitments", recordId: c.id, type: "update")
    }

    private func focus(_ task: SymphonyTask, on day: Date) -> [UUID] {
        let id = TaskFocus.key(taskId: task.id, userId: userId, date: day)
        let all = (try? context.fetch(FetchDescriptor<TaskFocus>())) ?? []
        guard !all.contains(where: { $0.id == id }) else { return [] }
        let f = TaskFocus(taskId: task.id, userId: userId, date: day)
        context.insert(f)
        context.queueSync(table: "task_focus", recordId: f.id, type: "insert")
        return [f.id]
    }

    private func unfocus(_ f: TaskFocus) {
        context.queueKeyedDelete(table: "task_focus", recordId: f.id, match: [
            "task_id": f.taskId.uuidString.lowercased(),
            "user_id": f.userId.uuidString.lowercased(),
            "date": PlanCalendar.ymd(f.date),
        ])
        context.delete(f)
    }

    // MARK: Plumbing

    private func touch(_ task: SymphonyTask) {
        task.updatedAt = Date()
        task.syncStatus = .pending
        context.queueSync(table: "tasks", recordId: task.id, type: "update")
    }

    private func save() { try? context.save() }
}
