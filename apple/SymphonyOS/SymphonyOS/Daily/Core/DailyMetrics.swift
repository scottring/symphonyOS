import Foundation
import CoreGraphics

/// Where everything sits on Today and Week: the approved boards' numbers ("The boards as
/// numbers" in the plan), stretched to a real window from its safe edges. Offsets down the
/// page are from `navTop` (the safe-area top); the bar stands on the window's foot; left and
/// right insets are fixed and widths take the rest; the picture scales with the width.
///
/// Two shapes: `.tall` is the 390 × 844 phone board; `.short` is the Duo's outside screen
/// (466 × 678) board, used there and on any window under 760 high.
struct DailyMetrics: Equatable {
    enum Shape: Equatable { case tall, short }

    /// The signpost. Every frame but `post` and `plank` is in the plank's own space.
    struct Sign: Equatable {
        let post: CGRect
        let plank: CGRect
        /// How deep the plank's pointed right end is, beyond `plank`.
        let point: CGFloat
        /// The post seen across the plank: on the post's line, the plank's full height.
        let strip: CGRect
        /// A nail head's diameter.
        let nail: CGFloat
        let eyebrow: CGPoint
        let title: CGPoint
        let eyebrowSize: CGFloat
        let titleSize: CGFloat

        /// The two nail heads that fix the plank to its post: on the strip, one at the
        /// plank's top edge and one at its bottom edge (never beside the words).
        var nails: [CGRect] {
            guard nail > 0 else { return [] }
            let inset = DailyMetrics.nailInset
            return [CGRect(x: strip.minX, y: strip.minY + inset, width: nail, height: nail),
                    CGRect(x: strip.minX, y: strip.maxY - inset - nail, width: nail, height: nail)]
        }

        /// The whole plank, its point included: what a tap lands on.
        var touch: CGRect {
            CGRect(x: plank.minX, y: plank.minY, width: plank.width + point, height: plank.height)
        }

        /// The post and plank moved up together (frames in the plank's space stay).
        func moved(up d: CGFloat) -> Sign {
            Sign(post: post.offsetBy(dx: 0, dy: -d), plank: plank.offsetBy(dx: 0, dy: -d), point: point,
                 strip: strip, nail: nail, eyebrow: eyebrow, title: title,
                 eyebrowSize: eyebrowSize, titleSize: titleSize)
        }

        /// No signpost: Week's, and Today's where the window leaves it no room.
        static let none = Sign(post: .zero, plank: .zero, point: 0, strip: .zero, nail: 0,
                               eyebrow: .zero, title: .zero, eyebrowSize: 0, titleSize: 0)
    }

    /// The add bar at rest (`field`) and while it listens (`speaking`, More and Inbox hidden).
    struct Bar: Equatable {
        let field: CGRect
        let speaking: CGRect
        /// The light's diameter; it sits at the field's right end, 5 in.
        let light: CGFloat
        let more: CGRect
        let inbox: CGRect
        /// The y of the one-line slot above the bar.
        let line: CGFloat
        /// Where the paper fades in over the rows.
        let fade: CGRect

        /// The light's touch shape: 44 wide, the field's full height, ending where the light ends.
        var lightTouch: CGRect {
            CGRect(x: field.maxX - DailyMetrics.lightInset - DailyMetrics.minTouch, y: field.minY,
                   width: DailyMetrics.minTouch, height: field.height)
        }

        /// The field's typing part: the field with the light's touch shape taken off its right end.
        var typing: CGRect {
            CGRect(x: field.minX, y: field.minY, width: lightTouch.minX - field.minX, height: field.height)
        }

        /// How far the field and the line rise so the field's foot stands `keyboardGap` above
        /// the keyboard's top (in the page's own space); 0 with the keyboard down or below the bar.
        func rise(keyboardTop: CGFloat) -> CGFloat {
            max(0, field.maxY + DailyMetrics.keyboardGap - keyboardTop)
        }
    }

