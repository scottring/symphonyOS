import Foundation
import SwiftData

/// Symphony context attached to a Google Calendar event, mirroring the web's
/// `event_notes` table (one row per user per event, keyed by the Google event
/// id). Lets the iOS event detail card carry notes/links the same way tasks do.
///
/// The card only surfaces `notes` and `links`, but every column the table has is
/// modeled and round-tripped so an iOS write never drops server-set fields
/// (context, share-to-family, assignment, project link, recipe url).
@Model
final class EventNote {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var googleEventId: String
    var notes: String?
    var links: [TaskLink]?
    /// Event title/start snapshot stored for display when the event isn't in the
    /// current calendar fetch (mirrors the web's event_title/event_start_time).
    var eventTitle: String?
    var eventStartTime: Date?
    var context: String?
    var sharedWithFamily: Bool
    var shareNudgeDismissed: Bool
    var assignedTo: UUID?
    var assignedToAll: [UUID]?
    var recipeUrl: String?
    var projectId: UUID?
    /// "Free" event: informational only, no prep/handoff, dimmed and
    /// unactionable on Today (spec docs/superpowers/specs/2026-09-02-event-free-flag-design.md).
    /// For a recurring series this lives on a note keyed by the series id
    /// (`recurring_event_id`), not the instance id — see `TimelineViewModel.isEventFree`.
    /// Inline default (not just in `init`) so SwiftData's lightweight migration
    /// can add this column to an existing on-device store without a value.
    var isFree: Bool = false

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        googleEventId: String,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.googleEventId = googleEventId
        self.notes = nil
        self.links = nil
        self.eventTitle = nil
        self.eventStartTime = nil
        self.context = nil
        self.sharedWithFamily = false
        self.shareNudgeDismissed = false
        self.assignedTo = nil
        self.assignedToAll = nil
        self.recipeUrl = nil
        self.projectId = nil
        self.isFree = false
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension EventNote {
    static let tableName = "event_notes"
}
