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

    /// A lost reply: the server deleted the account, the retry gets 410.
    /// Only 2xx and 410 finish locally; a 401 (a refresh that failed, a
    /// revoked session) and everything else change nothing.
    @Test func outcomeForHTTPStatus() {
        #expect(AccountDeletion.outcome(forHTTPStatus: 200) == .deleted)
        #expect(AccountDeletion.outcome(forHTTPStatus: 410) == .alreadyGone)
        #expect(AccountDeletion.outcome(forHTTPStatus: 401) == .failed)
        #expect(AccountDeletion.outcome(forHTTPStatus: 503) == .failed)
        #expect(AccountDeletion.outcome(forHTTPStatus: 500) == .failed)
        #expect(AccountDeletion.outcome(forHTTPStatus: 403) == .failed)
        #expect(AccountDeletion.outcome(forHTTPStatus: 400) == .failed)
        #expect(AccountDeletion.outcome(forHTTPStatus: nil) == .failed)   // no network: no status at all
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
        ctx.insert(GoalArea(userId: uid, name: "Health"))
        ctx.insert(Household(ownerId: uid))
        ctx.insert(FamilyMember(userId: uid, name: "M", initials: "M", color: "#000000"))
        ctx.insert(PendingChange(tableName: "tasks", recordId: UUID(), changeType: "insert"))
        try ctx.save()
        #expect(try ctx.fetchCount(FetchDescriptor<SymphonyTask>()) == 1)

        try AccountDeletion.wipe(container)

        let after = ModelContext(container)
        #expect(try after.fetchCount(FetchDescriptor<SymphonyTask>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<Goal>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<GoalArea>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<Household>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<FamilyMember>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<PendingChange>()) == 0)
    }

    @Test func leftoversAreCleared() {
        let defaults = UserDefaults(suiteName: "AccountDeletionTests.\(UUID())")!
        let uid = UUID()
        EditionMemory(defaults: defaults).remember(.light, for: uid)
        let walk = WalkPositionStore(defaults: defaults)
        walk.save(WalkPosition(WalkState(), status: .inProgress, planted: [], periods: WalkPeriods.pick(now: Date()), now: Date()), for: uid)
        #expect(walk.load(for: uid) != nil)
        defaults.set("tok", forKey: MedTokenStore.key)
        defaults.set(1, forKey: PlanCalendar.weekStartsOnKey)
        defaults.set(false, forKey: "planner.paperSound")
        AccountDeletion.clearDeviceLeftovers(userId: uid, defaults: defaults, spoolBase: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        #expect(EditionMemory(defaults: defaults).lastKnown(for: uid) == nil)
        #expect(walk.load(for: uid) == nil)
        #expect(defaults.string(forKey: MedTokenStore.key) == nil)
        #expect(defaults.object(forKey: PlanCalendar.weekStartsOnKey) == nil)
        #expect(defaults.object(forKey: "planner.paperSound") != nil)   // device preference stays
    }

    @Test func spoolIsRemoved() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let dir = PhotoCaptureService.spoolDirectory(in: base)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("\(UUID().uuidString).jpg")
        try Data([1, 2, 3]).write(to: file)
        PhotoCaptureService.deleteSpool(base: base)
        #expect(!FileManager.default.fileExists(atPath: file.path))
        #expect(!FileManager.default.fileExists(atPath: dir.path))
        try? FileManager.default.removeItem(at: base)
    }

    private struct Boom: Error {}

    @Test func localFailureStillForgetsSession() async throws {
        let container = try ModelContainer(
            for: Schema(SymphonyApp.modelTypes),
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let defaults = UserDefaults(suiteName: "AccountDeletionTests.\(UUID())")!
        let uid = UUID()
        EditionMemory(defaults: defaults).remember(.light, for: uid)
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        var stopped = false, forgot = false
        await AccountDeletion.finishLocally(
            container: container, stopSync: { stopped = true }, userId: uid,
            wipeStore: { _ in throw Boom() }, defaults: defaults, spoolBase: base,
            forgetSession: { forgot = true }
        )
        #expect(stopped && forgot)
        #expect(EditionMemory(defaults: defaults).lastKnown(for: uid) == nil)
    }

    @Test func modelTypesIsComplete() throws {
        let container = try ModelContainer(
            for: Schema(SymphonyApp.modelTypes),
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        #expect(container.schema.entities.count == SymphonyApp.modelTypes.count)
        let names = Set(SymphonyApp.modelTypes.map { String(describing: $0) })
        let expected: Set<String> = [
            "SymphonyTask", "Project", "Routine", "Contact", "FamilyMember", "ActionableInstance",
            "EventNote", "WeeklyTemplate", "Household", "UserProfile", "SymphonyList",
            "SymphonyListItem", "TaskCommitment", "TaskFocus", "Goal", "GoalArea", "PendingChange",
        ]
        #expect(names == expected)
    }
}
