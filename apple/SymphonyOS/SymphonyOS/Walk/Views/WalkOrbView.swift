#if os(iOS)
import SwiftUI
import UIKit

/// The walk's one control, drawn on the stage (contract §7): the 300 × 300 dial
/// at (45, 528) with its wash, ring, ticks and needle; the breathing light at
/// (195, 678); the compass points while the light is held or open; and the
/// flag that rises out of it while speaking. Touches go to the model as stage
/// points; the reducer decides what they mean.
struct WalkOrbView: View {
    let model: WalkModel
    @Environment(\.walkStage) private var stage
    /// When the current press began, and whether it began on the light.
    @State private var pressStart: Date?
    @State private var pressOnLight = false
    /// True while a press is down; it falls back on its own when the system cancels the gesture.
    @GestureState private var pressing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let dial = CGRect(x: 45, y: 528, width: 300, height: 300)

    init(model: WalkModel) {
        self.model = model
    }

    var body: some View {
        let s = model.state
        let points = WalkCopy.points(s)
        let showsPoints = s.showsPoints
        ZStack(alignment: .topLeading) {
            dial(needleDown: model.layout.needleDown, wash: showsPoints)
                .frame(width: Self.dial.width, height: Self.dial.height)
                .offset(x: Self.dial.minX, y: Self.dial.minY)
                .allowsHitTesting(false)

            if let live = liveWords(s.orb) {
                WalkLiveFlag(text: live, colour: WalkPalette.level(s.level ?? .year))
                    .offset(x: WalkOrb.centre.x, y: Self.dial.minY + 18)
                    .allowsHitTesting(false)
            }

            light(active: isActive(s.orb), speaking: isSpeaking(s.orb))
                .position(WalkOrb.centre)
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            Circle()
                .fill(.clear)
                .frame(width: 2 * WalkOrb.touchRadius, height: 2 * WalkOrb.touchRadius)
                .contentShape(Circle())
                .position(WalkOrb.centre)
                .gesture(press)
                .accessibilityHidden(true)

            // What VoiceOver finds in the light's place: a separate element that takes no touch,
            // so its label and hint can change during a press without disturbing the press.
            orbForVoiceOver(s, points)
                .position(WalkOrb.centre)

            if showsPoints {
                ForEach(points, id: \.at) { point in
                    WalkPointView(point: point, hot: s.orb == .holding(hover: point.at)) {
                        model.send(.point(point.at))
                    }
                    .position(WalkOrb.position(of: point.at))
                    .transition(reduceMotion ? .opacity
                        : .scale(scale: 0.4).combined(with: .opacity)
                            .animation(.timingCurve(0.2, 0.9, 0.3, 1.2, duration: 0.26)))
                }
            }
        }
        .frame(width: WalkArt.overlookSquare.stage.width, height: WalkArt.overlookSquare.stage.height,
               alignment: .topLeading)
        .onDisappear {
            // Gone mid-press: the release will never come, so the hold must not start listening.
            guard pressStart != nil else { return }
            pressStart = nil
            if pressOnLight { model.send(.orbCancelled) }
        }
        .onChange(of: pressing) { _, down in
            // The press went away without ending: the system took the touch.
            guard !down, pressStart != nil else { return }
            pressStart = nil
            if pressOnLight { model.send(.orbCancelled) }
        }
        .onChange(of: s.orb) { old, new in
            // The flag's words, spoken once, politely, as the person lets go: never the partial words.
            guard case .finishing(let words) = new, !isFinishing(old), !words.isEmpty else { return }
            let announcement = NSAttributedString(string: words,
                                                  attributes: [.accessibilitySpeechAnnouncementPriority: UIAccessibilityPriority.low])
            UIAccessibility.post(notification: .announcement, argument: announcement)
        }
    }

    private func isFinishing(_ orb: WalkState.Orb) -> Bool {
        if case .finishing = orb { return true }
        return false
    }

    // MARK: VoiceOver

