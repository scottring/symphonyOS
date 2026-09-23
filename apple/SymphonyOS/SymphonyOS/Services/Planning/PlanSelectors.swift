import Foundation

/// What each planning horizon shows, as pure functions over synced rows —
/// ports of the web's selectors (lib/today/dayPlan.ts, lib/planning/weekList.ts,
/// lib/today/taskPools.ts). No SwiftData access, so they're unit-testable.
struct PlanSnapshot {
    var tasks: [SymphonyTask]
    var commitments: [TaskCommitment]
    var focus: [TaskFocus]
    var routines: [Routine]
    var instances: [ActionableInstance]
    var goals: [Goal] = []
    var userId: UUID?
    /// Life-area lens: nil = All.
    var domain: String?
    var seasons: [SeasonBoundary]? = nil

    // MARK: Indexes

    private var commitmentsByTask: [UUID: [TaskCommitment]] {
        Dictionary(grouping: commitments, by: \.taskId)
    }

    init(tasks: [SymphonyTask], commitments: [TaskCommitment], focus: [TaskFocus],
         routines: [Routine], instances: [ActionableInstance], goals: [Goal] = [],
         userId: UUID?, domain: String?, seasons: [SeasonBoundary]? = nil) {
        self.tasks = tasks
        self.commitments = commitments
        self.focus = focus
        self.routines = routines
        self.instances = instances
        self.goals = goals
        self.userId = userId
        self.domain = domain
        self.seasons = seasons
    }

    /// Top-level tasks in the current life-area lens. Steps (subtasks) ride
    /// inside their parent's card and never list on their own.
    var lensTasks: [SymphonyTask] {
        tasks.filter { $0.parentTaskId == nil && (domain == nil || $0.context == domain) }
    }

    // MARK: Membership

    static func bucket(for level: String) -> String { level == "season" ? "quarter" : level }

    /// Is `task` held by `level`'s period starting `periodStart`? Reads the
    /// commitments; a task with none at all falls back to the legacy cache
    /// (bucket + stamp, a NULL stamp meaning "the current period").
    func holds(_ task: SymphonyTask, level: String, periodStart: Date, byTask: [UUID: [TaskCommitment]]? = nil) -> Bool {
        let rows = (byTask ?? commitmentsByTask)[task.id] ?? []
        if !rows.isEmpty {
            return rows.contains { $0.level == level && $0.holds && PlanCalendar.sameDay($0.periodStart, periodStart) }
        }
        guard task.bucket == Self.bucket(for: level) else { return false }
        let stamp: Date? = switch level {
        case "week": task.weekStart
        case "month": task.monthStart
        default: task.seasonStart
        }
        if let stamp { return PlanCalendar.sameDay(stamp, periodStart) }
        let current: Date = switch level {
        case "week": PlanCalendar.weekStart(Date())
        case "month": PlanCalendar.monthStart(Date())
        default: PlanCalendar.season(containing: Date(), boundaries: seasons).start
        }
        return PlanCalendar.sameDay(current, periodStart)
    }

    /// My focus mark for `date` (per person). A task with no focus rows at
    /// all falls back to the legacy shared `planned_on`.
    func isFocused(_ task: SymphonyTask, on date: Date) -> Bool {
        let rows = focus.filter { $0.taskId == task.id }
        if rows.isEmpty { return PlanCalendar.sameDay(task.plannedOn, date) }
        return rows.contains { $0.userId == userId && PlanCalendar.sameDay($0.date, date) }
    }

    func isDated(_ task: SymphonyTask, on date: Date) -> Bool {
        PlanCalendar.sameDay(task.scheduledFor, date)
    }

    // MARK: Day

