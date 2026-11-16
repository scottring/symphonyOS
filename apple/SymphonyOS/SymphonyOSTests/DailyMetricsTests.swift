import Testing
import Foundation
import CoreGraphics
#if canImport(UIKit)
import UIKit
#endif
@testable import Symphony

// Where everything sits: the approved boards' numbers, stretched to a real window from its safe edges.
struct DailyMetricsTests {
    private let phone = CGSize(width: 390, height: 844)
    private let bigger = CGSize(width: 402, height: 874)
    private let small = CGSize(width: 375, height: 667)
    private let outside = CGSize(width: 466, height: 678)

    // Numbers written from the boards ("The boards as numbers") and the rulings, not read from the code under test.
    private let touch: CGFloat = 44        // Global Constraints: every control at least 44 × 44 to the touch
    private let lightInset: CGFloat = 5    // the bar: the field's padding 5 right, the light at its right end
    private let nailInset: CGFloat = 5     // the signpost: a 7 pt nail 5 from the plank's top and 5 from its bottom
    private let wordsRow: CGFloat = 44     // the row of words: 11.5 pt words padded 14 above and below (≈ 43)
    private let clearance: CGFloat = 8     // fix round 1 ruling: the sign keeps 8 under the row of words
    private let largestTurn = 1.7          // the signpost's plank turns 0.7…1.7° (`Signpost.hand`)
    private let outsideSheet: CGFloat = 190 // Duo, outside screen: sheet top 190
    /// The handle's touch shape: 188 wide (the walk's capsule round "See my whole plan", a chevron and 20 either side).
    private let handle: CGFloat = 188

    /// F28: a task's words take up to two lines rather than being cut at one (Today's rows, Week's
    /// tasks, the spread's), and three at the accessibility text sizes; so does the "for …" line under
    /// them (Today, Week, the walk's ending). The row keeps the board's height and grows to hold them.
    @Test func aTaskTakesTwoLines() {
        #expect(DailyMetrics.titleLines(accessibilitySize: false) == 2)
        #expect(DailyMetrics.titleLines(accessibilitySize: true) == 3)
        #expect(DailyMetrics.forLines(accessibilitySize: false) == 2)
        #expect(DailyMetrics.forLines(accessibilitySize: true) == 3)
    }

    /// The quieter lines (Week's fold, an event) stand on one line, and wrap to two at the
    /// accessibility text sizes rather than cut short.
    @Test func aQuietLineWrapsToTwoOnlyAtTheAccessibilitySizes() {
        #expect(DailyMetrics.quietLines(accessibilitySize: false) == 1)
        #expect(DailyMetrics.quietLines(accessibilitySize: true) == 2)
    }

    @Test func theTodayBoard() {
        let m = DailyMetrics.today(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34)
        #expect(m.band == CGRect(x: 0, y: 0, width: 390, height: 340));       #expect(m.picture == CGRect(x: -20, y: 0, width: 430, height: 430))
        #expect(m.sheetTop == 286);                                           #expect(m.sheetRadius == 28)
        #expect(m.sign.post == CGRect(x: 52, y: 128, width: 7, height: 176)); #expect(m.sign.plank == CGRect(x: 24, y: 148, width: 304, height: 64))
        #expect(m.sign.eyebrow == CGPoint(x: 46, y: 9));                      #expect(m.sign.title == CGPoint(x: 46, y: 26))
        #expect(m.lookBack?.midX == 195);                                     #expect(m.header.minY == 332)
        #expect(m.card == CGRect(x: 16, y: 396, width: 358, height: 44));     #expect(m.rowsTop == 450); #expect(m.rowsTopNoCard == 396)
        #expect(m.row == 54);                                                 #expect(m.rowGap == 6)
        #expect(m.bar.field == CGRect(x: 64, y: 754, width: 262, height: 48)); #expect(m.bar.speaking == CGRect(x: 14, y: 754, width: 362, height: 48))
        #expect(m.bar.more == CGRect(x: 6, y: 750, width: 56, height: 56));   #expect(m.bar.inbox == CGRect(x: 328, y: 750, width: 56, height: 56))
        #expect(m.bar.line == 724);                                           #expect(m.bar.fade == CGRect(x: 0, y: 696, width: 390, height: 44))
        #expect(m.navGap == 18); #expect(m.ring == 56); #expect(m.bar.light == 38)
        #expect(m.sign.point == 31); #expect(m.sign.eyebrowSize == 10.5); #expect(m.sign.titleSize == 19)

        // The short shape's sign: "Duo, outside screen".
        let o = DailyMetrics.today(size: outside, safeTop: 22, safeBottom: 0, shape: .short)
        #expect(o.sign.post == CGRect(x: 70, y: 82, width: 7, height: 130)); #expect(o.sign.plank == CGRect(x: 42, y: 96, width: 350, height: 60))
        #expect(o.sign.point == 29); #expect(o.sign.eyebrow == CGPoint(x: 44, y: 8)); #expect(o.sign.title == CGPoint(x: 44, y: 24))
        #expect(o.sign.titleSize == 20); #expect(o.navGap == 22); #expect(o.ring == 52)
    }

