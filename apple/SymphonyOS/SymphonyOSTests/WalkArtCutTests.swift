#if os(iOS)
import Testing
import Foundation
import CoreGraphics
import UIKit
@testable import Symphony

/// The tall overlook painting: the everyday views' cuts of it (`WalkArt.Cut`), the script that
/// cuts them, and the bundled images.
struct WalkArtCutTests {
    private let tall = WalkBackdrop.tallOverlook
    private let masterHeight = CGFloat(WalkArt.tallMasterWidth) * WalkArt.tallAspect

    // MARK: The cuts

    /// The windows each page is drawn on: (size, safe top, safe bottom, shape).
    private static let windows: [(CGSize, CGFloat, CGFloat, DailyMetrics.Shape)] = [
        (CGSize(width: 390, height: 844), 47, 34, .tall), (CGSize(width: 375, height: 667), 20, 0, .short),
        (CGSize(width: 402, height: 874), 62, 34, .tall), (CGSize(width: 440, height: 956), 62, 34, .tall),
        (CGSize(width: 466, height: 678), 22, 0, .short), (CGSize(width: 382, height: 678), 22, 0, .short),
        (CGSize(width: 393, height: 852), 59, 34, .tall), (CGSize(width: 375, height: 812), 50, 34, .tall),
        (CGSize(width: 626, height: 890), 44, 34, .tall)]

    /// The half-open display's windows: (size, the look half's fold, across).
    private static let tents: [(CGSize, CGFloat, Bool)] = [
        (CGSize(width: 626, height: 890), 383, true), (CGSize(width: 626, height: 890), 445, true),
        (CGSize(width: 890, height: 626), 383, false), (CGSize(width: 890, height: 626), 445, false)]

    /// A page point as a point of the painting, through a cut's frame.
    private func onPainting(_ p: CGPoint, picture: CGRect, cut: WalkArt.Cut) -> CGPoint {
        CGPoint(x: cut.region.minX + (p.x - picture.minX) / picture.width * cut.region.width,
                y: cut.region.minY + (p.y - picture.minY) / picture.height * cut.region.height)
    }

    /// Whether what shows of a frame (`visible`, page points) lies in the cut's `shown` part.
    private func covers(_ cut: WalkArt.Cut, _ visible: CGRect, picture: CGRect) -> Bool {
        let unit = CGRect(x: (visible.minX - picture.minX) / picture.width, y: (visible.minY - picture.minY) / picture.height,
                          width: visible.width / picture.width, height: visible.height / picture.height)
        return cut.shown.insetBy(dx: -0.001, dy: -0.001).contains(unit)
    }

    @Test func everyCutIsASquareRegionAndAPartOfItsFrame() {
        for cut in WalkArt.Cut.allCases {
            let r = cut.region, s = cut.shown
            // Square in pixels: its height in the master's pixels is its width's.
            #expect(abs(r.height * masterHeight - r.width * CGFloat(WalkArt.tallMasterWidth)) < 0.5, "\(cut)")
            #expect(r.minX >= 0 && r.minY >= 0 && r.maxX <= 1 && r.maxY <= 1.0001, "\(cut) leaves the painting")
            #expect(s.minX >= 0 && s.minY >= 0 && s.maxX <= 1.0001 && s.maxY <= 1.0001, "\(cut)")
        }
        #expect(Set(WalkArt.Cut.allCases.map(\.imageName)).count == WalkArt.Cut.allCases.count)
    }

