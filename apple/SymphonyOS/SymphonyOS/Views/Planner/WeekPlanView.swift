import SwiftUI
import SwiftData

/// A dated week (seven days from the household's week start): its list (any
/// day, the weekend) and its write line, then each day. The month folds out
/// above it, for reading. Last week's open commitments wait behind one review
/// line: Done, Next week, Someday or Let go, each a deliberate decision.
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
    /// The line a dragged line would land on (drawn as a rule above it).
    @State private var dropTarget: UUID?
    /// The list is the Week (Scott, 2026-11-07); the days, card by card, are
    /// the optional view. Remembered on this device.
    @AppStorage("planner.week.layout") private var layout = "list"
    @State private var toast: TriageController.Toast?
    @State private var calendar = GoogleCalendarService.shared
    @Environment(\.dynamicTypeSize) private var typeSize

    /// With routines and instances — for each day's routine occurrences.
    private var fullPlan: PlanSnapshot {
        PlanSnapshot(tasks: tasks, commitments: commitments, focus: focusRows, routines: routines,
                     instances: instances, userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue)
    }

    /// What Today would show for `day` — tasks, calendar events, and the
    /// routines the week shows (Scott, 2026-11-08: a routine is Today's, on
    /// its days; the week shows one with Show on the week on, or one chosen
    /// for this day). Built by the same view model, untimed first.
    private func dayItems(_ day: Date) -> [TimelineItem] {
        let vm = TimelineViewModel()
        vm.buildTimeline(tasks: tasks, routines: routines, instances: instances, date: day,
                         domainFilter: appState.domainFilter, eventItems: calendar.items(for: day) ?? [],
                         eventNotes: eventNotes, focus: focusRows, userId: auth.currentUser?.id)
        let plan = fullPlan
        return (vm.forToday + vm.schedule).filter { item in
            guard item.type == .routine else { return true }
            guard let r = routines.first(where: { $0.id == item.entityId }) else { return false }
            return Self.showsOnWeek(r, chosen: plan.isChosen(r, on: day))
        }
    }

    /// A routine on the week: tagged Show on the week, or chosen for the day.
    static func showsOnWeek(_ r: Routine, chosen: Bool) -> Bool { r.showOnWeek || chosen }

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
        let monthStart = PlanCalendar.monthStart(appState.selectedDate)
        let month = plan.sheet(level: "month", start: monthStart)
        let monthWord = monthStart.formatted(.dateTime.month(.wide))
        let monthEnd = PlanCalendar.addDays(PlanCalendar.calendar.date(byAdding: .month, value: 1, to: monthStart) ?? monthStart, -1)

        // The month folds out above the week, for reading (paper-style
        // horizons, 2026-11-04). Nothing on it is a week item, and nothing
        // moves from it onto the week: this week is written in its own words.
        let lines = plan.weekLines(weekStart)
        PaperFoldView(horizon: "week", aboveLabel: monthWord, aboveCount: month.open.count, calendarLabel: "Week calendar") {
            VStack(alignment: .leading, spacing: 0) {
                PlannerHeader(title: Self.title(for: weekStart), subtitle: Self.range(weekStart), onTitle: onTitle) {
                    HStack(spacing: 0) {
                        DomainMenu()
                        CircleIconButton(systemImage: "chevron.left", label: "Previous week") { appState.step(-1) }
                        CircleIconButton(systemImage: "chevron.right", label: "Next week") { appState.step(1) }
                        PlannerOptionsMenu {
                            Button {
                                layout = layout == "list" ? "days" : "list"
                            } label: {
                                Label(layout == "list" ? "Show by day" : "Show as a list",
                                      systemImage: layout == "list" ? "calendar" : "list.bullet")
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 6)
            }
        } above: {
            SheetAbove(kicker: "Month · \(PeriodPlanView.range(monthStart, monthEnd))", title: "\(monthWord) goals",
                       rows: month.open.map { ($0.id, $0.title) }, doneCount: month.doneCount,
                       foot: "For reading. Write this week in its own words.", empty: "No \(monthWord) goals yet.")
        } calendar: {
            // This week's fixed points, for reading: events, by day.
            CalendarSheet(kicker: "Calendar", title: Self.shortRange(weekStart), start: weekStart,
                          end: PlanCalendar.addDays(weekStart, 7))
        } sheet: {
            VStack(alignment: .leading, spacing: 0) {
                SheetHeading(kicker: "Week · \(Self.shortRange(weekStart))", title: Self.title(for: weekStart))
                    .padding(.horizontal, 20)
                if !review.isEmpty {
                    CalmRow(text: "Review last week", detail: "\(review.count) open") { showReview = true }
                        .accessibilityHint("\(Self.shortRange(previous))")
                }
                if layout == "list" {
                    listSheet(lines)
                } else {
                    daysSheet(week)
                }
            }
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

    /// The Week's one list (Scott, 2026-11-07): every task on the week in its
    /// shared order (drag or Move up/down), a day as its mark, never a time. Day ▾
    /// gives, changes or takes away the day; the task stays where it is and
    /// shows on that day's Today. A goal or parent shows its open steps.
    /// Routines are on Today, on their days; events on the calendar fold.
    @ViewBuilder
    private func listSheet(_ lines: [PlanSnapshot.WeekLine]) -> some View {
        if lines.isEmpty {
            Text("Nothing on this week yet.").font(Paper.empty).foregroundStyle(Paper.faint)
                .padding(.horizontal, 20).padding(.vertical, 6)
        }
        ForEach(lines) { line in
            lineRow(line, in: lines)
                // Press, hold and drag a line onto another to order the
                // list (Scott, 2026-11-08); Move up / Move down are in its
                // day menu and VoiceOver's actions.
                .draggable(line.id.uuidString) {
                    Text(line.task.title).font(.bodyMedium).padding(10)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
                }
                .dropDestination(for: String.self) { ids, _ in
                    dropTarget = nil
                    guard let raw = ids.first, let id = UUID(uuidString: raw),
                          let from = lines.firstIndex(where: { $0.id == id }),
                          let to = lines.firstIndex(where: { $0.id == line.id }) else { return false }
                    // Onto a line takes its place: below it moving down, above it moving up.
                    move(lines[from].task, in: lines, toIndex: to > from ? to + 1 : to)
                    return true
                } isTargeted: { over in
                    if over { dropTarget = line.id } else if dropTarget == line.id { dropTarget = nil }
                }
                .overlay(alignment: .top) {
                    if dropTarget == line.id {
                        Rectangle().fill(Color.amberStrong).frame(height: 2).padding(.horizontal, 20)
                    }
                }
        }
        WriteLine(placeholder: "Write a task for this week") { text in
            PlanWriter(context: modelContext, userId: userId)
                .createPeriodTask(title: text, level: "week", periodStart: weekStart,
                                  context: appState.domainFilter.contextValue)
        }
        .padding(.horizontal, 20)
        .padding(.top, 4)
    }

    /// "Today", "Wed", or "This weekend" for a weekend task with no day.
    static func dayMark(_ line: PlanSnapshot.WeekLine) -> String? {
        if let d = line.day {
            return PlanCalendar.calendar.isDateInToday(d) ? "Today" : d.formatted(.dateTime.weekday(.abbreviated))
        }
        return line.task.weekendStart != nil ? "This weekend" : nil
    }

    /// Order the list: the same shared order the web's Week and Today read.
    private func move(_ task: SymphonyTask, in lines: [PlanSnapshot.WeekLine], toIndex: Int) {
        let from = lines.firstIndex { $0.id == task.id } ?? 0
        let snap = PlanWriter(context: modelContext, userId: userId)
            .reorder(task, in: lines.map(\.task), toIndex: toIndex)
        guard !snap.tasks.isEmpty else { return }
        toast = TriageController.Toast(message: "Moved “\(task.title)” \(toIndex <= from ? "up" : "down")", snapshot: snap)
    }

    private func lineRow(_ line: PlanSnapshot.WeekLine, in lines: [PlanSnapshot.WeekLine]) -> some View {
        let task = line.task
        let at = lines.firstIndex { $0.id == line.id } ?? 0
        // The day is the menu's own label ("Sat ⌄"), so it takes no line of
        // its own; a task with none shows a small calendar.
        return PlanTaskRow(task: task, meta: line.day == nil ? Self.dayMark(line) : nil, lined: true) {
            Menu {
                ForEach(PlanCalendar.weekDays(weekStart), id: \.self) { day in
                    Button {
                        let snap = PlanWriter(context: modelContext, userId: userId).planTask(task, on: day)
                        toast = TriageController.Toast(message: "“\(task.title)” on \(day.formatted(.dateTime.weekday(.wide)))", snapshot: snap)
                    } label: {
                        if let d = line.day, PlanCalendar.sameDay(d, day) {
                            Label(day.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()), systemImage: "checkmark")
                        } else {
                            Text(day.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()))
                        }
                    }
                }
                if line.day != nil {
                    Divider()
                    Button("No day") {
                        let snap = PlanWriter(context: modelContext, userId: userId).clearDay(task)
                        toast = TriageController.Toast(message: "“\(task.title)” has no day; it stays on the week", snapshot: snap)
                    }
                }
                if lines.count > 1 {
                    Divider()
                    if at > 0 {
                        Button { move(task, in: lines, toIndex: at - 1) } label: { Label("Move up", systemImage: "arrow.up") }
                    }
                    if at < lines.count - 1 {
                        Button { move(task, in: lines, toIndex: at + 2) } label: { Label("Move down", systemImage: "arrow.down") }
                    }
                }
            } label: {
                HStack(spacing: 3) {
                    if line.day != nil, let mark = Self.dayMark(line) {
                        Text(mark).font(.captionBold).foregroundStyle(mark == "Today" ? Color.amberStrong : Color.ink)
                    } else {
                        Image(systemName: "calendar").font(.system(size: 13, weight: .medium)).foregroundStyle(Color.textTertiary)
                    }
                    Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold)).foregroundStyle(Color.textTertiary)
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
            }
            .accessibilityLabel(line.day == nil ? "Give \(task.title) a day" : "\(Self.dayMark(line) ?? "") — change the day for \(task.title)")
        }
        .padding(.horizontal, 20)
        .accessibilityAction(named: "Move up") { if at > 0 { move(task, in: lines, toIndex: at - 1) } }
        .accessibilityAction(named: "Move down") { if at < lines.count - 1 { move(task, in: lines, toIndex: at + 2) } }
    }

    /// The optional view: the days, card by card, as Today would show them.
    @ViewBuilder
    private func daysSheet(_ week: PlanSnapshot.WeekView) -> some View {
                Eyebrow(text: "Any day", count: week.anyDay.count)
                ForEach(week.anyDay, id: \.id) { task in row(task) }

                if !week.weekend.isEmpty {
                    Eyebrow(text: "This weekend · Sat – Sun", count: week.weekend.count)
                    ForEach(week.weekend, id: \.id) { task in row(task) }
                }

                WriteLine(placeholder: "Write a task for this week") { text in
                    PlanWriter(context: modelContext, userId: userId)
                        .createPeriodTask(title: text, level: "week", periodStart: weekStart,
                                          context: appState.domainFilter.contextValue)
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)

                Eyebrow(text: "By day")
                ForEach(PlanCalendar.weekDays(weekStart), id: \.self) { day in
                    DayCard(day: day, items: dayItems(day),
                            alsoDue: fullPlan.chooserRoutines(on: day)
                                .filter { !$0.flexible && !$0.chosen && $0.routine.showOnWeek }.map(\.routine.name),
                            eventsLoading: calendar.items(for: day) == nil && calendar.isLoading(day)) {
                        appState.selectedDate = day
                        appState.horizon = .today
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                }
    }

    /// The day card's single "Also due" line: "Also due: Piano practice",
    /// "…: A, B", or "…: A, B +3 more" — never a list.
    static func alsoDueLine(_ names: [String]) -> String {
        let parts = alsoDueParts(names)
        return parts.more.map { "\(parts.names) \($0)" } ?? parts.names
    }

    /// The fallback when whole names don't fit: "Also due: 4 routines".
    static func alsoDueCount(_ n: Int) -> String {
        "Also due: \(n) \(n == 1 ? "routine" : "routines")"
    }

    /// The line in two pieces — the names, and the "+N more" count.
    static func alsoDueParts(_ names: [String]) -> (names: String, more: String?) {
        let shown = "Also due: " + names.prefix(2).joined(separator: ", ")
        let rest = names.count - 2
        return (shown, rest > 0 ? "+\(rest) more" : nil)
    }

    static func shortRange(_ ws: Date) -> String {
        let we = PlanCalendar.addDays(ws, 6)
        return "\(ws.formatted(.dateTime.month(.abbreviated).day())) – \(we.formatted(.dateTime.month(.abbreviated).day()))"
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
                    let parts = WeekPlanView.alsoDueParts(alsoDue)
                    // Whole names and "+N more" when they fit on one line;
                    // otherwise just the count — never a name cut mid-word,
                    // and never a second line.
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 4) {
                            Text(parts.names).fixedSize()
                            if let more = parts.more { Text(more).fixedSize() }
                        }
                        Text(WeekPlanView.alsoDueCount(alsoDue.count)).fixedSize()
                    }
                    Spacer(minLength: 0)
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
/// Done, Next week (carry into the week after, same task), Someday (end that
/// week's commitment; to Someday if nothing else holds it), Let go (off every
/// list, kept in history). History is preserved in the commitments themselves.
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
                    Text("Still open from \(WeekPlanView.shortRange(previousWeek)). Decide each one: Next week carries it into \(WeekPlanView.title(for: intoWeek).lowercased()).")
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
        verdict("Done", for: task) {
            writer.complete(task)
            toast = .init(message: "Marked “\(task.title)” done", snapshot: nil)
        }
        // Named for where it goes (2026-11-04): the week after that one.
        verdict("Next week", strong: true, for: task) {
            toast = .init(message: "Moved “\(task.title)” to \(WeekPlanView.title(for: intoWeek).lowercased())",
                          snapshot: writer.keep(task, from: c, into: intoWeek))
        }
        // Someday ("not now") ends that week's commitment only; the task
        // goes to Someday unless another list still holds it.
        verdict("Someday", for: task) {
            let snap = writer.someday(task, from: c)
            toast = .init(message: task.bucket == "someday" ? "Moved “\(task.title)” to Someday"
                                                            : "Took “\(task.title)” off that week",
                          snapshot: snap)
        }
        // Let go ("not ever"): off every list, kept in history.
        verdict("Let go", for: task) {
            toast = .init(message: "Let go of “\(task.title)”", snapshot: writer.letGo(task))
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
