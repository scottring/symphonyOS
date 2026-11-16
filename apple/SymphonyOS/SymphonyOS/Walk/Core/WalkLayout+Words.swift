import Foundation
import CoreGraphics

// MARK: - The words (the eyebrow, the question and its why line)

/// Where the question block stands on steps 1 to 5 and how it is set, in stage points ("The board as
/// numbers", "The words"; F30). The block never ends below `wordsFootLimit`: a question that would take
/// more than `questionMaxLines` lines at its normal size is set one size smaller, and if the block still
/// would not end by the limit the why line is not drawn; only if it still would not, the quoted goal is
/// cut at a word (it is otherwise whole up to `WalkCopy.shortLength`). The question's lines are
/// counted from Crimson Pro's own widths; the why line's by estimate, as the compass points' words are.
extension WalkLayout {
    /// The question block's width: the board less 28 each side, and on a wider window up to 166 wider,
    /// centred on x 195 ("On a wider window").
    static let wordsBoardWidth: CGFloat = 334, wordsMaxWiden: CGFloat = 166
    /// The question block's top on steps 1 to 5, under the top row.
    static let wordsTop: CGFloat = 96
    static func wordsWidth(wing: CGFloat) -> CGFloat { wordsBoardWidth + min(2 * wing, wordsMaxWiden) }

    /// How the block is set: the question's size and lines, the why line's lines (0 when it is not drawn),
    /// and the block's foot by estimate.
    struct Words: Equatable {
        /// The question as the block draws it.
        let question: String
        let questionSize: CGFloat
        let questionLines: Int
        let whyLines: Int
        let foot: CGFloat
        var showsWhy: Bool { whyLines > 0 }
    }

    /// The lowest the block may end: above the flags (`question` = 282) with 4 to spare.
    static let wordsFootLimit: CGFloat = 278
    /// Crimson Pro at the normal size, and the one size smaller (87.5 %: still the question).
    static let questionSize: CGFloat = 32, questionSmallSize: CGFloat = 28
    static let questionMaxLines = 3

    /// Measured from the bundled faces. Crimson Pro's line is 1.111 of its size (35.6 at 32, 31.1 at 28);
    /// the question's lines are counted from the face's own widths (`questionWidth`). DM Sans 15's line
    /// is 19.53, with the why line's 1.5 between lines; 7.0 a character gives the why lines' real count.
    /// The eyebrow is one line of 15.62; 8 between the three.
    static let questionLineRatio: CGFloat = 1.111
    static let whyLine: CGFloat = 19.53, whySpacing: CGFloat = 1.5, whyChar: CGFloat = 7.0
    static let eyebrowLine: CGFloat = 15.62, blockGap: CGFloat = 8
    /// How many lines the question takes at `size` in the block's width: its words wrapped greedily at
    /// spaces, as the text system wraps them, by Crimson Pro's own widths. Never fewer lines than the
    /// text takes (`WalkLayoutTests.theQuestionsLinesAreTheRealFaces` holds it to TextKit).
    static func questionLines(_ question: String, size: CGFloat, wing: CGFloat) -> Int {
        let room = wordsWidth(wing: wing)
        var lines = 0
        var used: CGFloat = 0                    // the width of the line so far
        var last: Character?                      // and its last character
        for word in question.split(whereSeparator: { $0.isWhitespace }) {
            if used > 0 {
                let across = questionWidth(" " + word, size: size, after: last)
                if used + across <= room {
                    used += across
                    last = word.last
                    continue
                }
            }
            // The word starts a line; one wider than a line runs on.
            let alone = questionWidth(word, size: size)
            let over = alone > room ? Int((alone / room).rounded(.down)) : 0
            lines += 1 + over
            used = alone - CGFloat(over) * room
            last = word.last
        }
        return lines
    }

    // MARK: Crimson Pro's widths