    /// On every window, what shows of Today's frame (the band, and with the handover's sheet still
    /// low) is in its cut, and the ledge's band stands within what the band shows; the same for
    /// Week, whose two flags' feet stand on the meadow; and for the half-open look half and the peaks.
    @Test func eachLevelStandsInWhatShowsOnEveryWindow() {
        for (size, top, bottom, shape) in Self.windows {
            let m = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape)
            let cut = m.todayCut
            let band = m.picture.intersection(CGRect(x: 0, y: 0, width: size.width, height: m.band.height))
            let lowered = m.picture.intersection(CGRect(x: 0, y: 0, width: size.width,
                                                        height: m.band.height + DailyHandover.sheetDrop))
            #expect(covers(cut, lowered, picture: m.picture), "Today \(size): \(cut)")
            let ledge = onPainting(CGPoint(x: band.midX, y: band.maxY), picture: m.picture, cut: cut).y
            let upper = onPainting(CGPoint(x: band.midX, y: band.minY), picture: m.picture, cut: cut).y
            let today = tall.bands[.today]!
            #expect(upper < today && today <= ledge, "Today \(size): the band shows \(upper)…\(ledge)")

            let w = DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape)
            let shows = w.picture.intersection(CGRect(x: 0, y: 0, width: size.width, height: w.band.height))
            #expect(covers(w.weekCut, shows, picture: w.picture), "Week \(size): \(w.weekCut)")
            let goals = [Signpost.Named(id: UUID(uuidString: "00000000-0000-0000-0000-000000000101")!, title: "Pick the tile"),
                         Signpost.Named(id: UUID(uuidString: "00000000-0000-0000-0000-000000000102")!, title: "Find a gym")]
            for flag in DailyMetrics.bandFlags(goals, width: size.width, navTop: w.navTop) {
                let foot = onPainting(CGPoint(x: flag.pole.midX, y: flag.pole.maxY), picture: w.picture, cut: w.weekCut)
                #expect((0.665...0.712).contains(foot.y) && (0.42...0.9).contains(foot.x), "Week \(size): a foot at \(foot)")
            }
        }
        for (size, split, across) in Self.tents {
            let t = DailyMetrics.tent(size: size, split: split, across: across)
            let cut = WalkArt.Cut.halfOpen(across: across)
            let shows = t.picture.intersection(t.look)
            #expect(covers(cut, shows, picture: t.picture), "\(cut) at \(split)")
            let peaks = tall.bands[cut.level]!
            #expect(onPainting(CGPoint(x: shows.midX, y: shows.minY), picture: t.picture, cut: cut).y < peaks
                    && peaks < onPainting(CGPoint(x: shows.midX, y: shows.maxY), picture: t.picture, cut: cut).y)
        }
    }

    /// Each cut's frame is as big as its largest use needs at 3x, never more than its region holds;
    /// the image is only its shown part of that.
    @Test func everyCutIsNoBiggerThanItsLargestUse() {
        var largest: [WalkArt.Cut: CGFloat] = [:]
        for (size, top, bottom, shape) in Self.windows {
            let m = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape)
            largest[m.todayCut] = max(largest[m.todayCut] ?? 0, m.picture.width)
            let w = DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape)
            largest[w.weekCut] = max(largest[w.weekCut] ?? 0, w.picture.width)
        }
        for (size, split, across) in Self.tents {
            let cut = WalkArt.Cut.halfOpen(across: across)
            largest[cut] = max(largest[cut] ?? 0, DailyMetrics.tent(size: size, split: split, across: across).picture.width)
        }
        for cut in WalkArt.Cut.allCases {
            let holds = Int((cut.region.width * CGFloat(WalkArt.tallMasterWidth)).rounded())
            let needs = Int((largest[cut, default: 0] * 3).rounded(.up))
            #expect(cut.side == min(holds, needs), "\(cut): \(cut.side) px, needs \(needs), holds \(holds)")
        }
    }

    @Test func eachPageDrawsItsOwnCut() {
        let phone = CGSize(width: 390, height: 844), short = CGSize(width: 375, height: 667)
        let upright = CGSize(width: 626, height: 890)
        #expect(DailyMetrics.today(size: phone, safeTop: 47, safeBottom: 34, shape: .tall).todayCut == .todayTall)
        #expect(DailyMetrics.today(size: phone, safeTop: 47, safeBottom: 34, shape: .tall, waiting: true).todayCut == .todayTall)
        #expect(DailyMetrics.today(size: short, safeTop: 20, safeBottom: 0, shape: .short).todayCut == .todayShort)
        #expect(DailyMetrics.today(size: CGSize(width: 466, height: 678), safeTop: 22, safeBottom: 0, shape: .short).todayCut
                == .todayShort)
        #expect(DailyMetrics.today(size: upright, safeTop: 44, safeBottom: 34, shape: .tall).todayCut == .todayWide)
        #expect(DailyMetrics.week(size: phone, safeTop: 47, safeBottom: 34).weekCut == .week)
        #expect(DailyMetrics.week(size: upright, safeTop: 44, safeBottom: 34).weekCut == .weekWide)
        #expect(DailyMetrics.today(size: short, safeTop: 20, safeBottom: 0, shape: .short).shape == .short)
        #expect(WalkArt.Cut.halfOpen(across: true) == .halfOpenLaptop)
        #expect(WalkArt.Cut.halfOpen(across: false) == .halfOpenBook)
    }

    /// The bundled images are the cuts, at their sizes, and the walk's whole painting at 2048 × 6144.
    @Test func theBundledCutsResolveAtTheirSizes() {
        for cut in WalkArt.Cut.allCases {
            let image = UIImage(named: cut.imageName)?.cgImage
            #expect(image?.width == cut.pixels.width && image?.height == cut.pixels.height, "\(cut.imageName)")
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
        let lines = words.filter { $0.first == "cut" && $0.count == 10 }
        #expect(lines.count == WalkArt.Cut.allCases.count)
        for cut in WalkArt.Cut.allCases {
            guard let line = lines.first(where: { $0[1] == cut.imageName }) else {
                Issue.record("\(cut.imageName) is not cut by the script")
                continue
            }
            let numbers = line[2...8].compactMap { Double($0) }.map { CGFloat($0) }
            let mine = [cut.region.minX, cut.region.minY, cut.region.width,
                        cut.shown.minX, cut.shown.minY, cut.shown.width, cut.shown.height]
            #expect(numbers.count == 7 && zip(numbers, mine).allSatisfy { abs($0 - $1) < 0.00001 }, "\(cut.imageName)")
            #expect(Int(line[9]) == cut.side, "\(cut.imageName)")
        }
    }
}
#endif