    /// The light as one button: a double-tap is a tap (it opens the points, or closes them),
    /// and each compass point is one of its actions, so nothing needs a press and hold.
    private func orbForVoiceOver(_ s: WalkState, _ points: [WalkCopy.Point]) -> some View {
        Button {
            model.send(.orbDown)
            model.send(.orbUp(heldMs: 0))
        } label: {
            Color.clear
                .frame(width: 2 * WalkOrb.touchRadius, height: 2 * WalkOrb.touchRadius)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .allowsHitTesting(false)
        .accessibilityIdentifier("walk.orb")
        .accessibilityLabel(WalkCopy.orbAccessibilityLabel(s))
        .walkAccessibilityHint(WalkCopy.hint(s))
        .accessibilityActions {
            ForEach(points, id: \.at) { point in
                Button(point.label) {
                    // With the points out, choosing one is a tap on it, which also puts them away.
                    if model.state.orb == .open {
                        model.send(.point(point.at))
                    } else {
                        model.choose(point.action)
                    }
                }
            }
        }
    }

    // MARK: The touch

    private var press: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named("walk.device"))
            .updating($pressing) { _, down, _ in down = true }
            .onChanged { value in
                let point = stage.toStage(value.location)
                guard pressStart != nil else {
                    pressStart = value.time
                    pressOnLight = WalkOrb.hits(point)
                    if pressOnLight { model.send(.orbDown) }
                    return
                }
                if pressOnLight { model.send(.orbMoved(point)) }
            }
            .onEnded { value in
                guard let start = pressStart else { return }
                pressStart = nil
                guard pressOnLight else { return }
                model.send(.orbUp(heldMs: max(0, Int(value.time.timeIntervalSince(start) * 1000))))
            }
    }

    private func isActive(_ orb: WalkState.Orb) -> Bool {
        switch orb {
        case .holding, .speaking, .finishing: return true
        case .idle, .open: return false
        }
    }

    /// Let go and waiting for the last words looks just like speaking: the flag stays up.
    private func isSpeaking(_ orb: WalkState.Orb) -> Bool {
        liveWords(orb) != nil
    }

    private func liveWords(_ orb: WalkState.Orb) -> String? {
        switch orb {
        case .speaking(let live), .finishing(let live): return live
        case .idle, .holding, .open: return nil
        }
    }

    // MARK: The dial

    /// The wash behind the points, the ring, four ticks and the needle, in dial coordinates (centre 150, 150).
    private func dial(needleDown: Bool, wash: Bool) -> some View {
        ZStack {
            Circle()
                .fill(RadialGradient(stops: [.init(color: WalkPalette.washLight.opacity(0.55), location: 0),
                                             .init(color: WalkPalette.washLight.opacity(0.35), location: 0.45),
                                             .init(color: WalkPalette.washLight.opacity(0), location: 0.72)],
                                     center: .center, startRadius: 0, endRadius: 150 * 2.squareRoot()))
                .opacity(wash ? 1 : 0)
                .animation(.easeOut(duration: 0.22), value: wash)
            Circle()
                .stroke(.white.opacity(0.55), lineWidth: 1)
                .frame(width: 132, height: 132)
            Path { p in
                p.move(to: CGPoint(x: 150, y: 80)); p.addLine(to: CGPoint(x: 150, y: 88))
                p.move(to: CGPoint(x: 150, y: 212)); p.addLine(to: CGPoint(x: 150, y: 220))
                p.move(to: CGPoint(x: 80, y: 150)); p.addLine(to: CGPoint(x: 88, y: 150))
                p.move(to: CGPoint(x: 212, y: 150)); p.addLine(to: CGPoint(x: 220, y: 150))
            }
            .stroke(.white.opacity(0.8), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
            WalkNeedle(down: needleDown)
                .fill(needleDown ? WalkPalette.needleDown : .white.opacity(0.75))
                .animation(.easeInOut(duration: 0.4), value: needleDown)
        }
        .frame(width: 300, height: 300)
    }

    // MARK: The light

    /// The halo, the ripples while speaking, the body and its highlight; it breathes
    /// slowly at rest and quickly while held, and grows to 1.1 while held.
    /// With Reduce Motion it holds still at the middle of a breath, with no ripples.
    private func light(active: Bool, speaking: Bool) -> some View {
        TimelineView(.animation(minimumInterval: nil, paused: reduceMotion)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let period = active ? 1.1 : 4.5
            let breath = reduceMotion ? 0.5 : 0.5 - 0.5 * cos(2 * .pi * t / period)      // 0 → 1 → 0, ease in and out
            ZStack {
                Circle()
                    .fill(RadialGradient(stops: [.init(color: WalkPalette.haloInner.opacity(0.75), location: 0),
                                                 .init(color: WalkPalette.haloOuter.opacity(0.3), location: 0.42),
                                                 .init(color: WalkPalette.haloOuter.opacity(0), location: 0.7)],
                                         center: .center, startRadius: 0, endRadius: 86 * 2.squareRoot()))
                    .frame(width: 172, height: 172)
                    .scaleEffect(0.94 + 0.16 * breath)
                    .opacity(0.65 + 0.35 * breath)
                if speaking && !reduceMotion {
                    ripple(t, delay: 0)
                    ripple(t, delay: 0.8)
                }
                orbBody(scale: 1 + 0.05 * breath)
            }
        }
        .scaleEffect(active ? 1.1 : 1)
        .animation(.easeOut(duration: 0.2), value: active)
        .frame(width: 172, height: 172)
    }

    /// A ring that grows from the light and fades, every 1.6 s.
    private func ripple(_ t: TimeInterval, delay: Double) -> some View {
        let phase = ((t - delay).truncatingRemainder(dividingBy: 1.6) + 1.6).truncatingRemainder(dividingBy: 1.6) / 1.6
        let eased = 1 - pow(1 - phase, 2)                                // ease out
        return Circle()
            .stroke(WalkPalette.ripple.opacity(0.9), lineWidth: 2)
            .frame(width: 96, height: 96)
            .scaleEffect(1 + 1.1 * eased)
            .opacity(0.75 * (1 - eased))
    }

    private func orbBody(scale: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            Circle()
                .fill(RadialGradient(stops: [.init(color: .white, location: 0),
                                             .init(color: Color(hex: 0xFFF7E0), location: 0.2),
                                             .init(color: Color(hex: 0xF8E2AD), location: 0.48),
                                             .init(color: Color(hex: 0xEBBF72), location: 0.76),
                                             .init(color: Color(hex: 0xDDA152), location: 1)],
                                     center: UnitPoint(x: 0.38, y: 0.30), startRadius: 0, endRadius: 89.8)
                    .shadow(.inner(color: WalkPalette.orbInnerShade.opacity(0.3), radius: 10, x: 0, y: -10))
                    .shadow(.inner(color: .white.opacity(0.8), radius: 5, x: 0, y: 4)))
                .shadow(color: WalkPalette.orbGlow.opacity(0.85), radius: 18)
                .shadow(color: WalkPalette.orbGlow.opacity(0.5), radius: 45)
            // The highlight: a soft white blob, drawn as a fading gradient rather than a blur.
            Ellipse()
                .fill(RadialGradient(colors: [.white.opacity(0.8), .white.opacity(0)], center: .center,
                                     startRadius: 0, endRadius: 16))
                .scaleEffect(x: 1, y: 18 / 32)
                .frame(width: 32, height: 18)
                .offset(x: 20, y: 13)
        }
        .frame(width: 96, height: 96)
        .scaleEffect(scale)
    }
}

