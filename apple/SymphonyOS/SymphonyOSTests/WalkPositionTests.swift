import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

private func periods(_ y: Int, _ m: Int, _ d: Int) -> WalkPeriods {
    WalkPeriods.pick(now: day(y, m, d), weekStartsOn: 0)
}

private func store() -> WalkPositionStore {
    WalkPositionStore(defaults: UserDefaults(suiteName: "WalkPositionTests.\(UUID())")!)
}

/// A walk that has reached `step`, with areas kept, a focus on every level above it, a tour and a first thing.
private struct Saved {
    let area = WalkArea(id: UUID(), name: "Home")
    let other = WalkArea(id: UUID(), name: "Health")
    let yearGoal = UUID(), seasonGoal = UUID(), monthLine = UUID(), weekTask = UUID(), thing = UUID()
    let planted: Set<UUID>

    init() { planted = [yearGoal, seasonGoal, thing] }

    func state(step: Int) -> WalkState {
        var s = WalkState()
        s.depth = .full
        s.step = step
        s.areas = [area, other]
        s.kept = [area.id]
        s.focusArea = area.id
        s.focus = [.season: yearGoal, .month: seasonGoal, .week: monthLine, .today: weekTask]
        s.tour = [seasonGoal, yearGoal]
        s.firstThing = step >= 5 ? thing : nil
        return s
    }

    var everything: Set<UUID> { [yearGoal, seasonGoal, monthLine, weekTask, thing] }

    func position(step: Int, on p: WalkPeriods) -> WalkPosition {
        WalkPosition(state(step: step), status: .inProgress, planted: planted, periods: p, now: p.today)
    }
}

@Suite struct WalkPositionTests {
    @Test func itRoundTrips() {
        let saved = Saved()
        let p = periods(2026, 11, 13)
        let position = saved.position(step: 3, on: p)
        let s = store()
        let me = UUID()
        s.save(position, for: me)
        #expect(s.load(for: me) == position)
        #expect(s.load(for: UUID()) == nil)
        s.defaults.set(Data("not json {".utf8), forKey: WalkPositionStore.key(me))
        #expect(s.load(for: me) == nil)
        s.forget(for: me)
        #expect(s.load(for: me) == nil)
    }

    @Test func theKeyIsPerPerson() {
        let id = UUID()
        #expect(WalkPositionStore.key(id) == "walk.position." + id.uuidString.lowercased())
    }

    @Test func noPersonSavesAndLoadsNothing() {
        let s = store()
        s.save(Saved().position(step: 2, on: periods(2026, 11, 13)), for: nil)
        #expect(s.load(for: nil) == nil)
    }

    @Test func anOlderOrOddlyShapedSaveLoadsNothing() throws {
        let s = store()
        let me = UUID()
        let good = try JSONEncoder.walk.encode(Saved().position(step: 2, on: periods(2026, 11, 13)))
        var object = try #require(JSONSerialization.jsonObject(with: good) as? [String: Any])

        object["somethingNew"] = 42                                   // unknown keys are ignored
        s.defaults.set(try JSONSerialization.data(withJSONObject: object), forKey: WalkPositionStore.key(me))
        #expect(s.load(for: me) != nil)

        object["version"] = 2                                         // another version
        s.defaults.set(try JSONSerialization.data(withJSONObject: object), forKey: WalkPositionStore.key(me))
        #expect(s.load(for: me) == nil)

        object["version"] = 1
        object.removeValue(forKey: "weekStart")                       // a key an older build never wrote
        s.defaults.set(try JSONSerialization.data(withJSONObject: object), forKey: WalkPositionStore.key(me))
        #expect(s.load(for: me) == nil)
    }

    @Test func sameDaySamePlace() {
        let saved = Saved()
        let p = periods(2026, 11, 13)
        let position = saved.position(step: 6, on: p)
        #expect(position.restored(for: p, existing: saved.everything) == position)
    }

    @Test func thePlantedSetSurvivesAndIsNeverDropped() {
        let saved = Saved()
        let position = saved.position(step: 6, on: periods(2026, 11, 13))
        let later = position.restored(for: periods(2026, 11, 25), existing: [])
        #expect(Set(later.planted) == saved.planted)
        let s = store()
        let me = UUID()
        s.save(position, for: me)
        #expect(Set(s.load(for: me)?.planted ?? []) == saved.planted)
    }

