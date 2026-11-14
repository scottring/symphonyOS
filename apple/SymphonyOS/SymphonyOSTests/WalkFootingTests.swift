import Testing
import Foundation
import CoreGraphics
@testable import Symphony

// The posts stand on uneven ground and their cloth hangs by hand (`WalkFooting.natural`),
// fixed by identity, within small bounds, and never at the cost of the layout's rules.

private let today = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 13))!

private func uid(_ n: Int) -> UUID {
    UUID(uuidString: String(format: "00000000-0000-0000-0000-%012x", n))!
}

private let names = ["Health", "Home", "People", "Work", "Money", "Fun", "Faith", "Learning"]
private let ridge = names.enumerated().map { WalkArea(id: uid(1000 + $0.offset), name: $0.element) }
private func area(_ name: String) -> UUID { ridge.first { $0.name == name }!.id }

/// `count` areas kept, one flag (or `perPost`) on each on every level to `step`; or the ground.
private func walk(step: Int, areas count: Int, perPost: Int = 1, ground: Bool = false) -> WalkState {
    var s = WalkState()
    s.areas = Array(ridge.prefix(count))
    s.kept = ground ? [] : s.areas.map(\.id)
    s.step = step
    s.ground = ground
    var n = 0
    for raw in 1...max(1, min(step, 4)) {
        for a in s.areas { for i in 0..<perPost {
            n += 1
            s.items.append(WalkItem(id: uid(5000 + n), level: WalkLevel(rawValue: raw)!, title: "Flag \(n) \(i)", areaId: a.id))
        } }
    }
    if step >= 5, let week = s.items(on: .week).last { s.firstThing = week.id }
    return s
}

private func post(_ layout: WalkLayout, _ level: WalkLevel, _ column: UUID?) -> WalkLayout.Post? {
    layout.posts.first { $0.key == WalkPostKey(level: level, column: column) }
}

struct WalkFootingTests {

