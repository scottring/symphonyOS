#if os(iOS)
import SwiftUI

/// One of today's tasks on the paper: its circle, its title, and the line saying what it
/// is for; the first thing carries a small flag at the right, and a lit row (the sign's) a
/// gold halo. The whole row is one button: a tap ticks it or puts it back. Press and hold
/// opens a menu (first today or not, details, pull it up), which VoiceOver offers as actions.
/// Nothing here decides: the row draws what `DailyDay.Row` says.
struct DailyRow: View {
    let row: DailyDay.Row
    let height: CGFloat
    var lit = false
    let toggle: () -> Void
    /// Makes this row the first thing, or (when it is) stops it being first.
    let setFirst: () -> Void
    let details: () -> Void
    let pullUp: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 12) {
                circle
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.title)
                        .font(DailyPalette.sansMedium(16))
                        .foregroundStyle(row.done ? DailyPalette.doneInk : DailyPalette.ink)
                        .strikethrough(row.done, color: DailyPalette.strike)
                        .lineLimit(DailyMetrics.titleLines(accessibilitySize: typeSize.isAccessibilitySize))
                        .truncationMode(.tail)
                        .frame(minHeight: 20)
                    if let goal = row.forGoal { lineage(goal) }
                }
                // A row of two-line words grows past the board's height and keeps this much above and below.
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                if row.first {
                    DailyFlag(colour: DailyPalette.firstFlag, poleWidth: 1.5)
                        .frame(width: 14, height: 16)
                }
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: height, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(DailyPalette.line, lineWidth: 1))
            .overlay {
                if lit {
                    RoundedRectangle(cornerRadius: 16).inset(by: -3).strokeBorder(DailyPalette.gold, lineWidth: 3)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(action: setFirst) { Label(firstWords, systemImage: "flag") }
            Button(action: details) { Label(DailyCopy.details, systemImage: "doc.text") }
            Button(action: pullUp) { Label(WalkCopy.pullUp, systemImage: "arrow.up") }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(WalkCopy.rowLabel(row.title, forGoal: row.forGoal))
        .accessibilityValue(row.done ? WalkCopy.rowDone : WalkCopy.rowOpen)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: firstWords, setFirst)
        .accessibilityAction(named: DailyCopy.details, details)
        .accessibilityAction(named: WalkCopy.pullUp, pullUp)
    }

    private var firstWords: String { row.first ? DailyCopy.notFirst : DailyCopy.firstToday }

    private var circle: some View {
        ZStack {
            if row.done {
                Circle().fill(DailyPalette.green)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
            } else {
                Circle().strokeBorder(DailyPalette.openCircle, lineWidth: 2)
            }
        }
        .frame(width: 26, height: 26)
    }

    /// "for" in the lineage ink, the goal's name in Crimson Pro green, after a small flag beside its
    /// first line; up to two lines (F28).
    private func lineage(_ goal: String) -> some View {
        HStack(alignment: .top, spacing: 5) {
            DailyFlag(colour: DailyPalette.lineageFlag, poleWidth: 1.4)
                .frame(width: 10, height: 12)
                .padding(.top, 3)
            Text(Self.forLine(goal))
                .lineLimit(DailyMetrics.forLines(accessibilitySize: typeSize.isAccessibilitySize))
                .truncationMode(.tail)
        }
        .frame(minHeight: 16)
    }

    /// `WalkCopy.forGoal`, with the goal's name set apart.
    static func forLine(_ goal: String) -> AttributedString {
        var text = AttributedString(WalkCopy.forGoal(goal))
        text.font = DailyPalette.sans(12.5, relativeTo: .footnote)
        text.foregroundColor = DailyPalette.lineageInk
        if let range = text.range(of: goal, options: .backwards) {
            text[range].font = DailyPalette.crimson(14.5, relativeTo: .footnote)
            text[range].foregroundColor = DailyPalette.green
        }
        return text
    }
}

/// The ring: done of total, filling from 12 o'clock (the board's 56: radius 23, stroke 6).
struct DailyRing: View {
    let done: Int
    let total: Int
    var diameter: CGFloat = 56

    init(done: Int, total: Int, diameter: CGFloat = 56) {
        self.done = done
        self.total = total
        self.diameter = diameter
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let k = diameter / 56
        let progress = total > 0 ? CGFloat(done) / CGFloat(total) : 0
        ZStack {
            Circle().stroke(DailyPalette.ringTrack, lineWidth: 6 * k)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(DailyPalette.green, style: StrokeStyle(lineWidth: 6 * k, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : .easeOut(duration: 0.4), value: progress)     // with Reduce Motion it does not sweep
            Text(WalkCopy.ring(done: done, total: total))
                .font(DailyPalette.sansSemiBold(14 * k))
                .monospacedDigit()
                .foregroundStyle(DailyPalette.ink)
        }
        .frame(width: 46 * k, height: 46 * k)
        .frame(width: diameter, height: diameter)
        .dynamicTypeSize(...DailyPalette.largestChrome)        // a drawing of a fixed size: its count does not grow
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(WalkCopy.ringLabel(done: done, total: total))
        .accessibilityIdentifier("daily.ring")
    }
}

/// Today's next calendar event: its time in rust, its title, and NEXT at the right.
struct DailyNextCard: View {
    let next: DailyDay.Next

    var body: some View {
        HStack(spacing: 12) {
            Text(DailyCopy.clock(next.start))
                .font(DailyPalette.crimson(19, relativeTo: .title3))
                .foregroundStyle(DailyPalette.rust)
            Text(next.title)
                .font(DailyPalette.sans(15.5))
                .foregroundStyle(DailyPalette.ink)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(DailyCopy.next.uppercased())
                .font(DailyPalette.sansSemiBold(11, relativeTo: .caption))
                .tracking(1.2)
                .foregroundStyle(DailyPalette.rust)
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(DailyPalette.nextFill))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(DailyPalette.nextLine, lineWidth: 1))
        .dynamicTypeSize(...DailyPalette.largestChrome)        // a card of a fixed height
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(DailyCopy.nextEvent(next.title, at: next.start))
    }
}

/// A small flag, as the boards draw it beside a row: a pole, and a cloth with a notch cut
/// into its free end. `part` picks which to fill or stroke.
struct DailyFlagMark: Shape {
    enum Part { case pole, cloth }
    var part: Part = .cloth

    func path(in rect: CGRect) -> Path {
        // The board's 12 × 14 drawing, scaled to the rect.
        let sx = rect.width / 12, sy = rect.height / 14
        func at(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy) }
        var p = Path()
        switch part {
        case .pole:
            p.move(to: at(2, 1))
            p.addLine(to: at(2, 13))
        case .cloth:
            p.move(to: at(2.7, 1.6))
            p.addLine(to: at(10.3, 1.6))
            p.addLine(to: at(8.3, 4.2))
            p.addLine(to: at(10.3, 6.8))
            p.addLine(to: at(2.7, 6.8))
            p.closeSubpath()
        }
        return p
    }
}

/// The flag mark drawn: a plank-ink pole and a coloured cloth.
struct DailyFlag: View {
    let colour: Color
    var poleWidth: CGFloat = 1.4

    var body: some View {
        ZStack {
            DailyFlagMark(part: .pole)
                .stroke(DailyPalette.plankInk, style: StrokeStyle(lineWidth: poleWidth, lineCap: .round))
            DailyFlagMark(part: .cloth).fill(colour)
        }
        .accessibilityHidden(true)
    }
}
#endif
