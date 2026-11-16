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
        /// `text` is the drawn form (`WalkLayout.drawnTitle`: a long word carries soft hyphens);
        /// `label`, VoiceOver's, keeps the title as written.
        var frame: CGRect; let lines: Int; let text: String; let tag: String?; let glows: Bool; let label: String
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
        var pole: CGFloat = WalkLayout.pole }
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
        if s.step >= 1 {
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
        return made
    }

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
    /// goal above is tapped by its id. "+n more" opens the paper (Task 7; nothing until then), and
    /// a Look back up cloth the paper for its level (Task 8; nothing until then).
    static func tapEvent(_ banner: Banner, on post: Post) -> WalkEvent? {
        switch banner.kind {
        case .more, .compact: return nil
        case .ghost: return .exampleTapped(banner.text.replacingOccurrences(of: softHyphen, with: ""))
        case .full, .parent: return banner.itemId.map { .bannerTapped($0) }
        }
    }

    /// What a tap on a side post sends: a named one walks there (it is drawn only where the walk
    /// can stand). The nameless one opens the paper (Task 7; nothing until then).
    static func tapEvent(_ side: Side) -> WalkEvent? { side.area.map { .areaTapped($0) } }
}