extension WalkPalette {
    static let washLight = Color(red: 1, green: 250 / 255, blue: 236 / 255)
    static let haloInner = Color(red: 1, green: 238 / 255, blue: 196 / 255)
    static let haloOuter = Color(red: 1, green: 226 / 255, blue: 170 / 255)
    static let warmGlow = Color(red: 1, green: 226 / 255, blue: 160 / 255)
    static let ripple = Color(red: 1, green: 230 / 255, blue: 180 / 255)
    static let orbGlow = Color(red: 1, green: 214 / 255, blue: 140 / 255)
    static let orbInnerShade = Color(red: 185 / 255, green: 118 / 255, blue: 40 / 255)
    static let needleDown = Color(red: 168 / 255, green: 69 / 255, blue: 44 / 255).opacity(0.9)
    static let discMid = Color(red: 1, green: 246 / 255, blue: 222 / 255)
    static let discEdge = Color(red: 1, green: 236 / 255, blue: 196 / 255)
}

/// The needle: a small triangle pointing down toward today, or up.
struct WalkNeedle: Shape {
    var down: Bool

    func path(in rect: CGRect) -> Path {
        var p = Path()
        if down {
            p.move(to: CGPoint(x: 150, y: 214)); p.addLine(to: CGPoint(x: 145, y: 202)); p.addLine(to: CGPoint(x: 155, y: 202))
        } else {
            p.move(to: CGPoint(x: 150, y: 86)); p.addLine(to: CGPoint(x: 145, y: 98)); p.addLine(to: CGPoint(x: 155, y: 98))
        }
        p.closeSubpath()
        return p
    }
}

