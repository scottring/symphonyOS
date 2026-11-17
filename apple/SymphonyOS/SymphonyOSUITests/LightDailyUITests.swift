#if os(iOS)
import XCTest

/// The light everyday pages, walked by taps through the real app on the demo store: from the walk's
/// end onto Today, Week and Month; a waiting walk's line on an empty Today; a tick that moves the
/// ring; and what VoiceOver is given to read where XCUITest can see it (labels, not speech). Taps
/// only: nothing is typed or spoken (text entry stalls this simulator). This target cannot see
/// `DailyCopy` or `WalkCopy`, so the words below are spelled out once and cross-check them.
final class LightDailyUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(_ arguments: [String]) -> (XCUIApplication, XCUIElementQuery) {
        let app = XCUIApplication()
        app.launchArguments = arguments
        app.launchDemo()
        return (app, app.descendants(matching: .any))
    }

    /// A light household's walk ends on light Today, with the signpost and the bar and no dock;
    /// the row of words then opens Week, and Month with the walk's own month goal on it, and Today again.
    @MainActor func testFromTheWalksEndToTodayWeekAndMonth() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk", "-SymphonyWalkStep", "6"])
        let goToToday = any["walk.goToToday"]
        XCTAssertTrue(goToToday.waitForExistence(timeout: 60), "the walk's ending never showed")
        goToToday.tap()

        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 30), "not on light Today")
        XCTAssertTrue(any["daily.signpost"].waitForExistence(timeout: 10), "no signpost")
        XCTAssertTrue(any["daily.bar.field"].exists, "no field")
        XCTAssertTrue(any["daily.bar.light"].exists, "no light")
        XCTAssertFalse(app.buttons["Planner"].exists, "the dock is up")

        any["daily.nav.week"].tap()
        XCTAssertTrue(any["daily.week"].waitForExistence(timeout: 15), "Week did not open")

        any["daily.nav.month"].tap()
        XCTAssertTrue(any["daily.mountain.month"].waitForExistence(timeout: 15), "Month did not open")
        let goal = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Pick the tile and pay the deposit")).firstMatch
        XCTAssertTrue(goal.waitForExistence(timeout: 15), "the walk's month goal is not on Month")

        any["daily.nav.today"].tap()
        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 15), "Today did not open again")
    }

    /// F25 (S40): on the Duo's outside screen (the page 382 × 678 beside the system's column) Today's
    /// sheet has "See my whole plan" too; a tap lowers it over the whole plan, standing in one area,
    /// whose cloth opens the paper (F21); "Show the mountain" closes it and the strip raises the sheet.
    @MainActor func testTheWholePlanOnTheOutsideScreen() throws {
        let (_, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailySeed", "full", "-TodaySize", "382x678"])
        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 60), "never reached Today")
        let handle = any["daily.lookBack"]
        XCTAssertTrue(handle.waitForExistence(timeout: 15), "no handle on the outside screen")
        XCTAssertEqual(handle.label, "See my whole plan")
        handle.tap()
        XCTAssertTrue(any["walk.standing"].waitForExistence(timeout: 15), "the whole plan is not behind the sheet")
        XCTAssertFalse(any["daily.bar.field"].exists, "the bar stands over the plan")
        let year = any["walk.lookback.year"]
        XCTAssertTrue(year.exists, "no year cloth")
        year.tap()
        XCTAssertTrue(any["walk.paper"].waitForExistence(timeout: 10), "the cloth did not open the paper")
        any["walk.paper.close"].tap()
        XCTAssertTrue(any["walk.paper"].waitForNonExistence(timeout: 10), "Show the mountain did not close the paper")
        any["daily.lookBack"].tap()
        XCTAssertTrue(any["daily.bar.field"].waitForExistence(timeout: 15), "the strip did not raise the sheet")
    }

    /// F21: on the walk's Look back up (the full plan) the year cloth opens the year's paper; a row in
    /// another area closes it and stands the walk there, choosing nothing.
    @MainActor func testALookBackClothOpensThePaper() throws {
        let (_, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk", "-SymphonyWalkStep", "6",
                               "-SymphonyWalkSeed", "full"])
        let year = any["walk.lookback.year"]
        XCTAssertTrue(year.waitForExistence(timeout: 60), "no year cloth on Look back up")
        // The ending sheet has risen in (its handle is there) before the cloth is tapped.
        XCTAssertTrue(any["walk.goToToday"].waitForExistence(timeout: 15), "the ending sheet never rose")
        let standing = any["walk.standing"]
        XCTAssertEqual(standing.label, "Health")
        XCTAssertTrue(year.label.contains("tap to read the list"), year.label)
        // At this launch the cloths do not drop in: present at the first draw, they stand still from the start.
        // A first tap was once lost in the suite, as the first test of a run under load (cause not found, P43;
        // the final review found no state of the walk that refuses it): so the tap is tried again until the
        // paper rises, rather than waiting a fixed second.
        var tries = 0
        repeat {
            year.tap()
            tries += 1
        } while !any["walk.paper"].waitForExistence(timeout: 3) && tries < 4
        XCTAssertTrue(any["walk.paper"].exists, "the cloth did not open the paper")
        // Health's four year goals are rows 0 to 3; Home's first is row 4.
        any["walk.paper.row.4"].tap()
        XCTAssertTrue(any["walk.paper"].waitForNonExistence(timeout: 10), "the row did not close the paper")
        XCTAssertEqual(any["walk.standing"].label, "Home")
        XCTAssertTrue(any["walk.lookback.year"].exists)
    }

    /// Task 10 (Step 2): Xcode's accessibility audit on the Year page, the Month page and the Year page's
    /// raised paper (the full plan). Every issue is listed in the result (and printed); the kinds the
    /// walk's painting and its fixed stage make expected are named in `auditAccepted`, and any other fails.
    @MainActor func testTheAccessibilityAuditOnThePages() throws {
        var found: [String] = [], failing: [String] = []
        for (name, page, extra) in [("Year", "year", [String]()), ("Month", "month", []), ("Year paper", "year", ["-SymphonyDailyState", "paper"])] {
            let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                                     "-SymphonyDailySeed", "full", "-SymphonyDailyPage", page] + extra)
            XCTAssertTrue(any["daily.mountain.\(page)"].waitForExistence(timeout: 60), "never reached \(name)")
            if !extra.isEmpty { XCTAssertTrue(any["daily.mountain.paper"].waitForExistence(timeout: 15), "the paper did not rise") }
            try app.performAccessibilityAudit { issue in
                let element = issue.element
                let line = "\(name): \(issue.auditType.rawValue) “\(issue.compactDescription)” on \(element?.identifier ?? "?") “\(element?.label ?? "")” \(element.map { "\($0.elementType.rawValue) \($0.frame)" } ?? "")"
                found.append(line)
                if !Self.auditAccepted.contains(issue.auditType) { failing.append(line) }
                return true
            }
            app.terminate()
        }
        let note = XCTAttachment(string: found.joined(separator: "\n"))
        note.name = "accessibility-audit"
        note.lifetime = .keepAlways
        add(note)
        // Also kept as a file in the runner's temporary folder, for the report.
        try? found.joined(separator: "\n").write(toFile: Self.auditLog, atomically: true, encoding: .utf8)
        XCTAssertTrue(failing.isEmpty, "\(failing.count) audit issues: \(failing)")
    }

    static var auditLog: String { (NSTemporaryDirectory() as NSString).appendingPathComponent("symphony-accessibility-audit.txt") }

    /// What the audit reported on the pages on 2026-11-16 (76 issues, listed in Task 10's report) and is
    /// accepted for now: contrast (words over the painting and the muted More / Inbox / placeholder, the
    /// approved look; the paper's rows were sampled as the paper rose), Dynamic Type (the stage and the page
    /// chrome are fixed sizes by design, F37; large text on the pages is its own pass), and two the audit
    /// could not name: one element with no description at (0, 0, 370, 44) on Year and Month, and three
    /// "potentially inaccessible" texts on the paper (rows read by their combined label). Any other kind
    /// (touch size, clipped text, traits) fails.
    static let auditAccepted: XCUIAccessibilityAuditType = [.contrast, .dynamicType, .sufficientElementDescription, .elementDetection]

    /// The pages' paper (F16, "The pages' paper foot"): on Year with the full plan the strip at the foot
    /// raises the whole year as a list by area (five areas, each a heading); "Show the mountain" lowers
    /// it and the mountain is back. With nothing planted there is no strip, and the hint says how to begin.
    @MainActor func testThePaperStripOpensTheList() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                                 "-SymphonyDailySeed", "full", "-SymphonyDailyPage", "year"])
        XCTAssertTrue(any["daily.mountain.year"].waitForExistence(timeout: 60), "never reached Year")
        let strip = any["daily.mountain.paper.strip"]
        XCTAssertTrue(strip.waitForExistence(timeout: 15), "no strip at the foot")
        XCTAssertTrue(any["walk.standing"].exists, "the mountain has no standing post")
        strip.tap()
        let paper = any["daily.mountain.paper"]
        XCTAssertTrue(paper.waitForExistence(timeout: 10), "the strip did not raise the paper")
        let headings = paper.descendants(matching: .any)
            .matching(NSPredicate(format: "label MATCHES %@", "^(Health|Home|People|Work|Money), [0-9]+ goals?$"))
        XCTAssertEqual(Set(headings.allElementsBoundByIndex.map(\.label)).count, 5, "the list does not show five areas")
        XCTAssertFalse(any["walk.standing"].isHittable, "the mountain can be touched under the paper")
        XCTAssertTrue(any["daily.bar.field"].exists, "the bar left the paper's foot")
        any["daily.mountain.paper.close"].tap()
        XCTAssertTrue(paper.waitForNonExistence(timeout: 10), "Show the mountain did not lower the paper")
        XCTAssertTrue(any["walk.standing"].waitForExistence(timeout: 10), "the mountain is not back")
        XCTAssertTrue(strip.exists, "the strip is gone")
        app.terminate()

        // Nothing planted: no strip, and the hint says how to begin.
        let (_, bare) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                                "-SymphonyDailySeed", "empty", "-SymphonyDailyPage", "year"])
        XCTAssertTrue(bare["daily.mountain.year"].waitForExistence(timeout: 60), "never reached the empty Year")
        let hint = bare["daily.mountain.hint"]
        XCTAssertTrue(hint.waitForExistence(timeout: 15), "no hint on the empty page")
        XCTAssertEqual(hint.label, "Add your first goal with the bar below")
        XCTAssertFalse(bare["daily.mountain.paper.strip"].exists, "a strip with nothing to read")
        XCTAssertTrue(bare["daily.bar.field"].exists, "the empty page has no field")
    }

    /// Someone who left the walk part-way and has nothing at all still lands on a page with a way
    /// back into the walk, and a bar that works.
    @MainActor func testAWaitingWalkHasItsLineOnAnEmptyToday() throws {
        let (_, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailySeed", "empty",
                               "-SymphonyDailyState", "waiting"])
        XCTAssertTrue(any["daily.walkWaiting"].waitForExistence(timeout: 60), "no line for the waiting walk")
        XCTAssertTrue(any["daily.bar.field"].exists, "no field")
    }

    /// A tap on a row ticks it, and the ring says so.
    @MainActor func testATaskIsTickedAndTheRingMoves() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily"])
        let ring = any["daily.ring"]
        XCTAssertTrue(ring.waitForExistence(timeout: 60), "no ring")
        let before = ring.label
        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Tour the gym on Main Street")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10), "no row for the gym")
        row.tap()
        let moved = NSPredicate(format: "label != %@", before)
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: moved, evaluatedWith: ring)], timeout: 10), .completed,
                       "the ring still reads \(before)")
    }

    // MARK: What VoiceOver is given

    /// The bar's field is always read by its whole sentence, even where the field shows fewer words:
    /// on the real Duo outside screen the page is 382 wide (the 466-point window less the system's
    /// 84-point column, Task 17), where Month's field shows "Add for November" (`-TodaySize 382x678`; at the
    /// board's own 466 the field is wide enough for the whole sentence); and the phone's own window at
    /// two text sizes.
    @MainActor func testTheFieldIsReadByItsWholeSentence() throws {
        let launches: [[String]] = [["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"],
                                    ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"],
                                    ["-TodaySize", "382x678"]]
        for extra in launches {
            let size = extra.joined(separator: " ")
            let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                                     "-SymphonyDailyPage", "month"] + extra)
            XCTAssertTrue(any["daily.mountain.month"].waitForExistence(timeout: 60), "never reached Month")
            let field = any["daily.bar.field"]
            XCTAssertTrue(field.waitForExistence(timeout: 15), "no field")
            XCTAssertEqual(field.label, "Add a goal for November", "at \(size)")
            if extra.first == "-TodaySize" {
                // The narrow field shows the short form (S60: it still says where the goal goes): the label
                // above is not just what is shown.
                XCTAssertEqual(field.placeholderValue, "Add for November", "the narrow field does not show the short form")
            }
            app.terminate()
        }
    }

    /// Week's days are read by their whole names (today's says so), never "TUE, 10".
    @MainActor func testWeeksDaysAreReadByTheirWholeNames() throws {
        let (_, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailyPage", "week"])
        XCTAssertTrue(any["daily.week"].waitForExistence(timeout: 60), "never reached Week")
        let today = any.matching(NSPredicate(format: "label == %@", "Today, Tuesday, 10 November")).firstMatch
        XCTAssertTrue(today.waitForExistence(timeout: 15), "today's day is not read by its whole name")
        XCTAssertTrue(any.matching(NSPredicate(format: "label == %@", "Wednesday, 11 November")).firstMatch.exists,
                      "Wednesday is not read by its whole name")
        // XCUITest also lists the label's own words ("TUE", "10") under it, which VoiceOver does not read
        // (`children: .ignore`); what is gone is the element that read them together.
        XCTAssertFalse(any.matching(NSPredicate(format: "label == %@", "TUE, 10")).firstMatch.exists,
                       "a day is still read by its short label")
    }

    // MARK: Held upright (F26)

    /// Turns the phone, and turns it back upright when the test ends, passed or failed, so the next
    /// test and the simulator are left upright.
    @MainActor private func turnSideways() {
        addTeardownBlock { @MainActor in XCUIDevice.shared.orientation = .portrait }
        XCUIDevice.shared.orientation = .landscapeLeft
        Thread.sleep(forTimeInterval: 1)
    }

    /// A light household's phone stays upright: turned on Month, the light page is still there, the
    /// old Today with its Tell Symphony bar never takes its place, and the window stays tall.
    @MainActor func testTurningThePhoneKeepsTheLightPage() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                                 "-SymphonyDailyPage", "month"])
        XCTAssertTrue(any["daily.mountain.month"].waitForExistence(timeout: 60), "never reached Month")
        turnSideways()
        XCTAssertTrue(any["daily.mountain.month"].exists, "Month gave way when the phone turned")
        XCTAssertFalse(any.matching(NSPredicate(format: "label CONTAINS %@", "Tell Symphony")).firstMatch.exists,
                       "the old Today's Tell Symphony is up")
        let window = app.windows.firstMatch.frame
        XCTAssertGreaterThan(window.height, window.width, "the window turned: \(window.size)")
    }

    /// The walk, turned, stays upright too: its Next is still there to tap, not a strip scaled sideways.
    @MainActor func testTurningThePhoneKeepsTheWalkUpright() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk", "-SymphonyWalkStep", "1"])
        XCTAssertTrue(any["walk.next"].waitForExistence(timeout: 60), "the walk never showed its Next")
        turnSideways()
        XCTAssertTrue(any["walk.next"].isHittable, "the walk's Next cannot be tapped turned")
        let window = app.windows.firstMatch.frame
        XCTAssertGreaterThan(window.height, window.width, "the window turned: \(window.size)")
    }

    /// Signing out of a light household lets go of the hold: the sign-in screen turns, as it always
    /// did, so whoever signs in next (a full household too) is never held upright there.
    @MainActor func testTheSignInScreenTurnsAfterALightHouseholdSignsOut() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily"])
        let more = any["daily.bar.more"]
        XCTAssertTrue(more.waitForExistence(timeout: 60), "no More beside the bar")
        more.tap()
        let signOut = app.buttons["Sign Out"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 10), "no Sign Out in More")
        for _ in 0..<4 where !signOut.isHittable { app.swipeUp() }
        signOut.tap()
        XCTAssertTrue(app.buttons["Sign In"].waitForExistence(timeout: 15), "not signed out")
        turnSideways()
        let window = app.windows.firstMatch.frame
        XCTAssertGreaterThan(window.width, window.height, "the sign-in screen is still held upright: \(window.size)")
    }

    // MARK: The cold read's small fixes (Task 13)

    /// S41: with the field's keyboard up, a tap on the sheet clear of every row (the page's header)
    /// puts the keyboard away, on Today and on Week. Nothing is typed: the field is only tapped.
    @MainActor func testATapOnTheSheetPutsTheKeyboardAway() throws {
        let (app, any) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10"])
        XCTAssertTrue(any["daily.today"].waitForExistence(timeout: 60), "never reached Today")
        let gone = NSPredicate(format: "count == 0")

        func keyboardGoes(tapping header: XCUIElement, on page: String) {
            let field = any["daily.bar.field"]
            XCTAssertTrue(field.waitForExistence(timeout: 10), "\(page): no field")
            field.tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10), "\(page): the field took no keyboard")
            XCTAssertTrue(header.waitForExistence(timeout: 5), "\(page): no header to tap")
            header.tap()
            XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: gone, evaluatedWith: app.keyboards)], timeout: 10),
                           .completed, "\(page): the keyboard stayed up after a tap on the sheet")
            XCTAssertEqual(app.keyboards.count, 0)
        }

        // Today: the ring, at the header's right.
        keyboardGoes(tapping: any["daily.ring"], on: "Today")
        any["daily.nav.week"].tap()
        XCTAssertTrue(any["daily.week"].waitForExistence(timeout: 15), "Week did not open")
        // Week: its header's range ("This week", 8–14 November on the pinned Tuesday).
        keyboardGoes(tapping: app.staticTexts["8–14 November"], on: "Week")
    }

    /// S39: the waiting walk's line reads as a button and is one: hittable, at least 44 high.
    @MainActor func testTheWaitingLineIsAButton() throws {
        let (app, _) = launch(["-SymphonyDemo", "-SymphonyLight", "-SymphonyDaily", "-SymphonyDailyNow", "2026-11-10",
                               "-SymphonyDailyState", "waiting"])
        let line = app.buttons["daily.walkWaiting"]
        XCTAssertTrue(line.waitForExistence(timeout: 60), "the waiting line is not a button")
        XCTAssertTrue(line.isHittable, "the waiting line takes no tap")
        XCTAssertGreaterThanOrEqual(line.frame.height, 44, "the waiting line is \(line.frame.height) high")
        XCTAssertEqual(line.label, "Your walk is waiting. Pick it back up.")
    }
}
#endif
