import Foundation
import CoreGraphics

// MARK: - The controls

/// The top row (Back, More, Leave for now), Next at the foot, the hint, the Undo pill and the Move
/// row above the light, the compass points' words and the lines that teach the light, in stage
/// points ("The board as numbers"). They are placed from the board alone, never from the flags.
/// Only Back and Leave for now read a wider window's wing (F13); everything else is centred on x 195.
extension WalkLayout {
    /// The dial's ring around the light (contract §7: 132 across).
    static let ring: CGFloat = 66
    /// The home-indicator zone at the foot of the stage: the bottom safe-area inset of a phone
    /// with a home indicator, kept clear of every control and every point's words.
    static let homeIndicator: CGFloat = 34
    /// Welcome's line under the light (the quick start): a 44-point tap target directly under the ring.
    static let nextHeight: CGFloat = 44
    /// One line of the 15-point hint (DM Sans: 1.3 × 15).
    static let hintLineHeight: CGFloat = 19.5
    /// The hint's width (the stage less 10 on each side) and, by estimate, the characters that fit on one line.
    static let hintWidth: CGFloat = 370
    static let hintCharsPerLine = 48

    /// How many lines the hint takes: an estimate, so the core needs no fonts (the view allows the same).
    static func hintLines(_ text: String) -> Int {
        min(3, max(1, Int((Double(text.count) / Double(hintCharsPerLine)).rounded(.up))))
    }

    // MARK: The top row

    /// The row's top and height; Back from x 8, 76 wide; More centred, 84 wide; Leave for now
    /// ending at x 382, 124 wide. On a wider window Back and Leave for now go out by the wing.
    static let topRowY: CGFloat = 44, topRowHeight: CGFloat = 44
    static let backX: CGFloat = 8, backWidth: CGFloat = 76
    static let moreWidth: CGFloat = 84
    static let leaveEnd: CGFloat = 382, leaveWidth: CGFloat = 124

    static func backFrame(_ s: WalkState, wing: CGFloat = 0) -> CGRect? {
        guard s.showsTopRow else { return nil }
        return CGRect(x: backX - wing, y: topRowY, width: backWidth, height: topRowHeight)
    }

    static func moreFrame(_ s: WalkState) -> CGRect? {
        guard s.showsMore else { return nil }
        return CGRect(x: centreX - moreWidth / 2, y: topRowY, width: moreWidth, height: topRowHeight)
    }

    static func leaveFrame(_ s: WalkState, wing: CGFloat = 0) -> CGRect? {
        guard s.showsTopRow else { return nil }
        return CGRect(x: leaveEnd + wing - leaveWidth, y: topRowY, width: leaveWidth, height: topRowHeight)
    }

    // MARK: The foot

    /// Next on steps 1 to 5: the gold button, 280 wide (its words plus 56 fit inside), 50 high, top 750.
    static let nextTop: CGFloat = 750, nextFootWidth: CGFloat = 280, nextFootHeight: CGFloat = 50

    /// Welcome's line (the quick start and what it is) is wider: its second line is a sentence.
    static let welcomeLineWidth: CGFloat = 300

    static func nextFrame(_ s: WalkState) -> CGRect? {
        guard s.showsNextLine else { return nil }
        if s.step == 0 {
            return CGRect(x: WalkOrb.centre.x - welcomeLineWidth / 2, y: WalkOrb.centre.y + ring + 2,
                          width: welcomeLineWidth, height: nextHeight)
        }
        return CGRect(x: centreX - nextFootWidth / 2, y: nextTop, width: nextFootWidth, height: nextFootHeight)
    }

    /// Next is drawn as Welcome's glowing line under the light (F8), not the gold button at the foot.
    static func nextIsWelcomeLine(_ s: WalkState) -> Bool { s.step == 0 }

    /// The foot's shade, from y 560 down, under the controls on every step but Welcome: there it would
    /// darken the approved first screen over its veil (F8).
    static let footShadeStart: CGFloat = 560
    static func footShadeTop(_ s: WalkState) -> CGFloat? { s.step == 0 ? nil : footShadeStart }

    // MARK: Above the light, at rest

    /// The hint's top at rest (above the light), at the foot while the light is busy, and while typing.
    static let restHintTop: CGFloat = 572, footHintTop: CGFloat = 766, typingHintTop: CGFloat = 724
    /// Welcome's hint, under its line.
    static let welcomeHintTop: CGFloat = 790.5

