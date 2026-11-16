import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

private let nov13 = WalkPeriods.pick(now: day(2026, 11, 13), weekStartsOn: 0)

private func state(step: Int, depth: WalkDepth = .quick) -> WalkState {
    var s = WalkState(); s.step = step; s.depth = depth; return s
}
private func item(_ level: WalkLevel, _ title: String) -> WalkItem { WalkItem(id: UUID(), level: level, title: title) }

struct WalkCopyTests {
    @Test func eachStepReadsRight() {
        let p = nov13
        let g = { () -> WalkState in var s = state(step: 1); s.ground = true; return s }()
        #expect(WalkCopy.eyebrow(g, p) == "The year ahead")
        #expect(WalkCopy.question(g, p) == "First, your ground. Which parts of life matter most this year?")
        #expect(WalkCopy.why(g, p) == "Tap the ones that matter to you.")
        let y = state(step: 1)
        #expect(WalkCopy.question(y, p) == "What would make the year ahead a good one?")
        #expect(WalkCopy.why(y, p) == "Something that would feel true twelve months from now. Big or small.")
        #expect(WalkCopy.eyebrow(y, p) == "The year ahead")
        #expect(WalkCopy.eyebrow(state(step: 1, depth: .full), p) == "The year ahead")
        let se = state(step: 2)
        #expect(WalkCopy.eyebrow(se, p) == "Winter · Dec 1 to Feb 28")
        #expect(WalkCopy.question(se, p) == "And this winter? What’s it about?")
        #expect(WalkCopy.why(se, p) == "A season is a few months. What is this stretch really for?")
        let m = state(step: 3)
        // 13 November plans the coming winter, so the month is its first: December.
        #expect(WalkCopy.eyebrow(m, p) == "December")
        #expect(WalkCopy.question(m, p) == "What’s one thing for December?")
        #expect(WalkCopy.why(m, p) == "Small enough to finish by the 31st.")
        let w = state(step: 4)
        #expect(WalkCopy.eyebrow(w, p) == "This week · to Sat 14")
        #expect(WalkCopy.question(w, p) == "What’s one thing for this week?")
        #expect(WalkCopy.why(w, p) == "Say the day too, as in “on Friday”.")
        let t = state(step: 5)
        #expect(WalkCopy.eyebrow(t, p) == "Friday, 13 November")
        #expect(WalkCopy.question(t, p) == "What’s the first thing you’ll do today?")
        #expect(WalkCopy.why(t, p) == "Just one. The rest of today can wait its turn.")
    }

    /// 14 November: the walk plans the coming winter and, inside it, December: the season step's
    /// Next line, the month question and its why line all say December, never November.
    @Test func theSeasonAndTheMonthAgree() {
        let p = WalkPeriods.pick(now: day(2026, 11, 14), weekStartsOn: 0)
        var season = state(step: 2); season.items = [item(.season, "Get the house warm")]
        #expect(WalkCopy.nextLine(season, p)?.text == "Next: December")
        #expect(WalkCopy.question(state(step: 3), p) == "What’s one thing for December?")
        #expect(WalkCopy.why(state(step: 3), p) == "Small enough to finish by the 31st.")
        let goal = item(.season, "Get the house warm")
        var focused = state(step: 3); focused.items = [goal]; focused.focus[.month] = goal.id
        #expect(WalkCopy.question(focused, p) == "What part of “Get the house warm” belongs to December?")
        #expect(WalkCopy.eyebrow(state(step: 2), p) == "Winter · Dec 1 to Feb 28")
    }

    /// 25 November plans the coming winter's first month, December (no "rest of"); on 1 October
    /// fall is the current season, so its eyebrow reads "This season".
    @Test func theComingSeasonsFirstMonthAndTheCurrentSeasonsEyebrow() {
        let late = WalkPeriods.pick(now: day(2026, 11, 25), weekStartsOn: 0)
        #expect(WalkCopy.question(state(step: 3), late) == "What’s one thing for December?")
        #expect(WalkCopy.why(state(step: 3), late) == "Small enough to finish by the 31st.")
        let oct = WalkPeriods.pick(now: day(2026, 10, 1), weekStartsOn: 0)
        #expect(WalkCopy.eyebrow(state(step: 2), oct) == "This season · to Nov 30")
    }

