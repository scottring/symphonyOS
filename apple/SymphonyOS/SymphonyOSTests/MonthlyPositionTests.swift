import Testing
import Foundation
@testable import Symphony

/// Twin coverage for the web's src/lib/cadence/monthlyPosition.ts: a routine
/// set by position ("first weekend", "last Friday") keeps its rule when the
/// phone saves it, and is due on the same days the web shows it.
struct MonthlyPositionTests {
    func day(_ m: Int, _ d: Int, _ y: Int = 2026) -> Date {
        Calendar.current.date(from: DateComponents(year: y, month: m, day: d, hour: 9))!
    }

    func pattern(_ json: String) throws -> RecurrencePattern {
        try JSONDecoder().decode(RecurrencePattern.self, from: Data(json.utf8))
    }

    @Test func aPositionSurvivesARoundTrip() throws {
        let p = try pattern(#"{"type":"monthly","week_of_month":-1,"day_of_week":"fri"}"#)
        let back = try JSONSerialization.jsonObject(with: JSONEncoder().encode(p)) as! [String: Any]
        #expect(back["week_of_month"] as? Int == -1)
        #expect(back["day_of_week"] as? String == "fri")
    }

    @Test func lastFridayIsTheMonthsLastFriday() throws {
        let p = try pattern(#"{"type":"monthly","week_of_month":-1,"day_of_week":"fri"}"#)
        #expect(RoutineRules.matches(p, on: day(10, 30)))   // Fri Oct 30, 2026
        #expect(!RoutineRules.matches(p, on: day(10, 23)))
        #expect(!RoutineRules.matches(p, on: day(10, 1)))   // the 1st was never the rule
    }

    @Test func firstWeekendIsAWindowSettledOnce() throws {
        let p = try pattern(#"{"type":"monthly","week_of_month":1,"day_of_week":"weekend"}"#)
        // October 2026: the first Saturday is the 3rd, with Sunday the 4th.
        #expect(RoutineRules.matches(p, on: day(10, 3)))
        #expect(RoutineRules.matches(p, on: day(10, 4)))
        #expect(!RoutineRules.matches(p, on: day(10, 10)))
        // Done Saturday: Saturday still shows it (ticked), Sunday goes quiet.
        #expect(RoutineRules.matches(p, on: day(10, 3), lastCompletedAt: day(10, 3)))
        #expect(!RoutineRules.matches(p, on: day(10, 4), lastCompletedAt: day(10, 3)))
    }

    @Test func positionWinsOverADayOfMonth() throws {
        let p = try pattern(#"{"type":"monthly","day_of_month":1,"week_of_month":2,"day_of_week":"tue"}"#)
        #expect(RoutineRules.matches(p, on: day(10, 13)))   // second Tuesday
        #expect(!RoutineRules.matches(p, on: day(10, 1)))
    }

    @Test func aThirtyFirstFallsOnAShortMonthsLastDay() {
        var p = RecurrencePattern(type: "monthly")
        p.dayOfMonth = 31
        #expect(RoutineRules.matches(p, on: day(9, 30)))
        #expect(RoutineRules.matches(p, on: day(10, 31)))
    }
}
