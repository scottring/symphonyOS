import SwiftUI

struct DomainSwitcher: View {
    @Environment(AppState.self) private var appState
    @Namespace private var pillAnimation

    var body: some View {
        // Large text: scroll sideways rather than breaking words mid-pill.
        ViewThatFits(in: .horizontal) {
            pills
            ScrollView(.horizontal, showsIndicators: false) { pills }
        }
    }

    private var pills: some View {
        @Bindable var state = appState

        return HStack(spacing: 4) {
            ForEach(DomainFilter.allCases) { filter in
                let isSelected = state.domainFilter == filter

                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        state.domainFilter = filter
                    }
                } label: {
                    Text(filter.rawValue)
                        .font(isSelected ? .bodySmallBold : .bodySmall)
                        .foregroundStyle(isSelected ? Color.ink : Color.textSecondary)
                        .fixedSize()
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background {
                            if isSelected {
                                Capsule()
                                    .fill(Color.bgElevated)
                                    .overlay(
                                        Capsule().strokeBorder(Color.cardBorder, lineWidth: 1)
                                    )
                                    .matchedGeometryEffect(id: "pill", in: pillAnimation)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(3)
        .background(
            Capsule()
                .fill(Color.bgSurface.opacity(0.6))
        )
    }
}
