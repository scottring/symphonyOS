import Foundation
import CoreGraphics

// MARK: - The standing layout

/// Off the ground the walk stands in ONE area ("The board as numbers", "The standing post").
/// That area's post stands on the midline, its foot at 556. From the top down it carries the
/// area's name in a pill, on steps 2 to 5 the goal above the step is about (`parent`), the
/// area's flags on the step's level in full (oldest highest, at most four), any examples, and
/// "+n more" for the flags not shown. The stack hangs from the lowest cloth's place (532) and
/// never rises above the question (282): fewer flags are shown rather than any title cut.
/// Every other area is a small wordless post at the side (`Side`).
extension WalkLayout {
    // MARK: The standing post's numbers

    /// The standing post's foot, and where its lowest cloth ends (the bare pole, 24, between them).
    static let standingFoot: CGFloat = 556, lowestCloth: CGFloat = 532
    /// Between two cloths, and between the pill and the cloth under it.
    static let clothGap: CGFloat = 4, underPill: CGFloat = 6
    /// The standing pill: 23 high on one line, 37 on two; its words plus 24 wide, at least 58.
    static let pillHeight: CGFloat = 23, pillTallHeight: CGFloat = 37, pillInset: CGFloat = 24, pillLeast: CGFloat = 58
    /// "+n more".
    static let moreSize = CGSize(width: 78, height: 22)
    /// A post with nothing on it yet: its pole stands this tall, the pill on its top.
    static let barePole: CGFloat = 36
    /// A flag of the step's level: 18 and 17 a line (F31), 14 more with a tag line. The goal above: 12 and 14 a line.
    static let flagPad: CGFloat = 18, flagLine: CGFloat = 17, tagLine: CGFloat = 14
    static let parentPad: CGFloat = 12, parentLine: CGFloat = 14
    /// The caret over the standing pill: 10 × 7, 2 above it (F34).
    static let caretSize = CGSize(width: 10, height: 7), caretGap: CGFloat = 2
    /// By estimate: a capital in the standing pill (11 pt, tracked) and one in a side pill (9.5 pt,
    /// tracked). A title's lines are counted from the face itself (`WalkLayout+Lines.swift`).
    static let pillChar: CGFloat = 8.4, sidePillChar: CGFloat = 7.3
    static let softHyphen = "\u{00AD}"

    // MARK: The side posts' numbers

    /// A side pill: 21 high, its words plus 14 wide; its pole 2.5 wide, from 4 above the pill up 60.
    static let sidePillHeight: CGFloat = 21, sidePillInset: CGFloat = 14
    static let sidePoleWidth: CGFloat = 2.5, sidePoleHeight: CGFloat = 60, sidePoleGap: CGFloat = 4
    /// The low row's pill tops, inner and outer; the high row stands `sideRowRise` above each.
    /// (86, not the board's 84: at 84 a high pill's foot is 1 point into the pole of the post below it.)
    static let sideInnerTop: CGFloat = 524, sideOuterTop: CGFloat = 506, sideRowRise: CGFloat = 86
    /// A pennant: 20 × 13, its left edge 3 right of the pole's own left edge, the first 2 under the
    /// pole's top, 14 from one to the next; at most four on a post.
    static let pennantSize = CGSize(width: 20, height: 13)
    static let pennantOut: CGFloat = 3 - sidePoleWidth / 2, pennantDrop: CGFloat = 2, pennantPitch: CGFloat = 14
    static let pennantsAtMost = 4
    /// Two pills in one row of one side keep at least this far apart: each gives way equally.
    static let sidePillsApart: CGFloat = 1

    // MARK: On a wider window (F13)

