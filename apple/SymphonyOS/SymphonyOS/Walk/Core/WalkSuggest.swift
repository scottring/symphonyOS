import Foundation

/// What the walk asks the server when the person asks for examples under a goal (`walk-suggest`):
/// the goal the step is about and the goals above it, the area, and the period being planned. The
/// server has Claude write three next steps that follow from that goal. Nothing else of the plan is sent.
struct WalkSuggestRequest: Equatable {
    struct Above: Equatable, Encodable { let level: String; let title: String }

    /// Where the suggestions belong. Kept on the phone; never sent.
    let place: WalkState.ExamplePlace
    let level: String
    let area: String?
    /// The goal the step is about, then the goals above it: nearest first.
    let above: [Above]
    /// The period in the walk's own words: "this winter", "December", "this week".
    let period: String
    /// The person's own day, yyyy-MM-dd.
    let today: String
    /// What they already have for this period under the goal.
    let have: [String]

    /// The body as the server reads it (`supabase/functions/walk-suggest/prompt.ts`).
    struct Body: Equatable, Encodable {
        let level: String; let area: String?; let above: [Above]; let period: String; let today: String; let have: [String]
    }
    var body: Body { Body(level: level, area: area, above: above, period: period, today: today, have: have) }

    static func word(_ level: WalkLevel) -> String {
        switch level {
        case .year: "year"
        case .season: "season"
        case .month: "month"
        case .week, .today: "week"
        }
    }

    /// A reply as flags: each line tidied, none empty, none longer than a flag holds, three at most.
    static func lines(_ reply: [String]?) -> [String]? {
        guard let reply else { return nil }
        var seen = Set<String>()
        let lines = reply
            .map { $0.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
            .filter { (3...WalkSuggestRequest.longest).contains($0.count) && seen.insert($0.lowercased()).inserted }
        return lines.isEmpty ? nil : Array(lines.prefix(3))
    }

    /// The longest line one flag holds, as the library's.
    static let longest = 44
}

extension WalkState {
    /// How long the walk waits for suggestions before the written examples stand in.
    static let suggestMs = 8000

    /// The walk is waiting for suggestions for where it stands.
    var isSuggesting: Bool { suggesting != nil && suggesting == examplePlace }

    /// Suggestions could be asked for here: the server can be asked (`canSuggest`), the step has a goal
    /// above in the area stood in, and this place has not been asked for yet.
    var couldSuggest: Bool {
        canSuggest && suggesting == nil && suggestions[examplePlace] == nil && goalToSuggestFor != nil
    }

    /// Season, Month and Week off the ground: the goal above shown, when it stands in the area stood in.
    private var goalToSuggestFor: WalkItem? {
        guard let level, (2...4).contains(step), !ground, let goal = item(focus[level]), column(of: goal) == standing
        else { return nil }
        return goal
    }

    func suggestRequest(_ periods: WalkPeriods) -> WalkSuggestRequest? {
        guard let level, var at = goalToSuggestFor else { return nil }
        var above = [WalkSuggestRequest.Above(level: WalkSuggestRequest.word(at.level), title: at.title)]
        while let up = item(at.parentId), above.count < 4 {
            above.append(.init(level: WalkSuggestRequest.word(up.level), title: up.title))
            at = up
        }
        let period: String
        switch level {
        case .season: period = "this \(periods.seasonWord)"
        case .month: period = periods.monthName
        default: period = "this week"
        }
        let goal = focus[level]
        let have = items(on: level).filter { $0.parentId == goal }.map(\.title)
        return WalkSuggestRequest(place: examplePlace, level: WalkSuggestRequest.word(level), area: area(standing)?.name,
                                  above: above, period: period, today: PlanCalendar.ymd(periods.today),
                                  have: Array(have.prefix(12)))
    }

    /// The reply for a place, or none (a failure, a refusal, the wait ran out): the wait ends. With
    /// nothing from the server and nothing written for this place either, the examples come down
    /// with a line that says so.
    mutating func suggested(_ place: ExamplePlace, _ reply: [String]?, today: Date) -> [WalkEffect] {
        guard suggesting == place else { return [] }            // an answer nobody is waiting for
        suggesting = nil
        suggestions[place] = WalkSuggestRequest.lines(reply) ?? []
        var effects: [WalkEffect] = [.timer(.suggest, ms: nil)]
        if place == examplePlace, examplesOn.contains(step), examplesLeft(today: today).isEmpty {
            examplesOn.remove(step)
            note = WalkCopy.noSuggestions
            effects.append(.timer(.note, ms: WalkState.noteMs))
        }
        return effects
    }
}
