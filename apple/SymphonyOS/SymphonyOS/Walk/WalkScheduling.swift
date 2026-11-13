#if os(iOS)
import Foundation

/// Everything in the walk that waits goes through here: the hold, the Undo
/// pill, a note, and (later) starting speech, a delayed sound and asking for
/// the calendar. Tests hand the model a manual one and never sleep.
@MainActor protocol WalkScheduling: AnyObject {
    /// Runs `work` after `ms`; a later call with the same key replaces the earlier one.
    func after(_ ms: Int, key: String, _ work: @escaping @MainActor () -> Void)
    func cancel(key: String)
    /// Async work: starting speech, asking for the calendar.
    func run(_ work: @escaping @MainActor () async -> Void)
}

/// The real clock.
@MainActor final class WalkClock: WalkScheduling {
    private var waiting: [String: (token: UUID, task: Task<Void, Never>)] = [:]

    init() {}

    func after(_ ms: Int, key: String, _ work: @escaping @MainActor () -> Void) {
        cancel(key: key)
        let token = UUID()
        let task = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(ms))
            guard !Task.isCancelled, let self, self.waiting[key]?.token == token else { return }
            self.waiting[key] = nil
            work()
        }
        waiting[key] = (token, task)
    }

    func cancel(key: String) {
        waiting.removeValue(forKey: key)?.task.cancel()
    }

    func run(_ work: @escaping @MainActor () async -> Void) {
        Task { @MainActor in await work() }
    }
}
#endif
