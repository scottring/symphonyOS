import Testing
import Foundation
import CoreGraphics
import SwiftData
@testable import Symphony

// Paper-style horizons on the phone (Scott, 2026-11-04): the sheet above
// folds beside the planner, the iPhone Duo lays the two as a spread, and the
// write line puts a plain item on this period only, tied to nothing.

struct FoldGeometryTests {
    @Test func aDuoSpreadGivesTheSheetAbove38Percent() {
        let s = FoldGeometry.split(width: 626, fold: nil)
        #expect(s.above == 238)
        #expect(s.current == 388)
    }

    @Test func aBookFoldSplitsOnTheHinge() {
        let s = FoldGeometry.split(width: 900, fold: CGRect(x: 448, y: 0, width: 4, height: 1000))
        #expect(s.above == 450)
        #expect(s.current == 450)
    }

    @Test func aFoldTooNearAnEdgeOrLyingFlatIsIgnored() {
        // A side of 240pt or less: the split follows the content (38%).
        let near = FoldGeometry.split(width: 700, fold: CGRect(x: 238, y: 0, width: 4, height: 1000))
        #expect(near.above == 266 && near.current == 434)
        // A horizontal fold (the phone held like a laptop) is not a page split.
        let flat = FoldGeometry.split(width: 700, fold: CGRect(x: 0, y: 400, width: 700, height: 4))
        #expect(flat.above == 266)
    }

    @Test func phonesFoldVerticallyAndWideScreensSpread() {
        #expect(FoldGeometry.mode(width: 466) == .vertical)
        #expect(FoldGeometry.mode(width: 599) == .vertical)
        #expect(FoldGeometry.mode(width: 600) == .spread)
        #expect(FoldGeometry.mode(width: 626) == .spread)
    }

    @Test func theCalendarTakesTheRightPage() {
        // No fold: this sheet keeps its width and turns to the left page; the
        // calendar takes the 38% on the right.
        #expect(FoldGeometry.companionWidth(.calendar, width: 626, fold: nil) == 238)
        // A book fold: the calendar is the page right of the hinge.
        let fold = CGRect(x: 398, y: 0, width: 4, height: 1000)
        #expect(FoldGeometry.companionWidth(.above, width: 900, fold: fold) == 400)
        #expect(FoldGeometry.companionWidth(.calendar, width: 900, fold: fold) == 500)
    }

    @Test func theSheetAboveHangsUpTo62PercentOfTheScreen() {
        #expect(FoldGeometry.maxAboveHeight(viewport: 800) == 496)
    }

    @Test func releaseSnapsByPositionPlusVelocity() {
        #expect(FoldGeometry.releaseOpens(p: 0.3, velocity: 2.0))     // flicked open
        #expect(!FoldGeometry.releaseOpens(p: 0.6, velocity: -1.5))   // flicked shut
        #expect(FoldGeometry.releaseOpens(p: 0.6, velocity: 0))
        #expect(!FoldGeometry.releaseOpens(p: 0.4, velocity: 0))
    }

    @Test func theLandingSoundComesNearTheEndOfTheSpring() {
        // k = 170, damping ratio 0.78: within 3% of the target in about a third of a second.
        let t = FoldGeometry.landingDelay(from: 0, to: 1, velocity: 0)
        #expect(t > 0.2 && t < 0.45)
        // Already there: at once.
        #expect(FoldGeometry.landingDelay(from: 0.99, to: 1, velocity: 0) == 0)
    }
}

@MainActor
struct WriteLineTests {
    private let me = UUID()

    private func makeContext() throws -> ModelContext {
        let container = try ModelContainer(
            for: SymphonyTask.self, Routine.self, ActionableInstance.self, FamilyMember.self,
            TaskCommitment.self, TaskFocus.self, Goal.self, PendingChange.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return ModelContext(container)
    }

    @Test func aMonthLineIsOneMonthCommitmentTiedToNothing() throws {
        let ctx = try makeContext()
        let nov = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 1))!
        let t = PlanWriter(context: ctx, userId: me)
            .createPeriodTask(title: "Pick dates with Iris and book trains", level: "month", periodStart: nov)

