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

    /// The chosen flag's panel stands beside the standing cloths (its left edge 16 right of the cloths'
    /// right edge on the page) wherever that leaves 240 across, as it does opened flat; elsewhere it is the
    /// board's 20 in from each side. Either way its foot is 51 over the bar's line, its height its estimate.
    @Test func aMountainPanelStandsBesideTheStandingCloths() {
        let size = CGSize(width: 390, height: 844)
        let phone = DailyMetrics.mountainFoot(size: size, safeTop: 44, safeBottom: 34, layout: .oneColumn, strip: true)
        let onPhone = DailyMetrics.mountainPanel(size: size, line: phone.bar.line, navTop: 44, stage: phone.stage, chosen: nil,
                                                 title: "Find a gym that fits", hasLine: false,
                                                 chips: [WalkCopy.moveTo, WalkCopy.pullUp], moving: false)
        let height = DailyMetrics.mountainPanelHeight(titleLines: 1, hasLine: false, chipRows: 1)
        #expect(onPhone.frame == CGRect(x: 20, y: phone.bar.line - 51 - height, width: 350, height: height))
        #expect(!onPhone.beside && !onPhone.dropsLine)

        let flat = DailyMetrics.mountainFoot(size: Board.size, safeTop: 10, safeBottom: 0, layout: .journal, strip: true)
        let place = DailyMetrics.mountainPanel(size: Board.size, line: flat.bar.line, navTop: 10, stage: flat.stage, chosen: nil,
                                               title: "Find a gym that fits", hasLine: true,
                                               chips: [DailyCopy.walkItDown, WalkCopy.moveTo, WalkCopy.pullUp], moving: false)
        #expect(place.beside)
        let cloths = flat.stage.toDevice(CGPoint(x: 195 + WalkLayout.standingWidth(wing: flat.stage.wing) / 2, y: 0)).x
        #expect(place.frame.minX == cloths + 16)
        #expect(place.frame.maxX == 870 && place.frame.width >= 240)
        #expect(place.frame.maxY == flat.bar.line - 51)
    }

    /// The Move to panel stands over the left page, its foot on the bar's line slot's top.
    @Test func theMovePanelStandsOverTheLeftPage() {
        let s = spread()
        #expect(s.panel.minX == 12 && s.panel.maxX == s.fold - 12)
        #expect(s.panel.maxY == s.bar.line - 18)
        #expect(s.panel.minY == s.weekList.minY)
    }
}

extension DailyMetricsTests {
    // MARK: Fix round 1

    /// Opened flat, the row of words splits at the fold on every page (the spread, and Month,
    /// Season and Year): the first three words end at the fold, "Week and today" starts there, so
    /// none crosses it, for folds a little off centre as for the board's. Elsewhere the words stand centred.
    @Test func theRowOfWordsSplitsAtTheFoldOnEveryPageOpenedFlat() throws {
        for reported in stride(from: CGFloat(435), through: 455, by: 1) {
            let fold = DailySpread.fold(reported, width: 890)
            #expect(fold == reported)
            let split = try #require(DailySpread.navSplit(on: .journal, fold: fold))
            #expect(split.at == fold && split.after == 3)
            let words = DailySpread.navWords(on: .journal)
            #expect(Array(words.prefix(split.after)) == [.year, .season, .month])
            #expect(Array(words.dropFirst(split.after)) == [.week])
            // The spread's own fold is the same one.
            #expect(spread(fold: reported).fold == fold)
        }
        #expect(DailySpread.fold(nil, width: 890) == 445)
        #expect(DailySpread.fold(300, width: 890) == 445)
        for l in [TodayLayout.oneColumn, .glance, .glanceWide, .dayPage] {
            #expect(DailySpread.navSplit(on: l, fold: 445) == nil)
        }
    }

