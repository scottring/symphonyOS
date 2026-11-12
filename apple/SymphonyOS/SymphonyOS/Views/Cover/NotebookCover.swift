#if os(iOS)
import SwiftUI
import UIKit

// MARK: - The cover itself (also the wallpaper)

/// The closed notebook: black, softly grained cover, a hinge at the spine,
/// a blind-debossed mark, and the elastic band near the opening edge.
/// `stretch`/`grabY` bend the band where a finger holds it.
struct NotebookCoverArt: View {
    var stretch: CGFloat = 0
    var grabY: CGFloat = 0.5

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let bandX = NotebookCoverRules.bandX(width: size.width)
            ZStack {
                CoverLeather()
                CoverMark()
                    .position(x: size.width * 0.46, y: size.height * 0.86)
                // The band's shadow on the cover, then the band.
                BandShape(x: bandX, stretch: stretch, grabY: grabY)
                    .stroke(Color.black.opacity(0.55),
                            style: StrokeStyle(lineWidth: NotebookCoverRules.bandWidth(rest: 11, stretch: stretch),
                                               lineCap: .round, lineJoin: .round))
                    .offset(x: 2.5 + stretch * 0.04, y: 1)
                    .blur(radius: 3)
                BandShape(x: bandX, stretch: stretch, grabY: grabY)
                    .stroke(
                        LinearGradient(colors: [Color(hex: 0x0E0D0C), Color(hex: 0x3A3532), Color(hex: 0x0B0A0A)],
                                       startPoint: .leading, endPoint: .trailing),
                        style: StrokeStyle(lineWidth: NotebookCoverRules.bandWidth(rest: 11, stretch: stretch),
                                           lineCap: .round, lineJoin: .round))
                // A thin sheen along the band, as on woven elastic.
                BandShape(x: bandX - 1.5, stretch: stretch, grabY: grabY)
                    .stroke(Color.white.opacity(0.13),
                            style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
            }
        }
        .environment(\.layoutDirection, .leftToRight)
    }
}

/// The band: hooked over the top and bottom edges, pulled sideways at the
/// finger. Animatable, so a let-go wobbles back like real elastic.
struct BandShape: Shape {
    var x: CGFloat
    var stretch: CGFloat
    var grabY: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(stretch, grabY) }
        set { stretch = newValue.first; grabY = newValue.second }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let top = CGPoint(x: x, y: rect.minY - 24)
        let bottom = CGPoint(x: x, y: rect.maxY + 24)
        let grab = CGPoint(x: x + stretch, y: rect.minY + rect.height * min(max(grabY, 0.08), 0.92))
        path.move(to: top)
        // Nearly straight runs to the finger, rounded where the band wraps it.
        path.addQuadCurve(to: grab, control: CGPoint(x: x + stretch * 0.92, y: grab.y - (grab.y - top.y) * 0.12))
        path.addQuadCurve(to: bottom, control: CGPoint(x: x + stretch * 0.92, y: grab.y + (bottom.y - grab.y) * 0.12))
        return path
    }
}

/// The black cover: warm near-black, a soft light from the top left, a
/// fine grain, and the hinge shading along the spine.
private struct CoverLeather: View {
    var body: some View {
        ZStack {
            Color(hex: 0x1C1A18)
            LinearGradient(colors: [Color.white.opacity(0.07), .clear, Color.black.opacity(0.25)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            CoverGrain()
            // The spine's hinge: a crease a little in from the left edge.
            HStack(spacing: 0) {
                LinearGradient(colors: [Color.black.opacity(0.45), Color.black.opacity(0.1)],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: 14)
                Rectangle().fill(Color.white.opacity(0.05)).frame(width: 1)
                Rectangle().fill(Color.black.opacity(0.35)).frame(width: 1.5)
                Spacer(minLength: 0)
            }
            // Rounded corners darken at the cover's edges.
            RadialGradient(colors: [.clear, Color.black.opacity(0.35)],
                           center: .center, startRadius: 220, endRadius: 560)
        }
        .drawingGroup()
    }
}

/// Fine pebble grain, the same on every draw (a seeded pattern), so the
/// wallpaper and the in-app cover match.
private struct CoverGrain: View {
    var body: some View {
        Canvas { context, size in
            var seed: UInt64 = 0x5EED_C0FE
            func next() -> CGFloat {
                seed = seed &* 6364136223846793005 &+ 1442695040888963407
                return CGFloat(seed >> 33) / CGFloat(UInt32.max >> 1)
            }
            let count = Int(size.width * size.height / 55)
            for _ in 0..<count {
                let x = next() * size.width, y = next() * size.height
                let r = 0.4 + next() * 0.9
                let light = next() > 0.5
                context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: r, height: r)),
                             with: .color(light ? Color.white.opacity(0.035) : Color.black.opacity(0.18)))
            }
        }
        .allowsHitTesting(false)
    }
}

