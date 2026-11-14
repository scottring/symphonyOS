#if os(iOS)
import SwiftUI

// The flags, poles and peak labels, drawn at the size the layout gives them
// in stage points. Colours and paddings are the mockup's (contract §4, §5, §9).
// Nothing here decides anything: a banner draws its `text` and `tag` as given.

enum WalkPalette {
    static let ground = Color(hex: 0x00106E)
    static let gold = Color(hex: 0xF6DFA6)
    static let ink = Color(hex: 0x1F2A2B)
    static let navy = Color(red: 0 / 255, green: 22 / 255, blue: 96 / 255)
    static let navyBand = Color(red: 0 / 255, green: 18 / 255, blue: 96 / 255)
    static let glowShadow = Color(red: 0 / 255, green: 14 / 255, blue: 70 / 255)

    static func level(_ level: WalkLevel) -> Color {
        switch level {
        case .year: return Color(hex: 0xA8452C)
        case .season: return Color(hex: 0xB0701C)
        case .month: return Color(hex: 0x2F6B52)
        case .week: return Color(hex: 0x2F5F8A)
        case .today: return Color(hex: 0x6B4A8C)
        }
    }
}

extension View {
    /// White text with the mockup's soft two-layer dark shadow (`.wk-glow`).
    func walkGlow() -> some View {
        shadow(color: WalkPalette.glowShadow.opacity(0.75), radius: 7, x: 0, y: 1)
            .shadow(color: WalkPalette.glowShadow.opacity(0.6), radius: 1.5, x: 0, y: 0)
    }

    /// A focused or selected flag glows warm instead of casting a shadow.
    @ViewBuilder func walkBannerShadow(glows: Bool) -> some View {
        if glows {
            shadow(color: Color(red: 1, green: 226 / 255, blue: 160 / 255), radius: 3.5)
                .shadow(color: Color(red: 1, green: 214 / 255, blue: 140 / 255).opacity(0.9), radius: 7)
        } else {
            shadow(color: Color(white: 20 / 255).opacity(0.35), radius: 1.5, x: 0, y: 2)
        }
    }
}

/// A cloth with a V cut into the bottom edge.
struct WalkNotchedCloth: InsettableShape {
    var notch: CGFloat
    var inset: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: inset, dy: inset)
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.midX, y: r.maxY - notch))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        p.closeSubpath()
        return p
    }

    func inset(by amount: CGFloat) -> WalkNotchedCloth {
        var s = self
        s.inset += amount
        return s
    }
}

/// The small flag: a cloth pointing right from the pole.
struct WalkPennant: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

/// One banner of any kind, at its layout frame's size in stage points. A banner
/// that arrives after the scene is up drops in, as a flag being planted does.
/// With Reduce Motion it does not flutter, and it fades in where it stands.
struct WalkBannerView: View {
    let banner: WalkLayout.Banner
    /// The stage x of the post's pole where the banner meets it; a small flag hangs from it.
    let poleX: CGFloat
    @State private var fluttering = false
    @State private var landed: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(banner: WalkLayout.Banner, poleX: CGFloat, dropsIn: Bool) {
        self.banner = banner
        self.poleX = poleX
        _landed = State(initialValue: !dropsIn)
    }

    private var colour: Color { WalkPalette.level(banner.level) }

