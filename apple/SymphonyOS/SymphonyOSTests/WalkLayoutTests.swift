import Testing
import Foundation
import CoreGraphics
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

private let names = ["Health", "Home", "People", "Work", "Money", "Fun", "Faith", "Learning"]
private let ridge = names.enumerated().map { WalkArea(id: uid(1000 + $0.offset), name: $0.element) }

private func area(_ name: String) -> WalkArea { ridge.first { $0.name == name }! }

/// Off the ground on a step, with the named areas kept.
private func state(_ step: Int, kept: [String] = [], items: [WalkItem] = []) -> WalkState {
    var s = WalkState()
    s.areas = Array(ridge.prefix(6))
    s.kept = kept.map { area($0).id }
    s.step = step
    s.items = items
    return s
}

private func flag(_ level: WalkLevel, _ title: String, in areaName: String? = nil, parent: UUID? = nil,
                  day: Date? = nil, mine: Bool = true) -> WalkItem {
    return WalkItem(id: UUID(), level: level, title: title, areaId: areaName.map { area($0).id },
                    parentId: parent, day: day, mine: mine)
}

private extension WalkLayout {
    func posts(on level: WalkLevel) -> [Post] { posts.filter { $0.key.level == level } }
    func banners(on level: WalkLevel) -> [Banner] { posts(on: level).flatMap(\.banners) }
    func post(_ level: WalkLevel, _ column: UUID?) -> Post? { posts.first { $0.key == WalkPostKey(level: level, column: column) } }
    func banner(for item: WalkItem) -> Banner? { posts.flatMap(\.banners).first { $0.itemId == item.id && $0.level == item.level } }
}

private func near(_ a: CGFloat, _ b: CGFloat, _ tolerance: CGFloat = 0.5) -> Bool { abs(a - b) <= tolerance }

struct WalkLayoutTests {

    // MARK: Bands, columns, zoom

    @Test func everyBandLandsOnItsStepsLine() {
        // Year stands at 535.5 (clear of the light below its labels); Season to Today at 560.
        let year = flag(.year, "Run a 5K", in: "Home")
        let season = flag(.season, "Lift twice a week", in: "Home")
        let month = flag(.month, "Book the plumber", in: "Home")
        let week = flag(.week, "Call the tile shop", in: "Home")
        let levels: [WalkLevel] = [.year, .season, .month, .week, .today]
        for step in 1...5 {
            var s = state(step, kept: ["Home"], items: [year, season, month, week])
            s.firstThing = week.id
            let layout = WalkLayout.make(s, today: today, footing: .level)
            let base = layout.posts(on: levels[step - 1]).first?.base
            #expect(base.map { near($0.y, step == 1 ? 535.5 : 560) } == true, "step \(step): \(String(describing: base))")
        }
        var s = state(6, kept: ["Home"], items: [year, season, month, week])
        s.firstThing = week.id
        let layout = WalkLayout.make(s, today: today, footing: .level)
        for (level, y) in zip(levels, [321, 393, 456, 510, 552] as [CGFloat]) {
            let base = layout.posts(on: level).first?.base
            #expect(base.map { near($0.y, y, 1) } == true, "\(level): \(String(describing: base))")
        }
    }