    let size: CGSize
    let navTop: CGFloat
    /// The gap between the words in the row of words.
    let navGap: CGFloat
    let band: CGRect
    /// The square picture's frame on the page.
    let picture: CGRect
    let sheetTop: CGFloat
    let sheetRadius: CGFloat
    let sign: Sign
    let bar: Bar
    /// The handle's touch shape ("see my whole plan"), on every phone window (F25: short ones too);
    /// nil on the spread, which has none.
    let lookBack: CGRect?
    /// The waiting walk's line, 44 high under the handle; nil without one.
    let waiting: CGRect?
    let header: CGRect
    /// The ring's diameter (0: the page has none).
    let ring: CGFloat
    /// The next event's card (`.zero`: the page has none).
    let card: CGRect
    let rowsTop: CGFloat
    let rowsTopNoCard: CGFloat
    let row: CGFloat
    let rowGap: CGFloat
    /// The rows' left and right inset.
    let inset: CGFloat
    /// The shape the board was stretched from.
    let shape: Shape

    // MARK: Fixed numbers

    static let minTouch: CGFloat = 44
    /// The handle's touch shape's width: the walk's capsule round "See my whole plan", its chevron and 20
    /// either side (`DailyMetricsTests.theHandlesWordsFitItsCapsule`).
    static let handleWidth: CGFloat = 188
    /// How many lines a row's title may take: one, as the boards draw it, and three at the
    /// accessibility text sizes, where the row grows in height to hold them.
    static func titleLines(accessibilitySize: Bool) -> Int { accessibilitySize ? 3 : 1 }
    /// How many lines a quieter line may take (Week's fold, an event, a row's "for" line): one, and
    /// two at the accessibility text sizes, so it wraps rather than cuts short.
    static func quietLines(accessibilitySize: Bool) -> Int { accessibilitySize ? 2 : 1 }
    /// A window under this height takes the short shape.
    static let shortHeight: CGFloat = 760
    /// A nail head stands this far in from the plank's top and bottom edges.
    static let nailInset: CGFloat = 5
    /// The light stands this far in from the field's right end.
    static let lightInset: CGFloat = 5
    /// With the keyboard up, the field's foot stands this far above it.
    static let keyboardGap: CGFloat = 8
    /// Two band flags' feet stand at least this far apart in height.
    static let flagsApart: CGFloat = 4
    /// The row of words from `navTop`: 14 above and below the 11.5 pt words, rounded up to 44.
    static let navHeight: CGFloat = 44
    /// The top shade behind the row of words: the walk's ground colour at this strength from the
    /// window's top to the row's foot, so every word reads at 4.5:1 even over white snow, then
    /// fading to clear over `shadeFade`.
    static let shadeOpacity: Double = 0.72
    static let shadeFade: CGFloat = 48
    /// The signpost never stands closer than this to the row of words.
    static let signClearance: CGFloat = 8
    /// The largest turn `Signpost.hand` gives a plank, in degrees (0.7…1.7).
    static let signTurn: Double = 1.7

    /// Short: the Duo's outside screen, and any window under 760 high. The coarse rule, which
    /// ignores the waiting line: private, so no page can pick it over the one below.
    private static func shape(for layout: TodayLayout, height: CGFloat) -> Shape {
        layout == .glance || height < shortHeight ? .short : .tall
    }

    /// The shape Today takes on this window: the Duo's outside screen and any window under 760
    /// high are short, and so is any window where the tall board's three rows would not end
    /// above the fade (with the waiting line when it shows). Every page calls this one.
    static func shape(for layout: TodayLayout, height: CGFloat, safeTop: CGFloat, safeBottom: CGFloat,
                      waiting: Bool) -> Shape {
        guard shape(for: layout, height: height) == .tall else { return .short }
        // The width moves nothing up or down, so the board's own width stands in for it.
        let tall = board(size: CGSize(width: 390, height: height), safeTop: safeTop, safeBottom: safeBottom,
                         shape: .tall, waiting: waiting)
        return tall.shortfall > 0 ? .short : .tall
    }