    @Test func aRestoredWalkHasNothingToUndo() {
        let saved = Saved()
        var state = saved.state(step: 4)
        state.undo = [.plant(UUID()), .keep(UUID()), .plant(UUID())]
        state.undoShowing = true
        let p = periods(2026, 11, 13)
        let s = store()
        let me = UUID()
        s.save(WalkPosition(state, status: .inProgress, planted: [], periods: p, now: p.today), for: me)
        var fresh = WalkState()
        s.load(for: me)?.apply(to: &fresh)
        #expect(fresh.undo.isEmpty)
        #expect(fresh.undoShowing == false)
        #expect(fresh.step == 4)
        #expect(!WalkCopy.points(fresh).contains { $0.action == .undo })
    }

    @Test func applyPutsBackWhereYouWere() {
        let saved = Saved()
        let p = periods(2026, 11, 13)
        var fresh = WalkState()
        saved.position(step: 5, on: p).apply(to: &fresh)
        let expected = saved.state(step: 5)
        #expect(fresh.step == 5 && fresh.depth == .full && fresh.ground == false)
        #expect(fresh.areas == expected.areas && fresh.kept == expected.kept)
        #expect(fresh.focusArea == expected.focusArea && fresh.focus == expected.focus)
        #expect(fresh.tour == expected.tour && fresh.firstThing == saved.thing)
    }

    @Test func aNewDayAsksForTheFirstThingAgain() {
        let saved = Saved()
        let position = saved.position(step: 6, on: periods(2026, 11, 13))
        let next = periods(2026, 11, 14)
        let restored = position.restored(for: next, existing: saved.everything)
        #expect(restored.step == 5)
        #expect(restored.firstThing == nil)
        #expect(restored.day == "2026-11-14")
    }

    @Test func aNewWeekAsksTheWeekAgain() {
        let saved = Saved()
        let position = saved.position(step: 5, on: periods(2026, 11, 13))   // Friday
        let restored = position.restored(for: periods(2026, 11, 17), existing: saved.everything)   // Tuesday
        #expect(restored.step == 4)
        #expect(restored.focus[String(WalkLevel.today.rawValue)] == nil)
        #expect(restored.weekStart == "2026-11-15")
    }

    @Test func aNewMonthAsksTheMonthAgain() {
        let saved = Saved()
        let position = saved.position(step: 4, on: periods(2026, 11, 20))
        let restored = position.restored(for: periods(2026, 11, 26), existing: saved.everything)
        #expect(restored.step == 3)
        #expect(restored.monthStart == "2026-12-01")
    }

    @Test func aNewSeasonAsksTheSeasonAgain() {
        let saved = Saved()
        let before = periods(2026, 11, 13)
        let after = periods(2027, 3, 1)
        let position = saved.position(step: 5, on: before)
        #expect(before.season.start != after.season.start)
        let restored = position.restored(for: after, existing: saved.everything)
        #expect(restored.step == 2)
        #expect(restored.focus[String(WalkLevel.month.rawValue)] == nil)
    }

    @Test func aNewYearAsksTheYearAgain() {
        let saved = Saved()
        let position = saved.position(step: 5, on: periods(2026, 6, 1))
        let restored = position.restored(for: periods(2027, 6, 1), existing: saved.everything)
        #expect(restored.step == 1)
        #expect(restored.year == 2027)
        #expect(restored.kept == [saved.area.id])
    }

    @Test func aStepBeforeTheMovedPeriodStaysWhereItIs() {
        let saved = Saved()
        let position = saved.position(step: 2, on: periods(2026, 11, 13))
        #expect(position.restored(for: periods(2026, 11, 17), existing: saved.everything).step == 2)
    }

    @Test func aDeletedFocusIsDropped() {
        let saved = Saved()
        let p = periods(2026, 11, 13)
        let position = saved.position(step: 3, on: p)
        let restored = position.restored(for: p, existing: saved.everything.subtracting([saved.seasonGoal]))
        #expect(restored.focus[String(WalkLevel.month.rawValue)] == nil)
        #expect(restored.focus[String(WalkLevel.season.rawValue)] == saved.yearGoal)
        #expect(restored.tour == [saved.yearGoal])
        #expect(restored.kept == [saved.area.id])
        #expect(restored.areas == [saved.area, saved.other])
        #expect(restored.focusArea == saved.area.id)
    }

