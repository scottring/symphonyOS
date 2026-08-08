import Foundation
import SwiftData

// MARK: - List
//
// Named `SymphonyList`, not `List`, because SwiftUI's `List` is used in every
// view file that touches these — the same reason `SymphonyTask` isn't `Task`
// (which would collide with Swift Concurrency).

@Model
final class SymphonyList {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var title: String
    var icon: String?
    var category: String        // "packing" | "shopping" | "general" | …
    var visibility: String      // "self" | "family"
    var sortOrder: Int

    /// Set when the list mirrors something outside Symphony. Three of Scott's
    /// lists are `apple_reminders` and reconcile bidirectionally every 60s, so a
    /// row deleted here can come back — the bridge is authoritative for those.
    var externalSource: String?
    var externalId: String?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        title: String,
        category: String = "general",
        visibility: String = "self",
        sortOrder: Int = 0,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.icon = nil
        self.category = category
        self.visibility = visibility
        self.sortOrder = sortOrder
        self.externalSource = nil
        self.externalId = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension SymphonyList {
    static let tableName = "lists"
}

// MARK: - List item

@Model
final class SymphonyListItem {
    @Attribute(.unique) var id: UUID
    /// NOT NULL with no default on `list_items`, so an insert from here must
    /// carry it — RLS also checks it on the INSERT policy.
    var userId: UUID
    var listId: UUID
    var text: String
    var note: String?
    var completed: Bool
    var completedAt: Date?
    var sortOrder: Int
    var parentItemId: UUID?

    var externalSource: String?
    var externalId: String?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        listId: UUID,
        text: String,
        completed: Bool = false,
        sortOrder: Int = 0,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.listId = listId
        self.text = text
        self.note = nil
        self.completed = completed
        self.completedAt = nil
        self.sortOrder = sortOrder
        self.parentItemId = nil
        self.externalSource = nil
        self.externalId = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension SymphonyListItem {
    static let tableName = "list_items"
}
