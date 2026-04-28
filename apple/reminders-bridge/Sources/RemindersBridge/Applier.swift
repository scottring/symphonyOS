import Foundation

public final class Applier {
    private let reminders: RemindersClientProtocol
    private let symphony: SymphonyClientProtocol
    private let userId: UUID

    public init(reminders: RemindersClientProtocol, symphony: SymphonyClientProtocol, userId: UUID) {
        self.reminders = reminders
        self.symphony = symphony
        self.userId = userId
    }

    public func apply(_ ops: [SyncOp]) async throws {
        for op in ops {
            try await applyOne(op)
        }
    }

    private func applyOne(_ op: SyncOp) async throws {
        switch op {
        case .insertSymphony(let listId, let apple):
            try await symphony.insert(
                listId: listId,
                userId: userId,
                text: apple.title,
                completed: apple.isCompleted,
                externalId: apple.externalId
            )
        case .updateSymphony(let symphonyId, let apple):
            try await symphony.update(
                symphonyId: symphonyId,
                text: apple.title,
                completed: apple.isCompleted
            )
        case .deleteSymphony(let symphonyId):
            try await symphony.delete(symphonyId: symphonyId)
        case .insertApple(let s, let listName):
            let newId = try await reminders.insert(
                title: s.text,
                completed: s.completed,
                intoListNamed: listName
            )
            do {
                try await symphony.setExternalId(symphonyId: s.id, externalId: newId)
            } catch {
                // Compensating delete: roll back the Apple insert so the orphan-pair
                // failure mode doesn't multiply across subsequent sync ticks.
                // Best-effort: if the compensating delete itself fails, swallow that
                // and rethrow the original error.
                try? await reminders.delete(externalId: newId)
                throw error
            }
        case .updateApple(let externalId, let s):
            try await reminders.update(
                externalId: externalId,
                title: s.text,
                completed: s.completed
            )
        case .deleteApple(let externalId):
            try await reminders.delete(externalId: externalId)
        }
    }
}
