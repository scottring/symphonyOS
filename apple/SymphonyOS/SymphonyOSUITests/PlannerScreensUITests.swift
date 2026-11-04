import XCTest

/// Walks the Planner and Inbox in DEBUG demo mode (`-SymphonyDemo`: seeded
/// in-memory data, sync off) and saves a screenshot of each state, at the
/// default text size and at an accessibility size, including the keyboard up.
///
/// A review harness, not a behavioral guarantee. Screenshots go to
/// `$TEST_RUNNER_SCREENSHOT_DIR` when set (and are attached to the result).
final class PlannerScreensUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    @MainActor func testPlannerAtDefaultSize() throws { try walk(prefix: "default", contentSize: nil) }

    @MainActor func testPlannerAtAccessibilitySize() throws {
        try walk(prefix: "axxl", contentSize: "UICTContentSizeCategoryAccessibilityXL")
    }

    /// Paper-style horizons (2026-11-04): on Month, Season, Year and Week the
    /// sheet above lies folded at the edge; tapping it lays it beside the page,
    /// for reading. No "Plan" menu brings anything down from it, and the
    /// calendar folds out the same way on Month, Season and Year.
    @MainActor func testTheSheetAboveFoldsOutAndNothingBringsItDown() throws {
        prefix = "fold"
        app = XCUIApplication()
        // Start folded whatever an earlier run left.
        app.launchArguments = ["-SymphonyDemo"]
        for h in ["month", "season", "year", "week"] {
            app.launchArguments += ["-planner.unfolded.\(h)", "NO", "-planner.unfolded.\(h).calendar", "NO"]
        }
        app.launch()
        XCTAssertTrue(app.buttons["Today. Switch horizon"].waitForExistence(timeout: 15))

        let month = monthName()
        horizon(month)
        // Nothing on the page brings an item down into a nearer period.
        XCTAssertFalse(app.buttons["Plan"].exists)
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label ENDSWITH 'into a nearer period'")).count, 0)
        // The write line is the next ruled line on the sheet.
        XCTAssertTrue(app.textFields["Write a \(month) goal"].waitForExistence(timeout: 4))

        let monthFoot = app.staticTexts["For reading. Write \(month) in its own words."]
        XCTAssertFalse(monthFoot.exists, "folded, the sheet above is out of reach")
        shot("01-month-folded")
        unfold("fold-edge-above", until: monthFoot)
        XCTAssertTrue(app.staticTexts["\(seasonName()) \(seasonYear())"].exists, "the season is the sheet above")
        shot("02-month-season-open")
        unfold("fold-grip-above", until: nil)
        XCTAssertFalse(monthFoot.waitForExistence(timeout: 1.5))

        // One companion at a time: opening the calendar folds the sheet above.
        unfold("fold-edge-above", until: monthFoot)
        let calFoot = app.staticTexts["For reading. Add events the usual way."]
        unfold("fold-edge-calendar", until: calFoot)
        XCTAssertFalse(monthFoot.exists, "opening the calendar folds the sheet above")
        shot("03-month-calendar-open")
        unfold("fold-grip-calendar", until: nil)

        // A frame mid-swing, for review (not asserted: timing varies).
        let edge = app.descendants(matching: .any)["fold-edge-above"].firstMatch
        if edge.waitForExistence(timeout: 2) {
            edge.tap()
            let png = XCUIScreen.main.screenshot().pngRepresentation
            if let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] {
                try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(prefix)-02b-mid-swing.png"))
            }
            usleep(700_000)
            unfold("fold-grip-above", until: nil)
        }

        horizon(seasonName())
        XCTAssertFalse(app.buttons["Plan"].exists)
        unfold("fold-edge-above", until: app.staticTexts["For reading. Write \(seasonName()) in its own words."])
        shot("04-season-year-open")

        horizon(yearName())
        let lastYear = String(Int(yearName())! - 1)
        unfold("fold-edge-above", until: app.staticTexts["For reading. Write \(yearName()) in its own words."])
        XCTAssertTrue(app.staticTexts["Read twenty books together"].exists, "last year's open goals")
        shot("05-year-last-year-open")
        XCTAssertTrue(app.staticTexts[lastYear].exists)

        horizon("This week")
        unfold("fold-edge-above", until: app.staticTexts["For reading. Write this week in its own words."])
        shot("06-week-month-open")

        // Last week's leftovers: Done · Next week · Someday · Let go, as the web.
        unfold("fold-grip-above", until: nil)
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Review last week'")).firstMatch)
        let gate = "Fix the gate latch"
        let verdicts = ["Done", "Next week", "Someday", "Let go"].map { app.buttons["\($0): \(gate)"] }
        for v in verdicts { XCTAssertTrue(v.waitForExistence(timeout: 4), v.description) }
        XCTAssertFalse(app.buttons["Drop: \(gate)"].exists)
        let order = verdicts.map { ($0.frame.minY.rounded(), $0.frame.minX) }
        XCTAssertTrue(zip(order, order.dropFirst()).allSatisfy { $0 < $1 }, "verdicts in order: \(order)")
        shot("07-week-review")
        tap(verdicts[3])
        XCTAssertTrue(app.staticTexts["All reviewed."].waitForExistence(timeout: 4), "Let go takes it off last week")
        tap(app.buttons["Done"].firstMatch, scroll: false)
    }

    /// Tap a fold's edge (or grip) and wait for what it shows.
    private func unfold(_ id: String, until shown: XCUIElement?) {
        let edge = app.descendants(matching: .any)[id].firstMatch
        tap(edge)
        usleep(700_000)   // the spring settles
        if let shown { XCTAssertTrue(shown.waitForExistence(timeout: 4), "\(id) shows \(shown.description)") }
    }

    /// The year the current season started in (a January winter began last year).
    private func seasonYear() -> String {
        let now = Date()
        let y = Calendar.current.component(.year, from: now)
        return String(Calendar.current.component(.month, from: now) <= 2 ? y - 1 : y)
    }

    // MARK: -

    private var app: XCUIApplication!
    private var prefix = ""

    @MainActor
    private func walk(prefix: String, contentSize: String?) throws {
        self.prefix = prefix
        app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo"]
        if let contentSize { app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize] }
        app.launch()

        XCTAssertTrue(app.buttons["Today. Switch horizon"].waitForExistence(timeout: 15))
        shot("01-today")

        // Scroll to the end: the last subtask must clear the capture bar.
        for _ in 0..<6 { app.swipeUp() }
        shot("02-today-end")

        // Keyboard up on the capture bar.
        let capture = app.textFields["Add to today…"]
        if capture.waitForExistence(timeout: 3) {
            capture.tap()
            _ = app.keyboards.firstMatch.waitForExistence(timeout: 3)
            shot("03-today-keyboard")
            capture.typeText("\n")
        }
        for _ in 0..<6 { app.swipeDown() }

        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Choose from this week'")).firstMatch)
        shot("04-chooser")
        tap(app.buttons["Add Water the tomatoes"])
        shot("05-chooser-added")
        tap(app.buttons["Done"].firstMatch, scroll: false)

        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Review'")).firstMatch)
        shot("06-unfinished")
        tap(app.buttons["Done"].firstMatch, scroll: false)

        horizon("This week", shot: "07-horizons")
        shot("08-week")
        for _ in 0..<4 { app.swipeUp() }
        shot("09-week-days")
        for _ in 0..<4 { app.swipeDown() }
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Review last week'")).firstMatch)
        shot("10-week-review")
        tap(app.buttons["Done"].firstMatch, scroll: false)

        horizon(monthName())
        shot("11-month")
        horizon(seasonName())
        shot("12-season")
        horizon(yearName())
        shot("13-year")
        horizon("Today")

        // Inbox
        tap(app.buttons["Inbox"], scroll: false)
        shot("14-inbox")
        tap(app.buttons["Move Book passport photos"])
        shot("15-move-menu")
        tap(app.buttons["Today"].firstMatch, scroll: false)
        shot("16-area-sheet")
        tap(app.buttons["Family for Book passport photos"])
        tap(app.buttons["Send to Today"], scroll: false)
        shot("17-moved-toast")

        tap(app.buttons["Select"], scroll: false)
        tap(app.buttons["Reply to the landlord"])
        tap(app.buttons["Look into a new dentist for Liam"])
        shot("18-select")
        tap(app.buttons["This week"].firstMatch, scroll: false)
        shot("19-bulk-area-sheet")
        tap(app.buttons["Cancel"], scroll: false)
        tap(app.buttons["Done"].firstMatch, scroll: false)

        let row = app.buttons["Idea: family hike in October"].firstMatch
        if row.waitForExistence(timeout: 3) {
            row.swipeRight()
            shot("20-swipe-actions")
        }
    }

    private func horizon(_ name: String, shot name2: String? = nil) {
        let title = app.buttons.matching(NSPredicate(format: "label ENDSWITH 'Switch horizon'")).firstMatch
        tap(title, scroll: false)
        if let name2 { shot(name2) }
        // Inside the switcher: a folded edge ("Fall 2026, the sheet above") starts with the same word.
        let menu = app.descendants(matching: .any)["Planning horizon"]
        tap(menu.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch, scroll: false)
    }

    /// `scroll: false` for controls pinned to the bottom (dock tabs, the bulk
    /// bar, sheet buttons) — they never need scrolling into view.
    private func tap(_ element: XCUIElement, scroll: Bool = true) {
        guard element.waitForExistence(timeout: 4) else {
            XCTFail("missing: \(element.description)")
            return
        }
        // At large text sizes a target can start below the fold (behind the
        // capture bar and dock) — scroll toward it, in the right direction.
        if scroll {
            let bottom = app.windows.firstMatch.frame.maxY - 200
            for _ in 0..<8 {
                let f = element.frame
                if f.maxY > bottom { app.swipeUp(velocity: .slow) }
                else if f.minY < 100 { app.swipeDown(velocity: .slow) }
                else { break }
            }
        }
        element.tap()
        usleep(400_000)
    }

    private func shot(_ name: String) {
        usleep(500_000)
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = "\(prefix)-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(prefix)-\(name).png"))
        }
    }

    private func monthName() -> String {
        let f = DateFormatter()
        f.dateFormat = "MMMM"
        return f.string(from: Date())
    }

    private func seasonName() -> String {
        switch Calendar.current.component(.month, from: Date()) {
        case 3...5: "Spring"
        case 6...8: "Summer"
        case 9...11: "Fall"
        default: "Winter"
        }
    }

    private func yearName() -> String { String(Calendar.current.component(.year, from: Date())) }
}
