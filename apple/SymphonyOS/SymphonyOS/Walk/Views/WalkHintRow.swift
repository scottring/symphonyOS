#if os(iOS)
import SwiftUI

/// The foot of the stage and the line above the light, each where `WalkLayout` puts it ("The board as
/// numbers"): Next at the foot (the gold button, or its outlined skip; on Welcome the quick start's
/// glowing line under the light), the hint (above the light at rest, at the foot while the light is
/// busy), the quiet Undo pill and the Move row above the light in the hint's place, the lesson's two
/// lines, and the typing field with its X and its gold Add. While the keyboard is up the field and its
/// note rise to sit just above it. Every control takes a touch `stage.touch` high.
struct WalkHintRow: View {
    let model: WalkModel
    @Environment(\.walkStage) private var stage
    @Environment(\.walkKeyboardLift) private var lift
    @Environment(\.walkLessonBeat) private var lessonBeat
    @FocusState private var fieldFocused: Bool
    /// The field was closed by Return, Add or its X: the reducer already closed it, so the blur that
    /// follows is not a dismiss.
    @State private var submitted = false
    /// The field's own words. Return and Add send them with the submit, so a blur that reached the
    /// walk first (and closed the field there) cannot lose them.
    @State private var text = ""
    /// The Move row's chips run past their room: they scroll, and fade at their right edge.
    @State private var chipsOverflow = false

    init(model: WalkModel) {
        self.model = model
    }

    var body: some View {
        let s = model.state
        let stage = WalkArt.stageSize
        ZStack(alignment: .topLeading) {
            // The lesson, above the light on the veil (any tap puts it away; its words take none). While
            // it moves, the line of the beat being shown, at the top of its room: the flag of sample
            // words unfurls under it (`WalkOrbView`). Still (Reduce Motion, speech off): both lines.
            if let frame = WalkLayout.teachFrame(s) {
                let lines = WalkCopy.teaching(s)
                if let line = lessonBeat.line, line < lines.count {
                    lessonLine(lines[line])
                        .id(line)
                        .transition(.opacity)
                        .accessibilityLabel(lines.joined(separator: " "))
                        .frame(width: frame.width, height: frame.height, alignment: .top)
                        .position(x: frame.midX, y: frame.midY)
                } else {
                    teachingLines(lines)
                        .frame(width: frame.width, height: frame.height, alignment: .bottom)
                        .position(x: frame.midX, y: frame.midY)
                }
            }
            if s.typing != nil {
                typingRow(s)
            } else {
                if let frame = WalkLayout.nextFrame(s), let line = WalkCopy.nextLine(s, model.periods) {
                    if WalkLayout.nextIsWelcomeLine(s) {
                        welcomeLine(line)
                            .frame(width: frame.width, height: frame.height)
                            .position(x: frame.midX, y: frame.midY)
                    } else {
                        nextButton(line, frame)
                    }
                }
                // VoiceOver reads the hint, the Undo pill or the Move row after the mountain and before the
                // light; Next (unprioritised) after the light.
                Group {
                    if let frame = WalkLayout.hintFrame(s) {
                        hintText(WalkCopy.hint(s))
                            .frame(width: frame.width, height: frame.height)
                            .position(x: frame.midX, y: frame.midY)
                    }
                    if let frame = WalkLayout.undoFrame(s) {
                        undoPill(s, frame)
                    }
                    if WalkLayout.moveRowFrame(s) != nil {
                        moveRow(s)
                    }
                }
                .accessibilitySortPriority(Self.aboveTheLightPriority)
            }
        }
        .frame(width: stage.width, height: stage.height, alignment: .topLeading)
    }

    // MARK: Next, the hint and Undo

