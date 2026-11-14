import XCTest

/// The Duo opened flat (Task 18), shown on the phone simulator with `-TodaySize 890x626`, which
/// the Debug build draws scaled down to the screen's width (`dailyPinnedFit`); `-SpreadFold`
/// pins where the pages meet. No typing.
final class LightSpreadUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(_ extra: [String], page: String) -> (XCUIApplication, XCUIElementQuery) {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-TodaySize", "890x626"] + extra
        app.launch()
        let any = app.descendants(matching: .any)
        XCTAssertTrue(any[page].waitForExistence(timeout: 60), "never reached \(page)")
        return (app, any)
    }

    /// No word in the row of words sits across the fold, on the spread and on Month, for folds a
    /// little off centre as for the board's: Year, Season and Month stand left of it, "Week and
    /// today" right of it.
    @MainActor func testNoWordCrossesTheFold() throws {
        for (page, extra) in [("daily.spread", [String]()), ("daily.mountain.month", ["-SymphonyDailyPage", "month"])] {
            for fold in [435, 445, 455] {
                let (app, any) = launch(extra + ["-SpreadFold", "\(fold)"], page: page)
                // The pinned page is drawn at the screen's width over 890.
                let scale = app.windows.firstMatch.frame.width / 890
                let x = CGFloat(fold) * scale
                for word in ["year", "season", "month"] {
                    let frame = any["daily.nav.\(word)"].frame
                    XCTAssertFalse(frame.isEmpty, "\(page) \(fold): no \(word)")
                    XCTAssertLessThanOrEqual(frame.maxX, x + 0.5, "\(page) \(fold): \(word) crosses the fold")
                }
                let week = any["daily.nav.week"].frame
                XCTAssertGreaterThanOrEqual(week.minX, x - 0.5, "\(page) \(fold): Week and today crosses the fold")
                app.terminate()
            }
        }
    }

    /// On the week's last day with today done, "That's the day" opens next week on the left page;
    /// today stays on the right. ("Week and today" bringing this week back is pinned in the core,
    /// `theLeftPageFollowsTheSelectedWeek`: scaled down, the row of words stands under the phone's
    /// status bar, where a test's tap does not reach the page.)
    @MainActor func testTheLastDaysSignShowsNextWeekOnTheLeft() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-14",
                               "-SymphonyDailySeed", "done", "-TodaySize", "890x626"]
        app.launch()
        let any = app.descendants(matching: .any)
        XCTAssertTrue(any["daily.spread"].waitForExistence(timeout: 60), "never reached the spread")
        XCTAssertTrue(app.staticTexts["8–14 November"].exists, "not this week on the left")
        // The seed leaves one of today's rows open (the weekend's pancakes): tick it, so the day is done.
        let open = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Slow morning'")).firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 10), "no open row")
        open.tap()
        // "That's the day", naming tomorrow's first task (the seed's own words): tomorrow is next week.
        let sign = any.matching(NSPredicate(format: "identifier == 'daily.signpost' AND label CONTAINS 'Choose the tile'"))
            .firstMatch
        XCTAssertTrue(sign.waitForExistence(timeout: 10), "the day done did not turn the sign to tomorrow")
        sign.tap()
        XCTAssertTrue(app.staticTexts["15–21 November"].waitForExistence(timeout: 10), "next week is not on the left")
        XCTAssertTrue(app.staticTexts["Saturday, 14 November"].exists, "the right page left today")
    }
}
