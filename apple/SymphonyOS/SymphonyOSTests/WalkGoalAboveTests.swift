import Testing
import Foundation
import CoreGraphics
@testable import Symphony

// F40, the owner's ruling: wherever a goal above is shown (the walk's Season, Month and Week steps, and the
// Season and Month pages, one drawing), the standing post shows only the flags whose parent is that goal; a
// tap on it goes round the area's goals above in a fixed order, then a "Not under a goal yet" stop for the
// area's flags hanging under none of them; the goal above carries "1 of 3" while there is more than one stop.
// Generated states, not only the demo's.

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}
private let today = day(2026, 11, 13)
private func uid(_ n: Int) -> UUID { UUID(uuidString: String(format: "00000000-0000-0000-0000-%012x", n))! }
private let ridge = ["Health", "Home", "Work"].enumerated().map { WalkArea(id: uid(5000 + $0.offset), name: $0.element) }
private func area(_ name: String) -> WalkArea { ridge.first { $0.name == name }! }
private let env = WalkEnv(periods: WalkPeriods.pick(now: today), now: today)

/// One generated plan on a step's level and the one above: in Health `goals` goals above, goal g holding
/// `children(g)` flags; `unhung` flags with no parent and `elsewhere` flags under Home's goal (both under no
/// goal of Health); Home one goal with two flags; Work nothing. Kept: all three. Standing in Health.
private struct Shape: CustomStringConvertible {
    let step: Int, goals: Int, per: Int, unhung: Int, elsewhere: Int
    func children(_ g: Int) -> Int { [per, (per + 3) % 6, 5][g] }
    var description: String { "step \(step), \(goals) goals, per \(per), unhung \(unhung), elsewhere \(elsewhere)" }

    func state() -> WalkState {
        let level = WalkLevel(rawValue: step)!, above = WalkLevel(rawValue: step - 1)!
        var n = 0
        func next() -> UUID { n += 1; return uid(9000 + step * 1000 + n) }
        var items: [WalkItem] = []
        let homeGoal = WalkItem(id: next(), level: above, title: "Home goal", areaId: area("Home").id, parentId: nil, day: nil)
        items.append(homeGoal)
        items += (0..<2).map { WalkItem(id: next(), level: level, title: "Home flag \($0)", areaId: area("Home").id,
                                        parentId: homeGoal.id, day: nil) }
        for g in 0..<goals {
            let goal = WalkItem(id: next(), level: above, title: "Health goal \(g)", areaId: area("Health").id, parentId: nil, day: nil)
            items.append(goal)
            items += (0..<children(g)).map { WalkItem(id: next(), level: level, title: "Under goal \(g), flag \($0)",
                                                      areaId: area("Health").id, parentId: goal.id, day: nil) }
        }
        items += (0..<unhung).map { WalkItem(id: next(), level: level, title: "Under none \($0)", areaId: area("Health").id,
                                             parentId: nil, day: nil) }
        items += (0..<elsewhere).map { WalkItem(id: next(), level: level, title: "Under Home's goal \($0)",
                                                areaId: area("Health").id, parentId: homeGoal.id, day: nil) }
        var s = WalkState()
        s.areas = ridge
        s.kept = ridge.map(\.id)
        s.step = step
        s.items = items
        s.focusArea = area("Health").id
        s.taught = true
        return s.settled
    }
}

private let shapes: [Shape] = (2...4).flatMap { step in
    (0...3).flatMap { goals in [0, 1, 2, 5].flatMap { per in (0...2).flatMap { unhung in (0...1).map { elsewhere in
        Shape(step: step, goals: goals, per: per, unhung: unhung, elsewhere: elsewhere)
    } } } }
}

private extension WalkLayout {
    var banners: [Banner] { posts.flatMap(\.banners) }
    var above: Banner? { banners.first { $0.kind == .parent } }
    var drawn: [UUID] { banners.filter { $0.kind == .full }.compactMap(\.itemId) }
    var more: Int { banners.compactMap { if case .more(let n) = $0.kind { return n }; return nil }.first ?? 0 }
}

