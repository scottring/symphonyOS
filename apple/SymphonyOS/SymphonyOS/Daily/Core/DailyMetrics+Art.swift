import Foundation
import CoreGraphics

extension DailyMetrics {
    /// Today's cut of the tall painting for its band: the tall shape's (the shape with the
    /// "See my whole plan" handle) or the short one's.
    var todayCut: WalkArt.Cut { lookBack != nil ? .todayTall : .todayShort }
}
