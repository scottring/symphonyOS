import SwiftUI
import SwiftData

struct RoutineListView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Routine.name) private var allRoutines: [Routine]
    @State private var showingNewRoutine = false

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            if filteredRoutines.isEmpty {
                emptyState
            } else {
                List {
                    let active = filteredRoutines.filter { $0.visibility == "active" }
                    let reference = filteredRoutines.filter { $0.visibility == "reference" }

                    if !active.isEmpty {
                        Section("Active") {
                            ForEach(active, id: \.id) { routine in
                                NavigationLink {
                                    RoutineDetailView(routine: routine)
                                } label: {
                                    RoutineRow(routine: routine)
                                }
                            }
                            .onDelete { offsets in
                                for offset in offsets {
                                    modelContext.queueSync(table: "routines", recordId: active[offset].id, type: "delete")
                                    modelContext.delete(active[offset])
                                }
                                try? modelContext.save()
                            }
                        }
                    }

                    if !reference.isEmpty {
                        Section("Reference") {
                            ForEach(reference, id: \.id) { routine in
                                NavigationLink {
                                    RoutineDetailView(routine: routine)
                                } label: {
                                    RoutineRow(routine: routine)
                                }
                            }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
        .navigationTitle("Routines")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNewRoutine = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingNewRoutine) {
            if let userId = auth.currentUser?.id {
                NewRoutineSheet(userId: userId)
                    .presentationDetents([.medium])
            }
        }
    }

    private var filteredRoutines: [Routine] {
        DomainFilterService.filterRoutines(allRoutines, domain: appState.domainFilter)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "repeat")
                .font(.system(size: 48))
                .foregroundStyle(Color.primaryTint.opacity(0.5))
            Text("No Routines")
                .font(.displaySmall)
            Text("Add routines for recurring activities.")
                .font(.bodySmall)
                .foregroundStyle(Color.textSecondary)
        }
    }
}

// MARK: - Routine Row

struct RoutineRow: View {
    let routine: Routine

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "repeat")
                .foregroundStyle(Color.primaryTint)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(routine.name)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)

                HStack(spacing: 6) {
                    Text(recurrenceLabel)
                        .font(.captionText)
                        .foregroundStyle(Color.textTertiary)

                    if let time = routine.timeOfDay {
                        Text(time)
                            .font(.captionText)
                            .foregroundStyle(Color.textSecondary)
                    }

                    if let context = routine.context {
                        ContextBadge(context: context)
                    }
                }
            }
        }
    }

    private var recurrenceLabel: String {
        switch routine.recurrencePattern.type {
        case "daily": "Daily"
        case "weekly":
            if let days = routine.recurrencePattern.days {
                days.map { $0.prefix(3).capitalized }.joined(separator: ", ")
            } else {
                "Weekly"
            }
        case "monthly": "Monthly"
        default: routine.recurrencePattern.type.capitalized
        }
    }
}

// MARK: - New Routine Sheet

struct NewRoutineSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var recurrenceType = "daily"
    @State private var selectedDays: Set<String> = []
    @State private var timeOfDay = ""

    private let weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    var body: some View {
        NavigationStack {
            Form {
                TextField("Routine name", text: $name)
                    .font(.displaySmall)

                Picker("Recurrence", selection: $recurrenceType) {
                    Text("Daily").tag("daily")
                    Text("Weekly").tag("weekly")
                }

                if recurrenceType == "weekly" {
                    Section("Days") {
                        ForEach(weekdays, id: \.self) { day in
                            Button {
                                if selectedDays.contains(day) {
                                    selectedDays.remove(day)
                                } else {
                                    selectedDays.insert(day)
                                }
                            } label: {
                                HStack {
                                    Text(day.capitalized)
                                    Spacer()
                                    if selectedDays.contains(day) {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(Color.primaryTint)
                                    }
                                }
                            }
                            .foregroundStyle(Color.textPrimary)
                        }
                    }
                }

                TextField("Time (HH:MM)", text: $timeOfDay)
            }
            .navigationTitle("New Routine")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { createRoutine() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func createRoutine() {
        let pattern = RecurrencePattern(
            type: recurrenceType,
            days: recurrenceType == "weekly" ? Array(selectedDays) : nil
        )
        let routine = Routine(
            userId: userId,
            name: name.trimmingCharacters(in: .whitespaces),
            recurrencePattern: pattern
        )
        if !timeOfDay.isEmpty {
            routine.timeOfDay = timeOfDay
        }
        modelContext.insert(routine)
        modelContext.queueSync(table: "routines", recordId: routine.id, type: "insert")
        try? modelContext.save()
        dismiss()
    }
}
