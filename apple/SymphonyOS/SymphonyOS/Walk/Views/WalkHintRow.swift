#if os(iOS)
import SwiftUI

/// The foot of the stage (contract §14, §10), on a scrim of the ground colour: the Next
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

    /// The scrim's height at the foot of the stage, and its strongest opacity.
    static let scrimHeight: CGFloat = 120

    init(model: WalkModel) {
        self.model = model
    }

    var body: some View {
        let s = model.state
        let layout = model.layout
        let stage = WalkArt.overlookSquare.stage
        ZStack(alignment: .topLeading) {
            LinearGradient(colors: [WalkPalette.ground.opacity(0), WalkPalette.ground.opacity(0.8)],
                           startPoint: .top, endPoint: .bottom)
                .frame(width: stage.width, height: Self.scrimHeight)
                .offset(y: stage.height - Self.scrimHeight)
                .allowsHitTesting(false)
                .accessibilityHidden(true)

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
                    // Above the open compass the line sits on the veil, over the mountain: a soft band of
                    // the ground colour under it keeps the flags beneath from showing through the words.
                    if s.showsPoints {
                        LinearGradient(stops: [.init(color: WalkPalette.ground.opacity(0), location: 0),
                                               .init(color: WalkPalette.ground.opacity(0.8), location: 0.3),
                                               .init(color: WalkPalette.ground.opacity(0.8), location: 0.7),
                                               .init(color: WalkPalette.ground.opacity(0), location: 1)],
                                       startPoint: .top, endPoint: .bottom)
                            .frame(width: stage.width, height: frame.height + 28)
                            .position(x: stage.width / 2, y: frame.midY)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }
                    hintText(WalkCopy.hint(s), lines: WalkLayout.hintLines(WalkCopy.hint(s)))
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
            .frame(width: WalkArt.overlookSquare.stage.width, height: WalkArt.overlookSquare.stage.height,
                   alignment: .bottom)
    }

    // MARK: The Next line, the hint and Undo

    /// Glowing words and a small chevron, never a button's fill or outline; quieter when it skips.
    private func nextLine(_ line: WalkCopy.NextLine) -> some View {
        Button { model.send(.nextTapped) } label: {
            HStack(spacing: 6) {
                Text(line.text)
                    .font(.custom("DMSans-SemiBold", size: 16))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(.white.opacity(line.skip ? 0.7 : 1))
            .walkGlow()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(line.text)
        .accessibilityIdentifier("walk.next")
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

    private func hintText(_ hint: String, lines: Int = 2) -> some View {
        Text(hint)
            .font(.custom("DMSans-SemiBold", size: 15))
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .lineLimit(lines)
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
            .frame(minWidth: WalkArt.overlookSquare.stage.width - 20)       // centred while it fits
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
