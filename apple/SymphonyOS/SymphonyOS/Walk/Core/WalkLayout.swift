import Foundation
import CoreGraphics
import os

/// Everything the scene draws, worked out from the walk's state in one pass:
/// the camera, the peak labels, one post per area per level, and every
/// banner's frame and kind. Views draw exactly this and decide nothing.
///
/// Frames are in stage coordinates (390 × 844) and already include their
/// scale. Flags of one level never meet; the step's own flags never cover a
/// risen flag of the level above; on Look back up no flags of a column meet;
/// posts stand on their band; nothing meets the orb or rises into the question;
/// levels below the step wait until the person walks down.
struct WalkLayout: Equatable {
    struct Camera: Equatable { var x: CGFloat; var y: CGFloat; var k: CGFloat }      // stage = (world − (x, y)) × k
    enum Kind: Equatable { case full, compact, tip, stub(Int), ghost }
    struct Banner: Equatable, Identifiable { let id: String; let itemId: UUID?; let level: WalkLevel; let kind: Kind
        var frame: CGRect; let lines: Int; let text: String; let tag: String?; let glows: Bool; let label: String
        /// Look back up: a banner that also stands for this many older flags ("+n"); a tap opens its post as a stub's does.
        var more: Int? = nil
        /// A tap does something (its label says what); VoiceOver reads one that does not as plain text.
        var taps: Bool = true
        /// The hand (`WalkFooting`): degrees the cloth hangs off its post's line, and points it sits off the pole.
        var tilt: Double = 0
        var shift: CGFloat = 0
        /// As drawn: `frame` (already moved with its post's footing, lean and the shift) turned
        /// `turn` degrees clockwise (the post's lean plus the tilt) about `pivot`, where the cloth meets its pole.
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
    /// `base` is where the pole stands, its footing included; the pole rises `base.y − top`
    /// along a line leaning `lean` degrees clockwise about `base`.
    struct Post: Equatable, Identifiable { let id: String; let key: WalkPostKey; let base: CGPoint; let top: CGFloat
        let opacity: Double; let saturation: Double; let pale: Bool; let banners: [Banner]
        /// The hand: how far `base` stands below (+) or above (−) the band line, the lean, the bare pole.
        var footing: CGFloat = 0
        var lean: Double = 0
        var pole: CGFloat = WalkLayout.pole
        /// The standing hand (footing, pole) was reduced here: no room for it, or no room to stand
        /// apart from a neighbour. A lean damped to keep clear of other flags does not squeeze a post.
        var squeezed: Bool = false
        /// How much of its turning hand (lean, cloth tilt, shift) the post kept: 1, ½, ¼ or 0.
        var turning: CGFloat = 1 }
    struct Label: Equatable, Identifiable { let id: UUID; let name: String; let frame: CGRect
        let kept: Bool; let focused: Bool; let opacity: Double; let tappable: Bool; let hint: String?
        /// For VoiceOver: kept, on the ground; focused, off it.
        var selected: Bool = false
        /// How far the label moved with its peak's Year post (its post's `footing`).
        var footing: CGFloat = 0
        /// Drawn on the ground, where it is a choice: a plus while not kept, a checkmark once kept.
        var ground: Bool = false }
    let camera: Camera; let labels: [Label]; let posts: [Post]; let needleDown: Bool
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

    // MARK: Stage numbers (the art's numbers live in `WalkArt`)

    /// Faults the layout reports instead of crashing (a state the generated sweep did not make).
    static let log = Logger(subsystem: "com.symphonyos.app", category: "walk.layout")
    static let centreX: CGFloat = 195           // a zoomed column, and a lone one
    static let zoomK: CGFloat = 0.8
    static let zoomBaseY: CGFloat = 520         // where a zoomed column's post stands
    /// The question's foot on the board: no flag or pill rises above it ("The board as numbers").
    static let question: CGFloat = 282
    /// The ceiling this pass still keeps for the step's own level and for Year (the question's old
    /// foot), until the standing layout is planted under `question`.
    static let flagCeiling: CGFloat = 250
    static let pole: CGFloat = 24               // bare pole under the lowest banner
    static let edges: ClosedRange<CGFloat> = 4...386
    static let narrowColumns: ClosedRange<CGFloat> = 87...302     // up to four columns off the ground
    static let wideColumns: ClosedRange<CGFloat> = 50...340       // the ground, and five or more
    static let loneGap: CGFloat = 200
    static let fitTolerance: CGFloat = 0.01     // a fold's ceiling comparisons forgive rounding
    static let narrowest: CGFloat = 44          // a banner narrowed between neighbouring stubs

    /// `footing`: `.natural` plants the posts by hand (the app); `.level` is the contract's ruled geometry.
    /// `wing`: the room beside the board on a wider window (`WalkStage.wing`); only Back and Leave for now read it.
    static func make(_ state: WalkState, today: Date, art: WalkArt = .overlookSquare,
                     footing: WalkFooting = .natural, wing: CGFloat = 0) -> WalkLayout {
        var made = Builder(state, today: today, art: art, footing: footing).layout()
        made.nextLine = nextFrame(state)
        made.hintLine = hintFrame(state)
        made.undoPill = undoFrame(state)
        made.lesson = teachFrame(state)
        made.more = moreFrame(state)
        made.back = backFrame(state, wing: wing)
        made.leave = leaveFrame(state, wing: wing)
        made.moveRow = moveRowFrame(state)
        if state.step >= 6 { made = headings(made) }
        return made
    }

    /// Looking back up: how many lines (one or two) a one-line flag's words take at its width, leaving
    /// room for a "+n more" when it carries one (11 pt, by estimate).
    static func compactLines(for text: String, width: CGFloat, carriesMore: Bool) -> Int {
        let perLine = max(1, floor((width - 12) / 5.9))
        return CGFloat(text.count + (carriesMore ? 8 : 0)) <= perLine ? 1 : 2
    }

    /// How many lines a title takes at a banner width: a character estimate, so the core needs no fonts.
    static func lines(for text: String, width: CGFloat) -> Int {
        let perLine = max(1, floor((width - 16) / 6.6))
        return min(3, max(1, Int(ceil(CGFloat(text.count) / perLine))))
    }

    /// What a tap on a banner sends: a banner carrying "+n", or a stub, opens its post;
    /// an example plants its words; any other flag is tapped by its id.
    static func tapEvent(_ banner: Banner, on post: Post) -> WalkEvent? {
        if banner.more != nil { return .stubTapped(post.key) }
        switch banner.kind {
        case .stub: return .stubTapped(post.key)
        case .ghost: return .exampleTapped(banner.text)
        case .full, .compact, .tip: return banner.itemId.map { .bannerTapped($0) }
        }
    }
}

// MARK: - The pass

private struct Builder {
    typealias L = WalkLayout

    struct Column { let id: UUID?; let area: WalkArea?; let worldX: CGFloat }

    /// One flag (or example) waiting to be stacked.
    struct Entry { let kind: L.Kind; let item: WalkItem?; let text: String; let tag: String?; let glows: Bool; let label: String
        var taps: Bool = true }

    /// The art's stop for a step; an art with too few stops falls back to its last one.
    static func stop(_ art: WalkArt, _ step: Int) -> L.Camera {
        guard let last = art.stops.last else { return L.Camera(x: 0, y: 0, k: 1) }
        return step >= 0 && step < art.stops.count ? art.stops[step] : (step < 0 ? art.stops[0] : last)
    }

    let s: WalkState
    let today: Date
    let art: WalkArt
    let level: WalkLevel?
    let labeled: [WalkArea]
    let ghosts: [String]
    let ghostColumn: UUID?
    let columns: [Column]
    let gap: CGFloat
    let camera: L.Camera
    let zoomed: Bool
    let bw: CGFloat
    let compactWidth: CGFloat
    let footing: WalkFooting
    /// How much of its hand each post keeps (1 when absent), in two shares: what stands (footing,
    /// pole length; a label goes with its column's Year post) and what turns (lean, cloth tilt, shift).
    var damp: [WalkPostKey: CGFloat] = [:]
    var turnDamp: [WalkPostKey: CGFloat] = [:]
    var poleDamp: [WalkPostKey: CGFloat] = [:]

