import Testing
import Foundation
import SwiftData
@testable import Symphony

// Planning on the phone must answer the same questions as the web:
// which week/month/season holds a task, what the chooser offers for the
// DISPLAYED date, and what each placement writes.

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

private func task(_ title: String, context: String? = "family") -> SymphonyTask {
    let t = SymphonyTask(userId: UUID(), title: title, context: context)
    t.bucket = "inbox"
    return t
}

private func routine(_ name: String, _ pattern: RecurrencePattern, time: String? = nil) -> Routine {
    let r = Routine(userId: UUID(), name: name, recurrencePattern: pattern)
    r.timeOfDay = time
    return r
}

// MARK: - Calendar

struct PlanCalendarTests {
    @Test func weeksStartOnSunday() {
        // Wed Sep 23 2026 → Sun Sep 20 (the database triggers' week).
        #expect(PlanCalendar.ymd(PlanCalendar.weekStart(day(2026, 9, 23))) == "2026-09-20")
        #expect(PlanCalendar.ymd(PlanCalendar.weekStart(day(2026, 9, 20))) == "2026-09-20")
        #expect(PlanCalendar.ymd(PlanCalendar.weekendSaturday(ofWeek: day(2026, 9, 23))) == "2026-09-26")
    }

    @Test func seasonsUseHouseholdBoundariesOrDefaults() {
        let fall = PlanCalendar.season(containing: day(2026, 9, 23))
        #expect(fall.name == "Fall")
        #expect(PlanCalendar.ymd(fall.start) == "2026-09-01")
        #expect(PlanCalendar.ymd(fall.lastDay) == "2026-11-30")

        let winter = PlanCalendar.season(containing: day(2027, 1, 15))
        #expect(winter.name == "Winter")
        #expect(PlanCalendar.ymd(winter.start) == "2026-12-01")

        let custom = [SeasonBoundary(name: "Spring", month: 3, day: 20), SeasonBoundary(name: "Summer", month: 6, day: 21),
                      SeasonBoundary(name: "Autumn", month: 9, day: 22), SeasonBoundary(name: "Winter", month: 12, day: 21)]
        let autumn = PlanCalendar.season(containing: day(2026, 9, 23), boundaries: custom)
        #expect(autumn.name == "Autumn")
        #expect(PlanCalendar.ymd(autumn.start) == "2026-09-22")
    }

    @Test func labourDayMakesAThreeDayWeekend() {
        // Labor Day 2026 is Mon Sep 7.
        let window = PlanCalendar.weekendWindow(for: day(2026, 9, 7))?.map(PlanCalendar.ymd)
        #expect(window == ["2026-09-05", "2026-09-06", "2026-09-07"])
        // A standalone midweek holiday is not a weekend (Veterans Day, Wed Nov 11 2026).
        #expect(PlanCalendar.weekendWindow(for: day(2026, 11, 11)) == nil)
    }
}

// MARK: - Routine rules

struct RoutineRulesTests {
    @Test func weeklyMatchesItsDaysInEitherSpelling() {
        let p = RecurrencePattern(type: "weekly", days: ["tue", "thursday"])
        #expect(RoutineRules.matches(p, on: day(2026, 9, 22)))    // Tue
        #expect(RoutineRules.matches(p, on: day(2026, 9, 24)))    // Thu
        #expect(!RoutineRules.matches(p, on: day(2026, 9, 23)))   // Wed
    }

