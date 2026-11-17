import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// The mockup's script (Walk.dc.html:230-234) on three kept peaks, Friday 13 November 2026.
private struct Mountain {
    let health = WalkArea(id: UUID(), name: "Health")
    let home = WalkArea(id: UUID(), name: "Home")
    let people = WalkArea(id: UUID(), name: "People")
    let work = WalkArea(id: UUID(), name: "Work")
    let money = WalkArea(id: UUID(), name: "Money")
    let fun = WalkArea(id: UUID(), name: "Fun")

    let strong: WalkItem
    let bathroom: WalkItem
    let weekends: WalkItem
    let bathroomByFebruary: WalkItem
    let lift: WalkItem
    let tile: WalkItem
    let deposit: WalkItem
    let chooseTile: WalkItem

    let now = day(2026, 11, 13)
    var env: WalkEnv { WalkEnv(periods: WalkPeriods.pick(now: now, weekStartsOn: 0), now: now) }

    init() {
        strong = WalkItem(id: UUID(), level: .year, title: "Feel strong again", areaId: health.id)
        bathroom = WalkItem(id: UUID(), level: .year, title: "Finish the bathroom", areaId: home.id)
        weekends = WalkItem(id: UUID(), level: .year, title: "More slow weekends together", areaId: people.id)
        bathroomByFebruary = WalkItem(id: UUID(), level: .season, title: "Bathroom done by February",
                                      areaId: home.id, parentId: bathroom.id)
        lift = WalkItem(id: UUID(), level: .season, title: "Lift twice a week", areaId: health.id, parentId: strong.id)
        tile = WalkItem(id: UUID(), level: .month, title: "Pick the tile and pay the deposit",
                        areaId: home.id, parentId: bathroomByFebruary.id)
        deposit = WalkItem(id: UUID(), level: .week, title: "Send the contractor the deposit",
                           areaId: home.id, parentId: tile.id, day: day(2026, 11, 13))
        chooseTile = WalkItem(id: UUID(), level: .week, title: "Choose the tile",
                              areaId: home.id, parentId: tile.id, day: day(2026, 11, 14))
    }

    var areas: [WalkArea] { [health, home, people, work, money, fun] }

    /// Welcome, the six peaks on the ridge, nothing planted.
    func welcome() -> WalkState {
        var s = WalkState()
        s.areas = areas
        return s
    }

    /// Off the ground on a step, with Health, Home and People kept (in that order) and the script planted
    /// down to and including the step's own level, as the mockup opens a step.
    func at(_ step: Int, depth: WalkDepth = .quick, kept: [UUID]? = nil) -> WalkState {
        var s = welcome()
        s.step = step
        s.depth = depth
        s.kept = kept ?? [health.id, home.id, people.id]
        let script: [WalkLevel: [WalkItem]] = [
            .year: [strong, bathroom, weekends], .season: [bathroomByFebruary, lift],
            .month: [tile], .week: [deposit, chooseTile],
        ]
        for level in WalkLevel.allCases where level.rawValue <= step {
            s.items += script[level] ?? []
        }
        return s
    }
}

struct WalkStepsTests {
    private let m = Mountain()

    // MARK: Welcome and the ground

    @Test func quickStartOpensTheGround() {
        var s = m.welcome()
        let effects = s.act(.quick, m.env)
        #expect(s.step == 1)
        #expect(s.ground)
        #expect(s.depth == .quick)
        #expect(s.kept.isEmpty)
        #expect(s.focusArea == nil)
        #expect(effects == [.save])

        var w = m.welcome()
        _ = w.act(.full, m.env)
        #expect(w.depth == .full && w.ground && w.step == 1)
    }

    @Test func notNowLeaves() {
        var s = m.welcome()
        #expect(s.act(.notNow, m.env) == [.timer(.finish, ms: nil), .end(.left)])
    }

    @Test func keepingIsATapAndCanBeTakenBack() {
        var s = m.welcome()
        _ = s.act(.quick, m.env)

        let first = s.apply(.areaTapped(m.health.id), m.env)
        #expect(s.kept == [m.health.id])
        #expect(first == [.sound(.tick, afterMs: 0), .timer(.undo, ms: WalkState.undoMs), .save])   // no row until something is planted
        #expect(s.undoShowing == true)

        let second = s.apply(.areaTapped(m.health.id), m.env)
        #expect(s.kept.isEmpty)
        #expect(second == [.sound(.tick, afterMs: 0), .timer(.undo, ms: WalkState.undoMs), .save])
        #expect(s.undo == [.keep(m.health.id), .unkeep(m.health.id, index: 0)])
    }

