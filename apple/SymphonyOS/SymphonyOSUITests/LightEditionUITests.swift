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

    /// "Walk it down" on a Year flag opens the walk on Season, asking about that flag; Leave for
    /// now closes it and Year is there again, with no walk left waiting. (That it teaches nothing
    /// is `DailyWalkDownTests`': the lesson line has no identifier, and this target cannot read
    /// `WalkCopy`, so a check here would spell its words out.)
    @MainActor func testWalkItDownOpensSeasonAndComesBackToYear() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailyPage", "year", "-SymphonyDailyState", "select"]
        app.launch()
        let any = app.descendants(matching: .any)
        let year = any["daily.mountain.year"]
        XCTAssertTrue(year.waitForExistence(timeout: 60), "never reached Year")
        let walkItDown = any["daily.panel"].buttons["Walk it down"]
        XCTAssertTrue(walkItDown.waitForExistence(timeout: 15), "the chosen flag offers no Walk it down")
        walkItDown.tap()

        let orb = app.buttons["walk.orb"]
        XCTAssertTrue(orb.waitForExistence(timeout: 30), "the walk did not open")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "What part of “")).firstMatch
            .waitForExistence(timeout: 15), "not the Season question about the flag")

        orb.tap()
        let leave = app.buttons["Leave for now"]
        XCTAssertTrue(leave.waitForExistence(timeout: 15), "no Leave for now")
        leave.tap()
        XCTAssertTrue(orb.waitForNonExistence(timeout: 30), "Leave for now did not close it")
        XCTAssertTrue(year.waitForExistence(timeout: 15), "Year is not there again")
        any["daily.nav.today"].tap()
        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 15), "Today did not open")
        XCTAssertFalse(any["daily.walkWaiting"].waitForExistence(timeout: 3),
                       "the walk-down was stored as a waiting walk")
    }

    /// The handle on Today's sheet lowers it over the whole plan, with no bar; a tap anywhere on
    /// the lowered sheet raises it, and so does a drag up on it.
    @MainActor func testTheHandleShowsTheWholePlanAndComesBack() throws {
        let app = launch(light: true)
        let any = app.descendants(matching: .any)
        let handle = any["daily.lookBack"]
        let field = any["daily.bar.field"]
        XCTAssertTrue(handle.waitForExistence(timeout: 15), "no handle")
        let raisedLabel = handle.label
        handle.tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 15), "the bar is still up over the plan")
        let strip = any["daily.lookBack"]
        XCTAssertTrue(strip.waitForExistence(timeout: 15), "no way back")
        XCTAssertNotEqual(strip.label, raisedLabel, "the lowered sheet does not say what raising it shows")
        XCTAssertGreaterThanOrEqual(strip.frame.height, 44)
        attach(app, "whole plan")

        // A tap away from the handle's words, low on the strip, raises it.
        strip.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.8)).tap()
        XCTAssertTrue(field.waitForExistence(timeout: 15), "a tap on the lowered sheet did not raise it")
        XCTAssertEqual(any["daily.lookBack"].label, raisedLabel)
        XCTAssertFalse(app.buttons["walk.orb"].exists, "a walk opened")
        attach(app, "Today again")

        // Lowered again, a drag up raises it too.
        any["daily.lookBack"].tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 15), "the sheet did not lower again")
        let start = any["daily.lookBack"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -160)))
        XCTAssertTrue(field.waitForExistence(timeout: 15), "a drag up on the lowered sheet did not raise it")
    }

    /// The "No piece this <season> yet" sign walks its goal down; left for now, the walk closes
    /// on Today, the sign is put away for the day, and no walk is left waiting.
    @MainActor func testTheNoPieceSignWalksItsGoalDownAndComesBackToToday() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailySeed", "nopiece"]
        app.launch()
        let any = app.descendants(matching: .any)
        let sign = any["daily.signpost"]
        XCTAssertTrue(sign.waitForExistence(timeout: 60), "no sign")
        XCTAssertTrue(sign.label.hasPrefix("No piece"), "not the No piece sign: \(sign.label)")
        sign.tap()

        let orb = app.buttons["walk.orb"]
        XCTAssertTrue(orb.waitForExistence(timeout: 30), "the sign did not open the walk")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "What part of “")).firstMatch
            .waitForExistence(timeout: 15), "not the Season question about the goal")
        orb.tap()
        let leave = app.buttons["Leave for now"]
        XCTAssertTrue(leave.waitForExistence(timeout: 15), "no Leave for now")
        leave.tap()
        XCTAssertTrue(orb.waitForNonExistence(timeout: 30), "Leave for now did not close it")
        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 15), "not back on Today")
        XCTAssertFalse(sign.waitForExistence(timeout: 3), "the followed sign was not put away")
        XCTAssertFalse(any["daily.walkWaiting"].exists, "the walk-down was stored")
        attach(app, "Today after the walk-down")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
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
