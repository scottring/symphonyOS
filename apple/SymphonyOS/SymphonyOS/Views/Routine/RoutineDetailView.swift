import SwiftUI
import SwiftData

struct RoutineDetailView: View {
    @Bindable var routine: Routine
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @Query private var familyMembers: [FamilyMember]

    private let weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    var body: some View {
        Form {
            Section("Details") {
                TextField("Name", text: $routine.name)
                    .font(.displaySmall)
                    .onChange(of: routine.name) { _, _ in markDirty() }

                TextEditor(text: Binding(
                    get: { routine.routineDescription ?? "" },
                    set: { routine.routineDescription = $0.isEmpty ? nil : $0; markDirty() }
                ))
                .font(.bodyMedium)
                .frame(minHeight: 60)
            }

            Section("Schedule") {
                Picker("Recurrence", selection: Binding(
                    get: { routine.recurrencePattern.type },
                    set: {
                        routine.recurrencePattern = RecurrencePattern(
                            type: $0,
                            days: $0 == "weekly" ? routine.recurrencePattern.days : nil
                        )
                        markDirty()
                    }
                )) {
                    Text("Daily").tag("daily")
                    Text("Weekly").tag("weekly")
                }

                if routine.recurrencePattern.type == "weekly" {
                    ForEach(weekdays, id: \.self) { day in
                        Button {
                            var days = Set(routine.recurrencePattern.days ?? [])
                            if days.contains(day) {
                                days.remove(day)
                            } else {
                                days.insert(day)
                            }
                            routine.recurrencePattern = RecurrencePattern(type: "weekly", days: Array(days))
                            markDirty()
                        } label: {
                            HStack {
                                Text(day.capitalized)
                                Spacer()
                                if routine.recurrencePattern.days?.contains(day) == true {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.primaryTint)
                                }
                            }
                        }
                        .foregroundStyle(Color.textPrimary)
                    }
                }

                TextField("Time (HH:MM)", text: Binding(
                    get: { routine.timeOfDay ?? "" },
                    set: { routine.timeOfDay = $0.isEmpty ? nil : $0; markDirty() }
                ))
            }

            Section("Settings") {
                Picker("Visibility", selection: Binding(
                    get: { routine.visibility },
                    set: { routine.visibility = $0; markDirty() }
                )) {
                    Text("Active").tag("active")
                    Text("Reference").tag("reference")
                }

                // Context
                HStack(spacing: 8) {
                    Text("Context")
                    Spacer()
                    contextChip("Work", value: "work", color: .contextWork)
                    contextChip("Family", value: "family", color: .contextFamily)
                    contextChip("Personal", value: "personal", color: .contextPersonal)
                }

                // Assignment
                if !familyMembers.isEmpty {
                    Picker("Assigned To", selection: Binding(
                        get: { routine.assignedTo },
                        set: { routine.assignedTo = $0; markDirty() }
                    )) {
                        Text("None").tag(Optional<UUID>.none)
                        ForEach(familyMembers, id: \.id) { member in
                            Text(member.name).tag(Optional(member.id))
                        }
                    }
                }
            }

            Section {
                Button(role: .destructive) {
                    modelContext.queueSync(table: "routines", recordId: routine.id, type: "delete")
                    modelContext.delete(routine)
                    try? modelContext.save()
                    dismiss()
                } label: {
                    Label("Delete Routine", systemImage: "trash")
                }
            }
        }
        .navigationTitle("Routine")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func contextChip(_ label: String, value: String, color: Color) -> some View {
        Button {
            routine.context = routine.context == value ? nil : value
            markDirty()
        } label: {
            Text(label)
                .font(.captionBold)
                .foregroundStyle(routine.context == value ? .white : color)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(routine.context == value ? color : color.opacity(0.12))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func markDirty() {
        routine.updatedAt = Date()
        routine.syncStatus = .pending
        modelContext.queueSync(table: "routines", recordId: routine.id, type: "update")
        try? modelContext.save()
    }
}
