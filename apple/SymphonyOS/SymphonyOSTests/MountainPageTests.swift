import Testing
import Foundation
import CoreGraphics
import SwiftData
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// A deterministic id, so a failing state can be rebuilt exactly.
private func uid(_ n: Int) -> UUID {
    UUID(uuidString: String(format: "00000000-0000-0000-0000-%012x", n))!
}

private let names = ["Health", "Home", "People", "Work", "Money", "Fun", "Faith", "Learning"]
private let ridge = names.enumerated().map { WalkArea(id: uid(1000 + $0.offset), name: $0.element) }
private func area(_ name: String) -> WalkArea { ridge.first { $0.name == name }! }

private func flag(_ level: WalkLevel, _ title: String, in areaName: String? = nil, parent: UUID? = nil,
                  id: UUID = UUID(), mine: Bool = true) -> WalkItem {
    WalkItem(id: id, level: level, title: title, areaId: areaName.map { area($0).id }, parentId: parent,
             day: nil, mine: mine)
}

/// Eight areas, each with a year goal, a season goal under it and four month goals under that.
private func fullRidge() -> [WalkItem] {
    var out: [WalkItem] = []
    for (i, name) in names.enumerated() {
        let year = flag(.year, "Look after \(name.lowercased()) all year", in: name, id: uid(2000 + i))
        let season = flag(.season, "A season of \(name.lowercased())", in: name, parent: year.id, id: uid(3000 + i))
        out += [year, season]
        for j in 0..<4 {
            out.append(flag(.month, "Month goal \(j + 1) for \(name.lowercased())", in: name, parent: season.id,
                            id: uid(4000 + i * 10 + j)))
        }
    }
    return out
}

private extension WalkLayout {
    var banners: [Banner] { posts.flatMap(\.banners) }
}

// A Month, Season or Year page: the walk's own mountain at the period it was opened on,
// with the person's flags, no question and no light.
@MainActor
struct MountainPageTests {
    let me = UUID()

    // MARK: The period on screen

    @Test func thePagesPeriodsHoldTheDateItWasOpenedOn() {
        // 28 November: the walk plans December and winter; the November page is November and fall.
        let opened = day(2026, 11, 28)
        let walk = WalkPeriods.pick(now: opened)
        let page = MountainPage.periods(level: .month, selected: opened, today: opened, seasons: nil)
        #expect(walk.monthStart == day(2026, 12, 1) && walk.season.name == "Winter" && walk.year == 2027)
        #expect(page.monthStart == day(2026, 11, 1))
        #expect(page.season.name == "Fall")
        #expect(page.year == 2026)
        #expect(page.weekStart == walk.weekStart)
        #expect(page.today == walk.today)
        // "Current" keeps the walk's meaning: the one in force today.
        #expect(page.monthIsCurrent && page.seasonIsCurrent)

        // On a day when the two agree, the page is the walk's.
        let mid = day(2026, 10, 14)
        #expect(MountainPage.periods(level: .month, selected: mid, today: mid, seasons: nil).monthStart
            == WalkPeriods.pick(now: mid).monthStart)

        // A Season page opened on 14 November is fall, and its month (what its line names) November.
        let fourteenth = day(2026, 11, 14)
        let season = MountainPage.periods(level: .season, selected: fourteenth, today: fourteenth, seasons: nil)
        #expect(WalkPeriods.pick(now: fourteenth).season.name == "Winter")
        #expect(season.season.name == "Fall")
        #expect(season.monthName == "November")