    @Test func threeKeptAreasStandWhereTheMockupPutThem() {
        let kept = ["Health", "Home", "People"]
        let s = state(1, kept: kept, items: kept.map { flag(.year, "Run a 5K", in: $0) })
        let layout = WalkLayout.make(s, today: today, footing: .level)
        let xs = kept.map { layout.post(.year, area($0).id)!.base.x }
        #expect(zip(xs, [87, 194.5, 302] as [CGFloat]).allSatisfy { near($0, $1) }, "\(xs)")
        #expect(layout.banners(on: .year).allSatisfy { $0.kind == .full && near($0.frame.width, 99, 0.01) })

        var ground = state(1)
        ground.ground = true
        let labels = WalkLayout.make(ground, today: today, footing: .level).labels
        #expect(labels.count == 6)
        #expect(zip(labels.map(\.frame.midX), [50, 108, 166, 224, 282, 340] as [CGFloat]).allSatisfy { near($0, $1) },
                "\(labels.map(\.frame.midX))")
    }

    @Test func zoomCentresTheColumn() {
        var s = state(1, kept: ["Health", "Home", "People"], items: [flag(.year, "Paint the hall", in: "Home")])
        s.focusArea = area("Home").id
        let layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.camera.k == 0.8)
        let base = layout.post(.year, area("Home").id)!.base
        #expect(near(base.x, 195) && near(base.y, 520), "\(base)")

        let loose = flag(.year, "Be kind", in: nil)
        var season = state(2, kept: ["Health", "Home"], items: [loose])
        season.focus[.season] = loose.id
        #expect(WalkLayout.make(season, today: today, footing: .level).camera == art.stops[2])
    }

    // MARK: Crowds and stubs

    @Test func aCrowdedRidgeOpensOnePost() {
        let kept = Array(names.prefix(6))
        var items: [WalkItem] = []
        for name in kept { for n in 1...3 { items.append(flag(.year, "Goal \(n)", in: name)) } }
        var s = state(1, kept: kept, items: items)
        let layout = WalkLayout.make(s, today: today, footing: .level)
        let open = layout.posts(on: .year).filter { $0.banners.contains { $0.kind == .full } }
        #expect(open.count == 1)
        let closed = layout.posts(on: .year).filter { !$0.banners.contains { $0.kind == .full } }
        #expect(closed.count == 5)
        #expect(closed.allSatisfy { $0.banners.map(\.kind) == [.stub(3)] })

        let other = items.first { $0.areaId == area("Money").id }!
        s.selected = other.id
        let reopened = WalkLayout.make(s, today: today, footing: .level).posts(on: .year).filter { $0.banners.contains { $0.kind == .full } }
        #expect(reopened.map(\.key.column) == [area("Money").id])
        #expect(reopened.first?.banners.contains { $0.itemId == other.id && $0.glows } == true)
    }

    @Test func whatDoesNotFitFoldsIntoAStub() {
        let kept = ["Health", "Home", "People"]
        let crowd = (1...8).map { flag(.year, "Goal \($0)", in: "Home") }
        var s = state(1, kept: kept, items: crowd)
        let post = WalkLayout.make(s, today: today, footing: .level).post(.year, area("Home").id)!
        #expect(post.banners.filter { $0.kind == .full }.count == 6)
        #expect(post.banners.filter { $0.kind == .stub(2) }.count == 1)
        // Newest lowest: the six shown are the six newest.
        let shown = post.banners.compactMap(\.itemId)
        #expect(Set(shown) == Set(crowd.suffix(6).map(\.id)))

        s.expanded = WalkPostKey(level: .year, column: area("Home").id)
        let open = WalkLayout.make(s, today: today, footing: .level).post(.year, area("Home").id)!
        #expect(open.banners.count == 8 && open.banners.allSatisfy { $0.kind == .compact })
        #expect(open.banners.allSatisfy { $0.frame.minY >= 250 })
    }

    @Test func lookingBackUpShowsTheNewestWithACount() {
        // Look back up, one area, two Season flags: the newest, readable, carrying "+1"; no stub.
        let a = flag(.season, "Lift twice a week", in: "Home"), b = flag(.season, "Sleep by ten", in: "Home")
        let layout = WalkLayout.make(state(6, kept: ["Home"], items: [a, b]), today: today, footing: .level)
        let ceiling = (art.bandY(.year) - layout.camera.y) * layout.camera.k + 6
        let banners = layout.banners(on: .season)
        #expect(banners.count == 1)
        #expect(banners.first?.kind == .compact && banners.first?.itemId == b.id && banners.first?.more == 1)
        #expect(banners.first?.label == "Season: Sleep by ten, 1 more, tap to show")
        #expect(banners.allSatisfy { $0.frame.minY >= ceiling - 0.01 }, "\(banners.map(\.frame))")
    }

    @Test func theStepsOwnFlagsNeverCoverARisenFlag() {
        // The reviewer's case: Week, zoomed on Health, the month flag focused, two dated week flags.
        let month = flag(.month, "Get back to the gym", in: "Health")
        let older = flag(.week, "Gym", in: "Health", parent: month.id, day: day(2026, 11, 17))
        let newer = flag(.week, "Swim", in: "Health", parent: month.id, day: day(2026, 11, 18))
        var s = state(4, kept: ["Health", "Home"], items: [month, older, newer])
        s.focus[.week] = month.id
        let layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.camera.k == 0.8)
        let risen = layout.banner(for: month)!
        #expect(risen.kind == .compact && risen.glows)
        let weeks = layout.banners(on: .week)
        #expect(weeks.allSatisfy { !$0.frame.intersects(risen.frame) || $0.frame.maxY <= risen.frame.minY },
                "\(weeks.map(\.frame)) vs \(risen.frame)")
        #expect(weeks.allSatisfy { $0.frame.minY >= risen.frame.maxY + 4 - 0.01 })
        #expect(layout.banner(for: newer)?.kind == .full)
        #expect(weeks.contains { $0.kind == .stub(1) })
    }

    @Test func theFirstThingKeepsClearOfItsWeekPost() {
        // Look back up: the first thing's column also holds three week flags.
        let weeks = (1...3).map { flag(.week, "Week task \($0)", in: "Home") }
        var s = state(6, kept: ["Health", "Home"], items: weeks)
        s.firstThing = weeks[2].id
        let layout = WalkLayout.make(s, today: today, footing: .level)
        let first = layout.banners(on: .today)
        #expect(first.count == 1 && first[0].tag == WalkCopy.firstThingTag)
        let week = layout.banners(on: .week)
        #expect(week.count == 1 && week[0].more == 2 && week[0].itemId == weeks[2].id)
        #expect(!week[0].frame.intersects(first[0].frame), "\(week[0].frame) vs \(first[0].frame)")
    }

    @Test func theFlagYouPlantedShowsBeforeTheExamples() {
        // The reviewer's case: Week zoomed on Health under a risen month flag, one dated "Gym", examples on.
        let month = flag(.month, "Get back to the gym", in: "Health")
        let gym = flag(.week, "Gym", in: "Health", parent: month.id, day: day(2026, 11, 17))
        var s = state(4, kept: ["Health", "Home"], items: [month, gym])
        s.focus[.week] = month.id
        s.examplesOn = [4]
        let layout = WalkLayout.make(s, today: today, footing: .level)
        let risen = layout.banner(for: month)!
        let mine = layout.banner(for: gym)
        #expect(mine?.kind == .full && mine?.more == nil)
        let ghosts = layout.posts.flatMap(\.banners).filter { $0.kind == .ghost }
        #expect(ghosts.allSatisfy { $0.frame.minY >= risen.frame.maxY + 4 - 0.01 }, "\(ghosts.map(\.frame))")
        #expect(layout.banners(on: .week).allSatisfy { !$0.frame.intersects(risen.frame) })
    }

    @Test func underARisenFlagTheNewestCarriesTheCount() {
        // Focused on an unlabeled flag: no zoom, so only a little room under the risen flag.
        for step in 2...4 {
            let level = WalkLevel(rawValue: step)!, above = WalkLevel(rawValue: step - 1)!
            let parent = flag(above, "Be kind", in: nil)
            let older = flag(level, "First one", in: nil, parent: parent.id, day: level == .week ? today : nil)
            let newer = flag(level, "Second one", in: nil, parent: parent.id, day: level == .week ? today : nil)
            var s = state(step, kept: ["Health"], items: [parent, older, newer])
            s.focus[level] = parent.id
            let layout = WalkLayout.make(s, today: today, footing: .level)
            #expect(layout.camera == art.stops[step])
            let post = layout.post(level, nil)!
            #expect(post.banners.count == 1, "step \(step): \(post.banners.map(\.kind))")
            #expect(post.banners.first?.itemId == newer.id && post.banners.first?.more == 1 && post.banners.first?.kind == .full)
            let risen = layout.banner(for: parent)!
            #expect(risen.glows && !post.banners[0].frame.intersects(risen.frame), "step \(step)")
            #expect(post.banners[0].label.hasSuffix("1 more, tap to show"))
        }
    }

    @Test func aSmallFlagStaysOnItsPole() {
        // Five columns on Today: the rightmost column stands at x 374.7, so its small flags run past the edge.
        let kept = Array(names.prefix(5))
        var items: [WalkItem] = []
        for name in kept { for lvl in [WalkLevel.year, .season, .month, .week] { items.append(flag(lvl, "\(name) \(lvl)", in: name)) } }
        var s = state(5, kept: kept, items: items)
        s.areas = Array(ridge.prefix(5))
        s.firstThing = items.last!.id
        let layout = WalkLayout.make(s, today: today, footing: .level)
        for lvl in [WalkLevel.year, .season, .month, .week] {
            let post = layout.post(lvl, area(kept[4]).id)!
            let tip = post.banners.first { $0.kind == .tip }!
            let scale = tip.frame.height / 20
            #expect(near(tip.frame.minX, post.base.x - 1.5 * scale, 0.01), "\(lvl): \(tip.frame) at pole \(post.base.x)")
            #expect(tip.frame.maxX > 386)
        }
    }

    @Test func nineColumnsKeepTheirSmallFlags() {
        // Eight areas and the unlabeled post: small flags still have room on Season and Month.
        let eight = ridge
        for step in [2, 3] {
            var items: [WalkItem] = eight.map { WalkItem(id: UUID(), level: .year, title: "Goal", areaId: $0.id) }
            items.append(flag(.year, "Loose goal", in: nil))
            if step == 3 { items += eight.map { WalkItem(id: UUID(), level: .season, title: "Line", areaId: $0.id) } }
            var s = WalkState()
            s.areas = eight
            s.kept = eight.map(\.id)
            s.step = step
            s.items = items
            let layout = WalkLayout.make(s, today: today, footing: .level)
            #expect(layout.posts(on: .year).count == 9)
            #expect(layout.banners(on: .year).allSatisfy { $0.kind == .tip }, "step \(step)")
            if step == 3 { #expect(layout.banners(on: .season).allSatisfy { $0.kind == .tip }) }
        }
    }

    // MARK: Examples under a risen flag

    /// Zoomed on Health at `step`, its parent flag focused (so it rises), `own` flags of the step's level under it.
    private func underTheParent(_ step: Int, own: [String], examples: Bool = true) -> (WalkState, WalkItem, [WalkItem]) {
        let level = WalkLevel(rawValue: step)!, above = WalkLevel(rawValue: step - 1)!
        let parent = flag(above, "Feel strong again", in: "Health")
        let mine = own.map { flag(level, $0, in: "Health", parent: parent.id, day: level == .week ? today : nil) }
        var s = state(step, kept: ["Health", "Home"], items: [parent] + mine)
        s.focus[level] = parent.id
        if examples { s.examplesOn = [step] }
        return (s, parent, mine)
    }

    @Test func examplesShowUnderARisenFlag() {
        let long = String(repeating: "Walk more every day. ", count: 10)
        for step in 2...4 {
            let level = WalkLevel(rawValue: step)!
            for own in [[], [long], ["One", "Two", long]] {
                let (s, parent, mine) = underTheParent(step, own: own)
                let layout = WalkLayout.make(s, today: today, footing: .level)
                #expect(layout.camera.k == 0.8)
                let risen = layout.banner(for: parent)!.frame
                let post = layout.post(level, area("Health").id)!
                let ghosts = post.banners.filter { $0.kind == .ghost }
                #expect(!ghosts.isEmpty, "step \(step) own \(own.count)")
                for g in ghosts {
                    #expect(g.frame.minY >= risen.maxY + 4 - 0.01 && g.frame.maxY <= post.base.y + 0.01, "\(g.frame)")
                    #expect(g.text == WalkCopy.examples(level).first { $0 == g.text })
                }
                let frames = post.banners.map(\.frame)
                for i in frames.indices { for j in frames.indices where j > i {
                    #expect(!Invariants.overlap(frames[i], frames[j]), "\(frames[i]) meets \(frames[j])")
                } }
                if let newest = mine.last {
                    let b = layout.banner(for: newest)!
                    #expect(b.lines == 1 && (b.kind == .full || b.kind == .compact), "step \(step): \(b.kind)")
                    #expect(b.more == (mine.count > 1 ? mine.count - 1 : nil))
                    #expect(post.banners.filter { $0.itemId != nil }.count == 1)
                }
                // Examples off again: no examples, and the flags as they stood before.
                var off = s
                off.examplesOn = []
                let plain = WalkLayout.make(off, today: today, footing: .level)
                #expect(plain.posts.flatMap(\.banners).allSatisfy { $0.kind != .ghost })
            }
        }
    }

    @Test func examplesOffLeavesTheFlagsWhole() {
        // A state where examples fold the flags: off again, no example shows and the flags stand at full size.
        for step in 2...4 {
            let (s, _, mine) = underTheParent(step, own: ["One", "Two", "Three"], examples: true)
            let folded = WalkLayout.make(s, today: today, footing: .level).banner(for: mine.last!)!
            #expect(folded.lines == 1 && folded.more == 2, "step \(step)")
            var off = s
            off.examplesOn = []
            let layout = WalkLayout.make(off, today: today, footing: .level)
            #expect(layout.posts.flatMap(\.banners).allSatisfy { $0.kind != .ghost })
            let whole = layout.banner(for: mine.last!)!
            #expect(whole.kind == .full && whole.lines == WalkLayout.lines(for: "Three", width: whole.frame.width) && whole.more == nil,
                    "step \(step): \(whole.kind) \(whole.lines) \(String(describing: whole.more))")
        }
    }

    @Test func examplesOffMatchesTheGoldenFrames() {
        // Zoomed on Health under a risen parent, three own flags, examples off: written out so any change shows.
        let golden: [Int: [(WalkLevel, WalkLayout.Kind, String, CGRect, Int)]] = [
            3: [(.season, .compact, "Feel strong again", CGRect(x: 142.5, y: 373.4, width: 105, height: 23), 1),
                (.month, .full, "Three", CGRect(x: 133, y: 461, width: 124, height: 35), 1),
                (.month, .stub(2), "+2", CGRect(x: 182, y: 437, width: 26, height: 20), 1)],
            4: [(.month, .compact, "Feel strong again", CGRect(x: 142.5, y: 389, width: 105, height: 23), 1),
                (.week, .full, "Three", CGRect(x: 133, y: 449, width: 124, height: 47), 1),
                (.week, .stub(2), "+2", CGRect(x: 182, y: 425, width: 26, height: 20), 1)],
        ]
        for (step, expected) in golden.sorted(by: { $0.key < $1.key }) {
            let (s, _, _) = underTheParent(step, own: ["One", "Two", "Three"], examples: false)
            let banners = WalkLayout.make(s, today: today, footing: .level).posts.flatMap(\.banners)
            #expect(banners.count == expected.count, "step \(step)")
            for (b, e) in zip(banners, expected) {
                #expect(b.level == e.0 && b.kind == e.1 && b.text == e.2 && b.lines == e.4, "step \(step): \(b.kind) \(b.text)")
                #expect(near(b.frame.minX, e.3.minX, 0.01) && near(b.frame.minY, e.3.minY, 0.01)
                        && near(b.frame.width, e.3.width, 0.01) && near(b.frame.height, e.3.height, 0.01),
                        "step \(step): \(b.text) \(b.frame) ≠ \(e.3)")
            }
        }
    }

    @Test func crowdedRidgesKeepTheLoweredFlagClear() {
        // The reviewer's two states, unzoomed under an unlabeled parent on a crowded ridge.
        for (step, keptCount, examples, dated) in [(2, 8, true, false), (4, 7, false, true)] {
            var s = WalkState()
            s.areas = ridge
            s.kept = ridge.prefix(keptCount).map(\.id)
            s.step = step
            let level = WalkLevel(rawValue: step)!, above = WalkLevel(rawValue: step - 1)!
            // The neighbours hold flags on the step's own level only, so nothing lifts the risen parent.
            for a in s.kept { s.items.append(WalkItem(id: UUID(), level: level, title: "Goal", areaId: a)) }
            let parent = WalkItem(id: UUID(), level: above, title: "Loose parent", areaId: nil)
            let own = WalkItem(id: UUID(), level: level, title: "Lift twice a week", areaId: nil, parentId: parent.id,
                               day: dated ? today : nil)
            s.items += [parent, own]
            s.focus[level] = parent.id
            if examples { s.examplesOn = [step] }
            let layout = WalkLayout.make(s, today: today, footing: .level)
            #expect(layout.camera == art.stops[step])
            let banners = layout.banners(on: level)
            for i in banners.indices { for j in banners.indices where j > i {
                #expect(!Invariants.overlap(banners[i].frame, banners[j].frame), "step \(step): \(banners[i].frame) meets \(banners[j].frame)")
            } }
            let mine = layout.banner(for: own)!
            #expect(mine.frame.width >= 44 && near(mine.frame.midX, layout.post(level, nil)!.base.x, 0.01) || mine.frame.minX <= 4.01 || mine.frame.maxX >= 385.99)
        }
    }

    @Test func aQuickStartFindsRoomForAnExample() {
        // No areas, a focused Year flag with no area (no zoom), one Season flag, examples on.
        let year = flag(.year, "Feel strong again")
        let season = flag(.season, "Lift twice a week", parent: year.id)
        var s = state(2, items: [year, season])
        s.focus[.season] = year.id
        s.examplesOn = [2]
        let layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.camera == art.stops[2])
        let risen = layout.banner(for: year)!.frame
        let post = layout.post(.season, nil)!
        let ghosts = post.banners.filter { $0.kind == .ghost }
        #expect(ghosts.first?.text == "Clear out the garage")
        #expect(post.banners.allSatisfy { !$0.frame.intersects(risen) || $0.frame.minY >= risen.maxY })
        #expect(layout.banner(for: season)?.kind == .compact)
        #expect(ghosts.first?.lines == 1 || ghosts.first?.lines == 2)
    }

    @Test func labelsKeepOffTheLight() {
        // Year, three kept areas and examples (the unlabeled post makes four columns).
        var s = state(1, kept: ["Health", "Home", "People"])
        s.examplesOn = [1]
        let layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.labels.count == 3)
        for l in layout.labels { #expect(Invariants.orbDistance(l.frame) >= 74, "\(l.name) \(l.frame)") }
        let nearest = layout.labels.min { abs($0.frame.midX - 195) < abs($1.frame.midX - 195) }!
        #expect(near(nearest.frame.minY, layout.labels.map(\.frame.minY).min()!, 0.01))
        // The ground, six labels: People (x 166) and Work (x 224) are equally near the centre; the leftmost stays up.
        var ground = state(1)
        ground.ground = true
        let labels = WalkLayout.make(ground, today: today, footing: .level).labels
        for l in labels { #expect(Invariants.orbDistance(l.frame) >= 74, "\(l.name)") }
        let upper = labels.map(\.frame.minY).min()!
        #expect(labels.filter { near($0.frame.minY, upper, 0.01) }.map(\.name) == ["Health", "People", "Money"])
    }

    @Test func thePictureStillFillsTheStageOnYear() {
        let year = art.stops[1]
        let bottomWorld = year.y + art.stage.height / year.k, rightWorld = year.x + art.stage.width / year.k
        #expect(year.y == -495)
        #expect(bottomWorld <= art.image.maxY && year.x >= art.image.minX && rightWorld <= art.image.maxX)
        #expect(near((art.bandY(.year) - year.y) * year.k, 535.5))
    }

    @Test func lookingBackUpShowsTheWholePlan() {
        // Three areas, two year goals, one season line, one month line and three week tasks each.
        let kept = ["Health", "Home", "People"]
        var items: [WalkItem] = []
        for name in kept {
            items += [flag(.year, "\(name) goal one", in: name), flag(.year, "\(name) goal two", in: name),
                      flag(.season, "\(name) season", in: name), flag(.month, "\(name) month", in: name)]
            items += (1...3).map { flag(.week, "\(name) task \($0)", in: name, day: today) }
        }
        var s = state(6, kept: kept, items: items)
        s.firstThing = items.last!.id
        let layout = WalkLayout.make(s, today: today, footing: .level)
        let expectedMore: [WalkLevel: Int?] = [.year: 1, .season: nil, .month: nil, .week: 2]
        for name in kept {
            for level in [WalkLevel.year, .season, .month, .week] {
                let post = layout.post(level, area(name).id)
                #expect(post?.banners.count == 1, "\(name) \(level)")
                guard let b = post?.banners.first else { continue }
                let newest = items.last { $0.level == level && $0.areaId == area(name).id }!
                #expect(b.kind == .compact && b.itemId == newest.id && b.text == newest.title)
                #expect(b.more == expectedMore[level]!, "\(name) \(level) \(String(describing: b.more))")
            }
        }
        #expect(layout.posts.flatMap(\.banners).allSatisfy { if case .stub = $0.kind { return false }; return true })
    }

    @Test func openingAStackOnLookingBackUpShowsMore() {
        let month = flag(.month, "Home month", in: "Home")
        let weeks = (1...4).map { flag(.week, "Week task \($0)", in: "Home") }
        var s = state(6, kept: ["Health", "Home"], items: [month] + weeks)
        s.expanded = WalkPostKey(level: .week, column: area("Home").id)
        let layout = WalkLayout.make(s, today: today, footing: .level)
        let week = layout.banners(on: .week)
        let monthFrame = layout.banner(for: month)!.frame
        #expect(week.count >= 2 && week.allSatisfy { $0.kind == .compact })
        #expect(week.compactMap(\.itemId).count + (week.last?.more ?? 0) == 4)
        #expect(week.allSatisfy { !$0.frame.intersects(monthFrame) })
    }

    @Test func peaksInTheQuestionAreNotLabeled() {
        // Zoomed on Week, the Year band is at stage y 160: its labels would sit in the question.
        let (s, _) = zoomed(on: 4)
        #expect(WalkLayout.make(s, today: today, footing: .level).labels.isEmpty)
        #expect(!WalkLayout.make(state(4, kept: ["Health", "Home"]), today: today, footing: .level).labels.isEmpty)
    }

    @Test func anExampleKeepsItsIdWhenAnotherIsPlanted() {
        var s = state(1)
        s.examplesOn = [1]
        let before = WalkLayout.make(s, today: today, footing: .level).posts.flatMap(\.banners).filter { $0.kind == .ghost }
        s.items = [flag(.year, "Run a 5K")]
        let after = WalkLayout.make(s, today: today, footing: .level).posts.flatMap(\.banners).filter { $0.kind == .ghost }
        #expect(after.count == 2)
        for ghost in after { #expect(before.first { $0.text == ghost.text }?.id.hasSuffix(ghost.text) == true) }
        #expect(Set(after.map(\.id)).isSubset(of: Set(before.map(\.id))))
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

    // MARK: Levels

    @Test func levelsAboveAreSmallFlags() {
        let year = flag(.year, "Feel strong again", in: "Health")
        let season = flag(.season, "Lift twice a week", in: "Health", parent: year.id)
        let other = flag(.season, "Walk every day", in: "Home")
        var s = state(3, kept: ["Health", "Home"], items: [year, season, other])
        var layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.banners(on: .year).allSatisfy { $0.kind == .tip })
        #expect(layout.banners(on: .season).allSatisfy { $0.kind == .tip })
        // A small flag's frame is its pennant: from 1.5 left of the pole to 23.5 right, scaled with distance.
        for (lvl, scale) in [(WalkLevel.year, 0.9), (.season, 1.0)] as [(WalkLevel, CGFloat)] {
            for post in layout.posts(on: lvl) { for b in post.banners {
                #expect(near(b.frame.minX, post.base.x - 1.5 * scale, 0.01) && near(b.frame.maxX, post.base.x + 23.5 * scale, 0.01),
                        "\(lvl) \(b.frame) at pole \(post.base.x)")
                #expect(near(b.frame.height, 20 * scale, 0.01))
            } }
        }

        s.focus[.month] = season.id
        layout = WalkLayout.make(s, today: today, footing: .level)
        let focused = layout.banner(for: season)!
        #expect(focused.kind == .compact && focused.glows)
        #expect(layout.banner(for: other)?.kind == .tip)

        let month = flag(.month, "Book the gym", in: "Health"), week = flag(.week, "Gym", in: "Home")
        var end = state(6, kept: ["Health", "Home"], items: [year, season, other, month, week])
        end.firstThing = week.id
        #expect(WalkLayout.make(end, today: today, footing: .level).posts.flatMap(\.banners).allSatisfy { $0.kind == .compact })
    }

    @Test func theFirstThingStandsOnTheTodayBand() {
        let week = flag(.week, "Send the deposit", in: "Home", day: today)
        var s = state(5, kept: ["Health", "Home"], items: [week])
        s.firstThing = week.id
        let layout = WalkLayout.make(s, today: today, footing: .level)
        let banners = layout.banners(on: .today)
        #expect(banners.count == 1)
        #expect(banners.first?.tag == WalkCopy.firstThingTag && banners.first?.itemId == week.id)
        #expect(layout.posts(on: .today).first?.key.column == area("Home").id)
        #expect(layout.posts(on: .today).first?.base.x == layout.post(.week, area("Home").id)?.base.x)
    }

    @Test func weekBannersCarryTheirDay() {
        let year = flag(.year, "Finish the bathroom", in: "Home")
        let season = flag(.season, "Tile the floor", in: "Home")
        let month = flag(.month, "Pick the tile", in: "Home")
        let dated = flag(.week, "Call the tile shop", in: "Home", day: day(2026, 11, 17))
        let loose = flag(.week, "Measure the floor", in: "Home")
        let layout = WalkLayout.make(state(4, kept: ["Home"], items: [year, season, month, dated, loose]), today: today, footing: .level)
        #expect(layout.banner(for: dated)?.tag == "TUESDAY")
        #expect(layout.banner(for: loose)?.tag == nil)
        #expect([year, season, month].allSatisfy { layout.banner(for: $0)?.tag == nil })
    }

    @Test func levelsBelowTheStepAreNotDrawn() {
        // Backed up to Year with a Season flag planted: it waits off the picture, clear of the orb.
        let season = flag(.season, "Lift twice a week", in: "Home")
        let year = flag(.year, "Feel strong again", in: "Home")
        let layout = WalkLayout.make(state(1, kept: ["Home"], items: [year, season]), today: today, footing: .level)
        #expect(layout.posts(on: .season).isEmpty)
        #expect(layout.banner(for: season) == nil)
        #expect(layout.banner(for: year) != nil)
        // Welcome draws no posts and no labels: the bare vista.
        let welcome = WalkLayout.make(state(0, kept: ["Health", "Home", "People"], items: [year, season]), today: today, footing: .level)
        #expect(welcome.posts.isEmpty && welcome.labels.isEmpty)
    }

    // MARK: Zoomed in close

    /// Health kept, flags down the Health column to `step`'s level, the step focused on the flag above.
    private func zoomed(on step: Int) -> (WalkState, [WalkLevel: WalkItem]) {
        var flags: [WalkLevel: WalkItem] = [:]
        var items: [WalkItem] = []
        var parent: UUID?
        for raw in 1...min(step, 4) {
            let level = WalkLevel(rawValue: raw)!
            if level == .year { items.append(flag(.year, "Swim in the lake", in: "Health")) }
            let item = flag(level, "Feel strong \(raw)", in: "Health", parent: parent)
            items.append(item)
            flags[level] = item
            parent = item.id
        }
        var s = state(step, kept: ["Health", "Home"], items: items)
        let level = WalkLevel(rawValue: step)!
        s.focus[level] = flags[WalkLevel(rawValue: step - 1)!]!.id
        if step == 5 { s.firstThing = flags[.week]!.id }
        return (s, flags)
    }

    @Test func zoomedOnMonthTheYearPostWaits() {
        // Year's band is at stage y 264: not even a stub fits under the question line.
        let (s, flags) = zoomed(on: 3)
        let layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.camera.k == 0.8)
        #expect(layout.posts(on: .year).isEmpty)
        #expect(layout.posts(on: .season).isEmpty == false)
        #expect(layout.banner(for: flags[.month]!) != nil)
        #expect(layout.posts.flatMap(\.banners).allSatisfy { $0.frame.minY >= 250 })
    }

    @Test func zoomedOnWeekAndTodayTheHighPostsWait() {
        let (week, weekFlags) = zoomed(on: 4)
        let w = WalkLayout.make(week, today: today, footing: .level)
        #expect(w.camera.k == 0.8)
        #expect(w.posts(on: .year).isEmpty)
        #expect(!w.posts(on: .season).isEmpty && !w.posts(on: .month).isEmpty)
        #expect(w.banner(for: weekFlags[.week]!) != nil)
        #expect(w.posts.flatMap(\.banners).allSatisfy { $0.frame.minY >= 250 })

        let (day, dayFlags) = zoomed(on: 5)
        let t = WalkLayout.make(day, today: today, footing: .level)
        #expect(t.camera.k == 0.8)
        #expect(t.posts(on: .year).isEmpty && t.posts(on: .season).isEmpty)
        #expect(!t.posts(on: .month).isEmpty && !t.posts(on: .week).isEmpty)
        #expect(t.banners(on: .today).map(\.itemId) == [dayFlags[.week]!.id])
        #expect(t.posts.flatMap(\.banners).allSatisfy { $0.frame.minY >= 250 })
    }

    // MARK: Examples

    @Test func examplesHangOnAPostNotInTheSky() {
        var s = state(1)
        s.examplesOn = [1]
        var layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.posts.count == 1)
        let post = layout.posts[0]
        #expect(post.pale && post.key == WalkPostKey(level: .year, column: nil))
        #expect(near(post.base.y, 535.5))
        #expect(post.banners.filter { $0.kind == .ghost }.map(\.text) == WalkCopy.examples(.year))

        s.items = [flag(.year, "Run a 5K")]
        layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.posts.flatMap(\.banners).filter { $0.kind == .ghost }.count == 2)
        #expect(layout.posts.allSatisfy { !$0.pale })
    }

    @Test func aPlantedExampleDoesNotComeBack() {
        let gym = flag(.week, "Gym", in: "Home")
        var s = state(4, kept: ["Home"], items: [gym])
        s.examplesOn = [4]
        var ghosts = WalkLayout.make(s, today: today, footing: .level).posts.flatMap(\.banners).filter { $0.kind == .ghost }
        #expect(ghosts.map(\.text) == ["Call the tile shop"])

        s.items.append(flag(.week, "call the tile shop", in: "Home"))
        ghosts = WalkLayout.make(s, today: today, footing: .level).posts.flatMap(\.banners).filter { $0.kind == .ghost }
        #expect(ghosts.isEmpty)
    }

    // MARK: VoiceOver

    @Test func bannersSayWhatATapDoes() {
        let mine = flag(.year, "Run a 5K", in: "Home")
        let theirs = flag(.year, "Run a 5K", in: "Health", mine: false)
        var s = state(1, kept: ["Health", "Home"], items: [mine, theirs])
        var layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.banner(for: mine)?.label == "Year: Run a 5K, tap to move or remove")
        #expect(layout.banner(for: theirs)?.label == "Year: Run a 5K")

        s.step = 2
        layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.banner(for: mine)?.label == "Year: Run a 5K, tap to focus")
        s.focus[.season] = mine.id
        layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.banner(for: mine)?.label == "Year: Run a 5K, focused, tap to let go")

        var ex = state(1)
        ex.examplesOn = [1]
        let ghost = WalkLayout.make(ex, today: today, footing: .level).posts.flatMap(\.banners).first { $0.kind == .ghost }
        #expect(ghost?.label == "Example: Run a 5K, tap to make it yours")

        let crowd = (1...8).map { flag(.year, "Goal \($0)", in: "Home") }
        let stub = WalkLayout.make(state(1, kept: ["Health", "Home", "People"], items: crowd), today: today, footing: .level)
            .posts.flatMap(\.banners).first { $0.kind == .stub(2) }
        #expect(stub?.label == "2 more, tap to show")

        var ground = state(1)
        ground.ground = true
        #expect(WalkLayout.make(ground, today: today, footing: .level).labels.first?.hint == "Tap to keep")
        #expect(WalkLayout.make(state(3, kept: ["Home"]), today: today, footing: .level).labels.first?.hint == nil)
    }

    /// VoiceOver reads a flag that does nothing on a tap as plain text, and a peak as
    /// selected when it is kept (on the ground) or focused (on Year).
    @Test func voiceOverKnowsWhatTakesATapAndWhatIsSelected() {
        let mine = flag(.year, "Run a 5K", in: "Home")
        let theirs = flag(.year, "Read more", in: "Health", mine: false)
        var s = state(1, kept: ["Health", "Home"], items: [mine, theirs])
        var layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.banner(for: mine)?.taps == true)
        #expect(layout.banner(for: theirs)?.taps == false)
        #expect(layout.labels.allSatisfy { !$0.selected })
        s.focusArea = area("Home").id
        layout = WalkLayout.make(s, today: today, footing: .level)
        #expect(layout.labels.filter(\.selected).map(\.name) == ["Home"])

        s.step = 2
        #expect(WalkLayout.make(s, today: today, footing: .level).banner(for: theirs)?.taps == true)      // tap to focus
        // Below Year the peaks take no tap, so none is offered as selected, focused or not.
        let faded = WalkLayout.make(s, today: today, footing: .level).labels
        #expect(faded.contains { $0.focused && !$0.tappable })
        #expect(faded.allSatisfy { !$0.selected })

        var ground = state(1, kept: ["Home"])
        ground.ground = true
        let peaks = WalkLayout.make(ground, today: today, footing: .level).labels
        #expect(peaks.filter(\.selected).map(\.name) == ["Home"])

        var ex = state(1)
        ex.examplesOn = [1]
        #expect(WalkLayout.make(ex, today: today, footing: .level).posts.flatMap(\.banners).first { $0.kind == .ghost }?.taps == true)

        let crowd = (1...8).map { flag(.year, "Goal \($0)", in: "Home") }
        let stub = WalkLayout.make(state(1, kept: ["Health", "Home", "People"], items: crowd), today: today, footing: .level)
            .posts.flatMap(\.banners).first { $0.kind == .stub(2) }
        #expect(stub?.taps == true)

        // Look back up: a lone flag is only read; one carrying "+n" opens its post.
        let lone = flag(.year, "Run a 5K", in: "Home")
        let pair = [flag(.year, "Swim", in: "Health"), flag(.year, "Cycle", in: "Health")]
        let back = WalkLayout.make(state(6, kept: ["Health", "Home"], items: [lone] + pair), today: today, footing: .level)
        #expect(back.banner(for: lone)?.taps == false)
        #expect(back.banners(on: .year).first { $0.more != nil }?.taps == true)

        let week = flag(.week, "Send the deposit", in: "Home", day: today)
        var t = state(5, kept: ["Home"], items: [week])
        t.firstThing = week.id
        #expect(WalkLayout.make(t, today: today, footing: .level).banners(on: .today).first?.taps == true)
        t.items[0].mine = false
        #expect(WalkLayout.make(t, today: today, footing: .level).banners(on: .today).first?.taps == true)       // tap to focus
        t.step = 6
        #expect(WalkLayout.make(t, today: today, footing: .level).banners(on: .today).first?.taps == false)
    }

    /// VoiceOver offers a flag as a button exactly when the reducer does something with
    /// the tap the scene would send for it, in every generated state.
    @Test func aBannerTakesATapExactlyWhenTheReducerActsOnIt() {
        let env = WalkEnv(periods: WalkPeriods.pick(now: today, weekStartsOn: 0), now: today)
        let states = Generated.all, layouts = Generated.naturalLayouts
        let found: [[String]] = Generated.parallel(states.count) { i in
            let s = states[i]
            var disagreements: [String] = []
            for post in layouts[i].posts {
                for banner in post.banners {
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
            return disagreements
        }
        let disagreements = found.flatMap { $0 }
        #expect(disagreements.isEmpty, "\(disagreements.count): \(Set(disagreements.map { $0.components(separatedBy: ": ").dropFirst().joined(separator: ": ") }).sorted().prefix(12))")
    }

    @Test func theFirstThingSaysItCanBePulledUp() {
        let week = flag(.week, "Send the deposit", in: "Home", day: today)
        var s = state(5, kept: ["Home"], items: [week])
        s.firstThing = week.id
        let label = WalkLayout.make(s, today: today, footing: .level).banners(on: .today).first?.label
        #expect(label == WalkCopy.bannerLabel(week.title, level: .today, tag: WalkCopy.firstThingTag, role: .firstThingMine))
        // Not planted by this walk: a tap focuses it, as it would any week flag on Today.
        s.items[0].mine = false
        let theirs = WalkLayout.make(s, today: today, footing: .level).banners(on: .today).first?.label
        #expect(theirs == WalkCopy.bannerLabel(week.title, level: .today, tag: WalkCopy.firstThingTag, role: .firstThingFocusable))
        s.focus[.today] = week.id
        let focused = WalkLayout.make(s, today: today, footing: .level).banners(on: .today).first?.label
        #expect(focused == WalkCopy.bannerLabel(week.title, level: .today, tag: WalkCopy.firstThingTag, role: .firstThingFocused))
        // Looking back up, it is only read.
        s.step = 6
        let back = WalkLayout.make(s, today: today, footing: .level).banners(on: .today).first?.label
        #expect(back == WalkCopy.bannerLabel(week.title, level: .today, tag: WalkCopy.firstThingTag, role: .firstThing))
    }

    // MARK: Words in a banner

    @Test func longTitlesStayInsideTheirBanner() {
        let long = String(repeating: "Walk more. ", count: 20).prefix(200)
        let word = String(repeating: "a", count: 60)
        let kept = ["Health", "Home", "People"]
        let a = flag(.year, String(long), in: "Health"), b = flag(.year, word, in: "Home")
        let layout = WalkLayout.make(state(1, kept: kept, items: [a, b]), today: today, footing: .level)
        for item in [a, b] {
            let banner = layout.banner(for: item)!
            #expect(banner.lines == 3 && near(banner.frame.height, 67, 0.01) && banner.text == item.title)
        }
        let year = flag(.year, "Finish the bathroom", in: "Home")
        let dated = flag(.week, word, in: "Home", day: day(2026, 11, 17))
        let week = WalkLayout.make(state(4, kept: kept, items: [year, dated]), today: today, footing: .level).banner(for: dated)!
        #expect(week.lines == 3 && near(week.frame.height, 79, 0.01))
        #expect(WalkLayout.lines(for: String(long), width: 99) == 3)
        #expect(WalkLayout.lines(for: "Gym", width: 62) == 1)
    }

    @Test func theNeedlePointsDownOnceSomethingIsPlanted() {
        #expect(WalkLayout.make(state(0), today: today, footing: .level).needleDown)
        var s = state(1, kept: ["Home"])
        #expect(!WalkLayout.make(s, today: today, footing: .level).needleDown)
        s.items = [flag(.year, "Run a 5K", in: "Home")]
        #expect(WalkLayout.make(s, today: today, footing: .level).needleDown)
        let week = flag(.week, "Gym", in: "Home")
        var t = state(5, kept: ["Home"], items: [week])
        #expect(!WalkLayout.make(t, today: today, footing: .level).needleDown)
        t.firstThing = week.id
        #expect(WalkLayout.make(t, today: today, footing: .level).needleDown)
    }

    @Test func theSameStateGivesTheSameLayout() {
        let items = (1...5).map { flag(.year, "Goal \($0)", in: names[$0 % 3]) }
        let s = state(1, kept: Array(names.prefix(3)), items: items)
        #expect(WalkLayout.make(s, today: today, footing: .level) == WalkLayout.make(s, today: today, footing: .level))
        #expect(WalkLayout.make(s, today: today) == WalkLayout.make(s, today: today))
    }

    // MARK: Many states

    /// The sweep, measured on what is drawn: the planted-by-hand layout (the app's) and the ruled one.
    @Test(arguments: [WalkFooting.natural, .level]) func nothingOverlaps(_ footing: WalkFooting) {
        let states = Generated.all, layouts = Generated.layouts(footing)
        let found = Generated.parallel(states.count) { Invariants.check(layouts[$0], states[$0]) }
        var checked = 0
        for (s, problems) in zip(states, found) {
            #expect(problems.isEmpty, "\(footing) \(Generated.describe(s)): \(problems.prefix(3))")
            if !problems.isEmpty { return }
            checked += 1
        }
        #expect(checked >= 3500)
    }

    /// The controls under the light, in every generated state at rest, with the Undo pill, with
    /// notes, with speech off, with the compass open, speaking and with the light being taught, on
    /// both footings: the Next line, the hint line, the Undo pill and the lesson never meet each
    /// other or the light's ring (and so its touch), at rest never a flag or a label (open or
    /// taught, they sit on the veil over the scene, as the points' words do), stay on the stage
    /// below the question and above the home-indicator zone; the hint is always one line.
    @Test(arguments: [WalkFooting.natural, .level]) func theControlsUnderTheLightKeepClear(_ footing: WalkFooting) {
        let insetTop = art.stage.height - WalkLayout.homeIndicator
        let notes = [WalkCopy.nothingToPlant, WalkCopy.ridgeFull, WalkCopy.speechOff]
        let periods = WalkPeriods.pick(now: today)
        let states = Generated.all, layouts = Generated.layouts(footing)
        let bases = states.indices.filter { (0...5).contains(states[$0].step) }
        let swept: [[(WalkState, [String])]] = Generated.parallel(bases.count) { n in
            let base = states[bases[n]], layout = layouts[bases[n]]
            let drawn = layout.posts.flatMap(\.banners).map(\.drawn) + layout.labels.map(\.frame)
            var variants = [base]
            var undo = base; undo.undo = [.plant(uid(1))]; undo.undoShowing = true; variants.append(undo)
            for note in notes { var v = base; v.note = note; variants.append(v) }
            var off = base; off.speechIsOff = true; variants.append(off)
            var open = base; open.orb = .open; variants.append(open)
            var speaking = base; speaking.orb = .speaking(live: "x"); variants.append(speaking)
            var taught = base; taught.teaching = (1...5).contains(base.step) && !base.ground; variants.append(taught)
            return variants.map { v -> (WalkState, [String]) in
                let frames = [("next", WalkLayout.nextFrame(v)), ("hint", WalkLayout.hintFrame(v)),
                              ("undo", WalkLayout.undoFrame(v)), ("lesson", WalkLayout.teachFrame(v)),
                              ("more", WalkLayout.moreFrame(v))]
                    .compactMap { name, f in f.map { (name, $0) } }
                var problems: [String] = []
                for (i, a) in frames.enumerated() {
                    for b in frames[(i + 1)...] where Invariants.overlap(a.1, b.1) { problems.append("\(a.0) meets \(b.0)") }
                    if Invariants.orbDistance(a.1) <= WalkLayout.ring { problems.append("\(a.0) \(a.1) meets the ring") }
                    if !v.showsVeil {
                        for d in drawn where Invariants.overlap(a.1, d) { problems.append("\(a.0) \(a.1) meets \(d)") }
                    }
                    if a.1.minX < 0 || a.1.maxX > art.stage.width || a.1.minY < WalkLayout.question { problems.append("\(a.0) leaves the stage") }
                    if a.1.maxY > insetTop + 0.01 { problems.append("\(a.0) \(a.1) in the home-indicator zone") }
                }
                let hint = WalkCopy.hint(v)
                if !hint.isEmpty, WalkLayout.hintLines(hint) != 1 { problems.append("“\(hint)” wraps") }
                if (WalkLayout.nextFrame(v) != nil) != (WalkCopy.nextLine(v, periods) != nil) {
                    problems.append("the Next line's frame and words disagree")
                }
                // "More" stays clear of the Next line's own words (estimated: 16 pt words and the arrow, centred).
                if let more = WalkLayout.moreFrame(v), let next = WalkLayout.nextFrame(v),
                   let line = WalkCopy.nextLine(v, periods) {
                    let words = CGFloat(line.text.count) * 8.2 + 26
                    if more.maxX > next.midX - min(words, next.width) / 2 { problems.append("More meets the Next line's words") }
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
        #expect(checked >= 20_000)
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
            if line.text.count > 0, !line.detail, s.step > 0, at == .s, CGFloat(line.text.count) * WalkLayout.labelChar + 4
                > WalkLayout.southLabelWidth / 0.8 { problems.append("the bottom label “\(line.text)” is too long to shrink") }
        }
        return problems
    }

    /// Looking back up, a post's shown flag takes two lines where its words need them, with
    /// its "+n more"; every guarantee holds (the generated sweep). With one to eight areas, long
    /// titles are seen on two lines (at least one flag each time), on both footings.
    @Test func lookingBackUpTheShownFlagTakesTwoLines() {
        for keptCount in 1...WalkLoad.maxAreas {
            var s = WalkState()
            s.areas = ridge
            s.kept = ridge.prefix(keptCount).map(\.id)
            s.step = 6
            var n = 0
            for raw in 1...4 {
                for a in s.kept { for _ in 0..<2 {
                    n += 1
                    s.items.append(WalkItem(id: uid(n), level: WalkLevel(rawValue: raw)!,
                                            title: "Finish the bathroom before spring comes round", areaId: a))
                } }
            }
            for footing in [WalkFooting.natural, .level] {
                let layout = WalkLayout.make(s, today: today, footing: footing)
                #expect(Invariants.check(layout, s).isEmpty, "\(keptCount) areas \(footing)")
                let two = layout.posts.flatMap(\.banners).filter { $0.kind == .compact && $0.lines == 2 }
                #expect(!two.isEmpty, "\(keptCount) areas \(footing): no flag on two lines")
            }
        }
    }

    /// Welcome, the ground and every step with every point offered (Undo, the calendar, examples):
    /// the words sweep on its own, at today's periods and July's.
    @Test func thePointsWordsKeepClear() {
        var states: [WalkState] = [WalkState()]
        var g = WalkState(); g.step = 1; g.ground = true; g.undo = [.plant(uid(1))]; g.orb = .open; states.append(g)
        for step in 1...5 {
            var s = WalkState(); s.step = step; s.undo = [.plant(uid(1))]; s.calendarOffer = true; s.orb = .open
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

    /// A post's band point (its base less its footing) is on its band; the footing stays within its bound.
    @Test func postsStandOnTheirBand() {
        for (s, layout) in zip(Generated.all, Generated.naturalLayouts) {
            for post in layout.posts {
                let worldY = (post.base.y - post.footing) / layout.camera.k + layout.camera.y
                let fraction = (worldY - art.image.minY) / art.image.height
                guard abs(worldY - art.bandY(post.key.level)) <= 0.5, art.land[post.key.level]!.contains(fraction),
                      abs(post.footing) <= WalkFooting.ground + 0.001 else {
                    Issue.record("\(Generated.describe(s)): \(post.id) at \(worldY), band \(art.bandY(post.key.level)), footing \(post.footing)")
                    return
                }
            }
        }
    }
}

// MARK: - The generator

/// Every count of kept areas, with and without the unlabeled post, one to six flags
/// on every post of every level up to the step, each step, and six ways of
/// touching it (nothing; a focus; examples; examples, focus and a selection; a
/// selection, focus and an open stack; a focus over a tall stack of long dated
/// flags in the first column, with examples, the last planted elsewhere, and on
/// Look back up that column's week post open). Ids, titles and counts are fixed.
enum Generated {
    static let titles = [
        "Gym",
        "Finish the bathroom before spring",
        String(String(repeating: "Walk more every day. ", count: 10).prefix(200)),
        String(repeating: "x", count: 60),
        "Call Mum",
    ]

    static func states() -> [WalkState] {
        var out: [WalkState] = []
        out += ground()
        out += crowded()
        for step in 1...6 {
            for keptCount in 1...WalkLoad.maxAreas {
                for unlabeled in [false, true] {
                    for perPost in 1...6 {
                        for variant in 0..<6 {
                            out.append(make(step: step, keptCount: keptCount, unlabeled: unlabeled,
                                            perPost: perPost, variant: variant))
                        }
                    }
                }
            }
        }
        return out
    }

    /// The generated states, built once: `states()` is a fixed list, so every sweep reads the same one.
    static let all: [WalkState] = states()

    /// Each generated state's layout on each footing, at the state's index in `all`: built once, on
    /// every core, and shared by every sweep that reads it (a layout is a pure function of its state).
    static let naturalLayouts: [WalkLayout] = build(.natural)
    static let levelLayouts: [WalkLayout] = build(.level)

    static func layouts(_ footing: WalkFooting) -> [WalkLayout] { footing == .natural ? naturalLayouts : levelLayouts }

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

    /// The ground and Welcome: every count of kept labels, with old Year flags on some.
    /// Crowded ridges: 7 or 8 areas and the unlabeled post, two flags on every kept post of every
    /// level to the step, the focus on an unlabeled parent (so no zoom: little room under it),
    /// 1 to 6 own unlabeled flags (dated or not on Week), with examples on and off, and the
/// neighbours' flags on every level or on the step's own level only.
    static func crowded() -> [WalkState] {
        var out: [WalkState] = []
        var n = 50_000
        for step in 2...4 {
            for keptCount in [7, 8] {
                for examples in [false, true] {
                    for own in 1...6 {
                        for dated in step == 4 ? [false, true] : [false] { for ownLevelOnly in [false, true] {
                            var s = WalkState()
                            s.areas = ridge
                            s.kept = ridge.prefix(keptCount).map(\.id)
                            s.step = step
                            let level = WalkLevel(rawValue: step)!, above = WalkLevel(rawValue: step - 1)!
                            for raw in (ownLevelOnly ? step : 1)...step {
                                for a in s.kept { for i in 0..<2 {
                                    n += 1
                                    s.items.append(WalkItem(id: uid(n), level: WalkLevel(rawValue: raw)!,
                                                            title: titles[(n + i) % titles.count], areaId: a))
                                } }
                            }
                            n += 1
                            let parent = WalkItem(id: uid(n), level: above, title: "Loose parent", areaId: nil)
                            s.items.append(parent)
                            for i in 0..<own {
                                n += 1
                                s.items.append(WalkItem(id: uid(n), level: level, title: titles[(n + i) % titles.count],
                                                        areaId: nil, parentId: parent.id, day: dated ? today : nil))
                            }
                            s.focus[level] = parent.id
                            if examples { s.examplesOn = [step] }
                            out.append(s)
                        } }
                    }
                }
            }
        }
        return out
    }

    static func ground() -> [WalkState] {
        var out: [WalkState] = []
        for keptCount in 0...WalkLoad.maxAreas {
            for perPost in [0, 2, 6] {
                var s = WalkState()
                s.areas = ridge
                s.kept = ridge.prefix(keptCount).map(\.id)
                s.step = 1
                s.ground = true
                var n = 0
                for a in ridge { for i in 0..<perPost {
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
        return out
    }

    static func make(step: Int, keptCount: Int, unlabeled: Bool, perPost: Int, variant: Int) -> WalkState {
        var s = WalkState()
        s.areas = ridge
        s.kept = ridge.prefix(keptCount).map(\.id)
        s.step = step
        s.depth = .quick
        let columns: [UUID?] = s.kept.map { Optional($0) } + (unlabeled ? [nil] : [])
        let top = min(step, 4)
        var n = 0
        var parents: [WalkLevel: [WalkItem]] = [:]
        for raw in 1...top {
            let level = WalkLevel(rawValue: raw)!
            for (c, column) in columns.enumerated() {
                let tall = variant == 5 && c == 0
                let count = variant == 2 || tall ? perPost : 1 + (perPost + c + raw - 1) % 6
                for i in 0..<count {
                    n += 1
                    let parent = raw > 1 ? parents[WalkLevel(rawValue: raw - 1)!]?.first : nil
                    let item = WalkItem(id: uid(n), level: level, title: tall ? titles[2] : titles[(n + c + i) % titles.count],
                                        areaId: column, parentId: parent?.id,
                                        day: level == .week && (tall || i % 2 == 0) ? today : nil, mine: i % 3 != 2)
                    s.items.append(item)
                    parents[level, default: []].append(item)
                }
            }
        }
        // Flags below the step (a walk backed up): never drawn before step 6.
        if variant == 1 || variant == 4, step < 4 {
            n += 1
            s.items.append(WalkItem(id: uid(n), level: WalkLevel(rawValue: step + 1)!, title: "Below", areaId: columns.first ?? nil))
        }
        let level = s.level
        let weeks = s.items(on: .week)
        if step >= 5, !weeks.isEmpty { s.firstThing = weeks[(perPost * 7) % weeks.count].id }

        let focus = variant == 1 || variant == 3 || variant == 4
        let examples = variant == 2 || variant == 3
        let select = variant == 3 || variant == 4
        if focus, let level {
            if level == .year {
                s.focusArea = s.kept[keptCount / 2]
            } else {
                let above = s.items(on: WalkLevel(rawValue: level.rawValue - 1)!)
                if !above.isEmpty { s.focus[level] = above[(perPost * 5 + keptCount) % above.count].id }
            }
        }
        if examples, (1...4).contains(step) { s.examplesOn = [step] }
        if select, let level {
            if level == .today {
                if let first = s.item(s.firstThing), first.mine { s.selected = first.id }
            } else {
                let own = s.items(on: level).filter(\.mine)
                if !own.isEmpty { s.selected = own[(perPost * 3) % own.count].id }
            }
        }
        if variant == 5 {
            let first = columns.first ?? nil
            if let level, level != .year, let above = WalkLevel(rawValue: level.rawValue - 1) {
                let parents = s.items(on: above == .today ? .week : above).filter { $0.areaId == first }
                if let p = parents.first { s.focus[level] = p.id }
                if level == .today, let last = parents.last { s.firstThing = last.id }
            }
            if (1...4).contains(step) { s.examplesOn = [step] }
            for raw in 1...4 {
                let lvl = WalkLevel(rawValue: raw)!
                if let last = s.items(on: lvl).last(where: { $0.areaId == columns.last ?? nil }) { s.lastPlanted[lvl] = last.id }
            }
            if step == 6 { s.expanded = WalkPostKey(level: .week, column: first) }
        }
        if variant == 4, let column = columns.last {
            let expandLevel = level ?? .month
            s.expanded = WalkPostKey(level: expandLevel == .today ? .week : expandLevel, column: column)
        }
        return s
    }

    static func describe(_ s: WalkState) -> String {
        let counts = WalkLevel.allCases.map { "\(s.items(on: $0).count)" }.joined(separator: "/")
        return "step \(s.step) ground \(s.ground) kept \(s.kept.count) items \(counts) focusArea \(s.focusArea != nil) "
            + "focus \(s.focus.count) examples \(s.examplesOn) selected \(s.selected != nil) expanded \(s.expanded != nil)"
    }
}

// MARK: - The invariants

/// A banner with its drawn outline worked out once: a sweep reads a banner's outline for every
/// pair it is in, and turning it afresh each time was most of the sweeps' cost. Everything else
/// reads through to the banner.
@dynamicMemberLookup
struct Measured {
    let banner: WalkLayout.Banner
    let corners: [CGPoint]
    let drawn: CGRect
    init(_ banner: WalkLayout.Banner) { self.banner = banner; corners = banner.corners; drawn = banner.drawn }
    subscript<T>(dynamicMember path: KeyPath<WalkLayout.Banner, T>) -> T { banner[keyPath: path] }
}

/// The layout's guarantees, measured on what is drawn: each banner's turned outline's bounding box
/// (`drawn`); two banners on one post by their outlines themselves, as a stack turns as one.
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

    static func meetsOrb(_ r: CGRect) -> Bool {
        let c = WalkOrb.centre
        let x = min(max(c.x, r.minX), r.maxX), y = min(max(c.y, r.minY), r.maxY)
        return hypot(c.x - x, c.y - y) <= WalkOrb.radius
    }

    static func ceiling(_ level: WalkLevel, _ s: WalkState, _ camera: WalkLayout.Camera) -> CGFloat {
        if level == .year || (s.step != 6 && level == s.level) { return 250 }
        let above = WalkLevel(rawValue: level.rawValue - 1)!
        return max(250, (art.bandY(above) - camera.y) * camera.k + 6)
    }

    static func check(_ layout: WalkLayout, _ s: WalkState) -> [String] {
        var problems: [String] = []
        let cam = layout.camera
        let zoomed = cam != art.stops[s.step]
        let banners = layout.posts.flatMap(\.banners).map(Measured.init)
        let postOf = Dictionary(layout.posts.flatMap { post in post.banners.map { ($0.id, post.id) } }, uniquingKeysWith: { a, _ in a })
        func meet(_ a: Measured, _ b: Measured) -> Bool {
            postOf[a.id] == postOf[b.id] ? WalkTurn.meet(a.corners, b.corners) : overlap(a.drawn, b.drawn)
        }

        // No two banners of one level meet.
        for level in WalkLevel.allCases {
            let mine = banners.filter { $0.level == level }
            for i in mine.indices { for j in mine.indices where j > i && meet(mine[i], mine[j]) {
                problems.append("\(level): \(mine[i].id) \(mine[i].drawn) meets \(mine[j].id) \(mine[j].drawn)")
            } }
        }
        // No two labels meet.
        for i in layout.labels.indices { for j in layout.labels.indices where j > i
            && overlap(layout.labels[i].frame, layout.labels[j].frame) {
            problems.append("labels \(layout.labels[i].name) and \(layout.labels[j].name) meet")
        } }
        // Where labels take taps, no banner covers one; elsewhere no label takes a tap.
        if s.step == 1 || s.ground {
            for label in layout.labels { for b in banners where overlap(label.frame, b.drawn) {
                problems.append("\(b.id) \(b.drawn) covers label \(label.name) \(label.frame)")
            } }
        } else if layout.labels.contains(where: \.tappable) {
            problems.append("a label takes taps on step \(s.step)")
        }
        // The step's own flags never cover a flag risen from the level above.
        if let level = s.level, s.step >= 2, s.step <= 5 {
            let above = WalkLevel(rawValue: level.rawValue - 1)!
            let risen = banners.filter { $0.level == above && $0.kind == .compact && $0.glows }
            for r in risen { for b in banners where b.level == level && overlap(b.drawn, r.drawn) {
                problems.append("\(b.id) \(b.drawn) covers the risen \(r.id) \(r.drawn)")
            } }
        }
        // Looking back up, no flags of different levels meet, and no post has a stub beside a banner.
        if s.step >= 6 {
            for i in banners.indices { for j in banners.indices where j > i && banners[i].level != banners[j].level
                && overlap(banners[i].drawn, banners[j].drawn) {
                problems.append("\(banners[i].id) \(banners[i].drawn) meets \(banners[j].id) \(banners[j].drawn)")
            } }
            for post in layout.posts where post.banners.count > 1 && post.banners.contains(where: {
                if case .stub = $0.kind { return true }; return false }) {
                problems.append("\(post.id) has a stub beside its banners")
            }
        }
        // Where the light shows, no label comes within its ring and ticks plus 4 pt.
        if s.step <= 5 {
            for l in layout.labels where orbDistance(l.frame) < 74 { problems.append("label \(l.name) \(l.frame) on the light") }
        }
        // Examples on for a step that has some not yet planted: at least one shows.
        if let level = s.level, !s.ground, (1...4).contains(s.step), s.examplesOn.contains(s.step) {
            let titles = s.items(on: level).map { $0.title.lowercased() }
            let left = WalkCopy.examples(level).filter { e in
                !titles.contains((WalkWords.said(e, level: level, today: today, detect: { _ in nil })?.title ?? e).lowercased())
            }
            if !left.isEmpty, !banners.contains(where: { $0.kind == .ghost }) { problems.append("examples on, none shows") }
        }
        // No label sits in the question; looking back up, where a label may head its column, none above the header line.
        let labelTop = s.step >= 6 ? WalkLayout.lookBackHeader : 250
        for l in layout.labels where l.frame.minY < labelTop - 0.01 { problems.append("label \(l.name) at \(l.frame.minY)") }
        // Looking back up, no flag's cloth meets a peak's label: the label heads its column, or stays and nothing is lowered onto it.
        if s.step >= 6 {
            for l in layout.labels { for b in banners where overlap(l.frame, b.drawn) {
                problems.append("\(b.id) \(b.drawn) covers the label \(l.name) \(l.frame) looking back up")
            } }
        }
        // Nothing meets the orb.
        for b in banners where meetsOrb(b.drawn) { problems.append("\(b.id) \(b.drawn) meets the orb") }
        for l in layout.labels where meetsOrb(l.frame) { problems.append("label \(l.name) meets the orb") }
        // Unzoomed, everything but a small flag is on screen across (a small flag stays on its pole; the screen clips it).
        if !zoomed {
            for f in banners.filter({ $0.kind != .tip }).map(\.drawn) + layout.labels.map(\.frame) where f.minX < 0 || f.maxX > 390 {
                problems.append("frame \(f) leaves the screen")
            }
        }
        // Everything is inside the world.
        for f in banners.map(\.drawn) + layout.labels.map(\.frame) {
            let w = CGRect(x: f.minX / cam.k + cam.x, y: f.minY / cam.k + cam.y, width: f.width / cam.k, height: f.height / cam.k)
            if w.minX < 0 || w.maxX > art.world.width || w.minY < 0 || w.maxY > art.world.height {
                problems.append("frame \(f) leaves the world")
            }
        }
        // Levels below the step are not drawn before Look back up.
        if s.step < 6, layout.posts.contains(where: { $0.key.level.rawValue > s.step }) {
            problems.append("a post below step \(s.step)")
        }
        // Zoomed in close, a level with no room for a stub under its ceiling waits; every other drawn level shows.
        let drawn = s.step >= 6 ? WalkLevel.allCases : WalkLevel.allCases.filter { $0.rawValue <= s.step }
        for level in drawn {
            let has = level == .today ? s.item(s.firstThing) != nil : s.items(on: level).contains { item in
                !s.ground || item.areaId.map { id in s.areas.contains { $0.id == id } } ?? false
            } || (level == s.level && s.examplesOn.contains(s.step) && !s.ground && s.step <= 4)
            let base = (art.bandY(level) - cam.y) * cam.k
            let waits = zoomed && base - ceiling(level, s, cam) < 20
            let shows = layout.posts.contains { $0.key.level == level }
            if has && !waits && !shows { problems.append("\(level) has flags but no post") }
            if waits && shows { problems.append("\(level) stands in the question while zoomed") }
        }
        for post in layout.posts {
            let level = post.key.level
            let ceiling = ceiling(level, s, cam)
            // Nothing rises into the question, except the step's own newest flag when it stands alone.
            if !(level == s.level && post.banners.count == 1) {
                for b in post.banners where b.drawn.minY < 250 - 0.01 { problems.append("\(b.id) at \(b.drawn.minY) in the question") }
            }
            for b in post.banners {
                if case .stub = b.kind, b.drawn.minY < ceiling - 0.01 {
                    problems.append("stub \(b.id) at \(b.drawn.minY) above its ceiling \(ceiling)")
                }
                // A one-line flag is one line, except on Look back up, where a post's shown flag may take two.
                if b.kind == .compact {
                    let allowed = s.step >= 6 ? 1...2 : 1...1
                    if !allowed.contains(b.lines) || abs(b.frame.height - (23 + 13 * CGFloat(b.lines - 1))) > 0.01 {
                        problems.append("\(b.id) compact holds \(b.lines) lines in \(b.frame)")
                    }
                }
                // A full banner is as tall as its lines, and its lines are what its width holds.
                if b.kind == .full || b.kind == .ghost {
                    let natural = WalkLayout.lines(for: b.text, width: b.frame.width)
                    let height = 19 + 16 * CGFloat(b.lines) + (b.tag == nil ? 0 : 12)
                    if !(1...3).contains(b.lines) || b.lines > natural || abs(b.frame.height - height) > 0.01 {
                        problems.append("\(b.id) holds \(b.lines) lines in \(b.frame)")
                    }
                }
            }
        }
        // On the step's own level the newest flag of every post is a banner, once; only a post
        // on a crowded ridge that is not the open one shows a single stub for all its flags.
        if let level = s.level {
            let labeled = Set((s.ground ? s.areas : s.areas.filter { s.kept.contains($0.id) }).map(\.id))
            let onLevel = level == .today ? [s.item(s.firstThing)].compactMap { $0 } : s.items(on: level)
            let posts = layout.posts(on: level)
            for post in posts {
                let mine = onLevel.filter { ($0.areaId.flatMap { labeled.contains($0) ? $0 : nil }) == post.key.column }
                guard let newest = mine.last else { continue }
                let shown = post.banners.filter { $0.itemId == newest.id }       // a stub carries no item
                let crowded = post.banners.count == 1 && post.banners[0].kind == .stub(mine.count)
                    && posts.contains { $0.id != post.id && $0.banners.contains { b in if case .stub = b.kind { return false }; return true } }
                if shown.count != 1 && !crowded { problems.append("\(post.id): its newest flag is not a banner") }
            }
        }
        // Every flag on a drawn level is shown or counted in a stub, once.
        for level in WalkLevel.allCases where layout.posts.contains(where: { $0.key.level == level }) {
            let onLevel = layout.banners(on: level)
            let shown = onLevel.compactMap(\.itemId).count
            let folded = onLevel.reduce(0) { sum, b in
                if case .stub(let n) = b.kind { return sum + n }
                return sum + (b.more ?? 0)
            }
            let expected = level == .today ? 1 : s.items(on: level).filter { item in
                s.ground ? item.areaId.map { id in s.areas.contains { $0.id == id } } ?? false : true
            }.count
            if shown + folded != expected { problems.append("\(level): \(shown) shown + \(folded) folded ≠ \(expected)") }
        }
        return problems
    }
}
