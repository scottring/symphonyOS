import Testing
import Foundation
@testable import Symphony

/// A goal is never placed by its words (F2): all that is left is the ground's six areas.
struct WalkClassifierTests {
    @Test func theGroundOffersSixAreasInOrder() {
        #expect(WalkClassifier.defaults == ["Health", "Home", "People", "Work", "Money", "Fun"])
    }
}
