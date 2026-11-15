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
        _ = page.apply(.flag(parent.id))
        let hanging = page.hanging
        #expect(hanging?.periods.monthStart == day(2026, 11, 1))
        #expect(hanging?.parent?.id == parent.id)
        #expect(hanging?.focusArea == nil)
        #expect(hanging?.kept.map(\.name) == ["Health", "Home"])

        // On Year the zoomed peak is where a goal hangs, and there is no parent.
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
            let bare = MountainPage(level: level, items: [], areas: Array(ridge.prefix(6)), saved: [])
            let empty = WalkLayout.make(bare.walkState, today: today, footing: .natural)
            #expect(empty.banners.isEmpty, "\(level)")
            #expect(empty.posts.isEmpty, "\(level)")

            let full = MountainPage(level: level, items: fullRidge(), areas: ridge, saved: [])
            #expect(full.kept.count == 8)
            let layout = WalkLayout.make(full.walkState, today: today, footing: .natural)
            let banners = layout.banners
            #expect(!banners.isEmpty, "\(level)")
            #expect(banners.contains { $0.level == level }, "\(level)")
            // A small flag stays on its pole and the screen clips it, as on the walk; every other cloth is inside.
            for b in banners where b.kind != .tip {
                #expect(b.drawn.minX >= WalkLayout.edges.lowerBound - 0.01
                        && b.drawn.maxX <= WalkLayout.edges.upperBound + 0.01, "\(level) \(b.id) \(b.drawn)")
            }
            for b in banners {
                #expect(b.drawn.minY >= WalkLayout.flagCeiling - 0.01, "\(level) \(b.id) at \(b.drawn.minY)")
            }
            let own = banners.filter { $0.level == level }
            for i in own.indices { for j in own.indices where j > i {
                #expect(!WalkTurn.meet(own[i].corners, own[j].corners), "\(level) \(own[i].id) meets \(own[j].id)")
            } }
        }
    }

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
        for level in [WalkLevel.year, .season, .month, .week] {
            #expect(layout.posts.contains { $0.key.level == level }, "\(level)")
        }
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

        // A flag two levels up, or one that is not here, does nothing.
        _ = page.apply(.flag(y.id))
        _ = page.apply(.flag(UUID()))
        #expect(page.selected == nil && page.focus == nil)

        // A tap on the mountain lets go, and closes Move to.
        _ = page.apply(.flag(m.id))
        _ = page.apply(.moveTapped)
        #expect(page.moving)
        #expect(page.apply(.letGo) == [])
        #expect(page.selected == nil && !page.moving)
    }

    @Test func aFlagOneLevelUpIsFocused() {
        let y = flag(.year, "Run a half marathon", in: "Health")
        let s = flag(.season, "Build up to ten miles", in: "Health", parent: y.id)
        var season = MountainPage(level: .season, items: [y, s], areas: ridge, saved: [])
        _ = season.apply(.flag(y.id))
        #expect(season.focus == y.id)
        #expect(season.selected == nil)
        #expect(season.walkState.focus[.season] == y.id)
        #expect(WalkLayout.make(season.walkState, today: day(2026, 11, 14)).camera.k == WalkLayout.zoomK)
        _ = season.apply(.flag(y.id))
        #expect(season.focus == nil)
        #expect(season.walkState.focus.isEmpty)

        var month = MountainPage(level: .month, items: [y, s], areas: ridge, saved: [])
        _ = month.apply(.flag(s.id))
        #expect(month.focus == s.id)
        #expect(month.walkState.focus[.month] == s.id)

        // Year has no level above it: a year flag is chosen, never focused.
        var year = MountainPage(level: .year, items: [y, s], areas: ridge, saved: [])
        _ = year.apply(.flag(y.id))
        #expect(year.focus == nil && year.selected == y.id)
    }

    @Test func aPeakZoomsOnYear() {
        let y = flag(.year, "Run a half marathon", in: "Health")
        var year = MountainPage(level: .year, items: [y], areas: ridge, saved: [area("Home").id])
        _ = year.apply(.peak(area("Home").id))
        #expect(year.focusArea == area("Home").id)
        #expect(year.walkState.focusArea == area("Home").id)
        #expect(WalkLayout.make(year.walkState, today: day(2026, 11, 14)).camera.k == WalkLayout.zoomK)
        _ = year.apply(.peak(area("Home").id))
        #expect(year.focusArea == nil)

        // A peak that is not on the ridge does nothing; nor does a peak on another page.
        _ = year.apply(.peak(area("Fun").id))
        #expect(year.focusArea == nil)
        var season = MountainPage(level: .season, items: [y], areas: ridge, saved: [area("Home").id])
        _ = season.apply(.peak(area("Home").id))
        #expect(season.focusArea == nil)
        #expect(season.walkState.focusArea == nil)
    }

    @Test func aPostOpensAndClosesAgain() {
        var page = MountainPage(level: .month, items: [], areas: ridge, saved: [])
        let key = WalkPostKey(level: .month, column: area("Home").id)
        _ = page.apply(.post(key))
        #expect(page.expanded == key)
        #expect(page.walkState.expanded == key)
        _ = page.apply(.post(key))
        #expect(page.expanded == nil)
    }

    @Test func aWalkTapIsTheSameTapHere() {
        let id = UUID()
        let key = WalkPostKey(level: .season, column: nil)
        #expect(MountainPage.event(for: .bannerTapped(id)) == .flag(id))
        #expect(MountainPage.event(for: .stubTapped(key)) == .post(key))
        #expect(MountainPage.event(for: .areaTapped(id)) == .peak(id))
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
    /// again. Lowered, the bar lets go, the handle says "Show my day" (Week: "Show my week"),
    /// and only a post's "+n" answers a tap. Nothing is written and no walk opens.
    @Test func theWholePlanLowersTheSheetAndIsOnlyRead() {
        let today = day(2026, 11, 10)
        let periods = WalkPeriods.pick(now: today)
        let strong = goal("Feel strong again", year: periods.year, in: "Health")
        let piece = row("Strength twice a week", .season, start: periods.season.start, in: "Health", goal: strong.id)
        let month = row("Find a gym that fits", .month, start: periods.monthStart, in: "Health", source: piece.id)
        let week = row("Tour the gym", .week, start: periods.weekStart, in: "Health", source: month.id)
        let theirs = row("Their task", .week, start: periods.weekStart, in: "Health", user: UUID())
        let tasks = [piece, month, week, theirs]

        var look = DailyLookBack()
        #expect(!look.lowered)
        #expect(look.label(on: .today) == WalkCopy.lookBackHandle)
        #expect(look.handleTapped(areas: ridge, kept: [area("People").id]) == [.left])   // the bar stops listening
        #expect(look.lowered)
        #expect(look.label(on: .today) == DailyCopy.showMyDay)
        #expect(DailyCopy.showMyDay == WalkCopy.showMyDay)
        #expect(look.label(on: .week) == DailyCopy.showMyWeek)

        let plan = look.plan(goals: [strong], tasks: tasks, periods: periods, me: me)
        #expect(plan.step == 6)
        #expect(plan.taught && !plan.teaching)
        #expect(plan.items.map(\.id) == [strong.id, piece.id, month.id, week.id])
        #expect(plan.kept == [area("Health").id, area("People").id])

        // "+n" opens its post and closes it again; a flag is read, not tapped.
        let post = WalkPostKey(level: .month, column: area("Health").id)
        look.tap(.stubTapped(post))
        #expect(look.plan(goals: [strong], tasks: tasks, periods: periods, me: me).expanded == post)
        look.tap(.bannerTapped(strong.id))
        look.tap(.areaTapped(area("Health").id))
        look.tap(nil)
        let read = look.plan(goals: [strong], tasks: tasks, periods: periods, me: me)
        #expect(read.expanded == post && read.selected == nil && read.focusArea == nil)
        look.tap(.stubTapped(post))
        #expect(look.plan(goals: [strong], tasks: tasks, periods: periods, me: me).expanded == nil)

        // Raised again: nothing open, nothing for the bar.
        look.tap(.stubTapped(post))
        #expect(look.handleTapped(areas: ridge, kept: []) == [])
        #expect(!look.lowered)
        #expect(look.label(on: .today) == WalkCopy.lookBackHandle)
        #expect(look.plan(goals: [strong], tasks: tasks, periods: periods, me: me).expanded == nil)
        look.tap(.stubTapped(post))                     // raised, the plan is not there to tap
        #expect(look.plan(goals: [strong], tasks: tasks, periods: periods, me: me).expanded == nil)

        // Only where the window has a handle: a short window never lowers.
        var short = DailyLookBack()
        _ = short.handleTapped(areas: ridge, kept: [])
        let tall = DailyMetrics.today(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34)
        let outside = DailyMetrics.today(size: CGSize(width: 466, height: 678), safeTop: 22, safeBottom: 0, shape: .short)
        #expect(short.sheet(on: tall, safeBottom: 34) == tall.lowered(safeBottom: 34))
        #expect(short.sheet(on: outside, safeBottom: 0) == nil)
        #expect(DailyLookBack().sheet(on: tall, safeBottom: 34) == nil)
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
