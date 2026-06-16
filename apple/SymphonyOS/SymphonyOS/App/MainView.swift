import SwiftUI

struct MainView: View {
    var body: some View {
        #if os(iOS)
        iOSMainView()
        #else
        MacMainView()
        #endif
    }
}

// MARK: - iOS Tab View

struct iOSMainView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var state = appState
        TabView(selection: $state.activeTab) {
            NavigationStack {
                TodayView()
            }
            .tabItem { Label("Today", systemImage: "sun.max") }
            .tag(AppTab.today)

            NavigationStack {
                InboxView()
            }
            .tabItem { Label("Inbox", systemImage: "tray") }
            .tag(AppTab.inbox)

            NavigationStack {
                ProjectListView()
            }
            .tabItem { Label("Projects", systemImage: "folder") }
            .tag(AppTab.projects)

            NavigationStack {
                MoreView()
            }
            .tabItem { Label("More", systemImage: "ellipsis") }
            .tag(AppTab.more)
        }
        .tint(Color.primaryTint)
        .onAppear {
            #if os(iOS)
            // Warm tab bar appearance matching Nordic Journal
            let appearance = UITabBarAppearance()
            appearance.configureWithDefaultBackground()
            appearance.backgroundColor = UIColor(Color.bgBase.opacity(0.95))
            appearance.shadowColor = UIColor(Color.textTertiary.opacity(0.1))
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
            #endif
        }
    }
}

// MARK: - macOS Split View

#if os(macOS)
struct MacMainView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var state = appState
        NavigationSplitView {
            List(selection: $state.activeSidebarItem) {
                ForEach(SidebarItem.allCases) { item in
                    Label(item.rawValue, systemImage: item.icon)
                        .tag(item)
                }
            }
            .navigationTitle("Symphony")
        } detail: {
            switch appState.activeSidebarItem {
            case .today:
                TodayView()
            case .inbox:
                InboxView()
            case .projects:
                ProjectListView()
            case .routines:
                RoutineListView()
            case .contacts:
                ContactListView()
            case .settings:
                SettingsView()
            }
        }
    }
}
#endif

// MARK: - Placeholder Views (replaced in Phase 3+)

struct TodayPlaceholder: View {
    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 24) {
                Image(systemName: "sun.max")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)

                VStack(spacing: 8) {
                    Text("Today")
                        .font(.displayMedium)
                        .foregroundStyle(Color.textPrimary)

                    Text(appState.selectedDate.formatted(date: .long, time: .omitted))
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textSecondary)
                }

                Text("Timeline coming in Phase 3")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)

                Button("Sign Out") {
                    Task { await auth.signOut() }
                }
                .buttonStyle(.symphony)
            }
        }
        .navigationTitle("Today")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
    }
}

struct InboxPlaceholder: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "tray")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Inbox")
                    .font(.displayMedium)
                    .foregroundStyle(Color.textPrimary)
                Text("Coming in Phase 3")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .navigationTitle("Inbox")
    }
}

struct ProjectsPlaceholder: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "folder")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Projects")
                    .font(.displayMedium)
                    .foregroundStyle(Color.textPrimary)
                Text("Coming in Phase 4")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .navigationTitle("Projects")
    }
}

struct RoutinesPlaceholder: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "repeat")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Routines")
                    .font(.displayMedium)
                Text("Coming in Phase 4")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .navigationTitle("Routines")
    }
}

struct ContactsPlaceholder: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "person.2")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Contacts")
                    .font(.displayMedium)
                Text("Coming in Phase 4")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .navigationTitle("Contacts")
    }
}

struct MoreView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState

    var body: some View {
        List {
            Section {
                NavigationLink {
                    RoutineListView()
                } label: {
                    Label("Routines", systemImage: "repeat")
                }

                NavigationLink {
                    ContactListView()
                } label: {
                    Label("Contacts", systemImage: "person.2")
                }

                NavigationLink {
                    FamilyRulesView()
                } label: {
                    Label("Family Rules", systemImage: "list.clipboard")
                }
            }

            Section {
                NavigationLink {
                    CalendarSettingsView()
                } label: {
                    Label("Calendar", systemImage: "calendar")
                }

                NavigationLink {
                    SettingsView()
                } label: {
                    Label("Settings", systemImage: "gear")
                }
            }

            Section {
                Toggle("Show Coaching", isOn: Binding(
                    get: { !appState.hideCoaching },
                    set: { appState.hideCoaching = !$0 }
                ))
            }

            Section {
                Button("Sign Out") {
                    Task { await auth.signOut() }
                }
                .foregroundStyle(.red)
            }
        }
        .navigationTitle("More")
    }
}

struct SettingsPlaceholder: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "gear")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Settings")
                    .font(.displayMedium)

                Button("Sign Out") {
                    Task { await auth.signOut() }
                }
                .buttonStyle(.symphony)
            }
        }
        .navigationTitle("Settings")
    }
}
