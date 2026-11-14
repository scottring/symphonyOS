import Foundation
import CoreGraphics

/// Where everything sits on the Duo set down half open ("Duo, half open" in the plan's boards):
/// the half you look at (the picture under the walk's shade, the time, what is next, the sign)
/// and the half you touch (To do today with its ring, the open rows, the bar). Like a laptop
/// (`across`) the fold runs across and the upper half looks; standing like a book the left page
/// looks. Every frame is in the display's own space; the boards are 626 × 890 and 890 × 626 with
/// the fold at 445. Things on the look half stand from its top, the sign from its foot (the fold),
/// and the touch half's field from the window's foot.
struct DailyTent: Equatable {
    /// The walk's top shade over the picture: full `opacity` from the top to `solid`, clear by `length`.
    struct Veil: Equatable {
        let opacity: Double
        let solid: CGFloat
        let length: CGFloat
    }

    let look: CGRect
    let touch: CGRect
    /// The soft shade on the touch half along the fold.
    let fold: CGRect
    /// The square picture's frame (it is clipped to `look`).
    let picture: CGRect
    let veil: Veil
    /// The time's top-left; the date stands under it.
    let time: CGPoint
    let timeSize: CGFloat
    let dateSize: CGFloat
    /// "NEXT · 3:00" over the event's title.
    let next: CGRect
    let nextSize: CGFloat
    /// The signpost (`.none` when the look half leaves it no room under the next line).
    let sign: DailyMetrics.Sign
    /// "TO DO TODAY" with the ring at its right; as high as the ring.
    let header: CGRect
    let ring: CGFloat
    /// Where the open rows scroll, with the done count after them.
    let rows: CGRect
    let row: CGFloat
    let rowGap: CGFloat
    let titleSize: CGFloat
    let circle: CGFloat
    let lineageSize: CGFloat
    let goalSize: CGFloat
    /// A row's padding left and right, and the gap after its circle.
    let rowPadding: CGFloat
    let rowSpacing: CGFloat
    /// The bar: the field (the same while it listens), the light, the one line slot 24 above the
    /// field; no More or Inbox, and no fade (pre-flight finding 8).
    let bar: DailyMetrics.Bar
    let barTextSize: CGFloat
    /// The paper the line slot stands on while it says something, over the rows' foot.
    let slot: CGRect

    /// The time with the date under it (the date's line is `DailyMetrics.tentDateLine` of its size).
    var timeBlock: CGRect {
        CGRect(x: time.x, y: time.y, width: next.width, height: timeSize + dateSize * DailyMetrics.tentDateLine)
    }

    /// Every control's touch shape other than the rows: the field's typing part and the light.
    var touchTargets: [CGRect] { [bar.typing, bar.lightTouch] }
}

