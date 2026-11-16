#if os(iOS)
import SwiftUI

/// Another area, as a small post at the side ("The board as numbers", "Side posts"): a short
/// pole leaning a little about its foot, a wordless pennant in its level's colour for each of
/// its flags (at most four; with more, three and "+n" in the fourth place), and its name in a
/// small navy pill under the pole. Everything stands at the layout's frames (`WalkLayout.Side`);
/// the view only draws them, inside `box`, the post's own frame in stage points. Under the veil
/// on words (`veiled`, F22) the pole, pennants and pill stay and the name and "+n" are not drawn.
struct WalkSideView: View {
    let side: WalkLayout.Side
    /// Where the post is placed: its touch frame (`WalkLayout.Side.touchFrame(touch:)`).
    let box: CGRect
    var veiled = false

    /// The pill: navy 0.86, a white 0.7 outline of 1, its name DM Sans SemiBold 9.5 in capitals,
    /// tracked 1, white, 7 either side; a longer name shrinks to 0.8, then is cut.
    static let pillSize: CGFloat = 9.5, pillTracking: CGFloat = 1, pillPadding: CGFloat = 7
    /// A pennant's edge: white, thin.
    static let pennantEdge = (width: CGFloat(0.75), opacity: 0.6)
    /// The "+n" count's dark edge: a tight navy shade, twice.
    static let extraEdge = (width: CGFloat(0.8), opacity: 0.95)
    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear
                .frame(width: box.width, height: box.height)
                .contentShape(Rectangle())
            // The pole, leaning about its foot, and its shadow on the ground.
            Ellipse()
                .fill(Color(red: 30 / 255, green: 25 / 255, blue: 20 / 255).opacity(0.4))
                .frame(width: side.footShadow.width, height: side.footShadow.height)
                .at(side.footShadow.origin, in: box)
            RoundedRectangle(cornerRadius: 1)
                .fill(LinearGradient(colors: [Color(hex: 0x4A3A2C), Color(hex: 0x2C2219)], startPoint: .top, endPoint: .bottom))
                .frame(width: WalkLayout.sidePoleWidth, height: max(0, side.poleFoot - side.poleTop))
                .rotationEffect(.degrees(side.lean), anchor: .bottom)
                .at(CGPoint(x: side.poleX - WalkLayout.sidePoleWidth / 2, y: side.poleTop), in: box)
            ForEach(Array(side.pennants.enumerated()), id: \.offset) { _, pennant in
                // A thin light edge, so a pennant reads on dark forest as on pale sky (the same on every level).
                WalkPennant()
                    .fill(WalkPalette.level(pennant.level))
                    .overlay(WalkPennant().stroke(.white.opacity(Self.pennantEdge.opacity), lineWidth: Self.pennantEdge.width))
                    .shadow(color: Color(white: 20 / 255).opacity(0.35), radius: 1, x: 0, y: 1)
                    .frame(width: pennant.frame.width, height: pennant.frame.height)
                    .at(pennant.frame.origin, in: box)
            }
            if let extra = side.extraFrame {
                Text(WalkCopy.sideExtra(side.extra))
                    .font(.custom(WalkClothFace.name, fixedSize: Self.pillSize))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .fixedSize()
                    // A thin dark edge, so the count reads on white snow as on dark forest (as the pennants' light edge).
                    .shadow(color: WalkPalette.glowShadow.opacity(Self.extraEdge.opacity), radius: Self.extraEdge.width)
                    .shadow(color: WalkPalette.glowShadow.opacity(Self.extraEdge.opacity), radius: Self.extraEdge.width)
                    .walkGlow()
                    .frame(width: extra.width, height: extra.height, alignment: .leading)
                    .opacity(veiled ? 0 : 1)
                    .at(extra.origin, in: box)
            }
            if let pill = side.pill {
                Text(side.name.uppercased())
                    .font(.custom(WalkClothFace.name, fixedSize: Self.pillSize))
                    .tracking(Self.pillTracking)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .truncationMode(.tail)
                    .padding(.horizontal, Self.pillPadding)
                    .opacity(veiled ? 0 : 1)
                    .frame(width: pill.width, height: pill.height)
                    .background {
                        Capsule().fill(WalkPalette.navy.opacity(0.86))
                            .overlay(Capsule().strokeBorder(.white.opacity(0.7), lineWidth: 1))
                    }
                    .at(pill.origin, in: box)
            }
        }
        .frame(width: box.width, height: box.height, alignment: .topLeading)
    }
}

private extension View {
    /// Puts a part of the post at its stage point, inside the post's own frame.
    func at(_ point: CGPoint, in box: CGRect) -> some View {
        offset(x: point.x - box.minX, y: point.y - box.minY)
    }
}
#endif