        // A page opened ahead of today: the season that holds that day, not in force yet.
        let ahead = MountainPage.periods(level: .season, selected: day(2027, 1, 10), today: fourteenth, seasons: nil)
        #expect(ahead.season.name == "Winter" && !ahead.seasonIsCurrent && !ahead.monthIsCurrent)
    }

    @Test func aYearPageShowsTheYearItWasOpenedOn() {
        let today = day(2026, 11, 14)
        #expect(MountainPage.periods(level: .year, selected: day(2027, 1, 1), today: today, seasons: nil).year == 2027)
        #expect(MountainPage.periods(level: .year, selected: day(2026, 12, 29), today: today, seasons: nil).year == 2026)
        #expect(WalkPeriods.pick(now: day(2026, 12, 29)).year == 2027)
    }

    @Test func aGoalAddedHereHangsInThePagesOwnPeriod() {
        // Finding 1: on 28 November the November page hands the writer November, not the walk's December.
        let opened = day(2026, 11, 28)
        let parent = flag(.season, "Get the house warm", in: "Home")
        let child = flag(.month, "Book the boiler service", in: "Home", parent: parent.id)
        var page = MountainPage(level: .month, items: [parent, child], areas: ridge, saved: [area("Health").id])
        #expect(page.hanging == nil)                       // nothing to hang by until the view sets the periods
        page.periods = MountainPage.periods(level: .month, selected: opened, today: opened, seasons: nil)
        let hanging = page.hanging
        #expect(hanging?.periods.monthStart == day(2026, 11, 1))
        #expect(hanging?.parent?.id == parent.id)
        #expect(hanging?.focusArea == area("Home").id)
        #expect(hanging?.kept.map(\.name) == ["Health", "Home"])

        // On Year the area the page stands in is where a goal hangs, and there is no parent.
        var year = MountainPage(level: .year, items: [], areas: ridge, saved: [area("Fun").id])
        year.periods = MountainPage.periods(level: .year, selected: day(2026, 12, 29), today: opened, seasons: nil)
        _ = year.apply(.peak(area("Fun").id))
        #expect(year.hanging?.focusArea == area("Fun").id)
        #expect(year.hanging?.parent == nil)
        #expect(year.hanging?.periods.year == 2026)
    }

    // MARK: What is drawn

    @Test func thePageDrawsItsLevelAndAbove() {
        let y = flag(.year, "Run a half marathon", in: "Health", mine: false)
        let s = flag(.season, "Build up to ten miles", in: "Health", parent: y.id, mine: false)
        let m = flag(.month, "Three runs a week", in: "Health", parent: s.id)
        let w = flag(.week, "Long run on Saturday", in: "Health", parent: m.id)
        let page = MountainPage(level: .month, items: [y, s, m, w], areas: ridge, saved: [])
        let state = page.walkState
        #expect(state.step == 3)
        #expect(!state.ground)
        #expect(state.level == .month)
        #expect(!state.items.contains { $0.level == .week })
        #expect(state.items.map(\.id) == [y.id, s.id, m.id])
        #expect(state.items.allSatisfy { $0.mine })
        #expect(!state.teaching && state.examplesOn.isEmpty && state.typing == nil)
        #expect(state.kept == [area("Health").id])

        // The week task is not a flag on this page, but it is what hangs under the month goal.
        #expect(page.below.map(\.id) == [w.id])

        let year = MountainPage(level: .year, items: [y, s, m, w], areas: ridge, saved: [])
        #expect(year.walkState.step == 1)
        #expect(year.walkState.items.map(\.id) == [y.id])
        #expect(year.below.map(\.id) == [s.id])
    }

    @Test func aBareMountainAndAFullRidgeBothLayOut() {
        let today = day(2026, 11, 14)
        for level in [WalkLevel.year, .season, .month] {
            // Nothing kept and nothing planted: nowhere to stand, so nothing stands (not even a bare pole).
            let bare = MountainPage(level: level, items: [], areas: Array(ridge.prefix(6)), saved: [])
            let empty = bare.layout(today: today, footing: .natural)
            #expect(empty.banners.isEmpty, "\(level)")
            #expect(empty.posts.isEmpty, "\(level)")
            #expect(empty.labels.isEmpty && empty.sides.isEmpty, "\(level)")
            // Kept but empty: the area's pill on a bare post, where the first goal will stand.
            let kept = MountainPage(level: level, items: [], areas: ridge, saved: [area("Home").id])
            let waiting = kept.layout(today: today, footing: .natural)
            #expect(waiting.banners.isEmpty && waiting.posts.count == 1, "\(level)")
            #expect(waiting.labels.map(\.id) == [area("Home").id], "\(level)")

            let full = MountainPage(level: level, items: fullRidge(), areas: ridge, saved: [])
            #expect(full.kept.count == 8)
            let layout = full.layout(today: today, footing: .natural)
            let banners = layout.banners
            #expect(!banners.isEmpty, "\(level)")
            #expect(banners.contains { $0.level == level }, "\(level)")
            // Every cloth is inside the edges, and under the question.
            for b in banners {
                #expect(b.drawn.minX >= WalkLayout.edges(wing: 0).lowerBound - 0.01
                        && b.drawn.maxX <= WalkLayout.edges(wing: 0).upperBound + 0.01, "\(level) \(b.id) \(b.drawn)")
            }
            for b in banners {
                #expect(b.drawn.minY >= WalkLayout.question - 0.01, "\(level) \(b.id) at \(b.drawn.minY)")
            }
            let own = banners.filter { $0.level == level }
            for i in own.indices { for j in own.indices where j > i {
                #expect(!WalkTurn.meet(own[i].corners, own[j].corners), "\(level) \(own[i].id) meets \(own[j].id)")
            } }
        }
    }

    /// Look back up (step 6) behind Today's lowered sheet reads one area top to bottom (F6): standing in
    /// the first kept area with a flag, one cloth for each of its levels, year first; every other kept
    /// area holding a flag a side post.
    @Test func lookBackShowsEveryLevel() {
        let y = flag(.year, "Run a half marathon", in: "Health")
        let s = flag(.season, "Build up to ten miles", in: "Health", parent: y.id)
        let m = flag(.month, "Three runs a week", in: "Money", parent: s.id)
        let w = flag(.week, "Long run on Saturday", in: "Health", parent: m.id)
        let state = MountainPage.lookBack(items: [y, s, m, w], areas: ridge, kept: [area("People").id])
        #expect(state.step == 6)
        #expect(state.level == nil)
        #expect(!state.ground)
        #expect(state.items.map(\.id) == [y.id, s.id, m.id, w.id])
        #expect(state.kept == [area("Health").id, area("People").id, area("Money").id])
        let layout = WalkLayout.make(state, today: day(2026, 11, 14), footing: .natural)
        #expect(layout.labels.first?.name == "Health")
        let cloths = layout.posts.flatMap(\.banners)
        #expect(cloths.map(\.level) == [.year, .season, .week] && cloths.allSatisfy { $0.kind == .compact })
        #expect(cloths.map(\.itemId) == [y.id, s.id, w.id])
        // People holds nothing: no post. Money's month goal stands at the side, and a tap stands there.
        #expect(layout.sides.map(\.name) == ["Money"])
        var there = state
        _ = there.apply(.areaTapped(area("Money").id), WalkEnv(periods: WalkPeriods.pick(now: day(2026, 11, 14)), now: day(2026, 11, 14)))
        #expect(WalkLayout.make(there, today: day(2026, 11, 14), footing: .natural).posts.flatMap(\.banners).map(\.itemId) == [m.id])
    }

    // MARK: Taps

    @Test func aTapChoosesAFlagAndASecondLetsGo() {
        let y = flag(.year, "Run a half marathon", in: "Health")
        let s = flag(.season, "Build up to ten miles", in: "Health", parent: y.id)
        let m = flag(.month, "Three runs a week", in: "Health", parent: s.id, mine: false)
        var page = MountainPage(level: .month, items: [y, s, m], areas: ridge, saved: [])
        #expect(page.apply(.flag(m.id)) == [])
        #expect(page.selected == m.id)
        #expect(page.walkState.selected == m.id)
        _ = page.apply(.flag(m.id))
        #expect(page.selected == nil)

        // A flag two levels up, or one that is not here, does nothing: the goal above stays the one it settled on.
        #expect(page.focus == s.id)
        _ = page.apply(.flag(y.id))
        _ = page.apply(.flag(UUID()))
        #expect(page.selected == nil && page.focus == s.id)

        // A tap on the mountain lets go, and closes Move to.
        _ = page.apply(.flag(m.id))
        _ = page.apply(.moveTapped)
        #expect(page.moving)
        #expect(page.apply(.letGo) == [])
        #expect(page.selected == nil && !page.moving)
    }

    /// Season and Month: a tap on the goal above switches to the next one in the area stood in, round
    /// again; with only one, or on a goal above that is not drawn, nothing. Year has nothing above it.
    @Test func theFocusedGoalSwitchesToTheNextOneHere() {
        let y1 = flag(.year, "Finish the bathroom", in: "Home")
        let y2 = flag(.year, "Clear out the garage", in: "Home")
        let other = flag(.year, "Feel strong again", in: "Health")
        let s = flag(.season, "Bathroom done by February", in: "Home", parent: y1.id)
        var season = MountainPage(level: .season, items: [other, y1, y2, s], areas: ridge, saved: [])
        #expect(season.focusArea == area("Home").id)
        #expect(season.focus == y2.id)                     // the area's newest goal above
        #expect(season.apply(.flag(y2.id)) == [])
        #expect(season.focus == y1.id)
        #expect(season.walkState.focus[.season] == y1.id)
        _ = season.apply(.flag(y1.id))
        #expect(season.focus == y2.id)
        // One that is not the goal above (not drawn), or another area's: nothing.
        _ = season.apply(.flag(y1.id))
        _ = season.apply(.flag(other.id))
        #expect(season.focus == y2.id && season.focusArea == area("Home").id && season.selected == nil)

        // Only one goal above here: its tap does nothing, and its label says it is only read.
        let lone = flag(.season, "Lift twice a week", in: "Health")
        let m = flag(.month, "Find a gym that fits", in: "Health", parent: lone.id)
        var month = MountainPage(level: .month, items: [lone, m], areas: ridge, saved: [])
        #expect(month.focus == lone.id)
        _ = month.apply(.flag(lone.id))
        #expect(month.focus == lone.id)
        let above = month.layout(today: day(2026, 11, 14)).banners.first { $0.kind == .parent }
        #expect(above?.itemId == lone.id && above?.taps == false)

        // Year has no level above it: a year flag is chosen, never focused.
        var year = MountainPage(level: .year, items: [y1, s], areas: ridge, saved: [])
        _ = year.apply(.flag(y1.id))
        #expect(year.focus == nil && year.selected == y1.id)
    }

    /// The pages stand in one area on every level (F16, the walk's own standing layout): the first kept
    /// area with a flag on the page's level, else the first kept; on Season and Month on that area's
    /// newest goal above. The page hands the walk its settled state, so what is drawn, read and tapped agree.
    @Test func thePageStandsWhereItsFlagsAre() {
        let today = day(2026, 11, 14)
        let hy = flag(.year, "Feel strong again", in: "Health")
        let hs = flag(.season, "Lift twice a week", in: "Health", parent: hy.id)
        let my = flag(.year, "Finish the bathroom", in: "Home")
        let ms1 = flag(.season, "Bathroom done by February", in: "Home", parent: my.id)
        let ms2 = flag(.season, "Fix the back fence", in: "Home", parent: my.id)
        let mm = flag(.month, "Pick the tile and pay the deposit", in: "Home", parent: ms1.id)
        let items = [hy, hs, my, ms1, ms2, mm]

        // Month: Health is kept first, but only Home holds a month goal.
        let month = MountainPage(level: .month, items: items, areas: ridge, saved: [area("Health").id])
        #expect(month.focusArea == area("Home").id)
        #expect(month.focus == ms2.id)
        let state = month.walkState
        #expect(state == state.settled)
        #expect(state.standing == area("Home").id && state.focus[.month] == ms2.id)
        let drawn = month.layout(today: today, footing: .level)
        #expect(drawn.labels.map(\.id) == [area("Home").id])
        #expect(drawn.banners.contains { $0.itemId == mm.id })
        #expect(drawn.sides.map(\.area) == [area("Health").id])

        // Season and Year: the first kept area with a flag on the level.
        #expect(MountainPage(level: .season, items: items, areas: ridge, saved: []).focusArea == area("Health").id)
        let year = MountainPage(level: .year, items: [my], areas: ridge, saved: [area("Health").id])
        #expect(year.focusArea == area("Home").id && year.focus == nil)
        #expect(year.walkState.standing == area("Home").id)
        // With no flag on the level anywhere, the first kept area; with nothing kept, nowhere.
        let bare = MountainPage(level: .year, items: [], areas: ridge, saved: [area("People").id, area("Home").id])
        #expect(bare.focusArea == area("Home").id && bare.walkState.standing == area("Home").id)
        #expect(MountainPage(level: .year, items: [], areas: ridge, saved: []).focusArea == nil)

        // Until the person walks somewhere the page keeps starting where its flags are: rows that arrive
        // after it first drew (Health's first, Home's month goal a moment later) move it to Home.
        var early = MountainPage(level: .month, items: [hy, hs], areas: ridge, saved: [area("Health").id])
        #expect(early.focusArea == area("Health").id && early.focus == hs.id)
        early.read(items: items, areas: ridge, saved: [area("Health").id])
        #expect(early.focusArea == area("Home").id && early.focus == ms2.id)
        // Once it has walked, it stays where it was walked to.
        _ = early.apply(.peak(area("Health").id))
        early.read(items: items + [flag(.month, "Book the skip", in: "Home", parent: ms1.id)], areas: ridge,
                   saved: [area("Health").id])
        #expect(early.focusArea == area("Health").id)

        // Kept valid: an area that goes (its only flag pulled up, nothing saved) is left for one that holds.
        let fun = flag(.month, "Fix the bike", in: "Fun")
        let gym = flag(.month, "Find a gym that fits", in: "Money")
        var page = MountainPage(level: .month, items: [fun, gym], areas: ridge, saved: [])
        #expect(page.focusArea == area("Money").id)
        _ = page.apply(.flag(gym.id))
        _ = page.apply(.pullUp)
        #expect(page.kept == [area("Fun").id] && page.focusArea == area("Fun").id)
        _ = page.apply(.flag(fun.id))
        _ = page.apply(.pullUp)
        #expect(page.kept.isEmpty && page.focusArea == nil)
    }

    /// Another period (the heading's tap) is a fresh page: it stands where its own flags are. The same
    /// period read again (a flag added or moved) keeps where the person walked.
    @Test func anotherPeriodStandsAfresh() {
        let today = day(2026, 11, 28)
        let november = MountainPage.periods(level: .month, selected: today, today: today, seasons: nil)
        let december = MountainPage.periods(level: .month, selected: day(2026, 12, 3), today: today, seasons: nil)
        let gutters = flag(.month, "Clear the gutters", in: "Home")
        let gym = flag(.month, "Find a gym that fits", in: "Health")
        let tile = flag(.month, "Pick the tile", in: "Home")
        func flags(_ p: WalkPeriods, _ own: [WalkItem]) -> MountainPage.Flags {
            MountainPage.Flags(periods: p, above: [], own: own, below: [], walk: own, walkPeriods: p)
        }
        var page = MountainPage(level: .month, flags: flags(november, [gutters]), areas: ridge, saved: [])
        #expect(page.focusArea == area("Home").id)
        page.read(flags(december, [gym, tile]), areas: ridge, saved: [])
        #expect(page.focusArea == area("Health").id)
        _ = page.apply(.peak(area("Home").id))
        #expect(page.focusArea == area("Home").id)
        let added = flag(.month, "Book the skip", in: "Health")
        page.read(flags(december, [gym, tile, added]), areas: ridge, saved: [])
        #expect(page.focusArea == area("Home").id)

        // A day turning while the page is open is the same page: only the page's own period counts
        // (fix round 1, item 2). The choice, the paper, where it stands and that it was walked all hold.
        let nextDay = MountainPage.periods(level: .month, selected: day(2026, 12, 3), today: day(2026, 11, 29), seasons: nil)
        #expect(nextDay.monthStart == december.monthStart && nextDay.today != december.today)
        _ = page.apply(.flag(tile.id))
        let before = page
        page.read(flags(nextDay, [gym, tile, added]), areas: ridge, saved: [])
        #expect(page.selected == tile.id && page.focusArea == before.focusArea && page.walked)
        _ = page.apply(.paper(true))
        page.read(flags(MountainPage.periods(level: .month, selected: day(2026, 12, 3), today: day(2026, 11, 30), seasons: nil),
                        [gym, tile, added]), areas: ridge, saved: [])
        #expect(page.paperOpen && page.walked)
        // A Year page's own period is its year.
        let goals = [flag(.year, "Feel strong again", in: "Health"), flag(.year, "Finish the bathroom", in: "Home")]
        var year = MountainPage(level: .year, flags: flags(MountainPage.periods(level: .year, selected: day(2027, 1, 5),
                                                                                today: today, seasons: nil), goals),
                                areas: ridge, saved: [])
        #expect(year.focusArea == area("Health").id)
        _ = year.apply(.peak(area("Home").id))
        year.read(flags(MountainPage.periods(level: .year, selected: day(2027, 1, 5), today: day(2026, 11, 29), seasons: nil),
                        goals), areas: ridge, saved: [])
        #expect(year.walked && year.focusArea == area("Home").id)
        year.read(flags(MountainPage.periods(level: .year, selected: day(2026, 12, 5), today: today, seasons: nil), goals),
                  areas: ridge, saved: [])
        #expect(!year.walked && year.focusArea == area("Health").id)
    }

    /// A side post's tap stands there on every level (on Season and Month on that area's newest goal
    /// above), as its "Tap to walk there" says; a chosen flag left behind is let go. Where it stands
    /// already, or an area it cannot stand in, nothing.
    @Test func aPeakTapWalksThereOnEveryLevel() {
        let hy = flag(.year, "Feel strong again", in: "Health")
        let hs = flag(.season, "Lift twice a week", in: "Health", parent: hy.id)
        let hm = flag(.month, "Find a gym that fits", in: "Health", parent: hs.id)
        let my = flag(.year, "Finish the bathroom", in: "Home")
        let ms1 = flag(.season, "Bathroom done by February", in: "Home", parent: my.id)
        let ms2 = flag(.season, "Fix the back fence", in: "Home", parent: my.id)
        let mm = flag(.month, "Pick the tile", in: "Home", parent: ms1.id)
        let items = [hy, hs, hm, my, ms1, ms2, mm]
        let own: [WalkLevel: WalkItem] = [.year: hy, .season: hs, .month: hm]
        let newestAbove: [WalkLevel: UUID] = [.season: my.id, .month: ms2.id]
        for level in [WalkLevel.year, .season, .month] {
            var page = MountainPage(level: level, items: items, areas: ridge, saved: [area("Fun").id])
            #expect(page.focusArea == area("Health").id, "\(level)")
            _ = page.apply(.flag(own[level]!.id))
            #expect(page.selected == own[level]!.id, "\(level)")
            #expect(MountainPage.event(for: .areaTapped(area("Home").id)) == .peak(area("Home").id))
            #expect(page.apply(.peak(area("Home").id)) == [], "\(level)")
            #expect(page.focusArea == area("Home").id && page.walkState.standing == area("Home").id, "\(level)")
            #expect(page.selected == nil, "\(level)")
            #expect(page.focus == newestAbove[level], "\(level)")
            let here = page
            _ = page.apply(.peak(area("Home").id))
            _ = page.apply(.peak(UUID()))
            #expect(page == here, "\(level)")
            // Fun is kept and holds nothing: on Year the page can stand there; below it Fun has no post.
            _ = page.apply(.peak(area("Fun").id))
            #expect(page.focusArea == (level == .year ? area("Fun").id : area("Home").id), "\(level)")
        }
    }

    /// Nothing on a page is a button that does nothing (item a): a cloth that takes a tap changes the
    /// page, one read only does not; a named side post stands there; the nameless one raises the paper;
    /// the pill where the page stands takes none. Every level, standing in every area of a full ridge.
    @Test func everyTapOnThePageDoesWhatItSays() {
        let today = day(2026, 11, 14)
        let loose = [flag(.year, "Somewhere to start"), flag(.season, "Nowhere yet"), flag(.month, "Loose ends")]
        var checked = 0
        for level in [WalkLevel.year, .season, .month] {
            for standing in names {
                var page = MountainPage(level: level, items: fullRidge() + loose, areas: ridge, saved: [])
                page.periods = MountainPage.periods(level: level, selected: today, today: today, seasons: nil)
                _ = page.apply(.peak(area(standing).id))
                let layout = page.layout(today: today)
                #expect(layout.labels.allSatisfy { $0.standing && !$0.tappable }, "\(level) \(standing)")
                for post in layout.posts {
                    for banner in post.banners {
                        var after = page
                        let event = WalkLayout.tapEvent(banner, on: post).flatMap(MountainPage.event(for:))
                        if let event { _ = after.apply(event) }
                        #expect((after != page) == banner.taps, "\(level) \(standing) \(banner.label)")
                        checked += 1
                    }
                }
                for side in layout.sides {
                    var after = page
                    let event = WalkLayout.tapEvent(side).flatMap(MountainPage.event(for:))
                    #expect(event != nil, "\(level) \(standing) \(side.name)")
                    if let event { _ = after.apply(event) }
                    if let area = side.area {
                        #expect(after.focusArea == area, "\(level) \(standing) \(side.name)")
                    } else {
                        #expect(after.paperOpen, "\(level) \(standing) nameless")
                    }
                    checked += 1
                }
            }
        }
        #expect(checked > 200, "\(checked)")
    }
    @Test func aWalkTapIsTheSameTapHere() {
        let id = UUID()
        let key = WalkPostKey(level: .season, column: nil)
        #expect(MountainPage.event(for: .bannerTapped(id)) == .flag(id))
        #expect(MountainPage.event(for: .stubTapped(key)) == nil)
        #expect(MountainPage.event(for: .areaTapped(id)) == .peak(id))
        #expect(MountainPage.event(for: .paperOpened) == .paper(true))
        #expect(MountainPage.event(for: .paperClosed) == .paper(false))
        #expect(MountainPage.event(for: .paperRow(id)) == .paperRow(id))
        #expect(MountainPage.event(for: .exampleTapped("Walk more")) == nil)
        #expect(MountainPage.event(for: .veilTapped) == nil)
    }

    // MARK: Move to, pull up

    @Test func moveToOffersTheOtherAreasAndKeepsANewOne() {
        let y = flag(.year, "Run a half marathon", in: "Health", mine: false)
        var page = MountainPage(level: .year, items: [y], areas: ridge, saved: [])
        #expect(page.kept == [area("Health").id])
        _ = page.apply(.moveTapped)
        #expect(!page.moving)                              // nothing chosen, nothing to move

        _ = page.apply(.flag(y.id))
        #expect(page.panel?.moveTo == [])
        _ = page.apply(.moveTapped)
        #expect(page.moving)
        #expect(page.panel?.moveTo.map(\.name) == names.filter { $0 != "Health" })
        #expect(page.apply(.moveTo(area("Health").id)) == [])        // its own area is not offered

        let effects = page.apply(.moveTo(area("Money").id))
        #expect(effects == [.setArea(y.id, .year, to: area("Money").id, from: area("Health").id)])
        // Health was kept only because the flag stood there; nothing saved keeps it.
        #expect(page.kept == [area("Money").id])
        #expect(page.items.first?.areaId == area("Money").id)
        #expect(page.selected == nil && !page.moving)

        // A saved area stays kept with nothing in it.
        var saved = MountainPage(level: .year, items: [y], areas: ridge, saved: [area("Health").id])
        _ = saved.apply(.flag(y.id))
        #expect(saved.apply(.moveTo(area("Fun").id)) == [.setArea(y.id, .year, to: area("Fun").id, from: area("Health").id)])
        #expect(saved.kept == [area("Health").id, area("Fun").id])

        // With nowhere else to go, Move to does not open.
        var lone = MountainPage(level: .year, items: [y], areas: [area("Health")], saved: [])
        _ = lone.apply(.flag(y.id))
        #expect(lone.apply(.moveTapped) == [])
        #expect(!lone.moving)
        #expect(lone.panel?.moveTo == [])
    }

    @Test func pullUpLetsGo() {
        let s = flag(.season, "Build up to ten miles", in: "Health")
        let m = flag(.month, "Three runs a week", in: "Health", parent: s.id)
        var page = MountainPage(level: .month, items: [s, m], areas: ridge, saved: [])
        #expect(page.apply(.pullUp) == [])                 // nothing chosen
        _ = page.apply(.flag(m.id))
        #expect(page.apply(.pullUp) == [.pullUp(m.id, .month)])
        #expect(page.selected == nil)
        #expect(page.panel == nil)
        #expect(!page.items.contains { $0.id == m.id })
        #expect(page.apply(.pullUp) == [])

        // What depended on it is worked out again: its area's column (kept only by it), and the
        // week task under it, which stays, unlinked, as the writer leaves it.
        let other = flag(.month, "Stretch every morning", in: "Health")
        let lonely = flag(.month, "Fix the bike", in: "Fun")
        let w = flag(.week, "Pump the tyres", in: "Fun", parent: lonely.id)
        var page2 = MountainPage(level: .month, items: [s, other, lonely, w], areas: ridge, saved: [])
        #expect(page2.kept == [area("Health").id, area("Fun").id])
        _ = page2.apply(.flag(lonely.id))
        _ = page2.apply(.pullUp)
        #expect(page2.kept == [area("Health").id])
        #expect(page2.below.map(\.parentId) == [nil])
    }

    /// Item d: the pages hand the walk their periods, so a side post says which month it counts: on
    /// 28 November the December page's posts say "in December", the November page's "this month".
    @Test func aSidePostSaysWhichMonthItCounts() {
        let today = day(2026, 11, 28)
        let items = [flag(.month, "Find a gym that fits", in: "Health"), flag(.month, "Pick the tile", in: "Home"),
                     flag(.month, "Clear out the vanity", in: "Home")]
        var december = MountainPage(level: .month, items: items, areas: ridge, saved: [])
        december.periods = MountainPage.periods(level: .month, selected: day(2026, 12, 3), today: today, seasons: nil)
        #expect(december.layout(today: today).sides.map(\.label) == ["Home, 2 goals in December"])
        var november = december
        november.periods = MountainPage.periods(level: .month, selected: today, today: today, seasons: nil)
        #expect(november.layout(today: today).sides.map(\.label) == ["Home, 2 goals this month"])
    }

    // MARK: Adding from the bar

    /// Item b: a goal from the bar lands in the area the page stands in on every level: on Year in that
    /// area, on Season and Month under the goal above the page stands on (which lends its area), and
    /// with no goal above there, still in that area.
    @Test func aGoalFromTheBarLandsWhereThePageStands() {
        let today = day(2026, 11, 14)
        let y = flag(.year, "Finish the bathroom", in: "Home")
        let other = flag(.year, "Feel strong again", in: "Health")
        let s = flag(.season, "Bathroom done by February", in: "Home", parent: y.id)
        let loose = flag(.month, "Fix the bike", in: "Fun")
        let above: [WalkLevel: UUID?] = [.year: nil, .season: y.id, .month: s.id]
        for level in [WalkLevel.year, .season, .month] {
            var page = MountainPage(level: level, items: [other, y, s, loose], areas: ridge, saved: [area("Health").id])
            page.periods = MountainPage.periods(level: level, selected: today, today: today, seasons: nil)
            _ = page.apply(.peak(area("Home").id))
            let hanging = page.hanging
            #expect(hanging?.focusArea == area("Home").id, "\(level)")
            #expect(hanging?.parent?.id == above[level]!, "\(level)")
            #expect(hanging?.kept.contains { $0.id == area("Home").id } == true, "\(level)")
        }
        // Month standing in Fun, where nothing stands above: no goal above, and still Fun.
        var month = MountainPage(level: .month, items: [other, y, s, loose], areas: ridge, saved: [])
        month.periods = MountainPage.periods(level: .month, selected: today, today: today, seasons: nil)
        _ = month.apply(.peak(area("Fun").id))
        #expect(month.hanging?.focusArea == area("Fun").id)
        #expect(month.hanging?.parent == nil)
    }

    // MARK: The paper

    /// A stress plan (`DemoStress.full`) as the demo seeds it, each flag under its area's first flag a level up.
    private func fullPlan() -> [WalkItem] {
        let today = day(2026, 11, 10)
        var items: [WalkItem] = []
        for (level, words, name) in DemoStress.full.script {
            guard let said = WalkWords.said(words, level: level, today: today) else { continue }
            let parent = items.first { $0.level.rawValue == level.rawValue - 1 && $0.areaId == area(name).id }
            items.append(WalkItem(id: UUID(), level: level, title: said.title, areaId: area(name).id,
                                  parentId: parent?.id, day: said.day, mine: true))
        }
        return items
    }

    /// The page's paper reads its own level whole, as a plain list by area, titled with the page's period.
    @Test func thePaperListsThisLevelByArea() throws {
        let today = day(2026, 11, 10)
        let items = fullPlan()
        var page = MountainPage(level: .year, items: items, areas: ridge, saved: DemoStress.full.areas.map { area($0).id })
        page.periods = MountainPage.periods(level: .year, selected: today, today: today, seasons: nil)
        let paper = try #require(page.paper)
        #expect(paper.sections.count == 5)
        #expect(paper.sections.map(\.name) == DemoStress.full.areas)
        // The demo's full plan holds 18 year goals (the board's "17 goals" is its own example's count).
        #expect(paper.total == 18)
        #expect(paper.total == items.filter { $0.level == .year }.count)
        #expect(paper.sections.map(\.rows.count) == [4, 3, 4, 3, 4])
        #expect(paper.title == DailyCopy.paperTitle(.year, periods: page.periods!))
        #expect(paper.count == WalkCopy.paperCount(18, level: .year))
        #expect(paper.level == .year)
        // A row says what its tap does: in the area stood in it chooses; elsewhere it walks there and chooses.
        let rows = paper.sections.flatMap(\.rows)
        let here = try #require(paper.sections.first { $0.area == page.focusArea }?.rows.first)
        let there = try #require(paper.sections.first { $0.area != page.focusArea }?.rows.first)
        #expect(here.hint == WalkCopy.paperRowHint(walks: false, chooses: true, lookingBack: false))
        #expect(there.hint == WalkCopy.paperRowHint(walks: true, chooses: true, lookingBack: false))
        #expect(rows.allSatisfy { $0.tag == nil })

        // Month reads its own level only.
        var month = MountainPage(level: .month, items: items, areas: ridge, saved: [])
        month.periods = MountainPage.periods(level: .month, selected: today, today: today, seasons: nil)
        let monthPaper = try #require(month.paper)
        #expect(monthPaper.total == items.filter { $0.level == .month }.count)
        #expect(monthPaper.title == "November")
    }

    /// With no goal on the page's level there is no paper, and nothing raises one.
    @Test func noGoalsNoPaper() {
        let today = day(2026, 11, 10)
        let y = flag(.year, "Finish the bathroom", in: "Home")
        var season = MountainPage(level: .season, items: [y], areas: ridge, saved: [])
        season.periods = MountainPage.periods(level: .season, selected: today, today: today, seasons: nil)
        #expect(season.paper == nil)
        #expect(season.apply(.paper(true)) == [])
        #expect(!season.paperOpen)

        var year = MountainPage(level: .year, items: [y], areas: ridge, saved: [])
        year.periods = MountainPage.periods(level: .year, selected: today, today: today, seasons: nil)
        _ = year.apply(.flag(y.id))
        _ = year.apply(.paper(true))
        #expect(year.paperOpen && year.selected == nil)        // raising it lets the choice go
        _ = year.apply(.paper(false))
        #expect(!year.paperOpen)
        // The last goal gone while the paper is up: it comes down with it.
        _ = year.apply(.paper(true))
        _ = year.perform(.pullUp, on: y.id)
        #expect(year.paper == nil && !year.paperOpen)
    }

    /// A row on the paper closes it, stands the page where that flag stands (on its own goal above) and
    /// chooses it, so its panel shows; a row while the paper is down does nothing.
    @Test func aPaperRowWalksThereAndChoosesTheFlag() throws {
        let today = day(2026, 11, 14)
        let hy = flag(.year, "Feel strong again", in: "Health")
        let hs = flag(.season, "Lift twice a week", in: "Health", parent: hy.id)
        let hm = flag(.month, "Find a gym that fits", in: "Health", parent: hs.id)
        let my = flag(.year, "Finish the bathroom", in: "Home")
        let ms1 = flag(.season, "Bathroom done by February", in: "Home", parent: my.id)
        let ms2 = flag(.season, "Fix the back fence", in: "Home", parent: my.id)
        let mm = flag(.month, "Pick the tile", in: "Home", parent: ms1.id)
        let nowhere = flag(.month, "Loose ends")
        var page = MountainPage(level: .month, items: [hy, hs, hm, my, ms1, ms2, mm, nowhere], areas: ridge, saved: [])
        page.periods = MountainPage.periods(level: .month, selected: today, today: today, seasons: nil)
        #expect(page.focusArea == area("Health").id)
        #expect(page.apply(.paperRow(mm.id)) == [])
        #expect(page.focusArea == area("Health").id && page.selected == nil)

        _ = page.apply(.paper(true))
        _ = page.apply(.paperRow(mm.id))
        #expect(!page.paperOpen)
        #expect(page.focusArea == area("Home").id)
        #expect(page.focus == ms1.id)                      // its own goal above, not the newest
        #expect(page.selected == mm.id && page.panel != nil)
        let chosen = try #require(page.layout(today: today).banners.first { $0.itemId == mm.id })
        #expect(chosen.glows)

        // In the area stood in a row only chooses.
        _ = page.apply(.paper(true))
        _ = page.apply(.paperRow(mm.id))
        #expect(page.focusArea == area("Home").id && page.selected == mm.id)
        // A flag with no area: chosen, and the page stands where it was.
        _ = page.apply(.paper(true))
        _ = page.apply(.paperRow(nowhere.id))
        #expect(page.focusArea == area("Home").id && page.selected == nowhere.id && page.panel?.title == "Loose ends")
    }

    // MARK: Walk it down

    @Test func walkDownOpensTheNextLevelAboutTheFlag() {
        let today = day(2026, 11, 14)
        let periods = WalkPeriods.pick(now: today)
        let y = flag(.year, "Run a half marathon", in: "Home")
        let other = flag(.year, "Read twelve books", in: "Fun")
        let s = flag(.season, "Build up to ten miles", in: "Home", parent: y.id)
        let m = flag(.month, "Three runs a week", in: "Home", parent: s.id)
        let w = flag(.week, "Long run on Saturday", in: "Home", parent: m.id)
        let items = [y, other, s, m, w]

        let position = MountainPage.walkDown(y, items: items, areas: ridge, kept: [area("Health").id],
                                             periods: periods, now: today)
        #expect(position.step == 2)
        #expect(position.focus["2"] == y.id)
        #expect(position.depth == .quick)
        #expect(position.status == .inProgress)
        #expect(!position.ground)
        #expect(position.kept.contains(area("Home").id))
        #expect(position.kept.contains(area("Health").id))
        #expect(Set(position.planted) == Set(items.map(\.id)))
        #expect(position.areas == ridge)
        #expect(position.year == periods.year)

        // Resumed by the walk, it stands on Season, focused on the flag.
        var state = WalkState()
        state.items = items
        position.restored(for: periods, existing: Set(items.map(\.id))).apply(to: &state)
        #expect(state.step == 2 && state.focus[.season] == y.id && !state.teaching)

        #expect(MountainPage.walkDown(s, items: items, areas: ridge, kept: [], periods: periods, now: today).step == 3)
        let fromMonth = MountainPage.walkDown(m, items: items, areas: ridge, kept: [], periods: periods, now: today)
        #expect(fromMonth.step == 4 && fromMonth.focus["4"] == m.id)
    }

    @Test func walkDownIsOnlyForTheWalksOwnPeriods() {
        // 28 November: the November page is open; the walk plans December.
        let november = flag(.month, "Clear the gutters", in: "Home")
        let december = flag(.month, "Book the boiler service", in: "Home")
        #expect(!MountainPage.canWalkDown(november, in: [december]))
        #expect(MountainPage.canWalkDown(december, in: [december]))
        let week = flag(.week, "Ring the plumber", in: "Home")
        #expect(!MountainPage.canWalkDown(week, in: [week]))

        let opened = day(2026, 11, 28)
        var page = MountainPage(level: .month, items: [november], areas: ridge, saved: [])
        page.periods = MountainPage.periods(level: .month, selected: opened, today: opened, seasons: nil)
        page.walkItems = [december]
        _ = page.apply(.flag(november.id))
        #expect(page.panel?.canWalkDown == false)
        #expect(page.apply(.walkDown) == [])

        var walks = MountainPage(level: .month, items: [december], areas: ridge, saved: [])
        walks.walkItems = [december]
        _ = walks.apply(.flag(december.id))
        #expect(walks.panel?.canWalkDown == true)
        #expect(walks.apply(.walkDown) == [.walkDown(december.id)])
        #expect(walks.apply(.letGo) == [])
        #expect(walks.apply(.walkDown) == [])              // nothing chosen
    }

    // MARK: Kept areas

    @Test func keptIsTheSavedAreasAndThoseInUse() {
        let items = [flag(.year, "Save for a car", in: "Money"),
                     WalkItem(id: UUID(), level: .season, title: "Somewhere off the ridge", areaId: UUID(),
                              parentId: nil, day: nil),
                     flag(.season, "No area at all")]
        let kept = MountainPage.kept(items: items, areas: ridge,
                                     saved: [area("People").id, UUID(), area("Health").id])
        #expect(kept == [area("Health").id, area("People").id, area("Money").id])
        #expect(MountainPage.kept(items: [], areas: ridge, saved: []) == [])

        // A saved id whose area's row came with another id is found by its name first.
        let homeRow = WalkArea(id: uid(7001), name: "Home")
        let ridgeWithRow = ridge.map { $0.name == "Home" ? homeRow : $0 }
        #expect(MountainPage.kept(items: [], areas: ridgeWithRow, saved: [area("Home").id, UUID()],
                                  savedAreas: ridge) == [homeRow.id])
        let page0 = MountainPage(level: .year, items: [], areas: ridgeWithRow, saved: [area("Home").id], savedAreas: ridge)
        #expect(page0.kept == [homeRow.id])

        // A week task's area is not a column on a Month page.
        let page = MountainPage(level: .month, items: [flag(.week, "Ring the plumber", in: "Home")], areas: ridge, saved: [])
        #expect(page.kept == [])
    }

    @Test func areaIdsHoldBetweenReads() {
        // Finding 12: an area with no row of its own takes the saved walk's id, by name; a row's id wins.
        // A saved walk holds the whole ridge it showed: the six defaults, and here one it was told on the ground.
        let saved = (WalkClassifier.defaults + ["Garden"]).enumerated()
            .map { WalkArea(id: uid(9001 + $0.offset), name: $0.element) }
        let homeRow = GoalArea(userId: me, name: "home", sortOrder: 0, context: "personal")
        let first = MountainPage.areas([homeRow], me: me, saved: saved)
        let second = MountainPage.areas([homeRow], me: me, saved: saved)
        #expect(first == second)
        #expect(first.map(\.name) == WalkClassifier.defaults + ["Garden"])
        for area in first where area.name != "Home" {
            #expect(area.id == saved.first { $0.name == area.name }?.id, "\(area.name)")
        }
        #expect(first.first { $0.name == "Home" }?.id == homeRow.id)
        // A peak the walk named on the ground, with no row yet, stays on the ridge.
        #expect(first.last == saved.last)

        // With nothing saved it is the walk's own read, whose rowless areas get new ids on each
        // read: that is why the page reads its areas once per appearance.
        let unsaved = MountainPage.areas([homeRow], me: me, saved: [])
        #expect(unsaved.map(\.name) == WalkClassifier.defaults)
        #expect(unsaved.first { $0.name == "Home" }?.id == homeRow.id)

        // With no rows and nothing saved, the six defaults.
        let bare = MountainPage.areas([], me: me, saved: [])
        #expect(bare.map(\.name) == WalkClassifier.defaults)
        #expect(Set(bare.map(\.id)).count == 6)

        // Never more than the ridge holds.
        let many = (0..<8).map { WalkArea(id: uid(9100 + $0), name: "Extra \($0)") }
        #expect(MountainPage.areas([], me: me, saved: many).count == WalkLoad.maxAreas)
    }

    // MARK: The panel

    @Test func thePanelSaysWhatIsMissingBelow() {
        let today = day(2026, 11, 14)
        let lonely = flag(.year, "Run a half marathon", in: "Health")
        let held = flag(.year, "Finish the bathroom", in: "Home")
        let under = flag(.season, "Tile the floor", in: "Home", parent: held.id)
        var page = MountainPage(level: .year, items: [lonely, held, under], areas: ridge, saved: [])
        #expect(page.panel == nil)                         // nothing chosen

        _ = page.apply(.flag(lonely.id))
        #expect(page.panel?.line == nil)                   // no periods yet, so no words
        page.periods = MountainPage.periods(level: .year, selected: today, today: today, seasons: nil)
        #expect(page.panel?.line == DailyCopy.nothingUnder(.year, periods: page.periods!))

        _ = page.apply(.flag(held.id))
        #expect(page.selected == held.id)
        #expect(page.panel?.line == nil)
        #expect(page.panel?.canWalkDown == false)          // the walk's items were not given
        #expect(page.panel?.moveTo == [])
    }

    /// S45: the panel names its goal, whole: a 200-character title is its title, unshortened.
    @Test func thePanelNamesItsGoal() {
        let long = String(String(repeating: "Ring the council about the parking permit for the van ", count: 4).prefix(200))
        #expect(long.count == 200)
        let goal = flag(.year, long, in: "Home")
        var page = MountainPage(level: .year, items: [goal], areas: ridge, saved: [])
        #expect(page.panel == nil)
        _ = page.apply(.flag(goal.id))
        #expect(page.panel?.title == long)
    }

    // MARK: VoiceOver

    @Test func aFlagsActionsKeepTheirShape() {
        let y = flag(.year, "Run a half marathon", in: "Health")
        let s = flag(.season, "Build up to ten miles", in: "Health", parent: y.id)
        let other = flag(.season, "Paint the hall", in: "Home")
        var page = MountainPage(level: .season, items: [y, s, other], areas: ridge, saved: [])
        page.walkItems = [y, s]
        let moves = ridge.filter { $0.id != area("Health").id }.map { MountainPage.Event.moveTo($0.id) }
        let before = page.actions(for: s.id)
        #expect(before == [.walkDown] + moves + [.pullUp])
        #expect(page.actions(for: other.id) == ridge.filter { $0.id != area("Home").id }.map { .moveTo($0.id) } + [.pullUp])
        #expect(page.actions(for: y.id) == [])             // a flag one level up is focused by its tap

        // Choosing, opening Move to and focusing change nothing in the lists.
        _ = page.apply(.flag(other.id))
        _ = page.apply(.moveTapped)
        _ = page.apply(.flag(y.id))
        #expect(page.actions(for: s.id) == before)
        #expect(page.actions(for: y.id) == [])

        // An action runs on its own flag, whatever was chosen.
        #expect(page.perform(.pullUp, on: s.id) == [.pullUp(s.id, .season)])
        #expect(page.perform(.moveTo(area("Fun").id), on: other.id)
            == [.setArea(other.id, .season, to: area("Fun").id, from: area("Home").id)])
        #expect(page.perform(.pullUp, on: y.id) == [])     // not a flag of this page's level
    }

    // MARK: Built from the rows, by their links

    private func goal(_ name: String, year: Int, in areaName: String? = nil, user: UUID? = nil,
                      context: String? = "personal") -> Goal {
        let g = Goal(id: UUID(), userId: user ?? me, name: name, year: year)
        g.context = context
        g.areaId = areaName.map { area($0).id }
        return g
    }

    private func row(_ title: String, _ level: WalkLevel, start: Date? = nil, in areaName: String? = nil,
                     goal: UUID? = nil, source: UUID? = nil, user: UUID? = nil, context: String? = "personal") -> SymphonyTask {
        let t = SymphonyTask(id: UUID(), userId: user ?? me, title: title, context: context)
        switch level {
        case .season: t.bucket = "quarter"; t.seasonStart = start
        case .month: t.bucket = "month"; t.monthStart = start
        default: t.bucket = "week"; t.weekStart = start
        }
        t.areaId = areaName.map { area($0).id }
        t.goalId = goal
        t.sourceId = source
        return t
    }

    @Test func aFallPageOnTheFourteenthHangsEachFlagUnderItsRealParent() {
        let today = day(2026, 11, 14)
        let fall = day(2026, 9, 1), winter = day(2026, 12, 1)
        let y2026 = goal("Feel strong", year: 2026, in: "Health")
        let y2027 = goal("Finish the house", year: 2027, in: "Home")
        let family = goal("Family trip", year: 2027, in: "Fun", context: "family")
        let fullOfNovember = row("Get running again", .season, start: fall, in: "Health", goal: y2026.id)
        let bare = row("Sort the attic", .season, start: fall, in: "Home", goal: y2027.id)
        let underFamily = row("Book the cabin", .season, start: fall, in: "Fun", goal: family.id)
        let november = row("Three runs a week", .month, start: day(2026, 11, 1), in: "Health", source: fullOfNovember.id)
        let winterGoal = row("Paint the hall", .season, start: winter, in: "Home", goal: y2027.id)
        let theirs = row("Their fall goal", .season, start: fall, in: "Home", user: UUID())
        let work = row("Ship the report", .season, start: fall, in: "Work", context: "work")

        let flags = MountainPage.flags(level: .season, goals: [y2026, y2027, family],
                                       tasks: [fullOfNovember, bare, underFamily, november, winterGoal, theirs, work],
                                       selected: today, today: today, seasons: nil, me: me, areas: ridge)
        #expect(flags.periods.season.name == "Fall")
        #expect(flags.own.map(\.id) == [fullOfNovember.id, bare.id, underFamily.id])
        // Its year flag is its real parent: 2026 for one, 2027 for the other; none of the family's.
        #expect(flags.own.map(\.parentId) == [y2026.id, y2027.id, nil])
        #expect(Set(flags.above.map(\.id)) == [y2026.id, y2027.id])
        #expect(flags.above.allSatisfy { $0.level == .year })
        // The walk's winter goal is not on the Fall page; another person's and a Work row never are.
        let shown = Set(flags.items.map(\.id))
        for hidden in [winterGoal.id, theirs.id, work.id, family.id] { #expect(!shown.contains(hidden)) }
        #expect(flags.below.map(\.id) == [november.id])
        // Fall holds today while the walk has moved on to winter: Walk it down plans inside Fall (the
        // owner's "where I am"), so the walk's flags here are Fall's, in November and this week.
        #expect(!flags.walk.contains { $0.id == winterGoal.id })
        #expect(flags.walk.contains { $0.id == bare.id })
        #expect(flags.walkPeriods.season.name == "Fall" && flags.walkPeriods.monthName == "November")

        var page = MountainPage(level: .season, flags: flags, areas: ridge, saved: [])
        #expect(page.periods == flags.periods)
        _ = page.apply(.flag(fullOfNovember.id))
        #expect(page.panel?.line == nil)                   // it has November's goal under it
        _ = page.apply(.flag(bare.id))
        #expect(page.panel?.line == DailyCopy.nothingUnder(.season, periods: flags.periods))
        #expect(flags.periods.monthName == "November")
        // Fall holds today: its own goals are walked down, into November.
        #expect(page.panel?.canWalkDown == true)
        #expect(page.walkState.items.count == 5)
    }

    @Test func theNovemberPageOnTheTwentyEighthKeepsItsFallParents() throws {
        let today = day(2026, 11, 28)
        let fall = day(2026, 9, 1), winter = day(2026, 12, 1)
        let year = goal("Finish the house", year: 2027, in: "Home")
        let fallGoal = row("Sort the attic", .season, start: fall, in: "Home", goal: year.id)
        let winterGoal = row("Paint the hall", .season, start: winter, in: "Home", goal: year.id)
        let gutters = row("Clear the gutters", .month, start: day(2026, 11, 1), in: "Home", source: fallGoal.id)
        let december = row("Buy the paint", .month, start: winter, in: "Home", source: winterGoal.id)

        let flags = MountainPage.flags(level: .month, goals: [year], tasks: [fallGoal, winterGoal, gutters, december],
                                       selected: today, today: today, seasons: nil, me: me, areas: ridge)
        #expect(flags.own.map(\.id) == [gutters.id])
        #expect(flags.own.first?.parentId == fallGoal.id)      // a Fall parent stays a Fall parent
        // Above: the year, then Fall, the season that holds today (November's page is where the person is,
        // so the upper flags to hang under are Fall's, not the walk's winter), each once.
        #expect(flags.above.map(\.id) == [year.id, fallGoal.id])
        #expect(flags.above.map(\.parentId) == [nil, year.id])
        #expect(!flags.items.contains { $0.id == december.id || $0.id == winterGoal.id })

        // A goal added with the Fall flag focused files into November, under that flag.
        var page = MountainPage(level: .month, flags: flags, areas: ridge, saved: [])
        _ = page.apply(.flag(fallGoal.id))
        let hanging = try #require(page.hanging)
        #expect(hanging.parent?.id == fallGoal.id)
        #expect(hanging.periods.monthStart == day(2026, 11, 1))
        // The season handed over is one the writer accepts: it holds the month it files into.
        #expect(hanging.periods.season.start <= hanging.periods.monthStart
                && hanging.periods.monthStart < hanging.periods.season.end)

        let container = try ModelContainer(
            for: SymphonyTask.self, Goal.self, GoalArea.self, TaskCommitment.self, TaskFocus.self,
            PendingChange.self, Routine.self, ActionableInstance.self, FamilyMember.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let ctx = ModelContext(container)
        for g in [year] { ctx.insert(g) }
        for t in [fallGoal, winterGoal] { ctx.insert(t) }
        try ctx.save()
        let added = WalkItem(id: UUID(), level: .month, title: "Pick the colours", areaId: hanging.parent?.areaId,
                             parentId: hanging.parent?.id, day: nil)
        WalkWriter(context: ctx, userId: me, periods: hanging.periods).create(added, parent: hanging.parent)
        let written = try #require(try ctx.fetch(FetchDescriptor<SymphonyTask>()).first { $0.id == added.id })
        #expect(written.bucket == "month")
        #expect(PlanCalendar.sameDay(written.monthStart, day(2026, 11, 1)))
        #expect(written.sourceId == fallGoal.id)
        #expect(written.goalId == year.id)
    }

    @Test func theYearPageOnTheTwentyNinthReadsTwentyTwentySix() {
        let today = day(2026, 12, 29)
        let held = goal("Feel strong", year: 2026, in: "Health")
        let bare = goal("Learn to sail", year: 2026, in: "Fun")
        let next = goal("Finish the house", year: 2027, in: "Home")
        let winterUnder = row("Swim twice a week", .season, start: day(2026, 12, 1), in: "Health", goal: held.id)
        let winterNext = row("Paint the hall", .season, start: day(2026, 12, 1), in: "Home", goal: next.id)

        let flags = MountainPage.flags(level: .year, goals: [held, bare, next], tasks: [winterUnder, winterNext],
                                       selected: today, today: today, seasons: nil, me: me, areas: ridge)
        #expect(flags.periods.year == 2026)
        #expect(flags.own.map(\.id) == [held.id, bare.id])
        #expect(flags.above.isEmpty)
        #expect(flags.below.map(\.id) == [winterUnder.id])        // by link, not by the walk's 2027
        #expect(flags.periods.season.name == "Winter")

        var page = MountainPage(level: .year, flags: flags, areas: ridge, saved: [])
        _ = page.apply(.flag(held.id))
        #expect(page.panel?.line == nil)
        _ = page.apply(.flag(bare.id))
        #expect(page.panel?.line == DailyCopy.nothingUnder(.year, periods: flags.periods))
    }

    @Test func aFlagWhoseParentIsGoneStandsOnItsAreasPost() {
        let today = day(2026, 11, 14)
        let orphan = row("Three runs a week", .month, start: day(2026, 11, 1), in: "Health", source: UUID())
        let selfLinked = row("Stretch", .month, start: day(2026, 11, 1), in: "Health")
        selfLinked.sourceId = selfLinked.id
        let flags = MountainPage.flags(level: .month, goals: [], tasks: [orphan, selfLinked],
                                       selected: today, today: today, seasons: nil, me: me, areas: ridge)
        #expect(flags.own.map(\.parentId) == [nil, nil])
        #expect(flags.above.isEmpty)
        let page = MountainPage(level: .month, flags: flags, areas: ridge, saved: [])
        let layout = WalkLayout.make(page.walkState, today: today, footing: .natural)
        #expect(layout.posts.contains { $0.key == WalkPostKey(level: .month, column: area("Health").id) })
    }

    // MARK: Walking a goal down, from a sign or a page

    /// The two signs that walk open the walk one level below the goal they name, about it,
    /// with no lesson, and come back to Today.
    @Test func aSignsWalkDownOpensWhereTheSignPoints() throws {
        let today = day(2026, 11, 10)                   // the demo's day: fall
        let periods = WalkPeriods.pick(now: today)
        func sign(_ goals: [Goal], _ tasks: [SymphonyTask]) -> Signpost.Sign? {
            Signpost.pick(Signpost.facts(tasks: tasks, goals: goals, focus: [], commitments: [], today: today,
                                         me: me, seasons: nil))
        }
        func down(_ target: Signpost.Target, _ goals: [Goal], _ tasks: [SymphonyTask]) -> DailyWalkDown? {
            DailyWalkDown.sign(target, goals: goals, tasks: tasks, areaRows: [], saved: nil, periods: periods,
                               now: today, seasons: nil, me: me)
        }

        // No piece this fall: a year goal with nothing under it opens Season, about it.
        let lone = goal("Feel strong again", year: periods.year, in: "Health")
        let noPiece = try #require(sign([lone], []))
        #expect(noPiece.kind == .noPiece)
        #expect(noPiece.target == .walkDown(lone.id, .year))
        let fromYear = try #require(down(noPiece.target, [lone], []))
        #expect(fromYear.position.step == 2)
        #expect(fromYear.position.focus["2"] == lone.id)
        #expect(fromYear.position.taught)
        #expect(fromYear.position.status == .inProgress)
        #expect(fromYear.userId == me)
        #expect(fromYear.returnsTo.horizon == .today && PlanCalendar.sameDay(fromYear.returnsTo.date, today))
        // Asking for it lets the bar go at once (fix round 1).
        #expect(fromYear.bar == [.left])
        // Asked at a moment of the day, it returns to that day, whatever date the app was pointed at.
        let atTea = try #require(DailyWalkDown.sign(noPiece.target, goals: [lone], tasks: [], areaRows: [], saved: nil,
                                                    periods: periods, now: today.addingTimeInterval(17 * 3600),
                                                    seasons: nil, me: me))
        #expect(atTea.returnsTo.date == today)

        // A new week: a month goal of the walk's month and nothing on this week opens Week, about it.
        let piece = row("Strength twice a week", .season, start: periods.season.start, in: "Health", goal: lone.id)
        let month = row("Find a gym that fits", .month, start: periods.monthStart, in: "Health", source: piece.id)
        let newWeek = try #require(sign([lone], [piece, month]))
        #expect(newWeek.kind == .newWeek)
        #expect(newWeek.target == .walkDown(month.id, .month))
        let fromMonth = try #require(down(newWeek.target, [lone], [piece, month]))
        #expect(fromMonth.position.step == 4)
        #expect(fromMonth.position.focus["4"] == month.id)

        // A sign that does not walk, a goal that has gone, or the wrong level: no walk.
        #expect(down(.week(today), [lone], []) == nil)
        #expect(down(.walkDown(UUID(), .year), [lone], []) == nil)
        #expect(down(.walkDown(lone.id, .month), [lone], []) == nil)
        // Another person's goal, or one off the walk's year, is never walked down.
        let theirs = goal("Their goal", year: periods.year, in: "Health", user: UUID())
        #expect(down(.walkDown(theirs.id, .year), [theirs], []) == nil)
        let lastYear = goal("Last year's goal", year: periods.year - 1, in: "Health")
        #expect(down(.walkDown(lastYear.id, .year), [lastYear], []) == nil)
    }

    /// "Walk it down" on a page: the chosen flag, one level down, in the walk's own periods,
    /// with the page's ridge and the saved walk's kept areas; it comes back to that page.
    @Test func aPagesWalkDownIsItsChosenFlagAndComesBackToThePage() throws {
        let today = day(2026, 11, 10)
        let periods = WalkPeriods.pick(now: today)
        let opened = day(periods.year, 1, 1)            // the walk's year: 2027, as the row of words opens it
        let strong = goal("Feel strong again", year: periods.year, in: "Health")
        let bathroom = goal("Finish the bathroom", year: periods.year, in: "Home")
        let flags = MountainPage.flags(level: .year, goals: [strong, bathroom], tasks: [], selected: opened,
                                       today: today, seasons: nil, me: me, areas: ridge)
        var page = MountainPage(level: .year, flags: flags, areas: ridge, saved: [area("People").id])
        _ = page.apply(.flag(strong.id))
        #expect(page.apply(.walkDown) == [.walkDown(strong.id)])
        let down = try #require(DailyWalkDown.page(page, flag: strong.id, from: .year, date: opened, periods: periods,
                                                   now: today, seasons: nil, userId: me))
        #expect(down.position.step == 2)
        #expect(down.position.focus["2"] == strong.id)
        #expect(down.position.taught)
        #expect(Set(down.position.kept) == [area("Health").id, area("Home").id, area("People").id])
        #expect(Set(down.position.planted) == [strong.id, bathroom.id])
        #expect(down.position.areas == ridge)
        #expect(down.returnsTo.horizon == .year && PlanCalendar.sameDay(down.returnsTo.date, opened))

        // A flag the page does not offer it on (a year neither holding today nor the walk's) opens nothing.
        let thisYear = day(periods.year - 2, 6, 1)
        let old = goal("An old goal", year: periods.year - 2, in: "Fun")
        var earlier = MountainPage(level: .year,
                                   flags: MountainPage.flags(level: .year, goals: [old], tasks: [], selected: thisYear,
                                                             today: today, seasons: nil, me: me, areas: ridge),
                                   areas: ridge, saved: [])
        _ = earlier.apply(.flag(old.id))
        #expect(earlier.panel?.canWalkDown == false)
        #expect(DailyWalkDown.page(earlier, flag: old.id, from: .year, date: thisYear, periods: periods, now: today,
                                   seasons: nil, userId: me) == nil)
        #expect(DailyWalkDown.page(page, flag: UUID(), from: .year, date: opened, periods: periods, now: today,
                                   seasons: nil, userId: me) == nil)
    }

    /// Asked for, a walk-down opens ahead of any other walk only in a light household, for the
    /// person who asked, with no walk up; anything else drops it, so it never opens later by itself.
    @Test func aWalkDownOpensOnlyInLightForWhoAskedAndNeverWaits() throws {
        let today = day(2026, 11, 10)
        let periods = WalkPeriods.pick(now: today)
        let strong = goal("Feel strong again", year: periods.year, in: "Health")
        let down = try #require(DailyWalkDown.sign(.walkDown(strong.id, .year), goals: [strong], tasks: [],
                                                   areaRows: [], saved: nil, periods: periods, now: today,
                                                   seasons: nil, me: me))
        #expect(DailyWalkDown.decide(nil, walkUp: false, userId: me, edition: .light) == .none)
        #expect(DailyWalkDown.decide(down, walkUp: false, userId: me, edition: .light) == .open(down))
        #expect(DailyWalkDown.decide(down, walkUp: true, userId: me, edition: .light) == .drop)
        #expect(DailyWalkDown.decide(down, walkUp: false, userId: me, edition: .full) == .drop)
        #expect(DailyWalkDown.decide(down, walkUp: false, userId: UUID(), edition: .light) == .drop)
        #expect(DailyWalkDown.decide(down, walkUp: false, userId: nil, edition: .light) == .drop)
    }

    /// A followed sign is put away for the day (ruling 22), except one that walks a goal down
    /// whose walk-down could not be built: it took the person nowhere, so it stays.
    @Test func aWalkingSignIsPutAwayOnlyWhenItsWalkOpens() throws {
        let today = day(2026, 11, 10)
        let periods = WalkPeriods.pick(now: today)
        let strong = goal("Feel strong again", year: periods.year, in: "Health")
        let walking = Signpost.Sign(kind: .noPiece, eyebrow: nil, title: strong.name, target: .walkDown(strong.id, .year),
                                    seed: "noPiece")
        let down = try #require(DailyWalkDown.sign(walking.target, goals: [strong], tasks: [], areaRows: [], saved: nil,
                                                   periods: periods, now: today, seasons: nil, me: me))
        #expect(DailyWalkDown.putsAway(walking, walkDown: down))
        #expect(!DailyWalkDown.putsAway(walking, walkDown: nil))
        let week = Signpost.Sign(kind: .todayOpen, eyebrow: nil, title: "Call the plumber", target: .week(today), seed: "w")
        #expect(DailyWalkDown.putsAway(week, walkDown: nil))
        let first = Signpost.Sign(kind: .firstToday, eyebrow: nil, title: "Call the plumber", target: .light(UUID()),
                                  seed: "f")
        #expect(!DailyWalkDown.putsAway(first, walkDown: nil))
    }

    // MARK: See my whole plan

    /// The handle lowers Today's sheet over the walk's own top-to-bottom plan and raises it
    /// again. Lowered, the bar lets go and the handle says "Show my day" (Week: "Show my week").
    /// Nothing is written and no walk opens.
    @Test func theWholePlanLowersTheSheetAndIsOnlyRead() {
        let w = wholePlan()
        var look = w.look
        let (goals, tasks, periods) = (w.goals, w.tasks, w.periods)
        let plan = look.plan(goals: goals, tasks: tasks, periods: periods, me: me)
        #expect(plan.step == 6)
        #expect(plan.taught && !plan.teaching)
        #expect(plan.items.map(\.id) == ([goals.map(\.id), tasks.filter { $0.userId == me }.map(\.id)].flatMap { $0 }))
        #expect(plan.kept == [area("Health").id, area("Home").id, area("People").id])
        #expect(look.label(on: .today) == DailyCopy.showMyDay)
        #expect(DailyCopy.showMyDay == WalkCopy.showMyDay)
        #expect(look.label(on: .week) == DailyCopy.showMyWeek)
        // A flag is read: its tap does nothing here.
        look.tap(.bannerTapped(goals[0].id))
        look.tap(nil)
        #expect(look.plan(goals: goals, tasks: tasks, periods: periods, me: me).selected == nil)

        // Raised again: nothing open, nothing for the bar.
        #expect(look.handleTapped(areas: ridge, kept: []) == [])
        #expect(!look.lowered && look.standing == nil && look.paperLevel == nil)
        #expect(look.label(on: .today) == WalkCopy.lookBackHandle)

        // Every phone window has the handle (F25): a short one lowers too.
        var short = DailyLookBack()
        _ = short.handleTapped(areas: ridge, kept: [])
        let tall = DailyMetrics.today(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34)
        let outside = DailyMetrics.today(size: CGSize(width: 466, height: 678), safeTop: 22, safeBottom: 0, shape: .short)
        #expect(short.sheet(on: tall, safeBottom: 34) == tall.lowered(safeBottom: 34))
        #expect(short.sheet(on: outside, safeBottom: 0) == outside.lowered(safeBottom: 0) && outside.lowered(safeBottom: 0) != nil)
        #expect(DailyLookBack().sheet(on: tall, safeBottom: 34) == nil)
    }

    /// The whole plan behind Today's lowered sheet: Health holds a year goal, a season goal, a month goal
    /// and a week task dated today; Home a year goal and a month goal; People a month goal and a week
    /// task under it. Lowered.
    private func wholePlan() -> (look: DailyLookBack, goals: [Goal], tasks: [SymphonyTask], periods: WalkPeriods,
                                 home: (year: Goal, month: SymphonyTask)) {
        let today = day(2026, 11, 10)
        let periods = WalkPeriods.pick(now: today)
        let strong = goal("Feel strong again", year: periods.year, in: "Health")
        let bathroom = goal("Finish the bathroom", year: periods.year, in: "Home")
        let piece = row("Strength twice a week", .season, start: periods.season.start, in: "Health", goal: strong.id)
        let month = row("Find a gym that fits", .month, start: periods.monthStart, in: "Health", source: piece.id)
        let tile = row("Pick the tile", .month, start: periods.monthStart, in: "Home")
        let cabin = row("Book the cabin", .month, start: periods.monthStart, in: "People")
        let week = row("Tour the gym", .week, start: periods.weekStart, in: "Health", source: month.id)
        week.scheduledFor = today
        let mum = row("Call Mum", .week, start: periods.weekStart, in: "People", source: cabin.id)
        let theirs = row("Their task", .week, start: periods.weekStart, in: "Health", user: UUID())
        var look = DailyLookBack()
        #expect(look.handleTapped(areas: ridge, kept: [area("People").id]) == [.left])   // the bar stops listening
        return (look, [strong, bathroom], [piece, month, tile, cabin, week, mum, theirs], periods, (bathroom, tile))
    }

    /// F6 behind Today: the plan stands in the first kept area with a flag; a tap on a side post stands
    /// it there; a tap on an area that holds nothing, or while the sheet is up, does nothing.
    @Test func theWholePlanBehindTodaySwitchesAreaOnATap() {
        let w = wholePlan()
        var look = w.look
        let (goals, tasks, periods, home) = (w.goals, w.tasks, w.periods, w.home)
        func plan() -> WalkState { look.plan(goals: goals, tasks: tasks, periods: periods, me: me) }
        func cloths() -> [UUID?] { WalkLayout.make(plan(), today: periods.today, footing: .level).posts.flatMap(\.banners).map(\.itemId) }
        #expect(look.standing == nil && plan().standing == area("Health").id)
        let sides = WalkLayout.make(plan(), today: periods.today, footing: .level).sides
        #expect(sides.map(\.name) == ["Home", "People"])
        look.tap(WalkLayout.tapEvent(sides[0]))
        #expect(look.standing == area("Home").id && plan().standing == area("Home").id)
        #expect(cloths() == [home.year.id, home.month.id])
        // Raised, the plan is not there to tap; lowered again it starts where it always does.
        look.raise()
        look.tap(.areaTapped(area("People").id))
        #expect(look.standing == nil)
        _ = look.handleTapped(areas: ridge, kept: [])
        #expect(plan().standing == area("Health").id)
    }

    /// F21 behind Today: a cloth opens the paper for its level, over the kept areas the sheet read; a
    /// row closes it and stands the plan in that row's area; "Show the mountain" closes it.
    @Test func theWholePlanBehindTodayOpensAPaper() throws {
        let w = wholePlan()
        var look = w.look
        let (goals, tasks, periods, home) = (w.goals, w.tasks, w.periods, w.home)
        func plan() -> WalkState { look.plan(goals: goals, tasks: tasks, periods: periods, me: me) }
        #expect(look.paper(goals: goals, tasks: tasks, periods: periods, me: me) == nil)
        let layout = WalkLayout.make(plan(), today: periods.today, footing: .level)
        let month = try #require(layout.posts.first?.banners.first { $0.level == .month })
        look.tap(WalkLayout.tapEvent(month, on: layout.posts[0]))
        #expect(look.paperLevel == .month)
        let paper = try #require(look.paper(goals: goals, tasks: tasks, periods: periods, me: me))
        #expect(paper.title == periods.monthName && paper.count == WalkCopy.paperCount(3, level: .month))
        #expect(paper.sections.map(\.area) == [area("Health").id, area("Home").id, area("People").id])
        // While it is open a side post's tap is under it.
        look.tap(.areaTapped(area("People").id))
        #expect(look.paperLevel == .month && plan().standing == area("Health").id)
        look.rowTapped(home.month.id, on: paper)
        #expect(look.paperLevel == nil && look.standing == area("Home").id && plan().standing == area("Home").id)
        // Today's paper reads the tasks dated today; "Show the mountain" closes it.
        look.tap(.lookBackPaper(.today))
        #expect(look.paper(goals: goals, tasks: tasks, periods: periods, me: me)?.sections.flatMap(\.rows).map(\.title) == ["Tour the gym"])
        look.tap(.paperClosed)
        #expect(look.paperLevel == nil && look.paper(goals: goals, tasks: tasks, periods: periods, me: me) == nil)
        // Raised, nothing is open.
        look.tap(.lookBackPaper(.year))
        look.raise()
        #expect(look.paperLevel == nil)
        look.tap(.lookBackPaper(.year))
        #expect(look.paperLevel == nil)
    }

    /// A Tell (the Lock Screen control, `symphony://tell`) while the plan shows raises the sheet
    /// first, so the bar that answers it is on screen; while the walk shows it waits.
    @Test func aTellRaisesTheSheetSoTheBarIsThere() {
        var look = DailyLookBack()
        let upAlready = look.tellArrives(asked: true, walkShowing: false)
        #expect(!upAlready)                                              // already up: nothing to do
        _ = look.handleTapped(areas: ridge, kept: [])
        let notAsked = look.tellArrives(asked: false, walkShowing: false)
        #expect(!notAsked)
        #expect(look.lowered)
        let waits = look.tellArrives(asked: true, walkShowing: true)
        #expect(!waits)                                                  // the Tell waits for the walk
        #expect(look.lowered)
        let raised = look.tellArrives(asked: true, walkShowing: false)
        #expect(raised)
        #expect(!look.lowered)
        #expect(look.label(on: .today) == WalkCopy.lookBackHandle)
        let tall = DailyMetrics.today(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34)
        #expect(look.sheet(on: tall, safeBottom: 34) == nil)              // the bar is drawn again
    }

    /// Covered by the half-open display, the page keeps its plan down: a Tell is the display's.
    @Test func aCoveredPageKeepsItsPlanDownThroughATell() {
        var look = DailyLookBack()
        _ = look.handleTapped(areas: ridge, kept: [])
        let underTheDisplay = look.tellArrives(asked: true, walkShowing: false, covered: true)
        #expect(!underTheDisplay)
        #expect(look.lowered)
        let openedFlat = look.tellArrives(asked: true, walkShowing: false, covered: false)
        #expect(openedFlat)
        #expect(!look.lowered)
    }

    /// The way back from the plan: a tap anywhere on the lowered strip, or a drag mostly up of
    /// 30 points or more, raises the sheet; a sideways or downward drag, or a short one, does not.
    @Test func aTapOrADragUpRaisesTheLoweredSheet() {
        #expect(DailyLookBack.stripRaises(translation: .zero))
        #expect(DailyLookBack.stripRaises(translation: CGSize(width: 4, height: -6)))           // a tap that wobbled
        #expect(DailyLookBack.stripRaises(translation: CGSize(width: 0, height: -30)))
        #expect(DailyLookBack.stripRaises(translation: CGSize(width: 20, height: -120)))
        #expect(!DailyLookBack.stripRaises(translation: CGSize(width: 0, height: -20)))         // too short to be a raise
        #expect(!DailyLookBack.stripRaises(translation: CGSize(width: 0, height: 80)))          // down
        #expect(!DailyLookBack.stripRaises(translation: CGSize(width: 90, height: -40)))        // sideways
        #expect(!DailyLookBack.stripRaises(translation: .zero, endedAsDrag: true))

        var look = DailyLookBack()
        _ = look.handleTapped(areas: ridge, kept: [])
        look.raise()
        #expect(!look.lowered)
    }
}
