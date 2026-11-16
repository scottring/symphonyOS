import Testing
import Foundation
import CoreGraphics
#if canImport(UIKit)
import UIKit
#endif
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// Friday 13 November 2026.
private let today = day(2026, 11, 13)
private let art = WalkArt.overlookSquare

/// A deterministic id, so a failing generated state can be rebuilt exactly.
private func uid(_ n: Int) -> UUID {
    UUID(uuidString: String(format: "00000000-0000-0000-0000-%012x", n))!
}

/// The six built-in areas, then one of the person's own with a long name, then an eighth.
private let longName = "Side projects and making"
private let names = ["Health", "Home", "People", "Work", "Money", "Fun", longName, "Learning"]
private let ridge = names.enumerated().map { WalkArea(id: uid(1000 + $0.offset), name: $0.element) }

private func area(_ name: String) -> WalkArea { ridge.first { $0.name == name }! }

/// Off the ground on a step, with the named areas kept, standing in `standing`, settled as the reducer settles it.
private func state(_ step: Int, kept: [String] = [], items: [WalkItem] = [], standing: String? = nil,
                   focus: WalkItem? = nil) -> WalkState {
    var s = WalkState()
    s.areas = ridge
    s.kept = kept.map { area($0).id }
    s.step = step
    s.items = items
    s.focusArea = standing.map { area($0).id }
    if let focus, let level = s.level { s.focus[level] = focus.id }
    return s.settled
}

private func flag(_ level: WalkLevel, _ title: String, in areaName: String? = nil, parent: UUID? = nil,
                  day: Date? = nil, mine: Bool = true) -> WalkItem {
    return WalkItem(id: UUID(), level: level, title: title, areaId: areaName.map { area($0).id },
                    parentId: parent, day: day, mine: mine)
}

/// A stress plan (`DemoStress.full`, `.long`) as the walk's preview plants it, on `step`, standing in an area.
private func plan(_ plan: DemoStress.Plan, step: Int, standing: String) -> WalkState {
    var s = WalkState()
    s.areas = Array(ridge.prefix(6)) + (plan.customArea.map { [WalkArea(id: uid(1900), name: $0)] } ?? [])
    func id(_ name: String) -> UUID? { s.areas.first { $0.name == name }?.id }
    s.kept = plan.areas.compactMap(id)
    s.step = step
    var n = 0
    for (level, words, areaName) in plan.script where level.rawValue <= min(step, 4) {
        guard let said = WalkWords.said(words, level: level, today: today) else { continue }
        n += 1
        let parent = s.items.first { $0.level.rawValue == level.rawValue - 1 && $0.areaId == id(areaName) }
        s.items.append(WalkItem(id: uid(7000 + n), level: level, title: said.title, areaId: id(areaName),
                                parentId: parent?.id, day: said.day))
    }
    s.focusArea = id(standing)
    return s.settled
}

private extension WalkLayout {
    var banners: [Banner] { posts.flatMap(\.banners) }
    func banners(_ kind: Kind) -> [Banner] { banners.filter { $0.kind == kind } }
    var mores: [Banner] { banners.filter { if case .more = $0.kind { return true }; return false } }
    func banner(for item: WalkItem) -> Banner? { banners.first { $0.itemId == item.id } }
    var standingLabel: Label? { labels.first { $0.standing } }
}

private func near(_ a: CGFloat, _ b: CGFloat, _ tolerance: CGFloat = 0.5) -> Bool { abs(a - b) <= tolerance }

private func ruled(_ s: WalkState, wing: CGFloat = 0) -> WalkLayout {
    WalkLayout.make(s, today: today, footing: .level, wing: wing)
}

/// The wings the layout is measured on: a phone, the Duo's outside screen, the half window, opened flat.
private let wings: [CGFloat] = [0, 42.3, 110.3, 404.9]

struct WalkLayoutTests {

    // MARK: The art and the bands

    @Test func everyBandLandsOnItsStepsLine() {
        // The camera never zooms: every step stands at the art's stop, Year's band at 535.5 and Season
        // to Today's at 560, with the standing post's foot (556) on that ground.
        let home = flag(.year, "Run a 5K", in: "Home")
        for step in 1...5 {
            let level = WalkLevel(rawValue: step)!
            let layout = ruled(state(step, kept: ["Health", "Home"], items: [home], standing: "Home"))
            #expect(layout.camera == art.stops[step], "step \(step)")
            let band = (art.bandY(level) - layout.camera.y) * layout.camera.k
            #expect(near(band, step == 1 ? 535.5 : 560), "step \(step): \(band)")
            #expect(layout.posts.first?.base == CGPoint(x: 195, y: 556), "step \(step)")
        }
        #expect(ruled(state(6, kept: ["Home"], items: [home])).camera == art.stops[6])
    }

    @Test func thePictureStillFillsTheStageOnYear() {
        let year = art.stops[1]
        let bottomWorld = year.y + art.stage.height / year.k, rightWorld = year.x + art.stage.width / year.k
        #expect(year.y == -495)
        #expect(bottomWorld <= art.image.maxY && year.x >= art.image.minX && rightWorld <= art.image.maxX)
        #expect(near((art.bandY(.year) - year.y) * year.k, 535.5))
    }

    @Test func artWithFewStopsDoesNotTrap() {
        let short = WalkArt(imageName: art.imageName, stage: art.stage, world: art.world, image: art.image,
                            bands: art.bands, land: art.land, stops: Array(art.stops.prefix(1)))
        let week = flag(.week, "Gym", in: "Home")
        var s = state(5, kept: ["Home"], items: [week])
        s.firstThing = week.id
        #expect(WalkLayout.make(s, today: today, art: short, footing: .level).camera == art.stops[0])
        #expect(WalkLayout.make(state(1, kept: ["Home"]), today: today, art: short, footing: .level).labels.count == 1)
    }

    // MARK: One area, in words

    /// Month, the full plan, standing in People: one post; on it the goal above, at most four of
    /// People's month goals in full, at most one "+n more"; nothing of any other area's.
    @Test func oneAreaShowsItsWords() {
        let s = plan(DemoStress.full, step: 3, standing: "People")
        let layout = ruled(s)
        #expect(layout.posts.count == 1)
        #expect(layout.posts.first?.key == WalkPostKey(level: .month, column: area("People").id))
        #expect(layout.banners(.parent).count == 1)
        let full = layout.banners(.full)
        #expect((1...4).contains(full.count) && layout.mores.count <= 1)
        let people = s.items(on: .month).filter { $0.areaId == area("People").id }
        #expect(full.allSatisfy { b in people.contains { $0.id == b.itemId } })
        #expect(layout.banners.count == layout.banners(.parent).count + full.count + layout.mores.count)
        #expect(layout.standingLabel?.name == "People" && layout.labels.count == 1)
        // Top to bottom: the goal above, the flags oldest highest.
        #expect(layout.banners.first?.kind == .parent)
        #expect(full.compactMap(\.itemId) == people.suffix(full.count).map(\.id))
        #expect(zip(layout.banners, layout.banners.dropFirst()).allSatisfy { near($1.frame.minY - $0.frame.maxY, 4, 0.01) })
    }

    /// A goal above and four two-line titles in a named area: three stand in full with "+1 more".
    /// By the numbers (F31): a pill (23, and 6 under it), the goal above (26), 52 a flag, 4 between
    /// cloths and 22 for "+n more" come to 249 of the 250 between the question and the lowest
    /// cloth's place; four flags would need 279. No title is cut to make room.
    @Test func fewerFlagsRatherThanCutTitles() {
        let titles = ["Plan a pancake Sunday", "Book train tickets to Gran", "Sleep seven hours most nights", "Call Mum about Sunday lunch"]
        #expect(titles.allSatisfy { WalkLayout.lines(for: $0, width: 150) == 2 })
        let above = flag(.season, "Slow Sundays", in: "People")
        let goals = titles.map { flag(.month, $0, in: "People", parent: above.id) }
        let s = state(3, kept: ["Health", "People"], items: [above] + goals, standing: "People", focus: above)
        let layout = ruled(s)
        #expect(layout.banners(.parent).first?.lines == 1)
        let full = layout.banners(.full)
        #expect(full.count == 3 && layout.mores.map(\.kind) == [.more(1)])
        #expect(full.allSatisfy { $0.lines == 2 && near($0.frame.height, 52, 0.01) })
        #expect(full.compactMap(\.itemId) == goals.suffix(3).map(\.id))
        #expect(layout.banners.last?.frame.maxY == 532 && near(layout.standingLabel!.frame.minY, 532 - 249, 0.01))
        // With one more line to carry (a tagged Week flag is 14 taller) the third no longer fits: two, in full.
        let month = flag(.month, "Slow Sundays", in: "People")
        let tasks = titles.map { flag(.week, $0, in: "People", parent: month.id, day: day(2026, 11, 17)) }
        let week = ruled(state(4, kept: ["People"], items: [month] + tasks, standing: "People", focus: month))
        #expect(week.banners(.full).count == 2 && week.mores.map(\.kind) == [.more(2)])
        #expect(week.banners(.full).allSatisfy { $0.lines == 2 && near($0.frame.height, 66, 0.01) })
    }

    /// F31: the goal above gives up lines before a flag is dropped. It keeps its lines only while
    /// that costs no flag: giving it one more line would always cost one, or it already has all it needs.
    @Test func aGoalAboveGivesWayBeforeAFlagIsDropped() {
        // A 44-character goal above (three lines of its own) and four month goals of about 44 (three lines each).
        let above = flag(.season, "Lift twice a week with the trainer at my gym", in: "Health")
        let titles = ["Book eight sessions and buy proper shoes", "Find a gym close enough to walk to after work",
                      "Buy proper running shoes from the shop on Main", "No screens in the bedroom after ten at night"]
        let goals = titles.map { flag(.month, $0, in: "Health", parent: above.id) }
        let s = state(3, kept: ["Health", "Home"], items: [above] + goals, standing: "Health", focus: above)
        #expect(above.title.count == 44 && WalkLayout.lines(for: above.title, width: 126, face: .parent) == 3)
        // A phone: with its three lines the goal above would leave room for one flag (255 for two);
        // on two it leaves room for two (241). A third flag would not fit even with it on one.
        let phone = ruled(s)
        #expect(phone.banners(.full).count == 2 && phone.mores.map(\.kind) == [.more(2)])
        #expect(phone.banners(.full).allSatisfy { $0.lines == 3 })
        #expect(phone.banners(.parent).first?.lines == 2 && near(phone.banners(.parent)[0].frame.height, 40, 0.01))
        #expect(phone.banners(.parent)[0].label.contains(above.title))
        // The half window: the goals take two lines each; the goal above gives up its second line and the third flag stands.
        let half = ruled(s, wing: 110.3)
        #expect(WalkLayout.lines(for: above.title, width: 202.5, face: .parent) == 2)
        #expect(half.banners(.full).count == 3 && half.mores.map(\.kind) == [.more(1)] && half.banners(.parent).first?.lines == 1)
        // Four two-line goals under it: it goes down to one line before the third flag is dropped (249 of 250).
        let twoLine = ["Plan a pancake Sunday", "Book train tickets to Gran", "Sleep seven hours most nights", "Call Mum about Sunday lunch"]
        let three = state(3, kept: ["Health"], items: [above] + twoLine.map { flag(.month, $0, in: "Health", parent: above.id) },
                          standing: "Health", focus: above)
        #expect(ruled(three).banners(.full).count == 3 && ruled(three).banners(.parent).first?.lines == 1)
        #expect(near(ruled(three).standingLabel!.frame.minY, 283, 0.01))
        // Over the generated states: one more line for the goal above would not fit, or it has all its lines.
        var gaveWay = 0
        for wing in wings {
            for (s, layout) in zip(Generated.all, Generated.level(wing: wing)) where (2...5).contains(s.step) && !s.ground {
                guard let goal = layout.banners(.parent).first, let item = s.item(goal.itemId) else { continue }
                let own = WalkLayout.lines(for: item.title, width: WalkLayout.parentWidth(wing: wing), face: .parent)
                #expect(goal.lines <= own)
                guard goal.lines < own else { continue }
                gaveWay += 1
                let top = layout.standingLabel?.frame.minY ?? goal.frame.minY
                #expect(top - 14 < 282 - 0.01, "\(Generated.describe(s)), wing \(wing): the goal above is on \(goal.lines) of \(own) with \(top - 282) to spare")
            }
        }
        #expect(gaveWay > 100)
    }

    /// Over the generated states: never more than four in full; each in full (unless it is the only
    /// one shown, which may be cut to fit); "+n more" exactly when flags are not shown, n of them.
    @Test func atMostFourEachInFull() {
        let states = Generated.all
        var checked = 0
        for wing in wings {
            let layouts = Generated.level(wing: wing)
            let found = Generated.parallel(states.count) { i -> [String] in
                let s = states[i], layout = layouts[i]
                guard (1...5).contains(s.step), !s.ground else { return [] }
                let full = layout.banners(.full)
                var problems: [String] = []
                if full.count > 4 { problems.append("\(full.count) in full") }
                if full.count > 1 {
                    for b in full where b.lines != min(3, WalkLayout.lines(for: b.text, width: WalkLayout.standingWidth(wing: wing))) {
                        problems.append("\(b.text.prefix(20)) on \(b.lines)")
                    }
                }
                let here = s.level == .today
                    ? [s.item(s.firstThing)].compactMap { $0 }.filter { s.column(of: $0) == s.standing }
                    : s.items(on: s.level!).filter { s.column(of: $0) == s.standing }
                let hidden = here.count - full.count
                if layout.mores.map(\.kind) != (hidden > 0 ? [.more(hidden)] : []) { problems.append("\(hidden) hidden, \(layout.mores.map(\.kind))") }
                return problems
            }
            for (s, problems) in zip(states, found) {
                #expect(problems.isEmpty, "wing \(wing), \(Generated.describe(s)): \(problems.prefix(2))")
                if !problems.isEmpty { return }
                checked += 1
            }
        }
        #expect(checked > 40_000)
    }

    /// Review Focus 2: a 200-character title and a 60-letter word are each cut at three lines, on
    /// a cloth of the standing width, inside the edges, between the question and the lowest cloth's place.
    @Test func aVeryLongTitleIsCutNotSpilled() {
        let long = String(String(repeating: "Walk more every day. ", count: 10).prefix(200))
        let word = String(repeating: "a", count: 60)
        for wing in wings {
            for title in [long, word] {
                for footing in [WalkFooting.level, .natural] {
                    let item = flag(.year, title, in: "Home")
                    let s = state(1, kept: ["Health", "Home", "People"], items: [item], standing: "Home")
                    let layout = WalkLayout.make(s, today: today, footing: footing, wing: wing)
                    let b = layout.banner(for: item)!
                    #expect(b.kind == .full && b.lines == 3)
                    #expect(near(b.frame.width, WalkLayout.standingWidth(wing: wing), 0.01) && near(b.frame.height, 69, 0.01))
                    let edges = WalkLayout.edges(wing: wing)
                    #expect(b.drawn.minX >= edges.lowerBound && b.drawn.maxX <= edges.upperBound, "\(b.drawn)")
                    #expect(b.drawn.minY >= 282 && b.drawn.maxY <= 532.5, "\(footing) \(b.drawn)")
                    #expect(b.label == "Year: \(title), tap to move or remove")
                }
            }
        }
    }

