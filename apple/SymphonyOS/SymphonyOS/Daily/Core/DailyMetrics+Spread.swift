import Foundation
import CoreGraphics

/// Where everything sits on the Duo opened flat and held sideways ("Duo, opened flat" in the
/// plan's boards, 890 × 626 with the fold at 445): one band of scenery across both pages with
/// the row of words, the signpost over the right page and up to two month flags over the left;
/// one sheet across both; on the left page the rest of the week, on the right Today with the
/// bar, More at the left page's foot and Inbox at the right's. Every frame is in the page's own
/// space. Down the page things stand from `navTop` (the safe-area top) and the bar from the
/// window's foot; across it, each page's things stand from the fold (`fold`), so a fold a little
/// off centre moves them with it and nothing readable or tappable ever crosses it. No handle:
/// the whole plan is not offered here (the plan's call for windows without one).
struct DailySpread: Equatable {
    let size: CGSize
    let band: CGRect
    /// The square picture's frame on the page.
    let picture: CGRect
    let navTop: CGFloat
    /// The gap between the words in the row of words.
    let navGap: CGFloat
    let sheetTop: CGFloat
    let sheetRadius: CGFloat
    /// Where the pages meet, in from the left.
    let fold: CGFloat
    /// The soft shade down the fold, on the sheet.
    let foldShade: CGRect
    /// The signpost over the right page (`.none` where a risen sheet leaves it no room).
    let sign: DailyMetrics.Sign
    /// The left page's header ("The rest of this week" over the range): its top-left.
    let weekHeader: CGPoint
    /// The left page's list, from its first line's top to the window's foot.
    let weekList: CGRect
    /// A line of the week at least this high.
    let weekRow: CGFloat
    /// The right page's header (Today over the date, the ring at its right): as high as the ring.
    let todayHeader: CGRect
    let ring: CGFloat
    /// The next event's card.
    let card: CGRect
    let rowsTop: CGFloat
    let rowsTopNoCard: CGFloat
    let row: CGFloat
    let rowGap: CGFloat
    /// The waiting walk's line on the right page, 44 high above the header; nil without one.
    let waiting: CGRect?
    /// The bar on the right page (More on the left page's foot), its line slot and fade there.
    let bar: DailyMetrics.Bar
    /// Where the Move to panel may stand over the left page: it grows up from this frame's foot
    /// (the top of the bar's line slot, so an Undo there stays in sight), at most to its top.
    let panel: CGRect

    /// The left page's header frame: as wide as the list's words, 48 high (eyebrow over title).
    var weekHeaderFrame: CGRect {
        CGRect(x: weekHeader.x, y: weekHeader.y, width: weekList.maxX - weekHeader.x, height: 48)
    }

    /// Where each page's list scrolls: the list widened by `spreadHalo` each side, so a chosen or
    /// lit row's 3-point halo is never clipped; it still ends short of the fold.
    var weekScroll: CGRect { weekList.insetBy(dx: -DailyMetrics.spreadHalo, dy: 0) }
    var rowsScroll: CGRect {
        CGRect(x: card.minX - DailyMetrics.spreadHalo, y: rowsTopNoCard, width: card.width + 2 * DailyMetrics.spreadHalo,
               height: size.height - rowsTopNoCard)
    }

    /// Where the top shade stops being full strength (the row of words' foot), and where it is clear.
    var shadeSolid: CGFloat { navTop + DailyMetrics.navHeight }
    var shade: CGFloat { shadeSolid + DailyMetrics.shadeFade }

    /// Every control's touch shape other than the rows and the flags: the field's typing part, the
    /// light, More, Inbox, the sign, the waiting walk's line. Each is at least 44 × 44 and none meets another.
    var touchTargets: [CGRect] {
        [bar.typing, bar.lightTouch, bar.more, bar.inbox, sign.touch, waiting]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
    }

