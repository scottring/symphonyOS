import Foundation
import CoreGraphics

/// Everything the scene draws, worked out from the walk's state in one pass: the camera, the
/// one area the walk stands in (its name on its own post, its flags in full), every other area
/// as a small post at the side, and on the ground the area names alone. Views draw exactly
/// this and decide nothing.
///
/// Frames are in stage coordinates (390 × 844; x from the board's left edge on every window,
/// so on a wider one things may stand at negative x or past 390). The walk stands in ONE area
/// at a time (`WalkLayout+Standing.swift`): no two cloths meet, nothing rises into the question
/// or stands under the hint, nothing meets the light, and no side post meets another or the
/// standing post, under both footings.
struct WalkLayout: Equatable {
    struct Camera: Equatable { var x: CGFloat; var y: CGFloat; var k: CGFloat }      // stage = (world − (x, y)) × k
    /// `full`: a flag of the step's level, its words in full. `parent`: the goal above the step is
    /// about. `compact`: a Look back up cloth. `more(n)`: "+n more", the flags not shown. `ghost`: an example.
    enum Kind: Equatable { case full, parent, compact, more(Int), ghost }
    struct Banner: Equatable, Identifiable { let id: String; let itemId: UUID?; let level: WalkLevel; let kind: Kind
        /// `text` is the title, its words one space apart (`WalkLayout.normalised`); `words` the lines
        /// the cloth draws, broken by the layout (F39: the view draws each as given, and `lines` is
        /// how many the cloth is high for); `label`, VoiceOver's, keeps the title as written.
        var frame: CGRect; let lines: Int; let text: String; let words: [String]; let tag: String?; let glows: Bool; let label: String
        /// Look back up: a cloth that also stands for this many older flags ("+n more").
        var more: Int? = nil
        /// A tap does something (its label says what); VoiceOver reads one that does not as plain text.
        var taps: Bool = true
        /// The hand (`WalkFooting`): degrees the cloth hangs off its post's line, and points it sits off the pole.
        var tilt: Double = 0
        var shift: CGFloat = 0
        /// As drawn: `frame` (already moved with its post's lean and the shift) turned `turn` degrees
        /// clockwise (the post's lean plus the tilt) about `pivot`, where the cloth meets its pole.
        var turn: Double = 0
        var pivot: CGPoint = .zero

        /// The drawn outline's corners, and their bounding box: what the layout's guarantees are measured on.
        var corners: [CGPoint] { WalkTurn.corners(frame, degrees: turn, about: pivot) }
        var drawn: CGRect { turn == 0 ? frame : WalkTurn.bounds(corners) }
        /// `pivot` as a fraction of the frame, for the view's rotation anchor.
        var pivotUnit: CGPoint {
            CGPoint(x: frame.width > 0 ? (pivot.x - frame.minX) / frame.width : 0.5,
                    y: frame.height > 0 ? (pivot.y - frame.minY) / frame.height : 0)
        } }
    /// The standing post. `base` is its foot; the pole rises `base.y − top` along a line leaning
    /// `lean` degrees clockwise about `base`; `pole` is the bare pole under its lowest cloth.
    struct Post: Equatable, Identifiable { let id: String; let key: WalkPostKey; let base: CGPoint; let top: CGFloat
        let pale: Bool; let banners: [Banner]
        var lean: Double = 0
        var pole: CGFloat = WalkLayout.pole