    /// Crimson Pro Regular's advance widths in thousandths of an em, for U+0020 (space) to U+007E (~),
    /// in order, read from the bundled `CrimsonPro-Regular.ttf` (rounded up).
    static let questionGlyphWidths: [CGFloat] = [
        188, 260, 410, 515, 468, 739, 697, 229, 352, 352, 430, 528, 229, 365, 229, 358,     // space ! " # $ % & ' ( ) * + , - . /
        566, 333, 477, 475, 511, 472, 508, 461, 539, 508, 229, 229, 528, 528, 528, 350,     // 0 to 9 : ; < = > ?
        884, 569, 547, 590, 667, 543, 495, 633, 657, 303, 303, 575, 500, 831, 659, 670,     // @ A to O
        502, 670, 554, 468, 544, 649, 572, 919, 569, 529, 521, 318, 358, 317, 528, 395,     // P to Z [ \ ] ^ _
        586, 463, 514, 416, 527, 440, 296, 484, 538, 262, 248, 478, 263, 804, 538, 497,     // ` a to o
        525, 512, 356, 393, 332, 531, 461, 736, 470, 461, 424, 361, 268, 361, 528,          // p to z { | } ~
    ]
    /// The curly quotes, the ellipsis, the middle dot and the dashes, as the face has them.
    static let questionOtherWidths: [Character: CGFloat] = [
        "’": 239, "‘": 239, "“": 418, "”": 418, "…": 639, "·": 241, "–": 489, "—": 977,
    ]
    /// The pairs Crimson Pro sets FURTHER apart than their two widths (its positive kerning), by how
    /// much, in thousandths of an em (rounded up): every one among the characters above, read from the
    /// bundled file. Pairs it sets closer are not counted, which only ever makes the count cautious.
    static let questionWiderPairs: [String: CGFloat] = [
        "\"\"": 30, "\"%": 20, "\"'": 30, "\"1": 15, "\"2": 5, "\"9": 10, "\"\\": 30, "$-": 5, "$·": 5, "%&": 15, "%,": 10,
        "%.": 10, "%_": 10, "%…": 10, "&,": 20, "&.": 20, "&:": 20, "&;": 20, "&?": 10, "&@": 20, "&A": 20, "&C": 10, "&G": 10,
        "&O": 10, "&Q": 10, "&X": 10, "&_": 20, "&c": 10, "&d": 10, "&e": 10, "&o": 10, "&q": 10, "&x": 5, "&…": 20, "'\"": 30,
        "'%": 20, "''": 30, "'1": 15, "'2": 5, "'9": 10, "'\\": 30, "(J": 78, "(\\": 40, "(j": 40, "*1": 5, "*7": 10, "*T": 10,
        "*V": 20, "*W": 20, "*Y": 15, "*a": 5, "*v": 10, "*w": 10, "*y": 10, ",$": 10, ",A": 10, ",J": 40, ",S": 10, ",X": 10,
        ",_": 15, ",s": 5, "-4": 10, "-C": 5, "-G": 5, "-O": 5, "-Q": 5, "-a": 5, "-c": 15, "-d": 15, "-e": 15, "-o": 15,
        "-q": 15, ".$": 10, ".A": 5, ".S": 10, ".X": 5, "._": 10, ".s": 5, "/\"": 30, "/'": 30, "/)": 40, "/?": 30, "/\\": 49,
        "/’": 20, "/”": 20, "0’": 10, "0”": 10, "4_": 10, "7\"": 5, "7'": 5, "7*": 10, "7Y": 10, "7\\": 10, "7’": 10, "7‘": 20,
        "7“": 20, "7”": 10, ":_": 10, ":’": 30, ":‘": 10, ":“": 10, ":”": 30, ";J": 24, ";_": 10, ";’": 30, ";‘": 10, ";“": 10,
        ";”": 30, "@’": 10, "@”": 10, "A,": 5, "A.": 5, "A@": 10, "A_": 9, "A…": 5, "B-": 10, "B·": 10, "C\\": 10, "D-": 5,
        "D’": 10, "D”": 10, "D·": 5, "F*": 20, "FT": 5, "F\\": 10, "F’": 10, "F‘": 10, "F“": 10, "F”": 10, "G-": 5, "G·": 5,
        "K*": 10, "K@": 5, "K_": 20, "L&": 10, "O-": 5, "O’": 10, "O”": 10, "O·": 5, "Q)": 20, "Q,": 25, "Q-": 5, "Q/": 40,
        "Q;": 25, "QJ": 125, "Q_": 69, "Qg": 29, "Qj": 15, "Q’": 10, "Q”": 10, "Q·": 5, "R_": 30, "S-": 5, "S·": 5, "T*": 10,
        "T7": 10, "T’": 15, "T‘": 20, "T“": 20, "T”": 15, "V*": 20, "V7": 5, "V’": 10, "V‘": 10, "V“": 10, "V”": 10, "W*": 20,
        "W7": 5, "W’": 10, "W‘": 10, "W“": 10, "W”": 10, "X,": 5, "X.": 5, "X@": 5, "X_": 10, "X…": 5, "Y*": 10, "Y’": 16,
        "Y‘": 10, "Y“": 10, "Y”": 16, "Z,": 10, "Z.": 10, "Z…": 10, "[J": 48, "\\J": 69, "\\_": 40, "_$": 10, "_,": 10,
        "_.": 10, "_/": 40, "_2": 10, "_:": 10, "_;": 10, "_A": 9, "_J": 79, "_S": 10, "_X": 10, "_…": 10, "b-": 15, "b’": 10,
        "b”": 10, "b·": 15, "c_": 10, "c’": 10, "c‘": 10, "c“": 10, "c”": 10, "e-": 10, "e’": 10, "e”": 10, "e·": 10, "f!": 9,
        "f)": 49, "f*": 30, "f7": 10, "f?": 68, "f\\": 79, "f]": 19, "f}": 4, "f’": 59, "f‘": 30, "f“": 30, "f”": 59, "g’": 30,
        "g‘": 4, "g“": 4, "g”": 30, "k,": 10, "k.": 10, "k_": 20, "k…": 10, "o-": 15, "o’": 10, "o”": 10, "o·": 15, "p-": 15,
        "p’": 10, "p”": 10, "p·": 15, "rv": 2, "rw": 2, "ry": 2, "r’": 20, "r‘": 10, "r“": 10, "r”": 20, "t_": 10, "v*": 5,
        "vf": 7, "vi": 2, "vj": 2, "vm": 2, "vn": 2, "vp": 2, "vr": 2, "vt": 4, "vu": 2, "vv": 9, "vw": 9, "vy": 9, "v’": 20,
        "v‘": 5, "v“": 5, "v”": 20, "w*": 5, "wf": 7, "wi": 2, "wj": 2, "wm": 2, "wn": 2, "wp": 2, "wr": 2, "wt": 4, "wu": 2,
        "wv": 9, "ww": 9, "wy": 9, "w’": 20, "w‘": 5, "w“": 5, "w”": 20, "x’": 11, "x”": 11, "y*": 5, "yf": 7, "yi": 2,
        "yj": 2, "ym": 2, "yn": 2, "yp": 2, "yr": 2, "yt": 4, "yu": 2, "yv": 9, "yw": 9, "yy": 9, "y’": 20, "y‘": 5, "y“": 5,
        "y”": 20, "z,": 5, "z.": 5, "z…": 5, "{J": 34, "}J": 10, "’%": 30, "’1": 10, "’2": 16, "’3": 5, "’7": 10, "’T": 25,
        "’V": 20, "’W": 20, "’X": 15, "’Y": 20, "’Z": 10, "’\\": 41, "’’": 20, "’‘": 20, "’“": 20, "’”": 20, "‘%": 40,
        "‘1": 30, "‘2": 30, "‘3": 15, "‘7": 20, "‘T": 30, "‘V": 15, "‘W": 15, "‘X": 10, "‘Y": 10, "‘\\": 40, "‘v": 10,
        "‘w": 10, "‘x": 15, "‘y": 10, "‘’": 20, "‘‘": 20, "‘“": 20, "‘”": 20, "“%": 40, "“1": 30, "“2": 30, "“3": 15, "“7": 20,
        "“T": 30, "“V": 15, "“W": 15, "“X": 10, "“Y": 10, "“\\": 40, "“v": 10, "“w": 10, "“x": 15, "“y": 10, "“’": 20,
        "“‘": 20, "““": 20, "“”": 20, "”%": 30, "”1": 10, "”2": 16, "”3": 5, "”7": 10, "”T": 25, "”V": 20, "”W": 20, "”X": 15,
        "”Y": 20, "”Z": 10, "”\\": 41, "”’": 20, "”‘": 20, "”“": 20, "””": 20, "…$": 10, "…A": 5, "…S": 10, "…X": 5, "…_": 10,
        "…s": 5, "·4": 10, "·C": 5, "·G": 5, "·O": 5, "·Q": 5, "·a": 5, "·c": 15, "·d": 15, "·e": 15, "·o": 15, "·q": 15
    ]
    private static let questionPairsByScalars: [UInt64: CGFloat] = Dictionary(uniqueKeysWithValues: questionWiderPairs.map { pair, extra in
        let scalars = Array(pair.unicodeScalars)
        return (UInt64(scalars[0].value) << 32 | UInt64(scalars[1].value), extra)
    })