    /// Unfinished work from the last two days, shown for deliberate review on
    /// the real today only (web `selectCarriedOver`, GRACE_DAYS = 2).
    func unfinished(on date: Date) -> [SymphonyTask] {
        guard PlanCalendar.calendar.isDateInToday(date) else { return [] }
        let today = PlanCalendar.day(date)
        return lensTasks.filter { t in
            guard !t.completed, !t.isGoal, let s = t.scheduledFor, !isFocused(t, on: date) else { return false }
            let age = PlanCalendar.calendar.dateComponents([.day], from: PlanCalendar.day(s), to: today).day ?? 0
            return age > 0 && age <= TimelineViewModel.graceDays
        }
        .sorted { ($0.scheduledFor ?? .distantPast) < ($1.scheduledFor ?? .distantPast) }
    }

    /// Tasks chosen for `date` that aren't dated to it (web `plannedExtraTasks`).
    func focusedExtras(on date: Date) -> [SymphonyTask] {
        lensTasks.filter { !$0.completed && !isDated($0, on: date) && isFocused($0, on: date) }
    }

    /// The routine context for `date` under the current lens.
    func routineContext(on date: Date) -> RoutineRules.Context {
        RoutineRules.Context(domain: domain, hideEveryday: true,
                             deferredInto: RoutineRules.deferredInto(instances, on: date),
                             lastCompletedAt: RoutineRules.lastCompletions(instances))
    }

    func instance(for routine: Routine, on date: Date) -> ActionableInstance? {
        instances.first {
            $0.entityType == "routine" && $0.entityId.lowercased() == routine.id.uuidString.lowercased()
                && PlanCalendar.sameDay($0.date, date)
        }
    }

    /// Is this routine's occurrence chosen for `date`?
    func isChosen(_ routine: Routine, on date: Date) -> Bool {
        PlanCalendar.sameDay(instance(for: routine, on: date)?.plannedOn, date)
    }

    /// Does the routine keep a row on the day without being chosen?
    /// Timed, or pinned as a tracked obligation.
    static func isAnchored(_ r: Routine) -> Bool { r.timeOfDay != nil || r.pinToTimeline }

    /// Routines that show on `date`'s list: due and anchored, or chosen.
    func dayRoutines(on date: Date) -> [Routine] {
        let ctx = routineContext(on: date)
        return routines.filter { r in
            if isChosen(r, on: date) { return r.visibility == "active" && (domain == nil || r.context == domain) }
            return Self.isAnchored(r) && RoutineRules.shows(r, on: date, ctx)
        }
    }

    // MARK: Chooser ("Choose from this week")

    struct RoutineOffer: Identifiable {
        let routine: Routine
        /// A flexible weekly routine offered for this day (no day of its own).
        let flexible: Bool
        let chosen: Bool
        var id: UUID { routine.id }
    }

    /// This week's tasks that could be planned into `date`: on the week's list,
    /// not done, not already given a day, not already chosen for it. Weekend
    /// tasks are offered only on days inside their weekend.
    func chooserTasks(on date: Date) -> [SymphonyTask] {
        let week = PlanCalendar.weekStart(date)
        let byTask = commitmentsByTask
        let weekendDays = PlanCalendar.weekendWindow(for: date) ?? []
        return lensTasks.filter { t in
            guard !t.completed, !t.isGoal, t.scheduledFor == nil, !isFocused(t, on: date),
                  holds(t, level: "week", periodStart: week, byTask: byTask) else { return false }
            if let sat = t.weekendStart {
                return weekendDays.contains { PlanCalendar.sameDay($0, sat) || PlanCalendar.sameDay($0, PlanCalendar.addDays(sat, 1)) }
            }
            return true
        }
        .sorted { $0.createdAt < $1.createdAt }
    }

    /// Routine occurrences for the DISPLAYED date: untimed ones due that day,
    /// plus flexible weekly routines that have no home yet this week.
    func chooserRoutines(on date: Date) -> [RoutineOffer] {
        let ctx = routineContext(on: date)
        var offers: [RoutineOffer] = []
        for r in routines where !Self.isAnchored(r) {
            let chosen = isChosen(r, on: date)
            if RoutineRules.isFlexibleWeekly(r.recurrencePattern) {
                // Date-agnostic eligibility (the web's resolveRoutineEligible).
                guard chosen || (RoutineRules.shows(r, on: nil, ctx)
                                 && !RoutineRules.placedInWeek(r.id, weekStart: date, instances)) else { continue }
                offers.append(RoutineOffer(routine: r, flexible: true, chosen: chosen))
            } else if RoutineRules.shows(r, on: date, ctx) {
                if let i = instance(for: r, on: date), i.status == "completed" || i.status == "skipped" { continue }
                offers.append(RoutineOffer(routine: r, flexible: false, chosen: chosen))
            }
        }
        return offers.sorted { ($0.flexible ? 1 : 0, $0.routine.name) < ($1.flexible ? 1 : 0, $1.routine.name) }
    }