    @Test func theSameWalkLooksTheSameTwice() {
        let s = walk(step: 1, areas: 3, perPost: 2)
        #expect(WalkLayout.make(s, today: today) == WalkLayout.make(s, today: today))
        // The hand is a fixed function of the id's bytes: these numbers never change between launches.
        #expect(WalkFooting.hand("1-00000000-0000-0000-0000-0000000003E8", "lean") == -0.9556318672293687)
        #expect(WalkFooting.hand("00000000-0000-0000-0000-000000001389", "tilt") == 0.41381061405602515)
        // A lone kept area on Year: its post stands exactly here.
        let lone = WalkLayout.make(walk(step: 1, areas: 1), today: today)
        let p = post(lone, .year, area("Health"))!
        #expect(!p.squeezed)
        #expect(abs(p.footing - -6.327964598602134) < 0.0001 && abs(p.lean - -1.433447800844053) < 0.0001
                && abs(p.pole - 18.081164561140767) < 0.0001,
                "\(p.footing) \(p.lean) \(p.pole)")
    }

    @Test func neighboursNeverStandOnOneLine() {
        for ground in [false, true] {
            for count in 2...8 {
                let layout = WalkLayout.make(walk(step: 1, areas: count, ground: ground), today: today)
                let posts = layout.posts.filter { $0.key.level == .year }.sorted { $0.base.x < $1.base.x }
                #expect(posts.count == count, "ground \(ground) \(count)")
                for (a, b) in zip(posts, posts.dropFirst()) where !a.squeezed && !b.squeezed {
                    #expect(abs(a.base.y - b.base.y) >= WalkFooting.apart - 0.001,
                            "ground \(ground) \(count): \(a.id) \(a.base.y) beside \(b.id) \(b.base.y)")
                }
                #expect(Set(posts.map(\.lean)).count > 1, "ground \(ground) \(count): every post leans alike")
                #expect(Set(posts.map(\.base.y)).count > 1, "ground \(ground) \(count): every post on one line")
            }
        }
    }

    @Test func everythingStaysWithinItsBounds() {
        // The amplitudes settled on stay inside the owner's bounds (10 pt, 18…34, 2°, 1.2°, 2.5 pt).
        #expect(WalkFooting.ground <= 10 && WalkFooting.pole.lowerBound >= 18 && WalkFooting.pole.upperBound <= 34
                && WalkFooting.lean <= 2 && WalkFooting.tilt <= 1.2 && WalkFooting.shift <= 2.5)
        // The hand itself, over a few hundred ids: within −1…1, both ways, not bunched.
        let values = (0..<400).map { WalkFooting.hand(uid(77_000 + $0 * 31).uuidString, "footing") }
        #expect(values.allSatisfy { (-1...1).contains($0) })
        #expect(values.filter { $0 < -0.5 }.count > 50 && values.filter { $0 > 0.5 }.count > 50)
        // Every post and banner of every generated state.
        var posts = 0, leaning = 0
        for s in Generated.states() {
            for p in WalkLayout.make(s, today: today).posts {
                posts += 1
                if p.lean != 0 && p.footing != 0 { leaning += 1 }
                #expect(abs(p.footing) <= WalkFooting.ground + 0.0001 && WalkFooting.pole.contains(p.pole)
                        && abs(p.lean) <= WalkFooting.lean + 0.0001, "\(p.id): \(p.footing) \(p.pole) \(p.lean)")
                for b in p.banners {
                    #expect(abs(b.tilt) <= WalkFooting.tilt + 0.0001 && abs(b.shift) <= WalkFooting.shift + 0.0001
                            && abs(b.turn - (p.lean + b.tilt)) < 0.0001, "\(b.id): \(b.tilt) \(b.shift)")
                }
            }
        }
        #expect(posts > 10_000)
        #expect(leaning > posts * 3 / 4, "\(leaning) of \(posts) posts planted by hand")
    }

    @Test func plantingElsewhereDoesNotChangeAPost() {
        var s = walk(step: 1, areas: 3)
        s.items.append(WalkItem(id: uid(9001), level: .year, title: "Second", areaId: area("Health")))
        let before = WalkLayout.make(s, today: today)
        s.items.append(WalkItem(id: uid(9002), level: .year, title: "Planted on Home", areaId: area("Home")))
        s.items.append(WalkItem(id: uid(9003), level: .year, title: "And on People", areaId: area("People")))
        let after = WalkLayout.make(s, today: today)
        let a = post(before, .year, area("Health"))!, b = post(after, .year, area("Health"))!
        #expect(a.lean != 0 && a.lean == b.lean && a.pole == b.pole && a.footing == b.footing)
        #expect(a.banners.map(\.tilt) == b.banners.map(\.tilt) && a.banners.map(\.shift) == b.banners.map(\.shift))
        #expect(a.banners.contains { $0.tilt != 0 })
    }

    @Test func aPostKeepsItsCharacterDownTheMountain() {
        let health = area("Health")
        var leans: [Double] = []
        for step in 1...6 {
            let layout = WalkLayout.make(walk(step: step, areas: 2), today: today)
            guard let p = post(layout, .year, health) else { Issue.record("step \(step): no Year post"); continue }
            #expect(!p.squeezed, "step \(step)")
            leans.append(p.lean)
            #expect(abs(p.lean - WalkFooting.hand(p.id, "lean") * WalkFooting.lean) < 0.0001, "step \(step)")
        }
        #expect(leans.count == 6 && Set(leans).count == 1 && leans[0] != 0, "\(leans)")
    }

    @Test func labelsMoveWithTheirPosts() {
        for ground in [false, true] {
            for count in [1, 3, 6] {
                let s = walk(step: 1, areas: count, ground: ground)
                let natural = WalkLayout.make(s, today: today), level = WalkLayout.make(s, today: today, footing: .level)
                #expect(natural.labels.count == count)
                for label in natural.labels {
                    let p = post(natural, .year, label.id)!
                    let flat = level.labels.first { $0.id == label.id }!
                    #expect(label.footing == p.footing, "\(label.name)")
                    #expect(abs(label.frame.minY - flat.frame.minY - p.footing) < 0.001, "\(label.name)")
                    #expect(abs(p.base.y - post(level, .year, label.id)!.base.y - p.footing) < 0.001)
                }
                #expect(natural.labels.contains { $0.footing != 0 }, "ground \(ground) \(count)")
            }
        }
    }

    @Test func aCrowdedRidgeStaysOrderly() {
        for count in [7, 8] {
            for step in 1...6 {
                for perPost in [1, 3] {
                    let s = walk(step: step, areas: count, perPost: perPost)
                    let layout = WalkLayout.make(s, today: today)
                    let problems = Invariants.check(layout, s)
                    #expect(problems.isEmpty, "\(count) areas, step \(step), \(perPost) each: \(problems.prefix(3))")
                    for p in layout.posts {
                        let hand = WalkFooting.hand(p.id, "lean") * WalkFooting.lean
                        if p.squeezed {
                            #expect(abs(p.lean) <= abs(hand) + 0.0001, "\(p.id)")
                        } else {
                            #expect(abs(p.lean - hand) < 0.0001, "\(p.id)")
                        }
                    }
                    #expect(layout.posts.contains { !$0.squeezed || $0.lean != 0 }, "\(count) areas, step \(step): no hand left")
                }
            }
        }
    }

    /// Folds, counts, words, sizes, which post is open and what a tap does are the ruled layout's:
    /// the hand only moves and turns what was stacked.
    @Test func theHandChangesNoFoldOrWord() {
        for s in Generated.states() {
            let natural = WalkLayout.make(s, today: today), level = WalkLayout.make(s, today: today, footing: .level)
            #expect(natural.posts.map(\.id) == level.posts.map(\.id) && natural.labels.map(\.id) == level.labels.map(\.id))
            for (n, l) in zip(natural.posts.flatMap(\.banners), level.posts.flatMap(\.banners)) {
                guard n.id == l.id, n.kind == l.kind, n.itemId == l.itemId, n.lines == l.lines, n.more == l.more,
                      n.text == l.text, n.tag == l.tag, n.label == l.label, n.taps == l.taps, n.glows == l.glows,
                      n.frame.size == l.frame.size else {
                    Issue.record("\(Generated.describe(s)): \(n.id) \(n.kind) \(n.lines) \(String(describing: n.more)) ≠ \(l.id) \(l.kind) \(l.lines) \(String(describing: l.more))")
                    return
                }
            }
        }
    }

    /// Whatever the rules allow, the hand never makes two posts' flags meet that the ruled layout
    /// keeps apart, nor (but for the step's own flags, in front of the peaks by design) covers more
    /// of a label than it does (4 pt² forgiven).
    @Test func theHandNeverPilesOneThingOnAnother() {
        func area(_ a: CGRect, _ b: CGRect) -> CGFloat {
            let i = a.intersection(b)
            return i.isNull || !Invariants.overlap(a, b) ? 0 : i.width * i.height
        }
        for s in Generated.states() {
            let natural = WalkLayout.make(s, today: today), level = WalkLayout.make(s, today: today, footing: .level)
            let drawn = natural.posts.flatMap { p in p.banners.map { (p.id, $0) } }
            let ruled = Dictionary(level.posts.flatMap(\.banners).map { ($0.id, $0.frame) }, uniquingKeysWith: { a, _ in a })
            for (i, a) in drawn.enumerated() { for b in drawn[(i + 1)...] where a.0 != b.0 && area(a.1.drawn, b.1.drawn) > 0 {
                guard let ra = ruled[a.1.id], let rb = ruled[b.1.id], area(ra, rb) == 0 else { continue }
                Issue.record("\(Generated.describe(s)): \(a.1.id) piled on \(b.1.id)")
                return
            } }
            for label in natural.labels {
                guard let flat = level.labels.first(where: { $0.id == label.id }) else { continue }
                for (_, b) in drawn where b.level != s.level && ruled[b.id].map({ area(label.frame, b.drawn) > area(flat.frame, $0) + 4 }) == true {
                    Issue.record("\(Generated.describe(s)): \(b.id) covers label \(label.name)")
                    return
                }
            }
        }
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
