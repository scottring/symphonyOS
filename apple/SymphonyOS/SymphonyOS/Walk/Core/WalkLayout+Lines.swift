import Foundation
import CoreGraphics

// MARK: - How many lines words take

/// The layout decides how tall a cloth is before anything is drawn, so it counts a title's lines
/// itself. The core has no fonts: it carries the widths of the one face every cloth is set in
/// (DM Sans SemiBold, read from the bundled file) and wraps the words by them, at each cloth's own
/// size and inner width. Kerning only ever draws words a little closer than the widths' sum, so
/// the count is never fewer lines than the text really takes (a cut title), and for ordinary
/// titles it is not more either (a blank band): `WalkLayoutTests.theLinesAreTheRealFaces`
/// measures both against the bundled face.
extension WalkLayout {
    /// What a cloth's words are set in: the size, the tracking, and the cloth's two side paddings together.
    enum Face: Equatable {
        /// A flag of the step's level, and an example: 13 pt, 8 either side.
        case flag
        /// The goal above: 11 pt, 6 either side.
        case parent
        /// A Look back up cloth: 12 pt, 6 either side.
        case lookBack
        /// A tag line (a Week day, FIRST THING, an example's tag): 11 pt, tracked 0.6, 8 either side.
        case tag

        var size: CGFloat {
            switch self {
            case .flag: 13
            case .lookBack: 12
            case .parent, .tag: 11
            }
        }
        var tracking: CGFloat { self == .tag ? 0.6 : 0 }
        var inset: CGFloat {
            switch self {
            case .flag, .tag: 16
            case .parent, .lookBack: 12
            }
        }
    }

    /// DM Sans SemiBold's advance widths in thousandths of an em, for U+0020 (space) to U+007E (~),
    /// in order, as the bundled `DMSans-SemiBold.ttf` gives them.
    static let glyphWidths: [CGFloat] = [
        244, 291, 344, 841, 597, 868, 767, 186, 395, 395, 503, 571, 227, 565, 236, 417,          // space ! " # $ % & ' ( ) * + , - . /
        698, 348, 577, 599, 638, 618, 633, 536, 625, 633, 239, 263, 571, 571, 571, 534,          // 0 to 9 : ; < = > ?
        1034, 696, 628, 732, 701, 578, 550, 772, 704, 261, 529, 633, 549, 873, 718, 781,         // @ A to O
        604, 781, 620, 597, 587, 676, 695, 1003, 650, 618, 567, 358, 417, 358, 661, 706,         // P to Z [ \ ] ^ _
        228, 574, 646, 596, 646, 592, 362, 585, 605, 264, 265, 556, 254, 926, 604, 605,          // ` a to o
        646, 646, 397, 523, 421, 604, 554, 803, 549, 590, 481, 458, 261, 458, 571,               // p to z { | } ~
    ]
    /// The curly quotes, the ellipsis, the middle dot and the dashes the walk's own words use.
    static let otherGlyphWidths: [Character: CGFloat] = [
        "’": 242, "‘": 242, "“": 428, "”": 428, "…": 652, "·": 236, "–": 688, "—": 905,
    ]
    /// Anything else (another script, an emoji) counts a whole em: never too narrow.
    static let unknownGlyphWidth: CGFloat = 1000

    /// One character's width in thousandths of an em. An accented Latin letter is as wide as its letter.
    static func glyphWidth(_ character: Character) -> CGFloat {
        if let ascii = character.asciiValue, (32...126).contains(ascii) { return glyphWidths[Int(ascii) - 32] }
        if let known = otherGlyphWidths[character] { return known }
        if String(character) == softHyphen { return 0 }
        let base = String(character).decomposedStringWithCanonicalMapping.unicodeScalars.first?.value ?? 0
        return (32...126).contains(base) ? glyphWidths[Int(base) - 32] : unknownGlyphWidth
    }

    /// How wide words are on one line in a face: the widths' sum at its size, and its tracking after each character.
    static func textWidth<S: StringProtocol>(_ text: S, face: Face) -> CGFloat {
        text.reduce(0) { $0 + glyphWidth($1) * face.size / 1000 + (String($1) == softHyphen ? 0 : face.tracking) }
    }

    /// The title as it is drawn on a cloth `width` wide: a word wider than a line holds carries
    /// soft hyphens (U+00AD) where each line of it ends, so it breaks there, with a hyphen, instead
    /// of spilling past its cloth (S20). A word that already carries one is left as it is.
    static func drawnTitle(_ text: String, width: CGFloat, face: Face = .flag) -> String {
        let room = width - face.inset, hyphen = textWidth("-", face: face)
        return text.split(separator: " ", omittingEmptySubsequences: false).map { word -> String in
            guard textWidth(word, face: face) > room, !word.contains(softHyphen) else { return String(word) }
            var out = "", run: CGFloat = 0
            for character in word {
                let across = textWidth(String(character), face: face)
                if run > 0, run + across + hyphen > room { out += softHyphen; run = 0 }
                out.append(character)
                run += across
            }
            return out
        }.joined(separator: " ")
    }

    /// How many lines a title takes on a cloth `width` wide, at most 3: its drawn form wrapped as
    /// the text system wraps it (at a space, after a hyphen that a letter follows, at a soft
    /// hyphen, where the hyphen it then shows must fit too), by the face's widths.
    static func lines(for text: String, width: CGFloat, face: Face = .flag) -> Int {
        let room = width - face.inset
        let space = textWidth(" ", face: face), hyphen = textWidth("-", face: face)
        var lines = 1
        var used: CGFloat = 0
        for word in drawnTitle(text, width: width, face: face).split(separator: " ") {
            for (i, piece) in breaks(in: word).enumerated() {
                let across = textWidth(piece.text, face: face), tail = piece.soft ? hyphen : 0
                let lead = used > 0 && i == 0 ? space : 0
                if used > 0, used + lead + across + tail > room {
                    lines += 1
                    used = 0
                } else {
                    used += lead
                }
                // A piece wider than a line (a word the person hyphenated themselves) runs on.
                let over = across + tail > room ? Int(((across + tail) / room).rounded(.down)) : 0
                lines += over
                used += across - CGFloat(over) * room
            }
            if lines > 3 { break }
        }
        return min(3, max(1, lines))
    }

    /// A word in the pieces a line may end after: at a soft hyphen (`soft`: a hyphen shows there
    /// if the line ends), and after a hyphen of its own that a letter follows.
    private static func breaks(in word: Substring) -> [(text: String, soft: Bool)] {
        var pieces: [(text: String, soft: Bool)] = []
        var piece = ""
        let characters = Array(word)
        for (i, character) in characters.enumerated() {
            if String(character) == softHyphen {
                if !piece.isEmpty { pieces.append((piece, true)); piece = "" }
                continue
            }
            piece.append(character)
            if character == "-", i + 1 < characters.count, characters[i + 1].isLetter, piece.count > 1 {
                pieces.append((piece, false))
                piece = ""
            }
        }
        if !piece.isEmpty { pieces.append((piece, false)) }
        // The last piece of a word shows no hyphen: nothing follows it.
        if let last = pieces.indices.last { pieces[last].soft = false }
        return pieces
    }

    /// An example's tag: the long one where the cloth holds it on its one line, else the short one.
    static func exampleTag(forWidth width: CGFloat) -> String {
        textWidth(WalkCopy.exampleTag, face: .tag) <= width - Face.tag.inset ? WalkCopy.exampleTag : WalkCopy.exampleTagShort
    }
}
