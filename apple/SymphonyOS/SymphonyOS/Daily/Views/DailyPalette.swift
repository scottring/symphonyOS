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
    /// The handover halo's glow, `rgba(255,214,140,.95)` (its ring is `gold` at 0.6).
    static let handoverGlow = Color(hex: 0xFFD68C)
    /// The walk's light, for the bar's small one ("one control in two sizes"): the gradient stops of
    /// the light's body in `WalkOrbView` (its private `orbBody`, which the walk does not expose).
    /// Change both together.
    static let lightStops: [Gradient.Stop] = [.init(color: .white, location: 0),
                                              .init(color: Color(hex: 0xFFF7E0), location: 0.2),
                                              .init(color: Color(hex: 0xF8E2AD), location: 0.48),
                                              .init(color: Color(hex: 0xEBBF72), location: 0.76),
                                              .init(color: Color(hex: 0xDDA152), location: 1)]

    // The six bundled faces. Each grows with the person's text size as `relativeTo` does (body
    // unless the size is a heading's or a small line's), so a title grows as a title does.
    static func crimson(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("CrimsonPro-Regular", size: size, relativeTo: style)
    }
    static func sans(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("DMSans-Regular", size: size, relativeTo: style)
    }
    static func sansMedium(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("DMSans-Medium", size: size, relativeTo: style)
    }
    static func sansSemiBold(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("DMSans-SemiBold", size: size, relativeTo: style)
    }

    /// Words that stand in the boards' fixed frames stop growing here: the row of words, the
    /// signpost, the bar, the sheet's handle and header, the next event, the ring, Week's band flags,
    /// its day labels and its Move to panel, and the mountain pages (drawn on the walk's stage). The rows, and the
    /// week's lines and fold, grow on: a row grows in height and its title wraps.
    static let largestChrome = DynamicTypeSize.xLarge
}
#endif
