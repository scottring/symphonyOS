import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

// The week by day for the light pages: today to the week's end, past days folded to one
// line, nothing unfinished lost, Any day last, and where a task may move.
@MainActor
struct DailyWeekTests {
    let me = UUID()
    let other = UUID()
    let sunday = day(2026, 11, 8)
    let today = day(2026, 11, 10)

    private func task(_ title: String, user: UUID? = nil, context: String? = "personal", on date: Date? = nil,
                      done: Bool = false, order: Int? = nil, created: Double = 0) -> SymphonyTask {
        let t = SymphonyTask(id: UUID(), userId: user ?? me, title: title, completed: done, scheduledFor: date,
                             context: context, notes: nil)
        t.sortOrder = order
        t.createdAt = Date(timeIntervalSince1970: created)
        return t
    }

    private func held(_ t: SymphonyTask, on week: Date, status: String = "open") -> TaskCommitment {
        TaskCommitment(taskId: t.id, level: "week", periodStart: week, status: status)
    }

    private func event(_ title: String, at start: Date?, allDay: Bool = false,
                       type: TimelineItem.ItemType = .event) -> TimelineItem {
        TimelineItem(id: title, type: type, title: title, startTime: start, isAllDay: allDay,
                     completed: false, context: nil, entityId: UUID())
    }

    private func make(_ tasks: [SymphonyTask], goals: [Goal] = [], commitments: [TaskCommitment] = [],
                      events: @escaping (Date) -> [TimelineItem] = { _ in [] },
                      weekStart: Date? = nil, today: Date? = nil) -> DailyWeek.Week {
        DailyWeek.make(tasks: tasks, goals: goals, commitments: commitments, focus: [], events: events,
                       weekStart: weekStart ?? sunday, today: today ?? self.today, me: me)
    }

    private func titles(_ d: DailyWeek.Day?) -> [String] {
        (d?.lines ?? []).map { line in
            switch line {
            case let .event(_, _, title): "event:\(title)"
            case let .task(row): row.title
            case .open: "open"
            }
        }
    }

    private func on(_ week: DailyWeek.Week, _ date: Date) -> DailyWeek.Day? {
        week.days.first { $0.date.map { PlanCalendar.sameDay($0, date) } ?? false }
    }

    @Test func daysRunFromTodayToTheWeeksEnd() {
        let week = make([])
        #expect(week.days.map(\.label) == ["TUE", "WED", "THU", "FRI", "SAT"])
        #expect(week.days.map(\.number) == ["10", "11", "12", "13", "14"])
        #expect(week.days.map(\.isToday) == [true, false, false, false, false])
        #expect(week.start == sunday)
        #expect(week.range == DailyCopy.weekRange(sunday))
        #expect(week.eyebrow == DailyCopy.weekEyebrow(sunday, today: today))

        // A Monday week start runs to Sunday (finding 15).
        let monday = make([], weekStart: day(2026, 11, 9))
        #expect(monday.days.map(\.label) == ["TUE", "WED", "THU", "FRI", "SAT", "SUN"])
        #expect(monday.days.last?.number == "15")
        #expect(monday.past == nil)                                    // nothing behind it: no fold
    }

    @Test func pastDaysFoldToOneLine() {
        let a = task("Return the library books", on: sunday, done: true)
        let b = task("Book the plumber", on: day(2026, 11, 9), done: true, order: 0)
        let c = task("Measure the window", on: day(2026, 11, 9), done: true, order: 1)
        let open = task("Call the tiler", on: day(2026, 11, 9), order: 2)
        let todayDone = task("Water the plants", on: today, done: true)
        let week = make([a, b, c, open, todayDone])

        #expect(week.past?.label == "Sunday and Monday")
        #expect(week.past?.doneLine == DailyCopy.done(3))
        #expect(week.past?.days.map(\.label) == ["SUN", "MON"])
        #expect(titles(week.past?.days.last) == ["Book the plumber", "Measure the window", "Call the tiler"])
        // A day still open this week sits in its own day, not among the earlier rows.
        #expect(week.past?.earlier.isEmpty == true)
        #expect(week.days.first?.isToday == true)
        #expect(titles(week.days.first) == ["Water the plants"])
    }

