import Foundation
import CoreGraphics

/// The 390 × 844 board on a window: scaled to fit between the window's side insets and centred
/// there. Every number of the layout is the board's, and x is measured from the board's left edge
/// on every window. Where the window is wider for its height than the board, the stage has a
/// `wing` either side (the room beside the board, in stage points: the stage runs from `−wing`
/// to `390 + wing`), and the window runs past the board by its `bleed`, the room under a side
/// inset included. Every touch is turned into stage coordinates here before it reaches the
/// reducer, whose geometry (`WalkOrb`) is all in stage space.
struct WalkStage: Equatable {
    /// How far the window runs past each edge of the board, in stage points.
    struct Bleed: Equatable {
        let left: CGFloat; let right: CGFloat; let top: CGFloat; let bottom: CGFloat
    }

    let scale: CGFloat; let origin: CGPoint                // the board's top-left corner on the device
    /// The board's own size (390 × 844).
    let board: CGSize
    /// The room either side of the board between the window's side insets, in stage points; 0 on a phone.
    let wing: CGFloat
    let bleed: Bleed

    /// `left`, `right`: the window's side insets (the system's column on the Duo's outside screen).
    /// Nothing of the board stands under them; the bleed runs on under them to the window's edge.
    init(device: CGSize, stage: CGSize = WalkArt.stageSize, left: CGFloat = 0, right: CGFloat = 0) {
        let room = device.width - left - right
        let across = room / stage.width, down = device.height / stage.height
        let scale = min(across, down)
        self.scale = scale
        board = stage
        origin = CGPoint(x: left + (room - stage.width * scale) / 2, y: (device.height - stage.height * scale) / 2)
        // A window the board fills across has no wing at all, and one it fills from top to foot no
        // sliver there (not a rounding's worth of either).
        wing = across <= down ? 0 : (room / scale - stage.width) / 2
        let sliver = down <= across ? 0 : origin.y / scale
        bleed = Bleed(left: wing + left / scale, right: wing + right / scale, top: sliver, bottom: sliver)
    }

    /// A Month, Season or Year page's stage (F16): the board between the page's heading and its hint.
    /// `field` is that room down the page, in page points. Where the board fitted to the window would
    /// draw the mountain smaller than the room needs (a window about 670 high), it is drawn at full size,
    /// or as wide as the window allows: `scale = min(width / 390, max(height / 844, min(1, field / 282)))`.
    /// There the standing post's foot (556) stands `pageFootAbove` over the field's foot, and the board is
    /// cropped at its top and foot (its bleed there is negative: the window is the page, no more). Where
    /// the board fitted to the window is already that large (a phone), it is the walk's own stage.
    init(page: CGSize, field: ClosedRange<CGFloat>, stage: CGSize = WalkArt.stageSize) {
        let down = page.height / stage.height
        let room = field.upperBound - field.lowerBound
        let scale = min(page.width / stage.width, max(down, min(1, room / Self.pageRoom)))
        guard scale > down else {
            self.init(device: page, stage: stage)
            return
        }
        let origin = CGPoint(x: (page.width - stage.width * scale) / 2,
                             y: field.upperBound - Self.pageFootAbove - WalkLayout.standingFoot * scale)
        let wing = max(0, (page.width / scale - stage.width) / 2)
        self.init(scale: scale, origin: origin, board: stage, wing: wing,
                  bleed: Bleed(left: wing, right: wing, top: origin.y / scale,
                               bottom: (page.height - origin.y) / scale - stage.height))
    }

    private init(scale: CGFloat, origin: CGPoint, board: CGSize, wing: CGFloat, bleed: Bleed) {
        self.scale = scale
        self.origin = origin
        self.board = board
        self.wing = wing
        self.bleed = bleed
    }

    /// The pages' stage: a field this long (or longer) draws the board at full size; the standing post's
    /// foot stands this far over the field's foot.
    static let pageRoom: CGFloat = 282, pageFootAbove: CGFloat = 12

    /// How much wider the stage is than the board: 1 on a phone.
    var stretch: CGFloat { (board.width + 2 * wing) / board.width }

    /// A touch shape's side in stage points that is 44 real points: larger where the board is drawn smaller than life.
    var touch: CGFloat { 44 / min(1, scale) }

    /// The whole window in stage points: the board plus its bleed.
    var window: CGRect {
        CGRect(x: -bleed.left, y: -bleed.top,
               width: bleed.left + board.width + bleed.right, height: bleed.top + board.height + bleed.bottom)
    }

    func toStage(_ devicePoint: CGPoint) -> CGPoint {
        CGPoint(x: (devicePoint.x - origin.x) / scale, y: (devicePoint.y - origin.y) / scale)
    }

    func toDevice(_ stagePoint: CGPoint) -> CGPoint {
        CGPoint(x: origin.x + stagePoint.x * scale, y: origin.y + stagePoint.y * scale)
    }
}

extension WalkOrb {
    /// The light takes a touch within this many stage points of its centre (a little past its 48 radius).
    static let touchRadius: CGFloat = 56

    /// Whether a touch, in stage coordinates, lands on the light; the edge counts.
    static func hits(_ stagePoint: CGPoint) -> Bool {
        hypot(stagePoint.x - centre.x, stagePoint.y - centre.y) <= touchRadius
    }
}
