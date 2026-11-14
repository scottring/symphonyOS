#if os(iOS)
import SwiftUI

/// The paper sheet the day is written on: from `top` to the page's foot, rounded at its
/// top corners, with a grabber and (on a tall window) the handle's words, the walk's "see
/// my whole plan" (`WalkCopy.lookBackHandle`). `content` is laid out in page points over
/// the whole page, so the page places everything on the sheet by `DailyMetrics`.
struct DailySheet<Content: View>: View {
    let top: CGFloat
    let radius: CGFloat
    /// The handle's touch shape; nil draws no words (short windows).
    let lookBack: CGRect?
    let onLookBack: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack(alignment: .topLeading) {
            UnevenRoundedRectangle(topLeadingRadius: radius, topTrailingRadius: radius)
                .fill(DailyPalette.paper)
                .shadow(color: DailyPalette.navy.opacity(0.3), radius: 13, x: 0, y: -8)
                .padding(.top, top)
                .accessibilityHidden(true)
            Capsule()
                .fill(DailyPalette.grabber)
                .frame(width: 44, height: 5)
                .frame(maxWidth: .infinity)
                .offset(y: top + 9)
                .accessibilityHidden(true)
            if let lookBack { handle(lookBack) }
            content()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// The words sit at +16…+40 on the sheet, the bottom 24 points of the touch shape.
    private func handle(_ frame: CGRect) -> some View {
        Button(action: onLookBack) {
            Text(WalkCopy.lookBackHandle)
                .font(DailyPalette.sansMedium(12))
                .foregroundStyle(DailyPalette.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: frame.width, height: 24)
                .frame(width: frame.width, height: frame.height, alignment: .bottom)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: frame.minX, y: frame.minY)
        .accessibilityIdentifier("daily.lookBack")
    }
}
#endif
