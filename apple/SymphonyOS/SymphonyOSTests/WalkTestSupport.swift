#if os(iOS)
import Foundation
import SwiftData
@testable import Symphony

// Fakes shared by the walk's model tests. Task 14 made this file with the
// scheduler and the in-memory store; Task 16 added the listener; later tasks
// add their fakes here.

/// Time for tests: nothing waits; `advance` moves a pretend clock and runs
/// what fell due, in time order; `settle` runs the async work handed over.
@MainActor final class ManualWalkScheduler: WalkScheduling {
    private struct Pending { let key: String; let due: Int; let order: Int; let work: @MainActor () -> Void }
    private var now = 0
    private var counter = 0
    private var pending: [Pending] = []
    private var runs: [@MainActor () async -> Void] = []

    init() {}

    func after(_ ms: Int, key: String, _ work: @escaping @MainActor () -> Void) {
        pending.removeAll { $0.key == key }
        counter += 1
        pending.append(Pending(key: key, due: now + ms, order: counter, work: work))
    }

    func cancel(key: String) {
        pending.removeAll { $0.key == key }
    }

    func run(_ work: @escaping @MainActor () async -> Void) {
        runs.append(work)
    }

    /// Runs, in time order, every `after` that falls due within the next `ms`,
    /// including any that work scheduled meanwhile.
    func advance(_ ms: Int) {
        let target = now + ms
        while let next = pending.filter({ $0.due <= target }).min(by: { ($0.due, $0.order) < ($1.due, $1.order) }) {
            pending.removeAll { $0.order == next.order }
            now = next.due
            next.work()
        }
        now = target
    }

    /// Runs and awaits every `run` handed over so far, and any they hand over.
    func settle() async {
        while !runs.isEmpty {
            let work = runs.removeFirst()
            await work()
        }
    }
}

/// Speech for tests: nothing is heard until a test says so. `start` counts and
/// reports `problemOnStart` as its problem; `hear` delivers words as the
/// recogniser would. `whileStarting` runs inside `start`, before it answers,
/// as a person's touch would arrive while the permission prompts are up.
@MainActor final class FakeWalkListener: WalkListening {
    var problem: String?
    var onWords: ((String) -> Void)?
    var problemOnStart: String?
    var whileStarting: (() -> Void)?
    private(set) var starts = 0
    private(set) var stops = 0

    init() {}

    func start() async {
        starts += 1
        whileStarting?()
        problem = problemOnStart
    }

    func stop() {
        stops += 1
    }

    func hear(_ words: String) {
        onWords?(words)
    }
}

/// An in-memory store with every model the app has.
@MainActor func walkTestContext() throws -> ModelContext {
    let container = try ModelContainer(for: Schema(SymphonyApp.modelTypes),
                                       configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    return ModelContext(container)
}
#endif
