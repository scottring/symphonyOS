import Foundation
import SwiftData

// MARK: - Codable Types

struct TaskLink: Codable, Hashable {
    var url: String
    var title: String?
}

struct LinkedActivity: Codable, Hashable {
    var type: String // "task", "routine_instance", "calendar_event"
    var id: String
}

/// Mirrors the `tasks.capture_meta` jsonb column (photo-first capture).
/// status: "pending" (awaiting AI analysis) | "done" | "failed".
struct CaptureMeta: Codable, Hashable {
    var status: String?
    var storage_path: String?
    var suggested_task_id: String?
}

// MARK: - SymphonyTask

@Model
final class SymphonyTask {
    // Primary
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var title: String
    var completed: Bool

    // Scheduling
    var scheduledFor: Date?
    var deferredUntil: Date?
    var deferCount: Int
    var isAllDay: Bool
    var isSomeday: Bool
    /// Triage bucket — mirrors the web: "inbox" | "week" | "month" | "quarter" |
    /// "someday" | "timed". The inbox is bucket == "inbox" (NOT "no date").
    var bucket: String?
    var estimatedDuration: Int? // minutes

    // Context
    var context: String? // "work", "family", "personal"
    var category: String? // "task", "chore", "errand", "event", "activity"

    // Rich content
    var notes: String?
    var links: [TaskLink]?
    var phoneNumber: String?
    var location: String?
    var locationPlaceId: String?

    // Relationships (stored as UUIDs, resolved at query time)
    var contactId: UUID?
    var assignedTo: UUID? // single family member
    var assignedToAll: [UUID]? // multi-member assignment
    var projectId: UUID?
    var parentTaskId: UUID?
    /// Who can SEE it: "individual" | "couple" | "compound". Read-only on the
    /// phone — the web derives it (scopeForDomain) and the phone never writes it.
    var scope: String?
    /// Set when this task was extracted from a capture (school email, paper
    /// page). Read-only on the phone; drives the "From an email" source pill.
    var captureId: UUID?
    /// Which week a bucket=="week" row belongs to (placement cascade). Local
    /// midnight. Sent as a DATE column — see `SyncEngine.taskRow`.
    var weekStart: Date?

    // Linked activity
    var linkedTo: LinkedActivity?
    var linkType: String? // "prep", "followup"

    // Photo-first capture (tasks.capture_meta jsonb, flattened for SwiftUI)
    var captureStatus: String? // "pending" | "done" | "failed"
    var captureStoragePath: String?
    var captureSuggestedTaskId: UUID?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        title: String,
        completed: Bool = false,
        scheduledFor: Date? = nil,
        context: String? = nil,
        notes: String? = nil,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.completed = completed
        self.scheduledFor = scheduledFor
        self.deferredUntil = nil
        self.deferCount = 0
        self.isAllDay = false
        self.isSomeday = false
        self.estimatedDuration = nil
        self.context = context
        self.category = nil
        self.notes = notes
        self.links = nil
        self.phoneNumber = nil
        self.location = nil
        self.locationPlaceId = nil
        self.contactId = nil
        self.assignedTo = nil
        self.assignedToAll = nil
        self.projectId = nil
        self.parentTaskId = nil
        self.scope = nil
        self.captureId = nil
        self.weekStart = nil
        self.linkedTo = nil
        self.linkType = nil
        self.captureStatus = nil
        self.captureStoragePath = nil
        self.captureSuggestedTaskId = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

// MARK: - Supabase Column Mapping

extension SymphonyTask {
    static let tableName = "tasks"

    /// Maps Swift property names to Supabase column names
    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "title": "title",
        "completed": "completed",
        "scheduledFor": "scheduled_for",
        "deferredUntil": "deferred_until",
        "deferCount": "defer_count",
        "isAllDay": "is_all_day",
        "isSomeday": "is_someday",
        "estimatedDuration": "estimated_duration",
        "context": "context",
        "category": "category",
        "notes": "notes",
        "links": "links",
        "phoneNumber": "phone_number",
        "location": "location",
        "locationPlaceId": "location_place_id",
        "contactId": "contact_id",
        "assignedTo": "assigned_to",
        "assignedToAll": "assigned_to_all",
        "projectId": "project_id",
        "parentTaskId": "parent_task_id",
        "scope": "scope",
        "captureId": "capture_id",
        "weekStart": "week_start",
        "linkedTo": "linked_to",
        "linkType": "link_type",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
