#if os(iOS)
import SwiftUI

/// The band of scenery at the top of Today and Week: the page's own square cut of the tall
/// overlook painting (`cut`) at `picture` (page points) on the sky, cut off at `height`.
/// `veil` darkens it from the top with navy (Week's band carries its flags' words on it); 0 draws none.
struct DailyBand: View {
    let picture: CGRect
    let cut: WalkArt.Cut
    let height: CGFloat
    var veil: Double = 0

    init(picture: CGRect, cut: WalkArt.Cut, height: CGFloat, veil: Double = 0) {
        self.picture = picture
        self.cut = cut
        self.height = height
        self.veil = veil
    }

    /// The veil's fade, as the Week board draws it: full at 22 % of 180 points, gone by 180.
    private static let veilDepth: CGFloat = 180

    var body: some View {
        ZStack(alignment: .topLeading) {
            DailyPalette.sky
            let drawn = cut.drawn(in: picture)
            Image(cut.imageName)
                .resizable()
                .interpolation(.high)
                .frame(width: drawn.width, height: drawn.height)
                .offset(x: drawn.minX, y: drawn.minY)
            if veil > 0 {
                LinearGradient(stops: [.init(color: DailyPalette.navy.opacity(veil), location: 0),
                                       .init(color: DailyPalette.navy.opacity(veil), location: 0.22),
                                       .init(color: DailyPalette.navy.opacity(0), location: 1)],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: min(height, Self.veilDepth))
            }
        }
        // minWidth 0: the picture is wider than the window, and must not make the band (and so
        // the page's stack, and every flexible piece in it, such as the sheet) wider than the window.
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .topLeading)
        .frame(height: height, alignment: .topLeading)
        .clipped()
        .accessibilityHidden(true)
    }
}

/// Week's band flags: up to two of this month's goals, each the person's own title on a small
/// cloth on the walk's pole, standing as `DailyMetrics.bandFlags` plants them (never ruled: each
/// pole leans about its foot, its cloth tilts the other way and rides on the pole's top). The cloth
/// is 32 high; its touch shape is at least 44 × 44. A tap on one opens Month (`open`).
struct DailyBandFlags: View {
    let flags: [DailyMetrics.BandFlag]
    let open: () -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(flags) { flag in
                WalkPoleView(height: flag.pole.height, pale: false)
                    .rotationEffect(.degrees(flag.lean), anchor: .bottom)
                    .offset(x: flag.pole.midX - 9, y: flag.pole.minY)
                    .accessibilityHidden(true)
                cloth(flag)
            }
        }
        .dynamicTypeSize(...DailyPalette.largestChrome)        // cloths of the board's size
    }

    private func cloth(_ flag: DailyMetrics.BandFlag) -> some View {
        let touch = CGSize(width: max(flag.cloth.width, DailyMetrics.minTouch), height: max(flag.cloth.height, DailyMetrics.minTouch))
        // The pole's top, moved by its lean: the cloth stays on it.
        let r = flag.lean * .pi / 180
        let dx = flag.pole.height * CGFloat(sin(r)), dy = flag.pole.height * CGFloat(1 - cos(r))
        return Button(action: open) {
            Text(flag.title)
                .font(DailyPalette.sansMedium(12.5))
                .foregroundStyle(.white)
                .lineLimit(1)
                .truncationMode(.tail)
                .padding(.horizontal, 9)
                .frame(width: flag.cloth.width, height: flag.cloth.height - 6)
                .frame(width: flag.cloth.width, height: flag.cloth.height, alignment: .top)
                .background(WalkNotchedCloth(notch: 5).fill(WalkPalette.level(.month)))
                .walkBannerShadow(glows: false)
                .rotationEffect(.degrees(flag.tilt))
                .frame(width: touch.width, height: touch.height)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: flag.cloth.midX - touch.width / 2 + dx, y: flag.cloth.midY - touch.height / 2 + dy)
        .accessibilityLabel(flag.title)
        .accessibilityHint(DailyCopy.flagOpensMonth)
        .accessibilityIdentifier("daily.week.flag")
    }
}

/// The walk's top shade behind the row of words: its ground colour at `DailyMetrics.shadeOpacity`
/// from the page's top to `solid` (the row's foot), fading to clear by `height`, on every shape.
struct DailyTopShade: View {
    let solid: CGFloat
    let height: CGFloat

    var body: some View {
        let a = DailyMetrics.shadeOpacity
        LinearGradient(stops: [.init(color: WalkPalette.ground.opacity(a), location: 0),
                               .init(color: WalkPalette.ground.opacity(a), location: solid / height),
                               .init(color: WalkPalette.ground.opacity(0), location: 1)],
                       startPoint: .top, endPoint: .bottom)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
#endif