    @Test func keptIsInTheOrderTapped() {
        var s = m.welcome()
        _ = s.act(.quick, m.env)
        _ = s.apply(.areaTapped(m.people.id), m.env)
        _ = s.apply(.areaTapped(m.health.id), m.env)
        #expect(s.kept == [m.people.id, m.health.id])
        #expect(s.keptAreas.map(\.name) == ["Health", "People"])
    }

    // MARK: Quick start

    @Test func quickWalksEveryGoalDown() {
        // Given a quick walk on Year standing in People, its goal planted last…
        var s = m.at(1)
        s.focusArea = m.people.id
        s.lastPlanted[.year] = m.weekends.id
        // …walking on starts Season at the first column's goal, the others waiting their turn (the
        // owner, 2026-11-17: Next went down to the month and the other area never had its winter).
        let effects = s.act(.next, m.env)
        #expect(s.step == 2)
        #expect(s.focus[.season] == m.strong.id && s.focusArea == m.health.id)
        #expect(s.tour == [m.bathroom.id, m.weekends.id])
        #expect(effects == [.save])
        _ = s.act(.next, m.env)
        #expect(s.step == 2 && s.focus[.season] == m.bathroom.id && s.focusArea == m.home.id)
        _ = s.act(.next, m.env)
        #expect(s.step == 2 && s.focus[.season] == m.weekends.id && s.tour.isEmpty)
        _ = s.act(.next, m.env)
        #expect(s.step == 3)

        // With nothing planted on Year there is nothing to focus.
        var empty = m.at(1)
        empty.items = []
        _ = empty.act(.next, m.env)
        #expect(empty.step == 2)
        #expect(empty.focus[.season] == nil)
    }

    @Test func quickLeavesTheGroundStandingInTheFirstArea() {
        var s = m.welcome()
        _ = s.act(.quick, m.env)
        _ = s.apply(.areaTapped(m.health.id), m.env)
        _ = s.apply(.areaTapped(m.home.id), m.env)
        let effects = s.act(.next, m.env)
        #expect(!s.ground)
        #expect(s.step == 1)
        #expect(s.focusArea == m.health.id)
        #expect(s.tour == [m.home.id])                  // Next visits every area kept, on a quick start too
        #expect(effects == [.save])
    }

    // MARK: The whole year

    @Test func wholeYearVisitsEachArea() {
        var s = m.welcome()
        _ = s.act(.full, m.env)
        for a in [m.home, m.health, m.people] { _ = s.apply(.areaTapped(a.id), m.env) }

        _ = s.act(.next, m.env)
        #expect(!s.ground)
        #expect(s.focusArea == m.home.id)
        #expect(s.tour == [m.health.id, m.people.id])

        let toHealth = s.act(.next, m.env)
        #expect(s.step == 1)
        #expect(s.focusArea == m.health.id)
        #expect(toHealth == [.save])

        _ = s.act(.next, m.env)
        #expect(s.step == 1)
        #expect(s.focusArea == m.people.id)
        #expect(s.tour.isEmpty)

        _ = s.act(.next, m.env)
        #expect(s.step == 2)
        #expect(s.focusArea == m.people.id)                  // nothing above anywhere: it stays where it stood
    }

    @Test func wholeYearWalksEachYearGoalThroughTheSeason() {
        // Year goals planted out of column order: People first, then an unlabeled one, then Health and Home.
        var s = m.at(1, depth: .full)
        let loose = WalkItem(id: UUID(), level: .year, title: "Learn the cello")
        s.items = [m.weekends, loose, m.strong, m.bathroom]

        _ = s.act(.next, m.env)
        #expect(s.step == 2)
        #expect(s.focus[.season] == m.strong.id)                       // Health is the first column
        #expect(s.tour == [m.bathroom.id, m.weekends.id, loose.id])     // then Home, People, unlabeled last

        _ = s.act(.next, m.env)
        #expect(s.step == 2 && s.focus[.season] == m.bathroom.id)
        _ = s.act(.next, m.env)
        #expect(s.step == 2 && s.focus[.season] == m.weekends.id)
        _ = s.act(.next, m.env)
        #expect(s.step == 2 && s.focus[.season] == loose.id)
        #expect(s.tour.isEmpty)

        _ = s.act(.next, m.env)
        #expect(s.step == 3)
    }

