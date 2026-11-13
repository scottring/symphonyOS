import Foundation

/// Decides, from the words alone and on the device, which kept area a goal
/// clearly belongs to. It only ever picks among areas the person kept: it
/// never suggests, adds or renames one.
enum WalkClassifier {
    static let defaults = ["Health", "Home", "People", "Work", "Money", "Fun"]

    static let keywords: [String: Set<String>] = [
        "Health": ["health", "healthy", "fit", "fitness", "strong", "stronger", "strength", "run", "running",
                   "5k", "marathon", "gym", "lift", "workout", "exercise", "yoga", "swim", "sleep", "weight",
                   "doctor", "dentist", "physio", "meditate", "sober", "steps"],
        "Home": ["home", "house", "bathroom", "kitchen", "bedroom", "garage", "garden", "yard", "roof",
                 "renovate", "renovation", "repair", "declutter", "clean", "tidy", "furniture", "plumber",
                 "tile", "basement", "attic", "fence", "deck"],
        "People": ["people", "family", "friend", "friends", "kids", "children", "son", "daughter", "mom",
                   "mum", "dad", "parents", "wife", "husband", "partner", "marriage", "together",
                   "neighbour", "neighbor", "brother", "sister", "grandma", "grandpa"],
        "Work": ["work", "job", "career", "boss", "promotion", "client", "clients", "business", "launch",
                 "ship", "team", "office", "resume", "interview", "hire", "meeting", "deadline",
                 "portfolio", "colleague", "startup"],
        "Money": ["money", "save", "saving", "savings", "budget", "debt", "pay", "loan", "mortgage",
                  "invest", "retirement", "income", "tax", "taxes", "bills", "spend", "spending", "fund",
                  "afford"],
        "Fun": ["fun", "play", "travel", "trip", "holiday", "vacation", "hobby", "read", "book", "books",
                "music", "guitar", "piano", "game", "games", "hike", "camp", "camping", "ski", "movie",
                "concert", "dance", "adventure"],
    ]

    /// Little words that never count when they appear in a custom area's own name.
    static let nameStopWords: Set<String> = ["the", "and", "with", "for", "our", "my", "of", "to", "a", "an", "in", "on", "at"]

    /// Distinct whole words in `text` that belong to the area: its list (when it
    /// is one of the defaults) or the words of its own name (three letters or more).
    static func score(_ text: String, areaName: String) -> Int {
        let own = Set(tokens(areaName).filter { $0.count >= 3 && !nameStopWords.contains($0) })
        let listed = defaults.first { $0.caseInsensitiveCompare(areaName.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame }
            .flatMap { keywords[$0] } ?? []
        let words = own.union(listed)
        return Set(tokens(text)).intersection(words).count
    }

    enum Placement: Equatable { case area(UUID, moved: Bool), unlabeled }

    static func place(_ text: String, kept: [WalkArea], focus: UUID?) -> Placement {
        let focus = focus.flatMap { f in kept.contains(where: { $0.id == f }) ? f : nil }
        let scored = kept.map { ($0, score(text, areaName: $0.name)) }
        if let best = scored.max(by: { $0.1 < $1.1 }), best.1 >= 1,
           scored.filter({ $0.1 == best.1 }).count == 1 {
            return .area(best.0.id, moved: focus != nil && focus != best.0.id)
        }
        if let focus { return .area(focus, moved: false) }
        return .unlabeled
    }

    /// Lowercased, accents and apostrophes folded away ("Mom’s" reads as "mom"),
    /// split on anything that is not a letter or digit.
    private static func tokens(_ text: String) -> [String] {
        var s = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US"))
            .lowercased()
        s = s.replacingOccurrences(of: "['’‘]s\\b", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "['’‘]", with: "", options: .regularExpression)
        return s.split(whereSeparator: { !($0.isLetter || $0.isNumber) }).map(String.init)
    }
}
