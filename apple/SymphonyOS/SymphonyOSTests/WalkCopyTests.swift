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
        #expect(WalkCopy.why(g, p) == "Tap the peaks to keep them. Hold the light to name your own.")
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
        #expect(WalkCopy.question(s, p) == "For “Feel strong again”, what’s this winter’s piece?")
        let sg = item(.season, "Get fit"), mg = item(.month, "Join the gym"), wg = item(.week, "Gym induction")
        var m = state(step: 3); m.items = [sg]; m.focus[.month] = sg.id
        #expect(WalkCopy.question(m, p) == "For “Get fit”, what’s November’s piece?")
        var w = state(step: 4); w.items = [mg]; w.focus[.week] = mg.id
        #expect(WalkCopy.question(w, p) == "For “Join the gym”, what happens this week?")
        var t = state(step: 5); t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.question(t, p) == "Start the day with “Gym induction”?")
    }

    @Test func theTapFlagsSentence() {
        let p = nov13
        var s = state(step: 3); s.items = [item(.season, "Get fit")]
        #expect(WalkCopy.why(s, p) == "Small enough to finish by the 30th. Tap one of your flags to focus on it.")
        s.focus[.month] = s.items[0].id
        #expect(WalkCopy.why(s, p) == "Small enough to finish by the 30th.")
        #expect(WalkCopy.why(state(step: 3), p) == "Small enough to finish by the 30th.")
    }

    @Test func placedAndExamples() {
        #expect(WalkCopy.placed("Home") == "That sounded like home, so it went on the Home peak.")
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
        var s = state(step: 0)
        #expect(WalkCopy.hint(s) == "Hold the light to begin")
        s.note = "A note"; #expect(WalkCopy.hint(s) == "A note"); s.note = nil
        s.typing = ""; #expect(WalkCopy.hint(s) == ""); s.typing = nil
        // While the compass points show, the line is blank (the mockup): a note gives way, and is back once they close.
        s.orb = .holding(hover: .s); #expect(WalkCopy.hint(s) == "")
        s.orb = .holding(hover: nil); #expect(WalkCopy.hint(s) == "")
        s.orb = .open; #expect(WalkCopy.hint(s) == "")
        s.note = "A note"; #expect(WalkCopy.hint(s) == "")
        s.orb = .idle; #expect(WalkCopy.hint(s) == "A note"); s.note = nil
        s.orb = .speaking(live: "x"); #expect(WalkCopy.hint(s) == "Let go to plant it")
        // Waiting for the last words after letting go: blank, a note included.
        s.orb = .finishing(live: "x"); #expect(WalkCopy.hint(s) == "")
        s.note = "A note"; #expect(WalkCopy.hint(s) == ""); s.note = nil
        var g = state(step: 1); g.ground = true
        #expect(WalkCopy.hint(g) == "Tap the peaks that matter")
        #expect(WalkCopy.hint(state(step: 2)) == "Hold the light and speak · slide to its edge for more")
        var planted = state(step: 2); planted.items = [item(.season, "Get fit")]
        #expect(WalkCopy.hint(planted) == "Hold to plant another · slide down to walk on")
        let wg = item(.week, "Gym induction")
        var t = state(step: 5); t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.hint(t) == "Slide down to start there · hold to say something else")
        t.firstThing = wg.id
        #expect(WalkCopy.hint(t) == "That’s your first thing · slide down to walk on")
    }

    private func labels(_ s: WalkState) -> [String] { WalkCopy.points(s).map(\.label) }

    @Test func welcomePoints() {
        let pts = WalkCopy.points(state(step: 0))
        #expect(pts.contains(WalkCopy.Point(at: .s, label: "Quick start", action: .quick, symbol: "figure.walk")))
        #expect(pts.contains(WalkCopy.Point(at: .e, label: "Plan my whole year", action: .full, symbol: "mountain.2")))
        #expect(pts.contains(WalkCopy.Point(at: .n, label: "Not now", action: .notNow, symbol: "xmark")))
        #expect(pts.count == 3)
        var s = state(step: 0); s.undo = [.keep(UUID())]
        #expect(WalkCopy.points(s).count == 3)
    }

    @Test func groundPoints() {
        var g = state(step: 1); g.ground = true
        #expect(WalkCopy.points(g).map(\.at) == [.n, .s, .w])
        #expect(labels(g) == ["Start", "Skip", "Name your own"])
        #expect(WalkCopy.points(g).map(\.action) == [.back, .next, .type])
        g.kept = [UUID()]
        #expect(labels(g) == ["Start", "Plant goals", "Name your own"])
    }

    @Test func stepPoints() {
        let y = WalkCopy.points(state(step: 1))
        #expect(y.map(\.label) == ["Start", "Nudge me", "Examples", "Skip", "Type it"])
        #expect(y.map(\.at) == [.n, .ne, .e, .s, .w])
        #expect(y.map(\.action) == [.back, .nudge, .examples, .next, .type])
        #expect(y.map(\.symbol) == ["arrow.up", "sparkle", "flag", "arrow.down", "keyboard"])
        var s = state(step: 3)
        #expect(labels(s) == ["Back up", "Nudge me", "Examples", "Skip", "Type it"])
        s.items = [item(.month, "x")]; s.examplesOn = [3]
        #expect(labels(s) == ["Back up", "Nudge me", "Hide examples", "Walk on", "Type it"])
        s.undo = [.plant(UUID())]
        #expect(WalkCopy.points(s).last == WalkCopy.Point(at: .nw, label: "Undo", action: .undo, symbol: "arrow.uturn.backward"))
        #expect(WalkCopy.points(state(step: 6)).isEmpty)
    }

    @Test func todayPoints() {
        var t = state(step: 5)
        #expect(labels(t) == ["Back up", "Nudge me", "Skip", "Type it"])
        t.calendarOffer = true
        #expect(WalkCopy.points(t).contains(WalkCopy.Point(at: .e, label: "Calendar", action: .calendar, symbol: "calendar")))
        let wg = item(.week, "Gym induction")
        t.items = [wg]; t.focus[.today] = wg.id
        #expect(WalkCopy.points(t).first { $0.at == .s } == WalkCopy.Point(at: .s, label: "Start there", action: .startThere, symbol: "arrow.down"))
        t.firstThing = wg.id
        #expect(WalkCopy.points(t).first { $0.at == .s }?.label == "Walk on")
    }

    @Test func theNamedStringsAreExact() {
        #expect(WalkCopy.shortLength == 40)
        #expect(WalkCopy.wordmark == "Symphony")
        #expect(WalkCopy.welcomeTitle == "Let’s start up high and walk down to today.")
        #expect(WalkCopy.welcomeSub == "Plant a flag for what matters, then follow it down.")
        #expect(WalkCopy.nothingToPlant == "Nothing to plant yet. Hold and speak, or slide left to type.")
        #expect(WalkCopy.speechOff == "Speaking isn’t available here, so type it.")
        #expect(WalkCopy.nothingHeard == "Nothing came through. Type it here.")
        #expect(WalkCopy.speakNow == "Now hold the light and speak.")
        #expect(WalkCopy.ridgeFull == "The ridge is full. Tap a peak to let one go first.")
        #expect(WalkCopy.calendarLine == "See your calendar on Today too")
        #expect(WalkCopy.undo == "Undo"); #expect(WalkCopy.moveTo == "Move to"); #expect(WalkCopy.pullUp == "Pull it up")
        #expect(WalkCopy.typePlaceholder == "Type it, then return"); #expect(WalkCopy.firstThingTag == "FIRST THING")
        #expect(WalkCopy.more(2) == "+2")
        #expect(WalkCopy.lookBack == "Look back up: that’s your plan."); #expect(WalkCopy.heresToday == "Here’s today.")
        #expect(WalkCopy.showMyDay == "Show my day"); #expect(WalkCopy.lookBackHandle == "Look back up at your plan")
        #expect(WalkCopy.todayEyebrow == "Today"); #expect(WalkCopy.walkAnother == "Walk another one down")
        #expect(WalkCopy.goToToday == "Go to Today")
        #expect(WalkCopy.thatsTheDay == "That’s the day."); #expect(WalkCopy.nothingToday == "Nothing planted for today yet.")
        #expect(WalkCopy.nextFlag("Finish the bathroom") == "Next flag: Finish the bathroom")
        #expect(WalkCopy.forGoal("Feel strong again") == "for Feel strong again")
        #expect(WalkCopy.nextEvent("2:30 pm") == "Next · 2:30 pm")
        #expect(WalkCopy.ringLabel(done: 1, total: 3) == "1 of 3 done")
        #expect(WalkCopy.replayButton == "Walk the mountain again")
        #expect(WalkCopy.replayFooter == "Start at the top and walk down to today. Nothing you have is changed.")
        #expect(WalkCopy.orbLabelWelcome == "Hold to begin")
        #expect(WalkCopy.orbLabel == "Hold and speak to plant a flag; tap for more")
        #expect(WalkCopy.rowDone == "Done"); #expect(WalkCopy.rowOpen == "Not done")
        #expect(WalkLevel.allCases.map(WalkCopy.levelName) == ["Year", "Season", "Month", "Week", "Today"])
    }

    @Test func whatVoiceOverSays() {
        let b = WalkCopy.bannerLabel
        #expect(b("Run a 5K", .year, nil, .mine) == "Year: Run a 5K, tap to move or pull up")
        #expect(b("Gym", .week, "TUESDAY", .mine) == "Week: Gym, Tuesday, tap to move or pull up")
        #expect(b("Gym", .week, "MON 23", .plain) == "Week: Gym, Mon 23")
        #expect(b("Run a 5K", .year, nil, .plain) == "Year: Run a 5K")
        #expect(b("Run a 5K", .year, nil, .focusable) == "Year: Run a 5K, tap to focus")
        #expect(b("Run a 5K", .year, nil, .focused) == "Year: Run a 5K, focused, tap to let go")
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThing) == "Today: Gym induction, first thing")
        #expect(b("Gym induction", .today, WalkCopy.firstThingTag, .firstThingMine)
                == "Today: Gym induction, first thing, tap to pull up")
        #expect(b("Run a 5K", .year, nil, .example) == "Example: Run a 5K, tap to make it yours")
        #expect(b("", .year, nil, .stub(3)) == "3 more, tap to show")
        #expect(WalkCopy.areaHint(ground: true, kept: false, focused: false) == "Tap to keep")
        #expect(WalkCopy.areaHint(ground: true, kept: true, focused: false) == "Tap to let go")
        #expect(WalkCopy.areaHint(ground: false, kept: true, focused: false) == "Tap to look closer")
        #expect(WalkCopy.areaHint(ground: false, kept: true, focused: true) == "Tap to step back")
        #expect(WalkCopy.rowLabel("Lift, 30 minutes", forGoal: "Feel strong again") == "Lift, 30 minutes, for Feel strong again")
        #expect(WalkCopy.rowLabel("Lift, 30 minutes", forGoal: nil) == "Lift, 30 minutes")
    }
}
