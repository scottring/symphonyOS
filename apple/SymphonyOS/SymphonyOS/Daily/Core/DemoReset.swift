import Foundation

/// "Start this demo over" (the owner, 2026-11-16: "a demo account wherein I can easily wipe the
/// data to show to another person"). A test account (a row in `test_accounts`, added by hand,
/// never by the app) in a light household can empty itself from Settings and land on the walk's
/// Welcome, as a first run would. The web has the same feature (`TestAccountReset.tsx`); the
/// server function `reset_test_account()` checks the list again and clears only the caller's rows.
enum DemoReset {
    /// The row is offered when, and only when, the signed-in account is a test account and the
    /// household is light. A full household never sees it (nor asks whether it is a test account).
    static func offered(isTestAccount: Bool, edition: Edition) -> Bool {
        isTestAccount && edition == .light
    }

    /// The row's state: waiting for a tap, running (it shows progress and takes no second tap),
    /// or failed (one plain line under it).
    enum Phase: Equatable { case idle, running, failed }

    enum Outcome: Equatable { case startedOver, failed }

    /// The steps in order, each only after the one before it succeeded:
    /// 1. sync stops, and whatever it was sending or bringing in finishes, so nothing queued on
    ///    the phone can reach the server after the reset;
    /// 2. the server empties the account (`reset_test_account`, as the signed-in person);
    /// 3. the phone's copy of the account's content, and the sync queue with it, is cleared;
    /// 4. every mark that says this person has walked is forgotten;
    /// 5. sync starts afresh and the walk's Welcome shows.
    ///
    /// Until the server has said yes nothing on the phone is touched: a sync that will not settle,
    /// or a server that refuses (offline, not a test account), only lets sync run again as it did.
    /// If the phone's store cannot be cleared after the server was emptied, sync is left off, so
    /// the rows still on the phone are never sent back up; nothing is forgotten and no walk opens.
    @MainActor
    static func run(_ steps: some DemoResetSteps) async -> Outcome {
        guard await steps.pauseSync() else {
            await steps.resumeSync()
            return .failed
        }
        do {
            try await steps.resetServer()
        } catch {
            await steps.resumeSync()
            return .failed
        }
        do {
            try await steps.clearPhone()
        } catch {
            return .failed
        }
        steps.forgetWalk()
        await steps.startOver()
        return .startedOver
    }
}

/// What `DemoReset.run` drives: the app's own steps (`DemoResetService`), or fakes in a test.
@MainActor
protocol DemoResetSteps {
    /// Sync stopped and settled. False when something under way would not finish in time.
    func pauseSync() async -> Bool
    /// After a failure that touched nothing on the phone: sync runs again as before.
    func resumeSync() async
    /// The server empties this account. Throws on any failure.
    func resetServer() async throws
    /// This account's content off the phone, the sync queue with it. Throws if the store would not clear.
    func clearPhone() async throws
    /// The saved walk and every other mark that says this person has walked.
    func forgetWalk()
    /// Sync from fresh, and the walk's Welcome.
    func startOver() async
}
