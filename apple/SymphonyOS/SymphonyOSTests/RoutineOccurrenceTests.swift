import Testing
import Foundation
@testable import Symphony

/// Twin coverage for the web's lib/today/routineTime.ts, deferredRoutines.ts
/// and routinesForDate.ts: the phone reads a moved, retimed, paused or chosen
/// routine occurrence the way the web does, and writes a choice the web reads
/// as a day, not 12:00 PM.
@MainActor
struct RoutineOccurrenceTests {
    let user = UUID()
    func at(_ d: Int, _ h: Int = 0, _ m: Int = 0) -> Date {
        Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: d, hour: h, minute: m))!
    }

    func routine(_ name: String, time: String? = nil, days: [String] = ["wed"]) -> Routine {
        let r = Routine(userId: user, name: name, recurrencePattern: RecurrencePattern(type: "weekly", days: days))
        r.timeOfDay = time
        return r
    }

    func occurrence(_ r: Routine, on day: Int, status: String = "pending", to: Date? = nil, planned: Date? = nil) -> ActionableInstance {
        let i = ActionableInstance(userId: user, entityType: "routine", entityId: r.id.uuidString.lowercased(), date: at(day))
        i.status = status
        i.deferredTo = to
        i.plannedOn = planned
        return i
    }

    func plan(_ routines: [Routine], _ instances: [ActionableInstance]) -> PlanSnapshot {
        PlanSnapshot(tasks: [], commitments: [], focus: [], routines: routines, instances: instances, userId: user, domain: nil)
    }

    // Wednesday Oct 7 and Saturday Oct 10, 2026.

    @Test func aMovedRoutineLeavesItsOwnDayAndShowsWhereItWent() {
        let r = routine("Wash comforters", time: "09:00")
        let moved = occurrence(r, on: 7, status: "deferred", to: at(10, 14))
        let p = plan([r], [moved])
        #expect(!p.dayRoutines(on: at(7)).contains { $0.id == r.id })
        #expect(p.dayRoutines(on: at(10)).contains { $0.id == r.id })
        #expect(p.time(of: r, on: at(10)) == at(10, 14))
    }

    @Test func aDayOnlyMoveIsUntimedWhereItLands() {
        let r = routine("Wash comforters")
        let moved = occurrence(r, on: 7, status: "deferred", to: at(10), planned: at(10))
        let p = plan([r], [moved])
        #expect(p.time(of: r, on: at(10)) == nil)
        #expect(p.isChosen(r, on: at(10)))
        #expect(p.dayRoutines(on: at(10)).contains { $0.id == r.id })
    }

    @Test func aSameDayRetimeWinsOverTheRule() {
        let r = routine("Homework", time: "16:00")
        let retimed = occurrence(r, on: 7, to: at(7, 17, 30))
        #expect(plan([r], [retimed]).time(of: r, on: at(7)) == at(7, 17, 30))
        #expect(plan([r], []).time(of: r, on: at(7)) == at(7, 16))
    }

    @Test func aRestingRoutineWakesOnItsDate() {
        let r = routine("Tidy bedrooms", time: "19:00")
        r.visibility = "reference"
        r.pausedUntil = at(7)
        #expect(RoutineRules.isActive(r, now: at(7, 8)))
        #expect(!RoutineRules.isActive(r, now: at(6, 20)))
        r.pausedUntil = nil
        #expect(!RoutineRules.isActive(r, now: at(7, 8)))   // resting with no wake date stays resting
    }

    @Test func choosingAFlexibleRoutineIsADayNotNoon() {
        // What the writer now leaves: planned_on, no deferred_to.
        let r = routine("Mow the lawn", days: [])
        let chosen = occurrence(r, on: 10, planned: at(10))
        let p = plan([r], [chosen])
        #expect(p.time(of: r, on: at(10)) == nil)
        #expect(p.isChosen(r, on: at(10)))
        // It has a home this week, so the chooser stops offering it elsewhere.
        #expect(RoutineRules.placedInWeek(r.id, weekStart: at(10), [chosen]))
    }
}
