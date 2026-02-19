import SwiftUI

// MARK: - Card Modifier

struct CardStyle: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 2)
    }
}

extension View {
    func cardStyle(padding: CGFloat = 16) -> some View {
        modifier(CardStyle(padding: padding))
    }
}

// MARK: - Coaching Card Modifier

struct CoachingCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(Color.coachingBg)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color.coachingTint.opacity(0.3), lineWidth: 1)
            )
            .shadow(color: Color.coachingTint.opacity(0.08), radius: 6, x: 0, y: 2)
    }
}

extension View {
    func coachingCardStyle() -> some View {
        modifier(CoachingCardStyle())
    }
}

// MARK: - Primary Button Style

struct SymphonyButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bodyMediumBold)
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(Color.primaryTint)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == SymphonyButtonStyle {
    static var symphony: SymphonyButtonStyle { SymphonyButtonStyle() }
}

// MARK: - Input Style

struct SymphonyTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.bodyLarge)
            .padding(12)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color.textTertiary.opacity(0.3), lineWidth: 1)
            )
    }
}

extension TextFieldStyle where Self == SymphonyTextFieldStyle {
    static var symphony: SymphonyTextFieldStyle { SymphonyTextFieldStyle() }
}