struct WalkGoalAboveTests {
    /// Going round the stops: each stop draws only its own flags (the goal above's children, or on the last
    /// stop those under none of the area's goals), "+n more" counts the rest of that stop's, every flag of
    /// the area on the level is shown or counted exactly once in all, the count line is right, the side
    /// posts and the paper are unchanged by switching, and the round comes back where it started.
    @Test func theGoalAboveShowsOnlyItsOwnAndGoesRound() {
        var checked = 0
        for shape in shapes {
            var s = shape.state()
            let level = s.level!
            let all = s.items(on: level).filter { s.column(of: $0) == area("Health").id }
            let goals = s.items(on: WalkLevel(rawValue: level.rawValue - 1)!).filter { $0.areaId == area("Health").id }
            let under = all.filter { f in !goals.contains { $0.id == f.parentId } }
            let stops = s.goalAboveStops()
            // With nothing of the level's here, nor a goal above, the walk goes on to an area that holds one.
            if all.isEmpty && goals.isEmpty { continue }
            #expect(s.standing == area("Health").id, "\(shape)")
            if goals.isEmpty {
                #expect(stops.isEmpty && s.standingFlags().map(\.id) == all.map(\.id), "\(shape)")
                #expect(WalkLayout.make(s, today: today, footing: .level).above == nil, "\(shape)")
                continue
            }
            #expect(stops == goals.map(\.id) + (under.isEmpty ? [] : [WalkState.noGoalAbove]), "\(shape)")
            let sides = WalkLayout.make(s, today: today, footing: .level).sides.map(\.count)
            let paper = PlanPaper.make(level: level, items: s.items, areas: s.areas, kept: s.kept, title: "", today: today)
            let start = s.focus[level]
            var shown: [UUID] = []
            for _ in stops.indices {
                let layout = WalkLayout.make(s, today: today, footing: .level)
                guard let stop = s.focus[level], let at = stops.firstIndex(of: stop), let above = layout.above else {
                    Issue.record("\(shape): no stop shown (\(String(describing: s.focus[level])))")
                    break
                }
                let mine = stop == WalkState.noGoalAbove ? under : all.filter { $0.parentId == stop }
                #expect(above.itemId == stop && above.loose == (stop == WalkState.noGoalAbove), "\(shape)")
                #expect(Set(layout.drawn).isSubset(of: Set(mine.map(\.id))), "\(shape) at \(at)")
                #expect(layout.drawn.count + layout.more == mine.count, "\(shape) at \(at)")
                #expect(s.standingFlags().map(\.id) == mine.map(\.id), "\(shape) at \(at)")
                if stops.count > 1 {
                    #expect(above.tag == "\(at + 1) of \(stops.count)" && above.taps, "\(shape) at \(at)")
                    #expect(above.label.contains("goal \(at + 1) of \(stops.count), tap to switch"), "\(shape) at \(at)")
                    #expect(above.frame.height == 12 + 14 * CGFloat(above.lines) + 14, "\(shape) at \(at)")
                } else {
                    #expect(above.tag == nil && !above.taps && !above.label.contains("tap"), "\(shape)")
                    #expect(above.frame.height == 12 + 14 * CGFloat(above.lines), "\(shape)")
                }
                #expect(layout.sides.map(\.count) == sides, "\(shape) at \(at)")
                #expect(PlanPaper.make(level: level, items: s.items, areas: s.areas, kept: s.kept, title: "", today: today) == paper)
                shown += mine.map(\.id)
                // A tap on the goal above: the next stop (nothing when it is the only one).
                _ = s.apply(.bannerTapped(stop), env)
                checked += 1
            }
            #expect(s.focus[level] == start, "\(shape): the round does not come back")
            #expect(shown.count == all.count && Set(shown) == Set(all.map(\.id)), "\(shape): \(shown.count) of \(all.count)")
        }
        #expect(checked > 400, "\(checked)")
    }