        /// Where each banner takes a tap, in `banners` order: the cloth as drawn, made at least `touch`
        /// across and, where its neighbours leave room, `touch` high about its middle (room it cannot take
        /// on one side, it takes on the other). Toward a neighbouring cloth it reaches only the middle of
        /// the gap between them, so no two touch frames meet and none covers another cloth: three or five
        /// one-line Look back up cloths 4 apart are each their own height and 4 more.
        func touchFrames(touch: CGFloat) -> [CGRect] {
            let drawn = banners.map(\.drawn)
            return drawn.map { box in
                let above = drawn.filter { $0.maxY <= box.minY + 0.01 && $0 != box }.map(\.maxY).max()
                let below = drawn.filter { $0.minY >= box.maxY - 0.01 && $0 != box }.map(\.minY).min()
                let ceiling = above.map { ($0 + box.minY) / 2 } ?? -.infinity
                let floor = below.map { ($0 + box.maxY) / 2 } ?? .infinity
                let grow = max(0, touch - box.height) / 2
                var top = box.minY - grow, foot = box.maxY + grow
                if top < ceiling { foot += ceiling - top; top = ceiling }
                if foot > floor { top = max(ceiling, top - (foot - floor)); foot = floor }
                let across = max(0, touch - box.width) / 2
                return CGRect(x: box.minX - across, y: top, width: box.width + 2 * across, height: foot - top)
            }
        } }
    /// An area's name: a choice on the ground (`ground`), or the pill on the standing post
    /// (`standing`: its frame is the pill alone, and the caret is drawn 2 above it).
    struct Label: Equatable, Identifiable { let id: UUID; let name: String; let frame: CGRect
        let kept: Bool; let opacity: Double; let tappable: Bool; let hint: String?
        /// For VoiceOver: kept, on the ground.
        var selected: Bool = false
        /// The hand: how far the label stands off its ruled place (a chip on the ground stands a little higher).
        var footing: CGFloat = 0
        /// Drawn on the ground, where it is a choice: a plus while not kept, a checkmark once kept.
        var ground: Bool = false
        /// The one label of the area the walk stands in, on its own post; it takes no tap.
        var standing: Bool = false
        /// A long name takes two lines at the same size (F20): the pill is 37 high, a ground chip 44.
        var lines: Int = 1
        /// The standing pill's caret (10 × 7, 2 above the pill), where it stands clear of the question;
        /// nil where the pill reaches too near it (the pill's own outline still marks where you stand),
        /// and for a chip on the ground, whose mark is inside its frame.
        var caret: CGRect? = nil
        /// The name as its pill or chip draws it: in capitals, one line each (`pillLines`), at most two.
        var words: [String] = [] }
    /// One wordless flag on a side post, in the colour of the level it stands for.
    struct Pennant: Equatable { let frame: CGRect; let level: WalkLevel }
    /// Another area, as a small post at the side: a name pill, a short pole, a pennant for each of
    /// its flags on the step's level (at most 4; with more, 3 and `extra` as "+n" in the fourth
    /// place, `extraFrame`). `area == nil` and `pill == nil` for the nameless post (F12). `poleX` is
    /// the pole's centre at its foot; the pole leans `lean` degrees clockwise about its foot, and
    /// the pennants' frames (and the "+n"'s) already stand where the leaning pole carries them.
    /// A named post is drawn only where the walk can stand, so a tap on it always walks there.
    struct Side: Equatable, Identifiable { let id: String; let area: UUID?; let name: String; let pill: CGRect?
        let poleX: CGFloat; let poleTop: CGFloat; let poleFoot: CGFloat; let pennants: [Pennant]
        let extra: Int; let count: Int; let label: String; var lean: Double
        /// Where "+n" stands when `extra > 0`: the fourth pennant's place.
        var extraFrame: CGRect? = nil
        /// The nameless post on steps 1 to 5: a tap raises the paper (F12), the only way its flags are read.
        var opensPaper = false

        /// Everything the post draws, as boxes: its pill, its pole (leaning), its pennants and its "+n".
        var boxes: [CGRect] {
            let reach = (poleFoot - poleTop) * CGFloat(sin(lean * .pi / 180))
            let pole = CGRect(x: poleX - WalkLayout.sidePoleWidth / 2 + min(0, reach), y: poleTop,
                              width: WalkLayout.sidePoleWidth + abs(reach), height: poleFoot - poleTop)
            return (pill.map { [$0] } ?? []) + [pole] + pennants.map(\.frame) + (extraFrame.map { [$0] } ?? [])
        }

        /// The small shadow at the pole's foot (`WalkLayout.sideFootShadow`).
        var footShadow: CGRect {
            CGRect(x: poleX - WalkLayout.sideFootShadow.width / 2, y: poleFoot - WalkLayout.sideFootShadow.height / 2,
                   width: WalkLayout.sideFootShadow.width, height: WalkLayout.sideFootShadow.height)
        }