    /// Welcome's line under the light (F8): glowing words and a second line under them saying what
    /// it does. Since 2026-11-17 it is Not now, drawn as a skip: quieter words and no gold arrow.
    private func welcomeLine(_ line: WalkCopy.NextLine) -> some View {
        Button { model.send(.nextTapped) } label: {
            VStack(spacing: 1) {
                HStack(spacing: 6) {
                    Text(line.text)
                        .font(.custom("DMSans-SemiBold", size: 16))
                        .foregroundStyle(.white.opacity(line.skip ? 0.85 : 1))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .walkGlow()
                    if !line.skip {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(WalkPalette.gold)
                            .shadow(color: WalkPalette.glowShadow.opacity(0.6), radius: 2)
                    }
                }
                if let detail = line.detail {
                    Text(detail)
                        .font(.custom("DMSans-Regular", size: 13))
                        .foregroundStyle(.white.opacity(0.9))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                        .walkGlow()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(line.text)
        .walkAccessibilityHint(line.detail)
        .accessibilityIdentifier("walk.next")
    }

    /// Next on steps 1 to 5: a gold button 50 high, its words plus 56 wide (160 to 280), with the light's
    /// glow, ink words and a down arrow. When it skips: only a white outline, quieter white words, no
    /// arrow and no glow. It is drawn inside its frame, centred; the frame (or more) takes the touch.
    private func nextButton(_ line: WalkCopy.NextLine, _ frame: CGRect) -> some View {
        Button { model.send(.nextTapped) } label: {
            Group {
                if line.skip {
                    Text(line.text)
                        .font(.custom("DMSans-SemiBold", size: 16))
                        .foregroundStyle(.white.opacity(0.9))
                        .padding(.horizontal, 28)
                } else {
                    HStack(spacing: 8) {
                        Text(line.text)
                            .font(.custom("DMSans-SemiBold", size: 17))
                        Image(systemName: "arrow.down")
                            .font(.system(size: 17, weight: .semibold))
                    }
                    .foregroundStyle(WalkPalette.ink)
                    .padding(.leading, 30)
                    .padding(.trailing, 26)
                }
            }
            .lineLimit(1)
            .frame(height: frame.height)
            .frame(minWidth: Self.nextMinWidth)
            .fixedSize()
            .background { nextFace(skip: line.skip) }
            .walkTouch(frame.size, stage.touch)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(line.text)
        .accessibilityIdentifier("walk.next")
        .position(x: frame.midX, y: frame.midY)
    }

    /// Between the scene (2) and the light (1) in `WalkView`'s reading order.
    static let aboveTheLightPriority: Double = 1.5

    /// The narrowest Next is drawn ("The foot": its words plus 56, at least 160, at most its frame's 280).
    static let nextMinWidth: CGFloat = 160

    @ViewBuilder private func nextFace(skip: Bool) -> some View {
        if skip {
            Capsule().strokeBorder(.white.opacity(0.7), lineWidth: 1.5)
        } else {
            Capsule()
                .fill(LinearGradient(stops: [.init(color: Color(hex: 0xFFF7E0), location: 0),
                                             .init(color: Color(hex: 0xF8E2AD), location: 0.46),
                                             .init(color: Color(hex: 0xEBBF72), location: 1)],
                                     startPoint: .top, endPoint: .bottom))
                .shadow(color: WalkPalette.orbGlow.opacity(0.8), radius: 16)
                .shadow(color: WalkPalette.orbGlow.opacity(0.45), radius: 42)
        }
    }

    /// The quiet Undo pill above the light, 86 × 36; VoiceOver hears what it undoes (F23).
    private func undoPill(_ s: WalkState, _ frame: CGRect) -> some View {
        Button { model.send(.undo) } label: {
            HStack(spacing: 5) {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 14, weight: .semibold))
                Text(WalkCopy.undo)
                    .font(.custom("DMSans-SemiBold", size: 13))     // the contract's 700: no Bold face is bundled
            }
            .foregroundStyle(.white)
            .frame(width: frame.width, height: frame.height)
            .background(WalkPillBackground(fill: WalkPalette.navy.opacity(0.6), border: .white.opacity(0.55)))
            .walkTouch(frame.size, stage.touch)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WalkCopy.undoLabel(s) ?? WalkCopy.undo)
        .accessibilityIdentifier("walk.undo")
        .position(x: frame.midX, y: frame.midY)
    }

    /// The lesson's line for the beat being shown: one 22-point serif line, 14 under the top of its room.
    private func lessonLine(_ line: String) -> some View {
        Text(line)
            .font(.custom("CrimsonPro-Regular", size: 22))
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .walkGlow()
            .padding(.top, 14)
            .allowsHitTesting(false)
    }

    /// The 20-point serif line, then the 15-point line (none with speech off), as the walk's other words.
    private func teachingLines(_ lines: [String]) -> some View {
        VStack(spacing: 8) {
            if let first = lines.first {
                Text(first)
                    .font(.custom("CrimsonPro-Regular", size: 20))
                    .frame(maxWidth: 250)
            }
            if lines.count > 1 {
                Text(lines[1])
                    .font(.custom("DMSans-Regular", size: 15))
            }
        }
        .foregroundStyle(.white)
        .multilineTextAlignment(.center)
        .walkGlow()
        .allowsHitTesting(false)            // VoiceOver also reads it once as it appears (an announcement)
    }

    /// One line, always: every hint and note is short enough (`WalkCopy.hintMaxLength`).
    private func hintText(_ hint: String) -> some View {
        Text(hint)
            .font(.custom("DMSans-SemiBold", size: 15))
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .walkGlow()
            .allowsHitTesting(false)
    }

    // MARK: Move to

    /// While a flag is chosen (F11, F24): "Move to" and a chip for each area it can move to, scrolling
    /// sideways in their room when they run past it (with a fade at its right edge only then), and
    /// Remove alone at its own place, never scrolled. On Today there is nowhere to move: Remove only.
    @ViewBuilder private func moveRow(_ s: WalkState) -> some View {
        let title = s.item(s.selected)?.title ?? ""
        let targets = s.moveTargets
        if let frame = WalkLayout.moveChipsFrame(s) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    Text(WalkCopy.moveTo)
                        .font(.custom("DMSans-SemiBold", size: 12))     // the contract's 700: no Bold face is bundled
                        .foregroundStyle(.white)
                        .walkGlow()
                        .fixedSize()
                        .accessibilityHidden(true)                      // each chip says it ("Move … to …")
                    ForEach(targets) { area in
                        chip(area.name, height: frame.height, colour: .white, border: .white.opacity(0.55)) {
                            model.send(.moveTo(area.id))
                        }
                        .accessibilityLabel(WalkCopy.moveLabel(title, to: area.name))
                        .accessibilityIdentifier("walk.move.\(area.name.lowercased())")
                    }
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { chipsOverflow = $0 > frame.width + 0.5 }
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .frame(width: frame.width, height: max(frame.height, stage.touch), alignment: .leading)
            .mask {
                HStack(spacing: 0) {
                    Rectangle()
                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: chipsOverflow ? Self.chipsFade : 0)
                }
            }
            .position(x: frame.midX, y: frame.midY)
        }
        if let frame = WalkLayout.removeFrame(s) {
            chip(WalkCopy.pullUp, width: frame.width, height: frame.height,
                 colour: WalkPalette.pullUp, border: WalkPalette.pullUpBorder) { model.send(.pullUp) }
                .accessibilityLabel(WalkCopy.removeLabel(title))
                .accessibilityIdentifier("walk.remove")
                .position(x: frame.midX, y: frame.midY)
        }
    }