    init(_ s: WalkState, today: Date, art: WalkArt, footing: WalkFooting) {
        self.footing = footing
        self.s = s
        self.today = today
        self.art = art
        let level = s.level
        self.level = level
        let labeled = s.ground ? s.areas : s.keptAreas
        self.labeled = labeled
        let labeledIds = Set(labeled.map(\.id))
        let column = { (item: WalkItem) -> UUID? in item.areaId.flatMap { labeledIds.contains($0) ? $0 : nil } }

        // Examples: while on for the step, the ones not yet planted on this level.
        var ghosts: [String] = []
        var ghostColumn: UUID?
        if let level, !s.ground, (1...4).contains(s.step), s.examplesOn.contains(s.step) {
            let titles = s.items(on: level).map { $0.title.lowercased() }
            ghosts = Array(WalkCopy.examples(level).filter { example in
                let said = WalkWords.said(example, level: level, today: today, detect: { _ in nil })?.title ?? example
                return !titles.contains(said.lowercased())
            }.prefix(3))
            if level == .year {
                ghostColumn = s.focusArea.flatMap { labeledIds.contains($0) ? $0 : nil }
            } else {
                ghostColumn = s.item(s.focus[level]).flatMap(column)
            }
        }
        self.ghosts = ghosts
        self.ghostColumn = ghostColumn

        // Columns: labeled areas in `areas` order, then the unlabeled post (never on the ground).
        let loose = !s.ground && (s.items.contains { column($0) == nil } || (!ghosts.isEmpty && ghostColumn == nil))
        let ids: [UUID?] = labeled.map { Optional($0.id) } + (loose ? [nil] : [])
        let cnt = ids.count
        let span = (s.ground || cnt >= 5) ? L.wideColumns : L.narrowColumns
        gap = cnt > 1 ? (span.upperBound - span.lowerBound) / CGFloat(cnt - 1) : L.loneGap
        let year = Builder.stop(art, 1)
        columns = ids.enumerated().map { i, id in
            let vx = cnt > 1 ? span.lowerBound + CGFloat(i) * (span.upperBound - span.lowerBound) / CGFloat(cnt - 1) : L.centreX
            return Column(id: id, area: labeled.first { $0.id == id }, worldX: year.x + vx / year.k)
        }

        // Camera: the step's stop, unless a column is zoomed.
        var zoomColumn: UUID?
        if s.step == 1, !s.ground {
            zoomColumn = s.focusArea.flatMap { labeledIds.contains($0) ? $0 : nil }
        } else if let level, (2...5).contains(s.step) {
            zoomColumn = s.item(s.focus[level])?.areaId.flatMap { labeledIds.contains($0) ? $0 : nil }
        }
        if let zoomColumn, let level, let x = columns.first(where: { $0.id == zoomColumn })?.worldX {
            camera = L.Camera(x: x - L.centreX / L.zoomK, y: art.bandY(level) - L.zoomBaseY / L.zoomK, k: L.zoomK)
            zoomed = true
        } else {
            camera = Builder.stop(art, s.step)
            zoomed = false
        }

        bw = min(124, max(62, floor(gap - 8)))
        compactWidth = (0.85 * bw).rounded()
    }

    // MARK: Geometry

    func stageX(_ worldX: CGFloat) -> CGFloat { (worldX - camera.x) * camera.k }
    func stageY(_ level: WalkLevel) -> CGFloat { (art.bandY(level) - camera.y) * camera.k }

    /// Unzoomed, a frame that would leave the screen is slid back inside.
    func slid(_ r: CGRect) -> CGRect {
        guard !zoomed else { return r }
        var r = r
        if r.minX < L.edges.lowerBound { r.origin.x = L.edges.lowerBound }
        if r.maxX > L.edges.upperBound { r.origin.x = L.edges.upperBound - r.width }
        return r
    }

    func column(of item: WalkItem) -> UUID? {
        item.areaId.flatMap { id in labeled.contains { $0.id == id } ? id : nil }
    }

    /// Whether a flag stands anywhere: on the ground only flags of a labeled area show.
    func shown(_ item: WalkItem) -> Bool { !s.ground || column(of: item) != nil }

    func width(_ kind: L.Kind) -> CGFloat {
        let e = extent(kind)
        return e.left + e.right
    }

    /// How far a kind reaches left and right of its pole, at scale 1. A small flag is
    /// its pennant (contract §5: 22 wide, just right of the 3-wide pole); the rest are centred.
    func extent(_ kind: L.Kind) -> (left: CGFloat, right: CGFloat) {
        switch kind {
        case .full, .ghost: return (bw / 2, bw / 2)
        // Looking back up, a one-line flag takes its column's whole width (the neighbour gaps stay).
        case .compact:
            let w = s.step >= 6 ? max(compactWidth, min(bw, gap - 8)) : compactWidth
            return (w / 2, w / 2)
        case .tip: return (1.5, 23.5)
        case .stub: return (13, 13)
        }
    }

    /// Where a kind stands across, for a pole at `x`. `scale` is the post's (small flags and
    /// their stubs shrink with distance). A small flag stays on its pole, even past the
    /// screen's edge (the screen clips it); everything else slides back inside.
    func across(_ kind: L.Kind, at x: CGFloat, scale: CGFloat) -> CGRect {
        let e = extent(kind)
        let unit: CGFloat
        switch kind {
        case .tip, .stub: unit = scale
        default: unit = 1
        }
        let r = CGRect(x: x - e.left * unit, y: 0, width: (e.left + e.right) * unit, height: 1)
        return kind == .tip ? r : slid(r)
    }

    /// What a post may cover across: every kind it may draw, and the stub it may fold into.
    func span(at x: CGFloat, _ kinds: [L.Kind], scale: CGFloat) -> CGRect {
        (kinds + [.stub(0)]).map { across($0, at: x, scale: scale) }.reduce(CGRect.null) { $0.union($1) }
    }

    func height(_ kind: L.Kind, lines: Int, tag: String?) -> CGFloat {
        switch kind {
        case .full, .ghost: return 19 + 16 * CGFloat(lines) + (tag == nil ? 0 : 12)
        case .compact: return 23 + 13 * CGFloat(lines - 1)     // a second line on Look back up
        case .tip, .stub: return 20
        }
    }

    // MARK: The layout

    /// The flags are stacked once, ruled: folds, counts and which post is open never depend on the
    /// hand. Then each post is planted: ruled, exactly where it was stacked; by hand, moved and
    /// turned as one piece (`plant`). Every post or label whose drawing then breaks one of the
    /// layout's guarantees, or meets a flag or label the ruled layout keeps it clear of, keeps
    /// less of its hand (all, half, a quarter, none) and is planted again: order first, charm
    /// second. It always settles: every round takes a step of hand from at least one key.
    func layout() -> WalkLayout {
        // Top down, so a level knows the flags risen above it and every frame above it.
        var stacked: [L.Post] = []
        var risen: [CGRect] = []
        var above: [CGRect] = []
        for lvl in levelsDrawn() {
            let made = self.posts(on: lvl, risenAbove: risen, framesAbove: above)
            stacked += made.posts
            risen = made.risen
            above += made.posts.flatMap(\.banners).map(\.frame)
        }
        let needle: Bool
        if s.step == 0 {
            needle = true
        } else if level == .today {
            needle = s.item(s.firstThing) != nil
        } else if let level {
            needle = !s.items(on: level).isEmpty
        } else {
            needle = false
        }
        let clear = footing == .natural ? clearances(stacked) : (rise: [:], sink: [:])
        let feet = Dictionary(uniqueKeysWithValues: Set(stacked.map(\.key.level)).union([.year]).map { lvl in
            (lvl, footings(lvl, drawn: Set(stacked.filter { $0.key.level == lvl }.map(\.key.column)),
                           rise: clear.rise.filter { $0.key.level == lvl }.reduce(into: [:]) { $0[$1.key.column] = $1.value },
                           sink: clear.sink.filter { $0.key.level == lvl }.reduce(into: [:]) { $0[$1.key.column] = $1.value }))
        })
        func planted(_ b: Builder) -> WalkLayout {
            WalkLayout(camera: camera, labels: b.labels(feet[.year]!), posts: stacked.map { b.plant($0, feet[$0.key.level]!) },
                       needleDown: needle)
        }
        guard footing == .natural else { return planted(self) }
        var flat = self
        flat.damp = Dictionary(uniqueKeysWithValues: columns.flatMap { c in
            WalkLevel.allCases.map { (WalkPostKey(level: $0, column: c.id), CGFloat(0)) }
        })
        flat.turnDamp = flat.damp
        flat.poleDamp = flat.damp
        let ruled = planted(flat)
        // A key in conflict first turns less (its lean, tilt and shift: 1, ½, ¼, 0); only with no turn
        // left does it stand nearer the line (footing and pole: 1, ½, ¼, 0). Every round lowers at least
        // one share a step, so the rounds end within six per key; only keys in conflict ever lose any.
        let keys = Set(stacked.map(\.key)).union(columns.map { WalkPostKey(level: .year, column: $0.id) })
        let lower = { (share: CGFloat) -> CGFloat in share > 0.5 ? 0.5 : (share > 0.25 ? 0.25 : 0) }
        var builder = self
        var made = planted(builder)
        for _ in 0...(9 * keys.count) {
            let found = builder.conflicts(made, ruled: ruled)
            if found.isEmpty { return made }
            let squeeze = found.filter { builder.turning($0) > 0 || builder.poleShare($0) > 0 || builder.sigma($0) > 0 }
            // Unreachable: a conflict with no hand left in it is one the ruled layout has itself.
            guard !squeeze.isEmpty else { break }
            for key in squeeze {
                if builder.turning(key) > 0 {
                    builder.turnDamp[key] = lower(builder.turning(key))
                } else if builder.poleShare(key) > 0 {
                    builder.poleDamp[key] = lower(builder.poleShare(key))
                } else {
                    builder.damp[key] = lower(builder.sigma(key))
                }
            }
            made = planted(builder)
        }
        // Not reached in any state the generated sweep makes. If it ever is, the conflicting posts
        // already have no hand left, so the layout is returned as it stands (levelling every other post
        // would gain nothing), and a fault is logged: a Debug build keeps running in a state the sweep missed.
        WalkLayout.log.fault("the hand did not settle: a conflict the ruled layout has itself (step \(s.step, privacy: .public))")
        return made
    }

