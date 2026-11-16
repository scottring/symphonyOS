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
        try wipe(container, types: SymphonyApp.modelTypes)
    }

    /// Deletes every row of the models named (a demo started over keeps the household:
    /// `DemoResetService.clearedTypes`).
    static func wipe(_ container: ModelContainer, types: [any PersistentModel.Type]) throws {
        let context = ModelContext(container)
        for type in types {
            try context.delete(model: type)
        }
        try context.save()
    }

    private static let log = Logger(subsystem: "com.symphonyos.app", category: "account-deletion")

    enum Outcome: Equatable {
        /// The server deleted the account just now.
        case deleted
        /// 410: this sign-in's user no longer exists. The server deleted the
        /// account on an earlier try whose reply was lost.
        case alreadyGone
        /// Anything else (no network, 400, 401, 403, 500, 503): nothing
        /// changes here. A 401 is not proof the account is gone: a session
        /// refresh that failed or a revoked session also answers 401.
        case failed
    }

    /// What a `delete-account` answer means for the phone; nil is no HTTP answer at all.
    static func outcome(forHTTPStatus status: Int?) -> Outcome {
        switch status {
        case .some(200..<300): .deleted
        case .some(410): .alreadyGone
        default: .failed
        }
    }

    /// Server first: a failure throws and nothing local changes. Once the
    /// server has deleted the account (now, or on a try whose reply was lost)
    /// the local steps never throw, so a local fault can't leave a signed-in
    /// session for a deleted user.
    static func run(container: ModelContainer, auth: AuthService, stopSync: () async -> Void) async throws {
        let userId = auth.currentUser?.id   // captured before the auth listener can clear it
        var status: Int? = 200
        var failure: Error?
        do {
            try await supabase.functions.invoke(
                "delete-account",
                options: FunctionInvokeOptions(body: ["confirm": confirmPhrase])
            )
        } catch {
            failure = error
            if case FunctionsError.httpError(let code, _) = error { status = code } else { status = nil }
        }
        switch outcome(forHTTPStatus: status) {
        case .deleted: break
        case .alreadyGone: log.notice("delete-account answered 410: the account is already gone; finishing on the phone")
        case .failed: throw failure ?? URLError(.badServerResponse)
        }
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
        WalkPositionStore(defaults: defaults).forget(for: userId)
        defaults.removeObject(forKey: MedTokenStore.key)
        defaults.removeObject(forKey: PlanCalendar.weekStartsOnKey)
        PhotoCaptureService.deleteSpool(base: spoolBase)
    }
}
