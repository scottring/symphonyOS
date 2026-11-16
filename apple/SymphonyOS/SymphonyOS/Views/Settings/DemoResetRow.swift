#if os(iOS)
import SwiftUI
import SwiftData

/// "Start this demo over": one Settings row for a test account in a light household
/// (`DemoReset.offered`), confirmed as Delete account confirms. While it runs it shows progress
/// and takes no second tap; a failure is one plain line under it. The steps and their order are
/// `DemoReset.run`'s; this view only asks and draws.
struct DemoResetRow: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext

    @State private var confirming = false

    private var running: Bool { appState.demoReset == .running }

    var body: some View {
        Button {
            confirming = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "arrow.counterclockwise")
                    .foregroundStyle(Color.textSecondary)
                    .accessibilityHidden(true)   // VoiceOver may read the symbol as "Undo"
                VStack(alignment: .leading, spacing: 2) {
                    Text(running ? DailyCopy.demoResetRunning : DailyCopy.demoResetRow)
                        .foregroundStyle(Color.textPrimary)
                    Text(DailyCopy.demoResetLine)
                        .font(.footnote)
                        .foregroundStyle(Color.textSecondary)
                }
                Spacer(minLength: 0)
                if running { ProgressView() }
            }
        }
        .disabled(running)
        .accessibilityLabel(running ? DailyCopy.demoResetRunningSpoken : DailyCopy.demoResetRow)
        .accessibilityHint(running ? "" : DailyCopy.demoResetLine)
        .accessibilityIdentifier("settings.demoReset")
        .alert(DailyCopy.demoResetConfirmTitle, isPresented: $confirming) {
            Button(DailyCopy.demoResetConfirm, role: .destructive) { start() }
            Button(DailyCopy.demoResetCancel, role: .cancel) {}
        } message: {
            Text(DailyCopy.demoResetConfirmBody)
        }

        if let line = Self.line(for: appState.demoReset) {
            Text(line)
                .font(.footnote)
                .foregroundStyle(Color.feedbackRed)
                .accessibilityIdentifier("settings.demoReset.failed")
        }
    }

    private func start() {
        guard !running, let userId = auth.currentUser?.id else { return }
        appState.demoReset = .running
        let steps = Self.steps(appState: appState, container: modelContext.container, userId: userId)
        let state = appState
        Task { @MainActor in
            let outcome = await DemoReset.run(steps)
            state.demoReset = DemoReset.phase(after: outcome)
            // Said as it appears, wherever the person is (an unfinished clear has closed Settings).
            if let line = Self.line(for: state.demoReset) {
                AccessibilityNotification.Announcement(line).post()
            }
        }
    }

    /// The line under the row: none, or the one for how it failed.
    private static func line(for phase: DemoReset.Phase) -> String? {
        switch phase {
        case .idle, .running: nil
        case .failed: DailyCopy.demoResetFailed
        case .unfinished: DailyCopy.demoResetUnfinished
        }
    }

    /// The real steps; a debug demo's never call the server and clear the demo's own stores.
    @MainActor
    private static func steps(appState: AppState, container: ModelContainer, userId: UUID) -> DemoResetService.Steps {
        #if DEBUG
        if DemoMode.isOn {
            return DemoResetService.Steps(appState: appState, container: container, userId: userId,
                                          server: {}, walk: DemoMode.walkStore,
                                          handover: DemoMode.handoverMemory, signs: DemoMode.signMemory)
        }
        #endif
        return DemoResetService.Steps(appState: appState, container: container, userId: userId,
                                      server: DemoResetService.resetServer, walk: WalkPositionStore(),
                                      handover: HandoverMemory(), signs: SignpostMemory())
    }
}
#endif
