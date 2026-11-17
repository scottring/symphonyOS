#if os(iOS)
import XCTest

/// A full household sees none of the light pages, on any window this phone can show: the Today it
/// always had with its dock, the same at the Duo's outside-screen size, the old half-open display,
/// and a walk that ends on the old Today (Review Focus 5). Demo mode is `.full` unless `-SymphonyLight`
/// is passed. Taps only; nothing is typed.
final class FullHouseholdUnchangedUITests: XCTestCase {
    /// Identifiers only a light page carries.
    private let lightOnly = ["daily.today", "daily.bar.field", "daily.signpost", "daily.nav.week"]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(_ extra: [String]) -> (XCUIApplication, XCUIElementQuery) {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo"] + extra
        app.launchDemo()
        return (app, app.descendants(matching: .any))
    }

    private func assertNoLightPage(_ any: XCUIElementQuery, _ window: String, file: StaticString = #filePath,
                                   line: UInt = #line) {
        for id in lightOnly {
            XCTAssertFalse(any[id].exists, "\(id) in a full household (\(window))", file: file, line: line)
        }
    }

    /// The Today it always had, with the Routines tab in its dock.
    @MainActor func testTodayIsTheOneItAlwaysHad() throws {
        let (app, any) = launch([])
        XCTAssertTrue(app.buttons["Today. Switch horizon"].waitForExistence(timeout: 60), "not the old Today")
        XCTAssertTrue(app.buttons["Routines"].exists, "no Routines tab")
        assertNoLightPage(any, "phone")
    }

    /// The Duo's outside-screen size, pinned on this phone: the old one-column Today (pre-flight finding 11:
    /// the old glance shows only on the Duo's own outside screen).
    @MainActor func testTheOutsideScreensSizeKeepsTheOldToday() throws {
        let (app, any) = launch(["-TodaySize", "466x678"])
        XCTAssertTrue(app.buttons["Today. Switch horizon"].waitForExistence(timeout: 60), "not the old Today")
        assertNoLightPage(any, "466 × 678")
    }

    /// Set down half open: the old display, with Tell Symphony. Anchored on what only the old
    /// half-open display draws (`HalfOpenView`, which carries no identifier and must not change): its
    /// dinner card's "Tonight" heading together with its Cook (or Recipe) button; the old Today's dinner
    /// reads "Dinner tonight" and has neither.
    @MainActor func testHalfOpenKeepsTheOldDisplay() throws {
        let (app, any) = launch(["-HalfOpen", "laptop", "-TodaySize", "626x890"])
        let tonight = app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", "Tonight")).firstMatch
        XCTAssertTrue(tonight.waitForExistence(timeout: 60), "the old display's dinner heading is not there")
        let cook = app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Cook", "Recipe")).firstMatch
        XCTAssertTrue(cook.exists, "the old display's Cook button is not there")
        let tell = any.matching(NSPredicate(format: "label CONTAINS %@", "Tell Symphony")).firstMatch
        XCTAssertTrue(tell.exists, "no Tell Symphony on the old display")
        XCTAssertFalse(any["daily.halfOpen"].exists, "the light display in a full household")
        assertNoLightPage(any, "half open")
    }

    /// A full household's walk ends as it always did: on the old Today, with no bar.
    @MainActor func testTheWalkEndsOnTheOldToday() throws {
        let (app, any) = launch(["-SymphonyWalk", "-SymphonyWalkStep", "6"])
        let goToToday = any["walk.goToToday"]
        XCTAssertTrue(goToToday.waitForExistence(timeout: 60), "the walk's ending never showed")
        goToToday.tap()
        XCTAssertTrue(app.buttons["Today. Switch horizon"].waitForExistence(timeout: 30), "not on the old Today")
        XCTAssertFalse(any["daily.bar.field"].exists, "a light bar in a full household")
        assertNoLightPage(any, "after the walk")
    }

    /// A full household's phone still turns as it always did (F26 holds only a light household's).
    @MainActor func testAFullHouseholdStillTurns() throws {
        let (app, _) = launch([])
        XCTAssertTrue(app.buttons["Today. Switch horizon"].waitForExistence(timeout: 60), "not the old Today")
        addTeardownBlock { @MainActor in XCUIDevice.shared.orientation = .portrait }
        XCUIDevice.shared.orientation = .landscapeLeft
        Thread.sleep(forTimeInterval: 1)
        let window = app.windows.firstMatch.frame
        XCTAssertGreaterThan(window.width, window.height, "a full household's window did not turn: \(window.size)")
    }
}
#endif
