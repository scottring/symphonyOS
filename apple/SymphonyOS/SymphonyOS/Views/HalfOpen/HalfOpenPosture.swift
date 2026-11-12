import Foundation
import CoreGraphics

/// How the iPhone Duo is being held, for the half-open display (Scott,
/// 2026-11-12, the approved "Duo half-open" mockup): set on a table partly
/// open, Symphony becomes a resting display and a recipe viewer.
enum DuoPosture: Equatable {
    /// Open flat, closed, or a phone without a hinge: the app as usual.
    case flat
    /// Partly open with the fold running across: the upright half is for
    /// looking, the half on the table for touching.
    case laptop
    /// Partly open with the fold running top to bottom, standing like a book:
    /// two pages.
    case book

    var isHalfOpen: Bool { self != .flat }
}

enum HalfOpen {
    /// Partly open counts from here (degrees between the halves; 180 is flat).
    static let minDegrees: Double = 45
    /// Folding below this angle brings the display up…
    static let enterBelow: Double = 140
    /// …and it stays until the phone opens past this one, so a hand holding
    /// the phone a little bent doesn't flicker it on and off.
    static let leaveAbove: Double = 155

    /// The posture for a hinge reading. `angle` is in radians (nil: no hinge
    /// reported); `fold` is the fold in window coordinates when the screen
    /// reports one; `window` is the window's size.
    static func posture(angle: Double?, partlyOpen: Bool, fold: CGRect?, window: CGSize,
                        current: DuoPosture) -> DuoPosture {
        guard partlyOpen, let angle, window.width > 0, window.height > 0 else { return .flat }
        // Only the inside screen folds; a short window is the outside screen.
        guard min(window.width, window.height) >= TodayLayout.shortHeight else { return .flat }
        let degrees = angle * 180 / .pi
        let limit = current == .flat ? enterBelow : leaveAbove
        guard degrees >= minDegrees, degrees <= limit else { return .flat }
        return across(fold: fold, window: window) ? .laptop : .book
    }

    /// Whether the fold runs across the screen (laptop). Without a reported
    /// fold the window's shape decides: the inside screen upright folds across.
    static func across(fold: CGRect?, window: CGSize) -> Bool {
        if let fold, fold.width != fold.height { return fold.width > fold.height }
        return window.height > window.width
    }

    /// Where the fold falls along the split axis of a `size` region whose
    /// top-left sits at `origin` in window coordinates; the middle when no
    /// fold is reported or it falls too near an edge.
    static func split(fold: CGRect?, origin: CGPoint, size: CGSize, across: Bool) -> CGFloat {
        let length = across ? size.height : size.width
        let half = (length / 2).rounded()
        guard let fold else { return half }
        let at = across ? fold.midY - origin.y : fold.midX - origin.x
        return at > length * 0.3 && at < length * 0.7 ? at.rounded() : half
    }

    #if DEBUG
    /// Debug builds only: `-HalfOpen laptop` or `-HalfOpen book` shows the
    /// display on any simulator (the simulator has no hinge to bend).
    static let pinned: DuoPosture? = {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-HalfOpen"), i + 1 < args.count else { return nil }
        switch args[i + 1] {
        case "laptop": return .laptop
        case "book": return .book
        default: return nil
        }
    }()
    /// `-HalfOpenCook` starts tonight's dinner as well.
    static var pinnedCooking: Bool { ProcessInfo.processInfo.arguments.contains("-HalfOpenCook") }
    #else
    static let pinned: DuoPosture? = nil
    static let pinnedCooking = false
    #endif
}
