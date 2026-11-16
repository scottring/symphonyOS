import Testing
import Foundation
import SwiftData
@testable import Symphony

/// "Start this demo over": who is offered it, the order of its steps, and what it clears on the
/// phone. No test here reaches the network: the server is a fake.
@MainActor
struct DemoResetTests {
    // MARK: The offer

    @Test func offeredOnlyToATestAccountInALightHousehold() {
        #expect(DemoReset.offered(isTestAccount: true, edition: .light))
        #expect(!DemoReset.offered(isTestAccount: false, edition: .light))
        #expect(!DemoReset.offered(isTestAccount: true, edition: .full))
        #expect(!DemoReset.offered(isTestAccount: false, edition: .full))
    }

    // MARK: The order

    private struct Boom: Error {}

    @MainActor
    final class FakeSteps: DemoResetSteps {
        var calls: [String] = []
        var settles = true
        var serverFails = false
        var clearFails = false

        func pauseSync() async -> Bool { calls.append("pauseSync"); return settles }
        func resumeSync() async { calls.append("resumeSync") }
        func resetServer() async throws {
            calls.append("resetServer")
            if serverFails { throw Boom() }
        }
        func clearPhone() async throws {
            calls.append("clearPhone")
            if clearFails { throw Boom() }
        }
        func forgetWalk() { calls.append("forgetWalk") }
        func startOver() async { calls.append("startOver") }
    }

    @Test func stepsRunInOrder() async {
        let steps = FakeSteps()
        #expect(await DemoReset.run(steps) == .startedOver)
        #expect(steps.calls == ["pauseSync", "resetServer", "clearPhone", "forgetWalk", "startOver"])
    }

    /// Offline, or the server refuses (not a test account): nothing on the phone is touched and
    /// sync runs again as it did.
    @Test func aFailedServerCallLeavesThePhoneAlone() async {
        let steps = FakeSteps()
        steps.serverFails = true
        #expect(await DemoReset.run(steps) == .failed)
        #expect(steps.calls == ["pauseSync", "resetServer", "resumeSync"])
    }

    /// A push or pull that will not finish: the server is never asked.
    @Test func aSyncThatWillNotSettleNeverReachesTheServer() async {
        let steps = FakeSteps()
        steps.settles = false
        #expect(await DemoReset.run(steps) == .failed)
        #expect(steps.calls == ["pauseSync", "resumeSync"])
    }

    /// The server was emptied but the phone's store would not clear: sync stays off (the old rows
    /// would go back up), nothing is forgotten, no walk opens.
    @Test func aStoreThatWillNotClearKeepsSyncOff() async {
        let steps = FakeSteps()
        steps.clearFails = true
        #expect(await DemoReset.run(steps) == .failed)
        #expect(steps.calls == ["pauseSync", "resetServer", "clearPhone"])
    }

    // MARK: The phone

    private func container() throws -> ModelContainer {
        try ModelContainer(for: Schema(SymphonyApp.modelTypes),
                           configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    }

    /// What `reset_test_account` keeps (the household, the profile, the family) stays on the phone;
    /// every other model, the sync queue among them, is cleared. A model added later is cleared
    /// unless it is named as kept.
    @Test func theClearedModelsAreEveryModelButTheKeptThree() {
        let cleared = Set(DemoResetService.clearedTypes.map { ObjectIdentifier($0) })
        let kept = Set(DemoResetService.keptTypes.map { ObjectIdentifier($0) })
        #expect(kept == Set([ObjectIdentifier(Household.self), ObjectIdentifier(UserProfile.self),
                             ObjectIdentifier(FamilyMember.self)]))
        #expect(cleared.isDisjoint(with: kept))
        #expect(cleared.union(kept) == Set(SymphonyApp.modelTypes.map { ObjectIdentifier($0) }))
        #expect(cleared.contains(ObjectIdentifier(PendingChange.self)))
    }

    @Test func clearingThePhoneKeepsTheHouseholdAndEmptiesTheRest() throws {
        let container = try container()
        let uid = UUID()
        let ctx = ModelContext(container)
        ctx.insert(SymphonyTask(userId: uid, title: "t"))
        ctx.insert(Goal(id: UUID(), userId: uid, name: "g", year: 2026))
        ctx.insert(GoalArea(userId: uid, name: "Health"))
        ctx.insert(PendingChange(tableName: "goals", recordId: UUID(), changeType: "insert"))
        ctx.insert(Household(ownerId: uid))
        ctx.insert(UserProfile(userId: uid))
        ctx.insert(FamilyMember(userId: uid, name: "M", initials: "M", color: "#000000"))
        try ctx.save()

        try AccountDeletion.wipe(container, types: DemoResetService.clearedTypes)

        let after = ModelContext(container)
        #expect(try after.fetchCount(FetchDescriptor<SymphonyTask>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<Goal>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<GoalArea>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<PendingChange>()) == 0)
        #expect(try after.fetchCount(FetchDescriptor<Household>()) == 1)
        #expect(try after.fetchCount(FetchDescriptor<UserProfile>()) == 1)
        #expect(try after.fetchCount(FetchDescriptor<FamilyMember>()) == 1)
    }

    /// The saved walk, the handover's line seen, and the signs put away are forgotten for this
    /// person only; the remembered edition (still light) and another person's walk stay.
    @Test func forgettingTheWalkForgetsEveryMarkOfThisPerson() {
        let defaults = UserDefaults(suiteName: "DemoResetTests.\(UUID())")!
        let uid = UUID(), other = UUID()
        let walk = WalkPositionStore(defaults: defaults)
        let position = WalkPosition(WalkState(), status: .finished, planted: [], periods: WalkPeriods.pick(now: Date()), now: Date())
        walk.save(position, for: uid)
        walk.save(position, for: other)
        let handover = HandoverMemory(defaults: defaults)
        handover.markSeen(for: uid)
        let signs = SignpostMemory(defaults: defaults)
        let today = Date()
        signs.dismiss(.dayDone, for: uid, on: today)
        let edition = EditionMemory(defaults: defaults)
        edition.remember(.light, for: uid)

        DemoResetService.forgetWalkMarks(userId: uid, walk: walk, handover: handover, signs: signs)

        #expect(walk.load(for: uid) == nil)
        #expect(!handover.seen(for: uid))
        #expect(signs.dismissed(for: uid, on: today).isEmpty)
        #expect(walk.load(for: other) != nil)
        #expect(edition.lastKnown(for: uid) == .light)
    }

    // MARK: The words

    @Test func theWordsReadAsRuled() {
        #expect(DailyCopy.demoResetRow == "Start this demo over")
        #expect(DailyCopy.demoResetLine == "Clears everything in this demo account and starts the walk again.")
        #expect(DailyCopy.demoResetConfirmTitle == "Start this demo over?")
        #expect(DailyCopy.demoResetConfirmBody == "Everything in this demo account is removed. This can’t be undone.")
        #expect(DailyCopy.demoResetConfirm == "Start over")
        #expect(DailyCopy.demoResetCancel == "Cancel")
        #expect(DailyCopy.demoResetFailed == "Couldn’t start over. Check the connection and try again.")
        #expect(DailyCopy.demoResetRunning == "Starting over…")
        for line in [DailyCopy.demoResetConfirmBody, DailyCopy.demoResetFailed] { #expect(!line.contains("'")) }
    }
}
