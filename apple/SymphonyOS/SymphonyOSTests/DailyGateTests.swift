import Testing
import Foundation
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// A stored walk with this status, on this step.
private func position(_ status: WalkStatus, step: Int = 3) -> WalkPosition {
    let p = WalkPeriods.pick(now: day(2026, 11, 10), weekStartsOn: 0)
    var out = WalkPosition(WalkState(), status: status, planted: [], periods: p, now: p.today)
    out.step = step
    return out
}

struct DailyGateTests {
    @Test func fullIsNeverReplaced() {
        let all = Set(Horizon.allCases), shapes: Set<TodayLayout> = [.oneColumn, .glance, .glanceWide, .dayPage, .journal]
        for h in all { for l in shapes {
            #expect(!DailyGate.shows(h, edition: .full, layout: l, horizons: all, layouts: shapes))
            #expect(!DailyGate.hidesDock(edition: .full, layout: l, barBuilt: true, horizons: all, layouts: shapes))
        } }
        #expect(!DailyGate.halfOpen(edition: .full, built: true))
    }

    @Test func mixedOrUnknownEditionsAreFull() {     // the gate is the household edition
        for rows: [String?] in [["light", "full"], [nil], ["light", nil], ["plus"]] {
            #expect(!DailyGate.shows(.today, edition: Edition.resolve(rows), layout: .oneColumn, horizons: [.today]))
        }
    }

    @Test func lightGetsOnlyWhatIsBuilt() {
        #expect(DailyGate.shows(.today, edition: .light, layout: .oneColumn, horizons: [.today], layouts: [.oneColumn]))
        #expect(!DailyGate.shows(.week, edition: .light, layout: .oneColumn, horizons: [.today], layouts: [.oneColumn]))
        #expect(!DailyGate.shows(.today, edition: .light, layout: .journal, horizons: [.today], layouts: [.oneColumn]))
        #expect(DailyGate.halfOpen(edition: .light, built: true))
        #expect(!DailyGate.halfOpen(edition: .light, built: false))
    }

    @Test func sidewaysKeepsTheOldScreens() { #expect(!DailyGate.layouts.contains(.glanceWide)) }

    @Test func lightSpeechIsPhoneOnlyAndFullIsAsBefore() {
        #expect(DailyGate.speechOnPhoneOnly(edition: .light)); #expect(!DailyGate.speechOnPhoneOnly(edition: .full))
    }

    @Test func aWalkLeftPartWayIsWaiting() {
        // Leave for now stores the walk as paused, on whatever step it was on.
        #expect(DailyGate.walkIsWaiting(position(.paused)))
        #expect(DailyGate.walkIsWaiting(position(.paused, step: 0)))
        #expect(DailyGate.walkIsWaiting(position(.paused, step: 1)))
        // Nothing stored, a walk still going, one finished, or one declined at Welcome: not waiting.
        #expect(!DailyGate.walkIsWaiting(nil))
        #expect(!DailyGate.walkIsWaiting(position(.inProgress)))
        #expect(!DailyGate.walkIsWaiting(position(.finished)))
        #expect(!DailyGate.walkIsWaiting(position(.left, step: 0)))
    }

    @Test func aDeclinedWalkWithNoGoalsOffersIt() {
        // Not now at Welcome stores the walk as left, on step 0.
        #expect(DailyGate.walkIsOffered(position(.left, step: 0), goalCount: 0, edition: .light))
        #expect(!DailyGate.walkIsOffered(position(.left, step: 0), goalCount: 0, edition: .full))
        // Only a declined walk: nothing stored, paused (that line is walkWaiting's), going or finished say nothing.
        #expect(!DailyGate.walkIsOffered(nil, goalCount: 0, edition: .light))
        #expect(!DailyGate.walkIsOffered(position(.paused, step: 0), goalCount: 0, edition: .light))
        #expect(!DailyGate.walkIsOffered(position(.inProgress), goalCount: 0, edition: .light))
        #expect(!DailyGate.walkIsOffered(position(.finished), goalCount: 0, edition: .light))
    }

    @Test func aDeclinedWalkWithGoalsSaysNothing() {
        #expect(!DailyGate.walkIsOffered(position(.left, step: 0), goalCount: 1, edition: .light))
        #expect(!DailyGate.walkIsOffered(position(.left, step: 0), goalCount: 12, edition: .light))
    }

    @Test func theDockGivesWayOnlyWithTheBarAndToday() {
        #expect(!DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: false, horizons: [.today]))
        #expect(!DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: true, horizons: []))
        #expect(DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: true, horizons: [.today]))
    }
}
