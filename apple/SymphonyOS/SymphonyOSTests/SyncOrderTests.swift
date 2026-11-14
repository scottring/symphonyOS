import Testing
import Foundation
import SwiftData
import PostgREST   // PostgrestError, to build a refusal as the server sends it
@testable import Symphony

/// The push queue sends a parent before any child that links to it. A child
/// whose parent's insert has not landed yet waits (without spending an
/// attempt); a parent that will never arrive is unlinked, so the child is
/// never stuck behind a foreign key. Only links the phone itself set
/// (`linksDirty` / `areaDirty`) count: a clean row sends no link, so it has
/// nothing to wait for — existing households' queues behave exactly as before.
@MainActor
struct SyncOrderTests {

    private func makeContext() throws -> ModelContext {
        let container = try ModelContainer(
            for: SymphonyTask.self, Goal.self, GoalArea.self, TaskCommitment.self,
            TaskFocus.self, PendingChange.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return ModelContext(container)
    }

    // MARK: Which rows a change points at

    @Test func aTaskNamesItsGoalItsSourceAndItsArea() throws {
        let context = try makeContext()
        let g = UUID(), s = UUID(), a = UUID()
        let task = SymphonyTask(userId: UUID(), title: "Book the cabin")
        task.goalId = g
        task.sourceId = s
        task.areaId = a
        task.linksDirty = true
        context.insert(task)
        try context.save()
        #expect(SyncEngine.parentIds(table: "tasks", id: task.id, context: context) == [g, s, a])

        task.sourceId = nil
        try context.save()
        #expect(SyncEngine.parentIds(table: "tasks", id: task.id, context: context) == [g, a])
    }

    @Test func aCleanRowNamesNoParents() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Pulled from the web")
        task.goalId = UUID()
        task.sourceId = UUID()
        task.areaId = UUID()
        task.linksDirty = false
        context.insert(task)
        try context.save()
        #expect(SyncEngine.parentIds(table: "tasks", id: task.id, context: context) == [])
    }

    @Test func aGoalNamesItsArea() throws {
        let context = try makeContext()
        let a = UUID()
        let goal = Goal(id: UUID(), userId: UUID(), name: "A summer outdoors", year: 2027)
        goal.areaId = a
        goal.areaDirty = true
        context.insert(goal)
        try context.save()
        #expect(SyncEngine.parentIds(table: "goals", id: goal.id, context: context) == [a])

        goal.areaDirty = false
        try context.save()
        #expect(SyncEngine.parentIds(table: "goals", id: goal.id, context: context) == [])
    }

    @Test func otherTablesNameNoParents() throws {
        let context = try makeContext()
        let commitment = TaskCommitment(taskId: UUID(), level: "week", periodStart: Date())
        context.insert(commitment)
        try context.save()
        #expect(SyncEngine.parentIds(table: "task_commitments", id: commitment.id, context: context) == [])
    }

