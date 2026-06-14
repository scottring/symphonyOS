import Foundation
import Supabase
import Auth

// MARK: - Supabase Configuration

enum SupabaseConfig {
    static let url = URL(string: "https://mwadppyrqzuzgstmwpuy.supabase.co")!

    // The anon key is safe to embed in client apps — RLS protects data
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13YWRwcHlycXp1emdzdG13cHV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzU0MjcsImV4cCI6MjA4MDExMTQyN30._bWsOu6D-UAMKsxEMzN7PhMM4ENIXr2uZWdVLcoILk4"
}

// MARK: - Auth session storage
//
// supabase-swift defaults to Keychain for the session. Keychain requires a valid
// `application-identifier` entitlement, which an UNSIGNED build (CI / `xcodebuild
// CODE_SIGNING_ALLOWED=NO` / some simulator installs) does not have — so the session
// silently fails to persist, every request falls back to the anon role, and RLS
// returns zero rows (the app looks empty + logs out on relaunch). UserDefaults works
// in every signing configuration, so the session reliably persists and carries the
// user's JWT on requests.
//
// Trade-off: UserDefaults is not encrypted-at-rest like Keychain. Acceptable for a
// single-user personal app; revisit if shipping to the App Store with shared devices.
struct UserDefaultsAuthStorage: AuthLocalStorage {
    private let defaults = UserDefaults.standard

    func store(key: String, value: Data) throws {
        defaults.set(value, forKey: key)
    }

    func retrieve(key: String) throws -> Data? {
        defaults.data(forKey: key)
    }

    func remove(key: String) throws {
        defaults.removeObject(forKey: key)
    }
}

// MARK: - Shared Client

let supabase = SupabaseClient(
    supabaseURL: SupabaseConfig.url,
    supabaseKey: SupabaseConfig.anonKey,
    options: SupabaseClientOptions(
        auth: SupabaseClientOptions.AuthOptions(
            storage: UserDefaultsAuthStorage()
        )
    )
)
