import SwiftUI

// MARK: - Landing-page palette
//
// Values are verbatim from landing/index.html `:root`. Token NAMES are the
// ones the app already uses so every call site restyles without moving.

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }

    // MARK: Ground
    static let bgBase     = Color(hex: 0xFAF7F2)   // --bg
    static let bgElevated = Color(hex: 0xFFFFFF)   // --card
    static let bgSurface  = Color(hex: 0xF0EBE3)   // --bg-deep
    static let bgWarm     = Color(hex: 0xF5EFE7)   // --bg-warm

    // MARK: Text
    static let textPrimary   = Color(hex: 0x2C2520) // --text
    static let textSecondary = Color(hex: 0x6B5E54) // --text-secondary
    static let textTertiary  = Color(hex: 0x9B8E84) // --text-muted
    static let textLight     = Color(hex: 0xBEB3A9) // --text-light

    // MARK: Accent (amber) + ink
    static let primaryTint  = Color(hex: 0xD97706)  // --amber
    static let primaryLight = Color(hex: 0xF59E0B)  // --amber-soft
    static let accentBg     = Color(hex: 0xFEF3C7)  // --amber-bg
    /// Primary buttons and the active dock tab — the landing's `.btn-primary`.
    static let ink          = Color(hex: 0x2C2520)

    // MARK: Info / success
    static let infoBlue       = Color(hex: 0x2563EB) // --blue
    static let infoBlueBg     = Color(hex: 0xDBEAFE) // --blue-bg
    static let successGreen   = Color(hex: 0x059669) // --green
    static let successGreenBg = Color(hex: 0xD1FAE5) // --green-bg

    // MARK: Card chrome
    static let cardBorder = Color(hex: 0xE8E0D8)                       // --card-border
    static let cardShadow = Color(hex: 0x2C2520).opacity(0.06)         // --card-shadow

    // MARK: Context / Domain (unchanged)
    static let contextWork     = Color(hue: 220/360, saturation: 0.55, brightness: 0.55)
    static let contextFamily   = Color(hue: 30/360,  saturation: 0.65, brightness: 0.55)
    static let contextPersonal = Color(hue: 270/360, saturation: 0.45, brightness: 0.55)

    // MARK: Coaching / Playbook → amber family
    static let coachingTint = primaryTint
    static let coachingBg   = accentBg

    // MARK: Feedback
    static let feedbackGreen = successGreen
    static let feedbackAmber = primaryTint
    static let feedbackRed   = Color(hex: 0xB91C1C)

    // MARK: Status
    static let statusActive    = successGreen
    static let statusOnHold    = primaryTint
    static let statusCompleted = infoBlue

    // MARK: Block Types (unchanged)
    static let blockSolo       = Color(hue: 30/360,  saturation: 0.08, brightness: 0.40)
    static let blockTransition = Color(hue: 30/360,  saturation: 0.08, brightness: 0.40)
    static let blockRoutine    = Color(hue: 40/360,  saturation: 0.60, brightness: 0.50)
    static let blockConnection = Color(hue: 145/360, saturation: 0.35, brightness: 0.45)
    static let blockTogether   = Color(hue: 220/360, saturation: 0.50, brightness: 0.50)
    static let blockBuffer     = Color(hue: 0/360,   saturation: 0.00, brightness: 0.45)
    static let blockDeparture  = Color(hue: 25/360,  saturation: 0.60, brightness: 0.50)
    static let blockPartner    = Color(hue: 345/360, saturation: 0.50, brightness: 0.50)
    static let blockSibling    = Color(hue: 270/360, saturation: 0.45, brightness: 0.50)
    static let blockHousehold  = Color(hue: 175/360, saturation: 0.45, brightness: 0.45)
}

// MARK: - Family member colors (unchanged)

extension Color {
    static func memberColor(_ name: String) -> Color {
        switch name.lowercased() {
        case "blue":   return Color(hue: 220/360, saturation: 0.55, brightness: 0.60)
        case "purple": return Color(hue: 270/360, saturation: 0.48, brightness: 0.60)
        case "teal":   return Color(hue: 175/360, saturation: 0.50, brightness: 0.50)
        case "orange": return Color(hue: 25/360,  saturation: 0.70, brightness: 0.65)
        case "green":  return Color(hue: 145/360, saturation: 0.45, brightness: 0.50)
        case "red":    return Color(hue: 0/360,   saturation: 0.55, brightness: 0.60)
        case "pink":   return Color(hue: 340/360, saturation: 0.50, brightness: 0.65)
        case "yellow": return Color(hue: 45/360,  saturation: 0.70, brightness: 0.68)
        case "indigo": return Color(hue: 245/360, saturation: 0.50, brightness: 0.60)
        default:       return .primaryTint
        }
    }
}

// MARK: - Semantic Colors

extension ShapeStyle where Self == Color {
    static var symphonyBackground: Color { .bgBase }
    static var symphonyCard: Color { .bgElevated }
    static var symphonyPrimary: Color { .primaryTint }
}
