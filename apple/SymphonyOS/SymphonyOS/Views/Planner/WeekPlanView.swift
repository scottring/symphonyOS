import SwiftUI
import SwiftData

/// A dated week (Sunday–Saturday): its list (any day, the weekend), the
/// month's goals and tasks as a reference line, then each day. Last week's
/// open commitments wait behind one review line — Keep, Done, Someday or
/// Drop, each a deliberate decision.
struct WeekPlanView: View {
    var onTitle: () -> Void = {}

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext

    @Query private var tasks: [SymphonyTask]
    @Query private var commitments: [TaskCommitment]
    @Query private var focusRows: [TaskFocus]
    @Query private var households: [Household]

    @State private var showReview = false
    @State private var toast: TriageController.Toast?
    @Environment(\.dynamicTypeSize) private var typeSize

    private var userId: UUID { auth.currentUser?.id ?? UUID() }
    private var weekStart: Date { PlanCalendar.weekStart(appState.selectedDate) }

    static func title(for weekStart: Date) -> String {
        let ws = PlanCalendar.weekStart(weekStart)
        let now = PlanCalendar.weekStart(Date())
        if ws == now { return "This week" }
        if ws == PlanCalendar.addDays(now, 7) { return "Next week" }
        if ws == PlanCalendar.addDays(now, -7) { return "Last week" }
        return "Week of \(ws.formatted(.dateTime.month(.abbreviated).day()))"
    }

    static func range(_ weekStart: Date) -> String {
        let ws = PlanCalendar.weekStart(weekStart)
        let we = PlanCalendar.addDays(ws, 6)
        let sameMonth = PlanCalendar.calendar.isDate(ws, equalTo: we, toGranularity: .month)
        let end = sameMonth ? we.formatted(.dateTime.day()) : we.formatted(.dateTime.month(.wide).day())
        return "\(ws.formatted(.dateTime.month(.wide).day())) – \(end)"
    }

    private var plan: PlanSnapshot {
        PlanSnapshot(tasks: tasks, commitments: commitments, focus: focusRows, routines: [], instances: [],
                     userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue,
                     seasons: households.first?.seasons)
    }

