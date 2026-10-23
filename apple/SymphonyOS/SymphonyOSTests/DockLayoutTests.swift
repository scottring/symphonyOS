#if os(iOS)
import XCTest
import UIKit
@testable import Symphony

/// The side dock's frame and content inset come from the bar region the
/// system reports. Values are the ones measured on the iPhone Duo simulator
/// (outside screen, 466×678, iOS 27.1).
final class DockLayoutTests: XCTestCase {
    func testTrailingDockSitsInTheStatusBarColumnBelowTheClock() {
        let layout = DockLayout.side(.trailing, onLeft: false, window: CGSize(width: 466, height: 678),
                                     barInsets: UIEdgeInsets(top: 174, left: 370, bottom: 34, right: 24),
                                     safeInset: 84)
        XCTAssertEqual(layout.frame, CGRect(x: 370, y: 174, width: 72, height: 470))
        // Content stops at the dock's inner side, 96 in from the right edge,
        // which is further in than the 84-point safe area.
        XCTAssertEqual(layout.contentInset, 96)
    }

    func testLeadingDockMeasuresFromTheLeftEdge() {
        let layout = DockLayout.side(.leading, onLeft: true, window: CGSize(width: 466, height: 678),
                                     barInsets: UIEdgeInsets(top: 17, left: 24, bottom: 34, right: 370),
                                     safeInset: 0)
        XCTAssertEqual(layout.frame.minX, 24)
        XCTAssertEqual(layout.contentInset, 96)
    }

    func testContentNeverEntersTheSafeArea() {
        let layout = DockLayout.side(.trailing, onLeft: false, window: CGSize(width: 890, height: 626),
                                     barInsets: UIEdgeInsets(top: 0, left: 818, bottom: 0, right: 0),
                                     safeInset: 100)
        XCTAssertEqual(layout.contentInset, 100)
    }

    func testTheDefaultIsTheBottomDock() {
        XCTAssertEqual(DockLayout().edge, .bottom)
    }
}
#endif
