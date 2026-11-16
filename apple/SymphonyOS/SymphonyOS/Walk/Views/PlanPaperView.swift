#if os(iOS)
import SwiftUI

/// The paper ("The board as numbers", "The paper"): a sheet that rises over the mountain and reads a
/// whole level as a plain list by area. It draws the `PlanPaper` it is given and hands taps back:
/// a row to `onRow`, "Show the mountain" (the sheet's first `touch` points) and the Escape gesture
/// to `onClose`. It decides nothing, so the walk, Look back up and the pages can each show it.
///
/// Unlike the words on the walk's stage, the paper's words follow the person's text size: titles
/// wrap and are never cut, rows grow, and the list scrolls. It is laid out in its container's own
/// points: the sheet runs across the whole container from `top` down; its heading, count and rows
/// stand in `column`, `inset` in from its left and right; each row is at least `touch` high.
/// To VoiceOver it is a modal: the heading, the count, then each area as a heading with its rows.
struct PlanPaperView: View {
    let paper: PlanPaper
    /// The reading column, across, in the container's points.
    let column: ClosedRange<CGFloat>
    /// The sheet's top edge, in the container's points.
    let top: CGFloat
    /// The least height of anything that takes a tap: 44 real points or more.
    let touch: CGFloat
    /// How far in from the column's edges the words stand.
    var inset: CGFloat = 24
    let onRow: (UUID) -> Void
    let onClose: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize
    /// The row's 27-point line at DM Sans 16: the gap between lines grows with the text.
    @ScaledMetric(relativeTo: .body) private var rowLineGap: CGFloat = 6
    /// The room above and below a row's words: half of what a touch leaves round a 27-point line, growing
    /// with the text as the line gap does, so the gap between two rows stays wider than between two lines.
    @ScaledMetric(relativeTo: .body) private var rowPad: CGFloat = 8.5

    var body: some View {
        GeometryReader { room in
            VStack(spacing: 0) {
                showTheMountain
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 0) {
                        // The heading's top 52 from the sheet's, under "Show the mountain"; the areas from 100.
                        heading
                            .padding(.top, max(6, 52 - touch))
                        let numbers = Dictionary(uniqueKeysWithValues: paper.numberedRows.map { ($0.row.id, $0.index) })
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(paper.sections) { section($0, numbers: numbers) }
                        }
                        .padding(.top, 12)
                    }
                    .padding(.horizontal, inset)
                    .frame(width: column.upperBound - column.lowerBound, alignment: .leading)
                    .padding(.leading, column.lowerBound)
                    .frame(width: room.size.width, alignment: .leading)
                    .padding(.bottom, 44)
                }
            }
            .frame(width: room.size.width, height: max(0, room.size.height - top), alignment: .top)
            .background(sheet)
            .contentShape(Rectangle())
            .offset(y: top)
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, onClose)
        .accessibilityIdentifier("walk.paper")
    }

    // MARK: The sheet

    private var sheet: some View {
        UnevenRoundedRectangle(topLeadingRadius: 22, topTrailingRadius: 22)
            .fill(DailyPalette.paper)
            .shadow(color: DailyPalette.navy.opacity(0.35), radius: 22, x: 0, y: -6)
    }

    /// The grabber 9 from the top, then "Show the mountain": the whole first `touch` points one button.
    private var showTheMountain: some View {
        Button(action: onClose) {
            VStack(spacing: 4) {
                Capsule().fill(DailyPalette.grabber).frame(width: 40, height: 5)
                    .padding(.top, 9)
                Text(WalkCopy.showMountain)
                    .font(DailyPalette.sans(12.5, relativeTo: .footnote))
                    .foregroundStyle(DailyPalette.muted)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 4)
            }
            // Centred over the reading column (on the board's midline), the button across the whole sheet.
            .frame(width: column.upperBound - column.lowerBound)
            .padding(.leading, column.lowerBound)
            .frame(maxWidth: .infinity, minHeight: touch, alignment: .topLeading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WalkCopy.showMountain)
        .accessibilityIdentifier("walk.paper.close")
    }

    // MARK: The heading and its count

    private var heading: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(paper.title)
                .font(DailyPalette.crimson(30, relativeTo: .title))
                .foregroundStyle(DailyPalette.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            Text(paper.count)
                .font(DailyPalette.sans(13, relativeTo: .footnote))
                .foregroundStyle(DailyPalette.muted)
        }
    }

    // MARK: An area and its rows

    /// `numbers`: each row's place on the paper, for its identifier.
    private func section(_ section: PlanPaper.Section, numbers: [UUID: Int]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(section.name.uppercased())
                    .font(DailyPalette.sansSemiBold(11, relativeTo: .caption))
                    .tracking(1.3)
                    .foregroundStyle(DailyPalette.rust)
                Spacer(minLength: 0)
                Text("\(section.rows.count)")
                    .font(DailyPalette.sansSemiBold(11, relativeTo: .caption))
                    .foregroundStyle(DailyPalette.muted)
            }
            .padding(.bottom, 6)
            .overlay(alignment: .bottom) { Rectangle().fill(DailyPalette.line).frame(height: 1) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(WalkCopy.paperSection(section.name, count: section.rows.count, level: paper.level))
            .accessibilityAddTraits(.isHeader)
            ForEach(section.rows) { row in
                rowButton(row, index: numbers[row.id] ?? 0)
            }
        }
    }

    private func rowButton(_ row: PlanPaper.Row, index: Int) -> some View {
        Button { onRow(row.id) } label: {
            // A one-line row is a touch high; a row that wraps keeps the same room above and below, so
            // two long titles never read as one.
            rowWords(row)
                .padding(.vertical, max(rowPad, (touch - 27) / 2))
                .frame(maxWidth: .infinity, minHeight: touch, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(WalkCopy.paperRowLabel(row.title, tag: row.tag))
        .accessibilityHint(WalkCopy.areaHint(ground: false, kept: true, focused: false))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("walk.paper.row.\(index)")
    }

    /// The title whole, wrapping; a week task's day beside it (under it at the accessibility sizes).
    @ViewBuilder private func rowWords(_ row: PlanPaper.Row) -> some View {
        let title = Text(row.title)
            .font(DailyPalette.sans(16))
            .lineSpacing(rowLineGap)
            .foregroundStyle(DailyPalette.ink)
            .fixedSize(horizontal: false, vertical: true)
        let tag = row.tag.map {
            Text($0)
                .font(DailyPalette.sansSemiBold(11, relativeTo: .caption))
                .tracking(0.6)
                .foregroundStyle(DailyPalette.muted)
        }
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 2) {
                title
                tag
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                title
                Spacer(minLength: 0)
                tag
            }
        }
    }
}
#endif
