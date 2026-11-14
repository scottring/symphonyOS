#if os(iOS)
import SwiftUI

/// The row of words over the scenery: Year · Season · Month · Week · Today, the page you
/// are on in white SemiBold over a gold line. A tap on a word calls `go` with its horizon
/// (the page sets the date and the horizon, `LightPlannerView.open`). Each word's touch
/// shape is at least 44 × 44. Opened flat (`split`), the first `after` words stand left of the
/// fold at `at` and the rest right of it, the gap between them on the fold, so none sits across it.
struct DailyNavRow: View {
    let current: Horizon
    let gap: CGFloat
    let words: [Horizon]
    let label: (Horizon) -> String
    let split: (at: CGFloat, after: Int)?
    let go: (Horizon) -> Void

    init(current: Horizon, gap: CGFloat, words: [Horizon] = [.year, .season, .month, .week, .today],
         label: @escaping (Horizon) -> String = DailyCopy.nav, split: (at: CGFloat, after: Int)? = nil,
         go: @escaping (Horizon) -> Void) {
        self.current = current
        self.gap = gap
        self.words = words
        self.label = label
        self.split = split
        self.go = go
    }

    var body: some View {
        Group {
            if let split {
                HStack(spacing: 0) {
                    HStack(spacing: 0) { ForEach(words.prefix(split.after), id: \.self) { h in word(h) } }
                        .frame(width: split.at, alignment: .trailing)
                    HStack(spacing: 0) { ForEach(words.dropFirst(split.after), id: \.self) { h in word(h) } }
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                HStack(spacing: 0) {
                    ForEach(words, id: \.self) { h in word(h) }
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: DailyMetrics.navHeight)
        .shadow(color: DailyPalette.navy.opacity(0.7), radius: 3, x: 0, y: 1)
        .dynamicTypeSize(...DailyPalette.largestChrome)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(DailyCopy.navLabel)
    }

    private func word(_ h: Horizon) -> some View {
        let on = h == current
        return Button { go(h) } label: {
            Text(label(h).uppercased())
                .font(on ? DailyPalette.sansSemiBold(11.5) : DailyPalette.sans(11.5))
                .tracking(1.5)
                .lineLimit(1)
                .foregroundStyle(.white.opacity(on ? 1 : 0.8))
                // The gold line stands 10 below the word.
                .overlay(alignment: .bottom) {
                    if on { Rectangle().fill(DailyPalette.gold).frame(height: 2).offset(y: 10) }
                }
                .padding(.horizontal, gap / 2)
                .frame(minWidth: DailyMetrics.minTouch, minHeight: DailyMetrics.navHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(h))
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier("daily.nav.\(h.rawValue)")
    }
}
#endif
