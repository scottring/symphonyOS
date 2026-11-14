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

/// `areas` kept in this order, one flag on each on every level to `step` except the levels each
/// area skips; ids depend only on the area and the level, so adding an area changes no other id.
private func ridgeWalk(step: Int, areas: [WalkArea], skip: [UUID: Set<WalkLevel>] = [:], from: Int = 1) -> WalkState {
    var s = WalkState()
    s.areas = areas
    s.kept = areas.map(\.id)
    s.step = step
    for raw in from...min(step, 4) {
        let level = WalkLevel(rawValue: raw)!
        for a in areas where !(skip[a.id]?.contains(level) ?? false) {
            let n = Int(a.id.uuidString.suffix(4), radix: 16)! * 10 + raw
            s.items.append(WalkItem(id: uid(60_000 + n), level: level, title: "Flag", areaId: a.id))
        }
    }
    return s
}

/// The maximal monotone runs of a row of footings, as sets of indices (an extreme closes two).
private func runs(_ f: [CGFloat]) -> [Set<Int>] {
    guard f.count > 1 else { return [Set(f.indices)] }
    var ends = [0]
    for t in 1..<(f.count - 1) where (f[t] > f[t - 1]) != (f[t + 1] > f[t]) { ends.append(t) }
    ends.append(f.count - 1)
    return zip(ends, ends.dropFirst()).map { Set($0...$1) }
}