    var body: some View {
        cloth
            .frame(width: banner.frame.width, height: banner.frame.height, alignment: .topLeading)
            .modifier(WalkFlutter(degrees: flutters && fluttering ? -2.5 : 0))
            .modifier(WalkDropIn(progress: landed ? 1 : 0, still: reduceMotion))
            // Planted by hand: the post's lean and the cloth's own tilt, about where it meets its pole.
            .rotationEffect(.degrees(banner.turn), anchor: UnitPoint(x: banner.pivotUnit.x, y: banner.pivotUnit.y))
            .onAppear {
                if !landed {
                    withAnimation(reduceMotion ? WalkSceneView.crossFade : .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.7)) { landed = true }
                }
                flutter(!reduceMotion)
            }
            .onChange(of: reduceMotion) { _, still in flutter(!still) }
    }

    /// Starts the slow flutter, or stops it where it stands (Reduce Motion turned on mid-walk).
    private func flutter(_ on: Bool) {
        guard flutters, on else {
            withTransaction(Transaction(animation: nil)) { fluttering = false }
            return
        }
        withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { fluttering = true }
    }

    private var flutters: Bool {
        switch banner.kind {
        case .full, .compact, .ghost: return true
        case .tip, .stub: return false
        }
    }

    @ViewBuilder private var cloth: some View {
        switch banner.kind {
        case .full: full.overlay(alignment: .topTrailing) { moreBadge }
        case .ghost: ghost.overlay(alignment: .topTrailing) { moreBadge }
        case .compact: compact
        case .tip: tip.overlay(alignment: .topLeading) { moreBadge.offset(x: poleX - banner.frame.minX + 26 * banner.frame.height / 20) }
        case .stub(let count): stub(count)
        }
    }

    /// A banner that also stands for older flags says how many ("+n"); a compact one says it after its words.
    @ViewBuilder private var moreBadge: some View {
        if let more = banner.more {
            Text(WalkCopy.more(more))
                .font(.custom("DMSans-SemiBold", size: 10))
                .foregroundStyle(.white)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 3)
                .padding(.vertical, 1)
                .walkGlow()
        }
    }

    private var full: some View {
        VStack(spacing: 2) {
            Text(banner.text)
                .font(.custom("DMSans-SemiBold", size: 13))
                .foregroundStyle(.white)
                .lineLimit(banner.lines)
                .truncationMode(.tail)
                .fixedSize(horizontal: false, vertical: true)
            if let tag = banner.tag {
                Text(tag)
                    .font(.custom("DMSans-SemiBold", size: 10))
                    .tracking(0.8)
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
            }
        }
        .multilineTextAlignment(.center)
        .padding(EdgeInsets(top: 6, leading: 8, bottom: 13, trailing: 8))
        .frame(width: banner.frame.width, height: banner.frame.height, alignment: .top)
        .background(WalkNotchedCloth(notch: 8).fill(colour))
        .walkBannerShadow(glows: banner.glows)
    }

    /// An example: pale cloth, ink words, and a small tag that says what it is and what a tap does
    /// ("EXAMPLE · TAP TO USE", or "TAP TO USE" where the flag is narrow). The tag fits inside the
    /// frame the layout gives (a shallower notch makes the room), so examples take no more space.
    private var ghost: some View {
        VStack(spacing: 0) {
            Text(banner.text)
                .font(.custom("DMSans-SemiBold", size: 13).italic())
                .foregroundStyle(WalkPalette.ink)
                .lineLimit(banner.lines)
                .truncationMode(.tail)
                .fixedSize(horizontal: false, vertical: true)
            Text(WalkLayout.exampleTag(forWidth: banner.frame.width))
                .font(.custom("DMSans-SemiBold", size: 8.5))
                .tracking(0.3)
                .foregroundStyle(WalkPalette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(height: 10)
        }
        .multilineTextAlignment(.center)
        .padding(EdgeInsets(top: 3, leading: 8, bottom: 6, trailing: 8))
        .frame(width: banner.frame.width, height: banner.frame.height, alignment: .top)
        .background {
            // Opaque enough that the ink words read at 4.5:1 or better over any backdrop.
            WalkNotchedCloth(notch: 4).fill(.white.opacity(0.72))
            WalkNotchedCloth(notch: 4).inset(by: 3)
                .stroke(.white.opacity(0.95), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
        }
        .walkBannerShadow(glows: false)
    }

    /// One line, or on Look back up two (`lines`): the words wrap at word boundaries and are cut
    /// only after the last line. It may stand for older flags too: "+n more" after the words.
    private var compact: some View {
        HStack(alignment: .lastTextBaseline, spacing: 4) {
            Text(banner.text)
                .font(.custom("DMSans-SemiBold", size: 11))
                .foregroundStyle(.white)
                .lineLimit(banner.lines)
                .truncationMode(.tail)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)       // let it take its second line
            if let more = banner.more {
                Text(WalkCopy.more(more))
                    .font(.custom("DMSans-SemiBold", size: 10))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .padding(EdgeInsets(top: 3, leading: 6, bottom: 6, trailing: 6))
        .frame(width: banner.frame.width, height: banner.frame.height)
        .background(WalkNotchedCloth(notch: 5).fill(colour))
        .walkBannerShadow(glows: banner.glows)
    }

    /// Contract §5: a 22 × 15 cloth just right of the pole, in a wrap 17 tall
    /// (here the frame, 20 at full size); it grows and shrinks with the frame.
    /// It hangs from the pole itself, from 1.5 to 23.5 right of the pole's centre,
    /// wherever the frame stands: a frame slid in from the stage's edge must not
    /// pull the cloth off its pole.
    private var tip: some View {
        let unit = banner.frame.height / 20
        return WalkPennant()
            .fill(colour)
            .frame(width: 22 * unit, height: 15 * unit)
            .shadow(color: Color(white: 20 / 255).opacity(0.35), radius: 1, x: 0, y: 1)
            .offset(x: poleX - banner.frame.minX + 1.5 * unit, y: 0)
            .frame(width: banner.frame.width, height: banner.frame.height, alignment: .topLeading)
    }

    /// A pennant with how many flags are folded into it.
    private func stub(_ count: Int) -> some View {
        Text(banner.text)
            .font(.custom("DMSans-SemiBold", size: 10))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .padding(.bottom, 4)
            .frame(width: banner.frame.width, height: banner.frame.height)
            .background(WalkNotchedCloth(notch: 4).fill(colour))
            .walkBannerShadow(glows: false)
    }
}

/// The cloth's slow flutter: a skew along y about the centre.
struct WalkFlutter: GeometryEffect {
    var degrees: Double
    var animatableData: Double {
        get { degrees }
        set { degrees = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        let skew = CGAffineTransform(a: 1, b: CGFloat(tan(degrees * .pi / 180)), c: 0, d: 1, tx: 0, ty: 0)
        let t = CGAffineTransform(translationX: -size.width / 2, y: -size.height / 2)
            .concatenating(skew)
            .concatenating(CGAffineTransform(translationX: size.width / 2, y: size.height / 2))
        return ProjectionTransform(t)
    }
}

/// Planting: the flag drops in from above, overshoots a little and settles (contract §5).
/// `still` (Reduce Motion): it only fades in.
struct WalkDropIn: ViewModifier, Animatable {
    var progress: Double
    var still = false
    nonisolated var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        let p = min(max(progress, 0), 1)
        if still { return content.opacity(p).scaleEffect(1).offset(y: 0) }
        let opacity: Double, y: Double, scale: Double
        if p < 0.7 {
            let t = p / 0.7
            opacity = t; y = -46 + 49 * t; scale = 0.7 + 0.33 * t
        } else {
            let t = (p - 0.7) / 0.3
            opacity = 1; y = 3 - 3 * t; scale = 1.03 - 0.03 * t
        }
        return content.opacity(opacity).scaleEffect(scale).offset(y: y)
    }
}

/// A post: the pole from its top banner to the ground, and a small shadow at its foot.
struct WalkPoleView: View {
    let height: CGFloat
    let pale: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                if pale {
                    Rectangle().fill(.white.opacity(0.85))
                } else {
                    Rectangle().fill(LinearGradient(colors: [Color(hex: 0x4A3A2C), Color(hex: 0x2C2219)],
                                                    startPoint: .leading, endPoint: .trailing))
                }
            }
            .frame(width: 3, height: height)
            Ellipse()
                .fill(Color(red: 30 / 255, green: 25 / 255, blue: 20 / 255).opacity(0.4))
                .frame(width: 18, height: 5)
                .offset(y: 3)
        }
        .frame(width: 18, height: height, alignment: .bottom)
    }
}

