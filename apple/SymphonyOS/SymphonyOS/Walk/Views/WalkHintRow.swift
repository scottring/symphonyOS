#if os(iOS)
import SwiftUI

/// The row at the foot of the stage (contract §14, §10): the hint line with the
/// quiet Undo pill beside it; the Move row while a flag is selected; the one-line
/// field while typing, the hint (a note) kept as a line above it. While the
/// keyboard is up the row rises to sit just above it.
struct WalkHintRow: View {
    let model: WalkModel
    @Environment(\.walkKeyboardLift) private var lift
    @FocusState private var fieldFocused: Bool
    /// Return was pressed: the reducer's submit closes the field, so the blur that follows is not a dismiss.
    @State private var submitted = false

    init(model: WalkModel) {
        self.model = model
    }

    var body: some View {
        let s = model.state
        let stage = WalkArt.overlookSquare.stage
        Group {
            if s.typing != nil {
                typingRow(hint: WalkCopy.hint(s))
            } else if s.selected != nil {
                moveRow(s.moveTargets)
            } else {
                hintRow(WalkCopy.hint(s), undo: s.showsUndoPill)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 38)
        .padding(.horizontal, 10)
        .padding(.bottom, 8 + lift)
        .frame(width: stage.width, height: stage.height, alignment: .bottom)
    }

    // MARK: The hint and Undo

    private func hintRow(_ hint: String, undo: Bool) -> some View {
        HStack(spacing: 10) {
            if !hint.isEmpty {
                hintText(hint)
            }
            if undo {
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
        }
    }

    private func hintText(_ hint: String) -> some View {
        Text(hint)
            .font(.custom("DMSans-SemiBold", size: 13))
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
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
            TextField("", text: Binding(get: { model.state.typing ?? "" },
                                        set: { model.send(.typeChanged($0)) }),
                      prompt: Text(WalkCopy.typePlaceholder).foregroundStyle(.white.opacity(0.7)))
                .textFieldStyle(.plain)
                .font(.custom("DMSans-Regular", size: 16))
                .foregroundStyle(.white)
                .tint(WalkPalette.gold)
                .submitLabel(.done)
                .focused($fieldFocused)
                .onSubmit {
                    submitted = true
                    model.send(.typeSubmitted)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(WalkPillBackground(fill: WalkPalette.navy.opacity(0.72), border: .white.opacity(0.55)))
        }
        .onAppear {
            submitted = false
            fieldFocused = true
        }
        .onChange(of: fieldFocused) { _, focused in
            // Only a blur with no return before it dismisses: after a submit it would close
            // nothing (the submit already planted and closed), and it must never drop the words.
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
