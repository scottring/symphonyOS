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
        #expect(week.sheetTop == 190)   // navTop 22 + 168
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
        #expect(DailyMetrics.shape(for: .oneColumn, height: 667) == .short)
        #expect(DailyMetrics.shape(for: .oneColumn, height: 844) == .tall)
        #expect(DailyMetrics.shape(for: .glance, height: 678) == .short)
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

    /// The sign is nailed to its post: the strip is the post seen across the plank, and its
    /// two nail heads sit on that line at the plank's top and bottom edges, never beside the words.
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
            #expect(s.nails[0].minY == 5)
            #expect(s.nails[1].maxY == s.plank.height - 5)
            #expect(s.nails.allSatisfy { $0.maxX < s.eyebrow.x && $0.maxX < s.title.x })
        }
    }

    @Test func everyTouchTargetIsAtLeast44() {
        let windows: [(CGSize, CGFloat, CGFloat, DailyMetrics.Shape)] = [
            (phone, 44, 34, .tall), (bigger, 62, 34, .tall), (small, 20, 0, .short),
        ]
        var pages: [DailyMetrics] = []
        for (size, top, bottom, shape) in windows {
            for waiting in [false, true] {
                pages.append(DailyMetrics.today(size: size, safeTop: top, safeBottom: bottom, shape: shape, waiting: waiting))
            }
            pages.append(DailyMetrics.week(size: size, safeTop: top, safeBottom: bottom, shape: shape))
        }
        for m in pages {
            let targets = m.touchTargets
            #expect(targets.count >= 4)
            for rect in targets {
                #expect(rect.width >= 44 && rect.height >= 44, "\(rect) on \(m.size)")
            }
            for i in targets.indices {
                for j in targets.indices where j > i {
                    #expect(targets[i].intersection(targets[j]).isEmpty, "\(targets[i]) meets \(targets[j]) on \(m.size)")
                }
            }
            // The light sits inside the field; its touch shape is the field's right end.
            #expect(m.bar.lightTouch.width == 44 && m.bar.lightTouch.height == m.bar.field.height)
            #expect(m.bar.lightTouch.maxX == m.bar.field.maxX - 5)
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
            #expect(abs(two[0].pole.maxY - 190) <= 6 && abs(two[1].pole.maxY - 180) <= 6)
        }

        let long = Signpost.Named(id: UUID(), title: String(repeating: "a", count: 40))
        #expect(DailyMetrics.bandFlags([long], width: 390, navTop: 44).first?.cloth.width == 156)
        #expect(DailyMetrics.bandFlags([], width: 390, navTop: 44).isEmpty)
    }
}
