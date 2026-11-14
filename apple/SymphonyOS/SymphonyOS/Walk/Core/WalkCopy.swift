import Foundation

/// Every word the walk shows or speaks, and which compass points the orb offers
/// on each step. Nothing else in the walk writes a string.
enum WalkCopy {
    static let shortLength = 40
    static let wordmark = "Symphony"
    static let welcomeTitle = "Let’s start up high and walk down to today."
    static let welcomeSub = "Name what matters this year, then follow it down to what you’ll do today."

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
            if let t = parent { return "What part of “\(short(t.title))” belongs to this \(p.seasonWord)?" }
            return "And this \(p.seasonWord)? What’s it about?"
        case .month:
            if let t = parent { return "What part of “\(short(t.title))” belongs to \(p.monthName)?" }
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
        if level == .year, s.ground { return groundWhy }
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
            line += focusAbove
        }
        return line
    }

    /// The line at the foot of the stage: the two things a person can do, said plainly
    /// (hold the light to speak, tap it for other choices), or what to do now.
    static func hint(_ s: WalkState) -> String {
        if s.step == 0 { return hintChoose }                // Welcome: the choices are always open
        if s.orb == .open { return hintOpen }
        if case .holding = s.orb { return "" }              // a press on its way to speaking, or a slide
        if case .finishing = s.orb { return "" }            // waiting for the last words after letting go
        if let note = s.note { return note }
        if s.typing != nil { return "" }                    // the field carries its own placeholder
        if case .speaking = s.orb { return hintSpeaking }
        if s.ground { return hintGround }
        guard let level = s.level else { return "" }
        if level == .today {
            if let focused = s.focus[.today], focused != s.firstThing { return hintStartHere }
            if s.firstThing != nil { return hintFirstThing }
        } else if !s.items(on: level).isEmpty {
            return s.speechIsOff ? hintSpeechOff : hintAnother
        }
        return s.speechIsOff ? hintSpeechOff : hintFirst
    }

    static let hintChoose = "Choose how to start"
    static let hintOpen = "Tap one, or tap the light to close"
    static let hintFirst = "Hold the light and say it. Tap the light for other choices."
    static let hintAnother = "Hold to add another. Tap Next when you’re done."
    static let hintGround = "Tap the ones that matter, then tap Next."
    static let hintStartHere = "Tap Next to start with this one, or hold and say something else."
    static let hintFirstThing = "That’s your first thing. Tap Finish."
    static let hintSpeaking = "Let go when you’ve said it"
    /// Speech is off for this walk: a tap types, a hold opens the other choices.
    static let hintSpeechOff = "Tap the light to type it. Hold it for other choices."

    /// The line under the light that moves the walk on: the south point's words and action,
    /// shown whenever the light is at rest and nothing is being typed. `skip` when nothing has
    /// been added on this step yet (drawn quieter).
    struct NextLine: Equatable { let text: String; let action: WalkAction; let skip: Bool }

    static func nextLine(_ s: WalkState, _ p: WalkPeriods) -> NextLine? {
        guard s.showsNextLine, let ahead = forward(s, p) else { return nil }
        return NextLine(text: ahead.label, action: ahead.action, skip: ahead.label == skipStep)
    }

    static let skipStep = "Skip this step"; static let finish = "Finish"; static let startWithThis = "Start with this one"
    static func next(_ place: String) -> String { "Next: \(place)" }

    /// Where moving on goes, in words, and the action that does it (the south point).
    private static func forward(_ s: WalkState, _ p: WalkPeriods) -> (label: String, action: WalkAction)? {
        guard let level = s.level else { return nil }
        if s.ground { return (s.kept.isEmpty ? skipStep : next("your goals"), .next) }
        if level == .today, let focused = s.focus[.today], focused != s.firstThing { return (startWithThis, .startThere) }
        let added = level == .today ? s.firstThing != nil : !s.items(on: level).isEmpty
        guard added else { return (skipStep, .next) }
        // A whole-year walk goes area by area on Year, and goal by goal on Season, before it moves down.
        if let stop = s.tour.first {
            if level == .year, let area = s.area(stop) { return (next(area.name), .next) }
            if s.item(stop) != nil { return (next("your next goal"), .next) }
        }
        switch level {
        case .year: return (next("this \(p.seasonWord)"), .next)
        case .season: return (next(p.monthName), .next)
        case .month: return (next("this week"), .next)
        case .week: return (next("today"), .next)
        case .today: return (finish, .next)
        }
    }

    /// Where backing up goes, in words (the north point).
    private static func back(_ s: WalkState, _ p: WalkPeriods) -> String {
        if s.ground { return "Back to the start" }
        switch s.level {
        case .year?: return "Back to your areas"
        case .season?: return "Back to the year"
        case .month?: return "Back to this \(p.seasonWord)"
        case .week?: return "Back to \(p.monthName)"
        case .today?: return "Back to this week"
        case nil: return ""
        }
    }

    // MARK: The compass

    /// One compass point. `detail` is a second line under the label (Welcome's choices, Leave for now).
    struct Point: Equatable {
        let at: CompassPoint; let label: String; let action: WalkAction; let symbol: String; let detail: String?
        init(at: CompassPoint, label: String, action: WalkAction, symbol: String, detail: String? = nil) {
            self.at = at; self.label = label; self.action = action; self.symbol = symbol; self.detail = detail
        }
    }

    static let quickStart = "Quick start", quickDetail = "One goal, down to today. About 3 minutes."
    static let wholeYear = "Plan my whole year", wholeDetail = "Every part of life. About 25 minutes."
    static let notNow = "Not now", notNowDetail = "Go straight to Today."
    static let leaveForNow = "Leave for now", leaveDetail = "Your place is kept."

    /// Each point names what it does or where it goes. Welcome's three sit left, right and
    /// above the light, with room under each for its second line.
    static func points(_ s: WalkState, _ p: WalkPeriods) -> [Point] {
        var out: [Point] = []
        if s.step == 0 {
            return [
                Point(at: .w, label: quickStart, action: .quick, symbol: "figure.walk", detail: quickDetail),
                Point(at: .e, label: wholeYear, action: .full, symbol: "mountain.2", detail: wholeDetail),
                Point(at: .n, label: notNow, action: .notNow, symbol: "xmark", detail: notNowDetail),
            ].sorted { order($0.at) < order($1.at) }
        }
        guard let level = s.level, let ahead = forward(s, p) else { return [] }
        out.append(Point(at: .n, label: back(s, p), action: .back, symbol: "arrow.up"))
        out.append(Point(at: .s, label: ahead.label, action: ahead.action, symbol: "arrow.down"))
        if s.ground {
            out.append(Point(at: .w, label: "Type your own", action: .type, symbol: "keyboard"))
        } else {
            out.append(Point(at: .ne, label: level == .year ? "Ask about another area" : "Ask about another goal",
                             action: .nudge, symbol: "arrow.triangle.2.circlepath"))
            if level == .today {
                if s.calendarOffer {
                    out.append(Point(at: .e, label: "Show my calendar on Today", action: .calendar, symbol: "calendar"))
                }
            } else {
                out.append(Point(at: .e, label: s.examplesOn.contains(s.step) ? "Hide examples" : "Show examples",
                                 action: .examples, symbol: "flag"))
            }
            out.append(Point(at: .w, label: "Type it", action: .type, symbol: "keyboard"))
        }
        if !s.undo.isEmpty {
            out.append(Point(at: .nw, label: undo, action: .undo, symbol: "arrow.uturn.backward"))
        }
        out.append(Point(at: .se, label: leaveForNow, action: .leave, symbol: "pause", detail: leaveDetail))
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
        "That sounded like \(phrase(for: areaName)), so it went under \(areaName)."
    }
    static let nothingToPlant = "Nothing added yet. Hold the light and say it, or tap it and choose Type it."
    static let speechOff = "Speaking isn’t available here, so type it."
    /// A second hold in a row that heard nothing.
    static let nothingHeard = "Nothing came through. Type it here."
    /// The permission prompts took the touch and speech was allowed.
    static let speakNow = "Now hold the light and speak."
    static let ridgeFull = "That’s as many as fit. Tap one to let it go first."
    static let calendarLine = "See your calendar on Today too"

    // MARK: Hint row and banners

    static let undo = "Undo"; static let moveTo = "Move to"; static let pullUp = "Remove"
    static let typePlaceholder = "Type it, then return"; static let firstThingTag = "FIRST THING"
    /// How many more flags a banner on Look back up stands for: "+2 more".
    static func more(_ count: Int) -> String { "+\(count) more" }
    /// What a folded stub says: the 26-point pennant has room for the count only ("+2").
    static func stubCount(_ count: Int) -> String { "+\(count)" }
    /// An example flag's tag, and the shorter one where the flag is too narrow for it.
    static let exampleTag = "EXAMPLE · TAP TO USE", exampleTagShort = "TAP TO USE"
    /// The banner width the long tag needs (8.5 pt, by estimate, inside the cloth's padding).
    static let exampleTagRoom: CGFloat = 116
    static func exampleTag(forWidth width: CGFloat) -> String { width >= exampleTagRoom ? exampleTag : exampleTagShort }
    /// The ground's own words while speaking and in the why line.
    static let groundWhy = "Tap the ones that matter to you. To add your own, hold the light and say it."
    /// Added to a step's why line while a parent one level up may still be chosen.
    static let focusAbove = " Tap one above to focus on it."

    // MARK: The ending

    static let lookBack = "Look back up: that’s your plan."; static let heresToday = "Here’s today."
    static let showMyDay = "Show my day"; static let lookBackHandle = "See my whole plan"
    static let todayEyebrow = "Today"; static let walkAnother = "Plan another goal down to today"; static let goToToday = "Go to Today"
    static let thatsTheDay = "That’s the day."; static let nothingToday = "Nothing planted for today yet."
    static func nextFlag(_ name: String) -> String { "Next: \(name)" }
    static func forGoal(_ name: String) -> String { "for \(name)" }
    static func nextEvent(_ time: String) -> String { "Next · \(time)" }
    static func ringLabel(done: Int, total: Int) -> String { "\(done) of \(total) done" }
    /// What the ring shows: "1/3".
    static func ring(done: Int, total: Int) -> String { "\(done)/\(total)" }
    /// The sheet's date under "Today": "Friday, 13 November", as the Today step's eyebrow reads it.
    static func endingDate(_ p: WalkPeriods) -> String { format(p.today, "EEEE, d MMMM") }
    /// A next event's time for `nextEvent`: "2:30 pm", in the walk's own calendar and time zone.
    static func nextEventTime(_ start: Date) -> String { format(start, "h:mm a").lowercased() }

    // MARK: Settings

    static let replayButton = "Walk the mountain again"
    static let replayFooter = "Start at the top and walk down to today. What you already planned stays. To stop part-way, tap the light and choose Leave for now."
    /// Shown above `replayButton` while a walk left with Leave for now is waiting.
    static let resumeButton = "Pick the walk back up"
    /// The one quiet line on the light edition's Today while a walk is waiting.
    static let walkWaiting = "Your walk is waiting. Pick it back up."

    // MARK: VoiceOver

    /// What VoiceOver says as a flag's words are let go, between two states one change
    /// apart; nil when nothing is to be said. Once per flag: on letting go with words
    /// (`finishing`), when the first words arrive after letting go with none, or, when the
    /// session had already ended and the person then let go, as the flag is planted
    /// (straight from `speaking`, a flag or peak added). Never the partial words.
    static func announcement(from old: WalkState, to new: WalkState) -> String? {
        func said(_ words: String) -> Bool { !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if case .finishing(let words) = new.orb, said(words) {
            if case .finishing(let before) = old.orb, said(before) { return nil }     // already said
            return words
        }
        if case .speaking(let words) = old.orb, said(words), new.orb == .idle,
           new.items.count > old.items.count || new.kept.count > old.kept.count {
            return words
        }
        return nil
    }

    static let orbLabelWelcome = "Choose how to start"; static let orbLabel = "Hold and speak to add a goal. Double tap for other choices."
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

    enum BannerRole: Equatable {
        case mine, plain, focusable, focused, firstThing, firstThingMine, example, stub(Int)
        /// Today's first thing, not planted by this walk, on the Today step: a tap focuses it.
        case firstThingFocusable, firstThingFocused
        /// A tap does something: the label says what. A plain flag, or someone else's first thing, is only read.
        var taps: Bool {
            switch self {
            case .plain, .firstThing: return false
            case .mine, .focusable, .focused, .firstThingMine, .firstThingFocusable, .firstThingFocused, .example, .stub:
                return true
            }
        }
    }

    static func bannerLabel(_ text: String, level: WalkLevel, tag: String?, role: BannerRole) -> String {
        let head = "\(levelName(level)): \(text)"
        let withTag = tag.map { "\(head), \($0.lowercased().capitalized)" } ?? head
        switch role {
        case .mine: return "\(withTag), tap to move or remove"
        case .plain: return withTag
        case .focusable: return "\(withTag), tap to focus"
        case .focused: return "\(withTag), focused, tap to let go"
        case .firstThing: return "Today: \(text), first thing"
        case .firstThingMine: return "Today: \(text), first thing, tap to remove"   // planted by the walk
        case .firstThingFocusable: return "Today: \(text), first thing, tap to focus"
        case .firstThingFocused: return "Today: \(text), first thing, focused, tap to let go"
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

    /// The light's label: `orbLabelWelcome` on Welcome, `orbLabel` on every other step.
    static func orbAccessibilityLabel(_ s: WalkState) -> String {
        s.step == 0 ? orbLabelWelcome : orbLabel
    }

    /// The one-line field's label, read once it holds words (the placeholder says how to use it).
    static let typeFieldLabel = "Your words"

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
