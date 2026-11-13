import Testing
import Foundation
import SwiftData
@testable import Symphony

@MainActor
struct AccountDeletionTests {
    private let base = "This deletes your Symphony account and everything in it: your goals, tasks, notes and photos. It can't be undone."

    private func member(authUserId: UUID?) -> FamilyMember {
        let m = FamilyMember(userId: UUID(), name: "M", initials: "M", color: "#000000")
        m.authUserId = authUserId
        return m
    }

    @Test func warningAlone() {
        #expect(AccountDeletion.warning(sharesHousehold: false) == base)
    }

    @Test func warningWithHousehold() {
        #expect(AccountDeletion.warning(sharesHousehold: true) == base + " Things you share with your household stay with them.")
    }

    @Test func sharesHouseholdRules() {
        let me = UUID()
        #expect(AccountDeletion.sharesHousehold(members: [member(authUserId: me), member(authUserId: UUID())], me: me))
        #expect(!AccountDeletion.sharesHousehold(members: [member(authUserId: me)], me: me))
        #expect(!AccountDeletion.sharesHousehold(members: [member(authUserId: me), member(authUserId: nil)], me: me))
        #expect(!AccountDeletion.sharesHousehold(members: [member(authUserId: UUID())], me: nil))
    }

    @Test func wipeEmptiesEveryModel() throws {
        let container = try ModelContainer(
            for: Schema(SymphonyApp.modelTypes),
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let uid = UUID()
        let ctx = ModelContext(container)
        ctx.insert(SymphonyTask(userId: uid, title: "t"))
        ctx.insert(Goal(id: UUID(), userId: uid, name: "g", year: 2026))
        ctx.insert(Household(ownerId: uid))
        ctx.insert(FamilyMember(userId: uid, name: "M", initials: "M", color: "#000000"))
        ctx.insert(PendingChange(tableName: "tasks", recordId: UUID(), changeType: "insert"))
        try ctx.save()
        #expect(try ctx.fetchCount(FetchDescriptor<SymphonyTask>()) == 1)

        try AccountDeletion.wipe(container)

        let after = ModelContext(container)
        #expect(try after.fetchCount(FetchDescriptor<SymphonyTask>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<Goal>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<Household>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<FamilyMember>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<PendingChange>()) == 0)
    }

    @Test func leftoversAreCleared() {
        let defaults = UserDefaults(suiteName: "AccountDeletionTests.\(UUID())")!
        let uid = UUID()
        EditionMemory(defaults: defaults).remember(.light, for: uid)
        defaults.set("tok", forKey: MedTokenStore.key)
        defaults.set(1, forKey: PlanCalendar.weekStartsOnKey)
        defaults.set(false, forKey: "planner.paperSound")
        AccountDeletion.clearDeviceLeftovers(userId: uid, defaults: defaults)
        #expect(EditionMemory(defaults: defaults).lastKnown(for: uid) == nil)
        #expect(defaults.string(forKey: MedTokenStore.key) == nil)
        #expect(defaults.object(forKey: PlanCalendar.weekStartsOnKey) == nil)
        #expect(defaults.object(forKey: "planner.paperSound") != nil)   // device preference stays
    }
}
