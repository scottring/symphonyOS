import XCTest

/// The light edition's bar (in place of the dock) and hidden features. Demo mode is `.full` unless
/// `-SymphonyLight` is also passed. No typing (text entry stalls the simulator).
final class LightEditionUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(light: Bool) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo"] + (light ? ["-SymphonyLight", "-SymphonyDaily"] : [])
        app.launch()
        // A light household lands on light Today (`daily.today`); a full one on the Today it always had.
        let today = light ? app.descendants(matching: .any)["daily.today"] : app.buttons["Today. Switch horizon"]
        XCTAssertTrue(today.waitForExistence(timeout: 60), "never reached Today")
        return app
    }

    /// Light Today has the bar, with Inbox and More beside it, and no dock.
    @MainActor func testLightHasTheBarAndNoDock() throws {
        let app = launch(light: true)
        let any = app.descendants(matching: .any)
        XCTAssertTrue(any["daily.bar.field"].waitForExistence(timeout: 15), "no field")
        XCTAssertTrue(any["daily.bar.light"].exists, "no light")
        XCTAssertTrue(any["daily.bar.inbox"].exists, "no Inbox")
        XCTAssertTrue(any["daily.bar.more"].exists, "no More")
        XCTAssertFalse(app.buttons["Planner"].exists)
        XCTAssertFalse(app.buttons["Routines"].exists)
        XCTAssertFalse(app.buttons["Add"].exists)
        XCTAssertFalse(app.staticTexts["Dinner tonight"].exists)
        XCTAssertFalse(app.buttons["Life area: All"].exists)

        // More opens over the page and lists no Projects, Lists or Contacts.
        any["daily.bar.more"].tap()
        XCTAssertTrue(app.buttons["Settings"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Projects"].exists)
        XCTAssertFalse(app.buttons["Lists"].exists)
        XCTAssertFalse(app.buttons["Contacts"].exists)
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