    /// Where the top shade stops being full strength: the row of words' foot.
    var shadeSolid: CGFloat { navTop + Self.navHeight }
    /// Where the top shade has faded to clear.
    var shade: CGFloat { shadeSolid + Self.shadeFade }

    // MARK: Today

    /// Today's board stretched to the window. Three rows always end above the fade: where the
    /// board would put them lower, the sheet and everything on it rise by exactly the shortfall
    /// and the band gives up that height (`risen(by:)`). The bar, the fade and the row of words
    /// never move.
    static func today(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat, shape: Shape = .tall,
                      waiting: Bool = false) -> DailyMetrics {
        let m = board(size: size, safeTop: safeTop, safeBottom: safeBottom, shape: shape, waiting: waiting)
        return m.risen(by: m.shortfall)
    }

    /// How far below the fade's top three rows would end (0: they fit).
    private var shortfall: CGFloat { max(0, rowsTop + 3 * row + 2 * rowGap - bar.fade.minY) }

    /// The sheet and everything on it moved up by `rise`, the band shortened by it. The sign moves
    /// up with the band's lower edge but keeps `signClearance` under the row of words; if its plank
    /// would then not stand wholly above the sheet's top edge, the page shows no sign.
    private func risen(by rise: CGFloat) -> DailyMetrics {
        guard rise > 0 else { return self }
        func up(_ r: CGRect) -> CGRect { r.offsetBy(dx: 0, dy: -rise) }
        let sheetTop = self.sheetTop - rise
        let lookBack = self.lookBack.map(up)

        var sign = self.sign
        if sign != .none {
            let turn = (sign.plank.width + sign.point) * CGFloat(sin(Self.signTurn * .pi / 180))
            let top = min(sign.post.minY, sign.plank.minY - turn)
            let lift = min(rise, max(0, top - (navTop + Self.navHeight + Self.signClearance)))
            sign = sign.moved(up: lift)
            if sign.plank.maxY + turn > min(sheetTop, lookBack?.minY ?? sheetTop) { sign = .none }
        }

        return DailyMetrics(
            size: size, navTop: navTop, navGap: navGap,
            band: CGRect(x: band.minX, y: band.minY, width: band.width, height: band.height - rise),
            picture: picture, sheetTop: sheetTop, sheetRadius: sheetRadius,
            sign: sign, bar: bar, lookBack: lookBack, waiting: waiting.map(up),
            header: up(header), ring: ring, card: card == .zero ? card : up(card),
            rowsTop: rowsTop - rise, rowsTopNoCard: rowsTopNoCard - rise,
            row: row, rowGap: rowGap, inset: inset, shape: shape)
    }

    /// The board's numbers on this window, before any rise.
    private static func board(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat, shape: Shape,
                              waiting: Bool) -> DailyMetrics {
        let navTop = safeTop
        let tall = shape == .tall
        let sheetTop = navTop + (tall ? 242 : 168)
        // The handle on both shapes (F25): a short window's header stands under it, as a tall one's does.
        let lookBack = handle(width: size.width, sheetTop: sheetTop)

        // The waiting walk's line takes the 44 above where the header would stand;
        // everything below it starts 44 lower.
        let headerAt = sheetTop + 46
        let inset: CGFloat = 16
        let waitingLine = waiting
            ? CGRect(x: inset, y: headerAt - 6, width: size.width - 2 * inset, height: minTouch) : nil
        let drop: CGFloat = waiting ? minTouch : 0

        let ring: CGFloat = tall ? 56 : 52
        let header = CGRect(x: 22, y: headerAt + drop, width: size.width - 44, height: ring)
        let card = CGRect(x: inset, y: header.minY + 64, width: size.width - 2 * inset, height: tall ? 44 : 42)

        return DailyMetrics(
            size: size, navTop: navTop, navGap: tall ? 18 : 22,
            band: CGRect(x: 0, y: 0, width: size.width, height: navTop + (tall ? 296 : 218)),
            picture: tall ? scaled(CGRect(x: -20, y: 0, width: 430, height: 430), board: 390, width: size.width)
                          : scaled(CGRect(x: -17, y: -34, width: 500, height: 500), board: 466, width: size.width),
            sheetTop: sheetTop, sheetRadius: tall ? 28 : 26,
            sign: sign(width: size.width, navTop: navTop, shape: shape),
            bar: bar(size: size, safeBottom: safeBottom, shape: shape),
            lookBack: lookBack, waiting: waitingLine,
            header: header, ring: ring,
            card: card, rowsTop: card.maxY + 10, rowsTopNoCard: card.minY,
            row: tall ? 54 : 52, rowGap: 6, inset: inset, shape: shape)
    }