        /// Where the post takes a tap: everything it draws (its boxes and its foot's shadow), made at
        /// least `touch` square about its middle (`WalkStage.touch`: 44 real points on any window).
        func touchFrame(touch: CGFloat) -> CGRect {
            let drawn = boxes.reduce(footShadow) { $0.union($1) }
            return drawn.insetBy(dx: -max(0, touch - drawn.width) / 2, dy: -max(0, touch - drawn.height) / 2)
        } }
    let camera: Camera; let labels: [Label]; let posts: [Post]; let sides: [Side]; let needleDown: Bool
    /// The spoken flag's place (S25) while the light is speaking or finishing on steps 1 to 5: one
    /// cloth above the light, clear of every post, pill and cloth. Nil otherwise.
    var spokenFlag: CGRect? = nil
    /// The controls (`WalkLayout+Controls.swift`), each nil while it is not shown: Next at the foot,
    /// the hint, the Undo pill, the lesson, the top row's More, Back and Leave for now, and the Move row.
    var nextLine: CGRect? = nil
    var hintLine: CGRect? = nil
    var undoPill: CGRect? = nil
    var lesson: CGRect? = nil
    var more: CGRect? = nil
    var back: CGRect? = nil
    var leave: CGRect? = nil
    var moveRow: CGRect? = nil
    /// Look back up's hint under its header ("Tap a post to see that area"), while other areas stand at the side.
    var lookBackHint: CGRect? = nil

    // MARK: Stage numbers (the art's numbers live in `WalkArt`; the standing post's in `WalkLayout+Standing.swift`)

    /// The board's midline, on every window.
    static let centreX: CGFloat = 195
    /// The question's foot on the board: no flag or pill rises above it ("The board as numbers").
    static let question: CGFloat = 282
    /// The bare pole under the standing post's lowest cloth.
    static let pole: CGFloat = 24
    /// Look back up: the bottom of its header line (nothing stands above it), the standing pill's
    /// top, and the lowest anything stands (the ending sheet peeks at 716).
    static let lookBackHeader: CGFloat = 92, lookBackPill: CGFloat = 110, lookBackFoot: CGFloat = 700
    /// Look back up's header line's top, and the foot of its words (the hint under it included).
    static let lookBackHeaderTop: CGFloat = 54, lookBackWordsFoot: CGFloat = 100
    /// The paper (F7): its top on the board while raised, and how far its words stand in from the
    /// reading column's edges (`column(wing:)`).
    static let paperTop: CGFloat = 116, paperInset: CGFloat = 24
    /// P35: the chosen flag when the standing post does not draw it (one chosen from the paper under no area,
    /// or in another area): the why line then names it (`WalkCopy.chosenNote`). Nil otherwise.
    static func unseenChoice(_ state: WalkState) -> WalkItem? {
        let s = state.settled
        guard !s.ground, s.level != nil, let item = s.item(s.selected), s.column(of: item) != s.standing else { return nil }
        return item
    }
    /// The spoken flag: one line of the newest words, above the light.
    static let spokenFlagRect = CGRect(x: 120, y: 560, width: 150, height: 36)