    /// The area's name stands on its own post: the pill's middle on the pole (within the lean's
    /// reach), 6 above the top cloth; with no cloth, on the pole's top.
    @Test func theAreaNameSitsOnItsOwnPost() {
        var checked = 0
        for footing in [WalkFooting.level, .natural] {
            for (s, layout) in zip(Generated.all, Generated.layouts(footing)) where (1...5).contains(s.step) && !s.ground {
                guard let post = layout.posts.first else { Issue.record("\(Generated.describe(s)): no post"); return }
                #expect((layout.standingLabel != nil) == (s.standing != nil), "\(Generated.describe(s))")
                guard let label = layout.standingLabel else { continue }
                #expect(abs(label.frame.midX - post.base.x) <= 4, "\(Generated.describe(s)): \(label.frame.midX)")
                let under = post.banners.first?.frame.minY ?? post.top
                #expect(label.frame.maxY <= under + 0.01 && under - label.frame.maxY <= 8,
                        "\(Generated.describe(s)): pill ends \(label.frame.maxY), \(under) under it")
                #expect(!label.tappable && label.standing && label.id == s.standing)
                checked += 1
            }
        }
        #expect(checked > 4000)
        // Ruled: a post with nothing on it is 36 of pole with the pill on its top.
        let bare = ruled(state(1, kept: ["Health"], standing: "Health"))
        #expect(bare.posts.first?.top == 520 && bare.posts.first?.banners.isEmpty == true)
        #expect(bare.standingLabel?.frame == CGRect(x: 195 - 37.5, y: 497, width: 75, height: 23))
    }

    /// F34: the caret (10 × 7, 2 above the standing pill) has a frame of its own and never rises into
    /// the question: it stands only where the 9 points over the pill are clear, and the stack is never
    /// made shorter for it. Planted by hand it is there exactly where the ruled layout has it.
    @Test func theCaretNeverRisesIntoTheQuestion() {
        var present = 0, absent = 0
        for wing in wings {
            let states = Generated.all, boards = Generated.level(wing: wing)
            let found = Generated.parallel(states.count) { i -> (Bool?, String?) in
                let s = states[i]
                guard (1...6).contains(s.step), !s.ground else { return (nil, nil) }
                // Planted by hand: on a phone from the layouts built once, on the widest stage afresh
                // (the sweep measures the caret itself on every wing, `Invariants.check` (c)).
                let board = boards[i]
                let hand = wing == 0 ? Generated.naturalLayouts[i] : (wing == 110.3 ? WalkLayout.make(s, today: today, footing: .natural, wing: wing) : board)
                guard let pill = board.standingLabel else { return (nil, nil) }
                let room = pill.frame.minY - (s.step == 6 ? WalkLayout.lookBackHeader : WalkLayout.question)
                if (pill.caret != nil) != (room >= 9) { return (nil, "\(room) over the pill, caret \(String(describing: pill.caret))") }
                if let caret = pill.caret, caret != CGRect(x: pill.frame.midX - 5, y: pill.frame.minY - 9, width: 10, height: 7) {
                    return (nil, "the caret \(caret) is not over \(pill.frame)")
                }
                guard let lifted = hand.standingLabel, (lifted.caret != nil) == (pill.caret != nil) else { return (nil, "the hand changed the caret") }
                if let caret = lifted.caret, caret.minY < (s.step == 6 ? WalkLayout.lookBackHeader : WalkLayout.question) - 0.01 {
                    return (nil, "planted by hand the caret rises to \(caret.minY)")
                }
                return (pill.caret != nil, nil)
            }
            for (s, result) in zip(states, found) {
                if let problem = result.1 { Issue.record("wing \(wing), \(Generated.describe(s)): \(problem)"); return }
                if let has = result.0 { if has { present += 1 } else { absent += 1 } }
            }
        }
        #expect(present > 5000 && absent > 500, "\(present) with a caret, \(absent) without")
        print("The caret: \(present) posts with one, \(absent) without")
        // Present: Health's Month on the full plan (the pill's top at 307). Absent: a stack that reaches 283.
        #expect(ruled(plan(DemoStress.full, step: 3, standing: "Health")).standingLabel?.caret == CGRect(x: 190, y: 298, width: 10, height: 7))
        let above = flag(.season, "Slow Sundays", in: "People")
        let goals = ["Plan a pancake Sunday", "Book train tickets to Gran", "Sleep seven hours most nights", "Call Mum about Sunday lunch"]
            .map { flag(.month, $0, in: "People", parent: above.id) }
        let tight = state(3, kept: ["People"], items: [above] + goals, standing: "People", focus: above)
        #expect(ruled(tight).standingLabel?.frame.minY == 283 && ruled(tight).standingLabel?.caret == nil)
        #expect(WalkLayout.make(tight, today: today).standingLabel?.caret == nil)
        // The ground's chips carry their mark inside their frame: no caret.
        var ground = WalkState(); ground.areas = ridge; ground.step = 1; ground.ground = true
        #expect(ruled(ground).labels.allSatisfy { $0.caret == nil })
    }

    /// Only the goal above and the step's own level are drawn: on Month season and month, on Week
    /// month and week; nothing of a level below the step, and nothing two levels up.
    @Test func noLevelAboveTheParentIsDrawn() {
        for (step, allowed) in [(2, [WalkLevel.year, .season]), (3, [.season, .month]), (4, [.month, .week]), (5, [.week, .today])] {
            var s = plan(DemoStress.full, step: step, standing: "Home")
            if step == 5 { s.firstThing = s.items(on: .week).first { $0.areaId == area("Home").id }?.id }
            let layout = ruled(s.settled)
            #expect(!layout.banners.isEmpty, "step \(step)")
            #expect(layout.banners.allSatisfy { allowed.contains($0.level) }, "step \(step): \(layout.banners.map(\.level))")
        }
        // Backed up to Year with a Season flag planted: it waits; Welcome draws nothing at all.
        let season = flag(.season, "Lift twice a week", in: "Home"), year = flag(.year, "Feel strong again", in: "Home")
        let backed = ruled(state(1, kept: ["Home"], items: [year, season], standing: "Home"))
        #expect(backed.banner(for: season) == nil && backed.banner(for: year) != nil)
        let welcome = ruled(state(0, kept: ["Health", "Home", "People"], items: [year, season]))
        #expect(welcome.posts.isEmpty && welcome.labels.isEmpty && welcome.sides.isEmpty)
    }

    // MARK: The other areas

    /// The full plan on Month, standing in People: Home and Health at the left (nearest first),
    /// Work and Money at the right; each a pennant for each of its month goals, and its count in words.
    @Test func otherAreasAreSmallPostsWithACount() {
        let s = plan(DemoStress.full, step: 3, standing: "People")
        let layout = ruled(s)
        #expect(layout.sides.map(\.name) == ["Home", "Health", "Work", "Money"])
        #expect(layout.sides.map(\.poleX) == [90, 33, 300, 357])
        #expect(layout.sides.map(\.count) == [3, 4, 4, 3])
        #expect(layout.sides.map(\.label) == ["Home, 3 goals this month", "Health, 4 goals this month",
                                              "Work, 4 goals this month", "Money, 3 goals this month"])
        for side in layout.sides {
            #expect(side.pennants.count == min(4, side.count) && side.extra == 0)
            #expect(side.pennants.allSatisfy { $0.level == .month })
            #expect(side.area == area(side.name).id && side.id == area(side.name).id.uuidString && side.extraFrame == nil)
        }
        // More than four: three pennants and the rest as "+n".
        let many = (1...6).map { flag(.year, "Goal \($0)", in: "Home") }
        let home = ruled(state(1, kept: ["Health", "Home"], items: many, standing: "Health")).sides
        #expect(home.count == 1 && home[0].pennants.count == 3 && home[0].extra == 3 && home[0].count == 6)
        // "+3" has the fourth pennant's place: 14 under the third, on the pole (Health stands; Home is right, inner low).
        #expect(home[0].extraFrame == CGRect(x: 301.75, y: 462 + 3 * 14, width: 20, height: 13))
        #expect(home[0].label == "Home, 6 goals this year")
        #expect(WalkCopy.sideLabel(name: "Work", count: 1, level: .year, periods: WalkPeriods.pick(now: today)) == "Work, 1 goal this year")
        #expect(WalkCopy.sideLabel(name: "Home", count: 3, level: .week, periods: WalkPeriods.pick(now: today)) == "Home, 3 tasks this week")
        #expect(WalkCopy.sideLabel(name: WalkCopy.noArea, count: 2, level: .month, periods: WalkPeriods.pick(now: today)) == "No area, 2 goals this month")
        #expect(WalkCopy.sideLabel(name: "Fun", count: 0, level: .season, periods: WalkPeriods.pick(now: today)).hasPrefix("Fun, no goals this "))
    }

    /// F4: lower down, an area with nothing on this level or the one above has no post; on Year
    /// every other kept area has one.
    @Test func aQuickWalkShowsNoEmptyPostsLowerDown() {
        let year = flag(.year, "Sign one more contract", in: "Work")
        let season = flag(.season, "Pitch three new clients", in: "Work", parent: year.id)
        let month = flag(.month, "Make 10 sales calls", in: "Work", parent: season.id)
        let kept = ["Health", "Home", "Work"]
        #expect(ruled(state(3, kept: kept, items: [year, season, month], standing: "Work", focus: season)).sides.isEmpty)
        let onYear = ruled(state(1, kept: kept, items: [year, season, month], standing: "Work")).sides
        #expect(onYear.map(\.name) == ["Home", "Health"])
        #expect(onYear.allSatisfy { $0.pennants.isEmpty && $0.count == 0 && WalkLayout.tapEvent($0) == .areaTapped($0.area!) })
        #expect(onYear.first?.label == "Home, no goals this year")
        // An area with only a goal above, or only a flag on this level, has one.
        let above = flag(.season, "Lift twice a week", in: "Health"), own = flag(.month, "Hire a skip", in: "Home")
        let both = ruled(state(3, kept: kept, items: [year, season, month, above, own], standing: "Work", focus: season)).sides
        #expect(both.map(\.name) == ["Home", "Health"] && both.map(\.count) == [1, 0])
    }

    /// F4 as a rule: over the generated first walks on steps 2 to 5, the named side posts are exactly
    /// the other kept areas with a flag on this level or the one above (Today: a week task). (On a
    /// walk down only the walked goal's line is on the mountain: `aWalkDownShowsOnlyItsLine`.)
    @Test func sidePostsStandForAreasWithSomethingHere() {
        var checked = 0
        for (s, layout) in zip(Generated.all, Generated.levelLayouts) where (2...5).contains(s.step) && !s.ground && s.walkingDown.isEmpty {
            let level = s.level!, own: WalkLevel = level == .today ? .week : level
            let above = WalkLevel(rawValue: level.rawValue - 1)!
            let expected = s.keptAreas.filter { a in
                a.id != s.standing && s.items.contains { s.column(of: $0) == a.id && ($0.level == own || $0.level == above) }
            }
            let drawn = layout.sides.compactMap(\.area)
            #expect(Set(drawn) == Set(expected.map(\.id)) && drawn.count == expected.count, "\(Generated.describe(s))")
            checked += 1
        }
        #expect(checked > 2000)
    }

    /// Review Focus 1: all eight areas kept and flags with no area. Seven named posts and the
    /// nameless one stand at the sides, four a side, and every guarantee holds, on every window.
    @Test func eightAreasAndALoosePileStillLayOut() {
        for step in 1...4 {
            var items: [WalkItem] = []
            for raw in 1...step {
                let lvl = WalkLevel(rawValue: raw)!
                for a in ridge { for n in 1...3 { items.append(WalkItem(id: UUID(), level: lvl, title: "\(a.name) goal \(n)", areaId: a.id)) } }
                items += (1...2).map { WalkItem(id: UUID(), level: lvl, title: "Loose \($0)", areaId: nil) }
            }
            for standing in ["Health", "Work", "Learning"] {
                let s = state(step, kept: names, items: items, standing: standing)
                #expect(s.standing == area(standing).id)
                for wing in wings {
                    for footing in [WalkFooting.level, .natural] {
                        let layout = WalkLayout.make(s, today: today, footing: footing, wing: wing)
                        #expect(layout.sides.count == 8 && layout.sides.filter { $0.area == nil }.count == 1)
                        let nameless = layout.sides.first { $0.area == nil }!
                        #expect(nameless.pill == nil && nameless.count == 2 && nameless.pennants.count == 2 && WalkLayout.tapEvent(nameless) == nil)
                        #expect(nameless.label.hasPrefix(step == 4 ? "No area, 2 tasks this week" : "No area, 2 goals this "))
                        let problems = Invariants.check(layout, s, wing: wing, touch: wing == 0 ? 44 : 55.7)
                        #expect(problems.isEmpty, "step \(step) in \(standing), wing \(wing), \(footing): \(problems.prefix(3))")
                    }
                }
            }
        }
        // Standing in the last area, the seven before it fill the left and spill to the right, nearest first.
        let s = state(1, kept: names, standing: "Learning")
        let sides = ruled(s).sides
        #expect(sides.map(\.name) == [longName, "Fun", "Money", "Work", "People", "Home", "Health"])
        #expect(sides.map(\.poleX) == [90, 33, 90, 33, 300, 357, 300])
        #expect(sides.map { $0.pill!.minY } == [524, 506, 438, 420, 524, 506, 438])
    }

    /// Every named side post drawn can be walked to: the tap it sends stands the walk in that area,
    /// on a first walk, a whole-year walk and a walk down alike. The nameless post sends nothing yet.
    @Test func everySidePostCanBeWalkedTo() {
        let env = WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today)
        var named = 0, onAWalkDown = 0
        for (s, layout) in zip(Generated.all, Generated.levelLayouts) {
            for side in layout.sides {
                guard let id = side.area else {
                    #expect(WalkLayout.tapEvent(side) == nil, "\(Generated.describe(s)): the nameless post")
                    continue
                }
                #expect(s.walksThere(id), "\(Generated.describe(s)): \(side.name)")
                #expect(WalkLayout.tapEvent(side) == .areaTapped(id))
                var after = s
                _ = after.apply(.areaTapped(id), env)
                #expect(after.standing == id, "\(Generated.describe(s)): a tap on \(side.name) did not walk there")
                #expect(!side.label.contains(", tap "))
                named += 1
                if !s.walkingDown.isEmpty { onAWalkDown += 1 }
            }
        }
        #expect(named > 5000 && onAWalkDown > 10)
    }

    /// F35: on a walk down only the walked goal's line is on the mountain. An area whose goals above
    /// are off that line has no post, on Today too, where its week tasks are off the line; an area the
    /// line reaches has one. (An area holding a flag on the step's own level can still be stood in, as
    /// the reducer has it, so it keeps its post.)
    @Test func aWalkDownShowsOnlyItsLine() {
        let walked = flag(.year, "Finish the bathroom", in: "Home"), other = flag(.year, "Feel strong again", in: "Health")
        let tile = flag(.season, "Tile the floor", in: "Home", parent: walked.id)
        let shop = flag(.season, "Ask the shop to deliver", in: "Work", parent: walked.id)       // the line reaches Work
        let lift = flag(.season, "Lift twice a week", in: "Health", parent: other.id)             // off the line
        var s = WalkState()
        s.areas = ridge
        s.kept = ["Health", "Home", "Work"].map { area($0).id }
        s.step = 3
        s.items = [walked, other, tile, shop, lift]
        s.walkingDown = [walked.id]
        s.focus[.month] = tile.id
        s = s.settled
        let layout = ruled(s)
        #expect(s.standing == area("Home").id && layout.banners(.parent).first?.itemId == tile.id)
        #expect(layout.sides.map(\.name) == ["Work"])
        #expect(!s.walksThere(area("Health").id))
        #expect(Invariants.check(layout, s).isEmpty)
        // The same plan on a first walk: Health has its post.
        var first = s
        first.walkingDown = []
        #expect(ruled(first.settled).sides.map(\.name) == ["Health", "Work"])
        // On Today, Health's week task is off the line: no post, and no way to stand there.
        let gym = flag(.month, "Find a gym", in: "Health", parent: lift.id), tour = flag(.week, "Tour the gym", in: "Health", parent: gym.id)
        let grout = flag(.month, "Buy the grout", in: "Home", parent: tile.id), call = flag(.week, "Call the tiler", in: "Home", parent: grout.id)
        var day = s
        day.step = 5
        day.items += [gym, tour, grout, call]
        day.focus = [:]
        day = day.settled
        #expect(day.standing == area("Home").id && ruled(day).sides.isEmpty && !day.walksThere(area("Health").id))
        // On Month, a month goal of Health's own is a flag on the step's level: the walk can stand there, so it has a post.
        var month = s
        month.items.append(gym)
        #expect(month.settled.walksThere(area("Health").id) && ruled(month.settled).sides.map(\.name) == ["Health", "Work"])
    }

    // MARK: Which flags

    /// Seven month goals, the oldest chosen: it is among those shown, in the oldest shown one's place.
    @Test func aChosenFlagIsAlwaysShown() {
        let above = flag(.season, "Slow Sundays", in: "People")
        let goals = (1...7).map { flag(.month, "Goal \($0)", in: "People", parent: above.id) }
        var s = state(3, kept: ["People"], items: [above] + goals, standing: "People", focus: above)
        #expect(ruled(s).banners(.full).compactMap(\.itemId) == goals.suffix(4).map(\.id))
        s.selected = goals[0].id
        let layout = ruled(s)
        #expect(layout.banners(.full).compactMap(\.itemId) == [goals[0].id] + goals.suffix(3).map(\.id))
        #expect(layout.banner(for: goals[0])?.glows == true)
        #expect(layout.banners(.full).filter(\.glows).count == 1)
        #expect(layout.mores.map(\.kind) == [.more(3)])
    }

    /// Examples, while on (F36): `e` examples, from `min(examples, max(2, 4 − flags))`, with the newest
    /// `min(flags, 4 − e)` of the person's flags. A person's own goals outrank examples: where that
    /// does not fit the examples give way first, down to one (the person's flags counted again for
    /// each `e`), and only then the person's flags, down to one. Year in Health has three examples
    /// (49, 66 and 49 high with their tag line); a one-line flag is 35.
    @Test func examplesTakeTheRoomLeft() {
        #expect(WalkCopy.examples(.year, area: "Health").count == 3)
        // own flags → (own shown, examples shown, "+n more")
        // 0: three examples (201). 1: the flag and three (240). 3: two flags and two examples would
        // need 252, so one example and all three flags (195). 5: three flags, one example, "+2 more" (221).
        for (own, expected) in [(0, (0, 3, 0)), (1, (1, 3, 0)), (3, (3, 1, 0)), (5, (3, 1, 2))] {
            let goals = (0..<own).map { flag(.year, "Goal \($0)", in: "Health") }
            var s = state(1, kept: ["Health", "Home"], items: goals, standing: "Health")
            s.examplesOn = [1]
            let layout = ruled(s)
            #expect(layout.banners(.full).count == expected.0, "\(own) own: \(layout.banners(.full).count) shown")
            #expect(layout.banners(.ghost).count == expected.1, "\(own) own: \(layout.banners(.ghost).count) examples")
            #expect(layout.mores.map(\.kind) == (expected.2 > 0 ? [.more(expected.2)] : []), "\(own) own")
            #expect(layout.banners(.full).compactMap(\.itemId) == goals.suffix(expected.0).map(\.id))
            #expect(layout.banners(.ghost).map(\.text) == Array(WalkCopy.examples(.year, area: "Health").prefix(expected.1)))
            // The person's flags, then the examples, then "+n more"; every one inside the stack's room.
            let kinds = layout.banners.map(\.kind)
            #expect(kinds == [WalkLayout.Kind](repeating: .full, count: expected.0) + [WalkLayout.Kind](repeating: .ghost, count: expected.1)
                    + (expected.2 > 0 ? [.more(expected.2)] : []))
            #expect(Invariants.check(layout, s).isEmpty)
            #expect(layout.posts.first?.pale == (own == 0))
        }
        // With room for both (the half window: every example on one line), three own flags show two and two examples (235).
        let goals = (0..<3).map { flag(.year, "Goal \($0)", in: "Health") }
        var s = state(1, kept: ["Health"], items: goals, standing: "Health")
        s.examplesOn = [1]
        let roomy = ruled(s, wing: 110.3)
        #expect(roomy.banners(.full).count == 2 && roomy.banners(.ghost).count == 2 && roomy.mores.map(\.kind) == [.more(1)])
        // An example's cloth carries its tag on a line of its own, and plants its own words.
        let ghost = ruled(s).banners(.ghost)[0]
        #expect(ghost.tag == WalkCopy.exampleTag && near(ghost.frame.height, 18 + 17 * CGFloat(ghost.lines) + 14, 0.01))
        #expect(WalkLayout.tapEvent(ghost, on: roomy.posts[0]) == .exampleTapped(WalkCopy.examples(.year, area: "Health")[0]))
        // Examples off again: none, and the flags as they stood.
        s.examplesOn = []
        #expect(ruled(s).banners(.ghost).isEmpty && ruled(s).banners(.full).count == 3)
    }

    /// F36: while examples are on and the area has one left, one shows, whatever else stands on the
    /// post: over the generated states, a chosen flag and long titles among them.
    @Test func anExampleAlwaysShowsWhileExamplesAreOn() {
        var on = 0, withAChosenFlag = 0
        for (s, layout) in zip(Generated.all, Generated.levelLayouts) where (1...4).contains(s.step) && !s.ground && s.examplesOn.contains(s.step) {
            let left = s.examplesLeft(today: today)
            #expect(layout.banners(.ghost).isEmpty == left.isEmpty, "\(Generated.describe(s)): \(left.count) left, \(layout.banners(.ghost).count) shown")
            #expect(layout.banners(.ghost).map(\.text) == Array(left.prefix(layout.banners(.ghost).count)))
            guard !left.isEmpty else { continue }
            on += 1
            if let chosen = s.selected, layout.banners.contains(where: { $0.itemId == chosen }) { withAChosenFlag += 1 }
        }
        #expect(on > 500 && withAChosenFlag > 50, "\(on) with examples showing, \(withAChosenFlag) beside a chosen flag")
        // Three goals of the person's own: all three stand, and one example with them (the examples gave way).
        let three = (0..<3).map { flag(.year, "Goal \($0)", in: "Health") }
        var mine = state(1, kept: ["Health"], items: three, standing: "Health")
        mine.examplesOn = [1]
        #expect(ruled(mine).banners(.full).count == 3 && ruled(mine).banners(.ghost).count == 1 && ruled(mine).mores.isEmpty)
        // A chosen flag with little room: three-line goals under a three-line goal above. One example
        // still shows, beside the chosen flag; the newer flags give way and are counted.
        let above = flag(.season, "Lift twice a week with the trainer at my gym", in: "Health")
        let goals = (0..<4).map { flag(.month, "Write the first chapter of the memoir I keep putting off \($0)", in: "Health", parent: above.id) }
        var s = state(3, kept: ["Health"], items: [above] + goals, standing: "Health", focus: above)
        s.examplesOn = [3]
        s.selected = goals[0].id
        let layout = ruled(s)
        #expect(layout.banners(.ghost).count == 1 && layout.banners(.full).map(\.itemId) == [goals[0].id])
        #expect(layout.banners(.full)[0].glows && layout.mores.map(\.kind) == [.more(3)] && Invariants.check(layout, s).isEmpty)
    }

    /// F36: examples never take the person's last flag, and they are the first to give way. Whenever
    /// the area holds a flag on this level, at least one of them shows, in full unless one flag and
    /// one example cannot both stand in full (then the flag is cut to the lines that fit: a three-line
    /// dated task beside a three-line example). While more than one example shows, the person has
    /// every flag the count allows (`min(flags, 4 − examples)`): flags give way only to the last example.
    @Test func examplesNeverTakeThePersonsLastFlag() {
        var checked = 0, cut = 0
        for wing in wings {
            for (s, layout) in zip(Generated.all, Generated.level(wing: wing)) where !layout.banners(.ghost).isEmpty {
                let here = s.items(on: s.level!).filter { s.column(of: $0) == s.standing }
                guard !here.isEmpty else { continue }
                let full = layout.banners(.full)
                #expect(!full.isEmpty, "wing \(wing), \(Generated.describe(s)): examples took every flag")
                if let chosen = s.selected, here.contains(where: { $0.id == chosen }) {
                    #expect(full.contains { $0.itemId == chosen }, "wing \(wing), \(Generated.describe(s)): the chosen flag gave way")
                }
                let examples = layout.banners(.ghost).count
                if examples > 1 {
                    #expect(full.count == min(here.count, 4 - examples),
                            "wing \(wing), \(Generated.describe(s)): \(full.count) of \(here.count) flags beside \(examples) examples")
                }
                let whole = full.allSatisfy { $0.lines == WalkLayout.lines(for: $0.text, width: WalkLayout.standingWidth(wing: wing)) }
                if !whole {
                    cut += 1
                    #expect(full.count == 1 && layout.banners(.ghost).count == 1, "wing \(wing), \(Generated.describe(s)): a title cut with more than one flag or example")
                }
                checked += 1
            }
        }
        #expect(checked > 1000)
        print("Examples: \(checked) posts with a flag and an example; the flag cut on \(cut)")
        // Seven goals and examples on: the newest three stand with one example; the rest are counted.
        let goals = (0..<7).map { flag(.year, "Goal \($0)", in: "Health") }
        var s = state(1, kept: ["Health"], items: goals, standing: "Health")
        s.examplesOn = [1]
        #expect(ruled(s).banners(.full).map(\.itemId) == goals.suffix(3).map(\.id) && ruled(s).mores.map(\.kind) == [.more(4)])
        #expect(ruled(s).banners(.ghost).count == 1)
        // A chosen older flag takes the oldest shown one's place.
        s.selected = goals[2].id
        #expect(ruled(s).banners(.full).map(\.itemId) == [goals[2].id, goals[5].id, goals[6].id] && ruled(s).banners(.ghost).count == 1)
    }

    @Test func aPlantedExampleDoesNotComeBack() {
        let gym = flag(.week, "Gym", in: "Home")
        var s = state(4, kept: ["Home"], items: [gym], standing: "Home")
        s.examplesOn = [4]
        #expect(ruled(s).banners(.ghost).map(\.text) == WalkCopy.examples(.week, area: "Home"))
        // "Call the tile shop on Monday", planted: Monday the 16th.
        s.items.append(flag(.week, "call the tile shop", in: "Home", day: day(2026, 11, 16)))
        #expect(ruled(s).banners(.ghost).map(\.text) == ["Measure the bathroom window today"])
        // An example keeps its id while another is planted.
        var year = state(1, kept: ["Health"], standing: "Health")
        year.examplesOn = [1]
        let before = ruled(year).banners(.ghost)
        year.items = [flag(.year, "Run a 5K", in: "Health")]
        let after = ruled(year).banners(.ghost)
        #expect(after.count == 2 && Set(after.map(\.id)).isSubset(of: Set(before.map(\.id))))
    }

    // MARK: The ground

    /// F5: the ground draws the areas' names only, each a choice; no post, no flag, no side post.
    @Test func theGroundShowsNamesOnly() {
        for s in Generated.ground() where s.ground {
            for footing in [WalkFooting.level, .natural] {
                let layout = WalkLayout.make(s, today: today, footing: footing)
                #expect(layout.posts.isEmpty && layout.sides.isEmpty)
                #expect(layout.labels.map(\.id) == s.areas.map(\.id))
                #expect(layout.labels.allSatisfy { $0.ground && $0.tappable && !$0.standing && $0.selected == s.kept.contains($0.id) })
            }
        }
        var six = WalkState()
        six.areas = Array(ridge.prefix(6)); six.step = 1; six.ground = true
        let labels = ruled(six).labels
        #expect(zip(labels.map(\.frame.midX), [50, 108, 166, 224, 282, 340] as [CGFloat]).allSatisfy { near($0, $1) })
        #expect(labels.first?.hint == "Tap to keep")
        // Two rows, the one nearest the midline (the leftmost of two) in the upper one; the lower row ends at
        // the standing foot, so no chip stands under the hint, the Undo pill or the spoken flag.
        #expect(labels.filter { $0.frame.maxY == 522 }.map(\.name) == ["Health", "People", "Money"])
        #expect(labels.filter { $0.frame.maxY == 556 }.map(\.name) == ["Home", "Work", "Fun"])
        #expect(labels.allSatisfy { $0.frame.height == 30 && $0.lines == 1 })
        // On a wider window the columns stand further apart.
        let wide = ruled(six, wing: 110.3).labels
        #expect(near(wide.first!.frame.midX, 195 - 217.5) && near(wide.last!.frame.midX, 195 + 217.5))
        #expect(WalkLayout.groundColumns(wing: 0) == 50...340)
    }

    // MARK: The same every time; the board's numbers

    @Test func theSameStateGivesTheSameLayout() {
        let s = plan(DemoStress.full, step: 3, standing: "People")
        for wing in wings {
            #expect(WalkLayout.make(s, today: today, footing: .level, wing: wing) == WalkLayout.make(s, today: today, footing: .level, wing: wing))
            #expect(WalkLayout.make(s, today: today, wing: wing) == WalkLayout.make(s, today: today, wing: wing))
        }
        // The layout is of the walk as it stands once settled: an unsettled place draws as its settled one.
        var raw = s
        raw.focusArea = nil
        raw.focus = [:]
        #expect(raw.standing == nil && raw.settled.standing != nil)
        #expect(ruled(raw) == ruled(raw.settled))
    }

    /// Review Focus 7: ruled, a phone has the board's numbers exactly.
    @Test func underLevelFootingTheNumbersAreTheBoards() {
        #expect(WalkLayout.standingFoot == 556 && WalkLayout.lowestCloth == 532 && WalkLayout.question == 282)
        #expect(WalkLayout.stretch(wing: 0) == 1 && WalkLayout.standingWidth(wing: 0) == 150 && WalkLayout.parentWidth(wing: 0) == 126)
        #expect(WalkLayout.sidePoles(wing: 0) == [90, 33, 300, 357] && WalkLayout.sidePill(wing: 0) == 58)
        #expect(WalkLayout.edges(wing: 0) == 4...386 && WalkLayout.column(wing: 0) == 0...390)

        let s = plan(DemoStress.full, step: 3, standing: "Health")
        let layout = ruled(s)
        let post = layout.posts[0]
        #expect(post.base == CGPoint(x: 195, y: 556) && post.lean == 0 && post.pole == 24)
        #expect(layout.banners.last?.frame.maxY == 532)
        // The goal above "Run three times a week" (two lines at 11 pt in its 126), then Health's four month
        // goals, each on its one line (18 + 17 = 35), 4 between cloths.
        let frames = layout.banners.map(\.frame)
        #expect(layout.banners.map(\.kind) == [.parent, .full, .full, .full, .full])
        #expect(frames == [CGRect(x: 132, y: 336, width: 126, height: 40), CGRect(x: 120, y: 380, width: 150, height: 35),
                           CGRect(x: 120, y: 419, width: 150, height: 35), CGRect(x: 120, y: 458, width: 150, height: 35),
                           CGRect(x: 120, y: 497, width: 150, height: 35)], "\(frames)")
        #expect(layout.banners.allSatisfy { $0.turn == 0 && $0.shift == 0 && $0.drawn == $0.frame })
        // The pill: "HEALTH" at 8.4 a capital and 24, 23 high, 6 above the goal above; its caret 2 above it.
        #expect(layout.standingLabel?.frame == CGRect(x: 195 - 37.5, y: 307, width: 75, height: 23))
        #expect(layout.standingLabel?.caret == CGRect(x: 190, y: 298, width: 10, height: 7))
        #expect(post.top == 336)

        // The side posts: Home, People, Work and Money all to the right of Health, inner low first.
        #expect(layout.sides.map(\.name) == ["Home", "People", "Work", "Money"])
        #expect(layout.sides.map(\.poleX) == [300, 357, 300, 357])
        #expect(layout.sides.map { $0.pill!.minY } == [524, 506, 438, 420])
        let home = layout.sides[0]
        #expect(home.pill == CGRect(x: 300 - 22, y: 524, width: 44, height: 21))            // HOME: 4 × 7.3 + 14, rounded up
        #expect(home.poleFoot == 520 && home.poleTop == 460 && home.lean == 0)
        #expect(home.pennants.map(\.frame) == (0..<3).map { CGRect(x: 301.75, y: 462 + 14 * CGFloat($0), width: 20, height: 13) })
        // PEOPLE is as wide as a side pill goes (58), centred on its pole and inside the edge.
        #expect(layout.sides[1].pill == CGRect(x: 328, y: 506, width: 58, height: 21))

        // On the half window (wing 110.3) the posts stand half as far apart again, and the flags are wider.
        #expect(WalkLayout.sidePoles(wing: 110.3) == [37.5, -48, 352.5, 438])
        #expect(WalkLayout.standingWidth(wing: 110.3) == 226.5 && WalkLayout.parentWidth(wing: 110.3) == 202.5)
        #expect(WalkLayout.sidePill(wing: 110.3) == 86.5)
        #expect(near(WalkLayout.edges(wing: 110.3).lowerBound, -106.3, 0.001) && near(WalkLayout.edges(wing: 110.3).upperBound, 496.3, 0.001))
        #expect(WalkLayout.column(wing: 110.3) == -85...475 && WalkLayout.column(wing: 40) == -40...430)
        let wide = ruled(s, wing: 110.3)
        #expect(wide.banners(.full).allSatisfy { $0.frame.width == 226.5 && near($0.frame.midX, 195, 0.001) })
        #expect(wide.banners(.parent).first?.frame.width == 202.5 && wide.banners(.full).count == 4 && wide.mores.isEmpty)
        let crowd = state(1, kept: ["Home"], items: (1...8).map { flag(.year, "Goal \($0)", in: "Home") }, standing: "Home")
        #expect(ruled(crowd, wing: 110.3).mores.first?.frame == CGRect(x: 156, y: 510, width: 78, height: 22))    // "+n more" stays 78
        #expect(wide.sides.allSatisfy { $0.pill!.width <= 86.5 })
        #expect(wide.posts[0].base == CGPoint(x: 195, y: 556))
    }

    /// Review Focus 6: on a wider window the side posts stand further apart, up to half as far again.
    @Test func aWiderWindowSpreadsTheSidePosts() {
        let outside = WalkLayout.sidePoles(wing: 42.3)
        #expect(zip(outside, [67.2, -2.1, 322.8, 392.1] as [CGFloat]).allSatisfy { near($0, $1, 0.05) }, "\(outside)")
        #expect(WalkLayout.sidePoles(wing: 404.9) == WalkLayout.sidePoles(wing: 110.3))
        #expect(WalkLayout.stretch(wing: 404.9) == 1.5 && WalkLayout.standingWidth(wing: 404.9) == 226.5)
        let s = plan(DemoStress.full, step: 3, standing: "People")
        for wing in wings {
            let poles = WalkLayout.sidePoles(wing: wing)
            #expect(ruled(s, wing: wing).sides.map(\.poleX) == poles)
            let phone = ruled(s).sides, here = ruled(s, wing: wing).sides
            #expect(here.map(\.name) == phone.map(\.name) && here.map(\.count) == phone.map(\.count))
            #expect(zip(here, phone).allSatisfy { $0.pill!.minY == $1.pill!.minY })
        }
    }

    /// The long plan's Month with four goals in one area: a wider window never takes more lines for
    /// a title, and shows at least as many flags.
    @Test func aWiderWindowShowsMoreOfALongPlan() {
        var s = plan(DemoStress.long, step: 3, standing: "Health")
        let above = s.items(on: .season).first { $0.areaId == area("Health").id }!
        for title in ["Find a gym close enough to walk to after work", "Buy proper running shoes from the shop on Main",
                      "No screens in the bedroom after ten at night"] {
            s.items.append(WalkItem(id: UUID(), level: .month, title: title, areaId: area("Health").id, parentId: above.id))
        }
        let phone = ruled(s), half = ruled(s, wing: 110.3)
        #expect(s.items(on: .month).filter { $0.areaId == area("Health").id }.count == 4)
        #expect(half.banners(.full).count >= phone.banners(.full).count)
        #expect(half.banners(.full).count > phone.banners(.full).count, "\(phone.banners(.full).count) then \(half.banners(.full).count)")
        for b in phone.banners(.full) {
            let wider = half.banners.first { $0.itemId == b.itemId }
            #expect(wider.map { $0.lines <= b.lines } == true)
        }
        #expect(half.banners(.parent).first!.lines <= phone.banners(.parent).first!.lines)
    }

    // MARK: Long words, long names (F20)

    /// A goal above of 44 characters stands whole on three lines, in its own narrower cloth.
    @Test func aParentOfFortyFourLettersStandsWhole() {
        // The long plan's Week in Home: a 44-character month goal above two week tasks. Its three lines
        // cost no flag (240 of 250): both tasks stand in full under it.
        let s = plan(DemoStress.long, step: 4, standing: "Home")
        let layout = ruled(s)
        let above = layout.banners(.parent).first!
        #expect(above.text == "Pick the tile and pay the contractor deposit" && above.text.count == 44)
        #expect(above.lines == WalkLayout.lines(for: above.text, width: 126, face: .parent) && above.lines == 3)
        #expect(near(above.frame.width, 126, 0.01) && near(above.frame.height, 12 + 14 * 3, 0.01))
        #expect(above.frame.minX >= 4 && above.frame.maxX <= 386 && above.frame.minY >= 282 && above.frame.maxY <= 532)
        #expect(above.level == .month && above.label.hasPrefix("Month: Pick the tile and pay the contractor deposit"))
        let tasks = s.items(on: .week).filter { $0.areaId == s.standing }
        #expect(tasks.count == 2 && layout.banners(.full).compactMap(\.itemId) == tasks.map(\.id) && layout.mores.isEmpty)
        #expect(near(layout.standingLabel!.frame.minY, 532 - 240, 0.01))
    }

    /// Standing in "Side projects and making": the pill takes two lines at the same size, the name
    /// whole, no wider than the flags; it still sits 6 above the top cloth, under the question.
    @Test func aLongAreaNameWrapsOnItsPost() {
        #expect(WalkLayout.pillLines(for: longName, width: 126) == ["SIDE PROJECTS", "AND MAKING"])
        #expect(WalkLayout.pillLines(for: "Health", width: 126) == ["HEALTH"])
        #expect(WalkLayout.pillLines(for: "One two three four five six seven", width: 126) == ["ONE TWO THREE", "FOUR FIVE SIX…"])
        for footing in [WalkFooting.level, .natural] {
            for count in [0, 1, 7] {
                let goals = (0..<count).map { flag(.year, "Open the shop with ten pieces photographed \($0)", in: longName) }
                let s = state(1, kept: ["Health", longName], items: goals, standing: longName)
                let layout = WalkLayout.make(s, today: today, footing: footing)
                let label = layout.standingLabel!
                #expect(label.lines == 2 && label.name == longName && label.frame.height == 37)
                #expect(label.frame.width <= 150 && label.frame.width == ceil(13 * 8.4 + 24))
                let under = layout.banners.first?.frame.minY ?? layout.posts[0].top
                #expect(under - label.frame.maxY <= 8 && label.frame.maxY <= under + 0.01)
                #expect(label.frame.minY >= 282 && layout.banners.allSatisfy { $0.drawn.minY >= 282 })
                #expect(Invariants.check(layout, s).isEmpty)
            }
        }
        // The taller pill counts in the stack: four week tasks that stand under a one-line pill
        // (23 + 6 + 49 + 3 × 52 + 3 × 4 = 246) are one too many under a two-line pill (260).
        let titles = ["Call Mum", "Plan a pancake Sunday", "Book train tickets to Gran", "Call Mum about Sunday lunch"]
        func tasks(_ name: String) -> [WalkItem] {
            titles.enumerated().map { flag(.week, $0.element, in: name, day: $0.offset == 0 ? day(2026, 11, 17) : nil) }
        }
        let short = ruled(state(4, kept: ["Fun"], items: tasks("Fun"), standing: "Fun"))
        let long = ruled(state(4, kept: [longName], items: tasks(longName), standing: longName))
        #expect(short.banners(.full).count == 4 && short.standingLabel?.frame.minY == 286)
        #expect(long.banners(.full).count == 3 && long.mores.map(\.kind) == [.more(1)])
    }

    /// On the ground a name too long for its chip takes two lines at the same size, in a taller
    /// chip that meets no other.
    @Test func aLongAreaNameWrapsOnTheGround() {
        for count in 1...8 {
            for at in Set([0, count / 2, count - 1]) {
                var s = WalkState()
                s.areas = Array(ridge.filter { $0.name != longName }.prefix(count - 1))
                s.areas.insert(area(longName), at: min(at, s.areas.count))
                s.step = 1; s.ground = true
                for footing in [WalkFooting.level, .natural] {
                    for wing in wings {
                        let layout = WalkLayout.make(s, today: today, footing: footing, wing: wing)
                        let label = layout.labels.first { $0.name == longName }!
                        #expect(label.lines == 2 && label.frame.height == 44, "\(count) areas")
                        #expect(layout.labels.filter { $0.name != longName }.allSatisfy { $0.lines == 1 && $0.frame.height == 30 })
                        for other in layout.labels where other.id != label.id {
                            #expect(!Invariants.overlap(label.frame, other.frame), "\(count) areas, at \(at): meets \(other.name)")
                        }
                        #expect(Invariants.check(layout, s, wing: wing, touch: wing == 0 ? 44 : 55.7).isEmpty,
                                "\(count) areas at \(at), wing \(wing): \(Invariants.check(layout, s, wing: wing, touch: wing == 0 ? 44 : 55.7).prefix(2))")
                    }
                }
            }
        }
    }

    /// S20: a 60-letter word is drawn with soft hyphens where it breaks, on three lines; the flag's
    /// VoiceOver label keeps the word as written.
    @Test func aLongWordIsHyphenatedWhereItBreaks() {
        let word = String(repeating: "x", count: 60)
        let drawn = WalkLayout.drawnTitle(word, width: 150)
        #expect(drawn.contains("\u{00AD}") && drawn.replacingOccurrences(of: "\u{00AD}", with: "") == word)
        // Each line of it is as many letters as fit with their hyphen in the cloth's 134: 17 of these.
        let pieces = drawn.components(separatedBy: "\u{00AD}")
        #expect(pieces.map(\.count) == [17, 17, 17, 9])
        #expect(pieces.dropLast().allSatisfy { WalkLayout.textWidth($0 + "-", face: .flag) <= 134 && WalkLayout.textWidth($0 + "x-", face: .flag) > 134 })
        #expect(WalkLayout.lines(for: word, width: 150) == 3 && WalkLayout.lines(for: drawn, width: 150) == 3)
        #expect(WalkLayout.drawnTitle("Call Mum about Sunday lunch", width: 150) == "Call Mum about Sunday lunch")
        #expect(WalkLayout.drawnTitle(drawn, width: 150) == drawn)
        let item = flag(.year, "Say \(word)", in: "Home")
        let b = ruled(state(1, kept: ["Home"], items: [item], standing: "Home")).banner(for: item)!
        #expect(b.text.contains("\u{00AD}") && b.lines == 3 && b.label == "Year: Say \(word), tap to move or remove")
    }

    /// Lines are counted as the words wrap, by the face's own widths at the cloth's size (F33): a
    /// title of 20 or 21 ordinary letters is one line of a flag, not two; a goal above is set
    /// smaller, in a narrower cloth. (`theLinesAreTheRealFaces` measures the count against the font.)
    @Test func linesCountTheWrappedWords() {
        #expect(WalkLayout.lines(for: "Gym", width: 150) == 1)
        #expect(WalkLayout.lines(for: "Feel strong again", width: 150) == 1)
        #expect(WalkLayout.lines(for: "No screens after ten", width: 150) == 1)                 // 128 of 134
        #expect(WalkLayout.lines(for: "Run a 10k in the fall", width: 150) == 1)
        #expect(WalkLayout.lines(for: "Sleep seven hours most nights", width: 150) == 2)
        #expect(WalkLayout.lines(for: "Understand everything about investing", width: 150) == 3)  // a word a line
        #expect(WalkLayout.lines(for: "Lift twice a week with the trainer at my gym", width: 150) == 3)
        #expect(WalkLayout.lines(for: String(repeating: "Walk more every day. ", count: 10), width: 150) == 3)
        #expect(WalkLayout.lines(for: "Lift twice a week with the trainer at my gym", width: 226.5) == 2)
        // The goal above: 11 pt, 6 either side of its 126.
        #expect(WalkLayout.lines(for: "Lift twice a week", width: 126, face: .parent) == 1)       // 89 of 114
        #expect(WalkLayout.lines(for: "Run three times a week", width: 126, face: .parent) == 2)
        #expect(WalkLayout.lines(for: "Pick the tile and pay the contractor deposit", width: 126, face: .parent) == 3)
        // Widths: the sum of the face's own, at the size, and the tracking after each letter of a tag.
        #expect(near(WalkLayout.textWidth("No screens after ten", face: .flag), 127.985, 0.01))
        #expect(near(WalkLayout.textWidth("No screens after ten", face: .parent), 108.295, 0.01))
        #expect(near(WalkLayout.textWidth(WalkCopy.exampleTag, face: .tag), 131.306, 0.01))
        #expect(WalkLayout.glyphWidth("é") == WalkLayout.glyphWidth("e") && WalkLayout.glyphWidth("好") == 1000)
        #expect(WalkLayout.glyphWidths.count == 95)
        for title in Generated.titles {
            #expect(WalkLayout.lines(for: title, width: 226.5) <= WalkLayout.lines(for: title, width: 150))
        }
        // A hyphen of the word's own is a place a line may end.
        #expect(WalkLayout.lines(for: "Book a mid-afternoon check-up", width: 150) == 2)
    }

    #if canImport(UIKit)
    /// How many lines a string really takes in a face at a width: TextKit's own line fragments.
    @MainActor private static func realLines(_ text: String, font: UIFont, width: CGFloat) -> Int {
        let storage = NSTextStorage(string: text, attributes: [.font: font])
        let manager = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        var lines = 0
        manager.enumerateLineFragments(forGlyphRange: manager.glyphRange(for: container)) { _, _, _, _, _ in lines += 1 }
        return lines
    }

    /// The titles the count is held to: every title of the two stress plans and of the demo's preview
    /// plan as the walk plants them, every example, and the generator's titles (a 200-character title
    /// and a 60-letter word among them).
    static var corpus: [String] {
        var out: [String] = []
        for plan in [DemoStress.full, DemoStress.long] {
            out += plan.script.map { WalkWords.said($0.1, level: $0.0, today: today)?.title ?? $0.1 }
        }
        for level in [WalkLevel.year, .season, .month, .week] {
            for name in ["Health", "Home", "People", "Work", "Money", "Fun"] { out += WalkCopy.examples(level, area: name) }
        }
        out += ["Feel strong again", "Finish the bathroom", "More slow weekends together", "Bathroom done by February",
                "Lift twice a week", "Pick the tile and pay the deposit", "Send the contractor the deposit", "Choose the tile"]
        out += Generated.titles
        var seen = Set<String>()
        return out.filter { seen.insert($0).inserted }
    }

    /// The titles the count gives a line more than the face sets them on, by cloth: a blank band, never
    /// a cut. Listed so that a change which adds one is seen. One: on the outside screen's 183-wide flag
    /// the face's kerning draws this example a hair inside the line that its letters' widths just pass.
    static let blankBands: Set<String> = ["flag at 183: Book the first camping trip"]

    /// F33: the lines the layout counts are the lines the bundled face really sets, on every cloth
    /// (a flag at 13 pt, the goal above at 11, a Look back up cloth at 12; a phone, the outside screen
    /// and the half window). Never fewer (that would cut a title); and for this corpus never more (a
    /// blank band in the cloth), but for `blankBands`. And no string is counted narrower than it is set.
    @Test @MainActor func theLinesAreTheRealFaces() throws {
        let corpus = Self.corpus
        #expect(corpus.count > 120 && corpus.contains { $0.count == 200 })
        var cloths: [(face: WalkLayout.Face, width: CGFloat)] = [(.lookBack, 150)]
        for wing: CGFloat in [0, 42.3, 110.3] {
            cloths += [(.flag, WalkLayout.standingWidth(wing: wing)), (.parent, WalkLayout.parentWidth(wing: wing))]
        }
        var short: [String] = [], narrow: [String] = [], bands = Set<String>()
        var checked = 0, twoOrMore = 0
        for (face, width) in cloths {
            let font = try #require(UIFont(name: "DMSans-SemiBold", size: face.size), "the bundled face is not there")
            for title in corpus {
                let drawn = WalkLayout.drawnTitle(title, width: width, face: face)
                let real = min(3, Self.realLines(drawn, font: font, width: width - face.inset))
                let counted = WalkLayout.lines(for: title, width: width, face: face)
                if counted < real { short.append("\(face) \(width): “\(title.prefix(50))” counted \(counted), set on \(real)") }
                if counted > real { bands.insert("\(face) at \(Int(width)): \(title)") }
                let across = (title as NSString).size(withAttributes: [.font: font]).width
                if WalkLayout.textWidth(title, face: face) < across - 0.01 {
                    narrow.append("\(face): “\(title.prefix(50))” counted \(WalkLayout.textWidth(title, face: face)), set \(across)")
                }
                checked += 1
                if real > 1 { twoOrMore += 1 }
            }
        }
        #expect(short.isEmpty, "counted on fewer lines than the face sets them: \(short.prefix(5))")
        #expect(narrow.isEmpty, "counted narrower than the face sets them: \(narrow.prefix(5))")
        #expect(bands == Self.blankBands, "a line more than the face needs: \(bands.sorted())")
        #expect(checked > 800 && twoOrMore > 200)
        print("The faces: \(corpus.count) titles on \(cloths.count) cloths, \(checked) counts, \(twoOrMore) of them on two lines or more; a line more on \(bands.count)")
        // The tag line: no tag is wider than counted, and each fits the line of the cloth it is given.
        let tagFont = try #require(UIFont(name: "DMSans-SemiBold", size: WalkLayout.Face.tag.size))
        let days = (0..<9).map { WalkWords.tag(for: PlanCalendar.calendar.date(byAdding: .day, value: $0, to: today)!, today: today) }
        for tag in [WalkCopy.exampleTag, WalkCopy.exampleTagShort, WalkCopy.firstThingTag] + days {
            let across = (tag as NSString).size(withAttributes: [.font: tagFont, .kern: WalkLayout.Face.tag.tracking]).width
            #expect(across <= WalkLayout.textWidth(tag, face: .tag) + 0.01, "\(tag): set \(across)")
            #expect(across <= 150 - WalkLayout.Face.tag.inset || tag == WalkCopy.exampleTag, "\(tag) does not fit a phone's cloth")
        }
        for width: CGFloat in [150, WalkLayout.standingWidth(wing: 42.3), 226.5] {
            let tag = WalkLayout.exampleTag(forWidth: width)
            let across = (tag as NSString).size(withAttributes: [.font: tagFont, .kern: WalkLayout.Face.tag.tracking]).width
            #expect(across <= width - WalkLayout.Face.tag.inset, "\(tag) at \(width): \(across)")
        }
    }
    #endif

    // MARK: Tags, Today

    /// S26: a tag has a line of its own: a Week flag with a day is 19 + 17 a line + 14.
    @Test func tagsHaveTheirOwnLine() {
        let month = flag(.month, "Pick the tile", in: "Home")
        let dated = flag(.week, "Call the tile shop", in: "Home", parent: month.id, day: day(2026, 11, 17))
        let loose = flag(.week, "Measure the floor twice", in: "Home", parent: month.id)
        let layout = ruled(state(4, kept: ["Home"], items: [month, dated, loose], standing: "Home", focus: month))
        let a = layout.banner(for: dated)!, b = layout.banner(for: loose)!
        #expect(a.tag == "TUESDAY" && a.lines == 1 && near(a.frame.height, 18 + 17 + 14, 0.01))
        #expect(b.tag == nil && b.lines == 2 && near(b.frame.height, 18 + 34, 0.01))
        #expect(layout.banner(for: month)?.tag == nil && layout.banner(for: month)?.kind == .parent)
        #expect(a.label == "Week: Call the tile shop, Tuesday, tap to move or remove")
        // An example's long tag where the cloth holds it on its line (131 at 11 pt, tracked: a phone's 150 does).
        #expect(WalkLayout.exampleTag(forWidth: 150) == WalkCopy.exampleTag && WalkLayout.exampleTag(forWidth: 226.5) == WalkCopy.exampleTag)
        #expect(WalkLayout.exampleTag(forWidth: 147) == WalkCopy.exampleTagShort)
    }

    /// On Today the goal above is the focused week task (the `parent` flag) and the one flag in full
    /// is the first thing, tagged; a first thing that is itself the goal above is drawn once.
    @Test func onTodayTheFirstThingIsTheOneFullFlag() {
        let shop = flag(.week, "Call the shop", in: "Home", day: today), deposit = flag(.week, "Send the deposit", in: "Home", day: today)
        var s = state(5, kept: ["Health", "Home"], items: [shop, deposit], standing: "Home", focus: shop)
        s.firstThing = deposit.id
        var layout = ruled(s)
        #expect(layout.posts.first?.key == WalkPostKey(level: .today, column: area("Home").id))
        #expect(layout.banners.map(\.kind) == [.parent, .full])
        let first = layout.banner(for: deposit)!
        #expect(first.level == .today && first.tag == WalkCopy.firstThingTag && near(first.frame.height, 18 + 17 + 14, 0.01))
        #expect(first.label == WalkCopy.bannerLabel(deposit.title, level: .today, tag: WalkCopy.firstThingTag, role: .firstThingMine))
        #expect(layout.banner(for: shop)?.level == .week && layout.banner(for: shop)?.taps == true)       // the next one here
        #expect(layout.needleDown)
        // The first thing as the goal above: once, as the first thing, glowing.
        s.focus[.today] = deposit.id
        layout = ruled(s)
        #expect(layout.banners.map(\.kind) == [.full] && layout.banners[0].itemId == deposit.id && layout.banners[0].glows)
        #expect(layout.banners[0].label == WalkCopy.bannerLabel(deposit.title, level: .today, tag: WalkCopy.firstThingTag, role: .firstThingFocused))
        // Not planted by this walk, another the goal above: a tap makes it the goal above.
        s.items[1].mine = false
        s.focus[.today] = shop.id
        #expect(ruled(s).banner(for: deposit)?.label
                == WalkCopy.bannerLabel(deposit.title, level: .today, tag: WalkCopy.firstThingTag, role: .firstThingFocusable))
        // A first thing in another area stands there, not here: here the goal above alone.
        s.items[1].areaId = area("Health").id
        layout = ruled(s.settled)
        #expect(layout.banners.map(\.itemId) == [shop.id] && layout.sides.map(\.name) == ["Health"])
        #expect(layout.sides[0].pennants.map(\.level) == [.week] && layout.sides[0].label == "Health, 1 task this week")
    }

    @Test func theNeedlePointsDownOnceSomethingIsPlanted() {
        #expect(ruled(state(0)).needleDown)
        var s = state(1, kept: ["Home"])
        #expect(!ruled(s).needleDown)
        s.items = [flag(.year, "Run a 5K", in: "Home")]
        #expect(ruled(s).needleDown)
        let week = flag(.week, "Gym", in: "Home")
        var t = state(5, kept: ["Home"], items: [week])
        #expect(!ruled(t).needleDown)
        t.firstThing = week.id
        #expect(ruled(t).needleDown)
    }

    // MARK: VoiceOver, and what a tap does

    @Test func bannersSayWhatATapDoes() {
        let mine = flag(.year, "Run a 5K", in: "Home")
        let theirs = flag(.year, "Read more", in: "Home", mine: false)
        var s = state(1, kept: ["Health", "Home"], items: [mine, theirs], standing: "Home")
        var layout = ruled(s)
        #expect(layout.banner(for: mine)?.label == "Year: Run a 5K, tap to move or remove" && layout.banner(for: mine)?.taps == true)
        #expect(layout.banner(for: theirs)?.label == "Year: Read more" && layout.banner(for: theirs)?.taps == false)
        #expect(layout.standingLabel?.hint == "You are here" && layout.standingLabel?.selected == false)

        // On Season the year goal is the goal above: read only while it is the only one here,
        // a tap for the next once there is another.
        s.step = 2
        s = s.settled
        layout = ruled(s)
        let focused = s.item(s.focus[.season])!
        #expect(layout.banners.map(\.kind) == [.parent])
        #expect(layout.banners[0].label == "Year: \(focused.title), the goal this step is about, tap for the next one here")
        #expect(layout.banners[0].taps && WalkLayout.tapEvent(layout.banners[0], on: layout.posts[0]) == .bannerTapped(focused.id))
        let alone = ruled(state(2, kept: ["Home"], items: [mine], standing: "Home"))
        #expect(alone.banners[0].label == "Year: Run a 5K, the goal this step is about" && !alone.banners[0].taps)

        var ex = state(1, kept: ["Health"], standing: "Health")
        ex.examplesOn = [1]
        let ghost = ruled(ex).banners(.ghost).first
        #expect(ghost?.label == "Example: Feel strong again, tap to make it yours" && ghost?.taps == true)

        // "+n more" opens the paper, which is not here yet: it says how many and promises no tap.
        let crowd = (1...8).map { flag(.year, "Goal \($0)", in: "Home") }
        let crowded = ruled(state(1, kept: ["Home"], items: crowd, standing: "Home"))
        let more = crowded.mores.first
        #expect(more?.kind == .more(4) && more?.text == "+4 more" && more?.label == "4 more" && more?.taps == false)
        #expect(more.map { WalkLayout.tapEvent($0, on: crowded.posts[0]) == nil } == true)
    }

    /// The layout's words against the reducer, over every generated state (each settled, as the walk
    /// always is, Today with a first thing among them): a flag whose role says it takes a tap changes
    /// the walk when its tap is sent, one that says it takes none does not, and its VoiceOver label
    /// says "tap" exactly when it does.
    @Test func aBannerTakesATapExactlyWhenTheReducerActsOnIt() {
        let env = WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today)
        let states = Generated.all, layouts = Generated.levelLayouts
        let found: [(Int, [String])] = Generated.parallel(states.count) { i in
            let s = states[i]
            var disagreements: [String] = []
            var seen = 0
            for post in layouts[i].posts {
                for banner in post.banners {
                    seen += 1
                    if banner.label.contains(", tap ") != banner.taps {
                        disagreements.append("\(Generated.describe(s)): “\(banner.label)” but taps \(banner.taps)")
                    }
                    guard let event = WalkLayout.tapEvent(banner, on: post) else {
                        if banner.taps { disagreements.append("\(Generated.describe(s)): \(banner.label) sends nothing") }
                        continue
                    }
                    var after = s
                    let effects = after.apply(event, env)
                    let acts = after != s || !effects.isEmpty
                    if acts != banner.taps {
                        disagreements.append("\(Generated.describe(s)): \(banner.label) taps \(banner.taps), reducer acts \(acts)")
                    }
                }
            }
            return (seen, disagreements)
        }
        let disagreements = found.flatMap(\.1)
        #expect(disagreements.isEmpty, "\(disagreements.count): \(disagreements.prefix(6))")
        #expect(found.reduce(0) { $0 + $1.0 } > 10_000)
        let today5 = zip(states, layouts).filter { $0.step == 5 && $0.firstThing != nil && $1.banners.contains { $0.level == .today } }
        #expect(today5.count > 100, "Today with a first thing drawn: \(today5.count)")
        let kinds = Set(layouts.flatMap { $0.posts.flatMap(\.banners) }.map { b -> String in
            switch b.kind { case .full: "full"; case .parent: "parent"; case .compact: "compact"; case .more: "more"; case .ghost: "ghost" }
        })
        #expect(kinds == ["full", "parent", "more", "ghost"])
    }

    // MARK: Many states

    /// The sweep: every generated state, on a phone and on the three wider stages, ruled and planted
    /// by hand, keeps every guarantee (`Invariants.check`, (a) to (h)). A touch is 44 points on a
    /// phone and 55.7 where the board is drawn at 79%.
    @Test(arguments: [WalkFooting.natural, .level]) func nothingOverlaps(_ footing: WalkFooting) {
        let states = Generated.all
        var checked = 0
        for wing in wings {
            let found = Generated.parallel(states.count) { i -> [String] in
                let layout = WalkLayout.make(states[i], today: today, footing: footing, wing: wing)
                // (h), wherever the spoken flag would stand: nothing of this layout is in its place.
                let spoken = (1...5).contains(states[i].step) ? Invariants.spoken(WalkLayout.spokenFlagRect, layout) : []
                return Invariants.check(layout, states[i], wing: wing, touch: wing == 0 ? 44 : 55.7) + spoken.map { "(h) \($0)" }
            }
            for (s, problems) in zip(states, found) {
                #expect(problems.isEmpty, "\(footing), wing \(wing), \(Generated.describe(s)): \(problems.prefix(3))")
                if !problems.isEmpty { return }
                checked += 1
            }
        }
        #expect(checked == 4 * states.count && states.count > 4000)
        print("The sweep: \(states.count) states at \(wings.count) wings, \(footing)")
    }

    /// S25: while the light is speaking or finishing the spoken flag stands above it (120, 560, 150 ×
    /// 36), and meets no side post, no label and no cloth, on any generated state, the ground too.
    @Test func theSpokenFlagKeepsClear() {
        var s = state(3, kept: ["Home"])
        #expect(WalkLayout.make(s, today: today).spokenFlag == nil)
        for orb in [WalkState.Orb.speaking(live: "pick the"), .finishing(live: "pick the tile")] {
            s.orb = orb
            #expect(WalkLayout.make(s, today: today).spokenFlag == CGRect(x: 120, y: 560, width: 150, height: 36))
        }
        for orb in [WalkState.Orb.open, .holding(hover: nil)] { s.orb = orb; #expect(WalkLayout.make(s, today: today).spokenFlag == nil) }
        for step in [0, 6] { var t = state(step); t.orb = .speaking(live: "x"); #expect(WalkLayout.make(t, today: today).spokenFlag == nil) }

        // Every generated state while speaking, planted by hand: the flag is there and meets nothing
        // (`Invariants.check`, (h)). The sweep (`nothingOverlaps`) measures the same place on every
        // wing and both footings.
        let bases = Generated.all.filter { (1...5).contains($0.step) }
        let found = Generated.parallel(bases.count) { i -> [String] in
            var speaking = bases[i]
            speaking.orb = .speaking(live: "pick the tile")
            let layout = WalkLayout.make(speaking, today: today, footing: .natural)
            guard let spoken = layout.spokenFlag, spoken == WalkLayout.spokenFlagRect else { return ["no spoken flag"] }
            return Invariants.check(layout, bases[i]).filter { $0.hasPrefix("(h)") } + Invariants.spoken(spoken, layout)
        }
        for (base, problems) in zip(bases, found) {
            #expect(problems.isEmpty, "\(Generated.describe(base)): \(problems.prefix(2))")
            if !problems.isEmpty { return }
        }
        #expect(bases.count > 6000)
    }

    /// Review Focus 6: on the Duo's outside screen (466 × 678, the system's column over the right 84
    /// points) no pill, pennant, cloth or count stands under the column: every frame the layout
    /// makes, through that stage, ends at or left of device x 382.
    @Test func nothingStandsUnderTheOutsideScreensColumn() {
        let stage = WalkStage(device: CGSize(width: 466, height: 678), right: 84)
        #expect(near(stage.wing, 42.8, 0.05))
        let states = Generated.all
        var checked = 0
        for footing in [WalkFooting.natural, .level] {
            let found = Generated.parallel(states.count) { i -> (Int, String?) in
                let all = Invariants.everything(WalkLayout.make(states[i], today: today, footing: footing, wing: stage.wing))
                for (what, frame) in all {
                    let right = stage.toDevice(CGPoint(x: frame.maxX, y: frame.minY)).x
                    let left = stage.toDevice(CGPoint(x: frame.minX, y: frame.minY)).x
                    if right > 382 + 0.01 || left < 0 { return (0, "\(what) \(frame) reaches device x \(left)…\(right)") }
                }
                return (all.count, nil)
            }
            for (s, result) in zip(states, found) {
                if let problem = result.1 { Issue.record("\(footing), \(Generated.describe(s)): \(problem)"); return }
                checked += result.0
            }
        }
        #expect(checked > 50_000)
    }

    /// Look back up arrives with its own cloths in Task 8. Until then step 6 keeps the area's name
    /// (the pill's top at 110) and the side posts, every other kept area one, and no post.
    @Test func lookBackUpKeepsItsNameAndSidePosts() {
        let s = plan(DemoStress.full, step: 6, standing: "People")
        #expect(s.standing == area("People").id)
        let layout = ruled(s)
        #expect(layout.posts.isEmpty && layout.camera == art.stops[6])
        #expect(layout.standingLabel?.frame.minY == 110 && layout.standingLabel?.name == "People")
        #expect(layout.standingLabel?.caret == CGRect(x: 190, y: 101, width: 10, height: 7))
        #expect(layout.sides.map(\.name) == ["Home", "Health", "Work", "Money"])
        // A pennant for each of an area's flags, newest first, in its own level's colour.
        #expect(layout.sides[0].count == 14 && layout.sides[0].pennants.count == 3 && layout.sides[0].extra == 11)
        #expect(layout.sides[0].pennants.allSatisfy { $0.level == .week })
        #expect(layout.sides[0].label == "Home, 14 in your plan")
        #expect(layout.sides.allSatisfy { WalkLayout.tapEvent($0) == .areaTapped($0.area!) })
    }

    /// The side pills at their widest: two in one row of one side give way equally and stand 1
    /// apart, each still on its pole; alone, a pill keeps the board's 58. And the high row's pill
    /// ends above the pole of the post below it.
    @Test func sidePillsKeepApart() {
        var s = WalkState()
        let wide = ["Health", "People", "Garden", "Family", "Travel", "Friends", "Reading", "Studio"]
        s.areas = wide.enumerated().map { WalkArea(id: uid(3000 + $0.offset), name: $0.element) }
        s.kept = s.areas.map(\.id)
        s.step = 1
        s.focusArea = s.areas[4].id                                // Travel: four to the left, three to the right
        for wing in wings {
            let layout = ruled(s.settled, wing: wing)
            let poles = WalkLayout.sidePoles(wing: wing), cap = WalkLayout.sidePill(wing: wing)
            #expect(layout.sides.count == 7)
            let pills = layout.sides.map { $0.pill! }
            // Left: Family (inner low), Garden (outer low), People (inner high), Health (outer high).
            #expect(near(pills[0].midX, poles[0], 0.01) && near(pills[1].midX, poles[1], 0.01))
            #expect(pills[0].minX - pills[1].maxX >= 1 - 0.01 && pills[2].minX - pills[3].maxX >= 1 - 0.01, "wing \(wing)")
            if wing == 0 {
                #expect(pills[0].width == 56 && pills[1].width == 56)
                #expect(near(pills[0].minX - pills[1].maxX, 1, 0.01) && near(pills[2].minX - pills[3].maxX, 1, 0.01))
            }
            #expect(pills.allSatisfy { $0.width <= cap })
            // Right: Friends (inner low), Reading (outer low), Studio (inner high, alone in its row).
            #expect(layout.sides[6].name == "Studio" && (wing > 0 || pills[6].width == 58))
            #expect(Invariants.check(layout, s.settled, wing: wing, touch: wing == 0 ? 44 : 55.7).isEmpty)
            // The high row: its pill ends 1 above the pole of the post under it.
            #expect(near(layout.sides[0].poleTop - pills[2].maxY, 1, 0.01) && near(layout.sides[1].poleTop - pills[3].maxY, 1, 0.01))
        }
    }

    /// The controls, in every generated state at rest, with the Undo pill, with a flag chosen (the Move
    /// row), with notes, with speech off, with the compass open, speaking and with the light being
    /// taught, on both footings: the top row, Next, the hint, the Undo pill, the Move row and the lesson
    /// never meet each other or the light's ring (and so its touch), and at rest none of them meets a
    /// cloth, a label or a side post: the layout plants nothing under the hint (open or taught, they
    /// sit on the veil over the scene, as the points' words do). The top row stands in its band (y 44
    /// to 88), the rest on the stage below the question and above the home-indicator zone; the hint is
    /// always one line.
    @Test(arguments: [WalkFooting.natural, .level]) func theControlsUnderTheLightKeepClear(_ footing: WalkFooting) {
        let insetTop = art.stage.height - WalkLayout.homeIndicator
        let notes = [WalkCopy.nothingToPlant, WalkCopy.ridgeFull, WalkCopy.speechOff]
        let periods = WalkPeriods.pick(now: today)
        let states = Generated.all, layouts = Generated.layouts(footing)
        let bases = states.indices.filter { (0...5).contains(states[$0].step) }
        let topRow: Set<String> = ["back", "more", "leave"]
        let swept: [[(WalkState, [String])]] = Generated.parallel(bases.count) { n in
            let base = states[bases[n]], layout = layouts[bases[n]]
            let drawn = Invariants.everything(layout).map(\.1)
            var variants = [base]
            // A flag chosen: its Move to / Remove row stands where the hint was.
            if let chosen = layout.posts.flatMap(\.banners).first(where: { $0.kind == .full })?.itemId {
                var moving = base; moving.selected = chosen; variants.append(moving)
            }
            var undo = base; undo.undo = [.plant(uid(1))]; undo.undoShowing = true; variants.append(undo)
            for note in notes { var v = base; v.note = note; variants.append(v) }
            var off = base; off.speechIsOff = true; variants.append(off)
            var open = base; open.orb = .open; variants.append(open)
            var speaking = base; speaking.orb = .speaking(live: "x"); variants.append(speaking)
            // The lesson begins only on arriving at a step, where nothing is chosen yet.
            var taught = base; taught.teaching = (1...5).contains(base.step) && !base.ground; taught.selected = nil
            variants.append(taught)
            return variants.map { v -> (WalkState, [String]) in
                let frames = Self.controlFrames(v)
                var problems: [String] = []
                for (i, a) in frames.enumerated() {
                    for b in frames[(i + 1)...] where Invariants.overlap(a.1, b.1) { problems.append("\(a.0) meets \(b.0)") }
                    if Invariants.orbDistance(a.1) <= WalkLayout.ring { problems.append("\(a.0) \(a.1) meets the ring") }
                    if !v.showsVeil {
                        for d in drawn where Invariants.overlap(a.1, d) { problems.append("\(a.0) \(a.1) meets \(d)") }
                    }
                    if topRow.contains(a.0) {
                        if a.1.minY < 44 || a.1.maxY > 88 { problems.append("\(a.0) \(a.1) leaves the top row") }
                    } else if a.1.minY < WalkLayout.question {
                        problems.append("\(a.0) \(a.1) in the question")
                    }
                    if a.1.minX < 0 || a.1.maxX > art.stage.width { problems.append("\(a.0) leaves the stage") }
                    if a.1.maxY > insetTop + 0.01 { problems.append("\(a.0) \(a.1) in the home-indicator zone") }
                }
                let hint = WalkCopy.hint(v)
                if !hint.isEmpty, WalkLayout.hintLines(hint) != 1 { problems.append("“\(hint)” wraps") }
                if (WalkLayout.nextFrame(v) != nil) != (WalkCopy.nextLine(v, periods) != nil) {
                    problems.append("the Next line's frame and words disagree")
                }
                if v.showsPoints { problems += Self.pointWordsProblems(v, hint: WalkLayout.hintFrame(v)) }
                return (v, problems)
            }
        }
        var checked = 0
        for (v, problems) in swept.joined() {
            #expect(problems.isEmpty, "\(footing) \(Generated.describe(v)) orb \(v.orb): \(problems.prefix(3))")
            if !problems.isEmpty { return }
            checked += 1
        }
        #expect(checked >= 30_000)
    }

    /// Every compass point's words, line by line: inside the stage with the margin, below the
    /// question, above the home-indicator zone, off the ring, off every disc and every other
    /// point's words, and off the hint above the compass.
    static func pointWordsProblems(_ s: WalkState, hint: CGRect?) -> [String] {
        let insetTop = art.stage.height - WalkLayout.homeIndicator
        var problems: [String] = []
        let points = WalkCopy.points(s, WalkPeriods.pick(now: today))
        let discs = points.map { p in
            let c = WalkOrb.position(of: p.at)
            return (p.at, CGRect(x: c.x - WalkOrb.pointDisc / 2, y: c.y - WalkOrb.pointDisc / 2,
                                 width: WalkOrb.pointDisc, height: WalkOrb.pointDisc))
        }
        let words = points.flatMap { p in WalkLayout.pointWords(p, among: points.map(\.at)).map { (p.at, $0) } }
        for (at, line) in words {
            let f = line.frame
            if f.minX < WalkLayout.wordsMargin - 0.01 || f.maxX > art.stage.width - WalkLayout.wordsMargin + 0.01 {
                problems.append("\(at) “\(line.text)” \(f) is not inside the margin")
            }
            if f.maxY > insetTop + 0.01 { problems.append("\(at) “\(line.text)” in the home-indicator zone") }
            if f.minY < WalkLayout.question { problems.append("\(at) “\(line.text)” in the question") }
            if Invariants.orbDistance(f) <= WalkLayout.ring + 1 { problems.append("\(at) “\(line.text)” \(f) on the ring") }
            for (other, disc) in discs where Invariants.overlap(f, disc) { problems.append("\(at) “\(line.text)” on the \(other) disc") }
            for (other, o) in words where other != at && Invariants.overlap(f, o.frame) {
                problems.append("\(at) “\(line.text)” meets \(other) “\(o.text)”")
            }
            if let hint, Invariants.overlap(f, hint) { problems.append("\(at) “\(line.text)” meets the hint") }
        }
        return problems
    }

    /// Welcome, the ground and every step with every point offered (Undo, the calendar, examples):
    /// the words sweep on its own, at today's periods and July's.
    @Test func thePointsWordsKeepClear() {
        var states: [WalkState] = [WalkState()]
        var g = WalkState(); g.step = 1; g.ground = true; g.undo = [.plant(uid(1))]; g.orb = .open; states.append(g)
        for step in 1...5 {
            var s = WalkState(); s.step = step; s.undo = [.plant(uid(1))]; s.calendarOffer = true; s.orb = .open
            s.areas = [area("Health")]; s.kept = [area("Health").id]; s.focusArea = area("Health").id   // examples offered
            states.append(s)
            s.items = [WalkItem(id: uid(2), level: step == 5 ? .week : WalkLevel(rawValue: step)!, title: "x")]
            if step == 5 { s.firstThing = uid(2) }
            states.append(s)
        }
        for s in states {
            let problems = Self.pointWordsProblems(s, hint: WalkLayout.hintFrame(s))
            #expect(problems.isEmpty, "step \(s.step) ground \(s.ground): \(problems)")
        }
        // Welcome's choices: their words at full width, two lines of description each, off the ring.
        let welcome = WalkCopy.points(WalkState(), WalkPeriods.pick(now: today))
        let lines = Dictionary(uniqueKeysWithValues: welcome.map { p in
            (p.at, WalkLayout.pointWords(p, among: welcome.map(\.at)).filter(\.detail).map(\.text)) })
        #expect(lines[.nw] == ["Every part of life.", "About 25 minutes."])
        #expect(lines[.ne] == ["Go straight to Today."])
    }

    // MARK: The controls: the top row, the foot, above the light

    /// Every control's frame in a state, by name: what the tests below keep apart.
    static func controlFrames(_ s: WalkState, wing: CGFloat = 0) -> [(String, CGRect)] {
        [("back", WalkLayout.backFrame(s, wing: wing)), ("more", WalkLayout.moreFrame(s)),
         ("leave", WalkLayout.leaveFrame(s, wing: wing)), ("next", WalkLayout.nextFrame(s)),
         ("hint", WalkLayout.hintFrame(s)), ("undo", WalkLayout.undoFrame(s)), ("lesson", WalkLayout.teachFrame(s)),
         ("move row", WalkLayout.moveRowFrame(s))]
            .compactMap { name, f in f.map { (name, $0) } }
    }

    /// The question block stands at 96, under the top row, 334 wide on a phone (the board less 28 each
    /// side), and widens with a wider window's wing, by at most 166 ("On a wider window").
    @Test func theQuestionBlockWidensWithTheWing() {
        #expect(WalkLayout.wordsTop == 96)
        #expect(WalkLayout.wordsWidth(wing: 0) == 334)
        #expect(WalkLayout.wordsWidth(wing: 40) == 414)
        #expect(WalkLayout.wordsWidth(wing: 83) == 500)
        #expect(WalkLayout.wordsWidth(wing: 110.3) == 500)
    }

    /// Steps 2 to 5 standing in Health, the step's goal above titled `title` and another goal above
    /// beside it (so the why line also says a tap switches: its longest form). On Today, `first` makes
    /// the goal above the first thing (the question then says the day starts with it).
    private func quoting(_ title: String, step: Int, first: Bool = false) -> WalkState {
        let above = WalkLevel(rawValue: step - 1)!
        let goal = flag(above, title, in: "Health"), other = flag(above, "Feel strong again", in: "Health")
        var s = state(step, kept: ["Health", "Home"], items: [goal, other], standing: "Health", focus: goal)
        if first { s.firstThing = goal.id }
        return s
    }

    /// F30: whatever goal the question quotes (20, 44 and 56 characters, the longest it quotes whole),
    /// on every step that quotes one and at every width, the block ends by 278, above the flags.
    @Test func aLongGoalsQuestionStillEndsAboveTheFlags() throws {
        let p = WalkPeriods.pick(now: today, weekStartsOn: 0)
        let titles = ["Book the plumber now", "Lift twice a week with the trainer at my gym",
                      "Write the first chapter of the memoir I keep putting off"]
        #expect(titles.map(\.count) == [20, 44, 56])
        for title in titles {
            for step in 2...5 {
                for first in step == 5 ? [false, true] : [false] {
                    let s = quoting(title, step: step, first: first)
                    #expect(WalkCopy.question(s, p).contains(title), "step \(step): the quote is not whole")
                    for wing in [CGFloat(0), 42.3, 110.3] {
                        let words = WalkLayout.words(s, p, wing: wing)
                        #expect(words.foot <= WalkLayout.wordsFootLimit,
                                "step \(step), \(title.count) characters, wing \(wing): foot \(words.foot) (\(words))")
                        #expect([WalkLayout.questionSize, WalkLayout.questionSmallSize].contains(words.questionSize))
                    }
                }
            }
        }
    }

    /// An ordinary question stands at the normal size with its why line.
    @Test func aShortQuestionKeepsItsSizeAndItsWhy() {
        let p = WalkPeriods.pick(now: today, weekStartsOn: 0)
        for step in 2...5 {
            let words = WalkLayout.words(quoting("Pay off the car", step: step), p, wing: 0)
            #expect(words.questionSize == WalkLayout.questionSize, "step \(step)")
            #expect(words.showsWhy && words.questionLines <= WalkLayout.questionMaxLines, "step \(step): \(words)")
        }
        let year = state(1, kept: ["Health"], standing: "Health")
        let words = WalkLayout.words(year, p, wing: 0)
        #expect(words.questionSize == WalkLayout.questionSize && words.showsWhy)
    }

    /// The why line goes only when the smaller size alone would not end the block by 278: a question
    /// set smaller that still has room keeps it, and wherever it is dropped, keeping it would not fit.
    @Test func theWhyLineGivesWayOnlyWhenItMust() {
        // More than three lines at 32 on the phone; at 28 there is room for a one-line why.
        let kept = WalkLayout.words(question: "What part of “Lift twice a week with the trainer at my gym” belongs to December?",
                                    why: "Small enough to finish by the 31st.", wing: 0)
        #expect(kept.questionSize == WalkLayout.questionSmallSize && kept.showsWhy, "\(kept)")
        let p = WalkPeriods.pick(now: today, weekStartsOn: 0)
        for title in ["Book the plumber now", "Lift twice a week with the trainer at my gym",
                      "Write the first chapter of the memoir I keep putting off"] {
            for step in 2...5 {
                let s = quoting(title, step: step)
                for wing in [CGFloat(0), 42.3, 110.3] {
                    let words = WalkLayout.words(s, p, wing: wing)
                    guard !words.showsWhy else { continue }
                    let withWhy = WalkLayout.wordsFoot(questionSize: words.questionSize, questionLines: words.questionLines,
                                                       whyLines: WalkLayout.whyLines(WalkCopy.why(s, p), wing: wing))
                    #expect(withWhy > WalkLayout.wordsFootLimit, "step \(step), wing \(wing): the why line went with room for it")
                }
            }
        }
    }

    /// Back, More and Leave for now on every step after Welcome (the ground too), each a full touch,
    /// apart, inside the row; none on Welcome or Look back up. Back and Leave for now go out to a wider
    /// window's corners; More stays in the middle.
    @Test func theTopRowIsThereOnEveryStepAfterWelcome() {
        var ground = state(1); ground.ground = true
        for s in [ground] + (1...5).map({ state($0) }) {
            #expect(s.showsTopRow && s.showsMore, "step \(s.step)")
            let row = [WalkLayout.backFrame(s), WalkLayout.moreFrame(s), WalkLayout.leaveFrame(s)]
            #expect(row.allSatisfy { $0 != nil }, "step \(s.step) ground \(s.ground)")
            let frames = row.compactMap { $0 }
            for (i, a) in frames.enumerated() {
                #expect(a.width >= 44 && a.height >= 44, "\(a)")
                #expect(a.minY >= 44 && a.maxY <= 88, "\(a)")
                for b in frames[(i + 1)...] { #expect(!Invariants.overlap(a, b), "\(a) meets \(b)") }
            }
        }
        for step in [0, 6] {
            let s = state(step)
            #expect(!s.showsTopRow)
            #expect(WalkLayout.backFrame(s) == nil && WalkLayout.moreFrame(s) == nil && WalkLayout.leaveFrame(s) == nil)
        }
        let s = state(3)
        #expect(WalkLayout.backFrame(s) == CGRect(x: 8, y: 44, width: 76, height: 44))
        #expect(WalkLayout.leaveFrame(s)?.maxX == 382)
        let narrow = WalkLayout.make(s, today: today, footing: .level, wing: 0)
        let wide = WalkLayout.make(s, today: today, footing: .level, wing: 110.3)
        #expect(narrow.back == CGRect(x: 8, y: 44, width: 76, height: 44) && near(narrow.leave?.maxX ?? 0, 382, 0.001))
        #expect(near(wide.back?.minX ?? 0, -102.3, 0.001) && near(wide.leave?.maxX ?? 0, 492.3, 0.001))
        #expect(narrow.more != nil && narrow.more == wide.more)
    }

    /// F10: while the keyboard is up there is no top row (no Back with unsent words).
    @Test func noTopRowWhileTyping() {
        var s = state(2); s.typing = "half"
        #expect(!s.showsTopRow && !s.showsMore)
        #expect(WalkLayout.backFrame(s) == nil && WalkLayout.moreFrame(s) == nil && WalkLayout.leaveFrame(s) == nil)
    }

    /// Next stands alone at the foot: one gold button, under the ring, above the home-indicator zone,
    /// meeting no other control, in every generated state where it shows.
    @Test func nextStandsAloneAtTheFoot() {
        #expect(WalkLayout.nextFrame(state(3)) == CGRect(x: 55, y: 750, width: 280, height: 50))
        var checked = 0
        for s in Generated.all where (1...5).contains(s.step) {
            guard let next = WalkLayout.nextFrame(s) else { continue }
            #expect(next.maxY <= 844 - 34 && next.minY >= 678 + 66, "\(Generated.describe(s)): \(next)")
            for (name, f) in Self.controlFrames(s) where name != "next" && Invariants.overlap(f, next) {
                Issue.record("\(Generated.describe(s)): Next meets \(name) \(f)")
            }
            checked += 1
        }
        #expect(checked > 1000)
    }

    /// At rest the hint is one line above the light (top 572), clear of the question's ceiling (282);
    /// Welcome's stays where it was, under its line.
    @Test func theHintStandsAboveTheLightAtRest() {
        #expect(WalkLayout.question == 282)
        var g = state(1); g.ground = true
        for s in [g, state(1), state(2), state(4)] {
            #expect(WalkLayout.hintFrame(s) == CGRect(x: 10, y: 572, width: 370, height: 19.5), "step \(s.step)")
            #expect(WalkLayout.nextFrame(s).map { !Invariants.overlap($0, WalkLayout.hintFrame(s)!) } == true)
        }
        #expect(WalkLayout.hintFrame(WalkState()) == CGRect(x: 10, y: 790.5, width: 370, height: 19.5))
    }

    /// While the light is open or speaking Next is not drawn and the hint stands at the foot (top 766);
    /// held or finishing, the hint is blank, or at the foot if it says anything.
    @Test func theHintGoesToTheFootWhileTheLightIsBusy() {
        for orb: WalkState.Orb in [.open, .speaking(live: "x")] {
            var s = state(2); s.orb = orb
            #expect(WalkLayout.nextFrame(s) == nil)
            #expect(WalkLayout.hintFrame(s) == CGRect(x: 10, y: 766, width: 370, height: 19.5), "\(orb)")
        }
        for orb: WalkState.Orb in [.holding(hover: nil), .finishing(live: "x")] {
            var s = state(2); s.orb = orb; s.note = WalkCopy.nothingToPlant
            #expect(WalkLayout.nextFrame(s) == nil)
            #expect(WalkLayout.hintFrame(s).map { $0.minY == 766 } ?? true, "\(orb)")
        }
    }

    /// After planting the Undo pill stands above the light where the hint was (the hint is not drawn
    /// then); a note is drawn instead of the pill.
    @Test func undoShowsAboveTheLight() {
        var s = state(1, kept: ["Health"], standing: "Health")
        _ = s.plant("run a 5K", WalkEnv(periods: WalkPeriods.pick(now: today), now: today))
        #expect(s.undoShowing)
        #expect(WalkLayout.undoFrame(s) == CGRect(x: 152, y: 564, width: 86, height: 36))
        #expect(WalkLayout.hintFrame(s) == nil)
        #expect(WalkLayout.make(s, today: today, footing: .level).undoPill == WalkLayout.undoFrame(s))
        s.note = WalkCopy.nothingToPlant
        #expect(WalkLayout.undoFrame(s) == nil)
        #expect(WalkCopy.hint(s) == WalkCopy.nothingToPlant && WalkLayout.hintFrame(s)?.minY == 572)
    }

    /// The Undo pill is not drawn under the keyboard: typing hides it (Undo itself stays; the pill may
    /// show again when the field closes).
    @Test func theUndoPillHidesWhileTyping() {
        var s = state(1, kept: ["Health"], standing: "Health")
        _ = s.plant("run a 5K", WalkEnv(periods: WalkPeriods.pick(now: today), now: today))
        _ = s.act(.type, WalkEnv(periods: WalkPeriods.pick(now: today), now: today))
        #expect(s.typing == "" && s.undoShowing && !s.undo.isEmpty)
        #expect(WalkLayout.undoFrame(s) == nil)
        s.typing = nil
        #expect(WalkLayout.undoFrame(s) == CGRect(x: 152, y: 564, width: 86, height: 36))
    }

    /// F11: while a flag is chosen its Move to / Remove row stands above the light where the hint was,
    /// clear of the ring; neither hint nor pill then.
    @Test func theMoveRowStandsAboveTheLight() {
        let goal = flag(.year, "Run a 5K", in: "Health")
        var s = state(1, kept: ["Health", "Home"], items: [goal], standing: "Health")
        s.undoShowing = true
        _ = s.select(goal.id)
        s.undoShowing = true
        let row = WalkLayout.moveRowFrame(s)
        #expect(row == CGRect(x: 10, y: 558, width: 370, height: 38))
        #expect((row?.maxY ?? .infinity) <= 678 - 66 - 8)
        #expect(WalkLayout.hintFrame(s) == nil && WalkLayout.undoFrame(s) == nil)
        #expect(WalkLayout.make(s, today: today, footing: .level).moveRow == row)
        // The chosen flag glows on its post, clear above its row.
        let chosen = WalkLayout.make(s, today: today).banner(for: goal)
        #expect(chosen?.glows == true && (chosen?.drawn.maxY ?? .infinity) <= 558)
        s.selected = nil
        #expect(WalkLayout.moveRowFrame(s) == nil)
    }

    /// F24: with every area kept and a flag chosen, Remove stands alone at the Move row's right, never
    /// scrolled, meeting no other control; the chips take the rest of the row. On Today there is
    /// nowhere to move: Remove stands alone in the middle.
    @Test func removeIsAlwaysInSight() throws {
        var s = WalkState()
        s.areas = ridge; s.kept = ridge.map(\.id); s.step = 1
        let goal = WalkItem(id: uid(1), level: .year, title: "Run a 5K", areaId: ridge[0].id)
        s.items = [goal]; s.focusArea = ridge[0].id
        _ = s.select(goal.id)
        let row = try #require(WalkLayout.moveRowFrame(s))
        #expect(WalkLayout.removeFrame(s) == CGRect(x: 290, y: 558, width: 90, height: 38))
        #expect(WalkLayout.moveChipsFrame(s) == CGRect(x: 10, y: 558, width: 272, height: 38))
        let remove = try #require(WalkLayout.removeFrame(s)), chips = try #require(WalkLayout.moveChipsFrame(s))
        #expect(row.contains(remove) && row.contains(chips))
        #expect(!Invariants.overlap(remove, chips))
        for (name, f) in Self.controlFrames(s) where name != "move row" {
            #expect(!Invariants.overlap(f, remove), "Remove meets \(name)")
        }
        s.selected = nil
        #expect(WalkLayout.removeFrame(s) == nil && WalkLayout.moveChipsFrame(s) == nil)

        var onToday = state(5)
        let first = WalkItem(id: uid(2), level: .week, title: "Call the plumber", day: today)
        onToday.items = [first]; onToday.firstThing = first.id; onToday.selected = first.id
        #expect(WalkLayout.moveRowFrame(onToday) != nil)
        #expect(WalkLayout.removeFrame(onToday) == CGRect(x: 150, y: 558, width: 90, height: 38))
        #expect(WalkLayout.moveChipsFrame(onToday) == nil)
    }

    /// F22: while typing, the field at the foot holds the X, the words and Add; each is a full touch and
    /// meets nothing else; a note stands just above the field; no top row, no Next.
    @Test func theFieldsControlsKeepClear() {
        var s = state(2); s.typing = "run a"; s.note = WalkCopy.nothingHeard
        #expect(WalkLayout.typeFieldFrame(s) == CGRect(x: 10, y: 750, width: 370, height: 44))
        #expect(WalkLayout.typeCloseFrame(s) == CGRect(x: 10, y: 750, width: 44, height: 44))
        #expect(WalkLayout.typeAddFrame(s) == CGRect(x: 316, y: 750, width: 64, height: 44))
        #expect(WalkLayout.hintFrame(s) == CGRect(x: 10, y: 724, width: 370, height: 19.5))
        let parts = [("close", WalkLayout.typeCloseFrame(s)), ("words", WalkLayout.typeWordsFrame(s)),
                     ("add", WalkLayout.typeAddFrame(s))].compactMap { n, f in f.map { (n, $0) } }
        #expect(parts.count == 3)
        let field = WalkLayout.typeFieldFrame(s) ?? .null
        for (i, a) in parts.enumerated() {
            #expect(a.1.width >= 44 && a.1.height >= 44, "\(a.0)")
            #expect(field.contains(a.1), "\(a.0)")
            for b in parts[(i + 1)...] { #expect(!Invariants.overlap(a.1, b.1), "\(a.0) meets \(b.0)") }
            for (name, f) in Self.controlFrames(s) { #expect(!Invariants.overlap(a.1, f), "\(a.0) meets \(name)") }
        }
        #expect(WalkLayout.nextFrame(s) == nil && WalkLayout.backFrame(s) == nil)
        s.typing = nil
        #expect(WalkLayout.typeFieldFrame(s) == nil && WalkLayout.typeAddFrame(s) == nil)
    }
}

// MARK: - The generator

/// Standing states, each settled as the reducer settles it (so `standing` is what the walk would
/// have): steps 1 to 6; 0 to 8 kept areas; with and without flags of no area; 0, 1, 3, 4, 5 or 7
/// flags on the standing post (other posts between 0 and 7); titles of 8, 22, 44, 60 and 200
/// characters and one 60-letter word; plain, with a flag chosen, with examples on, with both; standing
/// in each kept area in turn; on Today a first thing in the standing area, in another, or on the
/// nameless post. Then the ground and Welcome, whole-year walks part-way round (`tours`) and walks
/// down one goal (`walkDowns`). Ids, titles and counts are fixed.
enum Generated {
    static let titles = [
        "Call Mum",
        "Tile the bathroom wall",
        "Lift twice a week with the trainer at my gym",
        "Write the first chapter of the memoir I keep putting off now",
        String(String(repeating: "Walk more every day. ", count: 10).prefix(200)),
        String(repeating: "x", count: 60),
    ]
    static let counts = [0, 1, 2, 3, 4, 5, 6, 7]

    static func states() -> [WalkState] {
        var out: [WalkState] = []
        out += ground()
        out += tours()
        out += walkDowns()
        for step in 1...6 {
            for keptCount in 0...WalkLoad.maxAreas {
                for loose in [false, true] {
                    for perPost in counts {
                        // A flag chosen while examples are on (3): where examples are, and on every other count.
                        for variant in 0..<((1...4).contains(step) && perPost % 2 == 1 ? 4 : 3) {
                            for standing in 0..<max(1, keptCount) {
                                out.append(make(step: step, keptCount: keptCount, loose: loose, perPost: perPost,
                                                variant: variant, standing: standing))
                            }
                        }
                    }
                }
            }
        }
        return out
    }

    /// The generated states, built once: `states()` is a fixed list, so every sweep reads the same one.
    static let all: [WalkState] = states()

    /// Each generated state's layout on a phone on each footing, at the state's index in `all`: built
    /// once, on every core, and shared by every sweep that reads it (a layout is a pure function of its state).
    static let naturalLayouts: [WalkLayout] = build(.natural)
    static let levelLayouts: [WalkLayout] = build(.level)

    static func layouts(_ footing: WalkFooting) -> [WalkLayout] { footing == .natural ? naturalLayouts : levelLayouts }

    /// The ruled layouts on each of the wings the layout is measured on, built once.
    static let levelByWing: [CGFloat: [WalkLayout]] = Dictionary(uniqueKeysWithValues: wings.map { wing in
        let states = all
        return (wing, wing == 0 ? levelLayouts : parallel(states.count) { WalkLayout.make(states[$0], today: today, footing: .level, wing: wing) })
    })
    static func level(wing: CGFloat) -> [WalkLayout] { levelByWing[wing] ?? [] }

    private static func build(_ footing: WalkFooting) -> [WalkLayout] {
        let states = all
        return parallel(states.count) { WalkLayout.make(states[$0], today: today, footing: footing) }
    }

    /// `body(i)` for every `i` in `0..<count`, worked out on every core, returned in index order.
    /// Only pure work runs here: the sweeps assert on the results afterwards, on the test's own
    /// thread, in the order they always did.
    static func parallel<T>(_ count: Int, _ body: (Int) -> T) -> [T] {
        guard count > 0 else { return [] }
        return withoutActuallyEscaping(body) { body in
            let work = Unshared(body)
            return [T](unsafeUninitializedCapacity: count) { buffer, initialized in
                let out = Unshared(buffer.baseAddress!)
                DispatchQueue.concurrentPerform(iterations: count) { (out.value + $0).initialize(to: work.value($0)) }
                initialized = count
            }
        }
    }

    /// What `parallel` hands its workers: each writes only its own slot, and the work is pure.
    private struct Unshared<V>: @unchecked Sendable {
        let value: V
        init(_ value: V) { self.value = value }
    }

    /// The ground and Welcome: every count of areas on the ridge and of kept ones, with old Year flags on some.
    static func ground() -> [WalkState] {
        var out: [WalkState] = []
        for areaCount in [1, 2, 3, 4, 6, 8] {
            for keptCount in Set([0, areaCount / 2, areaCount]).sorted() {
                for perPost in [0, 2, 6] {
                    var s = WalkState()
                    s.areas = Array(ridge.prefix(areaCount))
                    s.kept = s.areas.prefix(keptCount).map(\.id)
                    s.step = 1
                    s.ground = true
                    var n = 0
                    for a in s.areas { for i in 0..<perPost {
                        n += 1
                        s.items.append(WalkItem(id: uid(n), level: .year, title: titles[(n + i) % titles.count], areaId: a.id))
                    } }
                    out.append(s)
                    var welcome = s
                    welcome.ground = false
                    welcome.step = 0
                    out.append(welcome)
                }
            }
        }
        return out
    }

    /// A whole-year walk part-way round: on Year standing in each kept area with the areas after it
    /// still ahead (`tour`), on Season on each year goal with the goals after it still ahead.
    static func tours() -> [WalkState] {
        var out: [WalkState] = []
        for step in 1...2 {
            for keptCount in 2...4 {
                for perPost in [1, 3] {
                    for standing in 0..<keptCount {
                        var s = make(step: step, keptCount: keptCount, loose: false, perPost: perPost, variant: 0, standing: standing)
                        s.depth = .full
                        if step == 1 {
                            s.tour = Array(s.kept.drop { $0 != s.standing }.dropFirst())
                        } else {
                            let stops = s.keptAreas.flatMap { a in s.items(on: .year).filter { $0.areaId == a.id } }.map(\.id)
                            if let at = stops.firstIndex(where: { $0 == s.focus[.season] }) { s.tour = Array(stops[(at + 1)...]) }
                        }
                        out.append(s.settled)
                    }
                }
            }
        }
        return out
    }

    /// Walks down one year goal ("Walk another one down"), on Season to Today, with one to three
    /// areas kept: the walked goal's line in its own area, or reaching a second area too; a skipped
    /// step (no month goal: the week task was said with no goal above, so it starts a line of the
    /// walk down's own); other areas holding another goal's whole chain, off the line; on Today a
    /// first thing on the line, and one off it.
    static func walkDowns() -> [WalkState] {
        var out: [WalkState] = []
        var n = 90_000
        func item(_ level: WalkLevel, _ title: Int, _ area: UUID?, _ parent: UUID? = nil, dated: Bool = false) -> WalkItem {
            n += 1
            return WalkItem(id: uid(n), level: level, title: titles[title % titles.count], areaId: area, parentId: parent,
                            day: dated ? today : nil)
        }
        for step in 2...5 {
            for keptCount in 1...3 {
                for twoAreas in keptCount > 1 ? [false, true] : [false] {
                    for skipped in [false, true] {
                        for firstOff in step == 5 && keptCount > 1 ? [false, true] : [false] {
                            var s = WalkState()
                            s.areas = ridge
                            s.kept = ridge.prefix(keptCount).map(\.id)
                            s.step = step
                            let home = s.kept[0]
                            let walked = item(.year, 1, home)
                            let season = item(.season, 2, home, walked.id)
                            var items = [walked, season]
                            var line = [walked.id]
                            if twoAreas { items.append(item(.season, 0, s.kept[1], walked.id)) }
                            var above: UUID? = season.id
                            if skipped { above = nil } else { let month = item(.month, 3, home, season.id); items.append(month); above = month.id }
                            let week = item(.week, skipped ? 1 : 0, home, above, dated: true)
                            items.append(week)
                            if skipped { line.append(week.id) }
                            var offLine: WalkItem?
                            for other in s.kept.dropFirst() {
                                let year = item(.year, 0, other), lower = item(.season, 1, other, year.id)
                                let month = item(.month, 2, other, lower.id), task = item(.week, 0, other, month.id, dated: true)
                                items += [year, lower, month, task]
                                offLine = offLine ?? task
                            }
                            s.items = items.filter { $0.level.rawValue <= min(step, 4) }
                            s.walkingDown = line.filter { id in s.items.contains { $0.id == id } }
                            s.focusArea = home
                            if step == 5 { s.firstThing = firstOff ? offLine?.id : week.id }
                            out.append(s.settled)
                        }
                    }
                }
            }
        }
        return out
    }

    /// `standing`: the index of the kept area the walk is asked to stand in (it settles where it can).
    /// `variant`: 0 plain; 1 a flag chosen (the oldest of the walk's own on the standing post); 2 examples
    /// on; 3 both.
    static func make(step: Int, keptCount: Int, loose: Bool, perPost: Int, variant: Int, standing: Int) -> WalkState {
        var s = WalkState()
        s.areas = ridge
        s.kept = ridge.prefix(keptCount).map(\.id)
        s.step = step
        s.depth = .quick
        let columns: [UUID?] = s.kept.map { Optional($0) } + (loose ? [nil] : [])
        let stood: UUID? = keptCount > 0 ? s.kept[min(standing, keptCount - 1)] : nil
        var n = 0
        var above: [UUID?: WalkItem] = [:]
        for raw in 1...min(step, 4) {
            let level = WalkLevel(rawValue: raw)!
            var planted: [UUID?: WalkItem] = [:]
            for (c, column) in columns.enumerated() {
                let count = column == stood ? perPost : (perPost + 3 * c + raw) % 8
                for i in 0..<count {
                    n += 1
                    let item = WalkItem(id: uid(n), level: level, title: titles[(n + c + i) % titles.count],
                                        areaId: column, parentId: above[column]?.id,
                                        day: level == .week && i % 2 == 0 ? day(2026, 11, 13 + i % 5) : nil, mine: i % 3 != 2)
                    s.items.append(item)
                    planted[column] = planted[column] ?? item
                }
            }
            above = planted
        }
        // Flags below the step (a walk backed up): never drawn before Look back up.
        if variant == 1 || variant == 3, step < 4 {
            n += 1
            s.items.append(WalkItem(id: uid(n), level: WalkLevel(rawValue: step + 1)!, title: "Below", areaId: columns.first ?? nil))
        }
        s.focusArea = stood
        // Today: a first thing in the standing area, in another area, or on the nameless post.
        if step >= 5 {
            let weeks = s.items(on: .week)
            let here = weeks.filter { $0.areaId == stood }, elsewhere = weeks.filter { $0.areaId != stood }
            switch (perPost + keptCount + standing) % 3 {
            case 0: s.firstThing = (here.last ?? weeks.last)?.id
            case 1: s.firstThing = (elsewhere.first ?? weeks.first)?.id
            default: s.firstThing = (weeks.first { $0.areaId == nil } ?? here.first)?.id
            }
        }
        s = s.settled
        if variant == 1 || variant == 3, let level = s.level {
            if level == .today {
                if let first = s.item(s.firstThing), first.mine, s.column(of: first) == s.standing { s.selected = first.id }
            } else {
                s.selected = s.items(on: level).first { $0.mine && s.column(of: $0) == s.standing }?.id
            }
        }
        if variant >= 2, (1...4).contains(step) { s.examplesOn = [step] }
        return s.settled
    }

    static func describe(_ s: WalkState) -> String {
        let counts = WalkLevel.allCases.map { "\(s.items(on: $0).count)" }.joined(separator: "/")
        let here = s.area(s.standing)?.name ?? "nameless"
        return "step \(s.step) ground \(s.ground) kept \(s.kept.count) items \(counts) standing \(here) "
            + "focus \(s.focus.count) examples \(s.examplesOn) selected \(s.selected != nil) first \(s.firstThing != nil)"
            + (s.walkingDown.isEmpty ? "" : " walking down") + (s.tour.isEmpty ? "" : " tour \(s.tour.count)")
    }
}

// MARK: - The invariants

/// The layout's guarantees, measured on what is drawn: a cloth by its turned outline's bounding
/// box (`drawn`), a side post by its pill, its leaning pole and its pennants, a label by its frame.
enum Invariants {
    static func overlap(_ a: CGRect, _ b: CGRect) -> Bool {
        let e: CGFloat = 0.01
        return a.minX < b.maxX - e && b.minX < a.maxX - e && a.minY < b.maxY - e && b.minY < a.maxY - e
    }

    static func orbDistance(_ r: CGRect) -> CGFloat {
        let c = WalkOrb.centre
        let x = min(max(c.x, r.minX), r.maxX), y = min(max(c.y, r.minY), r.maxY)
        return hypot(c.x - x, c.y - y)
    }

    /// A frame grown about its middle to at least a touch across and down.
    static func grown(_ r: CGRect, to touch: CGFloat) -> CGRect {
        r.insetBy(dx: min(0, (r.width - touch) / 2), dy: min(0, (r.height - touch) / 2))
    }

    static func union(_ boxes: [CGRect]) -> CGRect { boxes.reduce(CGRect.null) { $0.union($1) } }

    /// The standing post's pole, as a box: from its top to its foot, leaning.
    static func pole(_ post: WalkLayout.Post) -> CGRect {
        let reach = (post.base.y - post.top) * CGFloat(sin(post.lean * .pi / 180))
        return CGRect(x: post.base.x - 1.5 + min(0, reach), y: post.top, width: 3 + abs(reach), height: post.base.y - post.top)
    }

    /// Every frame the layout makes, by name: cloths, labels, the standing pill's caret, the standing
    /// pole, and every side post's pill, pole, pennants and "+n".
    static func everything(_ layout: WalkLayout) -> [(String, CGRect)] {
        layout.posts.flatMap { post in post.banners.map { ("cloth \($0.id)", $0.drawn) } + [("pole", pole(post))] }
            + layout.labels.map { ("label \($0.name)", $0.frame) }
            + layout.labels.compactMap { label in label.caret.map { ("caret \(label.name)", $0) } }
            + layout.sides.flatMap { side in side.boxes.map { ("side \(side.name.isEmpty ? "nameless" : side.name)", $0) } }
    }

    /// (h): the spoken flag meets no side post, no label and no cloth (nor the standing pole).
    static func spoken(_ flag: CGRect, _ layout: WalkLayout) -> [String] {
        everything(layout).filter { overlap(flag, $0.1) }.map { "the spoken flag meets \($0.0) \($0.1)" }
    }

    /// The guarantees, for a settled state `s` laid out on a stage with `wing`, where a touch is `touch` across:
    /// (a) no two cloths' drawn boxes meet, nor the caret one;
    /// (b) no side post's pill, pole or pennants meet another side post's, the standing post's cloths or its label;
    /// (c) nothing (the caret included) above the question (282) on steps 1 to 5, or above the header (92) looking back up;
    /// (d) off the ground, no cloth below the lowest cloth's place (532, and half a point), no pill or
    ///     side post below the standing foot (556); on the ground no chip below it; nothing below 700 looking back up;
    /// (e) everything inside the edges;
    /// (f) nothing within 86 of the light's centre on steps 1 to 5;
    /// (g) every tappable thing is a touch apart, centre to centre, from every other, or neither's touch
    ///     shape (its frame grown to a touch) meets the other's frame; cloths on one post are their own
    ///     touch shapes (F19);
    /// (h) the spoken flag, where there is one, meets none of it.
    /// And the shape of what is drawn: one standing post off the ground and none on it, each cloth as
    /// tall as its lines, at most four flags in full, an example showing while examples are on and
    /// never at the cost of the person's last flag, the caret over its pill, "+n" in its place.
    static func check(_ layout: WalkLayout, _ s: WalkState, wing: CGFloat = 0, touch: CGFloat = 44) -> [String] {
        var problems: [String] = []
        let banners = layout.posts.flatMap(\.banners)
        let cloths = banners.map { (id: $0.id, box: $0.drawn) }
        let all = everything(layout)
        let steps = (1...5).contains(s.step)

        // The shape of it.
        if s.step == 0 || s.ground || s.step == 6 {
            if !layout.posts.isEmpty { problems.append("a post on step \(s.step) ground \(s.ground)") }
        } else if layout.posts.count != 1 {
            problems.append("\(layout.posts.count) standing posts")
        }
        if s.step == 0 || s.ground, !layout.sides.isEmpty { problems.append("side posts on step \(s.step) ground \(s.ground)") }
        if s.step == 0, !layout.labels.isEmpty { problems.append("labels on Welcome") }
        if !s.ground, layout.labels.count > 1 || layout.labels.contains(where: { !$0.standing || $0.tappable }) {
            problems.append("off the ground the one label is the standing area's, and takes no tap")
        }
        let width = WalkLayout.standingWidth(wing: wing)
        for b in banners {
            let size: CGSize
            switch b.kind {
            case .full, .ghost: size = CGSize(width: width, height: 18 + 17 * CGFloat(b.lines) + (b.tag == nil ? 0 : 14))
            case .parent: size = CGSize(width: width - 24, height: 12 + 14 * CGFloat(b.lines))
            case .more: size = CGSize(width: 78, height: 22)
            case .compact: size = b.frame.size
            }
            if !(1...3).contains(b.lines) || abs(b.frame.width - size.width) > 0.01 || abs(b.frame.height - size.height) > 0.01 {
                problems.append("\(b.id) holds \(b.lines) lines in \(b.frame)")
            }
            if b.kind == .ghost, b.tag == nil { problems.append("an example without its tag") }
        }
        let full = banners.filter { $0.kind == .full }.count, above = banners.filter { $0.kind == .parent }.count
        let more = banners.filter { if case .more = $0.kind { return true }; return false }.count
        if full > 4 || above > 1 || more > 1 { problems.append("\(full) in full, \(above) above, \(more) more") }
        if full + banners.filter({ $0.kind == .ghost }).count > 4 { problems.append("more than four flags and examples") }
        if (1...4).contains(s.step), !s.ground, s.examplesOn.contains(s.step), !s.examplesLeft(today: today).isEmpty {
            // F36: an example always shows, and never at the cost of the person's last flag.
            if !banners.contains(where: { $0.kind == .ghost }) { problems.append("examples on, none shows") }
            if full == 0, let level = s.level, s.items(on: level).contains(where: { s.column(of: $0) == s.standing }) {
                problems.append("examples took the person's last flag")
            }
        }
        for side in layout.sides {
            if side.pennants.count > 4 || side.pennants.count + side.extra != side.count || (side.extra > 0 && side.pennants.count != 3) {
                problems.append("\(side.id): \(side.pennants.count) pennants and +\(side.extra) for \(side.count)")
            }
            if (side.area == nil) != (side.pill == nil) { problems.append("\(side.id): only the nameless post has no pill") }
            if (side.extra > 0) != (side.extraFrame != nil) { problems.append("\(side.id): +\(side.extra) with \(String(describing: side.extraFrame))") }
        }

        // The caret: 10 × 7, 2 above its pill, on the pill's middle; only the standing pill has one.
        for label in layout.labels {
            guard let caret = label.caret else { continue }
            let place = CGRect(x: label.frame.midX - 5, y: label.frame.minY - 9, width: 10, height: 7)
            if !label.standing || abs(caret.minX - place.minX) > 0.01 || abs(caret.minY - place.minY) > 0.01 || caret.size != place.size {
                problems.append("the caret \(caret) is not over its pill \(label.frame)")
            }
        }
        // (a): the cloths, and the caret with them.
        let hung = cloths + layout.labels.compactMap { label in label.caret.map { (id: "caret", box: $0) } }
        for i in hung.indices { for j in hung.indices where j > i && overlap(hung[i].box, hung[j].box) {
            problems.append("(a) \(hung[i].id) \(hung[i].box) meets \(hung[j].id) \(hung[j].box)")
        } }
        // (b)
        let standing = cloths.map(\.box) + layout.labels.filter(\.standing).map(\.frame)
        for (i, side) in layout.sides.enumerated() {
            for box in side.boxes {
                for other in layout.sides[(i + 1)...] { for o in other.boxes where overlap(box, o) {
                    problems.append("(b) side \(side.name) \(box) meets side \(other.name) \(o)")
                } }
                for o in standing where overlap(box, o) { problems.append("(b) side \(side.name) \(box) meets the standing post's \(o)") }
            }
        }
        // (c), (d)
        let ceiling: CGFloat = s.step >= 6 ? WalkLayout.lookBackHeader : WalkLayout.question
        for (what, f) in all where s.step >= 1 && f.minY < ceiling - 0.01 { problems.append("(c) \(what) at \(f.minY), above \(ceiling)") }
        if steps {
            for c in cloths where c.box.maxY > WalkLayout.lowestCloth + 0.5 { problems.append("(d) \(c.id) ends at \(c.box.maxY)") }
            for (what, f) in all where f.maxY > WalkLayout.standingFoot + 0.01 { problems.append("(d) \(what) ends at \(f.maxY)") }
        } else if s.step >= 6 {
            for (what, f) in all where f.maxY > WalkLayout.lookBackFoot { problems.append("(d) \(what) ends at \(f.maxY)") }
        }
        // (e)
        let edges = WalkLayout.edges(wing: wing)
        for (what, f) in all where f.minX < edges.lowerBound - 0.01 || f.maxX > edges.upperBound + 0.01 {
            problems.append("(e) \(what) \(f) leaves the edges \(edges)")
        }
        // (f)
        if steps { for (what, f) in all where orbDistance(f) < 86 { problems.append("(f) \(what) \(f) is \(orbDistance(f)) from the light") } }
        // (g)
        var taps: [(name: String, frame: CGRect, post: Bool)] = banners.filter(\.taps).map { ($0.id, $0.drawn, true) }
        taps += layout.labels.filter(\.tappable).map { ("label \($0.name)", $0.frame, false) }
        taps += layout.sides.filter { $0.area != nil }.map { ("side \($0.name)", union($0.boxes), false) }
        for i in taps.indices { for j in taps.indices where j > i && !(taps[i].post && taps[j].post) {
            let a = taps[i].frame, b = taps[j].frame
            let apart = hypot(a.midX - b.midX, a.midY - b.midY)
            if apart < touch - 0.01, overlap(grown(a, to: touch), b) || overlap(grown(b, to: touch), a) {
                problems.append("(g) \(taps[i].name) \(a) and \(taps[j].name) \(b) are \(apart) apart")
            }
        } }
        // (h)
        if let flag = layout.spokenFlag { problems += spoken(flag, layout).map { "(h) \($0)" } }
        return problems
    }
}
