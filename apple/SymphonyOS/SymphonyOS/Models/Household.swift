import Foundation
import SwiftData

@Model
final class Household {
    @Attribute(.unique) var id: UUID
    var name: String
    var ownerId: UUID
    var address: String?
    /// The household's four season boundaries (`households.seasons` jsonb).
    /// Nil → the web's defaults (see PlanCalendar.defaultSeasons).
    var seasons: [SeasonBoundary]? = nil

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

/// One season's first day, e.g. {name: "Fall", month: 9, day: 1}.
struct SeasonBoundary: Codable, Hashable {
    var name: String
    var month: Int
    var day: Int
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