    /// How much further apart things stand on a wider window: 1 on a phone, at most 1.5.
    static func stretch(wing: CGFloat) -> CGFloat {
        min((WalkArt.stageSize.width + 2 * max(0, wing)) / WalkArt.stageSize.width, 1.5)
    }
    /// A standing flag's width (150 on a phone, up to 226.5), and the goal above's (24 less).
    static func standingWidth(wing: CGFloat) -> CGFloat { 150 + 153 * (stretch(wing: wing) - 1) }
    static func parentWidth(wing: CGFloat) -> CGFloat { standingWidth(wing: wing) - 24 }
    /// The side poles: left inner, left outer, right inner, right outer (90, 33, 300, 357 on a phone).
    static func sidePoles(wing: CGFloat) -> [CGFloat] {
        let m = stretch(wing: wing)
        return [centreX - 105 * m, centreX - 162 * m, centreX + 105 * m, centreX + 162 * m]
    }
    /// The widest a side pill is (58 on a phone).
    static func sidePill(wing: CGFloat) -> CGFloat { 58 + 57 * (stretch(wing: wing) - 1) }
    /// What everything stands between, across.
    static func edges(wing: CGFloat) -> ClosedRange<CGFloat> { (4 - max(0, wing))...(386 + max(0, wing)) }
    /// The reading column (the paper, the ending sheet): the board, and up to 170 wider, about the midline.
    static func column(wing: CGFloat) -> ClosedRange<CGFloat> {
        let width = WalkArt.stageSize.width + min(2 * max(0, wing), 170)
        return (centreX - width / 2)...(centreX + width / 2)
    }

    // MARK: Words

    /// An area's name as its pill draws it: in capitals, wrapped at its spaces where a line holds
    /// `width` by the estimate of 8.4 points a capital, on at most two lines; what does not fit
    /// on the second is cut with an ellipsis. A single word longer than a line stays whole on its own.
    static func pillLines(for name: String, width: CGFloat) -> [String] {
        let perLine = max(1, Int(floor(width / pillChar)))
        var lines: [String] = []
        for word in name.uppercased().split(separator: " ").map(String.init) {
            if let last = lines.last, last.count + 1 + word.count <= perLine {
                lines[lines.count - 1] = last + " " + word
            } else {
                lines.append(word)
            }
        }
        guard lines.count > 2 else { return lines.isEmpty ? [""] : lines }
        let rest = lines[1...].joined(separator: " ")
        return [lines[0], String(rest.prefix(max(1, perLine - 1))).trimmingCharacters(in: .whitespaces) + "…"]
    }

    // MARK: Roles

    /// What a tap on a flag does, as the reducer does it. `firstThing`: drawn as Today's first thing.
    static func role(_ item: WalkItem, in s: WalkState, firstThing: Bool) -> WalkCopy.BannerRole {
        if firstThing {
            guard s.step == 5 else { return .firstThing }
            // The goal above walks the round, whoever planted it; else the walk's own is chosen for Remove.
            if s.focus[.today] == item.id { return s.nextGoalAbove() != nil ? .firstThingFocused : .firstThing }
            if item.mine { return s.selected == item.id ? .firstThingChosen : .firstThingMine }
            return s.goalAboveAfterTap(on: item.id) != nil ? .firstThingFocusable : .firstThing
        }
        guard s.step < 6, !s.ground, let level = s.level else { return .plain }
        if item.level == level { return item.mine ? .mine : .plain }
        if item.level.rawValue == level.rawValue - 1, s.focus[level] == item.id {
            guard let next = s.item(s.nextGoalAbove()) else { return .focused }
            // The next one in the round is here, or (on Today) the nameless post's first thing.
            return s.column(of: next) == s.standing ? .focusedOfSeveral : .focusedThenFirstThing
        }
        return .plain
    }
}

// MARK: - The pass

/// The standing layout of one settled state: `layout()` rules it (`.level`, the board's numbers
/// exactly), then, planted by hand (`.natural`), gives every post and cloth its small fixed
/// variation. Which flags show, on how many lines, and where each side post stands never
/// depend on the hand; and the hand is given only the room the ruled layout leaves it, in one
/// pass, so it never breaks a guarantee and never needs correcting.
struct WalkStanding {
    typealias L = WalkLayout

    /// One cloth of the stack, before it has a place.
    struct Piece {
        let id: String; let who: String; let kind: L.Kind; let item: WalkItem?; let level: WalkLevel
        let text: String; let tag: String?; let glows: Bool; let label: String; let taps: Bool
        let lines: Int; let size: CGSize
    }

    let s: WalkState
    let today: Date
    let periods: WalkPeriods
    let footing: WalkFooting
    let wing: CGFloat
    /// A standing flag's width on this stage.
    let width: CGFloat
    let postId: String

