import SwiftUI
import SwiftData

struct DeleteAccountView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query private var members: [FamilyMember]

    @State private var confirming = false
    @State private var running = false
    @State private var failed = false

    private var shares: Bool {
        AccountDeletion.sharesHousehold(members: members, me: auth.currentUser?.id)
    }

    var body: some View {
        Form {
            Section {
                Text(AccountDeletion.warning(sharesHousehold: shares))
                    .foregroundStyle(Color.textPrimary)
            }
            Section {
                Button(role: .destructive) {
                    confirming = true
                } label: {
                    Text(running ? "Deleting…" : "Delete my account")
                        .frame(maxWidth: .infinity)
                }
                .disabled(running)
                if failed {
                    Text("Symphony couldn't delete your account. Try again in a moment, or write to hello@symphony-os.com.")
                        .font(.footnote)
                        .foregroundStyle(Color.feedbackRed)
                }
            }
        }
        .navigationTitle("Delete account")
        .navigationBarBackButtonHidden(running)
        .interactiveDismissDisabled(running)
        .navigationBarTitleDisplayModeIfAvailable()
        .alert("Delete your account?", isPresented: $confirming) {
            Button("Delete my account", role: .destructive) { start() }
            Button("Keep my account", role: .cancel) {}
        } message: {
            Text(AccountDeletion.warning(sharesHousehold: shares))
        }
    }

    private func start() {
        #if DEBUG
        if DemoMode.isOn { return }   // demo has no account; nothing to delete
        #endif
        running = true
        failed = false
        let container = modelContext.container
        let stop = appState.stopSync ?? {}
        Task {
            do {
                try await AccountDeletion.run(container: container, auth: auth, stopSync: stop)
            } catch {
                failed = true
            }
            running = false
        }
    }
}

private extension View {
    @ViewBuilder func navigationBarTitleDisplayModeIfAvailable() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }
}
