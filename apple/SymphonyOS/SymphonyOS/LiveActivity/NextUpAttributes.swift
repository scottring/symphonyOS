// Shared by the app (which starts and updates it) and the widget extension
// (which draws it). The Lock Screen's "next up" (Scott, 2026-11-11, the Duo
// boards): what's next, when, and how long until — a glance without opening
// the phone.
#if os(iOS)
import ActivityKit
import Foundation

struct NextUpAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// "Lunch with Mom"
        var title: String
        var start: Date
        var end: Date?
        /// "Mom's place", or nil.
        var location: String?
        /// "Then 5:15 Pick up from FFG", or nil.
        var then: String?
    }
}
#endif
