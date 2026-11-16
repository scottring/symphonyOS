import Foundation
import CoreGraphics

// MARK: - The lines a cloth draws

/// The layout decides how tall a cloth is before anything is drawn, and it decides where each of
/// its lines breaks (F39): `setLines` returns the strings to draw, one a line, and the view draws
/// each as it is given, asking the text system nothing. So the count is the drawing. The core has
/// no fonts: it carries the widths of the one face every cloth is set in (DM Sans SemiBold, read
/// from the bundled file) and breaks the words by them, at each cloth's own size and inner width.
///
/// What must hold is width: no line the core returns may be set wider than its cloth's inner
/// width. The face's kerning moves some pairs of characters closer than their two widths and some
/// further apart; the pairs it sets further apart are counted (`widerPairs`), the pairs it sets
/// closer are not, which only ever makes a line counted wider than it is set.
/// `WalkLayoutTests.noPairIsSetWiderThanItIsCounted` holds every pair of the characters known here
/// to that against the bundled face. A character the face does not have (another script, an emoji)
/// is set by the system in another face: it is counted wider than any such face sets it.
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
    /// character the face does not have); and whether a line may end between it and another such
    /// (`ideograph`: an ideograph or a kana letter that may both end and start a line).
    struct Glyph { let width: CGFloat; let plain: UInt32; let own: UInt32; let ideograph: Bool }

    static func glyph(_ character: Character) -> Glyph {
        if let ascii = character.asciiValue, (32...126).contains(ascii) {
            return Glyph(width: glyphWidths[Int(ascii) - 32], plain: UInt32(ascii), own: UInt32(ascii), ideograph: false)
        }
        // A letter typed as its plain letter and a combining accent is the same letter.
        let whole = character.unicodeScalars.count > 1
            ? (String(character).precomposedStringWithCanonicalMapping.first ?? character) : character
        if whole.unicodeScalars.count == 1, let scalar = whole.unicodeScalars.first {
            if let known = otherGlyphWidths[whole] { return Glyph(width: known, plain: scalar.value, own: scalar.value, ideograph: false) }
            if accentedLetters.contains(whole), let plain = String(whole).decomposedStringWithCanonicalMapping.unicodeScalars.first,
               (32...126).contains(plain.value) {
                return Glyph(width: glyphWidths[Int(plain.value) - 32], plain: plain.value, own: scalar.value, ideograph: false)
            }
        }
        return Glyph(width: unknownWidth(whole), plain: 0, own: 0, ideograph: isIdeograph(whole))
    }

    /// One character's width in thousandths of an em.
    static func glyphWidth(_ character: Character) -> CGFloat { glyph(character).width }

    /// An ideograph, or a kana letter, that may both end and start a line: one scalar, not a small
    /// kana (ぁ ッ ャ …), not the prolonged sound mark, an iteration mark or a punctuation mark.
    /// A line may end between two of these with no mark.
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

    /// The title's words one space apart, none at its ends: a run of spaces, a tab and a line break
    /// each become one space. The lines a cloth draws are this, broken (`Banner.text` carries it).
    static func normalised(_ text: String) -> String {
        text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
    }

    /// The lines a cloth draws of a title in a face, each no wider than `width` (the cloth's inner
    /// width: the cloth less `face.inset`) by `textWidth`, at most `limit` of them (F39).
    static func setLines(_ text: String, face: Face, width: CGFloat, limit: Int) -> [String] {
        breakLines(text, room: width, limit: limit) { textWidth($0, face: face, after: $1) }
    }

    /// How many lines a title takes on a cloth `width` wide, at most 3: the lines `setLines` gives
    /// it (one for a title with no words).
    static func lines(for text: String, width: CGFloat, face: Face = .flag) -> Int {
        max(1, setLines(text, face: face, width: width - face.inset, limit: 3).count)
    }

    /// The one breaker (F39), over any face's widths: `measure(text, previous)` is how wide `text` is
    /// on a line after the character `previous`. Lines, greedily, no wider than `room`:
    /// - the words one space apart (`normalised`); a word goes on the line if it fits with its
    ///   space, else it starts the next line;
    /// - inside a word a line may end after a hyphen that a letter follows (the hyphen ends the
    ///   line), between two ideographs or kana (`Glyph.ideograph`), with no mark, and at a soft
    ///   hyphen the person typed, drawn there as "-" (and nowhere else drawn);
    /// - a piece wider than a whole line starts a fresh line and is filled a character (grapheme
    ///   cluster) at a time, as many as fit, with "-" where the line ends between two letters or
    ///   digits (none between ideographs, emoji or marks), the hyphen's room kept;
    /// - where the words need more than `limit` lines, the last kept line is made again to end in
    ///   "…": its first word and as many whole further words as fit with the "…", or, if not even
    ///   its first word fits whole, as many of its characters as fit.
    /// No line is empty; a title of only spaces has none.
    static func breakLines(_ text: String, room: CGFloat, limit: Int, measure: (String, Character?) -> CGFloat) -> [String] {
        guard limit > 0 else { return [] }
        let words = text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).map { pieces(in: $0) }.filter { !$0.isEmpty }
        var lines: [String] = []
        /// Where each line begins: its word, and the part of that word the line begins with.
        var starts: [(word: Int, head: String)] = []
        var line = "", used: CGFloat = 0
        func begin(_ word: Int, _ head: String) { starts.append((word, head)) }
        build: for (w, word) in words.enumerated() {
            for (i, piece) in word.enumerated() {
                // A typed soft hyphen's "-" must fit where its line may end.
                let tail = i < word.count - 1 && !piece.mark.isEmpty ? measure(piece.mark, piece.text.last) : 0
                if !line.isEmpty {
                    let join = (i == 0 ? " " : "") + piece.text
                    let across = measure(join, line.last)
                    if used + across + tail <= room {
                        line += join
                        used += across
                        continue
                    }
                    lines.append(line + (i == 0 ? "" : word[i - 1].mark))
                    line = ""
                    if lines.count > limit { break build }
                }
                // The piece begins a line. One wider than a whole line is filled a character at a time.
                var rest = Array(piece.text)
                begin(w, String(rest) + word[(i + 1)...].map(\.text).joined())
                while rest.count > 1, measure(String(rest), nil) + tail > room {
                    let k = fill(rest, room: room, measure: measure)
                    lines.append(String(rest[..<k]) + (hyphenates(rest[k - 1], rest[k]) ? "-" : ""))
                    if lines.count > limit { break build }
                    rest = Array(rest[k...])
                    begin(w, String(rest) + word[(i + 1)...].map(\.text).joined())
                }
                line = String(rest)
                used = measure(line, nil)
            }
        }
        if !line.isEmpty, lines.count <= limit { lines.append(line) }
        guard lines.count > limit else { return lines }

        // Cut: the last kept line, made again to end in "…".
        let ellipsis = "…"
        let (w, head) = starts[limit - 1]
        var last: String
        if measure(head + ellipsis, nil) <= room {
            last = head
            for next in words[(w + 1)...].map({ $0.map(\.text).joined() }) {
                guard measure(last + " " + next + ellipsis, nil) <= room else { break }
                last += " " + next
            }
        } else {
            let characters = Array(head)
            var k = 0
            while k < characters.count, measure(String(characters[...k]) + ellipsis, nil) <= room { k += 1 }
            last = String(characters[..<k])
        }
        return Array(lines.prefix(limit - 1)) + [last + ellipsis]
    }

    /// How many of these characters begin a line, at least one: as many as fit with the "-" a break
    /// between two letters or digits there shows.
    private static func fill(_ characters: [Character], room: CGFloat, measure: (String, Character?) -> CGFloat) -> Int {
        var best = 1
        var across: CGFloat = 0
        for k in 1..<characters.count {
            across += measure(String(characters[k - 1]), k > 1 ? characters[k - 2] : nil)
            if across > room { break }
            let dash = hyphenates(characters[k - 1], characters[k]) ? measure("-", characters[k - 1]) : 0
            if across + dash <= room { best = k }
        }
        return best
    }

    /// Whether a line ending between these two characters shows a "-": between two letters or
    /// digits of an alphabet (not ideographs, kana or hangul, which part with no mark).
    private static func hyphenates(_ a: Character, _ b: Character) -> Bool {
        func spelled(_ c: Character) -> Bool {
            guard c.isLetter || c.isNumber, let first = c.unicodeScalars.first else { return false }
            if first.properties.isIdeographic { return false }
            switch first.value {
            case 0x1100...0x11FF, 0x3040...0x30FF, 0x3130...0x318F, 0x31F0...0x31FF, 0xAC00...0xD7AF: return false
            default: return true
            }
        }
        return spelled(a) && spelled(b)
    }

    /// A word in the pieces a line may end after (`mark`: what the line then shows at its end): after
    /// a hyphen that a letter follows (nothing: the hyphen is there), between two ideographs or kana
    /// (nothing), and at a typed soft hyphen ("-"; the soft hyphen itself is not kept).
    private static func pieces<S: StringProtocol>(in word: S) -> [(text: String, mark: String)] {
        var out: [(text: String, mark: String)] = []
        var piece = ""
        let characters = Array(word)
        for (i, character) in characters.enumerated() {
            if character == softHyphenCharacter {
                if !piece.isEmpty, i + 1 < characters.count { out.append((piece, "-")); piece = "" }
                continue
            }
            if !piece.isEmpty, i > 0, glyph(characters[i - 1]).ideograph, glyph(character).ideograph {
                out.append((piece, ""))
                piece = ""
            }
            piece.append(character)
            if character == "-", piece.count > 1, i + 1 < characters.count, characters[i + 1].isLetter {
                out.append((piece, ""))
                piece = ""
            }
        }
        if !piece.isEmpty { out.append((piece, "")) }
        return out
    }

    /// An example's tag: the long one where the cloth holds it on its one line, else the short one.
    static func exampleTag(forWidth width: CGFloat) -> String {
        textWidth(WalkCopy.exampleTag, face: .tag) <= width - Face.tag.inset ? WalkCopy.exampleTag : WalkCopy.exampleTagShort
    }
}
