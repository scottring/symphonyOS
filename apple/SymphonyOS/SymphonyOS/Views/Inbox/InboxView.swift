import SwiftUI
import SwiftData

struct InboxView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext

    // Inbox = bucket "inbox" (matches the web). Items triaged to week/month/
    // someday have a non-inbox bucket even when they have no date, so they no
    // longer leak in here.
    @Query(filter: #Predicate<SymphonyTask> {
        $0.bucket == "inbox" && !$0.completed && $0.parentTaskId == nil
    }, sort: \SymphonyTask.createdAt, order: .reverse)
    private var inboxTasks: [SymphonyTask]

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            if inboxTasks.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(filteredTasks, id: \.id) { task in
                            InboxTaskRow(
                                task: task,
                                modelContext: modelContext,
                                userId: auth.currentUser?.id ?? UUID()
                            )
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.vertical, 8)
                    .padding(.bottom, 80)
                }
            }

            // Quick capture
            if let userId = auth.currentUser?.id {
                VStack {
                    Spacer()
                    QuickCaptureBar(userId: userId)
                }
            }
        }
        .navigationTitle("Inbox (\(filteredTasks.count))")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
    }

    private var filteredTasks: [SymphonyTask] {
        if let contextValue = appState.domainFilter.contextValue {
            return inboxTasks.filter { $0.context == contextValue }
        }
        return inboxTasks
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundStyle(Color.primaryTint.opacity(0.5))

            Text("Inbox Zero")
                .font(.displaySmall)
                .foregroundStyle(Color.textPrimary)

            Text("All caught up! Add tasks with the bar below.")
                .font(.bodySmall)
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }
}

// MARK: - Inbox Task Row

struct InboxTaskRow: View {
    let task: SymphonyTask
    let modelContext: ModelContext
    let userId: UUID

    @State private var showDetail = false
    @State private var showWhenDialog = false
    @State private var showDatePicker = false
    @Query private var familyMembers: [FamilyMember]

    private var assignedMemberIds: [UUID] {
        task.assignedToAll ?? (task.assignedTo.map { [$0] } ?? [])
    }

    private var viewModel: TaskViewModel { TaskViewModel(modelContext: modelContext) }

