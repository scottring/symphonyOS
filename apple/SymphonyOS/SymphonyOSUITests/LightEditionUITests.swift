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

    /// A sideways drag on the signpost puts it away and does not follow it. On the 28th the
    /// `quiet` seed shows one sign, "November ends on Monday", whose tap would open Month's page;
    /// after the drag the sign is gone and Today is still the page.
    @MainActor func testASwipeOnlyPutsTheSignAway() throws {
        let (app, sign) = launchOnTheMonthsLastDays()
        let any = app.descendants(matching: .any)

        let start = sign.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5))
        start.press(forDuration: 0.15, thenDragTo: start.withOffset(CGVector(dx: 160, dy: 0)))

        XCTAssertTrue(sign.waitForNonExistence(timeout: 10), "the drag did not put the sign away")
        XCTAssertTrue(any["daily.today"].exists, "the drag also followed the sign off Today")
        XCTAssertTrue(any["daily.nav.today"].isSelected, "Today is no longer the page")
    }

    /// The same sign, tapped, is followed: Today gives way to Month's page.
    @MainActor func testATapFollowsTheSign() throws {
        let (app, sign) = launchOnTheMonthsLastDays()
        sign.tap()
        XCTAssertTrue(app.descendants(matching: .any)["daily.today"].waitForNonExistence(timeout: 10),
                      "a tap did not follow the sign")
    }

    private func launchOnTheMonthsLastDays() -> (XCUIApplication, XCUIElement) {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-28",
                               "-SymphonyDailySeed", "quiet"]
        app.launch()
        let sign = app.descendants(matching: .any)["daily.signpost"]
        XCTAssertTrue(sign.waitForExistence(timeout: 60), "no sign on the 28th")
        XCTAssertTrue(sign.label.contains("November"), "not the month's sign: \(sign.label)")
        return (app, sign)
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
