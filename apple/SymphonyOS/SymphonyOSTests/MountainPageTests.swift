import Testing
import Foundation
import CoreGraphics
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

    @Test func theOwnLevelFollowsTheDateAndTheLevelsAboveFollowTheWalk() {
        let opened = day(2026, 11, 28)
        let walk = WalkPeriods.pick(now: opened)
        let page = MountainPage.periods(level: .month, selected: opened, today: opened, seasons: nil)
        #expect(walk.monthStart == day(2026, 12, 1))
        #expect(page.monthStart == day(2026, 11, 1))
        #expect(page.year == walk.year)
        #expect(page.season == walk.season)
        #expect(page.weekStart == walk.weekStart)
        #expect(page.today == walk.today)

        // On a day when the two agree, the page is the walk's.
        let mid = day(2026, 10, 14)
        #expect(MountainPage.periods(level: .month, selected: mid, today: mid, seasons: nil).monthStart
            == WalkPeriods.pick(now: mid).monthStart)

        // A Season page opened on 14 November shows fall while the walk plans winter.
        let fourteenth = day(2026, 11, 14)
        let season = MountainPage.periods(level: .season, selected: fourteenth, today: fourteenth, seasons: nil)
        #expect(WalkPeriods.pick(now: fourteenth).season.name == "Winter")
        #expect(season.season.name == "Fall")
        #expect(season.monthStart == WalkPeriods.pick(now: fourteenth).monthStart)
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
                #expect(b.drawn.minY >= WalkLayout.question - 0.01, "\(level) \(b.id) at \(b.drawn.minY)")
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
        #expect(page.kept == [area("Health").id, area("Money").id])
        #expect(page.items.first?.areaId == area("Money").id)
        #expect(page.selected == nil && !page.moving)

        // Moving into an area already kept keeps nothing new.
        _ = page.apply(.flag(y.id))
        #expect(page.apply(.moveTo(area("Health").id)) == [.setArea(y.id, .year, to: area("Health").id, from: area("Money").id)])
        #expect(page.kept == [area("Health").id, area("Money").id])
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
}