    init(_ s: WalkState, today: Date, periods: WalkPeriods, footing: WalkFooting, wing: CGFloat) {
        self.s = s
        self.today = today
        self.periods = periods
        self.footing = footing
        self.wing = wing
        width = L.standingWidth(wing: wing)
        postId = "\(s.level?.rawValue ?? s.step)-\(s.standing?.uuidString ?? "unlabeled")"
    }

    func layout() -> (label: L.Label?, post: L.Post?, sides: [L.Side]) {
        let sides = self.sides()
        // Look back up arrives with its own cloths (Task 8); until then the area's name and the side posts.
        guard let level = s.level else {
            return (s.area(s.standing).map { label($0, top: L.lookBackPill, dx: 0, caret: true) }, nil, sides)
        }
        let pieces = self.pieces(level)
        let area = s.area(s.standing)
        let pill = area.map(pillSize)

        // Ruled: the cloths hang from the lowest cloth's place, the pill 6 above the top one; a
        // post with nothing on it is a short pole with the pill on its top.
        var frames: [CGRect] = []
        var y = L.lowestCloth
        for piece in pieces.reversed() {
            frames.insert(CGRect(x: L.centreX - piece.size.width / 2, y: y - piece.size.height,
                                 width: piece.size.width, height: piece.size.height), at: 0)
            y -= piece.size.height + L.clothGap
        }
        let clothsTop = frames.first?.minY ?? L.standingFoot - L.barePole
        let pillTop = pill.map { clothsTop - (frames.isEmpty ? 0 : L.underPill) - $0.height }
        // The caret stands over the pill only where it is clear of the question; the stack is never
        // made shorter for it (F34). Ruled, so the hand does not decide it: the hand keeps under it.
        let caret = pillTop.map { $0 - L.caretGap - L.caretSize.height >= L.question } ?? false

        let hand = self.hand(frames: frames, who: pieces.map(\.who), pillTop: pillTop, pill: pill, caret: caret, sides: sides)
        let base = CGPoint(x: L.centreX, y: L.standingFoot)
        let banners = zip(pieces, frames).enumerated().map { i, pair -> L.Banner in
            let (piece, ruled) = pair
            var b = L.Banner(id: piece.id, itemId: piece.item?.id, level: piece.level, kind: piece.kind,
                             frame: ruled.offsetBy(dx: 0, dy: -hand.lift), lines: piece.lines, text: piece.text,
                             tag: piece.tag, glows: piece.glows, label: piece.label, taps: piece.taps)
            b.tilt = hand.tilts[i]
            b.shift = hand.shifts[i]
            // The cloth goes with its leaning pole, sits its shift off it, and turns about where it meets it.
            let p0 = CGPoint(x: base.x, y: b.frame.minY)
            let on = WalkTurn.turned(p0, degrees: hand.lean, about: base)
            let r = CGFloat(hand.lean * .pi / 180)
            b.pivot = CGPoint(x: on.x + b.shift * cos(r), y: on.y + b.shift * sin(r))
            b.frame = b.frame.offsetBy(dx: b.pivot.x - p0.x, dy: b.pivot.y - p0.y)
            b.turn = hand.lean + b.tilt
            return b
        }
        let top = (banners.first?.frame.minY ?? clothsTop - hand.lift)
        var post = L.Post(id: postId, key: WalkPostKey(level: level, column: s.standing), base: base, top: top,
                          pale: !pieces.isEmpty && pieces.allSatisfy { $0.kind == .ghost }, banners: banners)
        post.lean = hand.lean
        post.pole = (frames.isEmpty ? L.barePole : L.pole) + hand.lift
        var name: L.Label?
        if let area, let pillTop {
            // The pill rides the pole's line, at its own height.
            let high = L.standingFoot - (pillTop - hand.lift)
            name = label(area, top: pillTop - hand.lift, dx: high * CGFloat(sin(hand.lean * .pi / 180)), caret: caret)
        }
        return (name, post, sides)
    }

    // MARK: The area's name

    func pillSize(_ area: WalkArea) -> (lines: Int, width: CGFloat, height: CGFloat) {
        let lines = pillWords(area)
        let widest = CGFloat(lines.map(\.count).max() ?? 0)
        return (lines.count, min(width, max(L.pillLeast, ceil(widest * L.pillChar + L.pillInset))),
                lines.count > 1 ? L.pillTallHeight : L.pillHeight)
    }

