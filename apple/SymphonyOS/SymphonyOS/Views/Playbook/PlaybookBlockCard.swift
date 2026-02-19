import SwiftUI
import SwiftData

struct PlaybookBlockCard: View {
    let block: PlaybookBlock
    let instance: PlaybookInstance?
    let modelContext: ModelContext
    let userId: UUID

    @State private var showFeedback = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                // Block type badge
                Text(block.blockType.capitalized)
                    .font(.captionBold)
                    .foregroundStyle(blockTypeColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(blockTypeColor.opacity(0.12))
                    .clipShape(Capsule())

                Text(block.timeSlot)
                    .font(.captionText)
                    .foregroundStyle(Color.textSecondary)

                Spacer()

                if instance?.completed == true {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.primaryTint)
                }
            }

            // Label + narrative
            Text(block.label)
                .font(.bodyMediumBold)
                .foregroundStyle(Color.textPrimary)

            Text(block.narrative)
                .font(.bodySmall)
                .foregroundStyle(Color.textSecondary)
                .lineLimit(3)

            // Item checklist
            if !block.items.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(block.items) { item in
                        PlaybookItemRow(
                            item: item,
                            isChecked: instance?.itemsState?[item.id] ?? false
                        ) {
                            if let instance {
                                let vm = PlaybookViewModel(modelContext: modelContext)
                                vm.toggleItemState(instance, itemId: item.id)
                            }
                        }
                    }
                }
            }

            // Coaching note
            if let note = block.coachingNote, !note.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "lightbulb")
                        .font(.system(size: 12))
                    Text(note)
                        .font(.captionText)
                }
                .foregroundStyle(Color.coachingTint)
                .padding(8)
                .background(Color.coachingTint.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            // Quick react (shown after marking complete)
            if let instance, instance.completed {
                PlaybookFeedbackRow(instance: instance, modelContext: modelContext)
            }

            // Mark done button
            if let instance, !instance.completed {
                Button {
                    let vm = PlaybookViewModel(modelContext: modelContext)
                    vm.markComplete(instance)
                    #if os(iOS)
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    #endif
                } label: {
                    Text("Mark Done")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.primaryTint)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.primaryTint.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
        .coachingCardStyle()
    }

    private var blockTypeColor: Color {
        switch block.blockType {
        case "solo": .blockSolo
        case "transition": .blockTransition
        case "routine": .blockRoutine
        case "connection": .blockConnection
        case "together": .blockTogether
        case "buffer": .blockBuffer
        case "departure": .blockDeparture
        case "partner": .blockPartner
        case "sibling": .blockSibling
        case "household": .blockHousehold
        default: .textTertiary
        }
    }
}

// MARK: - Playbook Item Row

struct PlaybookItemRow: View {
    let item: PlaybookItem
    let isChecked: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 8) {
                Image(systemName: isChecked ? "checkmark.square.fill" : "square")
                    .font(.system(size: 16))
                    .foregroundStyle(isChecked ? Color.primaryTint : Color.textTertiary)

                Text(item.who.capitalized)
                    .font(.captionBold)
                    .foregroundStyle(Color.textSecondary)

                Text(item.action)
                    .font(.bodySmall)
                    .foregroundStyle(isChecked ? Color.textTertiary : Color.textPrimary)
                    .strikethrough(isChecked)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Feedback Row

struct PlaybookFeedbackRow: View {
    let instance: PlaybookInstance
    let modelContext: ModelContext
    @State private var showNotes = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Quick react buttons
            HStack(spacing: 12) {
                reactButton("Nailed it", emoji: "nailed-it", selected: instance.react == "nailed-it")
                reactButton("Okay", emoji: "okay", selected: instance.react == "okay")
                reactButton("Tough", emoji: "tough", selected: instance.react == "tough")

                Spacer()

                Button {
                    showNotes.toggle()
                } label: {
                    Image(systemName: "note.text")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.textSecondary)
                }
                .buttonStyle(.plain)
            }

            // Tags
            if !instance.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(instance.tags, id: \.self) { tag in
                            Text(tag)
                                .font(.captionText)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color.bgSurface)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $showNotes) {
            PlaybookNotesSheet(instance: instance, modelContext: modelContext)
                .presentationDetents([.medium])
        }
    }

    private func reactButton(_ label: String, emoji: String, selected: Bool) -> some View {
        Button {
            let vm = PlaybookViewModel(modelContext: modelContext)
            vm.setReact(instance, react: emoji)
        } label: {
            Text(label)
                .font(.captionBold)
                .foregroundStyle(selected ? .white : reactColor(emoji))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(selected ? reactColor(emoji) : reactColor(emoji).opacity(0.12))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func reactColor(_ react: String) -> Color {
        switch react {
        case "nailed-it": .feedbackGreen
        case "okay": .feedbackAmber
        case "tough": .feedbackRed
        default: .textTertiary
        }
    }
}

// MARK: - Notes Sheet

struct PlaybookNotesSheet: View {
    let instance: PlaybookInstance
    let modelContext: ModelContext
    @Environment(\.dismiss) private var dismiss
    @State private var notesText: String

    init(instance: PlaybookInstance, modelContext: ModelContext) {
        self.instance = instance
        self.modelContext = modelContext
        self._notesText = State(initialValue: instance.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            TextEditor(text: $notesText)
                .font(.bodyMedium)
                .padding(16)
                .navigationTitle("Notes")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            let vm = PlaybookViewModel(modelContext: modelContext)
                            vm.setNotes(instance, notes: notesText.isEmpty ? nil : notesText)
                            dismiss()
                        }
                    }
                }
        }
    }
}
