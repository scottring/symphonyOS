#if os(iOS)
import SwiftUI
import UIKit

/// The walk, full screen: the 390 × 844 board scaled to fit the window between
/// its side insets and centred there, over the safe areas (D21). The painting,
/// the shades, the veil and the sheets run past the board to the window's edges
/// (`WalkStage.bleed`); the window clips them, the board clips nothing. The orb,
/// the hint row and the top row sit on the board, over the scene, on every step but
/// Look back up, where the header and the ending sheet take their place.
/// The full-bleed root is the `"walk.device"` coordinate space every touch is
/// measured in before `WalkStage` turns it into stage points.
struct WalkView: View {
    let model: WalkModel
    /// The keyboard's top edge in screen points, while it is up.
    @State private var keyboardTop: CGFloat?
    /// The window's own safe-area insets (`WindowInsetsReader`). Only the sides are read: the
    /// board stands clear of a system column (the Duo's outside screen) and the painting runs under it.
    @State private var insets = UIEdgeInsets.zero
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(model: WalkModel) {
        self.model = model
    }

    // `-WalkSize 669x951` pins the walk to a window of that size (a Duo's
    // inside screen on a phone simulator), scaled down to the room there is, as `-TodaySize` does for the pages.
    // `-WalkSafe 0,84` with it gives that pinned window side insets, left then right (`466x678` with
    // `0,84` is the Duo's outside screen); without it the pinned window has none.
    #if DEBUG
    static let pinnedSize: CGSize? = {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-WalkSize"), i + 1 < args.count else { return nil }
        let parts = args[i + 1].lowercased().split(separator: "x").compactMap { Double($0) }
        return parts.count == 2 ? CGSize(width: parts[0], height: parts[1]) : nil
    }()

    static let pinnedSafe: (left: CGFloat, right: CGFloat) = {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-WalkSafe"), i + 1 < args.count else { return (0, 0) }
        let parts = args[i + 1].split(separator: ",").compactMap { Double($0) }
        return parts.count == 2 ? (CGFloat(parts[0]), CGFloat(parts[1])) : (0, 0)
    }()

    var body: some View {
        if let pinned = Self.pinnedSize {
            GeometryReader { room in
                let k = min(1, room.size.width / pinned.width, room.size.height / pinned.height)
                walkBody(left: Self.pinnedSafe.left, right: Self.pinnedSafe.right)
                    .frame(width: pinned.width, height: pinned.height)
                    .scaleEffect(k, anchor: .topLeading)
                    .offset(x: (room.size.width - pinned.width * k) / 2, y: (room.size.height - pinned.height * k) / 2)
            }
            .background(Color.black)
            .ignoresSafeArea()
        } else {
            inTheWindow
        }
    }
    #else
    var body: some View { inTheWindow }
    #endif

    /// The walk on the real window, between that window's own side insets.
    private var inTheWindow: some View {
        walkBody(left: insets.left, right: insets.right)
            .background { WindowInsetsReader { insets = $0 } }
    }

    /// `left`, `right`: the window's side insets, in its own points.
    private func walkBody(left: CGFloat, right: CGFloat) -> some View {
        GeometryReader { geo in
            let stage = WalkStage(device: geo.size, stage: model.art.stage, left: left, right: right)
            ZStack(alignment: .topLeading) {
                // VoiceOver reads the top row, the scene (the words, then the peaks and flags), then the
                // light, then the hint row.
                ZStack(alignment: .topLeading) {
                    WalkSceneView(model: model)
                        // Under the raised sheet the mountain is covered: VoiceOver skips it too.
                        .accessibilityHidden(model.state.step > 5 && model.state.sheetRaised)
                        .accessibilitySortPriority(2)
                    if model.state.step <= 5 {
                        WalkUnderlay(model: model)
                        WalkOrbView(model: model)
                            .accessibilitySortPriority(1)
                        WalkHintRow(model: model)
                        // Over everything, and past the board's edges on a wider window (Back and Leave for
                        // now stand in its corners): nothing here clips or stops a touch at the board.
                        WalkTopRow(model: model)
                            .accessibilitySortPriority(3)
                    } else {
                        WalkEndingView(model: model)        // Look back up, and Today as a sheet
                    }
                }
                .accessibilityElement(children: .contain)
                // The stage is laid out in fixed stage points: its words stop growing at extra large,
                // as the mountain pages' do, so a larger text size never wraps them into the flags.
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .frame(width: model.art.stage.width, height: model.art.stage.height, alignment: .topLeading)
                .scaleEffect(stage.scale, anchor: .topLeading)
                .offset(x: stage.origin.x, y: stage.origin.y)
                .environment(\.walkStage, stage)
                .environment(\.walkKeyboardLift, lift(stage, root: geo.frame(in: .global)))
                // Under the raised paper nothing takes a touch and VoiceOver skips it all (the paper is modal).
                .allowsHitTesting(!model.state.paperOpen)
                .accessibilityHidden(model.state.paperOpen)
                paper(stage, window: geo.size)
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
            .clipped()                                   // at the window: nothing is clipped at the board
            .coordinateSpace(.named("walk.device"))
        }
        .ignoresSafeArea()
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { note in
            guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            withAnimation(.easeOut(duration: 0.25)) { keyboardTop = frame.minY }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            withAnimation(.easeOut(duration: 0.25)) { keyboardTop = nil }
        }
    }

    /// The paper (F7) over the mountain while it is raised: across the whole window (the board and its
    /// bleed) from stage y 116 down, its words in the reading column (`WalkLayout.column(wing:)`), 24 in.
    /// It is drawn in the window's own points, outside the stage's fixed sizes, so its words follow the
    /// person's text size. It rises in 0.3 s; with Reduce Motion it fades.
    private func paper(_ stage: WalkStage, window: CGSize) -> some View {
        let column = WalkLayout.column(wing: stage.wing)
        let left = stage.toDevice(CGPoint(x: column.lowerBound, y: 0)).x
        let right = stage.toDevice(CGPoint(x: column.upperBound, y: 0)).x
        return ZStack(alignment: .topLeading) {
            if let paper = model.state.paper(model.periods) {
                PlanPaperView(paper: paper, column: left...right,
                              top: stage.toDevice(CGPoint(x: 0, y: WalkLayout.paperTop)).y,
                              touch: stage.touch * stage.scale, inset: WalkLayout.paperInset * stage.scale,
                              onRow: { model.send(.paperRow($0)) }, onClose: { model.send(.paperClosed) })
                    .frame(width: window.width, height: window.height)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom))
            }
        }
        .frame(width: window.width, height: window.height, alignment: .topLeading)
        .animation(reduceMotion ? WalkSceneView.crossFade : .easeOut(duration: 0.3), value: model.state.paperOpen)
    }

    /// How far, in stage points, the stage's bottom is under the keyboard: the hint
    /// row rises by this much so the field sits just above it, while the question
    /// at the top of the stage stays where it is.
    private func lift(_ stage: WalkStage, root: CGRect) -> CGFloat {
        guard let keyboardTop else { return 0 }
        let top = stage.toStage(CGPoint(x: 0, y: keyboardTop - root.minY)).y
        return max(0, model.art.stage.height - top)
    }
}

extension EnvironmentValues {
    /// The stage on this device, for turning touches into stage points.
    @Entry var walkStage = WalkStage(device: WalkArt.stageSize)
    /// Stage points the bottom row rises to stay above the keyboard.
    @Entry var walkKeyboardLift: CGFloat = 0
}
#endif
