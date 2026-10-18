import SwiftUI
import SwiftData

/// Inbox: unprocessed captures, triaged one at a time or together.
/// Every row has a visible Move button; swipe right is a shortcut to the
/// same destinations, swipe left completes. Select reveals ONE shared
/// toolbar instead of repeating actions on every row.
struct InboxView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext

    // Inbox = bucket "inbox" (matches the web). Items triaged to week/month/
    // someday have a non-inbox bucket even when they have no date.
    @Query(filter: #Predicate<SymphonyTask> {
        $0.bucket == "inbox" && !$0.completed && $0.parentTaskId == nil
    }, sort: \SymphonyTask.createdAt, order: .reverse)
    private var inboxTasks: [SymphonyTask]
    @Query private var familyMembers: [FamilyMember]

    @State private var triage = TriageController()
    @State private var selecting = false
    @State private var selected: Set<UUID> = []
    @State private var datePickFor: [SymphonyTask] = []
    @Environment(\.dynamicTypeSize) private var typeSize

    private var userId: UUID { auth.currentUser?.id ?? UUID() }

    private var filteredTasks: [SymphonyTask] {
        if let contextValue = appState.domainFilter.contextValue {
            return inboxTasks.filter { $0.context == contextValue }
        }
        return inboxTasks
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                PlannerHeader(title: "Inbox", subtitle: subtitle) {
                    if !filteredTasks.isEmpty {
                        Button(selecting ? "Done" : "Select") {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                selecting.toggle()
                                selected = []
                            }
                        }
                        .font(.bodyMediumBold)
                        .foregroundStyle(Color.ink)
                        .frame(minHeight: 44)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 10)

                if filteredTasks.isEmpty {
                    emptyState.frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    ForEach(filteredTasks, id: \.id) { task in
                        Group {
                            if selecting {
                                SelectableRow(task: task, selected: selected.contains(task.id)) {
                                    if selected.contains(task.id) { selected.remove(task.id) } else { selected.insert(task.id) }
                                }
                            } else {
                                InboxTaskRow(task: task, onMove: { move([task], $0) },
                                             onPickDate: { datePickFor = [task] })
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 3)
                    }
                    if !selecting {
                        Text("Tap Move — or swipe right — for Today, This week or Someday. Tap the circle, or swipe left, to complete.")
                            .font(.bodySmall)
                            .foregroundStyle(Color.textTertiary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 20)
                            .padding(.top, 14)
                    }
                }
            }
            .padding(.bottom, 12)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.bgBase.ignoresSafeArea())
        .statusBarScrim()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 8) {
                if let toast = triage.toast {
                    PlannerToast(message: toast.message, actionTitle: toast.snapshot == nil ? nil : "Undo") {
                        triage.undo(context: modelContext, userId: userId)
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                if selecting {
                    bulkBar
                } else if let userId = auth.currentUser?.id {
                    QuickCaptureBar(userId: userId)
                }
            }
            .padding(.top, 4)
            .padding(.bottom, appState.bottomInset)
            .animation(.easeInOut(duration: 0.2), value: triage.toast?.id)
        }
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .sheet(item: $triage.areaRequest) { request in
            LifeAreaSheet(request: request, onConfirm: { areas in
                triage.areaRequest = nil
                triage.perform(request.tasks, to: request.destination, areas: areas,
                               context: modelContext, userId: userId, members: familyMembers)
                finishBulk()
            }, onCancel: {
                // Cancel moves nothing and offers no Undo.
                triage.areaRequest = nil
            })
            .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: Binding(get: { !datePickFor.isEmpty }, set: { if !$0 { datePickFor = [] } })) {
            SchedulePickerSheet { date, isAllDay in
                let tasks = datePickFor
                datePickFor = []
                move(tasks, .day(date, allDay: isAllDay))
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var subtitle: String {
        if selecting { return "\(selected.count) selected" }
        let n = filteredTasks.count
        return n == 0 ? "All caught up" : "\(n) to triage"
    }

    private func move(_ tasks: [SymphonyTask], _ destination: PlanWriter.Destination) {
        triage.request(tasks, to: destination, context: modelContext, userId: userId, members: familyMembers)
        if triage.areaRequest == nil { finishBulk() }
    }

    private func finishBulk() {
        guard selecting else { return }
        selected = []
        selecting = false
    }

    private var selectedTasks: [SymphonyTask] { filteredTasks.filter { selected.contains($0.id) } }

    // MARK: Bulk toolbar

    private var bulkBar: some View {
        HStack(spacing: 4) {
            bulkButton("Today", strong: true) { move(selectedTasks, .today) }
            bulkButton("This week") { move(selectedTasks, .thisWeek) }
            bulkButton("Someday") { move(selectedTasks, .someday) }
            Menu {
                Button { move(selectedTasks, .day(PlanCalendar.addDays(Date(), 1), allDay: true)) } label: {
                    Label("Tomorrow", systemImage: "sunrise")
                }
                Button { datePickFor = selectedTasks } label: { Label("Pick a date…", systemImage: "calendar.badge.plus") }
                Button {
                    let vm = TaskViewModel(modelContext: modelContext)
                    for t in selectedTasks { vm.toggleComplete(t) }
                    finishBulk()
                } label: { Label("Mark complete", systemImage: "checkmark.circle") }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("More actions for \(selected.count) selected")
        }
        .padding(6)
        // A toolbar: labels stop growing at a readable size (like the dock),
        // with the large-content viewer for bigger text.
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
        .background(Color.ink, in: Capsule())
        .shadow(color: Color.ink.opacity(0.25), radius: 12, y: 6)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .disabled(selected.isEmpty)
        .opacity(selected.isEmpty ? 0.5 : 1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Move \(selected.count) selected")
    }

    private func bulkButton(_ title: String, strong: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(strong ? .bodySmallBold : .bodySmall)
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(strong ? Color.white.opacity(0.14) : Color.clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityShowsLargeContentViewer { Text(title) }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundStyle(Color.textLight)
                .accessibilityHidden(true)

            Text("Inbox Zero")
                .font(.displayMedium)
                .foregroundStyle(Color.textPrimary)

            Text("All caught up! Add tasks with the bar below.")
                .font(.bodySmall)
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }
}

// MARK: - Selectable row (Select mode)

private struct SelectableRow: View {
    let task: SymphonyTask
    let selected: Bool
    let toggle: () -> Void
    @Query private var familyMembers: [FamilyMember]

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().strokeBorder(selected ? Color.amberStrong : Color.textTertiary, lineWidth: 1.5)
                    if selected {
                        Circle().fill(Color.amberStrong)
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                    }
                }
                .frame(width: 22, height: 22)
                Text(task.title)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if task.context != nil { ContextDot(context: task.context) }
                AssigneeAvatars(memberIds: task.assignedToAll ?? (task.assignedTo.map { [$0] } ?? []),
                                members: familyMembers, size: 20)
            }
            .padding(14)
            .frame(minHeight: 52)
            .background(selected ? Color.bgWarm : Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(task.title)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Inbox Task Row

struct InboxTaskRow: View {
    let task: SymphonyTask
    let onMove: (PlanWriter.Destination) -> Void
    let onPickDate: () -> Void

    @Environment(\.modelContext) private var modelContext
    @State private var showDetail = false
    @State private var showContext = false

    var body: some View {
        SlideRow(
            onComplete: {
                TaskViewModel(modelContext: modelContext).toggleComplete(task)
            },
            actions: [
                SlideAction(label: "Today", systemImage: "sun.max", tint: Color.amberStrong) { onMove(.today) },
                SlideAction(label: "Week", systemImage: "calendar", tint: Color.ink) { onMove(.thisWeek) },
                SlideAction(label: "Someday", systemImage: "archivebox", tint: Color.textSecondary) { onMove(.someday) },
                SlideAction(label: "More", systemImage: "ellipsis", tint: Color.infoBlue) { showDetail = true },
            ]
        ) {
            VStack(alignment: .leading, spacing: 0) {
                PlanTaskRow(task: task) {
                    MoveMenuButton(title: task.title, onMove: onMove, onPickDate: onPickDate,
                                   onLifeArea: { showContext = true }, lifeAreaLabel: task.context?.capitalized)
                }
                if let target = suggestedTarget { suggestionChip(target) }
            }
        }
        .accessibilityAction(named: "Today") { onMove(.today) }
        .accessibilityAction(named: "This week") { onMove(.thisWeek) }
        .accessibilityAction(named: "Someday") { onMove(.someday) }
        .sheet(isPresented: $showContext) {
            ContextPickerSheet(task: task, modelContext: modelContext)
                .presentationDetents([.height(280)])
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

    /// Destination chip: an analyzed photo capture that matched an open
    /// task — one tap merges the note + photo onto it.
    private func suggestionChip(_ target: SymphonyTask) -> some View {
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
            .foregroundStyle(Color.amberStrong)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.primaryTint.opacity(0.12), in: Capsule())
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .padding(.leading, 14)
    }

    /// Resolve the AI-suggested destination task, if it still exists and is open.
    private var suggestedTarget: SymphonyTask? {
        guard task.captureStatus == "done", let targetId = task.captureSuggestedTaskId else { return nil }
        let descriptor = FetchDescriptor<SymphonyTask>(predicate: #Predicate { $0.id == targetId && !$0.completed })
        return try? modelContext.fetch(descriptor).first
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
    @Query private var familyMembers: [FamilyMember]

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                contextOption("Work", value: "work", color: .contextWork)
                contextOption("Family", value: "family", color: .contextFamily)
                contextOption("Personal", value: "personal", color: .contextPersonal)

                if task.context != nil {
                    Button {
                        let vm = TaskViewModel(modelContext: modelContext)
                        vm.setContext(task, context: nil, members: familyMembers)
                        dismiss()
                    } label: {
                        Text("Clear Context")
                            .font(.bodySmall)
                            .foregroundStyle(Color.feedbackRed)
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
            vm.setContext(task, context: value, members: familyMembers)
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
