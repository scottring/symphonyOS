import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

// The signpost: one sign at a time, six kinds in a fixed order, in the person's own words.
@MainActor
struct SignpostTests {
    let me = UUID()
    let other = UUID()
    let g = UUID(), m = UUID(), w = UUID()
    let today = day(2026, 11, 10)

    private func row(_ title: String, first: Bool, done: Bool = false) -> DailyDay.Row {
        DailyDay.Row(id: UUID(), title: title, forGoal: nil, done: done, first: first)
    }

    private func task(_ title: String, user: UUID? = nil, context: String? = "personal", on date: Date? = nil,
                      created: Double = 0) -> SymphonyTask {
        let t = SymphonyTask(id: UUID(), userId: user ?? me, title: title, completed: false, scheduledFor: date,
                             context: context, notes: nil)
        t.createdAt = Date(timeIntervalSince1970: created)
        return t
    }

    /// Every kind true at once, each with its own title.
    private func everyKind() -> Signpost.Facts {
        var f = Signpost.Facts(today: today)
        f.rows = [row("Send the contractor the deposit", first: true)]
        f.tomorrowFirst = "Choose the tile"
        f.anyDay = .init(id: w, title: "Measure the bathroom window")
        f.monthGoal = .init(id: m, title: "Pick the tile and pay the deposit")
        f.ending = .init(horizon: .month, name: "November", lastDay: day(2026, 11, 30))
        f.noPiece = .init(id: g, title: "More slow weekends together")
        f.seasonWord = "fall"
        return f
    }

    // MARK: The rule

    @Test func theFirstTrueKindShows() {
        var f = Signpost.Facts(today: day(2026, 11, 10))
        f.noPiece = .init(id: g, title: "More slow weekends together"); f.seasonWord = "winter"
        #expect(Signpost.pick(f)?.kind == .noPiece)
        f.ending = .init(horizon: .month, name: "November", lastDay: day(2026, 11, 30));  #expect(Signpost.pick(f)?.kind == .periodEnds)
        f.monthGoal = .init(id: m, title: "Pick the tile and pay the deposit");           #expect(Signpost.pick(f)?.kind == .newWeek)
        f.anyDay = .init(id: w, title: "Measure the bathroom window"); f.weekCount = 1;   #expect(Signpost.pick(f)?.kind == .todayOpen)
        f.rows = [row("Send the contractor the deposit", first: true)];                  #expect(Signpost.pick(f)?.kind == .firstToday)
        f.rows = [row("Send the contractor the deposit", first: false, done: true)]; f.tomorrowFirst = "Choose the tile"
        let s = Signpost.pick(f)
        #expect(s?.kind == .dayDone); #expect(s?.title == DailyCopy.tomorrow("Choose the tile")); #expect(s?.target == .week(day(2026, 11, 11)))
    }

    @Test func eachKindSaysWhatItIsAndGoesWhereItPoints() {
        var f = everyKind()
        var put: Set<Signpost.Kind> = []
        func next() -> Signpost.Sign? { Signpost.pick(f, dismissed: put) }

        let first = next()
        #expect(first?.kind == .firstToday)
        #expect(first?.eyebrow == DailyCopy.firstTodaySign)
        #expect(first?.target == .light(f.rows[0].id))
        #expect(first?.seed == "firstToday:\(f.rows[0].id.uuidString.lowercased())")
        put.insert(.firstToday)

        // With a row still on the day, "Today is open" is not true; the next is.
        #expect(next()?.kind == .newWeek)
        f.rows = []
        let open = next()
        #expect(open?.kind == .todayOpen)
        #expect(open?.eyebrow == DailyCopy.todayOpen)
        #expect(open?.target == .week(today))
        #expect(open?.seed == "todayOpen:\(w.uuidString.lowercased())")
        put.insert(.todayOpen)

        let week = next()
        #expect(week?.kind == .newWeek)
        #expect(week?.eyebrow == DailyCopy.newWeek)
        #expect(week?.target == .walkDown(m, .month))
        put.insert(.newWeek)

        let ends = next()
        #expect(ends?.kind == .periodEnds)
        #expect(ends?.eyebrow == DailyCopy.periodEnds("November", lastDay: day(2026, 11, 30)))
        #expect(ends?.target == .page(.month, today))
        #expect(ends?.seed == "periodEnds:2026-11-30")
        put.insert(.periodEnds)

        let piece = next()
        #expect(piece?.kind == .noPiece)
        #expect(piece?.eyebrow == DailyCopy.noPiece("fall"))
        #expect(piece?.target == .walkDown(g, .year))
        #expect(piece?.seed == "noPiece:\(g.uuidString.lowercased())")
        put.insert(.noPiece)

        #expect(next() == nil)

        f.rows = [row("Send the contractor the deposit", first: false, done: true)]
        let done = Signpost.pick(f)
        #expect(done?.eyebrow == DailyCopy.dayDone)
        #expect(done?.seed == "dayDone:2026-11-11")
    }