    /// A character as the question's count takes it: its width in thousandths of an em, and the scalar it
    /// kerns as (0: none). An accented Latin letter counts as its plain letter (the face draws each as
    /// wide or narrower, but į); anything else counts 1.4 em, wider than any face sets it.
    private static func questionGlyph(_ character: Character) -> (width: CGFloat, kerns: UInt32) {
        if let ascii = character.asciiValue, (32...126).contains(ascii) { return (questionGlyphWidths[Int(ascii) - 32], UInt32(ascii)) }
        let whole = String(character).precomposedStringWithCanonicalMapping
        if let first = whole.first, let known = questionOtherWidths[first], let scalar = whole.unicodeScalars.first { return (known, scalar.value) }
        if whole != "į", whole.unicodeScalars.count == 1, character.isLetter,
           let plain = whole.decomposedStringWithCanonicalMapping.unicodeScalars.first, (65...122).contains(plain.value) {
            return (questionGlyphWidths[Int(plain.value) - 32], plain.value)
        }
        return (unknownGlyphWidth, 0)
    }

    /// How wide words are on one line of the question at `size`, never narrower than Crimson Pro sets
    /// them. `previous`: the character the words follow on their line.
    static func questionWidth<S: StringProtocol>(_ text: S, size: CGFloat, after previous: Character? = nil) -> CGFloat {
        let unit = size / 1000
        var across: CGFloat = 0
        var last = previous.map(questionGlyph)
        for character in text {
            let next = questionGlyph(character)
            across += next.width * unit
            if let last, last.kerns != 0, next.kerns != 0 {
                across += (questionPairsByScalars[UInt64(last.kerns) << 32 | UInt64(next.kerns)] ?? 0) * unit
            }
            last = next
        }
        return across
    }