    @Test func everyWalkGoesGoalByGoalOnMonthAndWeek() {
        for depth in [WalkDepth.quick, .full] {
            var s = m.at(2, depth: depth)
            s.lastPlanted[.season] = m.bathroomByFebruary.id       // the newest does not decide: the first column does
            _ = s.act(.next, m.env)
            #expect(s.step == 3 && s.focus[.month] == m.lift.id && s.focusArea == m.health.id)
            #expect(s.tour == [m.bathroomByFebruary.id])
            _ = s.act(.next, m.env)
            #expect(s.step == 3 && s.focus[.month] == m.bathroomByFebruary.id && s.focusArea == m.home.id)
            #expect(s.tour.isEmpty)

            let gym = WalkItem(id: UUID(), level: .month, title: "Join the gym", areaId: m.health.id, parentId: m.lift.id)
            s.items += [m.tile, gym]                               // planted Home first: Health is still the first column
            _ = s.act(.next, m.env)
            #expect(s.step == 4 && s.focus[.week] == gym.id && s.tour == [m.tile.id])
            _ = s.act(.next, m.env)
            #expect(s.step == 4 && s.focus[.week] == m.tile.id && s.tour.isEmpty)

            // Today asks for one first thing: no tour, the last planted task as before.
            s.items += [m.deposit, m.chooseTile]
            s.lastPlanted[.week] = m.chooseTile.id
            _ = s.act(.next, m.env)
            #expect(s.step == 5 && s.focus[.today] == m.chooseTile.id && s.tour.isEmpty)
        }
    }

    /// A walk down follows one goal's own line: Next goes down, never to another goal.
    @Test func aWalkDownHasNoTour() {
        var s = m.at(2)
        s.walkingDown = [m.bathroom.id]
        s.focus[.season] = m.bathroom.id
        _ = s.act(.next, m.env)
        #expect(s.step == 3 && s.focus[.month] == m.bathroomByFebruary.id && s.tour.isEmpty)
        _ = s.act(.next, m.env)
        #expect(s.step == 4)
    }

    @Test func aRememberedFocusIsNotReplacedByTheLastPlanted() {
        var s = m.at(3)
        s.focus[.month] = m.bathroomByFebruary.id
        s.lastPlanted[.season] = m.lift.id
        _ = s.act(.back, m.env)
        _ = s.act(.next, m.env)
        #expect(s.focus[.month] == m.bathroomByFebruary.id)
    }

    // MARK: Back

    @Test func backRemembersFocus() {
        var s = m.at(3)
        s.focus[.season] = m.weekends.id        // Season's round was finished on the way down
        s.focusArea = m.home.id
        _ = s.apply(.areaTapped(m.health.id), m.env)
        #expect(s.focus[.month] == m.lift.id)

        let back = s.act(.back, m.env)
        #expect(s.step == 2)
        #expect(back == [.save])
        _ = s.act(.next, m.env)
        #expect(s.step == 3)
        #expect(s.focus[.month] == m.lift.id)
    }

    // MARK: A tour remembers its place (controller ruling on the Task 8 review)

    @Test func backUpFromSeasonThenWalkOnReturnsToTheSameGoalInOnePress() {
        var s = m.at(1, depth: .full)
        _ = s.act(.next, m.env)                 // Season: Feel strong again, two more ahead
        _ = s.act(.next, m.env)                 // Finish the bathroom
        #expect(s.focus[.season] == m.bathroom.id)

        _ = s.act(.back, m.env)                 // up to Year: the tour is over, still in that goal's area
        #expect(s.step == 1)
        #expect(!s.ground)
        #expect(s.focusArea == m.home.id)
        #expect(s.tour.isEmpty)

        _ = s.act(.next, m.env)                 // one press back down
        #expect(s.step == 2)
        #expect(s.focus[.season] == m.bathroom.id)
        #expect(s.tour == [m.weekends.id])
    }