    @Test func earlierOpenTasksWaitInTheFold() {
        let monday = task("Book the plumber", on: day(2026, 11, 9), done: true)
        let friday = task("Send the deposit", on: day(2026, 11, 6))
        let doneFriday = task("Pick up the parcel", on: day(2026, 11, 6), done: true)
        let lastWeek = day(2026, 11, 1)
        let left = task("Measure the bathroom window")                // left on last week with no day
        let carried = task("Order the grout")                          // last week's, now on this one
        let commitments = [held(left, on: lastWeek), held(carried, on: lastWeek, status: "carried"),
                           held(carried, on: sunday)]
        let tasks = [monday, friday, doneFriday, left, carried]
        let week = make(tasks, commitments: commitments)

        let earlier = week.past?.earlier.map(\.title) ?? []
        #expect(earlier.contains("Send the deposit"))
        #expect(earlier.contains("Measure the bathroom window"))
        #expect(!earlier.contains("Pick up the parcel"))
        #expect(!earlier.contains("Order the grout"))
        #expect(week.past?.doneLine == DailyCopy.done(1))               // the earlier rows are never counted
        #expect(week.past?.label == "Sunday and Monday")
        #expect(week.days.last.map(titles) == ["Order the grout"])

        // On the week's first day, with only earlier rows behind it, the fold still shows.
        let first = make(tasks, commitments: commitments, today: sunday)
        #expect(first.past?.label == "Earlier")
        #expect(first.past?.days.isEmpty == true)
        #expect(first.past?.doneLine == nil)
        #expect(Set(first.past?.earlier.map(\.title) ?? []) == ["Send the deposit", "Measure the bathroom window"])
        #expect(first.days.first?.isToday == true)
        #expect(first.days.first?.label == "SUN")
    }

    @Test func theFirstDayWithNothingBehindHasNoFold() {
        let sun = task("Return the library books", on: sunday)
        let first = make([sun], today: sunday)
        #expect(first.past == nil)
        #expect(first.days.count == 7)

        // A week that is not today's has no fold, and every one of its days stands.
        let behind = task("Send the deposit", on: day(2026, 11, 6))
        let next = make([behind], weekStart: day(2026, 11, 15))
        #expect(next.past == nil)
        #expect(next.days.map(\.label) == ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"])
        #expect(next.days.allSatisfy { !$0.isToday })
    }

    @Test func anEmptyDayIsOpen() {
        let thu = task("Call the tiler", on: day(2026, 11, 12))
        let week = make([thu])
        #expect(on(week, day(2026, 11, 11))?.lines == [.open])
        #expect(titles(on(week, day(2026, 11, 12))) == ["Call the tiler"])
        #expect(on(week, today)?.lines == [.open])
    }

    @Test func eventsComeFirstAndAreNotTasks() {
        let three = PlanCalendar.calendar.date(bySettingHour: 15, minute: 0, second: 0, of: today)!
        let nine = PlanCalendar.calendar.date(bySettingHour: 9, minute: 30, second: 0, of: today)!
        let t = task("Call the tiler", on: today)
        let week = make([t], events: { d in
            guard PlanCalendar.sameDay(d, self.today) else { return [] }
            return [self.event("Dentist", at: three), self.event("Call the tiler", at: nine, type: .task),
                    self.event("School holiday", at: self.today, allDay: true), self.event("Standup", at: nine)]
        })
        let lines = week.days.first?.lines ?? []
        #expect(lines.count == 4)
        #expect(lines[0] == .event(id: "School holiday", time: "", title: "School holiday"))
        #expect(lines[1] == .event(id: "Standup", time: DailyCopy.clock(nine), title: "Standup"))
        #expect(lines[2] == .event(id: "Dentist", time: DailyCopy.clock(three), title: "Dentist"))
        guard case let .task(row) = lines[3] else { Issue.record("the task comes after the events"); return }
        #expect(row.id == t.id)
        // A day with only an event is not open.
        let wed = make([], events: { d in
            PlanCalendar.sameDay(d, day(2026, 11, 11)) ? [self.event("Dentist", at: day(2026, 11, 11))] : []
        })
        #expect(titles(on(wed, day(2026, 11, 11))) == ["event:Dentist"])
    }

