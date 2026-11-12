import Foundation
import CoreGraphics

/// The rules behind the iPhone Duo's notebook cover (Scott, 2026-11-12): the
/// outside screen opens on a closed, black notebook with an elastic band.
/// Pull the band off and let it go — it snaps — and the cover swings open
/// onto Today. Pure math and decisions, kept apart from the view so they're
/// testable.
enum NotebookCoverRules {
    /// The Settings switch (on unless turned off).
    static let enabledKey = "notebookCover.enabled"

    /// The outside screen's shape: 466×678 upright, 678×466 sideways. Regular
    /// iPhones are far narrower for their length (about 1:2.2); the inside
    /// screen (626×890) is wider than this range on its short side.
    static let shortSide: ClosedRange<CGFloat> = 400...540
    static let longSide: ClosedRange<CGFloat> = 600...740

    /// Whether a phone window of this size is the Duo's outside screen.
    /// A window with a fold is the inside screen, whatever its size.
    static func isOutsideScreen(_ size: CGSize, hasFold: Bool) -> Bool {
        guard !hasFold, size.width > 0, size.height > 0 else { return false }
        let short = min(size.width, size.height), long = max(size.width, size.height)
        return shortSide.contains(short) && longSide.contains(long)
    }

    /// The farthest the band stretches, however far the finger goes.
    static let maxStretch: CGFloat = 150
    /// Let go past this and the band snaps and the cover opens; short of it,
    /// the band just slides back.
    static let snapDistance: CGFloat = 72

    /// The finger's sideways travel → how far the band stretches. One to one
    /// at first, then stiffer, never past `maxStretch` — an elastic, not a
    /// string.
    static func stretch(forDrag drag: CGFloat) -> CGFloat {
        let magnitude = maxStretch * (1 - exp(-abs(drag) / maxStretch))
        return drag < 0 ? -magnitude : magnitude
    }

    /// Whether letting go at this stretch snaps the band.
    static func snaps(atStretch stretch: CGFloat) -> Bool {
        abs(stretch) >= snapDistance
    }

    /// A stretched band thins, as rubber does: down to 60% at full stretch.
    static func bandWidth(rest: CGFloat, stretch: CGFloat) -> CGFloat {
        rest * (1 - 0.4 * min(1, abs(stretch) / maxStretch))
    }

    /// Where the band runs: near the cover's opening edge, as on a real
    /// notebook (the right edge, or the left in right-to-left).
    static func bandX(width: CGFloat) -> CGFloat {
        width - max(30, width * 0.085)
    }
}
