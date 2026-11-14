import Foundation
import CoreGraphics

/// The orb's geometry, in the 390 × 844 stage: where it sits, how long a hold
/// is, how far a slide must go, and which compass point a touch is aimed at.
enum WalkOrb {
    static let centre = CGPoint(x: 195, y: 678); static let radius: CGFloat = 48
    /// The longest the walk waits, after letting go, for the recogniser's last words.
    static let finishMs = 1000
    static let holdMs = 420; static let slideOut: CGFloat = 1.4; static let window: CGFloat = 32; static let pointDistance: CGFloat = 116

    /// Where a compass point stands, in stage coordinates.
    static func position(of point: CompassPoint) -> CGPoint {
        let radians = point.degrees * .pi / 180
        return CGPoint(x: centre.x + pointDistance * cos(radians), y: centre.y + pointDistance * sin(radians))
    }

    /// Whether a touch has slid out of the orb far enough to aim at a point.
    static func isOut(_ location: CGPoint) -> Bool {
        hypot(location.x - centre.x, location.y - centre.y) >= slideOut * radius
    }

    /// The offered point nearest in angle to the touch, if it is out of the orb
    /// and within `window` degrees of that point.
    static func point(at location: CGPoint, among points: [CompassPoint]) -> CompassPoint? {
        guard isOut(location) else { return nil }
        let angle = atan2(location.y - centre.y, location.x - centre.x) * 180 / .pi
        let nearest = points
            .map { (point: $0, off: angularDistance(angle, $0.degrees)) }
            .min { $0.off < $1.off }
        guard let nearest, nearest.off < window else { return nil }
        return nearest.point
    }

    private static func angularDistance(_ a: CGFloat, _ b: CGFloat) -> CGFloat {
        var d = abs(a - b).truncatingRemainder(dividingBy: 360)
        if d > 180 { d = 360 - d }
        return d
    }
}