    @Test func todayOpenNeedsAnEmptyDay() {
        var f = Signpost.Facts(today: today)
        f.anyDay = .init(id: w, title: "Measure the bathroom window"); f.weekCount = 1
        f.rows = [row("Call the tiler", first: false)]
        #expect(Signpost.pick(f) == nil)
        f.rows = []
        #expect(Signpost.pick(f)?.kind == .todayOpen)
    }

    @Test func aNewWeekOnlyWhileTheWeekHoldsNothing() {
        var f = Signpost.Facts(today: today)
        f.monthGoal = .init(id: m, title: "Pick the tile and pay the deposit")
        #expect(Signpost.pick(f)?.kind == .newWeek)
        f.weekCount = 1
        #expect(Signpost.pick(f) == nil)
    }

    @Test func everyTitleIsThePersonsOwn() {
        var f = everyKind()
        var put: Set<Signpost.Kind> = []
        var seen: [Signpost.Kind: String] = [:]
        while let s = Signpost.pick(f, dismissed: put) {
            seen[s.kind] = s.title
            put.insert(s.kind)
            if s.kind == .firstToday { f.rows = [] }
        }
        #expect(seen[.firstToday]?.contains("Send the contractor the deposit") == true)
        #expect(seen[.todayOpen]?.contains("Measure the bathroom window") == true)
        #expect(seen[.newWeek]?.contains("Pick the tile and pay the deposit") == true)
        #expect(seen[.periodEnds] == DailyCopy.lookBackBeforeItTurns)
        #expect(seen[.noPiece]?.contains("More slow weekends together") == true)

        f.rows = [row("Send the contractor the deposit", first: false, done: true)]
        #expect(Signpost.pick(f)?.title.contains("Choose the tile") == true)

        // Long and odd titles stay whole: the sign never trims or rewords them.
        let long = String(repeating: "Abcdefghij", count: 6) + " " + String(repeating: "x", count: 140)
        var odd = Signpost.Facts(today: today)
        odd.noPiece = .init(id: g, title: long)
        #expect(Signpost.pick(odd)?.title == long)
    }

    @Test func noKindNoSign() {
        #expect(Signpost.pick(Signpost.Facts(today: today)) == nil)
        // A day with rows, none done and none first, signs nothing either.
        var f = Signpost.Facts(today: today)
        f.rows = [row("Call the tiler", first: false)]
        #expect(Signpost.pick(f) == nil)
    }

    @Test func dayDoneWithNothingTomorrow() {
        var f = Signpost.Facts(today: today)
        f.rows = [row("Send the contractor the deposit", first: true, done: true)]
        let s = Signpost.pick(f)
        #expect(s?.kind == .dayDone)
        #expect(s?.eyebrow == nil)
        #expect(s?.title == WalkCopy.thatsTheDay)
        #expect(s?.target == .week(day(2026, 11, 11)))
    }

    @Test func aSignPutAwayLetsTheNextShow() {
        var f = Signpost.Facts(today: today)
        f.rows = [row("Send the contractor the deposit", first: true)]
        f.noPiece = .init(id: g, title: "More slow weekends together"); f.seasonWord = "fall"
        #expect(Signpost.pick(f)?.kind == .firstToday)
        #expect(Signpost.pick(f, dismissed: [.firstToday])?.kind == .noPiece)
        #expect(Signpost.pick(f, dismissed: [.firstToday, .noPiece]) == nil)
    }

