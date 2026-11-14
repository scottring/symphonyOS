import XCTest

/// The light edition's dock and hidden features. Demo mode is `.full` unless
/// `-SymphonyLight` is also passed. No typing (text entry stalls the simulator).
final class LightEditionUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(light: Bool) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo"] + (light ? ["-SymphonyLight"] : [])
        app.launch()
        // A light household lands on light Today (`daily.today`); a full one on the Today it always had.
        let today = light ? app.descendants(matching: .any)["daily.today"] : app.buttons["Today. Switch horizon"]
        XCTAssertTrue(today.waitForExistence(timeout: 60), "never reached Today")
        return app
    }

    @MainActor func testLightDockHasPlannerInboxAndMoreOnly() throws {
        let app = launch(light: true)
        XCTAssertTrue(app.buttons["Planner"].exists)
        XCTAssertTrue(app.buttons["Inbox"].exists)
        XCTAssertTrue(app.buttons["Add"].exists)
        XCTAssertTrue(app.buttons["More"].exists)
        XCTAssertFalse(app.buttons["Routines"].exists)
        XCTAssertFalse(app.staticTexts["Dinner tonight"].exists)
        XCTAssertFalse(app.buttons["Life area: All"].exists)

        // More lists no Projects, Lists or Contacts.
        app.buttons["More"].tap()
        XCTAssertTrue(app.buttons["Settings"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Projects"].exists)
        XCTAssertFalse(app.buttons["Lists"].exists)
        XCTAssertFalse(app.buttons["Contacts"].exists)

        // The Add sheet has the capture bar alone: no photographed pages.
        app.buttons["Add"].tap()
        XCTAssertTrue(app.navigationBars["Add"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Snap a page"].exists)
        XCTAssertFalse(app.buttons["Choose photo"].exists)
    }

    @MainActor func testFullDockStillHasRoutines() throws {
        let app = launch(light: false)
        XCTAssertTrue(app.buttons["Routines"].exists)
        XCTAssertTrue(app.staticTexts["Dinner tonight"].exists, "so the light absence is not for the wrong reason")
        XCTAssertTrue(app.buttons["Life area: All"].exists)
        app.buttons["More"].tap()
        XCTAssertTrue(app.buttons["Projects"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Lists"].exists)
        XCTAssertTrue(app.buttons["Contacts"].exists)
        app.buttons["Add"].tap()
        XCTAssertTrue(app.buttons["Snap a page"].waitForExistence(timeout: 5))
    }
}