    /// The left page follows the week of the selected date, as the phone's Week page does; the right
    /// page is always today. On the week's last day "That's the day" (`Signpost` target
    /// `.week(tomorrow)`) opens next week on the left page; the last word brings it back to today.
    @Test func theLeftPageFollowsTheSelectedWeek() {
        func day(_ m: Int, _ d: Int) -> Date { PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: m, day: d))! }
        func left(selected: Date, today: Date) -> DailySpread.Left {
            let start = DailySpread.weekStart(selected: selected)
            let week = DailyWeek.make(tasks: [], goals: [], commitments: [], focus: [], events: { _ in [] },
                                      weekStart: start, today: today, me: UUID())
            return DailySpread.left(week, today: today)
        }

        // This week: the rest of it, after today.
        let tuesday = day(11, 10)
        let thisWeek = PlanCalendar.weekDays(PlanCalendar.weekStart(tuesday))
        let now = left(selected: tuesday, today: tuesday)
        #expect(now.eyebrow == DailyCopy.restOfWeek)
        #expect(now.range == DailyCopy.weekRange(PlanCalendar.weekStart(tuesday)))
        #expect(now.days.compactMap(\.date) == thisWeek.filter { $0 > tuesday })

        // The week's last day, the sign followed to tomorrow: next week, every day, as Week heads it.
        let last = thisWeek.last!
        let tomorrow = PlanCalendar.addDays(last, 1)
        let next = left(selected: tomorrow, today: last)
        let nextStart = PlanCalendar.weekStart(tomorrow)
        #expect(nextStart > last)
        #expect(next.eyebrow == DailyCopy.weekEyebrow(nextStart, today: last))
        #expect(next.range == DailyCopy.weekRange(nextStart))
        #expect(next.days.compactMap(\.date) == PlanCalendar.weekDays(nextStart))
        #expect(next.past == nil)
        // The right page stays on today whatever is selected: it is read for `model.today` only.

        // "Week and today" brings the selected date back to today, and with it this week.
        let back = DailySpread.navDate(.week, on: .journal, today: last)
        #expect(back == PlanCalendar.day(last))
        #expect(DailySpread.weekStart(selected: back!) == PlanCalendar.weekStart(last))
        #expect(left(selected: back!, today: last).eyebrow == DailyCopy.restOfWeek)
        // Only the last word, only opened flat.
        for h in [Horizon.year, .season, .month, .today] { #expect(DailySpread.navDate(h, on: .journal, today: last) == nil) }
        #expect(DailySpread.navDate(.week, on: .oneColumn, today: last) == nil)
    }
}

extension DailyGateTests {
    /// Opened flat (Task 18, pre-flight finding 3): every horizon a light household can reach on this
    /// window is drawn light, so the dock is never hidden over a full page: Today and Week as the
    /// spread, Month, Season and Year as the mountain stage. A full household keeps the old journal.
    @Test func theSpreadIsBuilt() {
        #expect(DailyGate.layouts.contains(.journal))
        #expect(!DailyGate.layouts.contains(.glanceWide))
        #expect(!DailyGate.shows(.today, edition: .light, layout: .journal, phone: false))     // an iPad sideways (D17)
        for h in Horizon.allCases {
            #expect(DailyGate.shows(h, edition: .light, layout: .journal, phone: true), "\(h)")
            #expect(DailyGate.hidesDock(on: h, edition: .light, layout: .journal, phone: true), "\(h)")
            #expect(!DailyGate.shows(h, edition: .full, layout: .journal, phone: true), "\(h)")
            #expect(!DailyGate.hidesDock(on: h, edition: .full, layout: .journal, phone: true), "\(h)")
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

extension DailyGateTests {
    /// Ruling D17: the light pages are for the phone only (an iPhone, the Duo among them). An iPad's
    /// windows take the phone's shapes (held sideways `.journal`, upright `.dayPage`, a narrow window
    /// `.oneColumn`), but on an iPad nothing light is built: no page, no hidden dock, no light
    /// half-open display, no handover; a light household keeps the old pages with the dock, as before.
    @Test func anIPadKeepsTheOldPages() {
        let all: [TodayLayout] = [.oneColumn, .glance, .glanceWide, .dayPage, .journal]
        for e in [Edition.light, .full] {
            for h in Horizon.allCases {
                for l in all {
                    #expect(!DailyGate.shows(h, edition: e, layout: l, phone: false), "\(e) \(h) \(l)")
                    #expect(!DailyGate.hidesDock(on: h, edition: e, layout: l, phone: false), "\(e) \(h) \(l)")
                    #expect(!DailyHandover.plays(.walk, status: .finished, edition: e,
                                                 lightToday: DailyGate.hidesDock(on: h, edition: e, layout: l, phone: false)))
                }
            }
            #expect(!DailyGate.halfOpen(edition: e, phone: false), "\(e)")
            #expect(!DailyGate.coversPage(edition: e, halfOpen: true, phone: false), "\(e)")
            #expect(!DailyGate.dropsPage(covered: DailyGate.coversPage(edition: e, halfOpen: true, phone: false),
                                         lightPage: false))
        }
        // The same windows on a phone are light.
        for l in [TodayLayout.oneColumn, .dayPage, .journal] {
            #expect(DailyGate.shows(.today, edition: .light, layout: l, phone: true), "\(l)")
        }
        // An iPad's windows are the phone's shapes, which is why the idiom must decide.
        #expect(TodayLayout.decide(width: 1194, height: 834, sideBars: false) == .journal)
        #expect(TodayLayout.decide(width: 834, height: 1194, sideBars: false) == .dayPage)
        #expect(TodayLayout.decide(width: 320, height: 1194, sideBars: false) == .oneColumn)
    }
}

