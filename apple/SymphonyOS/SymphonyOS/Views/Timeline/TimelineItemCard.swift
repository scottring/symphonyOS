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
            // A free event carries no expectation — no swipe-to-complete.
            onComplete: item.isFree ? nil : {
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
                        recurringEventId: item.recurringEventId,
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
                SlideAction(label: "Push", systemImage: "arrow.right", tint: Color.primaryTint) {
                    if let task = fetchTask() {
                        TaskViewModel(modelContext: modelContext).schedule(task, for: Date().addingDays(1))
                    }
                },
                SlideAction(label: "Context", systemImage: "tag", tint: Color.textSecondary) {
                    showContextPicker = true
                },
                SlideAction(label: "More", systemImage: "ellipsis", tint: Color.infoBlue) {
                    showDetail = true
                },
            ]
        case .routine:
            return [
                SlideAction(label: "Skip", systemImage: "arrow.uturn.forward", tint: Color.textSecondary) {
                    setInstanceStatus(entityType: "routine", entityId: item.entityId.uuidString.lowercased(), status: "skipped")
                },
            ]
        case .event:
            guard let key = item.eventKey else { return [] }
            return [
                SlideAction(label: "Details", systemImage: "ellipsis", tint: Color.infoBlue) {
                    showEventDetail = true
                },
                SlideAction(label: "Skip", systemImage: "arrow.uturn.forward", tint: Color.textSecondary) {
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

    @State private var safariURL: URL?

    @ViewBuilder
    private var cardContent: some View {
        if item.isBlock { blockContent } else { plainRow }
    }

    // MARK: Plain row — time · dot · title · check circle (landing "Just a list" row)

    /// Leading completion control: one tap completes (swipe-left is only a
    /// shortcut). A free event carries no expectation, so it gets a quiet bar
    /// in the circle's place instead — titles still align.
    @ViewBuilder
    private var leadingControl: some View {
        if item.isFree || item.type == .event {
            // Events are the calendar's, not commitments to tick off here;
            // a non-free event can still be checked off with swipe-left.
            EventMark()
        } else {
            CheckCircle(checked: isCompleted, size: 24, label: item.title) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { isCompleted.toggle() }
                toggleCompletion()
            }
        }
    }

    private var plainRow: some View {
        HStack(spacing: 10) {
            leadingControl

            if let time = item.timeString {
                Text(time)
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
                    .fixedSize()
            }

            Text(item.title)
                .font(.bodyMedium)
                .foregroundStyle(isCompleted ? Color.textTertiary : (item.type == .event ? Color.textSecondary : Color.textPrimary))
                .strikethrough(isCompleted)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)

            if item.isFree { FreePill() }
            typeIcon
            if item.context != nil { ContextDot(context: item.context) }
            AssigneeAvatars(memberIds: item.assignedTo, members: familyMembers, size: 20)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
        .opacity(item.isFree ? 0.6 : (isCompleted ? 0.7 : 1.0))
        .onTapGesture { openDetail() }
    }

    private func openDetail() {
        switch item.type {
        case .task: showDetail = true
        case .event: if item.eventKey != nil { showEventDetail = true }
        case .routine: break
        }
    }

    // MARK: Block — rail · time + pill · serif title · note line · children · context row

    private var blockContent: some View {
        HStack(alignment: .top, spacing: 10) {
            leadingControl

            VStack(alignment: .leading, spacing: 6) {
                if item.timeString != nil || item.isFree || item.source != nil {
                    HStack {
                        if let time = item.timeString {
                            Text(time)
                                .font(.bodySmall)
                                .foregroundStyle(Color.textTertiary)
                        }
                        Spacer()
                        if item.isFree { FreePill() }
                        if let source = item.source { SourcePill(source: source) }
                    }
                }

                HStack(alignment: .top, spacing: 6) {
                    Text(item.title)
                        .font(.displaySmall)
                        .foregroundStyle(isCompleted ? Color.textTertiary : Color.textPrimary)
                        .strikethrough(isCompleted)
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    typeIcon
                    if item.context != nil { ContextDot(context: item.context).padding(.top, 6) }
                    AssigneeAvatars(memberIds: item.assignedTo, members: familyMembers, size: 20)
                }
                .contentShape(Rectangle())
                .onTapGesture { openDetail() }

                if let line = item.noteLine {
                    Text(line)
                        .font(.displayItalic)
                        .foregroundStyle(Color.textSecondary)
                        .lineLimit(2)
                }

                // Subtasks stay inside their card, each with its own circle.
                if !item.children.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(item.children) { child in
                            ChildRow(child: child, members: familyMembers) { toggleChild(child) }
                        }
                    }
                    .padding(.top, 8)
                    .overlay(alignment: .top) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
                    .padding(.top, 2)
                }

                if hasContextRow { contextRow.padding(.top, 2) }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
        .opacity(item.isFree ? 0.6 : (isCompleted ? 0.7 : 1.0))
        .sheet(item: $safariURL) { url in SafariView(url: url) }
    }

    private var hasContextRow: Bool {
        !item.links.isEmpty || item.phoneNumber != nil || item.location != nil
    }

    /// Link · phone · directions — small muted icons that open on tap.
    private var contextRow: some View {
        HStack(spacing: 14) {
            ForEach(Array(item.links.prefix(3).enumerated()), id: \.offset) { _, link in
                if let url = URL(string: link.url) {
                    Button { safariURL = url } label: {
                        Label(link.title ?? url.host ?? "Link", systemImage: "link")
                    }
                }
            }
            if let phone = item.phoneNumber,
               let url = URL(string: "tel:" + phone.filter { $0.isNumber || $0 == "+" }) {
                Link(destination: url) { Label(phone, systemImage: "phone") }
            }
            if let location = item.location {
                Link(destination: Self.mapsURL(location: location, placeId: item.locationPlaceId)) {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond")
                }
            }
        }
        .font(.captionBold)
        .foregroundStyle(Color.textSecondary)
        .labelStyle(.titleAndIcon)
        .buttonStyle(.plain)
        .lineLimit(1)
    }

    static func mapsURL(location: String, placeId: String?) -> URL {
        var c = URLComponents(string: "https://www.google.com/maps/dir/")!
        c.queryItems = [URLQueryItem(name: "api", value: "1"), URLQueryItem(name: "destination", value: location)]
        if let placeId { c.queryItems?.append(URLQueryItem(name: "destination_place_id", value: placeId)) }
        return c.url!
    }

    private func toggleChild(_ child: TimelineItem.ChildItem) {
        let descriptor = FetchDescriptor<SymphonyTask>()
        guard let task = (try? modelContext.fetch(descriptor))?.first(where: { $0.id == child.id }) else { return }
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
        TaskViewModel(modelContext: modelContext).toggleComplete(task)
    }

    // MARK: - Type Icon

    @ViewBuilder
    private var typeIcon: some View {
        switch item.type {
        case .task, .event:
            EmptyView()
        case .routine:
            Image(systemName: "repeat")
                .font(.captionBold)
                .foregroundStyle(Color.textSecondary)
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
            setInstanceStatus(entityType: "routine", entityId: item.entityId.uuidString.lowercased(),
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
            $0.entityType == entityType && (entityType == "routine" ? $0.entityId.lowercased() == entityIdString : $0.entityId == entityIdString) &&
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

extension URL: @retroactive Identifiable { public var id: String { absoluteString } }

// MARK: - Source Pill (landing `.pill`: "From an email" / "From the calendar" / "Shared")

struct SourcePill: View {
    let source: TimelineItem.Source

    var body: some View {
        Text(source.label)
            .font(.captionBold)
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(background, in: RoundedRectangle(cornerRadius: 6))
    }

    private var foreground: Color { source == .calendar ? .infoBlue : .primaryTint }
    private var background: Color { source == .calendar ? .infoBlueBg : .accentBg }
}

// MARK: - Free pill ("the kids just show up" — informational, no expectation)

struct FreePill: View {
    var body: some View {
        Text("Free")
            .font(.captionBold)
            .foregroundStyle(Color.textTertiary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 6))
    }
}

// MARK: - Check circle (plain rows + child rows)

struct CheckCircle: View {
    let checked: Bool
    var size: CGFloat = 20
    /// What it completes, for VoiceOver ("Complete Renew the passport").
    var label: String? = nil
    let action: () -> Void

    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    var body: some View {
        let side = size * min(scale, 1.6)
        Button(action: action) {
            ZStack {
                // Muted, not light: the ring must read as a control (3:1).
                Circle().strokeBorder(checked ? Color.successGreen : Color.textTertiary, lineWidth: 1.5)
                if checked {
                    Circle().fill(Color.successGreen)
                    Image(systemName: "checkmark").font(.system(size: side * 0.45, weight: .bold)).foregroundStyle(.white)
                }
            }
            .frame(width: side, height: side)
            // 44pt hit target around a smaller ring.
            .frame(minWidth: 44, minHeight: 44)
            .padding(-((44 - side) / 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label.map { checked ? "Completed: \($0)" : "Complete \($0)" } ?? (checked ? "Completed" : "Mark complete"))
        .accessibilityAddTraits(checked ? .isSelected : [])
    }
}

/// Holds the completion circle's place on an event row: events aren't
/// ticked off from the circle.
struct EventMark: View {
    @ScaledMetric(relativeTo: .body) private var side: CGFloat = 24
    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(Color.textLight)
            .frame(width: 3, height: min(side, 38) * 0.8)
            .frame(width: min(side, 38))
            .accessibilityHidden(true)
    }
}

/// The small life-area dot.
struct ContextDot: View {
    let context: String?
    var body: some View {
        Circle()
            .fill(Color.forContext(context))
            .frame(width: 9, height: 9)
            .accessibilityLabel(context?.capitalized ?? "No life area")
    }
}

extension Color {
    static func forContext(_ context: String?) -> Color {
        switch context {
        case "work": .contextWork
        case "family": .contextFamily
        case "personal": .contextPersonal
        default: .textTertiary
        }
    }
}

// MARK: - Child row (per-kid item under a block)

struct ChildRow: View {
    let child: TimelineItem.ChildItem
    let members: [FamilyMember]
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            CheckCircle(checked: child.completed, size: 20, label: child.title, action: onToggle)
            if let m = members.first(where: { child.assignedTo.contains($0.id) }) {
                Text(m.name.split(separator: " ").first.map(String.init) ?? m.name)
                    .font(.captionBold)
                    .foregroundStyle(Color.memberColor(m.color))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Color.memberColor(m.color).opacity(0.15), in: RoundedRectangle(cornerRadius: 6))
            }
            Text(child.title)
                .font(.bodySmall)
                .foregroundStyle(child.completed ? Color.textTertiary : Color.textPrimary)
                .strikethrough(child.completed)
                .lineLimit(3)
        }
    }
}

// MARK: - Context Badge

struct ContextBadge: View {
    let context: String

    var body: some View {
        Text(context.capitalized)
            .font(.captionBold)
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
