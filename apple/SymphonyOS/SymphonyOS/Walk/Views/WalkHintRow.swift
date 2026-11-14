#if os(iOS)
import SwiftUI

/// The foot of the stage (contract §14, §10), over the scrim (`WalkUnderlay`): the Next
/// line under the light, the hint line under it (or, with the compass open, above the
/// compass), and the quiet Undo pill beside the Next line, each where `WalkLayout` puts
/// it; the Move row while a flag is selected; the one-line field while typing, the hint
/// (a note) kept as a line above it. While the keyboard is up the field rises to sit just above it.
struct WalkHintRow: View {
    let model: WalkModel
    @Environment(\.walkKeyboardLift) private var lift
    @FocusState private var fieldFocused: Bool
    /// Return was pressed: the reducer's submit closes the field, so the blur that follows is not a dismiss.
    @State private var submitted = false
    /// The field's own words. Return sends them with the submit, so a blur that reached the
    /// walk first (and closed the field there) cannot lose them.
    @State private var text = ""

    init(model: WalkModel) {
        self.model = model
    }

    var body: some View {
        let s = model.state
        let layout = model.layout
        let stage = WalkArt.stageSize
        ZStack(alignment: .topLeading) {
            // The lesson: two lines above the light, on the veil (any tap puts it away; they take none).
            if let frame = layout.lesson {
                teachingLines(WalkCopy.teaching(s))
                    .frame(width: frame.width, height: frame.height, alignment: .bottom)
                    .position(x: frame.midX, y: frame.midY)
            }
            if s.typing != nil {
                bottom(typingRow(hint: WalkCopy.hint(s)))
            } else {
                if let frame = layout.nextLine, let line = WalkCopy.nextLine(s, model.periods) {
                    nextLine(line)
                        .frame(width: frame.width, height: frame.height)
                        .position(x: frame.midX, y: frame.midY)
                }
                if s.selected != nil {
                    bottom(moveRow(s.moveTargets))
                } else if let frame = layout.hintLine {
                    hintText(WalkCopy.hint(s))
                        .frame(width: frame.width, height: frame.height)
                        .position(x: frame.midX, y: frame.midY)
                }
                if let frame = layout.more {
                    moreButton
                        .frame(width: frame.width, height: frame.height)
                        .position(x: frame.midX, y: frame.midY)
                }
                if let frame = layout.undoPill {
                    undoPill
                        .frame(width: frame.width, height: frame.height)
                        .position(x: frame.midX, y: frame.midY)
                }
            }
        }
        .frame(width: stage.width, height: stage.height, alignment: .topLeading)
    }

    /// A row anchored at the foot of the stage, lifted above the keyboard.
    private func bottom(_ row: some View) -> some View {
        row
            .frame(maxWidth: .infinity, minHeight: 38)
            .padding(.horizontal, 10)
            .padding(.bottom, 8 + lift)
            .frame(width: WalkArt.stageSize.width, height: WalkArt.stageSize.height,
                   alignment: .bottom)
    }

    // MARK: The Next line, the hint and Undo