    @Test func backFromMonthToSeasonKeepsTheSeasonFocusAndTheStopsLeft() {
        var finished = m.at(2, depth: .full)
        _ = finished.act(.back, m.env)
        _ = finished.act(.next, m.env)          // Season tour from the top: strong, then bathroom, weekends
        _ = finished.act(.next, m.env)
        _ = finished.act(.next, m.env)
        #expect(finished.focus[.season] == m.weekends.id && finished.tour.isEmpty)
        _ = finished.act(.next, m.env)
        #expect(finished.step == 3)
        _ = finished.act(.back, m.env)
        #expect(finished.step == 2)
        #expect(finished.focus[.season] == m.weekends.id)
        #expect(finished.tour.isEmpty)

        var midway = m.at(3, depth: .full)
        midway.focus[.season] = m.bathroom.id
        _ = midway.act(.back, m.env)
        #expect(midway.focus[.season] == m.bathroom.id)
        #expect(midway.tour == [m.weekends.id])
    }

    @Test func aRememberedFocusThatIsNoLongerAStopRestartsTheTour() {
        var s = m.at(3, depth: .full)
        s.focus[.season] = UUID()               // its goal was pulled up
        _ = s.act(.back, m.env)
        #expect(s.focus[.season] == m.strong.id)
        #expect(s.tour == [m.bathroom.id, m.weekends.id])
    }

    @Test func walkingToTheLastStopThenWalkingOnLeavesTheStep() {
        var s = leftTheGround(keeping: [m.home, m.health, m.people])
        #expect(s.focusArea == m.home.id && s.tour == [m.health.id, m.people.id])
        _ = s.apply(.areaTapped(m.people.id), m.env)
        #expect(s.focusArea == m.people.id)
        #expect(s.tour.isEmpty)
        _ = s.act(.next, m.env)
        #expect(s.step == 2)
    }

    @Test func walkingToAMiddleStopThenWalkingOnGoesToTheStopAfterIt() {
        var s = leftTheGround(keeping: [m.home, m.health, m.people])
        _ = s.apply(.areaTapped(m.health.id), m.env)
        #expect(s.focusArea == m.health.id)
        #expect(s.tour == [m.people.id])
        _ = s.act(.next, m.env)
        #expect(s.step == 1 && s.focusArea == m.people.id)

        // The same on the Season tour, by walking to another area: its goal above is the stop.
        var season = m.at(1, depth: .full)
        _ = season.act(.next, m.env)            // Feel strong again; Finish the bathroom and More slow weekends ahead
        _ = season.apply(.areaTapped(m.home.id), m.env)
        #expect(season.focus[.season] == m.bathroom.id)
        #expect(season.tour == [m.weekends.id])
        _ = season.act(.next, m.env)
        #expect(season.step == 2 && season.focus[.season] == m.weekends.id)
        _ = season.act(.next, m.env)
        #expect(season.step == 3)
    }

    @Test func aTourStepPutsAwayWhatBelongedToTheLastStop() {
        var s = leftTheGround(keeping: [m.home, m.health, m.people])
        s.selected = m.bathroom.id
        s.expanded = WalkPostKey(level: .year, column: m.home.id)
        s.typing = "half a thought"
        s.orb = .open
        let effects = s.act(.next, m.env)
        #expect(s.focusArea == m.health.id)
        #expect(s.selected == nil)
        #expect(s.expanded == nil)
        #expect(s.typing == nil)
        #expect(s.orb == .idle)
        #expect(effects == [.save])
    }

    @Test func aWholeYearWalkWithNothingKeptReachesTheBottom() {
        var s = m.welcome()
        _ = s.act(.full, m.env)
        for _ in 0..<6 { _ = s.act(.next, m.env) }
        #expect(s.step == 6)
    }

    @Test func aWholeYearWalkWithNoYearGoalsReachesTheBottom() {
        var s = leftTheGround(keeping: [m.home, m.health, m.people])
        for _ in 0..<7 { _ = s.act(.next, m.env) }      // two more peaks, then Season…Look back up
        #expect(s.step == 6)
    }

    /// A whole-year walk just off the ground, nothing planted.
    private func leftTheGround(keeping areas: [WalkArea]) -> WalkState {
        var s = m.welcome()
        _ = s.act(.full, m.env)
        for a in areas { _ = s.apply(.areaTapped(a.id), m.env) }
        _ = s.act(.next, m.env)
        return s
    }

    @Test func backFromYearReturnsToGround() {
        var s = m.at(1, depth: .full)
        s.focusArea = m.home.id
        s.tour = [m.people.id]
        let effects = s.act(.back, m.env)
        #expect(s.step == 1)
        #expect(s.ground)
        #expect(s.focusArea == nil)
        #expect(s.tour.isEmpty)
        #expect(s.kept == [m.health.id, m.home.id, m.people.id])
        #expect(effects == [.save])
    }

