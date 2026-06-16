import SwiftUI

/// Calendar connection screen: shows whether Google Calendar is linked, lets the
/// user connect (via the web flow in an in-app browser) or disconnect. Once linked,
/// events appear on the Today timeline.
struct CalendarSettingsView: View {
    @State private var service = GoogleCalendarService()
    @State private var showConnect = false

    var body: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    Image(systemName: "calendar")
                        .font(.system(size: 20))
                        .foregroundStyle(Color.primaryTint)
                        .frame(width: 28)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Google Calendar")
                            .font(.bodyMedium)
                            .foregroundStyle(Color.textPrimary)
                        Text(service.isConnected ? "Connected" : "Not connected")
                            .font(.captionText)
                            .foregroundStyle(service.isConnected ? Color.primaryTint : Color.textTertiary)
                    }

                    Spacer()

                    if service.isLoading {
                        ProgressView()
                    } else if service.isConnected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.primaryTint)
                    }
                }
                .padding(.vertical, 2)
            } footer: {
                Text("Your Google Calendar events show up on Today. Connect once — it stays linked across all your devices.")
            }

            Section {
                #if os(iOS)
                Button {
                    showConnect = true
                } label: {
                    Label(service.isConnected ? "Reconnect or switch account" : "Connect Google Calendar",
                          systemImage: "link")
                }
                #endif

                if service.isConnected {
                    Button(role: .destructive) {
                        Task { await service.disconnect() }
                    } label: {
                        Label("Disconnect", systemImage: "minus.circle")
                    }
                }
            }
        }
        .navigationTitle("Calendar")
        .task { await service.checkConnection() }
        #if os(iOS)
        .sheet(isPresented: $showConnect, onDismiss: {
            // Re-check after the browser closes — the connection may now exist.
            Task { await service.checkConnection() }
        }) {
            SafariView(url: GoogleCalendarService.connectURL)
                .ignoresSafeArea()
        }
        #endif
    }
}
