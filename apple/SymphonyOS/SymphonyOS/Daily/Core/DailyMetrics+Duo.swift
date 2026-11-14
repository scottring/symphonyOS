import Foundation
import CoreGraphics

/// The bar's numbers that the narrow windows (the Duo's outside screen, a 375-point phone) depend on.
extension DailyMetrics {
    /// The field's words stand this far in from its left end.
    static let wordsInset: CGFloat = 18
}

extension DailyMetrics.Bar {
    /// The room the field's words have: the typing part less the words' inset. The placeholder
    /// that fits it is chosen by `DailyCopy.fitting`.
    var wordsRoom: CGFloat { typing.width - DailyMetrics.wordsInset }
}
