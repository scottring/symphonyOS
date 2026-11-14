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
    /// The tall painting as the walk's art: the world is the picture (it carries its own sky).
    /// Each level's step puts its band at the stage y the square print's stop puts it at, with
    /// the columns on the open right two-thirds (every step at k 0.52 and x 402, so the columns
    /// stand where the Year stop sets them, x 0.44 to 0.76 for up to four). Not yet the walk's:
    /// the levels stand two to five times further apart than on the square print, more than the
    /// layout's fixed zoom and its rule that every level above the step is drawn allow (see
    /// `task-art-report.md`); the everyday screens' cuts (`Cut`) come from it already.
    static let overlookTall: WalkArt = {
        let image = CGRect(x: 0, y: 0, width: 1300, height: 3900)
        let bands: [WalkLevel: CGFloat] = [.year: 0.345, .season: 0.435, .month: 0.52, .week: 0.695, .today: 0.855]
        let square = WalkArt.overlookSquare
        let k: CGFloat = 0.52, x: CGFloat = 402
        /// A level's step: its band where the square print's stop for that step puts its own.
        func step(_ level: WalkLevel) -> WalkLayout.Camera {
            let stop = square.stops[level.rawValue]
            let stageY = (square.bandY(level) - stop.y) * stop.k
            return WalkLayout.Camera(x: x, y: image.minY + bands[level]! * image.height - stageY / k, k: k)
        }
        return WalkArt(
            imageName: "WalkOverlookTall",
            stage: stageSize,
            world: image.size,
            image: image,
            bands: bands,
            land: [.year: 0.335...0.36, .season: 0.425...0.445, .month: 0.51...0.53,
                   .week: 0.685...0.705, .today: 0.845...0.87],
            stops: [
                WalkLayout.Camera(x: 0, y: 0, k: 0.30),            // Welcome: the sky down to the meadow, the whole width
                step(.year), step(.season), step(.month), step(.week), step(.today),
                WalkLayout.Camera(x: 0, y: 275, k: 0.30),          // Look back up: Year to Week, as much as the stage holds
            ]
        )
    }()

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
