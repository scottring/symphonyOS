#if os(iOS)
import XCTest

/// The walk, tapped through the real app on the demo store. Taps only: nothing is
/// typed or spoken (text entry stalls this simulator); words a state needs come from
/// `-SymphonyWalkOrb`. This target cannot see `WalkCopy`, so the strings below are
/// spelled out once and cross-check it.
final class WalkUITests: XCTestCase {
    private let welcome = "Let’s start up high and walk down to today."
    /// A season's eyebrow, in capitals: "THIS SEASON · TO DEC 20" or "WINTER · DEC 1 TO FEB 28".
    private let seasonEyebrow = NSPredicate(format: "label MATCHES %@",
        "^(THIS SEASON · TO [A-Z]{3} [0-9]+|[A-Z]+ · [A-Z]{3} [0-9]+ TO [A-Z]{3} [0-9]+)$")

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Waits for the element, then taps it.
    @MainActor private func tap(_ element: XCUIElement, _ name: String, timeout: TimeInterval = 15,
                     file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "never found \(name)", file: file, line: line)
        element.tap()
    }

    /// The lesson as VoiceOver and these tests find it: one element that reads both lines, whichever
    /// beat is showing.
    private static let lesson = "Hold the light and say it. Tap it for other choices."

    /// The first step that listens teaches the light once; a tap anywhere but the light puts it away.
    @MainActor private func dismissTheLesson(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let lesson = app.staticTexts[Self.lesson]
        XCTAssertTrue(lesson.waitForExistence(timeout: 15), "the light was not taught", file: file, line: line)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
        XCTAssertTrue(lesson.waitForNonExistence(timeout: 15), "a tap did not put the lesson away", file: file, line: line)
    }

    /// The demo walk opened on `step` (1 Year … 5 Today), with `more` launch arguments after.
    @MainActor private func walk(step: Int, _ more: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk", "-SymphonyWalkStep", "\(step)"] + more
        app.launchDemo()
        XCTAssertTrue(app.buttons["walk.orb"].waitForExistence(timeout: 60), "the walk never opened on step \(step)")
        return app
    }

    /// Back, More and Leave for now on every step from Year to Today, each a tap; Next at the foot, a
    /// tap, clear of the home indicator (its foot at least 34 points above the window's).
    @MainActor func testTheTopRowIsOnEveryStep() throws {
        for step in 1...5 {
            let app = walk(step: step)
            for id in ["walk.back", "walk.more", "walk.leave"] {
                let control = app.buttons[id]
                XCTAssertTrue(control.waitForExistence(timeout: 15), "step \(step): no \(id)")
                XCTAssertTrue(control.isHittable, "step \(step): \(id) takes no tap")
            }
            let next = app.buttons["walk.next"]
            XCTAssertTrue(next.waitForExistence(timeout: 15), "step \(step): no Next")
            XCTAssertTrue(next.isHittable, "step \(step): Next takes no tap")
            XCTAssertLessThanOrEqual(next.frame.maxY, app.frame.maxY - 34, "step \(step): Next is in the home indicator")
            app.terminate()
        }
    }

    /// More opens at most three choices on the light, and none of them is Back, Next or Leave for now.
    @MainActor func testTheLightOffersThree() throws {
        let app = walk(step: 3)
        tap(app.buttons["walk.more"], "More")
        let points = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'walk.point.'"))
        XCTAssertTrue(points.firstMatch.waitForExistence(timeout: 15), "More opened no choices")
        XCTAssertLessThanOrEqual(points.count, 3, "more than three choices on the light")
        for i in 0..<points.count {
            let label = points.element(boundBy: i).label
            XCTAssertFalse(label.hasPrefix("Back") || label.hasPrefix("Next") || label == "Leave for now" || label == "Finish the walk",
                           "a choice on the light is \(label)")
        }
        XCTAssertEqual(app.buttons["walk.more"].value as? String, "open", "More does not say the choices are open")
    }

    /// Back on Month goes up to the season.
    @MainActor func testBackGoesBack() throws {
        let app = walk(step: 3)
        tap(app.buttons["walk.back"], "Back")
        XCTAssertTrue(app.staticTexts.matching(seasonEyebrow).firstMatch.waitForExistence(timeout: 15),
                      "Back did not reach the season: \(app.staticTexts["walk.eyebrow"].label)")
    }

    /// On the half window (wider than the board for its height) Back and Leave for now stand past the
    /// board's edges, in the window's corners, and still take a tap there.
    @MainActor func testTheTopRowWorksInTheWings() throws {
        let app = walk(step: 3, ["-WalkSize", "484x669"])
        let back = app.buttons["walk.back"], leave = app.buttons["walk.leave"]
        XCTAssertTrue(back.waitForExistence(timeout: 15) && leave.waitForExistence(timeout: 15), "no top row")
        XCTAssertTrue(back.isHittable, "Back takes no tap in the wing")
        XCTAssertTrue(leave.isHittable, "Leave for now takes no tap in the wing")
        back.tap()
        XCTAssertTrue(app.staticTexts.matching(seasonEyebrow).firstMatch.waitForExistence(timeout: 15),
                      "Back in the wing did not reach the season")
    }

    /// A side post walks there: on Year with the full plan, a tap on Home's small post stands the walk in
    /// Home, so the question asks about home and the standing pill names it.
    @MainActor func testWalkingToAnotherArea() throws {
        let app = walk(step: 1, ["-SymphonyWalkSeed", "full"])
        let standing = app.descendants(matching: .any)["walk.standing"]
        XCTAssertTrue(standing.waitForExistence(timeout: 15), "no standing pill")
        XCTAssertEqual(standing.label, "Health", "the full plan's Year does not open in Health")
        let home = app.buttons["walk.side.home"]
        XCTAssertTrue(home.waitForExistence(timeout: 15), "no side post for Home")
        XCTAssertTrue(home.isHittable, "Home's side post takes no tap")
        home.tap()
        let question = app.staticTexts["walk.question"]
        XCTAssertTrue(question.waitForExistence(timeout: 15), "no question")
        let asksAboutHome = NSPredicate(format: "label CONTAINS[c] %@", "home")
        expectation(for: asksAboutHome, evaluatedWith: question)
        waitForExpectations(timeout: 15)
        XCTAssertEqual(standing.label, "Home", "the standing pill does not name Home")
        XCTAssertTrue(app.buttons["walk.side.health"].exists, "Health is not a side post once the walk stands in Home")
    }

    /// The field's X closes it and plants nothing.
    @MainActor func testTheFieldCloses() throws {
        let app = walk(step: 3, ["-SymphonyWalkOrb", "type"])
        tap(app.buttons["walk.type.close"], "the field's X")
        XCTAssertTrue(app.buttons["walk.type.close"].waitForNonExistence(timeout: 15), "the field did not close")
        XCTAssertFalse(app.textFields["walk.type.field"].exists, "the field is still there")
        XCTAssertFalse(app.buttons["walk.undo"].waitForExistence(timeout: 3), "closing the field planted something")
    }

    /// The field's gold Add plants what it holds.
    @MainActor func testAddPlants() throws {
        let app = walk(step: 3, ["-SymphonyWalkOrb", "draft:Book the plumber"])
        let add = app.buttons["walk.type.add"]
        XCTAssertTrue(add.waitForExistence(timeout: 15), "no Add")
        XCTAssertTrue(add.isEnabled, "Add is not lit with words in the field")
        add.tap()
        XCTAssertTrue(add.waitForNonExistence(timeout: 15), "the field did not close")
        XCTAssertTrue(app.buttons["walk.undo"].waitForExistence(timeout: 5), "Add planted nothing")
    }

    /// With the full plan and a flag chosen, Remove is in sight without scrolling.
    @MainActor func testRemoveIsInSight() throws {
        let app = walk(step: 3, ["-SymphonyWalkSeed", "full", "-SymphonyWalkOrb", "select"])
        let remove = app.buttons["walk.remove"]
        XCTAssertTrue(remove.waitForExistence(timeout: 15), "no Remove")
        XCTAssertTrue(remove.isHittable, "Remove is out of reach")
    }

    /// "+n more" raises the paper over the mountain (F7): nothing under it takes a tap, "Show the
    /// mountain" and every row are a full touch high, and a row walks to its flag and chooses it, so the
    /// Move row shows. The full plan's Month with one more goal said (`undo`): Health then holds five.
    @MainActor func testPlusMoreOpensThePaperAndARowComesBack() throws {
        let app = walk(step: 3, ["-SymphonyWalkSeed", "full", "-SymphonyWalkOrb", "undo"])
        let more = app.buttons.matching(NSPredicate(format: "label ENDSWITH %@", "more, tap to read the list")).firstMatch
        tap(more, "+n more")
        let paper = app.descendants(matching: .any)["walk.paper"]
        XCTAssertTrue(paper.waitForExistence(timeout: 15), "the paper did not rise")
        for id in ["walk.next", "walk.back", "walk.more", "walk.leave", "walk.orb"] {
            XCTAssertFalse(app.buttons[id].exists && app.buttons[id].isHittable, "\(id) still takes a tap under the paper")
        }
        let close = app.buttons["walk.paper.close"]
        XCTAssertTrue(close.exists && close.isHittable, "no Show the mountain")
        XCTAssertGreaterThanOrEqual(close.frame.height, 44, "Show the mountain is less than a touch high")
        // The walk stands in Health, which now holds five (rows 0 to 4); row 5 is Home's first goal.
        let row = app.buttons["walk.paper.row.5"]
        XCTAssertTrue(row.waitForExistence(timeout: 15), "no row in Home")
        var swipes = 0
        while !row.isHittable && swipes < 4 { paper.swipeUp(); swipes += 1 }
        XCTAssertGreaterThanOrEqual(row.frame.height, 44, "a row is less than a touch high")
        // Before the tap the walk stands in Health (Task 10: so "walked to Home" below is a change, not where it was).
        let standing = app.descendants(matching: .any)["walk.standing"].firstMatch
        XCTAssertEqual(standing.label, "Health", "the walk did not start in Health")
        row.tap()
        XCTAssertTrue(paper.waitForNonExistence(timeout: 15), "a row did not lower the paper")
        XCTAssertTrue(standing.waitForExistence(timeout: 15), "no standing pill")
        XCTAssertEqual(standing.label, "Home", "a row in Home did not walk there")
        XCTAssertTrue(app.buttons["walk.remove"].waitForExistence(timeout: 15), "the row's flag was not chosen: no Move row")
        XCTAssertTrue(app.buttons["walk.next"].exists, "Next did not come back")
    }

    /// The paper scrolls: its last row can be reached and tapped, at any text size (rows grow with the
    /// person's text size and wrap; nothing is cut). Full plan's Week (twelve tasks) and the long plan's
    /// Year (five long titles). Each end is kept as a screenshot in the result.
    @MainActor func testThePaperScrollsToItsEnd() throws {
        for (seed, step, last) in [("full", 4, 11), ("long", 1, 4)] {
            let app = walk(step: step, ["-SymphonyWalkSeed", seed, "-SymphonyWalkOrb", "paper"])
            let paper = app.descendants(matching: .any)["walk.paper"]
            XCTAssertTrue(paper.waitForExistence(timeout: 15), "\(seed): the paper did not rise")
            XCTAssertTrue(paper.scrollViews.firstMatch.exists, "\(seed): the paper's list is not a scrolling list")
            let end = app.buttons["walk.paper.row.\(last)"]
            XCTAssertTrue(end.waitForExistence(timeout: 15), "\(seed): no row \(last)")
            // Whole inside the list's own scrolling frame, and ending at least `paperFootMargin` above the paper's
            // own foot: the list's end, not a row half under the edge. (Task 10: the bound was the
            // list against the window's foot; the list's frame runs to the window's foot, so it could not fail.)
            let list = paper.scrollViews.firstMatch
            func inView() -> Bool {
                end.isHittable && list.frame.minY <= end.frame.minY && end.frame.maxY <= list.frame.maxY
                    && end.frame.maxY <= paper.frame.maxY - Self.paperFootMargin
            }
            var swipes = 0
            while !inView() && swipes < 10 {
                paper.swipeUp()
                swipes += 1
            }
            XCTAssertTrue(inView(), "\(seed): the last row cannot be reached whole: row \(end.frame), list \(list.frame), paper \(paper.frame)")
            XCTAssertGreaterThanOrEqual(end.frame.height, 44, "\(seed): the last row is less than a touch high")
            XCTAssertFalse(app.buttons["walk.paper.row.\(last + 1)"].exists, "\(seed): more rows than the level holds")
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "paper-end-\(seed)"
            shot.lifetime = .keepAlways
            add(shot)
            app.terminate()
        }
    }

    /// Task 10 (Step 2, A5): in the accessibility tree the walk step's controls come in reading order: the
    /// top row, the Undo pill (between the mountain and the light), the light, then Next. (The tree's element
    /// order as XCUITest walks it puts the scene's elements after the controls' layer, so the scene's place,
    /// priority 2 between the top row's 3 and the hint row's 1.5, is checked by reading `WalkView`, not here.)
    @MainActor func testTheControlsAreReadInOrder() throws {
        let app = walk(step: 3, ["-SymphonyWalkSeed", "full", "-SymphonyWalkOrb", "undo"])
        XCTAssertTrue(app.buttons["walk.undo"].waitForExistence(timeout: 15), "no Undo pill")
        let ids = app.descendants(matching: .any).allElementsBoundByAccessibilityElement.map(\.identifier).filter { !$0.isEmpty }
        let order = ["walk.back", "walk.more", "walk.leave", "walk.undo", "walk.orb", "walk.next"]
        let at = order.map { id in ids.firstIndex(of: id) ?? -1 }
        XCTAssertFalse(at.contains(-1), "missing: \(zip(order, at).filter { $0.1 < 0 }.map(\.0)) in \(ids)")
        XCTAssertEqual(at, at.sorted(), "read out of order: \(zip(order, at).map { "\($0.0) \($0.1)" }) in \(ids)")
    }

    /// How far above the paper's own foot its list must end on the iPhone 17: enough to catch a last row
    /// that runs under the paper's edge. It is less than the 34 points of that phone's home-indicator area,
    /// so it does not show the row clears that area.
    static let paperFootMargin: CGFloat = 20

    /// The paper opened for a shot (`-SymphonyWalkOrb paper`) goes with "Show the mountain", and the walk is as it was.
    @MainActor func testShowTheMountainLowersThePaper() throws {
        let app = walk(step: 4, ["-SymphonyWalkSeed", "full", "-SymphonyWalkOrb", "paper"])
        let paper = app.descendants(matching: .any)["walk.paper"]
        XCTAssertTrue(paper.waitForExistence(timeout: 15), "the paper did not rise")
        tap(app.buttons["walk.paper.close"], "Show the mountain")
        XCTAssertTrue(paper.waitForNonExistence(timeout: 15), "Show the mountain did not lower the paper")
        XCTAssertTrue(app.buttons["walk.next"].waitForExistence(timeout: 15), "Next did not come back")
        XCTAssertTrue(app.buttons["walk.back"].isHittable, "Back takes no tap once the paper is down")
    }

    @MainActor func testAQuickStartPlantsAFlag() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo", "-SymphonyLight", "-SymphonyWalk"]
        app.launchDemo()
        XCTAssertTrue(app.staticTexts[welcome].waitForExistence(timeout: 60), "the walk never opened")

        // Welcome: the two ways in above the light, Not now under it; the light itself is the quick start too.
        let orb = app.buttons["walk.orb"]
        XCTAssertTrue(app.buttons["Plan my whole year"].exists && app.buttons["Quick start"].exists, "Welcome's two ways in")
        XCTAssertTrue(app.buttons["Not now"].exists, "Welcome's Not now")
        tap(orb, "the light (Quick start)")
        tap(app.buttons["Health"], "the Health area")
        tap(app.buttons["Next: your goals"], "the Next line")
        dismissTheLesson(app)
        tap(app.buttons["walk.more"], "More")
        tap(app.buttons["Show examples"], "Show examples")
        tap(app.buttons["Example: Run a 5K, tap to make it yours"], "the Run a 5K example")

        let planted = app.buttons["Year: Run a 5K, tap to move or remove"]
        XCTAssertTrue(planted.waitForExistence(timeout: 15), "the example was not planted")
        XCTAssertTrue(app.buttons["walk.undo"].exists, "no Undo after planting")
        XCTAssertEqual(app.buttons["walk.undo"].label, "Undo adding “Run a 5K”", "Undo does not say what it undoes")
        // Once something is added the line under the light names where it goes: "Next: this <season>".
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Next: this ")).firstMatch.exists,
                      "no Next line once something was added")
        planted.tap()
        XCTAssertTrue(app.buttons["walk.remove"].waitForExistence(timeout: 15), "selecting the flag offered no Remove")
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

        tap(app.buttons["walk.leave"], "Leave for now")
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
        XCTAssertTrue(app.staticTexts["What would make this a good year for your health?"].waitForExistence(timeout: 15),
                      "not back on Year")
        XCTAssertTrue(app.buttons["Year: Run a 5K, tap to move or remove"].waitForExistence(timeout: 15),
                      "the flag planted before leaving is gone")
        XCTAssertFalse(app.staticTexts[Self.lesson].exists, "taught again on resume")
    }
}
#endif
