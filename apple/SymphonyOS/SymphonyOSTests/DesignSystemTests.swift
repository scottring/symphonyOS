import Testing
import Foundation
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
}
