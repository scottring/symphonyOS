import SwiftUI

// MARK: - Card (landing `.card`: white, warm 1px border, soft shadow, r16)

struct CardStyle: ViewModifier {
    var padding: CGFloat = 16
    var cornerRadius: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .strokeBorder(Color.cardBorder, lineWidth: 1)
            )
            .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
    }
}

extension View {
    func cardStyle(padding: CGFloat = 16, cornerRadius: CGFloat = 16) -> some View {
        modifier(CardStyle(padding: padding, cornerRadius: cornerRadius))
    }
}

// MARK: - Primary button (landing `.btn-primary`: ink pill, white text)

struct SymphonyButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bodyMediumBold)
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .padding(.vertical, 13)
            .background(Color.ink)
            .clipShape(Capsule())
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == SymphonyButtonStyle {
    static var symphony: SymphonyButtonStyle { SymphonyButtonStyle() }
}

// MARK: - Secondary button (landing `.btn-secondary`: cream pill, warm border)

struct SymphonySecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bodyMediumBold)
            .foregroundStyle(Color.textPrimary)
            .padding(.horizontal, 22)
            .padding(.vertical, 13)
            .background(Color.bgWarm)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == SymphonySecondaryButtonStyle {
    static var symphonySecondary: SymphonySecondaryButtonStyle { SymphonySecondaryButtonStyle() }
}

// MARK: - Input (cream field, warm border, r10)

struct SymphonyTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.bodyLarge)
            .padding(12)
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color.cardBorder, lineWidth: 1)
            )
    }
}

extension TextFieldStyle where Self == SymphonyTextFieldStyle {
    static var symphony: SymphonyTextFieldStyle { SymphonyTextFieldStyle() }
}
