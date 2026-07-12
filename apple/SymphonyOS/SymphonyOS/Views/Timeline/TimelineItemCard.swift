import SwiftUI
import SwiftData

struct TimelineItemCard: View {
    let item: TimelineItem
    let modelContext: ModelContext
    let userId: UUID
    /// The day this card is rendered for (Today view's selected date) — routine
    /// completions must attach to THIS day's instance, not whatever instance
    /// happens to exist for the routine on another date.
    let date: Date

    @State private var isCompleted: Bool
    @State private var showContextPicker = false
    @State private var showDetail = false
    @State private var showEventDetail = false
    @Query private var familyMembers: [FamilyMember]

    init(item: TimelineItem, modelContext: ModelContext, userId: UUID, date: Date = Date()) {
        self.item = item
        self.modelContext = modelContext
        self.userId = userId
        self.date = date
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
        .sheet(isPresented: $showEventDetail) {
            if let key = item.eventKey {
                NavigationStack {
                    EventDetailView(
                        googleEventId: key,
                        eventTitle: item.title,
                        eventStart: item.startTime,
                        eventLocation: item.location,
                        date: date,
                        userId: userId
                    )
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showEventDetail = false }
                        }
                    }
                }
                .presentationDetents([.large, .medium])
            }
        }
    }

    /// Right-swipe actions. Tasks get push/context/more; routines get skip
    /// (status="skipped" on the day's instance, same as the web). Events have none.
    private var slideActions: [SlideAction] {
        switch item.type {
        case .task:
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
        case .routine:
            return [
                SlideAction(label: "Skip", systemImage: "arrow.uturn.forward", tint: Self.neutralSlate) {
                    setInstanceStatus(entityType: "routine", entityId: item.entityId.uuidString, status: "skipped")
                },
            ]
        case .event:
            guard let key = item.eventKey else { return [] }
            return [
                SlideAction(label: "Details", systemImage: "ellipsis", tint: .blue) {
                    showEventDetail = true
                },
                SlideAction(label: "Skip", systemImage: "arrow.uturn.forward", tint: Self.neutralSlate) {
                    setInstanceStatus(entityType: "calendar_event", entityId: key, status: "skipped")
                },
            ]
        default:
            return []
        }
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
                // Content column (completion is via swipe-left now — no checkbox)
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

                // Trailing: location pin + assignee avatars
                if item.location != nil || !item.assignedTo.isEmpty {
                    HStack(spacing: 6) {
                        if item.location != nil {
                            Image(systemName: "mappin")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.textTertiary)
                        }
                        AssigneeAvatars(memberIds: item.assignedTo, members: familyMembers)
                    }
                }
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
            setInstanceStatus(entityType: "routine", entityId: item.entityId.uuidString,
                              status: isCompleted ? "completed" : "pending")
        case .event:
            // Web parity: events check off via actionable_instances keyed by the
            // Google event id.
            if let key = item.eventKey {
                setInstanceStatus(entityType: "calendar_event", entityId: key,
                                  status: isCompleted ? "completed" : "pending")
            }
        default:
            break
        }
    }

    /// Write a routine/event occurrence's status to THIS card's day, mirroring
    /// the web: find the (entity, date) instance — household-shared ones
    /// included, since the pull syncs every RLS-visible row — update it if
    /// present, otherwise create one owned by the current user. Every path
    /// queues a sync push; without it the completion never left the phone (and
    /// the next pull's reconciler deleted the local instance — completions
    /// silently vanished).
    private func setInstanceStatus(entityType: String, entityId entityIdString: String, status: String) {
        let cal = Calendar.current
        let allInstances = (try? modelContext.fetch(FetchDescriptor<ActionableInstance>())) ?? []
        let instance = allInstances.first {
            $0.entityType == entityType && $0.entityId == entityIdString &&
            cal.isDate($0.date, inSameDayAs: date)
        }

        let now = Date()
        if let instance {
            instance.status = status
            instance.completedAt = status == "completed" ? now : nil
            instance.skippedAt = status == "skipped" ? now : nil
            instance.updatedAt = now
            instance.syncStatus = .pending
            modelContext.queueSync(table: "actionable_instances", recordId: instance.id, type: "update")
        } else if status != "pending" {
            let newInstance = ActionableInstance(
                userId: userId,
                entityType: entityType,
                entityId: entityIdString,
                date: date
            )
            newInstance.status = status
            newInstance.completedAt = status == "completed" ? now : nil
            newInstance.skippedAt = status == "skipped" ? now : nil
            modelContext.insert(newInstance)
            modelContext.queueSync(table: "actionable_instances", recordId: newInstance.id, type: "insert")
        }
        try? modelContext.save()
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

// MARK: - Assignee Avatars

/// Overlapping initial-circles for the assigned family members (up to 3, then +N).
struct AssigneeAvatars: View {
    let memberIds: [UUID]
    let members: [FamilyMember]
    var size: CGFloat = 22

    var body: some View {
        let assigned = members
            .filter { memberIds.contains($0.id) }
            .sorted { $0.displayOrder < $1.displayOrder }
        if !assigned.isEmpty {
            HStack(spacing: -6) {
                ForEach(assigned.prefix(3), id: \.id) { member in
                    Text(member.initials)
                        .font(.system(size: size * 0.42, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: size, height: size)
                        .background(Color.memberColor(member.color))
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(Color.bgElevated, lineWidth: 1.5))
                }
                if assigned.count > 3 {
                    Text("+\(assigned.count - 3)")
                        .font(.system(size: size * 0.38, weight: .bold))
                        .foregroundStyle(Color.textSecondary)
                        .frame(width: size, height: size)
                        .background(Color.bgSurface)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(Color.bgElevated, lineWidth: 1.5))
                }
            }
        }
    }
}
