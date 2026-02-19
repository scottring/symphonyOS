import Foundation
import SwiftData

// MARK: - Playbook Item (Codable for JSONB)

struct PlaybookItem: Codable, Hashable, Identifiable {
    var id: String
    var who: String
    var action: String
    var context: String?
    var coaching: String?
    var completed: Bool?
}

// MARK: - PlaybookBlock

@Model
final class PlaybookBlock {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var templateId: UUID?
    var layerId: UUID?
    var sourceRuleIds: [UUID]?
    var visibility: String? // "self", "family", "shared"
    var timeSlot: String // "6:50" or "5:30-6:45"
    var label: String
    var blockType: String // "solo", "transition", "routine", "connection", etc.
    var narrative: String
    var coachingNote: String?
    var items: [PlaybookItem]
    var dayTypes: [String] // ["school-day", "weekend", ...]
    var sortOrder: Int

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        timeSlot: String,
        label: String,
        blockType: String,
        narrative: String,
        items: [PlaybookItem] = [],
        dayTypes: [String] = ["school-day"],
        sortOrder: Int = 0,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.templateId = nil
        self.layerId = nil
        self.sourceRuleIds = nil
        self.visibility = "self"
        self.timeSlot = timeSlot
        self.label = label
        self.blockType = blockType
        self.narrative = narrative
        self.coachingNote = nil
        self.items = items
        self.dayTypes = dayTypes
        self.sortOrder = sortOrder
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension PlaybookBlock {
    static let tableName = "playbook_blocks"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "templateId": "template_id",
        "layerId": "layer_id",
        "sourceRuleIds": "source_rule_ids",
        "visibility": "visibility",
        "timeSlot": "time_slot",
        "label": "label",
        "blockType": "block_type",
        "narrative": "narrative",
        "coachingNote": "coaching_note",
        "items": "items",
        "dayTypes": "day_types",
        "sortOrder": "sort_order",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