    @Test func focusedQuestions() {
        let p = nov13
        let home = WalkArea(id: UUID(), name: "Home"), people = WalkArea(id: UUID(), name: "People")
        let own = WalkArea(id: UUID(), name: "Creative work")
        var y = state(step: 1); y.areas = [home, people, own]; y.kept = [home.id, people.id, own.id]
        y.focusArea = people.id
        #expect(WalkCopy.question(y, p) == "What would make this a good year for the people in your life?")
        y.focusArea = own.id
        #expect(WalkCopy.question(y, p) == "What would make this a good year for creative work?")
        for (name, phrase) in [("Health", "your health"), ("Home", "home"), ("Work", "work"), ("Money", "money"), ("Fun", "fun")] {
            #expect(WalkCopy.phrase(for: name) == phrase)
        }
        let goal = item(.year, "Feel strong again")
        var s = state(step: 2); s.items = [goal]; s.focus[.season] = goal.id
        #expect(WalkCopy.question(s, p) == "What part of “Feel strong again” belongs to this winter?")
        let sg = item(.season, "Get fit"), mg = item(.month, "Join the gym"), wg = item(.week, "Gym induction")
        var m = state(step: 3); m.items = [sg]; m.focus[.month] = sg.id
        #expect(WalkCopy.question(m, p) == "What part of “Get fit” belongs to December?")
        var w = state(step: 4); w.items = [mg]; w.focus[.week] = mg.id
        #expect(WalkCopy.question(w, p) == "For “Join the gym”, what happens this week?")
        var t = state(step: 5); t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.question(t, p) == "Start the day with “Gym induction”?")
    }

    /// F3: the why line says a tap on the goal above switches only when there is another one here.
    @Test func theWhyLineOffersTheSwitchOnlyWithSeveral() {
        let p = nov13
        let work = WalkArea(id: UUID(), name: "Work"), health = WalkArea(id: UUID(), name: "Health")
        let launch = WalkItem(id: UUID(), level: .season, title: "Launch the shop", areaId: work.id)
        let hire = WalkItem(id: UUID(), level: .season, title: "Hire a helper", areaId: work.id)
        let lift = WalkItem(id: UUID(), level: .season, title: "Lift twice a week", areaId: health.id)
        var s = state(step: 3)
        s.areas = [health, work]; s.kept = [health.id, work.id]
        s.items = [launch, lift]; s.focusArea = work.id; s.focus[.month] = launch.id
        let base = "Small enough to finish by the 31st."
        #expect(WalkCopy.focusAbove == " Tap the goal above to switch.")
        #expect(WalkCopy.why(s, p) == base)                     // one here (another area’s does not count)
        s.items.append(hire)
        #expect(WalkCopy.why(s, p) == base + WalkCopy.focusAbove)
        s.focus[.month] = hire.id
        #expect(WalkCopy.why(s, p) == base + WalkCopy.focusAbove)
    }

    /// F27: the examples answer the question asked, for the area stood in and the step's level.
    @Test func theExamples() {
        #expect(WalkCopy.examples(.year, area: "Home") == ["Finish the bathroom", "Clear out the garage", "Grow a kitchen garden"])
        #expect(WalkCopy.examples(.season, area: "Home") == ["Bathroom tiled and plumbed", "Garage empty enough for the car"])
        #expect(WalkCopy.examples(.month, area: "Home") == ["Pick the tile and pay the deposit", "Book the plumber"])
        #expect(WalkCopy.examples(.week, area: "Home") == ["Call the tile shop on Monday", "Measure the bathroom window today"])
        #expect(WalkCopy.examples(.year, area: "Health") == ["Feel strong again", "Sleep seven hours most nights", "Run a 5K"])
        #expect(WalkCopy.examples(.week, area: "People") == ["Put the free Sunday on the calendar today",
                                                            "Text friends about Friday dinner today"])
        #expect(WalkCopy.examples(.year, area: "Money") == ["Pay off the car", "Save an emergency fund", "Sort out retirement savings"])
        #expect(WalkCopy.examples(.month, area: "Money") == ["Set up a bigger monthly payment", "Call about the retirement account"])
        // Week's day comes off the end; the title keeps the rest.
        let friday = WalkWords.said("Text friends about Friday dinner today", level: .week, today: nov13.today)
        #expect(friday == WalkWords.Said(title: "Text friends about Friday dinner", day: nov13.today))
        // Keyed by the name as `phrase(for:)` reads it: without case.
        #expect(WalkCopy.examples(.year, area: "home") == WalkCopy.examples(.year, area: "Home"))
        #expect(WalkCopy.examples(.year, area: "HOME") == WalkCopy.examples(.year, area: "Home"))
        // The nameless post has none.
        for level in WalkLevel.allCases { #expect(WalkCopy.examples(level, area: nil).isEmpty) }
    }

    private static let builtIn = ["Health", "Home", "People", "Work", "Money", "Fun"]

    @Test func everyBuiltInAreaHasExamplesOnEveryLevel() {
        for area in Self.builtIn {
            for level in [WalkLevel.year, .season, .month, .week] {
                #expect(!WalkCopy.examples(level, area: area).isEmpty, "\(area) \(level)")
            }
            #expect(WalkCopy.examples(.today, area: area).isEmpty, "\(area) on Today")
        }
    }

    @Test func anAreaYouNamedHasNone() {
        for level in WalkLevel.allCases {
            #expect(WalkCopy.examples(level, area: "Side projects and making") == [])
        }
    }

    @Test func examplesFitAFlag() {
        for area in Self.builtIn {
            for level in WalkLevel.allCases {
                for example in WalkCopy.examples(level, area: area) {
                    #expect(example.count <= 44, "\(area) \(level): \(example) is \(example.count)")
                }
            }
        }
    }

    /// Standing in an area of one's own, steps 1 to 4 offer no examples, and the action does nothing.
    @Test func noExamplesNoExamplesPoint() {
        let own = WalkArea(id: UUID(), name: "Side projects and making")
        for step in 1...4 {
            var s = state(step: step)
            s.areas = [own]; s.kept = [own.id]; s.focusArea = own.id
            #expect(!WalkCopy.points(s, nov13).contains { $0.at == .e || $0.action == .examples }, "step \(step)")
            let env = WalkEnv(periods: nov13, now: day(2026, 11, 13))
            _ = s.act(.examples, env)
            #expect(s.examplesOn.isEmpty, "step \(step)")
            // A built-in area on the same step does offer them.
            let home = WalkArea(id: UUID(), name: "Home")
            var there = state(step: step)
            there.areas = [home]; there.kept = [home.id]; there.focusArea = home.id
            #expect(WalkCopy.points(there, nov13).contains { $0.at == .e && $0.action == .examples }, "step \(step)")
        }
    }

    /// S33: a title of up to 56 characters is quoted whole; a word of 56 letters or more is cut at 55.
    @Test func shortQuotesFiftySixCharacters() {
        let whole = String(repeating: "a", count: 56)
        #expect(WalkCopy.short(whole) == whole)
        for n in [57, 70] {
            #expect(WalkCopy.short(String(repeating: "b", count: n)) == String(repeating: "b", count: 55) + "…")
        }
    }

    /// S33: a 44-character goal is quoted whole in the question on Season, Month, Week and Today.
    @Test func theQuestionQuotesAGoalWhole() {
        let title = "Finish the bathroom before the family visits"
        #expect(title.count == 44)
        for (step, level) in [(2, WalkLevel.year), (3, .season), (4, .month), (5, .week)] {
            let goal = item(level, title)
            var s = state(step: step); s.items = [goal]; s.focus[WalkLevel(rawValue: step)!] = goal.id
            #expect(WalkCopy.question(s, nov13).contains("“\(title)”"), "step \(step)")
        }
    }

    /// S33: a longer goal is cut at a word: at most 56 characters, ending "…", no space before it.
    @Test func aVeryLongGoalIsCutAtAWord() {
        let long = String(String(repeating: "Walk more every day. ", count: 10).prefix(200))
        let cut = WalkCopy.short(long)
        #expect(cut.count <= 56 && cut.hasSuffix("…") && !cut.hasSuffix(" …"))
        #expect(long.hasPrefix(String(cut.dropLast())))
        #expect(cut == "Walk more every day. Walk more every day. Walk more…")
        let goal = item(.year, long)
        var s = state(step: 2); s.items = [goal]; s.focus[.season] = goal.id
        #expect(WalkCopy.question(s, nov13).contains("“\(cut)”"))
    }

    @Test func everyHintLine() {
        // Welcome: its choices are always open.
        var s = state(step: 0)
        #expect(WalkCopy.hint(s) == "Tap the light for a quick start")
        s.orb = .holding(hover: .nw); #expect(WalkCopy.hint(s) == "Tap the light for a quick start")
        // A step: nothing added yet, the two verbs.
        var y = state(step: 1)
        #expect(WalkCopy.hint(y) == "Hold the light and speak.")
        y.note = "A note"; #expect(WalkCopy.hint(y) == "A note")
        // The compass open: what to do with it; a note gives way, and is back once it closes.
        y.orb = .open; #expect(WalkCopy.hint(y) == "Tap one, or tap the light to close")
        y.orb = .idle; #expect(WalkCopy.hint(y) == "A note"); y.note = nil
        // A press on its way to speaking, or a slide: blank.
        y.orb = .holding(hover: nil); #expect(WalkCopy.hint(y) == "")
        y.orb = .holding(hover: .s); #expect(WalkCopy.hint(y) == "")
        y.orb = .speaking(live: "x"); #expect(WalkCopy.hint(y) == "Let go when you’ve said it")
        // Waiting for the last words after letting go: blank, a note included.
        y.orb = .finishing(live: "x"); #expect(WalkCopy.hint(y) == "")
        y.note = "A note"; #expect(WalkCopy.hint(y) == ""); y.note = nil; y.orb = .idle
        // Typing open: blank (the field carries its own placeholder).
        y.typing = ""; #expect(WalkCopy.hint(y) == ""); y.typing = nil
        var g = state(step: 1); g.ground = true
        #expect(WalkCopy.hint(g) == "Tap the ones that matter.")              // nothing kept: the line says Skip
        g.kept = [UUID()]
        #expect(WalkCopy.hint(g) == "Tap the ones that matter, then Next.")
        #expect(WalkCopy.hint(state(step: 2)) == "Hold the light and speak.")
        var planted = state(step: 2); planted.items = [item(.season, "Get fit")]
        #expect(WalkCopy.hint(planted) == "Hold the light to add another.")
        // The light being taught: its own two lines say it, so the hint is blank.
        var taught = state(step: 1); taught.teaching = true
        #expect(WalkCopy.hint(taught) == "")
        let wg = item(.week, "Gym induction")
        var t = state(step: 5); t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.hint(t) == WalkCopy.hintStartHere)          // the Next line reads "Start with this one" there
        #expect(WalkCopy.nextLine(t, WalkPeriods.pick(now: Date()))?.text == WalkCopy.startWithThis)
        t.firstThing = wg.id
        #expect(WalkCopy.hint(t) == "Tap “Finish the walk”, or hold to change it.")
        // Speech off for this walk: a tap types, a hold opens the other choices.
        var off = state(step: 1); off.speechIsOff = true
        #expect(WalkCopy.hint(off) == "Tap the light and type.")
        off.items = [item(.year, "Run a 5K")]
        #expect(WalkCopy.hint(off) == "Tap the light and type.")
    }

    private func labels(_ s: WalkState, _ p: WalkPeriods = nov13) -> [String] { WalkCopy.points(s, p).map(\.label) }
    /// Where Back goes, in words: the top row's VoiceOver label.
    private func north(_ s: WalkState, _ p: WalkPeriods = nov13) -> String { WalkCopy.back(s, p) }

    @Test func welcomePoints() {
        let pts = WalkCopy.points(state(step: 0), nov13)
        // The light is the quick start: no disc for it; the other two stand upper-left and upper-right.
        #expect(pts == [WalkCopy.Point(at: .ne, label: "Not now", action: .notNow, symbol: "xmark",
                                       detail: "Go straight to Today."),
                        WalkCopy.Point(at: .nw, label: "Plan my whole year", action: .full, symbol: "mountain.2",
                                       detail: "Every part of life. About 25 minutes.")])
        #expect(WalkCopy.quickStart == "Quick start")
        #expect(WalkCopy.quickDetail == "One goal, down to today. About 3 minutes.")
        var s = state(step: 0); s.undo = [.keep(UUID())]
        #expect(WalkCopy.points(s, nov13).count == 2)
    }

    /// The light offers at most three choices on steps 1 to 5, and only these: Type it, examples or
    /// the calendar, Undo. Back, Next, Leave for now and the switch are never on it.
    @Test func theLightOffersAtMostThree() {
        let allowed: Set<WalkAction> = [.type, .examples, .calendar, .undo]
        var checked = 0
        for base in Generated.all where (1...5).contains(base.step) {
            for undo in [false, true] {
                var s = base; s.calendarOffer = true
                if undo { s.undo = [.plant(UUID())] }
                let points = WalkCopy.points(s, nov13)
                #expect(points.count <= 3, "\(Generated.describe(s))")
                #expect(points.allSatisfy { allowed.contains($0.action) }, "\(Generated.describe(s)): \(points.map(\.action))")
                checked += 1
            }
        }
        #expect(checked > 1000)
    }

    @Test func groundPoints() {
        var g = state(step: 1); g.ground = true
        #expect(WalkCopy.points(g, nov13) == [WalkCopy.Point(at: .w, label: "Type your own", action: .type, symbol: "keyboard")])
        g.kept = [UUID()]; g.undo = [.keep(g.kept[0])]
        #expect(WalkCopy.points(g, nov13).map(\.at) == [.w, .n])
        #expect(labels(g) == ["Type your own", "Undo"])
    }

    @Test func stepPoints() {
        // Standing in Health, which has examples on every step from Year to Week (F27).
        let health = WalkArea(id: UUID(), name: "Health")
        func inHealth(_ step: Int) -> WalkState {
            var s = state(step: step)
            s.areas = [health]; s.kept = [health.id]; s.focusArea = health.id
            return s
        }
        // On the nameless post there are none to show.
        #expect(labels(state(step: 1)) == ["Type it"])
        let y = WalkCopy.points(inHealth(1), nov13)
        #expect(y.map(\.label) == ["Type it", "Show examples"])
        #expect(y.map(\.at) == [.w, .e])
        #expect(y.map(\.action) == [.type, .examples])
        #expect(y.map(\.symbol) == ["keyboard", "lightbulb"])
        #expect(y.map(\.detail) == [nil, nil])
        var s = inHealth(3)
        #expect(labels(s) == ["Type it", "Show examples"])
        s.items = [item(.month, "x")]; s.examplesOn = [3]
        #expect(labels(s) == ["Type it", "Hide examples"])
        s.undo = [.plant(UUID())]
        #expect(WalkCopy.points(s, nov13).map(\.at) == [.w, .e, .n])
        #expect(WalkCopy.points(s, nov13).last == WalkCopy.Point(at: .n, label: "Undo", action: .undo, symbol: "arrow.uturn.backward"))
        #expect(WalkCopy.points(state(step: 6), nov13).isEmpty)
    }

    @Test func todayPoints() {
        var t = state(step: 5)
        #expect(labels(t) == ["Type it"])
        t.calendarOffer = true
        #expect(WalkCopy.points(t, nov13) == [WalkCopy.Point(at: .w, label: "Type it", action: .type, symbol: "keyboard"),
                                            WalkCopy.Point(at: .e, label: "Show my calendar on Today", action: .calendar,
                                                           symbol: "calendar")])
        let wg = item(.week, "Gym induction")
        t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.nextLine(t, nov13) == WalkCopy.NextLine(text: "Start with this one", action: .startThere, skip: false))
        t.firstThing = wg.id
        #expect(WalkCopy.nextLine(t, nov13)?.text == WalkCopy.finish)
    }

    /// Every step's way forward and way back, by the place it goes, in the walk's own period words.
    @Test func theNextLineAndBackSayWhereTheyGo() {
        let p = nov13
        func added(_ step: Int) -> WalkState {
            var s = state(step: step)
            if step == 5 { let t = item(.week, "Gym"); s.items = [t]; s.firstThing = t.id }
            else { s.items = [item(WalkLevel(rawValue: step)!, "Something")] }
            return s
        }
        let expected = [1: "Next: this winter", 2: "Next: December", 3: "Next: this week", 4: "Next: today", 5: "Finish the walk"]
        for (step, words) in expected {
            #expect(WalkCopy.nextLine(added(step), p) == WalkCopy.NextLine(text: words, action: .next, skip: false), "step \(step)")
            // Nothing added yet: quieter, and it says it skips.
            #expect(WalkCopy.nextLine(state(step: step), p) == WalkCopy.NextLine(text: "Skip this step", action: .next, skip: true))
        }
        var g = state(step: 1); g.ground = true
        #expect(WalkCopy.nextLine(g, p)?.text == "Skip this step")
        g.kept = [UUID()]
        #expect(WalkCopy.nextLine(g, p) == WalkCopy.NextLine(text: "Next: your goals", action: .next, skip: false))
        // A focused week flag on Today: the line starts the day with it.
        let wg = item(.week, "Gym induction")
        var t = state(step: 5); t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.nextLine(t, p) == WalkCopy.NextLine(text: "Start with this one", action: .startThere, skip: false))
        // A whole-year walk names its next stop: the next area on Year, the next goal on Season.
        let home = WalkArea(id: UUID(), name: "Home"), people = WalkArea(id: UUID(), name: "People")
        var tour = state(step: 1, depth: .full); tour.areas = [home, people]; tour.kept = [home.id, people.id]
        tour.items = [WalkItem(id: UUID(), level: .year, title: "Fix the roof", areaId: home.id)]
        tour.focusArea = home.id; tour.tour = [people.id]
        #expect(WalkCopy.nextLine(tour, p)?.text == "Next: People")
        var season = state(step: 2, depth: .full)
        let goal = item(.year, "Fix the roof"), second = item(.year, "See friends")
        season.items = [goal, second, item(.season, "Get quotes")]; season.focus[.season] = goal.id; season.tour = [second.id]
        #expect(WalkCopy.nextLine(season, p)?.text == "Next goal")
        // A long area name is cut, so Next stays one line.
        let long = WalkArea(id: UUID(), name: "Creative work and play")
        tour.areas.append(long); tour.kept.append(long.id); tour.tour = [long.id]
        #expect(WalkCopy.nextLine(tour, p)?.text == "Next: Creative work…")
        // Not shown while the compass is open, a press is on, or the field is open.
        var open = added(2); open.orb = .open
        #expect(WalkCopy.nextLine(open, p) == nil)
        var typing = added(2); typing.typing = ""
        #expect(WalkCopy.nextLine(typing, p) == nil)
        #expect(WalkCopy.nextLine(state(step: 0), p)?.text == "Quick start")     // Welcome: the light's own line
        #expect(WalkCopy.nextLine(state(step: 6), p) == nil)

        let backs = [2: "Back to the year", 3: "Back to this winter", 4: "Back to December", 5: "Back to this week"]
        for (step, words) in backs { #expect(north(state(step: step)) == words) }
        #expect(north(state(step: 1)) == "Back to your areas")
        var ground = state(step: 1); ground.ground = true
        #expect(north(ground) == "Back to the start")
        #expect(WalkCopy.backWord == "Back")
    }

    /// A walk taken in another month and season reads its own: July, summer.
    @Test func theWordsFollowTheWalksOwnPeriods() {
        let july = WalkPeriods.pick(now: day(2026, 7, 3), weekStartsOn: 0)
        var season = state(step: 2); season.items = [item(.season, "Swim more")]
        #expect(WalkCopy.nextLine(season, july)?.text == "Next: July")
        var year = state(step: 1); year.items = [item(.year, "Swim more")]
        #expect(WalkCopy.nextLine(year, july)?.text == "Next: this summer")
        #expect(north(state(step: 3), july) == "Back to this summer")
        #expect(north(state(step: 4), july) == "Back to July")
        let goal = item(.year, "Swim more")
        var focused = state(step: 2); focused.items = [goal]; focused.focus[.season] = goal.id
        #expect(WalkCopy.question(focused, july) == "What part of “Swim more” belongs to this summer?")
    }

    /// Every hint, compass point, Next line, why line, lesson and note the walk can show, in every
    /// state the layout sweep generates (and those states with the compass open, held, speaking,
    /// speech off and the light being taught), and every other string and string function the copy
    /// has. Only the big titles keep the mountain's own words: `question` (Welcome's `welcomeTitle`
    /// among them) and `lookBack`.
    static func everythingTheWalkSays() -> [String] {
        let p = WalkPeriods.pick(now: day(2026, 11, 13), weekStartsOn: 0)
        let july = WalkPeriods.pick(now: day(2026, 7, 3), weekStartsOn: 0)
        var said: [String] = []
        var bases = Generated.states()
        var tour = state(step: 1, depth: .full)
        let home = WalkArea(id: UUID(), name: "Home"), people = WalkArea(id: UUID(), name: "People")
        tour.areas = [home, people]; tour.kept = [home.id, people.id]; tour.focusArea = home.id; tour.tour = [people.id]
        tour.items = [WalkItem(id: UUID(), level: .year, title: "Fix the roof", areaId: home.id)]
        bases.append(tour)
        var season = state(step: 2, depth: .full)
        let goal = item(.year, "Fix the roof"), second = item(.year, "See friends")
        season.items = [goal, second, item(.season, "Get quotes")]; season.focus[.season] = goal.id; season.tour = [second.id]
        bases.append(season)
        for base in bases {
            var variants = [base]
            for orb: WalkState.Orb in [.open, .holding(hover: nil), .speaking(live: "x"), .finishing(live: "x")] {
                var v = base; v.orb = orb; variants.append(v)
            }
            var off = base; off.speechIsOff = true; off.calendarOffer = true; off.undo = [.plant(UUID())]; variants.append(off)
            var taught = base; taught.teaching = true; variants.append(taught)
            for v in variants {
                for periods in [p, july] {
                    said.append(WalkCopy.hint(v))
                    said += WalkCopy.points(v, periods).flatMap { [$0.label, $0.detail ?? ""] }
                    said.append(WalkCopy.nextLine(v, periods)?.text ?? "")
                    said.append(WalkCopy.why(v, periods))
                    said += WalkCopy.teaching(v)
                    said.append(WalkCopy.orbAccessibilityLabel(v))
                }
            }
        }
        let areas = WalkLoad.areas([], me: UUID()).map(\.name) + ["A very long area of my own"]
        said += areas.map(WalkCopy.phrase(for:))
        said += WalkLevel.allCases.flatMap { level in areas.flatMap { WalkCopy.examples(level, area: $0) } }
        said += WalkLevel.allCases.map(WalkCopy.levelName)
        said += [WalkCopy.wordmark, WalkCopy.welcomeSub, WalkCopy.nothingToPlant, WalkCopy.speechOff, WalkCopy.nothingHeard,
                 WalkCopy.speakNow, WalkCopy.ridgeFull, WalkCopy.undo, WalkCopy.moveTo, WalkCopy.pullUp,
                 WalkCopy.typePlaceholder, WalkCopy.typeAdd, WalkCopy.typeClose, WalkCopy.backWord, WalkCopy.firstThingTag, WalkCopy.more(2), WalkCopy.moreLabel(2), WalkCopy.noArea,
                 WalkCopy.exampleTag, WalkCopy.exampleTagShort, WalkCopy.groundWhy, WalkCopy.focusAbove,
                 WalkCopy.heresToday, WalkCopy.showMyDay, WalkCopy.lookBackHandle, WalkCopy.todayEyebrow,
                 WalkCopy.walkAnother, WalkCopy.goToToday, WalkCopy.thatsTheDay, WalkCopy.nothingToday,
                 WalkCopy.nextFlag("Run a 5K"), WalkCopy.forGoal("Run a 5K"), WalkCopy.nextEvent("2:30 pm"),
                 WalkCopy.ringLabel(done: 1, total: 3), WalkCopy.ring(done: 1, total: 3), WalkCopy.endingDate(p),
                 WalkCopy.replayButton, WalkCopy.replayFooter, WalkCopy.resumeButton, WalkCopy.walkWaiting,
                 WalkCopy.orbLabelWelcome, WalkCopy.orbLabel, WalkCopy.orbLabelTask, WalkCopy.orbLabelSpeechOff, WalkCopy.orbLabelGround, WalkCopy.rowDone, WalkCopy.rowOpen,
                 WalkCopy.typeFieldLabel, WalkCopy.hintChoose, WalkCopy.hintOpen, WalkCopy.hintFirst, WalkCopy.hintAnother,
                 WalkCopy.hintGround, WalkCopy.hintGroundNone, WalkCopy.hintStartHere, WalkCopy.hintFirstThing,
                 WalkCopy.hintSpeaking, WalkCopy.hintSpeechOff, WalkCopy.teachHold, WalkCopy.teachLetGo,
                 WalkCopy.teachSpeechOff, WalkCopy.skipStep, WalkCopy.finish, WalkCopy.startWithThis, WalkCopy.nextGoal,
                 WalkCopy.quickStart, WalkCopy.quickDetail, WalkCopy.wholeYear, WalkCopy.wholeDetail, WalkCopy.notNow,
                 WalkCopy.notNowDetail, WalkCopy.leaveForNow, WalkCopy.leaveDetail, WalkCopy.more, WalkCopy.moreLabel,
                 WalkCopy.rowLabel("Lift", forGoal: "Run a 5K"), WalkCopy.areaHint(ground: true, kept: false, focused: false),
                 WalkCopy.areaHint(ground: true, kept: true, focused: false), WalkCopy.areaHint(ground: false, kept: true, focused: false),
                 WalkCopy.areaHint(ground: false, kept: true, focused: true)]
        let roles: [WalkCopy.BannerRole] = [.mine, .plain, .focused, .focusedOfSeveral, .focusedThenFirstThing, .firstThing,
                                            .firstThingMine, .firstThingChosen, .firstThingFocusable, .firstThingFocused,
                                            .example, .stub(2)]
        said += roles.map { WalkCopy.bannerLabel("Run a 5K", level: .week, tag: "TODAY", role: $0) }
        return said
    }

    /// Nothing on the ground tells anyone to hold the light (it has not been taught yet).
    @Test func theGroundNeverSaysHold() {
        for kept in [[], [UUID()]] {
            for orb: WalkState.Orb in [.idle, .open] {
                var g = state(step: 1); g.ground = true; g.kept = kept; g.orb = orb
                let said = [WalkCopy.hint(g), WalkCopy.why(g, nov13), WalkCopy.nextLine(g, nov13)?.text ?? "",
                            WalkCopy.orbAccessibilityLabel(g)]
                    + WalkCopy.points(g, nov13).flatMap { [$0.label, $0.detail ?? ""] }
                for line in said { #expect(!line.lowercased().contains("hold"), "“\(line)”") }
            }
        }
    }

    @Test func instructionsUsePlainWords() {
        let banned = ["plant", "flag", "peak", "ground", "ridge", "piece", "walk on", "slide"]
        // By word, so "speak" is not "peak": a word that starts with a banned one ("planted", "flags",
        // "sliding" by its stem "slid"), or the phrase "walk on".
        let stems = banned.filter { !$0.contains(" ") }.map { $0 == "slide" ? "slid" : $0 }
        let said = Set(Self.everythingTheWalkSays())
        #expect(said.count > 120)
        for line in said {
            let words = line.lowercased().split { !$0.isLetter }.map(String.init)
            for stem in stems { #expect(!words.contains { $0.hasPrefix(stem) }, "“\(line)” says “\(stem)”") }
            #expect(!words.joined(separator: " ").contains("walk on"), "“\(line)” says “walk on”")
        }
    }

    /// Every hint and note the walk can show fits on one line: none is longer than `hintMaxLength`.
    @Test func everyHintFitsOnOneLine() {
        #expect(WalkCopy.hintMaxLength == 46)
        var hints: Set<String> = []
        let notes = [WalkCopy.nothingToPlant, WalkCopy.speechOff, WalkCopy.nothingHeard, WalkCopy.speakNow,
                     WalkCopy.ridgeFull]
        for base in Generated.states() {
            for note in [nil] + notes {
                for orb: WalkState.Orb in [.idle, .open, .speaking(live: "x")] {
                    for off in [false, true] {
                        var v = base; v.note = note; v.orb = orb; v.speechIsOff = off
                        hints.insert(WalkCopy.hint(v))
                        if v.level == .year && !v.ground { var g = v; g.ground = true; g.kept = []; hints.insert(WalkCopy.hint(g)) }
                    }
                }
            }
        }
        hints.formUnion(notes)
        for hint in hints { #expect(hint.count <= WalkCopy.hintMaxLength, "“\(hint)” is \(hint.count)") }
        #expect(hints.count >= 12)
    }

    /// The lesson's lines, and the speech-off one.
    @Test func theLightIsTaughtInItsOwnWords() {
        var s = state(step: 1)
        #expect(WalkCopy.teaching(s) == ["Press and hold the light, and say it out loud.",
                                         "Let go when you’re done. To type, tap More."])
        s.speechIsOff = true
        #expect(WalkCopy.teaching(s) == ["Tap More and choose Type it."])
    }

    @Test func theNamedStringsAreExact() {
        #expect(WalkCopy.shortLength == 56)
        #expect(WalkCopy.wordmark == "Symphony")
        #expect(WalkCopy.welcomeTitle == "Let’s start up high and walk down to today.")
        #expect(WalkCopy.welcomeSub == "Name what matters this year, then follow it down to what you’ll do today.")
        #expect(WalkCopy.nothingToPlant == "Nothing added yet. Hold the light to speak.")
        #expect(WalkCopy.speechOff == "Speaking isn’t available here, so type it.")
        #expect(WalkCopy.nothingHeard == "Nothing came through. Type it here.")
        #expect(WalkCopy.speakNow == "Now hold the light and speak.")
        #expect(WalkCopy.ridgeFull == "That’s as many as fit. Tap one to let it go.")
        #expect(WalkCopy.undo == "Undo"); #expect(WalkCopy.moveTo == "Move to"); #expect(WalkCopy.pullUp == "Remove")
        #expect(WalkCopy.typePlaceholder == "Type it, then tap Add"); #expect(WalkCopy.firstThingTag == "FIRST THING")
        #expect(WalkCopy.typeAdd == "Add"); #expect(WalkCopy.typeClose == "Close without adding")
        #expect(WalkCopy.finish == "Finish the walk")
        #expect(WalkCopy.more(2) == "+2 more"); #expect(WalkCopy.moreLabel(2) == "2 more"); #expect(WalkCopy.noArea == "No area")
        #expect(WalkCopy.exampleTag == "EXAMPLE · TAP TO USE"); #expect(WalkCopy.exampleTagShort == "TAP TO USE")
        #expect(WalkLayout.exampleTag(forWidth: 226.5) == "EXAMPLE · TAP TO USE")
        #expect(WalkLayout.exampleTag(forWidth: 150) == "TAP TO USE")
        #expect(WalkCopy.lookBack == "Look back up: that’s your plan."); #expect(WalkCopy.heresToday == "Here’s today.")
        #expect(WalkCopy.showMyDay == "Show my day"); #expect(WalkCopy.lookBackHandle == "See my whole plan")
        #expect(WalkCopy.todayEyebrow == "Today"); #expect(WalkCopy.walkAnother == "Plan another goal down to today")
        #expect(WalkCopy.goToToday == "Open Today")
        #expect(WalkCopy.more == "More"); #expect(WalkCopy.moreLabel == "More choices")
        #expect(WalkCopy.choicesOpen == "open"); #expect(WalkCopy.choicesClosed == "closed")
        #expect(WalkCopy.afterEyebrow("1 of 3") == " · 1 of 3")
        #expect(WalkCopy.thatsTheDay == "That’s the day."); #expect(WalkCopy.nothingToday == "Nothing for today yet.")
        #expect(WalkCopy.nextFlag("Finish the bathroom") == "Next: Finish the bathroom")
        #expect(WalkCopy.forGoal("Feel strong again") == "for Feel strong again")
        #expect(WalkCopy.nextEvent("2:30 pm") == "Next · 2:30 pm")
        #expect(WalkCopy.ringLabel(done: 1, total: 3) == "1 of 3 done")
        #expect(WalkCopy.ring(done: 1, total: 3) == "1/3")
        #expect(WalkCopy.replayButton == "Walk the mountain again")
        #expect(WalkCopy.replayFooter == "Start at the top and walk down to today. What you already planned stays. To stop part-way, tap Leave for now at the top.")
        #expect(WalkCopy.resumeButton == "Pick the walk back up")
        #expect(WalkCopy.walkWaiting == "Your walk is waiting. Pick it back up.")
        #expect(WalkCopy.orbLabelWelcome == "Quick start. One goal, down to today. About 3 minutes.")
        #expect(WalkCopy.orbLabel == "Hold and speak to add a goal. Double tap for other choices.")
        #expect(WalkCopy.orbLabelTask == "Hold and speak to add a task. Double tap for other choices.")
        // Week and Today hold tasks: the light says so there (final review 2, minor).
        for step in 1...5 {
            var s = WalkState(); s.step = step
            #expect(WalkCopy.orbAccessibilityLabel(s) == (step >= 4 ? WalkCopy.orbLabelTask : WalkCopy.orbLabel))
        }
        #expect(WalkCopy.groundWhy == "Tap the ones that matter to you.")
        #expect(WalkCopy.leaveForNow == "Leave for now"); #expect(WalkCopy.leaveDetail == "Your place is kept.")
        #expect(WalkCopy.orbLabelSpeechOff == "Double tap to type it. The other choices are in the actions.")
        #expect(WalkCopy.orbLabelGround == "Double tap for other choices.")
        var ground = WalkState(); ground.step = 1; ground.ground = true
        #expect(WalkCopy.orbAccessibilityLabel(ground) == "Double tap for other choices.")
        #expect(WalkCopy.nextGoal == "Next goal")
        #expect(WalkCopy.hintFirst == "Hold the light and speak.")
        #expect(WalkCopy.hintAnother == "Hold the light to add another.")
        #expect(WalkCopy.hintGround == "Tap the ones that matter, then Next.")
        #expect(WalkCopy.hintGroundNone == "Tap the ones that matter.")
        // It names the Next line's own words there (final review 2, minor).
        #expect(WalkCopy.hintStartHere == "Tap “\(WalkCopy.startWithThis)”, or hold to speak.")
        #expect(WalkCopy.hintStartHere.count <= WalkCopy.hintMaxLength)
        #expect(WalkCopy.hintFirstThing == "Tap “\(WalkCopy.finish)”, or hold to change it.")
        #expect(WalkCopy.hintFirstThing.count == 44 && WalkCopy.hintFirstThing.count <= WalkCopy.hintMaxLength)
        #expect(WalkCopy.hintSpeaking == "Let go when you’ve said it")
        #expect(WalkCopy.hintOpen == "Tap one, or tap the light to close")
        #expect(WalkCopy.hintSpeechOff == "Tap the light and type.")
        #expect(WalkCopy.rowDone == "Done"); #expect(WalkCopy.rowOpen == "Not done")
        #expect(WalkLevel.allCases.map(WalkCopy.levelName) == ["Year", "Season", "Month", "Week", "Today"])
    }

    /// S35: with a first thing the goal above, the Next line finishes the walk, the hint says how, and
    /// the question says the day starts with it.
    @Test func todaySaysHowTheWalkEnds() {
        let gym = item(.week, "Gym induction")
        var t = state(step: 5); t.items = [gym]; t.focus[.today] = gym.id
        #expect(WalkCopy.question(t, nov13) == "Start the day with “Gym induction”?")
        t.firstThing = gym.id
        #expect(WalkCopy.nextLine(t, nov13) == WalkCopy.NextLine(text: WalkCopy.finish, action: .next, skip: false))
        #expect(WalkCopy.hint(t) == WalkCopy.hintFirstThing)
        #expect(WalkCopy.question(t, nov13) == "You’ll start the day with “Gym induction”.")
    }

    /// S35: arriving on Today puts up no note; the calendar is offered only on the light's right point.
    @Test func noCalendarNoteOnToday() {
        var s = state(step: 4); s.taught = true                   // the light was taught on an earlier step
        var env = WalkEnv(periods: nov13, now: day(2026, 11, 13))
        env.canAskCalendar = true
        let effects = s.act(.next, env)
        #expect(s.step == 5 && s.calendarOffer)
        #expect(s.note == nil && effects == [.save])
        #expect(WalkCopy.hint(s) == WalkCopy.hintFirst)
        #expect(WalkCopy.points(s, nov13).contains { $0.at == .e && $0.action == .calendar })
    }

    /// S36: after a skip the words point at nothing missing: Week with no month goal asks plainly, and
    /// an area with nothing on this level yet is told how to add the first one.
    @Test func wordsAfterASkipPointAtNothingMissing() {
        #expect(WalkCopy.question(state(step: 4), nov13) == "What’s one thing for this week?")
        let health = WalkArea(id: UUID(), name: "Health"), home = WalkArea(id: UUID(), name: "Home")
        var s = state(step: 2); s.areas = [health, home]; s.kept = [health.id, home.id]
        s.items = [WalkItem(id: UUID(), level: .season, title: "Lift twice a week", areaId: health.id)]
        s.focusArea = home.id
        #expect(WalkCopy.hint(s) == WalkCopy.hintFirst)               // Home has nothing on Season yet
        s.focusArea = health.id
        #expect(WalkCopy.hint(s) == WalkCopy.hintAnother)
    }

    /// F23: Undo's VoiceOver label (the pill's and the light's top point's) says what the newest step back undoes.
    @Test func undoSaysWhatItUndoes() {
        let health = WalkArea(id: UUID(), name: "Health"), side = WalkArea(id: UUID(), name: "Side projects and making")
        let run = WalkItem(id: UUID(), level: .year, title: "Run a 5K", areaId: health.id)
        var s = state(step: 1); s.areas = [health, side]; s.kept = [health.id]; s.items = [run]
        #expect(WalkCopy.undoLabel(s) == nil)
        let cases: [(WalkUndoEntry, String)] = [
            (.plant(run.id), "Undo adding “Run a 5K”"),
            (.keep(health.id), "Undo keeping Health"),
            (.unkeep(health.id, index: 0), "Undo letting go of Health"),
            (.nameArea(side), "Undo adding Side projects and making"),
            (.move(run.id, from: nil, keptAdded: nil), "Undo moving “Run a 5K”"),
            (.pullUp(run, index: 0, wasFirstThing: false, walkedAt: nil), "Undo removing “Run a 5K”"),
            (.firstThing(previous: nil, created: run.id), "Undo the first thing"),
        ]
        for (entry, words) in cases {
            s.undo = [.keep(side.id), entry]                   // the newest is the one undone
            #expect(WalkCopy.undoLabel(s) == words, "\(entry)")
        }
    }

    /// F23: VoiceOver reads the light's Undo point (and its custom action) as what it undoes; every other
    /// point by its own label.
    @Test func theUndoPointSaysWhatItUndoes() throws {
        let health = WalkArea(id: UUID(), name: "Health")
        let run = WalkItem(id: UUID(), level: .year, title: "Run a 5K", areaId: health.id)
        var s = state(step: 1); s.areas = [health]; s.kept = [health.id]; s.focusArea = health.id
        s.items = [run]; s.undo = [.plant(run.id)]
        let points = WalkCopy.points(s, nov13)
        let undo = try #require(points.first { $0.action == .undo })
        #expect(WalkCopy.pointLabel(undo, s) == "Undo adding “Run a 5K”")
        for point in points where point.action != .undo { #expect(WalkCopy.pointLabel(point, s) == point.label) }
    }

    /// F24: the Move row's chips and Remove say what they do to which flag, its title as the question quotes it.
    @Test func moveAndRemoveSayWhatTheyDo() {
        #expect(WalkCopy.moveLabel("Run a 5K", to: "Work") == "Move “Run a 5K” to Work")
        #expect(WalkCopy.removeLabel("Run a 5K") == "Remove “Run a 5K”")
        let long = String(repeating: "x", count: 80)
        #expect(WalkCopy.removeLabel(long) == "Remove “\(WalkCopy.short(long))”")
        #expect(WalkCopy.moveLabel(long, to: "Home") == "Move “\(WalkCopy.short(long))” to Home")
    }

    /// A flag's words are announced once, as they are let go: on letting go with words,
    /// when the first words arrive after letting go with none, or, when the session had
    /// already ended, as the flag is planted. Never the partial words, never twice.
    @Test func eachFlagIsAnnouncedOnce() {
        func with(_ orb: WalkState.Orb, items: Int = 0) -> WalkState {
            var s = state(step: 1)
            s.orb = orb
            s.items = (0..<items).map { _ in item(.year, "Feel strong again") }
            return s
        }
        let say = WalkCopy.announcement
        // Let go while speaking: the words, once; the plant that follows says nothing more.
        #expect(say(with(.speaking(live: "feel strong")), with(.finishing(live: "feel strong"))) == "feel strong")
        #expect(say(with(.finishing(live: "feel strong")), with(.finishing(live: "feel strong again"))) == nil)
        #expect(say(with(.finishing(live: "feel strong again")), with(.idle, items: 1)) == nil)
        // Let go with nothing yet: announced when the words arrive.
        #expect(say(with(.speaking(live: "")), with(.finishing(live: ""))) == nil)
        #expect(say(with(.finishing(live: "")), with(.finishing(live: "feel strong"))) == "feel strong")
        // The session ended by itself, then the person let go: announced as it is planted.
        #expect(say(with(.speaking(live: "feel strong")), with(.idle, items: 1)) == "feel strong")
        // A cancel, or sliding out to the points: nothing planted, nothing said.
        #expect(say(with(.speaking(live: "feel strong")), with(.idle)) == nil)
        #expect(say(with(.speaking(live: "feel strong")), with(.holding(hover: .n))) == nil)
        #expect(say(with(.speaking(live: "fee")), with(.speaking(live: "feel"))) == nil)
        // On the ground the words name a peak: planted when a peak is kept.
        var ground = state(step: 1)
        ground.ground = true
        ground.orb = .speaking(live: "garden")
        var named = ground
        named.orb = .idle
        named.kept = [UUID()]
        #expect(say(ground, named) == "garden")
    }

    @Test func whatVoiceOverSays() {
        let b = WalkCopy.bannerLabel
        #expect(b("Run a 5K", .year, nil, .mine) == "Year: Run a 5K, tap to move or remove")
        #expect(b("Gym", .week, "TUESDAY", .mine) == "Week: Gym, Tuesday, tap to move or remove")
        #expect(b("Gym", .week, "MON 23", .plain) == "Week: Gym, Mon 23")
        #expect(b("Run a 5K", .year, nil, .plain) == "Year: Run a 5K")
        #expect(b("Run a 5K", .year, nil, .focused) == "Year: Run a 5K, the goal this step is about")
        #expect(b("Run a 5K", .year, nil, .focusedOfSeveral)
                == "Year: Run a 5K, the goal this step is about, tap for the next one here")
        #expect(!WalkCopy.BannerRole.focused.taps && WalkCopy.BannerRole.focusedOfSeveral.taps)
        // On Today, standing in an area whose only other goal in the round is the nameless post's first thing.
        #expect(b("Call the shop", .week, nil, .focusedThenFirstThing)
                == "Week: Call the shop, the goal this step is about, tap for the first thing")
        #expect(WalkCopy.BannerRole.focusedThenFirstThing.taps)
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThing) == "Today: Gym induction, first thing")
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThingMine)
                == "Today: Gym induction, first thing, tap to remove")
        // Already chosen for Remove: a tap lets it go (Today rule e: the label says what the tap does).
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThingChosen)
                == "Today: Gym induction, first thing, chosen, tap to let go")
        #expect(WalkCopy.tapToLetGo == "tap to let go")
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThingFocusable)  // not planted by the walk
                == "Today: Gym induction, first thing, tap to focus")
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThingFocused)    // the goal above
                == "Today: Gym induction, first thing, tap for the next one here")
        #expect(b("Run a 5K", .year, nil, .example) == "Example: Run a 5K, tap to make it yours")
        #expect(b("", .year, nil, .stub(3)) == "3 more, tap to show")
        #expect(WalkCopy.areaHint(ground: true, kept: false, focused: false) == "Tap to keep")
        #expect(WalkCopy.areaHint(ground: true, kept: true, focused: false) == "Tap to let go")
        #expect(WalkCopy.areaHint(ground: false, kept: true, focused: false) == "Tap to walk there")
        #expect(WalkCopy.areaHint(ground: false, kept: true, focused: true) == "You are here")
        #expect(WalkCopy.rowLabel("Lift, 30 minutes", forGoal: "Feel strong again") == "Lift, 30 minutes, for Feel strong again")
        #expect(WalkCopy.rowLabel("Lift, 30 minutes", forGoal: nil) == "Lift, 30 minutes")
        #expect(WalkCopy.typeFieldLabel == "Your words")         // the one-line field, once it holds text
    }

    /// Only a banner whose label says what a tap does takes a tap; the rest are read as plain text.
    @Test func aBannerTakesATapOnlyWhenItsLabelSaysSo() {
        let roles: [WalkCopy.BannerRole] = [.mine, .plain, .focused, .focusedOfSeveral, .focusedThenFirstThing, .firstThing,
                                            .firstThingMine, .firstThingChosen, .firstThingFocusable, .firstThingFocused,
                                            .example, .stub(2)]
        for role in roles {
            let label = WalkCopy.bannerLabel("Gym", level: .week, tag: nil, role: role)
            #expect(role.taps == label.contains(", tap "), "\(role)")
        }
        #expect(!WalkCopy.BannerRole.plain.taps)
        #expect(!WalkCopy.BannerRole.firstThing.taps)
    }

    /// The light's VoiceOver label: Welcome's choice, then the two verbs on every other step.
    @Test func theLightSaysWhatItDoes() {
        #expect(WalkCopy.orbAccessibilityLabel(state(step: 0)) == "Quick start. One goal, down to today. About 3 minutes.")
        for step in 1...5 {
            // A goal on Year, Season and Month; a task on Week and Today, which hold tasks.
            #expect(WalkCopy.orbAccessibilityLabel(state(step: step)) == (step >= 4 ? WalkCopy.orbLabelTask : WalkCopy.orbLabel))
            var off = state(step: step); off.speechIsOff = true
            #expect(WalkCopy.orbAccessibilityLabel(off) == "Double tap to type it. The other choices are in the actions.")
        }
    }

    /// The ending's date and the next event's time, in the walk's own calendar and words.
    @Test func theEndingsDateAndTimeReadAsTheWalksOwn() {
        #expect(WalkCopy.endingDate(nov13) == "Friday, 13 November")
        let cal = PlanCalendar.calendar
        let afternoon = cal.date(bySettingHour: 14, minute: 30, second: 0, of: day(2026, 11, 13))!
        let morning = cal.date(bySettingHour: 9, minute: 5, second: 0, of: day(2026, 11, 13))!
        #expect(WalkCopy.nextEventTime(afternoon) == "2:30 pm")
        #expect(WalkCopy.nextEventTime(morning) == "9:05 am")
        #expect(WalkCopy.nextEvent(WalkCopy.nextEventTime(afternoon)) == "Next · 2:30 pm")
    }
}