    @Test func anyDayComesLastAndOnlyWhenItHoldsSomething() {
        let wed = task("Call the tiler", on: day(2026, 11, 11))
        let none = make([wed], commitments: [held(wed, on: sunday)])
        #expect(none.days.last?.date != nil)
        #expect(none.days.allSatisfy { $0.date != nil })

        let loose = task("Measure the bathroom window", order: 1)
        let ticked = task("Buy grout", done: true, order: 0)
        let unheld = task("Someday: a new shed")                      // on no week: not this week's
        let week = make([wed, loose, ticked, unheld],
                        commitments: [held(wed, on: sunday), held(loose, on: sunday), held(ticked, on: sunday, status: "done")])
        let last = week.days.last
        #expect(last?.date == nil)
        #expect(last?.label == DailyCopy.anyDayLabel.label)
        #expect(last?.number == DailyCopy.anyDayLabel.number)
        #expect(last?.isToday == false)
        #expect(titles(last) == ["Buy grout", "Measure the bathroom window"])
        #expect(week.days.filter { $0.date == nil }.count == 1)
    }

    @Test func aDoneTaskStaysWhereItWas() {
        let wed = day(2026, 11, 11)
        let a = task("Strip the wallpaper", on: wed, order: 0)
        let b = task("Fill the cracks", on: wed, done: true, order: 1)
        let c = task("Paint the ceiling", on: wed, order: 2)
        let week = make([c, b, a])
        let lines = on(week, wed)?.lines ?? []
        #expect(titles(on(week, wed)) == ["Strip the wallpaper", "Fill the cracks", "Paint the ceiling"])
        let done = lines.map { line -> Bool in if case let .task(row) = line { return row.done }; return false }
        #expect(done == [false, true, false])
    }

    @Test func rowsSayWhatTheyAreFor() {
        let goal = Goal(id: UUID(), userId: me, name: "Finish the bathroom", year: 2026)
        goal.context = "personal"
        let season = task("Pick the tiles"); season.goalId = goal.id
        let month = task("Order the tiles"); month.sourceId = season.id
        let thu = task("Call the tiler", on: day(2026, 11, 12)); thu.sourceId = month.id
        let loner = task("Buy stamps", on: day(2026, 11, 12), order: 0)
        let week = make([season, month, thu, loner], goals: [goal])
        let rows = (on(week, day(2026, 11, 12))?.lines ?? []).compactMap { line -> DailyDay.Row? in
            if case let .task(row) = line { return row }; return nil
        }
        #expect(rows.map(\.title) == ["Buy stamps", "Call the tiler"])
        #expect(rows.map(\.forGoal) == [nil, "Finish the bathroom"])
        #expect(rows.last?.forGoal == WalkEnding.forGoal(thu, tasks: [season, month, thu, loner], goals: [goal]))
    }

    @Test func chipsOfferTheOtherDaysThenAnyDay() {
        let onTuesday = DailyWeek.chips(for: today, weekStart: sunday, today: today)
        #expect(onTuesday.map(\.label) == ["Wed", "Thu", "Fri", "Sat", DailyCopy.anyDay])
        #expect(onTuesday.last?.day == nil)
        #expect(onTuesday.first?.day == day(2026, 11, 11))

        let noDay = DailyWeek.chips(for: nil, weekStart: sunday, today: today)
        #expect(noDay.map(\.label) == [DailyCopy.today, "Wed", "Thu", "Fri", "Sat"])
        #expect(noDay.first?.day == today)

        // A task left on a past day is offered today onward, never a past day.
        let left = DailyWeek.chips(for: day(2026, 11, 6), weekStart: sunday, today: today)
        #expect(left.map(\.label) == [DailyCopy.today, "Wed", "Thu", "Fri", "Sat", DailyCopy.anyDay])
        let onThursday = DailyWeek.chips(for: day(2026, 11, 12), weekStart: sunday, today: today)
        #expect(onThursday.map(\.label) == [DailyCopy.today, "Wed", "Fri", "Sat", DailyCopy.anyDay])
        #expect(Set(onThursday.map(\.id)).count == onThursday.count)
    }

