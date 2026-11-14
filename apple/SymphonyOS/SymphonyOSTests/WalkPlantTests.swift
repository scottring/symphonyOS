import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// Six peaks, Health, Home and People kept, Friday 13 November 2026 (weeks start on Sunday).
private struct Hill {
    let health = WalkArea(id: UUID(), name: "Health")
    let home = WalkArea(id: UUID(), name: "Home")
    let people = WalkArea(id: UUID(), name: "People")
    let work = WalkArea(id: UUID(), name: "Work")
    let money = WalkArea(id: UUID(), name: "Money")
    let fun = WalkArea(id: UUID(), name: "Fun")

    let strong: WalkItem
    let bathroom: WalkItem
    let lift: WalkItem
    let tile: WalkItem
    let deposit: WalkItem

    let now = day(2026, 11, 13)
    var env: WalkEnv { WalkEnv(periods: WalkPeriods.pick(now: now, weekStartsOn: 0), now: now) }
    var today: Date { env.periods.today }

    init() {
        strong = WalkItem(id: UUID(), level: .year, title: "Feel strong again", areaId: health.id)
        bathroom = WalkItem(id: UUID(), level: .year, title: "Finish the bathroom", areaId: home.id)
        lift = WalkItem(id: UUID(), level: .season, title: "Lift twice a week", areaId: health.id, parentId: strong.id)
        tile = WalkItem(id: UUID(), level: .month, title: "Pick the tile", areaId: home.id)
        deposit = WalkItem(id: UUID(), level: .week, title: "Send the deposit", areaId: home.id,
                           parentId: tile.id, day: day(2026, 11, 13))
    }

    var areas: [WalkArea] { [health, home, people, work, money, fun] }

    /// Off the ground on a step, three peaks kept, the given flags planted.
    func on(_ step: Int, items: [WalkItem] = [], depth: WalkDepth = .quick) -> WalkState {
        var s = WalkState()
        s.areas = areas
        s.kept = [health.id, home.id, people.id]
        s.step = step
        s.depth = depth
        s.items = items
        return s
    }

    /// The ground, nothing kept yet, nothing to undo.
    func ground() -> WalkState {
        var s = on(1)
        s.kept = []
        s.ground = true
        return s
    }
}

struct WalkPlantTests {
    private let m = Hill()

    // MARK: Year: placed by what it says