    var body: some View {
        let plan = plan
        let week = plan.week(weekStart)
        let previous = PlanCalendar.addDays(weekStart, -7)
        let review = plan.reviewRows(previousWeek: previous)
        let monthRef = plan.monthReference(for: appState.selectedDate)

        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                PlannerHeader(title: Self.title(for: weekStart), subtitle: Self.range(weekStart), onTitle: onTitle) {
                    HStack(spacing: 0) {
                        CircleIconButton(systemImage: "chevron.left", label: "Previous week") { appState.step(-1) }
                        CircleIconButton(systemImage: "chevron.right", label: "Next week") { appState.step(1) }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)

                DomainSwitcher()
                    .padding(.horizontal, 20)
                    .padding(.top, 10)

                if !review.isEmpty {
                    CalmRow(text: "Review last week · \(Self.shortRange(previous))",
                            detail: "\(review.count) open") { showReview = true }
                }

                Eyebrow(text: "Any day", count: week.anyDay.count)
                if week.anyDay.isEmpty { quiet("Nothing waiting for a day.") }
                ForEach(week.anyDay, id: \.id) { task in row(task) }

                if !week.weekend.isEmpty {
                    Eyebrow(text: "This weekend · Sat – Sun", count: week.weekend.count)
                    ForEach(week.weekend, id: \.id) { task in row(task) }
                }

                if monthRef.goals + monthRef.tasks > 0 {
                    CalmRow(text: "\(appState.selectedDate.formatted(.dateTime.month(.wide))) goals and tasks",
                            detail: monthDetail(monthRef)) { appState.horizon = .month }
                        .accessibilityHint("Opens the month. Reference only — not this week's list.")
                }

                Eyebrow(text: "By day")
                ForEach(week.byDay, id: \.day) { entry in
                    DayCard(day: entry.day, tasks: entry.tasks) {
                        appState.selectedDate = entry.day
                        appState.horizon = .today
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                }
            }
            .padding(.bottom, 16)
        }
        .background(Color.bgBase.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if let toast {
                    PlannerToast(message: toast.message, actionTitle: toast.snapshot == nil ? nil : "Undo") {
                        if let snap = toast.snapshot { PlanWriter(context: modelContext, userId: userId).undo(snap) }
                        self.toast = nil
                    }
                    .padding(.bottom, 8)
                }
            }
            .padding(.bottom, appState.bottomInset)
        }
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .sheet(isPresented: $showReview) {
            WeekReviewSheet(previousWeek: previous, intoWeek: weekStart)
                .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    static func shortRange(_ ws: Date) -> String {
        let we = PlanCalendar.addDays(ws, 6)
        return "\(ws.formatted(.dateTime.month(.abbreviated).day())) – \(we.formatted(.dateTime.month(.abbreviated).day()))"
    }

    private func monthDetail(_ r: (goals: Int, tasks: Int)) -> String {
        var parts: [String] = []
        if r.goals > 0 { parts.append("\(r.goals) \(r.goals == 1 ? "goal" : "goals")") }
        if r.tasks > 0 { parts.append("\(r.tasks) \(r.tasks == 1 ? "task" : "tasks")") }
        return parts.joined(separator: " · ")
    }

    private func quiet(_ text: String) -> some View {
        Text(text).font(.bodySmall).foregroundStyle(Color.textTertiary)
            .padding(.horizontal, 20).padding(.vertical, 4)
    }

    private func row(_ task: SymphonyTask) -> some View {
        PlanTaskRow(task: task) {
            Menu {
                ForEach(PlanCalendar.weekDays(weekStart), id: \.self) { day in
                    Button(day.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())) {
                        let snap = PlanWriter(context: modelContext, userId: userId).planTask(task, on: day)
                        toast = TriageController.Toast(message: "Planned “\(task.title)” for \(day.formatted(.dateTime.weekday(.wide)))", snapshot: snap)
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text("Day")
                    Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold))
                }
                .font(.bodySmallBold)
                .foregroundStyle(Color.ink)
                .padding(.horizontal, 12)
                .frame(minHeight: 32)
                .background(Color.bgSurface, in: Capsule())
                .overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))
                .frame(minHeight: 44)
            }
            .accessibilityLabel("Plan \(task.title) for a day")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
    }
}

// MARK: - Day card