    @Test func onlyMyPersonalRows() {
        let wed = day(2026, 11, 11)
        let theirs = task("Their dentist", user: other, on: wed)
        let family = task("Family picnic", context: "family", on: wed)
        let work = task("Quarterly report", context: "work", on: wed)
        let letGo = task("Old idea", on: wed); letGo.dismissedAt = sunday
        let parent = task("Paint the hall", on: day(2026, 11, 13))
        let step = task("Buy brushes", on: wed); step.parentTaskId = parent.id
        let theirEarlier = task("Their errand", user: other, on: day(2026, 11, 6))
        let familyLoose = task("Plan the holiday", context: "family")
        let mine = task("Call the tiler", on: wed, order: 0)
        let week = make([theirs, family, work, letGo, parent, step, theirEarlier, familyLoose, mine],
                        commitments: [held(familyLoose, on: sunday), held(theirs, on: sunday)])
        #expect(titles(on(week, wed)) == ["Call the tiler"])
        #expect(week.days.allSatisfy { $0.date != nil })
        #expect((week.past?.earlier ?? []).isEmpty)
        let shown = week.days.flatMap(titles) + (week.past?.days.flatMap(titles) ?? [])
        #expect(Set(shown).subtracting(["open"]) == ["Call the tiler", "Paint the hall"])
    }

    @Test func theRestOfTheWeekLeavesTodayOut() {
        let loose = task("Measure the bathroom window")
        let week = make([loose], commitments: [held(loose, on: sunday)])
        let rest = DailyWeek.rest(week)
        #expect(rest.map(\.label) == ["WED", "THU", "FRI", "SAT", DailyCopy.anyDayLabel.label])
        #expect(!rest.contains { $0.isToday })
        #expect(rest.last?.date == nil)
    }

