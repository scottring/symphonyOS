import Foundation
import CoreGraphics

// MARK: - The ground

/// The ground draws area names only (F5): one chip an area, in ridge order across
/// `groundColumns(wing:)`, each a choice (a plus, or a checkmark once kept). No posts, no flags,
/// no side posts. With four or more the chips stand in two rows, the one nearest the midline in
/// the upper row. The rows stand above the standing post's foot (556), so no chip is under the
/// hint, the Undo pill or the spoken flag. A name too long for its chip takes two lines at the
/// same size (F20), and its row is as tall as its tallest chip.
extension WalkLayout {
    /// A chip: 30 high (its mark, 7, over a pill of 23), 44 with a second line; at most 90 wide.
    static let chipHeight: CGFloat = 30, chipTallHeight: CGFloat = 44, chipWidth: CGFloat = 90
    /// Between the two rows.
    static let chipRowGap: CGFloat = 4
    /// What a chip's words stand between: 9 either side and the mark's 12.
    static let chipInset: CGFloat = 30
    /// A lone chip stands at the midline; two or more span the columns.
    static let loneGap: CGFloat = 200

    /// The ground's columns: 195 ± 145 on a phone, wider with the window ("On a wider window").
    static func groundColumns(wing: CGFloat) -> ClosedRange<CGFloat> {
        let reach = 145 * stretch(wing: wing)
        return (centreX - reach)...(centreX + reach)
    }

    static func groundLabels(_ s: WalkState, footing: WalkFooting, wing: CGFloat) -> [Label] {
        let areas = s.areas
        let count = areas.count
        guard count > 0 else { return [] }
        let span = groundColumns(wing: wing), edges = edges(wing: wing)
        let gap = count > 1 ? (span.upperBound - span.lowerBound) / CGFloat(count - 1) : loneGap
        let xs = areas.indices.map { count > 1 ? span.lowerBound + CGFloat($0) * gap : centreX }
        let rows = count > 3
        let width = rows ? min(chipWidth, floor(2 * gap - 6)) : chipWidth
        // Where the chips stagger, the one nearest the midline stays on the upper row; equally near
        // (within 0.01 pt), the leftmost wins, so rounding never picks.
        let centre = areas.indices.min { a, b in
            let da = abs(xs[a] - centreX), db = abs(xs[b] - centreX)
            return abs(da - db) < 0.01 ? a < b : da < db
        } ?? 0
        let row = areas.indices.map { rows ? abs($0 - centre) % 2 : 0 }
        let words = areas.map { Array(pillLines(for: $0.name, width: width - chipInset).prefix(2)) }
        let lines = words.map(\.count)
        let heights = lines.map { $0 > 1 ? chipTallHeight : chipHeight }
        // Rows from the foot up: the lower row ends at the standing foot, each row as tall as its tallest chip.
        let lowest = row.max() ?? 0
        var bottom = [Int: CGFloat]()
        var foot = standingFoot
        for r in stride(from: lowest, through: 0, by: -1) {
            bottom[r] = foot
            let tallest = areas.indices.filter { row[$0] == r }.map { heights[$0] }.max() ?? chipHeight
            foot -= tallest + chipRowGap
        }
        return areas.indices.map { i in
            let area = areas[i]
            let x = min(max(xs[i] - width / 2, edges.lowerBound), edges.upperBound - width)
            // The hand: a chip stands a little higher than its row, never lower (the rows keep apart).
            let rise = footing == .natural
                ? -WalkFooting.chipRise * CGFloat(WalkFooting.hand(area.id.uuidString, "footing") + 1) / 2 : 0
            let kept = s.kept.contains(area.id)
            return Label(id: area.id, name: area.name,
                         frame: CGRect(x: x, y: bottom[row[i]]! - heights[i] + rise, width: width, height: heights[i]),
                         kept: kept, focused: false, opacity: 1, tappable: true, hint: WalkCopy.areaHint(s, area.id),
                         selected: kept, footing: rise, ground: true, lines: lines[i], words: words[i])
        }
    }
}