/// When the day turns (`DailyModel.refreshDay` finds a new today), the selected date the light pages
/// follow is mended by ruling D18: a selected date that was today or later when the day turned, and
/// is now before today, becomes today; one already before the old today (a past week or period the
/// person went to) stays, and so does any date that is still today or later.
struct DailyDayTurnTests {
    private func day(_ m: Int, _ d: Int) -> Date {
        PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: m, day: d))!
    }

    private func left(selected: Date, today: Date) -> DailySpread.Left {
        let week = DailyWeek.make(tasks: [], goals: [], commitments: [], focus: [], events: { _ in [] },
                                  weekStart: DailySpread.weekStart(selected: selected), today: today, me: UUID())
        return DailySpread.left(week, today: today)
    }

    /// Selected = the old today: the new today. The left page becomes the week of the 15th.
    @Test func todayFollowsTheDay() {
        let saturday = day(11, 14), sunday = day(11, 15)
        let moved = DailyClock.selected(saturday, turnedFrom: saturday, to: sunday)
        #expect(PlanCalendar.sameDay(moved, sunday))
        #expect(DailySpread.weekStart(selected: moved) == PlanCalendar.weekStart(sunday))
        #expect(left(selected: moved, today: sunday).eyebrow == DailyCopy.restOfWeek)
    }

    /// A date that was today or later when the day turned and is now before today becomes today: the
    /// sign's "tomorrow" with the app reopened days later, and a mountain page's coming period once
    /// that date itself has passed.
    @Test func aDateThatWasAheadAndIsNowPastBecomesToday() {
        let saturday = day(11, 14), sunday = day(11, 15), wednesday = day(11, 18)
        #expect(PlanCalendar.sameDay(DailyClock.selected(sunday, turnedFrom: saturday, to: wednesday), wednesday))
        let monday = day(11, 16)
        #expect(PlanCalendar.sameDay(DailyClock.selected(monday, turnedFrom: saturday, to: wednesday), wednesday))
    }

    /// A date already before the old today (a past week or period gone to on purpose) stays, however
    /// far the day turns: last week, and a month page's date on the 1st.
    @Test func aDateAlreadyPastStays() {
        let saturday = day(11, 14), sunday = day(11, 15), wednesday = day(11, 18)
        let lastWeek = day(11, 4)
        #expect(DailyClock.selected(lastWeek, turnedFrom: saturday, to: sunday) == lastWeek)
        #expect(DailyClock.selected(lastWeek, turnedFrom: saturday, to: wednesday) == lastWeek)
        let month = day(11, 1)
        #expect(DailyClock.selected(month, turnedFrom: saturday, to: sunday) == month)
    }

    /// A date that is still today or later stays: the sign's "tomorrow" (now today, read as this
    /// week), and a mountain page's coming period until that date itself passes.
    @Test func aDateStillTodayOrLaterStays() {
        let saturday = day(11, 14), sunday = day(11, 15)
        let fromTheSign = DailyClock.selected(sunday, turnedFrom: saturday, to: sunday)
        #expect(fromTheSign == sunday)
        #expect(left(selected: fromTheSign, today: sunday).eyebrow == DailyCopy.restOfWeek)
        let december = day(12, 1)
        #expect(DailyClock.selected(december, turnedFrom: saturday, to: sunday) == december)
        // The day not turning changes nothing.
        #expect(DailyClock.selected(saturday, turnedFrom: saturday, to: saturday) == saturday)
    }

    /// The Planner's step (`DailyGate.dayTurn`): it runs only where light pages live for this device,
    /// a light household on a phone, on any of its windows (a phone held sideways too, so turning it
    /// upright later shows the right date); on an iPad, or in a full household, the date is untouched.
    /// It keeps the last day it saw, so a day that turned while the Planner was away is mended when
    /// it comes back; the first day seen only records it.
    @Test func theDayTurnsOnlyWhereLightPagesLive() {
        let saturday = day(11, 14), sunday = day(11, 15), wednesday = day(11, 18)
        // A phone, held any way (the step takes no window): follows, and records the new day.
        let phone = DailyGate.dayTurn(selected: saturday, lastDay: saturday, today: sunday, edition: .light, phone: true)
        #expect(PlanCalendar.sameDay(phone.selected, sunday) && phone.lastDay == sunday)
        // An iPad: the old pages' date is untouched, and nothing is recorded.
        let iPad = DailyGate.dayTurn(selected: saturday, lastDay: saturday, today: sunday, edition: .light, phone: false)
        #expect(iPad.selected == saturday && iPad.lastDay == saturday)
        // A full household: untouched.
        let full = DailyGate.dayTurn(selected: saturday, lastDay: saturday, today: sunday, edition: .full, phone: true)
        #expect(full.selected == saturday)
        // The first day seen: recorded, nothing moves.
        let first = DailyGate.dayTurn(selected: saturday, lastDay: nil, today: saturday, edition: .light, phone: true)
        #expect(first.selected == saturday && first.lastDay == saturday)
        // Away from Saturday to Wednesday (the model made again): mended on return.
        let back = DailyGate.dayTurn(selected: saturday, lastDay: saturday, today: wednesday, edition: .light, phone: true)
        #expect(PlanCalendar.sameDay(back.selected, wednesday) && back.lastDay == wednesday)
    }
}