    var body: some View {
        SlideRow(
            onComplete: {
                TaskViewModel(modelContext: modelContext).toggleComplete(task)
            },
            actions: [
                SlideAction(label: "Today", systemImage: "sun.max", tint: Color.primaryTint) {
                    viewModel.schedule(task, for: Calendar.current.startOfDay(for: Date()), isAllDay: true)
                },
                SlideAction(label: "When", systemImage: "calendar", tint: Color.infoBlue) {
                    showWhenDialog = true
                },
                SlideAction(label: "More", systemImage: "ellipsis", tint: Color.textSecondary) {
                    showDetail = true
                },
            ]
        ) {
            rowContent
        }
        // Full When triage — mirrors the web WhenPicker's options.
        .confirmationDialog("When", isPresented: $showWhenDialog, titleVisibility: .visible) {
            Button("Tomorrow") {
                viewModel.schedule(task, for: Calendar.current.startOfDay(for: Date().addingDays(1)), isAllDay: true)
            }
            Button("Next week") {
                viewModel.moveToBucket(task, bucket: "week")
            }
            Button("Someday") {
                viewModel.markSomeday(task)
            }
            Button("Pick a date…") {
                showDatePicker = true
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showDatePicker) {
            SchedulePickerSheet { date, isAllDay in
                viewModel.schedule(task, for: date, isAllDay: isAllDay)
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showDetail) {
            NavigationStack {
                TaskDetailView(task: task)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showDetail = false }
                        }
                    }
            }
            .presentationDetents([.large, .medium])
        }
    }

    private var rowContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                // A photo capture still being analyzed shows a spinner by its title.
                if task.captureStatus == "pending" {
                    ProgressView()
                        .controlSize(.small)
                }

                // Title (completion is via swipe-left now — no checkbox)
                Text(task.title)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(2)

                Spacer()

                HStack(spacing: 8) {
                    if task.location != nil {
                        Image(systemName: "mappin")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.textTertiary)
                    }
                    // Context shown as a colored dot (per the mobile design spec)
                    if task.context != nil {
                        Circle()
                            .fill(contextColor)
                            .frame(width: 10, height: 10)
                    }
                    AssigneeAvatars(memberIds: assignedMemberIds, members: familyMembers, size: 20)
                }
            }

            // Destination chip: an analyzed photo capture that matched an open
            // task — one tap merges the note + photo onto it.
            if let target = suggestedTarget {
                Button {
                    Task {
                        if await PhotoCaptureService.merge(capture: task, into: target, modelContext: modelContext) {
                            #if os(iOS)
                            UINotificationFeedbackGenerator().notificationOccurred(.success)
                            #endif
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.turn.down.right")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Add to: \(target.title)")
                            .font(.captionBold)
                            .lineLimit(1)
                    }
                    .foregroundStyle(Color.primaryTint)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.primaryTint.opacity(0.12), in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .cardStyle(padding: 0)
    }

    /// Resolve the AI-suggested destination task, if it still exists and is open.
    private var suggestedTarget: SymphonyTask? {
        guard task.captureStatus == "done", let targetId = task.captureSuggestedTaskId else { return nil }
        let descriptor = FetchDescriptor<SymphonyTask>(predicate: #Predicate { $0.id == targetId && !$0.completed })
        return try? modelContext.fetch(descriptor).first
    }

    private var contextColor: Color {
        switch task.context {
        case "work": .contextWork
        case "family": .contextFamily
        case "personal": .contextPersonal
        default: .textTertiary
        }
    }
}

// MARK: - Schedule Picker

/// Date (+ optional time) picker used by task detail and inbox triage.
/// Calls `onSet` with the chosen date and whether it's all-day.
struct SchedulePickerSheet: View {
    var initialDate: Date = Date()
    var initialAllDay: Bool = true
    let onSet: (Date, Bool) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selectedDate: Date
    @State private var isAllDay: Bool

    init(initialDate: Date = Date(), initialAllDay: Bool = true, onSet: @escaping (Date, Bool) -> Void) {
        self.initialDate = initialDate
        self.initialAllDay = initialAllDay
        self.onSet = onSet
        self._selectedDate = State(initialValue: initialDate)
        self._isAllDay = State(initialValue: initialAllDay)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    DatePicker("Pick a date", selection: $selectedDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .padding(.horizontal, 16)

                    Toggle("All day", isOn: $isAllDay)
                        .font(.bodyMedium)
                        .padding(.horizontal, 16)

                    if !isAllDay {
                        DatePicker("Time", selection: $selectedDate, displayedComponents: .hourAndMinute)
                            .font(.bodyMedium)
                            .padding(.horizontal, 16)
                    }

                    Button("Schedule") {
                        let date = isAllDay ? Calendar.current.startOfDay(for: selectedDate) : selectedDate
                        onSet(date, isAllDay)
                        dismiss()
                    }
                    .buttonStyle(.symphony)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
            }
            .navigationTitle("Schedule")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Context Picker

struct ContextPickerSheet: View {
    let task: SymphonyTask
    let modelContext: ModelContext
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                contextOption("Work", value: "work", color: .contextWork)
                contextOption("Family", value: "family", color: .contextFamily)
                contextOption("Personal", value: "personal", color: .contextPersonal)

                if task.context != nil {
                    Button {
                        let vm = TaskViewModel(modelContext: modelContext)
                        vm.setContext(task, context: nil)
                        dismiss()
                    } label: {
                        Text("Clear Context")
                            .font(.bodySmall)
                            .foregroundStyle(.red)
                    }
                    .padding(.top, 8)
                }
            }
            .padding(16)
            .navigationTitle("Context")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
    }

    private func contextOption(_ label: String, value: String, color: Color) -> some View {
        Button {
            let vm = TaskViewModel(modelContext: modelContext)
            vm.setContext(task, context: value)
            dismiss()
        } label: {
            HStack {
                Circle()
                    .fill(color)
                    .frame(width: 12, height: 12)

                Text(label)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)

                Spacer()

                if task.context == value {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.primaryTint)
                }
            }
            .padding(12)
            .background(task.context == value ? color.opacity(0.1) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}
