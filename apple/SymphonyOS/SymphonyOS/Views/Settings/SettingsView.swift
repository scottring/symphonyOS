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
            }

            // Integrations
            Section("Integrations") {
                NavigationLink {
                    CalendarSettingsView()
                } label: {
                    Label("Google Calendar", systemImage: "calendar")
                }
            }

            // Coaching
            Section("Coaching") {
                Toggle("Show Coaching Blocks", isOn: Binding(
                    get: { !appState.hideCoaching },
                    set: { appState.hideCoaching = !$0 }
                ))

                NavigationLink("Family Rules") {
                    FamilyRulesView()
                }
            }

            // Family
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
