import XCTest

/// Signs in as the seeded test account and captures Today, so the carried-over
/// stance can be inspected as a picture rather than inferred from types.
///
/// Not part of the shipping suite's guarantees — it needs the test account and a
/// network — but it is the harness that proved the fix on screen.
final class CarriedOverUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testTodayShowsCollapsedCarriedOver() throws {
        let app = XCUIApplication()
        app.launch()

        // Notification permission alert (springboard, not the app).
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
        if email.waitForExistence(timeout: 10) {
            email.tap()
            email.typeText("symphonytest4444@gmail.com")

            let password = app.secureTextFields["Password"]
            password.tap()
            password.typeText("SymphonyTest!2026")

            // The sign-in button is the first non-field button on the form.
            app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Sign In'")).firstMatch.tap()
        }

        // Give the initial sync a beat to pull and reconcile.
        let today = app.staticTexts["Today"]
        XCTAssertTrue(today.waitForExistence(timeout: 30), "never reached Today")
        Thread.sleep(forTimeInterval: 8)

        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = "today-collapsed-carried-over"
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Assumes the session from the sign-in test above is still on the device.
    @MainActor
    func testCarriedOverExpandsOnTap() throws {
        let app = XCUIApplication()
        app.launch()

        addUIInterruptionMonitor(withDescription: "System alerts") { alert in
            for label in ["Not Now", "Don't Allow", "Allow"] {
                if alert.buttons[label].exists {
                    alert.buttons[label].tap()
                    return true
                }
            }
            return false
        }
        app.tap()

        let summary = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'carried over'")
        ).firstMatch
        XCTAssertTrue(summary.waitForExistence(timeout: 30), "no carried-over summary line")

        // Collapsed: the carried-over titles are not on screen.
        XCTAssertFalse(app.staticTexts["Return the library books"].exists)

        summary.tap()
        XCTAssertTrue(
            app.staticTexts["Return the library books"].waitForExistence(timeout: 5),
            "tapping the summary did not reveal the carried-over list"
        )

        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = "today-expanded-carried-over"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