    // MARK: Week

    /// Above each day in the week's list (the board's 8).
    static let weekDayTop: CGFloat = 8

    /// The week has no signpost, no ring and no card; its band carries up to two month-goal
    /// flags (`bandFlags`). Short (pre-flight finding 13): the sheet at `navTop + 168` and
    /// the outside screen's bar, as Today's short shape. As on Today, the list's first three
    /// rows always end above the fade: where the board would put them lower, the sheet and
    /// everything on it rise by the shortfall and the band gives that height up.
    static func week(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat, shape: Shape = .tall) -> DailyMetrics {
        let m = weekBoard(size: size, safeTop: safeTop, safeBottom: safeBottom, shape: shape)
        return m.risen(by: max(0, m.rowsTop + weekDayTop + 3 * m.row + 2 * m.rowGap - m.bar.fade.minY))
    }

    private static func weekBoard(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat, shape: Shape) -> DailyMetrics {
        let navTop = safeTop
        let tall = shape == .tall
        let sheetTop = navTop + (tall ? 160 : 168)
        // The header under the handle, on both shapes (F25).
        let header = CGRect(x: 22, y: sheetTop + 44, width: size.width - 44, height: 48)
        let rowsTop = header.minY + 60
        return DailyMetrics(
            size: size, navTop: navTop, navGap: tall ? 18 : 22,
            band: CGRect(x: 0, y: 0, width: size.width, height: navTop + (tall ? 206 : 218)),
            picture: scaled(CGRect(x: -150, y: -330, width: 700, height: 700), board: 390, width: size.width),
            sheetTop: sheetTop, sheetRadius: tall ? 28 : 26,
            sign: .none,
            bar: bar(size: size, safeBottom: safeBottom, shape: shape),
            lookBack: handle(width: size.width, sheetTop: sheetTop), waiting: nil,
            header: header, ring: 0,
            card: .zero, rowsTop: rowsTop, rowsTopNoCard: rowsTop,
            row: 46, rowGap: 5, inset: 16, shape: shape)
    }

    /// The sheet's grabber: 44 × 5, 9 below the sheet's top, centred on the window.
    var grabber: CGRect { CGRect(x: size.width / 2 - 22, y: sheetTop + 9, width: 44, height: 5) }

    // MARK: Keeping a row in sight

    /// The unit anchor (a `UnitPoint`'s y) that scrolls `row` into sight in a scroll view standing
    /// at `scroll` (page points), so that it ends just above `bottom` (the fade, or the Move to
    /// panel's top), or stands at the view's top when it is above it; nil when it is seen whole.
    static func reveal(_ row: CGRect, in scroll: CGRect, above bottom: CGFloat) -> CGFloat? {
        let room = scroll.height - row.height
        guard room > 0, row.minY >= scroll.minY else { return 0 }
        guard row.maxY > bottom else { return nil }
        return min(1, max(0, (bottom - row.height - scroll.minY) / room))
    }

    // MARK: Looking back up