    // MARK: Week

    func weekList(_ weekStart: Date) -> [SymphonyTask] {
        let byTask = commitmentsByTask
        return lensTasks.filter { !$0.isGoal && holds($0, level: "week", periodStart: weekStart, byTask: byTask) }
    }

    struct WeekView {
        var anyDay: [SymphonyTask]
        var weekend: [SymphonyTask]
        var byDay: [(day: Date, tasks: [SymphonyTask])]
    }

    func week(_ start: Date) -> WeekView {
        let ws = PlanCalendar.weekStart(start)
        let list = weekList(ws).filter { !$0.completed }
        let sat = PlanCalendar.weekendSaturday(ofWeek: ws)
        let days = PlanCalendar.weekDays(ws)
        let dated = lensTasks.filter { t in !t.isGoal && days.contains { isDated(t, on: $0) } }
        return WeekView(
            anyDay: list.filter { $0.scheduledFor == nil && $0.weekendStart == nil },
            weekend: list.filter { $0.scheduledFor == nil && PlanCalendar.sameDay($0.weekendStart, sat) },
            byDay: days.map { d in
                (d, dated.filter { isDated($0, on: d) }
                    .sorted { ($0.isAllDay ? 0 : 1, $0.scheduledFor ?? .distantPast) < ($1.isAllDay ? 0 : 1, $1.scheduledFor ?? .distantPast) })
            }
        )
    }

    /// Last week's open, unfinished commitments — the review's rows.
    func reviewRows(previousWeek start: Date) -> [(task: SymphonyTask, commitment: TaskCommitment)] {
        let ws = PlanCalendar.weekStart(start)
        let byId = Dictionary(lensTasks.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return commitments
            .filter { $0.level == "week" && $0.status == "open" && PlanCalendar.sameDay($0.periodStart, ws) }
            .compactMap { c in
                guard let t = byId[c.taskId], !t.completed, !t.isGoal else { return nil }
                return (t, c)
            }
            .sorted { $0.task.createdAt < $1.task.createdAt }
    }

    // MARK: Month / season / year

    struct PeriodList {
        var goals: [SymphonyTask]
        var tasks: [SymphonyTask]
        /// Tasks here that are also on the given week's list.
        var onWeek: Set<UUID>
    }

    func period(level: String, start: Date, week: Date) -> PeriodList {
        let byTask = commitmentsByTask
        let held = lensTasks.filter { holds($0, level: level, periodStart: start, byTask: byTask) && !$0.completed }
        let ws = PlanCalendar.weekStart(week)
        let onWeek = Set(held.filter { holds($0, level: "week", periodStart: ws, byTask: byTask) }.map(\.id))
        return PeriodList(goals: held.filter(\.isGoal), tasks: held.filter { !$0.isGoal }, onWeek: onWeek)
    }

    /// The month reference row on Week: its goals, and its tasks not yet on
    /// this week's list. Reference only — nothing here is a week commitment.
    func monthReference(for weekDate: Date) -> (goals: Int, tasks: Int) {
        let list = period(level: "month", start: PlanCalendar.monthStart(weekDate), week: weekDate)
        return (list.goals.count, list.tasks.filter { !list.onWeek.contains($0.id) }.count)
    }

    func yearGoals(_ year: Int) -> [Goal] {
        goals.filter { $0.year == year && $0.status != "archived" && (domain == nil || $0.context == nil || $0.context == domain) }
            .sorted { ($0.sortOrder, $0.name) < ($1.sortOrder, $1.name) }
    }
}
