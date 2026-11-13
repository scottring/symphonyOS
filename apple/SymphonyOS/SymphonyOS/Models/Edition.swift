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

    /// As `resolve(_:)`, but an empty list (the store mid-resync, before the
    /// household has loaded) keeps the last edition seen from a real list.
    static func resolve(_ householdEditions: [String?], lastKnown: Edition?) -> Edition {
        householdEditions.isEmpty ? (lastKnown ?? .light) : resolve(householdEditions)
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

/// Remembers, per signed-in user, the last edition resolved from a non-empty
/// household list, so an empty store during a resync never flips a full
/// household to light.
struct EditionMemory {
    var defaults: UserDefaults = .standard

    private func key(_ userId: UUID) -> String { "edition.lastKnown.\(userId.uuidString.lowercased())" }

    func lastKnown(for userId: UUID?) -> Edition? {
        guard let userId, let raw = defaults.string(forKey: key(userId)) else { return nil }
        return Edition(rawValue: raw)
    }

    func remember(_ edition: Edition, for userId: UUID?) {
        guard let userId else { return }
        defaults.set(edition.rawValue, forKey: key(userId))
    }
}
