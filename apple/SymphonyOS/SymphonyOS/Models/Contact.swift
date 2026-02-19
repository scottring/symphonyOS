import Foundation
import SwiftData

@Model
final class Contact {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var name: String
    var phone: String?
    var email: String?
    var notes: String?
    var category: String?
    var birthday: Date?
    var relationship: String?
    var preferences: String?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        name: String,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.phone = nil
        self.email = nil
        self.notes = nil
        self.category = nil
        self.birthday = nil
        self.relationship = nil
        self.preferences = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension Contact {
    static let tableName = "contacts"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "name": "name",
        "phone": "phone",
        "email": "email",
        "notes": "notes",
        "category": "category",
        "birthday": "birthday",
        "relationship": "relationship",
        "preferences": "preferences",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