/// A peak's label: a small marker above a pill (contract §4, lines 274-281).
struct WalkLabelView: View {
    let label: WalkLayout.Label

    var body: some View {
        // The layout's frame includes the label's scale: 30 points tall at full size.
        let unit = label.frame.height / 30
        VStack(spacing: 0) {
            WalkPennant()
                .rotation(.degrees(-90))
                .fill(label.kept || label.focused ? WalkPalette.gold : .white)
                .frame(width: 7, height: 10)
                .frame(width: 10, height: 7)
            HStack(spacing: 3) {
                if let mark {
                    Image(systemName: mark)
                        .font(.system(size: 9, weight: .bold))
                }
                Text(label.name.uppercased())
                    .font(.custom("DMSans-SemiBold", size: 11))
                    .tracking(1.1)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
                .foregroundStyle(ink)
                .padding(.horizontal, 9)
                .frame(height: 23)
                .frame(maxWidth: label.frame.width / unit)
                .fixedSize(horizontal: true, vertical: false)
                .background(pill)
                .shadow(color: label.focused ? Color(red: 1, green: 220 / 255, blue: 150 / 255).opacity(0.95) : .clear,
                        radius: 9)
        }
        .frame(width: label.frame.width / unit, height: 30, alignment: .top)
        .scaleEffect(unit, anchor: .topLeading)
        .frame(width: label.frame.width, height: label.frame.height, alignment: .topLeading)
        .opacity(label.opacity)
    }

    @ViewBuilder private var pill: some View {
        let shape = Capsule()
        if label.focused || (label.ground && label.kept) {
            shape.fill(WalkPalette.gold)
        } else if label.kept {
            shape.fill(WalkPalette.navy.opacity(0.72))
                .overlay(shape.strokeBorder(WalkPalette.gold, lineWidth: 1.5))
        } else if label.ground {
            // A choice not yet made: full contrast, outlined, with a plus.
            shape.fill(WalkPalette.navy.opacity(0.85))
                .overlay(shape.strokeBorder(.white, lineWidth: 1.5))
        } else {
            shape.fill(WalkPalette.navy.opacity(0.55))
        }
    }

    /// On the ground: a plus on an area not yet kept, a checkmark on a kept one.
    private var mark: String? {
        guard label.ground else { return nil }
        return label.kept ? "checkmark" : "plus"
    }

    private var ink: Color {
        if label.focused || (label.ground && label.kept) { return WalkPalette.ink }
        if label.ground { return .white }
        return label.kept ? WalkPalette.gold : .white
    }
}
#endif