    /// The area's name as the standing pill draws it, a line each.
    func pillWords(_ area: WalkArea) -> [String] { L.pillLines(for: area.name, width: width - L.pillInset) }

    func label(_ area: WalkArea, top: CGFloat, dx: CGFloat, caret: Bool) -> L.Label {
        let pill = pillSize(area)
        let mark = CGRect(x: L.centreX + dx - L.caretSize.width / 2, y: top - L.caretGap - L.caretSize.height,
                          width: L.caretSize.width, height: L.caretSize.height)
        return L.Label(id: area.id, name: area.name,
                       frame: CGRect(x: L.centreX - pill.width / 2 + dx, y: top, width: pill.width, height: pill.height),
                       kept: true, focused: true, opacity: 1, tappable: false, hint: WalkCopy.areaHint(s, area.id),
                       standing: true, lines: pill.lines, caret: caret ? mark : nil, words: pillWords(area))
    }

    // MARK: Which cloths

    /// The goal above the step is about, where it is drawn as the `parent` flag: on steps 2 to 5,
    /// standing here. On Today a first thing that is itself the goal above is drawn once, as the
    /// first thing.
    func parent(_ level: WalkLevel) -> WalkItem? {
        guard level != .year, let item = s.item(s.focus[level]), item.level.rawValue == level.rawValue - 1,
              s.column(of: item) == s.standing, !(level == .today && item.id == s.firstThing) else { return nil }
        return item
    }

    /// The standing area's flags on the step's level, in planting order. Today has one: the first thing.
    func flags(_ level: WalkLevel) -> [WalkItem] {
        let here = s.standing
        if level == .today { return [s.item(s.firstThing)].compactMap { $0 }.filter { s.column(of: $0) == here } }
        return s.items(on: level).filter { s.column(of: $0) == here }
    }

    /// The stack's cloths, top to bottom: the goal above, the flags shown (oldest highest), the
    /// examples, "+n more".
    ///
    /// How many flags: the newest n, n the largest of 4, 3, 2, 1 for which every shown title stands
    /// in full (up to three lines) and the whole stack, with "+k more" when k are not shown, fits
    /// between the question and the lowest cloth's place. The goal above gives up lines before a
    /// flag is dropped (F31): it keeps its three only while that costs no flag, else two, else one
    /// (the question already quotes it whole). If not even one flag fits in full, one is shown cut
    /// to the lines that fit. A chosen flag is always among those shown: it takes the oldest shown
    /// one's place.
    ///
    /// Examples, while on (F36): `e` examples, from `min(examples, max(2, 4 − flags))`, with the newest
    /// `min(flags, 4 − e)` of the person's flags. A person's own goals outrank examples: where that
    /// does not fit, the examples give way first, down to one (the person's flags counted again for
    /// each `e`); only then the person's flags, down to one. So an example always shows, and never at
    /// the cost of the person's last flag: if one flag and one example do not fit in full, the flag
    /// is cut to the lines that fit.
    func pieces(_ level: WalkLevel) -> [Piece] {
        let goal = parent(level)
        let goalLines = goal.map { L.lines(for: $0.title, width: L.parentWidth(wing: wing), face: .parent) } ?? 0
        let flags = self.flags(level)
        let ghosts = s.examplesOn.contains(s.step) ? s.examplesLeft(today: today).map { ghostPiece($0, level) } : []
        let pill = s.area(s.standing).map(pillSize)?.height
        let room = L.lowestCloth - L.question

        func stack(_ above: Int, _ own: [Piece], _ examples: [Piece]) -> [Piece] {
            let hidden = flags.count - own.count
            return (goal.map { [parentPiece($0, lines: above)] } ?? []) + own + examples
                + (hidden > 0 ? [morePiece(hidden, level)] : [])
        }
        func fits(_ cloths: [Piece]) -> Bool {
            let high = cloths.reduce(0) { $0 + $1.size.height } + L.clothGap * CGFloat(max(0, cloths.count - 1))
            return (pill.map { $0 + (cloths.isEmpty ? 0 : L.underPill) } ?? 0) + high <= room + 0.01
        }
        /// These flags and examples with the goal above on the most lines that fit; nil if not even one does.
        func fitted(_ own: [Piece], _ examples: [Piece]) -> [Piece]? {
            for above in stride(from: goalLines, through: min(1, goalLines), by: -1) {
                let cloths = stack(above, own, examples)
                if fits(cloths) { return cloths }
            }
            return nil
        }
        let chosen = flags.first { $0.id == s.selected }
        /// The newest `n`, the chosen one in the oldest's place when it would not show.
        func shown(_ n: Int) -> [WalkItem] {
            var out = Array(flags.suffix(n))
            if let chosen, !out.isEmpty, !out.contains(chosen) { out[0] = chosen }
            return out
        }
        func own(_ n: Int) -> [Piece] { shown(n).map { flagPiece($0, level, lines: nil) } }
        /// One flag, cut to the most lines that fit beside these examples.
        func cut(_ examples: [Piece]) -> [Piece]? {
            guard let one = shown(1).first else { return nil }
            for lines in stride(from: flagPiece(one, level, lines: nil).lines - 1, to: 0, by: -1) {
                if let cloths = fitted([flagPiece(one, level, lines: lines)], examples) { return cloths }
            }
            return stack(min(1, goalLines), [flagPiece(one, level, lines: 1)], examples)
        }

        if !ghosts.isEmpty {
            for e in stride(from: min(ghosts.count, max(2, 4 - flags.count)), to: 0, by: -1) {
                if let cloths = fitted(own(min(flags.count, 4 - e)), Array(ghosts.prefix(e))) { return cloths }
            }
            // One example left: now the person's flags give way, down to one.
            for n in stride(from: min(flags.count, 3) - 1, through: min(1, flags.count), by: -1) {
                if let cloths = fitted(own(n), [ghosts[0]]) { return cloths }
            }
            return cut([ghosts[0]]) ?? stack(min(1, goalLines), [], [ghosts[0]])
        }
        for n in stride(from: min(4, flags.count), to: 0, by: -1) {
            if let cloths = fitted(own(n), []) { return cloths }
        }
        return cut([]) ?? stack(goalLines, [], [])
    }