    @Test func backFromGroundReturnsToWelcome() {
        var s = m.welcome()
        _ = s.act(.quick, m.env)
        let effects = s.act(.back, m.env)
        #expect(s.step == 0)
        #expect(!s.ground)
        #expect(effects == [.save])
        #expect(s.act(.back, m.env).isEmpty)    // nowhere higher than Welcome
        #expect(s.step == 0)
    }

    // MARK: Areas

    @Test func tappingAnAreaWalksThereAndTappingAgainStays() {
        var s = m.at(1)
        let zoom = s.apply(.areaTapped(m.home.id), m.env)
        #expect(s.focusArea == m.home.id)
        #expect(zoom == [.save])                // no sound on Year

        _ = s.apply(.areaTapped(m.people.id), m.env)
        #expect(s.focusArea == m.people.id)

        #expect(s.apply(.areaTapped(m.people.id), m.env).isEmpty)
        #expect(s.focusArea == m.people.id)
        #expect(s.kept == [m.health.id, m.home.id, m.people.id])   // tapping off the ground never keeps or lets go
    }

    @Test func anAreaNotKeptCannotBeWalkedTo() {
        var s = m.at(1)
        #expect(s.apply(.areaTapped(m.work.id), m.env).isEmpty)
        #expect(s.standing == m.health.id)      // the walk still stands in a kept area
        #expect(!s.kept.contains(m.work.id))
    }

    /// Every step off the ground, down to Look back up, walks to a kept area on a tap.
    @Test func anAreaCanBeWalkedToOnEveryStep() {
        for step in 1...6 {
            var s = m.at(step)
            s.focusArea = m.health.id
            #expect(s.apply(.areaTapped(m.home.id), m.env) == [.save], "step \(step)")
            #expect(s.standing == m.home.id, "step \(step)")
        }
    }

    // MARK: Depth and examples

    @Test func choosingADepthStartsWithNoFocus() {
        // A quick walk left a Season focus behind, then the person went back up to Welcome.
        var s = m.at(1)
        s.focus[.season] = m.bathroom.id
        s.focus[.month] = m.lift.id
        s.step = 0
        _ = s.act(.full, m.env)
        #expect(s.focus.isEmpty)

        // So a first whole-year visit to Season starts at the first goal and skips none.
        _ = s.act(.next, m.env)                 // off the ground (nothing kept)
        _ = s.act(.next, m.env)                 // Season
        #expect(s.step == 2)
        #expect(s.focus[.season] == m.strong.id)
        #expect(s.tour == [m.bathroom.id, m.weekends.id])
    }

    @Test func examplesToggleButNotOnToday() {
        var s = m.at(3)
        _ = s.act(.examples, m.env)
        #expect(s.examplesOn == [3])
        _ = s.act(.next, m.env)
        #expect(s.examplesOn.isEmpty)                   // a new step is a fresh ask (P24)
        _ = s.act(.examples, m.env)
        #expect(s.examplesOn == [4])
        // Asking again brings other ones, for up to three pages a showing; then it hides them.
        let first = s.examplesLeft(today: m.env.periods.today)
        _ = s.act(.examples, m.env)
        #expect(s.examplesOn == [4] && s.examplesLeft(today: m.env.periods.today) != first)
        _ = s.act(.examples, m.env)
        #expect(s.examplesOn == [4])
        _ = s.act(.examples, m.env)
        #expect(s.examplesOn.isEmpty)

        var today = m.at(5)
        _ = today.act(.examples, m.env)
        #expect(today.examplesOn.isEmpty)

        var ground = m.welcome()
        _ = ground.act(.quick, m.env)
        _ = ground.act(.examples, m.env)
        #expect(ground.examplesOn.isEmpty)
    }

    // MARK: Notes

    @Test func aNoteGoesWhenItsTimeIsUp() {
        var s = m.at(1)
        s.note = "That sounded like home, so it went on the Home peak."
        _ = s.apply(.noteExpired, m.env)
        #expect(s.note == nil)
    }

    // MARK: The bottom of the walk

    @Test func walkingOnFromTodayLooksBackUp() {
        var s = m.at(5)
        s.selected = m.deposit.id
        s.typing = "half a thought"
        s.orb = .open
        s.undoShowing = true
        let effects = s.act(.next, m.env)
        #expect(s.step == 6)
        #expect(s.level == nil)
        #expect(!s.sheetRaised)
        #expect(s.selected == nil)
        #expect(s.typing == nil)
        #expect(s.orb == .idle)
        #expect(s.undoShowing == false)
        #expect(effects == [.save])
    }