    @Test func dayAndLineIdsAreDistinct() {
        let loose = task("Measure the bathroom window")
        let t = task("Call the tiler", on: today)
        let week = make([loose, t], commitments: [held(loose, on: sunday)])
        #expect(Set(week.days.map(\.id)).count == week.days.count)
        for d in week.days { #expect(Set(d.lines.map(\.id)).count == d.lines.count) }
    }


    @Test func theFoldSaysWhatWasDoneOrNothing() {
        let monday = day(2026, 11, 9)
        let wed = task("Call the tiler", on: day(2026, 11, 11))

        // Monday, with nothing behind but an event: no fold at all.
        let quiet = make([wed], events: { d in
            PlanCalendar.sameDay(d, self.sunday) ? [self.event("Brunch", at: self.sunday)] : []
        }, today: monday)
        #expect(quiet.past == nil)

        // Monday, with Sunday's task still open and nothing done: the fold keeps it, with no count.
        let sunOpen = task("Return the library books", on: sunday)
        let kept = make([wed, sunOpen], today: monday)
        #expect(kept.past?.doneLine == nil)
        #expect(titles(kept.past?.days.first) == ["Return the library books"])

        // Nothing done and one earlier task open: the fold is there for it, with no count.
        let friday = task("Send the deposit", on: day(2026, 11, 6))
        let earlier = make([wed, friday], today: monday)
        #expect(earlier.past?.earlier.map(\.title) == ["Send the deposit"])
        #expect(earlier.past?.doneLine == nil)
        #expect(earlier.past?.days.isEmpty == true)                     // Sunday held nothing: not drawn

        // Two done: the line says so.
        let a = task("Book the plumber", on: sunday, done: true)
        let b = task("Measure the window", on: sunday, done: true)
        let two = make([wed, a, b], today: monday)
        #expect(two.past?.doneLine == DailyCopy.done(2))
    }

    @Test func aTaskOnTheWeeksLastDayStandsOnce() {
        let saturday = task("Paint the fence", on: day(2026, 11, 14))
        let sundayWeek = make([saturday], commitments: [held(saturday, on: sunday)])
        let shown = sundayWeek.days.flatMap(titles) + (sundayWeek.past?.days.flatMap(titles) ?? [])
        #expect(shown.filter { $0 == "Paint the fence" }.count == 1)
        #expect(titles(sundayWeek.days.last) == ["Paint the fence"])

        let mondayStart = day(2026, 11, 9)
        let lastSunday = task("Wash the car", on: day(2026, 11, 15))
        let mondayWeek = make([lastSunday], commitments: [held(lastSunday, on: mondayStart)], weekStart: mondayStart)
        let shownM = mondayWeek.days.flatMap(titles) + (mondayWeek.past?.days.flatMap(titles) ?? [])
        #expect(shownM.filter { $0 == "Wash the car" }.count == 1)
        #expect(mondayWeek.days.last?.label == "SUN")
        #expect(titles(mondayWeek.days.last) == ["Wash the car"])
    }

    @Test func onlyThisWeeksEventsFromTodayOnShow() {
        // The feed answers for any day; a past day's events and other weeks' never show.
        let week = make([], events: { d in [self.event("Event \(PlanCalendar.ymd(d))", at: d)] })
        let shown = (week.days + (week.past?.days ?? [])).flatMap(titles).filter { $0.hasPrefix("event:") }
        let expected = (10...14).map { "event:Event \(PlanCalendar.ymd(day(2026, 11, $0)))" }
        #expect(shown == expected)
        #expect(week.past == nil)                                       // past days with only events fold to nothing

        let sunTask = task("Return the library books", on: sunday, done: true)
        let withPast = make([sunTask], events: { d in [self.event("Event \(PlanCalendar.ymd(d))", at: d)] })
        #expect(withPast.past?.days.flatMap(titles).contains { $0.hasPrefix("event:") } == false)
    }

    @Test func everyDayLabelIsInCapitalsAnyDayToo() {
        let loose = task("Measure the bathroom window")
        let mon = task("Book the plumber", on: day(2026, 11, 9), done: true)
        let week = make([loose, mon], commitments: [held(loose, on: sunday)])
        let labels = week.days.map(\.label) + (week.past?.days.map(\.label) ?? [])
        #expect(labels == ["TUE", "WED", "THU", "FRI", "SAT", "ANY", "MON"])
        #expect(labels.allSatisfy { $0 == $0.uppercased() })
        #expect(week.days.last?.number == "day")
    }

    /// The fold's earlier rows carry the day each was left on (nil: left on an earlier week with
    /// no day), so a row's chips come from the core, not from the page looking the task up.
    @Test func earlierRowsCarryTheDayTheyWereLeftOn() {
        let friday = day(2026, 11, 6)
        let dated = task("Send the deposit", on: friday)
        let loose = task("Measure the bathroom window")
        let week = make([dated, loose], commitments: [held(loose, on: day(2026, 11, 1))])
        let earlier = week.past?.earlier ?? []
        #expect(earlier.first { $0.id == dated.id }?.day.map { PlanCalendar.sameDay($0, friday) } == true)
        #expect(earlier.first { $0.id == loose.id }.map { $0.day == nil } == true)
        #expect(earlier.first { $0.id == dated.id }?.row.title == "Send the deposit")
    }

    @Test func aPastDayThatHeldNothingIsNotInTheFold() {
        let mon = task("Book the plumber", on: day(2026, 11, 9), done: true)
        let week = make([mon])
        #expect(week.past?.label == "Sunday and Monday")                // the line still names the days behind
        #expect(week.past?.days.map(\.label) == ["MON"])               // Sunday's lone "open" is not drawn
        #expect(week.past?.days.allSatisfy { !$0.lines.contains(.open) } == true)
    }

    @Test func aTaskBeingPulledUpIsLeftOutEverywhere() {
        let tue = task("Call the tiler", on: today)
        let mon = task("Book the plumber", on: day(2026, 11, 9))
        let friday = task("Send the deposit", on: day(2026, 11, 6))
        let loose = task("Measure the bathroom window")
        let all = [tue, mon, friday, loose]
        let commitments = [held(loose, on: sunday)]
        func shown(_ w: DailyWeek.Week) -> [String] {
            w.days.flatMap(titles) + (w.past?.days.flatMap(titles) ?? []) + (w.past?.earlier.map(\.title) ?? [])
        }
        for t in all {
            let week = DailyWeek.make(tasks: all, goals: [], commitments: commitments, focus: [], events: { _ in [] },
                                      weekStart: sunday, today: today, me: me, pulledUp: t.id)
            #expect(!shown(week).contains(t.title), "\(t.title) still shows while its Undo can be used")
            #expect(shown(week).filter { $0 != "open" }.count == 3)
        }
        let gone = DailyWeek.make(tasks: all, goals: [], commitments: commitments, focus: [], events: { _ in [] },
                                  weekStart: sunday, today: today, me: me, pulledUp: tue.id)
        #expect(gone.days.first?.lines == [.open])
    }

    // MARK: The band's month goals

    private func monthGoal(_ title: String, _ periods: WalkPeriods, order: Int, user: UUID? = nil,
                           context: String? = "personal", done: Bool = false) -> SymphonyTask {
        let g = task(title, user: user, context: context, done: done, order: order)
        g.bucket = "month"; g.monthStart = periods.monthStart
        return g
    }

    private func serving(_ goal: SymphonyTask, _ title: String, on date: Date) -> SymphonyTask {
        let t = task(title, on: date); t.sourceId = goal.id
        return t
    }

    @Test func theBandShowsTheMonthGoalsThisWeekServesMost() {
        let periods = WalkPeriods.pick(now: today)
        let a = monthGoal("Pick the tile and pay the deposit", periods, order: 0)
        let b = monthGoal("Book the plumber", periods, order: 1)
        let c = monthGoal("Clear the garage", periods, order: 2)
        let quiet = DailyWeek.bandGoals(tasks: [a, b, c], goals: [], commitments: [], focus: [],
                                        weekStart: sunday, today: today, me: me)
        #expect(quiet.map(\.title) == ["Pick the tile and pay the deposit", "Book the plumber"])

        let c1 = serving(c, "Empty the shelves", on: day(2026, 11, 11))
        let c2 = serving(c, "Book the skip", on: day(2026, 11, 9))       // a past day is still this week's
        let b1 = task("Call two plumbers"); b1.sourceId = b.id         // on the week with no day
        let away = serving(a, "Choose the grout", on: day(2026, 11, 20)) // next week's: not counted
        let busy = DailyWeek.bandGoals(tasks: [a, b, c, c1, c2, b1, away], goals: [],
                                       commitments: [held(b1, on: sunday)], focus: [],
                                       weekStart: sunday, today: today, me: me)
        #expect(busy.map(\.title) == ["Clear the garage", "Book the plumber"])
        #expect(busy.first?.id == c.id)
    }

    /// A task being pulled up (its Undo still open) does not count toward the band's order.
    @Test func aTaskBeingPulledUpDoesNotCountForTheBand() {
        let periods = WalkPeriods.pick(now: today)
        let b = monthGoal("Book the plumber", periods, order: 1)
        let c = monthGoal("Clear the garage", periods, order: 2)
        let c1 = serving(c, "Empty the shelves", on: day(2026, 11, 11))
        let c2 = serving(c, "Book the skip", on: day(2026, 11, 12))
        let b1 = serving(b, "Call two plumbers", on: day(2026, 11, 13))
        let all = [b, c, c1, c2, b1]
        func band(_ pulledUp: UUID?) -> [String] {
            DailyWeek.bandGoals(tasks: all, goals: [], commitments: [], focus: [], weekStart: sunday, today: today,
                                me: me, pulledUp: pulledUp).map(\.title)
        }
        #expect(band(nil) == ["Clear the garage", "Book the plumber"])
        #expect(band(c1.id) == ["Book the plumber", "Clear the garage"])        // 1 each: the walk's order
    }

    @Test func theBandBreaksATieInTheWalksOrder() {
        let periods = WalkPeriods.pick(now: today)
        let a = monthGoal("Pick the tile and pay the deposit", periods, order: 0)
        let b = monthGoal("Book the plumber", periods, order: 1)
        let c = monthGoal("Clear the garage", periods, order: 2)
        let tied = [serving(c, "Empty the shelves", on: day(2026, 11, 11)),
                    serving(b, "Call two plumbers", on: day(2026, 11, 12))]
        let band = DailyWeek.bandGoals(tasks: [c, b, a] + tied, goals: [], commitments: [], focus: [],
                                       weekStart: sunday, today: today, me: me)
        #expect(band.map(\.title) == ["Book the plumber", "Clear the garage"])
    }

    /// The owner's "where I am, if it has goals" (addendum): late in a season the walk plans the next
    /// month, but the band reads the current month first, while it holds a goal of mine.
    @Test func theBandReadsTheCurrentMonthFirst() {
        let late = day(2026, 11, 14)
        let periods = WalkPeriods.pick(now: late)
        #expect(!PlanCalendar.sameDay(periods.monthStart, PlanCalendar.monthStart(late)))   // the walk is on December
        let november = monthGoal("Finish the bathroom tiles", WalkPeriods.pick(now: today), order: 0)
        let december = monthGoal("Book the holiday ferry", periods, order: 1)
        let band = DailyWeek.bandGoals(tasks: [november, december], goals: [], commitments: [], focus: [],
                                       weekStart: sunday, today: late, me: me)
        #expect(band.map(\.title) == ["Finish the bathroom tiles"])
    }

    /// With nothing of mine in the current month (everything planned ahead), the walk's month.
    @Test func theBandReadsTheWalksMonthWhenTheCurrentOneIsEmpty() {
        let late = day(2026, 11, 14)
        let december = monthGoal("Book the holiday ferry", WalkPeriods.pick(now: late), order: 1)
        let theirs = monthGoal("Their November goal", WalkPeriods.pick(now: today), order: 0, user: other)
        let band = DailyWeek.bandGoals(tasks: [theirs, december], goals: [], commitments: [], focus: [],
                                       weekStart: sunday, today: late, me: me)
        #expect(band.map(\.title) == ["Book the holiday ferry"])
    }

    @Test func theBandHoldsOnlyMyOpenMonthGoals() {
        let periods = WalkPeriods.pick(now: today)
        let theirs = monthGoal("Their month goal", periods, order: 0, user: other)
        let family = monthGoal("Family month goal", periods, order: 1, context: "family")
        let done = monthGoal("Paint the fence", periods, order: 2, done: true)
        let mine = monthGoal("Clear the garage", periods, order: 3)
        let band = DailyWeek.bandGoals(tasks: [theirs, family, done, mine], goals: [], commitments: [], focus: [],
                                       weekStart: sunday, today: today, me: me)
        #expect(band.map(\.title) == ["Clear the garage"])
    }

    @Test func moveToNamesThePlaceInTheWalksWords() {
        #expect(DailyCopy.moveTo("Wed").hasPrefix(WalkCopy.moveTo))
        #expect(DailyCopy.moveTo("Wed").hasSuffix("Wed"))
        #expect(DailyCopy.moveTo(DailyCopy.anyDay) != DailyCopy.moveTo("Wed"))
    }
}
