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
    @Query private var routines: [Routine]
    @Query private var instances: [ActionableInstance]
    @Query private var eventNotes: [EventNote]

    @State private var showReview = false
    @State private var toast: TriageController.Toast?
    @State private var calendar = GoogleCalendarService.shared
    @Environment(\.dynamicTypeSize) private var typeSize

    /// With routines and instances — for each day's routine occurrences.
    private var fullPlan: PlanSnapshot {
        PlanSnapshot(tasks: tasks, commitments: commitments, focus: focusRows, routines: routines,
                     instances: instances, userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue)
    }

    /// Everything Today would show for `day` — tasks, routine occurrences,
    /// calendar events — built by the same view model, untimed first.
    private func dayItems(_ day: Date) -> [TimelineItem] {
        let vm = TimelineViewModel()
        vm.buildTimeline(tasks: tasks, routines: routines, instances: instances, date: day,
                         domainFilter: appState.domainFilter, eventItems: calendar.items(for: day) ?? [],
                         eventNotes: eventNotes, focus: focusRows, userId: auth.currentUser?.id)
        return vm.forToday + vm.schedule
    }

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
                ForEach(PlanCalendar.weekDays(weekStart), id: \.self) { day in
                    DayCard(day: day, items: dayItems(day),
                            alsoDue: fullPlan.chooserRoutines(on: day)
                                .filter { !$0.flexible && !$0.chosen }.map(\.routine.name),
                            eventsLoading: calendar.items(for: day) == nil && calendar.isLoading(day)) {
                        appState.selectedDate = day
                        appState.horizon = .today
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                }
            }
            .padding(.bottom, 16)
        }
        .background(Color.bgBase.ignoresSafeArea())
        .statusBarScrim()
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
        // Each day's events, from the same cache Today reads.
        .task(id: weekStart) { await calendar.refreshWeek(weekStart) }
        .sheet(isPresented: $showReview) {
            WeekReviewSheet(previousWeek: previous, intoWeek: weekStart)
                .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    /// The day card's single "Also due" line: "Also due: Piano practice",
    /// "…: A, B", or "…: A, B +3 more" — never a list.
    static func alsoDueLine(_ names: [String]) -> String {
        let shown = names.prefix(2).joined(separator: ", ")
        let rest = names.count - 2
        return rest > 0 ? "Also due: \(shown) +\(rest) more" : "Also due: \(shown)"
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

/// One day of the week: the same items Today would show for it — tasks,
/// routine occurrences and calendar events — plus a quiet line naming the
/// untimed routines due that day. "Nothing planned" only when that's true
/// and the day's calendar has loaded.
private struct DayCard: View {
    let day: Date
    let items: [TimelineItem]
    /// Untimed routines due this day but not chosen (they wait in the chooser).
    let alsoDue: [String]
    let eventsLoading: Bool
    let open: () -> Void

    @Environment(\.modelContext) private var modelContext
    @Environment(AuthService.self) private var auth
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

            ForEach(items) { item in row(item) }

            // Secondary by design: ONE muted line, never a list (the desktop
            // Week's "Available" lists were removed as clutter). Up to two
            // names, then a count; choosing happens on the day's chooser.
            if !alsoDue.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: "repeat").font(.system(size: 11, weight: .semibold))
                    Text(WeekPlanView.alsoDueLine(alsoDue))
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .font(.bodySmall)
                .foregroundStyle(Color.textTertiary)
                .padding(.vertical, 6)
                .overlay(alignment: .top) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Also due: \(alsoDue.joined(separator: ", "))")
            }

            if items.isEmpty && alsoDue.isEmpty {
                if eventsLoading {
                    CalendarLoadingRow().padding(.bottom, 10)
                } else {
                    Text("Nothing planned")
                        .font(.bodySmall)
                        .foregroundStyle(Color.textTertiary)
                        .padding(.bottom, 10)
                }
            } else if eventsLoading {
                CalendarLoadingRow().padding(.vertical, 6)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 4)
        .padding(.bottom, items.isEmpty && alsoDue.isEmpty ? 0 : 6)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
    }

    @ViewBuilder
    private func row(_ item: TimelineItem) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            mark(item)
            // Time sits beside the title, or above it at large text.
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
                : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 10))
            layout {
                if let time = item.timeString {
                    Text(time)
                        .font(.bodySmall)
                        .foregroundStyle(Color.textTertiary)
                        .fixedSize()
                }
                Text(item.title)
                    .font(.bodyMedium)
                    .foregroundStyle(item.completed ? Color.textTertiary
                                     : (item.type == .event ? Color.textSecondary : Color.textPrimary))
                    .strikethrough(item.completed)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if item.type == .routine {
                Image(systemName: "repeat")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color.textSecondary)
                    .accessibilityLabel("Routine")
            }
            if item.context != nil { ContextDot(context: item.context) }
        }
        .padding(.vertical, 2)
        .overlay(alignment: .top) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
        .opacity(item.isFree ? 0.6 : 1)
    }

    @ViewBuilder
    private func mark(_ item: TimelineItem) -> some View {
        switch item.type {
        case .event:
            EventMark()
        case .task:
            CheckCircle(checked: item.completed, size: 20, label: item.title) {
                let tasks = (try? modelContext.fetch(FetchDescriptor<SymphonyTask>())) ?? []
                if let t = tasks.first(where: { $0.id == item.entityId }) {
                    TaskViewModel(modelContext: modelContext).toggleComplete(t)
                }
            }
        case .routine:
            CheckCircle(checked: item.completed, size: 20, label: item.title) {
                PlanWriter(context: modelContext, userId: auth.currentUser?.id ?? UUID())
                    .setOccurrence(entityType: "routine", entityId: item.entityId.uuidString,
                                   on: day, status: item.completed ? "pending" : "completed")
            }
        }
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
