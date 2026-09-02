import XCTest

/// Signs in as the seeded test account and captures Today, Inbox, the Add
/// sheet, a task detail sheet, a plain row, and a direct tap on a plain row's
/// check circle — the visual acceptance evidence for the landing-parity
/// restyle (Tasks 1-10). Mirrors `CarriedOverUITests`' sign-in pattern. Not
/// part of the shipping suite's guarantees — needs the test account and a
/// network.
final class SkinScreenshotsUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testTodayInboxAndTaskSheetSkin() throws {
        let app = XCUIApplication()
        app.launch()
        installSystemAlertMonitor(app)
        signIn(app)

        let today = app.staticTexts["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 30), "never reached Today")

        // "Buy cleats" is scheduled for today (all-day, no notes — a plain
        // row) by an earlier Task 10 run of testSnapPageFlow. Waiting for it
        // both confirms the post-sign-in sync landed and stands in for the
        // fixed post-launch settle sleep the old harness used.
        let buyCleats = app.staticTexts["Buy cleats"].firstMatch
        XCTAssertTrue(buyCleats.waitForExistence(timeout: 20), "no 'Buy cleats' plain row on Today — Task 10 seed data missing")
        attach(name: "01-today")

        // 05: the same Today screen already shows a plain row (time · dot ·
        // title · check circle on bgSurface) — "Buy cleats" is all-day with
        // no notes, so it renders as one. Captured right after 01-today,
        // before anything is tapped, so it reflects the untouched row.
        attach(name: "05-plain-row")

        // Inbox
        let inboxTab = app.buttons["Inbox"]
        XCTAssertTrue(inboxTab.waitForExistence(timeout: 10), "no Inbox tab")
        inboxTab.tap()

        let fixFence = app.staticTexts["Fix fence"].firstMatch
        XCTAssertTrue(fixFence.waitForExistence(timeout: 15), "no 'Fix fence' row in Inbox — Task 10 seed data missing")
        attach(name: "02-inbox")

        // 04: open a TASK's detail sheet (TaskDetailView, not the event
        // sheet) from the Inbox row, so TaskDetailView's eyebrow section
        // headers get a visual check. Swipe right reveals the row's action
        // panel ("Today" / "When" / "More") on its leading edge. A plain
        // `.swipeRight()` on the (narrow) title text doesn't generate enough
        // of a tracked drag for SlideRow's custom `DragGesture` to see past
        // its 24pt minimum-distance threshold — a slower press-then-drag
        // over a longer distance does.
        revealSlideActions(fixFence)
        let whenAction = app.buttons["When"]
        XCTAssertTrue(whenAction.waitForExistence(timeout: 5), "row action panel never revealed")

        // The row's "More" and the dock's "More" tab share the label — the
        // dock sits near the bottom of the screen, the row is higher up.
        // "Projects" is a dock-only label, so its Y is a reliable anchor.
        let dockAnchorY = app.buttons["Projects"].frame.minY
        var openedTaskSheet = false
        let moreCandidates = app.buttons.matching(NSPredicate(format: "label == 'More'"))
        for i in 0..<moreCandidates.count {
            let el = moreCandidates.element(boundBy: i)
            if el.exists, el.frame.minY < dockAnchorY - 50 {
                el.tap()
                openedTaskSheet = true
                break
            }
        }
        XCTAssertTrue(openedTaskSheet, "couldn't find the row's 'More' action distinct from the dock tab")

        let taskSheetTitle = app.navigationBars["Task"]
        XCTAssertTrue(taskSheetTitle.waitForExistence(timeout: 10), "task detail sheet never opened")
        attach(name: "04-task-sheet")

        app.buttons["Done"].firstMatch.tap()
        // Back in Inbox once the sheet dismisses.
        XCTAssertTrue(app.staticTexts["Fix fence"].firstMatch.waitForExistence(timeout: 10), "never returned to Inbox after dismissing the task sheet")

        // Add sheet (dock "+")
        let todayTab = app.buttons["Today"]
        XCTAssertTrue(todayTab.waitForExistence(timeout: 10), "no Today tab")
        todayTab.tap()
        XCTAssertTrue(app.staticTexts["Buy cleats"].firstMatch.waitForExistence(timeout: 10), "never returned to Today")

        let addButton = app.buttons["Add"]
        XCTAssertTrue(addButton.waitForExistence(timeout: 10), "no dock Add button")
        addButton.tap()

        let snapAPage = app.buttons["Snap a page"]
        XCTAssertTrue(snapAPage.waitForExistence(timeout: 10), "Add sheet never opened")
        attach(name: "03-add-sheet")

        app.buttons["Done"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Buy cleats"].firstMatch.waitForExistence(timeout: 10), "never returned to Today after dismissing the Add sheet")

        // 06: tap "Buy cleats"' own check circle directly (no swipe) and
        // confirm the tap actually reached the Button inside SlideRow — the
        // Task 7 ruling under test. Assert on the accessibility label
        // ("Mark complete" -> "Completed", or the reverse if a prior run
        // already completed the row), not just that a tap occurred.
        let rowY = app.staticTexts["Buy cleats"].firstMatch.frame.minY
        guard let checkCircle = findCheckCircle(in: app, nearY: rowY) else {
            XCTFail("couldn't locate 'Buy cleats'' check circle")
            return
        }
        let initialLabel = checkCircle.label
        XCTAssertTrue(initialLabel == "Mark complete" || initialLabel == "Completed",
                      "unexpected check circle label: \(initialLabel)")
        checkCircle.tap()

        // The completion toggle is a local @State flip + spring animation,
        // not a new element appearing — there's nothing distinct to wait on,
        // so a short settle sleep for the animation is kept here.
        Thread.sleep(forTimeInterval: 1)
        attach(name: "06-check-tap")

        guard let checkCircleAfter = findCheckCircle(in: app, nearY: rowY) else {
            XCTFail("couldn't re-locate 'Buy cleats'' check circle after the tap")
            return
        }
        let expected = initialLabel == "Mark complete" ? "Completed" : "Mark complete"
        XCTAssertEqual(checkCircleAfter.label, expected, "check circle label didn't flip after tapping it — the tap may not have reached the Button")
    }

    // MARK: - Helpers

    private func installSystemAlertMonitor(_ app: XCUIApplication) {
        addUIInterruptionMonitor(withDescription: "System alerts") { alert in
            for label in ["Don't Allow", "Not Now", "Allow", "OK"] {
                if alert.buttons[label].exists {
                    alert.buttons[label].tap()
                    return true
                }
            }
            return false
        }
        app.tap()
    }

    private func signIn(_ app: XCUIApplication) {
        let email = app.textFields["Email"]
        if email.waitForExistence(timeout: 10) {
            email.tap()
            email.typeText("symphonytest4444@gmail.com")

            let password = app.secureTextFields["Password"]
            password.tap()
            password.typeText("SymphonyTest!2026")

            app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Sign In'")).firstMatch.tap()
        }
    }

    /// Drags a `SlideRow`'s content to the right far enough to snap its
    /// action panel open. `element` should be something inside the row
    /// (its title text is fine) — the drag distance matters more than the
    /// start point staying within `element`'s own bounds.
    private func revealSlideActions(_ element: XCUIElement) {
        let start = element.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5))
        let end = start.withOffset(CGVector(dx: 220, dy: 0))
        start.press(forDuration: 0.05, thenDragTo: end)
    }

    /// Finds a `CheckCircle` button ("Mark complete" / "Completed") whose row
    /// sits at roughly the given Y — check circles carry no per-task
    /// identifier, so rows are disambiguated by vertical position the same
    /// way the row-vs-dock "More" buttons are above.
    private func findCheckCircle(in app: XCUIApplication, nearY y: CGFloat) -> XCUIElement? {
        let candidates = app.buttons.matching(NSPredicate(format: "label == 'Mark complete' OR label == 'Completed'"))
        for i in 0..<candidates.count {
            let el = candidates.element(boundBy: i)
            if el.exists, abs(el.frame.minY - y) < 30 {
                return el
            }
        }
        return nil
    }

    private func attach(name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    // MARK: - Task 10: Snap a page flow (temporary, exercised for the checkpoint)

    /// Signs in, taps the dock "+", "Choose photo", picks the first photo in
    /// the simulator library (added via `xcrun simctl addmedia` before this
    /// runs — a photographed 3-line handwritten list), waits for the review
    /// sheet, screenshots it, taps "Add all", and screenshots Today after.
    @MainActor
    func testSnapPageFlow() throws {
        let app = XCUIApplication()
        app.launch()
        installSystemAlertMonitor(app)
        signIn(app)

        let today = app.staticTexts["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 30), "never reached Today")

        let addButton = app.buttons["Add"]
        XCTAssertTrue(addButton.waitForExistence(timeout: 10), "no dock Add button")
        addButton.tap()

        let choosePhoto = app.buttons["Choose photo"]
        XCTAssertTrue(choosePhoto.waitForExistence(timeout: 10), "no Choose photo option")
        choosePhoto.tap()

        // PHPicker presents out-of-process; give it a moment to transition,
        // then dismiss the "Private Access to Photos" banner if shown (it
        // occludes the top photo row — our just-added photo is newest, so it
        // sorts first/top-left).
        let bannerClose = app.buttons["Close"]
        if bannerClose.waitForExistence(timeout: 3) {
            bannerClose.tap()
            // Banner-dismiss animation; nothing distinct to wait on.
            Thread.sleep(forTimeInterval: 1)
        }

        // Tap the grid image by its picker-specific identifier — `app.images`
        // unscoped grabs the Today screen's own "plus.circle.fill" icon
        // underneath, since that window is earlier in traversal order.
        var tapped = false
        for _ in 0..<10 {
            let firstPhoto = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
            if firstPhoto.waitForExistence(timeout: 5), firstPhoto.isHittable {
                firstPhoto.tap()
                tapped = true
                break
            }
            Thread.sleep(forTimeInterval: 1)
        }
        if !tapped {
            // Force a coordinate tap at the element's center as a last resort.
            let firstPhoto = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
            if firstPhoto.exists {
                firstPhoto.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                tapped = true
            }
        }
        XCTAssertTrue(tapped, "never managed to tap the picker's first photo")

        let reviewTitle = app.navigationBars["Review page"]
        let sawReview = reviewTitle.waitForExistence(timeout: 60)
        attach(name: "page-review")

        if sawReview {
            let addAll = app.buttons["Add all"]
            if addAll.waitForExistence(timeout: 5) {
                addAll.tap()
            }
            // Commit is an async upload + parse + sync round-trip; the
            // resulting item titles vary per photographed list, so there's no
            // fixed element to wait on here.
            Thread.sleep(forTimeInterval: 4)
            attach(name: "today-after-add-all")

            let inboxTab = app.buttons["Inbox"]
            if inboxTab.waitForExistence(timeout: 10) {
                inboxTab.tap()
                // This fixture's committed item does land in Inbox as "Fix
                // fence" — wait for it instead of a fixed sleep.
                _ = app.staticTexts["Fix fence"].firstMatch.waitForExistence(timeout: 10)
                attach(name: "inbox-after-add-all")
            }
        }
    }
}
