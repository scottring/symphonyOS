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

    // MARK: Set down half open (Task 19)

    private func launchHalfOpen(_ extra: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-HalfOpen", "laptop",
                               "-TodaySize", "626x890"] + extra
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["daily.halfOpen"].waitForExistence(timeout: 60),
                      "no light half-open display")
        return app
    }

    /// A light household set down half open gets its own display, with no page drawn under it. The
    /// half you look at takes no touch: on the 28th the `quiet` seed's sign ("November ends on
    /// Monday") would open Month on Today, but here a drag and a tap leave it and the display as
    /// they were. A tick on the half you touch counts one more done.
    @MainActor func testHalfOpenSignTakesNoTouchAndATickCounts() throws {
        let app = launchHalfOpen(["-SymphonyDailyNow", "2026-11-28", "-SymphonyDailySeed", "quiet"])
        let any = app.descendants(matching: .any)
        let sign = any["daily.halfOpen.sign"]
        XCTAssertTrue(sign.waitForExistence(timeout: 15), "no sign on the 28th")
        XCTAssertTrue(sign.label.contains("November"), "not the month's sign: \(sign.label)")
        XCTAssertFalse(any["daily.today"].exists, "the page is drawn under the display")
        XCTAssertEqual(any.matching(identifier: "daily.bar.light").count, 1, "a second bar under the display")

        let start = sign.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5))
        start.press(forDuration: 0.15, thenDragTo: start.withOffset(CGVector(dx: 160, dy: 0)))
        sign.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(sign.exists, "a drag or a tap put the sign away")
        XCTAssertTrue(any["daily.halfOpen"].exists, "a drag or a tap left the display")

        let done = any["daily.halfOpen.done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        XCTAssertEqual(done.label, "1 done")
        any.matching(identifier: "daily.halfOpen.row").firstMatch.tap()
        let two = NSPredicate(format: "label == %@", "2 done")
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: two, evaluatedWith: done)], timeout: 5), .completed,
                       "a tick did not count")
    }

    /// The Lock Screen's Tell Symphony (`symphony://tell`) while the display is up: this display's
    /// bar listens, in sight; no sheet, and no bar under it. (`hear`: a stand-in listener, so no
    /// permission prompt; nobody speaks to the simulator.)
    @MainActor func testATellOnTheHalfOpenDisplayListensThere() throws {
        let app = launchHalfOpen(["-SymphonyDailyNow", "2026-11-10", "-SymphonyDailyState", "hear"])
        let any = app.descendants(matching: .any)
        let light = any["daily.bar.light"]
        XCTAssertTrue(light.waitForExistence(timeout: 15))
        XCTAssertEqual(light.label, "Speak it")
        app.open(try XCTUnwrap(URL(string: "symphony://tell")))
        let listening = NSPredicate(format: "label == %@", "Add what you said")
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: listening, evaluatedWith: light)], timeout: 10), .completed,
                       "the display's bar did not listen")
        XCTAssertTrue(any["daily.halfOpen"].exists)
        XCTAssertFalse(any["daily.today"].exists)
        XCTAssertEqual(any.matching(identifier: "daily.bar.light").count, 1)
    }

    /// A full household set down half open keeps the old display, dinner and all.
    @MainActor func testAFullHouseholdKeepsTheOldHalfOpenDisplay() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-HalfOpen", "laptop", "-TodaySize", "626x890"]
        app.launch()
        let tonight = app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", "Tonight")).firstMatch
        XCTAssertTrue(tonight.waitForExistence(timeout: 60), "the old display's dinner is not there")
        XCTAssertFalse(app.descendants(matching: .any)["daily.halfOpen"].exists)
    }
}
