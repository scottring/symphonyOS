import Testing
import Foundation
import CoreGraphics
@testable import Symphony

private func near(_ a: CGFloat, _ b: CGFloat, _ tolerance: CGFloat) -> Bool { abs(a - b) <= tolerance }

/// The device ↔ stage mapping every touch goes through, and the orb's touch circle.
struct WalkStageTests {
    @Test func aRegularPhoneIsTheStage() {
        let stage = WalkStage(device: CGSize(width: 390, height: 844))
        #expect(stage.scale == 1)
        #expect(stage.origin == .zero)
    }

    @Test func aBiggerPhoneScalesUp() {
        let stage = WalkStage(device: CGSize(width: 430, height: 932))
        #expect(near(stage.scale, 1.1026, 0.001))
        #expect(near(stage.origin.x, 0, 0.001))
        #expect(near(stage.origin.y, 0.72, 0.05))
    }

    /// On the board's own window nothing runs past it: no wings, no bleed, and a touch is the board's 44.
    /// A phone a little taller for its width (402 × 874) fills its width, with a sliver at top and foot.
    @Test func aPhoneHasNoWings() {
        let stage = WalkStage(device: CGSize(width: 390, height: 844))
        #expect(stage.scale == 1)
        #expect(stage.origin == .zero)
        #expect(stage.wing == 0)
        #expect(stage.bleed == WalkStage.Bleed(left: 0, right: 0, top: 0, bottom: 0))
        #expect(stage.stretch == 1)
        #expect(stage.touch == 44)
        let taller = WalkStage(device: CGSize(width: 402, height: 874))
        #expect(taller.wing == 0 && taller.stretch == 1)
        #expect(taller.bleed.left == 0 && taller.bleed.right == 0)
        #expect(near(taller.bleed.top, 1.95, 0.01) && near(taller.bleed.bottom, 1.95, 0.01))
        #expect(taller.touch == 44)
    }

    /// A window wider for its height than the board: the board stands in the middle at the height's
    /// scale, with a wing either side (in stage points). Where the board is drawn smaller than life,
    /// a touch shape grows so it is still 44 real points.
    @Test func aWiderWindowHasWings() {
        let half = WalkStage(device: CGSize(width: 484, height: 669))
        #expect(near(half.scale, 0.7927, 0.0001))
        #expect(near(half.wing, 110.3, 0.05))
        #expect(near(half.origin.x, 87.4, 0.05) && near(half.origin.y, 0, 0.001))
        #expect(half.bleed == WalkStage.Bleed(left: half.wing, right: half.wing, top: 0, bottom: 0))
        #expect(near(half.stretch, (390 + 2 * 110.3) / 390, 0.001))
        #expect(near(WalkStage(device: CGSize(width: 669, height: 951)).wing, 101.9, 0.05))
        #expect(WalkStage(device: CGSize(width: 669, height: 951)).touch == 44)
        #expect(near(WalkStage(device: CGSize(width: 951, height: 669)).wing, 404.9, 0.05))
        let narrow = WalkStage(device: CGSize(width: 375, height: 667))
        #expect(near(narrow.wing, 42.3, 0.05))
        #expect(near(narrow.touch, 55.7, 0.05))
    }

    /// The Duo's outside screen keeps a system column 84 points wide down one side: the board is
    /// centred in the room beside it, and the bleed on that side runs on under the column.
    @Test func theOutsideScreenStandsClearOfTheColumn() {
        let stage = WalkStage(device: CGSize(width: 466, height: 678), right: 84)
        #expect(near(stage.scale, 0.8033, 0.0001))
        #expect(near(stage.origin.x, 34.35, 0.05) && near(stage.origin.y, 0, 0.001))
        #expect(near(stage.wing, 42.8, 0.05))
        #expect(near(stage.bleed.left, 42.8, 0.05))
        #expect(near(stage.bleed.right, 147.3, 0.05))
        let light = stage.toDevice(WalkOrb.centre)
        #expect(near(light.x, 191, 0.05))                 // the middle of the 382 beside the column
        #expect(near(light.y, 544.65, 0.2))
        let mirrored = WalkStage(device: CGSize(width: 466, height: 678), left: 84)
        #expect(near(mirrored.toDevice(WalkOrb.centre).x, 275, 0.05))
        #expect(near(mirrored.bleed.left, 147.3, 0.05) && near(mirrored.bleed.right, 42.8, 0.05))
    }

    /// The board plus its bleed is the window, edge to edge, on every shape: what covers the one covers the other.
    @Test func theBoardPlusItsBleedIsTheWindow() {
        for (name, device, stage) in WalkWindows.all {
            let window = stage.window
            let topLeft = stage.toDevice(CGPoint(x: window.minX, y: window.minY))
            let bottomRight = stage.toDevice(CGPoint(x: window.maxX, y: window.maxY))
            #expect(near(topLeft.x, 0, 0.001) && near(topLeft.y, 0, 0.001), "\(name)")
            #expect(near(bottomRight.x, device.width, 0.001) && near(bottomRight.y, device.height, 0.001), "\(name)")
            #expect(window.contains(CGRect(origin: .zero, size: WalkArt.stageSize)), "\(name)")
        }
    }

    @Test func pointsRoundTrip() {
        for (name, _, stage) in WalkWindows.all {
            for p in [CGPoint(x: 195, y: 678), CGPoint(x: 0, y: 0), CGPoint(x: -stage.wing, y: 844)] {
                let back = stage.toStage(stage.toDevice(p))
                #expect(near(back.x, p.x, 0.001) && near(back.y, p.y, 0.001), "\(name)")
            }
        }
    }

    @Test func aTouchOnTheLightCounts() {
        #expect(WalkOrb.hits(CGPoint(x: 195, y: 678)))
        #expect(WalkOrb.hits(CGPoint(x: 195, y: 622)))          // exactly 56 away: the edge counts
        #expect(!WalkOrb.hits(CGPoint(x: 195, y: 621)))
        #expect(!WalkOrb.hits(CGPoint(x: 252, y: 678)))
    }
}

/// The six windows the walk is checked on: the board's own phone, the narrow phone, the Duo's outside
/// screen (the system's 84-point column on its right), half the inside screen, the inside screen
/// upright, and opened flat.
enum WalkWindows {
    static let phone = WalkStage(device: CGSize(width: 390, height: 844))
    static let narrow = WalkStage(device: CGSize(width: 375, height: 667))
    static let outside = WalkStage(device: CGSize(width: 466, height: 678), right: 84)
    static let half = WalkStage(device: CGSize(width: 484, height: 669))
    static let upright = WalkStage(device: CGSize(width: 669, height: 951))
    static let flat = WalkStage(device: CGSize(width: 951, height: 669))

    static let all: [(name: String, device: CGSize, stage: WalkStage)] = [
        ("390x844", CGSize(width: 390, height: 844), phone),
        ("375x667", CGSize(width: 375, height: 667), narrow),
        ("466x678, column right", CGSize(width: 466, height: 678), outside),
        ("484x669", CGSize(width: 484, height: 669), half),
        ("669x951", CGSize(width: 669, height: 951), upright),
        ("951x669", CGSize(width: 951, height: 669), flat),
    ]
}
