import Foundation
import Testing
@testable import Symphony

/// The walk's suggestions from the server (`walk-suggest`): what is asked, the wait, what shows when
/// the answer comes, and the written examples standing in when it does not. And the Year step's tour
/// of the areas kept.
struct WalkSuggestTests {
    private let today = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 17))!
    private var env: WalkEnv { WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today) }
    private let ideas = ["Lose 5 pounds by March", "Weigh in every Friday", "Pick a food log to use"]

    /// Standing in an area on Season, under a year goal with these words.
    private func walk(area name: String = "Health", goal: String = "Get back to 175 pounds",
                      canSuggest: Bool = true) -> (state: WalkState, goal: WalkItem) {
        var s = WalkState()
        let area = WalkArea(id: UUID(), name: name)
        let above = WalkItem(id: UUID(), level: .year, title: goal, areaId: area.id)
        s.step = 2; s.depth = .full
        s.areas = [area]; s.kept = [area.id]; s.focusArea = area.id
        s.items = [above]; s.focus[.season] = above.id
        s.canSuggest = canSuggest
        return (s, above)
    }

    private func label(_ s: WalkState) -> String? {
        WalkCopy.points(s, env.periods).first { $0.at == .e }?.label
    }

    private func request(_ effects: [WalkEffect]) -> WalkSuggestRequest? {
        for case .suggest(let request) in effects { return request }
        return nil
    }

    private func weight(_ level: WalkLevel) throws -> [String] {
        try #require(WalkExampleLibrary.themes(area: "Health").first { $0.name == "weight" }?.lines[level])
    }

    // MARK: Asking

    @Test func askingUnderAGoalAsksTheServerAndWaits() throws {
        let written = Array(try weight(.season).prefix(2))
        var (s, goal) = walk()
        #expect(label(s) == "Show examples")
        let effects = s.act(.examples, env)
        let asked = try #require(request(effects))
        #expect(asked.body == WalkSuggestRequest.Body(
            level: "season", area: "Health", above: [.init(level: "year", title: "Get back to 175 pounds")],
            period: "this \(env.periods.seasonWord)", today: "2026-11-17", have: []))
        #expect(effects.last == .timer(.suggest, ms: WalkState.suggestMs))
        // Waiting: on, nothing showing yet, the hint says why, and the choice still stands to call it off.
        #expect(s.isSuggesting && s.examplesOn.contains(2) && s.examplesLeft(today: today).isEmpty)
        #expect(WalkCopy.hint(s) == "Finding ideas for this goal…")
        #expect(label(s) == "Hide examples")

        // The answer: its lines are the examples; one tapped is planted under the goal.
        #expect(s.apply(.suggested(asked.place, ideas), env) == [.timer(.suggest, ms: nil)])
        #expect(!s.isSuggesting && s.examplesLeft(today: today) == ideas)
        #expect(label(s) == "Other examples")
        _ = s.apply(.exampleTapped(ideas[1]), env)
        #expect(s.items.last?.title == ideas[1] && s.items.last?.parentId == goal.id)
        #expect(s.examplesLeft(today: today) == [ideas[0], ideas[2]])
        // Asking again goes on to the written ones for this kind of goal.
        _ = s.act(.examples, env)
        #expect(s.examplesLeft(today: today) == written)
    }

    @Test func theChainGoesUpAndSaysWhatIsAlreadyThere() throws {
        var (s, goal) = walk()
        let season = WalkItem(id: UUID(), level: .season, title: "Come up with a nutrition plan", areaId: goal.areaId, parentId: goal.id)
        let have = WalkItem(id: UUID(), level: .month, title: "Meet with Kristen", areaId: goal.areaId, parentId: season.id)
        let other = WalkItem(id: UUID(), level: .month, title: "Under nothing", areaId: goal.areaId)
        s.items += [season, have, other]
        s.step = 3; s.focus[.month] = season.id
        let asked = try #require(request(s.act(.examples, env)))
        #expect(asked.body == WalkSuggestRequest.Body(
            level: "month", area: "Health",
            above: [.init(level: "season", title: "Come up with a nutrition plan"), .init(level: "year", title: "Get back to 175 pounds")],
            period: env.periods.monthName, today: "2026-11-17", have: ["Meet with Kristen"]))
    }

    /// The body is what `supabase/functions/walk-suggest/prompt.ts` reads.
    @Test func theBodyEncodesAsTheServerReadsIt() throws {
        var (s, _) = walk()
        let asked = try #require(request(s.act(.examples, env)))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let json = String(decoding: try encoder.encode(asked.body), as: UTF8.self)
        #expect(json == #"{"above":[{"level":"year","title":"Get back to 175 pounds"}],"area":"Health","have":[],"level":"season","period":"this \#(env.periods.seasonWord)","today":"2026-11-17"}"#)
    }

    // MARK: When nothing comes

    @Test func nothingBackShowsTheWrittenExamples() throws {
        let written = Array(try weight(.season).prefix(2))
        var (s, _) = walk()
        let asked = try #require(request(s.act(.examples, env)))
        _ = s.apply(.suggested(asked.place, nil), env)
        #expect(s.examplesOn.contains(2) && s.examplesLeft(today: today) == written)
    }

    @Test func theWaitRunsOutAndALateAnswerIsLeft() throws {
        let written = Array(try weight(.season).prefix(2))
        var (s, _) = walk()
        let asked = try #require(request(s.act(.examples, env)))
        #expect(s.apply(.suggestExpired, env) == [.timer(.suggest, ms: nil)])
        #expect(!s.isSuggesting && s.examplesLeft(today: today) == written)
        #expect(s.apply(.suggested(asked.place, ideas), env).isEmpty)
        #expect(s.examplesLeft(today: today) == written)
    }

    @Test func askingAgainWhileWaitingCallsItOff() throws {
        var (s, _) = walk()
        let asked = try #require(request(s.act(.examples, env)))
        #expect(s.act(.examples, env) == [.timer(.suggest, ms: nil)])
        #expect(!s.isSuggesting && !s.examplesOn.contains(2) && label(s) == "Show examples")
        #expect(s.apply(.suggested(asked.place, ideas), env).isEmpty)          // nobody is waiting for it
        #expect(s.suggestions.isEmpty)
    }

    /// A place is asked for once: showing again brings what came, with no second call.
    @Test func aPlaceIsAskedOnce() throws {
        var (s, _) = walk()
        let asked = try #require(request(s.act(.examples, env)))
        _ = s.apply(.suggested(asked.place, ideas), env)
        while s.examplesOn.contains(2) { #expect(request(s.act(.examples, env)) == nil) }
        #expect(request(s.act(.examples, env)) == nil && s.examplesOn.contains(2))
    }

    /// An area of the person's own has no written examples: it can still ask, and says so when nothing comes.
    @Test func anAreaOfOnesOwnCanAsk() throws {
        var (s, _) = walk(area: "Side projects and making", goal: "Finish the boat")
        #expect(label(s) == "Show examples")
        let asked = try #require(request(s.act(.examples, env)))
        let effects = s.apply(.suggested(asked.place, nil), env)
        #expect(effects == [.timer(.suggest, ms: nil), .timer(.note, ms: WalkState.noteMs)])
        #expect(!s.examplesOn.contains(2) && WalkCopy.hint(s) == "No ideas came through. Say your own.")
        #expect(label(s) == nil)                    // asked once, nothing written: nothing more to offer
    }

    // MARK: Where the server is not asked

    @Test func withoutTheServerTheWrittenExamplesShowAtOnce() throws {
        let written = Array(try weight(.season).prefix(2))
        var (s, _) = walk(canSuggest: false)
        #expect(s.act(.examples, env).isEmpty)
        #expect(!s.isSuggesting && s.examplesLeft(today: today) == written)
        var own = walk(area: "Side projects and making", goal: "Finish the boat", canSuggest: false).state
        #expect(label(own) == nil && own.act(.examples, env).isEmpty)
    }

    @Test func onYearThereIsNoGoalToAskAbout() {
        var s = WalkState()
        let health = WalkArea(id: UUID(), name: "Health")
        s.step = 1; s.areas = [health]; s.kept = [health.id]; s.focusArea = health.id; s.canSuggest = true
        #expect(request(s.act(.examples, env)) == nil)
        #expect(s.examplesLeft(today: today) == WalkCopy.examples(.year, area: "Health"))
    }

    @Test func aReplyIsTidied() {
        #expect(WalkSuggestRequest.lines(["  Weigh in   every Friday ", "x", String(repeating: "a", count: 45), "weigh in every friday", "One", "Two", "Three"])
                == ["Weigh in every Friday", "One", "Two"])
        #expect(WalkSuggestRequest.lines([]) == nil)
        #expect(WalkSuggestRequest.lines(nil) == nil)
    }

    // MARK: Year visits every area kept

    @Test(arguments: [WalkDepth.quick, .full])
    func nextVisitsEveryAreaKeptOnYear(depth: WalkDepth) {
        var s = WalkState()
        let health = WalkArea(id: UUID(), name: "Health"), home = WalkArea(id: UUID(), name: "Home"), work = WalkArea(id: UUID(), name: "Work")
        s.step = 1; s.ground = true; s.depth = depth
        s.areas = [health, home, work]; s.kept = [health.id, work.id]
        func next(_ s: WalkState) -> String? { WalkCopy.nextLine(s, env.periods)?.text }

        _ = s.act(.next, env)                                   // off the ground
        #expect(!s.ground && s.standing == health.id)
        #expect(next(s) == "Next: Work")                        // the next area kept, with nothing added yet too
        _ = s.apply(.typeSubmitted("Run a 5K"), env)
        #expect(next(s) == "Next: Work")
        _ = s.act(.next, env)
        #expect(s.step == 1 && s.standing == work.id)
        #expect(next(s) == "Next: this \(env.periods.seasonWord)")   // the last area: on down
        _ = s.act(.next, env)
        #expect(s.step == 2)
    }

    @Test func withNothingAddedAnywhereTheLastAreaSkips() {
        var s = WalkState()
        let health = WalkArea(id: UUID(), name: "Health"), work = WalkArea(id: UUID(), name: "Work")
        s.step = 1; s.ground = true
        s.areas = [health, work]; s.kept = [health.id, work.id]
        _ = s.act(.next, env)
        #expect(WalkCopy.nextLine(s, env.periods)?.text == "Next: Work")
        _ = s.act(.next, env)
        #expect(WalkCopy.nextLine(s, env.periods)?.text == "Skip this step")
    }
}
