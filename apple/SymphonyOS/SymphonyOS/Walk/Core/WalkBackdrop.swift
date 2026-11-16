import Foundation
import CoreGraphics

/// The picture behind the walk, with a camera of its own. The layout stays in its own art's world
/// (the square print's numbers: bands, stops, every guarantee); the picture is the tall overlook
/// painting (`WalkArt+Tall.swift`), drawn on the stage by its own camera: for each step a stop that
/// stands the step's own band on that level's measured ground, and the standing post and the side
/// posts on land. The layout's camera is always the step's stop (there is no zoom), so the picture
/// moves only from one step to the next.
///
/// On a window wider than the board the picture covers the whole window (the board plus its
/// bleed, `WalkStage.window`) by three rules, in order: it is enlarged about the step's anchor
/// (`anchor(step:)`) until the stretch of mountain the phone shows reaches the farther side
/// (`widened`); never past `sharpest` times its pixels, unless covering the window needs more;
/// then slid the least that keeps the window on the painting (`held`). Never mirrored or faded.
/// A window with nothing beside the board (a phone, whatever its size) keeps the phone's camera,
/// only held on its own window: a sliver above and below the board is painting too.
struct WalkBackdrop: Equatable {
    let imageName: String
    /// The painting in its own points (`stage = (point − camera) × k`).
    let size: CGSize
    /// Where each level stands on the painting, as fractions of its height, and its ground.
    let bands: [WalkLevel: CGFloat]
    let land: [WalkLevel: ClosedRange<CGFloat>]
    /// Across each level's band, the open ground (fractions of the width) the step's columns stand on.
    let open: [WalkLevel: ClosedRange<CGFloat>]
    /// Seven, Welcome … Look back up: the picture's camera on each step.
    let stops: [WalkLayout.Camera]
    /// Per step, the top shade's strength where the painting behind the words is bright (nil: the
    /// walk's own faint band). It holds from the top to the question's foot (`WalkLayout.question`)
    /// and fades out over `shadeFade`, so every word above the flags reads at 4.5:1 on the painting.
    let shade: [Double?]
    /// Per step, the held shade on a stretched stage (one with wings), where the enlarged picture
    /// brings brighter paint up behind the words than the phone has there (nil: as `shade`).
    let stretchedShade: [Double?]
    static let shadeFade: CGFloat = 50
    /// The bundled picture's pixels across its width, and the most it is ever enlarged past them on a 3x screen.
    static let pixelsAcross: CGFloat = 2048
    static let sharpest: CGFloat = 1.6

    func bandY(_ level: WalkLevel) -> CGFloat { (bands[level] ?? 0) * size.height }

    /// The stage point the picture is enlarged about on a wider window, so what stands there keeps
    /// its ground: the standing post's foot on Year to Today, the mountain's own places on Welcome
    /// and on Look back up.
    static func anchor(step: Int) -> CGPoint {
        switch step {
        case ...0: CGPoint(x: 195, y: 328)
        case 6...: CGPoint(x: 195, y: 321)
        default: CGPoint(x: 195, y: 556)
        }
    }

    /// The camera enlarged about `anchor` for a stage that runs past the board's sides: by as much
    /// as the stage's farther side is wider than the board's (so that side shows no more mountain
    /// than the phone does), but never past `sharpest` times the picture's pixels on a 3x screen
    /// unless covering the window needs more. A stage with nothing beside the board (a phone,
    /// whatever its size) keeps the camera it was given.
    func widened(_ c: WalkLayout.Camera, about anchor: CGPoint, on stage: WalkStage) -> WalkLayout.Camera {
        let beside = max(stage.bleed.left, stage.bleed.right)
        guard beside > 0 else { return c }
        let window = stage.window
        let enlarged = c.k * ((stage.board.width + 2 * beside) / stage.board.width)
        let sharp = Self.sharpest * Self.pixelsAcross / (3 * stage.scale * size.width)
        let covers = max(window.width / size.width, window.height / size.height)
        let k = min(enlarged, max(sharp, covers))
        // The anchor shows the same spot of the painting as before: c + anchor / c.k.
        return WalkLayout.Camera(x: c.x + (anchor.x / c.k - anchor.x / k), y: c.y + (anchor.y / c.k - anchor.y / k), k: k)
    }

    /// The camera moved the least that keeps `window` (a stage's board plus its bleed, in stage
    /// points) wholly on the painting.
    func held(_ c: WalkLayout.Camera, window: CGRect) -> WalkLayout.Camera {
        let k = max(c.k, window.width / size.width, window.height / size.height)
        return WalkLayout.Camera(x: min(max(0 - window.minX / k, c.x), size.width - window.maxX / k),
                                 y: min(max(0 - window.minY / k, c.y), size.height - window.maxY / k), k: k)
    }