        let commitments = try ctx.fetch(FetchDescriptor<TaskCommitment>())
        #expect(commitments.count == 1)
        #expect(commitments.first?.level == "month")
        #expect(commitments.first?.status == "open")
        #expect(PlanCalendar.sameDay(commitments.first?.periodStart, nov))
        #expect(commitments.first?.taskId == t.id)
        #expect(t.goalTaskId == nil)
        #expect(!t.isGoal)
        #expect(t.bucket == "month")
        #expect(PlanCalendar.sameDay(t.monthStart, nov))
        #expect(t.weekStart == nil && t.seasonStart == nil)

        // The task's insert queues before its commitment's (the push runs in order).
        let queued = try ctx.fetch(FetchDescriptor<PendingChange>(sortBy: [SortDescriptor(\.createdAt)]))
        #expect(queued.map(\.tableName) == ["tasks", "task_commitments"])
        #expect(queued.allSatisfy { $0.changeType == "insert" })
        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: t.id, context: ctx, forInsert: true))
        #expect(row["bucket"]?.stringValue == "month")
        #expect(row["month_start"]?.stringValue == "2026-11-01")
    }

    @Test func aSeasonLineGoesInTheQuarterBucket() throws {
        let ctx = try makeContext()
        let fall = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 9, day: 1))!
        let t = PlanWriter(context: ctx, userId: me)
            .createPeriodTask(title: "Plan winter vacation", level: "season", periodStart: fall, context: "family")
        #expect(t.bucket == "quarter")
        #expect(PlanCalendar.sameDay(t.seasonStart, fall))
        #expect(t.context == "family" && t.scope == "compound")
        let c = try ctx.fetch(FetchDescriptor<TaskCommitment>())
        #expect(c.count == 1 && c[0].level == "season")
    }

    @Test func aWeekLineIsOnTheWeeksList() throws {
        let ctx = try makeContext()
        let ws = PlanCalendar.weekStart(Date())
        let t = PlanWriter(context: ctx, userId: me)
            .createPeriodTask(title: "Reserve Amtrak tickets", level: "week", periodStart: ws)
        #expect(t.bucket == "week" && PlanCalendar.sameDay(t.weekStart, ws))
        let plan = PlanSnapshot(tasks: [t], commitments: try ctx.fetch(FetchDescriptor<TaskCommitment>()),
                                focus: [], routines: [], instances: [], userId: me, domain: nil)
        #expect(plan.week(ws).anyDay.map(\.id) == [t.id])
    }
}

@MainActor
struct WeekLookBackTests {
    private let me = UUID()

    private func makeContext() throws -> ModelContext {
        let container = try ModelContainer(
            for: SymphonyTask.self, Routine.self, ActionableInstance.self, FamilyMember.self,
            TaskCommitment.self, TaskFocus.self, Goal.self, PendingChange.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return ModelContext(container)
    }

    @Test func somedayEndsOnlyLastWeeksCommitmentWhileNovemberHoldsIt() throws {
        let ctx = try makeContext()
        let t = SymphonyTask(userId: me, title: "Plan winter vacation", context: "family")
        t.bucket = "week"
        ctx.insert(t)
        let prev = PlanCalendar.addDays(PlanCalendar.weekStart(Date()), -7)
        let week = TaskCommitment(taskId: t.id, level: "week", periodStart: prev, syncStatus: .synced)
        let month = TaskCommitment(taskId: t.id, level: "month", periodStart: PlanCalendar.monthStart(Date()), syncStatus: .synced)
        ctx.insert(week); ctx.insert(month)

        PlanWriter(context: ctx, userId: me).someday(t, from: week)

        #expect(week.status == "removed")
        #expect(month.status == "open")      // November still holds it
        #expect(t.bucket != "someday")
    }

    @Test func somedayWithNothingElseHoldingItGoesToSomeday() throws {
        let ctx = try makeContext()
        let t = SymphonyTask(userId: me, title: "Fix the gate latch", context: "family")
        t.bucket = "week"
        ctx.insert(t)
        let prev = PlanCalendar.addDays(PlanCalendar.weekStart(Date()), -7)
        let week = TaskCommitment(taskId: t.id, level: "week", periodStart: prev, syncStatus: .synced)
        ctx.insert(week)

        let writer = PlanWriter(context: ctx, userId: me)
        let snap = writer.someday(t, from: week)
        #expect(week.status == "removed")
        #expect(t.bucket == "someday" && t.isSomeday)

        writer.undo(snap)
        #expect(week.status == "open" && t.bucket == "week")
    }
}

struct SheetAboveTests {
    private let me = UUID()

    private func goal(_ name: String, _ year: Int, _ status: String = "active") -> Goal {
        let g = Goal(id: UUID(), userId: me, name: name, year: year)
        g.status = status
        return g
    }

