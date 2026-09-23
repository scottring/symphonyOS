import CryptoKit
import Foundation
import SwiftData

// Planning storage, mirroring the web's one-enduring-action model
// (supabase/migrations/2026-09-21_one_enduring_action.sql):
//
// • A task is ONE row for its whole life. Which week, month or season it is
//   committed to lives in `task_commitments`; `tasks.bucket`/`week_start`/
//   `month_start`/`season_start` are only a cache of the lowest open one,
//   maintained by database triggers.
// • "Chosen for my day" is per person, in `task_focus`.
// • A year's intentions are `goals` rows.

// MARK: - TaskCommitment

@Model
final class TaskCommitment {
    @Attribute(.unique) var id: UUID
    var taskId: UUID
    /// "season" | "month" | "week"
    var level: String
    /// Local midnight of the period's first day (Sunday for a week).
    var periodStart: Date
    /// "open" | "done" | "carried" | "removed"
    var status: String
    var carriedTo: Date?
    var createdBy: UUID?
    var endedAt: Date?
    var createdAt: Date

    var syncStatus: SyncStatus
    var lastSyncedAt: Date?

    init(id: UUID = UUID(), taskId: UUID, level: String, periodStart: Date, status: String = "open",
         createdBy: UUID? = nil, syncStatus: SyncStatus = .pending) {
        self.id = id
        self.taskId = taskId
        self.level = level
        self.periodStart = periodStart
        self.status = status
        self.carriedTo = nil
        self.createdBy = createdBy
        self.endedAt = nil
        self.createdAt = Date()
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
    }

    /// Still holding the task in its period (open) or finished there (done).
    /// Carried and removed commitments are history, not membership.
    var holds: Bool { status == "open" || status == "done" }
}

// MARK: - TaskFocus

/// One person's "chosen for this day" mark on a task. The table's key is
/// (task_id, user_id, date) — it has no id column — so the local id is derived
/// from that key, and pushes match on it (see SyncEngine).
@Model
final class TaskFocus {
    @Attribute(.unique) var id: UUID
    var taskId: UUID
    var userId: UUID
    var date: Date
    var createdAt: Date

    var syncStatus: SyncStatus
    var lastSyncedAt: Date?

    init(taskId: UUID, userId: UUID, date: Date, syncStatus: SyncStatus = .pending) {
        let day = Calendar.current.startOfDay(for: date)
        self.id = TaskFocus.key(taskId: taskId, userId: userId, date: day)
        self.taskId = taskId
        self.userId = userId
        self.date = day
        self.createdAt = Date()
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
    }

    /// Stable id for a (task, user, day) key, so a pulled row and a locally
    /// created one for the same key collapse to one record.
    static func key(taskId: UUID, userId: UUID, date: Date) -> UUID {
        let text = "\(taskId.uuidString.lowercased())|\(userId.uuidString.lowercased())|\(PlanCalendar.ymd(date))"
        var bytes = Array(SHA256.hash(data: Data(text.utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50   // version 5-style
        bytes[8] = (bytes[8] & 0x3F) | 0x80   // RFC 4122 variant
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}

// MARK: - Goal (a year's intention)

@Model
final class Goal {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var name: String
    var year: Int
    /// "active" | "completed" | "archived"
    var status: String
    var notes: String?
    var context: String?
    var sortOrder: Int
    /// Who can see it — RLS shares goals on scope. Derived from the life area
    /// at creation (like the web's addGoal); sent on insert only.
    var scope: String? = nil

    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID, userId: UUID, name: String, year: Int, syncStatus: SyncStatus = .synced) {
        self.id = id
        self.userId = userId
        self.name = name
        self.year = year
        self.status = "active"
        self.notes = nil
        self.context = nil
        self.sortOrder = 0
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