    /// The sheet lowered by its handle (`DailyLookBack`): only its grabber, the handle's words
    /// and the header show.
    struct Lowered: Equatable {
        let sheetTop: CGFloat
        /// The grabber on the lowered top, centred on the window as `grabber` is.
        let grabber: CGRect
        /// The handle's frame; its capsule stands in its bottom `handleCapsule` points.
        let lookBack: CGRect
        let header: CGRect
        /// The whole lowered sheet down to the safe area's foot: one touch that raises it.
        let strip: CGRect
    }

    /// The lowered sheet's top stands this far above the window's foot (the walk's own peek, 716 of 844).
    static let lookBackPeek: CGFloat = 128
    /// The handle's capsule (the walk's): the bottom 36 points of its frame.
    static let handleCapsule: CGFloat = 36

    /// Today's or Week's sheet lowered: its top `lookBackPeek` above the window's foot, the
    /// handle and the header where they stand on the sheet, with no waiting line between them,
    /// except that nothing readable or tappable goes below the safe area's foot: the header
    /// rises to stand on it, and the handle's words stay above the header. Nil where the
    /// window has no handle (the spread).
    func lowered(safeBottom: CGFloat) -> Lowered? {
        guard let lookBack else { return nil }
        let top = size.height - Self.lookBackPeek
        let foot = size.height - safeBottom
        let headerAt = header.minY - sheetTop - (waiting == nil ? 0 : Self.minTouch)
        let headerY = min(top + headerAt, foot - header.height)
        let handleFoot = min(lookBack.maxY + top - sheetTop, headerY)
        return Lowered(sheetTop: top,
                       grabber: grabber.offsetBy(dx: 0, dy: top - sheetTop),
                       lookBack: CGRect(x: lookBack.minX, y: handleFoot - lookBack.height,
                                        width: lookBack.width, height: lookBack.height),
                       header: CGRect(x: header.minX, y: headerY, width: header.width, height: header.height),
                       strip: CGRect(x: 0, y: top, width: size.width, height: max(0, foot - top)))
    }

    // MARK: Touch

    /// Every control's touch shape: the field's typing part, the light, More, Inbox, the
    /// handle, the waiting walk's line, the sign. Each is at least 44 × 44 and none meets another.
    var touchTargets: [CGRect] {
        [bar.typing, bar.lightTouch, bar.more, bar.inbox, lookBack, waiting, sign.touch]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
    }

    // MARK: The week's band flags

    struct BandFlag: Equatable, Identifiable {
        let id: UUID
        let title: String
        /// Upright, from its top to its foot; it leans `lean` degrees about the foot.
        let pole: CGRect
        /// Centred on the pole, its top 10 above the pole's; it tilts `tilt` degrees.
        let cloth: CGRect
        let lean: Double
        let tilt: Double
    }

    /// Up to two month goals, planted by hand: poles at 0.244 and 0.741 of the width, feet
    /// near `navTop + 146` and `navTop + 136`, each moved up to ±6 by its goal's hand (two feet
    /// always at least `flagsApart` apart); each pole leans up to ±1.8° and its cloth tilts
    /// 0.9…1.3° the other way. The same goals give the same frames on every call.
    /// (`slots`: the spread's, over its left page, `spreadFlagSlots`.)
    static func bandFlags(_ goals: [Signpost.Named], width: CGFloat, navTop: CGFloat,
                          slots: [FlagSlot] = [FlagSlot(x: 0.244, foot: 146, length: 62),
                                               FlagSlot(x: 0.741, foot: 136, length: 68)]) -> [BandFlag] {
        let picked = Array(goals.prefix(slots.count))

        var feet = picked.enumerated().map { i, goal in
            navTop + slots[i].foot + 6 * CGFloat(WalkFooting.hand(key(goal.id), "band.ground"))
        }
        // Keep the second foot higher than the first by at least `flagsApart`, splitting the
        // difference so each stays within its ±6.
        if feet.count == 2, feet[0] - feet[1] < flagsApart {
            let mid = (feet[0] + feet[1]) / 2
            feet = [mid + flagsApart / 2, mid - flagsApart / 2]
        }

        return picked.enumerated().map { i, goal in
            let slot = slots[i]
            let pole = CGRect(x: slot.x * width, y: feet[i] - slot.length, width: 3, height: slot.length)
            let clothWidth = min(156, 18 + 6 * CGFloat(goal.title.count))
            let cloth = CGRect(x: pole.midX - clothWidth / 2, y: pole.minY - 10, width: clothWidth, height: 32)
            let h = WalkFooting.hand(key(goal.id), "band.lean")
            let side: Double = h < 0 ? -1 : 1
            let lean = side * (0.4 + 1.4 * abs(h))
            let tilt = -side * (0.9 + 0.4 * abs(WalkFooting.hand(key(goal.id), "band.tilt")))
            return BandFlag(id: goal.id, title: goal.title, pole: pole, cloth: cloth, lean: lean, tilt: tilt)
        }
    }

