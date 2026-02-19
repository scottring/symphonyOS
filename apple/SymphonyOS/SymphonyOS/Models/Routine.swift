import Foundation
import SwiftData

// MARK: - Recurrence Pattern

struct RecurrencePattern: Codable, Hashable {
    var type: String // "daily", "weekly", "monthly"
    var days: [String]? // ["monday", "wednesday", "friday"]
    var dayOfMonth: Int?
}

// MARK: - Routine

@Model
final class Routine {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var name: String
    var routineDescription: String?
    var visibility: String // "active", "reference"
    var recurrencePattern: RecurrencePattern
    var timeOfDay: String? // "HH:MM" or "HH:MM:SS"
    var context: String? // "work", "family", "personal"
    var assignedTo: UUID? // family member

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        name: String,
        visibility: String = "active",
        recurrencePattern: RecurrencePattern = RecurrencePattern(type: "daily"),
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.routineDescription = nil
        self.visibility = visibility
        self.recurrencePattern = recurrencePattern
        self.timeOfDay = nil
        self.context = nil
        self.assignedTo = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension Routine {
    static let tableName = "routines"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "name": "name",
        "routineDescription": "description",
        "visibility": "visibility",
        "recurrencePattern": "recurrence_pattern",
        "timeOfDay": "time_of_day",
        "context": "context",
        "assignedTo": "assigned_to",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
