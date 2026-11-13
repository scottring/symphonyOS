import Foundation
import CoreGraphics

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
        let frame: CGRect; let lines: Int; let text: String; let tag: String?; let glows: Bool; let label: String
        /// Look back up: a banner that also stands for this many older flags ("+n"); a tap opens its post as a stub's does.
        var more: Int? = nil }
    struct Post: Equatable, Identifiable { let id: String; let key: WalkPostKey; let base: CGPoint; let top: CGFloat
        let opacity: Double; let saturation: Double; let pale: Bool; let banners: [Banner] }
    struct Label: Equatable, Identifiable { let id: UUID; let name: String; let frame: CGRect
        let kept: Bool; let focused: Bool; let opacity: Double; let tappable: Bool; let hint: String? }
    let camera: Camera; let labels: [Label]; let posts: [Post]; let needleDown: Bool

    // MARK: Stage numbers (the art's numbers live in `WalkArt`)

    static let centreX: CGFloat = 195           // a zoomed column, and a lone one
    static let zoomK: CGFloat = 0.8
    static let zoomBaseY: CGFloat = 520         // where a zoomed column's post stands
    static let question: CGFloat = 250          // the ceiling for the step's own level and for Year
    static let pole: CGFloat = 24               // bare pole under the lowest banner
    static let edges: ClosedRange<CGFloat> = 4...386
    static let narrowColumns: ClosedRange<CGFloat> = 87...302     // up to four columns off the ground
    static let wideColumns: ClosedRange<CGFloat> = 50...340       // the ground, and five or more
    static let loneGap: CGFloat = 200

    static func make(_ state: WalkState, today: Date, art: WalkArt = .overlookSquare) -> WalkLayout {
        Builder(state, today: today, art: art).layout()
    }

    /// How many lines a title takes at a banner width: a character estimate, so the core needs no fonts.
    static func lines(for text: String, width: CGFloat) -> Int {
        let perLine = max(1, floor((width - 16) / 6.6))
        return min(3, max(1, Int(ceil(CGFloat(text.count) / perLine))))
    }
}

// MARK: - The pass

private struct Builder {
    typealias L = WalkLayout

    struct Column { let id: UUID?; let area: WalkArea?; let worldX: CGFloat }

    /// One flag (or example) waiting to be stacked.
    struct Entry { let kind: L.Kind; let item: WalkItem?; let text: String; let tag: String?; let glows: Bool; let label: String }

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