/// Symphony's name pressed into the cover with no ink: a shade darker than
/// the leather, with a hairline catch of light below.
private struct CoverMark: View {
    var body: some View {
        ZStack {
            Text("Symphony")
                .font(.custom("CrimsonPro-Italic", size: 22))
                .foregroundStyle(Color.white.opacity(0.06))
                .offset(y: 0.8)
            Text("Symphony")
                .font(.custom("CrimsonPro-Italic", size: 22))
                .foregroundStyle(Color.black.opacity(0.45))
        }
        .accessibilityHidden(true)
    }
}

// MARK: - The interactive cover

/// The cover over the whole outside screen. Hook the band with a finger and
/// pull it sideways; let go past the snap point and it snaps back with a
/// thwack, then the cover swings open. Short of that it slides back. A tap
/// on the cover twangs the band, as a hint.
struct NotebookCover: View {
    var onOpen: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stretch: CGFloat = 0
    @State private var grabY: CGFloat = 0.5
    @State private var holding = false
    @State private var opening = false
    @State private var swing: Double = 0
    @State private var fade: Double = 1

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let bandX = NotebookCoverRules.bandX(width: size.width)
            NotebookCoverArt(stretch: stretch, grabY: grabY)
                .contentShape(Rectangle())
                .gesture(bandDrag(size: size, bandX: bandX))
                .simultaneousGesture(TapGesture().onEnded { twang() })
        }
        .ignoresSafeArea()
        .rotation3DEffect(.degrees(swing), axis: (x: 0, y: 1, z: 0), anchor: .leading, perspective: 0.45)
        .opacity(fade)
        .allowsHitTesting(!opening)
        .accessibilityElement()
        .accessibilityLabel("Notebook cover")
        .accessibilityHint("Pull the band aside to open, or double-tap.")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { open() }
    }

    /// Only a finger that starts near the band hooks it.
    private func bandDrag(size: CGSize, bandX: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                guard !opening else { return }
                if !holding {
                    guard abs(value.startLocation.x - bandX) < 44 else { return }
                    holding = true
                    grabY = value.startLocation.y / max(size.height, 1)
                    Haptics.hook()
                }
                let next = NotebookCoverRules.stretch(forDrag: value.translation.width)
                if NotebookCoverRules.snaps(atStretch: next) != NotebookCoverRules.snaps(atStretch: stretch) {
                    Haptics.tension()
                }
                stretch = next
                grabY = min(max(value.location.y / max(size.height, 1), 0.08), 0.92)
            }
            .onEnded { _ in
                guard holding else { return }
                holding = false
                if NotebookCoverRules.snaps(atStretch: stretch) {
                    snapAndOpen()
                } else {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.55)) { stretch = 0 }
                }
            }
    }

    /// Let go far enough: the band snaps back past its rest and wobbles —
    /// a sharp thwack — then the cover swings open on its spine.
    private func snapAndOpen() {
        opening = true
        Haptics.snap()
        withAnimation(.interpolatingSpring(stiffness: 900, damping: 9)) { stretch = 0 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { swingOpen() }
    }

    private func open() {
        guard !opening else { return }
        opening = true
        swingOpen()
    }

    private func swingOpen() {
        if reduceMotion {
            withAnimation(.easeOut(duration: 0.25)) { fade = 0 }
        } else {
            withAnimation(.easeIn(duration: 0.45)) { swing = -88 }
            withAnimation(.easeIn(duration: 0.2).delay(0.3)) { fade = 0 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { onOpen() }
    }

    /// A tap twangs the band a little: here's the thing to pull.
    private func twang() {
        guard !holding, !opening else { return }
        Haptics.hook()
        grabY = 0.5
        withAnimation(.easeOut(duration: 0.08)) { stretch = 16 }
        withAnimation(.interpolatingSpring(stiffness: 700, damping: 7).delay(0.08)) { stretch = 0 }
    }
}

/// The band's feel in the hand.
private enum Haptics {
    static func hook() { UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.6) }
    static func tension() { UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.7) }
    /// A hard crack, then the leather's dull thump a beat later.
    static func snap() {
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 1)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.07) {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred(intensity: 0.55)
        }
    }
}

// MARK: - The wallpaper

/// Draws the closed cover as a still picture the size of the outside
/// screen, for the Lock Screen: locked, the phone looks like the notebook;
/// unlocked, Symphony opens on the same cover. iOS lets no app draw on the
/// Lock Screen itself, so this is the way to get it there.
enum NotebookWallpaper {
    /// The outside screen's size, from the simulator.
    static let outsideScreen = CGSize(width: 466, height: 678)

    @MainActor
    static func image(size: CGSize = outsideScreen, scale: CGFloat = 3) -> UIImage? {
        let renderer = ImageRenderer(content: NotebookCoverArt().frame(width: size.width, height: size.height))
        renderer.scale = scale
        return renderer.uiImage
    }
}
#endif
