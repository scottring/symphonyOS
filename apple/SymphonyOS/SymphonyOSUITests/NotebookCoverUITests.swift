import XCTest

/// The iPhone Duo's notebook cover, end to end on the outside screen: a
/// gentle pull on the band leaves the notebook shut; a firm pull snaps the
/// band and opens onto Today.
///
/// Runs only where the app's window is the outside screen (the "iPhone Duo"
/// simulator folded); elsewhere there's no cover and it skips.
final class NotebookCoverUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testBandSnapsTheCoverOpen() throws {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Don’t Allow", "Don't Allow"] where springboard.buttons[label].exists {
            springboard.buttons[label].tap()
        }

        let app = XCUIApplication()
        app.launchArguments = ["-SymphonyDemo"]
        app.launch()

        let cover = app.buttons["Notebook cover"]
        guard cover.waitForExistence(timeout: 10) else {
            throw XCTSkip("No cover: this window isn't the iPhone Duo's outside screen.")
        }
        attach("closed")

        // The band runs near the right edge (NotebookCoverRules.bandX).
        let frame = app.windows.firstMatch.frame
        let bandX = (frame.width - max(30, frame.width * 0.085)) / frame.width
        let band = app.coordinate(withNormalizedOffset: CGVector(dx: bandX, dy: 0.5))

        // A gentle pull: the band slides back, the notebook stays shut.
        band.press(forDuration: 0.1, thenDragTo: band.withOffset(CGVector(dx: -30, dy: 0)))
        sleep(1)
        XCTAssertTrue(cover.exists, "A gentle pull shouldn't open the notebook")

        // A firm pull: it snaps, and the cover swings open onto Today.
        band.press(forDuration: 0.1, thenDragTo: band.withOffset(CGVector(dx: -220, dy: 30)))
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: cover)
        wait(for: [gone], timeout: 3)
        attach("open")
    }

    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