    /// The row of words opened flat: Year · Season · Month · "Week and today" (one word for the
    /// spread, which is both Week and Today). Month, Season and Year wear the same four on this
    /// window, so their last word leads back to the spread; every other window keeps all five.
    static func navWords(on layout: TodayLayout) -> [Horizon] {
        layout == .journal ? [.year, .season, .month, .week] : [.year, .season, .month, .week, .today]
    }

    /// What each word reads on this window: opened flat, Week's word is "Week and today".
    static func navLabel(on layout: TodayLayout) -> (Horizon) -> String {
        layout == .journal ? { $0 == .week ? DailyCopy.weekAndToday : DailyCopy.nav($0) } : DailyCopy.nav
    }

    /// On the spread the first three words stand left of the fold and the last right of it, the
    /// gap between them on the fold, so no word sits across it.
    static let navLeft = 3

    /// How the row of words splits on this window (`DailyNavRow.split`): opened flat, the first
    /// `navLeft` words right-aligned to the fold and the rest from it, on every page there (the
    /// spread, and Month, Season and Year); nil elsewhere, where the words stand centred.
    static func navSplit(on layout: TodayLayout, fold: CGFloat) -> (at: CGFloat, after: Int)? {
        layout == .journal ? (fold, navLeft) : nil
    }

    /// Where the pages meet on a window `width` wide, from the split the screen reports
    /// (`HalfOpen.split`; nil: none): one farther than `spreadFoldRange` from the middle is not the
    /// Duo opened flat, and is taken as the middle.
    static func fold(_ reported: CGFloat?, width: CGFloat) -> CGFloat {
        let middle = (width / 2).rounded()
        return reported.flatMap { abs($0 - middle) <= DailyMetrics.spreadFoldRange ? $0 : nil } ?? middle
    }

    // MARK: The left page

    /// The week the left page shows: the selected date's, exactly as the phone's Week page
    /// follows `AppState.selectedDate`. The right page is always today.
    static func weekStart(selected: Date) -> Date {
        PlanCalendar.weekStart(selected)
    }

    /// What the left page shows of `week`: for the week holding today, "The rest of this week" and
    /// the days after today (`DailyWeek.rest`), then the fold; for any other week, the heading the
    /// Week page gives it ("Next week", …) and every day.
    struct Left: Equatable {
        let eyebrow: String
        let range: String
        let days: [DailyWeek.Day]
        let past: DailyWeek.Past?
    }

    static func left(_ week: DailyWeek.Week, today: Date) -> Left {
        let holdsToday = PlanCalendar.weekDays(week.start).contains { PlanCalendar.sameDay($0, today) }
        return Left(eyebrow: holdsToday ? DailyCopy.restOfWeek : week.eyebrow, range: week.range,
                    days: DailyWeek.rest(week), past: week.past)
    }

    /// The date a word in the row of words opens its page on, where this window decides it: opened
    /// flat, the last word ("Week and today") brings the selected date back to today, so a left page
    /// showing another week returns to this one. Nil: the Planner's own rule
    /// (`WalkPeriods.switcherDate`).
    static func navDate(_ horizon: Horizon, on layout: TodayLayout, today: Date) -> Date? {
        layout == .journal && horizon == .week ? PlanCalendar.day(today) : nil
    }
}

