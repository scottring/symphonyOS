import Foundation
import SwiftData

/// A life area (server table `goal_areas`): what year goals and tasks are
/// filed under ("Health", "Home"). A person's own areas plus a household
/// partner's Family ones, which RLS lets them read. Writes are owner-only on
/// the server, so nothing on the phone edits an area whose `userId` is not
/// the signed-in person. New areas take `sortOrder` one more than the
/// person's highest, as the web does (useLifeAreas.add).
@Model
final class GoalArea {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var name: String
    var sortOrder: Int
    /// "work" | "family" | "personal" | nil (a legacy row, private to its owner)
    var context: String?
    var createdAt: Date

    var syncStatus: SyncStatus
    var lastSyncedAt: Date?

    init(id: UUID = UUID(), userId: UUID, name: String, sortOrder: Int = 0, context: String? = nil,
         syncStatus: SyncStatus = .pending) {
        self.id = id
        self.userId = userId
        self.name = name
        self.sortOrder = sortOrder
        self.context = context
        self.createdAt = Date()
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
    }
}