    /// The layout's guarantees (`Invariants.check`: ceiling, floor, edges, touch frames, nothing meeting the
    /// hint or the controls) hold at every stop with the goal above's taller cloth, on a phone's board and a
    /// wider window, under both footings.
    @Test func theTallerGoalAboveKeepsTheLayoutsGuarantees() {
        var problems: [String] = [], checked = 0
        for shape in shapes where shape.goals > 0 && (shape.per == 5 || shape.unhung == 2) {
            var s = shape.state()
            for _ in s.goalAboveStops().indices {
                for wing in [CGFloat(0), 47] {
                    for footing in [WalkFooting.level, .natural] {
                        let layout = WalkLayout.make(s, today: today, footing: footing, wing: wing)
                        problems += Invariants.check(layout, s, wing: wing).map { "\(shape) wing \(wing) \(footing): \($0)" }
                        checked += 1
                    }
                }
                _ = s.apply(.bannerTapped(s.focus[s.level!]!), env)
            }
        }
        #expect(problems.isEmpty, "\(problems.count): \(problems.prefix(5))")
        #expect(checked > 200, "\(checked)")
    }

    /// A row on the paper stands the walk on that flag's own goal above, so the chosen flag is drawn, in the
    /// area already stood in too. On a walk down a row off the walked line leaves the goal above as it is,
    /// and the note names the chosen flag (`WalkLayout.unseenChoice`).
    @Test func aPaperRowLeavesItsFlagDrawn() {
        for shape in shapes where shape.goals >= 2 {
            let start = shape.state()
            let level = start.level!
            for row in start.items(on: level) where start.column(of: row) == area("Health").id {
                var s = start
                _ = s.apply(.paperOpened, env)
                _ = s.apply(.paperRow(row.id), env)
                #expect(!s.paperOpen && s.selected == row.id, "\(shape) \(row.title)")
                #expect(WalkLayout.make(s, today: today, footing: .level).drawn.contains(row.id), "\(shape) \(row.title)")
                #expect(WalkLayout.unseenChoice(s) == nil, "\(shape) \(row.title)")
            }
        }
        // A walk down the first goal: a row under the second is off the walked line.
        let shape = Shape(step: 3, goals: 2, per: 1, unhung: 0, elsewhere: 0)
        var s = shape.state()
        let goals = s.items(on: .season).filter { $0.areaId == area("Health").id }
        s.walkingDown = [goals[0].id]
        s.focus[.month] = goals[0].id
        s = s.settled
        let off = s.items(on: .month).first { $0.parentId == goals[1].id }!
        _ = s.apply(.paperOpened, env)
        _ = s.apply(.paperRow(off.id), env)
        #expect(s.focus[.month] == goals[0].id && s.selected == off.id)
        #expect(!WalkLayout.make(s, today: today, footing: .level).drawn.contains(off.id))
        #expect(WalkLayout.unseenChoice(s)?.id == off.id)
    }

    /// A flag planted on the "Not under a goal yet" stop hangs under none, in the area; on a goal's stop, under it.
    @Test func aFlagPlantedOnAStopHangsThere() {
        var s = Shape(step: 3, goals: 1, per: 1, unhung: 1, elsewhere: 0).state()
        let goal = s.items(on: .season).first { $0.areaId == area("Health").id }!
        #expect(s.focus[.month] == goal.id)
        s.typing = ""
        _ = s.apply(.typeSubmitted("Book a check-up"), env)
        #expect(s.items.last?.parentId == goal.id && s.items.last?.areaId == area("Health").id)
        _ = s.apply(.bannerTapped(goal.id), env)
        #expect(s.focus[.month] == WalkState.noGoalAbove)
        s.typing = ""
        _ = s.apply(.typeSubmitted("Buy running shoes"), env)
        #expect(s.items.last?.title == "Buy running shoes" && s.items.last?.parentId == nil
                && s.items.last?.areaId == area("Health").id)
        #expect(s.focus[.month] == WalkState.noGoalAbove)
        #expect(WalkLayout.make(s, today: today, footing: .level).drawn.contains(s.items.last!.id))
    }

    /// Year, Today and Look back up are as they were: no stops, no count line.
    @Test func yearTodayAndLookingBackAreUnchanged() {
        var s = Shape(step: 2, goals: 2, per: 2, unhung: 1, elsewhere: 0).state()
        for step in [1, 5, 6] {
            s.step = step
            #expect(s.goalAboveStops().isEmpty, "step \(step)")
            #expect(WalkLayout.make(s.settled, today: today, footing: .level).banners.allSatisfy { !$0.loose }, "step \(step)")
        }
    }
}
