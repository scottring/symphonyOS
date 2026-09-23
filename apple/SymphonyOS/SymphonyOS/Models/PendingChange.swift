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

extension ModelContext {
    /// Queue a sync push for a record. Every local mutation must call this —
    /// rows the push loop doesn't know about never reach Supabase, and the pull
    /// reconciler then deletes them as "gone from server" (write-then-vanish).
    /// Identical already-queued changes are deduped so per-keystroke edit
    /// callbacks don't pile up one PendingChange each.
    func queueSync(table: String, recordId: UUID, type: String) {
        let queued = (try? fetch(FetchDescriptor<PendingChange>())) ?? []
        if queued.contains(where: { $0.tableName == table && $0.recordId == recordId && $0.changeType == type }) {
            return
        }
        insert(PendingChange(tableName: table, recordId: recordId, changeType: type))
    }

    /// Queue a delete matched on column values instead of `id` — for rows
    /// whose table has no id column (task_focus). The row is removed locally
    /// before the push runs, so the key travels in the payload.
    func queueKeyedDelete(table: String, recordId: UUID, match: [String: String]) {
        // A still-queued insert for the same row never needs to reach the
        // server: drop both halves.
        let queued = (try? fetch(FetchDescriptor<PendingChange>())) ?? []
        if let insert = queued.first(where: { $0.tableName == table && $0.recordId == recordId && $0.changeType == "insert" }) {
            delete(insert)
            return
        }
        insert(PendingChange(tableName: table, recordId: recordId, changeType: "delete",
                             payload: try? JSONEncoder().encode(match)))
    }
}
