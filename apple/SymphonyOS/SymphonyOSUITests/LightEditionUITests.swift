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
        app.launchDemo()
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
        app.launchDemo()
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
        app.launchDemo()
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

        let leave = app.buttons["walk.leave"]
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

    /// Week's handle, as Today's: with a task chosen and its Move to panel up, the sheet lowers
    /// over the whole plan with no bar, no panel and no band flags; a tap on the lowered sheet
    /// brings Week and its bar back with the task let go, no walk opened and nothing on the week changed.
    @MainActor func testTheWeeksHandleShowsTheWholePlanAndComesBack() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailyPage", "week", "-SymphonyDailyState", "select"]
        app.launchDemo()
        let any = app.descendants(matching: .any)
        let week = any["daily.week"]
        XCTAssertTrue(week.waitForExistence(timeout: 60), "never reached Week")
        let panel = any["daily.moveTo"]
        XCTAssertTrue(panel.waitForExistence(timeout: 15), "no task chosen")
        let field = any["daily.bar.field"]
        let handle = any["daily.lookBack"]
        XCTAssertTrue(handle.exists && field.exists, "no handle or no bar")
        // The week's rows, and a year goal of the area the whole plan stands in (Health, the first kept
        // area with a flag, F6), which Week's rows never name: only the whole plan's own cloth can carry it.
        let passport = any.matching(NSPredicate(format: "label CONTAINS %@", "Renew the passport")).firstMatch
        let yearGoal = any.matching(NSPredicate(format: "label CONTAINS %@", "Feel strong again")).firstMatch
        XCTAssertTrue(passport.exists, "the week's rows are not there")
        // What the week holds, leaving out the panel's own chips (the panel goes as the task is let go).
        let chips = Set(rows(panel))
        let before = rows(week).filter { !chips.contains($0) }
        XCTAssertFalse(before.isEmpty)
        let raisedLabel = handle.label

        handle.tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 15), "the bar is still up over the plan")
        XCTAssertTrue(passport.waitForNonExistence(timeout: 15), "the week's rows are still up")
        XCTAssertTrue(yearGoal.waitForExistence(timeout: 15), "the whole plan is not behind the sheet")
        XCTAssertFalse(panel.exists, "the Move to panel stands over the plan")
        XCTAssertFalse(any["daily.week.flag"].exists, "the band's flags stand over the plan")
        let strip = any["daily.lookBack"]
        XCTAssertNotEqual(strip.label, raisedLabel, "the lowered sheet does not say what raising it shows")
        XCTAssertGreaterThanOrEqual(strip.frame.height, 44)
        attach(app, "Week, whole plan")

        strip.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.8)).tap()
        XCTAssertTrue(field.waitForExistence(timeout: 15), "a tap on the lowered sheet did not raise it")
        XCTAssertEqual(any["daily.lookBack"].label, raisedLabel)
        XCTAssertTrue(any["daily.nav.week"].isSelected, "Week is no longer the page")
        XCTAssertFalse(panel.exists, "the chosen task was not let go")
        XCTAssertFalse(app.buttons["walk.orb"].exists, "a walk opened")
        XCTAssertEqual(rows(week), before, "the week changed")
        attach(app, "Week after the whole plan")
    }

    /// Every word in the row of words opens a light page with the bar and no dock, and a flag in
    /// Week's band opens light Month, the mountain page.
    @MainActor func testEveryWordAndWeeksFlagsOpenLightPagesWithNoDock() throws {
        let app = launch(light: true)
        let any = app.descendants(matching: .any)
        let pages = [("year", "daily.mountain.year"), ("season", "daily.mountain.season"),
                     ("month", "daily.mountain.month"), ("week", "daily.week"), ("today", "daily.today")]
        for (word, page) in pages {
            any["daily.nav.\(word)"].tap()
            XCTAssertTrue(any[page].waitForExistence(timeout: 15), "\(word) did not open \(page)")
            XCTAssertTrue(any["daily.bar.field"].waitForExistence(timeout: 5), "no bar on \(word)")
            XCTAssertFalse(app.buttons["Planner"].exists, "the dock is up on \(word)")
            XCTAssertFalse(app.buttons["Routines"].exists, "the dock is up on \(word)")
        }
        any["daily.nav.week"].tap()
        let flag = any["daily.week.flag"].firstMatch
        XCTAssertTrue(flag.waitForExistence(timeout: 15), "no flag in Week's band")
        flag.tap()
        XCTAssertTrue(any["daily.mountain.month"].waitForExistence(timeout: 15), "the flag did not open light Month")
        XCTAssertFalse(app.buttons["Planner"].exists, "the dock is up on Month")
    }

    /// Each button on a page, with its value: what a write would change.
    private func rows(_ page: XCUIElement) -> [String] {
        page.buttons.allElementsBoundByIndex.map { "\($0.label)|\(String(describing: $0.value))" }
    }

    /// The "No piece this <season> yet" sign walks its goal down; left for now, the walk closes
    /// on Today, the sign is put away for the day, and no walk is left waiting.
    @MainActor func testTheNoPieceSignWalksItsGoalDownAndComesBackToToday() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailySeed", "nopiece"]
        app.launchDemo()
        let any = app.descendants(matching: .any)
        let sign = any["daily.signpost"]
        XCTAssertTrue(sign.waitForExistence(timeout: 60), "no sign")
        XCTAssertTrue(sign.label.hasPrefix("No piece"), "not the No piece sign: \(sign.label)")
        sign.tap()

        let orb = app.buttons["walk.orb"]
        XCTAssertTrue(orb.waitForExistence(timeout: 30), "the sign did not open the walk")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "What part of “")).firstMatch
            .waitForExistence(timeout: 15), "not the Season question about the goal")
        let leave = app.buttons["walk.leave"]
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

    private func launchHalfOpen(_ extra: [String], posture: String = "laptop", size: String = "626x890") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-HalfOpen", posture,
                               "-TodaySize", size] + extra
        app.launchDemo()
        XCTAssertTrue(app.descendants(matching: .any)["daily.halfOpen"].waitForExistence(timeout: 60),
                      "no light half-open display")
        return app
    }

    /// A light household set down half open gets its own display; the page under it stays but is
    /// out of reach (ruling D14). The half you look at takes no touch: on the 28th the `quiet`
    /// seed's sign ("November ends on Monday") would open Month on Today, but here a drag and a tap
    /// leave it and the display as they were. A tick on the half you touch counts one more done and
    /// offers Undo, which puts it back (ruling D15).
    @MainActor func testHalfOpenSignTakesNoTouchAndATickCounts() throws {
        let app = launchHalfOpen(["-SymphonyDailyNow", "2026-11-28", "-SymphonyDailySeed", "quiet"])
        let any = app.descendants(matching: .any)
        let sign = any["daily.halfOpen.sign"]
        XCTAssertTrue(sign.waitForExistence(timeout: 15), "no sign on the 28th")
        XCTAssertTrue(sign.label.contains("November"), "not the month's sign: \(sign.label)")
        assertThePageUnderTheDisplayIsOutOfReach(app)

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
        let undo = any["daily.undo"]
        XCTAssertTrue(undo.waitForExistence(timeout: 5), "a tick on the display offers no Undo")
        undo.tap()
        let one = NSPredicate(format: "label == %@", "1 done")
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: one, evaluatedWith: done)], timeout: 5), .completed,
                       "Undo did not put the tick back")
    }

    /// The Lock Screen's Tell Symphony (`symphony://tell`) while the display is up: this display's
    /// bar listens, in sight; no sheet, and no bar under it. (`hear`: a stand-in listener, so no
    /// permission prompt; nobody speaks to the simulator.)
    @MainActor func testATellOnTheHalfOpenDisplayListensThere() throws {
        let app = launchHalfOpen(["-SymphonyDailyNow", "2026-11-10", "-SymphonyDailyState", "hear"])
        let any = app.descendants(matching: .any)
        let light = any["daily.halfOpen"].descendants(matching: .any)["daily.bar.light"]
        XCTAssertTrue(light.waitForExistence(timeout: 15))
        XCTAssertEqual(light.label, "Speak it")
        app.open(try XCTUnwrap(URL(string: "symphony://tell")))
        let listening = NSPredicate(format: "label == %@", "Add what you said")
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: listening, evaluatedWith: light)], timeout: 10), .completed,
                       "the display's bar did not listen")
        XCTAssertTrue(any["daily.halfOpen"].exists)
        assertThePageUnderTheDisplayIsOutOfReach(app)
        // The page kept under the display took no part in the Tell: its own light is there, not listening.
        let pageLight = any["daily.today"].descendants(matching: .any)["daily.bar.light"]
        XCTAssertTrue(pageLight.exists, "light Today's bar is not kept under the display")
        XCTAssertEqual(pageLight.label, "Speak it", "the page under the display listened")
    }

    /// Final review I2: a Tell (`symphony://tell`, as the Lock Screen's control opens it) while Week or
    /// Month shows ends on Today with its bar listening, in sight: the page that goes away cannot
    /// cancel the listen. (`hear`: a stand-in listener, so no permission prompt; nobody speaks.)
    @MainActor func testATellFromWeekEndsOnTodayListening() throws {
        try assertATellFrom("week", page: "daily.week")
    }

    @MainActor func testATellFromMonthEndsOnTodayListening() throws {
        try assertATellFrom("month", page: "daily.mountain.month")
    }

    private func assertATellFrom(_ start: String, page: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailyPage", start, "-SymphonyDailyState", "hear"]
        app.launchDemo()
        let any = app.descendants(matching: .any)
        XCTAssertTrue(any[page].waitForExistence(timeout: 60), "never reached \(start)", file: file, line: line)
        app.open(try XCTUnwrap(URL(string: "symphony://tell")))
        let today = any["daily.today"]
        XCTAssertTrue(today.waitForExistence(timeout: 15), "the Tell did not open Today", file: file, line: line)
        let light = today.descendants(matching: .any)["daily.bar.light"]
        XCTAssertTrue(light.waitForExistence(timeout: 10), file: file, line: line)
        let listening = NSPredicate(format: "label == %@", "Add what you said")
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: listening, evaluatedWith: light)], timeout: 10), .completed,
                       "Today's bar is not listening after a Tell from \(start)", file: file, line: line)
        XCTAssertFalse(any[page].exists, "\(start) is still up", file: file, line: line)
    }

    /// The owner's "where I am, if it has goals": on 28 November the walk plans December, but with goals
    /// in November too, Month opens on November; its heading's tap shows December and its flags, and a
    /// second tap comes back. Taps only.
    @MainActor func testMonthOpensWhereYouAreAndItsHeadingSwitches() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-28",
                               "-SymphonyDailySeed", "both", "-SymphonyDailyPage", "month"]
        app.launchDemo()
        let any = app.descendants(matching: .any)
        XCTAssertTrue(any["daily.mountain.month"].waitForExistence(timeout: 60), "never reached Month")
        let heading = any["daily.mountain.heading"]
        XCTAssertTrue(heading.waitForExistence(timeout: 15))
        XCTAssertTrue(heading.label.hasPrefix("November"), "Month did not open on November: \(heading.label)")
        XCTAssertTrue(heading.label.contains("December"), "the heading does not offer December: \(heading.label)")
        let november = any.matching(NSPredicate(format: "label CONTAINS %@", "Clear the gutters")).firstMatch
        XCTAssertTrue(november.waitForExistence(timeout: 10), "November's goal is not on November's page")

        heading.tap()
        let onDecember = NSPredicate(format: "label BEGINSWITH %@", "December")
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: onDecember, evaluatedWith: heading)], timeout: 10), .completed,
                       "the heading's tap did not show December")
        let december = any.matching(NSPredicate(format: "label CONTAINS %@", "Find a gym that fits")).firstMatch
        XCTAssertTrue(december.waitForExistence(timeout: 10), "December's goal is not on December's page")
        XCTAssertFalse(november.exists, "November's goal is still shown on December's page")

        heading.tap()
        let onNovember = NSPredicate(format: "label BEGINSWITH %@", "November")
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: onNovember, evaluatedWith: heading)], timeout: 10), .completed,
                       "a second tap did not come back to November")
    }

    /// The light page's controls under the display.
    private let pageControls = ["daily.bar.light", "daily.bar.inbox", "daily.bar.more", "daily.lookBack", "daily.nav.week"]

    /// Ruling D14 as XCUITest can see it: nothing of a page under the display can be touched (each of
    /// its controls is out of reach: missing, or there and not hittable), the display's light is the one
    /// that can, and there is no dock. (XCUITest lists elements SwiftUI hides from VoiceOver, even under
    /// a constant `accessibilityHidden(true)`, so whether VoiceOver skips the page is not asserted here.)
    private func assertThePageUnderTheDisplayIsOutOfReach(_ app: XCUIApplication, file: StaticString = #filePath,
                                                          line: UInt = #line) {
        let any = app.descendants(matching: .any)
        let display = any["daily.halfOpen"].descendants(matching: .any)
        XCTAssertTrue(display["daily.bar.light"].isHittable, "the display's light cannot be touched", file: file, line: line)
        let page = any["daily.today"].descendants(matching: .any)
        for id in pageControls { assertOutOfReach(page[id], id, file: file, line: line) }
        XCTAssertFalse(app.buttons["Planner"].exists, "the dock under the display", file: file, line: line)
        XCTAssertFalse(app.buttons["Routines"].exists, file: file, line: line)
    }

    /// Out of reach: missing from the screen, or there and not hittable. Either passes, on purpose;
    /// where a test means "there but inert" it asserts `exists` as well (`assertThereButInert`).
    private func assertOutOfReach(_ element: XCUIElement, _ what: String, file: StaticString = #filePath,
                                  line: UInt = #line) {
        XCTAssertTrue(!element.exists || !element.isHittable, "\(what) can be touched under the display",
                      file: file, line: line)
    }

    /// There but inert: present on the screen and not hittable.
    private func assertThereButInert(_ element: XCUIElement, _ what: String, file: StaticString = #filePath,
                                     line: UInt = #line) {
        XCTAssertTrue(element.exists, "\(what) is not there", file: file, line: line)
        XCTAssertFalse(element.isHittable, "\(what) can be touched under the display", file: file, line: line)
    }

    /// The inside screen held upright (626 × 890) is a light window now: set down half open, light
    /// Today stays underneath, kept but out of reach (ruling D14), with no dock. (`daily.coveredPage`
    /// is a Debug demo marker for the kept page. The posture is pinned for the whole run by
    /// `-HalfOpen`, so opening flat again cannot be driven here; the page's return is pinned in the
    /// model's tests, `DailyModelTests`.)
    @MainActor func testTheUprightInsideScreenKeepsLightTodayUnderTheDisplay() throws {
        let app = launchHalfOpen(["-SymphonyDailyNow", "2026-11-10"])
        let any = app.descendants(matching: .any)
        let kept = any["daily.coveredPage"]
        XCTAssertTrue(kept.waitForExistence(timeout: 15), "no light page kept under the display")
        XCTAssertEqual(kept.value as? String, "today")
        XCTAssertTrue(any["daily.today"].exists, "light Today is not the page under the display")
        assertThePageUnderTheDisplayIsOutOfReach(app)
        // Kept, not dropped: each of its controls is there, and inert.
        let page = any["daily.today"].descendants(matching: .any)
        for id in pageControls { assertThereButInert(page[id], id) }
    }

    /// The inside screen opened flat (890 × 626) is the spread: set down like a book, the spread stays
    /// underneath, kept but out of reach (ruling D14), with no dock: its bar's light, Inbox, More and its
    /// last word are there and inert, and the display's light is the one that takes a touch.
    @MainActor func testTheSpreadStaysUnderTheBookDisplay() throws {
        let app = launchHalfOpen(["-SymphonyDailyNow", "2026-11-10"], posture: "book", size: "890x626")
        let any = app.descendants(matching: .any)
        let kept = any["daily.coveredPage"]
        XCTAssertTrue(kept.waitForExistence(timeout: 15), "no light page kept under the display")
        XCTAssertEqual(kept.value as? String, "today")
        XCTAssertTrue(any["daily.spread"].exists, "the spread is not the page under the display")
        XCTAssertTrue(any["daily.halfOpen"].descendants(matching: .any)["daily.bar.light"].isHittable,
                      "the display's light cannot be touched")
        let page = any["daily.spread"].descendants(matching: .any)
        for id in ["daily.bar.light", "daily.bar.inbox", "daily.bar.more", "daily.nav.week"] {
            assertThereButInert(page[id], id)
        }
        XCTAssertFalse(app.buttons["Planner"].exists, "the dock under the display")
        XCTAssertFalse(app.buttons["Routines"].exists)
    }

    /// A full household set down half open keeps the old display, dinner and all.
    @MainActor func testAFullHouseholdKeepsTheOldHalfOpenDisplay() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-HalfOpen", "laptop", "-TodaySize", "626x890"]
        app.launchDemo()
        let tonight = app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", "Tonight")).firstMatch
        XCTAssertTrue(tonight.waitForExistence(timeout: 60), "the old display's dinner is not there")
        XCTAssertFalse(app.descendants(matching: .any)["daily.halfOpen"].exists)
    }

    // MARK: The handover

    /// The walk on its last step with Today's sheet raised; `remembers` keeps the demo's memory of
    /// the handover's line from the launch before (`-SymphonyHandoverRemembers`).
    private func finishTheWalk(light: Bool, remembers: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo"] + (light ? ["-SymphonyLight"] : [])
            + ["-SymphonyWalk", "-SymphonyWalkStep", "6", "-SymphonyWalkSheet", "up"]
            + (remembers ? ["-SymphonyHandoverRemembers"] : [])
        app.launchDemo()
        // The ending's last control (`WalkCopy.goToToday`).
        let openToday = app.descendants(matching: .any)["walk.goToToday"]
        XCTAssertTrue(openToday.waitForExistence(timeout: 60), "the walk's ending never showed")
        openToday.tap()
        XCTAssertTrue(app.buttons["walk.orb"].waitForNonExistence(timeout: 30), "the walk did not close")
        return app
    }

    /// Finishing the walk in a light household lands on light Today with the handover's line; a
    /// second launch that finishes again as the same person lands there with no line. Both times the
    /// handover ran: the bar's light wears its halo (`daily.bar.halo`, a Debug demo marker).
    @MainActor func testFinishingTheWalkHandsTheLightToTheBarOnce() throws {
        let line = "daily.handover"
        let first = finishTheWalk(light: true)
        let any = first.descendants(matching: .any)
        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 30), "not on light Today")
        XCTAssertTrue(any[line].waitForExistence(timeout: 10), "no handover line the first time")
        XCTAssertEqual(any[line].label, "The light lives here now. Type, or tap it to speak.")
        XCTAssertTrue(any["daily.bar.light"].exists, "no light on the bar")
        XCTAssertTrue(any["daily.bar.halo"].exists, "the light wears no halo")
        XCTAssertTrue(any[line].waitForNonExistence(timeout: 15), "the line never went")
        first.terminate()

        let again = finishTheWalk(light: true, remembers: true)
        let anyAgain = again.descendants(matching: .any)
        XCTAssertTrue(anyAgain["daily.today"].waitForExistence(timeout: 30), "not on light Today the second time")
        XCTAssertTrue(anyAgain["daily.bar.light"].waitForExistence(timeout: 10), "no light on the bar")
        XCTAssertTrue(anyAgain["daily.bar.halo"].waitForExistence(timeout: 10), "the handover did not run the second time")
        XCTAssertFalse(anyAgain[line].waitForExistence(timeout: 5), "the line showed a second time")
    }

    /// A full household's walk ends on the Today it always had: no light page, no light, no line.
    @MainActor func testAFullHouseholdFinishesOnTheOldToday() throws {
        let app = finishTheWalk(light: false)
        let any = app.descendants(matching: .any)
        XCTAssertTrue(app.buttons["Today. Switch horizon"].waitForExistence(timeout: 30), "not on the old Today")
        XCTAssertFalse(any["daily.today"].exists, "a light page in a full household")
        XCTAssertFalse(any["daily.bar.light"].exists, "a light on a full household's Today")
        XCTAssertFalse(any["daily.handover"].waitForExistence(timeout: 3), "the handover's line in a full household")
        XCTAssertFalse(any["daily.bar.halo"].exists, "a handover in a full household")
    }
}
