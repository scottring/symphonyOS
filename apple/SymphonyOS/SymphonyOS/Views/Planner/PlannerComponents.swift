import SwiftUI
import SwiftData

// MARK: - Header

/// The editorial masthead: serif title (a button that opens the horizon
/// switcher when `onTitle` is set), a muted subtitle, and trailing controls.
struct PlannerHeader<Trailing: View>: View {
    let title: String
    let subtitle: String
    var onTitle: (() -> Void)? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .bottom, spacing: 12) {
                titleBlock
                Spacer(minLength: 8)
                trailing()
            }
            // Large text: stack instead of squeezing the title.
            VStack(alignment: .leading, spacing: 10) {
                titleBlock
                trailing()
            }
        }
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let onTitle {
                Button(action: onTitle) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(title).font(.displayLarge).foregroundStyle(Color.textPrimary)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.textTertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(title). Switch horizon")
                .accessibilityHint("Today, this week, month, season or year")
            } else {
                Text(title).font(.displayLarge).foregroundStyle(Color.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            Text(subtitle)
                .font(.bodySmall)
                .foregroundStyle(Color.textTertiary)
        }
    }
}

/// A 32pt circle button (search, ‹, ›) with a 44pt hit area.
struct CircleIconButton: View {
    let systemImage: String
    let label: String
    var active = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(active ? Color.amberStrong : Color.textTertiary)
                .frame(width: 32, height: 32)
                .background(Color.bgSurface, in: Circle())
                .overlay(Circle().strokeBorder(Color.cardBorder, lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Section pieces

struct Eyebrow: View {
    let text: String
    var count: Int? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text).eyebrowStyle().accessibilityAddTraits(.isHeader)
            Spacer()
            if let count {
                Text("\(count)").font(.bodySmall).foregroundStyle(Color.textTertiary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 4)
    }
}

/// One calm line that leads somewhere — "Review 2 unfinished items",
/// "Choose from this week", "September goals and tasks".
struct CalmRow: View {
    let text: String
    var detail: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(text)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let detail {
                    Text(detail)
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.ink)
                        .multilineTextAlignment(.trailing)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.ink)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(minHeight: 44)
            .background(Color.bgWarm, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.cardBorder, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.top, 10)
    }
}

// MARK: - Task row

/// A task as a soft card: circle · title (+meta) · dot · avatars · trailing.
/// Tapping the title opens the task.
struct PlanTaskRow<Trailing: View>: View {
    let task: SymphonyTask
    var meta: String? = nil
    @ViewBuilder var trailing: () -> Trailing

    @Environment(\.modelContext) private var modelContext
    @Query private var familyMembers: [FamilyMember]
    @State private var showDetail = false

    private var assigned: [UUID] { task.assignedToAll ?? (task.assignedTo.map { [$0] } ?? []) }

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                // Large text: title on its own full-width line, controls below.
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top, spacing: 10) { circle; titleButton }
                    HStack(spacing: 10) {
                        Spacer(minLength: 0)
                        marks
                        trailing()
                    }
                }
            } else {
                HStack(spacing: 10) {
                    circle
                    titleButton
                    marks
                    trailing()
                }
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 10)
        .padding(.vertical, 8)
        .frame(minHeight: 52)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
        .sheet(isPresented: $showDetail) {
            NavigationStack {
                TaskDetailView(task: task)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { showDetail = false } }
                    }
            }
            .presentationDetents([.large, .medium])
        }
    }

    private var circle: some View {
        CheckCircle(checked: task.completed, size: 24, label: task.title) {
            #if os(iOS)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            #endif
            TaskViewModel(modelContext: modelContext).toggleComplete(task)
        }
    }

    @ViewBuilder
    private var marks: some View {
        if task.captureStatus == "pending" { ProgressView().controlSize(.small) }
        if task.context != nil { ContextDot(context: task.context) }
        AssigneeAvatars(memberIds: assigned, members: familyMembers, size: 20)
    }

    private var titleButton: some View {
            VStack(alignment: .leading, spacing: 2) {
                    Text(task.title)
                        .font(.bodyMedium)
                        .foregroundStyle(task.completed ? Color.textTertiary : Color.textPrimary)
                        .strikethrough(task.completed)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                    if let meta {
                        Text(meta).font(.bodySmall).foregroundStyle(Color.textTertiary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                // Tap gesture (not a Button) so a swipe across the row never
                // opens the task; still a button to VoiceOver.
                .onTapGesture { showDetail = true }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Opens the task")
                .accessibilityAction { showDetail = true }
    }
}

extension PlanTaskRow where Trailing == EmptyView {
    init(task: SymphonyTask, meta: String? = nil) {
        self.init(task: task, meta: meta) { EmptyView() }
    }
}

// MARK: - Move menu

/// The visible entry point for triage — the same destinations the swipe
/// reveals, plus the less frequent ones.
struct MoveMenuButton: View {
    let title: String
    let onMove: (PlanWriter.Destination) -> Void
    var onPickDate: () -> Void
    var onLifeArea: (() -> Void)? = nil
    var lifeAreaLabel: String? = nil

    var body: some View {
        Menu {
            Button { onMove(.today) } label: { Label("Today", systemImage: "sun.max") }
            Button { onMove(.thisWeek) } label: {
                Label("This week", systemImage: "calendar")
            }
            Button { onMove(.someday) } label: { Label("Someday", systemImage: "archivebox") }
            Divider()
            Button { onMove(.day(PlanCalendar.addDays(Date(), 1), allDay: true)) } label: {
                Label("Tomorrow", systemImage: "sunrise")
            }
            Button(action: onPickDate) { Label("Pick a date…", systemImage: "calendar.badge.plus") }
            if let onLifeArea {
                Button(action: onLifeArea) {
                    Label(lifeAreaLabel.map { "Life area: \($0)" } ?? "Life area…", systemImage: "circle.lefthalf.filled")
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text("Move")
                Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold))
            }
            .font(.bodySmallBold)
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .background(Color.bgSurface, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Move \(title)")
    }
}

// MARK: - Toast

struct PlannerToast: View {
    let message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 12) {
            Text(message)
                .font(.bodySmall)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.bodySmallBold).foregroundStyle(Color.primaryLight)
                    .frame(minHeight: 44)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .background(Color.ink, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 16)
        .accessibilityElement(children: .contain)
    }
}