    /// The goal above, on `lines` lines (its own count, or fewer where it gives way to a flag).
    func parentPiece(_ item: WalkItem, lines: Int) -> Piece {
        let across = L.parentWidth(wing: wing)
        let role = L.role(item, in: s, firstThing: false)
        return Piece(id: "\(postId)-above-\(item.id.uuidString)", who: item.id.uuidString, kind: .parent, item: item,
                     level: item.level, text: L.drawnTitle(item.title, width: across, face: .parent), tag: nil, glows: false,
                     label: WalkCopy.bannerLabel(item.title, level: item.level, tag: nil, role: role), taps: role.taps,
                     lines: lines, size: CGSize(width: across, height: L.parentPad + L.parentLine * CGFloat(lines)))
    }

    /// A flag of the step's level (on Today the first thing, tagged). `lines`: cut to these; nil, in full.
    func flagPiece(_ item: WalkItem, _ level: WalkLevel, lines: Int?) -> Piece {
        let first = level == .today
        let tag: String? = first ? WalkCopy.firstThingTag
            : (level == .week ? item.day.map { WalkWords.tag(for: $0, today: today) } : nil)
        let role = L.role(item, in: s, firstThing: first)
        let lines = lines ?? L.lines(for: item.title, width: width)
        // A chosen flag glows, and so does a first thing that is the goal above.
        let glows = s.selected == item.id || (first && s.focus[.today] == item.id)
        return Piece(id: "\(postId)-\(item.id.uuidString)", who: item.id.uuidString, kind: .full, item: item, level: level,
                     text: L.drawnTitle(item.title, width: width), tag: tag, glows: glows,
                     label: WalkCopy.bannerLabel(item.title, level: level, tag: tag, role: role), taps: role.taps,
                     lines: lines, size: flagSize(lines: lines, tagged: tag != nil))
    }

    func ghostPiece(_ text: String, _ level: WalkLevel) -> Piece {
        let lines = L.lines(for: text, width: width)
        return Piece(id: "\(postId)-example-\(text)", who: "example:\(text)", kind: .ghost, item: nil, level: level,
                     text: L.drawnTitle(text, width: width), tag: L.exampleTag(forWidth: width), glows: false,
                     label: WalkCopy.bannerLabel(text, level: level, tag: nil, role: .example), taps: true,
                     lines: lines, size: flagSize(lines: lines, tagged: true))
    }

