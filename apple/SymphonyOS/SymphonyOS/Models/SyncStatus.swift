import Foundation

/// Tracks sync state for offline-first operations
enum SyncStatus: String, Codable {
    case synced     // In sync with Supabase
    case pending    // Created/modified locally, not yet pushed
    case pushing    // Currently being pushed to Supabase
    case conflict   // Conflict detected, needs resolution
    case deleted    // Marked for deletion, not yet pushed
}