    @Test func theYearReadsLastYearsOpenGoals() {
        let plan = PlanSnapshot(tasks: [], commitments: [], focus: [], routines: [], instances: [],
                                goals: [goal("Run a half marathon", 2025), goal("Will signed", 2025, "completed"),
                                        goal("Old idea", 2025, "archived"), goal("Finish the album", 2026)],
                                userId: me, domain: nil)
        let open = plan.openYearGoals(2025)
        #expect(open.map(\.name) == ["Run a half marathon"])
        #expect(plan.doneYearGoals(2025) == 1)
    }

    @Test func aPeriodListIsOneListWithItsDoneCount() {
        let nov = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 1))!
        func held(_ title: String, goal: Bool = false, done: Bool = false, at n: Int) -> (SymphonyTask, TaskCommitment) {
            let t = SymphonyTask(userId: me, title: title, completed: done, context: "family")
            t.isGoal = goal
            t.createdAt = Date(timeIntervalSince1970: Double(n))
            return (t, TaskCommitment(taskId: t.id, level: "month", periodStart: nov))
        }
        let rows = [held("Make a money plan", goal: true, at: 2), held("Plan school breaks", at: 1),
                    held("Fix the kitchen light", done: true, at: 0)]
        let plan = PlanSnapshot(tasks: rows.map(\.0), commitments: rows.map(\.1), focus: [], routines: [],
                                instances: [], userId: me, domain: nil)
        let sheet = plan.sheet(level: "month", start: nov)
        // No goal/task split above the week: one list, oldest first.
        #expect(sheet.open.map(\.title) == ["Plan school breaks", "Make a money plan"])
        #expect(sheet.doneCount == 1)
    }
}

struct PeriodCalendarTests {
    private func event(_ title: String, _ m: Int, _ d: Int) -> TimelineItem {
        let at = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: m, day: d, hour: 9))!
        return TimelineItem(id: "\(title)-\(m)-\(d)", type: .event, title: title, startTime: at, isAllDay: false,
                            completed: false, context: nil, entityId: UUID(), eventKey: "\(title)-\(m)-\(d)",
                            endTime: at.addingTimeInterval(3600))
    }

    @Test func oneOffsReadByDateAndRepeatsFoldIntoOneLine() {
        let events = [event("Thanksgiving", 11, 26), event("Election Day", 11, 3),
                      event("Boxing", 11, 3), event("Boxing", 11, 5), event("Boxing", 11, 10)]
        let read = PeriodCalendar.read(events)
        #expect(read.lines.map(\.text) == ["Nov 3 · Election Day", "Nov 26 · Thanksgiving"])
        #expect(read.repeating == ["Boxing"])
    }

    @Test func theSameEventTwiceOnOneDayIsOneLine() {
        let read = PeriodCalendar.read([event("Picture day", 11, 5), event("Picture day", 11, 5)])
        #expect(read.lines.map(\.text) == ["Nov 5 · Picture day"])
        #expect(read.repeating.isEmpty)
    }
}

struct PaperSynthTests {
    private let synth = PaperSynth(sampleRate: 44_100)

    private func peak(_ s: [Float]) -> Float { s.map(abs).max() ?? 0 }

    @Test func eachSoundIsShortAudibleAndNeverClips() {
        for (name, samples, longest) in [("swish", synth.swish(), 0.4), ("crinkle", synth.crinkle(), 0.4),
                                         ("land", synth.land(), 0.15), ("pencil", synth.pencil(), 0.13)] {
            #expect(!samples.isEmpty, "\(name)")
            #expect(Double(samples.count) / 44_100 <= longest, "\(name)")
            #expect(peak(samples) > 0.001, "\(name) is silent")
            #expect(peak(samples) < 1, "\(name) clips")
        }
    }

    @Test func theEnvelopeRampsLikeWebAudio() {
        #expect(PaperSynth.envelope(0, attack: 0.1, peak: 0.2, end: 1) == 0)
        #expect(abs(PaperSynth.envelope(0.05, attack: 0.1, peak: 0.2, end: 1) - 0.1) < 1e-9)
        #expect(abs(PaperSynth.envelope(0.1, attack: 0.1, peak: 0.2, end: 1) - 0.2) < 1e-9)
        #expect(PaperSynth.envelope(1, attack: 0.1, peak: 0.2, end: 1) == 0.0005)
    }
}
