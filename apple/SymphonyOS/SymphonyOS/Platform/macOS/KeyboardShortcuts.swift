#if os(macOS)
import SwiftUI

struct KeyboardShortcutsModifier: ViewModifier {
    @Environment(AppState.self) private var appState

    func body(content: Content) -> some View {
        content
            .keyboardShortcut("k", modifiers: .command) // Cmd+K: Quick Capture
            .onAppear {} // placeholder — actual shortcut handled via commands
    }
}

// MARK: - App Commands

struct SymphonyCommands: Commands {
    @Environment(AppState.self) private var appState

    var body: some Commands {
        CommandGroup(after: .newItem) {
            Button("Quick Capture") {
                appState.showingQuickCapture = true
            }
            .keyboardShortcut("k", modifiers: .command)

            Divider()

            Button("Go to Today") {
                appState.activeSidebarItem = .today
                appState.goToToday()
            }
            .keyboardShortcut("1", modifiers: .command)

            Button("Go to Inbox") {
                appState.activeSidebarItem = .inbox
            }
            .keyboardShortcut("2", modifiers: .command)

            Button("Go to Projects") {
                appState.activeSidebarItem = .projects
            }
            .keyboardShortcut("3", modifiers: .command)

            Button("Go to Routines") {
                appState.activeSidebarItem = .routines
            }
            .keyboardShortcut("4", modifiers: .command)
        }
    }
}
#endif