    /// "See my whole plan" lowers the sheet until only the handle and the
    /// header show: its top 128 above the window's foot (the walk's own peek, 716 of 844), with no
    /// waiting line. Nothing readable or tappable goes below the safe area's foot (fix round 1):
    /// the header stands on it where the board's +46 would go past it, the handle's capsule (36 high)
    /// stays on the sheet and above the header, and the strip that raises the sheet runs from its top
    /// to that foot. Short windows lower too (F25).
    @Test func lookingBackLowersTheSheetToItsHeader() throws {
        let m = DailyMetrics.today(size: phone, safeTop: 44, safeBottom: 34)
        let low = try #require(m.lowered(safeBottom: 34))
        #expect(low.sheetTop == 716)
        #expect(low.header == CGRect(x: 22, y: 844 - 34 - 56, width: 346, height: 56))
        #expect(low.lookBack == CGRect(x: 195 - handle / 2, y: low.header.minY - touch, width: handle, height: touch))
        #expect(low.strip == CGRect(x: 0, y: 716, width: 390, height: 844 - 34 - 716))
        let waiting = DailyMetrics.today(size: phone, safeTop: 44, safeBottom: 34, waiting: true)
        #expect(waiting.lowered(safeBottom: 34) == low)

        // With room to spare (no home indicator), the header stands where the board puts it.
        let roomy = try #require(DailyMetrics.today(size: CGSize(width: 390, height: 900), safeTop: 44, safeBottom: 0)
            .lowered(safeBottom: 0))
        #expect(roomy.header.minY == CGFloat(900 - 128 + 46))
        #expect(roomy.lookBack.maxY == CGFloat(900 - 128 + 40))
        #expect(DailyMetrics.week(size: CGSize(width: 390, height: 900), safeTop: 44, safeBottom: 0)
            .lowered(safeBottom: 0)?.header.minY == CGFloat(900 - 128 + 44))

        // Every real iPhone size, Today and Week, with and without the waiting line.
        let phones: [(CGSize, CGFloat, CGFloat)] = [
            (small, 20, 0), (CGSize(width: 375, height: 812), 44, 34), (CGSize(width: 375, height: 812), 50, 34),
            (phone, 44, 34), (CGSize(width: 390, height: 844), 47, 34), (CGSize(width: 393, height: 852), 59, 34),
            (bigger, 62, 34), (CGSize(width: 430, height: 932), 59, 34), (CGSize(width: 440, height: 956), 62, 34),
        ]
        for (size, top, bottom) in phones { for line in [false, true] {
            let shape = DailyMetrics.shape(for: .oneColumn, height: size.height, safeTop: top, safeBottom: bottom, waiting: line)
            let pages = [DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: line),
                         DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape)]
            for page in pages {
                guard let low = page.lowered(safeBottom: bottom) else {
                    Issue.record("\(size) \(shape): a phone window that does not lower")
                    continue
                }
                let foot = size.height - bottom
                #expect(low.sheetTop == size.height - 128, "\(size)")
                #expect(low.header.maxY <= foot, "\(size) \(top)/\(bottom): the header runs past the safe area")
                #expect(low.lookBack.maxY <= low.header.minY, "\(size): the handle's words meet the header")
                #expect(low.lookBack.maxY - DailyMetrics.handleCapsule >= low.sheetTop, "\(size): the handle's capsule leaves the sheet")
                #expect(low.strip.minY == low.sheetTop && low.strip.maxY == foot, "\(size)")
                #expect(low.strip.height >= touch, "\(size)")
            }
        } }
        #expect(DailyMetrics.today(size: outside, safeTop: 22, safeBottom: 0, shape: .short).lowered(safeBottom: 0) != nil)
    }

    /// F25 (S40): every phone window, short ones too (the narrow phone, the Duo's outside screen, the
    /// half window), has "See my whole plan" as a one-line handle: 188 × 44, on the window, among the
    /// touch targets and meeting none of the others; Today's and Week's three rows still end above the fade.
    @Test func everyPhoneWindowHasTheHandle() {
        let windows: [(CGSize, CGFloat, CGFloat, TodayLayout)] = [
            (CGSize(width: 393, height: 852), 59, 34, .oneColumn), (small, 20, 0, .oneColumn),
            (outside, 22, 0, .glance), (CGSize(width: 484, height: 669), 0, 0, .oneColumn)]
        for (size, top, bottom, layout) in windows { for waiting in [false, true] {
            let shape = DailyMetrics.shape(for: layout, height: size.height, safeTop: top, safeBottom: bottom, waiting: waiting)
            let today = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: waiting)
            let week = DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom,
                                         shape: DailyMetrics.shape(for: layout, height: size.height, safeTop: top, safeBottom: bottom, waiting: false))
            for (m, isWeek) in [(today, false), (week, true)] {
                let at = "\(size) \(shape) line \(waiting) \(isWeek ? "week" : "today")"
                guard let handle = m.lookBack else { Issue.record("\(at): no handle"); continue }
                #expect(handle.size == CGSize(width: self.handle, height: touch) && handle.midX == size.width / 2, "\(at)")
                #expect(handle.minY >= top && handle.maxY <= size.height - bottom, "\(at)")
                #expect(m.touchTargets.contains(handle), "\(at)")
                for other in m.touchTargets where other != handle { #expect(!other.intersects(handle), "\(at): \(other)") }
                #expect(handle.maxY <= m.header.minY && (m.waiting.map { handle.maxY <= $0.minY } ?? true), "\(at)")
                let rows = m.rowsTop + (isWeek ? DailyMetrics.weekDayTop : 0) + 3 * m.row + 2 * m.rowGap
                #expect(rows <= m.bar.fade.minY, "\(at): three rows end below the fade")
            }
        } }
    }

    /// F25: a short window lowers its sheet too, as a tall one does.
    @Test func aShortWindowLowersToo() throws {
        for (size, top, bottom) in [(small, CGFloat(20), CGFloat(0)), (outside, 22, 0), (CGSize(width: 484, height: 669), 0, 0)] {
            for m in [DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: .short),
                      DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: .short)] {
                let low = try #require(m.lowered(safeBottom: bottom), "\(size)")
                #expect(low.sheetTop == size.height - 128)
                #expect(low.header.maxY <= size.height - bottom && low.lookBack.maxY <= low.header.minY, "\(size)")
                #expect(low.lookBack.maxY - DailyMetrics.handleCapsule >= low.sheetTop, "\(size): the handle's capsule leaves the sheet")
                #expect(low.strip.height >= touch)
            }
        }
    }

    #if canImport(UIKit)
    /// The handle's touch shape holds the walk's capsule round its widest words: the words in DM Sans
    /// SemiBold 14, 6, the chevron (12 semibold), and 20 either side.
    @Test @MainActor func theHandlesWordsFitItsCapsule() throws {
        let font = try #require(UIFont(name: "DMSans-SemiBold", size: 14))
        let chevron = try #require(UIImage(systemName: "chevron.up",
                                           withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold))).size.width
        for words in [WalkCopy.lookBackHandle, WalkCopy.showMyDay, DailyCopy.showMyWeek] {
            let capsule = ceil((words as NSString).size(withAttributes: [.font: font]).width) + 6 + chevron + 40
            #expect(capsule <= DailyMetrics.handleWidth && DailyMetrics.handleWidth == handle, "\(words): \(capsule)")
        }
    }
    #endif

    @Test func theWeekBoard() {
        let m = DailyMetrics.week(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34)
        #expect(m.band.height == 250); #expect(m.picture == CGRect(x: -150, y: -330, width: 700, height: 700))
        #expect(m.sheetTop == 204);    #expect(m.header.minY == 248); #expect(m.rowsTopNoCard == 308)
    }

    /// Pre-flight finding 13: on a short window the week's sheet stands where Today's does,
    /// over the outside screen's bar.
    @Test func aShortWeekUsesTheOutsideScreensSheetAndBar() {
        let week = DailyMetrics.week(size: outside, safeTop: 22, safeBottom: 0, shape: .short)
        let today = DailyMetrics.today(size: outside, safeTop: 22, safeBottom: 0, shape: .short)
        #expect(week.sheetTop == outsideSheet)
        #expect(week.bar == today.bar)
        #expect(week.bar.field == CGRect(x: 68, y: 604, width: 330, height: 48))
        #expect(week.lookBack == CGRect(x: 233 - handle / 2, y: outsideSheet + 40 - touch, width: handle, height: touch))
        #expect(week.header.minY == outsideSheet + 44)
        #expect(week.rowsTopNoCard > week.header.maxY)
    }

    @Test func aBiggerPhoneKeepsItsInsets() {
        let m = DailyMetrics.today(size: bigger, safeTop: 62, safeBottom: 34)
        #expect(m.bar.field == CGRect(x: 64, y: 784, width: 274, height: 48))
        #expect(m.sheetTop == 304)
        #expect(abs(m.picture.width - 443.23) < 0.01)
    }

    @Test func aShortPhoneStillShowsThreeRows() {
        // The one shape rule a page can call takes the line into account (the coarse one is private).
        #expect(DailyMetrics.shape(for: .oneColumn, height: 667, safeTop: 20, safeBottom: 0, waiting: false) == .short)
        #expect(DailyMetrics.shape(for: .oneColumn, height: 844, safeTop: 44, safeBottom: 34, waiting: false) == .tall)
        #expect(DailyMetrics.shape(for: .glance, height: 678, safeTop: 22, safeBottom: 0, waiting: false) == .short)
        let m = DailyMetrics.today(size: small, safeTop: 20, safeBottom: 0, shape: .short)
        #expect(m.rowsTop + 3 * m.row + 2 * m.rowGap <= m.bar.fade.minY)
        #expect(m.lookBack?.size == CGSize(width: handle, height: touch) && m.header.minY == m.sheetTop + 46)
    }

    @Test func aWaitingWalkMakesRoomForItsLine() {
        let plain = DailyMetrics.today(size: phone, safeTop: 44, safeBottom: 34, waiting: false)
        let m = DailyMetrics.today(size: phone, safeTop: 44, safeBottom: 34, waiting: true)
        #expect(m.waiting == CGRect(x: 16, y: 326, width: 358, height: 44))
        #expect(m.header.minY == 376)
        #expect(m.card.minY == 440)
        #expect(m.rowsTop == 494)
        #expect(m.bar == plain.bar)
        #expect(m.sign == plain.sign)
        #expect(plain.waiting == nil)
    }

    /// Fix round 1 ruling: on every window from 320 × 568 up, with any safe insets, with or without
    /// the waiting line, three rows end at or above the fade; nothing overlaps, shrinks under 44,
    /// or sits in the insets; the sign keeps 8 under the row of words and stands wholly above the
    /// sheet, or is not shown. Checked on the shape the page takes and on the short shape.
    @Test func threeRowsAlwaysFit() {
        let widths: [CGFloat] = [320, 375, 390, 402, 430, 440, 466]
        let heights = Array(stride(from: CGFloat(568), through: 960, by: 6))
        let tops: [CGFloat] = [20, 44, 47, 50, 59], bottoms: [CGFloat] = [0, 21, 34]
        var failures: [String] = []
        var windows = 0
        var signless: [String: [CGFloat]] = [:]      // "top/bottom/line" → heights that lose the sign
        var signlessCount = 0
        var overWords: [String: [CGFloat]] = [:]      // the sheet's top over the row of words
        var intoTheInset: [String] = []               // the risen sheet and its handle into the top inset (F25, below)

        for w in widths { for h in heights { for top in tops { for bottom in bottoms { for line in [false, true] {
            windows += 1
            let size = CGSize(width: w, height: h)
            let chosen = DailyMetrics.shape(for: .oneColumn, height: h, safeTop: top, safeBottom: bottom, waiting: line)
            let shapes: [DailyMetrics.Shape] = chosen == .tall ? [.tall, .short] : [.short]
            for shape in shapes {
                let m = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: line)
                let at = "\(Int(w))×\(Int(h)) \(Int(top))/\(Int(bottom)) line \(line) \(shape)"
                // F25 gives short windows the handle, 20 more on the sheet: on windows no iPhone has (580
                // tall or less, a safe top of 44 or more) with the waiting line, three rows fitting first
                // (D11) now raises the sheet into the top inset, or only the handle's touch shape (4 above
                // the sheet). Only those two are excused there; every other target is still held.
                let carvedOut = h <= 580 && top >= 44 && line && shape == .short
                func fail(_ what: String) { failures.append("\(at): \(what)") }

                if m.rowsTop + 3 * m.row + 2 * m.rowGap > m.bar.fade.minY { fail("three rows end below the fade") }
                let targets = m.touchTargets
                for r in targets {
                    if r.width < touch || r.height < touch { fail("\(r) under 44") }
                    if carvedOut, r == m.lookBack, r.minY < top, r.maxY <= h - bottom {
                        intoTheInset.append("\(at): the handle \(r) above the top inset")
                    } else if r.minY < top || r.maxY > h - bottom {
                        fail("\(r) in the insets")
                    }
                }
                for i in targets.indices { for j in targets.indices where j > i {
                    if !targets[i].intersection(targets[j]).isEmpty { fail("\(targets[i]) meets \(targets[j])") }
                } }
                if m.sheetTop < top {
                    if carvedOut { intoTheInset.append("\(at): the sheet in the top inset") } else { fail("sheet in the top inset") }
                }
                if line && m.waiting == nil { fail("no waiting line") }
                if m.sign != .none {
                    let turn = (m.sign.plank.width + m.sign.point) * CGFloat(sin(largestTurn * .pi / 180))
                    let signTop = min(m.sign.post.minY, m.sign.plank.minY - turn)
                    if signTop < top + wordsRow + clearance { fail("sign within 8 of the row of words") }
                    if m.sign.plank.maxY + turn > m.sheetTop { fail("plank reaches the sheet") }
                    if m.sign.post.maxY < m.sheetTop { fail("post does not reach the sheet") }
                } else if shape == chosen {
                    signlessCount += 1
                    signless["\(Int(top))/\(Int(bottom)) line \(line)", default: []].append(h)
                }
                if shape == chosen && m.sheetTop < top + wordsRow {
                    overWords["\(Int(top))/\(Int(bottom)) line \(line)", default: []].append(h)
                }
            }
        } } } } }

        #expect(failures.isEmpty, "\(failures.count) failures, first: \(failures.prefix(5))")
        // The carve-out above, counted: 63 handles above the top inset and 35 sheets in it, all on windows ≤ 580 high.
        let handles = intoTheInset.filter { $0.contains("the handle") }.count, sheets = intoTheInset.filter { $0.contains("the sheet") }.count
        #expect(handles == 63 && sheets == 35, "\(handles) handles, \(sheets) sheets")

        // The accepted carve-out (ruling D11): on windows 604 points tall or less, with a safe top of
        // 44 or more and the waiting line showing, the risen sheet may cover part of the row of words,
        // because three rows fitting comes first. No current iPhone has such a window; `overWords`
        // counts and prints them and is not asserted. What is asserted: no real iPhone size ever has
        // its sheet rise past the row of words, with or without the line.
        let phones: [(CGSize, CGFloat, CGFloat)] = [
            (CGSize(width: 375, height: 667), 20, 0),
            (CGSize(width: 375, height: 812), 44, 34), (CGSize(width: 375, height: 812), 50, 34),
            (CGSize(width: 390, height: 844), 47, 34), (CGSize(width: 393, height: 852), 59, 34),
            (CGSize(width: 402, height: 874), 62, 34), (CGSize(width: 430, height: 932), 59, 34),
            (CGSize(width: 440, height: 956), 62, 34),
        ]
        for (size, top, bottom) in phones { for line in [false, true] {
            let shape = DailyMetrics.shape(for: .oneColumn, height: size.height, safeTop: top, safeBottom: bottom, waiting: line)
            let m = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: line)
            #expect(m.sheetTop >= top + wordsRow, "\(size) \(top)/\(bottom) line \(line): the sheet covers the row of words")
        } }
        print("DailyMetrics sweep: \(windows) windows; \(signlessCount) lose the sign; sheet over the row of words on \(overWords.values.map(\.count).reduce(0, +)); into the top inset (carved out) \(intoTheInset.count)")
        for key in signless.keys.sorted() {
            let hs = signless[key]!
            print("DailyMetrics sweep: no sign at \(key): \(hs.count) windows, heights \(Int(hs.min()!))…\(Int(hs.max()!))")
        }
        for key in overWords.keys.sorted() {
            let hs = overWords[key]!
            print("DailyMetrics sweep: sheet over the words at \(key): \(hs.count) windows, heights \(Int(hs.min()!))…\(Int(hs.max()!))")
        }

        // The boards' own numbers stand unchanged on their own windows, with and without the line.
        for line in [false, true] {
            #expect(DailyMetrics.shape(for: .oneColumn, height: 844, safeTop: 44, safeBottom: 34, waiting: line) == .tall)
            let p = DailyMetrics.today(size: phone, safeTop: 44, safeBottom: 34, shape: .tall, waiting: line)
            #expect(p.sheetTop == 286 && p.band.height == 340 && p.bar.field.minY == 754)   // Today board
            #expect(p.sign.post == CGRect(x: 52, y: 128, width: 7, height: 176))
            #expect(DailyMetrics.shape(for: .glance, height: 678, safeTop: 22, safeBottom: 0, waiting: line) == .short)
            let o = DailyMetrics.today(size: outside, safeTop: 22, safeBottom: 0, shape: .short, waiting: line)
            // Outside board; with the waiting line under the handle (F25) the sheet rises 18 and the sign 8.
            let rise: CGFloat = line ? 18 : 0
            #expect(o.sheetTop == outsideSheet - rise && o.band.height == 240 - rise && o.bar.field.minY == 604)
            #expect(o.sign.plank == CGRect(x: 42, y: 96 - (line ? 8 : 0), width: 350, height: 60))
        }
    }

    /// The windows the review named: tall without the line from 760 high, tall with it on a
    /// 375 × 812 phone, and short with it on a 375 × 667 and a 700-high window.
    @Test func theNamedWindowsFitThreeRows() {
        let cases: [(CGSize, CGFloat, CGFloat, Bool)] = [
            (CGSize(width: 390, height: 760), 44, 34, false), (CGSize(width: 390, height: 774), 44, 34, false),
            (CGSize(width: 375, height: 812), 44, 34, true), (CGSize(width: 375, height: 812), 50, 34, true),
            (CGSize(width: 375, height: 667), 20, 0, true), (CGSize(width: 390, height: 700), 47, 34, true),
        ]
        for (size, top, bottom, line) in cases {
            let shape = DailyMetrics.shape(for: .oneColumn, height: size.height, safeTop: top, safeBottom: bottom, waiting: line)
            let m = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: line)
            #expect(m.rowsTop + 3 * m.row + 2 * m.rowGap <= m.bar.fade.minY, "\(size) \(top)/\(bottom) line \(line)")
        }
        // 375 × 812 fits tall without the line, and not with it.
        #expect(DailyMetrics.shape(for: .oneColumn, height: 812, safeTop: 44, safeBottom: 34, waiting: false) == .tall)
        #expect(DailyMetrics.shape(for: .oneColumn, height: 812, safeTop: 44, safeBottom: 34, waiting: true) == .short)
        // A short window that still falls short: the sheet rises, the band gives that height up, the bar stays.
        let board = DailyMetrics.today(size: CGSize(width: 375, height: 667), safeTop: 20, safeBottom: 0, shape: .short)
        let risen = DailyMetrics.today(size: CGSize(width: 375, height: 667), safeTop: 20, safeBottom: 0, shape: .short, waiting: true)
        let rise = board.sheetTop - risen.sheetTop
        #expect(rise > 0)
        #expect(risen.band.height == board.band.height - rise)
        #expect(risen.bar == board.bar)
        #expect(risen.rowsTop + 3 * risen.row + 2 * risen.rowGap == risen.bar.fade.minY)
    }

    /// The sign is nailed to its post: the strip is the post seen across the plank, and its
    /// two nail heads sit on that line at the plank's top and bottom edges, never beside the words.
    /// Relative luminance of an sRGB colour (0…1 channels), and the WCAG contrast of two.
    private func luminance(_ c: (Double, Double, Double)) -> Double {
        func lin(_ v: Double) -> Double { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(c.0) + 0.7152 * lin(c.1) + 0.0722 * lin(c.2)
    }

    @Test func theRowOfWordsAlwaysStandsOnTheShade() {
        // Every shape and the safe tops it meets: a 375 × 667 phone, the Duo's outside screen, iPhone 17.
        let windows: [(CGSize, CGFloat, CGFloat, DailyMetrics.Shape)] = [
            (CGSize(width: 375, height: 667), 20, 0, .short), (CGSize(width: 466, height: 678), 22, 0, .short),
            (CGSize(width: 402, height: 874), 62, 34, .tall), (CGSize(width: 390, height: 844), 44, 34, .tall)]
        for (size, top, bottom, shape) in windows {
            let m = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape)
            #expect(m.shadeSolid >= m.navTop + DailyMetrics.navHeight)     // full strength behind every word
            #expect(m.shade > m.shadeSolid)                                // then it fades out
            #expect(m.shade < m.sheetTop)
            let w = DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape)
            #expect(w.shadeSolid >= w.navTop + DailyMetrics.navHeight)
        }
        // The worst ground behind a word is white snow. The shade (the walk's ground, #00106E) over it,
        // and the quietest word (white at 0.8) over that, still read at 4.5:1.
        let a = DailyMetrics.shadeOpacity
        let ground = (0.0, 16.0 / 255, 110.0 / 255)
        let behind = (a * ground.0 + (1 - a), a * ground.1 + (1 - a), a * ground.2 + (1 - a))
        let word = (0.8 + 0.2 * behind.0, 0.8 + 0.2 * behind.1, 0.8 + 0.2 * behind.2)
        let contrast = (luminance(word) + 0.05) / (luminance(behind) + 0.05)
        #expect(contrast >= 4.5)
    }

    @Test func theSignIsNailedOnItsPost() {
        for m in [DailyMetrics.today(size: phone, safeTop: 44, safeBottom: 34),
                  DailyMetrics.today(size: outside, safeTop: 22, safeBottom: 0, shape: .short)] {
            let s = m.sign
            #expect(s.plank.minX + s.strip.minX == s.post.minX)
            #expect(s.strip.width == s.post.width)
            #expect(s.nail == 7)
            #expect(s.nails.count == 2)
            for nail in s.nails {
                #expect(nail.minX == s.strip.minX && nail.width == s.nail && nail.height == s.nail)
            }
            #expect(s.nails[0].minY == nailInset)
            #expect(s.nails[1].maxY == s.plank.height - nailInset)
            #expect(s.nails.allSatisfy { $0.maxX < s.eyebrow.x && $0.maxX < s.title.x })
        }
    }

    /// The field and the line rise with the keyboard: the field's foot stands 8 above the
    /// keyboard's top, and nothing rises while the keyboard is down or lower than the bar.
    @Test func theBarRisesWithTheKeyboard() {
        let bar = DailyMetrics.today(size: phone, safeTop: 44, safeBottom: 34).bar
        #expect(bar.field.maxY == 802)
        #expect(bar.rise(keyboardTop: 844) == 0)                // no keyboard
        #expect(bar.rise(keyboardTop: 900) == 0)
        #expect(bar.rise(keyboardTop: 810) == 0)                // its top just clears the field's foot by 8
        #expect(bar.rise(keyboardTop: 508) == 302)              // a 336-high keyboard: 802 + 8 − 508
    }

    @Test func everyTouchTargetIsAtLeast44() {
        let windows: [(CGSize, CGFloat, CGFloat, DailyMetrics.Shape)] = [
            (phone, 44, 34, .tall), (bigger, 62, 34, .tall), (small, 20, 0, .short), (outside, 22, 0, .short),
        ]
        var pages: [(m: DailyMetrics, today: Bool, waiting: Bool, tall: Bool)] = []
        for (size, top, bottom, shape) in windows {
            for waiting in [false, true] {
                pages.append((DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: waiting),
                              true, waiting, shape == .tall))
            }
            pages.append((DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape), false, false, shape == .tall))
        }
        for (m, today, waiting, tall) in pages {
            let targets = m.touchTargets
            #expect(targets.count >= 4)
            // The ones the page must have are there.
            #expect(targets.contains(m.bar.typing) && targets.contains(m.bar.lightTouch))
            #expect(targets.contains(m.bar.more) && targets.contains(m.bar.inbox))
            if today { #expect(m.sign != .none && targets.contains(m.sign.touch), "no sign on \(m.size)") }
            if waiting { #expect(m.waiting.map(targets.contains) == true) }
            #expect(m.lookBack.map(targets.contains) == true, "no handle on \(m.size), tall \(tall)")
            for rect in targets {
                #expect(rect.width >= touch && rect.height >= touch, "\(rect) on \(m.size)")
            }
            for i in targets.indices {
                for j in targets.indices where j > i {
                    #expect(targets[i].intersection(targets[j]).isEmpty, "\(targets[i]) meets \(targets[j]) on \(m.size)")
                }
            }
            // The light sits inside the field; its touch shape is the field's right end.
            #expect(m.bar.lightTouch.width == touch && m.bar.lightTouch.height == m.bar.field.height)
            #expect(m.bar.lightTouch.maxX == m.bar.field.maxX - lightInset)
            #expect(m.bar.typing.minX == m.bar.field.minX && m.bar.typing.maxX == m.bar.lightTouch.minX)
        }
    }

    /// Week, as Today: on every window from 320 × 568 up, with any safe insets, the list's first three
    /// rows (the first day's 8 above, three 46 cards, 5 between) end at or above the fade. Where the
    /// board would put them lower, the sheet rises and the band gives that height up; the bar stays.
    @Test func theWeekKeepsThreeRowsClearOfTheBar() {
        let widths: [CGFloat] = [320, 375, 390, 402, 430, 466]
        let heights = Array(stride(from: CGFloat(568), through: 960, by: 6))
        let tops: [CGFloat] = [20, 44, 47, 50, 59, 62], bottoms: [CGFloat] = [0, 21, 34]
        var failures: [String] = []
        for w in widths { for h in heights { for top in tops { for bottom in bottoms {
            let size = CGSize(width: w, height: h)
            let shape = DailyMetrics.shape(for: .oneColumn, height: h, safeTop: top, safeBottom: bottom, waiting: false)
            let m = DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape)
            let at = "\(Int(w))×\(Int(h)) \(Int(top))/\(Int(bottom)) \(shape)"
            if m.rowsTop + 8 + 3 * m.row + 2 * m.rowGap > m.bar.fade.minY { failures.append("\(at): three rows end below the fade") }
            if m.sheetTop < top { failures.append("\(at): sheet in the top inset") }
            for r in m.touchTargets where r.width < touch || r.height < touch { failures.append("\(at): \(r) under 44") }
        } } } }
        #expect(failures.isEmpty, "\(failures.count) failures, first: \(failures.prefix(5))")

        // The board itself does not move; a 320 × 568 window with a 59 top rises, the band shortening by as much.
        #expect(DailyMetrics.week(size: phone, safeTop: 44, safeBottom: 34).sheetTop == 204)
        let tiny = DailyMetrics.week(size: CGSize(width: 320, height: 568), safeTop: 59, safeBottom: 34, shape: .short)
        let unrisen: CGFloat = 59 + 168
        #expect(tiny.sheetTop < unrisen)
        #expect(tiny.band.height == 59 + 218 - (unrisen - tiny.sheetTop))
        #expect(tiny.rowsTop + 8 + 3 * tiny.row + 2 * tiny.rowGap == tiny.bar.fade.minY)
        // The bar stands where Today's does on the same window.
        #expect(tiny.bar == DailyMetrics.today(size: CGSize(width: 320, height: 568), safeTop: 59, safeBottom: 34,
                                               shape: .short).bar)
    }

    /// A row is scrolled into sight only when something covers it: the unit anchor that brings it
    /// just above `bottom` (the fade, or the Move to panel), or to the top when it is above the view.
    @Test func aRowIsScrolledIntoSightOnlyWhenCovered() {
        let view = CGRect(x: 0, y: 300, width: 390, height: 544)
        func row(_ y: CGFloat) -> CGRect { CGRect(x: 16, y: y, width: 358, height: 46) }
        #expect(DailyMetrics.reveal(row(400), in: view, above: 696) == nil)          // seen whole
        #expect(DailyMetrics.reveal(row(650), in: view, above: 696) == nil)          // ends right at it
        let below = DailyMetrics.reveal(row(680), in: view, above: 696) ?? -1
        #expect(abs(below - (696 - 46 - 300) / (544 - 46)) < 1e-9)
        let far = DailyMetrics.reveal(row(1400), in: view, above: 696) ?? -1                   // far below: the same place
        #expect(abs(far - (696 - 46 - 300) / (544 - 46)) < 1e-9)
        #expect(DailyMetrics.reveal(row(280), in: view, above: 696) == 0)            // above the view: to its top
        // A bottom at or above the view's top leaves nowhere to bring it: the top.
        #expect(DailyMetrics.reveal(row(680), in: view, above: 320) == 0)
    }

    /// The sheet's grabber, 44 × 5, 9 below the sheet's top, centred on the window on every page and shape.
    @Test func theGrabberIsCentredOnTheWindow() {
        let windows: [(CGSize, CGFloat, CGFloat, DailyMetrics.Shape)] = [
            (phone, 44, 34, .tall), (bigger, 62, 34, .tall), (small, 20, 0, .short), (outside, 22, 0, .short),
            (CGSize(width: 320, height: 568), 59, 34, .short)]
        for (size, top, bottom, shape) in windows {
            for m in [DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape),
                      DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: true),
                      DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape)] {
                #expect(m.grabber.size == CGSize(width: 44, height: 5))
                #expect(m.grabber.midX == size.width / 2)
                #expect(m.grabber.minY == m.sheetTop + 9)
                // Lowered over the whole plan, the grabber is centred the same way on the lowered top.
                if let low = m.lowered(safeBottom: bottom) {
                    #expect(low.grabber.size == m.grabber.size)
                    #expect(low.grabber.midX == size.width / 2)
                    #expect(low.grabber.minY == low.sheetTop + 9)
                }
            }
        }
        #expect(DailyMetrics.week(size: phone, safeTop: 44, safeBottom: 34).lowered(safeBottom: 34)?.grabber
                == CGRect(x: 173, y: 844 - 128 + 9, width: 44, height: 5))
        #expect(DailyMetrics.week(size: phone, safeTop: 44, safeBottom: 34).grabber == CGRect(x: 173, y: 213, width: 44, height: 5))
    }

    @Test func bandFlagsAreHandPlantedAndTwoAtMost() {
        let goals = [Signpost.Named(id: UUID(), title: "Pick the tile and pay the deposit"),
                     Signpost.Named(id: UUID(), title: "Find a gym that fits"),
                     Signpost.Named(id: UUID(), title: "Clear out the old vanity")]
        let flags = DailyMetrics.bandFlags(goals, width: 390, navTop: 44)
        #expect(flags.count == 2)
        #expect(flags.map(\.id) == goals.prefix(2).map(\.id))
        #expect(DailyMetrics.bandFlags(goals, width: 390, navTop: 44) == flags)
        #expect(flags[0].pole.maxY != flags[1].pole.maxY)
        for flag in flags {
            #expect(flag.lean * flag.tilt < 0)
            #expect(abs(flag.lean) <= 1.8)
            #expect((0.9...1.3).contains(abs(flag.tilt)))
            #expect(abs(flag.cloth.midX - flag.pole.midX) < 0.001)
            #expect(flag.cloth.minY == flag.pole.minY - 10)
        }
        #expect(abs(flags[0].pole.maxY - (44 + 146)) <= 6)
        #expect(abs(flags[1].pole.maxY - (44 + 136)) <= 6)
        #expect(flags[0].pole.height == 62 && flags[1].pole.height == 68)
        #expect(flags[1].cloth.width == 138)   // 18 + 6 × 20 letters

        // Whatever the ids, the two feet stand apart and each keeps within its ±6.
        for _ in 0..<300 {
            let pair = [Signpost.Named(id: UUID(), title: "One"), Signpost.Named(id: UUID(), title: "Two")]
            let two = DailyMetrics.bandFlags(pair, width: 390, navTop: 44)
            #expect(abs(two[0].pole.maxY - two[1].pole.maxY) >= 4)
            // The Week board's feet: y 190 and 180 (poles 128…190, 112…180) at navTop 44.
            #expect(abs(two[0].pole.maxY - 190) <= 6 && abs(two[1].pole.maxY - 180) <= 6)
        }

        let long = Signpost.Named(id: UUID(), title: String(repeating: "a", count: 40))
        #expect(DailyMetrics.bandFlags([long], width: 390, navTop: 44).first?.cloth.width == 156)
        #expect(DailyMetrics.bandFlags([], width: 390, navTop: 44).isEmpty)
    }

    /// F28 (S49): a month goal too long for one line on its cloth (18 + 6 points a letter past 156)
    /// takes two: the cloth is 48 high instead of 32, as wide as before, its top where it was.
    @Test func aLongBandFlagTakesTwoLines() {
        let long = Signpost.Named(id: UUID(), title: "Pick the tile and pay the contractor")
        let short = Signpost.Named(id: UUID(), title: "Find a good gym")       // 15 letters: 18 + 90 = 108
        #expect(DailyMetrics.bandLines(long.title) == 2)
        #expect(DailyMetrics.bandLines(short.title) == 1)
        // 23 letters is 156 exactly, the widest one line; 24 is past it.
        #expect(DailyMetrics.bandLines(String(repeating: "a", count: 23)) == 1)
        #expect(DailyMetrics.bandLines(String(repeating: "a", count: 24)) == 2)
        let flags = DailyMetrics.bandFlags([long, short], width: 390, navTop: 44)
        #expect(flags[0].cloth.height == 48 && flags[0].cloth.width == 156)
        #expect(flags[1].cloth.height == 32 && flags[1].cloth.width == 108)
        for flag in flags { #expect(flag.cloth.minY == flag.pole.minY - 10) }
    }

    /// Two-line band flags still stand wholly above Week's sheet on the phone, the narrow phone, the
    /// Duo's outside screen and the half window, at every top and foot inset, and above the spread's
    /// sheet over its left page (where none is dropped for being two lines).
    @Test func bandFlagsStayAboveTheSheet() {
        let long = [Signpost.Named(id: UUID(uuidString: "00000000-0000-0000-0000-000000000201")!,
                                   title: "Pick the tile and pay the contractor"),
                    Signpost.Named(id: UUID(uuidString: "00000000-0000-0000-0000-000000000202")!,
                                   title: "Find a gym that fits the mornings")]
        let windows: [(CGSize, TodayLayout)] = [(CGSize(width: 393, height: 852), .oneColumn), (small, .oneColumn),
                                                (outside, .glance), (CGSize(width: 484, height: 669), .oneColumn)]
        var checked = 0
        for (size, layout) in windows { for top: CGFloat in [0, 20, 22, 44, 59] { for bottom: CGFloat in [0, 21, 34] {
            let shape = DailyMetrics.shape(for: layout, height: size.height, safeTop: top, safeBottom: bottom, waiting: false)
            let m = DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape)
            let flags = DailyMetrics.bandFlags(long, width: size.width, navTop: m.navTop)
            #expect(flags.map(\.cloth.height) == [48, 48])
            for flag in flags {
                // Tilted by at most 1.3° about its middle, a corner moves down by half its width times sin(1.3°).
                let tilt = flag.cloth.width / 2 * CGFloat(sin(1.3 * Double.pi / 180))
                #expect(flag.cloth.maxY + tilt < m.sheetTop, "\(size) \(top)/\(bottom): \(flag.cloth) meets \(m.sheetTop)")
                checked += 1
            }
        } } }
        #expect(checked == 4 * 5 * 3 * 2)
        for top: CGFloat in [0, 10, 24, 44] { for fold: CGFloat in [435, 445, 455] {
            let sp = DailyMetrics.spread(size: CGSize(width: 890, height: 626), safeTop: top, safeBottom: 0, fold: fold)
            let flags = DailyMetrics.spreadFlags(long, on: sp)
            #expect(flags.count == 2, "spread, top \(top): a two-line flag was dropped")
            for flag in flags { #expect(flag.cloth.height == 48 && flag.cloth.maxY <= sp.sheetTop) }
        } }
    }

    // MARK: Half open ("Duo, half open": the laptop and the book boards)

    private let laptop = CGSize(width: 626, height: 890)
    private let book = CGSize(width: 890, height: 626)

    @Test func theLaptopBoard() {
        let t = DailyMetrics.tent(size: laptop, split: 445, across: true)
        #expect(t.look == CGRect(x: 0, y: 0, width: 626, height: 445))
        #expect(t.touch == CGRect(x: 0, y: 445, width: 626, height: 445))
        #expect(t.picture == CGRect(x: -137, y: -120, width: 900, height: 900))
        #expect(t.time == CGPoint(x: 40, y: 26)); #expect(t.timeSize == 124); #expect(t.dateSize == 17)
        #expect(t.next.origin == CGPoint(x: 40, y: 200)); #expect(t.nextSize == 38)
        #expect(t.sign.post == CGRect(x: 74, y: 310, width: 8, height: 150))
        #expect(t.sign.plank == CGRect(x: 44, y: 330, width: 470, height: 78))
        #expect(t.sign.point == 39); #expect(t.sign.nail == 8)
        #expect(t.sign.eyebrow == CGPoint(x: 50, y: 11)); #expect(t.sign.title == CGPoint(x: 50, y: 31))
        #expect(t.sign.eyebrowSize == 12.5); #expect(t.sign.titleSize == 27)
        #expect(t.fold == CGRect(x: 0, y: 445, width: 626, height: 22))
        #expect(t.header.origin == CGPoint(x: 32, y: 476)); #expect(t.ring == 60)
        #expect(t.rows.origin == CGPoint(x: 24, y: 548)); #expect(t.rows.width == 578)
        #expect(t.row == 72); #expect(t.rowGap == 8); #expect(t.titleSize == 22)
        #expect(t.circle == 34); #expect(t.lineageSize == 15); #expect(t.goalSize == 18)
        #expect(t.bar.field == CGRect(x: 24, y: 808, width: 578, height: 58)); #expect(t.bar.light == 44)
        #expect(t.barTextSize == 20)
    }

    @Test func theBookBoard() {
        let t = DailyMetrics.tent(size: book, split: 445, across: false)
        #expect(t.look == CGRect(x: 0, y: 0, width: 445, height: 626))
        #expect(t.touch == CGRect(x: 445, y: 0, width: 445, height: 626))
        #expect(t.look.width == 445)
        #expect(t.picture == CGRect(x: -330, y: -150, width: 1000, height: 1000))
        #expect(t.time == CGPoint(x: 32, y: 26)); #expect(t.timeSize == 112); #expect(t.dateSize == 16)
        #expect(t.next.origin == CGPoint(x: 32, y: 196)); #expect(t.nextSize == 34)
        #expect(t.sign.post == CGRect(x: 56, y: 440, width: 8, height: 200))
        #expect(t.sign.plank == CGRect(x: 28, y: 462, width: 350, height: 68))
        #expect(t.sign.point == 34); #expect(t.sign.titleSize == 22); #expect(t.sign.eyebrowSize == 11.5)
        #expect(t.fold == CGRect(x: 445, y: 0, width: 22, height: 626))
        #expect(t.header == CGRect(x: 477, y: 30, width: 385, height: 60)); #expect(t.ring == 60)
        #expect(t.rows.origin == CGPoint(x: 467, y: 106)); #expect(t.rows.width == 405)
        #expect(t.row == 70); #expect(t.titleSize == 20); #expect(t.circle == 32); #expect(t.goalSize == 17)
        #expect(t.bar.field == CGRect(x: 467, y: 544, width: 405, height: 58)); #expect(t.bar.light == 44)
    }

    /// Pre-flight finding 8: the half-open bar has no More or Inbox, does not widen while it
    /// listens, and its one line slot (Undo, a note, the listening line) stands 24 above the
    /// field on the half you touch.
    @Test func theHalfOpenBarIsTheFieldAndItsLineOnTheTouchHalf() {
        for (size, across) in [(laptop, true), (book, false)] {
            let t = DailyMetrics.tent(size: size, split: 445, across: across)
            #expect(t.bar.speaking == t.bar.field)
            #expect(t.bar.more == .zero && t.bar.inbox == .zero)
            #expect(t.bar.line == t.bar.field.minY - 24)
            #expect(t.bar.fade.isEmpty)
            #expect(t.touch.contains(t.slot) && t.slot.maxY == t.bar.field.minY)
            #expect(t.slot.minY < t.bar.line - 18)                 // the slot's 44 stand on its paper
            #expect(t.touch.contains(t.bar.field) && t.touch.contains(t.header) && t.touch.contains(t.rows))
        }
    }

    /// The rows scroll in their own space, from under the header to just above the field: three
    /// at least show whole on both boards, and the bar and the header never move.
    @Test func threeRowsShowOnBothBoards() {
        for (size, across) in [(laptop, true), (book, false)] {
            let t = DailyMetrics.tent(size: size, split: 445, across: across)
            #expect(t.rows.minY >= t.header.maxY)
            #expect(t.rows.maxY < t.bar.field.minY)
            #expect(t.rows.height >= 3 * t.row + 2 * t.rowGap)
        }
    }

    /// Nothing of the half you look at stands on the half you touch: the time, the next line and
    /// the plank (turned as far as a hand turns it) end above the fold, or left of it.
    @Test func theLookHalfStaysOnItsSide() {
        for (size, across) in [(laptop, true), (book, false)] {
            let t = DailyMetrics.tent(size: size, split: 445, across: across)
            let turn = (t.sign.plank.width + t.sign.point) * CGFloat(sin(largestTurn * .pi / 180))
            #expect(t.look.contains(t.next))
            #expect(t.sign.plank.maxY + turn <= t.look.maxY && t.sign.plank.maxX + t.sign.point <= t.look.maxX)
            #expect(t.sign.plank.minY - turn > t.next.maxY)
            #expect(t.look.intersection(t.touch).isEmpty)
        }
    }

    /// A fold reported low on the laptop leaves the look half short: the sign gives way before
    /// it would stand over the next line; the time and the next line stay.
    @Test func aShortLookHalfDropsTheSignRatherThanCoverTheNextLine() {
        let t = DailyMetrics.tent(size: laptop, split: 300, across: true)
        #expect(t.sign == .none)
        #expect(t.next.minX == 40 && t.next.maxY + clearance <= t.look.maxY)
        #expect(t.touch.minY == 300)
    }

    /// The light's touch shape and the field's typing part are each at least 44 × 44 and apart;
    /// a row is at least 44 high.
    @Test func theHalfOpenControlsAreAtLeast44() {
        for (size, across) in [(laptop, true), (book, false)] {
            let t = DailyMetrics.tent(size: size, split: 445, across: across)
            for r in t.touchTargets { #expect(r.width >= touch && r.height >= touch) }
            #expect(t.touchTargets.count == 2)
            #expect(t.bar.typing.intersection(t.bar.lightTouch).width <= 0)
            #expect(t.row >= touch)
        }
    }

    /// The scenery behind the time wears the walk's own top shade, full to the next line's foot.
    @Test func theTimeAndTheNextLineStandOnTheWalksShade() {
        for (size, across) in [(laptop, true), (book, false)] {
            let t = DailyMetrics.tent(size: size, split: 445, across: across)
            #expect(t.veil.opacity == DailyMetrics.shadeOpacity)
            #expect(t.veil.solid >= t.next.maxY)
            #expect(t.veil.length == t.veil.solid + DailyMetrics.shadeFade)
        }
    }

    /// A real fold is not always at 445. Across the supported splits the look half fits its
    /// height (the time, the next line and the sign all show, apart, and nothing crosses the fold;
    /// the time and the gaps shrink first), and the touch half shows three whole rows over the bar.
    @Test func theLookHalfFitsAnyFoldInRange() {
        func check(_ t: DailyTent, _ label: String) {
            let turn = (t.sign.plank.width + t.sign.point) * CGFloat(sin(largestTurn * .pi / 180))
            #expect(t.sign != .none, "\(label): the sign dropped")
            #expect(t.timeBlock.maxY <= t.next.minY, "\(label): the time meets the next line")
            #expect(t.next.maxY + clearance <= t.sign.plank.minY - turn, "\(label): the next line meets the sign")
            #expect(t.look.contains(t.timeBlock) && t.look.contains(t.next), "\(label)")
            #expect(t.timeBlock.minX + 2.4 * t.timeSize <= t.look.maxX, "\(label): the time is wider than its half")
            #expect(t.sign.plank.maxY + turn <= t.look.maxY && t.sign.plank.maxX + t.sign.point <= t.look.maxX, "\(label)")
            #expect(t.header.minY >= t.touch.minY && t.rows.minY >= t.header.maxY, "\(label)")
            #expect(t.rows.height >= 3 * t.row + 2 * t.rowGap, "\(label): three rows do not fit")
            #expect(t.rows.maxY < t.bar.field.minY && t.touch.contains(t.bar.field), "\(label)")
            #expect(t.veil.solid >= t.next.maxY, "\(label)")
        }
        for split in stride(from: CGFloat(380), through: 480, by: 5) {
            check(DailyMetrics.tent(size: laptop, split: split, across: true), "laptop \(split)")
        }
        for split in stride(from: CGFloat(400), through: 490, by: 5) {
            check(DailyMetrics.tent(size: book, split: split, across: false), "book \(split)")
        }
        // The time shrinks before anything goes; at 445 the boards stand exactly.
        #expect(DailyMetrics.tent(size: laptop, split: 380, across: true).timeSize < 124)
        #expect(DailyMetrics.tent(size: book, split: 400, across: false).timeSize < 112)
        #expect(DailyMetrics.tent(size: laptop, split: 480, across: true).header.minY > 480)
    }

    // MARK: The Duo, outside and upright inside (Task 17)

    /// "Duo, outside screen": the board's own numbers, on the board's own window.
    @Test func theOutsideBoard() {
        let m = DailyMetrics.today(size: CGSize(width: 466, height: 678), safeTop: 22, safeBottom: 0, shape: .short)
        #expect(m.picture == CGRect(x: -17, y: -34, width: 500, height: 500))
        #expect(m.band.height == 240)
        #expect(m.sheetTop == 190)
        #expect(m.sheetRadius == 26)
        #expect(m.sign.plank == CGRect(x: 42, y: 96, width: 350, height: 60))
        #expect(m.sign.post == CGRect(x: 70, y: 82, width: 7, height: 130))
        #expect(m.card == CGRect(x: 16, y: 300, width: 434, height: 42))
        #expect(m.rowsTop == 352)
        #expect(m.row == 52)
        #expect(m.bar.field == CGRect(x: 68, y: 604, width: 330, height: 48))
        #expect(m.bar.more.origin == CGPoint(x: 8, y: 600))
        #expect(m.bar.inbox.origin == CGPoint(x: 402, y: 600))
        #expect(m.lookBack == CGRect(x: 233 - handle / 2, y: 186, width: handle, height: 44))
        #expect(m.header.minY == 236)
        #expect(m.navGap == 22)
    }

    /// The Duo's windows as their pages get them, with the safe insets they may meet: the outside
    /// screen (its simulator reports 0 at the top and 34 at the foot, and an 84-point system column
    /// beside the page, which the page stands clear of: 382 wide; the board's 466 with 22 / 0 too),
    /// and the inside screen held upright (626 × 890). Today with and without the waiting line,
    /// Week, and the mountain pages' bar (Today's): three rows end above the fade, the row of words
    /// stands on the shade, the grabber is centred, every target is 44 and apart and off the safe
    /// insets (nothing in the home-indicator area), the sign shows wholly above the sheet.
    @Test func theDuoWindowsKeepTheirRowsTheirSignAndTheirBar() {
        let outsides: [(CGSize, CGFloat, CGFloat)] = [
            (CGSize(width: 382, height: 678), 0, 34), (outside, 22, 0), (outside, 0, 34), (CGSize(width: 382, height: 678), 22, 0)]
        let insides: [(CGSize, CGFloat, CGFloat)] = [0, 20, 32, 44, 59].flatMap { top in
            [0, 20, 34].map { bottom in (CGSize(width: 626, height: 890), CGFloat(top), CGFloat(bottom)) } }
        var failures: [String] = []
        for (layout, windows) in [(TodayLayout.glance, outsides), (.dayPage, insides)] {
            for (size, top, bottom) in windows { for line in [false, true] {
                let shape = DailyMetrics.shape(for: layout, height: size.height, safeTop: top, safeBottom: bottom, waiting: line)
                if layout == .glance && shape != .short { failures.append("\(size): the outside screen is not short") }
                let today = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: line)
                let week = DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom,
                                             shape: DailyMetrics.shape(for: layout, height: size.height, safeTop: top,
                                                                       safeBottom: bottom, waiting: false))
                for (m, isWeek) in [(today, false), (week, true)] {
                    let at = "\(layout) \(Int(size.width))×\(Int(size.height)) \(Int(top))/\(Int(bottom)) line \(line) \(isWeek ? "week" : "today")"
                    func fail(_ what: String) { failures.append("\(at): \(what)") }
                    let rows = m.rowsTop + (isWeek ? DailyMetrics.weekDayTop : 0) + 3 * m.row + 2 * m.rowGap
                    if rows > m.bar.fade.minY { fail("three rows end below the fade") }
                    if m.shadeSolid < m.navTop + DailyMetrics.navHeight || m.shade >= m.sheetTop { fail("the words are off the shade") }
                    if m.grabber.midX != size.width / 2 || m.grabber.minY != m.sheetTop + 9 { fail("grabber \(m.grabber)") }
                    if m.lookBack == nil { fail("no handle") }
                    let targets = m.touchTargets
                    for r in targets {
                        if r.width < touch || r.height < touch { fail("\(r) under 44") }
                        if r.minY < top || r.maxY > size.height - bottom || r.minX < 0 || r.maxX > size.width { fail("\(r) in the insets") }
                    }
                    for i in targets.indices { for j in targets.indices where j > i {
                        if !targets[i].intersection(targets[j]).isEmpty { fail("\(targets[i]) meets \(targets[j])") }
                    } }
                    if m.sheetTop < top + wordsRow { fail("the sheet over the row of words") }
                    if !isWeek {
                        if m.sign == .none { fail("no sign") } else {
                            let turn = (m.sign.plank.width + m.sign.point) * CGFloat(sin(largestTurn * .pi / 180))
                            if min(m.sign.post.minY, m.sign.plank.minY - turn) < top + wordsRow + clearance { fail("sign on the words") }
                            if m.sign.plank.maxY + turn > m.sheetTop { fail("plank reaches the sheet") }
                            if m.sign.plank.maxX + m.sign.point > size.width { fail("plank off the page") }
                        }
                    }
                }
            } }
        }
        #expect(failures.isEmpty, "\(failures.count) failures, first: \(failures.prefix(5))")

        // The upright inside screen is the Today board at that width: tall, the board's offsets down
        // the page, the bar's insets kept and the field taking the rest.
        let up = DailyMetrics.today(size: CGSize(width: 626, height: 890), safeTop: 44, safeBottom: 34,
                                    shape: DailyMetrics.shape(for: .dayPage, height: 890, safeTop: 44, safeBottom: 34, waiting: false))
        #expect(up.sheetTop == 286 && up.lookBack?.midX == 313)
        #expect(up.bar.field == CGRect(x: 64, y: 800, width: 498, height: 48))
        #expect(up.bar.inbox == CGRect(x: 626 - 6 - 56, y: 796, width: 56, height: 56))
    }

    /// The room the field's words have: the typing part less the words' 18-point inset. On the real
    /// outside screen (382 wide) it is 179; on a 375-point phone 172; on the phone board 195.
    @Test func theFieldsWordsHaveTheTypingPartLessTheirInset() {
        let outside = DailyMetrics.today(size: CGSize(width: 382, height: 678), safeTop: 0, safeBottom: 34, shape: .short).bar
        #expect(outside.field.width == 246)
        #expect(outside.wordsRoom == CGFloat(246 - 5 - 44 - 18))    // 179
        #expect(DailyMetrics.today(size: small, safeTop: 20, safeBottom: 0, shape: .short).bar.wordsRoom == 172)
        #expect(DailyMetrics.today(size: phone, safeTop: 44, safeBottom: 34).bar.wordsRoom == 195)
        #expect(outside.wordsRoom == outside.typing.width - DailyMetrics.wordsInset)
    }
}