    // MARK: Pieces

    private static func key(_ id: UUID) -> String { id.uuidString.lowercased() }

    /// A board's frame scaled by the window's width over the board's.
    private static func scaled(_ r: CGRect, board: CGFloat, width: CGFloat) -> CGRect {
        let k = width / board
        return CGRect(x: r.minX * k, y: r.minY * k, width: r.width * k, height: r.height * k)
    }

    /// The handle (the walk's capsule, 36 high) stands at +4…+40 on the sheet, `handleWidth` wide and
    /// centred; the touch shape is 44 high ending at +40, so the waiting line can start right under it.
    private static func handle(width: CGFloat, sheetTop: CGFloat) -> CGRect {
        CGRect(x: width / 2 - handleWidth / 2, y: sheetTop + 40 - minTouch, width: handleWidth, height: minTouch)
    }

    private static func sign(width: CGFloat, navTop: CGFloat, shape: Shape) -> Sign {
        let tall = shape == .tall
        let post = tall ? CGRect(x: 52, y: navTop + 84, width: 7, height: 176)
                        : CGRect(x: 70, y: navTop + 60, width: 7, height: 130)
        let left: CGFloat = tall ? 24 : 42, right: CGFloat = tall ? 62 : 74
        let plank = CGRect(x: left, y: navTop + (tall ? 104 : 74), width: width - left - right, height: tall ? 64 : 60)
        return Sign(post: post, plank: plank, point: tall ? 31 : 29,
                    strip: CGRect(x: post.minX - plank.minX, y: 0, width: post.width, height: plank.height),
                    nail: 7,
                    eyebrow: tall ? CGPoint(x: 46, y: 9) : CGPoint(x: 44, y: 8),
                    title: tall ? CGPoint(x: 46, y: 26) : CGPoint(x: 44, y: 24),
                    eyebrowSize: 10.5, titleSize: tall ? 19 : 20)
    }

    /// The bar stands `max(safeBottom + 8, 42 | 26)` above the window's foot.
    private static func bar(size: CGSize, safeBottom: CGFloat, shape: Shape) -> Bar {
        let tall = shape == .tall
        let foot = max(safeBottom + 8, tall ? 42 : 26)
        let height: CGFloat = 48, side: CGFloat = tall ? 64 : 68, edge: CGFloat = tall ? 6 : 8, icon: CGFloat = 56
        let top = size.height - foot - height
        return Bar(field: CGRect(x: side, y: top, width: size.width - 2 * side, height: height),
                   speaking: CGRect(x: 14, y: top, width: size.width - 28, height: height),
                   light: 38,
                   more: CGRect(x: edge, y: top - 4, width: icon, height: icon),
                   inbox: CGRect(x: size.width - edge - icon, y: top - 4, width: icon, height: icon),
                   line: top - 30,
                   fade: CGRect(x: 0, y: top - 58, width: size.width, height: 44))
    }
}
