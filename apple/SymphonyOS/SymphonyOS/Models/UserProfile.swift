import Foundation
import SwiftData

@Model
final class UserProfile {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var onboardingStep: String?
    var onboardingCompletedAt: Date?
    var homeLocation: String?
    var homeTimezone: String?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.onboardingStep = "welcome"
        self.onboardingCompletedAt = nil
        self.homeLocation = nil
        self.homeTimezone = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension UserProfile {
    static let tableName = "user_profiles"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "onboardingStep": "onboarding_step",
        "onboardingCompletedAt": "onboarding_completed_at",
        "homeLocation": "home_location",
        "homeTimezone": "home_timezone",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