    func morePiece(_ hidden: Int, _ level: WalkLevel) -> Piece {
        Piece(id: "\(postId)-more", who: "\(postId)-more", kind: .more(hidden), item: nil, level: level == .today ? .week : level,
              text: WalkCopy.more(hidden), tag: nil, glows: false, label: WalkCopy.moreLabel(hidden), taps: false,
              lines: 1, size: L.moreSize)
    }

    func flagSize(lines: Int, tagged: Bool) -> CGSize {
        CGSize(width: width, height: L.flagPad + L.flagLine * CGFloat(lines) + (tagged ? L.tagLine : 0))
    }

    // MARK: The side posts

    /// Which other areas stand at the side (F4): those the walk can stand in from here
    /// (`WalkState.walksThere`): on Year and on Look back up every other kept area; on steps 2 to
    /// 5 an area with a flag on this level or a goal above it. On a walk down only the walked
    /// goal's line is on the mountain: an area off it has no post (F35). So every named post drawn
    /// can be walked to. Then the nameless post (F12), while the walk stands in a named area and
    /// loose flags stand on this level or the one above.
    ///
    /// Areas before the standing one in ridge order go left, nearest first; those after go right,
    /// the nameless post last; a side that is full (four) spills to the other. On a side the slots
    /// fill inner low, outer low, inner high, outer high.
    func sides() -> [L.Side] {
        let kept = s.keptAreas
        let at = kept.firstIndex { $0.id == s.standing } ?? kept.count
        let walkable = { (area: WalkArea) in self.s.walksThere(area.id) }
        var left = kept[..<at].reversed().filter(walkable).map { Optional($0) }
        var right = kept.dropFirst(at + 1).filter(walkable).map { Optional($0) }
        if left.count > 4 { right += left[4...]; left = Array(left.prefix(4)) }
        if right.count > 4 { left += right[4...]; right = Array(right.prefix(4)) }
        if s.standing != nil, !loose(drawn: true).isEmpty {
            if right.count < 4 { right.append(nil) } else { left.append(nil) }
        }

        let poles = L.sidePoles(wing: wing)
        var ruled: [(side: L.Side, slot: Int, onLeft: Bool)] = []
        for (areas, onLeft) in [(left, true), (right, false)] {
            for (slot, area) in areas.prefix(4).enumerated() {
                let outer = slot % 2 == 1, high = slot >= 2
                let x = poles[(onLeft ? 0 : 2) + (outer ? 1 : 0)]
                let top = (outer ? L.sideOuterTop : L.sideInnerTop) - (high ? L.sideRowRise : 0)
                ruled.append((side(area, poleX: x, pillTop: top), slot, onLeft))
            }
        }
        // Two pills in one row of one side that would meet give way equally (each stays on its pole).
        for i in ruled.indices { for j in ruled.indices where j > i && ruled[i].onLeft == ruled[j].onLeft
            && ruled[i].slot / 2 == ruled[j].slot / 2 {
            guard let a = ruled[i].side.pill, let b = ruled[j].side.pill else { continue }
            let over = L.sidePillsApart - max(a.minX - b.maxX, b.minX - a.maxX)
            guard over > 0 else { continue }
            ruled[i].side = resized(ruled[i].side, pill: a.insetBy(dx: over / 2, dy: 0))
            ruled[j].side = resized(ruled[j].side, pill: b.insetBy(dx: over / 2, dy: 0))
        } }
        guard footing == .natural else { return ruled.map(\.side) }
        // The hand: the post leans a little, and stands a little off its row: lower on the low row,
        // higher on the high row, so two posts on one pole line only ever part.
        return ruled.map { entry in
            let side = entry.side
            let lean = WalkFooting.hand(side.id, "lean") * WalkFooting.sideLean
            let off = WalkFooting.sideStep * CGFloat(WalkFooting.hand(side.id, "footing") + 1) / 2 * (entry.slot >= 2 ? -1 : 1)
            let foot = side.poleFoot + off
            let sine = CGFloat(sin(lean * .pi / 180))
            /// Where the leaning pole carries what hangs on it.
            func hung(_ frame: CGRect) -> CGRect {
                let moved = frame.offsetBy(dx: 0, dy: off)
                return moved.offsetBy(dx: (foot - moved.midY) * sine, dy: 0)
            }
            return L.Side(id: side.id, area: side.area, name: side.name, pill: side.pill?.offsetBy(dx: 0, dy: off),
                          poleX: side.poleX, poleTop: side.poleTop + off, poleFoot: foot,
                          pennants: side.pennants.map { L.Pennant(frame: hung($0.frame), level: $0.level) },
                          extra: side.extra, count: side.count, label: side.label, lean: lean,
                          extraFrame: side.extraFrame.map(hung))
        }
    }

