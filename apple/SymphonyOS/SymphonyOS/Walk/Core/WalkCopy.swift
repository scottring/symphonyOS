import Foundation

/// Every word the walk shows or speaks, and which compass points the orb offers
/// on each step. Nothing else in the walk writes a string.
enum WalkCopy {
    /// The longest title the question quotes whole (S33).
    static let shortLength = 56
    static let wordmark = "Symphony"
    static let welcomeTitle = "Let’s start up high and walk down to today."
    static let welcomeSub = "Name what matters this year, then follow it down to what you’ll do today."

    // MARK: Questions

    static func eyebrow(_ s: WalkState, _ p: WalkPeriods) -> String {
        if s.step == 0 { return wordmark }
        guard let level = s.level else { return "" }
        switch level {
        case .year:
            return "The year ahead"
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

    /// Beside the eyebrow on the whole-year walk's Year step (F1): which kept area the walk
    /// stands in, of how many: "1 of 3". Nil anywhere else, and with one area or none.
    static func eyebrowCount(_ s: WalkState) -> String? {
        guard s.step == 1, !s.ground, s.depth == .full, s.kept.count > 1,
              let index = s.standing.flatMap({ s.kept.firstIndex(of: $0) }) else { return nil }
        return "\(index + 1) of \(s.kept.count)"
    }

    static func question(_ s: WalkState, _ p: WalkPeriods) -> String {
        if s.step == 0 { return welcomeTitle }
        guard let level = s.level else { return "" }
        if level == .year, s.ground { return "First, your ground. Which parts of life matter most this year?" }
        let parent = focusedParent(s, level)
        switch level {
        case .year:
            if let area = s.area(s.standing) { return "What would make this a good year for \(phrase(for: area.name))?" }
            return "What would make the year ahead a good one?"
        case .season:
            if let t = parent { return "What part of “\(short(t.title))” belongs to this \(p.seasonWord)?" }
            return "And this \(p.seasonWord)? What’s it about?"
        case .month:
            if let t = parent { return "What part of “\(short(t.title))” belongs to \(p.monthName)?" }
            return p.monthIsCurrent ? "What’s one thing for the rest of \(p.monthName)?" : "What’s one thing for \(p.monthName)?"
        case .week:
            if let t = parent { return "For “\(short(t.title))”, what happens this week?" }
            return "What’s one thing for this week?"
        case .today:
            if let t = parent {
                // Once the goal above is the first thing, the question says the day starts with it (S35).
                if t.id == s.firstThing { return "You’ll start the day with “\(short(t.title))”." }
                return "Start the day with “\(short(t.title))”?"
            }
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
        case .week: line = "Say the day too, as in “on Friday”."
        case .today: line = "Just one. The rest of today can wait its turn."
        }
        // Exactly when the goal above takes a tap: the round it walks (on Today the nameless post's first
        // thing is in it too), not only the goals here.
        if s.nextGoalAbove() != nil { line += focusAbove }
        return line
    }

    /// The hint: one line saying what to do now (hold the light to speak, tap a choice, a note). At rest
    /// it stands above the light, while the light is busy at the foot, while typing just above the
    /// field, and on Welcome under its line (`WalkLayout.hintFrame`).
    static func hint(_ s: WalkState) -> String {
        if s.step == 0 { return hintChoose }                // Welcome: the choices are always open
        if s.teaching { return "" }                         // the light is being taught, in its own two lines
        if s.orb == .open { return hintOpen }
        if case .holding = s.orb { return "" }              // a press on its way to speaking, or a slide
        if case .finishing = s.orb { return "" }            // waiting for the last words after letting go
        if let note = s.note { return note }
        if s.typing != nil { return "" }                    // the field carries its own placeholder
        if case .speaking = s.orb { return hintSpeaking }
        if s.ground { return s.kept.isEmpty ? hintGroundNone : hintGround }
        guard let level = s.level else { return "" }
        if level == .today {
            if let focused = s.focus[.today], focused != s.firstThing { return hintStartHere }
            if s.firstThing != nil { return hintFirstThing }
        } else if s.items(on: level).contains(where: { s.column(of: $0) == s.standing }) {
            // Another only where the post stood at already holds one on this level (S36).
            return s.speechIsOff ? hintSpeechOff : hintAnother
        }
        return s.speechIsOff ? hintSpeechOff : hintFirst
    }

    /// Welcome: the light itself is the quick start.
    static let hintChoose = "Tap the light for a quick start"
    static let hintOpen = "Tap one, or tap the light to close"
    static let hintFirst = "Hold the light and speak."
    static let hintAnother = "Hold the light to add another."
    static let hintGround = "Tap the ones that matter, then Next."
    /// The ground with nothing kept yet: the Next line says "Skip this step", so the hint does not say Next.
    static let hintGroundNone = "Tap the ones that matter."
    /// Names the Next line's own words (`startWithThis`), which is what it reads here.
    static let hintStartHere = "Tap “\(startWithThis)”, or hold to speak."
    static let hintFirstThing = "Tap “\(finish)”, or hold to change it."
    static let hintSpeaking = "Let go when you’ve said it"
    /// Speech is off for this walk: a tap types, a hold opens the other choices.
    static let hintSpeechOff = "Tap the light and type."
    /// The longest a hint or note may be: every one fits on one line at 15 pt (48 by estimate).
    static let hintMaxLength = 46
    /// The top row's More, in its middle: it opens the choices on the light and closes them again.
    /// `moreLabel` is what VoiceOver calls it, with `choicesOpen` or `choicesClosed` as its value.
    static let more = "More", moreLabel = "More choices"
    static let choicesOpen = "open", choicesClosed = "closed"
    /// The eyebrow's count (`eyebrowCount`) as it follows the eyebrow: " · 1 of 3" (drawn in capitals, in gold).
    static func afterEyebrow(_ count: String) -> String { " · \(count)" }

    /// The light taught once per walk, on the first step where holding it answers (`WalkState.teaching`).
    static let teachHold = "Press and hold the light, and say it out loud."
    static let teachLetGo = "Let go when you’re done. To type, tap More."
    static let teachSpeechOff = "Tap More and choose Type it."
    /// The lines that teach the light: the 20-point line, then the 15-point line if there is one.
    static func teaching(_ s: WalkState) -> [String] { s.speechIsOff ? [teachSpeechOff] : [teachHold, teachLetGo] }

    /// Next at the foot, the line that moves the walk on: its words and action,
    /// shown whenever the light is at rest and nothing is being typed. `skip` when nothing has
    /// been added on this step yet (drawn quieter).
    struct NextLine: Equatable {
        let text: String; let action: WalkAction; let skip: Bool; let detail: String?
        init(text: String, action: WalkAction, skip: Bool, detail: String? = nil) {
            self.text = text; self.action = action; self.skip = skip; self.detail = detail
        }
    }

    /// On Welcome the line under the light is the quick start, with what it is under it.
    static func nextLine(_ s: WalkState, _ p: WalkPeriods) -> NextLine? {
        guard s.showsNextLine else { return nil }
        if s.step == 0 { return NextLine(text: quickStart, action: .quick, skip: false, detail: quickDetail) }
        guard let ahead = forward(s, p) else { return nil }
        return NextLine(text: ahead.label, action: ahead.action, skip: ahead.label == skipStep)
    }

    static let skipStep = "Skip this step"; static let finish = "Finish the walk"; static let startWithThis = "Start with this one"
    static func next(_ place: String) -> String { "Next: \(place)" }
    static let nextGoal = "Next goal"
    /// A name cut to `length` characters, the last an ellipsis, when it is longer.
    static func cut(_ name: String, _ length: Int) -> String {
        name.count <= length ? name : String(name.prefix(length - 1)).trimmingCharacters(in: .whitespaces) + "…"
    }

    /// Where moving on goes, in words, and the action that does it (Next).
    private static func forward(_ s: WalkState, _ p: WalkPeriods) -> (label: String, action: WalkAction)? {
        guard let level = s.level else { return nil }
        if s.ground { return (s.kept.isEmpty ? skipStep : next("your goals"), .next) }
        if level == .today, let focused = s.focus[.today], focused != s.firstThing { return (startWithThis, .startThere) }
        let added = level == .today ? s.firstThing != nil : !s.items(on: level).isEmpty
        guard added else { return (skipStep, .next) }
        // A whole-year walk goes area by area on Year, and goal by goal on Season, before it moves down.
        if let stop = s.tour.first {
            if level == .year, let area = s.area(stop) { return (next(cut(area.name, 14)), .next) }
            if s.item(stop) != nil { return (nextGoal, .next) }
        }
        switch level {
        case .year: return (next("this \(p.seasonWord)"), .next)
        case .season: return (next(p.monthName), .next)
        case .month: return (next("this week"), .next)
        case .week: return (next("today"), .next)
        case .today: return (finish, .next)
        }
    }

    /// The top row's Back, as drawn; `back(_:_:)` is its VoiceOver label.
    static let backWord = "Back"

    /// Where backing up goes, in words: the top row's Back, to VoiceOver.
    static func back(_ s: WalkState, _ p: WalkPeriods) -> String {
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

    /// One compass point. `detail` is a second line under the label (Welcome's choices).
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

    /// The top row's Leave for now, to VoiceOver: "Your place is kept." only where it is (a walk-down
    /// is never stored, `placeKept`).
    static func leaveHint(_ s: WalkState) -> String? { s.placeKept ? leaveDetail : nil }

    /// The choices on the light. Welcome's two sit upper-left and upper-right, with room under each
    /// for its second line (the light itself is the quick start). On steps 1 to 5 at most three, in
    /// this order: Type it on the left ("Type your own" on the ground), the examples (steps 1 to 4 off
    /// the ground, while the area stood in has one left unused for the step, F27, P23) or, on Today while it is
    /// offered, the calendar on the right, and Undo at the top
    /// once there is something to undo. Back, Next and Leave for now have their own controls.
    static func points(_ s: WalkState, _ p: WalkPeriods) -> [Point] {
        if s.step == 0 {
            return [
                Point(at: .nw, label: wholeYear, action: .full, symbol: "mountain.2", detail: wholeDetail),
                Point(at: .ne, label: notNow, action: .notNow, symbol: "xmark", detail: notNowDetail),
            ].sorted { order($0.at) < order($1.at) }
        }
        guard let level = s.level else { return [] }
        var out: [Point] = []
        if s.ground {
            out.append(Point(at: .w, label: "Type your own", action: .type, symbol: "keyboard"))
        } else {
            out.append(Point(at: .w, label: "Type it", action: .type, symbol: "keyboard"))
            if level == .today {
                if s.calendarOffer {
                    out.append(Point(at: .e, label: "Show my calendar on Today", action: .calendar, symbol: "calendar"))
                }
            } else if !s.examplesLeft(today: p.today).isEmpty {
                out.append(Point(at: .e, label: s.examplesOn.contains(s.step) ? "Hide examples" : "Show examples",
                                 action: .examples, symbol: "lightbulb"))
            }
        }
        if !s.undo.isEmpty {
            out.append(Point(at: .n, label: undo, action: .undo, symbol: "arrow.uturn.backward"))
        }
        return out
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

    /// The examples for an area on a level (F27): they answer the question asked, so only the six
    /// built-in areas have them, keyed by the name lowercased as `phrase(for:)` reads it. An area of
    /// the person's own, the nameless post (nil) and Today have none: nothing generic stands in.
    static func examples(_ level: WalkLevel, area: String?) -> [String] {
        guard let area else { return [] }
        return exampleLists[area.lowercased()]?[level] ?? []
    }

    /// One line per area and level. Each area's first example on a level follows from its first one
    /// level up, so tapping the first at every step makes a plan that holds together. Week's carry a
    /// day, as `WalkWords.said` reads one (the title is planted without it).
    private static let exampleLists: [String: [WalkLevel: [String]]] = [
        "health": [
            .year: ["Feel strong again", "Sleep seven hours most nights", "Run a 5K"],
            .season: ["Lift twice a week", "Walk every morning before work"],
            .month: ["Find a gym that fits", "Book a checkup"],
            .week: ["Tour the gym on Tuesday", "Buy proper running shoes on Saturday"],
        ],
        "home": [
            .year: ["Finish the bathroom", "Clear out the garage", "Grow a kitchen garden"],
            .season: ["Bathroom tiled and plumbed", "Garage empty enough for the car"],
            .month: ["Pick the tile and pay the deposit", "Book the plumber"],
            .week: ["Call the tile shop on Monday", "Measure the bathroom window today"],
        ],
        "people": [
            .year: ["More slow weekends together", "See old friends each season", "Call Mom every Sunday"],
            .season: ["One slow Sunday a month", "Dinner with old friends"],
            .month: ["Keep one Sunday free", "Invite friends over for dinner"],
            .week: ["Put the free Sunday on the calendar today", "Text friends about Friday dinner today"],
        ],
        "work": [
            .year: ["Sign one more client", "Ask for a raise", "Protect two focus mornings a week"],
            .season: ["Pitch three new clients", "Ship the spring proposal"],
            .month: ["Send two proposals", "Ask for a testimonial"],
            .week: ["Draft the first proposal on Wednesday", "Email the client on Thursday"],
        ],
        "money": [
            .year: ["Pay off the car", "Save an emergency fund", "Sort out retirement savings"],
            .season: ["Clear a third of the car loan", "Spend less on takeout"],
            .month: ["Set up a bigger monthly payment", "Call about the retirement account"],
            .week: ["Call the bank about the payment on Monday", "Cancel unused subscriptions today"],
        ],
        "fun": [
            .year: ["Read a book a month", "Learn to play the guitar", "Go camping twice"],
            .season: ["Finish two novels", "Book the first camping trip"],
            .month: ["Join the library", "Pick the campsite"],
            .week: ["Borrow the next book on Saturday", "Pack the tent on Friday"],
        ],
    ]

    /// A title as the question quotes it (S33): whole up to `shortLength` characters; longer, cut at the
    /// last space at or before the 55th character (trailing spaces trimmed), then "…"; a word of 56
    /// letters or more with no space is cut at 55.
    static func short(_ title: String) -> String {
        guard title.count > shortLength else { return title }
        let head = title.prefix(shortLength - 1)
        let atWord = head.lastIndex(of: " ").map { String(head[..<$0]).trimmingCharacters(in: .whitespaces) } ?? ""
        return (atWord.isEmpty ? String(head) : atWord) + "…"
    }

    // MARK: Notes

    static let nothingToPlant = "Nothing added yet. Hold the light to speak."
    static let speechOff = "Speaking isn’t available here, so type it."
    /// A second hold in a row that heard nothing.
    static let nothingHeard = "Nothing came through. Type it here."
    /// The permission prompts took the touch and speech was allowed.
    static let speakNow = "Now hold the light and speak."
    static let ridgeFull = "That’s as many as fit. Tap one to let it go."

    // MARK: Hint row and banners

    /// What the newest step back undoes, for VoiceOver (the pill's label and the light's top point's,
    /// F23); nil with nothing to undo.
    static func undoLabel(_ s: WalkState) -> String? {
        guard let entry = s.undo.last else { return nil }
        func title(_ id: UUID) -> String? { s.item(id).map { "“\(short($0.title))”" } }
        switch entry {
        case .plant(let id): return title(id).map { "Undo adding \($0)" } ?? undo
        case .keep(let id): return s.area(id).map { "Undo keeping \($0.name)" } ?? undo
        case .unkeep(let id, _): return s.area(id).map { "Undo letting go of \($0.name)" } ?? undo
        case .nameArea(let area): return "Undo adding \(area.name)"
        case .move(let id, _, _): return title(id).map { "Undo moving \($0)" } ?? undo
        case .pullUp(let item, _, _, _): return "Undo removing “\(short(item.title))”"
        case .firstThing: return "Undo the first thing"
        }
    }

    /// A point as VoiceOver reads it (the disc and the light's custom action): Undo says what it undoes
    /// (F23); every other point, its own label.
    static func pointLabel(_ point: Point, _ s: WalkState) -> String {
        point.action == .undo ? undoLabel(s) ?? point.label : point.label
    }

    /// The Move row's chip and Remove, for VoiceOver (F24): what they do to which flag.
    static func moveLabel(_ title: String, to area: String) -> String { "Move “\(short(title))” to \(area)" }
    static func removeLabel(_ title: String) -> String { "Remove “\(short(title))”" }

    /// A chosen flag's tap: it lets the choice go.
    static let tapToLetGo = "tap to let go"
    static let undo = "Undo"; static let moveTo = "Move to"; static let pullUp = "Remove"
    /// The typing field (F22): its placeholder, its gold Add, and its X (to VoiceOver).
    static let typeAdd = "Add", typeClose = "Close without adding"
    static let typePlaceholder = "Type it, then tap Add"; static let firstThingTag = "FIRST THING"
    /// How many more flags a banner on Look back up stands for: "+2 more".
    static func more(_ count: Int) -> String { "+\(count) more" }
    /// What a folded stub says: the 26-point pennant has room for the count only ("+2").
    static func stubCount(_ count: Int) -> String { "+\(count)" }
    /// An example flag's tag, and the shorter one where the flag is too narrow for it.
    static let exampleTag = "EXAMPLE · TAP TO USE", exampleTagShort = "TAP TO USE"
    /// The ground's own words while speaking and in the why line.
    static let groundWhy = "Tap the ones that matter to you."
    /// Added to a step's why line while a tap on the goal above switches to another (F3, `nextGoalAbove`).
    static let focusAbove = " Tap the goal above to switch."

    // MARK: The ending

    static let lookBack = "Look back up: that’s your plan."; static let heresToday = "Here’s today."
    static let showMyDay = "Show my day"; static let lookBackHandle = "See my whole plan"
    static let todayEyebrow = "Today"; static let walkAnother = "Plan another goal down to today"; static let goToToday = "Open Today"
    static let thatsTheDay = "That’s the day."; static let nothingToday = "Nothing for today yet."
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
    static let replayFooter = "Start at the top and walk down to today. What you already planned stays. To stop part-way, tap Leave for now at the top."
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

    static let orbLabelWelcome = "Quick start. One goal, down to today. About 3 minutes."; static let orbLabel = "Hold and speak to add a goal. Double tap for other choices."
    /// On Week and Today, which hold tasks.
    static let orbLabelTask = "Hold and speak to add a task. Double tap for other choices."
    /// Speech off for this walk: a double tap types.
    static let orbLabelSpeechOff = "Double tap to type it. The other choices are in the actions."
    /// The ground: the light is not taught yet, so its label says nothing about holding it.
    static let orbLabelGround = "Double tap for other choices."
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
        /// `focused`: the goal above the step is about; `focusedOfSeveral`: the same, with another
        /// one above in the area stood in, which a tap switches to.
        case mine, plain, focused, focusedOfSeveral, firstThing, firstThingMine, example, stub(Int)
        /// On Today, the goal above when the next one in the round is not here but the nameless post's
        /// first thing: a tap goes to the first thing.
        case focusedThenFirstThing
        /// Today's first thing planted by the walk, already chosen for Remove: a tap lets it go.
        case firstThingChosen
        /// Today's first thing on the Today step: `firstThingFocused` while it is the goal above (a
        /// tap goes on to the next week task here); `firstThingFocusable`, not planted by this walk,
        /// while another is (a tap makes it the goal above).
        case firstThingFocusable, firstThingFocused
        /// A tap does something: the label says what. A plain flag, someone else's first thing,
        /// or the only goal above, is only read.
        var taps: Bool {
            switch self {
            case .plain, .firstThing, .focused: return false
            case .mine, .focusedOfSeveral, .focusedThenFirstThing, .firstThingMine, .firstThingChosen, .firstThingFocusable, .firstThingFocused,
                 .example, .stub:
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
        case .focused: return "\(withTag), the goal this step is about"
        case .focusedOfSeveral: return "\(withTag), the goal this step is about, tap for the next one here"
        case .focusedThenFirstThing: return "\(withTag), the goal this step is about, tap for the first thing"
        case .firstThingChosen: return "Today: \(text), first thing, chosen, \(tapToLetGo)"
        case .firstThing: return "Today: \(text), first thing"
        case .firstThingMine: return "Today: \(text), first thing, tap to remove"   // planted by the walk
        case .firstThingFocusable: return "Today: \(text), first thing, tap to focus"
        case .firstThingFocused: return "Today: \(text), first thing, tap for the next one here"
        case .example: return "Example: \(text), tap to make it yours"
        case .stub(let n): return "\(n) more, tap to show"
        }
    }

    /// An area label's hint from what a tap on it does: off the ground nil for an area the walk
    /// cannot stand in (`WalkState.walksThere`).
    static func areaHint(_ s: WalkState, _ id: UUID) -> String? {
        if s.ground { return areaHint(ground: true, kept: s.kept.contains(id), focused: false) }
        if id == s.standing { return areaHint(ground: false, kept: true, focused: true) }
        return s.walksThere(id) ? areaHint(ground: false, kept: true, focused: false) : nil
    }

    static func areaHint(ground: Bool, kept: Bool, focused: Bool) -> String {
        if ground { return kept ? "Tap to let go" : "Tap to keep" }
        return focused ? "You are here" : "Tap to walk there"
    }

    static func rowLabel(_ title: String, forGoal: String?) -> String {
        forGoal.map { "\(title), for \($0)" } ?? title
    }

    /// The light's label: `orbLabelWelcome` on Welcome, `orbLabel` on every other step (`orbLabelSpeechOff` once speech is off).
    static func orbAccessibilityLabel(_ s: WalkState) -> String {
        if s.step == 0 { return orbLabelWelcome }
        if s.speechIsOff { return orbLabelSpeechOff }
        if s.ground { return orbLabelGround }
        // Week and Today hold tasks, not goals.
        return s.level == .week || s.level == .today ? orbLabelTask : orbLabel
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
