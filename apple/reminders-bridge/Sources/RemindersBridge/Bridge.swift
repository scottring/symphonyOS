import Foundation

public enum BridgeError: Error, Equatable {
    /// All configured list mappings failed during a single sync pass.
    case allMappingsFailed(count: Int)
}

public final class Bridge {
    private let config: Config
    private let reminders: RemindersClientProtocol
    private let symphony: SymphonyClientProtocol
    private let pairs: PairStoreProtocol

    /// More deletes than this, and more than half the list, in one pass looks
    /// like a bad read of Symphony rather than someone tidying up; they wait.
    static let deleteGuardFloor = 5

    public init(config: Config, reminders: RemindersClientProtocol, symphony: SymphonyClientProtocol,
                pairs: PairStoreProtocol = MemoryPairStore()) {
        self.config = config
        self.reminders = reminders
        self.symphony = symphony
        self.pairs = pairs
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
                let known = pairs.load(listId: mapping.symphonyListId)
                var ops = Reconciler.reconcile(apple: appleItems, symphony: symphonyItems, mapping: mapping, paired: known)
                var paired = Reconciler.pairedAfter(apple: appleItems, symphony: symphonyItems, ops: ops)

                let deletes = ops.filter { if case .deleteApple = $0 { return true } else { return false } }
                if deletes.count > Self.deleteGuardFloor && deletes.count * 2 > appleItems.count {
                    log("list \(mapping.appleListName): holding \(deletes.count) Reminders deletes (too many at once)")
                    ops.removeAll { if case .deleteApple = $0 { return true } else { return false } }
                    paired.formUnion(known.intersection(Set(appleItems.map { $0.externalId })))
                }

                if !ops.isEmpty {
                    log("list \(mapping.appleListName): applying \(ops.count) ops")
                }
                // Record before applying: a failed op is retried next pass
                // either way, and the pairs only ever hold what was seen.
                pairs.save(listId: mapping.symphonyListId, paired: paired)
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