    func resized(_ side: L.Side, pill: CGRect) -> L.Side {
        L.Side(id: side.id, area: side.area, name: side.name, pill: pill, poleX: side.poleX, poleTop: side.poleTop,
               poleFoot: side.poleFoot, pennants: side.pennants, extra: side.extra, count: side.count,
               label: side.label, lean: side.lean, extraFrame: side.extraFrame)
    }

    /// The flags with no kept area. `drawn`: only those that give the nameless post a reason to
    /// stand (on steps 2 to 5, this level and the one above); else those its pennants stand for.
    func loose(drawn: Bool) -> [WalkItem] {
        let all = s.items.filter { s.column(of: $0) == nil }
        guard let level = s.level else { return all }                       // Look back up: every flag
        let own: WalkLevel = level == .today ? .week : level
        return all.filter { $0.level == own || (drawn && level != .today && $0.level.rawValue == level.rawValue - 1) }
    }

    /// A side post, ruled, in its slot: the pill centred on its pole and slid inside the edges, the
    /// pole from 4 above the pill up 60, a pennant for each of its flags on the step's level
    /// (newest first; Today's are week tasks; Look back up's are all its flags); with more than
    /// four, three pennants and the fourth place for "+n" (`extraFrame`).
    func side(_ area: WalkArea?, poleX: CGFloat, pillTop: CGFloat) -> L.Side {
        let flags: [WalkItem]
        if let area {
            let here = s.items.filter { s.column(of: $0) == area.id }
            flags = s.level.map { level in here.filter { $0.level == (level == .today ? .week : level) } } ?? here
        } else {
            flags = loose(drawn: false)
        }
        let edges = L.edges(wing: wing)
        let pill = area.map { area -> CGRect in
            let across = min(L.sidePill(wing: wing), ceil(CGFloat(area.name.count) * L.sidePillChar + L.sidePillInset))
            let x = min(max(poleX - across / 2, edges.lowerBound), edges.upperBound - across)
            return CGRect(x: x, y: pillTop, width: across, height: L.sidePillHeight)
        }
        let foot = pillTop - L.sidePoleGap, top = foot - L.sidePoleHeight
        let shown = flags.count > L.pennantsAtMost ? L.pennantsAtMost - 1 : flags.count
        func place(_ i: Int) -> CGRect {
            CGRect(x: poleX + L.pennantOut, y: top + L.pennantDrop + CGFloat(i) * L.pennantPitch,
                   width: L.pennantSize.width, height: L.pennantSize.height)
        }
        let pennants = flags.reversed().prefix(shown).enumerated().map { i, flag in L.Pennant(frame: place(i), level: flag.level) }
        let name = area?.name ?? ""
        let words = s.level.map { WalkCopy.sideLabel(name: area?.name ?? WalkCopy.noArea, count: flags.count, level: $0, periods: periods) }
            ?? WalkCopy.sideLabelWholePlan(name: area?.name ?? WalkCopy.noArea, count: flags.count)
        return L.Side(id: area?.id.uuidString ?? "nameless", area: area?.id, name: name, pill: pill, poleX: poleX,
                      poleTop: top, poleFoot: foot, pennants: pennants, extra: flags.count - shown, count: flags.count,
                      label: words, lean: 0, extraFrame: flags.count > shown ? place(shown) : nil)
    }

    // MARK: The hand