    @Test func aDeletedFirstThingIsDropped() {
        let saved = Saved()
        let p = periods(2026, 11, 13)
        let restored = saved.position(step: 6, on: p).restored(for: p, existing: saved.everything.subtracting([saved.thing]))
        #expect(restored.firstThing == nil)
        #expect(restored.step == 6)
    }

    @Test func focusForAStepNowAheadIsDropped() {
        let saved = Saved()
        let position = saved.position(step: 5, on: periods(2026, 11, 13))
        let restored = position.restored(for: periods(2026, 11, 26), existing: saved.everything)   // new month
        #expect(restored.step == 3)
        #expect(restored.focus[String(WalkLevel.week.rawValue)] == nil)
        #expect(restored.focus[String(WalkLevel.today.rawValue)] == nil)
        #expect(restored.focus[String(WalkLevel.month.rawValue)] == saved.seasonGoal)
    }

    @Test func aYearTourKeepsItsKeptAreaStops() {
        let saved = Saved()
        var state = saved.state(step: 1)
        state.kept = [saved.area.id, saved.other.id]
        state.tour = [saved.other.id]
        let p = periods(2026, 11, 13)
        let position = WalkPosition(state, status: .inProgress, planted: [], periods: p, now: p.today)
        #expect(position.restored(for: p, existing: []).tour == [saved.other.id])
    }

    // MARK: When the walk appears

    @Test func theTruthTable() {
        func pos(_ status: WalkStatus) -> WalkPosition {
            WalkPosition(WalkState(), status: status, planted: [], periods: periods(2026, 11, 13), now: day(2026, 11, 13))
        }
        func decide(_ replay: Bool, _ demo: Bool, _ position: WalkPosition?, _ editions: [String?], _ synced: Bool, _ goals: Int) -> WalkEntry {
            WalkEntry.decide(replay: replay, demoWalk: demo, position: position, householdEditions: editions,
                             initialSyncFinished: synced, goalCount: goals)
        }
        #expect(decide(true, false, pos(.finished), ["full"], false, 9) == .start)
        #expect(decide(false, true, nil, [], false, 0) == .start)
        #expect(decide(false, false, pos(.inProgress), ["full"], false, 3) == .resume)
        #expect(decide(false, false, pos(.finished), ["light"], true, 0) == .none)
        #expect(decide(false, false, pos(.left), ["light"], true, 0) == .none)
        #expect(decide(false, false, nil, ["light"], true, 0) == .start)
        #expect(decide(false, false, nil, ["light"], true, 1) == .none)
        #expect(decide(false, false, nil, ["light"], false, 0) == .none)        // anUnfinishedFirstSyncNeverStartsIt
        #expect(decide(false, false, nil, [], true, 0) == .none)                // no household row yet
        #expect(decide(false, false, nil, ["full"], true, 0) == .none)
        #expect(decide(false, false, nil, [nil], true, 0) == .none)
        #expect(decide(false, false, nil, ["light", "full"], true, 0) == .none)
    }

    // MARK: Fix round 1

    private func goals(_ ids: [UUID], area: UUID) -> [WalkItem] {
        ids.map { WalkItem(id: $0, level: .year, title: "Goal", areaId: area) }
    }

    @Test func aWholeYearWalkRestoredOntoSeasonKeepsItsTour() {
        let saved = Saved()
        let (a, b, c) = (UUID(), UUID(), UUID())
        var state = saved.state(step: 5)
        state.focus[.season] = a
        state.tour = []
        let before = periods(2026, 11, 13), after = periods(2027, 3, 1)
        let position = WalkPosition(state, status: .inProgress, planted: [], periods: before, now: before.today)
        let restored = position.restored(for: after, existing: [a, b, c])
        #expect(restored.step == 2)
        var fresh = WalkState()
        fresh.items = goals([a, b, c], area: saved.area.id)
        fresh.areas = [saved.area, saved.other]
        restored.apply(to: &fresh)
        #expect(fresh.focus[.season] == a)
        #expect(fresh.tour == [b, c])
        _ = fresh.act(.next, WalkEnv(periods: after, now: after.today))
        #expect(fresh.focus[.season] == b)
        #expect(fresh.tour == [c])
    }

