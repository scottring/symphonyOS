import Testing
import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
@testable import Symphony

/// The app shipped for months with `Font.custom("InstrumentSerif-Regular")`
/// and no font files in the bundle — SwiftUI silently fell back to San
/// Francisco. This guards the bundled faces by PostScript name.
struct DesignSystemTests {
    static let requiredFonts = [
        "CrimsonPro-Regular", "CrimsonPro-Italic", "CrimsonPro-SemiBold",
        "DMSans-Regular", "DMSans-Medium", "DMSans-SemiBold",
    ]

    @Test(arguments: requiredFonts)
    func bundledFontResolves(name: String) {
        #if canImport(UIKit)
        #expect(UIFont(name: name, size: 12) != nil, "\(name) is not registered — check Info.plist UIAppFonts and the Resources/Fonts files")
        #endif
    }

    @Test func hexInitializerProducesExactChannels() {
        #if canImport(UIKit)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(Color(hex: 0xD97706)).getRed(&r, green: &g, blue: &b, alpha: &a)
        #expect(Int((r * 255).rounded()) == 0xD9)
        #expect(Int((g * 255).rounded()) == 0x77)
        #expect(Int((b * 255).rounded()) == 0x06)
        #expect(a == 1)
        #endif
    }
}