extension DailyMetrics {
    /// The spread on a window of `size` with the pages meeting at `fold` (in from the left, as
    /// `HalfOpen.split` reports it; nil, or one farther than `spreadFoldRange` from the middle,
    /// is the middle). The boards' numbers, with widths taking the rest. Three of today's rows
    /// always end above the bar's fade (with the waiting walk's line when it shows): where the
    /// board would put them lower, the sheet and everything on it rise by exactly the shortfall
    /// and the band gives up that height; the sign rises with it while it keeps `signClearance`
    /// under the row of words, and goes if its plank would then meet the sheet.
    static func spread(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat, fold: CGFloat?,
                       waiting: Bool = false) -> DailySpread {
        let f = DailySpread.fold(fold, width: size.width)
        let navTop = safeTop
        let width = size.width

        // The bar: the field on the right page with Inbox after it, More on the left page's foot.
        let foot = max(safeBottom + keyboardGap, spreadBarFoot)
        let fieldTop = size.height - foot - spreadField
        let icon: CGFloat = 56, edge: CGFloat = 20
        let inbox = CGRect(x: width - edge - icon, y: fieldTop - 4, width: icon, height: icon)
        let rightLeft = f + spreadRightInset
        let bar = Bar(field: CGRect(x: rightLeft, y: fieldTop, width: inbox.minX - 6 - rightLeft, height: spreadField),
                      speaking: CGRect(x: rightLeft, y: fieldTop, width: width - 16 - rightLeft, height: spreadField),
                      light: 38,
                      more: CGRect(x: edge, y: fieldTop - 4, width: icon, height: icon),
                      inbox: inbox,
                      line: fieldTop - 30,
                      fade: CGRect(x: f, y: fieldTop - 58, width: width - f, height: 44))

        // The board, before any rise.
        let sheetTop = navTop + 166
        let drop: CGFloat = waiting ? minTouch : 0
        let line = waiting ? CGRect(x: rightLeft, y: navTop + 182, width: width - 16 - rightLeft, height: minTouch) : nil
        let todayHeader = CGRect(x: f + 31, y: navTop + 188 + drop, width: width - 22 - (f + 31), height: 52)
        let card = CGRect(x: rightLeft, y: todayHeader.minY + 64, width: width - 16 - rightLeft, height: 40)
        let rowsTop = card.maxY + 8
        let row: CGFloat = 50, rowGap: CGFloat = 5
        let rise = max(0, rowsTop + 3 * row + 2 * rowGap - bar.fade.minY)
        func up(_ r: CGRect) -> CGRect { r.offsetBy(dx: 0, dy: -rise) }

        let listTop = navTop + 252 - rise
        let weekList = CGRect(x: 16, y: listTop, width: f - 45, height: size.height - listTop)
        let panelFoot = bar.line - 18

        // The sign over the right page, rising with the sheet but never into the row of words.
        let post = CGRect(x: f + 75, y: navTop + 56, width: 7, height: 130)
        let plankLeft = f + 47
        let plank = CGRect(x: plankLeft, y: navTop + 72, width: width - plankLeft - 60, height: 60)
        var sign = Sign(post: post, plank: plank, point: 29,
                        strip: CGRect(x: post.minX - plank.minX, y: 0, width: post.width, height: plank.height),
                        nail: 7, eyebrow: CGPoint(x: 44, y: 8), title: CGPoint(x: 44, y: 24),
                        eyebrowSize: 10.5, titleSize: 20)
        let turn = (plank.width + sign.point) * CGFloat(sin(signTurn * .pi / 180))
        let room = max(0, min(post.minY, plank.minY - turn) - (navTop + navHeight + signClearance))
        sign = sign.moved(up: min(rise, room))
        if sign.plank.maxY + turn > sheetTop - rise { sign = .none }

        let k = width / 890
        return DailySpread(
            size: size,
            band: CGRect(x: 0, y: 0, width: width, height: navTop + 220 - rise),
            picture: CGRect(x: -55 * k, y: -150 * k, width: 1000 * k, height: 1000 * k),
            navTop: navTop, navGap: 26,
            sheetTop: sheetTop - rise, sheetRadius: 26,
            fold: f,
            foldShade: CGRect(x: f - spreadFoldShade / 2, y: sheetTop - rise, width: spreadFoldShade,
                              height: size.height - sheetTop + rise),
            sign: sign,
            weekHeader: CGPoint(x: 24, y: navTop + 188 - rise),
            weekList: weekList, weekRow: minTouch,
            todayHeader: up(todayHeader), ring: 52,
            card: up(card), rowsTop: rowsTop - rise, rowsTopNoCard: card.minY - rise,
            row: row, rowGap: rowGap,
            waiting: line.map(up),
            bar: bar,
            panel: CGRect(x: 12, y: listTop, width: f - 24, height: max(0, panelFoot - listTop)))
    }

