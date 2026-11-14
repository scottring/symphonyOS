import Testing
import Foundation
import CoreGraphics
#if os(iOS)
import UIKit
#endif
@testable import Symphony

/// The tall painting behind the walk (`WalkBackdrop`): the layout stays in the square print's
/// world, and the picture has a camera of its own for each step and each zoom.
struct WalkBackdropTests {
    private let art = WalkArt.overlookSquare
    private var backdrop: WalkBackdrop { art.backdrop! }
    private static let today = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 13))!

    /// Where a stage point shows on the painting, as fractions of its width and height.
    private func onPainting(_ p: CGPoint, _ c: WalkLayout.Camera) -> CGPoint {
        CGPoint(x: (c.x + p.x / c.k) / backdrop.size.width, y: (c.y + p.y / c.k) / backdrop.size.height)
    }

    private func ridge(_ count: Int) -> [WalkArea] {
        (0..<count).map { WalkArea(id: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012x", 100 + $0))!, name: "Area \($0)") }
    }

    @Test func theWalkDrawsTheTallPaintingAndTheLayoutKeepsTheSquareWorld() {
        #expect(backdrop.imageName == "WalkOverlookTall")
        #expect(backdrop.size == CGSize(width: 1300, height: 3900))
        #expect(backdrop.stops.count == 7 && backdrop.shade.count == 7)
        // The layout's numbers are the square print's, untouched.
        var plain = art
        plain.backdrop = nil
        #expect(plain == WalkArt.squarePrint)
        for level in WalkLevel.allCases {
            #expect(backdrop.land[level]!.contains(backdrop.bands[level]!))
        }
    }

    /// On each level's step the layout's own band (535.5 on Year, 560 below) lands on that level's ground.
    @Test func eachStepsOwnBandStandsOnItsLevel() {
        for level in WalkLevel.allCases {
            let step = level.rawValue, stop = art.stops[step]
            let stageY = (art.bandY(level) - stop.y) * stop.k
            let picture = art.backdropCamera(step: step, layout: stop)!
            let y = onPainting(CGPoint(x: 195, y: stageY), picture).y
            #expect(backdrop.land[level]!.contains(y), "\(level): band at \(y)")
            #expect(abs(y - backdrop.bands[level]!) < 0.0001, "\(level)")
        }
    }

    /// Up to four kept areas, the step's own posts stand on that level's open ground.
    @Test func eachStepsColumnsStandOnOpenGround() {
        for level in WalkLevel.allCases {
            for count in 1...4 {
                var s = WalkState()
                s.areas = ridge(count)
                s.kept = s.areas.map(\.id)
                s.step = level.rawValue
                s.items = s.areas.map { WalkItem(id: UUID(), level: level == .today ? .week : level, title: "Flag", areaId: $0.id) }
                if level == .today { s.firstThing = s.items.first?.id }
                let layout = WalkLayout.make(s, today: Self.today, art: art, footing: .level)
                #expect(layout.camera == art.stops[level.rawValue], "\(level), \(count) areas: zoomed")
                let picture = art.backdropCamera(step: level.rawValue, layout: layout.camera)!
                #expect(layout.posts.contains { $0.key.level == level }, "\(level), \(count) areas: no post")
                for post in layout.posts where post.key.level == level {
                    let x = onPainting(post.base, picture).x
                    #expect(backdrop.open[level]!.contains(x), "\(level), \(count) areas: a post at x \(x)")
                }
            }
        }
    }

    /// Going down: from Year to Today the painting moves up the screen, step by step.
    @Test func thePaintingMovesUpStepByStep() {
        let ys = (1...5).map { art.backdropCamera(step: $0, layout: art.stops[$0])!.y }
        #expect(zip(ys, ys.dropFirst()).allSatisfy { $0 < $1 }, "\(ys)")
        // Welcome shows the mountain from the sky down: the painting's top at the stage's top.
        let welcome = art.backdropCamera(step: 0, layout: art.stops[0])!
        #expect(welcome.y == 0 && welcome.x == 0)
    }

    /// Zoomed into a column, the picture zooms by the layout's ratio about the same stage point: a
    /// stage point that showed a spot of the painting before shows it where the layout moves it.
    @Test func aZoomMovesThePictureAsItMovesTheFlags() {
        for step in 1...5 {
            for count in 1...WalkLoad.maxAreas {
                var s = WalkState()
                s.areas = ridge(count)
                s.kept = s.areas.map(\.id)
                s.step = step
                let column = s.areas[count / 2].id
                if step == 1 {
                    s.focusArea = column
                } else {
                    let parent = WalkItem(id: UUID(), level: WalkLevel(rawValue: step - 1)!, title: "Parent", areaId: column)
                    s.items = [parent]
                    s.focus[WalkLevel(rawValue: step)!] = parent.id
                }
                let zoom = WalkLayout.make(s, today: Self.today, art: art, footing: .level).camera
                #expect(zoom.k == WalkLayout.zoomK)
                let stop = art.stops[step], before = art.backdropCamera(step: step, layout: stop)!
                let after = art.backdropCamera(step: step, layout: zoom)!
                #expect(abs(after.k / before.k - zoom.k / stop.k) < 0.0001)
                // The column's foot, on the stage before and after the zoom, shows one spot of the painting
                // (unless holding the picture on the painting moved it).
                let world = CGPoint(x: zoom.x + WalkLayout.centreX / zoom.k, y: art.bandY(WalkLevel(rawValue: step)!))
                let a = CGPoint(x: (world.x - stop.x) * stop.k, y: (world.y - stop.y) * stop.k)
                let b = CGPoint(x: (world.x - zoom.x) * zoom.k, y: (world.y - zoom.y) * zoom.k)
                let unheld = WalkLayout.Camera(x: before.x - (stop.x - zoom.x) * zoom.k / after.k,
                                               y: before.y - (stop.y - zoom.y) * zoom.k / after.k, k: after.k)
                if unheld == after {
                    let p = onPainting(a, before), q = onPainting(b, after)
                    #expect(abs(p.x - q.x) < 0.0001 && abs(p.y - q.y) < 0.0001, "step \(step), \(count) areas")
                }
            }
        }
    }

    /// Never past the painting's edge, on any generated state, zoomed or not, and never enlarged
    /// past 1.6 times at 3x (the bundled picture is 2048 pixels across 1300 points).
    @Test func thePictureNeverLeavesThePaintingNorBlursOnAnyState() {
        let layouts = Generated.levelLayouts
        var most: CGFloat = 0
        for (s, layout) in zip(Generated.all, layouts) {
            let c = art.backdropCamera(step: s.step, layout: layout.camera)!
            let shown = CGRect(x: c.x, y: c.y, width: art.stage.width / c.k, height: art.stage.height / c.k)
            #expect(CGRect(origin: .zero, size: backdrop.size).insetBy(dx: -0.001, dy: -0.001).contains(shown),
                    "\(Generated.describe(s)): \(shown)")
            most = max(most, 3 * c.k * backdrop.size.width / 2048)
        }
        for step in 0...6 {
            let c = art.backdropCamera(step: step, layout: art.stops[step])!
            most = max(most, 3 * c.k * backdrop.size.width / 2048)
        }
        #expect(most <= 1.6, "the picture is enlarged \(most) times")
    }

    @Test func theHeldShadeIsOnlyWhereThePaintingIsBright() {
        #expect((0...6).map { art.topShade(step: $0) } == [nil, nil, 0.6, 0.6, 0.6, 0.5, nil])
        #expect(WalkArt.squarePrint.topShade(step: 3) == nil)
    }

    #if os(iOS)
    /// The words above the flags (the eyebrow, the question and its line, stage y 64 to 248, x 40 to 350)
    /// read at 4.5:1 or better, white over the painting under the step's shade, on 98 % of what lies
    /// behind them, at every step's stop and zoomed into every column of one to three areas. The
    /// words' own glow is not counted.
    @Test func theWordsReadOnThePaintingAtEveryStep() throws {
        let image = try #require(UIImage(named: backdrop.imageName)?.cgImage)
        let w = 520, h = 1560
        var pixels = [UInt8](repeating: 0, count: w * h * 4)
        let context = try #require(CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                             space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                             bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        func linear(_ v: Double) -> Double { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
        let navy = (0.0, 18.0 / 255, 96.0 / 255)
        for step in 0...6 {
            var cameras = [art.stops[step]]
            if (1...5).contains(step) {
                for count in 1...3 {
                    for column in 0..<count {
                        var s = WalkState()
                        s.areas = ridge(count)
                        s.kept = s.areas.map(\.id)
                        s.step = step
                        if step == 1 {
                            s.focusArea = s.areas[column].id
                        } else {
                            let parent = WalkItem(id: UUID(), level: WalkLevel(rawValue: step - 1)!, title: "Parent",
                                                  areaId: s.areas[column].id)
                            s.items = [parent]
                            s.focus[WalkLevel(rawValue: step)!] = parent.id
                        }
                        cameras.append(WalkLayout.make(s, today: Self.today, art: art, footing: .level).camera)
                    }
                }
            }
            for camera in cameras {
                let c = art.backdropCamera(step: step, layout: camera)!
                var behind: [Double] = []
                for y in stride(from: CGFloat(64), through: 248, by: 4) {
                    let a: Double
                    if let held = art.topShade(step: step) {
                        a = held
                    } else {            // the faint band: 0.55 at the top, 0.25 at 156, gone by 260
                        a = y <= 156 ? 0.55 - 0.30 * Double(y / 156) : 0.25 * Double(1 - (y - 156) / 104)
                    }
                    for x in stride(from: CGFloat(40), through: 350, by: 5) {
                        let px = min(w - 1, Int((c.x + x / c.k) / backdrop.size.width * CGFloat(w)))
                        let py = min(h - 1, Int((c.y + y / c.k) / backdrop.size.height * CGFloat(h)))
                        let i = (py * w + px) * 4
                        let rgb = (Double(pixels[i]) / 255, Double(pixels[i + 1]) / 255, Double(pixels[i + 2]) / 255)
                        let mixed = (a * navy.0 + (1 - a) * rgb.0, a * navy.1 + (1 - a) * rgb.1, a * navy.2 + (1 - a) * rgb.2)
                        behind.append(0.2126 * linear(mixed.0) + 0.7152 * linear(mixed.1) + 0.0722 * linear(mixed.2))
                    }
                }
                behind.sort()
                let contrast = 1.05 / (behind[Int(Double(behind.count) * 0.98)] + 0.05)
                #expect(contrast >= 4.5, "step \(step), camera \(camera): \(contrast)")
            }
        }
    }
    #endif
}