    @Test func aRememberedSeasonFocusThatIsStillAStopIsKept() {
        let saved = Saved()
        let (a, b, c) = (UUID(), UUID(), UUID())
        var state = saved.state(step: 2)
        state.focus[.season] = b
        let p = periods(2026, 11, 13)
        let restored = WalkPosition(state, status: .inProgress, planted: [], periods: p, now: p.today)
            .restored(for: p, existing: [a, b, c])
        var fresh = WalkState()
        fresh.items = goals([a, b, c], area: saved.area.id)
        fresh.areas = [saved.area, saved.other]
        restored.apply(to: &fresh)
        #expect(fresh.focus[.season] == b)
        #expect(fresh.tour == [c])
    }

    @Test func lastPlantedRoundTripsAndIsDroppedForADeletedRow() {
        let saved = Saved()
        let p = periods(2026, 11, 13)
        var state = saved.state(step: 2)
        state.lastPlanted = [.year: saved.yearGoal, .season: saved.seasonGoal]
        let position = WalkPosition(state, status: .inProgress, planted: [], periods: p, now: p.today)
        let s = store(), me = UUID()
        s.save(position, for: me)
        #expect(s.load(for: me) == position)
        let kept = position.restored(for: p, existing: saved.everything)
        #expect(kept.lastPlanted.count == 2)
        let dropped = position.restored(for: p, existing: [saved.yearGoal])
        #expect(dropped.lastPlanted == [String(WalkLevel.year.rawValue): saved.yearGoal])
    }

    @Test func afterARestoreWalkingOnLinksToTheLastPlantedParent() {
        let parent = WalkItem(id: UUID(), level: .year, title: "Goal", areaId: nil)
        var state = WalkState()
        state.depth = .quick; state.step = 1; state.items = [parent]
        state.lastPlanted = [.year: parent.id]
        let p = periods(2026, 11, 13)
        let position = WalkPosition(state, status: .inProgress, planted: [], periods: p, now: p.today)
        var fresh = WalkState()
        fresh.items = [parent]
        position.restored(for: p, existing: [parent.id]).apply(to: &fresh)
        _ = fresh.act(.next, WalkEnv(periods: p, now: p.today))
        #expect(fresh.step == 2)
        #expect(fresh.focus[.season] == parent.id)
    }

    @Test func aPositionWithoutLastPlantedStillLoads() throws {
        let s = store(), me = UUID()
        var object = try #require(JSONSerialization.jsonObject(
            with: JSONEncoder.walk.encode(Saved().position(step: 2, on: periods(2026, 11, 13)))) as? [String: Any])
        object.removeValue(forKey: "lastPlanted")
        s.defaults.set(try JSONSerialization.data(withJSONObject: object), forKey: WalkPositionStore.key(me))
        #expect(s.load(for: me)?.lastPlanted == [:])
    }

    @Test func duplicateFocusKeysLoadWithoutTrapping() throws {
        let s = store(), me = UUID()
        let id = UUID()
        var object = try #require(JSONSerialization.jsonObject(
            with: JSONEncoder.walk.encode(Saved().position(step: 2, on: periods(2026, 11, 13)))) as? [String: Any])
        object["focus"] = ["1": id.uuidString, "01": id.uuidString]
        object["lastPlanted"] = ["1": id.uuidString, "01": id.uuidString]
        s.defaults.set(try JSONSerialization.data(withJSONObject: object), forKey: WalkPositionStore.key(me))
        var fresh = WalkState()
        let p = periods(2026, 11, 13)
        s.load(for: me)?.restored(for: p, existing: [id]).apply(to: &fresh)
        #expect(fresh.focus[.year] == id)
    }

    @Test func anOutOfRangeStepRestoresToOneTheWalkCanLeave() {
        let p = periods(2026, 11, 13)
        let env = WalkEnv(periods: p, now: p.today)
        for raw in [99, -3] {
            var position = Saved().position(step: 2, on: p)
            position.step = raw
            var fresh = WalkState()
            position.restored(for: p, existing: Saved().everything).apply(to: &fresh)
            #expect((0...6).contains(fresh.step))
            let start = fresh.step
            _ = fresh.act(raw > 0 ? .back : .next, env)
            #expect(fresh.step != start)
        }
    }
}
