#if os(iOS)
import SwiftUI

/// How a cloth's words are set: in the face the layout broke them in (`WalkLayout.Face`), at a
/// fixed size whatever the person's text size, on the layout's own line height, in the cloth's
/// width less the padding the layout allowed (S20, F37, F39).
enum WalkClothFace {
    static let name = "DMSans-SemiBold"

    /// The face at its size, fixed: the layout's count holds at every text size.
    static func font(_ face: WalkLayout.Face) -> Font { .custom(name, fixedSize: face.size) }

    /// A line's height on each kind of cloth (`WalkLayout.flagLine`, `parentLine`; 13 on Look back up).
    static func lineHeight(_ face: WalkLayout.Face) -> CGFloat {
        switch face {
        case .flag: WalkLayout.flagLine
        case .parent: WalkLayout.parentLine
        case .lookBack: WalkLayout.lookBackLine
        case .tag: WalkLayout.tagLine
        }
    }
}

/// A cloth's words: the lines the layout broke them into (`Banner.words`, F39), each drawn as given
/// on one line of the layout's line height (F37), in the cloth's inner width. Nothing here decides a
/// break, scales or truncates: the layout already made every line fit its width.
struct WalkClothWords: View {
    let words: [String]
    let face: WalkLayout.Face
    /// The cloth's width less the padding the layout allowed (`face.inset`).
    let width: CGFloat
    var italic = false

    var body: some View {
        let font = WalkClothFace.font(face)
        VStack(spacing: 0) {
            ForEach(Array(words.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(italic ? font.italic() : font)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .frame(width: width, height: WalkClothFace.lineHeight(face))
            }
        }
    }
}
#endif
