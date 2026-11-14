#if os(iOS)
import Testing
import Foundation
import CoreGraphics
import UIKit
@testable import Symphony

/// The tall overlook painting: the everyday views' square cuts of it (`WalkArt.Cut`), the
/// script that cuts them, the bundled images, and the painting as a walk art (`overlookTall`).
struct WalkArtCutTests {
    private let tall = WalkArt.overlookTall
    private let square = WalkArt.overlookSquare
    private let masterHeight = CGFloat(WalkArt.tallMasterWidth) * WalkArt.tallAspect

    // MARK: The cuts

    @Test func everyCutIsASquareOfThePaintingThatHoldsItsLevel() {
        for cut in WalkArt.Cut.allCases {
            let r = cut.region
            // Square in pixels: its height in the master's pixels is its width's.
            #expect(abs(r.height * masterHeight - r.width * CGFloat(WalkArt.tallMasterWidth)) < 0.5, "\(cut)")
            #expect(r.minX >= 0 && r.minY >= 0 && r.maxX <= 1 && r.maxY <= 1, "\(cut) leaves the painting")
            let band = tall.bands[cut.level]!
            #expect(r.minY < band && band < r.maxY, "\(cut) does not hold the \(cut.level) band")
        }
    }

    /// Each cut is as big as its largest use needs at 3x, but never more than its region holds.
    @Test func everyCutIsNoBiggerThanItsLargestUse() {
        let upright = CGSize(width: 626, height: 890), outside = CGSize(width: 466, height: 678)
        let largest: [WalkArt.Cut: CGFloat] = [
            .todayTall: DailyMetrics.today(size: upright, safeTop: 44, safeBottom: 34, shape: .tall).picture.width,
            .todayShort: DailyMetrics.today(size: outside, safeTop: 22, safeBottom: 0, shape: .short).picture.width,
            .week: DailyMetrics.week(size: upright, safeTop: 44, safeBottom: 34, shape: .tall).picture.width,
            .halfOpenLaptop: DailyMetrics.tent(size: upright, split: 445, across: true).picture.width,
            .halfOpenBook: DailyMetrics.tent(size: CGSize(width: 890, height: 626), split: 445, across: false).picture.width,
        ]
        for cut in WalkArt.Cut.allCases {
            let holds = Int((cut.region.width * CGFloat(WalkArt.tallMasterWidth)).rounded())
            let needs = Int((largest[cut]! * 3).rounded(.up))
            #expect(cut.pixels == min(holds, needs), "\(cut): \(cut.pixels) px, needs \(needs), holds \(holds)")
            #expect(cut.pixels <= WalkArt.tallMasterWidth)
        }
    }

