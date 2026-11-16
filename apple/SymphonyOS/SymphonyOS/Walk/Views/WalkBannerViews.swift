#if os(iOS)
import SwiftUI
import UIKit

// The flags, poles and area names, drawn at the frames the layout gives them in stage points.
// Colours and paddings are the approved board's ("The board as numbers"). Nothing here decides
// anything: a banner draws its `text` and `tag` on its `lines`, a label its `words`.

enum WalkPalette {
    static let ground = Color(hex: 0x00106E)
    static let gold = Color(hex: 0xF6DFA6)
    static let ink = Color(hex: 0x1F2A2B)
    static let navy = Color(red: 0 / 255, green: 22 / 255, blue: 96 / 255)
    static let navyBand = Color(red: 0 / 255, green: 18 / 255, blue: 96 / 255)
    static let glowShadow = Color(red: 0 / 255, green: 14 / 255, blue: 70 / 255)

    static func level(_ level: WalkLevel) -> Color { Color(hex: hex(level)) }

    /// A level's colour with its red, green and blue each times `brightness` ("+n more" is the level's at 0.8).
    static func level(_ level: WalkLevel, brightness: Double) -> Color {
        let rgb = hex(level)
        return Color(red: Double((rgb >> 16) & 0xFF) / 255 * brightness, green: Double((rgb >> 8) & 0xFF) / 255 * brightness,
                     blue: Double(rgb & 0xFF) / 255 * brightness)
    }

