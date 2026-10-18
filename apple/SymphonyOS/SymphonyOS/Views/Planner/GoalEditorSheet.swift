import SwiftUI
import SwiftData

/// Create or edit a year goal: what should be true by year's end, why it
/// matters (optional), its life area, and — once it exists — its status.
/// Mirrors the web's addGoal / updateGoal fields.
struct GoalEditorSheet: View {
    /// nil = a new goal for `year`.
    let goal: Goal?
    let year: Int

    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var notes: String
    @State private var area: String?
    @State private var status: String
    @FocusState private var nameFocused: Bool

    init(goal: Goal?, year: Int) {
        self.goal = goal
        self.year = year
        _name = State(initialValue: goal?.name ?? "")
        _notes = State(initialValue: goal?.notes ?? "")
        _area = State(initialValue: goal?.context)
        _status = State(initialValue: goal?.status ?? "active")
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Goal").eyebrowStyle()
                        TextField("What should be true by the end of \(String(year))?", text: $name, axis: .vertical)
                            .font(.displayMedium)
                            .foregroundStyle(Color.textPrimary)
                            .focused($nameFocused)
                            .submitLabel(.done)
                            .accessibilityLabel("Goal")
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Why it matters").eyebrowStyle()
                        TextField("Optional — what good looks like", text: $notes, axis: .vertical)
                            .font(.bodyMedium)
                            .foregroundStyle(Color.textPrimary)
                            .lineLimit(3...8)
                            .padding(12)
                            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.cardBorder, lineWidth: 1))
                            .accessibilityLabel("Why it matters")
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Life area").eyebrowStyle()
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 6) { areaChips }
                            VStack(alignment: .leading, spacing: 6) { areaChips }
                        }
                        if goal == nil && area == "family" {
                            Text("Family goals are shared with your household.")
                                .font(.bodySmall).foregroundStyle(Color.textTertiary)
                        }
                    }

                    if goal != nil {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Status").eyebrowStyle()
                            Picker("Status", selection: $status) {
                                Text("Active").tag("active")
                                Text("Completed").tag("completed")
                                Text("Archived").tag("archived")
                            }
                            .pickerStyle(.segmented)
                        }
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.bgBase)
            .navigationTitle(goal == nil ? "New goal" : "Edit goal")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(goal == nil ? "New goal for \(String(year))" : "Edit goal")
                        .font(.displaySmall).foregroundStyle(Color.textPrimary)
                }
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(trimmedName.isEmpty)
                }
            }
            .onAppear { if goal == nil { nameFocused = true } }
        }
    }

    @ViewBuilder
    private var areaChips: some View {
        ForEach([("Work", "work"), ("Family", "family"), ("Personal", "personal")], id: \.1) { label, value in
            let on = area == value
            Button {
                area = on ? nil : value
            } label: {
                HStack(spacing: 6) {
                    Circle().fill(Color.forContext(value)).frame(width: 8, height: 8)
                    Text(label)
                }
                .font(on ? .bodySmallBold : .bodySmall)
                .foregroundStyle(on ? Color.white : Color.textSecondary)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(on ? Color.ink : Color.bgElevated, in: Capsule())
                .overlay(Capsule().strokeBorder(on ? Color.ink : Color.cardBorder, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(on ? .isSelected : [])
        }
    }

    private func save() {
        guard !trimmedName.isEmpty else { return }
        let cleanNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let writer = PlanWriter(context: modelContext, userId: auth.currentUser?.id ?? UUID())
        if let goal {
            writer.updateGoal(goal, name: trimmedName, notes: cleanNotes.isEmpty ? nil : cleanNotes,
                              context: area, status: status)
        } else {
            writer.createGoal(name: trimmedName, notes: cleanNotes.isEmpty ? nil : cleanNotes,
                              context: area, year: year)
        }
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
        dismiss()
    }
}
