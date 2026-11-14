import XCTest

extension XCUIApplication {
    /// Launches the app with its `launchArguments` (the demo's), the one way every UI test class here
    /// starts it. A launch that arrives without its arguments shows the real sign-in screen (its
    /// "Sign In" button) and none of the demo's screens: then the app is terminated and launched once
    /// more with the same arguments, and if that happens again the test fails at once, saying so,
    /// rather than timing out later on a screen that never comes. The app itself is not changed.
    func launchDemo(file: StaticString = #filePath, line: UInt = #line) {
        let demo = descendants(matching: .any).matching(NSPredicate(format:
            "identifier BEGINSWITH 'daily.' OR identifier BEGINSWITH 'walk.' OR label == 'Planner' OR label == 'Today. Switch horizon'"))
            .firstMatch
        let signIn = buttons["Sign In"]
        for attempt in 1...2 {
            launch()
            let deadline = Date().addingTimeInterval(30)
            var signedOut = false
            while Date() < deadline {
                if demo.exists { return }
                if signIn.exists { signedOut = true; break }
                Thread.sleep(forTimeInterval: 0.25)
            }
            guard signedOut else { return }      // neither yet: the test's own waits decide
            if attempt == 1 {
                terminate()
            } else {
                XCTFail("launched without the demo arguments", file: file, line: line)
            }
        }
    }
}