extension DailyMetrics {
    /// The half-open display on a window of `size` with the fold at `split` (down from the top
    /// when `across`, else in from the left): the boards' numbers, with widths taking the rest.
    /// A real fold is not always at 445: where the look half is shorter than the board, the time,
    /// the date and the next line move up and shrink together (never below `tentMinScale`), and
    /// where it is narrower the time and the next line shrink, so the sign, standing on the fold,
    /// keeps its size; only a look half too short even then loses the sign. Where the touch half is
    /// shorter, the gaps around its header close so three whole rows still fit over the bar.
    static func tent(size: CGSize, split: CGFloat, across: Bool) -> DailyTent {
        let look = across ? CGRect(x: 0, y: 0, width: size.width, height: split)
                          : CGRect(x: 0, y: 0, width: split, height: size.height)
        let touch = across ? CGRect(x: 0, y: split, width: size.width, height: size.height - split)
                           : CGRect(x: split, y: 0, width: size.width - split, height: size.height)
        let fold = across ? CGRect(x: 0, y: split, width: size.width, height: tentFoldShade)
                          : CGRect(x: split, y: 0, width: tentFoldShade, height: size.height)

        // The sign stands on the fold, at the board's size: its numbers from the look half's foot.
        let foot = look.maxY
        let post = across ? CGRect(x: 74, y: foot - 135, width: 8, height: 150)
                          : CGRect(x: 56, y: foot - 186, width: 8, height: 200)
        let plankLeft: CGFloat = across ? 44 : 28
        let plank = CGRect(x: plankLeft, y: foot - (across ? 115 : 164),
                           width: look.width - plankLeft - (across ? 112 : 67), height: across ? 78 : 68)
        let point: CGFloat = across ? 39 : 34
        var sign = Sign(post: post, plank: plank, point: point,
                        strip: CGRect(x: post.minX - plank.minX, y: 0, width: post.width, height: plank.height),
                        nail: 8,
                        eyebrow: across ? CGPoint(x: 50, y: 11) : CGPoint(x: 46, y: 10),
                        title: across ? CGPoint(x: 50, y: 31) : CGPoint(x: 46, y: 28),
                        eyebrowSize: across ? 12.5 : 11.5, titleSize: across ? 27 : 22)
        let turn = (plank.width + point) * CGFloat(sin(signTurn * .pi / 180))

        // The look half: the time and the next line from its top, fitted above the sign.
        let board = (width: across ? CGFloat(626) : 445, time: CGFloat(26), timeSize: across ? CGFloat(124) : 112,
                     dateSize: across ? CGFloat(17) : 16, next: across ? CGFloat(200) : 196,
                     nextHeight: across ? CGFloat(64) : 60, nextSize: across ? CGFloat(38) : 34)
        let room = plank.minY - turn - signClearance - look.minY      // where the next line must end
        let down = max(tentMinScale, min(1, room / (board.next + board.nextHeight)))
        let type = min(down, look.width / board.width)
        let left: CGFloat = across ? 40 : 32
        let time = CGPoint(x: look.minX + left, y: look.minY + board.time * down)
        let next = CGRect(x: look.minX + left, y: look.minY + board.next * down,
                          width: look.width - 2 * left, height: board.nextHeight * down)
        if next.maxY - look.minY > room { sign = .none }               // too short even then: the sign goes
        let veil = DailyTent.Veil(opacity: shadeOpacity, solid: next.maxY, length: next.maxY + shadeFade)

        let k = look.width / board.width
        let pictureBoard = across ? CGRect(x: -137, y: -120, width: 900, height: 900)
                                  : CGRect(x: -330, y: -150, width: 1000, height: 1000)
        let picture = CGRect(x: pictureBoard.minX * k, y: pictureBoard.minY * k,
                             width: pictureBoard.width * k, height: pictureBoard.height * k)

        // The touch half: the field from the window's foot; three rows above it, the header above them.
        let row: CGFloat = across ? 72 : 70, rowGap: CGFloat = 8, ring: CGFloat = 60
        let rowLeft: CGFloat = across ? 24 : 22
        let rowWidth = touch.width - (across ? 48 : 40)
        let field = CGRect(x: touch.minX + rowLeft, y: size.height - tentFieldFoot - tentFieldHeight,
                           width: rowWidth, height: tentFieldHeight)
        let gaps = (header: across ? CGFloat(31) : 30, rows: across ? CGFloat(12) : 16)
        let natural = touch.minY + gaps.header + ring + gaps.rows
        let latest = field.minY - tentRowsGap - (3 * row + 2 * rowGap)
        let close = max(0, 1 - max(0, natural - latest) / (gaps.header + gaps.rows))
        let header = CGRect(x: touch.minX + 32, y: touch.minY + (gaps.header * close).rounded(.down),
                            width: touch.width - (across ? 64 : 60), height: ring)
        let rowsTop = max(header.maxY, min(natural, latest))
        let rows = CGRect(x: touch.minX + rowLeft, y: rowsTop, width: rowWidth,
                          height: max(0, field.minY - tentRowsGap - rowsTop))
        let bar = Bar(field: field, speaking: field, light: 44, more: .zero, inbox: .zero,
                      line: field.minY - 24,
                      fade: CGRect(x: touch.minX, y: field.minY - tentSlotHeight, width: touch.width, height: 0))

        return DailyTent(
            look: look, touch: touch, fold: fold, picture: picture, veil: veil,
            time: time, timeSize: board.timeSize * type, dateSize: board.dateSize * type,
            next: next, nextSize: board.nextSize * type, sign: sign,
            header: header, ring: ring, rows: rows,
            row: row, rowGap: rowGap, titleSize: across ? 22 : 20, circle: across ? 34 : 32,
            lineageSize: across ? 15 : 14.5, goalSize: across ? 18 : 17,
            rowPadding: across ? 18 : 16, rowSpacing: across ? 16 : 14,
            bar: bar, barTextSize: 20,
            slot: CGRect(x: touch.minX, y: field.minY - tentSlotHeight, width: touch.width, height: tentSlotHeight))
    }

    /// The half-open field: 58 high, 24 above the window's foot.
    static let tentFieldHeight: CGFloat = 58
    static let tentFieldFoot: CGFloat = 24
    /// The rows' scroll stops this far above the field.
    static let tentRowsGap: CGFloat = 4
    /// The line slot's paper over the rows' foot, ending at the field.
    static let tentSlotHeight: CGFloat = 48
    /// The shade along the fold on the touch half.
    static let tentFoldShade: CGFloat = 22
    /// The look half's time and next line shrink no further than this before the sign gives way.
    static let tentMinScale: CGFloat = 0.75
    /// The date's line under the time, as a multiple of its size.
    static let tentDateLine: CGFloat = 1.4
}