    /// Steps 1 to 5 draw their level and the ones above; Look back up draws all; Welcome none.
    func levelsDrawn() -> [WalkLevel] {
        if s.step >= 6 { return WalkLevel.allCases }
        return WalkLevel.allCases.filter { $0.rawValue <= s.step }
    }

    // MARK: Labels

    /// Welcome shows the bare vista: no labels, as no posts (at its far zoom they could not keep apart).
    /// `feet`: the Year level's footings (a label moves with its peak's Year post).
    func labels(_ feet: [(value: CGFloat, apart: Bool)]) -> [L.Label] {
        guard s.step >= 1 else { return [] }
        let d = CGFloat(max(0, min(s.step, 6) - 1))
        let tappable = s.ground || s.step == 1
        let slots = labelSlots()
        return columns.enumerated().compactMap { i, column -> L.Label? in
            guard let area = column.area, let slot = slots[i] else { return nil }
            let kept = s.kept.contains(area.id)
            let focused = !s.ground && s.focusArea == area.id
            // On the ground every area is a choice at full contrast, kept or not; on Look back up
            // the plan is there to be read, so nothing is faded.
            let opacity = s.ground || s.step >= 6 ? 1 : max(0.5, 1 - 0.1 * d)
            // A label stands under its peak's Year post and moves with it.
            let footing = feet[i].value * sigma(WalkPostKey(level: .year, column: area.id))
            return L.Label(id: area.id, name: area.name, frame: footing == 0 ? slot.frame : slot.frame.offsetBy(dx: 0, dy: footing),
                           kept: kept, focused: focused, opacity: Double(opacity), tappable: tappable,
                           hint: tappable ? WalkCopy.areaHint(s, area.id) : nil,
                           selected: tappable && (s.ground ? kept : focused), footing: footing, ground: s.ground)
        }
    }

    /// The labels where the contract puts them (before footing), by column index, with their row
    /// (1: the lower of two staggered rows) and scale.
    func labelSlots() -> [Int: (frame: CGRect, row: Int, scale: CGFloat)] {
        guard s.step >= 1 else { return [:] }
        let cnt = columns.count
        let rows = cnt > 3
        let width = rows ? min(90, floor(2 * gap - 6)) : 90
        let d = CGFloat(max(0, min(s.step, 6) - 1))
        let scale = s.ground ? 1 : max(0.6, 1 - 0.1 * d)
        let yearY = stageY(.year)
        // When labels stagger, the one nearest the stage's centre stays on the upper row, clear of the light.
        let labeledXs = columns.enumerated().filter { $0.element.area != nil }.map { ($0.offset, stageX($0.element.worldX)) }
        // Equally near (within 0.01 pt), the leftmost wins, so rounding never picks.
        let centre = labeledXs.min { a, b in
            let da = abs(a.1 - L.centreX), db = abs(b.1 - L.centreX)
            return abs(da - db) < 0.01 ? a.0 < b.0 : da < db
        }?.0 ?? 0
        var out: [Int: (frame: CGRect, row: Int, scale: CGFloat)] = [:]
        for (i, column) in columns.enumerated() where column.area != nil {
            let row = rows ? abs(i - centre) % 2 : 0
            let top = yearY + 3 + CGFloat(row) * 34
            guard top >= L.flagCeiling else { continue }        // zoomed low, the peaks are in the question
            out[i] = (slid(CGRect(x: stageX(column.worldX) - width * scale / 2, y: top, width: width * scale, height: 30 * scale)),
                      row, scale)
        }
        return out
    }

    // MARK: The hand

    /// How much of its standing hand (footing, pole length) a post keeps: none when level, else all
    /// unless there was no room even with its turn gone.
    func sigma(_ key: WalkPostKey) -> CGFloat { footing == .level ? 0 : damp[key] ?? 1 }
    /// How much of its turning hand (lean, cloth tilt, sideways shift) a post keeps.
    func turning(_ key: WalkPostKey) -> CGFloat { footing == .level ? 0 : turnDamp[key] ?? 1 }
    /// How much of its pole's length a post keeps (damped after the turn, before the footing).
    func poleShare(_ key: WalkPostKey) -> CGFloat { footing == .level ? 0 : poleDamp[key] ?? 1 }

    /// The scale a level's posts are drawn at (a distant level's small flags shrink).
    func tipScale(_ lvl: WalkLevel) -> CGFloat {
        let d = max(0, min(s.step, 6) - lvl.rawValue)
        return max(0.6, 1 - 0.1 * CGFloat(d - 1))
    }
    func drawnScale(_ lvl: WalkLevel) -> CGFloat { kind(of: lvl) == .tip ? tipScale(lvl) : 1 }

