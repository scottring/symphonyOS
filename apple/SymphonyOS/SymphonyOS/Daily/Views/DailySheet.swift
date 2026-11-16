#if os(iOS)
import SwiftUI

/// The paper sheet the day is written on: from `top` to the page's foot, rounded at its
/// top corners, with the handle (the walk's own capsule, `SheetHandleCapsule`): the walk's "see
/// my whole plan" (`WalkCopy.lookBackHandle`), or, lowered, what raising it shows
/// (`DailyLookBack.label`); a page with no handle (the spread) has a grabber. `content` is laid out in page points over the whole page, so the
/// page places everything on the sheet by `DailyMetrics`.
struct DailySheet<Content: View>: View {
    let top: CGFloat
    let radius: CGFloat
    /// The grabber's frame on the page (`DailyMetrics.grabber`), centred on the window.
    let grabber: CGRect
    /// The handle's touch shape; nil: no handle, the grabber instead (the spread).
    let lookBack: CGRect?
    let onLookBack: () -> Void
    /// The handle's words.
    var label: String = WalkCopy.lookBackHandle
    /// Lowered (`DailyMetrics.Lowered.strip`): the whole lowered sheet, down to the safe area's
    /// foot, is one control that raises it, by a tap or a drag up (`DailyLookBack.stripRaises`),
    /// read by VoiceOver as the handle's words. Nil: the handle alone is the control.
    var strip: CGRect? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack(alignment: .topLeading) {
            UnevenRoundedRectangle(topLeadingRadius: radius, topTrailingRadius: radius)
                .fill(DailyPalette.paper)
                .shadow(color: DailyPalette.navy.opacity(0.3), radius: 13, x: 0, y: -8)
                .padding(.top, top)
                .accessibilityHidden(true)
            if let lookBack {
                handle(lookBack)
            } else {
                Capsule()
                    .fill(DailyPalette.grabber)
                    .frame(width: grabber.width, height: grabber.height)
                    .offset(x: grabber.minX, y: grabber.minY)
                    .accessibilityHidden(true)
            }
            // Lowered, the strip is the one control VoiceOver reads on the sheet; its header is only seen.
            content()
                .accessibilityHidden(strip != nil)
            if let strip { raiser(strip) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// The capsule stands at +4…+40 on the sheet, the bottom 36 points of the touch shape, its chevron
    /// up while lowered (a tap raises) and down while up. Its words keep the large size, as the walk's
    /// lowered handle does (S27), to stay inside the fixed frame. Lowered, it is only drawn: the strip
    /// over the whole sheet takes the touch.
    @ViewBuilder private func handle(_ frame: CGRect) -> some View {
        let words = SheetHandleCapsule(label: label, raises: strip != nil)
            .frame(width: frame.width, height: DailyMetrics.handleCapsule)
            .frame(width: frame.width, height: frame.height, alignment: .bottom)
            .dynamicTypeSize(...DynamicTypeSize.large)
        if strip == nil {
            Button(action: onLookBack) { words.contentShape(Rectangle()) }
                .buttonStyle(.plain)
                .offset(x: frame.minX, y: frame.minY)
                .accessibilityIdentifier("daily.lookBack")
        } else {
            words
                .offset(x: frame.minX, y: frame.minY)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    /// The lowered sheet as one control: a tap, or a drag up, raises it.
    private func raiser(_ frame: CGRect) -> some View {
        Color.clear
            .frame(width: frame.width, height: frame.height)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onEnded { value in
                if DailyLookBack.stripRaises(translation: value.translation) { onLookBack() }
            })
            .offset(x: frame.minX, y: frame.minY)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { onLookBack() }
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

/// Behind Today's or Week's lowered sheet (`DailyLookBack`), in place of the band: the walk's own
/// Look back up over the whole window: one area read top to bottom, the others as side posts (F6). A
/// side post stands in its area; a cloth opens its level's paper (F21); every other flag is read.
/// Its words stop growing at extra large, as the walk's stage does.
struct DailyWholePlan: View {
    @Binding var lookBack: DailyLookBack
    let goals: [Goal]
    let tasks: [SymphonyTask]
    let periods: WalkPeriods
    let today: Date
    let me: UUID
    let size: CGSize

    var body: some View {
        MountainStage(state: lookBack.plan(goals: goals, tasks: tasks, periods: periods, me: me),
                      today: today, onLabel: { _ in },
                      onBanner: { banner, post in lookBack.tap(WalkLayout.tapEvent(banner, on: post)) },
                      onSide: { side in lookBack.tap(WalkLayout.tapEvent(side)) }) {
            EmptyView()
        }
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
        .frame(width: size.width, height: size.height)
    }
}

/// The paper a Look back up cloth opened behind Today's or Week's lowered sheet (F21), over it, from
/// 72 under the row of words: Task 7's `PlanPaperView`, its words in the reading column of the stage
/// the whole plan stands on (`WalkLayout.column(wing:)`), following the person's text size. A row
/// stands the plan in its area and closes it; "Show the mountain" closes it, and the handle then
/// raises the sheet as before. It rises in 0.3 s; with Reduce Motion it fades.
struct DailyWholePlanPaper: View {
    @Binding var lookBack: DailyLookBack
    let paper: PlanPaper?
    let size: CGSize
    let navTop: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The paper's top: 72 under the row of words' top (the walk's 116 on the phone board).
    static let belowWords: CGFloat = 72

    var body: some View {
        let stage = WalkStage(device: size, stage: WalkArt.overlookSquare.stage)
        let column = WalkLayout.column(wing: stage.wing)
        let left = stage.toDevice(CGPoint(x: column.lowerBound, y: 0)).x
        let right = stage.toDevice(CGPoint(x: column.upperBound, y: 0)).x
        ZStack(alignment: .topLeading) {
            if let paper {
                PlanPaperView(paper: paper, column: max(0, left)...min(size.width, right), top: navTop + Self.belowWords,
                              touch: max(DailyMetrics.minTouch, stage.touch * stage.scale),
                              inset: WalkLayout.paperInset * min(1, stage.scale),
                              onRow: { lookBack.rowTapped($0, on: paper) }, onClose: { lookBack.tap(.paperClosed) })
                    .frame(width: size.width, height: size.height)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom))
            }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .animation(reduceMotion ? WalkSceneView.crossFade : .easeOut(duration: 0.3), value: paper != nil)
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