private struct DayCard: View {
    let day: Date
    let tasks: [SymphonyTask]
    let open: () -> Void

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dynamicTypeSize) private var typeSize

    private var isToday: Bool { PlanCalendar.calendar.isDateInToday(day) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: open) {
                HStack(alignment: .firstTextBaseline) {
                    Text(day.formatted(.dateTime.weekday(.abbreviated).day()))
                        .font(.displaySmall)
                        .foregroundStyle(Color.textPrimary)
                    Spacer()
                    if isToday {
                        Text("Today")
                            .font(.eyebrow)
                            .textCase(.uppercase)
                            .kerning(1.2)
                            .foregroundStyle(Color.amberStrong)
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.textTertiary)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(day.formatted(.dateTime.weekday(.wide).month(.wide).day()))\(isToday ? ", today" : ""). Open day")

            if tasks.isEmpty {
                Text("Nothing planned")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
                    .padding(.bottom, 10)
            }
            ForEach(tasks, id: \.id) { task in
                HStack(spacing: 10) {
                    CheckCircle(checked: task.completed, size: 20, label: task.title) {
                        TaskViewModel(modelContext: modelContext).toggleComplete(task)
                    }
                    // Time sits beside the title, or above it at large text.
                    let layout = typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
                        : AnyLayout(HStackLayout(spacing: 10))
                    layout {
                        if !task.isAllDay, let t = task.scheduledFor {
                            Text(t.formatted(.dateTime.hour().minute()))
                                .font(.bodySmall)
                                .foregroundStyle(Color.textTertiary)
                                .fixedSize()
                        }
                        Text(task.title)
                            .font(.bodyMedium)
                            .foregroundStyle(task.completed ? Color.textTertiary : Color.textPrimary)
                            .strikethrough(task.completed)
                            .lineLimit(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if task.context != nil { ContextDot(context: task.context) }
                }
                .padding(.vertical, 2)
                .overlay(alignment: .top) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 4)
        .padding(.bottom, tasks.isEmpty ? 0 : 6)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
    }
}

// MARK: - Week review

/// Last week's open commitments, one deliberate verdict each:
/// Keep (carry into this week, same task), Done, Someday, Drop (end only that
/// week's commitment). History is preserved in the commitments themselves.
struct WeekReviewSheet: View {
    let previousWeek: Date
    let intoWeek: Date

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var tasks: [SymphonyTask]
    @Query private var commitments: [TaskCommitment]

    @State private var toast: TriageController.Toast?

    private var userId: UUID { auth.currentUser?.id ?? UUID() }

    private var rows: [(task: SymphonyTask, commitment: TaskCommitment)] {
        PlanSnapshot(tasks: tasks, commitments: commitments, focus: [], routines: [], instances: [],
                     userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue)
            .reviewRows(previousWeek: previousWeek)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Still open from \(WeekPlanView.shortRange(previousWeek)). Decide each one — Keep carries it into \(WeekPlanView.title(for: intoWeek).lowercased()).")
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)
                    if rows.isEmpty {
                        Text("All reviewed.").font(.bodyMedium).foregroundStyle(Color.textTertiary).padding(.top, 12)
                    }
                    ForEach(rows, id: \.commitment.id) { row in
                        verdictCard(row.task, row.commitment)
                    }
                }
                .padding(16)
            }
            .background(Color.bgBase)
            .navigationTitle("Review last week")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Review last week").font(.displaySmall).foregroundStyle(Color.textPrimary)
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                if let toast {
                    PlannerToast(message: toast.message, actionTitle: toast.snapshot == nil ? nil : "Undo") {
                        if let snap = toast.snapshot { PlanWriter(context: modelContext, userId: userId).undo(snap) }
                        self.toast = nil
                    }
                    .padding(.bottom, 8)
                }
            }
        }
    }

    private func verdictCard(_ task: SymphonyTask, _ c: TaskCommitment) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(task.title)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if task.context != nil { ContextDot(context: task.context) }
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) { verdicts(task, c) }
                VStack(alignment: .leading, spacing: 6) { verdicts(task, c) }
            }
        }
        .padding(14)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func verdicts(_ task: SymphonyTask, _ c: TaskCommitment) -> some View {
        let writer = PlanWriter(context: modelContext, userId: userId)
        verdict("Keep", strong: true, for: task) {
            toast = .init(message: "Kept “\(task.title)” for \(WeekPlanView.title(for: intoWeek).lowercased())",
                          snapshot: writer.keep(task, from: c, into: intoWeek))
        }
        verdict("Done", for: task) {
            writer.complete(task)
            toast = .init(message: "Marked “\(task.title)” done", snapshot: nil)
        }
        verdict("Someday", for: task) {
            toast = .init(message: "Moved “\(task.title)” to Someday", snapshot: writer.someday(task))
        }
        verdict("Drop", for: task) {
            toast = .init(message: "Dropped “\(task.title)” from that week", snapshot: writer.drop(c))
        }
    }

    private func verdict(_ label: String, strong: Bool = false, for task: SymphonyTask, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.bodySmallBold)
                .foregroundStyle(strong ? Color.white : Color.ink)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(strong ? Color.ink : Color.bgSurface, in: Capsule())
                .overlay(Capsule().strokeBorder(strong ? Color.ink : Color.cardBorder, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label): \(task.title)")
    }
}
