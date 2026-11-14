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

    /// Every control's touch shape other than the rows: the field's typing part and the light.
    var touchTargets: [CGRect] { [bar.typing, bar.lightTouch] }
}

extension DailyMetrics {
    /// The half-open display on a window of `size` with the fold at `split` (down from the top
    /// when `across`, else in from the left): the boards' numbers, with widths taking the rest.
    static func tent(size: CGSize, split: CGFloat, across: Bool) -> DailyTent {
        let look = across ? CGRect(x: 0, y: 0, width: size.width, height: split)
                          : CGRect(x: 0, y: 0, width: split, height: size.height)
        let touch = across ? CGRect(x: 0, y: split, width: size.width, height: size.height - split)
                           : CGRect(x: split, y: 0, width: size.width - split, height: size.height)
        let fold = across ? CGRect(x: 0, y: split, width: size.width, height: tentFoldShade)
                          : CGRect(x: split, y: 0, width: tentFoldShade, height: size.height)

        // The look half: the picture scaled with its width; the time and the next line from its top.
        let k = look.width / (across ? 626 : 445)
        let board = across ? CGRect(x: -137, y: -120, width: 900, height: 900)
                           : CGRect(x: -330, y: -150, width: 1000, height: 1000)
        let picture = CGRect(x: board.minX * k, y: board.minY * k, width: board.width * k, height: board.height * k)
        let left: CGFloat = across ? 40 : 32
        let time = CGPoint(x: look.minX + left, y: look.minY + 26)
        let next = CGRect(x: look.minX + left, y: look.minY + (across ? 200 : 196),
                          width: look.width - 2 * left, height: across ? 64 : 60)
        let veil = DailyTent.Veil(opacity: shadeOpacity, solid: next.maxY, length: next.maxY + shadeFade)

        // The sign stands on the fold: its numbers from the look half's foot.
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
        // A short look half (a fold reported low): the sign gives way before it covers the next line.
        let turn = (plank.width + point) * CGFloat(sin(signTurn * .pi / 180))
        if plank.minY - turn <= next.maxY + signClearance { sign = .none }

        // The touch half: the header and rows from its top, the field from the window's foot.
        let header = across ? CGRect(x: touch.minX + 32, y: touch.minY + 31, width: touch.width - 64, height: 60)
                            : CGRect(x: touch.minX + 32, y: touch.minY + 30, width: touch.width - 60, height: 60)
        let rowLeft: CGFloat = across ? 24 : 22
        let rowWidth = touch.width - (across ? 48 : 40)
        let field = CGRect(x: touch.minX + rowLeft, y: size.height - tentFieldFoot - tentFieldHeight,
                           width: rowWidth, height: tentFieldHeight)
        let rowsTop = touch.minY + (across ? 103 : 106)
        let rows = CGRect(x: touch.minX + rowLeft, y: rowsTop, width: rowWidth,
                          height: max(0, field.minY - tentRowsGap - rowsTop))
        let bar = Bar(field: field, speaking: field, light: 44, more: .zero, inbox: .zero,
                      line: field.minY - 24,
                      fade: CGRect(x: touch.minX, y: field.minY - tentSlotHeight, width: touch.width, height: 0))

        return DailyTent(
            look: look, touch: touch, fold: fold, picture: picture, veil: veil,
            time: time, timeSize: across ? 124 : 112, dateSize: across ? 17 : 16,
            next: next, nextSize: across ? 38 : 34, sign: sign,
            header: header, ring: 60, rows: rows,
            row: across ? 72 : 70, rowGap: 8, titleSize: across ? 22 : 20, circle: across ? 34 : 32,
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
}