    /// Each column's footing on a level before damping, by column index, within
    /// ±`WalkFooting.ground` × the level's scale.
    ///
    /// Who stands lower: the posts drawn on the level are the neighbours (`drawn`; a column with
    /// no post is skipped). Of two neighbours the one whose hand ranks higher stands lower, except
    /// where the peak labels stand in two staggered rows (Year, four or more columns): there a
    /// lower-row post stands lower than an upper-row neighbour, so a lower label never rises into
    /// the upper one.
    ///
    /// Where they stand: the drawn posts split into maximal monotone runs between local extremes.
    /// An extreme stands at its own hand's place in ±(m…10), m set by the longest run it closes
    /// (3 for a run of two, 7.5 for three, 9 for four or more; at least 6 with label rows). Inside
    /// a run the posts stand evenly between ∓9: a run of three at 0 (±1.5 by its own hand), of four
    /// at ∓3. Every two neighbours so differ by at least `WalkFooting.apart` × scale, for any ids,
    /// except inside a run of five (only five posts in one rising order, about 1 in 60): ±10 cannot
    /// hold four 6 pt steps, so they stand 4.5 apart, evenly, and are not called squeezed. A run of
    /// six or more (six or more posts) is spaced the same way and reported `apart` false.
    ///
    /// A footing so depends only on the ranks within its own monotone run (an extreme: the two it
    /// closes), never on posts beyond it. A label with no post here stands near the line, within
    /// what its drawn neighbours' labels leave it. Room, from where a column stands alone: on Year
    /// a label keeps clear of the light and the question; where peaks take taps on a crowded ridge,
    /// a lower-row post's stub and the upper neighbour's label split their 1.5 pt (a real lack of
    /// room, reported `apart` false where it squeezes two neighbours together).
    func footings(_ lvl: WalkLevel, drawn: Set<UUID?>, rise: [UUID?: CGFloat] = [:], sink: [UUID?: CGFloat] = [:])
        -> [(value: CGFloat, apart: Bool)] {
        let k = drawnScale(lvl)
        let reach = WalkFooting.ground * k, gapY = WalkFooting.apart * k
        let slots = lvl == .year ? labelSlots() : [:]
        let stubsBesideLabels = lvl == .year && (s.step == 1 || s.ground) && !hasRoom([kind(of: lvl)], scale: k)
        let margin: CGFloat = 1.5            // what a lean and a tilt may add to a stub's or a cloth's corner
        let n = columns.count
        var lo = [CGFloat](repeating: -reach, count: n), hi = [CGFloat](repeating: reach, count: n)
        for i in 0..<n {
            guard let mine = slots[i] else { continue }
            hi[i] = min(hi[i], max(0, orbRoom(mine.frame)))
            lo[i] = max(lo[i], min(0, L.flagCeiling - mine.frame.minY))
            for j in [i - 1, i + 1] where (0..<n).contains(j) {
                guard stubsBesideLabels, let other = slots[j], other.row != mine.row else { continue }
                let upper = mine.row == 0 ? mine : other
                let lowerColumn = mine.row == 1 ? i : j
                let lowerX = stageX(columns[lowerColumn].worldX)
                if drawn.contains(columns[lowerColumn].id),
                   lowerX + 13 * k + margin > upper.frame.minX, lowerX - 13 * k - margin < upper.frame.maxX {
                    let half = max(0, (upper.frame.minY - stageY(.year) - margin) / 2)
                    if mine.row == 1 { hi[i] = min(hi[i], half) } else { lo[i] = max(lo[i], -half) }
                }
            }
            if lo[i] > hi[i] { lo[i] = (lo[i] + hi[i]) / 2; hi[i] = lo[i] }
        }
        // The flags of other levels above and below a post: it rises or sinks only as far as they leave it.
        for i in 0..<n {
            if let up = rise[columns[i].id] { lo[i] = min(0, max(lo[i], -up)) }
            if let room = sink[columns[i].id] { hi[i] = max(0, min(hi[i], room)) }
            if lo[i] > hi[i] { lo[i] = (lo[i] + hi[i]) / 2; hi[i] = lo[i] }
        }
        // Staggered labels that overlap across: an upper label may sink only as far as the lower one
        // beside it can, plus the gap between the rows (the lower one may be held up by the light).
        if !slots.isEmpty && n > 3 {
            let alone = hi
            for i in 0..<n {
                guard let mine = slots[i], mine.row == 0 else { continue }
                for j in [i - 1, i + 1] where (0..<n).contains(j) {
                    guard let other = slots[j], other.row == 1,
                          mine.frame.maxX > other.frame.minX, other.frame.maxX > mine.frame.minX else { continue }
                    hi[i] = max(lo[i], min(hi[i], alone[j] + other.frame.minY - mine.frame.maxY - 0.5))
                }
            }
        }
        let clamp = { (i: Int, v: CGFloat) in min(hi[i], max(lo[i], v)) }
        let id = { (i: Int) in self.postId(WalkPostKey(level: lvl, column: self.columns[i].id)) }
        let rank = (0..<n).map { WalkFooting.hand(id($0), "rank") }
        let own = (0..<n).map { CGFloat(WalkFooting.hand(id($0), "footing") + 1) / 2 }      // 0…1, the post's own
        let rows = !slots.isEmpty && n > 3
        /// Whether column `a` stands lower than its drawn neighbour `b`.
        func lower(_ a: Int, _ b: Int) -> Bool {
            if rows, let sa = slots[a], let sb = slots[b], sa.row != sb.row { return sa.row == 1 }
            return rank[a] != rank[b] ? rank[a] > rank[b] : id(a) > id(b)
        }
        let order = (0..<n).filter { drawn.contains(columns[$0].id) }
        let m = order.count
        var value = (0..<n).map { (-1.5 + 3 * own[$0]) * k }                // a label with no post: near the line
        var apart = [Bool](repeating: true, count: n)
        var runOf = [Int](repeating: 2, count: max(0, m - 1))     // the length of the run each neighbour pair lies in
        if m == 1 {
            value[order[0]] = (-reach + 2 * reach * own[order[0]])
        } else if m > 1 {
            // down[t]: order[t + 1] stands lower than order[t].
            let down = (0..<(m - 1)).map { lower(order[$0 + 1], order[$0]) }
            var ends = [0]
            for t in 1..<(m - 1) where down[t - 1] != down[t] { ends.append(t) }
            ends.append(m - 1)
            var longest = [Int](repeating: 2, count: m)
            let runs = Array(zip(ends, ends.dropFirst()))
            for (a, b) in runs {
                let length = b - a + 1
                for t in a..<b { runOf[t] = length }
                longest[a] = max(longest[a], length)
                longest[b] = max(longest[b], length)
            }
            let sinks = { (t: Int) in t == 0 ? !down[0] : down[t - 1] }
            // An extreme stands at least `least` from the line: 3, 7.5 or 9 by the longest run it closes.
            var least = ends.reduce(into: [Int: CGFloat]()) { out, t in
                out[t] = max(rows ? 6 : 0, longest[t] >= 4 ? 9 : (longest[t] == 3 ? 7.5 : 3)) * k
            }
            // Where its room holds one end of a run near the line, the other end stands far enough off
            // to leave the run its steps: 6 apart (4.5 in a run of five).
            let near = { (t: Int) in sinks(t) ? clamp(order[t], least[t]!) : clamp(order[t], -least[t]!) }
            let held = ends.reduce(into: [Int: CGFloat]()) { $0[$1] = near($1) }
            for (a, b) in runs {
                let length = b - a + 1
                let span = (length == 5 ? 4.5 : gapY / k) * k * CGFloat(length - 1)
                for (e, f) in [(a, b), (b, a)] {
                    least[e] = min(reach, max(least[e]!, sinks(e) ? held[f]! + span : -(held[f]! - span)))
                }
            }
            for t in ends {
                let magnitude = least[t]! + (reach - least[t]!) * own[order[t]]
                value[order[t]] = clamp(order[t], sinks(t) ? magnitude : -magnitude)
            }
            // Inside a run, between its two ends as they stand.
            for (a, b) in runs where b - a > 1 {
                let length = b - a + 1
                let (raised, sunk) = down[a] ? (order[a], order[b]) : (order[b], order[a])
                let top = value[raised], bottom = value[sunk]
                for t in (a + 1)..<b {
                    let j = CGFloat(down[a] ? t - a : b - t)                // steps from the raised end
                    if length == 3 {
                        // Anywhere at least 6 from both ends, by its own hand: about 0 ± 1.5 when nothing holds them.
                        let from = top + gapY, to = bottom - gapY
                        value[order[t]] = from <= to ? from + (to - from) * own[order[t]] : (from + to) / 2
                    } else {
                        value[order[t]] = top + (bottom - top) * j / CGFloat(length - 1)
                    }
                    if length >= 6 { apart[order[t]] = false }
                }
            }
        }
        // A label with no post: within what its drawn neighbours' labels in the other row leave it.
        if rows {
            for i in 0..<n where !drawn.contains(columns[i].id) {
                guard let mine = slots[i] else { continue }
                var low = -reach, high = reach
                for j in [i - 1, i + 1] where (0..<n).contains(j) && drawn.contains(columns[j].id) {
                    guard let other = slots[j], other.row != mine.row else { continue }
                    let (upper, lowerSlot) = mine.row == 0 ? (mine, other) : (other, mine)
                    guard upper.frame.maxX > lowerSlot.frame.minX, lowerSlot.frame.maxX > upper.frame.minX else { continue }
                    let room = lowerSlot.frame.minY - upper.frame.maxY - 0.5
                    if mine.row == 1 { low = max(low, value[j] - room) } else { high = min(high, value[j] + room) }
                }
                value[i] = low > high ? (low + high) / 2 : min(high, max(low, value[i]))
            }
        }
        var out = (0..<n).map { (value: clamp($0, value[$0]), apart: apart[$0]) }
        for t in 0..<max(0, m - 1) {
            let (a, b) = (order[t], order[t + 1])
            guard abs(out[a].value - out[b].value) < gapY - 0.0001 else { continue }
            // Only a genuine monotone run of five stands 4.5 apart by design.
            let inFive = runOf[t] == 5 && abs(out[a].value - out[b].value) >= 4.5 * k - 0.0001
            if !inFive { out[a].apart = false; out[b].apart = false }
        }
        return out
    }

    /// How far each stacked post may rise and sink (its footing, with its pole's length) before one of its
    /// flags would meet a flag of another level that the ruled layout keeps clear of it: half the gap to
    /// the flags above and below (the other half is theirs).
    func clearances(_ stacked: [L.Post]) -> (rise: [WalkPostKey: CGFloat], sink: [WalkPostKey: CGFloat]) {
        let margin: CGFloat = 0.5, side: CGFloat = 4                // what a little turn may add (more is damped)
        let all = stacked.flatMap { p in p.banners.map { (key: p.key, frame: $0.frame) } }
        var rise: [WalkPostKey: CGFloat] = [:], sink: [WalkPostKey: CGFloat] = [:]
        for p in stacked {
            var up = CGFloat.infinity, down = CGFloat.infinity
            for b in p.banners {
                for o in all where o.key.level != p.key.level
                    && o.frame.minX < b.frame.maxX + side && b.frame.minX < o.frame.maxX + side {
                    // The gap between them is shared: the one below may rise half of it, the one above sink half.
                    if o.frame.maxY <= b.frame.minY + L.fitTolerance {
                        up = min(up, (b.frame.minY - o.frame.maxY) / 2)
                    } else if o.frame.minY >= b.frame.maxY - L.fitTolerance {
                        down = min(down, (o.frame.minY - b.frame.maxY) / 2)
                    }
                }
            }
            // (A longer pole lifts a stack too; where that would meet the flags above, the pole gives way first.)
            if up < .infinity { rise[p.key] = max(0, up - margin) }
            if down < .infinity { sink[p.key] = max(0, down - margin) }
        }
        return (rise, sink)
    }

    /// How far a label may sink and stay clear of the light (its ring and ticks plus 4 pt while it shows).
    func orbRoom(_ r: CGRect) -> CGFloat {
        let c = WalkOrb.centre
        let clear: CGFloat = (s.step <= 5 ? 74 : WalkOrb.radius) + 0.1
        let dx = max(0, r.minX - c.x, c.x - r.maxX)
        guard dx < clear else { return .infinity }
        return c.y - (clear * clear - dx * dx).squareRoot() - r.maxY
    }

    /// The bare pole under a post's lowest banner.
    func pole(_ key: WalkPostKey) -> CGFloat {
        let u = (CGFloat(WalkFooting.hand(postId(key), "pole")) + 1) / 2
        let raw = WalkFooting.pole.lowerBound + u * (WalkFooting.pole.upperBound - WalkFooting.pole.lowerBound)
        return L.pole + (raw - L.pole) * poleShare(key)
    }

