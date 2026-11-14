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

    @Test func theLineAtTheTopOfTodayResumesOrStartsTheWalk() {
        // Left with Leave for now: it waits, and the line picks it back up.
        #expect(DailyGate.walkLine(position(.paused), goalCount: 3, edition: .light) == .waiting)
        #expect(DailyGate.walkLine(position(.paused, step: 0), goalCount: 0, edition: .light) == .waiting)
        // Not now at Welcome with no goals at all: the line starts it from the top.
        #expect(DailyGate.walkLine(position(.left, step: 0), goalCount: 0, edition: .light) == .whenReady)
        // Not after one goal exists, nor for a walk in progress, finished or never stored.
        #expect(DailyGate.walkLine(position(.left, step: 0), goalCount: 1, edition: .light) == nil)
        #expect(DailyGate.walkLine(position(.inProgress), goalCount: 0, edition: .light) == nil)
        #expect(DailyGate.walkLine(position(.finished), goalCount: 0, edition: .light) == nil)
        #expect(DailyGate.walkLine(nil, goalCount: 0, edition: .light) == nil)
        // Never in a full household.
        #expect(DailyGate.walkLine(position(.paused), goalCount: 0, edition: .full) == nil)
        #expect(DailyGate.walkLine(position(.left, step: 0), goalCount: 0, edition: .full) == nil)
    }

    @Test func todayIsTheLightPageBuilt() {
        #expect(DailyGate.horizons.isSuperset(of: [.today, .week]))
        #expect(DailyGate.shows(.today, edition: .light, layout: .oneColumn))
        #expect(!DailyGate.shows(.today, edition: .full, layout: .oneColumn))
        #expect(DailyGate.shows(.week, edition: .light, layout: .oneColumn))
        #expect(!DailyGate.shows(.week, edition: .full, layout: .oneColumn))
    }

    /// The bar is built: a light household's phone, upright, has the bar and no dock.
    @Test func theDockGivesWayNow() {
        #expect(DailyGate.barBuilt)
        #expect(DailyGate.hidesDock(edition: .light, layout: .oneColumn))
        #expect(!DailyGate.hidesDock(edition: .full, layout: .oneColumn))
        #expect(!DailyGate.hidesDock(edition: .light, layout: .glanceWide))
    }

    /// Review Focus 1: a light household whose phone cannot recognise speech on its own never
    /// listens through a server, at the bar or in Tell; a full household's Tell is as it always was.
    /// (The bar's own listener is pinned in `DailyModelTests`, which is iOS only.)
    @Test func lightSpeechStaysOnThePhone() {
        #expect(Dictation.mayListen(onDeviceOnly: DailyGate.speechOnPhoneOnly(edition: .light), supportsOnDevice: false) == false)
        #expect(Dictation.mayListen(onDeviceOnly: DailyGate.speechOnPhoneOnly(edition: .light), supportsOnDevice: true) == true)
        #expect(Dictation.mayListen(onDeviceOnly: DailyGate.speechOnPhoneOnly(edition: .full), supportsOnDevice: false) == true)
    }

    /// What a Tell from outside does on a light page: nothing unasked; it waits while the walk
    /// shows, whatever the bar is doing; with no bar the old sheet; otherwise listen, type, or
    /// leave a listen already going alone. Only waiting (and nothing) keep the request.
    @Test func aTellWaitsForTheWalkAndThenListensTypesOrLeavesAlone() {
        for walk in [false, true] { for bar in [false, true] { for off in [false, true] { for on in [false, true] {
            #expect(DailyGate.tell(asked: false, walkShowing: walk, barShown: bar, speechOff: off, listening: on) == .none)
            #expect(DailyGate.tell(asked: true, walkShowing: true, barShown: bar, speechOff: off, listening: on) == .wait)
        } } } }
        #expect(DailyGate.tell(asked: true, walkShowing: false, barShown: false, speechOff: false, listening: false) == .oldSheet)
        #expect(DailyGate.tell(asked: true, walkShowing: false, barShown: true, speechOff: false, listening: false) == .listen)
        #expect(DailyGate.tell(asked: true, walkShowing: false, barShown: true, speechOff: true, listening: false) == .focusField)
        #expect(DailyGate.tell(asked: true, walkShowing: false, barShown: true, speechOff: false, listening: true) == .leaveAlone)
        #expect(!DailyGate.Tell.none.takesRequest && !DailyGate.Tell.wait.takesRequest)
        for taken in [DailyGate.Tell.listen, .focusField, .leaveAlone, .oldSheet] { #expect(taken.takesRequest) }
    }

    @Test func theDockGivesWayOnlyWithTheBarAndToday() {
        #expect(!DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: false, horizons: [.today]))
        #expect(!DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: true, horizons: []))
        #expect(DailyGate.hidesDock(edition: .light, layout: .oneColumn, barBuilt: true, horizons: [.today]))
    }
}