    @Test func stepsNeverPassSix() {
        var s = m.at(6)
        #expect(s.act(.next, m.env) == [])
        #expect(s.act(.next, m.env) == [])
        #expect(s.step == 6 && !s.ended)        // walking on at the bottom changes nothing
    }

    @Test func enteringTodayOffersTheCalendarOnlyWhenAsked() {
        var plain = m.at(4)
        _ = plain.act(.next, m.env)
        #expect(plain.step == 5)
        #expect(plain.calendarOffer == false)

        var asking = m.at(4)
        var env = m.env
        env.canAskCalendar = true
        _ = asking.act(.next, env)
        #expect(asking.step == 5)
        #expect(asking.calendarOffer)

        var early = m.at(3)
        _ = early.act(.next, env)
        #expect(early.calendarOffer == false)
    }

    /// S35: the calendar is offered by one point on the light, with no note.
    @Test func theCalendarOfferIsOnePoint() {
        var env = m.env
        env.canAskCalendar = true
        var s = m.at(4)
        let effects = s.act(.next, env)
        #expect(s.note == nil)
        #expect(effects == [.save])

        var plain = m.at(4)
        #expect(plain.act(.next, m.env) == [.save])
        #expect(plain.note == nil)

        _ = s.act(.back, m.env)
        #expect(s.note == nil && s.step == 4)
        _ = s.act(.next, env)

        // The point asks once; the answer takes the offer away.
        #expect(s.act(.calendar, env) == [.askCalendar])
        #expect(!s.calendarOffer)
        #expect(s.act(.calendar, env) == [])
        s.calendarOffer = true
        #expect(s.apply(.calendarAnswered, m.env) == [])
        #expect(!s.calendarOffer && s.note == nil)

        // Not on Today, or not offered: nothing.
        var week = m.at(4)
        week.calendarOffer = true
        #expect(week.act(.calendar, env) == [])
        var today = m.at(5)
        #expect(today.act(.calendar, env) == [])
    }

    /// With a plan the sheet peeks and its handle, "Take me to Today", ends the walk onto Today
    /// (2026-11-17, the owner: no separate "Show my day" and "Open Today").
    @Test func theHandleGoesToTodayOnlyAtTheEnding() {
        var s = m.at(6)
        #expect(!s.sheetRaised)
        #expect(s.endingTitle == WalkCopy.lookBack && s.sheetHandleLabel == WalkCopy.goToToday)
        #expect(s.apply(.sheetHandle, m.env) == [.timer(.finish, ms: nil), .end(.finished)])

        // Nothing planted to look back at: the sheet stands up, with no handle, only its own button.
        var bare = m.welcome()
        bare.step = 6
        #expect(bare.sheetRaised && bare.endingTitle == WalkCopy.heresToday && bare.sheetHandleLabel == nil)
        #expect(bare.apply(.sheetHandle, m.env) == [])
        #expect(bare.apply(.goToToday, m.env) == [.timer(.finish, ms: nil), .end(.finished)])

        var today = m.at(5)
        #expect(today.apply(.sheetHandle, m.env) == [])
        #expect(today.step == 5)
    }

    @Test func goToTodayEndsTheWalkFinishedFromTheEndingOnly() {
        var s = m.at(6)
        #expect(s.apply(.goToToday, m.env) == [.timer(.finish, ms: nil), .end(.finished)])
        var today = m.at(5)
        #expect(today.apply(.goToToday, m.env) == [])
        #expect(today.step == 5)
    }

    // MARK: The walk stands in one area (hand-walk fix pass, F1 to F3)

    /// Welcome, a depth, these areas kept in this order, then off the ground onto Year.
    private func offTheGround(_ depth: WalkDepth, keeping areas: [WalkArea]) -> WalkState {
        var s = m.welcome()
        _ = s.act(depth == .full ? .full : .quick, m.env)
        for a in areas { _ = s.apply(.areaTapped(a.id), m.env) }
        _ = s.act(.next, m.env)
        return s
    }

