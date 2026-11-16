import Foundation
import SwiftData
import Supabase
import os

/// The app's own steps for "Start this demo over" (`DemoReset.run` decides their order). The
/// server is asked with the signed-in person's own session (never a service-role key), and the
/// phone is cleared the way account deletion clears it (`AccountDeletion.wipe`), but keeping what
/// `reset_test_account()` keeps, and the person stays signed in.
enum DemoResetService {
    private static let log = Logger(subsystem: "com.symphonyos.app", category: "demo-reset")

    /// What `reset_test_account()` keeps on the server (the household, the profile, the family),
    /// kept on the phone too: the edition and the seasons stay read from them, and the walk can open
    /// at once. Everything else is cleared, the sync queue (`PendingChange`) among it, so nothing
    /// queued before the reset is ever sent back up.
    static let keptTypes: [any PersistentModel.Type] = [Household.self, UserProfile.self, FamilyMember.self]

    /// Every stored model but the kept three; a model added later is cleared unless named as kept.
    static var clearedTypes: [any PersistentModel.Type] {
        let kept = Set(keptTypes.map { ObjectIdentifier($0) })
        return SymphonyApp.modelTypes.filter { !kept.contains(ObjectIdentifier($0)) }
    }

    /// Whether the signed-in person is a test account: their own row in `test_accounts` (the
    /// table lets a user read only their own). Any failure reads as no.
    static func isTestAccount(_ userId: UUID) async -> Bool {
        struct Row: Decodable { let user_id: UUID }
        do {
            let rows: [Row] = try await supabase.from("test_accounts").select("user_id")
                .eq("user_id", value: userId.uuidString).limit(1).execute().value
            return !rows.isEmpty
        } catch {
            log.error("test_accounts read failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// `reset_test_account()`, as the signed-in person. It checks `test_accounts` again (42501 if not).
    static func resetServer() async throws {
        try await supabase.rpc("reset_test_account").execute()
    }

    /// The sync queue (`PendingChange`) and the photo spool, alone: after a clear that failed, so
    /// nothing queued before the reset is ever sent to the emptied account. Never throws.
    static func dropQueue(_ container: ModelContainer, spoolBase: URL? = nil) {
        do {
            try AccountDeletion.wipe(container, types: [PendingChange.self])
        } catch {
            log.error("dropping the sync queue failed: \(error.localizedDescription, privacy: .public)")
        }
        PhotoCaptureService.deleteSpool(base: spoolBase)
    }

    /// The saved walk, the handover's line seen, and the signs put away, for this person only.
    /// The remembered edition stays (the household is still light).
    static func forgetWalkMarks(userId: UUID, walk: WalkPositionStore, handover: HandoverMemory, signs: SignpostMemory) {
        walk.forget(for: userId)
        handover.forget(for: userId)
        signs.forget(for: userId)
    }

    /// The steps as the app runs them. `server` is `resetServer` (a debug demo passes a no-op:
    /// it never calls the server); the three stores are the ones the walk and the light pages read.
    @MainActor
    struct Steps: DemoResetSteps {
        let appState: AppState
        let container: ModelContainer
        let userId: UUID
        let server: () async throws -> Void
        let walk: WalkPositionStore
        let handover: HandoverMemory
        let signs: SignpostMemory

        func pauseSync() async -> Bool {
            guard let pause = appState.pauseSync else { return true }   // no engine (a demo)
            return await pause()
        }

        func resumeSync() async { appState.restartSync?() }

        func resetServer() async throws { try await server() }

        /// The main view goes first (so no screen holds a row being cleared), then the store, then
        /// the photo spool (an unsent photo would upload into the emptied account). If the store
        /// will not clear, the main view stays down for `dropQueue`, `forgetWalk` and `showUnfinished`.
        func clearPhone() async throws {
            appState.dailyPanel = nil
            appState.demoResetting = true
            let clock = ContinuousClock()
            let deadline = clock.now + .seconds(3)
            while !appState.demoResetCovered, clock.now < deadline { try? await Task.sleep(for: .milliseconds(30)) }
            try? await Task.sleep(for: .milliseconds(300))   // the sheet and the main view finish going
            do {
                // Whatever the screens wrote as they went (a pull-up written as the light page let
                // go) is saved first, so the wipe takes it too and no later autosave brings it back.
                try container.mainContext.save()
                try AccountDeletion.wipe(container, types: DemoResetService.clearedTypes)
            } catch {
                DemoResetService.log.error("clearing the phone failed: \(error.localizedDescription, privacy: .public)")
                throw error
            }
            PhotoCaptureService.deleteSpool()
        }

        func forgetWalk() {
            DemoResetService.forgetWalkMarks(userId: userId, walk: walk, handover: handover, signs: signs)
        }

        /// Unsaved writes in the main context (the save that failed) are let go first, so no later
        /// autosave can put a queued change back.
        func dropQueue() {
            container.mainContext.rollback()
            DemoResetService.dropQueue(container)
        }

        /// The main view comes back; sync stays off (the held engine is not restarted).
        func showUnfinished() { appState.demoResetting = false }

        func startOver() async {
            appState.restartSync?()
            appState.startedOver()
            appState.demoResetting = false
        }
    }
}