    static func whyLines(_ why: String, wing: CGFloat) -> Int {
        wrap(why, width: wordsWidth(wing: wing), char: whyChar).count
    }

    /// The block's foot by estimate: the eyebrow, the question, and the why line when it has lines.
    static func wordsFoot(questionSize: CGFloat, questionLines: Int, whyLines: Int) -> CGFloat {
        var foot = wordsTop + eyebrowLine + blockGap + CGFloat(questionLines) * questionSize * questionLineRatio
        if whyLines > 0 { foot += blockGap + CGFloat(whyLines) * whyLine + CGFloat(whyLines - 1) * whySpacing }
        return foot
    }

    /// F30, in order: more than three lines at the normal size sets the question one size smaller; a
    /// block that still would not end by `wordsFootLimit` loses its why line.
    static func words(question: String, why: String, wing: CGFloat) -> Words {
        var size = questionSize
        var lines = questionLines(question, size: size, wing: wing)
        if lines > questionMaxLines {
            size = questionSmallSize
            lines = questionLines(question, size: size, wing: wing)
        }
        var whys = why.isEmpty ? 0 : whyLines(why, wing: wing)
        if wordsFoot(questionSize: size, questionLines: lines, whyLines: whys) > wordsFootLimit { whys = 0 }
        return Words(question: question, questionSize: size, questionLines: lines, whyLines: whys,
                     foot: wordsFoot(questionSize: size, questionLines: lines, whyLines: whys))
    }

    /// The block for a step, from its own words. The last resort (P20): a block that still ends below
    /// `wordsFootLimit` at the smaller size with no why line has its quoted goal cut at a word, a word
    /// at a time, until it ends there (`WalkCopy.short`). The goal's flag and the paper carry it whole.
    static func words(_ s: WalkState, _ p: WalkPeriods, wing: CGFloat) -> Words {
        let why = WalkCopy.why(s, p)
        var set = words(question: WalkCopy.question(s, p), why: why, wing: wing)
        var quote = WalkCopy.shortLength
        while set.foot > wordsFootLimit, quote > 1 {
            quote -= 1
            set = words(question: WalkCopy.question(s, p, quoting: quote), why: why, wing: wing)
        }
        return set
    }
}
