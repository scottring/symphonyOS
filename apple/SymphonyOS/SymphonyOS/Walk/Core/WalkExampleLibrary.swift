import Foundation

/// One kind of goal inside a built-in area ("running" in Health): the words that find it in what a
/// person said, and four lines for each of Year, Season, Month and Week. Within a theme every line
/// makes sense under any of the theme's lines one level up.
struct WalkTheme: Equatable {
    let name: String
    /// Lowercased. One word, or a phrase of words; a trailing `*` matches any ending of one word.
    let triggers: [String]
    let lines: [WalkLevel: [String]]
    /// Offered only when the person's own words find it (weight, a partner, a debt): never unasked.
    var quiet = false
}

/// The examples the walk can offer, all on the phone: a few hundred lines per built-in area, grouped
/// into themes (`Walk/Core/Examples`). The walk finds the theme from the person's own goal above and
/// offers that theme's lines for the step; with no goal above, or none that finds a theme, it offers
/// the area's general examples (`WalkCopy.examples`) and then one line from each theme in turn
/// (never from a `quiet` theme).
enum WalkExampleLibrary {
    /// How many examples show at once: as many as the general lists hold (three on Year, two below).
    static func pageSize(_ level: WalkLevel) -> Int { level == .year ? 3 : 2 }

    /// The built-in area a name stands for: its own name, or one of a few plain other names for it
    /// ("Family" is People). Nil for any other area of the person's own.
    static func area(_ name: String?) -> String? {
        guard let key = name?.lowercased().trimmingCharacters(in: .whitespaces) else { return nil }
        if texts[key] != nil { return key }
        return otherNames[key]
    }

    private static let otherNames: [String: String] = [
        "fitness": "health", "wellness": "health", "body": "health", "my health": "health",
        "house": "home", "household": "home", "our home": "home", "my home": "home",
        "family": "people", "friends": "people", "family and friends": "people", "relationships": "people",
        "career": "work", "job": "work", "my work": "work", "business": "work", "my business": "work",
        "finances": "money", "finance": "money", "my money": "money",
        "hobbies": "fun", "play": "fun", "leisure": "fun", "fun and play": "fun",
    ]

    static func themes(area name: String?) -> [WalkTheme] {
        guard let key = area(name) else { return [] }
        return parsed[key] ?? []
    }

    /// Every example for a step, best first: the matched theme's lines, or the general examples and
    /// then the themes' lines in turn (each theme's first, then each theme's second, and so on).
    /// `above` is the goal above and the goals above it, nearest first. Under a goal that is itself
    /// one of the area's general examples, the general examples still come first, before its theme's:
    /// they were written as one line down the levels, so tapping the first at every step holds together.
    static func pool(_ level: WalkLevel, area name: String?, above: [String]) -> [String] {
        guard let key = area(name), level != .today else { return [] }
        let all = parsed[key] ?? []
        var out = WalkCopy.examples(level, area: key)
        var seen = Set(out.map { $0.lowercased() })
        if let theme = theme(for: above, among: all, under: level) {
            let lines = theme.lines[level] ?? []
            let general = Set(WalkLevel.allCases.flatMap { WalkCopy.examples($0, area: key) }.map { $0.lowercased() })
            guard let nearest = above.first, general.contains(nearest.lowercased().trimmingCharacters(in: .whitespaces))
            else { return lines }
            return out + lines.filter { seen.insert($0.lowercased()).inserted }
        }
        let open = all.filter { !$0.quiet }
        let most = open.map { $0.lines[level]?.count ?? 0 }.max() ?? 0
        for i in 0..<most {
            for theme in open {
                guard let lines = theme.lines[level], i < lines.count, seen.insert(lines[i].lowercased()).inserted else { continue }
                out.append(lines[i])
            }
        }
        return out
    }

    /// The theme the goals above belong to: the nearest goal that is one of a theme's own lines, or
    /// that says one of a theme's words, decides (the theme with the most of its words in it; the
    /// earlier theme on a tie).
    static func theme(for above: [String], among themes: [WalkTheme], under level: WalkLevel) -> WalkTheme? {
        for title in above {
            let said = title.lowercased().trimmingCharacters(in: .whitespaces)
            if let own = themes.first(where: { theme in
                theme.lines.contains { $0.key != level && $0.value.contains { $0.lowercased() == said } }
            }) { return own }
            let words = self.words(title)
            let scored = themes.map { (theme: $0, hits: hits($0.triggers, in: words)) }
            if let best = scored.max(by: { $0.hits < $1.hits }), best.hits > 0 {
                return scored.first { $0.hits == best.hits }?.theme
            }
        }
        return nil
    }

    /// A title as lowercased words: letters and digits, everything else a break.
    static func words(_ title: String) -> [String] {
        title.lowercased().split { !($0.isLetter || $0.isNumber) }.map(String.init)
    }

    private static func hits(_ triggers: [String], in words: [String]) -> Int {
        let joined = " " + words.joined(separator: " ") + " "
        return triggers.reduce(0) { count, trigger in
            if trigger.hasSuffix("*") {
                let stem = String(trigger.dropLast())
                return count + (!stem.isEmpty && words.contains { $0.hasPrefix(stem) } ? 1 : 0)
            }
            return count + (joined.contains(" " + trigger + " ") ? 1 : 0)
        }
    }

    // MARK: The text

    /// One area's themes from its text: `## name | word, word` (`~name` for a quiet theme) then lines
    /// starting `Y `, `S `, `M `, `W `.
    static func parse(_ text: String) -> [WalkTheme] {
        var out: [WalkTheme] = []
        var name: String?, triggers: [String] = [], lines: [WalkLevel: [String]] = [:]
        func close() {
            if let name, !lines.isEmpty {
                let quiet = name.hasPrefix("~")
                out.append(WalkTheme(name: quiet ? String(name.dropFirst()) : name, triggers: triggers, lines: lines, quiet: quiet))
            }
            name = nil; triggers = []; lines = [:]
        }
        for raw in text.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("##") {
                close()
                let parts = line.dropFirst(2).split(separator: "|", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
                name = parts.first ?? ""
                triggers = parts.count > 1 ? parts[1].split(separator: ",").compactMap { raw in
                    let core = words(String(raw)).joined(separator: " ")       // `words` drops the star
                    return core.isEmpty ? nil : core + (raw.contains("*") ? "*" : "")
                } : []
                continue
            }
            guard name != nil, line.count > 2, line.dropFirst().first == " ",
                  let level = levels[line.first ?? " "] else { continue }
            lines[level, default: []].append(String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces))
        }
        close()
        return out
    }

    private static let levels: [Character: WalkLevel] = ["Y": .year, "S": .season, "M": .month, "W": .week]

    static let texts: [String: String] = [
        "health": health, "home": home, "people": people, "work": work, "money": money, "fun": fun,
    ]

    /// Read once, the first time an example is asked for.
    private static let parsed: [String: [WalkTheme]] = texts.mapValues(parse)
}
