import SwiftUI
import SwiftData

/// Month, Season and Year. Month and Season list their goals (outcomes) and
/// tasks (actions); a task can be brought down into a nearer period without
/// losing its place here. Year lists the year's goals.
struct PeriodPlanView: View {
    enum Level { case month, season, year }

    let level: Level
    var onTitle: () -> Void = {}

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext

    @Query private var tasks: [SymphonyTask]
    @Query private var commitments: [TaskCommitment]
    @Query private var goals: [Goal]
    @Query private var households: [Household]

    @State private var toast: TriageController.Toast?

    enum GoalEdit: Identifiable {
        case new
        case existing(Goal)
        var id: String {
            switch self {
            case .new: "new"
            case .existing(let g): g.id.uuidString
            }
        }
    }
    @State private var editing: GoalEdit?

    private var userId: UUID { auth.currentUser?.id ?? UUID() }
    private var date: Date { appState.selectedDate }
    private var seasons: [SeasonBoundary]? { households.first?.seasons }

    private var plan: PlanSnapshot {
        PlanSnapshot(tasks: tasks, commitments: commitments, focus: [], routines: [], instances: [], goals: goals,
                     userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue, seasons: seasons)
    }

    private var season: PlanCalendar.Season { PlanCalendar.season(containing: date, boundaries: seasons) }

    private var title: String {
        switch level {
        case .month: return date.formatted(.dateTime.month(.wide))
        case .season: return season.name
        case .year: return String(PlanCalendar.year(of: date))
        }
    }

    private var subtitle: String {
        switch level {
        case .month: return date.formatted(.dateTime.month(.wide).year())
        case .season:
            return "\(season.start.formatted(.dateTime.month(.wide).day())) – \(season.lastDay.formatted(.dateTime.month(.wide).day()))"
        case .year: return "The year's goals"
        }
    }

    private var unit: String {
        switch level { case .month: "month"; case .season: "season"; case .year: "year" }
    }

    var body: some View {
        let plan = plan
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                PlannerHeader(title: title, subtitle: subtitle, onTitle: onTitle) {
                    HStack(spacing: 0) {
                        CircleIconButton(systemImage: "chevron.left", label: "Previous \(unit)") { appState.step(-1, seasons: seasons) }
                        CircleIconButton(systemImage: "chevron.right", label: "Next \(unit)") { appState.step(1, seasons: seasons) }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)

                DomainSwitcher()
                    .padding(.horizontal, 20)
                    .padding(.top, 10)

                switch level {
                case .year: yearContent(plan)
                case .month: periodContent(plan.period(level: "month", start: PlanCalendar.monthStart(date), week: Date()))
                case .season: periodContent(plan.period(level: "season", start: season.start, week: Date()))
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
        .sheet(item: $editing) { edit in
            switch edit {
            case .new: GoalEditorSheet(goal: nil, year: PlanCalendar.year(of: date))
            case .existing(let g): GoalEditorSheet(goal: g, year: g.year)
            }
        }
    }

    // MARK: Month / season

    @ViewBuilder
    private func periodContent(_ list: PlanSnapshot.PeriodList) -> some View {
        Eyebrow(text: "Goals", count: list.goals.count)
        if list.goals.isEmpty { quiet("No goals for this \(unit).") }
        ForEach(list.goals, id: \.id) { goal in
            goalRow(goal.title, note: goal.notes.flatMap(NotesHTML.firstLine), context: goal.context)
        }

        Eyebrow(text: "Tasks", count: list.tasks.count)
        if list.tasks.isEmpty { quiet("No tasks for this \(unit).") }
        ForEach(list.tasks, id: \.id) { task in
            PlanTaskRow(task: task, meta: list.onWeek.contains(task.id) ? "On this week's list" : nil) {
                if !list.onWeek.contains(task.id) { bringDown(task) }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 3)
        }
    }

    private func bringDown(_ task: SymphonyTask) -> some View {
        Menu {
            Button("This week") {
                let snap = PlanWriter(context: modelContext, userId: userId)
                    .placeDown(task, level: "week", periodStart: PlanCalendar.weekStart(Date()))
                toast = .init(message: "Added “\(task.title)” to this week", snapshot: snap)
            }
            if level == .season {
                Button("This month") {
                    let snap = PlanWriter(context: modelContext, userId: userId)
                        .placeDown(task, level: "month", periodStart: PlanCalendar.monthStart(Date()))
                    toast = .init(message: "Added “\(task.title)” to this month", snapshot: snap)
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text("Plan")
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
        .accessibilityLabel("Plan \(task.title) into a nearer period")
    }

    // MARK: Year

    @ViewBuilder
    private func yearContent(_ plan: PlanSnapshot) -> some View {
        let list = plan.yearGoals(PlanCalendar.year(of: date))
        Eyebrow(text: "Goals", count: list.count)
        if list.isEmpty { quiet("No goals for \(title) yet.") }
        ForEach(list, id: \.id) { goal in
            Button { editing = .existing(goal) } label: {
                goalRow(goal.name, note: goal.notes.flatMap(NotesHTML.firstLine), context: goal.context,
                        done: goal.status == "completed")
            }
            .buttonStyle(.plain)
            .accessibilityHint("Edit goal")
        }
        Button { editing = .new } label: {
            HStack(spacing: 8) {
                Image(systemName: "plus").font(.system(size: 13, weight: .bold))
                Text("Add a goal for \(title)")
            }
            .font(.bodyMediumBold)
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(Color.bgWarm, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: Pieces

    private func goalRow(_ name: String, note: String?, context: String?, done: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: done ? "checkmark.circle.fill" : "scope")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(done ? Color.successGreen : Color.textSecondary)
                .padding(.top, 3)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.displaySmall)
                    .foregroundStyle(done ? Color.textTertiary : Color.textPrimary)
                    .strikethrough(done)
                    .fixedSize(horizontal: false, vertical: true)
                if let note {
                    Text(note).font(.displayItalic).foregroundStyle(Color.textSecondary).lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if context != nil { ContextDot(context: context).padding(.top, 7) }
        }
        .padding(14)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Goal: \(name)\(done ? ", completed" : "")")
    }

    private func quiet(_ text: String) -> some View {
        Text(text).font(.bodySmall).foregroundStyle(Color.textTertiary)
            .padding(.horizontal, 20).padding(.vertical, 4)
    }
}
