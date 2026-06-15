import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @State private var syncEngine: SyncEngine?

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
        .task {
            NotificationManager.requestAuthorization()
            // Handle initial session restore
            if auth.isAuthenticated, let user = auth.currentUser {
                startSync(userId: user.id)
            }
        }
    }

    private func startSync(userId: UUID) {
        let container = modelContext.container
        let engine = SyncEngine(modelContainer: container)
        syncEngine = engine
        Task {
            await engine.start(userId: userId)
        }
    }

    private func stopSync() {
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
                Image(systemName: "music.note.list")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
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
