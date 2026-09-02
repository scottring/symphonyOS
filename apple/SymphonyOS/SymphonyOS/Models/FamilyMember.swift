import Foundation
import SwiftData

@Model
final class FamilyMember {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var name: String
    var initials: String
    var color: String
    var avatarUrl: String?
    var isFullUser: Bool
    var displayOrder: Int
    var memberType: String // "core", "guest"
    var roleLabel: String? // "parent", "child", "grandparent", etc.
    var typicalInvolvement: String?
    var authUserId: UUID? // links to auth.users for full users
    var dateOfBirth: Date?

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        name: String,
        initials: String,
        color: String,
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.initials = initials
        self.color = color
        self.avatarUrl = nil
        self.isFullUser = false
        self.displayOrder = 0
        self.memberType = "core"
        self.roleLabel = nil
        self.typicalInvolvement = nil
        self.authUserId = nil
        self.dateOfBirth = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
    }
}

extension FamilyMember {
    static let tableName = "family_members"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "name": "name",
        "initials": "initials",
        "color": "color",
        "avatarUrl": "avatar_url",
        "isFullUser": "is_full_user",
        "displayOrder": "display_order",
        "memberType": "member_type",
        "roleLabel": "role_label",
        "typicalInvolvement": "typical_involvement",
        "authUserId": "auth_user_id",
        "dateOfBirth": "date_of_birth",
        "createdAt": "created_at",
    ]
}

extension FamilyMember {
    /// The signed-in person's own member row. Mirrors `getCurrentUserMember` in
    /// src/hooks/useFamilyMembers.ts: auth link first (joined members like
    /// Iris), then the household creator, then any full user (legacy data).
    static func current(in members: [FamilyMember], authUserId: UUID?) -> FamilyMember? {
        if let authUserId {
            if let linked = members.first(where: { $0.authUserId == authUserId }) { return linked }
            if let owner = members.first(where: { $0.userId == authUserId }) { return owner }
        }
        return members.first(where: { $0.isFullUser })
    }
}
