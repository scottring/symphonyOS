#if os(iOS)
import XCTest

/// The walk, tapped through the real app on the demo store. Taps only: nothing is
/// typed or spoken (text entry stalls this simulator). This target cannot see
/// `WalkCopy`, so the strings below are spelled out once and cross-check it.
final class WalkUITests: XCTestCase {
    private let welcome = "Let’s start up high and walk down to today."

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Waits for the element, then taps it.
    @MainActor private func tap(_ element: XCUIElement, _ name: String, timeout: TimeInterval = 15,
                     file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "never found \(name)", file: file, line: line)
        element.tap()
    }

    @MainActor func testAQuickStartPlantsAFlag() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk"]
        app.launch()
        XCTAssertTrue(app.staticTexts[welcome].waitForExistence(timeout: 60), "the walk never opened")

        let orb = app.buttons["walk.orb"]
        tap(orb, "the light")
        tap(app.buttons["Quick start"], "Quick start")
        tap(app.buttons["Health"], "the Health peak")
        tap(orb, "the light")
        tap(app.buttons["Plant goals"], "Plant goals")
        tap(orb, "the light")
        tap(app.buttons["Examples"], "Examples")
        tap(app.buttons["Example: Run a 5K, tap to make it yours"], "the Run a 5K example")

        let planted = app.buttons["Year: Run a 5K, tap to move or pull up"]
        XCTAssertTrue(planted.waitForExistence(timeout: 15), "the example was not planted")
        XCTAssertTrue(app.buttons["Undo"].exists, "no Undo after planting")
        planted.tap()
        XCTAssertTrue(app.buttons["Pull it up"].waitForExistence(timeout: 15), "selecting the flag offered no Pull it up")
    }

    @MainActor func testAFullHouseholdSeesNoWalkUntilItAsks() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo"]
        app.launch()
        let today = app.buttons["Today. Switch horizon"]
        XCTAssertTrue(today.waitForExistence(timeout: 60), "never reached Today")
        XCTAssertFalse(app.staticTexts[welcome].waitForExistence(timeout: 5), "the walk started by itself in a full household")

        tap(app.buttons["More"], "More")
        tap(app.buttons["Settings"], "Settings")
        tap(app.buttons["Walk the mountain again"], "Walk the mountain again")
        XCTAssertTrue(app.staticTexts[welcome].waitForExistence(timeout: 30), "the replay did not open the walk")

        tap(app.buttons["walk.orb"], "the light")
        tap(app.buttons["Not now"], "Not now")
        // XCUITest still lists the app under the walk, so the walk's going is checked too.
        XCTAssertTrue(app.buttons["walk.orb"].waitForNonExistence(timeout: 30), "Not now did not leave the walk")
        XCTAssertTrue(today.waitForExistence(timeout: 30), "Today is not back")
    }
}
#endif
