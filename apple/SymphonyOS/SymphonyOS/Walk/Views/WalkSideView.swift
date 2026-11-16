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
    /// Where the post is placed: `WalkSideView.box(side, touch:)`.
    let box: CGRect
    var veiled = false

    /// The pill: navy 0.86, a white 0.7 outline of 1, its name DM Sans SemiBold 9.5 in capitals,
    /// tracked 1, white, 7 either side; a longer name shrinks to 0.8, then is cut.
    static let pillSize: CGFloat = 9.5, pillTracking: CGFloat = 1, pillPadding: CGFloat = 7
    /// The small shadow at the pole's foot (16 × 4, as the board draws it).
    static let footShadow = CGSize(width: 16, height: 4)

    /// The post's frame in stage points: everything it draws (`Side.boxes` and the foot's shadow),
    /// made at least `touch` square about its middle, so it takes a tap 44 real points across.
    static func box(_ side: WalkLayout.Side, touch: CGFloat) -> CGRect {
        let shadow = CGRect(x: side.poleX - footShadow.width / 2, y: side.poleFoot - footShadow.height / 2,
                            width: footShadow.width, height: footShadow.height)
        let drawn = side.boxes.reduce(shadow) { $0.union($1) }
        return drawn.insetBy(dx: -max(0, touch - drawn.width) / 2, dy: -max(0, touch - drawn.height) / 2)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear
                .frame(width: box.width, height: box.height)
                .contentShape(Rectangle())
            // The pole, leaning about its foot, and its shadow on the ground.
            Ellipse()
                .fill(Color(red: 30 / 255, green: 25 / 255, blue: 20 / 255).opacity(0.4))
                .frame(width: Self.footShadow.width, height: Self.footShadow.height)
                .at(CGPoint(x: side.poleX - Self.footShadow.width / 2, y: side.poleFoot - Self.footShadow.height / 2), in: box)
            RoundedRectangle(cornerRadius: 1)
                .fill(LinearGradient(colors: [Color(hex: 0x4A3A2C), Color(hex: 0x2C2219)], startPoint: .top, endPoint: .bottom))
                .frame(width: WalkLayout.sidePoleWidth, height: max(0, side.poleFoot - side.poleTop))
                .rotationEffect(.degrees(side.lean), anchor: .bottom)
                .at(CGPoint(x: side.poleX - WalkLayout.sidePoleWidth / 2, y: side.poleTop), in: box)
            ForEach(Array(side.pennants.enumerated()), id: \.offset) { _, pennant in
                WalkPennant()
                    .fill(WalkPalette.level(pennant.level))
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
