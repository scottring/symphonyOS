import Testing
import Foundation
@testable import Symphony

// "Keep it until it's done" on the phone answers as the web does
// (src/lib/today/carriedRoutines.test.ts, Pay FFG 2026-11-11).

private func day(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
}

private func ffg(keep: Bool = true, created: Date = day(2026, 1, 1)) -> Routine {
    let r = Routine(userId: UUID(), name: "Pay FFG", recurrencePattern: RecurrencePattern(type: "monthly", dayOfMonth: 10))
    r.keepUntilDone = keep
    r.createdAt = created
    return r
}

private func inst(_ r: Routine, _ date: Date, status: String = "pending") -> ActionableInstance {
    let i = ActionableInstance(userId: UUID(), entityType: "routine", entityId: r.id.uuidString.lowercased(), date: date)
    i.status = status
    return i
}

struct CarriedRoutinesTests {
    let nov11 = day(2026, 11, 11, 9)

    @Test func carriesAMissedOccurrenceFromItsOwnDay() {
        let r = ffg()
        let out = CarriedRoutines.select(routines: [r], instances: [], today: nov11)
        #expect(out.count == 1)
        #expect(PlanCalendar.ymd(out[0].date) == "2026-11-10")
        #expect(CarriedRoutines.fromLabel(out[0].dueOn, today: nov11) == "from yesterday")
    }

    @Test func notOnceDoneOrSkippedNorWhenSwitchedOff() {
        let r = ffg()
        #expect(CarriedRoutines.select(routines: [r], instances: [inst(r, day(2026, 11, 10), status: "completed")], today: nov11).isEmpty)
        #expect(CarriedRoutines.select(routines: [r], instances: [inst(r, day(2026, 11, 10), status: "skipped")], today: nov11).isEmpty)
        #expect(CarriedRoutines.select(routines: [ffg(keep: false)], instances: [], today: nov11).isEmpty)
    }

    @Test func aMovedOccurrenceIsItsNewDaysUntilThatDayHasPassed() {
        let r = ffg()
        let moved = inst(r, day(2026, 11, 10), status: "deferred")
        moved.deferredTo = day(2026, 11, 12)
        moved.plannedOn = day(2026, 11, 12)
        #expect(CarriedRoutines.select(routines: [r], instances: [moved], today: nov11).isEmpty)
        let later = CarriedRoutines.select(routines: [r], instances: [moved], today: day(2026, 11, 14, 9))
        #expect(later.count == 1)
        #expect(PlanCalendar.ymd(later[0].date) == "2026-11-10") // Done writes the original occurrence
        #expect(CarriedRoutines.fromLabel(later[0].dueOn, today: day(2026, 11, 14)) == "from Thu")
    }

    @Test func stopsAtTheNextOccurrenceAndLeavesRestingDaylessOrOtherDomainsAlone() {
        #expect(CarriedRoutines.select(routines: [ffg()], instances: [], today: day(2026, 12, 10, 9)).isEmpty)
        let resting = ffg(); resting.visibility = "reference"
        #expect(CarriedRoutines.select(routines: [resting], instances: [], today: nov11).isEmpty)
        let dayless = ffg(); dayless.recurrencePattern = RecurrencePattern(type: "weekly")
        #expect(CarriedRoutines.select(routines: [dayless], instances: [], today: nov11).isEmpty)
        let paused = ffg(); paused.pausedUntil = day(2026, 12, 1)
        #expect(CarriedRoutines.select(routines: [paused], instances: [], today: nov11).isEmpty)
        let work = ffg(); work.context = "work"
        #expect(CarriedRoutines.select(routines: [work], instances: [], today: nov11, domain: "family").isEmpty)
    }

    @Test func aRoutineMadeAfterItsLastDueDayHasNothingMissed() {
        #expect(CarriedRoutines.select(routines: [ffg(created: day(2026, 11, 10, 20))], instances: [], today: nov11).count == 1)
        #expect(CarriedRoutines.select(routines: [ffg(created: day(2026, 11, 11, 8))], instances: [], today: nov11).isEmpty)
        #expect(CarriedRoutines.fromLabel(day(2026, 11, 1), today: nov11) == "from Nov 1")
    }
}
