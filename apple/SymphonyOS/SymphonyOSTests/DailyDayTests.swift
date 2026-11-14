import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

// Today's rows for the light pages: what each is for, which comes first, the ring and the next event.
@MainActor
struct DailyDayTests {
    let me = UUID()
    let other = UUID()
    let today = day(2026, 11, 10)

    private func task(_ title: String, user: UUID? = nil, on date: Date? = nil,
                      created: Double = 0) -> SymphonyTask {
        let t = SymphonyTask(id: UUID(), userId: user ?? me, title: title, completed: false, scheduledFor: date,
                             context: "personal", notes: nil)
        t.createdAt = Date(timeIntervalSince1970: created)
        return t
    }

    private func focus(_ t: SymphonyTask, user: UUID? = nil, on date: Date? = nil, created: Double) -> TaskFocus {
        let f = TaskFocus(taskId: t.id, userId: user ?? me, date: date ?? today)
        f.createdAt = Date(timeIntervalSince1970: created)
        return f
    }

    private func row(_ title: String, done: Bool) -> DailyDay.Row {
        DailyDay.Row(id: UUID(), title: title, forGoal: nil, done: done, first: false)
    }

    private func at(_ hour: Int, _ minute: Int = 0) -> Date {
        PlanCalendar.calendar.date(bySettingHour: hour, minute: minute, second: 0, of: today)!
    }

    private func event(_ title: String, at start: Date?, allDay: Bool = false, key: String? = nil,
                       type: TimelineItem.ItemType = .event) -> TimelineItem {
        TimelineItem(id: UUID().uuidString, type: type, title: title, startTime: start, isAllDay: allDay,
                     completed: false, context: nil, entityId: UUID(), eventKey: key)
    }

    @Test func aTaskShowsWhatItIsFor() {
        let goal = Goal(id: UUID(), userId: me, name: "Finish the bathroom", year: 2026)
        goal.context = "personal"
        let season = task("Pick the tiles"); season.goalId = goal.id
        let month = task("Order the tiles"); month.sourceId = season.id; month.goalId = goal.id
        let week = task("Call the tiler", on: today); week.sourceId = month.id; week.goalId = nil
        let rows = DailyDay.rows(tasks: [season, month, week], goals: [goal], focus: [], today: today, me: me)
        #expect(rows.map(\.title) == ["Call the tiler"])
        #expect(rows.first?.forGoal == "Finish the bathroom")
    }

    @Test func aTaskWithNoLinkHasNoFor() {
        let goal = Goal(id: UUID(), userId: me, name: "Finish the bathroom", year: 2026)
        let loner = task("Buy stamps", on: today)
        let rows = DailyDay.rows(tasks: [loner], goals: [goal], focus: [], today: today, me: me)
        #expect(rows.count == 1)
        #expect(rows.first?.forGoal == nil)
    }

    @Test func theFirstThingIsMyOldestOpenFocusToday() {
        let a = task("A", on: today, created: 1)
        let b = task("B", on: today, created: 2)
        let c = task("C", on: today, created: 3)
        let tasks = [a, b, c]
        let older = focus(a, created: 10)
        let newer = focus(b, created: 20)
        let theirs = focus(c, user: other, created: 1)   // someone else's mark never counts

        #expect(DailyDay.firstThing(focus: [newer, older, theirs], tasks: tasks, today: today, me: me) == a.id)
        let rows = DailyDay.rows(tasks: tasks, goals: [], focus: [newer, older, theirs], today: today, me: me)
        #expect(rows.first?.id == a.id)
        #expect(rows.first?.first == true)
        #expect(rows.filter(\.first).count == 1)

        a.completed = true
        #expect(DailyDay.firstThing(focus: [newer, older, theirs], tasks: tasks, today: today, me: me) == b.id)
        let after = DailyDay.rows(tasks: tasks, goals: [], focus: [newer, older, theirs], today: today, me: me)
        #expect(after.first?.id == b.id)
        #expect(after.filter(\.first).map(\.id) == [b.id])

        // The same moment: the lower id comes first.
        a.completed = false
        let tieA = focus(a, created: 5), tieB = focus(b, created: 5)
        let lower = tieA.id.uuidString < tieB.id.uuidString ? a.id : b.id
        #expect(DailyDay.firstThing(focus: [tieA, tieB], tasks: tasks, today: today, me: me) == lower)
        #expect(DailyDay.firstThing(focus: [tieB, tieA], tasks: tasks, today: today, me: me) == lower)

        #expect(DailyDay.firstThing(focus: [], tasks: tasks, today: today, me: me) == nil)
    }

    @Test func yesterdaysFocusIsNotTodaysFirst() {
        let moved = task("Moved", on: today)
        let yesterday = focus(moved, on: day(2026, 11, 9), created: 1)
        #expect(DailyDay.firstThing(focus: [yesterday], tasks: [moved], today: today, me: me) == nil)
        let rows = DailyDay.rows(tasks: [moved], goals: [], focus: [yesterday], today: today, me: me)
        #expect(rows.map(\.first) == [false])

        // A mark for today on a task now dated another day is not the first thing either.
        let later = task("Later", on: day(2026, 11, 11))
        #expect(DailyDay.firstThing(focus: [focus(later, created: 1)], tasks: [later], today: today, me: me) == nil)
    }

