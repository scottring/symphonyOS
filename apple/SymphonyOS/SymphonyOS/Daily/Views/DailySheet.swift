#if os(iOS)
import SwiftUI

/// The paper sheet the day is written on: from `top` to the page's foot, rounded at its
/// top corners, with a grabber and (on a tall window) the handle's words, the walk's "see
/// my whole plan" (`WalkCopy.lookBackHandle`). `content` is laid out in page points over
/// the whole page, so the page places everything on the sheet by `DailyMetrics`.
struct DailySheet<Content: View>: View {
    let top: CGFloat
    let radius: CGFloat
    /// The grabber's frame on the page (`DailyMetrics.grabber`), centred on the window.
    let grabber: CGRect
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
                .frame(width: grabber.width, height: grabber.height)
                .offset(x: grabber.minX, y: grabber.minY)
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

/// The paper fading in over the rows where the bar stands (`DailyMetrics.Bar.fade`), and paper
/// from there to the page's foot. It takes no touches.
struct DailyPaperFade: View {
    let fade: CGRect
    let size: CGSize

    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [DailyPalette.paper.opacity(0), DailyPalette.paper], startPoint: .top, endPoint: .bottom)
                .frame(height: fade.height)
            DailyPalette.paper
        }
        .frame(width: size.width, height: max(0, size.height - fade.minY))
        .offset(y: fade.minY)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Where a light page's rows and its list stand, in the page's own space (`space`), kept without
/// redrawing the page as they scroll, so the row a change touched can be scrolled into sight: clear
/// of the fade and the Undo above the bar, or of Week's Move to panel (`DailyMetrics.reveal`).
@MainActor final class DailyRowFrames {
    static let space = "daily.page"
    private var frames: [UUID: CGRect] = [:]
    /// The list's scroll view, as laid out now.
    private var list: CGRect?

    func set(_ id: UUID, _ frame: CGRect) { frames[id] = frame }
    func setList(_ frame: CGRect) { list = frame }

    /// A moment later (once the change is laid out), scrolls row `id` (its view carries `.id(id)`)
    /// so it stands whole between the list's top and `bottom`; nothing when it already does.
    func keepInSight(_ id: UUID, above bottom: CGFloat, proxy: ScrollViewProxy, animated: Bool) {
        Task { @MainActor [self] in
            try? await Task.sleep(for: .milliseconds(60))
            guard let frame = frames[id], let list,
                  let y = DailyMetrics.reveal(frame, in: list, above: bottom) else { return }
            withAnimation(animated ? .easeOut(duration: 0.25) : nil) {
                proxy.scrollTo(id, anchor: UnitPoint(x: 0.5, y: y))
            }
        }
    }
}

extension View {
    /// Reports this row's frame in the page's space to `frames`, and names it for `scrollTo`.
    func dailyRowFrame(_ id: UUID, in frames: DailyRowFrames) -> some View {
        self.id(id)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(DailyRowFrames.space)) } action: { frames.set(id, $0) }
    }

    /// Reports the list's scroll view frame in the page's space to `frames`.
    func dailyListFrame(_ frames: DailyRowFrames) -> some View {
        onGeometryChange(for: CGRect.self) { $0.frame(in: .named(DailyRowFrames.space)) } action: { frames.setList($0) }
    }
}
#endif
