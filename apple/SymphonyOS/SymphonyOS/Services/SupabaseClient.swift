import Foundation
import Supabase

// MARK: - Supabase Configuration

enum SupabaseConfig {
    static let url = URL(string: "https://mwadppyrqzuzgstmwpuy.supabase.co")!

    // The anon key is safe to embed in client apps — RLS protects data
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13YWRwcHlycXp1emdzdG13cHV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzU0MjcsImV4cCI6MjA4MDExMTQyN30._bWsOu6D-UAMKsxEMzN7PhMM4ENIXr2uZWdVLcoILk4"
}

// MARK: - Shared Client

let supabase = SupabaseClient(
    supabaseURL: SupabaseConfig.url,
    supabaseKey: SupabaseConfig.anonKey
)
