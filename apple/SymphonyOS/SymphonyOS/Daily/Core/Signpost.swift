import Foundation

/// The one sign at the top of Today. Six kinds stand in a fixed order and the first
/// true one that was not put away today shows; with none true, no sign. Every title
/// is the person's own task or goal title; only the eyebrow is Symphony's (`DailyCopy`).
enum Signpost {
    /// The fixed order. Raw values are the keys of `DailyCopy.signHint`.
    enum Kind: String, CaseIterable, Codable { case dayDone, firstToday, todayOpen, newWeek, periodEnds, noPiece }

    /// Where a tap goes: the week on a day, a row of Today lit, a walk down from a goal, a page.
    enum Target: Equatable { case week(Date), light(UUID), walkDown(UUID, WalkLevel), page(Horizon, Date) }

    struct Named: Equatable { let id: UUID; let title: String }

    struct Ending: Equatable { let horizon: Horizon; let name: String; let lastDay: Date }

    /// What the rule reads, gathered by `facts` (or set by hand in tests).
    struct Facts: Equatable {
        var today: Date
        /// Today's rows.
        var rows: [DailyDay.Row] = []
        var tomorrowFirst: String?
        /// The week's first open task with no day.
        var anyDay: Named?
        /// Every task on this week, dated or not, done or not.
        var weekCount = 0
        /// The first open month goal of the walk's month.
        var monthGoal: Named?
        var ending: Ending?
        /// The first year goal with nothing under it this season.
        var noPiece: Named?
        var seasonWord = ""
    }

    struct Sign: Equatable {
        let kind: Kind
        let eyebrow: String?
        let title: String
        let target: Target
        /// The sign's identity for its hand: "<kind>:<id or yyyy-mm-dd>".
        let seed: String

        /// VoiceOver: the eyebrow, the title, then what a tap does.
        var label: String {
            [eyebrow, title, DailyCopy.signHint(kind.rawValue)]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .map { $0.last.map { ".!?".contains($0) } == true ? $0 : $0 + "." }
                .joined(separator: " ")
        }

        /// VoiceOver, where the sign cannot be touched (the half-open display): its eyebrow and
        /// its title, and not what a tap would do.
        var stillLabel: String {
            [eyebrow, title]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .map { $0.last.map { ".!?".contains($0) } == true ? $0 : $0 + "." }
                .joined(separator: " ")
        }

        /// Following a sign that takes you somewhere puts its kind away for the day, so
        /// the next true kind shows on coming back (ruling 22). "First, today" stays: it
        /// only lights its row, and goes when that task is done.
        var putAwayWhenFollowed: Bool {
            if case .light = target { return false }
            return true
        }
    }

    // MARK: The rule

    /// The first true kind, in the fixed order, that is not in `dismissed`.
    static func pick(_ f: Facts, dismissed: Set<Kind> = []) -> Sign? {
        let today = PlanCalendar.day(f.today)
        for kind in Kind.allCases where !dismissed.contains(kind) {
            if let sign = sign(kind, f, today: today) { return sign }
        }
        return nil
    }

    private static func sign(_ kind: Kind, _ f: Facts, today: Date) -> Sign? {
        func key(_ id: UUID) -> String { "\(kind.rawValue):\(id.uuidString.lowercased())" }
        func key(_ day: Date) -> String { "\(kind.rawValue):\(PlanCalendar.ymd(day))" }

        switch kind {
        case .dayDone:
            guard !f.rows.isEmpty, f.rows.allSatisfy(\.done) else { return nil }
            let tomorrow = PlanCalendar.addDays(today, 1)
            if let first = f.tomorrowFirst {
                return Sign(kind: kind, eyebrow: DailyCopy.dayDone, title: DailyCopy.tomorrow(first),
                            target: .week(tomorrow), seed: key(tomorrow))
            }
            return Sign(kind: kind, eyebrow: nil, title: WalkCopy.thatsTheDay, target: .week(tomorrow),
                        seed: key(tomorrow))
        case .firstToday:
            guard let row = f.rows.first(where: { $0.first && !$0.done }) else { return nil }
            return Sign(kind: kind, eyebrow: DailyCopy.firstTodaySign, title: row.title, target: .light(row.id),
                        seed: key(row.id))
        case .todayOpen:
            guard f.rows.isEmpty, let task = f.anyDay else { return nil }
            return Sign(kind: kind, eyebrow: DailyCopy.todayOpen, title: task.title, target: .week(today),
                        seed: key(task.id))
        case .newWeek:
            guard f.weekCount == 0, let goal = f.monthGoal else { return nil }
            return Sign(kind: kind, eyebrow: DailyCopy.newWeek, title: goal.title, target: .walkDown(goal.id, .month),
                        seed: key(goal.id))
        case .periodEnds:
            guard let end = f.ending else { return nil }
            return Sign(kind: kind, eyebrow: DailyCopy.periodEnds(end.name, lastDay: end.lastDay),
                        title: DailyCopy.lookBackBeforeItTurns, target: .page(end.horizon, today),
                        seed: key(end.lastDay))
        case .noPiece:
            guard let goal = f.noPiece else { return nil }
            return Sign(kind: kind, eyebrow: DailyCopy.noPiece(f.seasonWord), title: goal.title,
                        target: .walkDown(goal.id, .year), seed: key(goal.id))
        }
    }

