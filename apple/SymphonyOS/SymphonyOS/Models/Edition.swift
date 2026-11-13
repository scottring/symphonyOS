import Foundation

/// Things the full edition has and the light edition does not.
enum Feature: CaseIterable {
    case routines, projects, lists, contacts, dinner, spaces, people,
         paperCapture, photoCapture, googleCalendar, placeSearch
}

/// Which edition of Symphony a household is on (`households.edition`).
enum Edition: String {
    case light, full

    /// An empty list is light (a brand-new account); a list of only "light" is
    /// light. Anything else (nil, "full", an unknown value, a mix) is full, so
    /// an install whose household row has not re-synced stays full.
    static func resolve(_ householdEditions: [String?]) -> Edition {
        householdEditions.allSatisfy { $0 == "light" } ? .light : .full
    }

    func allows(_ feature: Feature) -> Bool {
        self == .full
    }

    /// The life area light assumes instead of asking: personal.
    var assumedLifeArea: String? {
        self == .light ? "personal" : nil
    }
}

extension AppTab {
    static func visible(in edition: Edition) -> [AppTab] {
        edition == .light ? [.planner, .inbox, .more] : [.planner, .inbox, .routines, .more]
    }
}