    @Test func aGoalGoesToItsAreaEvenWhenAnotherPeakIsFocused() {
        var s = m.on(1)
        s.focusArea = m.health.id
        let effects = s.plant("finish the bathroom.", m.env)

        #expect(s.items.count == 1)
        let item = s.items[0]
        #expect(item.title == "Finish the bathroom")
        #expect(item.level == .year)
        #expect(item.areaId == m.home.id)
        #expect(item.parentId == nil)
        #expect(item.mine)
        #expect(s.note == WalkCopy.placed("Home"))
        #expect(effects == [
            .write(.area(m.home)), .write(.create(item, parent: nil)), .sound(.plant, afterMs: 0),
            .timer(.undo, ms: WalkState.undoMs), .timer(.note, ms: WalkState.noteMs), .save,
        ])
        #expect(s.undo == [.plant(item.id)])
        #expect(s.lastPlanted[.year] == item.id)
        #expect(s.undoShowing)
    }

    @Test func theFocusedPeakCatchesAnUnclearGoal() {
        var s = m.on(1)
        s.focusArea = m.health.id
        let effects = s.plant("learn the cello", m.env)
        let item = s.items[0]
        #expect(item.title == "Learn the cello")
        #expect(item.areaId == m.health.id)
        #expect(s.note == nil)
        #expect(effects == [
            .write(.area(m.health)), .write(.create(item, parent: nil)), .sound(.plant, afterMs: 0),
            .timer(.undo, ms: WalkState.undoMs), .save,
        ])
    }

    @Test func withNoFocusItGoesOnTheUnlabeledPost() {
        var s = m.on(1)
        let effects = s.plant("learn the cello", m.env)
        let item = s.items[0]
        #expect(item.areaId == nil)
        #expect(s.note == nil)
        #expect(effects == [
            .write(.create(item, parent: nil)), .sound(.plant, afterMs: 0),
            .timer(.undo, ms: WalkState.undoMs), .save,
        ])
    }

    // MARK: Lower levels

    @Test func lowerLevelsInheritAndAreNeverClassified() {
        var s = m.on(2, items: [m.strong])
        s.focus[.season] = m.strong.id
        let effects = s.plant("clear out the garage", m.env)    // "garage" is a Home word
        let item = s.items[1]
        #expect(item.level == .season)
        #expect(item.title == "Clear out the garage")
        #expect(item.areaId == m.health.id)
        #expect(item.parentId == m.strong.id)
        #expect(s.note == nil)
        #expect(effects == [
            .write(.area(m.health)), .write(.create(item, parent: m.strong)), .sound(.plant, afterMs: 0),
            .timer(.undo, ms: WalkState.undoMs), .save,
        ])

        var loose = m.on(2, items: [m.strong])
        _ = loose.plant("clear out the garage", m.env)
        #expect(loose.items[1].areaId == nil)
        #expect(loose.items[1].parentId == nil)
    }

    @Test func aWeekTaskKeepsItsDay() {
        var s = m.on(4, items: [m.tile])
        s.focus[.week] = m.tile.id
        _ = s.plant("the deposit, today", m.env)
        let item = s.items[1]
        #expect(item.level == .week)
        #expect(item.title == "The deposit")
        #expect(item.day == m.today)
        #expect(item.parentId == m.tile.id)
        #expect(item.areaId == m.home.id)
    }

    // MARK: Today

    @Test func theFirstThingIsOneTask() {
        var s = m.on(5)
        let one = s.plant("call the plumber", m.env)
        let first = s.items[0]
        #expect(first.level == .week)
        #expect(first.day == m.today)
        #expect(s.firstThing == first.id)
        #expect(one == [
            .write(.create(first, parent: nil)), .write(.firstThing(first.id, previous: nil)),
            .sound(.plant, afterMs: 0), .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        #expect(s.undo == [.firstThing(previous: nil, created: first.id)])
        #expect(s.lastPlanted[.today] == first.id)

        let two = s.plant("walk the dog", m.env)
        let second = s.items[1]
        #expect(s.firstThing == second.id)
        #expect(two.contains(.write(.firstThing(second.id, previous: first.id))))
        #expect(s.items.map(\.id) == [first.id, second.id])
    }

    @Test func theFirstThingKeepsItsWords() {
        var s = m.on(5)
        _ = s.plant("call mum tomorrow", m.env)
        #expect(s.items[0].title == "Call mum tomorrow")
        #expect(s.items[0].day == m.today)
    }

    @Test func aFirstThingSaidUnderAWeekFlagFollowsIt() {
        var s = m.on(5, items: [m.deposit])
        s.focus[.today] = m.deposit.id
        let effects = s.plant("find the cheque book", m.env)
        let item = s.items[1]
        #expect(item.areaId == m.home.id)
        #expect(item.parentId == m.deposit.id)
        #expect(Array(effects.prefix(3)) == [
            .write(.area(m.home)), .write(.create(item, parent: m.deposit)),
            .write(.firstThing(item.id, previous: nil)),
        ])
    }

    @Test func startThereMarksTheFocusedTask() {
        let earlier = WalkItem(id: UUID(), level: .week, title: "Call the plumber", day: m.today)
        var s = m.on(5, items: [m.deposit, earlier])
        s.firstThing = earlier.id
        s.focus[.today] = m.deposit.id

        let effects = s.act(.startThere, m.env)
        #expect(s.firstThing == m.deposit.id)
        #expect(effects == [
            .write(.firstThing(m.deposit.id, previous: earlier.id)), .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        #expect(s.undo == [.firstThing(previous: earlier.id, created: nil)])
        #expect(s.items.map(\.id) == [m.deposit.id, earlier.id])     // the earlier task stays where it is
        #expect(s.act(.startThere, m.env).isEmpty)                    // it is already the first thing

        let back = s.act(.undo, m.env)
        #expect(s.firstThing == earlier.id)
        #expect(back == [.write(.firstThing(earlier.id, previous: m.deposit.id)), .sound(.poles, afterMs: 0), .save])
        #expect(s.items.map(\.id) == [m.deposit.id, earlier.id])

        var above = m.on(4, items: [m.deposit])
        above.focus[.today] = m.deposit.id
        #expect(above.act(.startThere, m.env).isEmpty)                // only on Today
    }

    // MARK: Naming an area on the ground

    @Test func namingAnAreaKeepsIt() {
        var s = m.ground()
        let effects = s.plant("garden", m.env)
        #expect(s.areas.count == 7)
        let garden = s.areas[6]
        #expect(garden.name == "Garden")
        #expect(s.kept == [garden.id])
        #expect(s.items.isEmpty)
        #expect(s.undo == [.nameArea(garden)])
        #expect(effects == [.sound(.plant, afterMs: 0), .timer(.undo, ms: WalkState.undoMs), .save])   // no row yet
        #expect(s.undoShowing)
    }

    @Test func namingAnExistingAreaJustKeepsIt() {
        var s = m.ground()
        _ = s.plant("home", m.env)
        #expect(s.areas == m.areas)
        #expect(s.kept == [m.home.id])
        #expect(s.undo == [.keep(m.home.id)])

        #expect(s.plant("HOME", m.env).isEmpty)                         // already kept: nothing changes
        #expect(s.kept == [m.home.id])
    }

    @Test func aLongAreaNameIsCut() {
        var s = m.ground()
        _ = s.plant(String(repeating: "x", count: 40), m.env)
        #expect(s.areas.last?.name.count == WalkWords.maxAreaName)
    }

    @Test func theRidgeIsFull() {
        var s = m.ground()
        let extra = (0..<(WalkLoad.maxAreas - m.areas.count)).map { WalkArea(id: UUID(), name: "Extra \($0)") }
        s.areas += extra
        #expect(s.areas.count == WalkLoad.maxAreas)
        let effects = s.plant("garden", m.env)
        #expect(s.areas.count == WalkLoad.maxAreas)
        #expect(s.kept.isEmpty)
        #expect(s.note == WalkCopy.ridgeFull)
        #expect(effects == [.timer(.note, ms: WalkState.noteMs)])
        #expect(s.undo.isEmpty)
    }

    // MARK: Nothing said

    @Test func lettingGoWithNothingPlantsNothing() {
        for step in 1...5 {
            var s = m.on(step)
            let effects = s.plant("um", m.env)
            #expect(s.items.isEmpty)
            #expect(!effects.contains { if case .write = $0 { return true } else { return false } })
            #expect(s.note == WalkCopy.nothingToPlant)
            #expect(effects.contains(.timer(.note, ms: WalkState.noteMs)))
            #expect(s.undo.isEmpty)
        }
        var ground = m.ground()
        _ = ground.plant("", m.env)
        #expect(ground.areas == m.areas && ground.kept.isEmpty)
        #expect(ground.note == WalkCopy.nothingToPlant)
    }

    // MARK: Examples

    @Test func examplesPlantAsYourOwn() {
        var s = m.on(4, items: [m.tile])
        s.focus[.week] = m.tile.id
        s.examplesOn = [4]
        let effects = s.apply(.exampleTapped("Gym on Tuesday"), m.env)
        let item = s.items[1]
        #expect(item.title == "Gym")
        #expect(item.day == day(2026, 11, 17))
        #expect(item.mine)
        #expect(item.areaId == m.home.id)
        #expect(item.parentId == m.tile.id)
        #expect(effects == [
            .sound(.poles, afterMs: 0), .write(.area(m.home)), .write(.create(item, parent: m.tile)),
            .sound(.plant, afterMs: 160), .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        #expect(s.undo == [.plant(item.id)])

        var off = m.on(4, items: [m.tile])
        #expect(off.apply(.exampleTapped("Gym on Tuesday"), m.env).isEmpty)
        #expect(off.items == [m.tile])

        var notOne = m.on(4)
        notOne.examplesOn = [4]
        #expect(notOne.apply(.exampleTapped("Buy a boat"), m.env).isEmpty)   // only the examples themselves
        #expect(notOne.items.isEmpty)
    }

    @Test func aYearExampleTakesTheFocusedPeakAndIsNotClassified() {
        var s = m.on(1)
        s.focusArea = m.home.id
        s.examplesOn = [1]
        _ = s.apply(.exampleTapped("Run a 5K"), m.env)                 // "5k" is a Health word
        #expect(s.items[0].title == "Run a 5K")
        #expect(s.items[0].areaId == m.home.id)
        #expect(s.note == nil)
    }

    // MARK: Selecting, moving, pulling up

    @Test func tappingYourOwnFlagSelectsIt() {
        var s = m.on(1, items: [m.bathroom])
        s.undoShowing = true
        let on = s.apply(.bannerTapped(m.bathroom.id), m.env)
        #expect(s.selected == m.bathroom.id)
        #expect(on == [.sound(.tick, afterMs: 0)])
        #expect(!s.undoShowing)
        _ = s.apply(.bannerTapped(m.bathroom.id), m.env)
        #expect(s.selected == nil)

        // One level up is still a parent to focus, not a flag to select.
        var season = m.on(2, items: [m.bathroom])
        _ = season.apply(.bannerTapped(m.bathroom.id), m.env)
        #expect(season.selected == nil)
        #expect(season.focus[.season] == m.bathroom.id)
    }

    @Test func aFlagIDidNotPlantCannotBeSelected() {
        var theirs = m.bathroom
        theirs.mine = false
        var s = m.on(1, items: [theirs])
        #expect(s.apply(.bannerTapped(theirs.id), m.env).isEmpty)
        #expect(s.selected == nil)

        // Even if it were somehow selected, it is never moved or pulled up.
        s.selected = theirs.id
        #expect(s.apply(.moveTo(m.work.id), m.env).isEmpty)
        #expect(s.apply(.pullUp, m.env).isEmpty)
        #expect(s.items == [theirs])
        #expect(!s.kept.contains(m.work.id))
    }

    @Test func movingToAnUnkeptAreaKeepsIt() {
        var s = m.on(1, items: [m.bathroom])
        _ = s.apply(.bannerTapped(m.bathroom.id), m.env)
        let effects = s.apply(.moveTo(m.work.id), m.env)
        #expect(s.items[0].areaId == m.work.id)
        #expect(s.kept == [m.health.id, m.home.id, m.people.id, m.work.id])
        #expect(s.selected == nil)
        #expect(effects == [
            .write(.area(m.work)), .write(.setArea(m.bathroom.id, .year, m.work.id)),
            .sound(.poles, afterMs: 0), .sound(.plant, afterMs: 140), .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        #expect(s.undo == [.move(m.bathroom.id, from: m.home.id, keptAdded: m.work.id)])

        // Moving to a kept area adds nothing to kept.
        _ = s.apply(.bannerTapped(m.bathroom.id), m.env)
        _ = s.apply(.moveTo(m.health.id), m.env)
        #expect(s.undo.last == .move(m.bathroom.id, from: m.work.id, keptAdded: nil))
        #expect(s.kept.count == 4)

        // Nothing selected: nothing moves.
        #expect(s.apply(.moveTo(m.fun.id), m.env).isEmpty)
    }

    @Test func pullingUpClearsFocusAndFirstThing() {
        var s = m.on(4, items: [m.tile, m.deposit])
        s.firstThing = m.deposit.id
        s.focus[.today] = m.deposit.id
        s.lastPlanted[.week] = m.deposit.id
        _ = s.apply(.bannerTapped(m.deposit.id), m.env)
        let effects = s.apply(.pullUp, m.env)
        #expect(s.items == [m.tile])
        #expect(s.firstThing == nil)
        #expect(s.focus[.today] == nil)
        #expect(s.lastPlanted[.week] == nil)
        #expect(s.selected == nil)
        #expect(effects == [
            .write(.remove(m.deposit.id, .week)), .sound(.poles, afterMs: 0),
            .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        #expect(s.undo == [.pullUp(m.deposit, index: 1, wasFirstThing: true)])

        // A pulled-up year goal leaves its season flag standing, with no parent.
        var year = m.on(1, items: [m.strong, m.lift])
        year.focus[.season] = m.strong.id
        _ = year.apply(.bannerTapped(m.strong.id), m.env)
        _ = year.apply(.pullUp, m.env)
        #expect(year.items.map(\.id) == [m.lift.id])
        #expect(year.items[0].parentId == nil)
        #expect(year.focus[.season] == nil)
    }

    // MARK: Undo

    @Test func undoStepsBackThroughEverything() {
        var s = m.ground()
        s.kept = [m.health.id, m.home.id]
        let start = (items: s.items, kept: s.kept, areas: s.areas)

        _ = s.plant("garden", m.env)                                     // name an area
        let garden = s.areas[6]
        _ = s.act(.next, m.env)                                           // walk on, off the ground
        _ = s.plant("learn the cello", m.env)                            // plant (unlabeled)
        let cello = s.items[0]
        _ = s.apply(.bannerTapped(cello.id), m.env)
        _ = s.apply(.moveTo(m.work.id), m.env)                           // move
        _ = s.apply(.bannerTapped(cello.id), m.env)
        _ = s.apply(.pullUp, m.env)                                       // pull up
        #expect(s.items.isEmpty)

        let first = s.apply(.undo, m.env)
        #expect(first == [.write(.restore(cello.id)), .sound(.poles, afterMs: 0), .save])
        #expect(s.items.map(\.areaId) == [m.work.id])

        let second = s.apply(.undo, m.env)
        #expect(second == [
            .write(.setArea(cello.id, .year, nil)), .write(.dropArea(m.work.id)), .sound(.poles, afterMs: 0), .save,
        ])
        #expect(s.items.map(\.areaId) == [nil])
        #expect(s.kept == [m.health.id, m.home.id, garden.id])

        let third = s.act(.undo, m.env)
        #expect(third.contains(.write(.remove(cello.id, .year))))
        #expect(s.items.isEmpty)

        let fourth = s.apply(.undo, m.env)
        #expect(fourth == [.sound(.poles, afterMs: 0), .save])
        #expect(s.items == start.items)
        #expect(s.kept == start.kept)
        #expect(s.areas == start.areas)

        #expect(s.apply(.undo, m.env).isEmpty)
        #expect(s.act(.undo, m.env).isEmpty)
    }

    @Test func undoIsStillThereAfterThePillHides() {
        var s = m.on(1)
        _ = s.plant("finish the bathroom", m.env)
        let item = s.items[0]
        _ = s.apply(.undoExpired, m.env)
        #expect(!s.undoShowing)
        #expect(s.undo == [.plant(item.id)])

        let effects = s.apply(.undo, m.env)
        #expect(s.items.isEmpty)
        #expect(s.lastPlanted[.year] == nil)
        #expect(effects == [
            .write(.remove(item.id, .year)), .write(.dropArea(m.home.id)), .sound(.poles, afterMs: 0), .save,
        ])
    }

    @Test func undoOfAPullUpRestoresTheRowAndItsChildren() {
        var s = m.on(1, items: [m.strong, m.bathroom, m.lift])
        s.firstThing = nil
        _ = s.apply(.bannerTapped(m.strong.id), m.env)
        _ = s.apply(.pullUp, m.env)
        #expect(s.items.map(\.id) == [m.bathroom.id, m.lift.id])
        #expect(s.items[1].parentId == nil)

        let effects = s.apply(.undo, m.env)
        #expect(effects == [.write(.restore(m.strong.id)), .sound(.poles, afterMs: 0), .save])
        #expect(s.items == [m.strong, m.bathroom, m.lift])               // at its index, the child linked again

        // A pulled-up first thing is the first thing again.
        var week = m.on(4, items: [m.tile, m.deposit])
        week.firstThing = m.deposit.id
        _ = week.apply(.bannerTapped(m.deposit.id), m.env)
        _ = week.apply(.pullUp, m.env)
        _ = week.apply(.undo, m.env)
        #expect(week.items == [m.tile, m.deposit])
        #expect(week.firstThing == m.deposit.id)
    }

    @Test func undoingAFirstThingRemovesTheTaskItMade() {
        var s = m.on(5)
        _ = s.plant("call the plumber", m.env)
        let first = s.items[0]
        _ = s.plant("walk the dog", m.env)
        let second = s.items[1]

        let effects = s.apply(.undo, m.env)
        #expect(s.firstThing == first.id)
        #expect(s.items == [first])
        #expect(effects == [
            .write(.firstThing(first.id, previous: second.id)), .write(.remove(second.id, .week)),
            .sound(.poles, afterMs: 0), .save,
        ])
    }

    @Test func undoingAKeepLeavesNothingPointingAtIt() {
        var s = m.ground()
        s.depth = .full
        _ = s.apply(.areaTapped(m.home.id), m.env)
        _ = s.apply(.areaTapped(m.health.id), m.env)
        _ = s.act(.next, m.env)                                           // the Year tour: Home, then Health
        #expect(s.focusArea == m.home.id && s.tour == [m.health.id])

        _ = s.apply(.undo, m.env)                                         // Health is no longer kept
        #expect(s.kept == [m.home.id])
        #expect(s.tour.isEmpty)

        _ = s.apply(.undo, m.env)                                         // nor is Home
        #expect(s.kept.isEmpty)
        #expect(s.focusArea == nil)
    }

    @Test func undoNeverTouchesAFlagTheWalkDidNotPlant() {
        var theirs = m.bathroom
        theirs.mine = false
        var s = m.on(1, items: [theirs])
        s.undo = [.plant(theirs.id), .move(theirs.id, from: m.health.id, keptAdded: nil)]
        let moved = s.apply(.undo, m.env)
        let planted = s.apply(.undo, m.env)
        #expect(s.items == [theirs])
        #expect(moved == [.sound(.poles, afterMs: 0), .save])
        #expect(planted == [.sound(.poles, afterMs: 0), .save])
    }

    @Test func everyPlantStartsTheUndoPill() {
        for step in 1...5 {
            var s = m.on(step)
            let effects = s.plant("call the plumber", m.env)
            #expect(effects.contains(.timer(.undo, ms: WalkState.undoMs)))
            #expect(s.undoShowing)
        }
        var ground = m.ground()
        #expect(ground.plant("garden", m.env).contains(.timer(.undo, ms: WalkState.undoMs)))
    }

    @Test func aPlantPutsAwayTheSelection() {
        var s = m.on(1, items: [m.bathroom])
        _ = s.apply(.bannerTapped(m.bathroom.id), m.env)
        _ = s.plant("learn the cello", m.env)
        #expect(s.selected == nil)
    }

    // MARK: Fix round 1

    @Test func undoingAMoveBringsBackTheAreaItLeft() {
        // Name Garden, plant A on it, move A to Work, plant B on Garden, then undo twice.
        var s = m.ground()
        _ = s.plant("garden", m.env)
        let garden = s.areas[6]
        _ = s.act(.next, m.env)
        _ = s.apply(.areaTapped(garden.id), m.env)
        _ = s.plant("learn the cello", m.env)
        let a = s.items[0]
        #expect(a.areaId == garden.id)
        _ = s.apply(.bannerTapped(a.id), m.env)
        _ = s.apply(.moveTo(m.work.id), m.env)
        _ = s.plant("learn the flute", m.env)
        let b = s.items[1]
        #expect(b.areaId == garden.id)

        let takeB = s.apply(.undo, m.env)
        #expect(takeB.contains(.write(.dropArea(garden.id))))      // the writer may now drop Garden

        let moveBack = s.apply(.undo, m.env)
        #expect(moveBack == [
            .write(.area(garden)), .write(.setArea(a.id, .year, garden.id)), .write(.dropArea(m.work.id)),
            .sound(.poles, afterMs: 0), .save,
        ])
        #expect(s.items.map(\.areaId) == [garden.id])
    }

    @Test func anExampleIsYoursOnce() {
        var s = m.on(4, items: [m.tile])
        s.examplesOn = [4]
        _ = s.apply(.exampleTapped("Gym on Tuesday"), m.env)
        let once = s
        #expect(s.apply(.exampleTapped("Gym on Tuesday"), m.env).isEmpty)
        #expect(s == once)

        // The same words on another day are another task.
        var otherDay = m.on(4, items: [WalkItem(id: UUID(), level: .week, title: "gym", day: m.today)])
        otherDay.examplesOn = [4]
        _ = otherDay.apply(.exampleTapped("Gym on Tuesday"), m.env)
        #expect(otherDay.items.count == 2)

        // Without case, and on Year too.
        var year = m.on(1, items: [WalkItem(id: UUID(), level: .year, title: "run a 5k")])
        year.examplesOn = [1]
        #expect(year.apply(.exampleTapped("Run a 5K"), m.env).isEmpty)
        #expect(year.items.count == 1)
    }

    @Test func startThereDatesTheTaskTodayAndUndoGivesItsDayBack() {
        let thursday = day(2026, 11, 12)
        let call = WalkItem(id: UUID(), level: .week, title: "Call the tile shop", areaId: m.home.id, day: thursday)
        var s = m.on(5, items: [call])
        s.focus[.today] = call.id
        _ = s.act(.startThere, m.env)
        #expect(s.items[0].day == m.today)
        #expect(s.firstThing == call.id)

        _ = s.act(.undo, m.env)
        #expect(s.items[0].day == thursday)
        #expect(s.firstThing == nil)

        // A task with no day gets no day back.
        let loose = WalkItem(id: UUID(), level: .week, title: "Book the plumber")
        var noDay = m.on(5, items: [loose])
        noDay.focus[.today] = loose.id
        _ = noDay.act(.startThere, m.env)
        #expect(noDay.items[0].day == m.today)
        _ = noDay.act(.undo, m.env)
        #expect(noDay.items[0].day == nil)
    }

    @Test func whenTheMarkMovesOnTheTaskGetsItsDayBack() {
        let thursday = day(2026, 11, 12)
        let call = WalkItem(id: UUID(), level: .week, title: "Call the tile shop", day: thursday)
        var s = m.on(5, items: [call, m.deposit])
        s.focus[.today] = call.id
        _ = s.act(.startThere, m.env)
        #expect(s.items[0].day == m.today)

        _ = s.plant("find the cheque book", m.env)            // a new first thing
        #expect(s.items[0].day == thursday)

        _ = s.apply(.undo, m.env)                              // the mark comes back: today again
        #expect(s.firstThing == call.id)
        #expect(s.items[0].day == m.today)

        // A task already on today is not touched either way.
        s.focus[.today] = m.deposit.id
        _ = s.act(.startThere, m.env)
        #expect(s.items[0].day == thursday)
        #expect(s.items[1].day == m.today)
        _ = s.act(.undo, m.env)
        #expect(s.items[1].day == m.today)
        #expect(s.items[0].day == m.today)
    }

    @Test func onTodayThePlantedFirstThingCanBePulledUp() {
        var s = m.on(5)
        _ = s.plant("call the plumber", m.env)
        let first = s.items[0]
        _ = s.apply(.undoExpired, m.env)

        let tap = s.apply(.bannerTapped(first.id), m.env)
        #expect(s.selected == first.id)
        #expect(tap == [.sound(.tick, afterMs: 0)])
        #expect(s.focus[.today] == nil)
        #expect(s.moveTargets.isEmpty)                         // its area is inherited: Pull it up only
        #expect(s.apply(.moveTo(m.home.id), m.env).isEmpty)

        let pulled = s.apply(.pullUp, m.env)
        #expect(s.items.isEmpty)
        #expect(s.firstThing == nil)
        #expect(pulled == [
            .write(.remove(first.id, .week)), .sound(.poles, afterMs: 0), .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        _ = s.apply(.undo, m.env)
        #expect(s.items == [first])
        #expect(s.firstThing == first.id)
    }

    @Test func onTodayOtherFlagsAreStillFocused() {
        var theirs = m.deposit
        theirs.mine = false
        let mine = WalkItem(id: UUID(), level: .week, title: "Choose the tile", day: m.today)
        var s = m.on(5, items: [theirs, mine])
        s.firstThing = theirs.id

        _ = s.apply(.bannerTapped(theirs.id), m.env)          // a first thing the walk did not plant
        #expect(s.selected == nil)
        #expect(s.focus[.today] == theirs.id)

        _ = s.apply(.bannerTapped(mine.id), m.env)            // a week flag that is not the first thing
        #expect(s.selected == nil)
        #expect(s.focus[.today] == mine.id)
    }

    @Test func moveTargetsAreEveryOtherArea() {
        var s = m.on(1, items: [m.bathroom])
        #expect(s.moveTargets.isEmpty)
        _ = s.apply(.bannerTapped(m.bathroom.id), m.env)
        #expect(s.moveTargets == [m.health, m.people, m.work, m.money, m.fun])
        #expect(s.apply(.moveTo(m.home.id), m.env).isEmpty)    // its own area is not a move
    }

    // MARK: Stubs

    @Test func aStubOpensItsColumn() {
        let older = WalkItem(id: UUID(), level: .year, title: "Paint the hall", areaId: m.home.id)
        var s = m.on(1, items: [older, m.bathroom, m.strong])
        let key = WalkPostKey(level: .year, column: m.home.id)
        #expect(s.apply(.stubTapped(key), m.env).isEmpty)
        #expect(s.expanded == key)
        #expect(s.lastPlanted[.year] == m.bathroom.id)                   // the column's newest flag

        _ = s.apply(.stubTapped(key), m.env)
        #expect(s.expanded == nil)

        let loose = WalkItem(id: UUID(), level: .year, title: "Learn the cello")
        s.items.append(loose)
        _ = s.apply(.stubTapped(WalkPostKey(level: .year, column: nil)), m.env)
        #expect(s.lastPlanted[.year] == loose.id)
    }

    // MARK: Walk another one down

    /// At the ending, with a year goal not yet walked: Season in a quick walk on that
    /// goal, and nothing of the chain just walked left to steer the next one.
    @Test func walkAnotherStartsACleanWalkDown() {
        let tile = WalkItem(id: UUID(), level: .month, title: "Book the gym induction", areaId: m.health.id,
                            parentId: m.lift.id)
        let gym = WalkItem(id: UUID(), level: .week, title: "Gym induction", areaId: m.health.id,
                           parentId: tile.id, day: m.today)
        var s = m.on(6, items: [m.strong, m.bathroom, m.lift, tile, gym], depth: .full)
        s.firstThing = gym.id
        s.dayBeforeFirst = [gym.id: Date?.none]
        s.focusArea = m.health.id
        s.focus = [.season: m.strong.id, .month: m.lift.id, .week: tile.id, .today: gym.id]
        s.tour = [m.bathroom.id]
        s.lastPlanted = [.year: m.bathroom.id, .season: m.lift.id, .month: tile.id, .week: gym.id]
        s.undo = [.plant(tile.id), .firstThing(previous: nil, created: nil)]
        s.undoShowing = true
        s.pulledChildren = [UUID(): [gym.id]]
        s.examplesOn = [2, 3]
        s.note = WalkCopy.nothingToPlant
        s.selected = gym.id
        s.expanded = WalkPostKey(level: .week, column: m.health.id)
        s.typing = ""
        s.orbWasOpen = true
        s.emptyHolds = 1
        s.sessionOver = true
        s.speechIsOff = true
        s.sheetOpen = true
        s.calendarOffer = true

        #expect(s.apply(.walkAnother, m.env) == [.save])
        #expect(s.step == 2 && !s.ground && s.depth == .quick)
        #expect(s.focus == [.season: m.bathroom.id])
        #expect(s.lastPlanted.isEmpty)
        #expect(s.focusArea == nil && s.tour.isEmpty)
        #expect(s.undo.isEmpty && !s.undoShowing && s.pulledChildren.isEmpty)
        #expect(s.examplesOn.isEmpty && s.note == nil)
        #expect(s.selected == nil && s.expanded == nil && s.typing == nil)
        #expect(s.orb == .idle && !s.orbWasOpen && s.emptyHolds == 0 && !s.sessionOver)
        #expect(!s.sheetOpen)
        // What belongs to the day, the ridge or the phone stays.
        #expect(s.items == [m.strong, m.bathroom, m.lift, tile, gym])
        #expect(s.kept == [m.health.id, m.home.id, m.people.id])
        #expect(s.firstThing == gym.id && s.dayBeforeFirst == [gym.id: Date?.none])
        #expect(s.speechIsOff && s.calendarOffer)
    }

    @Test func walkAnotherWaitsForTheEndingAndAGoalLeftToWalk() {
        // Every year goal already has a season piece: nothing to walk.
        var walked = m.on(6, items: [m.strong, m.lift])
        walked.lastPlanted = [.season: m.lift.id]
        let before = walked
        #expect(walked.apply(.walkAnother, m.env) == [])
        #expect(walked == before)

        // Not at the ending.
        var today = m.on(5, items: [m.strong, m.bathroom, m.lift])
        today.focus = [.today: m.lift.id]
        let earlier = today
        #expect(today.apply(.walkAnother, m.env) == [])
        #expect(today == earlier)
    }

    // MARK: The ending's rows

    @Test func tickingARowAsksTheWriterWhoeverPlantedIt() {
        var s = m.on(6, items: [m.deposit])
        let stranger = UUID()
        #expect(s.apply(.rowToggled(stranger), m.env) == [.write(.toggleDone(stranger))])
        #expect(s.items == [m.deposit])

        #expect(s.apply(.rowToggled(m.deposit.id), m.env) == [.write(.toggleDone(m.deposit.id))])
        #expect(s.items[0].done)
        _ = s.apply(.rowToggled(m.deposit.id), m.env)
        #expect(!s.items[0].done)
    }

    @Test func aRowIsTickedOnlyAtTheEnding() {
        for step in 0...5 {
            var s = m.on(step, items: [m.deposit])
            #expect(s.apply(.rowToggled(m.deposit.id), m.env) == [])
            #expect(!s.items[0].done)
        }
    }
}