    /// A row that names itself would otherwise wait on its own insert forever.
    @Test func aRowNeverWaitsOnItself() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Loops back")
        task.sourceId = task.id
        task.linksDirty = true
        context.insert(task)
        try context.save()
        #expect(SyncEngine.parentIds(table: "tasks", id: task.id, context: context) == [])
    }

    // MARK: Waiting, and the parent that never comes

    @Test func aChildWaitsForItsUnpushedParent() {
        let g = UUID()
        #expect(SyncEngine.mustWait(parents: [g], unpushedInserts: [g]))
        #expect(!SyncEngine.mustWait(parents: [g], unpushedInserts: []))
        #expect(!SyncEngine.mustWait(parents: [], unpushedInserts: [g]))
    }

    @Test func aParentThatIsGoneIsLost() {
        let g = UUID()
        #expect(SyncEngine.lostParents([g], unpushedInserts: [], known: []) == [g])
        #expect(SyncEngine.lostParents([g], unpushedInserts: [], known: [g]) == [])
        #expect(SyncEngine.lostParents([g], unpushedInserts: [g], known: []) == [])   // still waiting, not lost
    }

    @Test func knownIdsAreEveryGoalTaskAndArea() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "A task")
        let goal = Goal(id: UUID(), userId: UUID(), name: "A goal", year: 2027)
        let area = GoalArea(userId: UUID(), name: "Health")
        let commitment = TaskCommitment(taskId: task.id, level: "week", periodStart: Date())
        context.insert(task); context.insert(goal); context.insert(area); context.insert(commitment)
        try context.save()
        #expect(SyncEngine.knownIds(context: context) == [task.id, goal.id, area.id])
    }

    @Test func aLostLinkIsClearedAndTheNullIsSent() throws {
        let context = try makeContext()
        let g = UUID()   // no such goal in the store
        let source = SymphonyTask(userId: UUID(), title: "This season: get outside")
        let task = SymphonyTask(userId: UUID(), title: "Walk the ridge")
        task.goalId = g
        task.sourceId = source.id
        task.linksDirty = true
        context.insert(source); context.insert(task)
        try context.save()

        // The server refused the row on a foreign key: the goal (not on this
        // phone) is the only candidate; the source (here) is left alone.
        let parents = SyncEngine.parentIds(table: "tasks", id: task.id, context: context)
        let action = SyncEngine.onPushRejected(code: "23503", parents: parents, queuedInserts: [],
                                               known: SyncEngine.knownIds(context: context))
        #expect(action == .unlink([g]))
        guard case .unlink(let lost) = action else { return }
        SyncEngine.clearLinks(to: lost, table: "tasks", id: task.id, context: context)
        #expect(task.goalId == nil)
        #expect(task.sourceId == source.id)
        #expect(task.linksDirty)
        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        #expect(row["goal_id"] == .null)
        #expect(row["source_id"] == .string(source.id.uuidString))
    }

    /// A partner's personal goal or area is valid on the server but never
    /// pulled here: absence from this phone alone must never null the link.
    @Test func aParentNotOnThisPhoneIsLeftAloneUntilTheServerRefuses() throws {
        let context = try makeContext()
        let partnersArea = UUID()   // not on this phone, no insert queued
        let task = SymphonyTask(userId: UUID(), title: "Shared chore")
        task.areaId = partnersArea
        task.linksDirty = true
        context.insert(task)
        try context.save()

        // Before any refusal it is pushed as it is: no wait, link intact.
        let parents = SyncEngine.parentIds(table: "tasks", id: task.id, context: context)
        #expect(parents == [partnersArea])
        #expect(!SyncEngine.mustWait(parents: parents, unpushedInserts: []))
        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        #expect(row["area_id"] == .string(partnersArea.uuidString))

        let known = SyncEngine.knownIds(context: context)
        // Any other failure (network, RLS, a check constraint) is an ordinary one.
        #expect(SyncEngine.onPushRejected(code: nil, parents: parents, queuedInserts: [], known: known) == .countAttempt)
        #expect(SyncEngine.onPushRejected(code: "42501", parents: parents, queuedInserts: [], known: known) == .countAttempt)
        // A foreign-key refusal when every parent is on this phone: not ours to unlink.
        #expect(SyncEngine.onPushRejected(code: "23503", parents: parents, queuedInserts: [],
                                          known: known.union([partnersArea])) == .countAttempt)
        // Nor when the parent's insert is still queued.
        #expect(SyncEngine.onPushRejected(code: "23503", parents: parents, queuedInserts: [partnersArea],
                                          known: known) == .countAttempt)
        // Only the server's refusal of a parent that is not here unlinks it.
        #expect(SyncEngine.onPushRejected(code: "23503", parents: parents, queuedInserts: [], known: known)
                == .unlink([partnersArea]))
        #expect(task.areaId == partnersArea)   // deciding changed nothing
    }

    @Test func onlyAForeignKeyRefusalCounts() {
        #expect(SyncEngine.isForeignKeyRejection(code: "23503"))
        #expect(!SyncEngine.isForeignKeyRejection(code: "23505"))
        #expect(!SyncEngine.isForeignKeyRejection(code: nil))
        #expect(SyncEngine.postgresCode(of: PostgrestError(code: "23503", message: "violates foreign key constraint")) == "23503")
        #expect(SyncEngine.postgresCode(of: URLError(.notConnectedToInternet)) == nil)
    }

    @Test func aChildStopsWaitingOnAParentThatKeepsFailing() {
        let g = UUID()
        let parentInsert = PendingChange(tableName: "goals", recordId: g, changeType: "insert")
        parentInsert.attempts = SyncEngine.maxPushAttempts - 1
        #expect(SyncEngine.mustWait(parents: [g], unpushedInserts: SyncEngine.insertsWorthWaitingFor([parentInsert])))
        parentInsert.attempts = SyncEngine.maxPushAttempts
        #expect(!SyncEngine.mustWait(parents: [g], unpushedInserts: SyncEngine.insertsWorthWaitingFor([parentInsert])))
        // Only inserts are waited for.
        let parentUpdate = PendingChange(tableName: "goals", recordId: g, changeType: "update")
        #expect(SyncEngine.insertsWorthWaitingFor([parentUpdate]).isEmpty)
    }

    @Test func aGoalsLostAreaIsCleared() throws {
        let context = try makeContext()
        let a = UUID()
        let goal = Goal(id: UUID(), userId: UUID(), name: "A summer outdoors", year: 2027)
        goal.areaId = a
        goal.areaDirty = true
        context.insert(goal)
        try context.save()

        SyncEngine.clearLinks(to: [a], table: "goals", id: goal.id, context: context)
        #expect(goal.areaId == nil)
        #expect(goal.areaDirty)
        let row = try #require(SyncEngine.serializeRow(table: "goals", id: goal.id, context: context))
        #expect(row["area_id"] == .null)
    }

    /// Walks a pass the way the loop does: oldest first, a child skips while
    /// its parent's insert is queued, a pushed insert leaves the queue.
    private func pass(_ queue: [PendingChange], context: ModelContext) -> [UUID] {
        var waiting = queue
        var pushed: [UUID] = []
        for change in queue.sorted(by: { $0.createdAt < $1.createdAt }) {
            let parents = SyncEngine.parentIds(of: change, context: context)     // the loop's own: a delete never waits
            if SyncEngine.mustWait(parents: parents, unpushedInserts: SyncEngine.insertsWorthWaitingFor(waiting)) { continue }
            pushed.append(change.recordId)
            waiting.removeAll { $0 === change }
        }
        return pushed
    }

    @Test func theQueueKeepsParentsFirst() throws {
        let context = try makeContext()
        let writer = PlanWriter(context: context, userId: UUID())
        let goal = writer.createGoal(name: "A summer outdoors", notes: nil, context: "personal", year: 2027)
        let season = writer.createPeriodTask(title: "Get outside every weekend", level: "season",
                                             periodStart: PlanCalendar.season(containing: Date(), boundaries: nil).start)
        season.goalId = goal.id
        season.linksDirty = true
        try context.save()
        let queue = try context.fetch(FetchDescriptor<PendingChange>())
        let goalInsert = try #require(queue.first { $0.tableName == "goals" && $0.recordId == goal.id && $0.changeType == "insert" })
        let taskInsert = try #require(queue.first { $0.tableName == "tasks" && $0.recordId == season.id && $0.changeType == "insert" })
        let inserts = [goalInsert, taskInsert]
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)

        // Parent queued first: both go in one pass, the goal first.
        goalInsert.createdAt = t0
        taskInsert.createdAt = t0.addingTimeInterval(1)
        #expect(pass(inserts, context: context) == [goal.id, season.id])

        // Child queued first: it waits this pass, and goes on the next.
        goalInsert.createdAt = t0.addingTimeInterval(1)
        taskInsert.createdAt = t0
        #expect(pass(inserts, context: context) == [goal.id])
        #expect(pass([taskInsert], context: context) == [season.id])
    }

    // MARK: A day's first thing waits for its task

    /// `task_focus.task_id` references `tasks(id)` on the server: a focus row is a
    /// child of its task, whatever flags the task has.
    private func newTask(_ context: ModelContext, _ title: String) -> SymphonyTask {
        let task = SymphonyTask(userId: UUID(), title: title)
        context.insert(task)
        context.queueSync(table: "tasks", recordId: task.id, type: "insert")
        return task
    }

    private func focus(_ task: SymphonyTask, _ context: ModelContext, queued: Bool = true) -> TaskFocus {
        let f = TaskFocus(taskId: task.id, userId: task.userId, date: Date())
        context.insert(f)
        if queued { context.queueSync(table: "task_focus", recordId: f.id, type: "insert") }
        return f
    }

    private func change(_ context: ModelContext, _ table: String, _ id: UUID, _ type: String = "insert") throws -> PendingChange {
        try #require(try context.fetch(FetchDescriptor<PendingChange>())
            .first { $0.tableName == table && $0.recordId == id && $0.changeType == type })
    }

    @Test func aFocusRowNamesItsTask() throws {
        let context = try makeContext()
        let task = newTask(context, "Book the gym induction")
        task.linksDirty = false                                  // a clean task: the focus still names it
        let f = focus(task, context)
        let commitment = TaskCommitment(taskId: task.id, level: "week", periodStart: Date())
        context.insert(commitment)
        try context.save()
        #expect(SyncEngine.parentIds(table: "task_focus", id: f.id, context: context) == [task.id])
        #expect(SyncEngine.parentIds(table: "task_commitments", id: commitment.id, context: context) == [])
        #expect(SyncEngine.parentIds(table: "tasks", id: task.id, context: context) == [])

        context.delete(f)                                        // gone locally (a keyed delete): no parent to name
        try context.save()
        #expect(SyncEngine.parentIds(table: "task_focus", id: f.id, context: context) == [])
    }

    @Test func aFocusRowGoesUpAfterItsTasksInsert() throws {
        let context = try makeContext()
        let task = newTask(context, "Gym induction")
        let f = focus(task, context)
        try context.save()
        let taskInsert = try change(context, "tasks", task.id)
        let focusInsert = try change(context, "task_focus", f.id)
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)

        taskInsert.createdAt = t0
        focusInsert.createdAt = t0.addingTimeInterval(1)
        #expect(pass([taskInsert, focusInsert], context: context) == [task.id, f.id])

        // Queued ahead of its task: it waits this pass and goes on the next.
        taskInsert.createdAt = t0.addingTimeInterval(1)
        focusInsert.createdAt = t0
        #expect(pass([taskInsert, focusInsert], context: context) == [task.id])
        #expect(pass([focusInsert], context: context) == [f.id])
    }

    /// The task itself waits on its goal: the focus waits with it, and goes once the
    /// task has; a task insert that keeps failing stops holding it, as for any child.
    @Test func aFocusRowWaitsWhileItsTaskIsHeldBack() throws {
        let context = try makeContext()
        let goal = PlanWriter(context: context, userId: UUID())
            .createGoal(name: "Feel strong again", notes: nil, context: "personal", year: 2027)
        let task = newTask(context, "Gym induction")
        task.goalId = goal.id
        task.linksDirty = true
        let f = focus(task, context)
        try context.save()
        let goalInsert = try change(context, "goals", goal.id)
        let taskInsert = try change(context, "tasks", task.id)
        let focusInsert = try change(context, "task_focus", f.id)
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)
        taskInsert.createdAt = t0                                // the task is held back behind its goal
        goalInsert.createdAt = t0.addingTimeInterval(1)
        focusInsert.createdAt = t0.addingTimeInterval(2)

        #expect(pass([goalInsert, taskInsert, focusInsert], context: context) == [goal.id])
        #expect(pass([taskInsert, focusInsert], context: context) == [task.id, f.id])

        taskInsert.attempts = SyncEngine.maxPushAttempts
        let parents = SyncEngine.parentIds(table: "task_focus", id: f.id, context: context)
        #expect(!SyncEngine.mustWait(parents: parents, unpushedInserts: SyncEngine.insertsWorthWaitingFor([taskInsert])))
    }

    @Test func aFocusOnATaskAlreadyOnTheServerGoesAtOnce() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Renew the passport", syncStatus: .synced)
        context.insert(task)
        let f = focus(task, context)
        try context.save()
        #expect(pass([try change(context, "task_focus", f.id)], context: context) == [f.id])
    }

    @Test func aKeyedFocusDeleteNeverWaits() throws {
        let context = try makeContext()
        let task = newTask(context, "Gym induction")
        let f = focus(task, context, queued: false)              // as if pulled: already on the server
        try context.save()
        context.queueKeyedDelete(table: "task_focus", recordId: f.id, match: [
            "task_id": task.id.uuidString.lowercased(), "user_id": task.userId.uuidString.lowercased(),
            "date": PlanCalendar.ymd(f.date),
        ])
        try context.save()
        let taskInsert = try change(context, "tasks", task.id)
        let focusDelete = try change(context, "task_focus", f.id, "delete")
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)
        focusDelete.createdAt = t0
        taskInsert.createdAt = t0.addingTimeInterval(1)
        // Even with the row still here naming its unpushed task, the delete goes first.
        #expect(pass([focusDelete, taskInsert], context: context) == [f.id, task.id])
    }

    /// A focus row's task is its key, not a link: a refusal is counted as it always
    /// was, never "unlinked" (which would retry it forever without counting).
    @Test func aRefusedFocusRowCountsAsBefore() {
        let t = UUID()
        #expect(SyncEngine.onPushRejected(table: "task_focus", code: "23503", parents: [t],
                                          queuedInserts: [], known: []) == .countAttempt)
        #expect(SyncEngine.onPushRejected(table: "tasks", code: "23503", parents: [t],
                                          queuedInserts: [], known: []) == .unlink([t]))
        #expect(SyncEngine.onPushRejected(table: "goals", code: "23503", parents: [t],
                                          queuedInserts: [], known: []) == .unlink([t]))
        #expect(SyncEngine.onPushRejected(table: "tasks", code: "23503", parents: [],
                                          queuedInserts: [], known: []) == .countAttempt)
        #expect(SyncEngine.onPushRejected(table: "tasks", code: nil, parents: [t],
                                          queuedInserts: [], known: []) == .countAttempt)
    }

    /// The three whole-table fetches behind `known` are read only for a refused task or
    /// goal that sends links: any other failed push costs what it did before.
    @Test func aRefusedPushReadsTheKnownRowsOnlyForARowWithLinks() {
        var reads = 0
        func known() -> Set<UUID> {
            reads += 1
            return []
        }
        let t = UUID()
        _ = SyncEngine.onPushRejected(table: "tasks", code: "23503", parents: [], queuedInserts: [], known: known())
        _ = SyncEngine.onPushRejected(table: "tasks", code: nil, parents: [], queuedInserts: [], known: known())
        _ = SyncEngine.onPushRejected(table: "routines", code: "23503", parents: [t], queuedInserts: [], known: known())
        _ = SyncEngine.onPushRejected(table: "task_focus", code: "23503", parents: [t], queuedInserts: [], known: known())
        #expect(reads == 0)
        #expect(SyncEngine.onPushRejected(table: "tasks", code: "23503", parents: [t], queuedInserts: [], known: known())
                == .unlink([t]))
        #expect(reads == 1)
    }

    // MARK: A pass through the loop's own rules

    /// One pass as `pushPendingChanges` runs one, through its own rules: oldest first; a
    /// change whose parent's insert is still worth waiting for is skipped with no attempt
    /// counted; a linked update whose own insert is queued waits for it; a refused push
    /// is decided by `onPushRejected` and counted. The server refuses the rows in
    /// `refused` as a dropped connection would. Pushed changes leave `queue`; returns
    /// the rows pushed, in order.
    private func loopPass(_ queue: inout [PendingChange], refused: Set<UUID> = [], context: ModelContext) -> [UUID] {
        var queuedInserts: [UUID: PendingChange] = [:]
        for change in queue where change.changeType == "insert" { queuedInserts[change.recordId] = change }
        var pushed: [UUID] = []
        for change in queue.sorted(by: { $0.createdAt < $1.createdAt }) {
            let parents = SyncEngine.parentIds(of: change, context: context)
            if change.changeType != "delete" {
                if !parents.isEmpty, SyncEngine.mustWait(parents: parents,
                                                         unpushedInserts: SyncEngine.insertsWorthWaitingFor(Array(queuedInserts.values))) {
                    continue
                }
                if change.changeType == "update", queuedInserts[change.recordId] != nil,
                   SyncEngine.linkStamp(table: change.tableName, id: change.recordId, context: context) != nil {
                    continue
                }
            }
            if refused.contains(change.recordId) {
                let code = SyncEngine.postgresCode(of: URLError(.notConnectedToInternet))
                let action = SyncEngine.onPushRejected(table: change.tableName, code: code, parents: parents,
                                                       queuedInserts: Set(queuedInserts.keys),
                                                       known: SyncEngine.knownIds(context: context))
                if action == .countAttempt { change.attempts += 1 }
                continue
            }
            pushed.append(change.recordId)
            if change.changeType == "insert" { queuedInserts[change.recordId] = nil }
            queue.removeAll { $0 === change }
        }
        return pushed
    }

    /// A walk-made chain whose goal fails to go up: the season line and its first-thing
    /// focus wait without spending an attempt, and go on the pass after the goal lands.
    /// Beside them a task pulled from the web, its links set there (flags clean), is
    /// ticked on the phone: it goes at once, and its row names none of its links.
    @Test func aFailedParentHoldsItsChildrenAndACleanRowGoesAtOnce() throws {
        let context = try makeContext()
        let me = UUID()
        let area = GoalArea(userId: me, name: "Health", context: "personal")
        context.insert(area)
        context.queueSync(table: "goal_areas", recordId: area.id, type: "insert")
        let goal = PlanWriter(context: context, userId: me)
            .createGoal(name: "Feel strong again", notes: nil, context: "personal", year: 2027)
        goal.areaId = area.id
        goal.areaDirty = true
        let season = newTask(context, "Lift twice a week")
        season.goalId = goal.id
        season.areaId = area.id
        season.linksDirty = true
        let first = focus(season, context)
        let webGoal = UUID(), webSource = UUID()
        let pulled = SymphonyTask(userId: me, title: "Renew the passport", syncStatus: .synced)
        pulled.goalId = webGoal
        pulled.sourceId = webSource
        context.insert(pulled)
        try context.save()
        TaskViewModel(modelContext: context).toggleComplete(pulled)       // as Today ticks it

        let changes = try [change(context, "goal_areas", area.id), change(context, "goals", goal.id),
                           change(context, "tasks", season.id), change(context, "task_focus", first.id),
                           change(context, "tasks", pulled.id, "update")]
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)
        for (i, c) in changes.enumerated() { c.createdAt = t0.addingTimeInterval(Double(i)) }
        var queue = try context.fetch(FetchDescriptor<PendingChange>())
        #expect(queue.count == changes.count)
        let (goalInsert, seasonInsert, focusInsert) = (changes[1], changes[2], changes[3])

        // The goal's insert fails: the area and the ticked task go; the children wait, uncounted.
        #expect(loopPass(&queue, refused: [goal.id], context: context) == [area.id, pulled.id])
        #expect(goalInsert.attempts == 1)
        #expect(seasonInsert.attempts == 0)
        #expect(focusInsert.attempts == 0)
        // It lands on the next pass, and they follow it in that pass.
        #expect(loopPass(&queue, context: context) == [goal.id, season.id, first.id])
        #expect(queue.isEmpty)

        // The tick never waited and sends none of the links the web set.
        #expect(SyncEngine.parentIds(table: "tasks", id: pulled.id, context: context) == [])
        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: pulled.id, context: context))
        #expect(row["completed"] == .bool(true))
        #expect(row["goal_id"] == nil)
        #expect(row["source_id"] == nil)
        #expect(row["area_id"] == nil)
        #expect(pulled.goalId == webGoal && pulled.sourceId == webSource)
    }

    // MARK: Links re-set while a push is in flight

    @Test func aRowSendsItsLinksOnlyWhenTheyAreDirty() throws {
        let context = try makeContext()
        let g = UUID(), s = UUID(), a = UUID()
        let task = SymphonyTask(userId: UUID(), title: "Book the cabin")
        task.goalId = g; task.sourceId = s; task.areaId = a
        let goal = Goal(id: UUID(), userId: UUID(), name: "A summer outdoors", year: 2027)
        goal.areaId = a
        context.insert(task); context.insert(goal)
        try context.save()
        #expect(SyncEngine.linkStamp(table: "tasks", id: task.id, context: context) == nil)
        #expect(SyncEngine.linkStamp(table: "goals", id: goal.id, context: context) == nil)

        task.linksDirty = true
        goal.areaDirty = true
        try context.save()
        #expect(SyncEngine.linkStamp(table: "tasks", id: task.id, context: context)
                == SyncEngine.LinkStamp(goalId: g, sourceId: s, areaId: a))
        #expect(SyncEngine.linkStamp(table: "goals", id: goal.id, context: context)
                == SyncEngine.LinkStamp(goalId: nil, sourceId: nil, areaId: a))
        #expect(SyncEngine.linkStamp(table: "task_commitments", id: task.id, context: context) == nil)
        #expect(SyncEngine.linkStamp(table: "tasks", id: UUID(), context: context) == nil)
    }

    @Test func linksMovedDuringThePushAreKeptForTheNextOne() {
        let g = UUID(), s = UUID(), a = UUID(), other = UUID()
        let sent = SyncEngine.LinkStamp(goalId: g, sourceId: s, areaId: a)
        // Unchanged since it was serialized: the server has them, clear the flag.
        #expect(SyncEngine.linksSettled(sent: sent, now: sent))
        // Re-linked during the await (Move, Pull up): keep the flag, send again.
        #expect(!SyncEngine.linksSettled(sent: sent, now: SyncEngine.LinkStamp(goalId: g, sourceId: other, areaId: a)))
        #expect(!SyncEngine.linksSettled(sent: sent, now: SyncEngine.LinkStamp(goalId: g, sourceId: s, areaId: nil)))
        // Linked for the first time during the await: nothing was sent yet.
        #expect(!SyncEngine.linksSettled(sent: nil, now: sent))
        // Nothing dirty now (or the row is gone): nothing left to send.
        #expect(SyncEngine.linksSettled(sent: sent, now: nil))
        #expect(SyncEngine.linksSettled(sent: nil, now: nil))
    }

    @Test func aPushedChangeIsDoneOrKeptForItsMovedLinks() {
        let g = UUID(), s = UUID(), moved = UUID()
        let sent = SyncEngine.LinkStamp(goalId: g, sourceId: s, areaId: nil)
        let now = SyncEngine.LinkStamp(goalId: g, sourceId: moved, areaId: nil)
        // No links at all (every row that is not the walk's): done, as before.
        for type in ["insert", "update", "delete"] {
            #expect(SyncEngine.afterPush(changeType: type, sent: nil, now: nil) == .done)
        }
        #expect(SyncEngine.afterPush(changeType: "update", sent: sent, now: sent) == .done)
        #expect(SyncEngine.afterPush(changeType: "insert", sent: sent, now: sent) == .done)
        // Re-linked during the await.
        #expect(SyncEngine.afterPush(changeType: "update", sent: sent, now: now) == .keepQueued)
        #expect(SyncEngine.afterPush(changeType: "insert", sent: sent, now: now) == .queueUpdateThenDone)
        #expect(SyncEngine.afterPush(changeType: "insert", sent: nil, now: now) == .queueUpdateThenDone)
    }

    @Test func droppingAChangeForgetsItsLocalLinks() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Book the cabin")
        task.goalId = UUID()
        task.linksDirty = true
        task.placementDirty = true
        let goal = Goal(id: UUID(), userId: UUID(), name: "A summer outdoors", year: 2027)
        goal.areaId = UUID()
        goal.areaDirty = true
        context.insert(task); context.insert(goal)
        try context.save()

        SyncEngine.clearLinkFlags(table: "tasks", id: task.id, context: context)
        SyncEngine.clearLinkFlags(table: "goals", id: goal.id, context: context)
        #expect(!task.linksDirty)
        #expect(!goal.areaDirty)
        #expect(task.placementDirty)   // other flags are not this helper's business
        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        #expect(row["goal_id"] == nil)
    }

    // MARK: The first pull

    @Test func aFreshAppHasNotSynced() {
        #expect(AppState().initialSyncFinished == false)
    }

    /// A resync that does not pull (no one signed in to this engine) reports nothing.
    /// That `start` and `resync` report the pull BEFORE realtime joins needs a network
    /// to run; it is the order of two lines in each.
    @Test func aResyncThatDoesNotPullReportsNothing() async throws {
        let container = try ModelContainer(for: SymphonyTask.self, PendingChange.self,
                                           configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let pulled = await SyncEngine(modelContainer: container).resync(onFirstPull: { _ in
            Issue.record("a resync that did not pull reported a first pull")
        })
        #expect(!pulled)
    }
}
