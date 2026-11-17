import Foundation
import Testing
@testable import Symphony

/// The examples the walk carries on the phone: the library's shape, how a person's own goal finds a
/// theme, and how the walk pages through them.
struct WalkExampleLibraryTests {
    private static let areas = ["Health", "Home", "People", "Work", "Money", "Fun"]
    private static let levels: [WalkLevel] = [.year, .season, .month, .week]
    private let today = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 17))!

    // MARK: The library

    @Test func everyAreaHasTwentyThemesOfFourLinesALevel() {
        for area in Self.areas {
            let themes = WalkExampleLibrary.themes(area: area)
            #expect(themes.count == 20, "\(area)")
            for theme in themes {
                #expect(theme.triggers.count >= 4, "\(area) \(theme.name)")
                for level in Self.levels { #expect(theme.lines[level]?.count == 4, "\(area) \(theme.name) \(level)") }
                #expect(theme.lines[.today] == nil)
            }
        }
    }

    /// A line is one flag: 44 characters at most. A Week line ends in a day the walk reads off it; no
    /// other line does.
    @Test func everyLineFitsAFlagAndReadsAsSaid() {
        for area in Self.areas {
            for theme in WalkExampleLibrary.themes(area: area) {
                for level in Self.levels {
                    for line in theme.lines[level] ?? [] {
                        #expect(line.count <= 44, "\(area) \(theme.name): \(line)")
                        let said = WalkWords.said(line, level: level, today: today, detect: { _ in nil })
                        #expect(said?.title.isEmpty == false, "\(line)")
                        #expect((said?.day != nil) == (level == .week), "\(area) \(theme.name): \(line)")
                    }
                }
            }
        }
    }

    @Test func noLineTwiceAndNoWordInTwoThemes() {
        for area in Self.areas {
            let themes = WalkExampleLibrary.themes(area: area)
            let lines = themes.flatMap { $0.lines.values.flatMap { $0 } }.map { $0.lowercased() }
            #expect(Set(lines).count == lines.count, "\(area)")
            let words = themes.flatMap(\.triggers)
            #expect(Set(words).count == words.count, "\(area)")
        }
    }

    // MARK: Finding a theme

    private func theme(_ area: String, _ above: String...) -> String? {
        WalkExampleLibrary.theme(for: above, among: WalkExampleLibrary.themes(area: area), under: .season)?.name
    }

    @Test func aGoalFindsItsTheme() {
        #expect(theme("Health", "Run a marathon") == "running")
        #expect(theme("Health", "Get stronger this year") == "strength")
        #expect(theme("Health", "Sleep seven hours most nights") == "sleep")
        #expect(theme("Home", "Finish the bathroom") == "bathroom")
        #expect(theme("Money", "Pay off my credit card") == "debt")
        #expect(theme("People", "Call Mom every Sunday") == "parents")
        #expect(theme("Work", "Ask for a raise") == "raise")
        #expect(theme("Fun", "Learn to play the guitar") == "instrument")
        #expect(theme("Fun", "Read a book a month") == nil || theme("Fun", "Read a book a month") == "reading")
        #expect(theme("Health", "Learn to juggle") == nil)
        // A word inside another word finds nothing; a trailing star takes any ending.
        #expect(theme("Health", "Be less runny") == nil)
        #expect(theme("Home", "Start decluttering") == "declutter")
    }

    /// The nearest goal that says something decides; one that says nothing hands on to the goal above it.
    @Test func theThemeFollowsDownTheLine() {
        #expect(theme("Health", "Build up to thirty minutes", "Run a 5K") == "running")
        #expect(theme("Health", "Lift twice a week", "Run a 5K") == "strength")
    }

    /// A goal that is one of a theme's own lines finds that theme, whatever its words.
    @Test func aThemesOwnLineFindsIt() throws {
        for area in Self.areas {
            for candidate in WalkExampleLibrary.themes(area: area) {
                let line = try #require(candidate.lines[.year]?.first)
                #expect(theme(area, line) == candidate.name, "\(area): \(line)")
            }
        }
    }

    // MARK: The pool

    @Test func underAGoalThePoolIsItsThemesLines() throws {
        let running = try #require(WalkExampleLibrary.themes(area: "Health").first { $0.name == "running" })
        for level in [WalkLevel.season, .month, .week] {
            #expect(WalkExampleLibrary.pool(level, area: "Health", above: ["Run a marathon"]) == running.lines[level])
        }
    }

    /// With no goal above, or none that finds a theme: the general examples, then the themes in turn.
    @Test func withNoThemeTheGeneralExamplesComeFirst() {
        for area in Self.areas {
            for level in Self.levels {
                let general = WalkCopy.examples(level, area: area)
                let pool = WalkExampleLibrary.pool(level, area: area, above: level == .year ? [] : ["Zib zab zob"])
                #expect(Array(pool.prefix(general.count)) == general, "\(area) \(level)")
                #expect(pool.count > 40, "\(area) \(level): \(pool.count)")
                #expect(Set(pool.map { $0.lowercased() }).count == pool.count)
            }
        }
        #expect(WalkExampleLibrary.pool(.today, area: "Health", above: []).isEmpty)
    }

    /// The general examples were written as one line down the levels: under one of them they still
    /// come first, then its theme's.
    @Test func underAGeneralExampleTheGeneralOnesComeFirst() throws {
        let bathroom = try #require(WalkExampleLibrary.themes(area: "Home").first { $0.name == "bathroom" }?.lines[.season])
        let general = WalkCopy.examples(.season, area: "Home")
        #expect(WalkExampleLibrary.pool(.season, area: "Home", above: ["Finish the bathroom"]) == general + bathroom)
        #expect(WalkExampleLibrary.pool(.season, area: "Home", above: ["Redo the bathroom"]) == bathroom)
    }

    /// Weight, a partner, a debt: offered only when the person's own words find them.
    @Test func aQuietThemeIsNeverOfferedUnasked() throws {
        var quiet = 0
        for area in Self.areas {
            for theme in WalkExampleLibrary.themes(area: area) where theme.quiet {
                quiet += 1
                for level in Self.levels {
                    let pool = Set(WalkExampleLibrary.pool(level, area: area, above: []))
                    #expect(pool.isDisjoint(with: theme.lines[level] ?? []), "\(area) \(theme.name)")
                }
            }
        }
        #expect(quiet >= 10)
        let weight = try #require(WalkExampleLibrary.themes(area: "Health").first { $0.name == "weight" })
        #expect(weight.quiet)
        #expect(WalkExampleLibrary.pool(.season, area: "Health", above: ["Get to a weight I like"]) == weight.lines[.season])
    }

    @Test func aPlainOtherNameStandsForItsArea() {
        #expect(WalkExampleLibrary.area("Family") == "people")
        #expect(WalkExampleLibrary.area("career") == "work")
        #expect(WalkExampleLibrary.area("HEALTH") == "health")
        #expect(WalkExampleLibrary.area("Side projects and making") == nil)
        #expect(WalkExampleLibrary.area(nil) == nil)
        #expect(!WalkExampleLibrary.pool(.year, area: "Family", above: []).isEmpty)
        #expect(WalkExampleLibrary.pool(.year, area: "Side projects and making", above: []).isEmpty)
    }

    // MARK: The walk's pages

    private func env() -> WalkEnv { WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today) }

    /// Standing in Health on `step`, under a year goal with these words (none on Year).
    private func walk(step: Int, goal: String? = nil) -> WalkState {
        var s = WalkState()
        let health = WalkArea(id: UUID(), name: "Health")
        s.step = step; s.depth = .full
        s.areas = [health]; s.kept = [health.id]; s.focusArea = health.id
        if let goal, let level = s.level {
            let above = WalkItem(id: UUID(), level: .year, title: goal, areaId: health.id)
            s.items = [above]; s.focus[level] = above.id
        }
        return s
    }

    private func label(_ s: WalkState) -> String? {
        WalkCopy.points(s, env().periods).first { $0.at == .e }?.label
    }

    /// Show, then other ones twice, then hide; showing again brings the last page back.
    @Test func askingAgainBringsOtherExamples() {
        var s = walk(step: 1)
        let general = WalkCopy.examples(.year, area: "Health")
        #expect(label(s) == "Show examples" && s.examplesLeft(today: today) == general)
        _ = s.toggleExamples(env())
        #expect(s.examplesOn.contains(1) && s.examplesLeft(today: today) == general)
        #expect(label(s) == "Other examples")
        _ = s.toggleExamples(env())
        let second = s.examplesLeft(today: today)
        #expect(second.count == 3 && Set(second).isDisjoint(with: general) && label(s) == "Other examples")
        _ = s.toggleExamples(env())
        let third = s.examplesLeft(today: today)
        #expect(third.count == 3 && Set(third).isDisjoint(with: second + general))
        #expect(label(s) == "Hide examples")
        _ = s.toggleExamples(env())
        #expect(!s.examplesOn.contains(1) && label(s) == "Show examples")
        _ = s.toggleExamples(env())
        #expect(s.examplesOn.contains(1) && s.examplesLeft(today: today) == third && label(s) == "Other examples")
    }

    /// Under a goal the walk offers that goal's kind of thing, two at a time.
    @Test func underAGoalTheExamplesAreItsOwnKind() throws {
        let running = try #require(WalkExampleLibrary.themes(area: "Health").first { $0.name == "running" }?.lines[.season])
        var s = walk(step: 2, goal: "Run a marathon")
        #expect(s.examplesLeft(today: today) == Array(running.prefix(2)))
        _ = s.toggleExamples(env())
        #expect(label(s) == "Other examples")
        _ = s.toggleExamples(env())
        #expect(s.examplesLeft(today: today) == Array(running.suffix(2)))
        _ = s.toggleExamples(env())                      // round again: this showing has seen both pages
        #expect(s.examplesLeft(today: today) == Array(running.prefix(2)))
    }

    /// The last example showing, once used, takes them down; asking again brings the next ones.
    @Test func aUsedUpPageComesDown() throws {
        let running = try #require(WalkExampleLibrary.themes(area: "Health").first { $0.name == "running" }?.lines[.season])
        var s = walk(step: 2, goal: "Run a marathon")
        _ = s.toggleExamples(env())
        _ = s.apply(.exampleTapped(running[0]), env())
        #expect(s.examplesOn.contains(2) && s.examplesLeft(today: today) == [running[1]])
        _ = s.apply(.exampleTapped(running[1]), env())
        #expect(!s.examplesOn.contains(2))
        #expect(label(s) == "Show examples" && s.examplesLeft(today: today) == Array(running.suffix(2)))
        #expect(s.items.filter { $0.level == .season }.map(\.title) == [running[0], running[1]])
    }
}
