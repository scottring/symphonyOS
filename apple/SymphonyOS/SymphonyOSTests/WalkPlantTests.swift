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

    // MARK: Year: in the area the walk stands in

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

    /// F2: a goal goes where the walk stands, whatever its words; no note says where it went.
    @Test func aGoalIsPlantedWhereYouStand() {
        var s = m.on(1)
        s.kept.append(m.work.id)
        _ = s.apply(.areaTapped(m.work.id), m.env)
        #expect(s.standing == m.work.id)
        let effects = s.plant("Run a 5K", m.env)                // Health words, said while standing in Work
        let item = s.items[0]
        #expect(item.areaId == m.work.id)
        #expect(s.note == nil)
        #expect(!effects.contains(.timer(.note, ms: WalkState.noteMs)))
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

    @Test func startThereLetsGoOfTheSelection() {
        let earlier = WalkItem(id: UUID(), level: .week, title: "Call the plumber", day: m.today)
        var s = m.on(5, items: [m.deposit, earlier])
        s.firstThing = earlier.id
        s.selected = earlier.id
        s.focus[.today] = m.deposit.id
        _ = s.act(.startThere, m.env)
        #expect(s.firstThing == m.deposit.id)
        #expect(s.selected == nil)
    }

    /// On a crowded ridge the post just planted on is the open one, not one opened before.
    @Test func plantingClosesAnOpenPost() {
        var s = m.on(4, items: [m.tile])
        s.focus[.week] = m.tile.id
        s.expanded = WalkPostKey(level: .week, column: m.health.id)
        _ = s.plant("call the tile shop", m.env)
        #expect(s.expanded == nil)
        s.expanded = WalkPostKey(level: .week, column: m.home.id)
        _ = s.plantExample(WalkCopy.examples(.week, area: "Home")[0], m.env)   // examples off: nothing planted, nothing closed
        #expect(s.expanded == WalkPostKey(level: .week, column: m.home.id))
    }

    // MARK: Undo keeps the chain

    /// Undoing (or pulling up) the newest flag of a level leaves the one before it as the
    /// flag the next step links to; with none of the person's own left, none.
    @Test func undoingTheNewestFlagFallsBackToTheOneBefore() {
        let theirs = WalkItem(id: UUID(), level: .month, title: "Old plan", areaId: m.health.id, mine: false)
        var s = m.on(3, items: [m.lift, theirs])
        s.focus[.month] = m.lift.id
        _ = s.plant("book the gym induction", m.env)
        let a = s.items[2]
        _ = s.plant("buy a foam roller", m.env)
        let b = s.items[3]
        #expect(s.lastPlanted[.month] == b.id)
        _ = s.act(.undo, m.env)
        #expect(s.lastPlanted[.month] == a.id)
        _ = s.act(.next, m.env)
        #expect(s.step == 4)
        #expect(s.focus[.week] == a.id)                          // the next step's flags still link

        var t = m.on(3, items: [m.lift, theirs])
        t.focus[.month] = m.lift.id
        _ = t.plant("book the gym induction", m.env)
        let one = t.items[2]
        _ = t.plant("buy a foam roller", m.env)
        let two = t.items[3]
        _ = t.select(two.id)
        _ = t.pullUpSelected()
        #expect(t.lastPlanted[.month] == one.id)
        _ = t.select(one.id)
        _ = t.pullUpSelected()
        #expect(t.lastPlanted[.month] == nil)                    // a flag it did not plant is never the fallback
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
        s.focusArea = m.home.id
        s.focus[.week] = m.tile.id
        s.examplesOn = [4]
        let effects = s.apply(.exampleTapped("Call the tile shop on Monday"), m.env)
        let item = s.items[1]
        #expect(item.title == "Call the tile shop")
        #expect(item.day == day(2026, 11, 16))
        #expect(item.mine)
        #expect(item.areaId == m.home.id)
        #expect(item.parentId == m.tile.id)
        #expect(effects == [
            .sound(.poles, afterMs: 0), .write(.area(m.home)), .write(.create(item, parent: m.tile)),
            .sound(.plant, afterMs: 160), .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        #expect(s.undo == [.plant(item.id)])

        var off = m.on(4, items: [m.tile])
        off.focusArea = m.home.id
        off.focus[.week] = m.tile.id
        #expect(off.apply(.exampleTapped("Call the tile shop on Monday"), m.env).isEmpty)
        #expect(off.items == [m.tile])

        var notOne = m.on(4, items: [m.tile])
        notOne.focusArea = m.home.id
        notOne.focus[.week] = m.tile.id
        notOne.examplesOn = [4]
        #expect(notOne.apply(.exampleTapped("Buy a boat"), m.env).isEmpty)   // only the examples themselves
        #expect(notOne.items == [m.tile])
    }

    @Test func aYearExampleTakesTheFocusedPeakAndIsNotClassified() {
        var s = m.on(1)
        s.focusArea = m.health.id
        s.examplesOn = [1]
        _ = s.apply(.exampleTapped("Run a 5K"), m.env)
        #expect(s.items[0].title == "Run a 5K")
        #expect(s.items[0].areaId == m.health.id)
        #expect(s.note == nil)
    }

    /// F27: only the standing area's examples plant, and never under another area's goal.
    @Test func anExampleIsPlantedOnlyWhereItBelongs() {
        let health = WalkCopy.examples(.year, area: "Health")[0]
        var s = m.on(1)
        s.kept.append(m.work.id)
        s.focusArea = m.work.id
        s.examplesOn = [1]
        #expect(s.apply(.exampleTapped(health), m.env).isEmpty)
        #expect(s.items.isEmpty)
        // Work's own does.
        let work = WalkCopy.examples(.year, area: "Work")[0]
        _ = s.apply(.exampleTapped(work), m.env)
        #expect(s.items.map(\.title) == [work] && s.items.map(\.areaId) == [m.work.id])

        // Below Year: standing in Home under Home's goal, a Health example plants nothing.
        var season = m.on(2, items: [m.bathroom, m.strong])
        season.focusArea = m.home.id
        season.focus[.season] = m.bathroom.id
        season.examplesOn = [2]
        #expect(season.apply(.exampleTapped(WalkCopy.examples(.season, area: "Health")[0]), m.env).isEmpty)
        #expect(season.items == [m.bathroom, m.strong])

        // Never under another area's goal: a goal above that does not stand here takes no example.
        var astray = m.on(2, items: [m.bathroom, m.strong])
        astray.focusArea = m.home.id
        astray.focus[.season] = m.strong.id                    // Health's goal, while standing in Home
        astray.examplesOn = [2]
        #expect(astray.apply(.exampleTapped(WalkCopy.examples(.season, area: "Home")[0]), m.env).isEmpty)
        #expect(astray.items == [m.bathroom, m.strong])
    }

    /// F27: a used example comes down; the others stay.
    @Test func aUsedExampleComesDown() {
        let home = WalkCopy.examples(.season, area: "Home")
        var s = m.on(2, items: [m.bathroom])
        s.focusArea = m.home.id
        s.focus[.season] = m.bathroom.id
        s.examplesOn = [2]
        #expect(s.examplesShown(today: m.today) == home)
        _ = s.apply(.exampleTapped(home[0]), m.env)
        #expect(s.items.last?.title == home[0] && s.items.last?.parentId == m.bathroom.id)
        #expect(s.examplesShown(today: m.today) == [home[1]])
        #expect(!s.examplesShown(today: m.today).contains(home[0]))

        // On Week the same words on another day are another task: that example stays up.
        var week = m.on(4, items: [m.tile, WalkItem(id: UUID(), level: .week, title: "call the tile shop",
                                                    areaId: m.home.id, parentId: m.tile.id, day: m.today)])
        week.focusArea = m.home.id
        week.focus[.week] = m.tile.id
        week.examplesOn = [4]
        #expect(week.examplesShown(today: m.today) == WalkCopy.examples(.week, area: "Home"))
        _ = week.apply(.exampleTapped("Call the tile shop on Monday"), m.env)
        #expect(week.examplesShown(today: m.today) == ["Measure the bathroom window today"])

        // Examples off: none shown.
        var off = s
        off.examplesOn = []
        #expect(off.examplesShown(today: m.today).isEmpty)
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

    /// F24: a flag moves only to an area the person kept; nothing is added to kept.
    @Test func movingToAKeptAreaAddsNothingToKept() {
        var s = m.on(1, items: [m.bathroom])
        _ = s.apply(.bannerTapped(m.bathroom.id), m.env)
        #expect(s.apply(.moveTo(m.work.id), m.env).isEmpty)      // Work is not kept: not a place to move to
        #expect(s.selected == m.bathroom.id)
        let effects = s.apply(.moveTo(m.health.id), m.env)
        #expect(s.items[0].areaId == m.health.id)
        #expect(s.kept == [m.health.id, m.home.id, m.people.id])
        #expect(s.selected == nil)
        #expect(effects == [
            .write(.area(m.health)), .write(.setArea(m.bathroom.id, .year, m.health.id)),
            .sound(.poles, afterMs: 0), .sound(.plant, afterMs: 140), .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        #expect(s.undo == [.move(m.bathroom.id, from: m.home.id, keptAdded: nil)])

        // Nothing selected: nothing moves.
        #expect(s.apply(.moveTo(m.people.id), m.env).isEmpty)
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
        #expect(s.undo == [.pullUp(m.deposit, index: 1, wasFirstThing: true, walkedAt: nil)])

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

    /// Undo goes back through everything done on the step in view, newest first; what was done
    /// on the ground stays behind once the walk leaves it (F23).
    @Test func undoStepsBackThroughEverything() {
        var s = m.ground()
        s.kept = [m.health.id, m.home.id]

        _ = s.plant("garden", m.env)                                     // name an area
        let garden = s.areas[6]
        _ = s.act(.next, m.env)                                           // walk on, off the ground
        #expect(s.undo.isEmpty)
        _ = s.plant("learn the cello", m.env)                            // plant, in Health where the walk stands
        let cello = s.items[0]
        _ = s.apply(.bannerTapped(cello.id), m.env)
        _ = s.apply(.moveTo(m.home.id), m.env)                           // move
        _ = s.apply(.bannerTapped(cello.id), m.env)
        _ = s.apply(.pullUp, m.env)                                       // pull up
        #expect(s.items.isEmpty)

        let first = s.apply(.undo, m.env)
        #expect(first == [.write(.restore(cello.id)), .sound(.poles, afterMs: 0), .save])
        #expect(s.items.map(\.areaId) == [m.home.id])

        let second = s.apply(.undo, m.env)
        #expect(second == [
            .write(.area(m.health)), .write(.setArea(cello.id, .year, m.health.id)), .write(.dropArea(m.home.id)),
            .sound(.poles, afterMs: 0), .save,
        ])
        #expect(s.items.map(\.areaId) == [m.health.id])
        #expect(s.kept == [m.health.id, m.home.id, garden.id])

        let third = s.act(.undo, m.env)
        #expect(third.contains(.write(.remove(cello.id, .year))))
        #expect(s.items.isEmpty)

        // The ground's naming stayed on the ground.
        #expect(s.apply(.undo, m.env).isEmpty)
        #expect(s.act(.undo, m.env).isEmpty)
        #expect(s.areas.contains(garden) && s.kept == [m.health.id, m.home.id, garden.id])
    }

    @Test func undoIsStillThereAfterThePillHides() {
        var s = m.on(1)
        s.focusArea = m.home.id
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

    /// A keep undone on the ground leaves the area out of the walk; once the walk leaves the ground
    /// its keeps are no longer Undo's (F23).
    @Test func undoingAKeepLeavesNothingPointingAtIt() {
        var s = m.ground()
        s.depth = .full
        _ = s.apply(.areaTapped(m.home.id), m.env)
        _ = s.apply(.areaTapped(m.health.id), m.env)
        _ = s.apply(.undo, m.env)                                         // Health is let go again
        #expect(s.kept == [m.home.id])
        _ = s.act(.next, m.env)                                           // the Year tour: Home only
        #expect(s.focusArea == m.home.id && s.tour.isEmpty)
        #expect(s.undo.isEmpty && !s.undoShowing)
        #expect(s.apply(.undo, m.env).isEmpty)
        #expect(s.kept == [m.home.id])
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
        // Keep Home, name Garden, plant A on it, move A to Home, plant B on Garden, then undo twice.
        var s = m.ground()
        _ = s.apply(.areaTapped(m.home.id), m.env)
        _ = s.plant("garden", m.env)
        let garden = s.areas[6]
        _ = s.act(.next, m.env)
        _ = s.apply(.areaTapped(garden.id), m.env)
        _ = s.plant("learn the cello", m.env)
        let a = s.items[0]
        #expect(a.areaId == garden.id)
        _ = s.apply(.bannerTapped(a.id), m.env)
        _ = s.apply(.moveTo(m.home.id), m.env)
        _ = s.plant("learn the flute", m.env)
        let b = s.items[1]
        #expect(b.areaId == garden.id)

        let takeB = s.apply(.undo, m.env)
        #expect(takeB.contains(.write(.dropArea(garden.id))))      // the writer may now drop Garden

        let moveBack = s.apply(.undo, m.env)
        #expect(moveBack == [
            .write(.area(garden)), .write(.setArea(a.id, .year, garden.id)), .write(.dropArea(m.home.id)),
            .sound(.poles, afterMs: 0), .save,
        ])
        #expect(s.items.map(\.areaId) == [garden.id])
    }

    @Test func anExampleIsYoursOnce() {
        var s = m.on(4, items: [m.tile])
        s.focusArea = m.home.id
        s.focus[.week] = m.tile.id
        s.examplesOn = [4]
        _ = s.apply(.exampleTapped("Call the tile shop on Monday"), m.env)
        let once = s
        #expect(s.apply(.exampleTapped("Call the tile shop on Monday"), m.env).isEmpty)
        #expect(s == once)

        // The same words on another day are another task.
        var otherDay = m.on(4, items: [m.tile, WalkItem(id: UUID(), level: .week, title: "call the tile shop", day: m.today)])
        otherDay.focusArea = m.home.id
        otherDay.focus[.week] = m.tile.id
        otherDay.examplesOn = [4]
        _ = otherDay.apply(.exampleTapped("Call the tile shop on Monday"), m.env)
        #expect(otherDay.items.count == 3)

        // Without case, and on Year too.
        var year = m.on(1, items: [WalkItem(id: UUID(), level: .year, title: "run a 5k")])
        year.focusArea = m.health.id
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

    /// The walk's own first thing is chosen for Pull it up by a tap while another task is the goal
    /// above (just said, it is the goal above, P15: a first tap walks the round on). Alone it is the
    /// goal above itself (fix round 3), and a tap on it does nothing.
    @Test func onTodayThePlantedFirstThingCanBePulledUp() {
        var alone = m.on(5)
        _ = alone.plant("call the plumber", m.env)
        _ = alone.apply(.undoExpired, m.env)                   // settled, as after any event
        let lone = alone.items[0]
        #expect(alone.focus[.today] == lone.id)
        let before = alone
        #expect(alone.apply(.bannerTapped(lone.id), m.env).isEmpty)
        #expect(alone == before)

        let gym = WalkItem(id: UUID(), level: .week, title: "Gym induction", areaId: m.health.id, day: m.today)
        var s = m.on(5, items: [gym])
        _ = s.apply(.noteExpired, m.env)
        #expect(s.focus[.today] == gym.id)
        _ = s.plant("call the plumber", m.env)
        let first = s.items[1]
        _ = s.apply(.undoExpired, m.env)
        #expect(s.focus[.today] == first.id)                   // P15: just said, it is the goal above
        #expect(s.apply(.bannerTapped(first.id), m.env) == [.save])     // which walks the round, to the gym
        #expect(s.focus[.today] == gym.id && s.selected == nil)

        let tap = s.apply(.bannerTapped(first.id), m.env)
        #expect(s.selected == first.id)
        #expect(tap == [.sound(.tick, afterMs: 0)])
        #expect(s.focus[.today] == gym.id)
        #expect(s.moveTargets.isEmpty)                         // its area is inherited: Pull it up only
        #expect(s.apply(.moveTo(m.home.id), m.env).isEmpty)

        let pulled = s.apply(.pullUp, m.env)
        #expect(s.items == [gym])
        #expect(s.firstThing == nil)
        #expect(pulled == [
            .write(.remove(first.id, .week)), .sound(.poles, afterMs: 0), .timer(.undo, ms: WalkState.undoMs), .save,
        ])
        _ = s.apply(.undo, m.env)
        #expect(s.items == [gym, first])
        #expect(s.firstThing == first.id)
    }

    /// Fix round 1 (amended ruling): on Today the first thing is one of the goals a tap walks
    /// round. Started with, a tap on it goes on to the week tasks here; tapping the goal above
    /// comes back round to it, the same first thing, and the Next line is Finish again. A tap
    /// never replaces or clears the first thing. One kept area, so no area tap helps. Every flag
    /// that says it takes a tap does something, and none that does says otherwise.
    @Test func onTodayAFirstThingIsOneOfTheGoalsATapWalksRound() throws {
        var theirs = m.deposit
        theirs.mine = false
        let tile = WalkItem(id: UUID(), level: .week, title: "Choose the tile", areaId: m.home.id, day: m.today)
        let plumber = WalkItem(id: UUID(), level: .week, title: "Call the plumber", areaId: m.home.id, day: m.today)
        var s = m.on(5, items: [theirs, tile, plumber])
        s.kept = [m.home.id]
        s.focusArea = m.home.id
        s.lastPlanted[.week] = theirs.id
        _ = s.apply(.noteExpired, m.env)                       // as the reducer leaves it: about theirs
        _ = s.act(.startThere, m.env)
        #expect(s.firstThing == theirs.id && s.focus[.today] == theirs.id)
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.finish)
        everyTapThatSaysSoActs(s)

        #expect(s.apply(.bannerTapped(theirs.id), m.env) == [.save])
        let aboveNow = try #require(s.focus[.today])
        #expect([tile.id, plumber.id].contains(aboveNow))      // a week task is the goal above
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.startWithThis)
        #expect(s.firstThing == theirs.id)
        everyTapThatSaysSoActs(s)

        for _ in 0..<3 where s.focus[.today] != theirs.id {
            let focused = try #require(s.focus[.today])
            #expect(s.apply(.bannerTapped(focused), m.env) == [.save])
            #expect(s.firstThing == theirs.id)                 // a tap never replaces the first thing
            everyTapThatSaysSoActs(s)
        }
        #expect(s.focus[.today] == theirs.id)                  // round again
        #expect(s.firstThing == theirs.id)
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.finish)

        // No week task here but the first thing's own: a tap changes nothing, and it says so.
        var alone = m.on(5, items: [theirs])
        alone.kept = [m.home.id]
        alone.focusArea = m.home.id
        alone.lastPlanted[.week] = theirs.id
        _ = alone.apply(.noteExpired, m.env)
        _ = alone.act(.startThere, m.env)
        #expect(alone.focus[.today] == theirs.id && alone.firstThing == theirs.id)
        let before = alone
        #expect(alone.apply(.bannerTapped(theirs.id), m.env).isEmpty)
        #expect(alone == before)
        let drawn = WalkLayout.make(alone, today: m.today, footing: .level).posts.flatMap(\.banners)
            .filter { $0.itemId == theirs.id }
        #expect(!drawn.isEmpty && drawn.allSatisfy { !$0.taps })
        #expect(drawn.contains { $0.label == WalkCopy.bannerLabel(theirs.title, level: .today, tag: WalkCopy.firstThingTag,
                                                                   role: .firstThing) })
        everyTapThatSaysSoActs(alone)
    }

    /// Fix round 2, path 1: two week tasks said on Week; on Today "Start with this one". A tap on
    /// the goal above (the first thing, which the walk planted) reaches the other task; again,
    /// it wraps to the same first thing and the Next line is Finish.
    @Test func onTodayTheGoalAboveIsTheSwitchEvenWhenTheWalkPlantedIt() throws {
        let tile = WalkItem(id: UUID(), level: .week, title: "Call the tile shop", areaId: m.home.id, day: m.today)
        let gym = WalkItem(id: UUID(), level: .week, title: "Gym induction", areaId: m.home.id, day: m.today)
        var s = m.on(5, items: [tile, gym])
        s.kept = [m.home.id]
        s.focusArea = m.home.id
        s.lastPlanted[.week] = gym.id
        _ = s.apply(.noteExpired, m.env)
        #expect(s.focus[.today] == gym.id)
        _ = s.act(.startThere, m.env)
        #expect(s.firstThing == gym.id && s.focus[.today] == gym.id)
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.finish)
        everyTapThatSaysSoActs(s)

        #expect(s.apply(.bannerTapped(gym.id), m.env) == [.save])
        #expect(s.focus[.today] == tile.id && s.selected == nil)
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.startWithThis)
        everyTapThatSaysSoActs(s)

        #expect(s.apply(.bannerTapped(tile.id), m.env) == [.save])
        #expect(s.focus[.today] == gym.id && s.firstThing == gym.id)
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.finish)
        everyTapThatSaysSoActs(s)
    }

    /// Fix round 2, path 2: Gym and Shoes; "pack the bag" said under Gym becomes the first thing and
    /// the goal above (P15). The round visits all three and wraps without stopping; with Gym the goal
    /// above, a tap on "pack the bag" selects it.
    @Test func onTodayTheRoundVisitsASpokenFirstThingAndWraps() throws {
        let gym = WalkItem(id: UUID(), level: .week, title: "Gym", areaId: m.home.id, day: m.today)
        let shoes = WalkItem(id: UUID(), level: .week, title: "Shoes", areaId: m.home.id, day: m.today)
        var s = m.on(5, items: [gym, shoes])
        s.kept = [m.home.id]
        s.focusArea = m.home.id
        s.lastPlanted[.week] = shoes.id
        _ = s.apply(.noteExpired, m.env)
        _ = s.apply(.bannerTapped(shoes.id), m.env)            // round again to Gym
        #expect(s.focus[.today] == gym.id)
        _ = s.plant("pack the bag", m.env)
        let pack = try #require(s.items.last)
        #expect(s.firstThing == pack.id && pack.parentId == gym.id && s.focus[.today] == pack.id)   // P15
        everyTapThatSaysSoActs(s)

        var visited: [UUID] = []
        for _ in 0..<3 {
            let focused = try #require(s.focus[.today])
            #expect(s.apply(.bannerTapped(focused), m.env) == [.save])
            visited.append(try #require(s.focus[.today]))
            #expect(s.firstThing == pack.id && s.selected == nil)
            #expect(WalkCopy.nextLine(s, m.env.periods)?.text
                    == (s.focus[.today] == pack.id ? WalkCopy.finish : WalkCopy.startWithThis))
            everyTapThatSaysSoActs(s)
        }
        #expect(visited == [gym.id, shoes.id, pack.id])         // all three, and round again

        _ = s.apply(.bannerTapped(pack.id), m.env)              // the goal above: on round to Gym
        #expect(s.focus[.today] == gym.id && s.selected == nil)
        _ = s.apply(.bannerTapped(pack.id), m.env)              // not the goal above: chosen for Remove
        #expect(s.selected == pack.id && s.focus[.today] == gym.id)
    }

    /// Fix round 2 (d): something said on Today never hangs under a flag whose own goal above is a
    /// week task. Said while a spoken first thing is the goal above, it lands beside it, under the
    /// week task; on a walk down that keeps it on the walk's line.
    @Test func aFirstThingSaidUnderAnotherHangsBesideIt() throws {
        let book = WalkItem(id: UUID(), level: .month, title: "Book the gym", areaId: m.health.id, parentId: m.lift.id)
        let induction = WalkItem(id: UUID(), level: .week, title: "Gym induction", areaId: m.health.id,
                                 parentId: book.id, day: m.today)
        var s = m.on(5, items: [m.strong, m.lift, book, induction])
        s.kept = [m.health.id]
        s.focusArea = m.health.id
        s.walkingDown = [m.strong.id]
        s.focus[.today] = induction.id
        _ = s.plant("pack the bag", m.env)
        let pack = try #require(s.items.last)
        #expect(pack.parentId == induction.id)
        #expect(s.focus[.today] == pack.id)                     // P15: the spoken first thing is the goal above
        _ = s.plant("fill the bottle", m.env)
        let bottle = try #require(s.items.last)
        #expect(bottle.parentId == induction.id)                // beside it, never under it
        #expect(s.firstThing == bottle.id)
        #expect(s.parentsHere().map(\.id) == [induction.id, pack.id, bottle.id])   // still the walk's line
        everyTapThatSaysSoActs(s)
    }

    /// Each drawn flag's tap, sent to the reducer: it acts exactly when the flag says it takes a tap.
    private func everyTapThatSaysSoActs(_ s: WalkState, sourceLocation: SourceLocation = #_sourceLocation) {
        let layout = WalkLayout.make(s, today: m.today, footing: .level)
        for post in layout.posts {
            for banner in post.banners {
                guard let event = WalkLayout.tapEvent(banner, on: post) else { continue }
                var after = s
                let effects = after.apply(event, m.env)
                #expect((after != s || !effects.isEmpty) == banner.taps, "\(banner.label)", sourceLocation: sourceLocation)
            }
        }
    }

    // MARK: Today, every state a tap can reach (fix round 3)

    /// A Today seed: these areas kept, these flags, standing here, then settled as the reducer
    /// leaves every state. `finishOutOfReach` marks a seed the last check skips (see there).
    private struct TodaySeed {
        let name: String; let state: WalkState; var finishOutOfReach = false
    }

    private func today(_ name: String, kept: [WalkArea], items: [WalkItem], standing: WalkArea?,
                       firstThing: UUID? = nil, lastPlanted: UUID? = nil, walkingDown: [UUID] = [],
                       say: String? = nil) -> TodaySeed {
        var s = m.on(5, items: items)
        s.kept = kept.map(\.id)
        s.focusArea = standing?.id
        s.firstThing = firstThing
        s.walkingDown = walkingDown
        if let lastPlanted { s.lastPlanted[.week] = lastPlanted }
        _ = s.apply(.noteExpired, m.env)
        if let say { _ = s.plant(say, m.env); _ = s.apply(.undoExpired, m.env) }
        s.undo = []
        return TodaySeed(name: name, state: s)
    }

    private func week(_ title: String, _ area: WalkArea?, mine: Bool = true, under parent: UUID? = nil) -> WalkItem {
        WalkItem(id: UUID(), level: .week, title: title, areaId: area?.id, parentId: parent, day: m.today, mine: mine)
    }

    /// The seeds: one, two and three kept areas; none, one and several week tasks an area; an area
    /// whose only week task is the first thing; a first thing marked (Start with this one, reached
    /// in the search) and one spoken; the walk's own and another's; a first walk and a walk down;
    /// a loose week task on the nameless post.
    private func todaySeeds() -> [TodaySeed] {
        let (health, home, people) = (m.health, m.home, m.people)
        var seeds: [TodaySeed] = []
        let tile = week("Call the tile shop", home)
        seeds.append(today("one area, one task", kept: [home], items: [tile], standing: home))
        let a = week("Gym", home), b = week("Shoes", home), c = week("Their errand", home, mine: false)
        seeds.append(today("one area, several, theirs marked", kept: [home], items: [a, b, c], standing: home,
                           firstThing: c.id))
        let gym = week("Gym induction", health), tiler = week("Call the tiler", home)
        seeds.append(today("two areas, one task each (the re-review's path)", kept: [health, home],
                           items: [gym, tiler], standing: home, lastPlanted: tiler.id))
        let g2 = week("Gym", health), s2 = week("Shoes", health), spoken = week("Book the skip", home)
        seeds.append(today("two areas, the first thing alone in its area", kept: [health, home],
                           items: [g2, s2, spoken], standing: health, firstThing: spoken.id))
        let g3 = week("Gym", health), mum = week("Call mum", people), dinner = week("Book dinner", people, mine: false)
        seeds.append(today("three areas, none in one, theirs marked", kept: [health, home, people],
                           items: [g3, mum, dinner], standing: people, firstThing: dinner.id))
        let g4 = week("Gym", health), s4 = week("Shoes", health)
        seeds.append(today("spoken first thing under a task", kept: [health, home], items: [g4, s4], standing: health,
                           lastPlanted: g4.id, say: "pack the bag"))
        let book = WalkItem(id: UUID(), level: .month, title: "Book the gym", areaId: health.id, parentId: m.lift.id)
        let induction = week("Gym induction", health, under: book.id)
        let fence = week("Mend the fence", home)
        seeds.append(today("walk down, on its line", kept: [health, home],
                           items: [m.strong, m.lift, book, induction, fence], standing: health,
                           walkingDown: [m.strong.id]))
        var off = today("walk down, the first thing off its line", kept: [health, home],
                        items: [m.strong, m.bathroom, m.lift, book, induction, fence], standing: home,
                        firstThing: induction.id, walkingDown: [m.bathroom.id])
        // The Next line reads Finish only while the first thing is the goal above (or none is),
        // and a walk down never makes a flag off its line the goal above: Finish is out of reach
        // by taps here for a reason outside the Today rules. Ruled (P14): the walk still finishes from
        // every state here without taking the first thing (`aWalkDownEndsWithoutTakingTheFirstThing`).
        off.finishOutOfReach = true
        seeds.append(off)
        let loose = week("Find the passport", nil), shop = week("Call the shop", home)
        seeds.append(today("a loose task on the nameless post, marked", kept: [home], items: [loose, shop],
                           standing: home, firstThing: loose.id))
        let loose2 = week("Find the passport", nil), shop2 = week("Call the shop", home), shoes2 = week("Shoes", health)
        seeds.append(today("a loose first thing, two areas", kept: [health, home], items: [loose2, shop2, shoes2],
                           standing: health, firstThing: loose2.id))
        return seeds
    }

    /// What an area's label says a tap does, off the ground.
    private func areaHint(_ s: WalkState, _ id: UUID) -> String? { WalkCopy.areaHint(s, id) }

    /// Every Today state a tap (on a drawn flag or a kept area) or the Next line's "Start with this
    /// one" can reach from the seeds, searched breadth first to the end (a seed may not pass
    /// `cap` states). In each: a flag's role and an area's hint say exactly what the reducer does,
    /// a tap never changes the first thing, and taps alone lead back to the first thing as the goal
    /// above with the Next line reading Finish. The nameless post has no label to tap, so it is
    /// reached only through its flags.
    @Test func onTodayEveryStateATapReachesKeepsItsWord() throws {
        let cap = 3000
        let walkThere = WalkCopy.areaHint(ground: false, kept: true, focused: false)
        var visitedInAll = 0
        for seed in todaySeeds() {
            var states = [seed.state]
            var tapEdges: [[Int]] = [[]]
            var next = 0
            while next < states.count {
                let s = states[next]
                // The Undo stack (and its pill) grows with every "Start with this one" but changes no tap:
                // states that differ only there are one state.
                func index(of reached: WalkState) -> Int {
                    var t = reached
                    t.undo = []
                    t.undoShowing = false
                    if let i = states.firstIndex(of: t) { return i }
                    states.append(t); tapEdges.append([])
                    return states.count - 1
                }
                let layout = WalkLayout.make(s, today: m.today, footing: .level)
                for post in layout.posts {
                    for banner in post.banners {
                        guard let event = WalkLayout.tapEvent(banner, on: post), case .bannerTapped = event else { continue }
                        var after = s
                        _ = after.apply(event, m.env)
                        #expect((after != s) == banner.taps, "\(seed.name): \(banner.label)")
                        #expect(after.firstThing == s.firstThing, "\(seed.name): \(banner.label) changed the first thing")
                        // What the tap does is what the role says.
                        switch Self.role(of: banner) {
                        case .focusedOfSeveral?, .focusedThenFirstThing?, .firstThingFocused?:
                            #expect(after.focus[.today] == s.nextGoalAbove() && after.selected == s.selected,
                                    "\(seed.name): \(banner.label) did not walk the round")
                        case .firstThingMine?:
                            #expect(after.selected == banner.itemId, "\(seed.name): \(banner.label) was not chosen")
                        case .firstThingChosen?:
                            #expect(after.selected == nil, "\(seed.name): \(banner.label) was not let go")
                        case .firstThingFocusable?:
                            #expect(after.focus[.today] == banner.itemId, "\(seed.name): \(banner.label) is not the goal above")
                        default:
                            break
                        }
                        if after != s { let i = index(of: after); tapEdges[next].append(i) }
                    }
                }
                for id in s.kept {
                    var after = s
                    _ = after.apply(.areaTapped(id), m.env)
                    let name = s.area(id)?.name ?? "?"
                    if areaHint(s, id) == walkThere {
                        #expect(after.standing == id, "\(seed.name): \(name) says it can be walked to")
                    } else {
                        #expect(after == s, "\(seed.name): \(name) takes no walk, yet a tap changed the walk")
                    }
                    #expect(after.firstThing == s.firstThing, "\(seed.name): a tap on \(name) changed the first thing")
                    if after != s { let i = index(of: after); tapEdges[next].append(i) }
                }
                if WalkCopy.nextLine(s, m.env.periods)?.action == .startThere {
                    var after = s
                    _ = after.apply(.nextTapped, m.env)
                    _ = index(of: after)
                }
                next += 1
                try #require(states.count <= cap, "\(seed.name): more than \(cap) states")
            }
            visitedInAll += states.count

            // Taps alone lead back to the first thing as the goal above, with Finish.
            guard !seed.finishOutOfReach else { continue }
            var good = Set(states.indices.filter { i in
                let s = states[i]
                return s.firstThing != nil && s.focus[.today] == s.firstThing
                    && WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.finish
            })
            var grew = true
            while grew {
                grew = false
                for i in states.indices where !good.contains(i) && tapEdges[i].contains(where: good.contains) {
                    good.insert(i); grew = true
                }
            }
            for i in states.indices where states[i].firstThing != nil && !good.contains(i) {
                let s = states[i]
                let place = s.area(s.standing)?.name ?? "nameless", above = s.item(s.focus[.today])?.title ?? "none"
                let first = s.item(s.firstThing)?.title ?? "?"
                let message = "\(seed.name): no taps lead back to Finish from \(place), goal above \(above), first thing \(first)"
                Issue.record(Comment(rawValue: message))
            }
        }
        #expect(visitedInAll > 0)
        print("Today search visited \(visitedInAll) states")
    }

    /// F24: Move to offers only the areas kept, in ridge order, never the flag's own; on Today none.
    /// The role a drawn flag's label names (nil for a stub or a "+n" flag).
    private static func role(of banner: WalkLayout.Banner) -> WalkCopy.BannerRole? {
        let roles: [WalkCopy.BannerRole] = [.mine, .plain, .focused, .focusedOfSeveral, .focusedThenFirstThing, .firstThing,
                                            .firstThingMine, .firstThingChosen, .firstThingFocusable, .firstThingFocused, .example]
        return roles.first { WalkCopy.bannerLabel(banner.text, level: banner.level, tag: banner.tag, role: $0) == banner.label }
    }

    /// Every Today state the seed's taps (on drawn flags and kept areas) reach, and the taps between them.
    private func tapSearch(_ seed: WalkState) -> (states: [WalkState], edges: [[Int]]) {
        var states = [seed], edges: [[Int]] = [[]], next = 0
        while next < states.count {
            let s = states[next]
            var afters: [WalkState] = []
            let layout = WalkLayout.make(s, today: m.today, footing: .level)
            for post in layout.posts { for banner in post.banners {
                guard let event = WalkLayout.tapEvent(banner, on: post), case .bannerTapped = event else { continue }
                var after = s; _ = after.apply(event, m.env); afters.append(after)
            } }
            for id in s.kept { var after = s; _ = after.apply(.areaTapped(id), m.env); afters.append(after) }
            for var after in afters where after != s {
                after.undo = []; after.undoShowing = false
                if let i = states.firstIndex(of: after) { edges[next].append(i) } else {
                    states.append(after); edges.append([]); edges[next].append(states.count - 1)
                }
            }
            next += 1
        }
        return (states, edges)
    }

    private func seed(_ name: String) throws -> WalkState {
        try #require(todaySeeds().first { $0.name == name }).state
    }

    /// P15: right after a first thing is spoken on Today it is the goal above, so the Next line finishes
    /// the walk at once; the next thing said still hangs beside it, under the week task (rule d).
    @Test func aSpokenFirstThingIsWhatFinishIsAbout() throws {
        let gym = week("Gym", m.home), shoes = week("Shoes", m.home)
        var s = m.on(5, items: [gym, shoes])
        s.kept = [m.home.id]
        s.focusArea = m.home.id
        s.lastPlanted[.week] = gym.id
        _ = s.apply(.noteExpired, m.env)
        #expect(s.focus[.today] == gym.id)
        _ = s.plant("pack the bag", m.env)
        let pack = try #require(s.items.last)
        #expect(s.firstThing == pack.id && pack.parentId == gym.id)
        #expect(s.focus[.today] == pack.id)
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.finish)
        _ = s.plant("fill the bottle", m.env)
        let bottle = try #require(s.items.last)
        #expect(bottle.parentId == gym.id && s.firstThing == bottle.id && s.focus[.today] == bottle.id)
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == WalkCopy.finish)
        everyTapThatSaysSoActs(s)
    }

    /// P14: on a walk down whose first thing is off the walked line, the walk can always be finished
    /// without replacing it: from every state a tap reaches, Next reads Finish, and pressing it ends
    /// Today with the first thing unchanged.
    @Test func aWalkDownEndsWithoutTakingTheFirstThing() throws {
        let start = try seed("walk down, the first thing off its line")
        let (states, edges) = tapSearch(start)
        #expect(states.count > 1)
        var good = Set(states.indices.filter { i in
            var after = states[i]
            _ = after.apply(.nextTapped, m.env)
            return after.step == 6 && after.firstThing == states[i].firstThing
        })
        var grew = true
        while grew {
            grew = false
            for i in states.indices where !good.contains(i) && edges[i].contains(where: good.contains) { good.insert(i); grew = true }
        }
        for i in states.indices where !good.contains(i) {
            Issue.record("no Next press ends the walk from \(states[i].area(states[i].standing)?.name ?? "nameless")")
        }
        #expect(Set(states.map { WalkCopy.nextLine($0, m.env.periods)?.text }) == [WalkCopy.finish])
    }

    /// The goal above says where a tap takes it: standing in Home, whose only other goal in Today's round is
    /// the nameless post's first thing, it says the tap goes to the first thing, and it does.
    @Test func theGoalAboveSaysWhenATapGoesToTheFirstThing() throws {
        let s = try seed("a loose task on the nameless post, marked")
        let shop = try #require(s.item(s.focus[.today]))
        #expect(s.standing == m.home.id && shop.title == "Call the shop" && s.nextGoalAbove() == s.firstThing)
        let banner = try #require(WalkLayout.make(s, today: m.today, footing: .level).posts.flatMap(\.banners)
            .first { $0.itemId == shop.id })
        #expect(banner.label == WalkCopy.bannerLabel(banner.text, level: banner.level, tag: banner.tag,
                                                     role: .focusedThenFirstThing))
        #expect(!banner.label.contains("next one here"))
        var after = s
        _ = after.apply(.bannerTapped(shop.id), m.env)
        #expect(after.focus[.today] == s.firstThing)
    }

    /// The why line offers the switch exactly when the goal above takes a tap: it counts the round
    /// (`nextGoalAbove`), the nameless post's first thing included, not only the goals here.
    @Test func theWhyLineCountsTheRound() throws {
        let s = try seed("a loose task on the nameless post, marked")
        #expect(s.parentsHere().count == 1 && s.nextGoalAbove() != nil)
        #expect(WalkCopy.why(s, m.env.periods).hasSuffix(WalkCopy.focusAbove))
        let alone = try seed("one area, one task")
        #expect(alone.nextGoalAbove() == nil && !WalkCopy.why(alone, m.env.periods).hasSuffix(WalkCopy.focusAbove))
    }

    @Test func moveToOffersOnlyKeptAreas() {
        let site = WalkItem(id: UUID(), level: .year, title: "Ship the site", areaId: m.work.id)
        var s = m.on(1, items: [site])
        s.areas = [m.health, m.home, m.people, m.work, m.money]
        s.kept = [m.work.id, m.people.id, m.health.id]
        #expect(s.moveTargets.isEmpty)
        _ = s.apply(.bannerTapped(site.id), m.env)
        #expect(s.selected == site.id)
        #expect(s.moveTargets == [m.health, m.people])
        #expect(s.apply(.moveTo(m.home.id), m.env).isEmpty)      // not kept
        #expect(s.apply(.moveTo(m.work.id), m.env).isEmpty)      // its own
        #expect(s.items == [site] && s.kept.count == 3)

        var today = m.on(5)
        _ = today.plant("call the plumber", m.env)
        today.selected = today.firstThing
        #expect(today.moveTargets.isEmpty)
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

    /// Fix round 2: Undo of Pull it up gives back what the pull-up took from a walk down's own
    /// lines: the walked goal, and a flag the walk down planted with no goal above. Skipping
    /// Season after that still borrows nothing of another goal's line.
    @Test func undoingAPullUpOnAWalkDownKeepsItsLines() throws {
        var s = m.on(6, items: [m.strong, m.bathroom, m.lift])
        #expect(s.apply(.walkAnother, m.env) == [.save])
        #expect(s.walkingDown == [m.bathroom.id])
        _ = s.act(.back, m.env)                                // up to Year
        #expect(s.step == 1)
        _ = s.apply(.bannerTapped(m.bathroom.id), m.env)       // the walked goal, chosen
        _ = s.apply(.pullUp, m.env)
        _ = s.apply(.undo, m.env)
        #expect(s.walkingDown == [m.bathroom.id])

        _ = s.act(.next, m.env)                                // Season, about the walked goal
        #expect(s.focus[.season] == m.bathroom.id)
        _ = s.act(.next, m.env)                                // Season skipped
        #expect(s.step == 3)
        #expect(s.focus[.month] == nil)                        // never "Lift twice a week"
        _ = s.plant("call the tiler", m.env)
        let tiler = try #require(s.items.last)
        #expect(tiler.parentId == nil)

        _ = s.apply(.bannerTapped(tiler.id), m.env)
        _ = s.apply(.pullUp, m.env)
        _ = s.apply(.undo, m.env)
        #expect(s.walkingDown == [m.bathroom.id, tiler.id])
        _ = s.act(.next, m.env)                                // Week: about the tiler, this walk down's own
        #expect(s.focus[.week] == tiler.id)
    }

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
        #expect(s.focusArea == m.home.id && s.tour.isEmpty)      // standing in that goal's area
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
        walked.focusArea = m.health.id
        let before = walked
        #expect(walked.apply(.walkAnother, m.env) == [])
        #expect(walked == before)

        // Not at the ending.
        var today = m.on(5, items: [m.strong, m.bathroom, m.lift])
        today.focus = [.today: m.lift.id]
        today.focusArea = m.health.id
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
