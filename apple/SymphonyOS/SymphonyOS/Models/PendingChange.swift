import Foundation
import SwiftData

/// Queues local changes for push to Supabase when online
@Model
final class PendingChange {
    @Attribute(.unique) var id: UUID
    var tableName: String
    var recordId: UUID
    var changeType: String // "insert", "update", "delete"
    var payload: Data? // JSON-encoded row data
    var attempts: Int
    var lastAttemptAt: Date?
    var createdAt: Date

    init(
        tableName: String,
        recordId: UUID,
        changeType: String,
        payload: Data? = nil
    ) {
        self.id = UUID()
        self.tableName = tableName
        self.recordId = recordId
        self.changeType = changeType
        self.payload = payload
        self.attempts = 0
        self.lastAttemptAt = nil
        self.createdAt = Date()
    }
}
