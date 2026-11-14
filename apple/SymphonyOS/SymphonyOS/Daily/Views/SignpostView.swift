#if os(iOS)
import SwiftUI

/// The wooden signpost over the scenery: a post, and a gold plank nailed to it by two nail
/// heads on the post's line at the plank's top and bottom edges. The post leans and the
/// plank tilts by the sign's own hand (`Signpost.hand`), about the post's foot and the
/// plank's left end. The plank is one button: a tap follows the sign; a sideways swipe of
/// more than 60 points puts it away for the day and only that (`DailyTodayPage.signGesture`),
/// which VoiceOver offers as an action. Drawn in page points: `metrics.post` and `metrics.plank`
/// are where they stand on the page, everything else is in the plank's own space.
struct SignpostView: View {
    let sign: Signpost.Sign
    let metrics: DailyMetrics.Sign
    var tappable: Bool = true
    let tap: () -> Void
    let putAway: () -> Void

    init(sign: Signpost.Sign, metrics: DailyMetrics.Sign, tappable: Bool = true,
         tap: @escaping () -> Void, putAway: @escaping () -> Void) {
        self.sign = sign
        self.metrics = metrics
        self.tappable = tappable
        self.tap = tap
        self.putAway = putAway
    }

    /// How far the plank has been pulled sideways while a finger drags it.
    @State private var drag: CGFloat = 0
    @State private var pressed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let hand = Signpost.hand(sign.seed)
        ZStack(alignment: .topLeading) {
            post
                .rotationEffect(.degrees(hand.lean), anchor: .bottom)
                .offset(x: metrics.post.minX, y: metrics.post.minY)
                .accessibilityHidden(true)
            plankButton
                .rotationEffect(.degrees(hand.tilt), anchor: .leading)
                .offset(x: metrics.plank.minX + drag, y: metrics.plank.minY)
        }
        // The plank keeps its board size from extra large up (its words shrink to fit before they cut).
        .dynamicTypeSize(...DailyPalette.largestChrome)
    }

    // MARK: The post

    private var post: some View {
        UnevenRoundedRectangle(topLeadingRadius: 3, topTrailingRadius: 3)
            .fill(LinearGradient(colors: [DailyPalette.postLight, DailyPalette.postDark],
                                 startPoint: .leading, endPoint: .trailing))
            .frame(width: metrics.post.width, height: metrics.post.height)
    }

    // MARK: The plank

    /// One gesture for the whole plank, so a touch is either a tap or a swipe, never both:
    /// `DailyTodayPage.signGesture` decides which when the finger lifts.
    private var plankButton: some View {
        plank
            .brightness(pressed ? -0.04 : 0)
            .gesture(touch)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(sign.label)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { act(DailyTodayPage.signGesture(translation: .zero, endedAsDrag: false, tappable: tappable)) }
            .accessibilityAction(named: DailyCopy.putSignAway, putAway)
            .accessibilityIdentifier("daily.signpost")
    }

    private var plank: some View {
        let size = CGSize(width: metrics.plank.width + metrics.point, height: metrics.plank.height)
        return ZStack(alignment: .topLeading) {
            PlankShape(point: metrics.point)
                .fill(DailyPalette.gold)
                .shadow(color: DailyPalette.navy.opacity(0.38), radius: 2.5, x: 0, y: 4)
            // The post seen across the plank, and the two nail heads on it.
            Rectangle()
                .fill(DailyPalette.plankInk.opacity(0.14))
                .frame(width: metrics.strip.width, height: metrics.strip.height)
                .offset(x: metrics.strip.minX, y: metrics.strip.minY)
            ForEach(Array(metrics.nails.enumerated()), id: \.offset) { _, nail in
                NailHead()
                    .frame(width: nail.width, height: nail.height)
                    .offset(x: nail.minX, y: nail.minY)
            }
            PlankShape(point: metrics.point)
                .stroke(DailyPalette.plankInk, lineWidth: 2)
            words
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .contentShape(PlankShape(point: metrics.point))
    }

    /// Eyebrow over title, one line each, shrinking to 0.75 before they cut. With no eyebrow
    /// ("That’s the day." with nothing tomorrow) the title stands in the plank's middle.
    @ViewBuilder private var words: some View {
        let width = metrics.plank.width - metrics.title.x - 6
        if let eyebrow = sign.eyebrow {
            Text(eyebrow.uppercased())
                .font(DailyPalette.sansSemiBold(metrics.eyebrowSize))
                .tracking(1.4)
                .foregroundStyle(DailyPalette.plankEyebrow)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(width: width, alignment: .leading)
                .offset(x: metrics.eyebrow.x, y: metrics.eyebrow.y)
            title(width: width)
                .offset(x: metrics.title.x, y: metrics.title.y)
        } else {
            title(width: width)
                .frame(height: metrics.plank.height)
                .offset(x: metrics.title.x)
        }
    }

    private func title(width: CGFloat) -> some View {
        Text(sign.title)
            .font(DailyPalette.crimson(metrics.titleSize))
            .foregroundStyle(DailyPalette.plankInk)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .frame(width: width, alignment: .leading)
    }

    private var touch: some Gesture {
        // Measured on the screen, not on the plank: the plank follows the finger, so its own
        // space would move with it and the drag would never seem to go anywhere.
        DragGesture(minimumDistance: 0, coordinateSpace: .global)
            .onChanged { value in
                pressed = true
                // The plank follows the finger only once the touch has become a drag.
                drag = DailyTodayPage.isDrag(value.translation) ? value.translation.width : 0
            }
            .onEnded { value in
                act(DailyTodayPage.signGesture(translation: value.translation, endedAsDrag: false, tappable: tappable))
                pressed = false
                withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) { drag = 0 }
            }
    }

    private func act(_ outcome: DailyTodayPage.SignGesture) {
        switch outcome {
        case .followed: tap()
        case .putAway: putAway()
        case .nothing: break
        }
    }
}

/// The plank's outline: square left end with 4-point corners, a point `point` deep at the right.
struct PlankShape: Shape {
    let point: CGFloat
    var corner: CGFloat = 4

    func path(in rect: CGRect) -> Path {
        // The 2-point line is drawn inside the plank's frame.
        let r = rect.insetBy(dx: 1, dy: 1)
        let body = r.maxX - point
        var p = Path()
        p.move(to: CGPoint(x: r.minX + corner, y: r.minY))
        p.addLine(to: CGPoint(x: body, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        p.addLine(to: CGPoint(x: body, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + corner, y: r.maxY))
        p.addArc(tangent1End: CGPoint(x: r.minX, y: r.maxY), tangent2End: CGPoint(x: r.minX, y: r.maxY - corner),
                 radius: corner)
        p.addLine(to: CGPoint(x: r.minX, y: r.minY + corner))
        p.addArc(tangent1End: CGPoint(x: r.minX, y: r.minY), tangent2End: CGPoint(x: r.minX + corner, y: r.minY),
                 radius: corner)
        p.closeSubpath()
        return p
    }
}

/// A nail head: a small domed disc with a dark 1-point rim.
private struct NailHead: View {
    var body: some View {
        Circle()
            .fill(RadialGradient(colors: [DailyPalette.nailLight, DailyPalette.nailDark],
                                 center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 5))
            .overlay(Circle().strokeBorder(DailyPalette.plankInk, lineWidth: 1))
    }
}
#endif
