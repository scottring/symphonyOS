import SwiftUI

struct DateNavigator: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        HStack(spacing: 16) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    appState.goToPreviousDay()
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.bodyMediumBold)
                    .foregroundStyle(Color.textSecondary)
            }
            .buttonStyle(.plain)

            VStack(spacing: 2) {
                Text(appState.selectedDate.formatted(.dateTime.weekday(.wide)))
                    .font(.bodySmallBold)
                    .foregroundStyle(Color.textPrimary)

                Text(appState.selectedDate.formatted(.dateTime.month(.wide).day()))
                    .font(.captionText)
                    .foregroundStyle(Color.textSecondary)
            }
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.2)) {
                    appState.goToToday()
                }
            }

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    appState.goToNextDay()
                }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.bodyMediumBold)
                    .foregroundStyle(Color.textSecondary)
            }
            .buttonStyle(.plain)

            if !appState.isToday {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        appState.goToToday()
                    }
                } label: {
                    Text("Today")
                        .font(.captionBold)
                        .foregroundStyle(Color.primaryTint)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.primaryTint.opacity(0.1))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
    }
}
