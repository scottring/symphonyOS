import SwiftUI

// MARK: - Typography (landing-page kit)
//
// Crimson Pro — display (mastheads, block titles, the italic note line)
// DM Sans — body, captions, eyebrows
// Both are bundled under Resources/Fonts and registered via Info.plist
// UIAppFonts. `DesignSystemTests.bundledFontResolves` fails if one goes missing.

extension Font {
    // MARK: Display (Crimson Pro)
    static let displayLarge  = Font.custom("CrimsonPro-Regular", size: 34)
    static let displayMedium = Font.custom("CrimsonPro-Regular", size: 24)
    static let displaySmall  = Font.custom("CrimsonPro-SemiBold", size: 18)
    /// The one-line serif note on a block card.
    static let displayItalic = Font.custom("CrimsonPro-Italic", size: 14)

    // MARK: Body (DM Sans)
    static let bodyLarge  = Font.custom("DMSans-Regular", size: 17)
    static let bodyMedium = Font.custom("DMSans-Regular", size: 15)
    static let bodySmall  = Font.custom("DMSans-Regular", size: 13)

    static let bodyLargeBold  = Font.custom("DMSans-SemiBold", size: 17)
    static let bodyMediumBold = Font.custom("DMSans-SemiBold", size: 15)
    static let bodySmallBold  = Font.custom("DMSans-SemiBold", size: 13)

    // MARK: Caption
    static let captionText = Font.custom("DMSans-Regular", size: 11)
    static let captionBold = Font.custom("DMSans-Medium", size: 11)

    /// Tracked uppercase section label (MORNING, AFTERNOON…). Pair with
    /// `.eyebrowStyle()` for the tracking + case.
    static let eyebrow = Font.custom("DMSans-Medium", size: 11)
}

extension View {
    /// Landing `.section-eyebrow`: 11pt medium, uppercase, 1.2pt tracking, muted.
    func eyebrowStyle() -> some View {
        self.font(.eyebrow)
            .textCase(.uppercase)
            .kerning(1.2)
            .foregroundStyle(Color.textTertiary)
    }
}
