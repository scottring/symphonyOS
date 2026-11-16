import Foundation
import CoreGraphics

// MARK: - The words (the eyebrow, the question and its why line)

/// Where the question block stands on steps 1 to 5 and how it is set, in stage points ("The board as
/// numbers", "The words"; F30). The block never ends below `wordsFootLimit`: a question that would take
/// more than `questionMaxLines` lines at its normal size is set one size smaller, and if the block still
/// would not end by the limit the why line is not drawn. The goal's quote is never cut for it (it is
/// already whole up to `WalkCopy.shortLength`). Lines are counted by estimate, as the compass points'
/// words are (`wrap`), with numbers measured from the bundled faces.
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

    /// Measured from the bundled faces (UIKit's line heights; line counts against real wrapping of the
    /// walk's questions, 90 of them, at 334, 419 and 500 wide). Crimson Pro's line is 1.111 of its size
    /// (35.6 at 32, 31.1 at 28). A character is 0.40 of the size (12.8 at 32, 11.2 at 28), and m, w, M
    /// and W count twice (25.7, 23.5, 26.6 and 29.4 at 32, against 13.4 for an ordinary letter): so
    /// counted, the estimate never gives fewer lines than the real wrapping, and at most one more.
    /// DM Sans 15's line is 19.53, with the why line's 1.5 between lines; 7.0 a character gives the why
    /// lines' real count. The eyebrow is one line of 15.62; 8 between the three.
    static let questionLineRatio: CGFloat = 1.111, questionCharRatio: CGFloat = 0.40
    static let questionWideLetters: Set<Character> = ["m", "w", "M", "W"]
    static let whyLine: CGFloat = 19.53, whySpacing: CGFloat = 1.5, whyChar: CGFloat = 7.0
    static let eyebrowLine: CGFloat = 15.62, blockGap: CGFloat = 8

    /// Greedy wrapping by words, as `wrap`, with the face's wide letters counted twice.
    static func questionLines(_ question: String, size: CGFloat, wing: CGFloat) -> Int {
        let width = wordsWidth(wing: wing), char = size * questionCharRatio
        func across(_ s: String) -> CGFloat {
            CGFloat(s.reduce(0) { $0 + (questionWideLetters.contains($1) ? 2 : 1) }) * char
        }
        var lines = 0
        var line = ""
        for word in question.split(separator: " ").map(String.init) {
            let candidate = line.isEmpty ? word : line + " " + word
            if line.isEmpty || across(candidate) + 4 <= width {
                line = candidate
            } else {
                lines += 1
                line = word
            }
        }
        return lines + (line.isEmpty ? 0 : 1)
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
        return Words(questionSize: size, questionLines: lines, whyLines: whys,
                     foot: wordsFoot(questionSize: size, questionLines: lines, whyLines: whys))
    }

    /// The block for a step, from its own words.
    static func words(_ s: WalkState, _ p: WalkPeriods, wing: CGFloat) -> Words {
        words(question: WalkCopy.question(s, p), why: WalkCopy.why(s, p), wing: wing)
    }
}
