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

    // MARK: - F2: editing a plain row's notes must flip it to a block WITHOUT leaving Today

    /// Adds a fresh task via QuickCaptureBar (lands as a plain row — no
    /// notes), opens its detail sheet, types a note, dismisses with Done, and
    /// confirms — without navigating away from Today — that the row now
    /// renders as a block (its note line visible). Before F2 this required
    /// leaving and re-entering Today because `tasksRevision` didn't hash
    /// `notes`.
    @MainActor
    func testEditingNotesFlipsPlainRowToBlockWithoutLeavingToday() throws {
        let app = XCUIApplication()
        app.launch()
        installSystemAlertMonitor(app)
        signIn(app)

        let today = app.staticTexts["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 30), "never reached Today")

        let uniqueTitle = "F2 note check \(Int(Date().timeIntervalSince1970))"
        let field = app.textFields["Add to today…"]
        XCTAssertTrue(field.waitForExistence(timeout: 10), "no QuickCaptureBar field on Today")
        field.tap()
        field.typeText(uniqueTitle)
        app.keyboards.buttons["return"].tap()

        let row = app.staticTexts[uniqueTitle].firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 15), "new task never appeared on Today")
        attach(name: "f2-01-before-plain-row")

        // Let the post-create sync settle (push + any pull-reconcile) before
        // swiping — a mid-gesture rebuild can drop the in-flight drag.
        Thread.sleep(forTimeInterval: 2)
        XCTAssertTrue(row.exists, "row disappeared before the swipe")
        revealSlideActions(row)
        // "More" is ambiguous with the dock's own "More" tab — disambiguate
        // by Y position the same way testTodayInboxAndTaskSheetSkin does.
        let dockAnchorY = app.buttons["Projects"].frame.minY
        var openedTaskSheet = false
        let moreCandidates = app.buttons.matching(NSPredicate(format: "label == 'More'"))
        XCTAssertTrue(moreCandidates.firstMatch.waitForExistence(timeout: 5), "row action panel never revealed")
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

        let notesEditor = app.textViews.firstMatch
        XCTAssertTrue(notesEditor.waitForExistence(timeout: 5), "no notes TextEditor in task detail")
        notesEditor.tap()
        let noteText = "field is behind the gym, park on Elm"
        notesEditor.typeText(noteText)

        app.buttons["Done"].firstMatch.tap()
        // Back on Today — without ever leaving it.
        XCTAssertTrue(today.waitForExistence(timeout: 10))

        // The row must now be a BLOCK: its note line renders as visible text.
        let noteLine = app.staticTexts[noteText].firstMatch
        XCTAssertTrue(noteLine.waitForExistence(timeout: 10), "row did not flip to a block after editing notes — tasksRevision may not be hashing notes")
        attach(name: "f2-02-after-block")
    }

    // MARK: - F4: does the dock survive a NavigationLink push?

    /// More → Settings pushes a new view onto the More tab's NavigationStack.
    /// The Task 3 fix attached the dock via `.safeAreaInset` on each stack's
    /// ROOT view — verifies whether a push still shows it, or whether the
    /// pushed hosting controller covers it.
    @MainActor
    func testDockOnPushedScreen() throws {
        let app = XCUIApplication()
        app.launch()
        installSystemAlertMonitor(app)
        signIn(app)

        let today = app.staticTexts["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 30), "never reached Today")
        attach(name: "f4-01-today-dock")
        print("F4 measure: window frame = \(app.windows.firstMatch.frame)")
        print("F4 measure: Today dock button frame = \(app.buttons["Today"].frame)")
        print("F4 measure: Add dock button frame = \(app.buttons["Add"].frame)")
        print("F4 measure: Projects dock button frame = \(app.buttons["Projects"].frame)")

        let moreTab = app.buttons["More"]
        XCTAssertTrue(moreTab.waitForExistence(timeout: 10), "no More tab")
        moreTab.tap()

        let settingsRow = app.buttons["Settings"]
        XCTAssertTrue(settingsRow.waitForExistence(timeout: 10), "no Settings row in More")
        attach(name: "f4-02-more-dock")
        settingsRow.tap()

        // Something on SettingsView to confirm the push landed.
        let signedInAs = app.staticTexts["symphonytest4444@gmail.com"]
        _ = signedInAs.waitForExistence(timeout: 10)
        attach(name: "f4-03-settings-pushed")

        // The dock's own tab buttons — if the push covers the dock, these
        // won't exist at all (not just be non-hittable, since the dock view
        // itself would be off-screen/removed).
        let todayTabOnPush = app.buttons["Today"]
        let dockSurvives = todayTabOnPush.exists
        // Not an XCTAssert — this is a diagnostic run, not a pass/fail gate.
        // The report records whichever way this comes out.
        print("F4 diagnostic: dock Today tab exists on pushed Settings screen = \(dockSurvives)")
    }

    // MARK: - Scope follow-up: assigning from the phone must derive scope

    /// Opens "Fix fence"'s task detail sheet from Inbox and taps the "Kid
    /// Symphony" assignee chip (a household member other than this seed
    /// account's own "Dad Symphony" row, and not already assigned — a clean
    /// widen) — driving TaskDetailView.toggleAssignee → TaskViewModel.
    /// reconcileScope. Doesn't assert on `tasks.scope` itself (that's a
    /// server round-trip checked separately via a Management API SELECT);
    /// this only proves the tap reaches the chip and the sheet dismisses
    /// cleanly.
    @MainActor
    func testAssignFixFenceToOtherMemberDerivesScope() throws {
        let app = XCUIApplication()
        app.launch()
        installSystemAlertMonitor(app)
        signIn(app)

        let today = app.staticTexts["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 30), "never reached Today")

        let inboxTab = app.buttons["Inbox"]
        XCTAssertTrue(inboxTab.waitForExistence(timeout: 10), "no Inbox tab")
        inboxTab.tap()

        let fixFence = app.staticTexts["Fix fence"].firstMatch
        XCTAssertTrue(fixFence.waitForExistence(timeout: 15), "no 'Fix fence' row in Inbox — Task 10 seed data missing")

        revealSlideActions(fixFence)
        let whenAction = app.buttons["When"]
        XCTAssertTrue(whenAction.waitForExistence(timeout: 5), "row action panel never revealed")

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

        let kidChip = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Kid Symphony'")).firstMatch
        XCTAssertTrue(kidChip.waitForExistence(timeout: 10), "no 'Kid Symphony' assignee chip in the task sheet")
        kidChip.tap()
        attach(name: "scope-01-assigned-to-kid")

        app.buttons["Done"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Fix fence"].firstMatch.waitForExistence(timeout: 10), "never returned to Inbox after dismissing the task sheet")
    }
}