    /// The fade at the chips' right edge while they overflow.
    static let chipsFade: CGFloat = 24

    /// A chip: capitals on a navy pill with a thin edge, never shrunk; `width` when the layout gives one,
    /// else as wide as its words and never narrower than a touch (`stage.touch`). It takes a touch `stage.touch` high.
    private func chip(_ label: String, width: CGFloat? = nil, height: CGFloat, colour: Color, border: Color,
                      _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label.uppercased())
                .font(.custom("DMSans-SemiBold", size: 11))     // the contract's 700: no Bold face is bundled
                .tracking(0.66)
                .foregroundStyle(colour)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 12)
                .frame(minWidth: width == nil ? stage.touch : nil)          // 44 real points across, at any scale
                .frame(width: width, height: height)
                .background(WalkPillBackground(fill: WalkPalette.navy.opacity(0.62), border: border))
                .frame(height: max(height, stage.touch))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fixedSize()
    }

    // MARK: Type it

    /// The field across the foot (F22): its X at the left closes it and plants nothing, the words in
    /// the middle (return plants them), the gold Add at the right plants them (quiet while the field is
    /// blank), and a note just above it. All rise by the keyboard's lift. Focused at once; losing focus
    /// with no return closes it.
    @ViewBuilder private func typingRow(_ s: WalkState) -> some View {
        let up = { (frame: CGRect) in frame.offsetBy(dx: 0, dy: -lift) }
        if let note = WalkLayout.hintFrame(s).map(up) {
            hintText(WalkCopy.hint(s))
                .frame(width: note.width, height: note.height)
                .position(x: note.midX, y: note.midY)
        }
        if let field = WalkLayout.typeFieldFrame(s).map(up) {
            WalkPillBackground(fill: WalkPalette.navy.opacity(0.72), border: .white.opacity(0.55))
                .frame(width: field.width, height: field.height)
                .contentShape(Capsule())
                .onTapGesture { fieldFocused = true }
                .accessibilityHidden(true)
                .position(x: field.midX, y: field.midY)
        }
        if let words = WalkLayout.typeWordsFrame(s).map(up) {
            TextField("", text: Binding(get: { text },
                                        set: { text = $0; model.send(.typeChanged($0)) }),
                      prompt: Text(WalkCopy.typePlaceholder).foregroundStyle(.white.opacity(0.7)))
                .textFieldStyle(.plain)
                .font(.custom("DMSans-Regular", size: 16))
                .foregroundStyle(.white)
                .tint(WalkPalette.gold)
                .submitLabel(.done)
                .focused($fieldFocused)
                .accessibilityLabel(WalkCopy.typeFieldLabel)
                .accessibilityIdentifier("walk.type.field")
                .onSubmit {
                    submitted = true
                    model.send(.typeSubmitted(text))
                }
                .onAppear {
                    submitted = false
                    text = model.state.typing ?? ""
                    fieldFocused = true
                }
                .onChange(of: fieldFocused) { _, focused in
                    // Only a blur with no return, Add or X before it dismisses: after one of those it
                    // would close nothing (the reducer already closed the field). If the blur arrives
                    // first, the submit that follows still plants: it carries the words.
                    guard !focused else { return }
                    if submitted {
                        submitted = false
                    } else {
                        model.send(.typeDismissed)
                    }
                }
                .frame(width: words.width, height: words.height)
                .position(x: words.midX, y: words.midY)
        }
        if let close = WalkLayout.typeCloseFrame(s).map(up) {
            Button {
                submitted = true
                model.send(.typeDismissed)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.white.opacity(0.8))
                    .walkTouch(close.size, stage.touch)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(WalkCopy.typeClose)
            .accessibilityIdentifier("walk.type.close")
            .position(x: close.midX, y: close.midY)
        }
        if let add = WalkLayout.typeAddFrame(s).map(up) {
            Button {
                submitted = true
                model.send(.typeSubmitted(text))
            } label: {
                Text(WalkCopy.typeAdd)
                    .font(.custom("DMSans-SemiBold", size: 15))
                    .foregroundStyle(WalkPalette.ink)
                    .padding(.horizontal, 14)
                    .frame(height: Self.addHeight)
                    .background(Capsule().fill(WalkPalette.gold))
                    .opacity(s.typedHasWords ? 1 : 0.45)
                    .walkTouch(add.size, stage.touch)
            }
            .buttonStyle(.plain)
            .disabled(!s.typedHasWords)
            .accessibilityLabel(WalkCopy.typeAdd)
            .accessibilityIdentifier("walk.type.add")
            .position(x: add.midX, y: add.midY)
        }
    }

    /// The gold Add's capsule height inside its 44-high frame.
    static let addHeight: CGFloat = 32
}

