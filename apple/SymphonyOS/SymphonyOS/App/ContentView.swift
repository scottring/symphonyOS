import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(AuthService.self) private var auth
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
                MainView()
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
            Task { await engine.resync() }
        }
        .task {
            NotificationManager.requestAuthorization()
            // Handle initial session restore
            if auth.isAuthenticated, let user = auth.currentUser {
                startSync(userId: user.id)
            }
        }
    }

    private func startSync(userId: UUID) {
        // Both call sites run on the main actor, so claiming the id synchronously
        // here is what makes the second call a no-op.
        guard syncedUserId != userId else { return }
        syncedUserId = userId

        let previous = syncEngine
        let container = modelContext.container
        let engine = SyncEngine(modelContainer: container)
        syncEngine = engine
        Task {
            await previous?.stop()   // never leave two engines on one socket
            await engine.start(userId: userId)
        }
        #if os(iOS)
        PushTokens.register()   // no-op until the Push capability is added
        #endif
    }

    private func stopSync() {
        syncedUserId = nil
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