    /// A stacked post, planted: its base a little above or below the band line (`feet`, by column),
    /// a stack standing on the bare pole raised or lowered with the pole's length (small flags and
    /// stubs stand on the base itself), the post leaning about its base, each cloth hanging askew
    /// and a little off the pole line. Frames move with the post as one piece, so a stack stays a
    /// stack; each banner is turned about where it meets its pole. A small flag does not shift off
    /// its pole. With no hand left (both shares 0) the post is exactly as stacked. `squeezed`: its
    /// standing share was reduced, or it could not stand `apart` from a neighbour.
    func plant(_ post: L.Post, _ feet: [(value: CGFloat, apart: Bool)]) -> L.Post {
        let key = post.key, sigma = sigma(key)
        let foot = feet[columns.firstIndex { $0.id == key.column }!]
        let footing = foot.value * sigma, pole = pole(key)
        let onPole = post.banners.map(\.frame.maxY).max().map { abs($0 - (post.base.y - L.pole)) < L.fitTolerance } ?? true
        let dy = footing - (onPole ? pole - L.pole : 0)
        let base = CGPoint(x: post.base.x, y: post.base.y + footing)
        let banners = dy == 0 ? post.banners : post.banners.map { b -> L.Banner in
            var b = b
            b.frame = b.frame.offsetBy(dx: 0, dy: dy)
            return b
        }
        var planted = L.Post(id: post.id, key: key, base: base, top: post.top + dy, opacity: post.opacity,
                             saturation: post.saturation, pale: post.pale, banners: banners)
        planted.footing = footing
        planted.pole = pole
        planted.squeezed = self.footing == .natural && (sigma < 1 || !foot.apart)
        let small = kind(of: key.level) == .tip && s.expanded != key
        return dress(planted, scale: small ? tipScale(key.level) : 1)
    }

    /// The post's lean and each cloth's tilt and shift (see `plant`).
    func dress(_ post: L.Post, scale: CGFloat) -> L.Post {
        let sigma = turning(post.key)
        let lean = WalkFooting.hand(post.id, "lean") * WalkFooting.lean * Double(sigma)
        let banners = post.banners.map { b -> L.Banner in
            var b = b
            let who = b.itemId?.uuidString ?? (b.kind == .ghost ? "example:\(b.text)" : b.id)
            b.tilt = WalkFooting.hand(who, "tilt") * WalkFooting.tilt * Double(sigma)
            let unit: CGFloat = b.kind == .tip ? 0 : (b.kind == .full || b.kind == .ghost || b.kind == .compact ? 1 : scale)
            b.shift = CGFloat(WalkFooting.hand(who, "shift")) * WalkFooting.shift * unit * sigma
            let p0 = CGPoint(x: min(max(post.base.x, b.frame.minX), b.frame.maxX), y: b.frame.minY)
            if lean == 0 && b.shift == 0 {
                b.pivot = p0
            } else {
                let r = CGFloat(lean * .pi / 180)
                let on = WalkTurn.turned(p0, degrees: lean, about: post.base)
                b.pivot = CGPoint(x: on.x + b.shift * cos(r), y: on.y + b.shift * sin(r))
                b.frame = b.frame.offsetBy(dx: b.pivot.x - p0.x, dy: b.pivot.y - p0.y)
            }
            b.turn = lean + b.tilt
            // Unzoomed, a cloth whose drawing would leave the screen slides back inside, as its frame did.
            if !zoomed, b.kind != .tip, b.turn != 0 {
                let d = b.drawn
                let dx = d.minX < L.edges.lowerBound ? L.edges.lowerBound - d.minX
                    : (d.maxX > L.edges.upperBound ? L.edges.upperBound - d.maxX : 0)
                if dx != 0 { b.frame = b.frame.offsetBy(dx: dx, dy: 0); b.pivot.x += dx }
            }
            return b
        }
        var dressed = L.Post(id: post.id, key: post.key, base: post.base, top: post.top, opacity: post.opacity,
                             saturation: post.saturation, pale: post.pale, banners: banners)
        dressed.footing = post.footing
        dressed.lean = lean
        dressed.pole = post.pole
        dressed.squeezed = post.squeezed
        dressed.turning = sigma
        return dressed
    }

    // MARK: Posts on one level

    /// The level's kind, before room and focus: compact on Look back up, full on the step's level, tips above it.
    func kind(of lvl: WalkLevel) -> L.Kind {
        if s.step >= 6 { return .compact }
        return lvl == level ? .full : .tip
    }

    /// The step's own level and Year rise to the question line; any other level to the
    /// band above plus 6, and never past the question line either.
    func ceiling(_ lvl: WalkLevel) -> CGFloat {
        if lvl == .year || (s.step < 6 && lvl == level) { return L.flagCeiling }
        guard let above = WalkLevel(rawValue: lvl.rawValue - 1) else { return L.flagCeiling }
        return max(L.flagCeiling, stageY(above) + 6)
    }

    /// The flags of a level, by column, in planting order. Today holds only the first thing.
    func groups(_ lvl: WalkLevel) -> [(column: UUID?, items: [WalkItem])] {
        let items: [WalkItem]
        if lvl == .today {
            items = s.item(s.firstThing).map { [$0] }?.filter(shown) ?? []
        } else {
            items = s.items(on: lvl).filter(shown)
        }
        var out: [(column: UUID?, items: [WalkItem])] = []
        for column in columns {
            let mine = items.filter { self.column(of: $0) == column.id }
            let holdsGhosts = lvl == level && !ghosts.isEmpty && ghostColumn == column.id
            if !mine.isEmpty || holdsGhosts { out.append((column.id, mine)) }
        }
        return out
    }

    /// Without room, only this post draws its flags: the examples' post while they
    /// show, a post opened from its stub, the selected flag's, the focused one's,
    /// the last planted's, else the first with anything on it.
    func openIndex(_ lvl: WalkLevel, _ groups: [(column: UUID?, items: [WalkItem])]) -> Int? {
        func index(_ column: UUID??) -> Int? {
            guard let column else { return nil }
            return groups.firstIndex { $0.column == column }
        }
        func columnOf(_ id: UUID?) -> UUID?? {
            guard let item = s.item(id), groups.contains(where: { $0.items.contains { $0.id == item.id } }) else { return nil }
            return .some(column(of: item))
        }
        if lvl == level, !ghosts.isEmpty, let i = index(.some(ghostColumn)) { return i }
        if let e = s.expanded, e.level == lvl, let i = index(.some(e.column)) { return i }
        if let i = index(columnOf(s.selected)) { return i }
        if let level {
            if lvl == level {
                if level == .year, let area = s.focusArea, let i = index(.some(area)) { return i }
                if level != .year, let parent = s.item(s.focus[level]), let i = index(.some(column(of: parent))) { return i }
            } else if lvl.rawValue == level.rawValue - 1, let i = index(columnOf(s.focus[level])) {
                return i
            }
        }
        if let i = index(columnOf(s.lastPlanted[lvl])) { return i }
        return groups.firstIndex { !$0.items.isEmpty }
    }

    /// What a tap on the flag does, as the reducer does it. Today's first thing reads the same
    /// on its band and on its Week post, since a tap on either is the same tap.
    func role(_ item: WalkItem, todayBand: Bool) -> WalkCopy.BannerRole {
        if todayBand || (s.step == 5 && item.id == s.firstThing) {
            guard s.step == 5 else { return .firstThing }
            // The goal above walks the round, whoever planted it; else the walk's own is chosen for Remove.
            if s.focus[.today] == item.id { return s.nextGoalAbove() != nil ? .firstThingFocused : .firstThing }
            if item.mine { return .firstThingMine }
            return s.goalAboveAfterTap(on: item.id) != nil ? .firstThingFocusable : .firstThing
        }
        guard s.step < 6, !s.ground, let level else { return .plain }
        if item.level == level { return item.mine ? .mine : .plain }
        if item.level.rawValue == level.rawValue - 1, s.focus[level] == item.id {
            return s.nextGoalAbove() != nil ? .focusedOfSeveral : .focused
        }
        return .plain
    }

    func entry(_ item: WalkItem, on lvl: WalkLevel, kind: L.Kind) -> Entry {
        let todayBand = lvl == .today
        let tag: String? = todayBand ? WalkCopy.firstThingTag
            : (lvl == .week ? item.day.map { WalkWords.tag(for: $0, today: today) } : nil)
        // Small flags never glow; a selected flag does, and a focused one risen to a one-line banner.
        let glows = kind != .tip
            && (s.selected == item.id || (kind == .compact && s.step < 6 && lvl != level && isFocused(item))
                || (todayBand && s.step < 6 && isFocused(item)))
        let r = role(item, todayBand: todayBand)
        return Entry(kind: kind, item: item, text: item.title, tag: tag, glows: glows,
                     label: WalkCopy.bannerLabel(item.title, level: lvl, tag: tag, role: r), taps: r.taps)
    }

    /// The flag the step is focused on (one level up).
    func isFocused(_ item: WalkItem) -> Bool {
        guard let level else { return false }
        return s.focus[level] == item.id
    }

    /// A focused or selected flag on a tip post rises above the small flags as a glowing one-line banner.
    func rises(_ item: WalkItem) -> Bool {
        // Today's first thing glows on the Today band, not again over its Week post.
        if level == .today, item.id == s.firstThing { return false }
        return isFocused(item) || s.selected == item.id
    }