    /// Week's band flags on the spread: the same hand-planted month goals (`bandFlags`), over the
    /// left page at the board's poles (x 190 and 352 of a 445 page; feet near `navTop + 162` and
    /// `navTop + 156`, a pole's foot may stand just behind the sheet's edge), risen with the sheet.
    /// A flag whose cloth the risen sheet or the row of words would meet is not shown.
    static func spreadFlags(_ goals: [Signpost.Named], on spread: DailySpread) -> [BandFlag] {
        let rise = spread.navTop + 166 - spread.sheetTop
        return bandFlags(goals, width: spread.fold, navTop: spread.navTop - rise, slots: spreadFlagSlots)
            .filter { $0.cloth.maxY <= spread.sheetTop && $0.cloth.minY >= spread.navTop + navHeight }
    }

    /// A band flag's place: x as a share of the band's width, the foot below `navTop`, the pole's length.
    struct FlagSlot: Equatable {
        let x: CGFloat
        let foot: CGFloat
        let length: CGFloat
    }

    /// The month flags' slots over a 445-point left page (x as a share of it, foot from `navTop`, pole length).
    static let spreadFlagSlots: [FlagSlot] = [FlagSlot(x: 190 / 445, foot: 162, length: 64),
                                              FlagSlot(x: 352 / 445, foot: 156, length: 70)]

    // MARK: Month, Season and Year opened flat

    /// Where a mountain page's panel for the chosen flag may stand (`MountainPageView`): it grows up
    /// from this frame's foot, `mountainPanelAbove` over the bar's `line` (the board's 673 over 724),
    /// so it never reaches the hint or the bar. On the phone it stands 20 in from each side (the
    /// board's (20, 590) 350 wide). Opened flat the stage is letterboxed narrow in the middle of a
    /// short window, where a window-wide panel would cover its lower flags, the chosen one among
    /// them: there it stands beside the stage on the right, over the letterbox, wholly on the right page,
    /// and (`beside`) its chips wrap onto more lines, since growing up there covers no peak.
    static func mountainPanel(size: CGSize, line: CGFloat, layout: TodayLayout) -> (frame: CGRect, beside: Bool) {
        let height = max(0, line - mountainPanelAbove)
        let wide = CGRect(x: mountainPanelInset, y: 0, width: size.width - 2 * mountainPanelInset, height: height)
        guard layout == .journal else { return (wide, false) }
        let stage = WalkStage(device: size)
        let left = stage.origin.x + WalkArt.overlookSquare.stage.width * stage.scale + 16
        let width = size.width - mountainPanelInset - left
        guard width >= mountainPanelBeside else { return (wide, false) }
        return (CGRect(x: left, y: 0, width: width, height: height), true)
    }

    static let mountainPanelInset: CGFloat = 20
    static let mountainPanelAbove: CGFloat = 51
    /// Beside the stage only where the letterbox leaves at least this much room.
    static let mountainPanelBeside: CGFloat = 240

    /// The spread's field: 48 high, at least 12 above the window's foot (the board's 566 of 626).
    static let spreadField: CGFloat = 48
    static let spreadBarFoot: CGFloat = 12
    /// The right page's rows, card and field start this far in from the fold.
    static let spreadRightInset: CGFloat = 25
    /// The soft shade down the fold.
    static let spreadFoldShade: CGFloat = 40
    /// A list's scroll is this much wider than its rows each side (room for a 3-point halo).
    static let spreadHalo: CGFloat = 8
    /// A fold reported farther than this from the window's middle is taken as the middle.
    static let spreadFoldRange: CGFloat = 45
}
