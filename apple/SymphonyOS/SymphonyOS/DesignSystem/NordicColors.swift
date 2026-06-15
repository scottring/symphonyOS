import SwiftUI

// MARK: - Nordic Journal Color Palette

extension Color {
    // MARK: Background
    // Brighter, cleaner cream — most of the old "dim/yellow" look was saturation,
    // not brightness, so pull saturation down and brightness up.
    static let bgBase = Color(hue: 45/360, saturation: 0.11, brightness: 0.99)
    static let bgElevated = Color(hue: 43/360, saturation: 0.08, brightness: 0.965)
    static let bgSurface = Color(hue: 40/360, saturation: 0.11, brightness: 0.94)

    // MARK: Primary (Deep teal-forest)
    static let primaryTint = Color(hue: 168/360, saturation: 0.45, brightness: 0.30)
    static let primaryLight = Color(hue: 168/360, saturation: 0.35, brightness: 0.45)

    // MARK: Text — darker for stronger contrast against the brighter cream.
    static let textPrimary = Color(hue: 30/360, saturation: 0.12, brightness: 0.11)
    static let textSecondary = Color(hue: 30/360, saturation: 0.10, brightness: 0.29)
    static let textTertiary = Color(hue: 30/360, saturation: 0.08, brightness: 0.42)

    // MARK: Context / Domain
    static let contextWork = Color(hue: 220/360, saturation: 0.55, brightness: 0.55)
    static let contextFamily = Color(hue: 30/360, saturation: 0.65, brightness: 0.55)
    static let contextPersonal = Color(hue: 270/360, saturation: 0.45, brightness: 0.55)

    // MARK: Coaching / Playbook (Amber tint)
    static let coachingTint = Color(hue: 40/360, saturation: 0.60, brightness: 0.55)
    static let coachingBg = Color(hue: 40/360, saturation: 0.30, brightness: 0.95)

    // MARK: Feedback
    static let feedbackGreen = Color(hue: 145/360, saturation: 0.50, brightness: 0.45)
    static let feedbackAmber = Color(hue: 40/360, saturation: 0.60, brightness: 0.50)
    static let feedbackRed = Color(hue: 0/360, saturation: 0.55, brightness: 0.50)

    // MARK: Status
    static let statusActive = Color(hue: 145/360, saturation: 0.45, brightness: 0.45)
    static let statusOnHold = Color(hue: 40/360, saturation: 0.50, brightness: 0.50)
    static let statusCompleted = Color(hue: 210/360, saturation: 0.30, brightness: 0.55)

    // MARK: Block Types
    static let blockSolo = Color(hue: 30/360, saturation: 0.08, brightness: 0.40)
    static let blockTransition = Color(hue: 30/360, saturation: 0.08, brightness: 0.40)
    static let blockRoutine = Color(hue: 40/360, saturation: 0.60, brightness: 0.50)
    static let blockConnection = Color(hue: 145/360, saturation: 0.35, brightness: 0.45)
    static let blockTogether = Color(hue: 220/360, saturation: 0.50, brightness: 0.50)
    static let blockBuffer = Color(hue: 0/360, saturation: 0.00, brightness: 0.45)
    static let blockDeparture = Color(hue: 25/360, saturation: 0.60, brightness: 0.50)
    static let blockPartner = Color(hue: 345/360, saturation: 0.50, brightness: 0.50)
    static let blockSibling = Color(hue: 270/360, saturation: 0.45, brightness: 0.50)
    static let blockHousehold = Color(hue: 175/360, saturation: 0.45, brightness: 0.45)
}

// MARK: - Family member colors
// Family members store a named color ("blue", "teal", …), not a hex string.

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
