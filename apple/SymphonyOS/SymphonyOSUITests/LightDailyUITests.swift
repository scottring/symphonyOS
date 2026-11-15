#if os(iOS)
import XCTest

/// The light everyday pages, walked by taps through the real app on the demo store: from the walk's
/// end onto Today, Week and Month; a waiting walk's line on an empty Today; a tick that moves the
/// ring; and what VoiceOver is given to read where XCUITest can see it (labels, not speech). Taps
/// only: nothing is typed or spoken (text entry stalls this simulator). This target cannot see
/// `DailyCopy` or `WalkCopy`, so the words below are spelled out once and cross-check them.
final class LightDailyUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(_ arguments: [String]) -> (XCUIApplication, XCUIElementQuery) {
        let app = XCUIApplication()
        app.launchArguments = arguments
        app.launchDemo()
        return (app, app.descendants(matching: .any))
    }

    /// A light household's walk ends on light Today, with the signpost and the bar and no dock;
    /// the row of words then opens Week, and Month with the walk's own month goal on it, and Today again.
    @MainActor func testFromTheWalksEndToTodayWeekAndMonth() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk", "-SymphonyWalkStep", "6",
                                 "-SymphonyWalkSheet", "up"])
        let goToToday = any["walk.goToToday"]
        XCTAssertTrue(goToToday.waitForExistence(timeout: 60), "the walk's ending never showed")
        goToToday.tap()

        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 30), "not on light Today")
        XCTAssertTrue(any["daily.signpost"].waitForExistence(timeout: 10), "no signpost")
        XCTAssertTrue(any["daily.bar.field"].exists, "no field")
        XCTAssertTrue(any["daily.bar.light"].exists, "no light")
        XCTAssertFalse(app.buttons["Planner"].exists, "the dock is up")

        any["daily.nav.week"].tap()
        XCTAssertTrue(any["daily.week"].waitForExistence(timeout: 15), "Week did not open")

        any["daily.nav.month"].tap()
        XCTAssertTrue(any["daily.mountain.month"].waitForExistence(timeout: 15), "Month did not open")
        let goal = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Pick the tile and pay the deposit")).firstMatch
        XCTAssertTrue(goal.waitForExistence(timeout: 15), "the walk's month goal is not on Month")

        any["daily.nav.today"].tap()
        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 15), "Today did not open again")
    }

    /// Someone who left the walk part-way and has nothing at all still lands on a page with a way
    /// back into the walk, and a bar that works.
    @MainActor func testAWaitingWalkHasItsLineOnAnEmptyToday() throws {
        let (_, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailySeed", "empty",
                               "-SymphonyDailyState", "waiting"])
        XCTAssertTrue(any["daily.walkWaiting"].waitForExistence(timeout: 60), "no line for the waiting walk")
        XCTAssertTrue(any["daily.bar.field"].exists, "no field")
    }

    /// A tap on a row ticks it, and the ring says so.
    @MainActor func testATaskIsTickedAndTheRingMoves() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily"])
        let ring = any["daily.ring"]
        XCTAssertTrue(ring.waitForExistence(timeout: 60), "no ring")
        let before = ring.label
        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Tour the gym on Main Street")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10), "no row for the gym")
        row.tap()
        let moved = NSPredicate(format: "label != %@", before)
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: moved, evaluatedWith: ring)], timeout: 10), .completed,
                       "the ring still reads \(before)")
    }

    // MARK: What VoiceOver is given

    /// The bar's field is always read by its whole sentence, even where the field shows fewer words:
    /// on the real Duo outside screen the page is 382 wide (the 466-point window less the system's
    /// 84-point column, Task 17), where Month's field shows "Add a goal" (`-TodaySize 382x678`; at the
    /// board's own 466 the field is wide enough for the whole sentence); and the phone's own window at
    /// two text sizes.
    @MainActor func testTheFieldIsReadByItsWholeSentence() throws {
        let launches: [[String]] = [["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"],
                                    ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"],
                                    ["-TodaySize", "382x678"]]
        for extra in launches {
            let size = extra.joined(separator: " ")
            let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                                     "-SymphonyDailyPage", "month"] + extra)
            XCTAssertTrue(any["daily.mountain.month"].waitForExistence(timeout: 60), "never reached Month")
            let field = any["daily.bar.field"]
            XCTAssertTrue(field.waitForExistence(timeout: 15), "no field")
            XCTAssertEqual(field.label, "Add a goal for November", "at \(size)")
            if extra.first == "-TodaySize" {
                // The narrow field shows the short form: the label above is not just what is shown.
                XCTAssertEqual(field.placeholderValue, "Add a goal", "the narrow field does not show the short form")
            }
            app.terminate()
        }
    }

    /// Week's days are read by their whole names (today's says so), never "TUE, 10".
    @MainActor func testWeeksDaysAreReadByTheirWholeNames() throws {
        let (_, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailyPage", "week"])
        XCTAssertTrue(any["daily.week"].waitForExistence(timeout: 60), "never reached Week")
        let today = any.matching(NSPredicate(format: "label == %@", "Today, Tuesday, 10 November")).firstMatch
        XCTAssertTrue(today.waitForExistence(timeout: 15), "today's day is not read by its whole name")
        XCTAssertTrue(any.matching(NSPredicate(format: "label == %@", "Wednesday, 11 November")).firstMatch.exists,
                      "Wednesday is not read by its whole name")
        // XCUITest also lists the label's own words ("TUE", "10") under it, which VoiceOver does not read
        // (`children: .ignore`); what is gone is the element that read them together.
        XCTAssertFalse(any.matching(NSPredicate(format: "label == %@", "TUE, 10")).firstMatch.exists,
                       "a day is still read by its short label")
    }

    // MARK: Held upright (F26)

    /// Turns the phone, and turns it back upright when the test ends, passed or failed, so the next
    /// test and the simulator are left upright.
    @MainActor private func turnSideways() {
        addTeardownBlock { @MainActor in XCUIDevice.shared.orientation = .portrait }
        XCUIDevice.shared.orientation = .landscapeLeft
        Thread.sleep(forTimeInterval: 1)
    }

    /// A light household's phone stays upright: turned on Month, the light page is still there, the
    /// old Today with its Tell Symphony bar never takes its place, and the window stays tall.
    @MainActor func testTurningThePhoneKeepsTheLightPage() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                                 "-SymphonyDailyPage", "month"])
        XCTAssertTrue(any["daily.mountain.month"].waitForExistence(timeout: 60), "never reached Month")
        turnSideways()
        XCTAssertTrue(any["daily.mountain.month"].exists, "Month gave way when the phone turned")
        XCTAssertFalse(any.matching(NSPredicate(format: "label CONTAINS %@", "Tell Symphony")).firstMatch.exists,
                       "the old Today's Tell Symphony is up")
        let window = app.windows.firstMatch.frame
        XCTAssertGreaterThan(window.height, window.width, "the window turned: \(window.size)")
    }

    /// The walk, turned, stays upright too: its Next is still there to tap, not a strip scaled sideways.
    @MainActor func testTurningThePhoneKeepsTheWalkUpright() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk", "-SymphonyWalkStep", "1"])
        XCTAssertTrue(any["walk.next"].waitForExistence(timeout: 60), "the walk never showed its Next")
        turnSideways()
        XCTAssertTrue(any["walk.next"].isHittable, "the walk's Next cannot be tapped turned")
        let window = app.windows.firstMatch.frame
        XCTAssertGreaterThan(window.height, window.width, "the window turned: \(window.size)")
    }

    /// Signing out of a light household lets go of the hold: the sign-in screen turns, as it always
    /// did, so whoever signs in next (a full household too) is never held upright there.
    @MainActor func testTheSignInScreenTurnsAfterALightHouseholdSignsOut() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily"])
        let more = any["daily.bar.more"]
        XCTAssertTrue(more.waitForExistence(timeout: 60), "no More beside the bar")
        more.tap()
        let signOut = app.buttons["Sign Out"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 10), "no Sign Out in More")
        for _ in 0..<4 where !signOut.isHittable { app.swipeUp() }
        signOut.tap()
        XCTAssertTrue(app.buttons["Sign In"].waitForExistence(timeout: 15), "not signed out")
        turnSideways()
        let window = app.windows.firstMatch.frame
        XCTAssertGreaterThan(window.width, window.height, "the sign-in screen is still held upright: \(window.size)")
    }
}
#endif
