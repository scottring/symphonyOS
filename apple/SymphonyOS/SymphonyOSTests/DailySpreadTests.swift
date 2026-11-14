import Testing
import Foundation
import CoreGraphics
@testable import Symphony

// The Duo opened flat (Task 18): the rest of the week on the left page, Today on the right, one
// band of scenery across both. Kept in their own file as extensions of the suites they belong to
// (`DailyMetricsTests`, `DailyGateTests`, `DailyHandoverTests`), so each runs with its suite.

/// Numbers written from the spread board ("Duo, opened flat" in the plan), not read from the code under test.
private enum Board {
    static let size = CGSize(width: 890, height: 626)
    static let touch: CGFloat = 44          // every control at least 44 × 44 to the touch
    static let wordsRow: CGFloat = 44       // the row of words: 11.5 pt words padded 14 above and below
    static let clearance: CGFloat = 8       // the sign keeps 8 under the row of words
    static let largestTurn = 1.7            // the plank turns 0.7…1.7°
    static let row: CGFloat = 50, rowGap: CGFloat = 5
}

private func spread(top: CGFloat = 10, bottom: CGFloat = 0, fold: CGFloat? = nil, waiting: Bool = false) -> DailySpread {
    DailyMetrics.spread(size: Board.size, safeTop: top, safeBottom: bottom, fold: fold, waiting: waiting)
}

private func turn(_ sign: DailyMetrics.Sign) -> CGFloat {
    (sign.plank.width + sign.point) * CGFloat(sin(Board.largestTurn * .pi / 180))
}

extension DailyMetricsTests {
    // MARK: Opened flat ("Duo, opened flat": the spread board)

    @Test func theSpreadBoard() {
        let s = DailyMetrics.spread(size: CGSize(width: 890, height: 626), safeTop: 10, safeBottom: 0, fold: nil)
        #expect(s.fold == 445)
        #expect(s.picture == CGRect(x: -55, y: -150, width: 1000, height: 1000))
        #expect(s.band.height == 230)
        #expect(s.sheetTop == 176)
        #expect(s.sign.plank == CGRect(x: 492, y: 82, width: 338, height: 60))
        #expect(s.weekHeader == CGPoint(x: 24, y: 198))
        #expect(s.weekList == CGRect(x: 16, y: 262, width: 400, height: 364))
        #expect(s.todayHeader.minX == 476)
        #expect(s.card == CGRect(x: 470, y: 262, width: 404, height: 40))
        #expect(s.rowsTop == 310)
        #expect(s.row == 50)
        #expect(s.rowGap == 5)
        #expect(s.bar.field == CGRect(x: 470, y: 566, width: 338, height: 48))
        #expect(s.bar.more.origin == CGPoint(x: 20, y: 562))
        #expect(s.bar.inbox.origin == CGPoint(x: 814, y: 562))

        // The rest of the board: four words at y 10, 26 apart; the post x 520, y 66…196; the sheet's
        // corners 26; the 40-wide shade down the fold; the right page's header 392 wide with a 52 ring.
        #expect(s.navTop == 10 && s.navGap == 26)
        #expect(s.sign.post == CGRect(x: 520, y: 66, width: 7, height: 130))
        #expect(s.sheetRadius == 26)
        #expect(s.foldShade == CGRect(x: 425, y: 176, width: 40, height: 450))
        #expect(s.todayHeader == CGRect(x: 476, y: 198, width: 392, height: 52))
        #expect(s.ring == 52)
        #expect(s.bar.more.size == CGSize(width: 56, height: 56) && s.bar.inbox.size == CGSize(width: 56, height: 56))
        #expect(s.bar.light == 38)
        #expect(s.waiting == nil)
    }

