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
        #expect(WalkCopy.why(g, p) == "Tap the ones that matter to you. To add your own, hold the light and say it.")
        let y = state(step: 1)
        #expect(WalkCopy.question(y, p) == "What would make the year ahead a good one?")
        #expect(WalkCopy.why(y, p) == "Something that would feel true twelve months from now. Big or small.")
        #expect(WalkCopy.eyebrow(y, p) == "The year ahead")
        #expect(WalkCopy.eyebrow(state(step: 1, depth: .full), p) == "The year ahead · area by area")
        let se = state(step: 2)
        #expect(WalkCopy.eyebrow(se, p) == "Winter · Dec 1 to Feb 28")
        #expect(WalkCopy.question(se, p) == "And this winter? What’s it about?")
        #expect(WalkCopy.why(se, p) == "A season is a few months. What is this stretch really for?")
        let m = state(step: 3)
        #expect(WalkCopy.eyebrow(m, p) == "November")
        #expect(WalkCopy.question(m, p) == "What’s one thing for the rest of November?")
        #expect(WalkCopy.why(m, p) == "Small enough to finish by the 30th.")
        let w = state(step: 4)
        #expect(WalkCopy.eyebrow(w, p) == "This week · to Sat 14")
        #expect(WalkCopy.question(w, p) == "What would move that forward this week?")
        #expect(WalkCopy.why(w, p) == "Say the day for each: “the deposit, today.”")
        let t = state(step: 5)
        #expect(WalkCopy.eyebrow(t, p) == "Friday, 13 November")
        #expect(WalkCopy.question(t, p) == "What’s the first thing you’ll do today?")
        #expect(WalkCopy.why(t, p) == "Just one. The rest of today can wait its turn.")
    }

    @Test func aComingMonthAndACurrentSeason() {
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
        var y = state(step: 1); y.areas = [home, people, own]
        y.focusArea = people.id
        #expect(WalkCopy.question(y, p) == "What about the people in your life, this year?")
        y.focusArea = own.id
        #expect(WalkCopy.question(y, p) == "What about creative work, this year?")
        for (name, phrase) in [("Health", "your health"), ("Home", "home"), ("Work", "work"), ("Money", "money"), ("Fun", "fun")] {
            #expect(WalkCopy.phrase(for: name) == phrase)
        }
        let goal = item(.year, "Feel strong again")
        var s = state(step: 2); s.items = [goal]; s.focus[.season] = goal.id
        #expect(WalkCopy.question(s, p) == "What part of “Feel strong again” belongs to this winter?")
        let sg = item(.season, "Get fit"), mg = item(.month, "Join the gym"), wg = item(.week, "Gym induction")
        var m = state(step: 3); m.items = [sg]; m.focus[.month] = sg.id
        #expect(WalkCopy.question(m, p) == "What part of “Get fit” belongs to November?")
        var w = state(step: 4); w.items = [mg]; w.focus[.week] = mg.id
        #expect(WalkCopy.question(w, p) == "For “Join the gym”, what happens this week?")
        var t = state(step: 5); t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.question(t, p) == "Start the day with “Gym induction”?")
    }

    @Test func theTapFlagsSentence() {
        let p = nov13
        var s = state(step: 3); s.items = [item(.season, "Get fit")]
        #expect(WalkCopy.why(s, p) == "Small enough to finish by the 30th. Tap one above to focus on it.")
        s.focus[.month] = s.items[0].id
        #expect(WalkCopy.why(s, p) == "Small enough to finish by the 30th.")
        #expect(WalkCopy.why(state(step: 3), p) == "Small enough to finish by the 30th.")
    }

    @Test func placedAndExamples() {
        #expect(WalkCopy.placed("Home") == "That sounded like home, so it went under Home.")
        #expect(WalkCopy.examples(.year) == ["Run a 5K", "Read a book a month", "Pay off the car"])
        #expect(WalkCopy.examples(.season) == ["Clear out the garage", "Get outside every weekend"])
        #expect(WalkCopy.examples(.month) == ["Book the plumber", "Two early nights a week"])
        #expect(WalkCopy.examples(.week) == ["Call the tile shop", "Gym on Tuesday"])
        #expect(WalkCopy.examples(.today).isEmpty)
    }

    @Test func shortQuotesFortyCharacters() {
        let forty = String(repeating: "a", count: 40)
        #expect(WalkCopy.short(forty) == forty)
        for n in [41, 70] {
            #expect(WalkCopy.short(String(repeating: "b", count: n)) == String(repeating: "b", count: 39) + "…")
        }
    }

    @Test func everyHintLine() {
        // Welcome: its choices are always open.
        var s = state(step: 0)
        #expect(WalkCopy.hint(s) == "Choose how to start")
        s.orb = .holding(hover: .w); #expect(WalkCopy.hint(s) == "Choose how to start")
        // A step: nothing added yet, the two verbs.
        var y = state(step: 1)
        #expect(WalkCopy.hint(y) == "Hold the light and say it. Tap the light for other choices.")
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
        #expect(WalkCopy.hint(g) == "Tap the ones that matter, then tap Next.")
        #expect(WalkCopy.hint(state(step: 2)) == "Hold the light and say it. Tap the light for other choices.")
        var planted = state(step: 2); planted.items = [item(.season, "Get fit")]
        #expect(WalkCopy.hint(planted) == "Hold to add another. Tap Next when you’re done.")
        let wg = item(.week, "Gym induction")
        var t = state(step: 5); t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.hint(t) == "Tap Next to start with this one, or hold and say something else.")
        t.firstThing = wg.id
        #expect(WalkCopy.hint(t) == "That’s your first thing. Tap Finish.")
        // Speech off for this walk: a tap types, a hold opens the other choices.
        var off = state(step: 1); off.speechIsOff = true
        #expect(WalkCopy.hint(off) == "Tap the light to type it. Hold it for other choices.")
        off.items = [item(.year, "Run a 5K")]
        #expect(WalkCopy.hint(off) == "Tap the light to type it. Hold it for other choices.")
    }

    private func labels(_ s: WalkState, _ p: WalkPeriods = nov13) -> [String] { WalkCopy.points(s, p).map(\.label) }
    private func south(_ s: WalkState, _ p: WalkPeriods = nov13) -> WalkCopy.Point? { WalkCopy.points(s, p).first { $0.at == .s } }
    private func north(_ s: WalkState, _ p: WalkPeriods = nov13) -> String? { WalkCopy.points(s, p).first { $0.at == .n }?.label }

    @Test func welcomePoints() {
        let pts = WalkCopy.points(state(step: 0), nov13)
        #expect(pts.contains(WalkCopy.Point(at: .w, label: "Quick start", action: .quick, symbol: "figure.walk",
                                            detail: "One goal, down to today. About 3 minutes.")))
        #expect(pts.contains(WalkCopy.Point(at: .e, label: "Plan my whole year", action: .full, symbol: "mountain.2",
                                            detail: "Every part of life. About 25 minutes.")))
        #expect(pts.contains(WalkCopy.Point(at: .n, label: "Not now", action: .notNow, symbol: "xmark",
                                            detail: "Go straight to Today.")))
        #expect(pts.count == 3)
        var s = state(step: 0); s.undo = [.keep(UUID())]
        #expect(WalkCopy.points(s, nov13).count == 3)
    }

    @Test func groundPoints() {
        var g = state(step: 1); g.ground = true
        #expect(WalkCopy.points(g, nov13).map(\.at) == [.n, .se, .s, .w])
        #expect(labels(g) == ["Back to the start", "Leave for now", "Skip this step", "Type your own"])
        #expect(WalkCopy.points(g, nov13).map(\.action) == [.back, .leave, .next, .type])
        g.kept = [UUID()]
        #expect(labels(g) == ["Back to the start", "Leave for now", "Next: your goals", "Type your own"])
    }

    @Test func stepPoints() {
        let y = WalkCopy.points(state(step: 1), nov13)
        #expect(y.map(\.label) == ["Back to your areas", "Ask about another area", "Show examples", "Leave for now",
                                   "Skip this step", "Type it"])
        #expect(y.map(\.at) == [.n, .ne, .e, .se, .s, .w])
        #expect(y.map(\.action) == [.back, .nudge, .examples, .leave, .next, .type])
        #expect(y.map(\.symbol) == ["arrow.up", "arrow.triangle.2.circlepath", "flag", "pause", "arrow.down", "keyboard"])
        #expect(y.map(\.detail) == [nil, nil, nil, "Your place is kept.", nil, nil])
        var s = state(step: 3)
        #expect(labels(s) == ["Back to this winter", "Ask about another goal", "Show examples", "Leave for now",
                              "Skip this step", "Type it"])
        s.items = [item(.month, "x")]; s.examplesOn = [3]
        #expect(labels(s) == ["Back to this winter", "Ask about another goal", "Hide examples", "Leave for now",
                              "Next: this week", "Type it"])
        s.undo = [.plant(UUID())]
        #expect(WalkCopy.points(s, nov13).last == WalkCopy.Point(at: .nw, label: "Undo", action: .undo, symbol: "arrow.uturn.backward"))
        #expect(WalkCopy.points(state(step: 6), nov13).isEmpty)
    }

    @Test func todayPoints() {
        var t = state(step: 5)
        #expect(labels(t) == ["Back to this week", "Ask about another goal", "Leave for now", "Skip this step", "Type it"])
        t.calendarOffer = true
        #expect(WalkCopy.points(t, nov13).contains(WalkCopy.Point(at: .e, label: "Show my calendar on Today",
                                                                  action: .calendar, symbol: "calendar")))
        let wg = item(.week, "Gym induction")
        t.items = [wg]; t.focus[.today] = wg.id
        #expect(south(t) == WalkCopy.Point(at: .s, label: "Start with this one", action: .startThere, symbol: "arrow.down"))
        t.firstThing = wg.id
        #expect(south(t)?.label == "Finish")
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
        let expected = [1: "Next: this winter", 2: "Next: November", 3: "Next: this week", 4: "Next: today", 5: "Finish"]
        for (step, words) in expected {
            #expect(WalkCopy.nextLine(added(step), p) == WalkCopy.NextLine(text: words, action: .next, skip: false), "step \(step)")
            #expect(south(added(step))?.label == words)
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
        #expect(WalkCopy.nextLine(season, p)?.text == "Next: your next goal")
        // Not shown while the compass is open, a press is on, or the field is open.
        var open = added(2); open.orb = .open
        #expect(WalkCopy.nextLine(open, p) == nil)
        var typing = added(2); typing.typing = ""
        #expect(WalkCopy.nextLine(typing, p) == nil)
        #expect(WalkCopy.nextLine(state(step: 0), p) == nil && WalkCopy.nextLine(state(step: 6), p) == nil)

        let backs = [2: "Back to the year", 3: "Back to this winter", 4: "Back to November", 5: "Back to this week"]
        for (step, words) in backs { #expect(north(state(step: step)) == words) }
        #expect(north(state(step: 1)) == "Back to your areas")
        var ground = state(step: 1); ground.ground = true
        #expect(north(ground) == "Back to the start")
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

    /// Instructions never use the mountain's own words: every hint, compass point, Next line,
    /// why line and note the walk can show, in the states the walk reaches. The big titles
    /// (`question`, `eyebrow`, `welcomeTitle`, `lookBack`) keep the picture and are not checked.
    @Test func instructionsUsePlainWords() {
        let banned = ["plant", "flag", "peak", "ground", "ridge", "piece", "walk on", "slide"]
        let wg = item(.week, "Gym induction"), goal = item(.year, "Run a 5K")
        var states: [WalkState] = [state(step: 0)]
        for step in 1...6 {
            var s = state(step: step)
            states.append(s)
            if let level = s.level { s.items = [item(level == .today ? .week : level, "Something")] }
            states.append(s)
            s.undo = [.plant(UUID())]; s.examplesOn = [step]; s.calendarOffer = true; s.speechIsOff = true
            states.append(s)
        }
        var g = state(step: 1); g.ground = true; states.append(g); g.kept = [UUID()]; states.append(g)
        var t = state(step: 5); t.items = [wg]; t.focus[.today] = wg.id; states.append(t); t.firstThing = wg.id; states.append(t)
        var f = state(step: 2); f.items = [goal]; states.append(f)
        let notes = [WalkCopy.nothingToPlant, WalkCopy.speechOff, WalkCopy.nothingHeard, WalkCopy.speakNow,
                     WalkCopy.ridgeFull, WalkCopy.calendarLine, WalkCopy.placed("Home"), WalkCopy.welcomeSub,
                     WalkCopy.typePlaceholder, WalkCopy.undo, WalkCopy.moveTo, WalkCopy.pullUp, WalkCopy.more(1),
                     WalkCopy.exampleTag, WalkCopy.exampleTagShort, WalkCopy.showMyDay, WalkCopy.lookBackHandle,
                     WalkCopy.walkAnother, WalkCopy.nextFlag("Run a 5K"), WalkCopy.goToToday, WalkCopy.replayButton,
                     WalkCopy.replayFooter, WalkCopy.resumeButton, WalkCopy.walkWaiting, WalkCopy.orbLabel,
                     WalkCopy.orbLabelWelcome]
        var said: [String] = notes
        for base in states {
            for orb: WalkState.Orb in [.idle, .open, .holding(hover: nil), .speaking(live: ""), .finishing(live: "")] {
                var s = base; s.orb = orb
                said.append(WalkCopy.hint(s))
                said += WalkCopy.points(s, nov13).flatMap { [$0.label, $0.detail ?? ""] }
                said.append(WalkCopy.nextLine(s, nov13)?.text ?? "")
                said.append(WalkCopy.why(s, nov13))
            }
        }
        // By word, so "speak" is not "peak": a word that starts with a banned one ("planted", "flags",
        // "sliding" by its stem "slid"), or the phrase "walk on".
        let stems = banned.filter { !$0.contains(" ") }.map { $0 == "slide" ? "slid" : $0 }
        for line in said {
            let words = line.lowercased().split { !$0.isLetter }.map(String.init)
            for stem in stems { #expect(!words.contains { $0.hasPrefix(stem) }, "“\(line)” says “\(stem)”") }
            #expect(!words.joined(separator: " ").contains("walk on"), "“\(line)” says “walk on”")
        }
    }

    @Test func theNamedStringsAreExact() {
        #expect(WalkCopy.shortLength == 40)
        #expect(WalkCopy.wordmark == "Symphony")
        #expect(WalkCopy.welcomeTitle == "Let’s start up high and walk down to today.")
        #expect(WalkCopy.welcomeSub == "Name what matters this year, then follow it down to what you’ll do today.")
        #expect(WalkCopy.nothingToPlant == "Nothing added yet. Hold the light and say it, or tap it and choose Type it.")
        #expect(WalkCopy.speechOff == "Speaking isn’t available here, so type it.")
        #expect(WalkCopy.nothingHeard == "Nothing came through. Type it here.")
        #expect(WalkCopy.speakNow == "Now hold the light and speak.")
        #expect(WalkCopy.ridgeFull == "That’s as many as fit. Tap one to let it go first.")
        #expect(WalkCopy.calendarLine == "See your calendar on Today too")
        #expect(WalkCopy.undo == "Undo"); #expect(WalkCopy.moveTo == "Move to"); #expect(WalkCopy.pullUp == "Remove")
        #expect(WalkCopy.typePlaceholder == "Type it, then return"); #expect(WalkCopy.firstThingTag == "FIRST THING")
        #expect(WalkCopy.more(2) == "+2 more"); #expect(WalkCopy.stubCount(2) == "+2")
        #expect(WalkCopy.exampleTag == "EXAMPLE · TAP TO USE"); #expect(WalkCopy.exampleTagShort == "TAP TO USE")
        #expect(WalkCopy.exampleTag(forWidth: 124) == "EXAMPLE · TAP TO USE")
        #expect(WalkCopy.exampleTag(forWidth: 99) == "TAP TO USE")
        #expect(WalkCopy.lookBack == "Look back up: that’s your plan."); #expect(WalkCopy.heresToday == "Here’s today.")
        #expect(WalkCopy.showMyDay == "Show my day"); #expect(WalkCopy.lookBackHandle == "See my whole plan")
        #expect(WalkCopy.todayEyebrow == "Today"); #expect(WalkCopy.walkAnother == "Plan another goal down to today")
        #expect(WalkCopy.goToToday == "Go to Today")
        #expect(WalkCopy.thatsTheDay == "That’s the day."); #expect(WalkCopy.nothingToday == "Nothing planted for today yet.")
        #expect(WalkCopy.nextFlag("Finish the bathroom") == "Next: Finish the bathroom")
        #expect(WalkCopy.forGoal("Feel strong again") == "for Feel strong again")
        #expect(WalkCopy.nextEvent("2:30 pm") == "Next · 2:30 pm")
        #expect(WalkCopy.ringLabel(done: 1, total: 3) == "1 of 3 done")
        #expect(WalkCopy.ring(done: 1, total: 3) == "1/3")
        #expect(WalkCopy.replayButton == "Walk the mountain again")
        #expect(WalkCopy.replayFooter == "Start at the top and walk down to today. What you already planned stays. To stop part-way, tap the light and choose Leave for now.")
        #expect(WalkCopy.resumeButton == "Pick the walk back up")
        #expect(WalkCopy.walkWaiting == "Your walk is waiting. Pick it back up.")
        #expect(WalkCopy.orbLabelWelcome == "Choose how to start")
        #expect(WalkCopy.orbLabel == "Hold and speak to add a goal. Double tap for other choices.")
        #expect(WalkCopy.groundWhy == "Tap the ones that matter to you. To add your own, hold the light and say it.")
        #expect(WalkCopy.leaveForNow == "Leave for now"); #expect(WalkCopy.leaveDetail == "Your place is kept.")
        #expect(WalkCopy.rowDone == "Done"); #expect(WalkCopy.rowOpen == "Not done")
        #expect(WalkLevel.allCases.map(WalkCopy.levelName) == ["Year", "Season", "Month", "Week", "Today"])
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
        #expect(b("Run a 5K", .year, nil, .focusable) == "Year: Run a 5K, tap to focus")
        #expect(b("Run a 5K", .year, nil, .focused) == "Year: Run a 5K, focused, tap to let go")
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThing) == "Today: Gym induction, first thing")
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThingMine)
                == "Today: Gym induction, first thing, tap to remove")
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThingFocusable)
                == "Today: Gym induction, first thing, tap to focus")       // not planted by the walk
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThingFocused)
                == "Today: Gym induction, first thing, focused, tap to let go")
        #expect(b("Run a 5K", .year, nil, .example) == "Example: Run a 5K, tap to make it yours")
        #expect(b("", .year, nil, .stub(3)) == "3 more, tap to show")
        #expect(WalkCopy.areaHint(ground: true, kept: false, focused: false) == "Tap to keep")
        #expect(WalkCopy.areaHint(ground: true, kept: true, focused: false) == "Tap to let go")
        #expect(WalkCopy.areaHint(ground: false, kept: true, focused: false) == "Tap to look closer")
        #expect(WalkCopy.areaHint(ground: false, kept: true, focused: true) == "Tap to step back")
        #expect(WalkCopy.rowLabel("Lift, 30 minutes", forGoal: "Feel strong again") == "Lift, 30 minutes, for Feel strong again")
        #expect(WalkCopy.rowLabel("Lift, 30 minutes", forGoal: nil) == "Lift, 30 minutes")
        #expect(WalkCopy.typeFieldLabel == "Your words")         // the one-line field, once it holds text
    }

    /// Only a banner whose label says what a tap does takes a tap; the rest are read as plain text.
    @Test func aBannerTakesATapOnlyWhenItsLabelSaysSo() {
        let roles: [WalkCopy.BannerRole] = [.mine, .plain, .focusable, .focused, .firstThing, .firstThingMine,
                                            .firstThingFocusable, .firstThingFocused, .example, .stub(2)]
        for role in roles {
            let label = WalkCopy.bannerLabel("Gym", level: .week, tag: nil, role: role)
            #expect(role.taps == label.contains("tap to"), "\(role)")
        }
        #expect(!WalkCopy.BannerRole.plain.taps)
        #expect(!WalkCopy.BannerRole.firstThing.taps)
    }

    /// The light's VoiceOver label: Welcome's choice, then the two verbs on every other step.
    @Test func theLightSaysWhatItDoes() {
        #expect(WalkCopy.orbAccessibilityLabel(state(step: 0)) == "Choose how to start")
        for step in 1...5 {
            #expect(WalkCopy.orbAccessibilityLabel(state(step: step)) == "Hold and speak to add a goal. Double tap for other choices.")
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
