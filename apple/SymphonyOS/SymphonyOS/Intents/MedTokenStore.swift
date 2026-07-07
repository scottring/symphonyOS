import Foundation

// Durable per-user token for the log-medication edge function.
//
// Stored in UserDefaults (NOT Keychain) to match this app's auth-storage choice:
// see SupabaseClient.swift — Keychain silently fails on unsigned builds, so the
// whole app deliberately uses UserDefaults. The token is fetched lazily from the
// `ensure_med_log_token` RPC on first use (the RPC mints one if absent), so no
// login-flow wiring is required — as long as a Supabase session exists, the
// intent can obtain the token on demand.
enum MedTokenStore {
    private static let key = "med_log_token"

    static func cached() -> String? {
        UserDefaults.standard.string(forKey: key)
    }

    static func save(_ token: String) {
        UserDefaults.standard.set(token, forKey: key)
    }

    /// Return the cached token, or fetch + persist it from the server.
    /// Throws if there is no valid session (the RPC requires an authenticated user).
    static func ensureToken() async throws -> String {
        if let t = cached(), !t.isEmpty { return t }
        // ensure_med_log_token() returns a bare text scalar (JSON string).
        let token: String = try await supabase.rpc("ensure_med_log_token").execute().value
        save(token)
        return token
    }
}
