import SwiftUI
import SwiftData

struct TimelineItemCard: View {
    let item: TimelineItem
    let modelContext: ModelContext
    let userId: UUID

    @State private var isCompleted: Bool
    @State private var showContextPicker = false
    @State private var showDetail = false

    init(item: TimelineItem, modelContext: ModelContext, userId: UUID) {
        self.item = item
        self.modelContext = modelContext
        self.userId = userId
        self._isCompleted = State(initialValue: item.completed)
    }

    // Context accent color for the left bar
    private var accentColor: Color {
        switch item.context {
        case "work": .contextWork
        case "family": .contextFamily
        case "personal": .contextPersonal
        default: .primaryTint
        }
    }

    var body: some View {
        SlideRow(
            onComplete: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { isCompleted.toggle() }
                toggleCompletion()
            },
            actions: slideActions
        ) {
            cardContent
        }
        .sheet(isPresented: $showContextPicker) {
            if let task = fetchTask() {
                ContextPickerSheet(task: task, modelContext: modelContext)
                    .presentationDetents([.height(260)])
            }
        }
        .sheet(isPresented: $showDetail) {
            if let task = fetchTask() {
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
    }

    /// Right-swipe actions. Task-only (routines/events just complete via left swipe).
    private var slideActions: [SlideAction] {
        guard item.type == .task else { return [] }
        return [
            SlideAction(label: "Push", systemImage: "arrow.right", tint: Self.pushAmber) {
                if let task = fetchTask() {
                    TaskViewModel(modelContext: modelContext).schedule(task, for: Date().addingDays(1))
                }
            },
            SlideAction(label: "Context", systemImage: "tag", tint: Self.neutralSlate) {
                showContextPicker = true
            },
            SlideAction(label: "More", systemImage: "ellipsis", tint: .blue) {
                showDetail = true
            },
        ]
    }

    private func fetchTask() -> SymphonyTask? {
        guard item.type == .task else { return nil }
        let descriptor = FetchDescriptor<SymphonyTask>()
        return (try? modelContext.fetch(descriptor))?.first { $0.id == item.entityId }
    }

    private static let pushAmber = Color(red: 0.88, green: 0.64, blue: 0.23)
    private static let neutralSlate = Color(red: 0.42, green: 0.40, blue: 0.36)

    private var cardContent: some View {
        HStack(spacing: 0) {
            // Left accent bar — context colored
            RoundedRectangle(cornerRadius: 2)
                .fill(isCompleted ? Color.textTertiary.opacity(0.3) : accentColor)
                .frame(width: 3)
                .padding(.vertical, 8)

            // Main content
            HStack(spacing: 12) {
                // Completion toggle
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        isCompleted.toggle()
                    }
                    toggleCompletion()
                } label: {
                    checkboxView
                }
                .buttonStyle(.plain)

                // Content column
                VStack(alignment: .leading, spacing: 3) {
                    // Title row
                    HStack(spacing: 6) {
                        typeIcon

                        Text(item.title)
                            .font(.bodyMedium)
                            .foregroundStyle(isCompleted ? Color.textTertiary : Color.textPrimary)
                            .strikethrough(isCompleted)
                            .lineLimit(2)
                    }

                    // Metadata row
                    HStack(spacing: 8) {
                        if let time = item.timeString {
                            HStack(spacing: 4) {
                                Image(systemName: "clock")
                                    .font(.system(size: 10))
                                Text(time)
                                    .font(.captionText)
                            }
                            .foregroundStyle(Color.textSecondary)
                        }

                        if let context = item.context {
                            ContextBadge(context: context)
                        }
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(.leading, 12)
            .padding(.trailing, 14)
            .padding(.vertical, 12)
        }
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(item.type == .playbook ? Color.coachingBg : Color.bgElevated)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(
                    item.type == .playbook
                        ? Color.coachingTint.opacity(0.25)
                        : Color.textTertiary.opacity(0.08),
                    lineWidth: 1
                )
        )
        .shadow(
            color: item.type == .playbook
                ? Color.coachingTint.opacity(0.06)
                : Color.black.opacity(0.05),
            radius: 6,
            x: 0,
            y: 2
        )
        .opacity(isCompleted ? 0.7 : 1.0)
    }

    // MARK: - Checkbox

    @ViewBuilder
    private var checkboxView: some View {
        if item.type == .event {
            // Calendar icon for events
            Image(systemName: isCompleted ? "calendar.badge.checkmark" : "calendar")
                .font(.system(size: 20))
                .foregroundStyle(isCompleted ? Color.primaryTint : accentColor)
        } else if item.type == .routine {
            // Circle for routines
            Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 22))
                .foregroundStyle(isCompleted ? Color.primaryTint : Color.textTertiary)
        } else {
            // Rounded square for tasks
            Image(systemName: isCompleted ? "checkmark.square.fill" : "square")
                .font(.system(size: 20))
                .foregroundStyle(isCompleted ? Color.primaryTint : Color.textTertiary)
        }
    }

    // MARK: - Type Icon

    @ViewBuilder
    private var typeIcon: some View {
        switch item.type {
        case .task:
            EmptyView()
        case .routine:
            Image(systemName: "repeat")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.textSecondary)
        case .event:
            EmptyView() // Calendar checkbox already indicates event
        case .playbook:
            Image(systemName: "book.pages")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.coachingTint)
        }
    }

    // MARK: - Toggle Logic

    private func toggleCompletion() {
        #if os(iOS)
        let impactFeedback = UIImpactFeedbackGenerator(style: .medium)
        impactFeedback.impactOccurred()
        #endif

        let vm = TaskViewModel(modelContext: modelContext)
        let entityId = item.entityId

        switch item.type {
        case .task:
            // Fetch all tasks, filter in code (Predicate can't capture local vars)
            let descriptor = FetchDescriptor<SymphonyTask>()
            if let task = (try? modelContext.fetch(descriptor))?.first(where: { $0.id == entityId }) {
                vm.toggleComplete(task)
            }
        case .routine:
            let entityIdString = entityId.uuidString
            let descriptor = FetchDescriptor<ActionableInstance>()
            let allInstances = (try? modelContext.fetch(descriptor)) ?? []
            let instance = allInstances.first {
                $0.entityType == "routine" && $0.entityId == entityIdString
            }

            if let instance {
                instance.status = isCompleted ? "completed" : "pending"
                instance.completedAt = isCompleted ? Date() : nil
                instance.updatedAt = Date()
            } else if isCompleted {
                let newInstance = ActionableInstance(
                    userId: userId,
                    entityType: "routine",
                    entityId: entityIdString,
                    date: Date()
                )
                newInstance.status = "completed"
                newInstance.completedAt = Date()
                modelContext.insert(newInstance)
            }
            try? modelContext.save()
        default:
            break
        }
    }
}

// MARK: - Context Badge

struct ContextBadge: View {
    let context: String

    var body: some View {
        Text(context.capitalized)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 2.5)
            .background(color.opacity(0.1))
            .clipShape(Capsule())
    }

    private var color: Color {
        switch context {
        case "work": .contextWork
        case "family": .contextFamily
        case "personal": .contextPersonal
        default: .textTertiary
        }
    }
}
