import Testing
import Foundation
@testable import Symphony

/// The carried-over lane must mirror the web's `selectCarriedOver`
/// (`src/lib/today/taskPools.ts`): a date is a commitment that EXPIRES, so only
/// work inside the grace window keeps a Today slot. Without this the phone
/// rendered every past-dated task ever created — nine rows that pushed the
/// actual day off the first screen.
private func makeTask(
    title: String,
    daysAgo: Int?,
    completed: Bool = false,
    parentTaskId: UUID? = nil
) -> SymphonyTask {
    let task = SymphonyTask(
        userId: UUID(),
        title: title,
        completed: completed,
        scheduledFor: daysAgo.map {
            Calendar.current.date(byAdding: .day, value: -$0, to: Date())!
        }
    )
    task.parentTaskId = parentTaskId
    return task
}

private func buildCarried(_ tasks: [SymphonyTask]) -> [SymphonyTask] {
    let vm = TimelineViewModel()
    vm.buildTimeline(
        tasks: tasks,
        routines: [],
        instances: [],
        playbookBlocks: [],
        playbookInstances: [],
        date: Date(),
        domainFilter: .all,
        showCoaching: false
    )
    return vm.carriedOverTasks
}

@Test func carriedOverKeepsWorkInsideTheGraceWindow() async throws {
    let carried = buildCarried([
        makeTask(title: "yesterday", daysAgo: 1),
        makeTask(title: "two days ago", daysAgo: 2),
    ])
    #expect(carried.map(\.title).sorted() == ["two days ago", "yesterday"])
}

@Test func carriedOverDropsWorkPastTheGraceWindow() async throws {
    // The real complaint: a July 25 item still sat on Today on August 8.
    let carried = buildCarried([
        makeTask(title: "three days ago", daysAgo: 3),
        makeTask(title: "two weeks ago", daysAgo: 14),
        makeTask(title: "still here", daysAgo: 1),
    ])
    #expect(carried.map(\.title) == ["still here"])
}

@Test func carriedOverExcludesCompletedAndUndatedWork() async throws {
    let carried = buildCarried([
        makeTask(title: "done", daysAgo: 1, completed: true),
        makeTask(title: "undated", daysAgo: nil),
    ])
    #expect(carried.isEmpty)
}