/// Under the light's own layer, so nothing on the compass is dimmed: the foot's shade (from y 560 to
/// the foot, "The foot's shade": the walk's dark navy from nothing to 0.55 at 45% and 0.86 at the
/// foot; never on Welcome, `WalkLayout.footShadeTop`), and soft bands of the ground colour behind the open compass's hint, the points' words and
/// the lines that teach the light, where they stand over the veiled mountain. The shade and the bands
/// run from side to side of the window (the board plus its bleed), and the shade on down to the
/// window's foot.
struct WalkUnderlay: View {
    let model: WalkModel
    @Environment(\.walkStage) private var device

    var body: some View {
        let s = model.state
        let stage = WalkArt.stageSize
        let window = device.window
        let shade = WalkPalette.glowShadow          // rgba(0, 14, 70)
        ZStack(alignment: .topLeading) {
            if let top = WalkLayout.footShadeTop(s) {
                VStack(spacing: 0) {
                    LinearGradient(stops: [.init(color: shade.opacity(0), location: 0),
                                           .init(color: shade.opacity(0.55), location: 0.45),
                                           .init(color: shade.opacity(0.86), location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                        .frame(height: stage.height - top)
                    shade.opacity(0.86)
                        .frame(height: device.bleed.bottom)
                }
                .frame(width: window.width)
                .offset(x: window.minX, y: top)
                .frame(width: stage.width, height: stage.height, alignment: .topLeading)
            }
            if s.showsPoints, let hint = WalkLayout.hintFrame(s) {
                band(height: hint.height + 20, width: window.width).position(x: window.midX, y: hint.midY)
            }
            // Behind each point's words, a soft blot of the ground colour (no edge, no panel): a
            // kept area's pill or a flag under the veil does not show through the words.
            if s.showsPoints {
                let points = WalkCopy.points(s, model.periods)
                ForEach(points, id: \.at) { point in
                    let frame = WalkLayout.pointWords(point, among: points.map(\.at))
                        .map(\.frame).reduce(CGRect.null) { $0.union($1) }
                    if !frame.isNull {
                        Ellipse()
                            .fill(EllipticalGradient(stops: [.init(color: WalkPalette.ground.opacity(0.9), location: 0),
                                                             .init(color: WalkPalette.ground.opacity(0.85), location: 0.6),
                                                             .init(color: WalkPalette.ground.opacity(0), location: 1)]))
                            .frame(width: frame.width + 48, height: frame.height + 32)
                            .position(x: frame.midX, y: frame.midY)
                    }
                }
            }
            if let teach = WalkLayout.teachFrame(s) {
                band(height: teach.height + 40, width: window.width).position(x: window.midX, y: teach.midY)
            }
        }
        .frame(width: stage.width, height: stage.height, alignment: .topLeading)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func band(height: CGFloat, width: CGFloat) -> some View {
        LinearGradient(stops: [.init(color: WalkPalette.ground.opacity(0), location: 0),
                               .init(color: WalkPalette.ground.opacity(0.8), location: 0.3),
                               .init(color: WalkPalette.ground.opacity(0.8), location: 0.7),
                               .init(color: WalkPalette.ground.opacity(0), location: 1)],
                       startPoint: .top, endPoint: .bottom)
            .frame(width: width, height: height)
    }
}

/// A pill of flat navy with a thin light edge. No blur and no material: the walk has no glass.
struct WalkPillBackground: View {
    let fill: Color
    let border: Color

    var body: some View {
        Capsule()
            .fill(fill)
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))
    }
}

extension WalkPalette {
    static let pullUp = Color(hex: 0xFFD0C0)
    static let pullUpBorder = Color(red: 1, green: 180 / 255, blue: 160 / 255).opacity(0.7)
}
#endif
