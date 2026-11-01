import Foundation

/// Remembers, per Symphony list, which reminders were on both sides at the
/// last pass, so the reconciler can tell "deleted in Symphony" from "added in
/// Reminders" (both look like a reminder Symphony doesn't have).
public protocol PairStoreProtocol: AnyObject {
    func load(listId: UUID) -> Set<String>
    func save(listId: UUID, paired: Set<String>)
}

public final class MemoryPairStore: PairStoreProtocol {
    public var pairs: [UUID: Set<String>] = [:]
    public init() {}
    public func load(listId: UUID) -> Set<String> { pairs[listId] ?? [] }
    public func save(listId: UUID, paired: Set<String>) { pairs[listId] = paired }
}

/// One JSON file beside the config: { "<list uuid>": ["<calendarItemIdentifier>", ...] }.
/// A missing or unreadable file means nothing is known yet, which is the old
/// behaviour (no deletes reach Reminders) until the next pass records pairs.
public final class FilePairStore: PairStoreProtocol {
    private let url: URL
    private var cache: [String: [String]]

    public init(path: String) {
        url = URL(fileURLWithPath: (path as NSString).expandingTildeInPath)
        if let data = try? Data(contentsOf: url),
           let decoded = try? JSONDecoder().decode([String: [String]].self, from: data) {
            cache = decoded
        } else {
            cache = [:]
        }
    }

    public func load(listId: UUID) -> Set<String> {
        Set(cache[listId.uuidString.lowercased()] ?? [])
    }

    public func save(listId: UUID, paired: Set<String>) {
        cache[listId.uuidString.lowercased()] = paired.sorted()
        if let data = try? JSONEncoder().encode(cache) {
            try? data.write(to: url, options: .atomic)
        }
    }
}
