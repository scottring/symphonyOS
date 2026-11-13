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

    @Test func theDuoOutsideScreenLetterboxes() {
        let stage = WalkStage(device: CGSize(width: 466, height: 678))
        #expect(near(stage.scale, 0.8033, 0.001))
        #expect(near(stage.origin.x, 76.35, 0.1))
        #expect(near(stage.origin.y, 0, 0.001))
        let orb = stage.toDevice(WalkOrb.centre)
        #expect(near(orb.x, 233.0, 0.2))
        #expect(near(orb.y, 544.65, 0.2))
    }

    @Test func pointsRoundTrip() {
        let devices = [CGSize(width: 390, height: 844), CGSize(width: 430, height: 932), CGSize(width: 466, height: 678)]
        for device in devices {
            let stage = WalkStage(device: device)
            for p in [CGPoint(x: 195, y: 678), CGPoint(x: 0, y: 0)] {
                let back = stage.toStage(stage.toDevice(p))
                #expect(near(back.x, p.x, 0.001) && near(back.y, p.y, 0.001))
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