    /// One line. At rest above the light; while the light is open, held, speaking or finishing at the
    /// foot, where Next is not drawn; while typing (a note) just above the field; on Welcome under its
    /// line. Not drawn while the Undo pill or the Move row stands in its place.
    static func hintFrame(_ s: WalkState) -> CGRect? {
        let text = WalkCopy.hint(s)
        guard !text.isEmpty else { return nil }
        let top: CGFloat
        if s.step == 0 {
            top = welcomeHintTop
        } else if s.typing != nil {
            top = typingHintTop
        } else if s.orb != .idle {
            top = footHintTop
        } else {
            guard undoFrame(s) == nil, moveRowFrame(s) == nil else { return nil }
            top = restHintTop
        }
        return CGRect(x: centreX - hintWidth / 2, y: top, width: hintWidth, height: CGFloat(hintLines(text)) * hintLineHeight)
    }

    /// The quiet Undo pill, centred above the light where the hint was, while it shows at rest; a note
    /// (the hint) is drawn instead, a chosen flag's Move row takes its place, and it is not drawn under
    /// the keyboard while typing.
    static let undoPillFrame = CGRect(x: 152, y: 564, width: 86, height: 36)
    static func undoFrame(_ s: WalkState) -> CGRect? {
        guard (1...5).contains(s.step), s.showsUndoPill, s.orb == .idle, s.note == nil, s.selected == nil,
              s.typing == nil else { return nil }
        return undoPillFrame
    }

    /// F11: while a flag is chosen, its Move to / Remove row, above the light where the hint was.
    static let moveRowRect = CGRect(x: 10, y: 558, width: 370, height: 38)
    static func moveRowFrame(_ s: WalkState) -> CGRect? {
        guard s.selected != nil, s.orb == .idle, s.typing == nil else { return nil }
        return moveRowRect
    }

    /// Inside the Move row (F24): "Move to" and the kept areas' chips at its left (scrolling sideways
    /// when they overflow), Remove alone at its right, never scrolled. With no other kept area there are
    /// no chips. On Today there is nowhere to move: no chips, and Remove stands alone in the middle.
    static let moveChipsRect = CGRect(x: 10, y: 558, width: 272, height: 38)
    static let removeRect = CGRect(x: 290, y: 558, width: 90, height: 38)
    static let removeAloneRect = CGRect(x: 150, y: 558, width: 90, height: 38)

    static func moveChipsFrame(_ s: WalkState) -> CGRect? {
        guard moveRowFrame(s) != nil, s.level != .today, !s.moveTargets.isEmpty else { return nil }
        return moveChipsRect
    }

    static func removeFrame(_ s: WalkState) -> CGRect? {
        guard moveRowFrame(s) != nil else { return nil }
        return s.level == .today ? removeAloneRect : removeRect
    }

    // MARK: The typing field (F22)

    /// With the keyboard down (all rise by the keyboard's lift): the field across the foot, the X at its
    /// left (closes it, plants nothing), the words between, and Add at its right (plants). A note while
    /// typing is the hint, one line just above the field.
    static let typeFieldRect = CGRect(x: 10, y: 750, width: 370, height: 44)
    static let typeCloseRect = CGRect(x: 10, y: 750, width: 44, height: 44)
    static let typeWordsRect = CGRect(x: 58, y: 750, width: 254, height: 44)
    static let typeAddRect = CGRect(x: 316, y: 750, width: 64, height: 44)

    static func typeFieldFrame(_ s: WalkState) -> CGRect? { typing(s) ? typeFieldRect : nil }
    static func typeCloseFrame(_ s: WalkState) -> CGRect? { typing(s) ? typeCloseRect : nil }
    static func typeWordsFrame(_ s: WalkState) -> CGRect? { typing(s) ? typeWordsRect : nil }
    static func typeAddFrame(_ s: WalkState) -> CGRect? { typing(s) ? typeAddRect : nil }

    private static func typing(_ s: WalkState) -> Bool { (1...5).contains(s.step) && s.typing != nil }

    // MARK: The lines that teach the light

    /// Where the lines that teach the light stand: above the ring, across the stage, on the veil.
    static let teachHeight: CGFloat = 104
    static func teachFrame(_ s: WalkState) -> CGRect? {
        guard s.teaching else { return nil }
        return CGRect(x: 10, y: WalkOrb.centre.y - ring - 8 - teachHeight, width: 370, height: teachHeight)
    }

    // MARK: The compass points' words

    /// One line of a point's words: its label (12 pt) or its second line (13 pt), and where it stands.
    struct PointLine: Equatable { let text: String; let detail: Bool; let frame: CGRect }

    /// Character widths by estimate (measured near 6.1 for both faces, with room to spare), line
    /// heights, the gaps (disc to words, label to second line), the widest a label or second line
    /// wraps at, and the stage margin the words keep.
    static let labelChar: CGFloat = 6.4, detailChar: CGFloat = 6.4
    static let labelLine: CGFloat = 16, detailLine: CGFloat = 17
    static let wordsGap: CGFloat = 4, detailGap: CGFloat = 2
    static let labelWidth: CGFloat = 132, detailWidth: CGFloat = 152, wordsMargin: CGFloat = 12

