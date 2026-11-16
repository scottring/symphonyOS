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
///
/// A line is counted to end only where the text system surely can end one (F38): at a space (but
/// not before a closing mark or after an opening one), after a hyphen that a letter follows, at a
/// soft hyphen, and between two ideographs or kana letters. Fewer places to end a line can only
/// make the count more cautious; one the system does not take could count a title a line short.
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
    /// emoji (its size and 4 points: 1364 at 11 pt). An emoji made of several (a family, a person
    /// and a sign joined) counts 1.4 em for each picture in it, as the system draws it where it
    /// cannot join them; the joiners, the variation selectors and the skin tones count nothing.
    static let unknownGlyphWidth: CGFloat = 1400

    /// How wide a character the face does not have is counted, in thousandths of an em.
    static func unknownWidth(_ character: Character) -> CGFloat {
        let pictures = character.unicodeScalars.filter { $0.value > 0x7F && $0.properties.isEmoji && !$0.properties.isEmojiModifier }
        return unknownGlyphWidth * CGFloat(max(1, pictures.count))
    }

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
    /// character the face does not have); whether it is Chinese, Japanese or Korean writing, a
    /// full-width mark or an emoji (`foreign`: no hyphen is put or taken beside it); and whether a
    /// line may end between it and another such (`ideograph`: an ideograph or a kana letter that may
    /// both end and start a line).
    struct Glyph { let width: CGFloat; let plain: UInt32; let own: UInt32; let foreign: Bool; let ideograph: Bool }

    static func glyph(_ character: Character) -> Glyph {
        if let ascii = character.asciiValue, (32...126).contains(ascii) {
            return Glyph(width: glyphWidths[Int(ascii) - 32], plain: UInt32(ascii), own: UInt32(ascii), foreign: false, ideograph: false)
        }
        // A letter typed as its plain letter and a combining accent is the same letter.
        let whole = character.unicodeScalars.count > 1
            ? (String(character).precomposedStringWithCanonicalMapping.first ?? character) : character
        if whole.unicodeScalars.count == 1, let scalar = whole.unicodeScalars.first {
            if let known = otherGlyphWidths[whole] { return Glyph(width: known, plain: scalar.value, own: scalar.value, foreign: false, ideograph: false) }
            if accentedLetters.contains(whole), let plain = String(whole).decomposedStringWithCanonicalMapping.unicodeScalars.first,
               (32...126).contains(plain.value) {
                return Glyph(width: glyphWidths[Int(plain.value) - 32], plain: plain.value, own: scalar.value, foreign: false, ideograph: false)
            }
        }
        return Glyph(width: unknownWidth(whole), plain: 0, own: 0, foreign: isForeign(whole), ideograph: isIdeograph(whole))
    }

    /// One character's width in thousandths of an em.
    static func glyphWidth(_ character: Character) -> CGFloat { glyph(character).width }

    /// Chinese, Japanese and Korean writing, their full-width marks, and emoji.
    private static func isForeign(_ character: Character) -> Bool {
        let scalars = character.unicodeScalars
        guard let first = scalars.first else { return false }
        if first.properties.isIdeographic { return true }
        switch first.value {
        case 0x1100...0x11FF, 0x2E80...0x2FFF, 0x3000...0x31FF, 0x3400...0x4DBF, 0xAC00...0xD7AF, 0xFF00...0xFFEF,   // hangul, CJK marks, kana, full-width
             0x1F000...0x1FAFF: return true                                                                              // emoji
        default: return scalars.contains { $0.value > 0x7F && $0.properties.isEmoji }
        }
    }

    /// An ideograph, or a kana letter, that may both end and start a line: one scalar, not a small
    /// kana (ぁ ッ ャ …), not the prolonged sound mark, an iteration mark or a punctuation mark.
    private static func isIdeograph(_ character: Character) -> Bool {
        let scalars = character.unicodeScalars
        guard scalars.count == 1, let value = scalars.first?.value else { return false }
        switch value {
        case 0x4E00...0x9FFF, 0x3400...0x4DBF, 0xF900...0xFAFF, 0x20000...0x3FFFF: return true                         // Han
        case 0x3041...0x3096: return !smallKana.contains(value)                                                          // hiragana
        case 0x30A1...0x30FA: return !smallKana.contains(value)                                                          // katakana
        default: return false
        }
    }
    private static let smallKana: Set<UInt32> = [
        0x3041, 0x3043, 0x3045, 0x3047, 0x3049, 0x3063, 0x3083, 0x3085, 0x3087, 0x308E, 0x3095, 0x3096,
        0x30A1, 0x30A3, 0x30A5, 0x30A7, 0x30A9, 0x30C3, 0x30E3, 0x30E5, 0x30E7, 0x30EE, 0x30F5, 0x30F6,
    ]

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
    ///   already carries one is left as it is, and none is put beside Chinese, Japanese or Korean
    ///   writing or an emoji.
    static func drawnTitle(_ text: String, width: CGFloat, face: Face = .flag) -> String {
        let room = width - face.inset
        return text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).map { word -> String in
            guard textWidth(word, face: face) > room, !word.contains(softHyphen) else { return String(word) }
            var out = "", run: CGFloat = 0
            var last: Character?
            for character in word {
                let across = textWidth(String(character), face: face, after: last)
                if let last, run + across + textWidth("-", face: face, after: character) > room {
                    if !glyph(last).foreign, !glyph(character).foreign { out += softHyphen }
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

    /// How many lines a title takes on a cloth `width` wide, at most 3: its drawn form wrapped,
    /// by the face's widths, only where the text system surely ends a line (`words`, `breaks`); a
    /// soft hyphen's line must hold the hyphen it then shows.
    static func lines(for text: String, width: CGFloat, face: Face = .flag) -> Int {
        let room = width - face.inset
        var lines = 1
        var used: CGFloat = 0                  // the width of the line so far
        var last: Character?                    // and its last character
        for word in words(drawnTitle(text, width: width, face: face)) {
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
                // The piece starts a line. One wider than a line (a word the person hyphenated themselves,
                // a Korean word, emoji with no space between) runs on: the text system then ends each
                // line between two characters, so each line holds the characters that fit.
                used = 0
                var before: Character?
                for character in piece.text where character != softHyphenCharacter {
                    let across = textWidth(String(character), face: face, after: before)
                    if used > 0, used + across > room {
                        lines += 1
                        used = textWidth(String(character), face: face)
                    } else {
                        used += across
                    }
                    before = character
                }
                // A line that must end at the soft hyphen and cannot hold it ends sooner: a line more.
                if used + tail > room { lines += 1 }
                last = piece.text.last
            }
            if lines > 3 { break }
        }
        return min(3, max(1, lines))
    }

    /// The drawn title's words: split at its spaces, but for a space the text system will not end a
    /// line at, which stays inside its word: before a closing bracket, a stop, a comma, a colon, an
    /// exclamation or question mark, a slash or a mark that may not start a line ("Wow !"); before
    /// a closing quote that ends a word; after an opening bracket or quote ("( today"); and between
    /// two dashes ("— —").
    static func words(_ drawn: String) -> [String] {
        var out: [String] = []
        for word in drawn.split(separator: " ") {
            if let previous = out.last?.last, let first = word.first,
               opensWord.contains(previous) || closesWord.contains(first) || (previous == "—" && first == "—")
                || (closingQuotes.contains(first) && !(word.dropFirst().first.map { $0.isLetter || $0.isNumber } ?? false)) {
                out[out.count - 1] += " " + word
            } else {
                out.append(String(word))
            }
        }
        return out
    }
    private static let closesWord = Set(")]}!?,.:;/、。，．：；！？）］｝」』】〕〉》〙〗‼⁇⁈⁉・ー々ゝゞヽヾぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ")
    private static let closingQuotes = Set("”’»")
    private static let opensWord = Set("([{“‘«（［｛「『【〔〈《〘〖")

    /// A word in the pieces a line may end after (F38), each where the text system surely can:
    /// - at a soft hyphen (`soft`: a hyphen shows there if the line ends), but not beside Chinese,
    ///   Japanese or Korean writing or an emoji;
    /// - after a hyphen of the word's own that a letter follows, with no such writing either side;
    /// - between two ideographs or kana letters (`Glyph.ideograph`) with nothing else touching
    ///   the break; never between one and a mark, a bracket or a quote, never beside an emoji,
    ///   never inside a Korean word.
    /// Anywhere else a line of this word may end only where it must (a word wider than a line).
    private static func breaks(in word: String) -> [(text: String, soft: Bool)] {
        var pieces: [(text: String, soft: Bool)] = []
        var piece = ""
        let characters = Array(word)
        for (i, character) in characters.enumerated() {
            let before = i > 0 ? characters[i - 1] : nil
            let after = i + 1 < characters.count ? characters[i + 1] : nil
            if character == softHyphenCharacter {
                if !piece.isEmpty, let before, let after, !glyph(before).foreign, !glyph(after).foreign {
                    pieces.append((piece, true))
                    piece = ""
                }
                continue
            }
            if !piece.isEmpty, let before, glyph(before).ideograph, glyph(character).ideograph {
                pieces.append((piece, false))
                piece = ""
            }
            piece.append(character)
            if character == "-", piece.count > 1, let before, let after, after.isLetter, !glyph(before).foreign, !glyph(after).foreign {
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