    @Test func eachPageDrawsItsOwnCut() {
        let phone = CGSize(width: 390, height: 844), short = CGSize(width: 375, height: 667)
        #expect(DailyMetrics.today(size: phone, safeTop: 47, safeBottom: 34, shape: .tall).todayCut == .todayTall)
        #expect(DailyMetrics.today(size: phone, safeTop: 47, safeBottom: 34, shape: .tall, waiting: true).todayCut == .todayTall)
        #expect(DailyMetrics.today(size: short, safeTop: 20, safeBottom: 0, shape: .short).todayCut == .todayShort)
        #expect(DailyMetrics.today(size: CGSize(width: 466, height: 678), safeTop: 22, safeBottom: 0, shape: .short).todayCut
                == .todayShort)
        #expect(WalkArt.Cut.halfOpen(across: true) == .halfOpenLaptop)
        #expect(WalkArt.Cut.halfOpen(across: false) == .halfOpenBook)
        #expect(Set(WalkArt.Cut.allCases.map(\.imageName)).count == WalkArt.Cut.allCases.count)
    }

    /// The bundled images are the cuts, at their sizes, and the walk's whole painting at 2048 × 6144.
    @Test func theBundledCutsResolveAtTheirSizes() {
        for cut in WalkArt.Cut.allCases {
            let image = UIImage(named: cut.imageName)?.cgImage
            #expect(image?.width == cut.pixels && image?.height == cut.pixels, "\(cut.imageName)")
        }
        let whole = UIImage(named: tall.imageName)?.cgImage
        #expect(whole?.width == 2048 && whole?.height == 6144)
    }

    /// `scripts/cut-overlook.sh` cuts exactly these regions at these sizes, so the art can be cut again.
    @Test func theScriptCarriesTheSameCuts() throws {
        let script = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("scripts/cut-overlook.sh")
        let text = try String(contentsOf: script, encoding: .utf8)
        let words: [[String]] = text.split(separator: "\n").map { line in
            line.split(separator: " ", omittingEmptySubsequences: true).map { String($0) }
        }
        let lines = words.filter { $0.first == "cut" && $0.count == 6 }
        #expect(lines.count == WalkArt.Cut.allCases.count)
        for cut in WalkArt.Cut.allCases {
            guard let line = lines.first(where: { $0[1] == cut.imageName }) else {
                Issue.record("\(cut.imageName) is not cut by the script")
                continue
            }
            let numbers = line[2...4].compactMap { Double($0) }.map { CGFloat($0) }
            #expect(numbers == [cut.region.minX, cut.region.minY, cut.region.width], "\(cut.imageName)")
            #expect(Int(line[5]) == cut.pixels, "\(cut.imageName)")
        }
    }

    // MARK: The painting as a walk art

    @Test func theTallPaintingIsTheWorld() {
        #expect(tall.stage == WalkArt.stageSize && square.stage == WalkArt.stageSize)
        #expect(tall.world == CGSize(width: 1300, height: 3900))
        #expect(tall.image == CGRect(origin: .zero, size: tall.world))
        #expect(tall.stops.count == 7)
        for level in WalkLevel.allCases {
            let land = tall.land[level]!
            #expect(land.contains(tall.bands[level]!), "\(level)")
            #expect(land.lowerBound >= 0 && land.upperBound <= 1)
        }
    }

    /// Each level's step stands its band where the square print's stop stands its own, so the
    /// light, the Next line, the hint line and the labels keep their guarantees; k stays in 0.40…0.52.
    @Test func eachLevelStandsWhereTheSquarePrintStandsIt() {
        for level in WalkLevel.allCases {
            let mine = tall.stops[level.rawValue], theirs = square.stops[level.rawValue]
            let stageY = (tall.bandY(level) - mine.y) * mine.k
            #expect(abs(stageY - (square.bandY(level) - theirs.y) * theirs.k) < 0.001, "\(level)")
            #expect((0.40...0.52).contains(mine.k), "\(level)")
        }
        // Down the painting: every step's camera stands lower than the one before.
        #expect(zip(tall.stops.prefix(6), tall.stops.prefix(6).dropFirst()).allSatisfy { $0.y < $1.y })
    }

    /// A post planted by hand stands up to `WalkFooting.ground` stage points off its band: at the
    /// widest step that draws it and when zoomed in, its foot is still on that level's ground.
    @Test func everyPostsFootIsOnItsLevelsLand() {
        for level in WalkLevel.allCases {
            let ks = tall.stops[level.rawValue...5].map(\.k) + [WalkLayout.zoomK]
            let reach = WalkFooting.ground / ks.min()! / tall.image.height
            let band = tall.bands[level]!
            #expect(tall.land[level]!.contains(band - reach) && tall.land[level]!.contains(band + reach), "\(level)")
        }
    }

    /// Never past the painting's edge: at every stop, and zoomed on any column of any ridge, on the
    /// stage and on every window the stage is letterboxed into (the scene is clipped to the stage).
    @Test func theCameraNeverLeavesThePainting() {
        let devices = [CGSize(width: 390, height: 844), CGSize(width: 375, height: 667), CGSize(width: 402, height: 874),
                       CGSize(width: 440, height: 956), CGSize(width: 466, height: 678), CGSize(width: 626, height: 890),
                       CGSize(width: 890, height: 626)]
        var cameras = tall.stops.enumerated().map { ("stop \($0.offset)", $0.element) }
        for count in 1...WalkLoad.maxAreas {
            for step in 1...5 {
                let layout = WalkLayout.make(Self.zoomed(step: step, areas: count), today: Self.today, art: tall, footing: .level)
                #expect(layout.camera.k == WalkLayout.zoomK, "step \(step), \(count) areas")
                cameras.append(("zoomed, step \(step), \(count) areas", layout.camera))
            }
        }
        for (name, camera) in cameras {
            for device in devices {
                let stage = WalkStage(device: device)
                // What shows of the stage on this window, in world points.
                let a = stage.toStage(.zero), b = stage.toStage(CGPoint(x: device.width, y: device.height))
                let shown = CGRect(x: max(0, a.x), y: max(0, a.y), width: min(tall.stage.width, b.x) - max(0, a.x),
                                   height: min(tall.stage.height, b.y) - max(0, a.y))
                let world = CGRect(x: camera.x + shown.minX / camera.k, y: camera.y + shown.minY / camera.k,
                                   width: shown.width / camera.k, height: shown.height / camera.k)
                #expect(tall.image.insetBy(dx: -0.001, dy: -0.001).contains(world), "\(name) on \(device): \(world)")
            }
        }
    }

    /// Up to four kept areas, the columns stand on the open right two-thirds, clear of the pines.
    @Test func theColumnsStandOnTheOpenRight() {
        for count in 1...4 {
            var s = WalkState()
            s.areas = Self.ridge(count)
            s.kept = s.areas.map(\.id)
            s.step = 1
            let layout = WalkLayout.make(s, today: Self.today, art: tall, footing: .level)
            #expect(layout.labels.count == count)
            for label in layout.labels {
                let x = (layout.camera.x + label.frame.midX / layout.camera.k) / tall.world.width
                #expect(x > 0.43 && x < 0.77, "\(count) areas: \(label.name) at \(x)")
            }
        }
    }

    // MARK: Helpers

    private static let today = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 13))!

    private static func ridge(_ count: Int) -> [WalkArea] {
        (0..<count).map { WalkArea(id: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012x", 100 + $0))!, name: "Area \($0)") }
    }

    /// On `step`, with `areas` kept, zoomed on the last column: Year by its peak, a lower step by a
    /// flag of the level above standing in that column.
    private static func zoomed(step: Int, areas: Int) -> WalkState {
        var s = WalkState()
        s.areas = ridge(areas)
        s.kept = s.areas.map(\.id)
        s.step = step
        let column = s.areas.last!.id
        if step == 1 {
            s.focusArea = column
        } else {
            let level = WalkLevel(rawValue: step)!, above = WalkLevel(rawValue: step - 1)!
            let parent = WalkItem(id: UUID(uuidString: "00000000-0000-0000-0000-000000000999")!, level: above,
                                  title: "Parent", areaId: column)
            s.items = [parent]
            s.focus[level] = parent.id
        }
        return s
    }
}
#endif
