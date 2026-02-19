import SwiftUI

// MARK: - Typography

// Instrument Serif — display font (entity titles, headers)
// Satoshi — body font (all body text)
// Both are bundled as custom fonts in the app

extension Font {
    // MARK: Display (Instrument Serif)
    static let displayLarge = Font.custom("InstrumentSerif-Regular", size: 32)
    static let displayMedium = Font.custom("InstrumentSerif-Regular", size: 24)
    static let displaySmall = Font.custom("InstrumentSerif-Regular", size: 20)

    // MARK: Body (Satoshi)
    static let bodyLarge = Font.custom("Satoshi-Regular", size: 17)
    static let bodyMedium = Font.custom("Satoshi-Regular", size: 15)
    static let bodySmall = Font.custom("Satoshi-Regular", size: 13)

    static let bodyLargeBold = Font.custom("Satoshi-Bold", size: 17)
    static let bodyMediumBold = Font.custom("Satoshi-Bold", size: 15)
    static let bodySmallBold = Font.custom("Satoshi-Bold", size: 13)

    // MARK: Caption
    static let captionText = Font.custom("Satoshi-Regular", size: 11)
    static let captionBold = Font.custom("Satoshi-Bold", size: 11)

    // MARK: Fallbacks (uses system fonts when custom fonts not yet loaded)
    static let displayLargeFallback = Font.system(size: 32, weight: .regular, design: .serif)
    static let displayMediumFallback = Font.system(size: 24, weight: .regular, design: .serif)
    static let displaySmallFallback = Font.system(size: 20, weight: .regular, design: .serif)
}

// MARK: - Font Registration

enum FontLoader {
    static var fontsRegistered = false

    static func registerFonts() {
        guard !fontsRegistered else { return }
        fontsRegistered = true

        let fontNames = [
            "InstrumentSerif-Regular",
            "InstrumentSerif-Italic",
            "Satoshi-Regular",
            "Satoshi-Medium",
            "Satoshi-Bold",
            "Satoshi-Light",
        ]

        for fontName in fontNames {
            registerFont(named: fontName)
        }
    }

    private static func registerFont(named name: String) {
        guard let url = Bundle.main.url(forResource: name, withExtension: "otf")
                ?? Bundle.main.url(forResource: name, withExtension: "ttf") else {
            // Font file not found — will fall back to system font
            return
        }

        guard let fontDataProvider = CGDataProvider(url: url as CFURL),
              let font = CGFont(fontDataProvider) else {
            return
        }

        CTFontManagerRegisterGraphicsFont(font, nil)
    }
}