// MARK: - The pages' paper foot (Month, Season, Year)

/// The windows the mountain pages open in, with the insets each meets: the phone, the narrow phone, the
/// Duo's outside screen (its whole 466 and the page beside the system's column, 382), half the inside
/// screen as Scott held it, the inside screen upright, and opened flat.
private let pageWindows: [(name: String, size: CGSize, top: CGFloat, bottom: CGFloat, layout: TodayLayout)] = [
    ("phone", CGSize(width: 393, height: 852), 59, 34, .oneColumn),
    ("narrow", CGSize(width: 375, height: 667), 20, 0, .oneColumn),
    ("outside", CGSize(width: 466, height: 678), 22, 0, .glance),
    ("outside page", CGSize(width: 382, height: 678), 22, 0, .glance),
    ("half", CGSize(width: 484, height: 669), 0, 0, .oneColumn),
    ("upright", CGSize(width: 669, height: 951), 24, 20, .oneColumn),
    ("spread", CGSize(width: 951, height: 669), 10, 0, .journal),
]

/// Numbers written from "The pages' paper foot" and F16, not read from the code under test.
private enum Foot {
    static let strip: CGFloat = 78, oneLine: CGFloat = 44, short: CGFloat = 700
    static let hintAbove: CGFloat = 38, paperBelowWords: CGFloat = 72
    static let headingFoot: CGFloat = 144       // the field's top, under the row of words' top
    static let footAbove: CGFloat = 12          // the standing foot stands 12 above the field's foot
    static let fieldAboveHint: CGFloat = 4
}

