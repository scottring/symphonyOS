import Testing
import Foundation
import CoreGraphics
@testable import Symphony

// The posts are planted by hand (`WalkFooting.natural`): fixed by identity, small, and given only
// the room the ruled layout leaves, so it never costs the layout a guarantee (the sweep in
// `WalkLayoutTests.nothingOverlaps` measures every one of them on what is drawn, for both footings).

private let today = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 13))!

private func uid(_ n: Int) -> UUID {
    UUID(uuidString: String(format: "00000000-0000-0000-0000-%012x", n))!
}

private let names = ["Health", "Home", "People", "Work", "Money", "Fun", "Faith", "Learning"]
private let ridge = names.enumerated().map { WalkArea(id: uid(1000 + $0.offset), name: $0.element) }
private func area(_ name: String) -> UUID { ridge.first { $0.name == name }!.id }

/// Year, these areas kept, `titles` planted in `standing`, one goal in every other area.
private func year(kept: [String], standing: String, titles: [String]) -> WalkState {
    var s = WalkState()
    s.areas = ridge
    s.kept = kept.map(area)
    s.step = 1
    s.focusArea = area(standing)
    var n = 0
    for title in titles { n += 1; s.items.append(WalkItem(id: uid(5000 + n), level: .year, title: title, areaId: area(standing))) }
    for name in kept where name != standing { n += 1; s.items.append(WalkItem(id: uid(5000 + n), level: .year, title: "Goal", areaId: area(name))) }
    return s.settled
}

private func natural(_ s: WalkState, wing: CGFloat = 0) -> WalkLayout { WalkLayout.make(s, today: today, footing: .natural, wing: wing) }
private func ruled(_ s: WalkState, wing: CGFloat = 0) -> WalkLayout { WalkLayout.make(s, today: today, footing: .level, wing: wing) }

struct WalkFootingTests {

    @Test func theSameWalkLooksTheSameTwice() {
        let s = year(kept: ["Health", "Home", "People"], standing: "Home", titles: ["Run a 5K", "Sleep by ten"])
        #expect(natural(s) == natural(s))
        #expect(WalkFooting.hand("a", "tilt") == WalkFooting.hand("a", "tilt"))
        #expect(WalkFooting.hand("a", "tilt") != WalkFooting.hand("b", "tilt"))
        let hands = (0..<500).map { WalkFooting.hand("item-\($0)", "tilt") }
        #expect(hands.allSatisfy { (-1...1).contains($0) })
        #expect(hands.min()! < -0.9 && hands.max()! > 0.9)
    }

    /// Ruled, nothing leans, turns, shifts or stands off its place.
    @Test func levelIsTheBoard() {
        for (s, layout) in zip(Generated.all, Generated.levelLayouts) {
            for post in layout.posts {
                guard post.lean == 0, post.base == CGPoint(x: 195, y: 556), post.banners.allSatisfy({ $0.turn == 0 && $0.tilt == 0 && $0.shift == 0 })
                else { Issue.record("\(Generated.describe(s)): the ruled post is not ruled"); return }
                // Year to Today hang from the lowest cloth's place; Look back up from 6 under its pill at 110 (or from 110).
                if s.step == 6 {
                    let first = layout.labels.first.map { $0.frame.maxY + 6 } ?? 110
                    if let top = post.banners.first, top.frame.minY != first || layout.labels.first.map({ $0.frame.minY != 110 }) == true {
                        Issue.record("\(Generated.describe(s)): looking back up, the top cloth at \(top.frame.minY)"); return
                    }
                } else if let lowest = post.banners.last, lowest.frame.maxY != 532 { Issue.record("\(Generated.describe(s)): lowest cloth at \(lowest.frame.maxY)"); return }
            }
            guard layout.sides.allSatisfy({ $0.lean == 0 }), layout.labels.allSatisfy({ $0.footing == 0 })
            else { Issue.record("\(Generated.describe(s)): a ruled side post or chip is off its place"); return }
        }
    }

    /// With room, the hand shows: the stack stands 2 to 8 higher on a longer pole, the pole leans a
    /// little, each cloth hangs a little askew and a little off the pole; all within their bounds.
    @Test func theHandIsSeenAndSmall() {
        let s = year(kept: ["Health", "Home", "People"], standing: "Home", titles: ["Run a 5K", "Sleep by ten", "Cook at home"])
        let hand = natural(s), board = ruled(s)
        let post = hand.posts[0]
        #expect((26...32).contains(post.pole) && post.lean != 0 && abs(post.lean) <= WalkFooting.standingLean)
        #expect(post.base == CGPoint(x: 195, y: 556))
        let lift = post.pole - 24
        for (b, r) in zip(post.banners, board.posts[0].banners) {
            #expect(b.id == r.id)
            #expect(b.tilt != 0 && abs(b.tilt) <= WalkFooting.tilt && b.shift != 0 && abs(b.shift) <= WalkFooting.shift)
            #expect(abs(b.turn - (post.lean + b.tilt)) < 1e-9)
            #expect(abs(b.frame.minY - (r.frame.minY - lift)) < 0.05 && abs(b.frame.minX - r.frame.minX) <= WalkFooting.shift + 2)
            #expect(b.frame.size == r.frame.size)
        }
        #expect(Set(post.banners.map(\.tilt)).count == 3)
        // The pill rides the leaning pole, lifted with the stack.
        let pill = hand.standingPill!, ruledPill = board.standingPill!
        #expect(abs(pill.frame.minY - (ruledPill.frame.minY - lift)) < 0.001 && abs(pill.frame.midX - 195) <= 4)
        // Side posts lean, and stand a little lower than their row (the low row).
        for (side, r) in zip(hand.sides, board.sides) {
            #expect(side.lean != 0 && abs(side.lean) <= WalkFooting.sideLean)
            let off = side.poleFoot - r.poleFoot
            #expect((0...WalkFooting.sideStep).contains(off) && side.pill!.minY - r.pill!.minY == off && side.pill!.minX == r.pill!.minX)
            #expect(side.poleX == r.poleX && abs(side.poleFoot - side.poleTop - 60) < 0.001)
        }
    }

