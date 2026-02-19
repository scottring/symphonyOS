import SwiftUI
import SwiftData

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