    // MARK: What ends

    /// The month whose last day is today or within the next two days (ruling 2: the sign
    /// always names the month, whatever else ends that day; a season's or a year's end
    /// has no sign of its own). `seasons` is the household's boundaries, kept so callers
    /// pass the one set they read every period from; the month's end does not depend on it.
    static func ending(today: Date, seasons: [SeasonBoundary]?) -> Ending? {
        let today = PlanCalendar.day(today)
        let lastDay = PlanCalendar.addDays(PlanCalendar.nextMonthStart(today), -1)
        let within = (0...2).contains { PlanCalendar.sameDay(PlanCalendar.addDays(today, $0), lastDay) }
        guard within else { return nil }
        return Ending(horizon: .month, name: DailyCopy.monthName(today), lastDay: lastDay)
    }

    // MARK: Facts from the store

    /// Reads only the signed-in person's own personal rows (`DailyDay.mine`).
    static func facts(tasks: [SymphonyTask], goals: [Goal], focus: [TaskFocus], commitments: [TaskCommitment],
                      today: Date, me: UUID, seasons: [SeasonBoundary]?) -> Facts {
        let today = PlanCalendar.day(today)
        let mine = DailyDay.mine(tasks, me: me)

        let plan = PlanSnapshot(tasks: mine, commitments: commitments, focus: focus, routines: [], instances: [],
                                userId: me, domain: nil)
        let ws = PlanCalendar.weekStart(today)
        let days = PlanCalendar.weekDays(ws)
        let anyDay = plan.week(ws).anyDay.min(by: PlanSnapshot.inManualOrder)
        let dated = plan.lensTasks.filter { t in !t.isGoal && days.contains { plan.isDated(t, on: $0) } }
        let onTheWeek = Set(plan.weekList(ws).map(\.id)).union(dated.map(\.id))

        // The current month, season and year first when they hold a goal of mine (`DailyPeriods.current`).
        let periods = DailyPeriods.current(today: today, seasons: seasons, goals: goals, tasks: mine, me: me)
        let items = WalkLoad.items(goals: goals, tasks: mine, periods: periods, me: me, planted: [])
        let monthGoal = items.first { $0.level == .month && !$0.done }
        let noPiece = WalkEnding.nextToWalk(items)

        var f = Facts(today: today)
        f.rows = DailyDay.rows(tasks: mine, goals: goals, focus: focus, today: today, me: me)
        f.tomorrowFirst = DailyDay.tomorrowFirst(tasks: mine, today: today, me: me)?.title
        f.anyDay = anyDay.map { Named(id: $0.id, title: $0.title) }
        f.weekCount = onTheWeek.count
        f.monthGoal = monthGoal.map { Named(id: $0.id, title: $0.title) }
        // "‹Month› ends · Look back before it turns" only when that month holds something of mine to
        // look back at: one of my goals for it (the Month page the sign opens shows them).
        let thisMonth = MountainPage.periods(level: .month, selected: today, today: today, seasons: seasons)
        let monthHolds = WalkLoad.items(goals: goals, tasks: mine, periods: thisMonth, me: me, planted: [])
            .contains { $0.level == .month }
        f.ending = monthHolds ? ending(today: today, seasons: seasons) : nil
        f.noPiece = noPiece.map { Named(id: $0.id, title: $0.title) }
        f.seasonWord = periods.seasonWord
        return f
    }

    // MARK: The hand

    /// Degrees, fixed by the seed: the post leans 0.5…1.5 either way; the plank tilts 0.7…1.7 the other way.
    static func hand(_ seed: String) -> (lean: Double, tilt: Double) {
        let h = WalkFooting.hand(seed, "sign.lean")
        let sign: Double = h < 0 ? -1 : 1
        let lean = sign * (0.5 + abs(h))
        let tilt = -sign * (0.7 + abs(WalkFooting.hand(seed, "sign.tilt")))
        return (lean, tilt)
    }
}

/// Which kinds were put away, per person, for one day: `UserDefaults` key
/// `daily.signpost.<user id lowercased>`, holding the day (`PlanCalendar.ymd`) and the
/// kinds' raw values. Another day reads as nothing put away.
struct SignpostMemory {
    var defaults: UserDefaults = .standard

    private static let dayKey = "day", kindsKey = "kinds"

    private func key(_ userId: UUID?) -> String {
        "daily.signpost.\(userId?.uuidString.lowercased() ?? "none")"
    }

    func dismissed(for userId: UUID?, on day: Date) -> Set<Signpost.Kind> {
        guard let stored = defaults.dictionary(forKey: key(userId)),
              stored[Self.dayKey] as? String == PlanCalendar.ymd(day),
              let kinds = stored[Self.kindsKey] as? [String] else { return [] }
        return Set(kinds.compactMap(Signpost.Kind.init(rawValue:)))
    }

    func dismiss(_ kind: Signpost.Kind, for userId: UUID?, on day: Date) {
        let kinds = dismissed(for: userId, on: day).union([kind])
        defaults.set([Self.dayKey: PlanCalendar.ymd(day),
                      Self.kindsKey: Signpost.Kind.allCases.filter(kinds.contains).map(\.rawValue)],
                     forKey: key(userId))
    }

    /// Nothing put away (a demo started over: `DemoReset`).
    func forget(for userId: UUID?) { defaults.removeObject(forKey: key(userId)) }
}
