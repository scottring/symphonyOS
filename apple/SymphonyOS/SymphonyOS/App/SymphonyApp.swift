import SwiftUI
import SwiftData
import AppIntents
import Supabase

@main
struct SymphonyApp: App {
    @State private var authService = AuthService()
    @State private var appState = AppState()

    init() {
        FontLoader.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authService)
                .environment(appState)
                .background(Color.bgBase)
        }
        .modelContainer(for: [
            SymphonyTask.self,
            Project.self,
            Routine.self,
            Contact.self,
            FamilyMember.self,
            ActionableInstance.self,
            PlaybookBlock.self,
            PlaybookInstance.self,
            WeeklyTemplate.self,
            FamilyRule.self,
            Responsibility.self,
            Household.self,
            UserProfile.self,
            PendingChange.self,
        ])
    }
}

// MARK: - Siri / Shortcuts capture
//
// "Hey Siri, add <X> to Symphony" drops a task in the inbox without launching
// the app. It writes straight to Supabase using the stored session (so it works
// from the lock screen and doesn't depend on the local SwiftData sync loop).

struct CaptureTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Capture to Symphony"
    static var description = IntentDescription("Add an item to your Symphony inbox.")
    static var openAppWhenRun = false

    @Parameter(title: "Task")
    var task: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = task.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return .result(dialog: "Nothing to add.")
        }

        let session: Session
        do {
            session = try await supabase.auth.session
        } catch {
            return .result(dialog: "Open Symphony and sign in first, then try again.")
        }

        struct NewTask: Encodable {
            let user_id: String
            let title: String
            let bucket: String
            let completed: Bool
        }

        do {
            try await supabase.from("tasks")
                .insert(NewTask(user_id: session.user.id.uuidString,
                                title: trimmed, bucket: "inbox", completed: false))
                .execute()
            return .result(dialog: "Added “\(trimmed)” to your Symphony inbox.")
        } catch {
            return .result(dialog: "Couldn't add that right now — try again in a moment.")
        }
    }
}

struct SymphonyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaptureTaskIntent(),
            phrases: [
                "Add to \(.applicationName)",
                "Capture in \(.applicationName)",
                "New task in \(.applicationName)",
            ],
            shortTitle: "Capture",
            systemImageName: "plus.circle"
        )
    }
}
