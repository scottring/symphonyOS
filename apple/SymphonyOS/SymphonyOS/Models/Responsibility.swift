import Foundation
import SwiftData

@Model
final class Responsibility {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var who: String
    var task: String
    var frequency: String // "daily", "weekly", etc.
    var status: String // "active", "paused"
    var ruleId: UUID?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        who: String,
        task: String,
        frequency: String = "daily",
        status: String = "active",
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.who = who
        self.task = task
        self.frequency = frequency
        self.status = status
        self.ruleId = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension Responsibility {
    static let tableName = "responsibilities"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "who": "who",
        "task": "task",
        "frequency": "frequency",
        "status": "status",
        "ruleId": "rule_id",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
