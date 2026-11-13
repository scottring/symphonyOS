import Foundation

/// Every word the walk shows or speaks, and which compass points the orb offers
/// on each step. Nothing else in the walk writes a string.
enum WalkCopy {
    static let shortLength = 40
    static let wordmark = "Symphony"
    static let welcomeTitle = "Let’s start up high and walk down to today."
    static let welcomeSub = "Plant a flag for what matters, then follow it down."

    // MARK: Questions

    static func eyebrow(_ s: WalkState, _ p: WalkPeriods) -> String {
        if s.step == 0 { return wordmark }
        guard let level = s.level else { return "" }
        switch level {
        case .year:
            return s.depth == .full && !s.ground ? "The year ahead · area by area" : "The year ahead"
        case .season:
            if p.seasonIsCurrent {
                return "This season · to \(format(p.season.lastDay, "MMM d"))"
            }
            return "\(p.season.name) · \(format(p.season.start, "MMM d")) to \(format(p.season.lastDay, "MMM d"))"
        case .month: return p.monthName
        case .week: return "This week · to \(format(p.weekLastDay, "EEE d"))"
        case .today: return format(p.today, "EEEE, d MMMM")
        }
    }

    static func question(_ s: WalkState, _ p: WalkPeriods) -> String {
        if s.step == 0 { return welcomeTitle }
        guard let level = s.level else { return "" }
        if level == .year, s.ground { return "First, your ground. Which parts of life matter most this year?" }
        let parent = focusedParent(s, level)
        switch level {
        case .year:
            if let area = s.area(s.focusArea) { return "What about \(phrase(for: area.name)), this year?" }
            return "What would make the year ahead a good one?"
        case .season:
            if let t = parent { return "For “\(short(t.title))”, what’s this \(p.seasonWord)’s piece?" }
            return "And this \(p.seasonWord)? What’s it about?"
        case .month:
            if let t = parent { return "For “\(short(t.title))”, what’s \(p.monthName)’s piece?" }
            return p.monthIsCurrent ? "What’s one thing for the rest of \(p.monthName)?" : "What’s one thing for \(p.monthName)?"
        case .week:
            if let t = parent { return "For “\(short(t.title))”, what happens this week?" }
            return "What would move that forward this week?"
        case .today:
            if let t = parent { return "Start the day with “\(short(t.title))”?" }
            return "What’s the first thing you’ll do today?"
        }
    }

    static func why(_ s: WalkState, _ p: WalkPeriods) -> String {
        if s.step == 0 { return welcomeSub }
        guard let level = s.level else { return "" }
        if level == .year, s.ground { return "Tap the peaks to keep them. Hold the light to name your own." }
        var line: String
        switch level {
        case .year: return "Something that would feel true twelve months from now. Big or small."
        case .season: line = "A season is a few months. What is this stretch really for?"
        case .month: line = "Small enough to finish by the \(WalkPeriods.ordinal(p.monthLastDay))."
        case .week: line = "Say the day for each: “the deposit, today.”"
        case .today: line = "Just one. The rest of today can wait its turn."
        }
        if let above = WalkLevel(rawValue: level.rawValue - 1),
           !s.items(on: above).isEmpty, s.focus[level] == nil {
            line += " Tap one of your flags to focus on it."
        }
        return line
    }

    static func hint(_ s: WalkState) -> String {
        if let note = s.note { return note }
        if s.typing != nil { return "" }
        switch s.orb {
        case .holding(let hover): return hover == nil ? "" : "Let go to choose"
        case .open: return "Tap a point, or tap the light to close"
        case .speaking: return "Let go to plant it"
        case .idle: break
        }
        if s.step == 0 { return "Hold the light to begin" }
        if s.ground { return "Tap the peaks that matter" }
        guard let level = s.level else { return "" }
        if level == .today {
            if let focused = s.focus[.today], focused != s.firstThing {
                return "Slide down to start there · hold to say something else"
            }
            if s.firstThing != nil { return "That’s your first thing · slide down to walk on" }
        } else if !s.items(on: level).isEmpty {
            return "Hold to plant another · slide down to walk on"
        }
        return "Hold the light and speak · slide to its edge for more"
    }

    // MARK: The compass

    struct Point: Equatable { let at: CompassPoint; let label: String; let action: WalkAction; let symbol: String }

    static func points(_ s: WalkState) -> [Point] {
        var out: [Point] = []
        if s.step == 0 {
            return [
                Point(at: .s, label: "Quick start", action: .quick, symbol: "figure.walk"),
                Point(at: .e, label: "Plan my whole year", action: .full, symbol: "mountain.2"),
                Point(at: .n, label: "Not now", action: .notNow, symbol: "xmark"),
            ].sorted { order($0.at) < order($1.at) }
        }
        guard let level = s.level else { return [] }
        if s.ground {
            out = [
                Point(at: .n, label: "Start", action: .back, symbol: "arrow.up"),
                Point(at: .s, label: s.kept.isEmpty ? "Skip" : "Plant goals", action: .next, symbol: "arrow.down"),
                Point(at: .w, label: "Name your own", action: .type, symbol: "keyboard"),
            ]
        } else {
            out.append(Point(at: .n, label: level == .year ? "Start" : "Back up", action: .back, symbol: "arrow.up"))
            out.append(Point(at: .ne, label: "Nudge me", action: .nudge, symbol: "sparkle"))
            if level == .today {
                if s.calendarOffer {
                    out.append(Point(at: .e, label: "Calendar", action: .calendar, symbol: "calendar"))
                }
            } else {
                out.append(Point(at: .e, label: s.examplesOn.contains(s.step) ? "Hide examples" : "Examples",
                                 action: .examples, symbol: "flag"))
            }
            if level == .today, let focused = s.focus[.today], focused != s.firstThing {
                out.append(Point(at: .s, label: "Start there", action: .startThere, symbol: "arrow.down"))
            } else {
                let planted = level == .today ? s.firstThing != nil : !s.items(on: level).isEmpty
                out.append(Point(at: .s, label: planted ? "Walk on" : "Skip", action: .next, symbol: "arrow.down"))
            }
            out.append(Point(at: .w, label: "Type it", action: .type, symbol: "keyboard"))
        }
        if !s.undo.isEmpty {
            out.append(Point(at: .nw, label: "Undo", action: .undo, symbol: "arrow.uturn.backward"))
        }
        return out.sorted { order($0.at) < order($1.at) }
    }

