import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState
    @Query private var familyMembers: [FamilyMember]

    var body: some View {
        Form {
            // Account
            Section("Account") {
                if let email = auth.currentUser?.email {
                    HStack {
                        Text("Email")
                        Spacer()
                        Text(email)
                            .foregroundStyle(Color.textSecondary)
                    }
                }
                NavigationLink {
                    DeleteAccountView()
                } label: {
                    Text("Delete account")
                        .foregroundStyle(Color.feedbackRed)
                }
            }

            // Integrations
            if appState.edition.allows(.googleCalendar) {
            Section("Integrations") {
                NavigationLink {
                    CalendarSettingsView()
                } label: {
                    Label("Google Calendar", systemImage: "calendar")
                }
            }
            }

            // Family
            if appState.edition.allows(.people) {
            Section("Family Members") {
                ForEach(familyMembers, id: \.id) { member in
                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color(hex: member.color) ?? Color.primaryTint)
                            .frame(width: 32, height: 32)
                            .overlay(
                                Text(member.initials)
                                    .font(.captionBold)
                                    .foregroundStyle(.white)
                            )

                        VStack(alignment: .leading) {
                            Text(member.name)
                                .font(.bodyMedium)
                            if let role = member.roleLabel {
                                Text(role.capitalized)
                                    .font(.captionText)
                                    .foregroundStyle(Color.textTertiary)
                            }
                        }
                    }
                }
            }
            }

            // The walk (iPhone only): the one place a replay is asked for.
            #if os(iOS)
            Section {
                Button(WalkCopy.replayButton) {
                    appState.walkReplayRequested = true
                    // Leave More (and Settings with it) for the Planner, under the walk.
                    appState.activeTab = .planner
                }
            } footer: {
                Text(WalkCopy.replayFooter)
            }
            #endif

            // About
            Section("About") {
                HStack {
                    Text("Version")
                    Spacer()
                    Text("1.0.0")
                        .foregroundStyle(Color.textTertiary)
                }
            }

            // Sign Out
            Section {
                Button("Sign Out") {
                    Task { await auth.signOut() }
                }
                .foregroundStyle(Color.feedbackRed)
            }
        }
        .navigationTitle("Settings")
    }
}

// MARK: - Color from hex

extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)

        let r, g, b: Double
        switch hex.count {
        case 6:
            r = Double((int >> 16) & 0xFF) / 255
            g = Double((int >> 8) & 0xFF) / 255
            b = Double(int & 0xFF) / 255
        default:
            return nil
        }

        self.init(red: r, green: g, blue: b)
    }
}
