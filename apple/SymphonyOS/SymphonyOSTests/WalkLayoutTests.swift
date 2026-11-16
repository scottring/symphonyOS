import Testing
import Foundation
import CoreGraphics
#if canImport(UIKit)
import UIKit
import CoreText
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

/// A stress plan (`DemoStress.full`, `.long`) as the walk's preview plants it, on `step`, standing in an area,
/// on the goal above of the area's newest flag on the step's level (F40: the post shows only that goal's
/// flags; this plan hangs each flag under its area's first goal above, so they are all drawn there).
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
    if let level = s.level, s.hangsByGoalAbove,
       let parent = s.items(on: level).last(where: { $0.areaId == id(standing) && $0.parentId != nil })?.parentId {
        s.focus[level] = parent
    }
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
                // F40: the flags of the stop shown (on Today the first thing).
                let here = s.standingFlags()
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
        #expect(bare.standingLabel?.frame == CGRect(x: 195 - 36.5, y: 497, width: 73, height: 23))   // HEALTH by the face's capitals (Task 10)
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
        // On 13 November the walk plans December (task 9, item d: a month ahead is named, not "this month").
        #expect(layout.sides.map(\.label) == ["Home, 3 goals in December", "Health, 4 goals in December",
                                              "Work, 4 goals in December", "Money, 3 goals in December"])
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
        // On 13 November the walk plans 2027, "the year ahead": its posts count the goals "in 2027".
        #expect(home[0].label == "Home, 6 goals in 2027")
        #expect(WalkCopy.sideLabel(name: "Work", count: 1, level: .year, periods: WalkPeriods.pick(now: today)) == "Work, 1 goal in 2027")
        // In March the walk plans the year in force: "this year".
        #expect(WalkCopy.sideLabel(name: "Work", count: 1, level: .year, periods: WalkPeriods.pick(now: day(2026, 3, 10)))
                == "Work, 1 goal this year")
        #expect(WalkCopy.sideLabel(name: "Home", count: 3, level: .week, periods: WalkPeriods.pick(now: today)) == "Home, 3 tasks this week")
        #expect(WalkCopy.sideLabel(name: WalkCopy.noArea, count: 2, level: .month, periods: WalkPeriods.pick(now: today)) == "No area, 2 goals in December")
        #expect(WalkCopy.sideLabel(name: "Fun", count: 0, level: .season, periods: WalkPeriods.pick(now: today)) == "Fun, no goals in winter")
        // The month and season in force today are "this".
        let tenth = WalkPeriods.pick(now: day(2026, 11, 10))
        #expect(WalkCopy.sideLabel(name: WalkCopy.noArea, count: 2, level: .month, periods: tenth) == "No area, 2 goals this month")
        #expect(WalkCopy.sideLabel(name: "Fun", count: 0, level: .season, periods: tenth) == "Fun, no goals this fall")
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
        #expect(onYear.first?.label == "Home, no goals in 2027")
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
                        #expect(nameless.pill == nil && nameless.count == 2 && nameless.pennants.count == 2 && WalkLayout.tapEvent(nameless) == .paperOpened)
                        #expect(nameless.label.hasPrefix(step == 4 ? "No area, 2 tasks this week" : "No area, 2 goals "))
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
    /// A side post's touch frame (`Side.touchFrame(touch:)`), over every generated state on each wing the
    /// layout is measured on, at that window's own touch (`WalkStage.touch`: 44 on the phone, 55.7 on the
    /// narrow phone's 42.3, 55.5 on the half window's 110.3 and the flat window's 404.9, all 44 real
    /// points): it is at least that square; it
    /// covers no standing cloth's centre and not the standing pill's; and where two side posts' frames
    /// overlap, the later one in `sides` (drawn later, so it takes the tap there) covers none of the
    /// earlier one's own pill or pole, so a tap on a post's name or pole always reaches that post.
    @Test func aSidePostsTouchFrameIsItsOwn() {
        var frames = 0, overlaps = 0
        let windows: [(wing: CGFloat, stage: WalkStage)] = [(0, WalkWindows.phone), (42.3, WalkWindows.narrow),
                                                            (110.3, WalkWindows.half), (404.9, WalkWindows.flat)]
        for (wing, stage) in windows {
            #expect(abs(stage.wing - wing) < 0.1, "the window's wing is \(stage.wing), not \(wing)")
            for (s, layout) in zip(Generated.all, Generated.level(wing: wing)) {
                for touch in [stage.touch] {
                    let touchFrames = layout.sides.map { $0.touchFrame(touch: touch) }
                    let centres = layout.posts.flatMap(\.banners).map { CGPoint(x: $0.frame.midX, y: $0.frame.midY) }
                        + layout.labels.filter(\.standing).map { CGPoint(x: $0.frame.midX, y: $0.frame.midY) }
                    for (side, frame) in zip(layout.sides, touchFrames) {
                        frames += 1
                        #expect(frame.width >= touch - 0.001 && frame.height >= touch - 0.001, "\(Generated.describe(s)), wing \(wing): \(side.name) \(frame)")
                        for c in centres where frame.contains(c) {
                            Issue.record("\(Generated.describe(s)), wing \(wing), touch \(touch): \(side.name)'s touch frame covers a standing centre \(c)")
                        }
                    }
                    for i in layout.sides.indices {
                        for j in layout.sides.indices where j > i && touchFrames[i].intersects(touchFrames[j]) {
                            overlaps += 1
                            let own = Array(layout.sides[i].boxes.prefix(layout.sides[i].pill == nil ? 1 : 2))      // its pill and its pole
                            for box in own where box.intersects(touchFrames[j]) {
                                Issue.record("\(Generated.describe(s)), wing \(wing), touch \(touch): \(layout.sides[j].name)'s touch frame covers \(layout.sides[i].name)'s \(box)")
                            }
                        }
                    }
                }
            }
        }
        #expect(frames > 1000)
        print("Side touch frames: \(frames), overlapping pairs \(overlaps)")
    }

    @Test func everySidePostCanBeWalkedTo() {
        let env = WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today)
        var named = 0, onAWalkDown = 0
        for (s, layout) in zip(Generated.all, Generated.levelLayouts) {
            for side in layout.sides {
                guard let id = side.area else {
                    // The nameless post opens the paper on steps 1 to 5 (F12); on Look back up it is only read.
                    #expect(WalkLayout.tapEvent(side) == (s.level == nil ? nil : .paperOpened), "\(Generated.describe(s)): the nameless post")
                    if s.level != nil {
                        var opened = s
                        _ = opened.apply(.paperOpened, env)
                        #expect(opened.paperOpen, "\(Generated.describe(s)): the nameless post did not open the paper")
                    }
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
                let here = s.standingFlags()                 // F40: the flags of the stop shown
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
        // The goal above "Lift twice a week" (one line at 11 pt in its 126, and "1 of 3" on a line of its own,
        // F40: 12 + 14 + 14), then Health's four month goals, each on its one line (18 + 17 = 35), 4 between cloths.
        let frames = layout.banners.map(\.frame)
        #expect(layout.banners.map(\.kind) == [.parent, .full, .full, .full, .full])
        #expect(layout.banners.first?.text == "Lift twice a week" && layout.banners.first?.tag == "1 of 3")
        #expect(frames == [CGRect(x: 132, y: 336, width: 126, height: 40), CGRect(x: 120, y: 380, width: 150, height: 35),
                           CGRect(x: 120, y: 419, width: 150, height: 35), CGRect(x: 120, y: 458, width: 150, height: 35),
                           CGRect(x: 120, y: 497, width: 150, height: 35)], "\(frames)")
        #expect(layout.banners.allSatisfy { $0.turn == 0 && $0.shift == 0 && $0.drawn == $0.frame })
        // The pill: "HEALTH" at DM Sans SemiBold's own capitals (11 pt, tracked 1.1: 48.6) and 24, rounded up
        // (Task 10, P30; 75 by the old 8.4 a capital), 23 high, 6 above the goal above; its caret 2 above it.
        #expect(layout.standingLabel?.frame == CGRect(x: 195 - 36.5, y: 307, width: 73, height: 23))
        #expect(layout.standingLabel?.caret == CGRect(x: 190, y: 298, width: 10, height: 7))
        #expect(post.top == 336)

        // The side posts: Home, People, Work and Money all to the right of Health, inner low first.
        #expect(layout.sides.map(\.name) == ["Home", "People", "Work", "Money"])
        #expect(layout.sides.map(\.poleX) == [300, 357, 300, 357])
        #expect(layout.sides.map { $0.pill!.minY } == [524, 506, 438, 420])
        let home = layout.sides[0]
        #expect(home.pill == CGRect(x: 300 - 23, y: 524, width: 46, height: 21))            // HOME: its capitals at 9.5 pt, tracked 1 (31.9), + 14, rounded up (Task 10; 44 by the old 7.3 a capital)
        #expect(home.poleFoot == 520 && home.poleTop == 460 && home.lean == 0)
        #expect(home.pennants.map(\.frame) == (0..<3).map { CGRect(x: 301.75, y: 462 + 14 * CGFloat($0), width: 20, height: 13) })
        // PEOPLE (41.1 + 14, rounded up: 56; the old estimate capped it at 58), centred on its pole, inside the edge.
        #expect(layout.sides[1].pill == CGRect(x: 329, y: 506, width: 56, height: 21))

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
                #expect(label.frame.width <= 150 && label.frame.width == ceil(WalkLayout.textWidth("SIDE PROJECTS", face: .pill) + 24))
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

    #if canImport(UIKit)
    /// Rulings P28 (4) and P30 (5), Task 10: an area's name on its standing pill and its side pill is broken by DM Sans SemiBold's own capital widths at that pill's size and tracking, and
    /// drawn as given, never scaled: every line, set for real, fits its pill less the pill's padding, on a
    /// phone and on wider windows. A name is cut only where its lines cannot hold it. (The ground's chips
    /// are still by estimate: `WalkLayout.chipChar`, a known gap.)
    @Test @MainActor func aNamesLinesFitThePillTheyAreDrawnIn() throws {
        let pillFont = try #require(UIFont(name: "DMSans-SemiBold", size: 11))
        let sideFont = try #require(UIFont(name: "DMSans-SemiBold", size: 9.5))
        let names = WalkClassifier.defaults + [longName, "Money and the mortgage", "WWW MMM", "Mum’s workshop", "Wellbeing"]
        let areas = names.enumerated().map { WalkArea(id: uid(5000 + $0.offset), name: $0.element) }
        var off: [String] = [], cut: [String] = []
        for wing: CGFloat in [0, 42.3, 110.3] {
            for a in areas {
                var s = WalkState(); s.areas = areas; s.kept = areas.map(\.id); s.step = 1; s.focusArea = a.id
                let layout = WalkLayout.make(s.settled, today: today, footing: .level, wing: wing)
                let pill = try #require(layout.standingLabel)
                for line in pill.words where Self.setWidth(line, font: pillFont, tracking: 1.1) > pill.frame.width - WalkLayout.pillInset + 0.01 {
                    off.append("wing \(wing) pill \(a.name): “\(line)” in \(pill.frame.width)")
                }
                if pill.words.last?.hasSuffix("…") == true { cut.append("pill \(a.name)") }
                for side in layout.sides {
                    guard let frame = side.pill else { continue }
                    let words = side.pillWords
                    if Self.setWidth(words, font: sideFont, tracking: 1) > frame.width - WalkLayout.sidePillInset + 0.01 {
                        off.append("wing \(wing) side \(side.name): “\(words)” in \(frame.width)")
                    }
                }
            }
        }
        #expect(off.isEmpty, "\(off.count) lines set wider than their pill: \(off.prefix(10))")
        // On its own post every one of these names stands whole: two lines hold them all.
        #expect(cut.isEmpty, "cut on the standing pill: \(cut)")
        #expect(WalkLayout.pillLines(for: longName, width: 126) == ["SIDE PROJECTS", "AND MAKING"])

        // A7 (F39): "+n more" is the layout's own line, set unscaled at 11 pt inside its 78.
        let moreFont = try #require(UIFont(name: "DMSans-SemiBold", size: WalkLayout.Face.parent.size))
        let many = (0..<1200).map { flag(.year, "Goal \($0)", in: "Health") }
        let layout = WalkLayout.make(state(1, kept: ["Health"], items: many, standing: "Health"), today: today, footing: .level)
        let more = try #require(layout.mores.first)
        #expect(more.words == [more.text] && more.text.hasPrefix("+1"))
        #expect(Self.setWidth(more.text, font: moreFont) <= more.frame.width - WalkLayout.Face.parent.inset)
    }
    #endif

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

    /// S20, F39: a word wider than a line is broken by characters, a "-" where two letters part, as many
    /// as fit with it on each line; past the cloth's three lines the last is cut with "…". The flag's
    /// VoiceOver label keeps the word as written. The quiet Month page's 60 letters keep their look.
    @Test func aLongWordIsHyphenatedWhereItBreaks() {
        let word = String(repeating: "x", count: 60)
        let whole = WalkLayout.setLines(word, face: .flag, width: 134, limit: 9)
        // Each line of it is as many letters as fit with their hyphen in the cloth's 134: 17 of these.
        #expect(whole == [String(repeating: "x", count: 17) + "-", String(repeating: "x", count: 17) + "-",
                          String(repeating: "x", count: 17) + "-", String(repeating: "x", count: 9)])
        #expect(whole.dropLast().allSatisfy { WalkLayout.textWidth($0, face: .flag) <= 134 && WalkLayout.textWidth("x" + $0, face: .flag) > 134 })
        let three = WalkLayout.setLines(word, face: .flag, width: 134, limit: 3)
        #expect(three.count == 3 && three.prefix(2) == whole.prefix(2) && three[2].hasSuffix("…") && !three[2].contains("-"))
        #expect(three.allSatisfy { WalkLayout.textWidth($0, face: .flag) <= 134 })
        #expect(WalkLayout.setLines(DemoMode.longWord, face: .flag, width: 134, limit: 3)
                == ["Antidisestablishme-", "ntarianismfloccinau-", "cinihilipilificationism"])
        #expect(WalkLayout.lines(for: word, width: 150) == 3)
        let item = flag(.year, "Say \(word)", in: "Home")
        let b = ruled(state(1, kept: ["Home"], items: [item], standing: "Home")).banner(for: item)!
        #expect(b.lines == 3 && b.words.count == 3 && b.words[0] == "Say" && b.words[2].hasSuffix("…"))
        #expect(b.text == "Say \(word)" && b.label == "Year: Say \(word), tap to move or remove")
        // A typed soft hyphen is a place a line may end, drawn "-" there and nowhere else.
        #expect(WalkLayout.setLines("Ask the electro\u{00AD}cardio\u{00AD}graphy nurse", face: .flag, width: 134, limit: 3)
                == ["Ask the electro-", "cardiography nurse"])
        #expect(WalkLayout.setLines("Call the elec\u{00AD}trician about the wiring", face: .flag, width: 134, limit: 3)
                == ["Call the electrician", "about the wiring"])
    }

    /// Lines are counted as the words wrap, by the face's own widths at the cloth's size (F33): a
    /// title of 20 or 21 ordinary letters is one line of a flag, not two; a goal above is set
    /// smaller, in a narrower cloth. (`everyLineFitsItsCloth` sets every line for real.)
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
        #expect(WalkLayout.glyphWidth("é") == WalkLayout.glyphWidth("e") && WalkLayout.glyphWidth("e\u{0301}") == WalkLayout.glyphWidth("e"))
        #expect(WalkLayout.glyphWidth("好") == 1400 && WalkLayout.glyphWidth("😀") == 1400 && WalkLayout.glyphWidth("Ĝ") == 1400)
        #expect(WalkLayout.glyphWidth("ď") == 745 && WalkLayout.glyphWidth("ß") == 696)
        // An emoji of several counts 1.4 em a picture in it (drawn unjoined it is that wide); joiners,
        // variation selectors and skin tones count nothing.
        #expect(WalkLayout.glyphWidth("👨‍👩‍👧") == 4200 && WalkLayout.glyphWidth("🏊‍♀️") == 2800)
        #expect(WalkLayout.glyphWidth("👍🏽") == 1400 && WalkLayout.glyphWidth("☕️") == 1400 && WalkLayout.glyphWidth("1️⃣") == 1400)
        #expect(WalkLayout.glyphWidths.count == 95 && WalkLayout.widerPairs.count == 55)
        // The pairs the face sets further apart are counted: "t," is 421 + 227 and 30 between them.
        #expect(near(WalkLayout.textWidth("t,", face: .flag), (421 + 227 + 30) * 13 / 1000, 0.0001))
        #expect(near(WalkLayout.textWidth(",", face: .flag, after: "t"), (227 + 30) * 13 / 1000, 0.0001))
        #expect(near(WalkLayout.textWidth("/É", face: .flag), (417 + 578 + 50) * 13 / 1000, 0.0001))            // as "/E"
        #expect(near(WalkLayout.textWidth("t\u{00AD},", face: .flag), WalkLayout.textWidth("t,", face: .flag), 0.0001))
        // What is drawn and counted has its words one space apart: no run of spaces, tab or line break.
        #expect(WalkLayout.normalised("  Call  Mum\tabout\nSunday lunch ") == "Call Mum about Sunday lunch")
        #expect(WalkLayout.setLines("  Call  Mum\tabout\nSunday lunch ", face: .flag, width: 134, limit: 3) == ["Call Mum about", "Sunday lunch"])
        #expect(WalkLayout.setLines("   ", face: .flag, width: 134, limit: 3).isEmpty && WalkLayout.lines(for: "   ", width: 150) == 1)
        #expect(WalkLayout.lines(for: "  Call  Mum\tabout\nSunday lunch ", width: 150) == WalkLayout.lines(for: "Call Mum about Sunday lunch", width: 150))
        let odd = flag(.year, "  Call  Mum\tabout\nSunday lunch ", in: "Home")
        let cloth = ruled(state(1, kept: ["Home"], items: [odd], standing: "Home")).banner(for: odd)!
        #expect(cloth.text == "Call Mum about Sunday lunch" && cloth.lines == 2 && cloth.words == ["Call Mum about", "Sunday lunch"])
        #expect(cloth.label.contains(odd.title))
        // Chinese: a line may end between two ideographs, with no mark.
        let chinese = WalkLayout.setLines("每天早上散步三十分钟然后做拉伸运动", face: .flag, width: 134, limit: 3)
        #expect(chinese == ["每天早上散步三", "十分钟然后做拉", "伸运动"])                     // 17 at 18.2 a character: 7 a line
        for title in Generated.titles {
            #expect(WalkLayout.lines(for: title, width: 226.5) <= WalkLayout.lines(for: title, width: 150))
        }
        // A hyphen of the word's own is a place a line may end.
        #expect(WalkLayout.lines(for: "Book a mid-afternoon check-up", width: 150) == 2)
    }

    #if canImport(UIKit)
    /// The titles every breaking is held to: every title of the two stress plans and of the demo's preview
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
        out += oddTitles
        var seen = Set<String>()
        return out.filter { seen.insert($0).inserted }
    }

    /// Titles a person can make that the plans do not hold: runs of spaces, spaces at the ends, a tab
    /// and a newline; accented capitals; letters with no plain letter under them; another script whose
    /// letters do not break (Greek), one that breaks anywhere (Chinese), and emoji.
    static let oddTitles = [
        "Call  Mum about   Sunday lunch", "  Tile the bathroom wall  ", "Call Mum\tabout Sunday\nlunch at one",
        "École d’été: finir le dossier Ödland", "Zamówić bilety do Łodzi, groß und Straße",
        "Διαβάζω περισσότερα βιβλία φέτος", "每天早上散步三十分钟，然后做拉伸运动",
        "Run a 5K 🏃 then coffee ☕️ with Sam 😀 and the kids 👨‍👩‍👧",
        // F38: where the text system will not end a line. An emoji against ASCII punctuation (the
        // second to fourth were counted a line short before F38, on a phone's flag and goal above, the
        // half window's flag and the outside screen's goal above); emoji with no space between.
        "Swim on Sundays with the kids 🏊! Every single week", "Swim on Sundays 🏊? Every single week",
        "Swim at the pool with the kids 🏊! Every single week, rain or shine", "Swim with Mia and Liam 🏊! Every week, rain or shine",
        "Party 🎉🎂🎈🎁🥳🎊 for Mia", "🎉🎂🎈🎁🥳🎊🎉🎂🎈🎁🥳🎊🎉🎂",
        // Ideographs with ASCII punctuation inside; an opening bracket and quote before them; Japanese
        // with small kana and the long mark; Korean with and without spaces; a full-width opening mark.
        "整理车库,然后把旧自行车卖掉!还要修好门锁", "周末计划(整理车库和阳台)然后“休息一下”再出发",
        "キッチンのリフォームをちゃんと計画して、見積もりをとる", "주말에가족과함께공원에서자전거타기", "주말에 가족과 함께 공원에서 자전거 타기",
        "把「车库整理」这件事在周末之前彻底做完再说",
        // A space the text system will not end a line at: after an opening bracket, before a closing one
        // (counted a line short before F38 on a phone's flag and goal above).
        "Call the bank ( today ) before Friday",
    ]

    /// One line of text as the app sets it: kerned by the face, with the face's tracking added. The
    /// `.kern` attribute is given only for a tracked face: at `.kern: 0` CoreText turns the face's
    /// kerning OFF, so an untracked face is measured with no `.kern` at all (as a `Text` with no
    /// `.tracking`, and TextKit with the font alone, set it); a non-zero `.kern` keeps the face's
    /// kerning and adds itself after each character, as `.tracking` does.
    private static func setWidth(_ text: String, font: UIFont, tracking: CGFloat = 0) -> CGFloat {
        var attributes: [NSAttributedString.Key: Any] = [.font: font]
        if tracking != 0 { attributes[.kern] = tracking }
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
        return CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    }

    /// The height of each line fragment the text system makes of a string at a width.
    @MainActor private static func lineHeights(_ text: String, font: UIFont, width: CGFloat) -> [CGFloat] {
        let storage = NSTextStorage(string: text, attributes: [.font: font])
        let manager = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        var heights: [CGFloat] = []
        manager.enumerateLineFragments(forGlyphRange: manager.glyphRange(for: container)) { rect, _, _, _, _ in heights.append(rect.height) }
        return heights
    }

    /// The promise behind every count, made structural: no two characters are ever set wider than
    /// they are counted. Every ordered pair of the characters the layout knows (the face's own table,
    /// the extra marks and letters, and every accented Latin letter it counts as its letter), set by
    /// the bundled face at each cloth's size and tracking, is no wider than `textWidth` says; so is
    /// each character alone. (The face draws some pairs further apart than their widths, its
    /// positive kerning: `t,`, `/B`, `r2`, `vf`. Those are counted; pairs it draws closer are not.)
    @Test @MainActor func noPairIsSetWiderThanItIsCounted() throws {
        var characters: [Character] = (32...126).map { Character(UnicodeScalar($0)!) }
        characters += WalkLayout.otherGlyphWidths.keys.sorted()
        characters += (0xC0...0x17F).compactMap { UnicodeScalar($0) }.filter { $0.properties.isAlphabetic }.map { Character($0) }
            .filter { !WalkLayout.otherGlyphWidths.keys.contains($0) }
        #expect(characters.count >= 95 + 8 + 150)
        var wider: [String] = []
        var pairs = 0
        for face in [WalkLayout.Face.flag, .parent, .lookBack, .tag, .pill, .sidePill] {
            let font = try #require(UIFont(name: "DMSans-SemiBold", size: face.size), "the bundled face is not there")
            for a in characters {
                let alone = String(a)
                if Self.setWidth(alone, font: font, tracking: face.tracking) > WalkLayout.textWidth(alone, face: face) + 0.001 { wider.append("\(face) “\(alone)”") }
                for b in characters {
                    let pair = String([a, b])
                    let set = Self.setWidth(pair, font: font, tracking: face.tracking), counted = WalkLayout.textWidth(pair, face: face)
                    if set > counted + 0.001 { wider.append("\(face) “\(pair)” set \(set), counted \(counted)") }
                    pairs += 1
                }
            }
        }
        #expect(wider.isEmpty, "\(wider.count) set wider than counted: \(wider.prefix(12))")
        print("The pairs: \(characters.count) characters, \(pairs) ordered pairs over six faces; set wider than counted: \(wider.count)")
    }

    /// Every tag (the example's two, FIRST THING, nine day tags) is no wider than counted and fits the line
    /// of the cloth it is given; the face's own line is under the 17 a flag gives it (F37).
    @Test @MainActor func theTagsFitTheirLine() throws {
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
        // How tall a line really is. The face's own line is under the 17 a flag gives it. A line that
        // holds Chinese or an emoji is set in the system's face and is taller; each line is drawn in its
        // fixed line height (F37), so the cloth never grows.
        let flagFont = try #require(UIFont(name: "DMSans-SemiBold", size: 13))
        let own = Self.lineHeights("Call Mum about Sunday lunch", font: flagFont, width: 134)
        let chinese = Self.lineHeights("每天早上散步三十分钟", font: flagFont, width: 134)
        let emoji = Self.lineHeights("Run a 5K 🏃 then coffee", font: flagFont, width: 134)
        #expect(own.count == 2 && own.allSatisfy { $0 <= WalkLayout.flagLine })
        print("Line heights at 13 pt: the face \(own), Chinese \(chinese), with an emoji \(emoji); widths: 好 \(Self.setWidth("好", font: flagFont)), 😀 \(Self.setWidth("😀", font: flagFont)), at 11 pt 😀 \(Self.setWidth("😀", font: tagFont))")
    }

    // MARK: F39: the layout breaks the lines, the view draws them

    /// The lines a cloth draws of a title: what the checks below hold to width.
    @MainActor private static func drawn(_ title: String, _ face: WalkLayout.Face, inner: CGFloat, limit: Int) -> [String] {
        WalkLayout.setLines(title, face: face, width: inner, limit: limit)
    }
    /// The question's lines as drawn (the block's own `questionLines` at the size it picked, else the lines
    /// at `size`), and how many lines the block's height counts for it, read back from its foot (Task 10:
    /// this compared `questionLines` with itself and could not fail).
    @MainActor private static func questionDrawn(_ q: String, size: CGFloat, wing: CGFloat) -> (lines: [String], counted: Int) {
        let set = WalkLayout.words(question: q, why: "", wing: wing)
        let lines = WalkLayout.questionLines(q, size: size, wing: wing)
        guard set.questionSize == size else { return (lines, lines.count) }
        let bare = WalkLayout.wordsFoot(questionSize: size, questionLines: 0, whyLines: set.whyLines)
        let counted = Int(((set.foot - bare) / (size * WalkLayout.questionLineRatio)).rounded())
        return (set.questionLines, counted)
    }

    /// What TextKit makes of a string at a width: each line fragment's characters, its end's spaces trimmed.
    @MainActor private static func realLineStrings(_ text: String, font: UIFont, width: CGFloat) -> [String] {
        let storage = NSTextStorage(string: text, attributes: [.font: font])
        let manager = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        var out: [String] = []
        let whole = text as NSString
        manager.enumerateLineFragments(forGlyphRange: manager.glyphRange(for: container)) { _, _, _, glyphs, _ in
            var line = whole.substring(with: manager.characterRange(forGlyphRange: glyphs, actualGlyphRange: nil))
            while let last = line.last, last.isWhitespace { line.removeLast() }
            out.append(line)
        }
        return out
    }

    /// Every way these lines can be put back together: a space at a break; nothing, at a break inside a
    /// word that shows no mark (never between two letters or digits: the breaking puts a "-" there); or a
    /// "-" taken off, only where it stands between two letters or digits (one the breaking added). So a
    /// "-" filled in the wrong place, or a break between two letters with none, does not put back together.
    private static func rejoined(_ lines: [String], softHyphens: Bool = false) -> Set<String> {
        func spelled(_ c: Character?) -> Bool {
            guard let c, c.isLetter || c.isNumber, let first = c.unicodeScalars.first else { return false }
            return !first.properties.isIdeographic && !(0x1100...0x11FF).contains(first.value)
                && !(0x3040...0x30FF).contains(first.value) && !(0x3130...0x318F).contains(first.value)
                && !(0x31F0...0x31FF).contains(first.value) && !(0xAC00...0xD7AF).contains(first.value)
        }
        guard var out = lines.first.map({ Set([$0]) }) else { return [""] }
        for next in lines.dropFirst() {
            var more = Set<String>()
            for so in out {
                more.insert(so + " " + next)
                if !(spelled(so.last) && spelled(next.first)) { more.insert(so + next) }
                // A "-" the breaking added stands between two letters; one the person typed (a soft hyphen) anywhere.
                if so.hasSuffix("-"), softHyphens || (spelled(so.dropLast().last) && spelled(next.first)) {
                    more.insert(String(so.dropLast()) + next)
                }
            }
            out = more
        }
        return out
    }

    /// Task 10 (item 19): `rejoined` tells a wrong fill "-" (between a letter and a mark) and a break between
    /// two letters with no "-" from the breaking's own; `faults` tells a bare "…".
    @Test func theRoundTripCatchesAWrongFill() {
        #expect(Self.rejoined(["abc-", "def"]).contains("abcdef"))          // the breaking's own fill
        #expect(!Self.rejoined(["abc", "def"]).contains("abcdef"))          // two letters parted with no "-"
        #expect(!Self.rejoined(["abc-", ".def"]).contains("abc.def"))       // a "-" where none belongs
        #expect(Self.rejoined(["mid-", "afternoon"]).contains("mid-afternoon"))
        #expect(Self.rejoined(["整理", "车库"]).contains("整理车库"))
    }

    /// What is wrong with a cloth's lines, set for real: a line wider than the cloth's inner width (CoreText,
    /// the face's own kerning, its tracking), more lines than the cloth holds, an empty line; an uncut
    /// title that does not put back together as itself; a cut one whose last line does not end "…"
    /// after the title's own beginning.
    private static func faults(_ title: String, lines: [String], uncut: Bool, limit: Int, inner: CGFloat, font: UIFont,
                               tracking: CGFloat = 0, name: String) -> [String] {
        var out: [String] = []
        // The title's words one space apart, soft hyphens dropped (a word of only a soft hyphen draws nothing).
        let words = title.replacingOccurrences(of: "\u{00AD}", with: "")
            .split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
        if lines.count > limit { out.append("\(name): \(lines.count) lines of \(limit)") }
        if lines.contains(where: \.isEmpty) { out.append("\(name): an empty line in \(lines)") }
        if lines.isEmpty != words.isEmpty { out.append("\(name): \(lines.count) lines for “\(title)”") }
        for line in lines where setWidth(line, font: font, tracking: tracking) > inner + 0.01 {
            out.append("\(name): “\(line)” set \(setWidth(line, font: font, tracking: tracking)) in \(inner)")
        }
        let typed = title.contains("\u{00AD}")
        if uncut {
            if !rejoined(lines, softHyphens: typed).contains(words) { out.append("\(name): \(lines) is not “\(words)”") }
        } else if let last = lines.last {
            if last == "…" { out.append("\(name): a bare “…” in \(lines)") }
            let kept = Array(lines.dropLast()) + [String(last.dropLast())]
            if !last.hasSuffix("…") || !rejoined(kept, softHyphens: typed).contains(where: { words.hasPrefix($0) }) {
                out.append("\(name): cut \(lines) does not begin “\(words.prefix(40))” and end “…”")
            }
        }
        return out
    }

    /// The cloths every title is checked on: a flag, the goal above and a Look back up cloth, at the
    /// inner width each has on every window the stage produces.
    private static var clothFaces: [(face: WalkLayout.Face, inner: CGFloat)] {
        var out: [(WalkLayout.Face, CGFloat)] = []
        for wing in wings {
            let flag = WalkLayout.standingWidth(wing: wing), parent = WalkLayout.parentWidth(wing: wing)
            out += [(.flag, flag - WalkLayout.Face.flag.inset), (.parent, parent - WalkLayout.Face.parent.inset),
                    (.lookBack, flag - WalkLayout.Face.lookBack.inset)]
        }
        return out
    }

    /// The reviewers' titles, the quiet Month page's two, and long tokens.
    static let hardTitles = [
        "Buy ,apples/eggs/trousers before Friday", "https://www.us.city.springfield/holds", "Call the bank ( today ) before Friday",
        "☕️PDFJavaScriptAmazon。周划库", "Email jonathan.richardson-whitfield@example.com",
        "Sort #photos2025/holidays/summer-in-the-mountains", String(repeating: "m", count: 20),
        DemoMode.longTitle, DemoMode.longWord, "soft\u{00AD}hyphen\u{00AD}ated words, typed", "   ",
    ]

    /// Task 10 (A8, P34): a cut line drops a trailing comma or other mark before its "…" ("permit for the
    /// van,…" reads "permit for the van…"), and never down to a bare "…".
    @Test func aCutLineDropsItsTrailingMark() {
        let count = { (s: String, _: Character?) in CGFloat(s.count) }
        #expect(WalkLayout.breakLines("aaaa bbbb, cccc dddd", room: 11, limit: 1, measure: count) == ["aaaa bbbb…"])
        #expect(WalkLayout.breakLines("aaaa bbbb — cccc", room: 11, limit: 1, measure: count) == ["aaaa bbbb…"])
        #expect(WalkLayout.breakLines("aaaa, bbbb cccc", room: 7, limit: 1, measure: count) == ["aaaa…"])
        #expect(WalkLayout.breakLines(", bbbbbbbb", room: 3, limit: 1, measure: count) == [",…"])
        let title = "Pick up the permit for the van, then the keys"
        for inner in stride(from: CGFloat(60), through: 140, by: 1) {
            let last = WalkLayout.setLines(title, face: .flag, width: inner, limit: 2).last ?? ""
            #expect(!last.hasSuffix(",…") && !last.hasSuffix(" …"), "\(inner): \(last)")
        }
    }

    /// Task 10 (item 19): no cloth, pill or question the layout makes is narrower than one character and the
    /// "-" a fill puts after it (where the breaking could not keep a line inside its room).
    @Test func everyRoomHoldsACharacterAndItsHyphen() {
        let widest = WalkLayout.glyphWidths.max() ?? 0, dash = WalkLayout.glyphWidths[Int(Character("-").asciiValue!) - 32]
        func least(_ face: WalkLayout.Face) -> CGFloat { (widest + dash) * face.size / 1000 + 2 * face.tracking }
        for wing in wings {
            #expect(WalkLayout.standingWidth(wing: wing) - WalkLayout.Face.flag.inset >= least(.flag))
            #expect(WalkLayout.parentWidth(wing: wing) - WalkLayout.Face.parent.inset >= least(.parent))
            #expect(WalkLayout.standingWidth(wing: wing) - WalkLayout.Face.lookBack.inset >= least(.lookBack))
            #expect(WalkLayout.sidePill(wing: wing) - WalkLayout.sidePillInset >= least(.sidePill))
            #expect(WalkLayout.pillLeast - WalkLayout.pillInset >= least(.pill))
        }
    }

    /// F39 (a): every line the layout gives a cloth fits it. Every title of the corpus (the demo plans,
    /// the examples, the generator's, the odd ones) and the hard ones, on every cloth face at every inner
    /// width, with room for 3, 2 and 1 lines.
    @Test @MainActor func everyLineFitsItsCloth() throws {
        var faults: [String] = []
        var checked = 0
        for (face, inner) in Self.clothFaces {
            let font = try #require(UIFont(name: "DMSans-SemiBold", size: face.size))
            for title in Self.corpus + Self.hardTitles {
                let whole = Self.drawn(title, face, inner: inner, limit: 99)
                for limit in [3, 2, 1] {
                    let lines = Self.drawn(title, face, inner: inner, limit: limit)
                    faults += Self.faults(title, lines: lines, uncut: whole.count <= limit, limit: limit, inner: inner, font: font,
                                          name: "\(face) \(Int(inner)) ≤\(limit)")
                    checked += 1
                }
            }
        }
        #expect(faults.isEmpty, "\(faults.count) of \(checked): \(faults.prefix(12))")
        print("Every line fits: \(checked) breakings; faults \(faults.count)")
    }

    /// A title made by chance, the same every run: words, marks with stray spaces before them, slashes,
    /// web addresses, emoji runs, Chinese, Japanese and Korean, soft hyphens, tabs.
    static func fuzzedTitles(_ count: Int) -> [String] {
        struct Seeded: RandomNumberGenerator {
            var state: UInt64
            mutating func next() -> UInt64 {
                state &+= 0x9E37_79B9_7F4A_7C15
                var z = state
                z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
                z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
                return z ^ (z >> 31)
            }
        }
        var g = Seeded(state: 20_261_116)
        let words = ["Call", "Mum", "about", "Sunday", "lunch", "Buy", "apples", "eggs", "trousers", "before", "Friday", "the",
                     "bank", "mid-afternoon", "check-up", "x", "a", "10-minute", "re:", "a/b", "don’t", "WWWWWWWW", "Ödland",
                     "jonathan.richardson-whitfield@example.com", "https://www.us.city.springfield/holds",
                     "#photos2025/holidays/summer", "Antidisestablishmentarianism", String(repeating: "m", count: 20)]
        let others = ["🏊", "😀🎉🎂🎈", "👨‍👩‍👧", "☕️", "🇬🇧", "整理车库", "然后把旧自行车卖掉", "キッチンのリフォーム", "주말에가족과함께",
                      "把「车库」", "(today)", "«oui»", "Διαβάζω", "e\u{00AD}mail", "soft\u{00AD}hyphen\u{00AD}ated"]
        let marks = ["!", "?", ",", ".", ":", ")", "/", "…", "—", "–", "’", "”", "„", "‚", "‹", "¿", "¡", "›", "\u{00AD}", "。", "、"]
        let gaps = [" ", " ", " ", " ", " ", "  ", "", "\t", " \u{00AD}"]
        var out: [String] = []
        for _ in 0..<count {
            var title = ""
            for i in 0..<Int.random(in: 1...14, using: &g) {
                if i > 0 { title += gaps.randomElement(using: &g)! }
                if Int.random(in: 0..<10, using: &g) < 7 { title += words.randomElement(using: &g)! } else { title += others.randomElement(using: &g)! }
                if Int.random(in: 0..<4, using: &g) == 0 {
                    if Bool.random(using: &g) { title += " " }
                    title += marks.randomElement(using: &g)!
                }
            }
            out.append(title)
        }
        return out
    }

    /// F39 (b): the same checks over 2,000 titles made by chance (a fixed seed).
    @Test @MainActor func fuzzedTitlesFitTheirCloths() throws {
        var faults: [String] = []
        var checked = 0
        let titles = Self.fuzzedTitles(2000)
        for (face, inner) in Self.clothFaces.prefix(6) {                   // a phone's and the outside screen's cloths
            let font = try #require(UIFont(name: "DMSans-SemiBold", size: face.size))
            for title in titles {
                let whole = Self.drawn(title, face, inner: inner, limit: 99)
                for limit in [3, 1] {
                    let lines = Self.drawn(title, face, inner: inner, limit: limit)
                    faults += Self.faults(title, lines: lines, uncut: whole.count <= limit, limit: limit, inner: inner, font: font,
                                          name: "\(face) \(Int(inner)) ≤\(limit) “\(title)”")
                    checked += 1
                }
            }
        }
        #expect(faults.isEmpty, "\(faults.count) of \(checked): \(faults.prefix(8))")
        print("Fuzzed: \(titles.count) titles, \(checked) breakings; faults \(faults.count)")
    }

    /// The demo plans' titles and the examples (the titles a person sees first).
    static var ordinaryTitles: [String] {
        var out: [String] = []
        for plan in [DemoStress.full, DemoStress.long] {
            out += plan.script.map { WalkWords.said($0.1, level: $0.0, today: today)?.title ?? $0.1 }
        }
        for level in [WalkLevel.year, .season, .month, .week] {
            for name in ["Health", "Home", "People", "Work", "Money", "Fun"] { out += WalkCopy.examples(level, area: name) }
        }
        out += ["Feel strong again", "Finish the bathroom", "More slow weekends together", "Bathroom done by February",
                "Lift twice a week", "Pick the tile and pay the deposit", "Send the contractor the deposit", "Choose the tile"]
        var seen = Set<String>()
        return out.filter { seen.insert($0).inserted }
    }

    /// Where the layout breaks an ordinary title otherwise than the text system would, by cloth. Each is
    /// the face's kerning setting a line a hair inside the width its letters' widths pass (pairs it sets
    /// closer are never counted). "Book the first camping trip" on the outside screen's 183-wide flag
    /// gets two lines (before F39: one line and a blank band); the rest keep their two lines and move
    /// one word down ("Invite friends over / for dinner", the system "Invite friends over for / dinner").
    static let breaksOtherwise: Set<String> = [
        "flag at 183: Book the first camping trip",
        "flag at 150: Invite friends over for dinner", "flag at 150: Borrow the next book on Saturday",
        "parent at 126: Tour the gym on Main Street", "parent at 159: Protect two focus mornings a week",
        "flag at 226: Photograph the first five pieces in daylight", "parent at 202: Finish the upstairs bathroom before spring",
        "parent at 202: Put the free Sunday on the calendar today",
    ]

    /// F39 (c): ordinary titles look as the system sets them: the layout's lines are the lines TextKit
    /// breaks them into, on every cloth, but for `breaksOtherwise`.
    @Test @MainActor func ordinaryTitlesBreakAsTheSystemDoes() throws {
        var cloths: [(face: WalkLayout.Face, width: CGFloat)] = [(.lookBack, 150)]
        for wing: CGFloat in [0, 42.3, 110.3] {
            cloths += [(.flag, WalkLayout.standingWidth(wing: wing)), (.parent, WalkLayout.parentWidth(wing: wing))]
        }
        var otherwise = Set<String>(), seen: [String] = []
        var checked = 0
        for (face, width) in cloths {
            let font = try #require(UIFont(name: "DMSans-SemiBold", size: face.size))
            for title in Self.ordinaryTitles {
                let ours = Self.drawn(title, face, inner: width - face.inset, limit: 99)
                let system = Self.realLineStrings(title, font: font, width: width - face.inset)
                if ours != system {
                    otherwise.insert("\(face) at \(Int(width)): \(title)")
                    seen.append("\(face) at \(Int(width)): \(ours) / the system \(system)")
                }
                checked += 1
            }
        }
        #expect(otherwise == Self.breaksOtherwise, "\(seen)")
        #expect(checked > 600)
        print("Ordinary titles: \(Self.ordinaryTitles.count) on \(cloths.count) cloths, \(checked) breakings; otherwise: \(seen)")
    }

    /// The questions every step asks, quoting each goal of the demo's plans, and the three long-token goals.
    private func questions() -> (ordinary: [String], long: [String]) {
        let p = WalkPeriods.pick(now: today, weekStartsOn: 0)
        var goals: [(WalkLevel, String)] = []
        for plan in [DemoStress.full, DemoStress.long] {
            goals += plan.script.map { ($0.0, WalkWords.said($0.1, level: $0.0, today: today)?.title ?? $0.1) }
        }
        goals += [(.year, "Feel strong again"), (.year, "Finish the bathroom"), (.year, "More slow weekends together"),
                  (.season, "Bathroom done by February"), (.season, "Lift twice a week"),
                  (.month, "Pick the tile and pay the deposit"), (.week, "Send the contractor the deposit")]
        var ordinary: [String] = []
        for (level, title) in goals where level != .today {
            let step = level.rawValue + 1
            ordinary.append(WalkCopy.question(quoting(title, step: step), p))
            if step == 5 { ordinary.append(WalkCopy.question(quoting(title, step: step, first: true), p)) }
        }
        ordinary += [1, 2, 3, 4, 5].map { WalkCopy.question(state($0, kept: ["Health"], standing: "Health"), p) }
        var long: [String] = []
        for title in ["Email jonathan.richardson-whitfield@example.com", "Sort #photos2025/holidays/summer-in-the-mountains",
                      String(repeating: "m", count: 20)] {
            for step in 2...5 { long.append(WalkCopy.question(quoting(title, step: step), p)) }
            long.append(WalkCopy.question(quoting(title, step: 5, first: true), p))
        }
        return (Array(Set(ordinary)).sorted(), Array(Set(long)).sorted())
    }

    /// Where the layout gives an ordinary question a different number of lines than the system would: each
    /// one line more, Crimson Pro's kerning setting it a hair inside the width its letters' widths pass.
    /// (The block counted these lines before F39 too; the text system then drew one line fewer.)
    static let questionsOtherwise: Set<String> = [
        "28.0 at 334.0: For “Clear out the old vanity”, what happens this week? (3, the system 2)",
        "28.0 at 334.0: What part of “In bed by eleven” belongs to December? (3, the system 2)",
        "28.0 at 334.0: You’ll start the day with “Text the Okafors about Friday”. (3, the system 2)",
        "28.0 at 418.6: What part of “Find the old retirement account” belongs to December? (3, the system 2)",
        "28.0 at 418.6: What’s the first thing you’ll do today? (2, the system 1)",
        "28.0 at 419.6: What part of “Find the old retirement account” belongs to December? (3, the system 2)",
        "28.0 at 419.6: What’s the first thing you’ll do today? (2, the system 1)",
        "28.0 at 500.0: Start the day with “Cancel the film channel”? (2, the system 1)",
        "32.0 at 334.0: For “No screens after ten”, what happens this week? (3, the system 2)",
        "32.0 at 334.0: Start the day with “Cancel the film channel”? (3, the system 2)",
        "32.0 at 334.0: You’ll start the day with “Call the first three leads”. (3, the system 2)",
        "32.0 at 334.0: You’ll start the day with “Cancel the film channel”. (3, the system 2)",
        "32.0 at 418.6: What part of “Bathroom done by February” belongs to December? (3, the system 2)",
        "32.0 at 419.6: You’ll start the day with “Choose between the two grey floor tiles”. (3, the system 2)",
    ]

    /// F39 (d): the question's lines fit the block (Crimson Pro at 32 and 28, the block's widths on a
    /// phone, the outside screen, just past it and the widest window), put back together as the
    /// question, and are as many as the block's height counts; for the ordinary questions as many as the
    /// text system would set.
    @Test @MainActor func theQuestionsLinesFitTheBlock() throws {
        let (ordinary, long) = questions()
        #expect(ordinary.count > 90 && long.count == 15)
        var faults: [String] = [], otherwise = Set<String>()
        var checked = 0
        for size in [WalkLayout.questionSize, WalkLayout.questionSmallSize] {
            let font = try #require(UIFont(name: "CrimsonPro-Regular", size: size))
            for wing: CGFloat in [0, 42.3, 42.8, 110.3] {
                let width = WalkLayout.wordsWidth(wing: wing)
                for q in ordinary + long {
                    let set = Self.questionDrawn(q, size: size, wing: wing)
                    faults += Self.faults(q, lines: set.lines, uncut: true, limit: .max, inner: width, font: font, name: "\(size) at \(width)")
                    if set.lines.count != set.counted { faults.append("\(size) at \(width): “\(q)” drawn on \(set.lines.count), counted \(set.counted)") }
                    let system = Self.realLineStrings(q, font: font, width: width).count
                    if ordinary.contains(q), set.lines.count != system {
                        otherwise.insert("\(size) at \(width): \(q) (\(set.lines.count), the system \(system))")
                    }
                    checked += 1
                }
            }
        }
        #expect(faults.isEmpty, "\(faults.count) of \(checked): \(faults.prefix(8))")
        #expect(otherwise == Self.questionsOtherwise, "\(otherwise.sorted())")
        print("The questions: \(ordinary.count) ordinary and \(long.count) long at 2 sizes on 4 widths, \(checked) breakings; faults \(faults.count); otherwise \(otherwise.sorted())")
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
        let at = s.goalAboveStops().firstIndex(of: focused.id)! + 1
        #expect(layout.banners.map(\.kind) == [.parent])
        // F40: its place in the round is read, and drawn on its own line.
        #expect(layout.banners[0].label == "Year: \(focused.title), the goal this step is about, goal \(at) of 2, tap to switch")
        #expect(layout.banners[0].tag == "\(at) of 2")
        #expect(layout.banners[0].taps && WalkLayout.tapEvent(layout.banners[0], on: layout.posts[0]) == .bannerTapped(focused.id))
        let alone = ruled(state(2, kept: ["Home"], items: [mine], standing: "Home"))
        #expect(alone.banners[0].label == "Year: Run a 5K, the goal this step is about" && !alone.banners[0].taps)

        var ex = state(1, kept: ["Health"], standing: "Health")
        ex.examplesOn = [1]
        let ghost = ruled(ex).banners(.ghost).first
        #expect(ghost?.label == "Example: Feel strong again, tap to make it yours" && ghost?.taps == true)

        // "+n more" opens the paper (F7): it says how many and that a tap reads the list.
        let crowd = (1...8).map { flag(.year, "Goal \($0)", in: "Home") }
        let crowded = ruled(state(1, kept: ["Home"], items: crowd, standing: "Home"))
        let more = crowded.mores.first
        #expect(more?.kind == .more(4) && more?.text == "+4 more" && more?.label == "4 more, tap to read the list" && more?.taps == true)
        #expect(more.map { WalkLayout.tapEvent($0, on: crowded.posts[0]) == .paperOpened } == true)
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
        #expect(kinds == ["full", "parent", "more", "ghost", "compact"])
    }

    // MARK: Many states

    /// Task 10 (D2): the sweep reaches goals above that are one of several and stand over flags, with
    /// "+n more", with examples, with a chosen flag, and on walk-downs; so the F40 shape check in
    /// `Invariants.check` and every sweep over `Generated` see them (the sweep once hung every flag under
    /// its area's first goal while the walk stands on its newest, so no such state drew a flag).
    @Test func theSweepDrawsFlagsUnderOneOfSeveralGoals() {
        var drawn = 0, more = 0, examples = 0, chosen = 0, walkingDown = 0
        for (s, layout) in zip(Generated.all, Generated.levelLayouts) where s.goalAboveStops().count > 1 {
            let banners = layout.posts.flatMap(\.banners)
            guard banners.contains(where: { $0.kind == .full }) else { continue }
            drawn += 1
            if !layout.mores.isEmpty { more += 1 }
            if banners.contains(where: { $0.kind == .ghost }) { examples += 1 }
            if let id = s.selected, banners.contains(where: { $0.itemId == id }) { chosen += 1 }
            if !s.walkingDown.isEmpty { walkingDown += 1 }
        }
        #expect(drawn >= 100 && more > 0 && examples > 0 && chosen > 0 && walkingDown > 0,
                "drawn \(drawn), more \(more), examples \(examples), chosen \(chosen), walking down \(walkingDown)")
        print("One of several goals above, over flags: \(drawn) states; +n more \(more), examples \(examples), chosen \(chosen), walking down \(walkingDown)")
    }

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

    // MARK: Look back up (Task 8)

    /// F6: the full plan, standing in Health: the area's name in its pill at 110, then one cloth for
    /// each level, year above season above month above week above today, each centred on the
    /// midline and a standing flag's width (120…270 on a phone), 6 under the pill and 8 apart (P36); every
    /// other kept area a side post, nearest first.
    @Test func lookingBackUpReadsOneAreaTopToBottom() throws {
        let s = plan(DemoStress.full, step: 6, standing: "Health")
        #expect(s.standing == area("Health").id)
        for wing in wings {
            let layout = ruled(s, wing: wing)
            let pill = try #require(layout.standingLabel)
            #expect(pill.frame.minY == 110 && pill.name == "Health" && pill.caret == CGRect(x: 190, y: 101, width: 10, height: 7))
            let cloths = layout.banners
            #expect(layout.posts.count == 1 && cloths.allSatisfy { $0.kind == .compact }, "wing \(wing)")
            #expect(cloths.map(\.level) == [.year, .season, .month, .week, .today], "wing \(wing)")
            #expect(cloths.first.map { $0.frame.minY == pill.frame.maxY + 6 } == true)
            for (a, b) in zip(cloths, cloths.dropFirst()) { #expect(near(b.frame.minY - a.frame.maxY, 8, 0.001), "\(a.id), \(b.id)") }
            let width = WalkLayout.standingWidth(wing: wing)
            for c in cloths { #expect(near(c.frame.midX, 195, 0.001) && near(c.frame.width, width, 0.001), "wing \(wing): \(c.frame)") }
            if wing == 0 { #expect(cloths.allSatisfy { $0.frame.minX == 120 && $0.frame.maxX == 270 }) }
            // Every cloth is Health's own; the others are the side posts, all at the right of Health, nearest first.
            #expect(cloths.allSatisfy { s.item($0.itemId).map { s.column(of: $0) } == s.standing })
            #expect(layout.sides.map(\.name) == ["Home", "People", "Work", "Money"])
            #expect(Invariants.check(layout, s, wing: wing, touch: wing == 0 ? 44 : 55.7).isEmpty)
        }
    }

    /// Each cloth shows its level's newest flag and stands for the rest ("+n more" on its own line):
    /// Health holds four year goals, so the year cloth is the newest and three more. Today's cloth is
    /// the newest of the tasks dated today; Week's is the newest that Today's cloth does not show.
    /// A level holding one flag carries no count. A cloth's tap opens its level's paper (F21).
    @Test func theNewestCarriesTheCountOfTheRest() throws {
        let s = plan(DemoStress.full, step: 6, standing: "Health")
        let layout = ruled(s)
        let health = area("Health").id
        func held(_ level: WalkLevel) -> [WalkItem] { s.items(on: level).filter { $0.areaId == health } }
        func cloth(_ level: WalkLevel) throws -> WalkLayout.Banner { try #require(layout.banners.first { $0.level == level }) }
        #expect(held(.year).count == 4)
        let year = try cloth(.year)
        #expect(year.itemId == held(.year).last?.id && year.more == 3 && year.text == "Cook at home on weeknights")
        #expect(year.label == "Year: Cook at home on weeknights, and 3 more, tap to read the list")
        #expect(try cloth(.season).more == 2 && cloth(.month).more == 3)
        let tasks = held(.week)
        #expect(tasks.map(\.title) == ["Tour the gym on Main Street", "Lay out running clothes"])
        #expect(try cloth(.today).itemId == tasks[1].id && cloth(.today).more == 1)
        #expect(try cloth(.week).itemId == tasks[0].id && cloth(.week).more == 1)
        for c in layout.banners { #expect(c.taps && WalkLayout.tapEvent(c, on: layout.posts[0]) == .lookBackPaper(c.level)) }
        // One flag on a level: no count, and the label says only what a tap does.
        let lone = flag(.year, "Run a 10k", in: "Home")
        let one = try #require(ruled(state(6, kept: ["Home"], items: [lone])).banners.first)
        // P36: a bare one-line cloth is padded to 36, its words centred.
        #expect(one.more == nil && one.frame.height == 36 && one.label == "Year: Run a 10k, tap to read the list")
        #expect(WalkLayout.lookBackWordsTop(one) == 4 + CGFloat(36 - 23) / 2)
    }

    /// A quick walk plants one chain in one area: looking back up reads it top to bottom, with no
    /// side post (the other kept areas hold nothing), no hint, and no count on any cloth.
    @Test func aQuickWalksLookBackIsOneChainAndNoPosts() {
        let year = flag(.year, "Sign one more contract", in: "Work")
        let season = flag(.season, "Pitch three new clients", in: "Work", parent: year.id)
        let month = flag(.month, "Make 10 sales calls", in: "Work", parent: season.id)
        let week = flag(.week, "Call the first three leads", in: "Work", parent: month.id, day: today)
        let s = state(6, kept: ["Health", "Home", "Work"], items: [year, season, month, week])
        #expect(s.standing == area("Work").id)
        let layout = ruled(s)
        #expect(layout.sides.isEmpty && layout.lookBackHint == nil)
        #expect(layout.banners.map(\.level) == [.year, .season, .month, .week, .today])
        #expect(layout.banners.map(\.itemId) == [year.id, season.id, month.id, week.id, week.id])
        #expect(layout.banners.allSatisfy { $0.more == nil && $0.kind == .compact })
        #expect(Invariants.check(layout, s).isEmpty)
    }

    /// Task 10 (item 18): looking back up, Today's cloth is the first thing where it is one of today's, else
    /// the newest of today's; `Invariants.lookBack` holds it to that (the generated plans hold one task dated
    /// today an area, so this case is written by hand).
    @Test func lookingBackTodaysClothIsTheFirstThing() {
        let first = flag(.week, "Call the plumber", in: "Health", day: today)
        let newer = flag(.week, "Stretch for ten minutes", in: "Health", day: today)
        var s = state(6, kept: ["Health"], items: [first, newer], standing: "Health")
        s.firstThing = first.id
        let layout = ruled(s.settled)
        #expect(layout.banners.first { $0.level == .today }?.itemId == first.id)
        #expect(Invariants.check(layout, s.settled).isEmpty, "\(Invariants.check(layout, s.settled))")
        s.firstThing = nil
        #expect(ruled(s.settled).banners.first { $0.level == .today }?.itemId == newer.id)
    }

    /// While the ending sheet or a cloth's paper is raised over the mountain nothing stands on it (the
    /// area's pill would peek over the sheet's top at 130, the paper's at 116): no post, no name, no side
    /// post, no hint. Lowered, all of it again.
    @Test func theRaisedSheetCoversTheMountain() {
        let env = WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today)
        var s = plan(DemoStress.full, step: 6, standing: "Health")
        s.sheetOpen = true
        #expect(s.sheetRaised)
        let raised = ruled(s)
        #expect(raised.posts.isEmpty && raised.labels.isEmpty && raised.sides.isEmpty && raised.lookBackHint == nil)
        s.sheetOpen = false
        #expect(ruled(s).posts.count == 1 && ruled(s).lookBackHint != nil)
        _ = s.apply(.lookBackPaper(.month), env)
        #expect(s.paperOpen && ruled(s).posts.isEmpty && ruled(s).labels.isEmpty && ruled(s).sides.isEmpty)
        _ = s.apply(.paperClosed, env)
        #expect(ruled(s).posts.count == 1)
    }

    /// P36, P37: the tallest Look back up stack (five cloths of three lines, each with "+n more": 63 high,
    /// 8 apart) still ends above the foot, 24 or more over it, and above the ending sheet; each cloth's touch
    /// frame is at least its own height, on every wing and both footings.
    @Test func theTallestLookBackStillEndsAboveItsFoot() throws {
        let long = String(String(repeating: "Walk more every day. ", count: 10).prefix(200))
        var items: [WalkItem] = []
        for level in [WalkLevel.year, .season, .month] { for n in 1...2 { items.append(flag(level, "\(long) \(n)", in: "Health")) } }
        for n in 1...2 { items.append(flag(.week, "\(long) \(n)", in: "Health", day: today)) }
        let s = state(6, kept: ["Health", "Home"], items: items + [flag(.year, "Run a 10k", in: "Home")], standing: "Health")
        for wing in wings { for footing in [WalkFooting.level, .natural] {
            let layout = WalkLayout.make(s, today: today, footing: footing, wing: wing)
            let post = try #require(layout.posts.first)
            #expect(post.banners.count == 5 && post.banners.allSatisfy { $0.lines == 3 && $0.more == 1 && $0.frame.height == 63 })
            let lowest = try #require(post.banners.last)
            #expect(post.base.y - lowest.drawn.maxY >= 24 - 0.01 && lowest.drawn.maxY <= WalkLayout.lookBackFoot, "wing \(wing) \(footing)")
            #expect(layout.touchFrames(post, touch: 44).allSatisfy { $0.height >= 63 }, "wing \(wing) \(footing)")
            #expect(Invariants.check(layout, s, wing: wing, touch: wing == 0 ? 44 : 55.7).isEmpty, "wing \(wing) \(footing)")
        } }
    }

    /// The hint under the header ("Tap a post to see that area") stands only while other areas stand
    /// at the side, in the reading column 20 in, 84 to 100; nothing on the mountain meets it. The nameless
    /// post alone (only read here) brings no hint.
    @Test func theHintStandsUnderTheHeaderWhileThereArePosts() {
        let s = plan(DemoStress.full, step: 6, standing: "Health")
        #expect(ruled(s).lookBackHint == CGRect(x: 20, y: 84, width: 350, height: 16))
        let column = WalkLayout.column(wing: 110.3)
        #expect(ruled(s, wing: 110.3).lookBackHint == CGRect(x: column.lowerBound + 20, y: 84, width: column.upperBound - column.lowerBound - 40, height: 16))
        for step in 1...5 { #expect(ruled(plan(DemoStress.full, step: step, standing: "Health")).lookBackHint == nil) }
        let alone = state(6, kept: ["Home"], items: [flag(.year, "Run a 10k", in: "Home")])
        #expect(ruled(alone).lookBackHint == nil)
        let loose = state(6, kept: ["Home"], items: [flag(.year, "Run a 10k", in: "Home"), flag(.year, "No area yet")])
        #expect(ruled(loose).sides.map(\.area) == [nil] && ruled(loose).lookBackHint == nil)
        #expect(ruled(loose).sides.first.map { WalkLayout.tapEvent($0) } == .some(nil))
    }

    /// F20: a Look back up cloth holds its newest title on up to three lines at its width (DM Sans
    /// SemiBold 12, 6 either side), the lines the layout broke (F39), and "+n more" on a line of its
    /// own (14); it is `23 + 13 × (lines − 1)` high, and 14 more with the count. The long plan, standing
    /// in each of its areas in turn, on every wing; nothing below 700.
    @Test func aLookBackClothHoldsAFortyFourLetterTitle() {
        var checked = 0, threeLines = 0
        for standing in ["Health", "Home", longName] {
            let s = plan(DemoStress.long, step: 6, standing: standing)
            #expect(s.area(s.standing)?.name == standing)
            for wing in wings {
                let layout = ruled(s, wing: wing)
                let width = WalkLayout.standingWidth(wing: wing)
                #expect(!layout.banners.isEmpty)
                for b in layout.banners {
                    let words = WalkLayout.setLines(b.text, face: .lookBack, width: width - WalkLayout.Face.lookBack.inset, limit: 3)
                    #expect(b.words == words && b.lines == words.count, "\(standing), wing \(wing): \(b.text)")
                    #expect(b.lines == min(3, WalkLayout.lines(for: b.text, width: width, face: .lookBack)))
                    #expect(b.frame.height == max(36, 23 + 13 * CGFloat(b.lines - 1) + (b.more == nil ? 0 : 14)))
                    #expect(b.frame.maxY <= WalkLayout.lookBackFoot)
                    if b.lines == 3 { threeLines += 1 }
                    checked += 1
                }
                #expect(Invariants.check(layout, s, wing: wing, touch: wing == 0 ? 44 : 55.7).isEmpty, "\(standing), wing \(wing)")
            }
        }
        #expect(checked > 40 && threeLines > 0, "\(checked) cloths, \(threeLines) on three lines")
    }

    /// Nothing sits under the ending sheet (it peeks at 716): over every generated Look back up, on
    /// every wing and both footings, every frame the layout makes and every cloth's touch frame ends at
    /// or above 700.
    @Test func nothingSitsUnderTheEndingSheet() {
        let states = Generated.all.filter { $0.step == 6 }
        var checked = 0
        for wing in wings { for footing in [WalkFooting.natural, .level] {
            let touch: CGFloat = wing == 0 ? 44 : 55.7
            for s in states {
                let layout = WalkLayout.make(s, today: today, footing: footing, wing: wing)
                let frames = Invariants.everything(layout).map(\.1) + layout.posts.flatMap { layout.touchFrames($0, touch: touch) }
                    + layout.sides.map { $0.touchFrame(touch: touch) }
                for f in frames where f.maxY > WalkLayout.lookBackFoot + 0.01 {
                    Issue.record("\(footing), wing \(wing), \(Generated.describe(s)): \(f) ends at \(f.maxY)")
                    return
                }
                checked += 1
            }
        } }
        #expect(checked > 2000)
    }

    /// The generated Look back ups (every count of areas, loose flags, flags a post, each standing
    /// area) keep every guarantee, cloths and all, on every wing, ruled and by hand.
    @Test func theGeneratedLookBacksKeepEveryGuarantee() {
        let states = Generated.all.filter { $0.step == 6 }
        var withCloths = 0, withSides = 0
        for wing in wings { for footing in [WalkFooting.natural, .level] {
            for s in states {
                let layout = WalkLayout.make(s, today: today, footing: footing, wing: wing)
                let problems = Invariants.check(layout, s, wing: wing, touch: wing == 0 ? 44 : 55.7)
                if !problems.isEmpty { Issue.record("\(footing), wing \(wing), \(Generated.describe(s)): \(problems.prefix(3))"); return }
                if !layout.banners.isEmpty { withCloths += 1 }
                if !layout.sides.isEmpty { withSides += 1 }
            }
        } }
        #expect(states.count > 300 && withCloths > 2000 && withSides > 1000, "\(states.count) states, \(withCloths) with cloths, \(withSides) with sides")
    }

    /// A tap on a side post looking back up stands the walk in that area: its cloths come to the
    /// middle, and the area stood in before becomes a side post. A side post says how many goals and
    /// tasks stand in its area, with a pennant for each (at most four, year first, each in its
    /// level's colour; with more, three and "+n").
    @Test func tappingAPostOnTheLookBackWalksThere() throws {
        var s = plan(DemoStress.full, step: 6, standing: "Health")
        let people = try #require(ruled(s).sides.first { $0.name == "People" })
        let peopleId = area("People").id
        let goals = s.items.filter { $0.areaId == peopleId && $0.level != .week }.count
        let tasks = s.items.filter { $0.areaId == peopleId && $0.level == .week }.count
        #expect(people.count == goals + tasks && people.label == "People, \(goals + tasks) goals and tasks")
        #expect(people.pennants.count == 3 && people.extra == goals + tasks - 3 && people.pennants.allSatisfy { $0.level == .year })
        #expect(WalkLayout.tapEvent(people) == .areaTapped(peopleId))
        let env = WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today)
        #expect(s.apply(.areaTapped(peopleId), env) == [.save])
        #expect(s.standing == peopleId)
        let after = ruled(s)
        #expect(after.standingLabel?.name == "People" && after.banners.first?.text == "Host one big family dinner")
        #expect(after.sides.map(\.name) == ["Home", "Health", "Work", "Money"])
        // A side with one flag on each level: a pennant each, year first.
        let year = flag(.year, "Run a 10k", in: "Health")
        let chain = [flag(.year, "Sign one more contract", in: "Work")]
        let season = flag(.season, "Pitch three new clients", in: "Work", parent: chain[0].id)
        let month = flag(.month, "Make 10 sales calls", in: "Work", parent: season.id)
        let week = flag(.week, "Call the first three leads", in: "Work", parent: month.id)
        let work = try #require(ruled(state(6, kept: ["Health", "Work"], items: [year] + chain + [season, month, week], standing: "Health")).sides.first)
        #expect(work.pennants.map(\.level) == [.year, .season, .month, .week] && work.extra == 0)
        #expect(work.label == "Work, 4 goals and tasks")
    }

    /// The count on a cloth and its paper agree (F21): the paper a cloth opens reads exactly the
    /// standing area's flags on that level that the cloth counts (the one shown and "+n more"), and
    /// every other kept area with a flag there, in ridge order. The full and long plans, standing in
    /// each of their areas.
    @Test func aClothsCountIsItsPapersSection() {
        let env = WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today)
        var checked = 0
        for (stress, areas) in [(DemoStress.full, DemoStress.full.areas), (DemoStress.long, DemoStress.long.areas)] {
            for standing in areas {
                let s = plan(stress, step: 6, standing: standing)
                let layout = ruled(s)
                for cloth in layout.banners {
                    var open = s
                    _ = open.apply(.lookBackPaper(cloth.level), env)
                    guard let paper = open.paper(env.periods) else { Issue.record("\(standing) \(cloth.level): no paper"); continue }
                    let here = paper.sections.first { $0.area == s.standing }
                    #expect(here?.rows.count == (cloth.more ?? 0) + 1, "\(standing) \(cloth.level)")
                    #expect(here?.rows.contains { $0.id == cloth.itemId } == true, "\(standing) \(cloth.level)")
                    #expect(paper.title == WalkCopy.paperTitle(cloth.level, env.periods))
                    let level: WalkLevel = cloth.level
                    let holding = s.keptAreas.filter { a in
                        s.items.contains { $0.areaId == a.id && (level == .today ? $0.level == .week && PlanCalendar.sameDay($0.day, today) : $0.level == level) }
                    }
                    #expect(paper.sections.compactMap(\.area) == holding.map(\.id), "\(standing) \(cloth.level)")
                    checked += 1
                }
            }
        }
        #expect(checked > 25)
    }

    /// Each cloth on a post takes a tap in a frame of its own (`Post.touchFrames(touch:)`), over every
    /// generated state on each wing, ruled and planted by hand (the app's footing): it holds the cloth as
    /// drawn; it is at least a touch high where its neighbours and the post's foot leave room, and
    /// otherwise reaches the middle of the gap to each neighbour; it never reaches below the post's foot;
    /// no two overlap, none covers another cloth's centre, none meets a side post or a side post's touch
    /// frame, nor a control (the Move row, the hint, Next, the Undo pill, the lesson, the light's ring), past the cloth itself.
    /// Looking back up (P36) every cloth's is at least 44 high. Prints the smallest, by footing.
    @Test(arguments: [WalkFooting.natural, .level]) func aClothsTouchFrameIsItsOwn(_ footing: WalkFooting) {
        let ring = CGRect(x: WalkOrb.centre.x - 66, y: WalkOrb.centre.y - 66, width: 132, height: 132)
        var smallest: (height: CGFloat, at: String) = (.infinity, ""), smallestBack: (height: CGFloat, at: String) = (.infinity, "")
        var frames = 0
        for wing in wings {
            let touch: CGFloat = wing == 0 ? 44 : 55.7
            let states = Generated.all
            let layouts = footing == .level ? Generated.level(wing: wing)
                : (wing == 0 ? Generated.naturalLayouts : Generated.parallel(states.count) { WalkLayout.make(states[$0], today: today, footing: .natural, wing: wing) })
            for (s, layout) in zip(states, layouts) {
                let controls = [("Move row", layout.moveRow), ("hint", layout.hintLine), ("Next", layout.nextLine),
                                ("Undo", layout.undoPill), ("lesson", layout.lesson), ("light", (1...5).contains(s.step) ? ring : nil)]
                    .compactMap { name, frame in frame.map { (name, $0) } }
                    + layout.sides.map { ("\($0.name)'s touch frame", $0.touchFrame(touch: touch)) }
                for post in layout.posts {
                    let touchFrames = layout.touchFrames(post, touch: touch)
                    guard touchFrames.count == post.banners.count else { Issue.record("\(touchFrames.count) frames for \(post.banners.count)"); return }
                    let drawn = post.banners.map(\.drawn)
                    for (i, frame) in touchFrames.enumerated() {
                        frames += 1
                        let box = drawn[i]
                        let at = "\(footing), wing \(wing), \(Generated.describe(s))"
                        if !frame.insetBy(dx: -0.01, dy: -0.01).contains(box) { Issue.record("\(at): \(frame) does not hold \(box)"); return }
                        if frame.width < min(touch, box.width) - 0.01 { Issue.record("\(at): \(frame) narrower than a touch") }
                        if frame.maxY > post.base.y + 0.01 { Issue.record("\(at): \(frame) reaches below the foot \(post.base.y)"); return }
                        let above = drawn.filter { $0.maxY <= box.minY + 0.01 }.map(\.maxY).max()
                        let below = drawn.filter { $0.minY >= box.maxY - 0.01 }.map(\.minY).min()
                        // What else stands across from the cloth above or below it bounds it too (a side post's touch, a control).
                        let across = controls.map(\.1).filter { $0.minX < box.maxX && box.minX < $0.maxX }
                        let room = min(below.map { ($0 + box.maxY) / 2 } ?? .infinity, post.base.y,
                                       across.map { $0.minY >= box.maxY ? $0.minY : ($0.maxY > box.maxY ? box.maxY : .infinity) }.min() ?? .infinity)
                            - max(above.map { ($0 + box.minY) / 2 } ?? -.infinity,
                                  across.map { $0.maxY <= box.minY ? $0.maxY : ($0.minY < box.minY ? box.minY : -.infinity) }.max() ?? -.infinity)
                        if frame.height < min(touch, room) - 0.01 { Issue.record("\(at): \(frame) is short of \(min(touch, room))"); return }
                        if s.step == 6, frame.height < 44 - 0.01 { Issue.record("\(at): a Look back up cloth's touch \(frame) is under 44"); return }
                        for (j, other) in drawn.enumerated() where j != i && frame.contains(CGPoint(x: other.midX, y: other.midY)) {
                            Issue.record("\(at): \(frame) covers a neighbour's centre"); return
                        }
                        for (j, other) in touchFrames.enumerated() where j > i && Invariants.overlap(frame, other) {
                            Issue.record("\(at): \(frame) meets \(other)"); return
                        }
                        for side in layout.sides { for b in side.boxes where Invariants.overlap(frame, b) {
                            Issue.record("\(at): \(frame) meets \(side.name)'s \(b)"); return
                        } }
                        // A control's touch shape may meet only the cloth itself (a leaning cloth beside a side
                        // post's pill), never what the cloth's touch frame grows past it.
                        for (name, control) in controls where Invariants.overlap(frame, control) {
                            let met = frame.intersection(control)
                            if met.minY < box.minY - 0.01 || met.maxY > box.maxY + 0.01 {
                                Issue.record("\(at): \(frame) meets the \(name) \(control) past the cloth \(box)"); return
                            }
                        }
                        let what = "\(post.banners[i].kind) on step \(s.step), wing \(wing), \(post.banners[i].lines) lines"
                        if frame.height < smallest.height { smallest = (frame.height, what) }
                        if s.step == 6, frame.height < smallestBack.height { smallestBack = (frame.height, what) }
                    }
                }
            }
        }
        #expect(frames > 20_000)
        print("Cloth touch frames, \(footing): \(frames); smallest \(smallest.height) (\(smallest.at)); looking back up \(smallestBack.height) (\(smallestBack.at))")
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
                // By the face's own capitals (Task 10): FAMILY 54, GARDEN at the cap, 58; they stand exactly 1 apart.
                #expect(pills[0].width == ceil(WalkLayout.textWidth("FAMILY", face: .sidePill) + WalkLayout.sidePillInset) && pills[1].width == 58)
                #expect(near(pills[0].minX - pills[1].maxX, 1, 0.01) && near(pills[2].minX - pills[3].maxX, 1, 0.01))
            }
            #expect(pills.allSatisfy { $0.width <= cap })
            // Right: Friends (inner low), Reading (outer low), Studio (inner high, alone in its row).
            #expect(layout.sides[6].name == "Studio"
                    && (wing > 0 || pills[6].width == ceil(WalkLayout.textWidth("STUDIO", face: .sidePill) + WalkLayout.sidePillInset)))
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
            #expect(words.showsWhy && words.questionLines.count <= WalkLayout.questionMaxLines, "step \(step): \(words)")
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
                    let withWhy = WalkLayout.wordsFoot(questionSize: words.questionSize, questionLines: words.questionLines.count,
                                                       whyLines: WalkLayout.whyLines(WalkCopy.why(s, p), wing: wing))
                    #expect(withWhy > WalkLayout.wordsFootLimit, "step \(step), wing \(wing): the why line went with room for it")
                }
            }
        }
    }

    /// An ordinary goal of 42 letters keeps the why line under its question on every step that quotes
    /// it: on the Season step its question takes four lines at 32 and three at 28 (TextKit, the
    /// iPhone 17's 334), so the block ends by 278 with the why line. (The old estimate counted four
    /// at 28, its m and w double, and lost the why line.)
    @Test func anOrdinaryGoalKeepsItsWhyLine() {
        let p = WalkPeriods.pick(now: today, weekStartsOn: 0)
        for title in ["Sleep seven hours on most weeknights again"] {
            for step in 2...5 {
                let words = WalkLayout.words(quoting(title, step: step), p, wing: 0)
                #expect(words.showsWhy, "step \(step), “\(title)”: \(words)")
                #expect(words.question == WalkCopy.question(quoting(title, step: step), p), "step \(step): the quote was cut")
            }
        }
    }

    /// The last resort (P20): a goal of 56 letters so wide that its question, at the smaller size and
    /// with no why line, would still end below 278 has its quote cut at a word so the block fits.
    /// The question says less; its flag and the paper still carry the goal whole.
    @Test func aGoalTooWideForTheBlockIsCutAtAWord() throws {
        let p = WalkPeriods.pick(now: today, weekStartsOn: 0)
        let wide = "MMMMMMM WWWWWWW MMMMMMM WWWWWWW MMMMMMM WWWWWWW MMMMMMMM"
        #expect(wide.count == 56)
        for step in 2...5 {
            let s = quoting(wide, step: step)
            let whole = WalkCopy.question(s, p)
            #expect(whole.contains(wide))
            let uncut = WalkLayout.words(question: whole, why: WalkCopy.why(s, p), wing: 0)
            #expect(uncut.foot > WalkLayout.wordsFootLimit, "step \(step): the contrived goal fits uncut (\(uncut))")
            let words = WalkLayout.words(s, p, wing: 0)
            #expect(words.foot <= WalkLayout.wordsFootLimit, "step \(step): \(words)")
            #expect(!words.showsWhy && words.questionSize == WalkLayout.questionSmallSize, "step \(step): \(words)")
            // Cut at a word: what is quoted is the goal's first words, then the ellipsis.
            let quoted = try #require(words.question.split(separator: "“").last?.split(separator: "”").first.map(String.init))
            #expect(quoted.hasSuffix("…") && quoted.count < wide.count, "step \(step): \(quoted)")
            let kept = String(quoted.dropLast())
            #expect(wide.hasPrefix(kept + " "), "step \(step): not cut at a word: \(quoted)")
            // The flag carries the goal whole.
            let layout = ruled(s)
            #expect(layout.banners(.parent).first?.label.contains(wide) == true)
        }
    }

    #if canImport(UIKit)
    /// The why line's face (DM Sans Regular 15): every character and every pair of them the core knows is
    /// set no wider than it is counted (`whyWidth`), so a why line the core breaks never runs past its room.
    @Test @MainActor func noWhyPairIsSetWiderThanItIsCounted() throws {
        var characters: [Character] = (32...126).map { Character(UnicodeScalar($0)!) }
        characters += WalkLayout.whyOtherWidths.keys.sorted()
        characters += (0xC0...0x17F).compactMap { UnicodeScalar($0) }.filter { $0.properties.isAlphabetic }.map { Character($0) }
            .filter { !WalkLayout.whyOtherWidths.keys.contains($0) }
        let font = try #require(UIFont(name: "DMSans-Regular", size: WalkLayout.whySize), "the bundled face is not there")
        var wider: [String] = []
        for a in characters {
            let alone = String(a)
            if Self.setWidth(alone, font: font) > WalkLayout.whyWidth(alone) + 0.001 { wider.append("“\(alone)”") }
            for b in characters {
                let pair = String([a, b])
                let set = Self.setWidth(pair, font: font), counted = WalkLayout.whyWidth(pair)
                if set > counted + 0.001 { wider.append("“\(pair)” set \(set), counted \(counted)") }
            }
        }
        #expect(wider.isEmpty, "\(wider.count) set wider than counted: \(wider.prefix(12))")
    }

    /// Titles a person may give a flag that the why line's note quotes: long, all capitals, CJK, emoji.
    static let noteTitles = [
        "Write the first chapter of the memoir I keep putting off now",
        String(repeating: "W", count: 60),
        "WALK THE DOG BEFORE WORK EVERY SINGLE MORNING",
        "毎朝ジョギングをして健康的な生活を続ける目標を立てる今年こそ必ず",
        "🏃‍♀️🏃‍♀️🏃‍♀️ Run with the club 👨‍👩‍👧‍👦👨‍👩‍👧‍👦 every Sunday 🎉🎉🎉🎉",
        String(repeating: "x", count: 60),
    ]

    /// Fix round 2 (3, F39): the chosen note's lines are broken by the core with DM Sans Regular's own widths
    /// and drawn as given; set for real (CoreText, kerned) each fits the block's room, on every window.
    @Test @MainActor func theChosenNotesLinesFitTheirRoom() throws {
        let font = try #require(UIFont(name: "DMSans-Regular", size: WalkLayout.whySize))
        var lines = 0
        for title in Self.noteTitles {
            for canMove in [true, false] {
                let note = WalkCopy.chosenNote(title, canMove: canMove)
                for wing in wings {
                    let room = WalkLayout.wordsWidth(wing: wing)
                    for line in WalkLayout.whySetLines(note, wing: wing, limit: .max) {
                        #expect(Self.setWidth(line, font: font) <= room + 0.001, "“\(line)” at \(room)")
                        lines += 1
                    }
                }
            }
        }
        #expect(lines > 50)
    }

    /// Fix round 2 (3): with a flag chosen off its post (its title one of `noteTitles`), the words block on
    /// every generated step and every window still ends above the flags: the note is cut to the lines the
    /// block holds, never pushed past them. The block's height is the lines it draws: each line the layout
    /// gives, set for real, fits the block's room (so the view sets exactly these), and they are the count.
    @Test @MainActor func theChosenNoteNeverPassesTheFlags() throws {
        let p = WalkPeriods.pick(now: today, weekStartsOn: 0)
        let font = try #require(UIFont(name: "DMSans-Regular", size: WalkLayout.whySize))
        var measured: [String: CGFloat] = [:]
        func set(_ line: String) -> CGFloat {
            if let known = measured[line] { return known }
            let width = Self.setWidth(line, font: font)
            measured[line] = width
            return width
        }
        var checked = 0, noted = 0
        var problems: [String] = []
        for base in Generated.all where !base.ground {
            guard let level = base.level else { continue }
            let own: WalkLevel = level == .today ? .week : level
            guard let other = base.items.firstIndex(where: { $0.level == own && base.column(of: $0) != base.standing }) else { continue }
            for title in Self.noteTitles {
                var s = base
                s.items[other].title = title
                s.selected = s.items[other].id
                guard WalkLayout.unseenChoice(s) != nil else { continue }
                for wing in wings {
                    let words = WalkLayout.words(s, p, wing: wing)
                    if words.foot > WalkLayout.wordsFootLimit + 0.01 {
                        problems.append("\(Generated.describe(s)) wing \(wing): foot \(words.foot)")
                    }
                    if words.why.count != words.whyLines {
                        problems.append("\(Generated.describe(s)) wing \(wing): \(words.whyLines) lines counted, \(words.why.count) given")
                    }
                    for line in words.why where set(line) > WalkLayout.wordsWidth(wing: wing) + 0.001 {
                        problems.append("\(Generated.describe(s)) wing \(wing): “\(line)” is set wider than the block")
                    }
                    if words.showsWhy { noted += 1 }
                    checked += 1
                }
            }
        }
        #expect(problems.isEmpty, "\(problems.count): \(problems.prefix(4))")
        #expect(checked > 1000 && noted > 500, "checked \(checked), noted \(noted)")
    }

    /// The question's widths, made structural as the cloths' are: every character of Crimson Pro's table
    /// (`questionGlyphWidths`, `questionOtherWidths`) alone and in every ordered pair, set by the bundled
    /// face at 32 and at 28 points with its own kerning (no `.kern` attribute: a zero there turns the
    /// kerning off), is never wider than `questionWidth` counts it.
    @Test @MainActor func noQuestionPairIsSetWiderThanItIsCounted() throws {
        var characters: [Character] = (32...126).map { Character(UnicodeScalar($0)!) }
        characters += WalkLayout.questionOtherWidths.keys.sorted()
        var wider: [String] = []
        var pairs = 0
        for size in [WalkLayout.questionSize, WalkLayout.questionSmallSize] {
            let font = try #require(UIFont(name: "CrimsonPro-Regular", size: size), "the bundled face is not there")
            for a in characters {
                let alone = String(a)
                if Self.setWidth(alone, font: font) > WalkLayout.questionWidth(alone, size: size) + 0.001 { wider.append("\(size) “\(alone)”") }
                for b in characters {
                    let pair = String([a, b])
                    let set = Self.setWidth(pair, font: font), counted = WalkLayout.questionWidth(pair, size: size)
                    if set > counted + 0.001 { wider.append("\(size) “\(pair)” set \(set), counted \(counted)") }
                    pairs += 1
                }
            }
        }
        #expect(wider.isEmpty, "\(wider.count) set wider than counted: \(wider.prefix(12))")
        print("The question's pairs: \(characters.count) characters, \(pairs) ordered pairs at two sizes; set wider than counted: \(wider.count)")
    }

    #endif

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

    #if canImport(UIKit)
    /// Task 10 (A20): Next's 280 cap holds: over every generated state, Next's words in DM Sans SemiBold 17,
    /// its arrow and its padding (30 + 8 + 17 + 26 on the gold button; 28 either side when it skips) fit
    /// the frame's 280, so the button drawn at its own size never runs wider than its frame.
    @Test @MainActor func nextNeverRunsPastItsCap() throws {
        let font = try #require(UIFont(name: "DMSans-SemiBold", size: 17)), skipFont = try #require(UIFont(name: "DMSans-SemiBold", size: 16))
        let periods = WalkPeriods.pick(now: today)
        var widest: CGFloat = 0
        for s in Generated.all where (1...5).contains(s.step) {
            guard let frame = WalkLayout.nextFrame(s), let line = WalkCopy.nextLine(s, periods) else { continue }
            let words = (line.text as NSString).size(withAttributes: [.font: line.skip ? skipFont : font]).width
            let across = line.skip ? words + 56 : words + 30 + 8 + 17 + 26
            widest = max(widest, across)
            #expect(across <= frame.width, "\(Generated.describe(s)): “\(line.text)” \(across)")
        }
        #expect(widest > 160)
    }
    #endif

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

    /// Task 10 (A3, F8): the foot's shade stands under the controls on steps 1 to 6 and never on Welcome,
    /// where Next is its glowing line under the light (the view asks the layout, not the step).
    @Test func welcomeHasNoFootShade() {
        #expect(WalkLayout.footShadeTop(WalkState()) == nil)
        #expect(WalkLayout.nextIsWelcomeLine(WalkState()))
        for step in 1...6 {
            #expect(WalkLayout.footShadeTop(state(step)) == 560, "step \(step)")
            #expect(!WalkLayout.nextIsWelcomeLine(state(step)), "step \(step)")
        }
    }

    /// Task 10 (A20): with no other kept area to move a chosen flag to, the Move row has no chips; Remove
    /// keeps its place.
    @Test func noChipsWithNowhereToMove() {
        let goal = flag(.year, "Run a 5K", in: "Health")
        var s = state(1, kept: ["Health"], items: [goal], standing: "Health")
        _ = s.select(goal.id)
        #expect(s.selected == goal.id && s.moveTargets.isEmpty)
        #expect(WalkLayout.moveChipsFrame(s) == nil)
        #expect(WalkLayout.removeFrame(s) == CGRect(x: 290, y: 558, width: 90, height: 38))
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
        out += manyGoalsAbove()
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
                      for twoGoals in skipped ? [false] : [false, true] {
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
                            // Two goals on the walked line at each level, each with its own below (D2).
                            if twoGoals {
                                let season2 = item(.season, 4, home, walked.id), month2 = item(.month, 5, home, season2.id)
                                let month3 = item(.month, 0, home, season.id)
                                items += [season2, month2, month3, item(.week, 2, home, month2.id), item(.week, 3, home, above)]
                            }
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
        }
        return out
    }

    /// F40 with flags drawn (Task 10, D2): on Season, Month and Week, the step's flags hung under the area's
    /// NEWEST goal above (the one the walk settles on), or spread across all its goals above, so a goal
    /// above that is one of several stands over flags, "+n more", examples and a chosen flag.
    static func manyGoalsAbove() -> [WalkState] {
        var out: [WalkState] = []
        for step in 2...4 {
            for keptCount in [1, 3, 8] {
                for perPost in [3, 5, 7] {
                    for variant in 0..<4 {
                        for hang in [Hang.newest, .spread] {
                            out.append(make(step: step, keptCount: keptCount, loose: keptCount == 3, perPost: perPost,
                                            variant: variant, standing: 0, hang: hang))
                        }
                    }
                }
            }
        }
        return out
    }

    /// Which goal above of its area each flag hangs under: the first planted (the sweep's own), the newest
    /// (where the walk settles), or each in turn.
    enum Hang { case first, newest, spread }

    /// `standing`: the index of the kept area the walk is asked to stand in (it settles where it can).
    /// `variant`: 0 plain; 1 a flag chosen (the oldest of the walk's own on the standing post); 2 examples
    /// on; 3 both.
    static func make(step: Int, keptCount: Int, loose: Bool, perPost: Int, variant: Int, standing: Int,
                     hang: Hang = .first) -> WalkState {
        var s = WalkState()
        s.areas = ridge
        s.kept = ridge.prefix(keptCount).map(\.id)
        s.step = step
        s.depth = .quick
        let columns: [UUID?] = s.kept.map { Optional($0) } + (loose ? [nil] : [])
        let stood: UUID? = keptCount > 0 ? s.kept[min(standing, keptCount - 1)] : nil
        var n = 0
        var above: [UUID?: [WalkItem]] = [:]
        for raw in 1...min(step, 4) {
            let level = WalkLevel(rawValue: raw)!
            var planted: [UUID?: [WalkItem]] = [:]
            for (c, column) in columns.enumerated() {
                let count = column == stood ? perPost : (perPost + 3 * c + raw) % 8
                for i in 0..<count {
                    n += 1
                    let goals = above[column] ?? []
                    let parent: WalkItem? = switch hang {
                    case .first: goals.first
                    case .newest: goals.last
                    case .spread: goals.isEmpty ? nil : goals[i % goals.count]
                    }
                    let item = WalkItem(id: uid(n), level: level, title: titles[(n + c + i) % titles.count],
                                        areaId: column, parentId: parent?.id,
                                        day: level == .week && i % 2 == 0 ? day(2026, 11, 13 + i % 5) : nil, mine: i % 3 != 2)
                    s.items.append(item)
                    planted[column, default: []].append(item)
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
        if s.step == 0 || s.ground {
            if !layout.posts.isEmpty { problems.append("a post on step \(s.step) ground \(s.ground)") }
        } else if s.step == 6 {
            problems += lookBack(layout, s, wing: wing)
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
            // F40: the goal above's place in the round ("1 of 3") is a line of its own, 14 more.
            case .parent: size = CGSize(width: width - 24, height: 12 + 14 * CGFloat(b.lines) + (b.tag == nil ? 0 : 14))
            case .more: size = CGSize(width: 78, height: 22)
            case .compact: size = CGSize(width: width, height: max(36, 23 + 13 * CGFloat(b.lines - 1) + (b.more == nil ? 0 : 14)))
            }
            if !(1...3).contains(b.lines) || abs(b.frame.width - size.width) > 0.01 || abs(b.frame.height - size.height) > 0.01 {
                problems.append("\(b.id) holds \(b.lines) lines in \(b.frame)")
            }
            if case .more = b.kind {} else if b.words.count != b.lines { problems.append("\(b.id) draws \(b.words.count) lines for \(b.lines)") }
            if b.kind == .ghost, b.tag == nil { problems.append("an example without its tag") }
        }
        let full = banners.filter { $0.kind == .full }.count, above = banners.filter { $0.kind == .parent }.count
        let more = banners.filter { if case .more = $0.kind { return true }; return false }.count
        if full > 4 || above > 1 || more > 1 { problems.append("\(full) in full, \(above) above, \(more) more") }
        if full + banners.filter({ $0.kind == .ghost }).count > 4 { problems.append("more than four flags and examples") }
        // F40: on Season, Month and Week the post draws only the flags of the stop shown (the goal above's own,
        // or those under none of the area's goals), and the goal above's count line is its place in the round.
        if s.hangsByGoalAbove, (1...5).contains(s.step), !s.ground {
            let mine = Set(s.standingFlags().map(\.id))
            for b in banners where b.kind == .full {
                if let id = b.itemId, !mine.contains(id) { problems.append("F40: \(b.id) is not a flag of the stop shown") }
            }
            let stops = s.goalAboveStops()
            if let above = banners.first(where: { $0.kind == .parent }), let level = s.level {
                let at = s.focus[level].flatMap(stops.firstIndex(of:))
                let expected = stops.count > 1 ? at.map { WalkCopy.goalAboveCount($0 + 1, of: stops.count) } : nil
                if above.tag != expected { problems.append("F40: the count line \(String(describing: above.tag)), not \(String(describing: expected))") }
            }
        }
        if (1...4).contains(s.step), !s.ground, s.examplesOn.contains(s.step), !s.examplesLeft(today: today).isEmpty {
            // F36: an example always shows, and never at the cost of the person's last flag.
            if !banners.contains(where: { $0.kind == .ghost }) { problems.append("examples on, none shows") }
            if full == 0, !s.standingFlags().isEmpty {
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
        // Look back up's hint under its header: nothing meets it.
        if let hint = layout.lookBackHint {
            for (what, f) in all where overlap(hint, f) { problems.append("(c) \(what) \(f) meets the hint \(hint)") }
        }
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

    /// Look back up's shape (F6, F20): one post standing in the area the walk stands in (none, and no
    /// name, only with nothing planted); on it one `.compact` cloth for each level holding a flag there, year at the
    /// top and Today at the foot, each standing for the newest (Week: the newest Today's cloth does not
    /// show, where there is another) and carrying the count of the rest; the hint exactly while another
    /// area stands at the side (a named post: the nameless one is only read here); and every named side
    /// post an area with a flag.
    static func lookBack(_ layout: WalkLayout, _ s: WalkState, wing: CGFloat) -> [String] {
        var problems: [String] = []
        let banners = layout.posts.flatMap(\.banners)
        // Nothing planted at all: nothing stands (the sheet is up over the mountain).
        if layout.posts.count != (s.items.isEmpty ? 0 : 1) || (s.items.isEmpty && !layout.labels.isEmpty) {
            problems.append("\(layout.posts.count) posts and \(layout.labels.count) names looking back up")
        }
        let here = s.items.filter { s.column(of: $0) == s.standing }
        func held(_ level: WalkLevel) -> [WalkItem] {
            level == .today ? here.filter { $0.level == .week && PlanCalendar.sameDay($0.day, today) } : here.filter { $0.level == level }
        }
        let levels = WalkLevel.allCases.filter { !held($0).isEmpty }
        if banners.map(\.level) != levels || banners.contains(where: { $0.kind != .compact }) {
            problems.append("cloths \(banners.map(\.level)) for levels \(levels)")
        }
        // P36: 8 apart, each at least 36 high, so a cloth's pitch is never under 44.
        for (a, b) in zip(banners, banners.dropFirst()) where b.frame.minY - a.frame.maxY < 8 - 0.05 {
            problems.append("\(b.id) stands \(b.frame.minY - a.frame.maxY) under \(a.id)")
        }
        // P37: the foot at least 24 under the lowest cloth.
        if let post = layout.posts.first, let lowest = banners.last, post.base.y - lowest.drawn.maxY < 24 - 0.01 {
            problems.append("the foot \(post.base.y) is \(post.base.y - lowest.drawn.maxY) under the lowest cloth")
        }
        for b in banners {
            let flags = held(b.level)
            guard let item = flags.first(where: { $0.id == b.itemId }) else { problems.append("\(b.id) shows no flag of its level here"); continue }
            if (b.more ?? 0) != flags.count - 1 || b.more == 0 { problems.append("\(b.id): more \(String(describing: b.more)) for \(flags.count)") }
            let todays = banners.first { $0.level == .today }?.itemId
            let newest = b.level == .week ? (flags.last { $0.id != todays } ?? flags.last) : flags.last
            if b.level != .today, item.id != newest?.id { problems.append("\(b.id) is not the newest") }
            // Today's: the first thing where it is one of today's, else the newest (Task 10, item 18).
            if b.level == .today, item.id != (flags.first { $0.id == s.firstThing } ?? flags.last)?.id {
                problems.append("\(b.id) is not the first thing or the newest of today's")
            }
            if !b.taps || WalkLayout.tapEvent(b, on: layout.posts[0]) != .lookBackPaper(b.level) { problems.append("\(b.id) opens no paper") }
        }
        if (layout.lookBackHint != nil) != layout.sides.contains(where: { $0.area != nil }) {
            problems.append("the hint \(String(describing: layout.lookBackHint)) with \(layout.sides.count) sides")
        }
        for side in layout.sides {
            guard let area = side.area else { continue }
            if !s.items.contains(where: { s.column(of: $0) == area }) { problems.append("\(side.name) has nothing and stands") }
        }
        return problems
    }
}
