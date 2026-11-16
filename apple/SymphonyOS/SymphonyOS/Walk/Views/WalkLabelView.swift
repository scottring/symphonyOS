#if os(iOS)
import SwiftUI

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