/// Ids from a seeded SplitMix64, so the property test's id sets are the same on every run.
private struct SeededIds {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
    mutating func uuid() -> UUID {
        let a = next(), b = next()
        return UUID(uuidString: String(format: "%08X-%04X-%04X-%04X-%012llX", UInt32(a >> 32), UInt16((a >> 16) & 0xFFFF),
                                       UInt16(a & 0xFFFF), UInt16(b >> 48), b & 0xFFFF_FFFF_FFFF))!
    }
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
                // Up to five posts the 6 pt holds for every pair, squeezed or not; from six, the label rows may squeeze.
                for (a, b) in zip(posts, posts.dropFirst()) where count <= 5 || (!a.squeezed && !b.squeezed) {
                    #expect(abs(a.base.y - b.base.y) >= WalkFooting.apart - 0.001,
                            "ground \(ground) \(count): \(a.id) \(a.base.y) beside \(b.id) \(b.base.y)")
                }
                #expect(Set(posts.map(\.lean)).count > 1, "ground \(ground) \(count): every post leans alike")
                #expect(Set(posts.map(\.base.y)).count > 1, "ground \(ground) \(count): every post on one line")
                // Up to five areas there is always room: nobody is squeezed, so the 6 pt above is checked for every pair.
                #expect(count >= 6 || posts.allSatisfy { !$0.squeezed }, "ground \(ground) \(count): \(posts.filter(\.squeezed).map(\.id))")
            }
        }
        // Season and below, a column with no post between two posts: the two posts are the neighbours.
        var pairs = 0
        for count in 3...5 {
            for gap in 1..<(count - 1) {
                for step in 2...4 {
                    let areas = Array(ridge.prefix(count))
                    let skip = [areas[gap].id: Set([WalkLevel.season, .month, .week])]
                    let layout = WalkLayout.make(ridgeWalk(step: step, areas: areas, skip: skip), today: today)
                    for raw in 2...step {
                        let posts = layout.posts.filter { $0.key.level.rawValue == raw }.sorted { $0.base.x < $1.base.x }
                        #expect(posts.count == count - 1)
                        // On Season's own step nothing crowds them, so no one may be squeezed and every pair is
                        // checked. Further down a post may be damped (its hand halved or more) where it would
                        // otherwise meet the small flags above it, which is a rule the hand would break; such a
                        // pair is excused there, and only there.
                        #expect(step > 2 || posts.allSatisfy { !$0.squeezed }, "\(count) areas, gap \(gap), step \(step), level \(raw)")
                        for (a, b) in zip(posts, posts.dropFirst()) where step == 2 || (!a.squeezed && !b.squeezed) {
                            pairs += 1
                            #expect(abs(a.footing - b.footing) >= WalkFooting.apart * scale(of: layout, raw) - 0.001,
                                    "\(count) areas, gap \(gap), step \(step), level \(raw): \(a.id) \(a.footing) beside \(b.id) \(b.footing)")
                        }
                    }
                }
            }
        }
        #expect(pairs >= 30, "\(pairs) pairs checked")
    }

    /// A level's drawn scale, read off a small flag (20 pt tall at scale 1); 1 for anything else.
    private func scale(of layout: WalkLayout, _ raw: Int) -> CGFloat {
        layout.posts.first { $0.key.level.rawValue == raw }?.banners.first { $0.kind == .tip }.map { $0.frame.height / 20 } ?? 1
    }

    /// An arrival moves only the posts of the monotone runs it touches: those the newcomer stands in
    /// now, and the one its two new neighbours shared before (a footing depends on the ranks within
    /// its own run, an extreme on the two runs it closes). Every other post keeps its footing. Only the
    /// step's own flags stand here: the room the flags of another level leave above a post is room,
    /// and it moves with the columns when an area arrives (as the ruled layout's columns do).
    @Test func anArrivingAreaMovesOnlyItsRuns() {
        let newcomer = ridge[7]
        var compared = 0
        for count in 2...7 {
            for at in [0, 1, count / 2] {
                for step in 2...4 {
                    let before = Array(ridge.prefix(count))
                    var after = before
                    after.insert(newcomer, at: at)
                    let a = WalkLayout.make(ridgeWalk(step: step, areas: before, from: step), today: today)
                    let b = WalkLayout.make(ridgeWalk(step: step, areas: after, from: step), today: today)
                    for raw in step...step {
                        let level = WalkLevel(rawValue: raw)!
                        let drawnB = b.posts.filter { $0.key.level == level }.sorted { $0.base.x < $1.base.x }
                        let drawnA = a.posts.filter { $0.key.level == level }.sorted { $0.base.x < $1.base.x }
                        guard let i = drawnB.firstIndex(where: { $0.key.column == newcomer.id }) else { Issue.record("no newcomer post"); continue }
                        var moving = Set(runs(drawnB.map(\.footing)).filter { $0.contains(i) }.flatMap { $0 }.map { drawnB[$0].key.column })
                        let beside = Set([i - 1, i + 1].filter(drawnB.indices.contains).map { drawnB[$0].key.column })
                        let besideBefore = drawnA.indices.filter { beside.contains(drawnA[$0].key.column) }
                        for run in runs(drawnA.map(\.footing)) where besideBefore.count == 2 && besideBefore.allSatisfy(run.contains) {
                            moving.formUnion(run.map { drawnA[$0].key.column })
                        }
                        // A post damped to keep a rule (columns move sideways when an area arrives) is not this test's business.
                        for p in drawnA where !moving.contains(p.key.column) && !p.squeezed {
                            let q = post(b, level, p.key.column)!
                            guard !q.squeezed else { continue }
                            compared += 1
                            #expect(abs(p.footing - q.footing) < 0.0001,
                                    "\(count) areas, newcomer at \(at), step \(step), \(level): \(p.id) \(p.footing) → \(q.footing)")
                        }
                    }
                }
            }
        }
        #expect(compared > 50, "\(compared) posts compared")
    }

    /// For any ids, 2 to 5 drawn posts on a level stand at least 6 pt from each drawn neighbour,
    /// nobody squeezed, all within ±10: on the ground, Year (step 1), Season (step 2), Month (step 3)
    /// and Week (step 4), each with flags on every level above, with and without an empty column
    /// between two of them. (Where a lean would meet the small flags above, the turn is damped first and
    /// the footing stands; a post rises only half the gap to the flags above, so nobody is squeezed for it.)
    ///
    /// Month and Week fall short for a real reason of room: the small flags of the level above leave a
    /// Month post 5.9 pt to rise and a Week post 2.5 (half the gap, less 0.5), so between −5.9 and +10
    /// (−2.5 and +10) a run of four posts in one rising order cannot take three 6 pt steps (it needs 18).
    /// Smallest example: Month, four posts ranked in one order, footings −5.88, −0.59, 4.71, 10.00. There,
    /// and only where four or more neighbours stand in one order, the run is spaced evenly, reported
    /// squeezed, and the weaker thing that always holds is asserted: never within 3 pt of a neighbour. The one exception is five posts whose hands rank in one
    /// rising (or falling) run: ±10 cannot hold four 6 pt steps, so they stand 4.5 pt apart, evenly.
    @Test func neighboursStandApartWhateverTheirIds() {
        var rng = SeededIds(seed: 0x5EED_F007)
        var checked = 0, limited = 0
        for set in 0..<2000 {
            let count = 2 + set % 4
            let gap: Int? = set % 3 == 0 && count <= 4 ? 1 + Int(rng.next() % UInt64(count - 1)) : nil
            let columns = count + (gap == nil ? 0 : 1)
            let areas = (0..<columns).map { WalkArea(id: rng.uuid(), name: "Area \($0)") }
            for step in 0...4 {                                         // 0: the ground
                let level = WalkLevel(rawValue: max(1, step))!
                var s = WalkState()
                s.areas = areas
                s.kept = areas.map(\.id)
                s.step = max(1, step)
                s.ground = step == 0
                for (i, a) in areas.enumerated() {
                    for raw in 1...max(1, step) where raw < level.rawValue || i != gap {
                        s.items.append(WalkItem(id: rng.uuid(), level: WalkLevel(rawValue: raw)!, title: "Flag", areaId: a.id))
                    }
                }
                let layout = WalkLayout.make(s, today: today)
                let posts = layout.posts.filter { $0.key.level == level }.sorted { $0.base.x < $1.base.x }
                let what = "set \(set), \(level), \(count) posts, gap \(String(describing: gap)): \(posts.map { String(format: "%.2f", $0.footing) })"
                #expect(posts.count == count, "\(what)")
                #expect(posts.allSatisfy { abs($0.footing) <= WalkFooting.ground + 0.0001 }, "\(what)")
                #expect(step >= 3 || posts.allSatisfy { !$0.squeezed }, "\(what)")
                let steps = zip(posts, posts.dropFirst()).map { $1.footing - $0.footing }
                let oneRun = count == 5 && (steps.allSatisfy { $0 > 0 } || steps.allSatisfy { $0 < 0 })
                let runOfFour = steps.count >= 3 && (0...(steps.count - 3)).contains { i in
                    (steps[i] > 0) == (steps[i + 1] > 0) && (steps[i + 1] > 0) == (steps[i + 2] > 0)
                }
                if step >= 3 && runOfFour {
                    #expect(steps.allSatisfy { abs($0) >= 3 - 0.0001 }, "\(what)")
                    limited += 1
                    checked += 1
                    continue
                }
                #expect(steps.allSatisfy { abs($0) >= (oneRun ? 4.5 : WalkFooting.apart) - 0.0001 }, "\(what)")
                checked += 1
            }
        }
        #expect(checked == 10_000)
        #expect(limited < 600, "\(limited) Month and Week levels with a run of four or more")
    }

    /// Year, appending an area at the right end: only the post that was last can move (it gains a
    /// neighbour); everyone else keeps their footing. Below four areas there are no label rows.
    @Test func appendingOnTheRightMovesOnlyThePreviousLastPost() {
        for count in 1...2 {
            let before = WalkLayout.make(ridgeWalk(step: 1, areas: Array(ridge.prefix(count))), today: today)
            let after = WalkLayout.make(ridgeWalk(step: 1, areas: Array(ridge.prefix(count + 1))), today: today)
            for p in before.posts where p.key.column != ridge[count - 1].id {
                #expect(post(after, .year, p.key.column)!.footing == p.footing, "\(count) → \(count + 1): \(p.id)")
            }
        }
    }

    /// Year, three areas to four: the peak labels switch to two staggered rows, so every Year post
    /// may move. With rows, which of two neighbours stands lower is the row's, not the hand's: the
    /// upper row's posts stand above the line (−10…−6), the lower row's on or below it (0…+10),
    /// so neighbours stay 6 pt apart and a lower label never rises into the upper one.
    @Test func theLabelRowsDecideTheYearFootingFromFourAreas() {
        let three = WalkLayout.make(ridgeWalk(step: 1, areas: Array(ridge.prefix(3))), today: today)
        let four = WalkLayout.make(ridgeWalk(step: 1, areas: Array(ridge.prefix(4))), today: today)
        #expect(Set(three.labels.map { $0.frame.minY - $0.footing }).count == 1)        // one row
        let tops = four.labels.map { $0.frame.minY - $0.footing }
        let upper = tops.min()!
        for label in four.labels {
            let p = post(four, .year, label.id)!
            if abs(label.frame.minY - label.footing - upper) < 0.01 {
                #expect(p.footing <= -WalkFooting.apart + 0.0001, "\(label.name) upper row: \(p.footing)")
            } else {
                #expect(p.footing >= 0, "\(label.name) lower row: \(p.footing)")
            }
        }
    }

    /// One crowded post never levels the rest: a natural layout equals the ruled one only where every
    /// post was squeezed, and no generated state ends with every post level. (A layout that did not
    /// settle would trip an `assertionFailure`, failing this run outright.)
    @Test func oneCrowdedPostNeverLevelsTheRest() {
        var flattened: [String] = []
        for s in Generated.states() {
            let natural = WalkLayout.make(s, today: today)
            guard !natural.posts.isEmpty else { continue }
            let level = WalkLayout.make(s, today: today, footing: .level)
            let same = zip(natural.posts, level.posts).allSatisfy { $0.base == $1.base && $0.lean == 0 && $0.banners.map(\.frame) == $1.banners.map(\.frame) }
            #expect(!same || natural.posts.allSatisfy(\.squeezed), "\(Generated.describe(s))")
            if natural.posts.allSatisfy({ $0.lean == 0 && $0.footing == 0 }) { flattened.append(Generated.describe(s)) }
        }
        #expect(flattened.isEmpty, "\(flattened)")
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
                        // A lean is reduced only by its own turning share, and never past its hand.
                        let hand = WalkFooting.hand(p.id, "lean") * WalkFooting.lean
                        #expect(abs(p.lean - hand * Double(p.turning)) < 0.0001 && abs(p.lean) <= abs(hand) + 0.0001, "\(p.id)")
                    }
                    #expect(layout.posts.contains { !$0.squeezed || $0.lean != 0 }, "\(count) areas, step \(step): no hand left")
                    #expect(layout.posts.allSatisfy { [0, 0.25, 0.5, 1].contains($0.turning) })
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

    /// Whatever the rules allow, the hand never makes two posts' flags (one level or two) meet that the ruled layout
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

    /// Steps 1 to 5: no drawn cloth lies over another post's cloth on another level unless the ruled
    /// layout of the same state already lays that same pair over each other (a leaning flag never
    /// touches the small flags above it).
    @Test func aLeaningFlagNeverTouchesTheFlagsAbove() {
        var pairs = 0
        for s in Generated.states() where (1...5).contains(s.step) && !s.ground {
            let natural = WalkLayout.make(s, today: today), level = WalkLayout.make(s, today: today, footing: .level)
            let ruled = Dictionary(level.posts.flatMap(\.banners).map { ($0.id, $0.frame) }, uniquingKeysWith: { a, _ in a })
            let drawn = natural.posts.flatMap { p in p.banners.map { (p.id, $0) } }
            for (i, a) in drawn.enumerated() { for b in drawn[(i + 1)...] where a.0 != b.0 && a.1.level != b.1.level {
                pairs += 1
                guard Invariants.overlap(a.1.drawn, b.1.drawn), let ra = ruled[a.1.id], let rb = ruled[b.1.id],
                      !Invariants.overlap(ra, rb) else { continue }
                Issue.record("\(Generated.describe(s)): \(a.1.id) \(a.1.drawn) over \(b.1.id) \(b.1.drawn)")
                return
            } }
        }
        #expect(pairs > 10_000)
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
