#if os(iOS)
import SwiftUI

/// The light pages' colours and faces, the approved boards' hex values ("The boards as
/// numbers"). Flags and poles on the mountain use `WalkPalette`.
enum DailyPalette {
    static let sky = Color(hex: 0x00106E)
    static let paper = Color(hex: 0xFBF8F2)
    static let ink = Color(hex: 0x1F2A2B)
    static let muted = Color(hex: 0x56625F)
    static let soft = Color(hex: 0x3F4B49)
    static let lineageInk = Color(hex: 0x4A5654)
    static let doneInk = Color(hex: 0x6B7472)
    static let strike = Color(hex: 0xA9B0AD)
    static let openCircle = Color(hex: 0x857D72)
    static let line = Color(hex: 0xE6E0D6)
    static let grabber = Color(hex: 0xD4CDC0)
    static let green = Color(hex: 0x32664D)
    static let deepGreen = Color(hex: 0x244B38)
    static let ringTrack = Color(hex: 0xE2DCCF)
    static let rust = Color(hex: 0x9A3D1F)
    static let nextFill = Color(hex: 0xFBEBE3)
    static let nextLine = Color(hex: 0xF0CDBD)
    static let chipFill = Color(hex: 0xF3F8F4)
    static let chipLine = Color(hex: 0x9CBCA8)
    static let gold = Color(hex: 0xF6DFA6)
    static let plankInk = Color(hex: 0x2C2219)
    static let plankEyebrow = Color(hex: 0x6B4A1F)
    static let postLight = Color(hex: 0x5A4735)
    static let postDark = Color(hex: 0x2C2219)
    static let nailLight = Color(hex: 0xEFE9DB)
    static let nailDark = Color(hex: 0x8C8474)
    static let fieldLine = Color(hex: 0xCFC8BA)
    static let placeholder = Color(hex: 0x5F6966)
    static let firstFlag = Color(hex: 0xE0A24A)
    static let lineageFlag = Color(hex: 0xA8452C)
    static let navy = Color(red: 0, green: 14 / 255, blue: 70 / 255)

    // The six bundled faces.
    static func crimson(_ size: CGFloat) -> Font { .custom("CrimsonPro-Regular", size: size) }
    static func sans(_ size: CGFloat) -> Font { .custom("DMSans-Regular", size: size) }
    static func sansMedium(_ size: CGFloat) -> Font { .custom("DMSans-Medium", size: size) }
    static func sansSemiBold(_ size: CGFloat) -> Font { .custom("DMSans-SemiBold", size: size) }
}
#endif
