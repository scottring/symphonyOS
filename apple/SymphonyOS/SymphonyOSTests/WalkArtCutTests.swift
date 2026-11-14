#if os(iOS)
import Testing
import Foundation
import CoreGraphics
import UIKit
@testable import Symphony

/// The tall overlook painting: the everyday views' square cuts of it (`WalkArt.Cut`), the
/// script that cuts them, and the bundled images.
struct WalkArtCutTests {
    private let tall = WalkBackdrop.tallOverlook
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
}
#endif
