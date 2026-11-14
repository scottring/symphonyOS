import Foundation
import CoreGraphics

extension DailyMetrics {
    /// The picture frame grows with the window's width and the band does not, so on a window
    /// wider than any phone (the Duo's 626-point inside screen) the band shows only the frame's
    /// top: there Today and Week draw their wide cuts, which keep their level at the band's foot.
    static let wideWindow: CGFloat = 500

    /// Today's cut of the tall painting for its band, by its shape and its window's width.
    var todayCut: WalkArt.Cut {
        guard shape == .tall else { return .todayShort }
        return size.width > Self.wideWindow ? .todayWide : .todayTall
    }

    /// Week's cut, by its window's width.
    var weekCut: WalkArt.Cut { size.width > Self.wideWindow ? .weekWide : .week }
}
