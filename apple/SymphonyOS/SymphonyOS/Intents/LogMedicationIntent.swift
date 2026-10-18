import AppIntents
import Foundation

// "Log my meds" / "Log <medication>" — the native App Intent behind the Siri
// phrase and any home/lock-screen widget button. Posts to the log-medication
// edge function with the durable per-user token, and speaks the confirmation
// the function returns.
struct LogMedicationIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Medication"
    static var description = IntentDescription("Logs a medication dose in Symphony.")

    // Default "all" logs every active medication now. Siri fills this from the
    // spoken phrase (e.g. "Log levodopa") or prompts if invoked bare.
    @Parameter(title: "Medication", default: "all")
    var medication: String

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$medication)")
    }

    private static let endpoint = URL(
        string: "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-medication"
    )!

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let token: String
        do {
            token = try await MedTokenStore.ensureToken()
        } catch {
            throw NSError(
                domain: "meds", code: 401,
                userInfo: [NSLocalizedDescriptionKey: "Open Symphony and sign in first, then try again."]
            )
        }

        var req = URLRequest(url: Self.endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(token, forHTTPHeaderField: "x-med-token")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["medication": medication])

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 500
        let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        // The function returns `message` on 200/404/409 and `error` on 400 — read
        // whichever is present so Siri always speaks something useful.
        let text = (payload?["message"] as? String)
            ?? (payload?["error"] as? String)
            ?? "Couldn't log medication."

        guard status < 300 else {
            throw NSError(domain: "meds", code: status,
                          userInfo: [NSLocalizedDescriptionKey: text])
        }
        return .result(dialog: IntentDialog(stringLiteral: text))
    }
}
