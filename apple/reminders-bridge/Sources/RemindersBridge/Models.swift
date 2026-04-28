import Foundation

/// Item as seen on the Apple Reminders side. Keyed by EventKit's calendarItemIdentifier.
public struct AppleItem: Equatable, Hashable {
    public let externalId: String
    public let title: String
    public let isCompleted: Bool
    public let lastModified: Date

    public init(externalId: String, title: String, isCompleted: Bool, lastModified: Date) {
        self.externalId = externalId
        self.title = title
        self.isCompleted = isCompleted
        self.lastModified = lastModified
    }
}

/// Item as seen on the Symphony side. May or may not have an externalId yet.
public struct SymphonyItem: Equatable, Hashable {
    public let id: UUID
    public let listId: UUID
    public let text: String
    public let completed: Bool
    public let updatedAt: Date
    public let externalId: String?

    public init(id: UUID, listId: UUID, text: String, completed: Bool, updatedAt: Date, externalId: String?) {
        self.id = id
        self.listId = listId
        self.text = text
        self.completed = completed
        self.updatedAt = updatedAt
        self.externalId = externalId
    }
}

/// Operations the reconciler emits. The Applier executes them.
public enum SyncOp: Equatable, Hashable {
    /// Apple has an item, Symphony doesn't — insert into Symphony.
    case insertSymphony(listId: UUID, apple: AppleItem)
    /// Both sides have it; Apple is newer — update Symphony.
    case updateSymphony(symphonyId: UUID, fromApple: AppleItem)
    /// Symphony has external_id but Apple doesn't — Apple deleted it.
    case deleteSymphony(symphonyId: UUID)
    /// Symphony has an item with no external_id — push to Apple, then write external_id back.
    case insertApple(symphony: SymphonyItem, appleListName: String)
    /// Both sides have it; Symphony is newer — update Apple.
    case updateApple(externalId: String, fromSymphony: SymphonyItem)
    /// Symphony marked deleted (we use hard-delete); Apple still has it — delete from Apple.
    /// v1 does NOT support this case (Symphony delete propagation deferred — see plan notes).
    case deleteApple(externalId: String)
}
