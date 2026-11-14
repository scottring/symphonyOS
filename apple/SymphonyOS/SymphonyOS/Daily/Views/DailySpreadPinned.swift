#if os(iOS)
import SwiftUI
import UIKit

/// Debug only: showing the Duo opened flat (`.journal`) on a phone simulator, for screenshots and
/// UI tests. `-TodaySize 890x626` pins the window's size (`TodayView.pinnedSize`) and the Planner's
/// `PinnedFit` scales it to the screen and gives it the board's insets; this pins the fold. Release: inert.
enum DailySpreadPinned {
    /// `-SpreadFold 435` (demo only): the pages meet there, as a real Duo may report its fold.
    static let fold: CGFloat? = {
        #if DEBUG
        guard DemoMode.isOn else { return nil }
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-SpreadFold"), i + 1 < args.count, let x = Double(args[i + 1]) else { return nil }
        return CGFloat(x)
        #else
        return nil
        #endif
    }()
}

#endif
