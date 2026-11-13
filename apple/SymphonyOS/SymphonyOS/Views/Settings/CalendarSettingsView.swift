import SwiftUI

/// Calendar connection screen: shows whether Google Calendar is linked, lets the
/// user connect (via the web flow in an in-app browser) or disconnect. Once linked,
/// events appear on the Today timeline.
struct CalendarSettingsView: View {
    @State private var service = GoogleCalendarService.shared
    @State private var apple = AppleCalendarService.shared
    @State private var showConnect = false
    @Environment(AppState.self) private var appState

    var body: some View {
        if CalendarFeed.source(for: appState.edition) == .apple {
            appleBody
        } else {
            googleBody
        }
    }

    /// Light: the phone's own calendar. No Google wording, no server call.
    private var appleBody: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    Image(systemName: "calendar")
                        .font(.system(size: 20))
                        .foregroundStyle(Color.primaryTint)
                        .frame(width: 28)
                    Text("Apple Calendar")
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textPrimary)
                    Spacer()
                    if apple.access == .allowed {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.primaryTint)
                    }
                }
                .padding(.vertical, 2)
            } footer: {
                switch apple.access {
                case .notAsked: Text("See your calendar on Today too")
                case .allowed:  Text("Your Apple Calendar shows on Today and Week.")
                case .denied:   Text("Calendar access is off.")
                }
            }

            Section {
                switch apple.access {
                case .notAsked:
                    Button {
                        // Granting changes the feed's refreshKey; the views re-read.
                        Task { await apple.requestAccess() }
                    } label: {
                        Label("Show my calendar", systemImage: "calendar.badge.plus")
                    }
                case .denied:
                    #if os(iOS)
                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Label("Open Settings", systemImage: "gearshape")
                    }
                    #endif
                case .allowed:
                    EmptyView()
                }
            }
        }
        .navigationTitle("Calendar")
    }

    private var googleBody: some View {
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
