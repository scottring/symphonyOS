#if os(iOS)
import SwiftUI

/// The top row on steps 1 to 5 ("The board as numbers", "Top row"): Back, More and Leave for now,
/// plain white words with the walk's glow, no box, each where `WalkLayout` puts it. Back and Leave
/// for now ask for their frames with the stage's wing, so on a wider window they stand in its
/// corners, past the board's edges; More stays in the middle and turns gold while the choices are
/// open. The row is not drawn while typing (F10): its frames are nil then.
struct WalkTopRow: View {
    let model: WalkModel
    @Environment(\.walkStage) private var stage

    var body: some View {
        let s = model.state
        ZStack(alignment: .topLeading) {
            if let frame = WalkLayout.backFrame(s, wing: stage.wing) {
                Button { model.send(.backTapped) } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                        Text(WalkCopy.backWord)
                    }
                    .walkTopWords(.white)
                    .padding(.horizontal, 8)
                    .walkTouch(frame.size, stage.touch, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(WalkCopy.back(s, model.periods))
                .accessibilityIdentifier("walk.back")
                .position(x: frame.midX, y: frame.midY)
            }
            if let frame = WalkLayout.moreFrame(s) {
                Button { model.send(.moreTapped) } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 15, weight: .regular))
                        Text(WalkCopy.more)
                    }
                    .walkTopWords(s.choicesOpen ? WalkPalette.gold : .white)
                    .walkTouch(frame.size, stage.touch)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(WalkCopy.moreLabel)
                .accessibilityValue(s.choicesOpen ? WalkCopy.choicesOpen : WalkCopy.choicesClosed)
                .accessibilityIdentifier("walk.more")
                .position(x: frame.midX, y: frame.midY)
            }
            if let frame = WalkLayout.leaveFrame(s, wing: stage.wing) {
                Button { model.send(.leaveTapped) } label: {
                    Text(WalkCopy.leaveForNow)
                        .walkTopWords(.white)
                        .padding(.horizontal, 8)
                        .walkTouch(frame.size, stage.touch, alignment: .trailing)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(WalkCopy.leaveForNow)
                .walkAccessibilityHint(WalkCopy.leaveHint(s))
                .accessibilityIdentifier("walk.leave")
                .position(x: frame.midX, y: frame.midY)
            }
        }
        .frame(width: WalkArt.stageSize.width, height: WalkArt.stageSize.height, alignment: .topLeading)
    }
}

private extension View {
    /// The top row's words: DM Sans SemiBold 14 on one line, in `colour`, with the walk's glow. They grow
    /// with the text size up to the stage's cap (extra large) and shrink to 0.85 before anything is cut.
    func walkTopWords(_ colour: Color) -> some View {
        font(.custom("DMSans-SemiBold", size: 14))
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .foregroundStyle(colour)
            .walkGlow()
    }
}

extension View {
    /// A control drawn in its stage frame's `size`, taking a touch at least `touch` stage points each
    /// way (`WalkStage.touch`: 44 real points) about the frame's centre. Used inside a button's label,
    /// so the whole shape is the button's; the caller places it at the frame's centre.
    func walkTouch(_ size: CGSize, _ touch: CGFloat, alignment: Alignment = .center) -> some View {
        frame(width: size.width, height: size.height, alignment: alignment)
            .frame(width: max(size.width, touch), height: max(size.height, touch))
            .contentShape(Rectangle())
    }
}
#endif
