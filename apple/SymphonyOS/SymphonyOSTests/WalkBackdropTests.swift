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
        #expect(backdrop.stops.count == 7 && backdrop.shade.count == 7 && backdrop.stretchedShade.count == 7)
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
    /// stage point that showed a spot of the painting before shows it where the layout moves it
    /// (wherever the picture did not have to be held inside the painting). Zoomed into the outer
    /// columns too, where holding it shifts the flags against the painting, the column's own post
    /// still stands on its level's open ground and land (up to four areas, as unzoomed).
    @Test func aZoomMovesThePictureAsItMovesTheFlags() {
        var anchored = 0, outer = 0
        for step in 1...5 {
            let level = WalkLevel(rawValue: step)!
            for count in 1...WalkLoad.maxAreas {
                for index in Set([0, count / 2, count - 1]).sorted() {
                    var s = WalkState()
                    s.areas = ridge(count)
                    s.kept = s.areas.map(\.id)
                    s.step = step
                    let column = s.areas[index].id
                    if step == 1 {
                        s.focusArea = column
                        s.items = [WalkItem(id: UUID(), level: .year, title: "Own", areaId: column)]
                    } else {
                        let parent = WalkItem(id: UUID(), level: WalkLevel(rawValue: step - 1)!, title: "Parent", areaId: column)
                        s.items = [parent]
                        if level == .today {
                            s.firstThing = parent.id
                        } else {
                            s.items.append(WalkItem(id: UUID(), level: level, title: "Own", areaId: column, parentId: parent.id))
                        }
                        s.focus[level] = parent.id
                    }
                    let layout = WalkLayout.make(s, today: Self.today, art: art, footing: .level)
                    let zoom = layout.camera
                    #expect(zoom.k == WalkLayout.zoomK, "step \(step), \(count) areas, column \(index)")
                    let stop = art.stops[step], before = art.backdropCamera(step: step, layout: stop)!
                    let after = art.backdropCamera(step: step, layout: zoom)!
                    #expect(abs(after.k / before.k - zoom.k / stop.k) < 0.0001)
                    let world = CGPoint(x: zoom.x + WalkLayout.centreX / zoom.k, y: art.bandY(level))
                    let a = CGPoint(x: (world.x - stop.x) * stop.k, y: (world.y - stop.y) * stop.k)
                    let b = CGPoint(x: (world.x - zoom.x) * zoom.k, y: (world.y - zoom.y) * zoom.k)
                    let unheld = WalkLayout.Camera(x: before.x - (stop.x - zoom.x) * zoom.k / after.k,
                                                   y: before.y - (stop.y - zoom.y) * zoom.k / after.k, k: after.k)
                    if unheld == after {
                        anchored += 1
                        let p = onPainting(a, before), q = onPainting(b, after)
                        #expect(abs(p.x - q.x) < 0.0001 && abs(p.y - q.y) < 0.0001, "step \(step), \(count) areas")
                    }
                    if count <= 4, index == 0 || index == count - 1 {
                        guard let post = layout.posts.first(where: { $0.key == WalkPostKey(level: level, column: column) }) else {
                            Issue.record("step \(step), \(count) areas: the zoomed column has no post")
                            continue
                        }
                        outer += 1
                        let foot = onPainting(post.base, after)
                        #expect(backdrop.open[level]!.contains(foot.x) && backdrop.land[level]!.contains(foot.y),
                                "step \(step), \(count) areas, column \(index) zoomed: its foot at \(foot)")
                    }
                }
            }
        }
        #expect(anchored > 0, "the anchor was never checked")
        #expect(outer > 0, "no outer column was checked")
    }

    /// Planted by hand (`.natural`: up to `WalkFooting.ground` off the band), every post of the
    /// step's own level still stands on its level's land on the painting, on every generated
    /// state of Year to Today, zoomed or not.
    @Test func handPlantedFeetStayOnTheirLand() {
        var checked = 0
        for (s, layout) in zip(Generated.all, Generated.naturalLayouts) where (1...5).contains(s.step) {
            let level = WalkLevel(rawValue: s.step)!
            let picture = art.backdropCamera(step: s.step, layout: layout.camera)!
            for post in layout.posts where post.key.level == level {
                checked += 1
                let y = onPainting(post.base, picture).y
                #expect(backdrop.land[level]!.contains(y), "\(Generated.describe(s)): \(post.id) at \(y), footing \(post.footing)")
            }
        }
        #expect(checked > 0)
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

    // MARK: A window wider than the board

    /// The picture's camera as it was while the stage was only ever the 390 × 844 board (commit
    /// 1f2b138d): the step's stop, moved as the layout's camera moved, held on the board.
    private func cameraOnTheBoardAlone(step: Int, layout camera: WalkLayout.Camera) -> WalkLayout.Camera {
        let stop = art.stops[step], b = backdrop.stops[step]
        let k = b.k * camera.k / stop.k
        let x = b.x - (stop.x - camera.x) * camera.k / k, y = b.y - (stop.y - camera.y) * camera.k / k
        let held = max(k, 390 / backdrop.size.width, 844 / backdrop.size.height)
        return WalkLayout.Camera(x: min(max(0, x), backdrop.size.width - 390 / held),
                                 y: min(max(0, y), backdrop.size.height - 844 / held), k: held)
    }

    /// The part of the painting a window shows: the board plus its bleed, under the picture's camera.
    private func shown(_ stage: WalkStage, _ c: WalkLayout.Camera) -> CGRect {
        let window = stage.window
        return CGRect(x: c.x + window.minX / c.k, y: c.y + window.minY / c.k,
                      width: window.width / c.k, height: window.height / c.k)
    }

    /// On the board's own window the picture stands exactly where it did: at every step's stop and on
    /// every generated state, ruled or planted by hand. A phone a little taller for its width (no
    /// wings, a sliver above and below the board) has the same picture, the same size and the same
    /// way across, slid up or down by no more than that sliver.
    @Test func onThePhoneThePictureIsUnchanged() {
        let phone = WalkStage(device: CGSize(width: 390, height: 844))
        for step in 0...6 {
            #expect(art.backdropCamera(step: step, layout: art.stops[step], stage: phone)
                    == cameraOnTheBoardAlone(step: step, layout: art.stops[step]), "step \(step)")
            #expect(art.backdropCamera(step: step, layout: art.stops[step])
                    == cameraOnTheBoardAlone(step: step, layout: art.stops[step]), "step \(step), no stage named")
        }
        for layouts in [Generated.levelLayouts, Generated.naturalLayouts] {
            for (s, layout) in zip(Generated.all, layouts) {
                #expect(art.backdropCamera(step: s.step, layout: layout.camera, stage: phone)
                        == cameraOnTheBoardAlone(step: s.step, layout: layout.camera), "\(Generated.describe(s))")
            }
        }
        for device in [CGSize(width: 402, height: 874), CGSize(width: 430, height: 932)] {
            let taller = WalkStage(device: device)
            #expect(taller.wing == 0 && taller.bleed.top > 0)
            var cameras = (0...6).map { (step: $0, layout: art.stops[$0]) }
            cameras += zip(Generated.all, Generated.levelLayouts).map { (step: $0.step, layout: $1.camera) }
            for (step, layout) in cameras {
                let c = art.backdropCamera(step: step, layout: layout, stage: taller)!
                let before = cameraOnTheBoardAlone(step: step, layout: layout)
                #expect(c.k == before.k && c.x == before.x && abs(c.y - before.y) <= taller.bleed.top / c.k + 0.000001,
                        "\(device), step \(step), \(layout): \(c) for \(before)")
            }
        }
    }

    /// On every window the whole of it (the board plus its bleed) lies on the painting, at every
    /// step's stop and on every generated state: no edge of the picture ever shows.
    @Test func thePictureCoversEveryWindow() {
        let painting = CGRect(origin: .zero, size: backdrop.size).insetBy(dx: -0.001, dy: -0.001)
        for (name, _, stage) in WalkWindows.all {
            for step in 0...6 {
                let c = art.backdropCamera(step: step, layout: art.stops[step], stage: stage)!
                #expect(painting.contains(shown(stage, c)), "\(name), step \(step): \(shown(stage, c))")
            }
            for (s, layout) in zip(Generated.all, Generated.levelLayouts) {
                let c = art.backdropCamera(step: s.step, layout: layout.camera, stage: stage)!
                #expect(painting.contains(shown(stage, c)), "\(name), \(Generated.describe(s)): \(shown(stage, c))")
            }
        }
    }

    /// Never past 1.6 times its pixels on a 3x screen, on any window (the bundled picture is 2048
    /// pixels across 1300 points), at every step's stop and on every generated state.
    @Test func thePictureIsNeverEnlargedPastItsPixels() {
        #expect(WalkBackdrop.sharpest == 1.6 && WalkBackdrop.pixelsAcross == 2048)
        for (name, _, stage) in WalkWindows.all {
            var most: CGFloat = 0
            for step in 0...6 {
                let c = art.backdropCamera(step: step, layout: art.stops[step], stage: stage)!
                most = max(most, 3 * stage.scale * c.k * 1300 / 2048)
            }
            for (s, layout) in zip(Generated.all, Generated.levelLayouts) {
                let c = art.backdropCamera(step: s.step, layout: layout.camera, stage: stage)!
                most = max(most, 3 * stage.scale * c.k * 1300 / 2048)
            }
            #expect(most <= 1.6 + 1e-9, "\(name): the picture is enlarged \(most) times")
        }
    }

    /// A wider window shows the same stretch of mountain enlarged about the standing post's foot
    /// (195, 556): on the narrow phone, the outside screen, the half window and the inside screen
    /// upright the ground under that foot is the phone's on Year to Today. Opened flat the picture
    /// cannot be enlarged that far, so it is slid sideways: by no more than 113 stage points, and
    /// the foot still stands on its level's open ground.
    @Test func aWiderWindowKeepsTheGroundUnderTheStandingFoot() {
        let foot = CGPoint(x: 195, y: 556)
        for step in 1...5 {
            let level = WalkLevel(rawValue: step)!
            let phone = onPainting(foot, art.backdropCamera(step: step, layout: art.stops[step])!)
            for (name, stage) in [("375x667", WalkWindows.narrow), ("466x678", WalkWindows.outside),
                                  ("484x669", WalkWindows.half), ("669x951", WalkWindows.upright)] {
                let c = art.backdropCamera(step: step, layout: art.stops[step], stage: stage)!
                let p = onPainting(foot, c)
                #expect(abs(p.x - phone.x) < 0.0001 && abs(p.y - phone.y) < 0.0001, "\(name), step \(step): \(p) for \(phone)")
                #expect(c.k > art.backdropCamera(step: step, layout: art.stops[step])!.k, "\(name), step \(step): not enlarged")
            }
            let c = art.backdropCamera(step: step, layout: art.stops[step], stage: WalkWindows.flat)!
            let p = onPainting(foot, c)
            let slid = abs(p.x - phone.x) * backdrop.size.width * c.k
            #expect(slid <= 113, "951x669, step \(step): slid \(slid)")
            #expect(abs(p.y - phone.y) < 0.0001, "951x669, step \(step): moved up or down")
            #expect(backdrop.open[level]!.contains(p.x), "951x669, step \(step): the foot at x \(p.x)")
        }
    }

    @Test func theHeldShadeIsOnlyWhereThePaintingIsBright() {
        #expect((0...6).map { art.topShade(step: $0) } == [nil, nil, 0.6, 0.6, 0.6, 0.5, nil])
        #expect((0...6).map { art.topShade(step: $0, stage: WalkWindows.phone) } == [nil, nil, 0.6, 0.6, 0.6, 0.5, nil])
        #expect(WalkArt.squarePrint.topShade(step: 3) == nil)
        // A stage with wings enlarges the picture: on Look back up the peak's snow comes up behind the
        // heading, so that step holds a shade there; every other step keeps the phone's.
        for (name, _, stage) in WalkWindows.all where stage.stretch > 1 {
            #expect((0...6).map { art.topShade(step: $0, stage: stage) } == [nil, nil, 0.6, 0.6, 0.6, 0.5, 0.6], "\(name)")
        }
        // A phone a little taller for its width has no wings: the phone's shades.
        #expect(art.topShade(step: 6, stage: WalkStage(device: CGSize(width: 402, height: 874))) == nil)
    }

    #if os(iOS)
    /// The words above the flags (the eyebrow, the question and its line, stage y 64 to 248, across the
    /// question block's width, `WalkLayout.wordsWidth(wing:)`, centred on x 195) read at 4.5:1 or better, white over the painting under the step's shade, on 98 % of what lies
    /// behind them, at every step's stop and zoomed into every column of one to three areas, on each
    /// of the six windows (a wider one enlarges the picture, so other paint stands behind them). The
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
        for (name, _, stage) in WalkWindows.all {
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
                let words = WalkLayout.wordsWidth(wing: stage.wing)
                for camera in cameras {
                    let c = art.backdropCamera(step: step, layout: camera, stage: stage)!
                    var behind: [Double] = []
                    for y in stride(from: CGFloat(64), through: 248, by: 4) {
                        let a: Double
                        if let held = art.topShade(step: step, stage: stage) {
                            a = held
                        } else {            // the faint band: 0.55 at the top, 0.25 at 156, gone by 260
                            a = y <= 156 ? 0.55 - 0.30 * Double(y / 156) : 0.25 * Double(1 - (y - 156) / 104)
                        }
                        for x in stride(from: WalkLayout.centreX - words / 2, through: WalkLayout.centreX + words / 2, by: 5) {
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
                    #expect(contrast >= 4.5, "\(name), step \(step), camera \(camera): \(contrast)")
                }
            }
        }
    }
    #endif
}
