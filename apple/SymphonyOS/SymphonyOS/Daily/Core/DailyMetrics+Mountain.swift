import Foundation
import CoreGraphics

/// Where everything sits on Month, Season and Year ("The pages' paper foot", F16): a paper foot at the
/// window's foot with the strip that raises the paper and the add bar under it; the hint over the foot;
/// the mountain drawn on the room between the heading and the hint (`WalkStage(page:field:)`); the chosen
/// flag's panel, clear of that flag; and the raised paper. Every frame is in the page's own space. The bar
/// is Today's on the same window, so it stands where it does on every other page.
extension DailyMetrics {
    // MARK: The paper foot

    /// The strip: 78 high (grabber, "Read the whole year", its count), one line 44 high on a window
    /// shorter than `mountainOneLine`; it ends `mountainStripGap` over the field (the board's 734 over 754).
    static let mountainStrip: CGFloat = 78, mountainStripLine: CGFloat = 44, mountainStripGap: CGFloat = 20
    static let mountainOneLine: CGFloat = 700
    /// The hint's top stands this far over the foot; the bar's line slot takes its place (`Bar.line` 4 under it).
    static let mountainHintAbove: CGFloat = 38, mountainHintLine: CGFloat = 4
    /// The heading's foot under the row of words' top: the top of the room the mountain is drawn for,
    /// which ends this far over the hint.
    static let mountainHeadingFoot: CGFloat = 144, mountainFieldAboveHint: CGFloat = 4
    /// The raised paper's top under the row of words' top (the walk's 116 on the phone board).
    static let paperBelowWords: CGFloat = 72

    /// The paper foot on a window: `foot` from the strip's top (or, with no strip, 20 over the field)
    /// to the window's foot; `strip` nil when the page has no goals on its level; the bar, Today's on
    /// this window, its line slot moved up into the hint's place; the hint's top; the raised paper's top;
    /// and the stage the mountain is drawn on.
    static func mountainFoot(size: CGSize, safeTop: CGFloat, safeBottom: CGFloat, layout: TodayLayout, strip: Bool)
        -> (foot: CGRect, strip: CGRect?, oneLine: Bool, bar: Bar, hintTop: CGFloat, paperTop: CGFloat, stage: WalkStage) {
        let pageShape = shape(for: layout, height: size.height, safeTop: safeTop, safeBottom: safeBottom, waiting: false)
        let today = Self.today(size: size, safeTop: safeTop, safeBottom: safeBottom, shape: pageShape).bar
        let oneLine = size.height < mountainOneLine
        let high = strip ? (oneLine ? mountainStripLine : mountainStrip) : 0
        let top = today.field.minY - mountainStripGap - high
        let hintTop = top - mountainHintAbove
        let bar = Bar(field: today.field, speaking: today.speaking, light: today.light, more: today.more, inbox: today.inbox,
                      line: hintTop + mountainHintLine, fade: today.fade)
        let headingFoot = safeTop + mountainHeadingFoot
        let stage = WalkStage(page: size, field: headingFoot...max(headingFoot, hintTop - mountainFieldAboveHint))
        return (CGRect(x: 0, y: top, width: size.width, height: max(0, size.height - top)),
                strip ? CGRect(x: 0, y: top, width: size.width, height: high) : nil,
                oneLine, bar, hintTop, safeTop + paperBelowWords, stage)
    }

    /// While the page's paper is raised the bar's line slot stands just over the field again, as Today's
    /// does (the board's 30 over it), on the paper; and the list scrolls above that slot.
    static func mountainRaisedBar(_ bar: Bar) -> (bar: Bar, listFoot: CGFloat) {
        let line = bar.field.minY - mountainRaisedLine
        return (Bar(field: bar.field, speaking: bar.speaking, light: bar.light, more: bar.more, inbox: bar.inbox,
                    line: line, fade: bar.fade), line - 18)
    }
    static let mountainRaisedLine: CGFloat = 30

    // MARK: The raised paper

    /// The paper raised over a page (`PlanPaperView`): its reading column across (the stage's
    /// `WalkLayout.column`, on the page), its top, a row's least height (44 real points or more) and
    /// how far its words stand in from the column's edges. The whole plan behind Today's and Week's
    /// lowered sheet and the Month, Season and Year pages raise it the same way.
    struct RaisedPaper: Equatable {
        let column: ClosedRange<CGFloat>
        let top: CGFloat
        let touch: CGFloat
        let inset: CGFloat
    }

    static func raisedPaper(size: CGSize, navTop: CGFloat, stage: WalkStage) -> RaisedPaper {
        let column = WalkLayout.column(wing: stage.wing)
        let left = max(0, stage.toDevice(CGPoint(x: column.lowerBound, y: 0)).x)
        let right = max(left, min(size.width, stage.toDevice(CGPoint(x: column.upperBound, y: 0)).x))
        return RaisedPaper(column: left...right, top: navTop + paperBelowWords,
                           touch: max(minTouch, stage.touch * stage.scale),
                           inset: WalkLayout.paperInset * min(1, stage.scale))
    }

