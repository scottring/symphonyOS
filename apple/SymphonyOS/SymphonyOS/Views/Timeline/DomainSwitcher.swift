import SwiftUI

struct DomainSwitcher: View {
    @Environment(AppState.self) private var appState
    @Namespace private var pillAnimation

    var body: some View {
        @Bindable var state = appState

        HStack(spacing: 4) {
            ForEach(DomainFilter.allCases) { filter in
                let isSelected = state.domainFilter == filter

                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        state.domainFilter = filter
                    }
                } label: {
                    Text(filter.rawValue)
                        .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                        .foregroundStyle(isSelected ? pillForeground(for: filter) : Color.textTertiary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background {
                            if isSelected {
                                Capsule()
                                    .fill(pillBackground(for: filter))
                                    .matchedGeometryEffect(id: "pill", in: pillAnimation)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(
            Capsule()
                .fill(Color.bgSurface.opacity(0.6))
        )
    }

    // MARK: - Domain Colors

    private func pillBackground(for filter: DomainFilter) -> Color {
        switch filter {
        case .all: Color.primaryTint.opacity(0.12)
        case .work: Color.contextWork.opacity(0.12)
        case .family: Color.contextFamily.opacity(0.12)
        case .personal: Color.contextPersonal.opacity(0.12)
        }
    }

    private func pillForeground(for filter: DomainFilter) -> Color {
        switch filter {
        case .all: Color.primaryTint
        case .work: Color.contextWork
        case .family: Color.contextFamily
        case .personal: Color.contextPersonal
        }
    }
}
