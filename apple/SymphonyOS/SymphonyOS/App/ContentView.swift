import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @State private var syncEngine: SyncEngine?
    /// Who `syncEngine` is already running for. Both `.task` and the
    /// `isAuthenticated` change fire on a cold launch with a restored session, so
    /// without this guard the app built TWO engines ~3ms apart. They share the
    /// realtime client's channels (it keys them by topic), so the second one
    /// re-subscribed already-joined channels and left `tasks` UNSUBSCRIBED —
    /// no insert, update or delete ever arrived again.
    @State private var syncedUserId: UUID?

    var body: some View {
        Group {
            if auth.isLoading {
                LaunchScreen()
            } else if auth.isAuthenticated {
                if appState.demoResetting {
                    // A demo being started over (`DemoReset`): the main view is down while the
                    // phone's copy is cleared, and comes back fresh.
                    LaunchScreen()
                        .onAppear { appState.demoResetCovered = true }
                        .onDisappear { appState.demoResetCovered = false }
                } else {
                    MainView()
                }
            } else {
                AuthView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: auth.isAuthenticated)
        .animation(.easeInOut(duration: 0.3), value: auth.isLoading)
        .onChange(of: auth.isAuthenticated) { _, isAuthenticated in
            if isAuthenticated, let user = auth.currentUser {
                startSync(userId: user.id)
            } else {
                stopSync()
            }
        }
        // Coming back to the foreground is the ONLY chance to catch up on work
        // done elsewhere while we were suspended — realtime does not replay.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, let engine = syncEngine else { return }
            Task {
                // A first pull that failed (offline at launch) can finish
                // here; a failed resync never takes a finished one back.
                await engine.resync(onFirstPull: { pulled in if pulled { markFirstPullFinished(by: engine) } })
            }
        }
        .task {
            #if DEBUG
            if !DemoMode.isOn { NotificationManager.requestAuthorization() }
            #else
            NotificationManager.requestAuthorization()
            #endif
            // Handle initial session restore
            if auth.isAuthenticated, let user = auth.currentUser {
                startSync(userId: user.id)
            }
        }
    }

    private func startSync(userId: UUID) {
        #if DEBUG
        if DemoMode.isOn {
            // Demo data is local-only; never sync it. The seeded store is all
            // there is, so there is no pull to wait for.
            appState.householdsPulled = true
            appState.initialSyncFinished = true
            return
        }
        #endif
        // Both call sites run on the main actor, so claiming the id synchronously
        // here is what makes the second call a no-op.
        guard syncedUserId != userId else { return }
        syncedUserId = userId
        // A new account (or someone else signing in) has not pulled yet.
        appState.householdsPulled = false
        appState.initialSyncFinished = false

        let previous = syncEngine
        let container = modelContext.container
        let engine = SyncEngine(modelContainer: container)
        syncEngine = engine
        // Lets account deletion stop sync and wait for it before wiping.
        appState.stopSync = { [weak engine] in await engine?.stop() }
        // A demo started over (`DemoReset`): stop and let what is under way finish, then sync again
        // from fresh for the same person.
        appState.pauseSync = { [weak engine] in await engine?.stopAndSettle() ?? true }
        appState.restartSync = { [self] in
            syncedUserId = nil
            startSync(userId: userId)
        }
        Task {
            await previous?.stop()   // never leave two engines on one socket
            // Reported as soon as the pull is in, not after realtime has joined:
            // the walk waits on it, and a join can take long on a poor network.
            await engine.start(userId: userId, onFirstPull: { pulled in if pulled { markFirstPullFinished(by: engine) } },
                               onHouseholds: { markHouseholdsPulled(by: engine) })
        }
        #if os(iOS)
        PushTokens.register()   // no-op until the Push capability is added
        #endif
    }

    /// Only the engine still running counts: one stopped by a sign-out (or
    /// replaced by someone else's sign-in) may finish its pull afterwards.
    /// The households rows are in for this sign-in (ruling D24): the edition can be read. A failed
    /// households pull leaves this false (not light); the next try is the resync when the app comes back
    /// to the foreground, which runs the same pull and says so again.
    @MainActor
    private func markHouseholdsPulled(by engine: SyncEngine) {
        guard syncEngine === engine else { return }
        appState.householdsPulled = true
    }

    @MainActor
    private func markFirstPullFinished(by engine: SyncEngine) {
        guard syncEngine === engine else { return }
        appState.initialSyncFinished = true
    }

    private func stopSync() {
        syncedUserId = nil
        appState.pauseSync = nil
        appState.restartSync = nil
        appState.signedOut()
        if let engine = syncEngine {
            Task {
                await engine.stop()
            }
        }
        syncEngine = nil
    }
}

// MARK: - Launch Screen

private struct LaunchScreen: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image("TreeLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 104, height: 104)
                    .clipShape(Circle())
                Text("Symphony")
                    .font(.displayLarge)
                    .foregroundStyle(Color.textPrimary)
            }
        }
    }
}

#Preview {
    ContentView()
        .environment(AuthService())
        .environment(AppState())
}