    func posts(on lvl: WalkLevel, risenAbove: [CGRect], framesAbove: [CGRect]) -> (posts: [L.Post], risen: [CGRect]) {
        let groups = groups(lvl)
        guard !groups.isEmpty else { return ([], []) }
        let levelKind = kind(of: lvl)
        let lookBack = s.step >= 6
        let d = max(0, min(s.step, 6) - lvl.rawValue)
        let tipScale = max(0.6, 1 - 0.1 * CGFloat(d - 1))
        let expandedHere = s.expanded.map { e in e.level == lvl && groups.contains { $0.column == e.column } } ?? false
        let room = hasRoom([levelKind] + (expandedHere ? [.compact] : []), scale: levelKind == .tip ? tipScale : 1)
        let open = room ? nil : openIndex(lvl, groups)
        let ceiling = ceiling(lvl)
        let y = stageY(lvl)
        // Zoomed in close, a level standing in the question has no room even for a stub: it waits.
        if zoomed, y - ceiling < 20 { return ([], []) }

        func meets(_ a: CGRect, _ b: CGRect) -> Bool { a.minX < b.maxX && b.minX < a.maxX }

        // Where flags will rise above the small flags: room is kept for them under the ceiling.
        let riserSpans: [CGRect] = groups.flatMap { group -> [CGRect] in
            guard levelKind == .tip, s.expanded != WalkPostKey(level: lvl, column: group.column) else { return [] }
            let x = stageX(columns.first { $0.id == group.column }!.worldX)
            return group.items.filter(rises).map { _ in
                slid(CGRect(x: x - compactWidth / 2, y: 0, width: compactWidth, height: 1))
            }
        }

        // On a crowded ridge, the stubs the other posts stand: the open post's banners keep clear of them.
        let stubs: [CGRect] = room ? [] : groups.enumerated().compactMap { i, group in
            let key = WalkPostKey(level: lvl, column: group.column)
            let drawKind: L.Kind = s.expanded == key && levelKind != .compact ? .compact : levelKind
            let risers = levelKind == .tip && s.expanded != key ? group.items.filter(rises) : []
            guard open != i, group.items.contains(where: { !risers.contains($0) }) else { return nil }
            let x = stageX(columns.first { $0.id == group.column }!.worldX)
            return stub("", lvl, base: CGPoint(x: x, y: y), count: 0, scale: drawKind == .tip ? tipScale : 1, below: nil).frame
        }

        var built: [(column: UUID?, base: CGPoint, banners: [L.Banner], risers: [WalkItem], pale: Bool)] = []
        for (i, group) in groups.enumerated() {
            let base = CGPoint(x: stageX(columns.first { $0.id == group.column }!.worldX), y: y)
            let key = WalkPostKey(level: lvl, column: group.column)
            let id = postId(key)
            let expanded = s.expanded == key
            let drawKind: L.Kind = expanded && levelKind != .compact ? .compact : levelKind
            let risers = levelKind == .tip && !expanded ? group.items.filter(rises) : []
            let items = group.items.filter { !risers.contains($0) }
            let scale: CGFloat = drawKind == .tip ? tipScale : 1
            let ghostHere = lvl == level && !ghosts.isEmpty && ghostColumn == group.column
            let span = span(at: base.x, [drawKind], scale: scale)
            let reserve = CGFloat(riserSpans.filter { meets($0, span) }.count) * (23 + 4)
            // The step's own flags stop 4 pt under a flag risen from the level above: it is never covered.
            let cap = lvl == level ? risenAbove.filter { meets($0, span) }.map { $0.maxY + 4 }.max() : nil
            let postCeiling = max(ceiling + reserve, cap ?? -.infinity)
            let hard: CGFloat? = lvl == level ? nil : L.flagCeiling + reserve
            let reals = items.reversed().map { entry($0, on: lvl, kind: drawKind) }
            var banners: [L.Banner]
            if !(room || open == i) {
                banners = items.isEmpty ? [] : [stub(id, lvl, base: base, count: items.count, scale: scale, below: nil)]
            } else if lookBack && expanded {
                // Opened on Look back up: as many as fit under the flags above in this column; the top one counts the rest.
                let roof = max(L.flagCeiling, framesAbove.filter { meets($0, span) }.map { $0.maxY + 4 }.max() ?? L.flagCeiling)
                banners = stack(id, lvl, base: base, ghosts: [], reals: reals, ceiling: roof, hard: roof,
                                scale: scale, moreOnTop: true, avoid: stubs)
            } else if lookBack {
                // Look back up: the newest, carrying the count of the others.
                banners = stack(id, lvl, base: base, ghosts: [], reals: Array(reals.prefix(1)), ceiling: postCeiling,
                                hard: nil, scale: scale, moreOnTop: true, avoid: stubs, carriesMore: reals.count > 1)
                if reals.count > 1, let last = banners.indices.last { banners[last] = carrying(banners[last], more: reals.count - 1) }
            } else {
                let ghostEntries = ghostHere ? ghosts.map { text in
                    Entry(kind: .ghost, item: nil, text: text, tag: nil, glows: false,
                          label: WalkCopy.bannerLabel(text, level: lvl, tag: nil, role: .example))
                } : []
                banners = stack(id, lvl, base: base, ghosts: ghostEntries, reals: reals,
                                ceiling: postCeiling, hard: hard, scale: scale, moreOnTop: false, own: lvl == level,
                                avoid: stubs)
            }
            built.append((group.column, base, banners, risers, ghostHere && group.items.isEmpty))
        }

        // The risers, each 4 pt above the tallest stack within its width.
        var risen: [CGRect] = []
        for i in built.indices {
            for item in built[i].risers {
                let e = entry(item, on: lvl, kind: .compact)
                var frame = slid(CGRect(x: built[i].base.x - compactWidth / 2, y: 0, width: compactWidth, height: 23))
                var top = built[i].base.y
                for other in built.flatMap(\.banners) where meets(other.frame, frame) {
                    top = min(top, other.frame.minY)
                }
                frame.origin.y = top - 4 - 23
                risen.append(frame)
                built[i].banners.append(banner(id: "\(postId(WalkPostKey(level: lvl, column: built[i].column)))-\(item.id.uuidString)",
                                               e, lvl, frame: frame, lines: 1))
            }
        }

        // A focused flag in an opened stack glows there as well: it is never covered either.
        risen += built.flatMap(\.banners).filter { $0.kind == .compact && $0.glows && !risen.contains($0.frame) }.map(\.frame)

        let posts = built.map { post in
            let key = WalkPostKey(level: lvl, column: post.column)
            return L.Post(id: postId(key), key: key, base: post.base,
                          top: post.banners.map(\.frame.minY).min() ?? post.base.y - L.pole,
                          // Looking back up, the whole plan is read: every flag at full strength.
                          opacity: s.step >= 6 ? 1 : Double(max(0.6, 1 - 0.09 * CGFloat(d))),
                          saturation: s.step >= 6 ? 1 : Double(max(0.55, 1 - 0.1 * CGFloat(d))),
                          pale: post.pale, banners: post.banners)
        }
        return (posts, risen)
    }