    /// `footing`: `.natural` plants by hand (the app); `.level` is the board's ruled numbers.
    /// `wing`: the room beside the board on a wider window (`WalkStage.wing`): the side posts stand
    /// further apart, the standing flags are wider, Back and Leave for now go to the corners.
    /// `periods`: for the side posts' VoiceOver words; today's, when none are given.
    ///
    /// The walk is laid out where it stands once settled (`WalkState.settled`), so a place opened
    /// mid-walk (a resume, a page) is drawn where the next touch would find it.
    static func make(_ state: WalkState, today: Date, art: WalkArt = .overlookSquare,
                     footing: WalkFooting = .natural, wing: CGFloat = 0, periods: WalkPeriods? = nil) -> WalkLayout {
        let s = state.settled
        var labels: [Label] = [], posts: [Post] = [], sides: [Side] = []
        // Look back up with the sheet or the paper raised over the mountain: nothing stands (the area's pill,
        // at 110, would peek over the sheet's top at 130 and the paper's at 116); lowered, it all drops in again.
        if s.step >= 1, !(s.step == 6 && (s.sheetRaised || s.paperOpen)) {
            if s.ground {
                labels = groundLabels(s, footing: footing, wing: wing)
            } else {
                let standing = WalkStanding(s, today: today, periods: periods ?? WalkPeriods.pick(now: today),
                                        footing: footing, wing: wing).layout()
                labels = standing.label.map { [$0] } ?? []
                posts = standing.post.map { [$0] } ?? []
                sides = standing.sides
            }
        }
        var made = WalkLayout(camera: stop(art, s.step), labels: labels, posts: posts, sides: sides,
                              needleDown: needleDown(s))
        // The controls too are the settled walk's, so the hint is for the place the picture shows.
        made.spokenFlag = spokenFrame(s)
        made.nextLine = nextFrame(s)
        made.hintLine = hintFrame(s)
        made.undoPill = undoFrame(s)
        made.lesson = teachFrame(s)
        made.more = moreFrame(s)
        made.back = backFrame(s, wing: wing)
        made.leave = leaveFrame(s, wing: wing)
        made.moveRow = moveRowFrame(s)
        // The hint says a post walks there: only while a named one stands at the side.
        made.lookBackHint = s.step == 6 && sides.contains { $0.area != nil } ? lookBackHintFrame(wing: wing) : nil
        return made
    }

    /// Look back up's hint ("Tap a post to see that area"): one line under the header, 84 to 100, in
    /// the reading column 20 in from either edge, as the header stands.
    static let lookBackHintTop: CGFloat = 84
    static func lookBackHintFrame(wing: CGFloat) -> CGRect {
        let column = column(wing: wing)
        return CGRect(x: column.lowerBound + lookBackInset, y: lookBackHintTop,
                      width: column.upperBound - column.lowerBound - 2 * lookBackInset, height: lookBackWordsFoot - lookBackHintTop)
    }
    /// How far Look back up's header and hint stand in from the reading column's edges.
    static let lookBackInset: CGFloat = 20

    /// The art's stop for a step (never a zoom); an art with too few stops falls back to its last one.
    static func stop(_ art: WalkArt, _ step: Int) -> Camera {
        guard let last = art.stops.last else { return Camera(x: 0, y: 0, k: 1) }
        return step >= 0 && step < art.stops.count ? art.stops[step] : (step < 0 ? art.stops[0] : last)
    }

    /// The light's needle points down once the step holds something: always on Welcome, on Today
    /// once there is a first thing, on Year to Week once a flag stands on the step's level.
    static func needleDown(_ s: WalkState) -> Bool {
        if s.step == 0 { return true }
        guard let level = s.level else { return false }
        return level == .today ? s.item(s.firstThing) != nil : !s.items(on: level).isEmpty
    }

    static func spokenFrame(_ s: WalkState) -> CGRect? {
        guard (1...5).contains(s.step) else { return nil }
        switch s.orb {
        case .speaking, .finishing: return spokenFlagRect
        case .idle, .holding, .open: return nil
        }
    }

    /// What a tap on a banner sends: an example plants its words; a flag of the step's level or the
    /// goal above is tapped by its id. "+n more" opens the paper (F7), and a Look back up cloth the
    /// paper for its level (F21).
    static func tapEvent(_ banner: Banner, on post: Post) -> WalkEvent? {
        switch banner.kind {
        case .more: return .paperOpened
        case .compact: return .lookBackPaper(banner.level)
        case .ghost: return .exampleTapped(banner.text)
        case .full, .parent: return banner.itemId.map { .bannerTapped($0) }
        }
    }

    /// What a tap on a side post sends: a named one walks there (it is drawn only where the walk
    /// can stand). The nameless one opens the paper on steps 1 to 5 (F12); on Look back up it is only read.
    static func tapEvent(_ side: Side) -> WalkEvent? {
        if let area = side.area { return .areaTapped(area) }
        return side.opensPaper ? .paperOpened : nil
    }
}
