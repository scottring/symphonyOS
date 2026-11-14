import Foundation
import CoreGraphics

/// One painting of the mountain, as data: where the picture sits in the world,
/// where each level stands on it (as fractions of the picture's height, so a
/// taller painting is just another value), and the camera's stop for each step.
/// The layout reads every number about the art from here and nowhere else.
struct WalkArt: Equatable {
    let imageName: String; let stage: CGSize; let world: CGSize
    let image: CGRect                                  // the picture's frame in the world
    let bands: [WalkLevel: CGFloat]                    // where a level stands, as a fraction of the picture's height
    let land: [WalkLevel: ClosedRange<CGFloat>]        // the fractions that are ground for that level
    let stops: [WalkLayout.Camera]                     // seven, Welcome … Look back up

    /// The world y where a level's posts stand.
    func bandY(_ level: WalkLevel) -> CGFloat {
        image.minY + (bands[level] ?? 0) * image.height
    }

    /// The square overlook print (contract §3): snow peaks, river valley, pines and cliff, the rock ledge.
    static let overlookSquare = WalkArt(
        imageName: "WalkOverlook",
        stage: CGSize(width: 390, height: 844),
        world: CGSize(width: 1300, height: 1720),
        image: CGRect(x: 0, y: 420, width: 1300, height: 1300),
        bands: [.year: 0.277, .season: 0.408, .month: 0.523, .week: 0.623, .today: 0.700],
        land: [.year: 0.24...0.31, .season: 0.37...0.45, .month: 0.49...0.56,
               .week: 0.59...0.66, .today: 0.685...0.74],
        stops: [
            WalkLayout.Camera(x: 0, y: -1093, k: 0.30),     // Welcome
            WalkLayout.Camera(x: 186, y: -495, k: 0.42),    // Year: its band at stage y 535.5, labels clear of the light
            WalkLayout.Camera(x: 217, y: -294, k: 0.45),    // Season
            WalkLayout.Camera(x: 244, y: -67, k: 0.48),     // Month
            WalkLayout.Camera(x: 260, y: 110, k: 0.50),     // Week
            WalkLayout.Camera(x: 275, y: 253, k: 0.52),     // Today
            WalkLayout.Camera(x: 186, y: 15, k: 0.42),      // Look back up
        ]
    )
}