    // MARK: The chosen flag's panel

    /// The panel stands `mountainPanelInset` in from each side (the board's (20, 590) 350 wide), its foot
    /// `mountainPanelAbove` over the bar's line; beside the standing cloths where that leaves
    /// `mountainPanelBeside` across; clear of the chosen cloth and of the row of words by `mountainPanelClear`.
    static let mountainPanelInset: CGFloat = 20
    static let mountainPanelAbove: CGFloat = 51
    static let mountainPanelBeside: CGFloat = 240, mountainPanelBesideGap: CGFloat = 16
    static let mountainPanelClear: CGFloat = 8
    /// What the panel's words stand in from its sides (12 each), and its estimates: a title's capital and
    /// a chip's letter, a chip's padding, and the gap between chips.
    static let mountainPanelPadding: CGFloat = 24
    static let mountainPanelTitleChar: CGFloat = 8, mountainPanelChipChar: CGFloat = 7.5
    static let mountainPanelChipPad: CGFloat = 26, mountainPanelChipGap: CGFloat = 6

    /// The panel's height: 18 of padding, 20 a title line, 19 for its line, 4, and 44 a row of chips.
    static func mountainPanelHeight(titleLines: Int, hasLine: Bool, chipRows: Int) -> CGFloat {
        18 + 20 * CGFloat(titleLines) + (hasLine ? 19 : 0) + 4 + 44 * CGFloat(chipRows)
    }

    /// Where the chosen flag's panel stands (S23). Bottom-anchored; if that box meets `chosen` (the
    /// chosen cloth, in page points), its foot stands 8 over the cloth instead, while its top stays 8
    /// under the row of words' foot; if neither fits, bottom-anchored with its line dropped (`dropsLine`).
    /// Its height is its estimate (`mountainPanelHeight`, lines and rows counted by estimate), its chips
    /// on one row unless they wrap (`wraps`: beside the cloths, or while Move to is open: S46).
    static func mountainPanel(size: CGSize, line: CGFloat, navTop: CGFloat, stage: WalkStage, chosen: CGRect?,
                              title: String, hasLine: Bool, chips: [String], moving: Bool)
        -> (frame: CGRect, beside: Bool, wraps: Bool, dropsLine: Bool) {
        let cloths = stage.toDevice(CGPoint(x: WalkLayout.centreX + WalkLayout.standingWidth(wing: stage.wing) / 2, y: 0)).x
        let left = cloths + mountainPanelBesideGap
        let beside = size.width - mountainPanelInset - left >= mountainPanelBeside
        let x = beside ? left : mountainPanelInset
        let width = size.width - mountainPanelInset - x
        let words = width - mountainPanelPadding
        let wraps = beside || moving
        func height(line: Bool) -> CGFloat {
            mountainPanelHeight(titleLines: estimatedLines(title, perChar: mountainPanelTitleChar, width: words), hasLine: line,
                                chipRows: wraps ? chipRows(chips, width: words) : 1)
        }
        let foot = line - mountainPanelAbove
        let tall = height(line: hasLine)
        let anchored = CGRect(x: x, y: foot - tall, width: width, height: tall)
        guard let chosen, anchored.intersects(chosen) else { return (anchored, beside, wraps, false) }
        let raised = anchored.offsetBy(dx: 0, dy: chosen.minY - mountainPanelClear - anchored.maxY)
        if raised.minY >= navTop + navHeight + mountainPanelClear { return (raised, beside, wraps, false) }
        let short = height(line: false)
        return (CGRect(x: x, y: foot - short, width: width, height: short), beside, wraps, true)
    }

    /// Lines by estimate: words set greedily at `perChar` points a character in `width`, a word longer
    /// than a line on lines of its own. At least one.
    static func estimatedLines(_ text: String, perChar: CGFloat, width: CGFloat) -> Int {
        let perLine = max(1, Int(floor(width / perChar)))
        var lines = 0, used = 0
        for word in text.split(whereSeparator: \.isWhitespace) {
            let n = word.count
            if used > 0, used + 1 + n <= perLine {
                used += 1 + n
            } else if n > perLine {
                lines += (n + perLine - 1) / perLine
                used = n - (n - 1) / perLine * perLine
            } else {
                lines += 1
                used = n
            }
        }
        return max(1, lines)
    }

    /// Rows of chips by estimate: each `mountainPanelChipChar` a letter plus `mountainPanelChipPad` (at
    /// least a touch wide), `mountainPanelChipGap` apart, flowing in `width`. At least one.
    static func chipRows(_ chips: [String], width: CGFloat) -> Int {
        var rows = 0, used: CGFloat = 0
        for chip in chips {
            let w = max(minTouch, CGFloat(chip.count) * mountainPanelChipChar + mountainPanelChipPad)
            if rows > 0, used + mountainPanelChipGap + w <= width {
                used += mountainPanelChipGap + w
            } else {
                rows += 1
                used = w
            }
        }
        return max(1, rows)
    }
}
