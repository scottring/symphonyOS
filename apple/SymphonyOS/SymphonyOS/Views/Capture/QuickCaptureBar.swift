import SwiftUI
import SwiftData

struct QuickCaptureBar: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @State private var title = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Plus icon
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 26))
                .foregroundStyle(Color.primaryTint)
                .symbolRenderingMode(.hierarchical)

            // Text field
            TextField("Add a task...", text: $title)
                .font(.bodyMedium)
                .foregroundStyle(Color.textPrimary)
                .focused($isFocused)
                .onSubmit { submit() }

            // Submit button
            if !title.isEmpty {
                Button {
                    submit()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(Color.primaryTint)
                        .symbolRenderingMode(.hierarchical)
                }
                .buttonStyle(.plain)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(
            // Frosted glass with warm tint
            ZStack {
                Rectangle()
                    .fill(.ultraThinMaterial)
                Rectangle()
                    .fill(Color.bgBase.opacity(0.5))
            }
        )
        .overlay(alignment: .top) {
            // Top separator — subtle, warm
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [Color.textTertiary.opacity(0.15), Color.textTertiary.opacity(0.05)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(height: 0.5)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: !title.isEmpty)
    }

    private func submit() {
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }

        let vm = TaskViewModel(modelContext: modelContext)
        _ = vm.createTask(title: trimmed, userId: userId)

        #if os(iOS)
        let impactFeedback = UIImpactFeedbackGenerator(style: .light)
        impactFeedback.impactOccurred()
        #endif

        title = ""
    }
}
