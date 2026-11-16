#if os(iOS)
import SwiftUI
import UIKit

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
#endif