/// One compass point: a glowing disc with its symbol, and its label below; the
/// pair is centred on the point's place, as the mockup's is. The hovered one grows.
struct WalkPointView: View {
    let point: WalkCopy.Point
    let hot: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(RadialGradient(stops: [.init(color: .white.opacity(hot ? 1 : 0.92), location: 0),
                                                     .init(color: WalkPalette.discMid.opacity(hot ? 0.95 : 0.7), location: 0.6),
                                                     .init(color: WalkPalette.discEdge.opacity(0), location: 1)],
                                             center: UnitPoint(x: 0.4, y: 0.35), startRadius: 0,
                                             endRadius: (hot ? 54 : 46) * 0.885))
                        .shadow(color: WalkPalette.warmGlow.opacity(hot ? 0.95 : 0.6), radius: hot ? 14 : 8)
                    // The mockup's icons are 20 × 20 boxes of thin strokes; a symbol at 18 fills one alike.
                    Image(systemName: point.symbol)
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(WalkPalette.ink)
                }
                .frame(width: hot ? 54 : 46, height: hot ? 54 : 46)
                Text(point.label)
                    .font(.custom("DMSans-SemiBold", size: 12))     // the contract's 700: no Bold face is bundled
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .fixedSize()
                    .walkGlow()
            }
            .animation(.easeOut(duration: 0.16), value: hot)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(point.label)
    }
}

/// The flag rising out of the light while the person speaks (contract §7 "Live flag"):
/// a pole 86 tall standing on the light, and a swallow-tailed cloth unfurling from
/// its top with the words so far and a blinking caret. Its origin is the pole's top.
struct WalkLiveFlag: View {
    let text: String
    let colour: Color
    @State private var poleUp = false
    @State private var clothOut = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 186, not the contract's 220: from x 197 a 220-wide cloth would run off the stage's right edge.
    static let maxClothWidth: CGFloat = 186

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 2)
                .fill(LinearGradient(colors: [Color(hex: 0x4A3A2C), Color(hex: 0x2C2219)],
                                     startPoint: .leading, endPoint: .trailing))
                .frame(width: 3, height: 86)
                .scaleEffect(x: 1, y: poleUp ? 1 : 0, anchor: .bottom)
                .offset(x: -1.5)
                .accessibilityHidden(true)
            cloth
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
                .scaleEffect(x: clothOut ? 1 : 0, y: 1, anchor: .leading)
                .shadow(color: WalkPalette.warmGlow.opacity(0.9), radius: 5)
                .offset(x: 2, y: 2)
        }
        .frame(width: 0, height: 86, alignment: .topLeading)
        .onAppear {
            // With Reduce Motion both arrive together in the cross-fade's time.
            withAnimation(reduceMotion ? WalkSceneView.crossFade : .easeOut(duration: 0.38)) { poleUp = true }
            withAnimation(reduceMotion ? WalkSceneView.crossFade : .easeOut(duration: 0.5).delay(0.3)) { clothOut = true }
        }
    }

    private var cloth: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { timeline in
            let caretOn = Int(timeline.date.timeIntervalSinceReferenceDate * 2) % 2 == 0
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(text)
                    .font(.custom("DMSans-SemiBold", size: 14))
                    .lineSpacing(1)
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .truncationMode(.head)
                Rectangle()
                    .fill(.white)
                    .frame(width: 2, height: 14)
                    .opacity(caretOn ? 1 : 0)
                    .alignmentGuide(.lastTextBaseline) { d in d[.bottom] - 2 }
            }
            .padding(EdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 18))
            .frame(minWidth: 40, alignment: .leading)
            .background(WalkSwallowtail().fill(colour))
            .fixedSize(horizontal: false, vertical: true)
            // Room for the widest cloth; the cloth itself hugs its words.
            .frame(width: Self.maxClothWidth, alignment: .leading)
        }
    }
}

/// A cloth with a swallowtail cut 10 deep into its right edge.
struct WalkSwallowtail: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - 10, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}
#endif