    init(_ s: WalkState, today: Date, art: WalkArt) {
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
        case .compact: return (compactWidth / 2, compactWidth / 2)
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
        case .compact: return 23
        case .tip, .stub: return 20
        }
    }

    // MARK: The layout

    func layout() -> WalkLayout {
        // Top down, so a level knows the flags risen above it and every frame above it.
        var posts: [L.Post] = []
        var risen: [CGRect] = []
        var above: [CGRect] = []
        for lvl in levelsDrawn() {
            let made = self.posts(on: lvl, risenAbove: risen, framesAbove: above)
            posts += made.posts
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
        return WalkLayout(camera: camera, labels: labels(), posts: posts, needleDown: needle)
    }

    /// Steps 1 to 5 draw their level and the ones above; Look back up draws all; Welcome none.
    func levelsDrawn() -> [WalkLevel] {
        if s.step >= 6 { return WalkLevel.allCases }
        return WalkLevel.allCases.filter { $0.rawValue <= s.step }
    }

    // MARK: Labels

    /// Welcome shows the bare vista: no labels, as no posts (at its far zoom they could not keep apart).
    func labels() -> [L.Label] {
        guard s.step >= 1 else { return [] }
        let cnt = columns.count
        let rows = cnt > 3
        let width = rows ? min(90, floor(2 * gap - 6)) : 90
        let d = CGFloat(max(0, min(s.step, 6) - 1))
        let scale = s.ground ? 1 : max(0.6, 1 - 0.1 * d)
        let tappable = s.ground || s.step == 1
        let yearY = stageY(.year)
        return columns.enumerated().compactMap { i, column -> L.Label? in
            guard let area = column.area else { return nil }
            let top = yearY + 3 + CGFloat(rows ? i % 2 : 0) * 34
            guard top >= L.question else { return nil }        // zoomed low, the peaks are in the question
            let kept = s.kept.contains(area.id)
            let focused = !s.ground && s.focusArea == area.id
            let opacity = s.ground ? (kept ? 1 : 0.62) : max(0.5, 1 - 0.1 * d)
            let frame = slid(CGRect(x: stageX(column.worldX) - width * scale / 2, y: top,
                                    width: width * scale, height: 30 * scale))
            return L.Label(id: area.id, name: area.name, frame: frame, kept: kept, focused: focused,
                           opacity: Double(opacity), tappable: tappable,
                           hint: tappable ? WalkCopy.areaHint(ground: s.ground, kept: kept, focused: focused) : nil)
        }
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
        if lvl == .year || (s.step < 6 && lvl == level) { return L.question }
        guard let above = WalkLevel(rawValue: lvl.rawValue - 1) else { return L.question }
        return max(L.question, stageY(above) + 6)
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

    func role(_ item: WalkItem, todayBand: Bool) -> WalkCopy.BannerRole {
        if todayBand { return s.step == 5 && item.mine ? .firstThingMine : .firstThing }
        guard s.step < 6, !s.ground, let level else { return .plain }
        if item.level == level { return item.mine ? .mine : .plain }
        if item.level.rawValue == level.rawValue - 1 { return s.focus[level] == item.id ? .focused : .focusable }
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
        return Entry(kind: kind, item: item, text: item.title, tag: tag, glows: glows,
                     label: WalkCopy.bannerLabel(item.title, level: lvl, tag: tag, role: role(item, todayBand: todayBand)))
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
            let hard: CGFloat? = lvl == level ? nil : L.question + reserve
            let reals = items.reversed().map { entry($0, on: lvl, kind: drawKind) }
            var banners: [L.Banner]
            if !(room || open == i) {
                banners = items.isEmpty ? [] : [stub(id, lvl, base: base, count: items.count, scale: scale, below: nil)]
            } else if lookBack && expanded {
                // Opened on Look back up: as many as fit under the flags above in this column; the top one counts the rest.
                let roof = max(L.question, framesAbove.filter { meets($0, span) }.map { $0.maxY + 4 }.max() ?? L.question)
                banners = stack(id, lvl, base: base, ghosts: [], reals: reals, ceiling: roof, hard: roof,
                                scale: scale, moreOnTop: true)
            } else if lookBack {
                // Look back up: the newest, carrying the count of the others.
                banners = stack(id, lvl, base: base, ghosts: [], reals: Array(reals.prefix(1)), ceiling: postCeiling,
                                hard: nil, scale: scale, moreOnTop: true)
                if reals.count > 1, let last = banners.indices.last { banners[last] = carrying(banners[last], more: reals.count - 1) }
            } else {
                let ghostEntries = ghostHere ? ghosts.map { text in
                    Entry(kind: .ghost, item: nil, text: text, tag: nil, glows: false,
                          label: WalkCopy.bannerLabel(text, level: lvl, tag: nil, role: .example))
                } : []
                banners = stack(id, lvl, base: base, ghosts: ghostEntries, reals: reals,
                                ceiling: postCeiling, hard: hard, scale: scale, moreOnTop: false, own: lvl == level)
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
                          opacity: Double(max(0.6, 1 - 0.09 * CGFloat(d))),
                          saturation: Double(max(0.55, 1 - 0.1 * CGFloat(d))),
                          pale: post.pale, banners: post.banners)
        }
        return (posts, risen)
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
    /// take only the room that is left; one that does not fit waits.
    ///
    /// The newest is cut to one line if it must be. On the step's own level (`own`) it
    /// is always a banner: when it and a separate stub cannot both fit, it carries the
    /// count of the others itself, sitting lower on its pole (down to its base) to keep
    /// under the ceiling. Elsewhere it may pass the ceiling only up to `hard` when it
    /// stands alone, and otherwise a stub takes its place.
    func stack(_ id: String, _ lvl: WalkLevel, base: CGPoint, ghosts: [Entry], reals: [Entry],
               ceiling: CGFloat, hard: CGFloat?, scale: CGFloat, moreOnTop: Bool, own: Bool = false) -> [L.Banner] {
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
            placed.append(banner(id: id, e, lvl, frame: CGRect(x: across.minX, y: b - h, width: across.width, height: h),
                                 lines: lines))
        }
        func naturalLines(_ e: Entry) -> Int {
            e.kind == .full || e.kind == .ghost ? WalkLayout.lines(for: e.text, width: bw) : 1
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

    /// A banner that also stands for `more` older flags: it says so, and a tap opens its post.
    func carrying(_ b: L.Banner, more: Int) -> L.Banner {
        L.Banner(id: b.id, itemId: b.itemId, level: b.level, kind: b.kind, frame: b.frame, lines: b.lines,
                        text: b.text, tag: b.tag, glows: b.glows,
                        label: b.label + ", " + WalkCopy.bannerLabel("", level: b.level, tag: nil, role: .stub(more)),
                        more: more)
    }

    func stub(_ id: String, _ lvl: WalkLevel, base: CGPoint, count: Int, scale: CGFloat, below: CGFloat?) -> L.Banner {
        let w = 26 * scale, h = 20 * scale
        let frame = slid(CGRect(x: base.x - w / 2, y: (below ?? base.y) - h, width: w, height: h))
        let e = Entry(kind: .stub(count), item: nil, text: WalkCopy.more(count), tag: nil, glows: false,
                      label: WalkCopy.bannerLabel("", level: lvl, tag: nil, role: .stub(count)))
        return banner(id: "\(id)-more", e, lvl, frame: frame, lines: 1)
    }

    func banner(id: String, _ e: Entry, _ lvl: WalkLevel, frame: CGRect, lines: Int) -> L.Banner {
        L.Banner(id: id, itemId: e.item?.id, level: lvl, kind: e.kind, frame: frame, lines: lines,
                 text: e.text, tag: e.tag, glows: e.glows, label: e.label)
    }
}
