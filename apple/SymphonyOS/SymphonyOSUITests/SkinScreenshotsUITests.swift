import XCTest

/// Signs in as the seeded test account and captures Today, Inbox, and a task
/// detail sheet so the Task 4 card-pass skin can be inspected as pictures
/// rather than inferred from types. Mirrors `CarriedOverUITests`' sign-in
/// pattern. Not part of the shipping suite's guarantees — needs the test
/// account and a network.
final class SkinScreenshotsUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testTodayInboxAndTaskSheetSkin() throws {
        let app = XCUIApplication()
        app.launch()

        addUIInterruptionMonitor(withDescription: "System alerts") { alert in
            for label in ["Don't Allow", "Not Now", "Allow"] {
                if alert.buttons[label].exists {
                    alert.buttons[label].tap()
                    return true
                }
            }
            return false
        }
        app.tap()

        let email = app.textFields["Email"]
        let sawEmailField = email.waitForExistence(timeout: 10)
        print("SKIN-DEBUG sawEmailField=\(sawEmailField)")
        if sawEmailField {
            email.tap()
            email.typeText("symphonytest4444@gmail.com")

            let password = app.secureTextFields["Password"]
            password.tap()
            password.typeText("SymphonyTest!2026")

            app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Sign In'")).firstMatch.tap()
        }

        let today = app.staticTexts["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 30), "never reached Today")
        Thread.sleep(forTimeInterval: 10)

        let todayCaptureField = app.textFields["Add to today…"]
        print("SKIN-DEBUG todayCaptureFieldExists=\(todayCaptureField.exists)")
        attach(name: "today-skin")

        // Inbox tab
        let inboxTab = app.buttons["Inbox"]
        XCTAssertTrue(inboxTab.waitForExistence(timeout: 10), "no Inbox tab")
        inboxTab.tap()
        Thread.sleep(forTimeInterval: 3)

        let inboxCaptureField = app.textFields["Add a task…"]
        print("SKIN-DEBUG inboxCaptureFieldExists=\(inboxCaptureField.exists)")
        attach(name: "inbox-skin")

        // Go back to Today and tap the visible task row to open the detail sheet
        // (Inbox is empty on the seed account, so there is nothing to tap there).
        let todayTab = app.buttons["Today"]
        XCTAssertTrue(todayTab.waitForExistence(timeout: 10), "no Today tab")
        todayTab.tap()
        Thread.sleep(forTimeInterval: 2)

        // Rows use SlideRow (swipe-right reveals action buttons; there is no
        // direct tap-to-open), mirroring the web SwipeableCard — see
        // SlideRow.swift. Swipe right, then tap "More" (task) or "Details"
        // (event) to open the detail sheet.
        let taskRow = app.staticTexts["Monthly planning session"]
        if taskRow.waitForExistence(timeout: 5) {
            taskRow.swipeRight()
            Thread.sleep(forTimeInterval: 1)

            // The revealed row action and the dock tab share the label "More" —
            // disambiguate by vertical position (the dock sits near the bottom;
            // the row is up in the timeline).
            let dockAnchorY = app.buttons["Projects"].frame.minY
            var opened = false
            for label in ["More", "Details"] {
                let candidates = app.buttons.matching(NSPredicate(format: "label == %@", label))
                for i in 0..<candidates.count {
                    let el = candidates.element(boundBy: i)
                    if el.exists, el.frame.minY < dockAnchorY - 50 {
                        el.tap()
                        opened = true
                        break
                    }
                }
                if opened { break }
            }
            print("SKIN-DEBUG openedDetailSheet=\(opened)")
        }
        Thread.sleep(forTimeInterval: 2)
        attach(name: "task-sheet-skin")
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

        let email = app.textFields["Email"]
        if email.waitForExistence(timeout: 10) {
            email.tap()
            email.typeText("symphonytest4444@gmail.com")
            let password = app.secureTextFields["Password"]
            password.tap()
            password.typeText("SymphonyTest!2026")
            app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Sign In'")).firstMatch.tap()
        }

        let today = app.staticTexts["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 30), "never reached Today")
        Thread.sleep(forTimeInterval: 5)

        let addButton = app.buttons["Add"]
        XCTAssertTrue(addButton.waitForExistence(timeout: 10), "no dock Add button")
        addButton.tap()

        let choosePhoto = app.buttons["Choose photo"]
        XCTAssertTrue(choosePhoto.waitForExistence(timeout: 10), "no Choose photo option")
        choosePhoto.tap()

        // PHPicker presents out-of-process; wait for its content, dismiss the
        // "Private Access to Photos" banner if shown (it occludes the top
        // photo row — our just-added photo is newest, so it sorts first/
        // top-left), then tap the grid image by its picker-specific
        // identifier — `app.images` unscoped grabs the Today screen's own
        // "plus.circle.fill" icon underneath, since that window is earlier
        // in traversal order.
        Thread.sleep(forTimeInterval: 2)
        let bannerClose = app.buttons["Close"]
        let sawBanner = bannerClose.exists
        print("SNAP-DEBUG sawBanner=\(sawBanner)")
        if sawBanner {
            bannerClose.tap()
            Thread.sleep(forTimeInterval: 1)
        }

        var tapped = false
        for attempt in 0..<10 {
            let firstPhoto = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
            let exists = firstPhoto.waitForExistence(timeout: 5)
            print("SNAP-DEBUG attempt=\(attempt) exists=\(exists) hittable=\(firstPhoto.isHittable) label=\(firstPhoto.label)")
            if exists, firstPhoto.isHittable {
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
        print("SNAP-DEBUG tappedPhoto=\(tapped)")

        let reviewTitle = app.navigationBars["Review page"]
        let sawReview = reviewTitle.waitForExistence(timeout: 60)
        print("SNAP-DEBUG sawReviewSheet=\(sawReview)")
        attach(name: "page-review")

        if sawReview {
            let addAll = app.buttons["Add all"]
            if addAll.waitForExistence(timeout: 5) {
                addAll.tap()
            }
            Thread.sleep(forTimeInterval: 4)
            attach(name: "today-after-add-all")

            let inboxTab = app.buttons["Inbox"]
            if inboxTab.waitForExistence(timeout: 10) {
                inboxTab.tap()
                Thread.sleep(forTimeInterval: 3)
                attach(name: "inbox-after-add-all")
            }
        }
    }
}
