import Foundation

public enum BridgeError: Error, Equatable {
    /// All configured list mappings failed during a single sync pass.
    case allMappingsFailed(count: Int)
}

public final class Bridge {
    private let config: Config
    private let reminders: RemindersClientProtocol
    private let symphony: SymphonyClientProtocol

    public init(config: Config, reminders: RemindersClientProtocol, symphony: SymphonyClientProtocol) {
        self.config = config
        self.reminders = reminders
        self.symphony = symphony
    }

    /// Run a single sync pass across all configured list mappings.
    public func runOnce() async throws {
        try await reminders.requestAccess()
        let applier = Applier(reminders: reminders, symphony: symphony, userId: config.userId)

        var failures = 0
        for mapping in config.lists {
            do {
                let appleItems = try await reminders.fetchItems(fromListNamed: mapping.appleListName)
                let symphonyItems = try await symphony.fetchItems(listId: mapping.symphonyListId)
                let ops = Reconciler.reconcile(apple: appleItems, symphony: symphonyItems, mapping: mapping)
                if !ops.isEmpty {
                    log("list \(mapping.appleListName): applying \(ops.count) ops")
                }
                try await applier.apply(ops)
            } catch {
                failures += 1
                log("list \(mapping.appleListName): ERROR \(error)")
                // Continue with other lists; individual list failure shouldn't block others.
            }
        }

        if !config.lists.isEmpty && failures == config.lists.count {
            throw BridgeError.allMappingsFailed(count: failures)
        }
    }

    private func log(_ message: String) {
        let ts = ISO8601DateFormatter().string(from: Date())
        FileHandle.standardOutput.write(Data("\(ts) [bridge] \(message)\n".utf8))
    }
}
