import Foundation
import SwiftData

@Model
final class PlaybookInstance {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var blockId: UUID
    var date: Date // YYYY-MM-DD stored as Date
    var completed: Bool
    var react: String? // "nailed-it", "okay", "tough"
    var tags: [String]
    var notes: String?
    var itemsState: [String: Bool]? // item ID → completed

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        blockId: UUID,
        date: Date,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.blockId = blockId
        self.date = date
        self.completed = false
        self.react = nil
        self.tags = []
        self.notes = nil
        self.itemsState = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension PlaybookInstance {
    static let tableName = "playbook_instances"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "blockId": "block_id",
        "date": "date",
        "completed": "completed",
        "react": "react",
        "tags": "tags",
        "notes": "notes",
        "itemsState": "items_state",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