    /// Greedy wrapping by words at `width`, by the character estimate.
    static func wrap(_ text: String, width: CGFloat, char: CGFloat) -> [String] {
        var lines: [String] = []
        var line = ""
        for word in text.split(separator: " ").map(String.init) {
            let candidate = line.isEmpty ? word : line + " " + word
            if line.isEmpty || CGFloat(candidate.count) * char + 4 <= width {
                line = candidate
            } else {
                lines.append(line)
                line = word
            }
        }
        if !line.isEmpty { lines.append(line) }
        return lines
    }

    /// Where a point's words stand, line by line: above its disc for Welcome's two (`WalkOrb.wordsAbove`),
    /// under it for the rest. The words are centred on
    /// their disc, inside the stage's margin, and move outward, away from the light, until no
    /// line meets the ring or another offered point's disc (`among`); pressed against the margin,
    /// the lines read from it. Each line is as wide as its words by estimate; the view draws exactly these lines.
    static func pointWords(_ p: WalkCopy.Point, among offered: [CompassPoint]) -> [PointLine] {
        let disc = WalkOrb.position(of: p.at)
        // The right point's words sit beside the ring's widest part: they wrap narrower.
        let labels = wrap(p.label, width: p.at == .e ? 120 : labelWidth, char: labelChar)
        let details = p.detail.map { wrap($0, width: detailWidth, char: detailChar) } ?? []
        let rows: [(text: String, detail: Bool, width: CGFloat)] =
            labels.map { ($0, false, CGFloat($0.count) * labelChar + 4) }
            + details.map { ($0, true, CGFloat($0.count) * detailChar + 4) }
        let height = CGFloat(labels.count) * labelLine + (details.isEmpty ? 0 : detailGap + CGFloat(details.count) * detailLine)
        let top = WalkOrb.wordsAbove(p.at) ? disc.y - WalkOrb.pointDisc / 2 - wordsGap - height
                                           : disc.y + WalkOrb.pointDisc / 2 + wordsGap
        let blockWidth = rows.map(\.width).max() ?? 0
        let stage = WalkArt.stageSize.width
        let lowest = wordsMargin, highest = stage - wordsMargin - blockWidth
        let outward: CGFloat = disc.x < WalkOrb.centre.x - 1 ? -1 : (disc.x > WalkOrb.centre.x + 1 ? 1 : 0)
        var discs = offered.filter { $0 != p.at }.map { at -> CGRect in
            let c = WalkOrb.position(of: at)
            return CGRect(x: c.x - WalkOrb.pointDisc / 2, y: c.y - WalkOrb.pointDisc / 2, width: WalkOrb.pointDisc, height: WalkOrb.pointDisc)
        }
        // The top point's words (one line, under its disc) are kept clear the same way.
        if p.at != .n, offered.contains(.n) {
            let n = WalkOrb.position(of: .n)
            discs.append(CGRect(x: n.x - 70, y: n.y + WalkOrb.pointDisc / 2 + wordsGap, width: 140, height: labelLine))
        }
        func lines(at x: CGFloat, pressed: Bool) -> [PointLine] {
            var y = top
            var out: [PointLine] = []
            for (i, row) in rows.enumerated() {
                if i == labels.count, !details.isEmpty { y += detailGap }
                let lineX = pressed ? (outward < 0 ? x : x + blockWidth - row.width) : x + (blockWidth - row.width) / 2
                let h = row.detail ? detailLine : labelLine
                out.append(PointLine(text: row.text, detail: row.detail, frame: CGRect(x: lineX, y: y, width: row.width, height: h)))
                y += h
            }
            return out
        }
        func clashes(_ ls: [PointLine]) -> Bool {
            ls.contains { line in
                let f = line.frame
                let c = WalkOrb.centre
                let onRing = hypot(c.x - min(max(c.x, f.minX), f.maxX), c.y - min(max(c.y, f.minY), f.maxY)) <= WalkLayout.ring + 2
                return onRing || discs.contains { $0.intersects(f) }
            }
        }
        var x = min(max(disc.x - blockWidth / 2, lowest), highest)
        var placed = lines(at: x, pressed: false)
        guard outward != 0 else { return placed }
        while clashes(placed) {
            let next = x + outward
            guard next >= lowest, next <= highest else { return lines(at: x, pressed: true) }
            x = next
            placed = lines(at: x, pressed: false)
        }
        return placed
    }
}