private func foot(_ w: (name: String, size: CGSize, top: CGFloat, bottom: CGFloat, layout: TodayLayout), strip: Bool = true)
    -> (foot: CGRect, strip: CGRect?, oneLine: Bool, bar: DailyMetrics.Bar, hintTop: CGFloat, paperTop: CGFloat, stage: WalkStage) {
    DailyMetrics.mountainFoot(size: w.size, safeTop: w.top, safeBottom: w.bottom, layout: w.layout, strip: strip)
}

extension DailyMetricsTests {
    /// The paper foot on every window the pages open in: the strip and the bar inside the window and
    /// clear of its safe area's foot, the strip over the bar and its icons, one line on a window under
    /// 700 high, the hint 38 above the foot with the bar's line slot in its place, the raised paper 72
    /// under the row of words; with no goals on the page, no strip.
    @Test func thePaperFootFitsEveryWindow() throws {
        for w in pageWindows {
            let f = foot(w)
            let strip = try #require(f.strip, "\(w.name)")
            let window = CGRect(origin: .zero, size: w.size)
            #expect(f.oneLine == (w.size.height < Foot.short), "\(w.name)")
            #expect(strip.height == (f.oneLine ? Foot.oneLine : Foot.strip), "\(w.name)")
            #expect(window.contains(strip) && window.contains(f.bar.field), "\(w.name)")
            #expect(strip.width == w.size.width && strip.minY == f.foot.minY, "\(w.name)")
            #expect(f.foot.maxY == w.size.height && f.foot.minX == 0 && f.foot.width == w.size.width, "\(w.name)")
            #expect(f.bar.field.maxY <= w.size.height - w.bottom, "\(w.name)")
            #expect(strip.maxY <= f.bar.field.minY && strip.maxY <= f.bar.more.minY && strip.maxY <= f.bar.inbox.minY,
                    "\(w.name)")
            #expect(strip.minY >= w.top + DailyMetrics.navHeight, "\(w.name)")
            #expect(f.hintTop == f.foot.minY - Foot.hintAbove, "\(w.name)")
            #expect(f.hintTop > w.top + Foot.headingFoot, "\(w.name)")
            // The bar's one line slot (Undo, a note, listening) stands where the hint does, above the foot.
            let slot = CGRect(x: 0, y: f.bar.line - 18, width: w.size.width, height: DailyMetrics.minTouch)
            #expect(slot.maxY <= f.foot.minY && slot.minY >= w.top + Foot.headingFoot, "\(w.name)")
            #expect(f.paperTop == w.top + Foot.paperBelowWords, "\(w.name)")
            // Raised, the line slot is over the field again (30 over it, as Today's) and the list ends above it.
            let up = DailyMetrics.mountainRaisedBar(f.bar)
            #expect(up.bar.field == f.bar.field && up.bar.line == f.bar.field.minY - 30, "\(w.name)")
            #expect(up.listFoot + DailyMetrics.minTouch <= f.bar.field.minY && up.listFoot < f.bar.more.minY, "\(w.name)")
            // The bar itself is Today's on that window.
            let shape = DailyMetrics.shape(for: w.layout, height: w.size.height, safeTop: w.top, safeBottom: w.bottom,
                                           waiting: false)
            let today = DailyMetrics.today(size: w.size, safeTop: w.top, safeBottom: w.bottom, shape: shape).bar
            #expect(f.bar.field == today.field && f.bar.more == today.more && f.bar.inbox == today.inbox, "\(w.name)")

            let bare = foot(w, strip: false)
            #expect(bare.strip == nil && bare.bar.field == f.bar.field, "\(w.name)")
            #expect(bare.foot.minY > f.foot.minY && bare.foot.minY <= f.bar.more.minY, "\(w.name)")
            #expect(bare.hintTop == bare.foot.minY - Foot.hintAbove, "\(w.name)")
        }
    }

    /// F16: on a short window the page draws its mountain at full size (or as wide as the window allows),
    /// showing only the board between the heading and the hint: the standing foot 12 above the field's
    /// foot, the ceiling (282) at or below the heading's foot.
    @Test func aShortWindowDrawsThePagesMountainAtFullSize() {
        let expected: [String: CGFloat] = ["half": 1.0, "spread": 1.0, "narrow": 0.9615, "outside page": 0.979]
        for w in pageWindows {
            guard let scale = expected[w.name] else { continue }
            let f = foot(w)
            #expect(abs(f.stage.scale - scale) < 0.0005, "\(w.name): \(f.stage.scale)")
            #expect(f.stage.scale > w.size.height / 844, "\(w.name)")
            let ceiling = f.stage.toDevice(CGPoint(x: 195, y: WalkLayout.question)).y
            let standing = f.stage.toDevice(CGPoint(x: 195, y: WalkLayout.standingFoot)).y
            #expect(ceiling >= w.top + Foot.headingFoot - 0.01, "\(w.name): ceiling at \(ceiling)")
            #expect(abs(standing - (f.hintTop - Foot.fieldAboveHint - Foot.footAbove)) < 0.01, "\(w.name)")
            #expect(standing < f.hintTop, "\(w.name)")
            // The board is centred across and its midline on the window's.
            #expect(abs(f.stage.toDevice(CGPoint(x: 195, y: 0)).x - w.size.width / 2) < 0.01, "\(w.name)")
            // The window, in stage points, is the page: the picture covers it and no more.
            let window = f.stage.window
            #expect(abs(window.width * f.stage.scale - w.size.width) < 0.01
                    && abs(window.height * f.stage.scale - w.size.height) < 0.01, "\(w.name)")
        }
        // The 669-high windows at full size: a wing only where the window is wider than the board.
        #expect(foot(pageWindows[4]).stage.wing == 47)
        #expect(foot(pageWindows[1]).stage.wing == 0)
    }

    /// On a tall window the page's mountain is where it always was: the walk's own stage on that window.
    @Test func aPhoneKeepsThePagesMountainWhereItWas() {
        for w in pageWindows where ["phone", "upright"].contains(w.name) {
            #expect(foot(w).stage == WalkStage(device: w.size), "\(w.name)")
            #expect(foot(w, strip: false).stage == WalkStage(device: w.size), "\(w.name)")
        }
        #expect(WalkStage(page: CGSize(width: 390, height: 844), field: 200...640) == WalkStage(device: CGSize(width: 390, height: 844)))
    }

    /// S23: the chosen flag's panel never covers that flag: every Month and Year flag of the full demo
    /// plan chosen (from the paper, so the page stands where it is) on five windows. With Move to closed
    /// the panel's box never meets the chosen cloth and never gives up its line. With Move to open (its
    /// chips wrap, so it is taller, more so with all eight areas) it may give up its line, and still never
    /// meets the cloth.
    @Test func thePanelNeverCoversTheChosenFlag() throws {
        let today = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 10))!
        // The demo's ridge (six areas), and the fullest one (eight: Move to then offers seven chips).
        let six = ["Health", "Home", "People", "Work", "Money", "Fun"], eight = six + ["Faith", "Learning"]
        let ridge = eight.map { WalkArea(id: UUID(), name: $0) }
        var items: [WalkItem] = []
        for (level, words, name) in DemoStress.full.script {
            guard let said = WalkWords.said(words, level: level, today: today) else { continue }
            let area = ridge.first { $0.name == name }
            let parent = items.first { $0.level.rawValue == level.rawValue - 1 && $0.areaId == area?.id }
            items.append(WalkItem(id: UUID(), level: level, title: said.title, areaId: area?.id, parentId: parent?.id,
                                  day: said.day, mine: true))
        }
        var checked = 0, covered: Set<String> = []
        for (moving, names) in [(false, six), (true, six), (true, eight)] {
            let areas = ridge.filter { names.contains($0.name) }
            for w in pageWindows where ["phone", "narrow", "outside", "outside page", "half"].contains(w.name) {
                let f = foot(w)
                for level in [WalkLevel.month, .year] {
                    for flag in items where flag.level == level {
                        var page = MountainPage(level: level, items: items, areas: areas, saved: [])
                        page.periods = MountainPage.periods(level: level, selected: today, today: today, seasons: nil)
                        _ = page.apply(.paper(true))
                        _ = page.apply(.paperRow(flag.id))
                        if moving { _ = page.apply(.moveTapped) }
                        #expect(page.moving == moving, "\(w.name) \(flag.title)")
                        let panel = try #require(page.panel, "\(w.name) \(flag.title)")
                        let layout = page.layout(today: today, stage: f.stage)
                        let chosen = try #require(page.chosenCloth(in: layout, stage: f.stage), "\(w.name) \(flag.title)")
                        let place = DailyMetrics.mountainPanel(size: w.size, line: f.bar.line, navTop: w.top, stage: f.stage,
                                                               chosen: chosen, title: panel.title, hasLine: panel.line != nil,
                                                               chips: MountainPage.chips(panel, moving: page.moving),
                                                               moving: page.moving)
                        let foot = f.bar.line - DailyMetrics.mountainPanelAbove
                        let name = "\(w.name) \(level) \(flag.title)\(moving ? " moving \(areas.count)" : "")"
                        #expect(place.frame.minX >= 0 && place.frame.maxX <= w.size.width, "\(name)")
                        #expect(place.wraps == (place.beside || moving), "\(name)")
                        if !moving { #expect(!place.dropsLine, "\(name) gave up its line") }
                        if place.dropsLine {
                            #expect(place.frame.maxY == foot, "\(name)")
                        } else {
                            #expect(place.frame.maxY == foot || place.frame.maxY == chosen.minY - 8, "\(name)")
                            #expect(place.frame.minY >= w.top + DailyMetrics.navHeight + 8 || place.frame.maxY == foot, "\(name)")
                        }
                        if place.frame.intersects(chosen) { covered.insert(name) }
                        checked += 1
                    }
                }
            }
        }
        #expect(checked > 300, "\(checked)")
        // Verified exactly: no case, Move to open or closed, six areas or eight. (The review reported two, on
        // 375 x 667 and 382 x 678 for "More slow weekends together" with Move to open; with the panel's own
        // estimate and the page standing where a paper row puts it, neither meets the chosen cloth.)
        #expect(covered.isEmpty, "\(covered.sorted())")
    }

    /// The panel's height by estimate: 18 + 20 a title line + 19 for its line + 4 + 44 a row of chips.
    @Test func thePanelsHeightIsCountedFromItsLines() {
        #expect(DailyMetrics.mountainPanelHeight(titleLines: 1, hasLine: false, chipRows: 1) == 86)
        #expect(DailyMetrics.mountainPanelHeight(titleLines: 2, hasLine: true, chipRows: 2) == 169)
    }
}
