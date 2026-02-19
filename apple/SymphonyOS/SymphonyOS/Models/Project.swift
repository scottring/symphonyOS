import Foundation
import SwiftData

@Model
final class Project {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var name: String
    var status: String // "not_started", "active", "completed"
    var context: String? // "work", "family", "personal"
    var type: String? // "general", "trip"
    var notes: String?
    var links: [TaskLink]?
    var phoneNumber: String?
    var parentId: UUID?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        name: String,
        status: String = "not_started",
        context: String? = nil,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.status = status
        self.context = context
        self.type = "general"
        self.notes = nil
        self.links = nil
        self.phoneNumber = nil
        self.parentId = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension Project {
    static let tableName = "projects"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "name": "name",
        "status": "status",
        "context": "context",
        "type": "type",
        "notes": "notes",
        "links": "links",
        "phoneNumber": "phone_number",
        "parentId": "parent_id",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