    /// Glowing words and a small chevron, never a button's fill or outline; quieter when it skips.
    /// Glowing words with the light's gold arrow after them, never a button's fill or outline;
    /// quieter when it skips. On Welcome a second line under it says what the quick start is.
    private func nextLine(_ line: WalkCopy.NextLine) -> some View {
        Button { model.send(.nextTapped) } label: {
            VStack(spacing: 1) {
                HStack(spacing: 6) {
                    Text(line.text)
                        .font(.custom("DMSans-SemiBold", size: 16))
                        .foregroundStyle(.white.opacity(line.skip ? 0.7 : 1))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .walkGlow()
                    Image(systemName: "arrow.down.circle.fill")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(WalkPalette.gold)
                        .shadow(color: WalkPalette.glowShadow.opacity(0.6), radius: 2)
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
        .accessibilityIdentifier("walk.next")
        // On Welcome the light itself reads the quick start (`WalkCopy.orbLabelWelcome`): the line is not read twice.
        .accessibilityHidden(model.state.step == 0)
    }

    /// "More": the other choices, as a tap on the light opens them. Words and a symbol, no box.
    private var moreButton: some View {
        Button { model.send(.moreTapped) } label: {
            HStack(spacing: 5) {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 15, weight: .regular))
                Text(WalkCopy.more)
                    .font(.custom("DMSans-SemiBold", size: 14))
            }
            .foregroundStyle(.white.opacity(0.9))
            .walkGlow()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WalkCopy.moreLabel)
    }

    private var undoPill: some View {
        Button { model.send(.undo) } label: {
            HStack(spacing: 5) {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 14, weight: .semibold))
                Text(WalkCopy.undo)
                    .font(.custom("DMSans-SemiBold", size: 13))     // the contract's 700: no Bold face is bundled
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(minHeight: 34)
            .background(WalkPillBackground(fill: WalkPalette.navy.opacity(0.6), border: .white.opacity(0.55)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .accessibilityLabel(WalkCopy.undo)
    }

    /// The 20-point serif line, then the 15-point line (none with speech off), as the walk's other words.
    private func teachingLines(_ lines: [String]) -> some View {
        VStack(spacing: 8) {
            if let first = lines.first {
                Text(first)
                    .font(.custom("CrimsonPro-Regular", size: 20))
                    .frame(maxWidth: 250)               // two even lines: "Press and hold the light," / "and say it out loud."
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

    /// "Move to", a chip for every area the flag could move to, then "Pull it up";
    /// sideways if it runs past the edge. On Today there is nowhere to move: only "Pull it up".
    private func moveRow(_ targets: [WalkArea]) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                if !targets.isEmpty {
                    Text(WalkCopy.moveTo)
                        .font(.custom("DMSans-SemiBold", size: 12))     // the contract's 700: no Bold face is bundled
                        .foregroundStyle(.white)
                        .walkGlow()
                        .fixedSize()
                }
                ForEach(targets) { area in
                    chip(area.name, colour: .white, border: .white.opacity(0.55)) { model.send(.moveTo(area.id)) }
                }
                chip(WalkCopy.pullUp, colour: WalkPalette.pullUp, border: WalkPalette.pullUpBorder) { model.send(.pullUp) }
            }
            .padding(2)
            .frame(minWidth: WalkArt.stageSize.width - 20)       // centred while it fits
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
    }

    private func chip(_ label: String, colour: Color, border: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label.uppercased())
                .font(.custom("DMSans-SemiBold", size: 11))     // the contract's 700: no Bold face is bundled
                .tracking(0.66)
                .foregroundStyle(colour)
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(minHeight: 34)
                .background(WalkPillBackground(fill: WalkPalette.navy.opacity(0.62), border: border))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .accessibilityLabel(label)          // drawn in capitals, read as written
    }

    // MARK: Type it

    /// One line, focused at once; return plants it, and losing focus closes it.
    private func typingRow(hint: String) -> some View {
        VStack(spacing: 8) {
            if !hint.isEmpty {
                hintText(hint)
            }
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
                .onSubmit {
                    submitted = true
                    model.send(.typeSubmitted(text))
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(WalkPillBackground(fill: WalkPalette.navy.opacity(0.72), border: .white.opacity(0.55)))
        }
        .onAppear {
            submitted = false
            text = model.state.typing ?? ""
            fieldFocused = true
        }
        .onChange(of: fieldFocused) { _, focused in
            // Only a blur with no return before it dismisses: after a submit it would close
            // nothing (the submit already planted and closed). If the blur arrives first, the
            // submit that follows still plants: it carries the words (`.typeSubmitted(text)`).
            guard !focused else { return }
            if submitted {
                submitted = false
            } else {
                model.send(.typeDismissed)
            }
        }
    }
}

/// Under the light's own layer, so nothing on the compass is dimmed: the scrim at the foot of
/// the stage (the ground colour from 0 to 80% over the last 120 points), and soft bands of the
/// ground colour behind the open compass's hint, the points' words and the lines that teach
/// the light, where they stand over the veiled mountain.
struct WalkUnderlay: View {
    let model: WalkModel
    static let scrimHeight: CGFloat = 120

    var body: some View {
        let layout = model.layout
        let stage = WalkArt.stageSize
        ZStack(alignment: .topLeading) {
            LinearGradient(colors: [WalkPalette.ground.opacity(0), WalkPalette.ground.opacity(0.8)],
                           startPoint: .top, endPoint: .bottom)
                .frame(width: stage.width, height: Self.scrimHeight)
                .offset(y: stage.height - Self.scrimHeight)
            if model.state.showsPoints, let hint = layout.hintLine {
                band(height: hint.height + 20).position(x: stage.width / 2, y: hint.midY)
            }
            // Behind each point's words, a soft blot of the ground colour (no edge, no panel): a
            // kept area's pill or a flag under the veil does not show through the words.
            if model.state.showsPoints {
                let points = WalkCopy.points(model.state, model.periods)
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
            if let teach = layout.lesson {
                band(height: teach.height + 40).position(x: stage.width / 2, y: teach.midY)
            }
        }
        .frame(width: stage.width, height: stage.height, alignment: .topLeading)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func band(height: CGFloat) -> some View {
        LinearGradient(stops: [.init(color: WalkPalette.ground.opacity(0), location: 0),
                               .init(color: WalkPalette.ground.opacity(0.8), location: 0.3),
                               .init(color: WalkPalette.ground.opacity(0.8), location: 0.7),
                               .init(color: WalkPalette.ground.opacity(0), location: 1)],
                       startPoint: .top, endPoint: .bottom)
            .frame(width: WalkArt.stageSize.width, height: height)
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
