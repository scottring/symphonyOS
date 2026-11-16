import Foundation
import CoreGraphics

// MARK: - How many lines words take

/// The layout decides how tall a cloth is before anything is drawn, so it counts a title's lines
/// itself. The core has no fonts: it carries the widths of the one face every cloth is set in
/// (DM Sans SemiBold, read from the bundled file) and wraps the words by them, at each cloth's own
/// size and inner width.
///
/// The count must never be fewer lines than the text really takes (that would cut a title), so no
/// stretch of text may be counted narrower than it is set. The face's kerning moves some pairs of
/// characters closer than their two widths and some further apart. The pairs it sets further apart
/// are counted (`widerPairs`); the pairs it sets closer are not, which only ever makes the count
/// cautious. `WalkLayoutTests.noPairIsSetWiderThanItIsCounted` holds every pair of the characters
/// known here to that against the bundled face, and `theLinesAreTheRealFaces` holds the line counts
/// of real titles to it (never fewer; for ordinary titles not more either, which would be a blank band).
/// A character the face does not have (another script, an emoji) is set by the system in another
/// face: it is counted wider than any such face sets it, and its line may be taller than the face's.
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
    /// More of the face's own: the curly quotes, the ellipsis, the middle dot and the dashes the
    /// walk's words use; the letters with no plain letter under them; and the two accented letters
    /// the face draws wider than their letter (ď, ľ: their caron is an apostrophe beside them).
    static let otherGlyphWidths: [Character: CGFloat] = [
        "’": 242, "‘": 242, "“": 428, "”": 428, "…": 652, "·": 236, "–": 688, "—": 905,
        "ß": 696, "Ł": 574, "ł": 282, "Ø": 777, "ø": 595, "Æ": 935, "æ": 935, "Œ": 1103, "œ": 977, "€": 784, "£": 620,
        "ď": 745, "ľ": 352,
    ]
    /// The accented Latin letters the face has and draws as wide as their plain letter (or a little
    /// narrower): each counts as its letter. An accented letter not here is not the face's.
    static let accentedLetters: Set<Character> = Set(
        "ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĊċČčĎĒēĔĕĖėĘęĚěĞğĠġĢģĨĩĪīĬĭĮįİĶķĹĺĻļĽŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽž")
    /// Anything else (another script, an emoji) is set by the system in a face of its own. It counts
    /// 1.4 em: more than the bundled face's widest glyph (1237), an ideograph (a whole em) and an
    /// emoji (its size and 4 points: 1364 at 11 pt).
    static let unknownGlyphWidth: CGFloat = 1400

    /// The pairs of characters the face sets FURTHER apart than their two widths (its positive
    /// kerning), by how much, in thousandths of an em: every one among the characters above, read
    /// from the bundled file. A pair with an accented letter takes its plain letters' entry, but for
    /// the two the face sets wider still.
    static let widerPairs: [String: CGFloat] = [
        "\"7": 30, "'7": 30, "/B": 50, "/D": 50, "/E": 50, "/F": 50, "/H": 50, "/I": 50, "/K": 50, "/L": 50, "/M": 50, "/N": 50,
        "/P": 50, "/R": 50, "/T": 20, "/V": 30, "/W": 10, "/Y": 25, "/|": 50, "2#": 15, "2f": 10, "2v": 10, "2x": 10, "4&": 35,
        "5#": 15, "7\"": 30, "7'": 30, "71": 15, "7V": 20, "7W": 10, "7f": 10, "9Ł": 30, "T?": 20, "T\\": 15, "V7": 20, "V\\": 20,
        "Y\"": 35, "Y'": 35, "\\,": 50, "\\_": 45, "_j": 30, "gj": 20, "gv": 10, "qj": 30, "r2": 25, "r3": 10, "r:": 10, "t,": 30,
        "t2": 30, "v2": 10, "vf": 20, "vt": 10, "y7": 15,
        "/Î": 60, "/Ī": 70,
    ]
    /// `widerPairs` by the two characters' scalars.
    private static let widerPairsByScalars: [UInt64: CGFloat] = Dictionary(uniqueKeysWithValues: widerPairs.map { pair, extra in
        let scalars = Array(pair.unicodeScalars)
        return (UInt64(scalars[0].value) << 32 | UInt64(scalars[1].value), extra)
    })

    /// The soft hyphen, as a character.
    static let softHyphenCharacter: Character = "\u{00AD}"

    /// One character as the count takes it: its width in thousandths of an em; the scalar it kerns
    /// as (`plain`: an accented letter's plain letter) and its own (0: no kerning is counted for a
    /// character the face does not have); and whether a line may end either side of it though no
    /// space is there (an ideograph, a kana or hangul syllable, an emoji).
    struct Glyph { let width: CGFloat; let plain: UInt32; let own: UInt32; let breaks: Bool }

    static func glyph(_ character: Character) -> Glyph {
        if let ascii = character.asciiValue, (32...126).contains(ascii) {
            return Glyph(width: glyphWidths[Int(ascii) - 32], plain: UInt32(ascii), own: UInt32(ascii), breaks: false)
        }
        // A letter typed as its plain letter and a combining accent is the same letter.
        let whole = character.unicodeScalars.count > 1
            ? (String(character).precomposedStringWithCanonicalMapping.first ?? character) : character
        if whole.unicodeScalars.count == 1, let scalar = whole.unicodeScalars.first {
            if let known = otherGlyphWidths[whole] { return Glyph(width: known, plain: scalar.value, own: scalar.value, breaks: false) }
            if accentedLetters.contains(whole), let plain = String(whole).decomposedStringWithCanonicalMapping.unicodeScalars.first,
               (32...126).contains(plain.value) {
                return Glyph(width: glyphWidths[Int(plain.value) - 32], plain: plain.value, own: scalar.value, breaks: false)
            }
        }
        return Glyph(width: unknownGlyphWidth, plain: 0, own: 0, breaks: breaksAnywhere(whole))
    }

    /// One character's width in thousandths of an em.
    static func glyphWidth(_ character: Character) -> CGFloat { glyph(character).width }

    /// Whether a line may end before or after a character with no space there: Chinese, Japanese
    /// and Korean writing, and emoji.
    private static func breaksAnywhere(_ character: Character) -> Bool {
        let scalars = character.unicodeScalars
        guard let first = scalars.first else { return false }
        if first.properties.isIdeographic { return true }
        switch first.value {
        case 0x1100...0x11FF, 0x3040...0x30FF, 0x3400...0x4DBF, 0xAC00...0xD7AF, 0x1F000...0x1FAFF: return true     // hangul, kana, emoji
        default: return first.properties.isEmojiPresentation || (scalars.count > 1 && first.properties.isEmoji)
        }
    }

    /// How much further apart than their two widths the face sets two characters, in thousandths of an em.
    private static func widerPair(_ a: Glyph, _ b: Glyph) -> CGFloat {
        guard a.own != 0, b.own != 0 else { return 0 }
        return widerPairsByScalars[UInt64(a.own) << 32 | UInt64(b.own)]
            ?? widerPairsByScalars[UInt64(a.plain) << 32 | UInt64(b.plain)] ?? 0
    }

    /// How wide words are on one line in a face, never narrower than the face sets them: the
    /// characters' widths at its size, what the face adds between a pair it sets apart, and its
    /// tracking after each character. `previous`: the character these words follow on their line.
    /// (A soft hyphen has no width, and the characters either side of it are a pair.)
    static func textWidth<S: StringProtocol>(_ text: S, face: Face, after previous: Character? = nil) -> CGFloat {
        let unit = face.size / 1000
        var across: CGFloat = 0
        var last = previous.flatMap { $0 == softHyphenCharacter ? nil : glyph($0) }
        for character in text where character != softHyphenCharacter {
            let next = glyph(character)
            across += next.width * unit + face.tracking
            if let last { across += widerPair(last, next) * unit }
            last = next
        }
        return across
    }

    /// The title as it is drawn on a cloth `width` wide, which is what the layout counts and what
    /// `Banner.text` carries:
    /// - its words one space apart, with none at its ends: a run of spaces, a tab and a line break
    ///   each become one space (so nothing is drawn that was not counted);
    /// - a word wider than a line holds carries soft hyphens (U+00AD) where each line of it ends,
    ///   so it breaks there, with a hyphen, instead of spilling past its cloth (S20). A word that
    ///   already carries one is left as it is, and none is put where a line may end anyway
    ///   (beside an ideograph or an emoji).
    static func drawnTitle(_ text: String, width: CGFloat, face: Face = .flag) -> String {
        let room = width - face.inset
        return text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).map { word -> String in
            guard textWidth(word, face: face) > room, !word.contains(softHyphen) else { return String(word) }
            var out = "", run: CGFloat = 0
            var last: Character?
            for character in word {
                let across = textWidth(String(character), face: face, after: last)
                if let last, run + across + textWidth("-", face: face, after: character) > room {
                    if !glyph(last).breaks, !glyph(character).breaks { out += softHyphen }
                    run = 0
                    out.append(character)
                    run += textWidth(String(character), face: face)
                } else {
                    out.append(character)
                    run += across
                }
                last = character
            }
            return out
        }.joined(separator: " ")
    }

    /// How many lines a title takes on a cloth `width` wide, at most 3: its drawn form wrapped as
    /// the text system wraps it (at a space, after a hyphen that a letter follows, at a soft
    /// hyphen, where the hyphen it then shows must fit too, and either side of an ideograph or an
    /// emoji), by the face's widths.
    static func lines(for text: String, width: CGFloat, face: Face = .flag) -> Int {
        let room = width - face.inset
        var lines = 1
        var used: CGFloat = 0                  // the width of the line so far
        var last: Character?                    // and its last character
        for word in drawnTitle(text, width: width, face: face).split(separator: " ") {
            for (i, piece) in breaks(in: word).enumerated() {
                let tail = piece.soft ? textWidth("-", face: face, after: piece.text.last) : 0
                if used > 0 {
                    let across = textWidth((i == 0 ? " " : "") + piece.text, face: face, after: last)
                    if used + across + tail <= room {
                        used += across
                        last = piece.text.last
                        continue
                    }
                    lines += 1
                }
                // The piece starts a line. One wider than a line (a word the person hyphenated themselves) runs on.
                let alone = textWidth(piece.text, face: face)
                let over = alone + tail > room ? Int(((alone + tail) / room).rounded(.down)) : 0
                lines += over
                used = alone - CGFloat(over) * room
                last = piece.text.last
            }
            if lines > 3 { break }
        }
        return min(3, max(1, lines))
    }

    /// A word in the pieces a line may end after: at a soft hyphen (`soft`: a hyphen shows there
    /// if the line ends), after a hyphen of its own that a letter follows, and either side of an
    /// ideograph or an emoji. A full-width mark (、。「」) stays with the character before it.
    private static func breaks(in word: Substring) -> [(text: String, soft: Bool)] {
        var pieces: [(text: String, soft: Bool)] = []
        var piece = ""
        let characters = Array(word)
        for (i, character) in characters.enumerated() {
            if character == softHyphenCharacter {
                if !piece.isEmpty { pieces.append((piece, true)); piece = "" }
                continue
            }
            if glyph(character).breaks {
                if !piece.isEmpty { pieces.append((piece, false)); piece = "" }
                pieces.append((String(character), false))
                continue
            }
            if piece.isEmpty, let scalar = character.unicodeScalars.first, (0x3000...0x303F).contains(scalar.value) || (0xFF00...0xFF65).contains(scalar.value),
               let before = pieces.indices.last, !pieces[before].soft {
                pieces[before].text.append(character)
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
