#if os(iOS)
import SwiftUI
import UIKit

/// The walk's one control, drawn on the stage (contract §7): the 300 × 300 dial
/// around the light with its ring, ticks and needle; the breathing light at
/// (195, 678) with what holding it does at its centre; the compass points while the
/// light is held or open (at most three: `WalkCopy.points`; the veil behind them is the
/// scene's); and the flag that rises out of it while speaking. Touches go to the model as
/// stage points; the reducer decides what they mean. While the field is open the light
/// stands aside (`WalkState.showsLight`): nothing of it is drawn, read or touched.
struct WalkOrbView: View {
    let model: WalkModel
    @Environment(\.walkStage) private var stage
    /// When the current press began, and whether it began on the light.
    @State private var pressStart: Date?
    @State private var pressOnLight = false
    /// True while a press is down; it falls back on its own when the system cancels the gesture.
    @GestureState private var pressing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let dial = CGRect(x: WalkOrb.centre.x - 150, y: WalkOrb.centre.y - 150, width: 300, height: 300)

    init(model: WalkModel) {
        self.model = model
    }

    var body: some View {
        let s = model.state
        let points = WalkCopy.points(s, model.periods)
        let showsPoints = s.showsPoints
        let layout = model.layout(wing: stage.wing)
        ZStack(alignment: .topLeading) {
            dial(needleDown: layout.needleDown, pulses: s.teaching && !reduceMotion)
                .frame(width: Self.dial.width, height: Self.dial.height)
                .offset(x: Self.dial.minX, y: Self.dial.minY)
                .allowsHitTesting(false)

            // The spoken flag (S25) stands where the layout keeps it clear of every post, above the light.
            if let live = liveWords(s.orb), let frame = layout.spokenFlag {
                WalkLiveFlag(text: live, colour: WalkPalette.level(s.level ?? .year))
                    .frame(width: frame.width, height: frame.height)
                    .offset(x: frame.minX, y: frame.minY)
                    .allowsHitTesting(false)
            }

            light(active: isActive(s.orb), speaking: isSpeaking(s.orb), symbol: s.lightSymbol)
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
                    WalkPointView(point: point, label: WalkCopy.pointLabel(point, s), hot: s.orb == .holding(hover: point.at)) {
                        model.send(.point(point.at))
                    }
                    .position(WalkOrb.position(of: point.at))
                    .transition(reduceMotion ? .opacity
                        : .scale(scale: 0.4).combined(with: .opacity)
                            .animation(.timingCurve(0.2, 0.9, 0.3, 1.2, duration: 0.26)))
                    // Its words, line by line where the layout puts them: a tap on them chooses it too.
                    ForEach(Array(WalkLayout.pointWords(point, among: points.map(\.at)).enumerated()), id: \.offset) { _, line in
                        // The tap is the line's own frame, set before it is placed (`.position` fills the stage).
                        WalkPointLine(line: line)
                            .frame(width: line.frame.width, height: line.frame.height)
                            .contentShape(Rectangle())
                            .onTapGesture { model.send(.point(point.at)) }
                            .accessibilityHidden(true)            // the disc carries the label and the second line
                            .position(x: line.frame.midX, y: line.frame.midY)
                            .transition(.opacity.animation(.easeOut(duration: 0.2)))
                    }
                }
            }
        }
        .frame(width: WalkArt.stageSize.width, height: WalkArt.stageSize.height,
               alignment: .topLeading)
        .opacity(s.showsLight ? 1 : 0)
        .allowsHitTesting(s.showsLight)
        .accessibilityHidden(!s.showsLight)
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
        .onChange(of: s) { old, new in
            // The lesson, read once as it appears.
            if new.teaching && !old.teaching {
                UIAccessibility.post(notification: .announcement, argument: WalkCopy.teaching(new).joined(separator: " "))
            }
            // The flag's words, spoken once, politely, as they are let go (`WalkCopy.announcement`).
            guard let words = WalkCopy.announcement(from: old, to: new) else { return }
            let announcement = NSAttributedString(string: words,
                                                  attributes: [.accessibilitySpeechAnnouncementPriority: UIAccessibilityPriority.low])
            UIAccessibility.post(notification: .announcement, argument: announcement)
        }
    }

    // MARK: VoiceOver

    /// The light as one button: a double-tap is a tap (it opens the points, or closes them),
    /// and each compass point is one of its actions (no more than the points offer: Back, Next and
    /// Leave for now are the top row's and the foot's own buttons), so nothing needs a press and hold.
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
        .accessibilityAddTraits(s.holdListens ? .startsMediaSession : [])
        .walkAccessibilityHint(WalkCopy.hint(s))
        .accessibilityActions {
            ForEach(points, id: \.at) { point in
                Button(WalkCopy.pointLabel(point, s)) {
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

    /// The ring, four ticks and the needle, in dial coordinates (centre 150, 150). The open
    /// compass has the veil behind it (no pale wash, which white words cannot be read on).
    private func dial(needleDown: Bool, pulses: Bool) -> some View {
        ZStack {
            // While the light is taught the ring pulses slowly (not with Reduce Motion).
            TimelineView(.animation(minimumInterval: nil, paused: !pulses)) { timeline in
                let wave = pulses ? 0.5 - 0.5 * cos(2 * .pi * timeline.date.timeIntervalSinceReferenceDate / 1.8) : 0
                Circle()
                    .stroke(.white.opacity(0.55 + 0.4 * wave), lineWidth: 1 + 1.5 * wave)
                    .frame(width: 132, height: 132)
                    .scaleEffect(1 + 0.06 * wave)
            }
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
    private func light(active: Bool, speaking: Bool, symbol: String?) -> some View {
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
                // What holding does, at the light's centre: a microphone, or a keyboard once speech is off.
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 26, weight: .regular))
                        .foregroundStyle(WalkPalette.ink.opacity(0.38))
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.2), value: symbol)
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

/// One compass point: a glowing disc with its symbol at the point's place. Its words are drawn
/// apart (`WalkPointLine`), where `WalkLayout.pointWords` puts them. The hovered one grows.
struct WalkPointView: View {
    let point: WalkCopy.Point
    /// What VoiceOver calls it (`WalkCopy.pointLabel`: Undo says what it undoes).
    let label: String
    let hot: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
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
            .frame(width: WalkOrb.pointDisc, height: WalkOrb.pointDisc)
            .contentShape(Circle())
            .animation(.easeOut(duration: 0.16), value: hot)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .walkAccessibilityHint(point.detail)
        .accessibilityIdentifier("walk.point.\(point.at.rawValue)")
    }
}

/// One line of a point's words: the label in white, or its second line at 13 pt and 90% white,
/// never dimmed further. Left-side points' words read from the margin, right-side ones to it.
struct WalkPointLine: View {
    let line: WalkLayout.PointLine

    var body: some View {
        Text(line.text)
            .font(line.detail ? .custom("DMSans-Regular", size: 13) : .custom("DMSans-SemiBold", size: 12))
            .foregroundStyle(.white.opacity(line.detail ? 0.9 : 1))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            // A close halo of the ground colour under the usual glow, so a word over the veiled
            // mountain (a kept area's pill, a flag) still reads as one clear line.
            .shadow(color: WalkPalette.ground.opacity(0.95), radius: 2.5)
            .walkGlow()
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The flag of the words being spoken (S25): one cloth in the step's level's colour at the layout's
/// `spokenFlag` frame (150 × 36, above the light, clear of every post), holding one line of the
/// newest words, cut at the head (no caret: that means typing). It unfurls from its left edge (with
/// Reduce Motion it fades in instead).
struct WalkLiveFlag: View {
    let text: String
    let colour: Color
    @State private var clothOut = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Text(text)
            .font(.custom("DMSans-SemiBold", fixedSize: 13))
            .foregroundStyle(.white)
            .lineLimit(1)
            .truncationMode(.head)
            .padding(EdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 18))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(WalkSwallowtail().fill(colour))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(text)
            // It unfurls from its left edge; with Reduce Motion it only fades in, in the cross-fade's time.
            .scaleEffect(x: clothOut || reduceMotion ? 1 : 0, y: 1, anchor: .leading)
            .opacity(clothOut || !reduceMotion ? 1 : 0)
            .shadow(color: WalkPalette.warmGlow.opacity(0.9), radius: 5)
            .onAppear {
                withAnimation(reduceMotion ? WalkSceneView.crossFade : .easeOut(duration: 0.4)) { clothOut = true }
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