    @Test func aFollowedSignGivesWayToTheNext() throws {
        let defaults = UserDefaults(suiteName: "SignpostTests.\(UUID())")!
        let memory = SignpostMemory(defaults: defaults)
        var f = Signpost.Facts(today: today)
        f.anyDay = .init(id: w, title: "Measure the bathroom window"); f.weekCount = 1
        f.noPiece = .init(id: g, title: "More slow weekends together"); f.seasonWord = "fall"

        // Following "Today is open" to the week puts it away, so Today shows the next true kind.
        let open = try #require(Signpost.pick(f, dismissed: memory.dismissed(for: me, on: today)))
        #expect(open.kind == .todayOpen)
        #expect(open.putAwayWhenFollowed)
        memory.dismiss(open.kind, for: me, on: today)
        let after = Signpost.pick(f, dismissed: memory.dismissed(for: me, on: today))
        #expect(after?.kind == .noPiece)
        #expect(after?.putAwayWhenFollowed == true)

        // Every sign that takes you somewhere is put away by following it; "First, today" is not.
        var all = everyKind()
        var put: Set<Signpost.Kind> = []
        var follows: [Signpost.Kind: Bool] = [:]
        while let s = Signpost.pick(all, dismissed: put) {
            follows[s.kind] = s.putAwayWhenFollowed
            put.insert(s.kind)
            if s.kind == .firstToday { all.rows = [] }
        }
        all.rows = [row("Send the contractor the deposit", first: false, done: true)]
        follows[.dayDone] = Signpost.pick(all)?.putAwayWhenFollowed
        #expect(follows == [.dayDone: true, .firstToday: false, .todayOpen: true, .newWeek: true,
                            .periodEnds: true, .noPiece: true])
    }

    @Test func theKindsStandInTheirFixedOrder() {
        #expect(Signpost.Kind.allCases == [.dayDone, .firstToday, .todayOpen, .newWeek, .periodEnds, .noPiece])
    }

    // MARK: VoiceOver

    @Test func theLabelReadsEyebrowTitleThenWhatATapDoes() throws {
        for kind in Signpost.Kind.allCases {
            #expect(!DailyCopy.signHint(kind.rawValue).isEmpty, "no hint keyed by \(kind.rawValue)")
        }
        var f = Signpost.Facts(today: today)
        f.noPiece = .init(id: g, title: "More slow weekends together"); f.seasonWord = "fall"
        let s = try #require(Signpost.pick(f))
        let eyebrow = try #require(s.eyebrow)
        let label = s.label
        let a = try #require(label.range(of: eyebrow)), b = try #require(label.range(of: s.title)),
            c = try #require(label.range(of: DailyCopy.signHint("noPiece")))
        #expect(a.upperBound <= b.lowerBound && b.upperBound <= c.lowerBound)

        f = Signpost.Facts(today: today)
        f.rows = [row("Send the contractor the deposit", first: false, done: true)]
        let bare = try #require(Signpost.pick(f))
        #expect(bare.label.hasPrefix(WalkCopy.thatsTheDay))
        #expect(bare.label.contains(DailyCopy.signHint("dayDone")))
    }

    // MARK: Memory

    @Test func dismissalEndsWithTheDay() {
        let memory = SignpostMemory(defaults: UserDefaults(suiteName: "SignpostTests.\(UUID())")!)
        memory.dismiss(.firstToday, for: me, on: day(2026, 11, 10))
        memory.dismiss(.noPiece, for: me, on: PlanCalendar.calendar.date(byAdding: .hour, value: 20, to: today)!)
        #expect(memory.dismissed(for: me, on: day(2026, 11, 10)) == [.firstToday, .noPiece])
        #expect(memory.dismissed(for: me, on: day(2026, 11, 11)).isEmpty)
        // A new day's first put-away starts that day's set afresh.
        memory.dismiss(.todayOpen, for: me, on: day(2026, 11, 11))
        #expect(memory.dismissed(for: me, on: day(2026, 11, 11)) == [.todayOpen])
    }

    @Test func dismissalIsPerPerson() {
        let defaults = UserDefaults(suiteName: "SignpostTests.\(UUID())")!
        let memory = SignpostMemory(defaults: defaults)
        memory.dismiss(.firstToday, for: me, on: today)
        #expect(memory.dismissed(for: me, on: today) == [.firstToday])
        #expect(memory.dismissed(for: other, on: today).isEmpty)
        #expect(memory.dismissed(for: nil, on: today).isEmpty)
        #expect(defaults.object(forKey: "daily.signpost.\(me.uuidString.lowercased())") != nil)
        #expect(defaults.object(forKey: "daily.signpost.\(other.uuidString.lowercased())") == nil)
    }

    // MARK: What ends

    @Test func theLastThreeDays() {
        #expect(Signpost.ending(today: day(2026, 11, 27), seasons: nil) == nil)
        for d in [28, 29, 30] {
            #expect(Signpost.ending(today: day(2026, 11, d), seasons: nil)
                    == .init(horizon: .month, name: "November", lastDay: day(2026, 11, 30)))
        }
        // The year's last days name December, not the year (ruling 2).
        #expect(Signpost.ending(today: day(2026, 12, 28), seasons: nil) == nil)
        for d in [29, 30, 31] {
            #expect(Signpost.ending(today: day(2026, 12, d), seasons: nil)
                    == .init(horizon: .month, name: "December", lastDay: day(2026, 12, 31)))
        }
        // A household season ending 14 March passes without its own sign; March's end still has one.
        let seasons = [SeasonBoundary(name: "Spring", month: 3, day: 15), SeasonBoundary(name: "Summer", month: 6, day: 15),
                       SeasonBoundary(name: "Fall", month: 9, day: 15), SeasonBoundary(name: "Winter", month: 12, day: 15)]
        #expect(PlanCalendar.season(containing: day(2027, 3, 12), boundaries: seasons).lastDay == day(2027, 3, 14))
        #expect(Signpost.ending(today: day(2027, 3, 12), seasons: seasons) == nil)
        #expect(Signpost.ending(today: day(2027, 3, 29), seasons: seasons)
                == .init(horizon: .month, name: "March", lastDay: day(2027, 3, 31)))
        // February's end, in a leap year and not.
        #expect(Signpost.ending(today: day(2028, 2, 27), seasons: nil)?.lastDay == day(2028, 2, 29))
        #expect(Signpost.ending(today: day(2027, 2, 26), seasons: nil)?.lastDay == day(2027, 2, 28))
        #expect(Signpost.ending(today: day(2027, 2, 25), seasons: nil) == nil)
    }

    // MARK: The hand

    @Test func theHandIsFixedAndOpposed() {
        let a = Signpost.hand("noPiece:\(g.uuidString.lowercased())")
        let b = Signpost.hand("noPiece:\(g.uuidString.lowercased())")
        #expect(a.lean == b.lean && a.tilt == b.tilt)
        var leans = Set<Bool>()
        for i in 0..<50 {
            let (lean, tilt) = Signpost.hand("todayOpen:\(UUID().uuidString.lowercased())-\(i)")
            #expect((0.5...1.5).contains(abs(lean)))
            #expect((0.7...1.7).contains(abs(tilt)))
            #expect(lean * tilt < 0)
            leans.insert(lean > 0)
        }
        #expect(leans == [true, false])   // the post leans both ways across signs
    }

    // MARK: Facts from the store

    @Test func factsReadTheDayTheWeekAndTheWalk() {
        let periods = WalkPeriods.pick(now: today)
        let ws = PlanCalendar.weekStart(today)

        let year = Goal(id: UUID(), userId: me, name: "Finish the bathroom", year: periods.year)
        year.context = "personal"
        let bare = Goal(id: UUID(), userId: me, name: "More slow weekends together", year: periods.year)
        bare.context = "personal"; bare.sortOrder = 1
        let season = task("Pick the tiles"); season.bucket = "quarter"; season.seasonStart = periods.season.start
        season.goalId = year.id
        let month = task("Pick the tile and pay the deposit"); month.bucket = "month"
        month.monthStart = periods.monthStart; month.sourceId = season.id
        let anyDay = task("Measure the bathroom window", created: 2)
        let held = TaskCommitment(taskId: anyDay.id, level: "week", periodStart: ws)
        let tomorrow = task("Choose the tile", on: PlanCalendar.addDays(today, 1))
        let todays = task("Send the contractor the deposit", on: today)
        let focus = TaskFocus(taskId: todays.id, userId: me, date: today)

        let f = Signpost.facts(tasks: [season, month, anyDay, tomorrow, todays], goals: [year, bare], focus: [focus],
                               commitments: [held], today: today, me: me, seasons: nil)
        #expect(f.today == today)
        #expect(f.rows.map(\.title) == ["Send the contractor the deposit"])
        #expect(f.rows.first?.first == true)
        #expect(f.tomorrowFirst == "Choose the tile")
        #expect(f.anyDay == .init(id: anyDay.id, title: "Measure the bathroom window"))
        #expect(f.weekCount == 3)   // the held one with no day, tomorrow's and today's
        #expect(f.monthGoal == .init(id: month.id, title: "Pick the tile and pay the deposit"))
        #expect(f.noPiece == .init(id: bare.id, title: "More slow weekends together"))
        #expect(f.seasonWord == periods.seasonWord)
        #expect(f.ending == nil)
        #expect(Signpost.pick(f)?.kind == .firstToday)

        // Near November's end the sign needs something of mine in November to look back at.
        let november = task("Clear the attic"); november.bucket = "month"; november.monthStart = day(2026, 11, 1)
        let late = Signpost.facts(tasks: [november], goals: [], focus: [], commitments: [], today: day(2026, 11, 29),
                                  me: me, seasons: nil)
        #expect(late.ending == Signpost.ending(today: day(2026, 11, 29), seasons: nil))
        #expect(late.ending != nil)
    }

    /// Final review (minor): "November ends · Look back before it turns" only for a month that holds
    /// one of my goals: never for an empty month, no plan at all, or only someone else's goal.
    @Test func theMonthEndsSignNeedsSomethingInTheMonth() {
        let late = day(2026, 11, 29)
        let empty = Signpost.facts(tasks: [], goals: [], focus: [], commitments: [], today: late, me: me, seasons: nil)
        #expect(empty.ending == nil)
        let theirs = task("Their month goal", user: other); theirs.bucket = "month"; theirs.monthStart = day(2026, 11, 1)
        let december = task("Plan the holidays"); december.bucket = "month"; december.monthStart = day(2026, 12, 1)
        let weekOnly = task("Call the tiler", on: late)
        let notMine = Signpost.facts(tasks: [theirs, december, weekOnly], goals: [], focus: [], commitments: [],
                                     today: late, me: me, seasons: nil)
        #expect(notMine.ending == nil)
        let mine = task("Clear the attic"); mine.bucket = "month"; mine.monthStart = day(2026, 11, 1); mine.completed = true
        let held = Signpost.facts(tasks: [mine], goals: [], focus: [], commitments: [], today: late, me: me, seasons: nil)
        #expect(held.ending?.name == "November")
    }

    @Test func theWeekCountsDoneAndDatedTasksOnce() {
        let ws = PlanCalendar.weekStart(today)
        let friday = PlanCalendar.weekDays(ws)[5]
        let done = task("Book the plumber"); done.completed = true
        let doneHeld = TaskCommitment(taskId: done.id, level: "week", periodStart: ws, status: "done")
        let dated = task("Call the tiler", on: friday)
        let both = task("Order grout", on: friday)
        let bothHeld = TaskCommitment(taskId: both.id, level: "week", periodStart: ws)
        let nextWeek = task("Seal the grout", on: PlanCalendar.addDays(ws, 7))

        let f = Signpost.facts(tasks: [done, dated, both, nextWeek], goals: [], focus: [],
                               commitments: [doneHeld, bothHeld], today: today, me: me, seasons: nil)
        #expect(f.weekCount == 3)
        #expect(f.anyDay == nil)   // done, or with a day
    }

    @Test func factsReadOnlyMyPersonalRows() {
        let periods = WalkPeriods.pick(now: today)
        let ws = PlanCalendar.weekStart(today)
        let bare = Goal(id: UUID(), userId: me, name: "More slow weekends together", year: periods.year)
        bare.context = "personal"
        let base: [SymphonyTask] = []

        let theirs = task("Their month goal", user: other); theirs.bucket = "month"; theirs.monthStart = periods.monthStart
        let theirYear = Goal(id: UUID(), userId: other, name: "Their year", year: periods.year)
        theirYear.context = "personal"; theirYear.sortOrder = -1
        let family = task("Family errand", context: "family", on: today)
        let familyWeek = task("Family week task", context: "family")
        let familyHeld = TaskCommitment(taskId: familyWeek.id, level: "week", periodStart: ws)
        let theirToday = task("Their today", user: other, on: today)

        let mine = Signpost.facts(tasks: base, goals: [bare], focus: [], commitments: [], today: today, me: me,
                                  seasons: nil)
        let noisy = Signpost.facts(tasks: base + [theirs, family, familyWeek, theirToday], goals: [bare, theirYear],
                                   focus: [TaskFocus(taskId: family.id, userId: me, date: today)],
                                   commitments: [familyHeld], today: today, me: me, seasons: nil)
        #expect(noisy == mine)
        #expect(mine.weekCount == 0 && mine.monthGoal == nil && mine.rows.isEmpty && mine.anyDay == nil)
        #expect(mine.noPiece?.id == bare.id)
    }
}
