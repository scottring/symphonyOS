import Foundation
import CoreGraphics

/// How the posts stand. `.level` is the ruled geometry of the mockup contract: every
/// post on its band line, upright, its cloth square. `.natural` (the app's) plants each
/// post by hand: its base a little above or below the line, its bare pole a little
/// longer or shorter, the post a little off upright, each cloth hanging a little askew.
///
/// The hand is fixed, not random: a pure function of identity (a post by its key, a
/// banner by its item, an example by its words), the same on every launch, every device
/// and every step. Where there is no room for it, a post's hand shrinks toward level.
enum WalkFooting: Equatable {
    case level, natural

    // MARK: The hand's amplitudes, at drawn scale 1 (a distant level's are scaled with it)

    /// A post's base stands at most this far above or below its band line.
    static let ground: CGFloat = 10
    /// Neighbouring posts on one level stand at least this far apart in height.
    static let apart: CGFloat = 6
    /// The bare pole under the lowest banner (level: `WalkLayout.pole`).
    static let pole: ClosedRange<CGFloat> = 18...34
    /// A post leans at most this many degrees either way about its base.
    static let lean: Double = 1.5
    /// A cloth hangs at most this many degrees off its post's line,
    static let tilt: Double = 0.9
    /// and sits at most this far left or right of the pole line.
    static let shift: CGFloat = 2.5

    /// A fixed value in −1…1 for an identity and a trait: FNV-1a over the UTF-8 bytes
    /// of "trait:id", mixed (SplitMix64's finaliser) so ids differing only at the end spread.
    static func hand(_ id: String, _ trait: String) -> Double {
        var h: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in "\(trait):\(id)".utf8 {
            h ^= UInt64(byte)
            h = h &* 0x0000_0100_0000_01b3
        }
        h ^= h >> 30; h = h &* 0xbf58_476d_1ce4_e5b9
        h ^= h >> 27; h = h &* 0x94d0_49bb_1331_11eb
        h ^= h >> 31
        return Double(h >> 11) / Double(UInt64(1) << 52) - 1
    }
}

/// The plane geometry of a turned cloth: its corners, their bounding box, and whether
/// two turned cloths meet.
enum WalkTurn {
    /// The corners of `rect` turned `degrees` clockwise (on screen, y down) about `pivot`.
    static func corners(_ rect: CGRect, degrees: Double, about pivot: CGPoint) -> [CGPoint] {
        let points = [CGPoint(x: rect.minX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.minY),
                      CGPoint(x: rect.maxX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.maxY)]
        guard degrees != 0 else { return points }
        return points.map { turned($0, degrees: degrees, about: pivot) }
    }

    /// A point turned `degrees` clockwise (on screen) about `pivot`.
    static func turned(_ p: CGPoint, degrees: Double, about pivot: CGPoint) -> CGPoint {
        let r = CGFloat(degrees * .pi / 180)
        let dx = p.x - pivot.x, dy = p.y - pivot.y
        return CGPoint(x: pivot.x + dx * cos(r) - dy * sin(r), y: pivot.y + dx * sin(r) + dy * cos(r))
    }

    static func bounds(_ points: [CGPoint]) -> CGRect {
        let xs = points.map(\.x), ys = points.map(\.y)
        guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return .null }
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }

    /// Whether two convex outlines overlap by more than `tolerance` (touching is not meeting):
    /// no edge of either separates them.
    static func meet(_ a: [CGPoint], _ b: [CGPoint], tolerance: CGFloat = 0.01) -> Bool {
        for poly in [a, b] {
            for i in poly.indices {
                let p = poly[i], q = poly[(i + 1) % poly.count]
                let axis = CGPoint(x: q.y - p.y, y: p.x - q.x)
                let length = hypot(axis.x, axis.y)
                guard length > 0 else { continue }
                let project = { (pts: [CGPoint]) -> (CGFloat, CGFloat) in
                    let d = pts.map { ($0.x * axis.x + $0.y * axis.y) / length }
                    return (d.min()!, d.max()!)
                }
                let (aMin, aMax) = project(a), (bMin, bMax) = project(b)
                if aMax <= bMin + tolerance || bMax <= aMin + tolerance { return false }
            }
        }
        return true
    }
}
