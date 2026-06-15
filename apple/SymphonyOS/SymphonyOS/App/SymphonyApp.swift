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

    @Parameter(title: "Task", requestValueDialog: "What would you like to add?")
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

        // Parse a spoken date/time out of the phrase: "call plumber tomorrow at
        // 3pm" → scheduled; otherwise it lands in the inbox.
        let parsed = CaptureParser.parse(trimmed)
        let scheduledISO = parsed.date.map { ISO8601DateFormatter().string(from: $0) }

        struct NewTask: Encodable {
            let user_id: String
            let title: String
            let bucket: String
            let completed: Bool
            let scheduled_for: String?
            let is_all_day: Bool
        }

        let newTask = NewTask(
            user_id: session.user.id.uuidString,
            title: parsed.title,
            bucket: parsed.date != nil ? "timed" : "inbox",
            completed: false,
            scheduled_for: scheduledISO,
            is_all_day: parsed.date != nil ? !parsed.hasTime : false
        )

        do {
            try await supabase.from("tasks").insert(newTask).execute()
            if let date = parsed.date {
                let style: Date.FormatStyle = parsed.hasTime
                    ? .dateTime.weekday(.abbreviated).hour().minute()
                    : .dateTime.weekday(.wide).month().day()
                return .result(dialog: "Added “\(parsed.title)” for \(date.formatted(style)).")
            }
            return .result(dialog: "Added “\(parsed.title)” to your Symphony inbox.")
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