    @Test func patternDecodesWebKeysAndLegacyPhoneKeys() throws {
        let web = try JSONDecoder().decode(RecurrencePattern.self, from: Data(#"{"type":"monthly","day_of_month":15,"interval":2}"#.utf8))
        #expect(web.dayOfMonth == 15)
        #expect(web.interval == 2)
        let legacy = try JSONDecoder().decode(RecurrencePattern.self, from: Data(#"{"type":"monthly","dayOfMonth":3}"#.utf8))
        #expect(legacy.dayOfMonth == 3)
        // Re-encoding keeps every web field and writes the web's key.
        let out = String(data: try JSONEncoder().encode(web), encoding: .utf8)!
        #expect(out.contains("\"day_of_month\":15"))
        #expect(out.contains("\"interval\":2"))
    }

    @Test func weekendRoutineIsSettledOncePerWindow() {
        let p = RecurrencePattern(type: "weekend")
        let sat = day(2026, 9, 26), sun = day(2026, 9, 27)
        #expect(RoutineRules.matches(p, on: sat))
        #expect(!RoutineRules.matches(p, on: day(2026, 9, 23)))
        // Done Saturday → Sunday goes quiet, Saturday still shows (ticked).
        #expect(RoutineRules.matches(p, on: sat, lastCompletedAt: sat))
        #expect(!RoutineRules.matches(p, on: sun, lastCompletedAt: sat))
    }

    @Test func sinceLastSurfacesOnceTheIntervalPasses() {
        var p = RecurrencePattern(type: "since_last")
        p.interval = 2
        p.unit = "weeks"
        let last = day(2026, 9, 1)
        #expect(!RoutineRules.matches(p, on: day(2026, 9, 14), lastCompletedAt: last))
        #expect(RoutineRules.matches(p, on: day(2026, 9, 15), lastCompletedAt: last))
    }
}

// MARK: - Selectors

@MainActor
struct PlanSelectorTests {
    let me = UUID()

    private func snapshot(tasks: [SymphonyTask] = [], commitments: [TaskCommitment] = [], focus: [TaskFocus] = [],
                          routines: [Routine] = [], instances: [ActionableInstance] = []) -> PlanSnapshot {
        PlanSnapshot(tasks: tasks, commitments: commitments, focus: focus, routines: routines,
                     instances: instances, userId: me, domain: nil)
    }

    @Test func chooserRoutinesFollowTheDisplayedDate() {
        let tuesday = routine("Take out recycling", RecurrencePattern(type: "weekly", days: ["tue"]))
        let plan = snapshot(routines: [tuesday])
        #expect(plan.chooserRoutines(on: day(2026, 9, 22)).map(\.routine.name) == ["Take out recycling"])  // Tue
        #expect(plan.chooserRoutines(on: day(2026, 9, 23)).isEmpty)                                         // Wed
    }

    @Test func chooserOffersFlexibleWeeklyRoutinesUntilTheyHaveAHome() {
        let flexible = routine("Mow the lawn", RecurrencePattern(type: "weekly", days: []))
        let wed = day(2026, 9, 23)
        #expect(snapshot(routines: [flexible]).chooserRoutines(on: wed).map(\.flexible) == [true])

        // Given Monday of the same week → it has a home; not offered Wednesday.
        let placed = ActionableInstance(userId: me, entityType: "routine", entityId: flexible.id.uuidString.lowercased(), date: day(2026, 9, 21))
        placed.deferredTo = PlanCalendar.calendar.date(bySettingHour: 12, minute: 0, second: 0, of: day(2026, 9, 21))
        #expect(snapshot(routines: [flexible], instances: [placed]).chooserRoutines(on: wed).isEmpty)
        // Next week it's back.
        #expect(!snapshot(routines: [flexible], instances: [placed]).chooserRoutines(on: day(2026, 9, 28)).isEmpty)
    }

    @Test func timedRoutinesStayOnTheDayUntimedOnlyWhenChosen() {
        let timed = routine("Piano lesson", RecurrencePattern(type: "weekly", days: ["wed"]), time: "16:00")
        let untimed = routine("Water the tomatoes", RecurrencePattern(type: "weekly", days: ["wed"]))
        let wed = day(2026, 9, 23)
        #expect(snapshot(routines: [timed, untimed]).dayRoutines(on: wed).map(\.name) == ["Piano lesson"])

        let chosen = ActionableInstance(userId: me, entityType: "routine", entityId: untimed.id.uuidString.lowercased(), date: wed)
        chosen.plannedOn = wed
        let plan = snapshot(routines: [timed, untimed], instances: [chosen])
        #expect(Set(plan.dayRoutines(on: wed).map(\.name)) == ["Piano lesson", "Water the tomatoes"])
        #expect(plan.chooserRoutines(on: wed).first?.chosen == true)
    }

    @Test func commitmentsDecideWeekMembershipNotTheCache() {
        let ws = PlanCalendar.weekStart(Date())
        let held = task("Call the plumber")
        held.bucket = "inbox"   // stale cache
        let c = TaskCommitment(taskId: held.id, level: "week", periodStart: ws)
        let carried = task("Old thing")
        carried.bucket = "week"
        let gone = TaskCommitment(taskId: carried.id, level: "week", periodStart: ws, status: "carried")
        let legacy = task("Legacy week task")
        legacy.bucket = "week"
        legacy.weekStart = ws
        let plan = snapshot(tasks: [held, carried, legacy], commitments: [c, gone])
        #expect(Set(plan.weekList(ws).map(\.title)) == ["Call the plumber", "Legacy week task"])
    }

    @Test func chooserTasksSkipDatedAndOffersWeekendOnlyInItsWindow() {
        let ws = day(2026, 9, 20)
        let any = task("Order school shoes")
        let dated = task("Dentist forms")
        dated.scheduledFor = day(2026, 9, 24)
        dated.bucket = "timed"
        let weekend = task("Clean out the garage")
        weekend.weekendStart = day(2026, 9, 26)
        let commits = [any, dated, weekend].map { TaskCommitment(taskId: $0.id, level: "week", periodStart: ws) }
        let plan = snapshot(tasks: [any, dated, weekend], commitments: commits)
        #expect(plan.chooserTasks(on: day(2026, 9, 23)).map(\.title) == ["Order school shoes"])
        #expect(Set(plan.chooserTasks(on: day(2026, 9, 26)).map(\.title)) == ["Order school shoes", "Clean out the garage"])
    }

    @Test func focusIsPerPersonWithLegacyFallback() {
        let today = PlanCalendar.day(Date())
        let mine = task("Mine")
        let theirs = task("Theirs")
        let legacy = task("Legacy")
        legacy.plannedOn = today
        let plan = snapshot(tasks: [mine, theirs, legacy], focus: [
            TaskFocus(taskId: mine.id, userId: me, date: today),
            TaskFocus(taskId: theirs.id, userId: UUID(), date: today),
        ])
        #expect(plan.isFocused(mine, on: today))
        #expect(!plan.isFocused(theirs, on: today))   // someone else's choice
        #expect(plan.isFocused(legacy, on: today))    // no focus rows → planned_on
    }

    @Test func reviewListsOnlyLastWeeksOpenUnfinishedCommitments() {
        let prev = day(2026, 9, 13)
        let open = task("Still open")
        let done = task("Finished")
        done.completed = true
        let kept = task("Already carried")
        let plan = snapshot(tasks: [open, done, kept], commitments: [
            TaskCommitment(taskId: open.id, level: "week", periodStart: prev),
            TaskCommitment(taskId: done.id, level: "week", periodStart: prev),
            TaskCommitment(taskId: kept.id, level: "week", periodStart: prev, status: "carried"),
        ])
        #expect(plan.reviewRows(previousWeek: prev).map(\.task.title) == ["Still open"])
    }

    @Test func focusKeyMatchesPulledRows() {
        let taskId = UUID(), userId = UUID(), d = day(2026, 9, 23)
        let local = TaskFocus(taskId: taskId, userId: userId, date: d)
        let pulled = RowMapper.focusFromRow([
            "task_id": .string(taskId.uuidString.lowercased()),
            "user_id": .string(userId.uuidString.lowercased()),
            "date": .string("2026-09-23"),
        ])
        #expect(pulled?.id == local.id)
    }
}

// MARK: - Writes

@MainActor
struct PlanWriterTests {
    let me = UUID()

    private func makeContext() throws -> ModelContext {
        let container = try ModelContainer(
            for: SymphonyTask.self, Routine.self, ActionableInstance.self, FamilyMember.self,
            TaskCommitment.self, TaskFocus.self, Goal.self, PendingChange.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return ModelContext(container)
    }

    private func pending(_ ctx: ModelContext) -> [PendingChange] {
        (try? ctx.fetch(FetchDescriptor<PendingChange>(sortBy: [SortDescriptor(\.createdAt)]))) ?? []
    }

    @Test func todayDatesTheTaskAndFocusesItForMe() throws {
        let ctx = try makeContext()
        let t = task("Renew the passport")
        ctx.insert(t)
        PlanWriter(context: ctx, userId: me).move(t, to: .today)

        #expect(t.bucket == "timed")
        #expect(PlanCalendar.sameDay(t.scheduledFor, Date()))
        #expect(t.isAllDay)
        let focus = try ctx.fetch(FetchDescriptor<TaskFocus>())
        #expect(focus.count == 1 && focus[0].userId == me)
        #expect(pending(ctx).contains { $0.tableName == "task_focus" && $0.changeType == "insert" })
    }

    @Test func thisWeekAddsAnOpenWeekCommitmentAndSendsStamps() throws {
        let ctx = try makeContext()
        let t = task("Draft the board update", context: "work")
        ctx.insert(t)
        PlanWriter(context: ctx, userId: me).move(t, to: .thisWeek)

        let ws = PlanCalendar.weekStart(Date())
        let c = try ctx.fetch(FetchDescriptor<TaskCommitment>())
        #expect(c.count == 1 && c[0].level == "week" && c[0].status == "open" && PlanCalendar.sameDay(c[0].periodStart, ws))
        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: t.id, context: ctx))
        #expect(row["bucket"]?.stringValue == "week")
        #expect(row["week_start"]?.stringValue == PlanCalendar.ymd(ws))
        #expect(row.keys.contains("weekend_start"))   // placement write sends the null
    }

    @Test func ordinaryEditsNeverNullAWebPlacement() throws {
        let ctx = try makeContext()
        let t = task("Placed on the web")
        t.bucket = "week"
        t.weekendStart = day(2026, 9, 26)
        ctx.insert(t)
        try ctx.save()
        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: t.id, context: ctx))
        #expect(row["weekend_start"] == nil)
        #expect(row["month_start"] == nil)
    }

    @Test func somedayEndsEveryOpenCommitment() throws {
        let ctx = try makeContext()
        let t = task("Maybe later")
        ctx.insert(t)
        let open = TaskCommitment(taskId: t.id, level: "week", periodStart: PlanCalendar.weekStart(Date()), syncStatus: .synced)
        let month = TaskCommitment(taskId: t.id, level: "month", periodStart: PlanCalendar.monthStart(Date()), syncStatus: .synced)
        ctx.insert(open); ctx.insert(month)
        PlanWriter(context: ctx, userId: me).move(t, to: .someday)

        #expect(t.bucket == "someday" && t.scheduledFor == nil)
        #expect(open.status == "removed" && month.status == "removed")
    }

    @Test func undoRestoresTheTaskAndTakesBackUnpushedRows() throws {
        let ctx = try makeContext()
        let t = task("Oops")
        ctx.insert(t)
        let writer = PlanWriter(context: ctx, userId: me)
        let snap = writer.move(t, to: .thisWeek)
        writer.undo(snap)

        #expect(t.bucket == "inbox")
        #expect(t.weekStart == nil)
        // The commitment never reached the server: gone locally and from the queue.
        #expect(try ctx.fetch(FetchDescriptor<TaskCommitment>()).isEmpty)
        #expect(!pending(ctx).contains { $0.tableName == "task_commitments" })
    }

    @Test func undoOfTodayRemovesMyFocus() throws {
        let ctx = try makeContext()
        let t = task("Oops today")
        ctx.insert(t)
        let writer = PlanWriter(context: ctx, userId: me)
        writer.undo(writer.move(t, to: .today))
        #expect(try ctx.fetch(FetchDescriptor<TaskFocus>()).isEmpty)
        #expect(!pending(ctx).contains { $0.tableName == "task_focus" })
        #expect(t.bucket == "inbox" && t.scheduledFor == nil)
    }

    @Test func keepCarriesTheSameTaskIntoThisWeek() throws {
        let ctx = try makeContext()
        let t = task("Carry me")
        ctx.insert(t)
        let prev = PlanCalendar.addDays(PlanCalendar.weekStart(Date()), -7)
        let old = TaskCommitment(taskId: t.id, level: "week", periodStart: prev, syncStatus: .synced)
        ctx.insert(old)
        let now = PlanCalendar.weekStart(Date())
        PlanWriter(context: ctx, userId: me).keep(t, from: old, into: now)

        #expect(old.status == "carried" && PlanCalendar.sameDay(old.carriedTo, now))
        let all = try ctx.fetch(FetchDescriptor<TaskCommitment>())
        #expect(all.contains { $0.status == "open" && PlanCalendar.sameDay($0.periodStart, now) && $0.taskId == t.id })
        #expect(PlanCalendar.sameDay(t.weekStart, now))
    }

    @Test func choosingARoutineNeverTouchesItsRule() throws {
        let ctx = try makeContext()
        let r = routine("Mow the lawn", RecurrencePattern(type: "weekly", days: []))
        ctx.insert(r)
        let wed = PlanCalendar.day(Date())
        PlanWriter(context: ctx, userId: me).chooseRoutine(r, on: wed, flexible: true)

        let i = try #require(try ctx.fetch(FetchDescriptor<ActionableInstance>()).first)
        #expect(PlanCalendar.sameDay(i.plannedOn, wed))
        #expect(PlanCalendar.sameDay(i.deferredTo, wed))
        #expect(i.entityId == r.id.uuidString.lowercased())
        #expect(r.recurrencePattern.days == [])
        #expect(!pending(ctx).contains { $0.tableName == "routines" })
    }
}