    @Test func aQuickStartStandsInItsFirstArea() {
        let s = offTheGround(.quick, keeping: [m.health, m.work])
        #expect(s.step == 1 && !s.ground)
        #expect(s.standing == m.health.id)
        #expect(WalkCopy.question(s, m.env.periods) == "What would make this a good year for your health?")
        #expect(WalkCopy.eyebrowCount(s) == nil)
        #expect(WalkCopy.eyebrow(s, m.env.periods) == "The year ahead")
    }

    @Test func theWholeYearCountsItsAreas() {
        var s = offTheGround(.full, keeping: [m.health, m.home, m.work])
        #expect(s.standing == m.health.id)
        #expect(WalkCopy.eyebrowCount(s) == "1 of 3")
        #expect(WalkCopy.eyebrow(s, m.env.periods) == "The year ahead")
        _ = s.plant("feel strong again", m.env)
        _ = s.act(.next, m.env)
        #expect(s.step == 1)
        #expect(s.standing == m.home.id)
        #expect(WalkCopy.eyebrowCount(s) == "2 of 3")
        // Only the whole-year walk's Year step counts.
        _ = s.act(.next, m.env)
        _ = s.act(.next, m.env)
        #expect(s.step == 2)
        #expect(WalkCopy.eyebrowCount(s) == nil)
    }

    @Test func tappingAnotherAreaWalksThere() {
        var s = offTheGround(.quick, keeping: [m.health, m.work])
        #expect(s.apply(.areaTapped(m.work.id), m.env) == [.save])
        #expect(s.standing == m.work.id)
        #expect(WalkCopy.question(s, m.env.periods) == "What would make this a good year for work?")
        let before = s
        #expect(s.apply(.areaTapped(m.work.id), m.env).isEmpty)
        #expect(s == before)
    }

    /// Each step below Year starts at the first column and goes through every goal above, wherever
    /// the walk stood when it came down (the owner, 2026-11-17); Today stays in the area stood in.
    @Test func goingDownStartsAtTheFirstColumnAndVisitsEveryGoal() throws {
        var s = offTheGround(.quick, keeping: [m.health, m.work])
        _ = s.apply(.areaTapped(m.work.id), m.env)
        _ = s.plant("ship the app", m.env)
        let ship = try #require(s.items.last)
        _ = s.apply(.areaTapped(m.health.id), m.env)
        _ = s.plant("sleep by ten", m.env)                     // planted last, in Health
        let sleep = try #require(s.items.last)
        _ = s.apply(.areaTapped(m.work.id), m.env)
        _ = s.act(.next, m.env)
        #expect(s.step == 2)
        #expect(s.focus[.season] == sleep.id && s.standing == m.health.id)
        #expect(s.tour == [ship.id])
        #expect(WalkCopy.nextLine(s, m.env.periods)?.text == "Next: Work")
        _ = s.act(.next, m.env)
        #expect(s.step == 2 && s.focus[.season] == ship.id && s.standing == m.work.id && s.tour.isEmpty)

        // A goal from before this walk is not a stop of a quick start; a whole-year walk stops at it.
        for (depth, stops) in [(WalkDepth.quick, [sleep.id]), (.full, [sleep.id, ship.id])] {
            var replay = s
            replay.depth = depth
            replay.items = replay.items.map { var item = $0; if item.id == ship.id { item.mine = false }; return item }
            _ = replay.act(.back, m.env)
            replay.focus[.season] = nil
            _ = replay.act(.next, m.env)
            #expect(replay.step == 2 && [replay.focus[.season]].compactMap { $0 } + replay.tour == stops, "\(depth)")
        }
    }

    @Test func walkingToAnAreaOnALowerStepFocusesItsGoal() {
        var s = m.at(3)
        s.focusArea = m.home.id
        s.focus[.month] = m.bathroomByFebruary.id
        #expect(s.apply(.areaTapped(m.health.id), m.env) == [.save])
        #expect(s.focus[.month] == m.lift.id)
        #expect(s.standing == m.health.id)
    }