    /// The hand changes no count, no word and no line: which flags show, how many lines each takes,
    /// "+n more", and which side posts stand where are the ruled layout's.
    @Test func theHandChangesNoCountOrWord() {
        var checked = 0
        for wing: CGFloat in [0, 110.3] {
            for s in Generated.all {
                let hand = natural(s, wing: wing), board = ruled(s, wing: wing)
                let a = hand.posts.flatMap(\.banners), b = board.posts.flatMap(\.banners)
                guard a.map(\.id) == b.map(\.id), a.map(\.kind) == b.map(\.kind), a.map(\.lines) == b.map(\.lines),
                      a.map(\.text) == b.map(\.text), a.map(\.frame.size) == b.map(\.frame.size),
                      hand.sides.map(\.id) == board.sides.map(\.id), hand.sides.map(\.poleX) == board.sides.map(\.poleX),
                      hand.sides.map(\.count) == board.sides.map(\.count), hand.sides.map { $0.pill?.size } == board.sides.map { $0.pill?.size },
                      hand.labels.map(\.id) == board.labels.map(\.id), hand.labels.map(\.frame.size) == board.labels.map(\.frame.size)
                else { Issue.record("\(Generated.describe(s)), wing \(wing): the hand changed what shows"); return }
                checked += 1
            }
        }
        #expect(checked > 8000)
    }

    /// A stack that fills its room to the question neither rises nor turns: the lift and the turning
    /// shrink with the room above the stack, and with none they are gone. Its cloths still sit a
    /// little off the pole each, which costs no room above or below.
    @Test func aFullStackNeitherRisesNorTurns() {
        // 23 + 6 + 35 + 52 + 52 + 35 + 3 × 4 = 215 of 250: 35 of room (26 under the caret), the whole hand.
        let roomy = year(kept: ["Fun"], standing: "Fun", titles: ["Call Mum", "Plan a pancake Sunday", "Book train tickets to Gran", "Pick a date for dinner"])
        #expect(ruled(roomy).standingPill?.frame.minY == 317 && ruled(roomy).standingPill?.caret != nil)
        #expect(natural(roomy).posts[0].pole >= 26 && natural(roomy).posts[0].banners.contains { $0.turn != 0 })
        #expect((natural(roomy).standingPill?.caret?.minY ?? 0) >= 282)
        // Four week tasks, the newest three shown with "+1 more": 23 + 6 + 35 + 69 + 83 + 22 + 3 × 4 = 250 of 250.
        var full = WalkState()
        full.areas = ridge
        full.kept = [area("Fun")]
        full.step = 4
        full.focusArea = area("Fun")
        let titles = ["Ring Dad", "Call Mum", "Lift twice a week with the trainer at my gym",
                      "Write the first chapter of the memoir I keep putting off now"]
        full.items = titles.enumerated().map {
            WalkItem(id: uid(5100 + $0.offset), level: .week, title: $0.element, areaId: area("Fun"), day: $0.offset == 3 ? today : nil)
        }
        full = full.settled
        #expect(ruled(full).standingPill?.frame.minY == 282 && ruled(full).standingPill?.caret == nil)
        #expect(ruled(full).posts[0].banners.count == 4)
        let post = natural(full).posts[0]
        #expect(post.pole == 24 && post.lean == 0 && post.banners.allSatisfy { $0.turn == 0 && $0.drawn == $0.frame })
        #expect(post.banners.map(\.frame.minY) == ruled(full).posts[0].banners.map(\.frame.minY))
        #expect(post.banners.allSatisfy { $0.shift != 0 && abs($0.frame.midX - 195) <= WalkFooting.shift })
        #expect(natural(full).labels == ruled(full).labels)
    }

