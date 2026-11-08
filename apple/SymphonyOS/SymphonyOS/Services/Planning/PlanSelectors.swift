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
    /// inside their parent's card and never list on their own. A task let go
    /// (`dismissed_at`) is on no planning list.
    var lensTasks: [SymphonyTask] {
        tasks.filter { $0.parentTaskId == nil && $0.dismissedAt == nil && (domain == nil || $0.context == domain) }
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

    /// The occurrence MOVED onto `date` from another day, if any.
    func instanceMovedIn(for routine: Routine, on date: Date) -> ActionableInstance? {
        instances.first {
            $0.entityType == "routine" && $0.entityId.lowercased() == routine.id.uuidString.lowercased()
                && $0.status == "deferred" && PlanCalendar.sameDay($0.deferredTo, date) && !PlanCalendar.sameDay($0.date, date)
        }
    }

    /// The time this routine holds on `date` (web resolveRoutineTime): a move
    /// or same-day retime wins over the rule; nil is untimed.
    func time(of routine: Routine, on date: Date) -> Date? {
        let i = instanceMovedIn(for: routine, on: date) ?? instance(for: routine, on: date)
        return RoutineRules.time(timeOfDay: routine.timeOfDay, instance: i, on: date)
    }

    /// Is this routine's occurrence chosen for `date`? Any occurrence whose
    /// `planned_on` is that day counts — one moved there as a day, too — but
    /// not a skipped one (web chosenUntimedOn).
    func isChosen(_ routine: Routine, on date: Date) -> Bool {
        instances.contains {
            $0.entityType == "routine" && $0.entityId.lowercased() == routine.id.uuidString.lowercased()
                && $0.status != "skipped" && PlanCalendar.sameDay($0.plannedOn, date)
                && ($0.deferredTo == nil || PlanCalendar.sameDay($0.deferredTo, date))
        }
    }

    /// Does the routine keep a row on the day without being chosen?
    /// Timed, or pinned as a tracked obligation.
    static func isAnchored(_ r: Routine) -> Bool { r.timeOfDay != nil || r.pinToTimeline }

    /// Routines that show on `date`'s list: due and anchored, or chosen.
    func dayRoutines(on date: Date) -> [Routine] {
        let ctx = routineContext(on: date)
        return routines.filter { r in
            // Moved to another day: not on this one (web routinesForDate).
            if RoutineRules.movedAway(instance(for: r, on: date), from: date) { return false }
            if isChosen(r, on: date) { return RoutineRules.isActive(r) && (domain == nil || r.context == domain) }
            // Timed by its rule, pinned, or placed at a time on this day.
            return (Self.isAnchored(r) || time(of: r, on: date) != nil) && RoutineRules.shows(r, on: date, ctx)
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
        // A goal or parent on the week stands for its open steps (2026-11-07).
        let held = lensTasks.filter { !$0.completed && holds($0, level: "week", periodStart: week, byTask: byTask) }
        return stepsInstead(held).filter { t in
            guard !t.completed, t.scheduledFor == nil, !isFocused(t, on: date) else { return false }
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

    /// What is placed on a later day of `date`'s week (the web's "Later this
    /// week" on Today's week sheet, 2026-11-07): its + brings it to `date`.
    func laterThisWeek(after date: Date) -> [SymphonyTask] {
        let day = PlanCalendar.day(date)
        return weekLines(date).compactMap { line in
            guard let d = line.day, d > day, !isFocused(line.task, on: date) else { return nil }
            return line.task
        }
        .sorted { ($0.scheduledFor ?? .distantFuture) < ($1.scheduledFor ?? .distantFuture) }
    }

    // MARK: Week

    /// A goal or parent on the week stands for its open steps (Scott,
    /// 2026-11-07: "we want the subgoals to show, not the top level"; the
    /// web's lib/planning/weekSteps.ts). One with no open step shows itself.
    func stepsInstead(_ listed: [SymphonyTask]) -> [SymphonyTask] {
        func open(_ t: SymphonyTask) -> Bool { !t.completed && t.dismissedAt == nil }
        var seen = Set<UUID>()
        var out: [SymphonyTask] = []
        for t in listed {
            let steps = t.completed ? [] : tasks.filter { s in
                s.id != t.id && open(s) && (s.parentTaskId == t.id || (t.isGoal && s.goalTaskId == t.id))
            }.sorted { $0.createdAt < $1.createdAt }
            for x in (steps.isEmpty ? [t] : steps) where seen.insert(x.id).inserted { out.append(x) }
        }
        return out
    }

    /// One line on the week's list: the task, and its day if it has one.
    struct WeekLine: Identifiable {
        let task: SymphonyTask
        let day: Date?
        var id: UUID { task.id }
    }

    /// The Week's one list (Scott, 2026-11-07: "keep the week list, and if
    /// we need to put it on a day, copy it over to that day"): what the week
    /// holds and what is dated in it, open, in the order written. A task given
    /// a day keeps its place, the day its mark; it is the same task on Today.
    func weekLines(_ start: Date) -> [WeekLine] {
        let ws = PlanCalendar.weekStart(start)
        let days = PlanCalendar.weekDays(ws)
        let byTask = commitmentsByTask
        let held = lensTasks.filter { !$0.completed && holds($0, level: "week", periodStart: ws, byTask: byTask) }
        let dated = lensTasks.filter { t in !t.completed && days.contains { isDated(t, on: $0) } }
        var seen = Set<UUID>()
        let base = (held + dated).filter { seen.insert($0.id).inserted }
        return stepsInstead(base)
            .filter { !$0.completed }
            .sorted { $0.createdAt < $1.createdAt }
            .map { t in WeekLine(task: t, day: days.first { isDated(t, on: $0) }) }
    }

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

    /// One period's sheet above the week (paper-style horizons, 2026-11-04):
    /// what was written for it, as one list (no goal/task split above the
    /// week), oldest first, and how many of its lines are done. Nothing here
    /// says what an item is for or where else it sits.
    struct Sheet {
        var open: [SymphonyTask]
        var doneCount: Int
    }

    func sheet(level: String, start: Date) -> Sheet {
        let byTask = commitmentsByTask
        let held = lensTasks.filter { holds($0, level: level, periodStart: start, byTask: byTask) }
        return Sheet(open: held.filter { !$0.completed }.sorted { $0.createdAt < $1.createdAt },
                     doneCount: held.filter(\.completed).count)
    }

    /// A year's goals still open (the Year page's own list; last year's, the
    /// sheet above the Year).
    func openYearGoals(_ year: Int) -> [Goal] {
        yearGoals(year).filter { $0.status != "completed" }
    }

    func doneYearGoals(_ year: Int) -> Int {
        yearGoals(year).filter { $0.status == "completed" }.count
    }

    func yearGoals(_ year: Int) -> [Goal] {
        goals.filter { $0.year == year && $0.status != "archived" && (domain == nil || $0.context == nil || $0.context == domain) }
            .sorted { ($0.sortOrder, $0.name) < ($1.sortOrder, $1.name) }
    }
}
