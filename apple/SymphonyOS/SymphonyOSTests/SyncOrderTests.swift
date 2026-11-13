import Testing
import Foundation
import SwiftData
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

        SyncEngine.clearLinks(to: [g], table: "tasks", id: task.id, context: context)
        #expect(task.goalId == nil)
        #expect(task.sourceId == source.id)
        #expect(task.linksDirty)
        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        #expect(row["goal_id"] == .null)
        #expect(row["source_id"] == .string(source.id.uuidString))
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

    @Test func theQueueKeepsParentsFirst() throws {
        let context = try makeContext()
        let writer = PlanWriter(context: context, userId: UUID())
        let goal = writer.createGoal(name: "A summer outdoors", notes: nil, context: "personal", year: 2027)
        let season = writer.createPeriodTask(title: "Get outside every weekend", level: "season",
                                             periodStart: PlanCalendar.season(containing: Date(), boundaries: nil).start)
        let queue = try context.fetch(FetchDescriptor<PendingChange>(sortBy: [SortDescriptor(\.createdAt)]))
        let goalInsert = try #require(queue.firstIndex { $0.tableName == "goals" && $0.recordId == goal.id && $0.changeType == "insert" })
        let taskInsert = try #require(queue.firstIndex { $0.tableName == "tasks" && $0.recordId == season.id && $0.changeType == "insert" })
        #expect(goalInsert < taskInsert)
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
}
