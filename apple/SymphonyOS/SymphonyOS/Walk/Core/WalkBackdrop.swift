import Foundation
import CoreGraphics

/// The picture behind the walk, with a camera of its own. The layout stays in its own art's world
/// (the square print's numbers: bands, stops, zoom, every guarantee); the picture is the tall
/// overlook painting (`WalkArt+Tall.swift`), drawn on the stage by its own camera: for each step a
/// stop that stands the step's own band on that level's measured ground, and, when the layout's
/// camera leaves its stop (zoomed into a column), the same move applied to the picture about the
/// same stage point, held inside the painting. The step's own flags so stand on their level; the
/// levels above stand a little up-slope of theirs.
struct WalkBackdrop: Equatable {
    let imageName: String
    /// The painting in its own points (`stage = (point − camera) × k`).
    let size: CGSize
    /// Where each level stands on the painting, as fractions of its height, and its ground.
    let bands: [WalkLevel: CGFloat]
    let land: [WalkLevel: ClosedRange<CGFloat>]
    /// Across each level's band, the open ground (fractions of the width) the step's columns stand on.
    let open: [WalkLevel: ClosedRange<CGFloat>]
    /// Seven, Welcome … Look back up: the picture's camera while the layout's camera is at that step's stop.
    let stops: [WalkLayout.Camera]
    /// Per step, the top shade's strength where the painting behind the words is bright (nil: the
    /// walk's own faint band). It holds from the top to the question's foot (`WalkLayout.question`)
    /// and fades out over `shadeFade`, so every word above the flags reads at 4.5:1 on the painting.
    let shade: [Double?]
    static let shadeFade: CGFloat = 50

    func bandY(_ level: WalkLevel) -> CGFloat { (bands[level] ?? 0) * size.height }

    /// The camera moved the least that keeps the stage wholly on the painting.
    func held(_ c: WalkLayout.Camera, stage: CGSize) -> WalkLayout.Camera {
        let k = max(c.k, stage.width / size.width, stage.height / size.height)
        return WalkLayout.Camera(x: min(max(0, c.x), size.width - stage.width / k),
                                 y: min(max(0, c.y), size.height - stage.height / k), k: k)
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
                step(.year, k: 0.42, x: 340),
                step(.season, k: 0.45, x: 360),
                step(.month, k: 0.50, x: 370),
                step(.week, k: 0.50, x: 450),
                step(.today, k: 0.52, x: 300),
                // Look back up: the whole width, the year flags on the high flats, the rest below them.
                WalkLayout.Camera(x: 0, y: bands[.year]! * size.height - yearOnLookBack / 0.30, k: 0.30),
            ],
            // Year and its zoom, Welcome and Look back up have dark sky behind the words; from Season
            // down the snow, the braided flats, the river and the meadow stand behind them.
            shade: [nil, nil, 0.6, 0.6, 0.6, 0.5, nil]
        )
    }()
}

extension WalkArt {
    /// Where the picture stands on `step` while the layout's camera is `camera`: the step's
    /// backdrop stop, moved as the layout's camera moved from that step's stop (scaled by the
    /// same ratio about the same stage point), then held on the painting. Nil with no backdrop.
    func backdropCamera(step: Int, layout camera: WalkLayout.Camera) -> WalkLayout.Camera? {
        guard let backdrop, !stops.isEmpty, !backdrop.stops.isEmpty else { return nil }
        let stop = stops[min(max(0, step), stops.count - 1)]
        let b = backdrop.stops[min(max(0, step), backdrop.stops.count - 1)]
        // stage under `camera` = stage under `stop` × r + (stop − camera) × camera.k
        let k = b.k * camera.k / stop.k
        let moved = WalkLayout.Camera(x: b.x - (stop.x - camera.x) * camera.k / k,
                                      y: b.y - (stop.y - camera.y) * camera.k / k, k: k)
        return backdrop.held(moved, stage: stage)
    }

    /// The top shade's strength on a step where the painting behind the words needs one; nil: the faint band.
    func topShade(step: Int) -> Double? {
        guard let shade = backdrop?.shade, !shade.isEmpty else { return nil }
        return shade[min(max(0, step), shade.count - 1)]
    }
}
