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
            VStack {
                Spacer()
                QuickCaptureBar(userId: auth.currentUser?.id ?? UUID())
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

    var body: some View {
        SlideRow(
            onComplete: {
                TaskViewModel(modelContext: modelContext).toggleComplete(task)
            },
            actions: [
                SlideAction(label: "Today", systemImage: "sun.max", tint: Self.todayAmber) {
                    TaskViewModel(modelContext: modelContext).schedule(task, for: Date())
                },
                SlideAction(label: "Tomorrow", systemImage: "arrow.right", tint: .blue) {
                    TaskViewModel(modelContext: modelContext).schedule(task, for: Date().addingDays(1))
                },
                SlideAction(label: "More", systemImage: "ellipsis", tint: Self.neutralSlate) {
                    showDetail = true
                },
            ]
        ) {
            rowContent
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
        HStack(spacing: 12) {
            // Title (completion is via swipe-left now — no checkbox)
            Text(task.title)
                .font(.bodyMedium)
                .foregroundStyle(Color.textPrimary)
                .lineLimit(2)

            Spacer()

            // Context shown as a colored dot (per the mobile design spec)
            if task.context != nil {
                Circle()
                    .fill(contextColor)
                    .frame(width: 10, height: 10)
            }
        }
        .padding(12)
        .cardStyle(padding: 0)
    }

    private static let todayAmber = Color(red: 0.88, green: 0.64, blue: 0.23)
    private static let neutralSlate = Color(red: 0.42, green: 0.40, blue: 0.36)

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

struct SchedulePickerSheet: View {
    let task: SymphonyTask
    let modelContext: ModelContext
    @Environment(\.dismiss) private var dismiss
    @State private var selectedDate = Date()

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                // Quick options
                HStack(spacing: 12) {
                    quickOption("Today", date: Date())
                    quickOption("Tomorrow", date: Date().addingDays(1))
                    quickOption("Next Week", date: Date().addingDays(7).mondayOfWeek)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                Divider()

                DatePicker("Pick a date", selection: $selectedDate, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .padding(.horizontal, 16)

                Button("Schedule") {
                    let vm = TaskViewModel(modelContext: modelContext)
                    vm.schedule(task, for: selectedDate)
                    dismiss()
                }
                .buttonStyle(.symphony)
                .padding(.horizontal, 16)

                Spacer()
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

    private func quickOption(_ label: String, date: Date) -> some View {
        Button {
            let vm = TaskViewModel(modelContext: modelContext)
            vm.schedule(task, for: date)
            dismiss()
        } label: {
            Text(label)
                .font(.bodySmallBold)
                .foregroundStyle(Color.primaryTint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.primaryTint.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
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
