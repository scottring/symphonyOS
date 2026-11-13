import Foundation
import SwiftData
import Supabase
import os

/// Deleting your own account from inside the app (App Store rule 5.1.1(v)).
/// The server removes files, data and sign-in; this wipes what the phone kept.
enum AccountDeletion {
    static let confirmPhrase = "delete my account"

    static func warning(sharesHousehold: Bool) -> String {
        let base = "This deletes your Symphony account and everything in it: your goals, tasks, notes and photos. It can't be undone."
        return sharesHousehold ? base + " Things you share with your household stay with them." : base
    }

    /// True when someone else in the household has their own sign-in.
    static func sharesHousehold(members: [FamilyMember], me: UUID?) -> Bool {
        guard let me else { return false }
        return members.contains { member in
            guard let other = member.authUserId else { return false }
            return other != me
        }
    }

    /// Deletes every row of every model the app stores.
    static func wipe(_ container: ModelContainer) throws {
        let context = ModelContext(container)
        for type in SymphonyApp.modelTypes {
            try context.delete(model: type)
        }
        try context.save()
    }

    private static let log = Logger(subsystem: "com.symphonyos.app", category: "account-deletion")

    /// Server first: a failure throws and nothing local changes. Once the
    /// server has deleted the account the local steps never throw, so a local
    /// fault can't leave a signed-in session for a deleted user.
    static func run(container: ModelContainer, auth: AuthService, stopSync: () async -> Void) async throws {
        let userId = auth.currentUser?.id   // captured before the auth listener can clear it
        try await supabase.functions.invoke(
            "delete-account",
            options: FunctionInvokeOptions(body: ["confirm": confirmPhrase])
        )
        await finishLocally(container: container, stopSync: stopSync, userId: userId,
                            forgetSession: { await auth.forgetSession() })
    }

    /// Stop sync (and wait), wipe the phone, then always forget the session.
    static func finishLocally(
        container: ModelContainer,
        stopSync: () async -> Void,
        userId: UUID?,
        wipeStore: (ModelContainer) throws -> Void = AccountDeletion.wipe,
        defaults: UserDefaults = .standard,
        spoolBase: URL? = nil,
        forgetSession: () async -> Void
    ) async {
        await stopSync()
        do { try wipeStore(container) } catch { log.error("Local wipe failed: \(error.localizedDescription)") }
        clearDeviceLeftovers(userId: userId, defaults: defaults, spoolBase: spoolBase)
        await forgetSession()
    }

    /// This person's data kept outside SwiftData. Auth storage is cleared by
    /// `forgetSession()`; device preferences (sound, layouts) stay.
    static func clearDeviceLeftovers(userId: UUID?, defaults: UserDefaults = .standard, spoolBase: URL? = nil) {
        EditionMemory(defaults: defaults).forget(for: userId)
        defaults.removeObject(forKey: MedTokenStore.key)
        defaults.removeObject(forKey: PlanCalendar.weekStartsOnKey)
        PhotoCaptureService.deleteSpool(base: spoolBase)
    }
}
