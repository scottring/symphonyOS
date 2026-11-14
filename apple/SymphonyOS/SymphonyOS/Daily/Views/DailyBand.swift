#if os(iOS)
import SwiftUI

/// The band of scenery at the top of Today and Week: the walk's square overlook painting
/// at `picture` (page points) on the sky, cut off at `height`. `veil` darkens it from the
/// top with navy (Week's band carries its flags' words on it); 0 draws none.
struct DailyBand: View {
    let picture: CGRect
    let height: CGFloat
    var veil: Double = 0

    init(picture: CGRect, height: CGFloat, veil: Double = 0) {
        self.picture = picture
        self.height = height
        self.veil = veil
    }

    /// The veil's fade, as the Week board draws it: full at 22 % of 180 points, gone by 180.
    private static let veilDepth: CGFloat = 180

    var body: some View {
        ZStack(alignment: .topLeading) {
            DailyPalette.sky
            Image(WalkArt.overlookSquare.imageName)
                .resizable()
                .interpolation(.high)
                .frame(width: picture.width, height: picture.height)
                .offset(x: picture.minX, y: picture.minY)
            if veil > 0 {
                LinearGradient(stops: [.init(color: DailyPalette.navy.opacity(veil), location: 0),
                                       .init(color: DailyPalette.navy.opacity(veil), location: 0.22),
                                       .init(color: DailyPalette.navy.opacity(0), location: 1)],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: min(height, Self.veilDepth))
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .frame(height: height, alignment: .topLeading)
        .clipped()
        .accessibilityHidden(true)
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
