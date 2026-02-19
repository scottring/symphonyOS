import Foundation
import SwiftData

@Model
final class WeeklyTemplate {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var weekOf: Date // Monday of the week
    var focusAreas: [String]
    var reviewNotes: String?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        weekOf: Date,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.weekOf = weekOf
        self.focusAreas = []
        self.reviewNotes = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension WeeklyTemplate {
    static let tableName = "weekly_templates"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "weekOf": "week_of",
        "focusAreas": "focus_areas",
        "reviewNotes": "review_notes",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
