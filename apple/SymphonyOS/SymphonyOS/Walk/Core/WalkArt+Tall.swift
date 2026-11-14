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
    /// One everyday view's cut of the tall painting. The view's square `picture` frame
    /// (`DailyMetrics`, `DailyTent`), whose numbers never change, stands for `region` of the
    /// painting (fractions of its width and height; square in pixels, its height a third of its
    /// width); the cut is only the part of that frame that can ever show (`shown`, fractions of
    /// the frame: the frame within the band or the look half on every window it is drawn on,
    /// Today's with the handover's lowered sheet), drawn into that part of the frame (`drawn`).
    /// Its pixels: `side` for the whole frame (its largest use at 3x, never more than the region
    /// holds) times `shown`. `scripts/cut-overlook.sh` carries the same numbers.
    enum Cut: CaseIterable {
        /// Today, tall, on a phone: standing on the ledge, its top edge at the band's foot, the meadow and forest above.
        case todayTall
        /// Today, tall, on a window whose frame is much deeper than its band (the Duo's upright
        /// screen): the forest down to the ledge's top edge, which stands at the band's foot.
        case todayWide
        /// Today, short (a short phone, the Duo's outside screen): the forest down to the ledge.
        case todayShort
        /// Week: the meadow, where the band's month flags stand, under the forested ridge.
        case week
        /// Week on a window whose frame is much deeper than its band: the flags' feet still on the meadow.
        case weekWide
        /// The half-open display's look half, laptop and book: the peaks behind the time, the flats below.
        case halfOpenLaptop, halfOpenBook

        var imageName: String {
            switch self {
            case .todayTall: "OverlookToday"
            case .todayWide: "OverlookTodayWide"
            case .todayShort: "OverlookTodayShort"
            case .week: "OverlookWeek"
            case .weekWide: "OverlookWeekWide"
            case .halfOpenLaptop: "OverlookHalfOpenLaptop"
            case .halfOpenBook: "OverlookHalfOpenBook"
            }
        }

        /// The painting behind the whole frame: left, top and width, as fractions of the painting's width and height.
        var region: CGRect {
            let (x, y, w): (CGFloat, CGFloat, CGFloat)
            switch self {
            case .todayTall: (x, y, w) = (0, 0.620, 1)
            case .todayWide: (x, y, w) = (0, 0.7167, 0.85)
            case .todayShort: (x, y, w) = (0, 0.683, 0.95)
            case .week: (x, y, w) = (0.2, 0.498, 0.8)
            case .weekWide: (x, y, w) = (0.2, 0.5243, 0.8)
            case .halfOpenLaptop: (x, y, w) = (0, 0.220, 1)
            case .halfOpenBook: (x, y, w) = (0, 0.215, 1)
            }
            return CGRect(x: x, y: y, width: w, height: w / WalkArt.tallAspect)
        }

        /// The part of the frame that can ever show, as fractions of the frame.
        var shown: CGRect {
            switch self {
            case .todayTall: CGRect(x: 0.046, y: 0, width: 0.908, height: 1)
            case .todayWide: CGRect(x: 0.046, y: 0, width: 0.908, height: 0.718)
            case .todayShort: CGRect(x: 0.034, y: 0.068, width: 0.932, height: 0.932)
            case .week: CGRect(x: 0.214, y: 0.471, width: 0.558, height: 0.374)
            case .weekWide: CGRect(x: 0.214, y: 0.471, width: 0.558, height: 0.225)
            case .halfOpenLaptop: CGRect(x: 0.152, y: 0.133, width: 0.696, height: 0.496)
            case .halfOpenBook: CGRect(x: 0.33, y: 0.15, width: 0.446, height: 0.729)
            }
        }

        /// The whole frame's side in pixels: its largest use at 3x, or all the region holds.
        var side: Int {
            switch self {
            case .todayTall: 1456            // 485.1 pt on a 440-point phone
            case .todayWide: 2071            // 690.2 pt on the Duo's 626-point upright screen
            case .todayShort: 1500           // 500 pt on the Duo's 466-point outside screen
            case .week, .weekWide: 2317      // all 0.8 of the painting's 2896 holds
            case .halfOpenLaptop: 2700       // 900 pt
            case .halfOpenBook: 2896         // the whole width (1000 pt would want 3000)
            }
        }

        /// The cut image's size in pixels: `side` times `shown`.
        var pixels: (width: Int, height: Int) {
            (Int((CGFloat(side) * shown.width).rounded()), Int((CGFloat(side) * shown.height).rounded()))
        }

        /// Where the cut is drawn for a view's square `picture` frame: its `shown` part.
        func drawn(in picture: CGRect) -> CGRect {
            CGRect(x: picture.minX + shown.minX * picture.width, y: picture.minY + shown.minY * picture.height,
                   width: shown.width * picture.width, height: shown.height * picture.height)
        }

        /// The half-open display's cut: laptop when the fold runs across, else book.
        static func halfOpen(across: Bool) -> Cut { across ? .halfOpenLaptop : .halfOpenBook }

        /// The level whose band the cut shows.
        var level: WalkLevel {
            switch self {
            case .todayTall, .todayWide, .todayShort: .today
            case .week, .weekWide: .week
            case .halfOpenLaptop, .halfOpenBook: .year
            }
        }
    }

    /// The tall painting is three times as high as it is wide.
    static let tallAspect: CGFloat = 3
    /// The master's width in pixels: the most any cut can hold.
    static let tallMasterWidth = 2896
}