    private static func hex(_ level: WalkLevel) -> UInt32 {
        switch level {
        case .year: 0xA8452C
        case .season: 0xB0701C
        case .month: 0x2F6B52
        case .week: 0x2F5F8A
        case .today: 0x6B4A8C
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

/// How a cloth's words are set: in the face the layout counted them in (`WalkLayout.Face`), at a
/// fixed size whatever the person's text size, on the layout's own line height, in the cloth's
/// width less the padding the count allowed (S20, F33, F37).
enum WalkClothFace {
    static let name = "DMSans-SemiBold"

    /// The face at its size, fixed: the layout's count holds at every text size.
    static func font(_ face: WalkLayout.Face) -> Font { .custom(name, fixedSize: face.size) }

    /// A line's height on each kind of cloth (`WalkLayout.flagLine`, `parentLine`; 13 on Look back up).
    static func lineHeight(_ face: WalkLayout.Face) -> CGFloat {
        switch face {
        case .flag: WalkLayout.flagLine
        case .parent: WalkLayout.parentLine
        case .lookBack: lookBackLine
        case .tag: WalkLayout.tagLine
        }
    }
    static let lookBackLine: CGFloat = 13

    /// The lines a cloth's words are set on, as the text system sets them in this face at this
    /// width (TextKit, the default paragraph style: what `WalkLayoutTests.theLinesAreTheRealFaces`
    /// holds the layout's count to), at most `limit`. Each line is drawn on its own (F37: so no
    /// character can make a line, or the cloth, taller than the layout's line), which also keeps
    /// the breaks the count was measured with: SwiftUI's own wrapping may move a short last word.
    /// A line that ends at a soft hyphen shows a hyphen (the count allowed for its width); the
    /// last line, where the words need more than `limit`, holds the rest and is cut with an ellipsis.
    @MainActor static func lines(_ text: String, face: WalkLayout.Face, width: CGFloat, limit: Int) -> [String] {
        let key = "\(face)|\(width)|\(limit)|\(text)"
        if let known = cache[key] { return known }
        guard let font = UIFont(name: name, size: face.size), !text.isEmpty, limit > 0 else { return [text] }
        let storage = NSTextStorage(string: text, attributes: [.font: font])
        let manager = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        var ranges: [NSRange] = []
        manager.enumerateLineFragments(forGlyphRange: manager.glyphRange(for: container)) { _, _, _, glyphs, _ in
            ranges.append(manager.characterRange(forGlyphRange: glyphs, actualGlyphRange: nil))
        }
        let whole = text as NSString
        var out: [String] = []
        for (i, range) in ranges.enumerated() {
            if i == limit - 1, ranges.count > limit {
                out.append(drawn(whole.substring(from: range.location), breaks: false))
                break
            }
            out.append(drawn(whole.substring(with: range), breaks: i < ranges.count - 1))
        }
        let lines = out.isEmpty ? [text] : out
        cache[key] = lines
        return lines
    }

    /// One line as drawn: no trailing space; a hyphen where it ends at a soft hyphen (`breaks`);
    /// no other soft hyphen (it has no width and shows nothing inside a line).
    private static func drawn(_ line: String, breaks: Bool) -> String {
        let soft = WalkLayout.softHyphenCharacter
        var trimmed = line.replacingOccurrences(of: "\n", with: " ")
        while let last = trimmed.last, last.isWhitespace { trimmed.removeLast() }
        let hyphen = breaks && trimmed.last == soft
        trimmed.removeAll { $0 == soft }
        return hyphen ? trimmed + "-" : trimmed
    }

    @MainActor private static var cache: [String: [String]] = [:]
}

/// A cloth's words, line by line, each on the layout's line height (F37) in the cloth's inner width.
struct WalkClothWords: View {
    let text: String
    let face: WalkLayout.Face
    /// The cloth's width less the padding its count allowed (`face.inset`).
    let width: CGFloat
    let lines: Int
    var italic = false

    var body: some View {
        let font = WalkClothFace.font(face)
        VStack(spacing: 0) {
            ForEach(Array(WalkClothFace.lines(text, face: face, width: width, limit: lines).enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(italic ? font.italic() : font)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    // Only where SwiftUI sets a line a hair wider than TextKit counted it.
                    .minimumScaleFactor(0.9)
                    .frame(width: width, height: WalkClothFace.lineHeight(face))
            }
        }
    }
}

/// One banner of any kind, at its layout frame's size in stage points. A banner
/// that arrives after the scene is up drops in, as a flag being planted does.
/// With Reduce Motion it does not flutter, and it fades in where it stands.
/// Under the veil on words (`veiled`, F22) its cloth stays and its words are not drawn.
struct WalkBannerView: View {
    let banner: WalkLayout.Banner
    let veiled: Bool
    @State private var fluttering = false
    @State private var landed: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(banner: WalkLayout.Banner, dropsIn: Bool, veiled: Bool = false) {
        self.banner = banner
        self.veiled = veiled
        _landed = State(initialValue: !dropsIn)
    }

    /// A flag's words: 6 above, 12 under (the notch), 8 either side: `18 + 17 × lines` (F31).
    static let flagTop: CGFloat = 6, flagNotch: CGFloat = 8
    /// The goal above: 3 above, 9 under, 6 either side: `12 + 14 × lines`.
    static let parentTop: CGFloat = 3, parentNotch: CGFloat = 5
    /// A Look back up cloth: 4 above, 6 under, 6 either side: `23 + 13 × (lines − 1)`.
    static let lookBackTop: CGFloat = 4, lookBackNotch: CGFloat = 5

    private var colour: Color { WalkPalette.level(banner.level) }
    /// The words' opacity: none under the veil on words.
    private var words: Double { veiled ? 0 : 1 }

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
        case .full, .parent, .compact, .ghost: return true
        case .more: return false
        }
    }

    @ViewBuilder private var cloth: some View {
        switch banner.kind {
        case .full: full
        case .ghost: ghost
        case .parent: parent
        case .compact: compact
        case .more: more
        }
    }

    /// A tag's line (a Week day, FIRST THING, an example's tag): DM Sans SemiBold 11, tracked 0.6.
    private func tagLine(_ tag: String, colour: Color) -> some View {
        Text(tag)
            .font(WalkClothFace.font(.tag))
            .tracking(WalkLayout.Face.tag.tracking)
            .foregroundStyle(colour)
            .lineLimit(1)
            .frame(width: banner.frame.width - WalkLayout.Face.tag.inset, height: WalkLayout.tagLine)
    }

    /// The words of a flag or an example, then its tag, from 6 under the cloth's top.
    private func flagWords(ink: Color, italic: Bool, tagInk: Color) -> some View {
        VStack(spacing: 0) {
            WalkClothWords(text: banner.text, face: .flag, width: banner.frame.width - WalkLayout.Face.flag.inset,
                           lines: banner.lines, italic: italic)
                .foregroundStyle(ink)
            if let tag = banner.tag { tagLine(tag, colour: tagInk) }
        }
        .opacity(words)
        .padding(.top, Self.flagTop)
        .frame(width: banner.frame.width, height: banner.frame.height, alignment: .top)
    }

    private var full: some View {
        flagWords(ink: .white, italic: false, tagInk: .white.opacity(0.85))
            .background(WalkNotchedCloth(notch: Self.flagNotch).fill(colour))
            .walkBannerShadow(glows: banner.glows)
    }

    /// An example: pale cloth, ink words, and its tag that says what it is and what a tap does
    /// ("EXAMPLE · TAP TO USE", or "TAP TO USE" where the flag is narrow), on a line of its own.
    private var ghost: some View {
        flagWords(ink: WalkPalette.ink, italic: true, tagInk: WalkPalette.ink)
            .background {
                // Opaque enough that the ink words read at 4.5:1 or better over any backdrop.
                WalkNotchedCloth(notch: Self.flagNotch).fill(.white.opacity(0.72))
                WalkNotchedCloth(notch: Self.flagNotch).inset(by: 3)
                    .stroke(.white.opacity(0.95), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
            }
            .walkBannerShadow(glows: false)
    }

    /// The goal above the step is about, in its own level's colour, on the lines the layout gives it.
    private var parent: some View {
        WalkClothWords(text: banner.text, face: .parent, width: banner.frame.width - WalkLayout.Face.parent.inset,
                       lines: banner.lines)
            .foregroundStyle(.white)
            .opacity(words)
            .padding(.top, Self.parentTop)
            .frame(width: banner.frame.width, height: banner.frame.height, alignment: .top)
            .background(WalkNotchedCloth(notch: Self.parentNotch).fill(colour))
            .walkBannerShadow(glows: banner.glows)
    }

    /// Look back up: the newest flag's words, and "+n more" on a line of its own where the level holds more.
    private var compact: some View {
        VStack(spacing: 0) {
            WalkClothWords(text: banner.text, face: .lookBack, width: banner.frame.width - WalkLayout.Face.lookBack.inset,
                           lines: banner.lines)
            if let more = banner.more {
                Text(WalkCopy.more(more))
                    .font(WalkClothFace.font(.tag))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
                    .frame(height: WalkLayout.tagLine)
            }
        }
        .foregroundStyle(.white)
        .opacity(words)
        .padding(.top, Self.lookBackTop)
        .frame(width: banner.frame.width, height: banner.frame.height, alignment: .top)
        .background(WalkNotchedCloth(notch: Self.lookBackNotch).fill(colour))
        .walkBannerShadow(glows: banner.glows)
    }

    /// "+n more": the flags not shown, on a small cloth in the level's colour a shade deeper.
    private var more: some View {
        Text(banner.text)
            .font(WalkClothFace.font(.tag))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .opacity(words)
            .padding(.bottom, 4)
            .frame(width: banner.frame.width, height: banner.frame.height)
            .background(WalkNotchedCloth(notch: 4).fill(WalkPalette.level(banner.level, brightness: 0.8)))
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

/// An area's name. On its post (`standing`) the gold-outlined navy pill alone, at its frame (the
/// caret over it is `WalkCaret`, at the label's `caret`); on the ground a choice: a small mark
/// over a pill with a plus, or a checkmark once kept. Its words are the layout's lines
/// (`Label.words`), in DM Sans SemiBold 11 capitals at a fixed size. Under the veil on words
/// (`veiled`, F22) the pill stays and its words and mark are not drawn.
struct WalkLabelView: View {
    let label: WalkLayout.Label
    var veiled = false

    /// The mark over a ground chip (10 × 7), and a line of the name (the pill is 23 on one line, 37 on two).
    static let markHeight: CGFloat = 7, nameLine: CGFloat = 14

    var body: some View {
        if label.ground {
            VStack(spacing: 0) {
                WalkCaret(colour: label.kept ? WalkPalette.gold : .white)
                    .frame(width: WalkLayout.caretSize.width, height: Self.markHeight)
                    .opacity(veiled ? 0 : 1)
                HStack(spacing: 3) {
                    Image(systemName: label.kept ? "checkmark" : "plus")
                        .font(.system(size: 9, weight: .bold))
                    name
                }
                .foregroundStyle(label.kept ? WalkPalette.ink : .white)
                .opacity(veiled ? 0 : 1)
                .frame(width: label.frame.width, height: label.frame.height - Self.markHeight)
                .background(chip)
            }
            .frame(width: label.frame.width, height: label.frame.height, alignment: .top)
            .opacity(label.opacity)
        } else {
            name
                .foregroundStyle(WalkPalette.gold)
                .opacity(veiled ? 0 : 1)
                .frame(width: label.frame.width, height: label.frame.height)
                .background {
                    Capsule().fill(WalkPalette.navy.opacity(0.9))
                        .overlay(Capsule().strokeBorder(WalkPalette.gold, lineWidth: 1.5))
                }
                .opacity(label.opacity)
        }
    }

    /// The name, a line each as the layout broke it.
    private var name: some View {
        VStack(spacing: 0) {
            ForEach(Array(label.words.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(.custom(WalkClothFace.name, fixedSize: 11))
                    .tracking(1.1)
                    .lineLimit(1)
                    // Only where a name's capitals are wider than the layout's estimate of them.
                    .minimumScaleFactor(0.85)
                    .frame(height: Self.nameLine)
            }
        }
    }

    @ViewBuilder private var chip: some View {
        let shape = Capsule()
        if label.kept {
            shape.fill(WalkPalette.gold)
        } else {
            // A choice not yet made: full contrast, outlined, with a plus.
            shape.fill(WalkPalette.navy.opacity(0.85))
                .overlay(shape.strokeBorder(.white, lineWidth: 1.5))
        }
    }
}

/// The small "you are here" mark: a triangle pointing up (over the standing pill, and over a ground chip).
struct WalkCaret: View {
    let colour: Color

    var body: some View {
        WalkPennant()
            .rotation(.degrees(-90))
            .fill(colour)
            .frame(width: 7, height: 10)
            .frame(width: 10, height: 7)
    }
}
#endif
