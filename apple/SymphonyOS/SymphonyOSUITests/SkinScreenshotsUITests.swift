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
}
