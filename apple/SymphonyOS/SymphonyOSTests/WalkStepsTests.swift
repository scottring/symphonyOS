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
        #expect(s.act(.notNow, m.env) == [.end(.left)])
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

    @Test func quickWalksOneGoalDown() {
        // Given a quick walk on Year with "Feel strong again" planted last…
        var s = m.at(1)
        s.lastPlanted[.year] = m.strong.id
        // …walking on focuses it on Season, so the next flag links to it.
        let effects = s.act(.next, m.env)
        #expect(s.step == 2)
        #expect(s.focus[.season] == m.strong.id)
        #expect(effects == [.save])

        // With nothing planted on Year there is nothing to focus.
        var empty = m.at(1)
        empty.items = []
        _ = empty.act(.next, m.env)
        #expect(empty.step == 2)
        #expect(empty.focus[.season] == nil)
    }

    @Test func quickLeavesTheGroundWithNoPeakFocused() {
        var s = m.welcome()
        _ = s.act(.quick, m.env)
        _ = s.apply(.areaTapped(m.health.id), m.env)
        _ = s.apply(.areaTapped(m.home.id), m.env)
        let effects = s.act(.next, m.env)
        #expect(!s.ground)
        #expect(s.step == 1)
        #expect(s.focusArea == nil)
        #expect(s.tour.isEmpty)
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
        #expect(s.focusArea == nil)
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

    @Test func wholeYearFocusesTheLastPlantedFromMonthDown() {
        var s = m.at(2, depth: .full)
        s.lastPlanted[.season] = m.lift.id
        _ = s.act(.next, m.env)
        #expect(s.step == 3)
        #expect(s.focus[.month] == m.lift.id)

        s.items.append(m.tile)
        s.lastPlanted[.month] = m.tile.id
        _ = s.act(.next, m.env)
        #expect(s.step == 4)
        #expect(s.focus[.week] == m.tile.id)

        s.items.append(m.chooseTile)
        s.lastPlanted[.week] = m.chooseTile.id
        _ = s.act(.next, m.env)
        #expect(s.step == 5)
        #expect(s.focus[.today] == m.chooseTile.id)
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
        _ = s.apply(.bannerTapped(m.lift.id), m.env)
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

        _ = s.act(.back, m.env)                 // up to Year: the tour is over, the whole range in view
        #expect(s.step == 1)
        #expect(!s.ground)
        #expect(s.focusArea == nil)
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

    @Test func nudgingToTheLastStopThenWalkingOnLeavesTheStep() {
        var s = leftTheGround(keeping: [m.home, m.health, m.people])
        #expect(s.focusArea == m.home.id && s.tour == [m.health.id, m.people.id])
        _ = s.act(.nudge, m.env)
        _ = s.act(.nudge, m.env)
        #expect(s.focusArea == m.people.id)
        #expect(s.tour.isEmpty)
        _ = s.act(.next, m.env)
        #expect(s.step == 2)
    }

    @Test func nudgingToAMiddleStopThenWalkingOnGoesToTheStopAfterIt() {
        var s = leftTheGround(keeping: [m.home, m.health, m.people])
        _ = s.act(.nudge, m.env)
        #expect(s.focusArea == m.health.id)
        #expect(s.tour == [m.people.id])
        _ = s.act(.next, m.env)
        #expect(s.step == 1 && s.focusArea == m.people.id)

        // The same on the Season tour, by tapping a parent flag.
        var season = m.at(1, depth: .full)
        _ = season.act(.next, m.env)            // Feel strong again; Finish the bathroom and More slow weekends ahead
        _ = season.apply(.bannerTapped(m.bathroom.id), m.env)
        #expect(season.tour == [m.weekends.id])
        _ = season.act(.next, m.env)
        #expect(season.step == 2 && season.focus[.season] == m.weekends.id)
        _ = season.act(.next, m.env)
        #expect(season.step == 3)
    }

    @Test func aReleasedFocusKeepsTheStopsLeft() {
        var s = leftTheGround(keeping: [m.home, m.health, m.people])
        _ = s.apply(.areaTapped(m.home.id), m.env)  // back to the whole range
        #expect(s.focusArea == nil)
        #expect(s.tour == [m.health.id, m.people.id])
        _ = s.act(.next, m.env)
        #expect(s.focusArea == m.health.id)
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

    // MARK: Peaks and parent flags

    @Test func tappingAPeakZoomsAndTappingAgainReleases() {
        var s = m.at(1)
        let zoom = s.apply(.areaTapped(m.home.id), m.env)
        #expect(s.focusArea == m.home.id)
        #expect(zoom == [.save])                // no sound on Year

        _ = s.apply(.areaTapped(m.people.id), m.env)
        #expect(s.focusArea == m.people.id)

        _ = s.apply(.areaTapped(m.people.id), m.env)
        #expect(s.focusArea == nil)
        #expect(s.kept == [m.health.id, m.home.id, m.people.id])   // tapping off the ground never keeps or lets go
    }

    @Test func aPeakNotKeptCannotBeFocused() {
        var s = m.at(1)
        #expect(s.apply(.areaTapped(m.work.id), m.env).isEmpty)
        #expect(s.focusArea == nil)
        #expect(!s.kept.contains(m.work.id))
    }

    @Test func peaksAreInertBelowTheYear() {
        for step in 2...6 {
            var s = m.at(step)
            let before = s
            #expect(s.apply(.areaTapped(m.home.id), m.env).isEmpty)
            #expect(s == before)
        }
    }

    @Test func tappingAParentFlagFocusesIt() {
        var s = m.at(2)
        let on = s.apply(.bannerTapped(m.bathroom.id), m.env)
        #expect(s.focus[.season] == m.bathroom.id)
        #expect(on == [.save])

        _ = s.apply(.bannerTapped(m.strong.id), m.env)
        #expect(s.focus[.season] == m.strong.id)

        _ = s.apply(.bannerTapped(m.strong.id), m.env)
        #expect(s.focus[.season] == nil)

        // A flag two levels up is not a parent here.
        var month = m.at(3)
        #expect(month.apply(.bannerTapped(m.strong.id), m.env).isEmpty)
        #expect(month.focus[.month] == nil)
    }

    // MARK: Nudge and examples

    @Test func nudgeCyclesAreasInKeptOrder() {
        var s = m.at(1, kept: [m.people.id, m.health.id, m.home.id])
        _ = s.act(.nudge, m.env)
        #expect(s.focusArea == m.people.id)
        _ = s.act(.nudge, m.env)
        #expect(s.focusArea == m.health.id)
        let third = s.act(.nudge, m.env)
        #expect(s.focusArea == m.home.id)
        #expect(third == [.save])
        _ = s.act(.nudge, m.env)
        #expect(s.focusArea == m.people.id)

        var none = m.at(1, kept: [])
        #expect(none.act(.nudge, m.env).isEmpty)
        #expect(none.focusArea == nil)
    }

    @Test func nudgeCyclesParents() {
        var s = m.at(3)                         // parents: Bathroom done by February, Lift twice a week
        _ = s.act(.nudge, m.env)
        #expect(s.focus[.month] == m.bathroomByFebruary.id)
        _ = s.act(.nudge, m.env)
        #expect(s.focus[.month] == m.lift.id)
        _ = s.act(.nudge, m.env)
        #expect(s.focus[.month] == m.bathroomByFebruary.id)

        var bare = m.at(2)
        bare.items = []
        #expect(bare.act(.nudge, m.env).isEmpty)
        #expect(bare.focus[.season] == nil)
    }

    @Test func seasonNudgeFollowsTheTourOrder() {
        // Year goals planted out of column order: People, then Health, then Home.
        var s = m.at(2)
        s.items = [m.weekends, m.strong, m.bathroom]
        _ = s.act(.nudge, m.env)
        #expect(s.focus[.season] == m.strong.id)                       // Health is the first column
        _ = s.act(.nudge, m.env)
        #expect(s.focus[.season] == m.bathroom.id)
        _ = s.act(.nudge, m.env)
        #expect(s.focus[.season] == m.weekends.id)
        _ = s.act(.nudge, m.env)
        #expect(s.focus[.season] == m.strong.id)
    }

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
        _ = s.act(.examples, m.env)
        #expect(s.examplesOn == [3, 4])
        _ = s.act(.examples, m.env)
        #expect(s.examplesOn == [3])

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
        #expect(s.sheetOpen == false)
        #expect(s.selected == nil)
        #expect(s.typing == nil)
        #expect(s.orb == .idle)
        #expect(s.undoShowing == false)
        #expect(effects == [.save])
    }

    @Test func stepsNeverPassSix() {
        var s = m.at(6)
        s.sheetOpen = true
        #expect(s.act(.next, m.env) == [])
        #expect(s.act(.next, m.env) == [])
        #expect(s.step == 6)
        #expect(s.sheetOpen)                    // walking on at the bottom changes nothing
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
