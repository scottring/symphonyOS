import Foundation
import SwiftData

@Model
final class FamilyRule {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var rule: String
    var appliesTo: [String] // ["everyone"], ["liam"], ["liam", "mia"]
    var status: String // "draft", "active", "paused", "retired"
    var rationale: String?
    var enforcementTip: String?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        rule: String,
        status: String = "active",
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.rule = rule
        self.appliesTo = ["everyone"]
        self.status = status
        self.rationale = nil
        self.enforcementTip = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension FamilyRule {
    static let tableName = "family_rules"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "rule": "rule",
        "appliesTo": "applies_to",
        "status": "status",
        "rationale": "rationale",
        "enforcementTip": "enforcement_tip",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