    private static func order(_ p: CompassPoint) -> Int { CompassPoint.allCases.firstIndex(of: p) ?? 0 }

    // MARK: Phrases, examples, short titles

    static func phrase(for areaName: String) -> String {
        switch areaName.lowercased() {
        case "health": return "your health"
        case "home": return "home"
        case "people": return "the people in your life"
        case "work": return "work"
        case "money": return "money"
        case "fun": return "fun"
        default: return areaName.lowercased()
        }
    }

    static func examples(_ level: WalkLevel) -> [String] {
        switch level {
        case .year: return ["Run a 5K", "Read a book a month", "Pay off the car"]
        case .season: return ["Clear out the garage", "Get outside every weekend"]
        case .month: return ["Book the plumber", "Two early nights a week"]
        case .week: return ["Call the tile shop", "Gym on Tuesday"]
        case .today: return []
        }
    }

    static func short(_ title: String) -> String {
        title.count <= shortLength ? title : String(title.prefix(shortLength - 1)) + "…"
    }

    // MARK: Notes

    static func placed(_ areaName: String) -> String {
        "That sounded like \(phrase(for: areaName)), so it went on the \(areaName) peak."
    }
    static let nothingToPlant = "Nothing to plant yet. Hold and speak, or slide left to type."
    static let speechOff = "Speaking isn’t available here, so type it."
    static let ridgeFull = "The ridge is full. Tap a peak to let one go first."
    static let calendarLine = "See your calendar on Today too"

    // MARK: Hint row and banners

    static let undo = "Undo"; static let moveTo = "Move to"; static let pullUp = "Pull it up"
    static let typePlaceholder = "Type it, then return"; static let firstThingTag = "FIRST THING"

    // MARK: The ending

    static let lookBack = "Look back up: that’s your plan."; static let heresToday = "Here’s today."
    static let showMyDay = "Show my day"; static let lookBackHandle = "Look back up at your plan"
    static let todayEyebrow = "Today"; static let walkAnother = "Walk another one down"; static let goToToday = "Go to Today"
    static let thatsTheDay = "That’s the day."; static let nothingToday = "Nothing planted for today yet."
    static func nextFlag(_ name: String) -> String { "Next flag: \(name)" }
    static func forGoal(_ name: String) -> String { "for \(name)" }
    static func nextEvent(_ time: String) -> String { "Next · \(time)" }
    static func ringLabel(done: Int, total: Int) -> String { "\(done) of \(total) done" }

    // MARK: Settings

    static let replayButton = "Walk the mountain again"
    static let replayFooter = "Start at the top and walk down to today. Nothing you have is changed."

    // MARK: VoiceOver

    static let orbLabelWelcome = "Hold to begin"; static let orbLabel = "Hold and speak to plant a flag; tap for more"
    static let rowDone = "Done"; static let rowOpen = "Not done"

    static func levelName(_ level: WalkLevel) -> String {
        switch level {
        case .year: return "Year"
        case .season: return "Season"
        case .month: return "Month"
        case .week: return "Week"
        case .today: return "Today"
        }
    }

    enum BannerRole: Equatable { case mine, plain, focusable, focused, firstThing, example, stub(Int) }

    static func bannerLabel(_ text: String, level: WalkLevel, tag: String?, role: BannerRole) -> String {
        let head = "\(levelName(level)): \(text)"
        let withTag = tag.map { "\(head), \($0.lowercased().capitalized)" } ?? head
        switch role {
        case .mine: return "\(withTag), tap to move or pull up"
        case .plain: return withTag
        case .focusable: return "\(withTag), tap to focus"
        case .focused: return "\(withTag), focused, tap to let go"
        case .firstThing: return "Today: \(text), first thing"
        case .example: return "Example: \(text), tap to make it yours"
        case .stub(let n): return "\(n) more, tap to show"
        }
    }

    static func areaHint(ground: Bool, kept: Bool, focused: Bool) -> String {
        if ground { return kept ? "Tap to let go" : "Tap to keep" }
        return focused ? "Tap to step back" : "Tap to look closer"
    }

    static func rowLabel(_ title: String, forGoal: String?) -> String {
        forGoal.map { "\(title), for \($0)" } ?? title
    }

    // MARK: Helpers

    /// The parent flag (or, on Year, nothing) the step is focused on.
    private static func focusedParent(_ s: WalkState, _ level: WalkLevel) -> WalkItem? {
        level == .year ? nil : s.item(s.focus[level])
    }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.calendar = PlanCalendar.calendar
        f.timeZone = PlanCalendar.calendar.timeZone
        f.dateFormat = pattern
        return f.string(from: date)
    }
}
