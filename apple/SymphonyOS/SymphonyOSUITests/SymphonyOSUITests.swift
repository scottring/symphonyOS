import XCTest

final class SymphonyOSUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLaunchAndAuthScreen() throws {
        let app = XCUIApplication()
        app.launch()

        // Auth screen should be visible
        let symphonyText = app.staticTexts["Symphony"]
        XCTAssertTrue(symphonyText.waitForExistence(timeout: 5))
    }
}
