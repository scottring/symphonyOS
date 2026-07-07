import AppIntents

// Registers the Siri phrases + Shortcuts-app entries for Symphony's App Intents.
// With this, "Hey Siri, Log my meds in Symphony" (and "Log <medication> in
// Symphony") work on iPhone, and — because the phone app owns the intent — on a
// paired Apple Watch, with no separate watchOS target.
struct SymphonyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogMedicationIntent(),
            phrases: [
                "Log my meds in \(.applicationName)",
                "Log \(\.$medication) in \(.applicationName)",
            ],
            shortTitle: "Log Meds",
            systemImageName: "pills.fill"
        )
    }
}
