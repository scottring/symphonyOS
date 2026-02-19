import Foundation
import SwiftData

@Model
final class ActionableInstance {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var entityType: String // "calendar_event", "routine"
    var entityId: String
    var date: Date
    var status: String // "pending", "completed", "skipped", "deferred"
    var assignee: UUID?
    var assignedToOverride: UUID?
    var deferredTo: Date?
    var completedAt: Date?
    var skippedAt: Date?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        entityType: String,
        entityId: String,
        date: Date,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.entityType = entityType
        self.entityId = entityId
        self.date = date
        self.status = "pending"
        self.assignee = nil
        self.assignedToOverride = nil
        self.deferredTo = nil
        self.completedAt = nil
        self.skippedAt = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension ActionableInstance {
    static let tableName = "actionable_instances"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "entityType": "entity_type",
        "entityId": "entity_id",
        "date": "date",
        "status": "status",
        "assignee": "assignee",
        "assignedToOverride": "assigned_to_override",
        "deferredTo": "deferred_to",
        "completedAt": "completed_at",
        "skippedAt": "skipped_at",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
