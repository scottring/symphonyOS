import Foundation
import SwiftData

@Model
final class Household {
    @Attribute(.unique) var id: UUID
    var name: String
    var ownerId: UUID
    var address: String?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        name: String = "My Household",
        ownerId: UUID,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.name = name
        self.ownerId = ownerId
        self.address = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension Household {
    static let tableName = "households"

    static let columnMap: [String: String] = [
        "id": "id",
        "name": "name",
        "ownerId": "owner_id",
        "address": "address",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
