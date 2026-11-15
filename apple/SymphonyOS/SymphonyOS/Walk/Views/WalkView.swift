#if os(iOS)
import SwiftUI
import UIKit

/// The walk, full screen: the 390 × 844 stage scaled to fit the device and
/// centred on the deep sky colour, over the safe areas (D21). The orb and the
/// hint row sit on the stage, over the scene, on every step but Look back up,
/// where the header and the ending sheet take their place.
/// The full-bleed root is the `"walk.device"` coordinate space every touch is
/// measured in before `WalkStage` turns it into stage points.
struct WalkView: View {
    let model: WalkModel
    /// The keyboard's top edge in screen points, while it is up.
    @State private var keyboardTop: CGFloat?

    init(model: WalkModel) {
        self.model = model
    }

    // `-WalkSize 669x951` pins the walk to a window of that size (a Duo's
    // inside screen on a phone simulator), scaled down to the room there is, as `-TodaySize` does for the pages.
    #if DEBUG
    static let pinnedSize: CGSize? = {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-WalkSize"), i + 1 < args.count else { return nil }
        let parts = args[i + 1].lowercased().split(separator: "x").compactMap { Double($0) }
        return parts.count == 2 ? CGSize(width: parts[0], height: parts[1]) : nil
    }()
    #else
    static let pinnedSize: CGSize? = nil
    #endif

    var body: some View {
        if let pinned = Self.pinnedSize {
            GeometryReader { room in
                let k = min(1, room.size.width / pinned.width, room.size.height / pinned.height)
                walkBody
                    .frame(width: pinned.width, height: pinned.height)
                    .scaleEffect(k, anchor: .topLeading)
                    .offset(x: (room.size.width - pinned.width * k) / 2, y: (room.size.height - pinned.height * k) / 2)
            }
            .background(Color.black)
            .ignoresSafeArea()
        } else {
            walkBody
        }
    }

    private var walkBody: some View {
        GeometryReader { geo in
            let stage = WalkStage(device: geo.size, stage: model.art.stage)
            ZStack(alignment: .topLeading) {
                WalkPalette.ground
                // VoiceOver reads the scene (the words, then the peaks and flags), then the light, then the hint row.
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
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
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
