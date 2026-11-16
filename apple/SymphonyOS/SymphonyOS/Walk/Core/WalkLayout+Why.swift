import Foundation
import CoreGraphics

// MARK: - The why line's widths (DM Sans Regular)

/// The why line under the question is set in DM Sans Regular 15 and, like the question and the cloths,
/// broken here by the shared breaker (`breakLines`, F39) and drawn as given, one line per string: the
/// block's height comes from the lines it draws. It carries the person's own words when it names a flag
/// chosen off its post (`WalkCopy.chosenNote`), so its widths are the face's own, not an estimate.
/// `WalkLayoutTests.noWhyPairIsSetWiderThanItIsCounted` holds every pair of the characters known here
/// to the bundled face.
extension WalkLayout {
    /// The why line's size (DM Sans Regular).
    static let whySize: CGFloat = 15

    /// DM Sans Regular's advance widths in thousandths of an em, for U+0020 (space) to U+007E (~), in
    /// order, read from the bundled `DMSans-Regular.ttf` (rounded up).
    static let whyGlyphWidths: [CGFloat] = [
        266, 250, 291, 804, 580, 786, 734, 159, 373, 373, 480, 550, 182, 541, 198, 392,     // space ! " # $ % & ' ( ) * + , - . /
        684, 312, 576, 591, 607, 610, 628, 534, 608, 628, 202, 227, 550, 550, 550, 524,     // 0 to 9 : ; < = > ?
        1005, 664, 603, 717, 688, 565, 535, 758, 681, 234, 501, 584, 527, 841, 691, 774,    // @ A to O
        580, 774, 594, 580, 561, 655, 669, 968, 603, 580, 541, 314, 392, 314, 622, 660,     // P to Z [ \ ] ^ _
        213, 544, 626, 572, 627, 568, 340, 558, 575, 240, 243, 504, 223, 891, 574, 593,     // ` a to o
        626, 627, 370, 502, 392, 573, 527, 763, 496, 556, 458, 427, 234, 427, 550,          // p to z { | } ~
    ]
    /// More of the face's own (the same characters as the cloths' face: `otherGlyphWidths`). The accented
    /// letters of `accentedLetters` are no wider than their plain letter in this face either.
    static let whyOtherWidths: [Character: CGFloat] = [
        "’": 210, "‘": 210, "“": 367, "”": 367, "…": 566, "·": 198, "–": 669, "—": 873,
        "ß": 659, "Ł": 553, "ł": 251, "Ø": 776, "ø": 597, "Æ": 912, "æ": 914, "Œ": 1114, "œ": 979, "€": 771, "£": 601,
        "ď": 709, "ľ": 306,
    ]
    /// The pairs the face sets FURTHER apart than their two widths, by how much (thousandths of an em). A
    /// pair with an accented letter takes its plain letters' entry, but for the two the face sets wider still.
    static let whyWiderPairs: [String: CGFloat] = [
        "\"7": 30, "'7": 30, "/B": 57, "/D": 57, "/E": 57, "/F": 57, "/H": 57, "/I": 57, "/K": 57, "/L": 57, "/M": 57, "/N": 57,
        "/P": 57, "/R": 57, "/T": 20, "/V": 30, "/W": 3, "/Y": 21, "/|": 57, "2#": 4, "2f": 3, "2v": 3, "2x": 3, "4&": 39,
        "5#": 4, "7\"": 30, "7'": 30, "71": 4, "7V": 20, "7W": 3, "7f": 3, "9Ł": 23, "T?": 20, "T\\": 4, "V7": 20, "V\\": 6,
        "Y\"": 39, "Y'": 39, "\\,": 57, "\\_": 41, "_j": 8, "gj": 20, "gv": 3, "qj": 26, "r2": 7, "r3": 3, "r:": 17, "t,": 52,
        "t2": 30, "v2": 3, "vf": 20, "vt": 3, "y7": 4,
        "/Î": 60, "/Ī": 63,
    ]
    private static let whyPairsByScalars: [UInt64: CGFloat] = Dictionary(uniqueKeysWithValues: whyWiderPairs.map { pair, extra in
        let scalars = Array(pair.unicodeScalars)
        return (UInt64(scalars[0].value) << 32 | UInt64(scalars[1].value), extra)
    })

    /// One character as the why line's count takes it: the cloths' face's classes (`glyph`: the same
    /// characters known, an accented letter as its plain one, anything else 1.4 em), this face's widths.
    private static func whyGlyph(_ character: Character) -> (width: CGFloat, plain: UInt32, own: UInt32) {
        let g = glyph(character)
        guard g.plain != 0 else { return (g.width, 0, 0) }
        let width: CGFloat
        if (32...126).contains(g.own) {
            width = whyGlyphWidths[Int(g.own) - 32]
        } else if let scalar = UnicodeScalar(g.own), let known = whyOtherWidths[Character(scalar)] {
            width = known
        } else if (32...126).contains(g.plain) {
            width = whyGlyphWidths[Int(g.plain) - 32]
        } else {
            width = unknownGlyphWidth
        }
        return (width, g.plain, g.own)
    }

    /// How wide words are on one why line, never narrower than DM Sans Regular 15 sets them.
    /// `previous`: the character the words follow on their line.
    static func whyWidth<S: StringProtocol>(_ text: S, after previous: Character? = nil) -> CGFloat {
        let unit = whySize / 1000
        var across: CGFloat = 0
        var last = previous.flatMap { $0 == softHyphenCharacter ? nil : whyGlyph($0) }
        for character in text where character != softHyphenCharacter {
            let next = whyGlyph(character)
            across += next.width * unit
            if let last, last.own != 0, next.own != 0 {
                let extra = whyPairsByScalars[UInt64(last.own) << 32 | UInt64(next.own)]
                    ?? whyPairsByScalars[UInt64(last.plain) << 32 | UInt64(next.plain)] ?? 0
                across += extra * unit
            }
            last = next
        }
        return across
    }

    /// The lines a why line is drawn on in the block's width, at most `limit` (the last cut with "…").
    static func whySetLines(_ why: String, wing: CGFloat, limit: Int) -> [String] {
        breakLines(why, room: wordsWidth(wing: wing), limit: limit) { whyWidth($0, after: $1) }
    }
}