    /// Across, a cloth keeps only the room the side post beside it leaves: beside a side pill at its
    /// widest (1 point away) it hangs all but still, and stays clear of it; with no post beside it, freely.
    @Test func besideAWidePillAClothKeepsStill() {
        let titles = ["Run a 5K", "Sleep by ten", "Cook at home", "Stretch"]
        // People (a 58-wide pill, inner low, 271 to 329 at the right) beside Health's lowest cloths.
        let tight = year(kept: ["Health", "People"], standing: "Health", titles: titles)
        let free = year(kept: ["Health"], standing: "Health", titles: titles)
        let pill = ruled(tight).sides[0].pill!
        #expect(ruled(tight).sides[0].name == "People" && pill.minX == 271 && pill.width == 58)
        let beside = natural(tight).posts[0].banners.last!, alone = natural(free).posts[0].banners.last!
        #expect(beside.id == alone.id)
        let sidePill = natural(tight).sides[0].pill!
        #expect(!Invariants.overlap(beside.drawn, sidePill), "\(beside.drawn) and \(sidePill)")
        if beside.drawn.maxY > sidePill.minY {
            #expect(abs(beside.shift) < 0.4 && abs(beside.tilt) <= abs(alone.tilt) / 4, "\(beside.shift) \(beside.tilt) for \(alone.shift) \(alone.tilt)")
            #expect(beside.drawn.maxX <= sidePill.minX - 0.5)
        }
        // A cloth higher up, above the pill's reach, hangs as freely as with no post there.
        #expect(natural(tight).posts[0].banners[0].tilt == natural(free).posts[0].banners[0].tilt)
    }

    /// A wider cloth turns less, so its corners move no further than a phone's.
    @Test func aWiderClothTurnsLess() {
        let s = year(kept: ["Health"], standing: "Health", titles: ["Run a 5K", "Sleep by ten"])
        let phone = natural(s).posts[0], half = natural(s, wing: 110.3).posts[0]
        for (a, b) in zip(phone.banners, half.banners) {
            #expect(abs(abs(b.tilt) - abs(a.tilt) * 150 / 226.5) < 1e-9)
            #expect(b.drawn.height - b.frame.height <= 2 * WalkFooting.turnRoom && a.drawn.height - a.frame.height <= 2 * WalkFooting.turnRoom)
        }
        #expect(abs(abs(half.lean) - abs(phone.lean) * 150 / 226.5) < 1e-9)
    }

    /// Two side posts on one pole line only ever part: the low row's stands a little lower, the high
    /// row's a little higher. On the ground a chip stands a little higher than its row, never lower.
    @Test func sidePostsAndChipsOnlyPart() {
        var s = WalkState()
        s.areas = ridge
        s.kept = ridge.map(\.id)
        s.step = 1
        s.focusArea = area("Health")
        let hand = natural(s.settled), board = ruled(s.settled)
        #expect(hand.sides.count == 7)
        var moved = 0
        for (side, r) in zip(hand.sides, board.sides) {
            let high = r.pill!.minY < 500
            let off = side.poleFoot - r.poleFoot
            #expect(high ? (-WalkFooting.sideStep...0).contains(off) : (0...WalkFooting.sideStep).contains(off), "\(side.name): \(off)")
            if off != 0 { moved += 1 }
        }
        #expect(moved >= 5)

        var ground = WalkState()
        ground.areas = ridge; ground.step = 1; ground.ground = true
        let chips = natural(ground).labels, places = ruled(ground).labels
        #expect(zip(chips, places).allSatisfy { (-WalkFooting.chipRise...0).contains($0.footing) && $0.frame.minY == $1.frame.minY + $0.footing })
        #expect(chips.contains { $0.footing < -0.5 } && chips.allSatisfy { $0.frame.maxY <= 556 })
    }

    /// Planting another flag leaves a flag's own hand as it was (its identity's, while there is room).
    @Test func plantingElsewhereDoesNotChangeACloth() {
        let before = year(kept: ["Home", "Work"], standing: "Home", titles: ["Run a 5K"])
        let after = year(kept: ["Home", "Work"], standing: "Home", titles: ["Run a 5K", "Sleep by ten"])
        let a = natural(before).posts[0].banners[0], b = natural(after).posts[0].banners[0]
        #expect(a.itemId == b.itemId && a.tilt == b.tilt && a.shift == b.shift)
        #expect(natural(before).posts[0].lean == natural(after).posts[0].lean && natural(before).posts[0].pole == natural(after).posts[0].pole)
        #expect(natural(before).sides == natural(after).sides)
    }

    @Test func turnedOutlinesMeetOnlyWhenTheyOverlap() {
        let a = WalkTurn.corners(CGRect(x: 0, y: 0, width: 100, height: 40), degrees: 3, about: CGPoint(x: 50, y: 0))
        let below = WalkTurn.corners(CGRect(x: 0, y: 44, width: 100, height: 40), degrees: 3, about: CGPoint(x: 50, y: 0))
        let touching = WalkTurn.corners(CGRect(x: 0, y: 30, width: 100, height: 40), degrees: 3, about: CGPoint(x: 50, y: 0))
        #expect(!WalkTurn.meet(a, below))
        #expect(WalkTurn.meet(a, touching))
        #expect(WalkTurn.bounds(below).height > 40)      // a turned cloth's box is larger than the cloth
    }
}

private extension WalkLayout {
    var standingPill: Label? { labels.first { $0.standing } }
}