    @Test func onlyMyPersonalRows() {
        let theirGoal = Goal(id: UUID(), userId: other, name: "Their goal", year: 2026)
        theirGoal.context = "personal"
        let theirs = task("Theirs", user: other, on: today)
        let family = task("Family", on: today); family.context = "family"
        let work = task("Work", on: today); work.context = "work"
        let letGo = task("Let go", on: today); letGo.dismissedAt = today
        let parent = task("Parent", on: day(2026, 11, 20))
        let step = task("Step", on: today); step.parentTaskId = parent.id
        let bare = task("No area", on: today); bare.context = nil
        let mine = task("Mine", on: today); mine.goalId = theirGoal.id
        let tasks = [theirs, family, work, letGo, parent, step, bare, mine]

        let rows = DailyDay.rows(tasks: tasks, goals: [theirGoal], focus: [], today: today, me: me)
        #expect(Set(rows.map(\.title)) == ["No area", "Mine"])
        #expect(!rows.contains { $0.forGoal == "Their goal" })
        #expect(Set(DailyDay.mine(tasks, me: me).map(\.title)) == ["Parent", "No area", "Mine"])

        // Someone else's focus on their own task today is never my first thing.
        let theirFocus = focus(theirs, user: other, created: 1)
        #expect(DailyDay.firstThing(focus: [theirFocus], tasks: tasks, today: today, me: me) == nil)
        // Nor is my mark on a row the light pages do not show.
        #expect(DailyDay.firstThing(focus: [focus(family, created: 1)], tasks: tasks, today: today, me: me) == nil)
    }

    @Test func anEmptyDayHasNoRing() {
        #expect(DailyDay.ring([]) == nil)
        let rows = [row("A", done: false), row("B", done: true), row("C", done: false), row("D", done: false)]
        #expect(DailyDay.ring(rows)?.done == 1)
        #expect(DailyDay.ring(rows)?.total == 4)
    }

    @Test func nextEventSkipsPastAllDayAndTicked() {
        let now = at(12)
        let events = [
            event("Breakfast", at: at(8)),
            event("Exactly now", at: now),
            event("Holiday", at: at(13), allDay: true),
            event("Ticked", at: at(13, 30), key: "g-1"),
            event("A task", at: at(14), type: .task),
            event("A routine", at: at(14), type: .routine),
            event("No time", at: nil),
            event("School run", at: at(17), key: "g-3"),
            event("Dentist", at: at(15), key: "g-2"),
        ]
        #expect(DailyDay.nextEvent(events, ticked: ["g-1"], now: now) == DailyDay.Next(title: "Dentist", start: at(15)))
        #expect(DailyDay.nextEvent(events, ticked: [], now: now) == DailyDay.Next(title: "Ticked", start: at(13, 30)))
        #expect(DailyDay.nextEvent(events, ticked: ["g-1", "g-2", "g-3"], now: now) == nil)
        #expect(DailyDay.nextEvent([], ticked: [], now: now) == nil)
    }

    @Test func tomorrowFirstFollowsTheListOrder() {
        let tomorrow = PlanCalendar.addDays(today, 1)
        let unordered = task("Unordered", on: tomorrow, created: 0)
        let second = task("Second", on: tomorrow, created: 5); second.sortOrder = 2
        let first = task("First", on: tomorrow, created: 9); first.sortOrder = 1
        let done = task("Done", on: tomorrow); done.sortOrder = 0; done.completed = true
        let theirs = task("Theirs", user: other, on: tomorrow); theirs.sortOrder = 0
        let family = task("Family", on: tomorrow); family.sortOrder = 0; family.context = "family"
        let step = task("Step", on: tomorrow); step.sortOrder = 0; step.parentTaskId = unordered.id
        let todays = task("Today", on: today); todays.sortOrder = 0
        let tasks = [unordered, second, first, done, theirs, family, step, todays]
        #expect(DailyDay.tomorrowFirst(tasks: tasks, today: today, me: me)?.id == first.id)

        // With no order set, the oldest comes first.
        let newer = task("Newer", on: tomorrow, created: 20)
        let older = task("Older", on: tomorrow, created: 10)
        #expect(DailyDay.tomorrowFirst(tasks: [newer, older], today: today, me: me)?.id == older.id)
        #expect(DailyDay.tomorrowFirst(tasks: [todays, done], today: today, me: me) == nil)
    }

    @Test func doneRowsFoldToACount() {
        let rows = [row("A", done: false), row("B", done: true), row("C", done: false), row("D", done: true)]
        let split = DailyDay.split(rows)
        #expect(split.open.map(\.title) == ["A", "C"])
        #expect(split.done == 2)
        #expect(DailyDay.split([]).open.isEmpty)
        #expect(DailyDay.split([]).done == 0)
    }
}
