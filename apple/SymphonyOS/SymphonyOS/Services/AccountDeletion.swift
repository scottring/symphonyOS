import Foundation
import SwiftData
import Supabase

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

    /// Server first: a failure throws and nothing local changes. Then stop
    /// sync (and wait), wipe the phone, and sign out locally.
    static func run(container: ModelContainer, auth: AuthService, stopSync: () async -> Void) async throws {
        let userId = auth.currentUser?.id
        try await supabase.functions.invoke(
            "delete-account",
            options: FunctionInvokeOptions(body: ["confirm": confirmPhrase])
        )
        await stopSync()
        try wipe(container)
        clearDeviceLeftovers(userId: userId)
        await auth.forgetSession()
    }

    /// This person's data kept outside SwiftData. Auth storage is cleared by
    /// `forgetSession()`; device preferences (sound, layouts) stay.
    static func clearDeviceLeftovers(userId: UUID?, defaults: UserDefaults = .standard) {
        EditionMemory(defaults: defaults).forget(for: userId)
        defaults.removeObject(forKey: MedTokenStore.key)
        defaults.removeObject(forKey: PlanCalendar.weekStartsOnKey)
    }
}