    /// The posts (and labels, by their column's Year post) whose drawing breaks a guarantee the
    /// ruled layout gives, measured on what is drawn: banners of one level meet (two on one post
    /// by their turned outlines, as a stack turns as one; any other pair by bounding boxes); a
    /// banner covers a label that takes taps, or a risen flag above the step; looking back up, flags
    /// of two levels meet; labels meet, sit in the question or on the light; anything meets the orb,
    /// leaves the screen's edges unzoomed (a small flag excepted) or the world; a flag rises into
    /// the question (but the step's own newest alone) or a stub above its ceiling. (Whether an
    /// example shows is the stacking's, which the hand never changes.) And, measured against
    /// `ruled` (the hand never piles one thing onto another):
    /// two posts' flags (any levels) meet that it keeps apart, or a flag (not the step's own) covers more of a label than it does.
    ///
    /// Both posts (or post and label) of a conflicting pair are returned, so both are damped: the
    /// layout cannot tell which one's hand caused it, and damping both always ends it, since with
    /// no hand left on either the pair stands as the ruled layout has it, which keeps every rule.
    func conflicts(_ made: WalkLayout, ruled: WalkLayout) -> Set<WalkPostKey> {
        var bad: Set<WalkPostKey> = []
        let e = L.fitTolerance
        func overlap(_ a: CGRect, _ b: CGRect) -> Bool {
            a.minX < b.maxX - e && b.minX < a.maxX - e && a.minY < b.maxY - e && b.minY < a.maxY - e
        }
        func orbDistance(_ r: CGRect) -> CGFloat {
            let c = WalkOrb.centre
            return hypot(c.x - min(max(c.x, r.minX), r.maxX), c.y - min(max(c.y, r.minY), r.maxY))
        }
        let placed = made.posts.flatMap { post in post.banners.map { (post: post, banner: $0, drawn: $0.drawn) } }
        let ruledFrames = Dictionary(ruled.posts.flatMap(\.banners).map { ($0.id, $0.frame) }, uniquingKeysWith: { a, _ in a })
        let ruledLabels = Dictionary(ruled.labels.map { ($0.id, $0.frame) }, uniquingKeysWith: { a, _ in a })
        /// The hand covers more of one thing with another than the ruled layout does (by more than 4 pt²).
        func piles(_ a: CGRect, _ b: CGRect, ruledA: CGRect?, ruledB: CGRect?) -> Bool {
            guard overlap(a, b), let ruledA, let ruledB else { return false }
            let area = { (x: CGRect, y: CGRect) -> CGFloat in
                let i = x.intersection(y)
                return i.isNull ? 0 : i.width * i.height
            }
            return area(a, b) > area(ruledA, ruledB) + 4
        }
        let labelKey = { (l: L.Label) in WalkPostKey(level: .year, column: l.id) }

        for i in placed.indices {
            let a = placed[i]
            for j in placed.indices where j > i {
                let b = placed[j]
                let meet: Bool
                if a.post.id == b.post.id {
                    meet = WalkTurn.meet(a.banner.corners, b.banner.corners)
                } else if a.banner.level == b.banner.level || s.step >= 6 {
                    meet = overlap(a.drawn, b.drawn)
                } else if let level, (2...5).contains(s.step) {
                    // The step's own flag over a flag risen from the level above.
                    let covers = { (own: L.Banner, risen: L.Banner) in
                        own.level == level && risen.level.rawValue == level.rawValue - 1 && risen.kind == .compact && risen.glows
                    }
                    meet = (covers(a.banner, b.banner) || covers(b.banner, a.banner)) && overlap(a.drawn, b.drawn)
                } else {
                    meet = false
                }
                // Whatever the rules allow, the hand does not make two posts' flags meet, on one level or across
                // levels, that the ruled layout keeps apart.
                let piled = !meet && a.post.id != b.post.id && overlap(a.drawn, b.drawn)
                    && ruledFrames[a.banner.id].map { r in ruledFrames[b.banner.id].map { !overlap(r, $0) } ?? false } == true
                if meet || piled { bad.insert(a.post.key); bad.insert(b.post.key) }
            }
        }
        let labelsTakeTaps = s.step == 1 || s.ground
        for (i, l) in made.labels.enumerated() {
            for m in made.labels[(i + 1)...] where overlap(l.frame, m.frame) { bad.insert(labelKey(l)); bad.insert(labelKey(m)) }
            for p in placed where overlap(l.frame, p.drawn) {
                // A label that takes taps is never covered; any other no more than the ruled layout covers it,
                // except by the step's own flags, which stand in front of the peaks by design.
                if labelsTakeTaps || (p.banner.level != level
                    && piles(l.frame, p.drawn, ruledA: ruledLabels[l.id], ruledB: ruledFrames[p.banner.id])) { bad.insert(labelKey(l)); bad.insert(p.post.key) }
            }
            if (s.step <= 5 && orbDistance(l.frame) < 74) || orbDistance(l.frame) <= WalkOrb.radius
                || l.frame.minY < L.flagCeiling - e || (!zoomed && (l.frame.minX < L.edges.lowerBound - e || l.frame.maxX > L.edges.upperBound + e)) {
                bad.insert(labelKey(l))
            }
        }
        for p in placed {
            let d = p.drawn
            let world = CGRect(x: d.minX / camera.k + camera.x, y: d.minY / camera.k + camera.y,
                               width: d.width / camera.k, height: d.height / camera.k)
            let outside = !zoomed && p.banner.kind != .tip && (d.minX < L.edges.lowerBound - e || d.maxX > L.edges.upperBound + e)
            let question = !(p.post.key.level == level && p.post.banners.count == 1) && d.minY < L.flagCeiling - e
            var stubHigh = false
            if case .stub = p.banner.kind { stubHigh = d.minY < ceiling(p.post.key.level) - e }
            if orbDistance(d) <= WalkOrb.radius || outside || question || stubHigh
                || world.minX < 0 || world.maxX > art.world.width || world.minY < 0 || world.maxY > art.world.height {
                bad.insert(p.post.key)
            }
        }
        return bad
    }

    /// Neighbouring columns' flags, on stage at this camera, stand at least 6 apart,
    /// measured after the edges slide a frame back inside (a slid frame closes the gap).
    /// Checked at the scale the flags are drawn; a stub folded on top must not meet a neighbour either.
    func hasRoom(_ kinds: [L.Kind], scale: CGFloat) -> Bool {
        let xs = columns.map { stageX($0.worldX) }
        let drawn = xs.map { x in kinds.map { across($0, at: x, scale: scale) }.reduce(CGRect.null) { $0.union($1) } }
        let folded = xs.map { span(at: $0, kinds, scale: scale) }
        return zip(drawn, drawn.dropFirst()).allSatisfy { $1.minX - $0.maxX >= 6 }
            && zip(folded, folded.dropFirst()).allSatisfy { $1.minX - $0.maxX > 0 }
    }

    func postId(_ key: WalkPostKey) -> String {
        "\(key.level.rawValue)-\(key.column?.uuidString ?? "unlabeled")"
    }

    // MARK: The stack

    /// Banners rise from the base, the person's own flags first, newest lowest. A flag
    /// goes on while it, and a stub if any would remain, stay below the ceiling; the
    /// rest fold into one stub on top, which never rises above the ceiling either (on
    /// Look back up, `moreOnTop`: the top banner carries the count instead). Examples
    /// take only the room that is left; one that does not fit waits. If none would
    /// fit, the flags fold to their newest (one line, then compact) and the first
    /// example is cut to one line, until one shows.
    ///
    /// The newest is cut to one line if it must be. On the step's own level (`own`) it
    /// is always a banner: when it and a separate stub cannot both fit, it carries the
    /// count of the others itself, sitting lower on its pole (down to its base) to keep
    /// under the ceiling. Elsewhere it may pass the ceiling only up to `hard` when it
    /// stands alone, and otherwise a stub takes its place.
    func stack(_ id: String, _ lvl: WalkLevel, base: CGPoint, ghosts: [Entry], reals: [Entry],
               ceiling: CGFloat, hard: CGFloat?, scale: CGFloat, moreOnTop: Bool, own: Bool = false,
               avoid: [CGRect] = [], carriesMore: Bool = false) -> [L.Banner] {
        let plain = flagsThenExamples(id, lvl, base: base, ghosts: ghosts, reals: reals, ceiling: ceiling, hard: hard,
                                      scale: scale, moreOnTop: moreOnTop, own: own, avoid: avoid, carriesMore: carriesMore)
        guard !ghosts.isEmpty, !plain.contains(where: { $0.kind == .ghost }) else { return plain }
        // Examples are on but none found room: the person's flags fold to their newest, then give way,
        // in this order, until the first example fits. Nothing covers a risen flag or crosses the question.
        let tiers: [(own: L.Kind?, firstLines: Int?)] = reals.isEmpty
            ? [(nil, 1)]
            : [(.full, nil), (.compact, nil), (.compact, 1)]
        for tier in tiers {
            let folded = foldedWithExamples(id, lvl, base: base, ghosts: ghosts, reals: reals, ceiling: ceiling,
                                            ownKind: tier.own, firstLines: tier.firstLines, avoid: avoid)
            if folded.contains(where: { $0.kind == .ghost }) { return folded }
        }
        return plain
    }

    /// The person's newest flag on one line (as `ownKind`), carrying the count of the others and
    /// sitting lower on its pole (down to its base) as far as the first example needs; then the
    /// examples in order, the first cut to `firstLines` if given, while they fit under the ceiling.
    func foldedWithExamples(_ id: String, _ lvl: WalkLevel, base: CGPoint, ghosts: [Entry], reals: [Entry],
                            ceiling: CGFloat, ownKind: L.Kind?, firstLines: Int?, avoid: [CGRect]) -> [L.Banner] {
        var placed: [L.Banner] = []
        let gapY: CGFloat = 4
        let natural = { (e: Entry) in WalkLayout.lines(for: e.text, width: self.bw) }
        let firstHeight = height(.ghost, lines: firstLines ?? ghosts.first.map(natural) ?? 1, tag: nil)
        var b = base.y - L.pole
        if let newest = reals.first, let ownKind {
            let e = Entry(kind: ownKind, item: newest.item, text: newest.text, tag: newest.tag, glows: newest.glows,
                          label: newest.label, taps: newest.taps)
            let h = height(ownKind, lines: 1, tag: e.tag)
            b = min(base.y, max(b, ceiling + firstHeight + gapY + h))
            let x = across(ownKind, at: base.x, scale: 1)
            var own = banner(id: "\(id)-\(newest.item?.id.uuidString ?? "0")", e, lvl,
                             frame: keepClear(CGRect(x: x.minX, y: b - h, width: x.width, height: h), pole: base.x, of: avoid),
                             lines: 1)
            if reals.count > 1 { own = carrying(own, more: reals.count - 1) }
            placed.append(own)
            b = own.frame.minY - gapY
        }
        for (i, ghost) in ghosts.enumerated() {
            let lines = i == 0 ? (firstLines ?? natural(ghost)) : natural(ghost)
            let h = height(.ghost, lines: lines, tag: nil)
            guard b - h >= ceiling - L.fitTolerance else { break }       // an example that does not fit waits
            let x = across(.ghost, at: base.x, scale: 1)
            placed.append(banner(id: "\(id)-example-\(ghost.text)", ghost, lvl,
                                 frame: keepClear(CGRect(x: x.minX, y: b - h, width: x.width, height: h), pole: base.x, of: avoid),
                                 lines: lines))
            b -= h + gapY
        }
        return placed
    }

