import Foundation
import CoreGraphics

/// The tall overlook: one 1:3 woodblock painting, summit to ledge (the master is 2896 × 8688;
/// where it lives and how it is cut: PLANNING.md, "The art", and `scripts/cut-overlook.sh`).
/// Measured on the master, as fractions of its height: plain dark sky to 0.28; snow peaks 0.28
/// to 0.34 over pale braided flats; blue foothills 0.38 to 0.46; the river valley 0.46 to 0.58,
/// its river an S across the whole width; forested ridges from 0.60, an open meadow 0.665 to
/// 0.715 (x 0.42 to 0.90); dense forest to 0.80; the rock ledge's top edge 0.80 to 0.83, its
/// flat top to 0.93. On the left a cliff (x below 0.33, 0.58 to 0.80) and two pines whose
/// crowns reach x 0.45 at 0.345 to 0.44 and at 0.52 to 0.60.
extension WalkArt {
    /// One everyday view's square cut of the tall painting, drawn into that view's square
    /// `picture` frame (`DailyMetrics`, `DailyTent`), whose numbers never change. `region` is in
    /// fractions of the painting's width and height; it is square in pixels (its height is a
    /// third of its width) and the cut's image is `pixels` on a side: no more than its largest
    /// use needs at 3x, nor than the region holds. `scripts/cut-overlook.sh` carries the same numbers.
    enum Cut: CaseIterable {
        /// Today, tall: standing on the ledge, its top edge at the band's foot, the meadow and forest above.
        case todayTall
        /// Today, short (a short phone, the Duo's outside screen): the forest down to the ledge.
        case todayShort
        /// Week: the meadow, where the band's month flags stand, under the forested ridge.
        case week
        /// The half-open display's look half, laptop and book: the peaks behind the time, the flats below.
        case halfOpenLaptop, halfOpenBook

        var imageName: String {
            switch self {
            case .todayTall: "OverlookToday"
            case .todayShort: "OverlookTodayShort"
            case .week: "OverlookWeek"
            case .halfOpenLaptop: "OverlookHalfOpenLaptop"
            case .halfOpenBook: "OverlookHalfOpenBook"
            }
        }

        /// The region's left, top and width, as fractions of the painting's width and height.
        var region: CGRect {
            let (x, y, w): (CGFloat, CGFloat, CGFloat)
            switch self {
            case .todayTall: (x, y, w) = (0, 0.620, 1)
            case .todayShort: (x, y, w) = (0, 0.665, 1)
            case .week: (x, y, w) = (0.2, 0.498, 0.8)
            case .halfOpenLaptop: (x, y, w) = (0, 0.220, 1)
            case .halfOpenBook: (x, y, w) = (0, 0.215, 1)
            }
            return CGRect(x: x, y: y, width: w, height: w / WalkArt.tallAspect)
        }

        /// The cut's side in pixels.
        var pixels: Int {
            switch self {
            case .todayTall: 2071            // 690.2 pt wide on the Duo's 626-point upright screen
            case .todayShort: 1500           // 500 pt on the Duo's 466-point outside screen
            case .week: 2317                 // all 0.8 of the painting's 2896 holds (1124 pt on 626)
            case .halfOpenLaptop: 2700       // 900 pt
            case .halfOpenBook: 2896         // the whole width (1000 pt would want 3000)
            }
        }

        /// The half-open display's cut: laptop when the fold runs across, else book.
        static func halfOpen(across: Bool) -> Cut { across ? .halfOpenLaptop : .halfOpenBook }

        /// The level whose band the cut shows.
        var level: WalkLevel {
            switch self {
            case .todayTall, .todayShort: .today
            case .week: .week
            case .halfOpenLaptop, .halfOpenBook: .year
            }
        }
    }

    /// The tall painting is three times as high as it is wide.
    static let tallAspect: CGFloat = 3
    /// The master's width in pixels: the most any cut can hold.
    static let tallMasterWidth = 2896
}