    /// The pages meet at the fold the screen reports (`HalfOpen.split`), not always at 445: nothing
    /// readable or tappable stands across it, for folds a little off centre as well as the board's.
    @Test func nothingStandsAcrossTheFold() {
        let goals = [Signpost.Named(id: UUID(), title: "Pick the tile and pay the deposit"),
                     Signpost.Named(id: UUID(), title: "Find a gym that fits")]
        for fold in stride(from: CGFloat(435), through: 455, by: 1) {
            for waiting in [false, true] {
                let s = spread(fold: fold, waiting: waiting)
                #expect(s.fold == fold)
                // The left page: its header, its list (with room for a chosen row's halo), Move to, More.
                let left = [s.weekHeaderFrame, s.weekList, s.weekScroll, s.panel, s.bar.more]
                for r in left { #expect(r.maxX < fold && r.minX >= 0, "fold \(fold): \(r) crosses to the right page") }
                // The right page: the sign, the header, the card, the rows, the waiting line, the bar and its line.
                var right = [s.sign.post, s.sign.touch, s.todayHeader, s.card, s.rowsScroll, s.bar.field,
                             s.bar.speaking, s.bar.lightTouch, s.bar.inbox]
                if let line = s.waiting { right.append(line) }
                for r in right {
                    #expect(r.minX > fold && r.maxX <= Board.size.width, "fold \(fold): \(r) crosses to the left page")
                }
                // The line slot over the bar (16 in from the fade, as the bar draws it) stays on the right page.
                #expect(s.bar.fade.minX >= fold)
                // The month flags, and their touch shapes, stand over the left page.
                for flag in DailyMetrics.spreadFlags(goals, on: s) {
                    let touchWidth = max(flag.cloth.width, Board.touch)
                    #expect(flag.cloth.midX + touchWidth / 2 < fold, "fold \(fold): a flag crosses")
                    #expect(flag.pole.maxX < fold)
                }
            }
        }
        // A fold reported far from the middle is not the Duo's inside screen opened flat: the middle.
        #expect(spread(fold: 300).fold == 445)
        #expect(spread(fold: 600).fold == 445)
    }

    /// Three of today's rows always stand above the bar on the right page, and three of the week's
    /// lines on the left, whatever the window's insets (the phone's own, under `-TodaySize`, are
    /// large); where the board would put them lower the sheet rises, and the sign goes rather
    /// than meet the sheet. Nothing stands in the home-indicator area.
    @Test func theSpreadShowsThreeRowsAboveTheBar() {
        for top in [CGFloat(0), 10, 24, 44, 62] {
            for bottom in [CGFloat(0), 20, 34] {
                for waiting in [false, true] {
                    let s = spread(top: top, bottom: bottom, waiting: waiting)
                    let label = "top \(top) bottom \(bottom) waiting \(waiting)"
                    #expect(s.rowsTop + 3 * s.row + 2 * s.rowGap <= s.bar.fade.minY, "\(label)")
                    #expect(s.weekList.minY + 3 * Board.touch <= s.bar.fade.minY, "\(label)")
                    #expect(s.rowsTopNoCard <= s.rowsTop && s.card.maxY <= s.rowsTop, "\(label)")
                    #expect(s.todayHeader.maxY <= s.card.minY && s.todayHeader.minY > s.sheetTop, "\(label)")
                    #expect(s.weekHeaderFrame.maxY <= s.weekList.minY && s.weekHeader.y > s.sheetTop, "\(label)")
                    if let line = s.waiting {
                        #expect(line.minY >= s.sheetTop && line.maxY <= s.todayHeader.minY, "\(label)")
                    }
                    if s.sign != .none {
                        #expect(s.sign.plank.maxY + turn(s.sign) <= s.sheetTop, "\(label): the sign meets the sheet")
                        #expect(s.sign.plank.minY - turn(s.sign) >= s.navTop + Board.wordsRow + Board.clearance, "\(label)")
                    }
                    for r in [s.bar.field, s.bar.more, s.bar.inbox] {
                        #expect(r.maxY <= Board.size.height - bottom, "\(label): \(r) in the home-indicator area")
                    }
                    #expect(s.band.height > s.sheetTop - s.navTop, "\(label): the band ends under the sheet")
                }
            }
        }
        // The board's own insets need no rise, and keep the sign.
        #expect(spread().sign != .none)
        #expect(spread(top: 24, bottom: 20).sign != .none)
    }

    @Test func theSpreadsControlsAreAtLeast44AndApart() {
        for waiting in [false, true] {
            let targets = spread(waiting: waiting).touchTargets
            #expect(targets.count == (waiting ? 6 : 5))
            for t in targets { #expect(t.width >= Board.touch && t.height >= Board.touch, "\(t)") }
            for (i, a) in targets.enumerated() {
                for b in targets.dropFirst(i + 1) { #expect(!a.intersects(b), "\(a) meets \(b)") }
            }
        }
    }

    /// Up to two month goals on the band over the left page, planted by hand at the board's poles
    /// (x 190, y 108…172 and x 352, y 96…166), clear of the row of words and of the sheet.
    @Test func theMonthFlagsStandOverTheLeftPage() {
        let goals = [Signpost.Named(id: UUID(), title: "Pick the tile and pay the deposit"),
                     Signpost.Named(id: UUID(), title: "Find a gym that fits"),
                     Signpost.Named(id: UUID(), title: "Clear out the old vanity")]
        let s = spread()
        let flags = DailyMetrics.spreadFlags(goals, on: s)
        #expect(flags.map(\.id) == goals.prefix(2).map(\.id))
        #expect(DailyMetrics.spreadFlags(goals, on: s) == flags)
        #expect(abs(flags[0].pole.minX - 190) < 0.01 && abs(flags[1].pole.minX - 352) < 0.01)
        #expect(flags[0].pole.height == 64 && flags[1].pole.height == 70)
        #expect(abs(flags[0].pole.maxY - 172) <= 6 && abs(flags[1].pole.maxY - 166) <= 6)
        for flag in flags {
            #expect(flag.cloth.minY >= s.navTop + Board.wordsRow, "a cloth under the row of words")
            #expect(flag.cloth.maxY <= s.sheetTop)
            #expect(flag.lean * flag.tilt < 0)
        }
        #expect(DailyMetrics.spreadFlags([], on: s).isEmpty)
        // A sheet risen so far the flags would meet it, or the row of words, shows none.
        let risen = spread(top: 62, bottom: 34, waiting: true)
        for flag in DailyMetrics.spreadFlags(goals, on: risen) {
            #expect(flag.cloth.maxY <= risen.sheetTop && flag.cloth.minY >= risen.navTop + Board.wordsRow)
        }
    }

    /// The waiting walk's line takes the 44 under the right page's top; Today there starts 44 lower,
    /// and the left page is as it was.
    @Test func aWaitingWalkTakesItsLineOnTheRightPage() throws {
        let plain = spread(), waiting = spread(waiting: true)
        let line = try #require(waiting.waiting)
        #expect(line.height == Board.touch && line.minX == plain.card.minX && line.width == plain.card.width)
        #expect(waiting.todayHeader.minY == line.maxY + 6)
        #expect(waiting.weekList.minY - waiting.sheetTop == plain.weekList.minY - plain.sheetTop)
    }

    /// Month, Season and Year stay the letterboxed stage opened flat; the chosen flag's panel stands
    /// beside the stage on the right page, never over the mountain. On the phone it is the board's
    /// (20, 590) 350 wide, its foot 51 over the bar's line.
    @Test func aMountainPanelOpenedFlatStandsBesideTheStage() {
        let phone = DailyMetrics.today(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34)
        let onPhone = DailyMetrics.mountainPanel(size: CGSize(width: 390, height: 844), line: phone.bar.line,
                                                 layout: .oneColumn)
        #expect(onPhone.frame == CGRect(x: 20, y: 0, width: 350, height: phone.bar.line - 51))
        #expect(!onPhone.beside)

        let m = DailyMetrics.today(size: Board.size, safeTop: 10, safeBottom: 0, shape: .short)
        let place = DailyMetrics.mountainPanel(size: Board.size, line: m.bar.line, layout: .journal)
        let flat = place.frame
        #expect(place.beside)
        let stageRight = 890 / 2 + 390 * (626.0 / 844) / 2          // the stage, 626 high, centred
        #expect(flat.minX >= stageRight && flat.minX > 445)
        #expect(flat.maxX == 870 && flat.width >= 240)
        #expect(flat.maxY == m.bar.line - 51)
    }

    /// The Move to panel stands over the left page, its foot on the bar's line slot's top.
    @Test func theMovePanelStandsOverTheLeftPage() {
        let s = spread()
        #expect(s.panel.minX == 12 && s.panel.maxX == s.fold - 12)
        #expect(s.panel.maxY == s.bar.line - 18)
        #expect(s.panel.minY == s.weekList.minY)
    }
}

extension DailyGateTests {
    /// Opened flat (Task 18, pre-flight finding 3): every horizon a light household can reach on this
    /// window is drawn light, so the dock is never hidden over a full page: Today and Week as the
    /// spread, Month, Season and Year as the mountain stage. A full household keeps the old journal.
    @Test func theSpreadIsBuilt() {
        #expect(DailyGate.layouts.contains(.journal))
        #expect(!DailyGate.layouts.contains(.glanceWide))
        for h in Horizon.allCases {
            #expect(DailyGate.shows(h, edition: .light, layout: .journal), "\(h)")
            #expect(DailyGate.hidesDock(on: h, edition: .light, layout: .journal), "\(h)")
            #expect(!DailyGate.shows(h, edition: .full, layout: .journal), "\(h)")
            #expect(!DailyGate.hidesDock(on: h, edition: .full, layout: .journal), "\(h)")
        }
        #expect(DailyGate.page(.today, layout: .journal) == .spread)
        #expect(DailyGate.page(.week, layout: .journal) == .spread)
        for h in [Horizon.month, .season, .year] {
            #expect(DailyGate.page(h, layout: .journal) != .spread)
            #expect(DailyGate.mountain(h) != nil)
        }
        for l in [TodayLayout.oneColumn, .glance, .glanceWide, .dayPage] {
            #expect(DailyGate.page(.today, layout: l) == .today && DailyGate.page(.week, layout: l) == .week)
        }
    }

    /// The row of words opened flat: Year · Season · Month · "Week and today", the last for the
    /// spread (both pages); three words left of the fold, the last right of it. Month, Season and
    /// Year on this window wear the same four, so their last word leads back to the spread.
    @Test func theSpreadsRowOfWordsHasFourWords() {
        #expect(DailySpread.navWords(on: .journal) == [.year, .season, .month, .week])
        #expect(DailySpread.navLabel(on: .journal)(.week) == DailyCopy.weekAndToday)
        for h in [Horizon.year, .season, .month] {
            #expect(DailySpread.navLabel(on: .journal)(h) == DailyCopy.nav(h))
        }
        #expect(DailySpread.navLeft == 3)
        for l in [TodayLayout.oneColumn, .glance, .glanceWide, .dayPage] {
            #expect(DailySpread.navWords(on: l) == [.year, .season, .month, .week, .today])
            for h in Horizon.allCases { #expect(DailySpread.navLabel(on: l)(h) == DailyCopy.nav(h)) }
        }
    }
}

extension DailyHandoverTests {
    /// Opened flat the walk's light does not travel: the walk stands letterboxed across the fold on
    /// this window and the spread's sheet does not rise, so the bar's light simply wears the halo,
    /// with the once-only line (`.still`). It still plays there: light Today is this window's page.
    @Test func onTheSpreadTheLightLandsWithoutTravelling() {
        #expect(!DailyHandover.travels(on: .journal))
        for l in [TodayLayout.oneColumn, .glance, .dayPage] { #expect(DailyHandover.travels(on: l)) }
        #expect(DailyHandover.play(lowered: false, sheetOver: false, reduceMotion: false,
                                   travels: DailyHandover.travels(on: .journal)) == .still)
        #expect(DailyHandover.play(lowered: false, sheetOver: true, reduceMotion: false, travels: false) == .skip)
        #expect(DailyHandover.play(lowered: false, sheetOver: false, reduceMotion: false) == .travel)
        #expect(DailyHandover.plays(.walk, status: .finished, edition: .light,
                                    lightToday: DailyGate.hidesDock(on: .today, edition: .light, layout: .journal)))
        #expect(!DailyHandover.plays(.walk, status: .finished, edition: .full,
                                     lightToday: DailyGate.hidesDock(on: .today, edition: .full, layout: .journal)))
    }
}