    /// The tall overlook behind the walk. Each level step stands its band (at the stage y the
    /// layout puts that step's own band: 535.5 on Year, 560 below) on the level's measured ground,
    /// with its scale and left edge chosen so the columns stand on that level's open ground.
    static let tallOverlook: WalkBackdrop = {
        let size = CGSize(width: 1300, height: 3900)
        let bands: [WalkLevel: CGFloat] = [.year: 0.345, .season: 0.435, .month: 0.52, .week: 0.695, .today: 0.855]
        let square = WalkArt.squarePrint
        /// A level's step: the layout's own band for that step lands on the painting's band.
        func step(_ level: WalkLevel, k: CGFloat, x: CGFloat) -> WalkLayout.Camera {
            let stop = square.stops[level.rawValue]
            let stageY = (square.bandY(level) - stop.y) * stop.k
            return WalkLayout.Camera(x: x, y: bands[level]! * size.height - stageY / k, k: k)
        }
        let lookBack = square.stops[6]
        let yearOnLookBack = (square.bandY(.year) - lookBack.y) * lookBack.k
        return WalkBackdrop(
            imageName: "WalkOverlookTall",
            size: size,
            bands: bands,
            land: [.year: 0.335...0.36, .season: 0.425...0.445, .month: 0.51...0.53,
                   .week: 0.685...0.705, .today: 0.845...0.87],
            // Year: the pale flats right of the upper pine; Season: the foothill flank right of its
            // branches; Month: hill and fields between the river's arms; Week: the meadow; Today: the ledge.
            open: [.year: 0.38...0.88, .season: 0.36...0.92, .month: 0.36...0.78,
                   .week: 0.42...0.88, .today: 0.18...0.92],
            stops: [
                WalkLayout.Camera(x: 0, y: 0, k: 0.30),        // Welcome: the sky down to the meadow, the whole width
                // Year: closer than the board's 0.42 at x 340, so the side posts' high row stands on the
                // peaks, not in the sky (Task 6).
                step(.year, k: 0.55, x: 464),
                step(.season, k: 0.45, x: 360),
                // Month: further left than the board's x 370, so the side posts stand on the fields and
                // the hill between the river's arms, not on the river (Task 6).
                step(.month, k: 0.50, x: 290),
                step(.week, k: 0.50, x: 450),
                step(.today, k: 0.52, x: 300),
                // Look back up: the whole width, the year flags on the high flats, the rest below them.
                WalkLayout.Camera(x: 0, y: bands[.year]! * size.height - yearOnLookBack / 0.30, k: 0.30),
            ],
            // Year, Welcome and Look back up have dark sky behind the words; from Season
            // down the snow, the braided flats, the river and the meadow stand behind them.
            shade: [nil, nil, 0.6, 0.6, 0.6, 0.5, nil],
            // Look back up, enlarged about the year's flats, has the peak's snow behind its heading.
            stretchedShade: [nil, nil, nil, nil, nil, nil, 0.6]
        )
    }()
}

extension WalkArt {
    /// Where the picture stands on `step`, on the window `on` stands for: the step's backdrop stop,
    /// then, on a window wider than the board, enlarged about the step's anchor
    /// (`WalkBackdrop.widened`), then held so the whole window is on the painting. On the board's own
    /// window (the default) that is the stop, held; on a taller phone the same, slid only as far as
    /// the sliver above or below the board needs. Nil with no backdrop.
    func backdropCamera(step: Int, stage on: WalkStage = WalkStage(device: WalkArt.stageSize)) -> WalkLayout.Camera? {
        guard let backdrop, !backdrop.stops.isEmpty else { return nil }
        let stop = backdrop.stops[min(max(0, step), backdrop.stops.count - 1)]
        return backdrop.held(backdrop.widened(stop, about: WalkBackdrop.anchor(step: step), on: on), window: on.window)
    }

    /// The top shade's strength on a step where the painting behind the words needs one; nil: the
    /// faint band. On a stretched stage (one with wings) a step may hold a stronger one of its own
    /// (`WalkBackdrop.stretchedShade`); the board's own window (the default) has the phone's.
    func topShade(step: Int, stage on: WalkStage = WalkStage(device: WalkArt.stageSize)) -> Double? {
        guard let backdrop, !backdrop.shade.isEmpty else { return nil }
        let at = min(max(0, step), backdrop.shade.count - 1)
        if on.stretch > 1, at < backdrop.stretchedShade.count, let stretched = backdrop.stretchedShade[at] { return stretched }
        return backdrop.shade[at]
    }
}