    /// The standing post's hand, from the ruled stack: how far the whole stack is lifted (a longer
    /// bare pole), the pole's lean, and each cloth's tilt and shift.
    ///
    /// All of it is given only the room there is, worked out once from the ruled frames:
    /// - The lift and the turning take the room between the stack's top and the question. With
    ///   2 points or more the stack rises at least 2, which is as far as a turned cloth's corner
    ///   dips, so the lowest cloth never sinks below its place; with less, the turning shrinks with it.
    /// - A wider cloth turns less, so its corners move no further than a phone's: two cloths 4
    ///   apart never meet however each is turned.
    /// - Across, a cloth keeps only as much lean, shift and tilt as the gap to the side post
    ///   beside it allows (the board leaves 1 point beside a side pill at its widest).
    func hand(frames: [CGRect], who: [String], pillTop: CGFloat?, pill: (lines: Int, width: CGFloat, height: CGFloat)?,
              caret: Bool, sides: [L.Side]) -> (lift: CGFloat, lean: Double, tilts: [Double], shifts: [CGFloat]) {
        let none = (lift: CGFloat(0), lean: 0.0, tilts: [Double](repeating: 0, count: frames.count),
                    shifts: [CGFloat](repeating: 0, count: frames.count))
        guard footing == .natural else { return none }
        // The stack's top: the caret's where there is one, else the pill's, else the top cloth's.
        let top = (pillTop ?? frames.first?.minY ?? L.standingFoot - L.barePole)
            - (caret ? L.caretGap + L.caretSize.height : 0)
        let room = max(0, top - L.question)
        // With no pill the top cloth's own corner needs room above it too.
        let above: CGFloat = pillTop == nil && !frames.isEmpty ? WalkFooting.turnRoom : 0
        let u = CGFloat(WalkFooting.hand(postId, "pole") + 1) / 2
        let wanted = WalkFooting.standingLift.lowerBound
            + u * (WalkFooting.standingLift.upperBound - WalkFooting.standingLift.lowerBound)
        let lift: CGFloat, turning: CGFloat
        if room >= WalkFooting.turnRoom + above {
            lift = min(wanted, room - above)
            turning = 1
        } else {
            turning = room / (WalkFooting.turnRoom + above)
            lift = above == 0 ? room : room / 2
        }

        var pillFrame: CGRect?
        if let pill, let pillTop {
            pillFrame = CGRect(x: L.centreX - pill.width / 2, y: pillTop, width: pill.width, height: pill.height)
        }
        let boxes = sides.flatMap(\.boxes)
        /// The gap across from a ruled frame, once lifted, to the nearest side post beside it.
        func gap(_ frame: CGRect) -> CGFloat {
            let lo = frame.minY - lift - WalkFooting.turnRoom, hi = frame.maxY - lift + WalkFooting.turnRoom
            return boxes.filter { $0.minY < hi && lo < $0.maxY }
                .map { max($0.minX - frame.maxX, frame.minX - $0.maxX, 0) }.min() ?? .infinity
        }
        let narrow = Double(min(1, 150 / width))                 // a wider cloth turns less
        let spare: CGFloat = 0.6                                 // what stays between a cloth and a side post
        let sine = { (degrees: Double) in CGFloat(sin(degrees * .pi / 180)) }
        // The lean moves a thing by its height above the foot; it takes at most half of any gap.
        let leanMost = WalkFooting.standingLean * narrow * Double(turning)
        var leanShare: CGFloat = 1
        for frame in frames + (pillFrame.map { [$0] } ?? []) {
            let reach = (L.standingFoot - frame.minY + lift) * sine(leanMost)
            guard reach > 0 else { continue }
            leanShare = min(leanShare, max(0, (gap(frame) - spare) / 2) / reach)
        }
        let lean = WalkFooting.hand(postId, "lean") * leanMost * Double(leanShare)
        let tiltMost = WalkFooting.tilt * narrow * Double(turning)
        var tilts: [Double] = [], shifts: [CGFloat] = []
        for (i, frame) in frames.enumerated() {
            let leaned = (L.standingFoot - frame.minY + lift) * sine(abs(lean))
            let reach = WalkFooting.shift + frame.height * sine(tiltMost)
            let share = min(1, max(0, (gap(frame) - spare - leaned) / reach))
            tilts.append(WalkFooting.hand(who[i], "tilt") * tiltMost * Double(share))
            shifts.append(CGFloat(WalkFooting.hand(who[i], "shift")) * WalkFooting.shift * share)
        }
        return (lift, lean, tilts, shifts)
    }
}