extension DailyMetricsTests {
    /// The spread's bar shows its placeholder whole: its words' room, at the board and for folds a
    /// little off centre, is at least the phone board's (195, where "Add to today" is seen whole), and
    /// `DailyCopy.fitting` picks the full form there even at a generous 10 points a letter.
    @Test func theSpreadsPlaceholderFitsItsField() {
        let periods = WalkPeriods.pick(now: PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 10))!)
        let full = DailyCopy.placeholder(.today, periods: periods)
        let forms = [full, DailyCopy.shortPlaceholder(.today, periods: periods)]
        let phoneRoom = DailyMetrics.today(size: CGSize(width: 390, height: 844), safeTop: 44, safeBottom: 34).bar.wordsRoom
        for fold in stride(from: CGFloat(435), through: 455, by: 5) {
            let room = spread(fold: fold).bar.wordsRoom
            #expect(room >= phoneRoom, "fold \(fold): \(room)")
            #expect(DailyCopy.fitting(forms, room: room, width: { CGFloat($0.count) * 10 }) == full, "fold \(fold)")
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
                                    lightToday: DailyGate.hidesDock(on: .today, edition: .light, layout: .journal, phone: true)))
        #expect(!DailyHandover.plays(.walk, status: .finished, edition: .full,
                                     lightToday: DailyGate.hidesDock(on: .today, edition: .full, layout: .journal, phone: true)))
    }
}
