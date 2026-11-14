import Testing
import Foundation
import CoreGraphics
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
        #expect(week.lookBack == nil)
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
        #expect(m.lookBack == nil)
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

        for w in widths { for h in heights { for top in tops { for bottom in bottoms { for line in [false, true] {
            windows += 1
            let size = CGSize(width: w, height: h)
            let chosen = DailyMetrics.shape(for: .oneColumn, height: h, safeTop: top, safeBottom: bottom, waiting: line)
            let shapes: [DailyMetrics.Shape] = chosen == .tall ? [.tall, .short] : [.short]
            for shape in shapes {
                let m = DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: line)
                let at = "\(Int(w))×\(Int(h)) \(Int(top))/\(Int(bottom)) line \(line) \(shape)"
                func fail(_ what: String) { failures.append("\(at): \(what)") }

                if m.rowsTop + 3 * m.row + 2 * m.rowGap > m.bar.fade.minY { fail("three rows end below the fade") }
                let targets = m.touchTargets
                for r in targets {
                    if r.width < touch || r.height < touch { fail("\(r) under 44") }
                    if r.minY < top || r.maxY > h - bottom { fail("\(r) in the insets") }
                }
                for i in targets.indices { for j in targets.indices where j > i {
                    if !targets[i].intersection(targets[j]).isEmpty { fail("\(targets[i]) meets \(targets[j])") }
                } }
                if m.sheetTop < top { fail("sheet in the top inset") }
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
        print("DailyMetrics sweep: \(windows) windows; \(signlessCount) lose the sign; sheet over the row of words on \(overWords.values.map(\.count).reduce(0, +))")
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
            #expect(o.sheetTop == outsideSheet && o.band.height == 240 && o.bar.field.minY == 604)   // outside board
            #expect(o.sign.plank == CGRect(x: 42, y: 96, width: 350, height: 60))
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
            if tall { #expect(m.lookBack.map(targets.contains) == true) } else { #expect(m.lookBack == nil) }
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
}