    /// The flags as `stack` describes them, then the examples in the room left.
    func flagsThenExamples(_ id: String, _ lvl: WalkLevel, base: CGPoint, ghosts: [Entry], reals: [Entry],
                           ceiling: CGFloat, hard: CGFloat?, scale: CGFloat, moreOnTop: Bool, own: Bool,
                           avoid: [CGRect], carriesMore: Bool = false) -> [L.Banner] {
        var placed: [L.Banner] = []
        let gapY = (reals.first?.kind == .tip ? 3 : 4) * scale
        let stubRoom = moreOnTop ? 0 : gapY + 20 * scale

        func bottom(for kind: L.Kind) -> CGFloat {
            if let last = placed.last { return last.frame.minY - gapY }
            switch kind {
            case .tip, .stub: return base.y
            default: return base.y - L.pole
            }
        }
        func place(_ e: Entry, lines: Int, id: String, at b: CGFloat) {
            let unit: CGFloat = e.kind == .tip ? scale : 1
            let across = self.across(e.kind, at: base.x, scale: unit)
            let h = height(e.kind, lines: lines, tag: e.tag) * unit
            let frame = CGRect(x: across.minX, y: b - h, width: across.width, height: h)
            placed.append(banner(id: id, e, lvl, frame: e.kind == .tip ? frame : keepClear(frame, pole: base.x, of: avoid),
                                 lines: lines))
        }
        // Looking back up, a post's one shown flag may take two lines (its words and any "+n more").
        let twoOnLookBack = s.step >= 6 && reals.count == 1
        func naturalLines(_ e: Entry) -> Int {
            if e.kind == .compact, twoOnLookBack {
                return WalkLayout.compactLines(for: e.text, width: width(.compact), carriesMore: carriesMore)
            }
            return e.kind == .full || e.kind == .ghost ? WalkLayout.lines(for: e.text, width: bw) : 1
        }
        func h(_ e: Entry, _ lines: Int) -> CGFloat { height(e.kind, lines: lines, tag: e.tag) * (e.kind == .tip ? scale : 1) }

        var shown = 0
        var carried = false
        for (j, e) in reals.enumerated() {
            let remaining = reals.count - j - 1
            var b = bottom(for: e.kind)
            func fits(_ lines: Int) -> Bool {
                let top = b - h(e, lines)
                return top >= ceiling && (remaining == 0 || top - stubRoom >= ceiling)
            }
            var lines = naturalLines(e)
            // Two lines on Look back up: lower on the pole (down to its base) if that keeps it under the
            // ceiling and off its column's peak label where that label stands; otherwise one line, as before.
            if lines == 2, e.kind == .compact, twoOnLookBack {
                // A second line never reaches onto a peak's label (its own or a neighbour's, on a crowded ridge).
                let cloth = across(.compact, at: base.x, scale: 1)
                let slots = labelSlots().values.map { $0.frame.insetBy(dx: -2, dy: -2) }
                let onLabel = { (bottom: CGFloat) in
                    slots.contains { $0.intersects(CGRect(x: cloth.minX, y: bottom - h(e, 2), width: cloth.width, height: h(e, 2))) }
                }
                if fits(2) {
                    if onLabel(b) { lines = 1 }
                } else {
                    let lowered = min(base.y, max(b, ceiling + h(e, 2)))
                    if lowered - h(e, 2) >= ceiling - L.fitTolerance, !onLabel(lowered) { b = lowered } else { lines = 1 }
                }
            }
            if !fits(lines) {
                guard j == 0 else { break }
                if fits(1) {
                    lines = 1
                } else if own || (remaining == 0 && placed.isEmpty) {
                    // One line, lower on its pole (down to its base) to keep under the ceiling.
                    lines = 1
                    b = min(base.y, max(b, ceiling + h(e, 1)))
                    if !own { guard b - h(e, 1) >= (hard ?? -.infinity) else { break } }
                    carried = remaining > 0
                } else {
                    break                               // a stub takes its place
                }
            }
            place(e, lines: lines, id: "\(id)-\(e.item?.id.uuidString ?? "\(j)")", at: b)
            shown += 1
            if carried { break }
        }
        if shown < reals.count {
            if moreOnTop || carried, let last = placed.indices.last {
                placed[last] = carrying(placed[last], more: reals.count - shown)
            } else {
                placed.append(stub(id, lvl, base: base, count: reals.count - shown, scale: scale,
                                   below: placed.last.map { $0.frame.minY - gapY }))
            }
        }

        for ghost in ghosts {
            let b = bottom(for: ghost.kind), top = b - h(ghost, naturalLines(ghost))
            guard top >= ceiling else { break }         // an example that does not fit waits
            place(ghost, lines: naturalLines(ghost), id: "\(id)-example-\(ghost.text)", at: b)
        }
        return placed
    }

    /// One rule for every banner of the open post on a crowded ridge, lowered or not: it
    /// narrows (centred on its pole, sliding inside the edges as banners do, never below
    /// `narrowest`) until it meets none of the neighbouring posts' stubs. Its text is cut by the view.
    func keepClear(_ frame: CGRect, pole: CGFloat, of stubs: [CGRect]) -> CGRect {
        func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
            let down = min(a.maxY, b.maxY) - max(a.minY, b.minY)
            guard down > L.fitTolerance else { return 0 }
            return max(0, min(a.maxX, b.maxX) - max(a.minX, b.minX))
        }
        var f = frame
        for _ in 0..<8 {
            let across = stubs.map { overlap(f, $0) }.max() ?? 0
            guard across > L.fitTolerance, f.width > L.narrowest else { return f }
            let centred = abs(f.midX - pole) < 0.5
            let width = max(L.narrowest, floor(f.width - (centred ? 2 : 1) * across))
            f = slid(CGRect(x: pole - width / 2, y: f.minY, width: width, height: f.height))
        }
        return f
    }

    /// A banner that also stands for `more` older flags: it says so, and a tap opens its post.
    func carrying(_ b: L.Banner, more: Int) -> L.Banner {
        L.Banner(id: b.id, itemId: b.itemId, level: b.level, kind: b.kind, frame: b.frame, lines: b.lines,
                        text: b.text, tag: b.tag, glows: b.glows,
                        label: b.label + ", " + WalkCopy.bannerLabel("", level: b.level, tag: nil, role: .stub(more)),
                        more: more, taps: true)
    }

    func stub(_ id: String, _ lvl: WalkLevel, base: CGPoint, count: Int, scale: CGFloat, below: CGFloat?) -> L.Banner {
        let w = 26 * scale, h = 20 * scale
        let frame = slid(CGRect(x: base.x - w / 2, y: (below ?? base.y) - h, width: w, height: h))
        let e = Entry(kind: .stub(count), item: nil, text: WalkCopy.stubCount(count), tag: nil, glows: false,
                      label: WalkCopy.bannerLabel("", level: lvl, tag: nil, role: .stub(count)))
        return banner(id: "\(id)-more", e, lvl, frame: frame, lines: 1)
    }

    func banner(id: String, _ e: Entry, _ lvl: WalkLevel, frame: CGRect, lines: Int) -> L.Banner {
        L.Banner(id: id, itemId: e.item?.id, level: lvl, kind: e.kind, frame: frame, lines: lines,
                 text: e.text, tag: e.tag, glows: e.glows, label: e.label, taps: e.taps)
    }
}

// MARK: - Look back up: the peaks as column headings

extension WalkLayout {

    /// The bottom of the Look back up header line ("Look back up: that’s your plan."): nothing stands above it.
    static let lookBackHeader: CGFloat = 92

    /// Looking back up, each peak's label stands just above its column's top flag, as the column's
    /// heading, clear of every flag, every other label and the header line (on a crowded ridge, as
    /// near above as is clear of a neighbour's flags). A column with no flag keeps its label where it
    /// stands, and no flag's second line was let onto it (`flagsThenExamples`).
    /// Done after the layout is planted, on what is drawn, so the hand never moves a heading.
    static func headings(_ made: WalkLayout) -> WalkLayout {
        let drawn = made.posts.flatMap { p in p.banners.map { (column: p.key.column, frame: $0.drawn) } }
        var labels = made.labels
        for i in labels.indices {
            let label = labels[i]
            guard let top = drawn.filter({ $0.column == label.id }).map(\.frame.minY).min() else { continue }
            let others = labels.indices.filter { $0 != i }.map { labels[$0].frame }
            // Just above the column's top flag; on a crowded ridge, where a neighbour's flag stands
            // there, as near above it as is clear.
            var y = top - 4 - label.frame.height
            var found: CGRect?
            while y >= lookBackHeader {
                let frame = CGRect(x: label.frame.minX, y: y, width: label.frame.width, height: label.frame.height)
                if !drawn.contains(where: { $0.frame.intersects(frame) }), !others.contains(where: { $0.intersects(frame) }) {
                    found = frame
                    break
                }
                y -= 2
            }
            guard let frame = found else { continue }
            labels[i] = Label(id: label.id, name: label.name, frame: frame, kept: label.kept, focused: label.focused,
                              opacity: label.opacity, tappable: label.tappable, hint: label.hint,
                              selected: label.selected, footing: label.footing, ground: label.ground)
        }
        return WalkLayout(camera: made.camera, labels: labels, posts: made.posts, needleDown: made.needleDown,
                          nextLine: made.nextLine, hintLine: made.hintLine, undoPill: made.undoPill,
                          lesson: made.lesson, more: made.more, back: made.back, leave: made.leave,
                          moveRow: made.moveRow)
    }
}
