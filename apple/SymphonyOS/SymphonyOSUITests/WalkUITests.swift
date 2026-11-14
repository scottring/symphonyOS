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

    /// The first step that listens teaches the light once; a tap anywhere but the light puts it away.
    @MainActor private func dismissTheLesson(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let lesson = app.staticTexts["Press and hold the light, and say it out loud."]
        XCTAssertTrue(lesson.waitForExistence(timeout: 15), "the light was not taught", file: file, line: line)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
        XCTAssertTrue(lesson.waitForNonExistence(timeout: 15), "a tap did not put the lesson away", file: file, line: line)
    }

    @MainActor func testAQuickStartPlantsAFlag() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk"]
        app.launchDemo()
        XCTAssertTrue(app.staticTexts[welcome].waitForExistence(timeout: 60), "the walk never opened")

        // Welcome: the light itself is the quick start.
        let orb = app.buttons["walk.orb"]
        XCTAssertTrue(app.buttons["Plan my whole year"].exists && app.buttons["Not now"].exists, "Welcome's other choices")
        tap(orb, "the light (Quick start)")
        tap(app.buttons["Health"], "the Health area")
        tap(app.buttons["Next: your goals"], "the Next line")
        dismissTheLesson(app)
        tap(app.buttons["More choices"], "More")
        tap(app.buttons["Show examples"], "Show examples")
        tap(app.buttons["Example: Run a 5K, tap to make it yours"], "the Run a 5K example")

        let planted = app.buttons["Year: Run a 5K, tap to move or remove"]
        XCTAssertTrue(planted.waitForExistence(timeout: 15), "the example was not planted")
        XCTAssertTrue(app.buttons["Undo"].exists, "no Undo after planting")
        // Once something is added the line under the light names where it goes: "Next: this <season>".
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Next: this ")).firstMatch.exists,
                      "no Next line once something was added")
        planted.tap()
        XCTAssertTrue(app.buttons["Remove"].waitForExistence(timeout: 15), "selecting the flag offered no Remove")
    }

    @MainActor func testAFullHouseholdSeesNoWalkUntilItAsks() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo"]
        app.launchDemo()
        let today = app.buttons["Today. Switch horizon"]
        XCTAssertTrue(today.waitForExistence(timeout: 60), "never reached Today")
        XCTAssertFalse(app.staticTexts[welcome].waitForExistence(timeout: 5), "the walk started by itself in a full household")

        tap(app.buttons["More"], "More")
        tap(app.buttons["Settings"], "Settings")
        tap(app.buttons["Walk the mountain again"], "Walk the mountain again")
        XCTAssertTrue(app.staticTexts[welcome].waitForExistence(timeout: 30), "the replay did not open the walk")

        tap(app.buttons["Not now"], "Not now")
        // XCUITest still lists the app under the walk, so the walk's going is checked too.
        XCTAssertTrue(app.buttons["walk.orb"].waitForNonExistence(timeout: 30), "Not now did not leave the walk")
        XCTAssertTrue(today.waitForExistence(timeout: 30), "Today is not back")
    }

    /// Leave for now on Year: Today, with the quiet line; the walk does not come back by itself;
    /// Settings picks it back up on Year, with the flag still there.
    @MainActor func testLeavingForNowAndPickingItBackUp() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk"]
        app.launchDemo()
        XCTAssertTrue(app.staticTexts[welcome].waitForExistence(timeout: 60), "the walk never opened")
        let orb = app.buttons["walk.orb"]
        tap(orb, "the light (Quick start)")
        tap(app.buttons["Health"], "the Health area")
        tap(app.buttons["Next: your goals"], "the Next line")
        dismissTheLesson(app)
        tap(orb, "the light")
        tap(app.buttons["Show examples"], "Show examples")
        tap(app.buttons["Example: Run a 5K, tap to make it yours"], "the Run a 5K example")
        XCTAssertTrue(app.buttons["Year: Run a 5K, tap to move or remove"].waitForExistence(timeout: 15))

        tap(orb, "the light")
        tap(app.buttons["Leave for now"], "Leave for now")
        XCTAssertTrue(orb.waitForNonExistence(timeout: 30), "Leave for now did not leave the walk")
        // A light household's Today is the light page.
        XCTAssertTrue(app.descendants(matching: .any)["daily.today"].waitForExistence(timeout: 30), "Today is not back")
        XCTAssertTrue(app.buttons["Your walk is waiting. Pick it back up."].waitForExistence(timeout: 15),
                      "no line on Today for the waiting walk")
        XCTAssertFalse(orb.waitForExistence(timeout: 3), "the walk came back by itself")

        tap(app.buttons["More"], "More")
        tap(app.buttons["Settings"], "Settings")
        tap(app.buttons["Pick the walk back up"], "Pick the walk back up")
        XCTAssertTrue(orb.waitForExistence(timeout: 30), "the walk was not picked back up")
        XCTAssertTrue(app.staticTexts["What would make the year ahead a good one?"].waitForExistence(timeout: 15),
                      "not back on Year")
        XCTAssertTrue(app.buttons["Year: Run a 5K, tap to move or remove"].waitForExistence(timeout: 15),
                      "the flag planted before leaving is gone")
        XCTAssertFalse(app.staticTexts["Press and hold the light, and say it out loud."].exists, "taught again on resume")
    }
}
#endif
