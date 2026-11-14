import Foundation
import CoreGraphics

/// The 390 × 844 stage on a device: scaled to fit and centred. Every touch is
/// turned into stage coordinates here before it reaches the reducer, whose
/// geometry (`WalkOrb`) is all in stage space.
struct WalkStage: Equatable {
    let scale: CGFloat; let origin: CGPoint                // the stage's top-left corner on the device

    init(device: CGSize, stage: CGSize = WalkArt.stageSize) {
        let scale = min(device.width / stage.width, device.height / stage.height)
        self.scale = scale
        origin = CGPoint(x: (device.width - stage.width * scale) / 2, y: (device.height - stage.height * scale) / 2)
    }

    func toStage(_ devicePoint: CGPoint) -> CGPoint {
        CGPoint(x: (devicePoint.x - origin.x) / scale, y: (devicePoint.y - origin.y) / scale)
    }

    func toDevice(_ stagePoint: CGPoint) -> CGPoint {
        CGPoint(x: origin.x + stagePoint.x * scale, y: origin.y + stagePoint.y * scale)
    }
}

extension WalkOrb {
    /// The light takes a touch within this many stage points of its centre (a little past its 48 radius).
    static let touchRadius: CGFloat = 56

    /// Whether a touch, in stage coordinates, lands on the light; the edge counts.
    static func hits(_ stagePoint: CGPoint) -> Bool {
        hypot(stagePoint.x - centre.x, stagePoint.y - centre.y) <= touchRadius
    }
}
