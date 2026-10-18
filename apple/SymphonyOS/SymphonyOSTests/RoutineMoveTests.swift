import Testing
import Foundation
import SwiftData
@testable import Symphony

/// Moving one routine occurrence writes what the web's `reschedule` writes
/// (#115), so both apps read the move the same way.
@MainActor
struct RoutineMoveTests {
    let user = UUID()
    func at(_ d: Int, _ h: Int = 0, _ m: Int = 0) -> Date {
        Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: d, hour: h, minute: m))!
    }

    func setup(time: String?) throws -> (ModelContext, Routine, PlanWriter) {
        let container = try ModelContainer(
            for: SymphonyTask.self, Routine.self, ActionableInstance.self, PendingChange.self, TaskFocus.self, TaskCommitment.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let context = ModelContext(container)
        let r = Routine(userId: user, name: "Wash comforters", recurrencePattern: RecurrencePattern(type: "weekly", days: ["wed"]))
        r.timeOfDay = time
        context.insert(r)
        return (context, r, PlanWriter(context: context, userId: user))
    }

    func instances(_ c: ModelContext) -> [ActionableInstance] { (try? c.fetch(FetchDescriptor<ActionableInstance>())) ?? [] }

    // Wednesday Oct 7 → Saturday Oct 10, 2026.

    @Test func aTimedRoutineKeepsItsTimeOnTheNewDay() throws {
        let (c, r, w) = try setup(time: "09:30:00")
        w.moveRoutine(r, from: at(7), to: at(10))
        let i = try #require(instances(c).first)
        #expect(i.status == "deferred")
        #expect(i.deferredTo == at(10, 9, 30))
        #expect(i.plannedOn == nil)
        #expect(Calendar.current.isDate(i.date, inSameDayAs: at(7)))
    }

    @Test func anUntimedRoutineMovesAsADayOnly() throws {
        let (c, r, w) = try setup(time: nil)
        w.moveRoutine(r, from: at(7), to: at(10))
        let i = try #require(instances(c).first)
        #expect(i.status == "deferred")
        #expect(i.deferredTo == at(10))
        #expect(i.plannedOn == at(10))
    }

    @Test func movingItAgainFromWhereItWentReusesTheSameOccurrence() throws {
        let (c, r, w) = try setup(time: nil)
        w.moveRoutine(r, from: at(7), to: at(10))
        w.moveRoutine(r, from: at(10), to: at(7))
        let all = instances(c)
        #expect(all.count == 1)
        // Back on its own day: simply due again.
        #expect(all[0].status == "pending")
        #expect(all[0].deferredTo == nil)
        #expect(all[0].plannedOn == nil)
    }

    @Test func offersTomorrowTheWeekendAndNextWeekWithoutRepeats() {
        // From Wednesday: Thu, Sat, Sun, Mon.
        let wed = RoutineOccurrenceSheet.targets(from: at(7)).map(\.label)
        #expect(wed == ["Tomorrow", "Saturday", "Sunday", "Next week"])
        // From Saturday: Sunday is tomorrow, so it isn't offered twice.
        let sat = RoutineOccurrenceSheet.targets(from: at(10)).map(\.label)
        #expect(sat == ["Tomorrow", "Next week"])
    }
}