    @Test func tappingTheGoalAboveSwitchesToTheNextOneHere() {
        var s = m.at(3, kept: [m.health.id, m.home.id, m.work.id])
        let launch = WalkItem(id: UUID(), level: .season, title: "Launch the shop", areaId: m.work.id)
        let hire = WalkItem(id: UUID(), level: .season, title: "Hire a helper", areaId: m.work.id)
        s.items += [launch, hire]
        s.focusArea = m.work.id
        s.focus[.month] = launch.id
        #expect(s.parentsHere().map(\.id) == [launch.id, hire.id])
        #expect(s.apply(.bannerTapped(launch.id), m.env) == [.save])
        #expect(s.focus[.month] == hire.id)
        #expect(s.standing == m.work.id)
        _ = s.apply(.bannerTapped(hire.id), m.env)
        #expect(s.focus[.month] == launch.id)                  // round again

        // With one goal above here, a tap changes nothing.
        var one = m.at(3)
        one.focusArea = m.health.id
        one.focus[.month] = m.lift.id
        let before = one
        #expect(one.apply(.bannerTapped(m.lift.id), m.env).isEmpty)
        #expect(one == before)
    }

    /// Review Focus 4: never a centre post with no way on.
    @Test func whenTheStandingAreaEmptiesTheWalkStillStandsSomewhere() {
        var s = m.welcome()
        s.step = 3
        s.kept = [m.health.id, m.work.id]
        let launch = WalkItem(id: UUID(), level: .season, title: "Launch the shop", areaId: m.work.id)
        s.items = [m.lift, launch]
        s.focusArea = m.work.id
        s.focus[.month] = launch.id

        s.items.removeAll { $0.id == launch.id }
        _ = s.apply(.noteExpired, m.env)
        #expect(s.standing == m.health.id)
        #expect(s.focus[.month] == m.lift.id)

        s.items.removeAll { $0.id == m.lift.id }
        _ = s.apply(.noteExpired, m.env)
        #expect(s.focus[.month] == nil)
        #expect(s.standing.map { s.kept.contains($0) } == true)
        #expect(WalkCopy.question(s, m.env.periods) == "What’s one thing for December?")
    }

    /// F4: on a lower step an area with a flag on this level but none above has a post; walking
    /// there stands there, about no goal above, and what is said there goes in that area.
    @Test func anAreaWithOnlyThisStepsFlagsCanBeStoodIn() {
        var s = m.at(3)
        let party = WalkItem(id: UUID(), level: .month, title: "Plan the party", areaId: m.people.id)
        s.items.append(party)
        s.focusArea = m.home.id
        s.focus[.month] = m.bathroomByFebruary.id
        #expect(s.apply(.areaTapped(m.people.id), m.env) == [.save])
        #expect(s.standing == m.people.id)
        #expect(s.focus[.month] == nil)
        #expect(WalkCopy.question(s, m.env.periods) == "What’s one thing for December?")
        _ = s.plant("send the invitations", m.env)
        #expect(s.items.last?.areaId == m.people.id && s.items.last?.parentId == nil)
    }

    /// Fix round 1: on a walk down only the walked goal's line gives a goal above, a tap on an
    /// area included; on a first walk the same tap takes that area's goal above.
    @Test func aWalkDownKeepsToItsOwnGoalsLine() {
        var first = m.at(3)
        first.focusArea = m.home.id
        first.focus[.month] = m.bathroomByFebruary.id
        var down = first
        down.walkingDown = [m.bathroom.id]
        _ = first.apply(.areaTapped(m.health.id), m.env)
        #expect(first.focus[.month] == m.lift.id)              // a first walk: Health's own goal above
        _ = down.apply(.areaTapped(m.health.id), m.env)
        #expect(down.focus[.month] == m.bathroomByFebruary.id) // never another goal's line
        #expect(down.standing == m.home.id)
    }

    @Test func backUpToTheYearKeepsTheArea() {
        var s = offTheGround(.quick, keeping: [m.health, m.work])
        _ = s.apply(.areaTapped(m.work.id), m.env)
        _ = s.plant("ship the app", m.env)
        _ = s.act(.next, m.env)
        #expect(s.step == 2 && s.standing == m.work.id)
        _ = s.act(.back, m.env)
        #expect(s.step == 1 && !s.ground)
        #expect(s.standing == m.work.id)
    }

    // MARK: Readings

    @Test func theLevelFollowsTheStep() {
        #expect(m.welcome().level == nil)
        #expect(m.at(1).level == .year)
        #expect(m.at(5).level == .today)
        #expect(m.at(6).level == nil)
        let s = m.at(4)
        #expect(s.items(on: .season).map(\.id) == [m.bathroomByFebruary.id, m.lift.id])
        #expect(s.item(m.tile.id) == m.tile)
        #expect(s.item(nil) == nil)
        #expect(s.area(m.home.id) == m.home)
        #expect(s.area(UUID()) == nil)
    }
}
