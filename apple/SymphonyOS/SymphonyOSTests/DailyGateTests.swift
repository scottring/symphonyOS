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
            #expect(!DailyGate.hidesDock(on: h, edition: .full, layout: l, barBuilt: true, horizons: all, layouts: shapes))
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

    @Test func todayAndWeekAreLightPagesBuilt() {
        #expect(DailyGate.horizons == [.today, .week, .month, .season, .year])
        #expect(DailyGate.shows(.today, edition: .light, layout: .oneColumn))
        #expect(!DailyGate.shows(.today, edition: .full, layout: .oneColumn))
        #expect(DailyGate.shows(.week, edition: .light, layout: .oneColumn))
        #expect(!DailyGate.shows(.week, edition: .full, layout: .oneColumn))
    }

    /// Month, Season and Year are the mountain at their own level, in a light household only;
    /// Week and Today are not mountain pages.
    @Test func theMountainPagesAreBuiltForLightOnly() {
        for h in [Horizon.month, .season, .year] {
            #expect(DailyGate.shows(h, edition: .light, layout: .oneColumn))
            #expect(!DailyGate.shows(h, edition: .full, layout: .oneColumn))
            #expect(!DailyGate.shows(h, edition: .light, layout: .glanceWide))
        }
        #expect(DailyGate.mountain(.year) == .year)
        #expect(DailyGate.mountain(.season) == .season)
        #expect(DailyGate.mountain(.month) == .month)
        #expect(DailyGate.mountain(.week) == nil)
        #expect(DailyGate.mountain(.today) == nil)
    }

    /// The bar is built: a light household's phone, upright, has the bar and no dock.
    @Test func theDockGivesWayNow() {
        #expect(DailyGate.barBuilt)
        #expect(DailyGate.hidesDock(on: .today, edition: .light, layout: .oneColumn))
        #expect(!DailyGate.hidesDock(on: .today, edition: .full, layout: .oneColumn))
        #expect(!DailyGate.hidesDock(on: .today, edition: .light, layout: .glanceWide))
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
        #expect(!DailyGate.hidesDock(on: .today, edition: .light, layout: .oneColumn, barBuilt: false, horizons: [.today]))
        #expect(!DailyGate.hidesDock(on: .today, edition: .light, layout: .oneColumn, barBuilt: true, horizons: []))
        #expect(DailyGate.hidesDock(on: .today, edition: .light, layout: .oneColumn, barBuilt: true, horizons: [.today]))
    }

    /// The dock is judged by the page on screen, not by Today being built: with all five pages
    /// built it gives way on every one of them, and only on a light window. A page this window
    /// does not draw light (the spread until Task 18, a phone or the outside screen on its side)
    /// keeps the dock, and so does a page the gate does not list, even while Today is built.
    @Test func theDockGivesWayOnEveryLightPageAndOnNoOther() {
        let shapes: [TodayLayout] = [.oneColumn, .glance, .glanceWide, .dayPage, .journal]
        for h in Horizon.allCases {
            #expect(DailyGate.hidesDock(on: h, edition: .light, layout: .oneColumn), "\(h)")
            for l in shapes {
                #expect(DailyGate.hidesDock(on: h, edition: .light, layout: l)
                        == DailyGate.shows(h, edition: .light, layout: l), "\(h) \(l)")
                #expect(!DailyGate.hidesDock(on: h, edition: .full, layout: l), "\(h) \(l)")
            }
            for l in [TodayLayout.journal, .glanceWide] {
                #expect(!DailyGate.hidesDock(on: h, edition: .light, layout: l), "\(h) \(l)")
            }
        }
        #expect(!DailyGate.hidesDock(on: .month, edition: .light, layout: .oneColumn, horizons: [.today, .week]))
        #expect(DailyGate.hidesDock(on: .week, edition: .light, layout: .oneColumn, horizons: [.today, .week]))
    }

    @Test func halfOpenIsLightOnly() {
        #expect(DailyGate.halfOpenBuilt)
        #expect(DailyGate.halfOpen(edition: .light))
        #expect(!DailyGate.halfOpen(edition: .full))
        for rows: [String?] in [["light", "full"], [nil], ["plus"]] {
            #expect(!DailyGate.halfOpen(edition: Edition.resolve(rows)))
        }
    }

    /// While the light half-open display is up the page under it is inert (drawn, out of reach), so
    /// nothing there can listen, write or answer a Tell. A full household's page is never touched.
    @Test func theLightHalfOpenDisplayCoversThePage() {
        #expect(DailyGate.coversPage(edition: .light, halfOpen: true))
        #expect(!DailyGate.coversPage(edition: .light, halfOpen: false))
        #expect(!DailyGate.coversPage(edition: .full, halfOpen: true))
        #expect(!DailyGate.coversPage(edition: .light, halfOpen: true, built: false))
    }

    /// Ruling D14: a page covered by the light half-open display never takes a Tell, whatever its
    /// bar is doing; the display's own bar is the one owner.
    @Test func aCoveredPageNeverTakesATell() {
        for walk in [false, true] { for bar in [false, true] { for off in [false, true] { for on in [false, true] {
            #expect(DailyGate.tell(asked: true, walkShowing: walk, barShown: bar, speechOff: off, listening: on,
                                   covered: true) == .covered)
            #expect(DailyGate.tell(asked: false, walkShowing: walk, barShown: bar, speechOff: off, listening: on,
                                   covered: true) == .none)
        } } } }
        #expect(!DailyGate.Tell.covered.takesRequest)
        #expect(DailyGate.tell(asked: true, walkShowing: false, barShown: true, speechOff: false, listening: false,
                               covered: false) == .listen)
    }

    /// Under the light display a light page stays (drawn, inert); only the old page is taken away.
    @Test func onlyTheOldPageIsTakenAwayUnderTheDisplay() {
        #expect(DailyGate.dropsPage(covered: true, lightPage: false))
        #expect(!DailyGate.dropsPage(covered: true, lightPage: true))
        #expect(!DailyGate.dropsPage(covered: false, lightPage: false))
        #expect(!DailyGate.dropsPage(covered: false, lightPage: true))
    }

    // MARK: The Duo (Task 17)

    /// The outside screen (`.glance`) and the inside screen held upright (`.dayPage`) draw the light
    /// pages; the spread (`.journal`, Task 18) and a short wide window (`.glanceWide`) do not yet,
    /// and a full household never does.
    @Test func theOutsideAndUprightInsideAreBuilt() {
        #expect(DailyGate.shows(.today, edition: .light, layout: .glance))
        #expect(DailyGate.shows(.today, edition: .light, layout: .dayPage))
        #expect(!DailyGate.shows(.today, edition: .light, layout: .journal))
        #expect(!DailyGate.shows(.today, edition: .light, layout: .glanceWide))
        for l in [TodayLayout.oneColumn, .glance, .glanceWide, .dayPage, .journal] {
            #expect(!DailyGate.shows(.today, edition: .full, layout: l), "\(l)")
        }
    }

    /// A window of each shape the gate lists, with safe insets it meets (the Duo's outside screen as
    /// its simulator reports it: 0 at the top, 34 at the foot, the system's 84-point column beside
    /// the page, which the page stands clear of, so the page is 382 wide).
    private let windows: [TodayLayout: (size: CGSize, top: CGFloat, bottom: CGFloat)] = [
        .oneColumn: (CGSize(width: 390, height: 844), 44, 34),
        .glance: (CGSize(width: 382, height: 678), 0, 34),
        .dayPage: (CGSize(width: 626, height: 890), 44, 34),
    ]

    /// A guard against the gate and the Planner disagreeing: every page the gate lists, on every
    /// window it lists, is a light page the Planner draws (never the full Planner under a hidden
    /// dock, nor the dock over a light page), and its numbers on such a window keep three rows and
    /// the bar on the window. A layout added to the gate must bring a window here.
    @Test func everyListedPageIsDrawnLightOnEveryListedWindow() {
        for l in DailyGate.layouts {
            guard let w = windows[l] else {
                Issue.record("the gate lists \(l), which has no window here")
                continue
            }
            for h in DailyGate.horizons {
                #expect(DailyGate.shows(h, edition: .light, layout: l), "\(h) \(l)")
                #expect(DailyGate.hidesDock(on: h, edition: .light, layout: l), "\(h) \(l)")
                #expect(!DailyGate.hidesDock(on: h, edition: .full, layout: l), "\(h) \(l)")
                #expect(!DailyGate.dropsPage(covered: true, lightPage: DailyGate.shows(h, edition: .light, layout: l)))

                let page = DailyGate.page(h)
                let shape = DailyMetrics.shape(for: l, height: w.size.height, safeTop: w.top, safeBottom: w.bottom,
                                               waiting: false)
                let m: DailyMetrics
                switch page {
                case .today:
                    #expect(h == .today)
                    m = DailyMetrics.today(size: w.size, safeTop: w.top, safeBottom: w.bottom, shape: shape)
                    #expect(m.rowsTop + 3 * m.row + 2 * m.rowGap <= m.bar.fade.minY, "\(h) \(l)")
                case .week:
                    #expect(h == .week)
                    m = DailyMetrics.week(size: w.size, safeTop: w.top, safeBottom: w.bottom, shape: shape)
                    #expect(m.rowsTop + DailyMetrics.weekDayTop + 3 * m.row + 2 * m.rowGap <= m.bar.fade.minY, "\(h) \(l)")
                case .mountain(let level):
                    #expect(DailyGate.mountain(h) == level)
                    m = DailyMetrics.today(size: w.size, safeTop: w.top, safeBottom: w.bottom, shape: shape)
                }
                let window = CGRect(x: 0, y: w.top, width: w.size.width, height: w.size.height - w.top - w.bottom)
                for r in m.touchTargets { #expect(window.contains(r), "\(h) \(l): \(r) off the window's safe part") }
            }
        }
        // Every horizon has a light page; the gate's own mountain rule agrees with it.
        for h in Horizon.allCases {
            switch DailyGate.page(h) {
            case .mountain(let level): #expect(DailyGate.mountain(h) == level)
            case .today, .week: #expect(DailyGate.mountain(h) == nil)
            }
        }
    }

    /// Ruling D14 leftover (a): a row's Details over a light page closes when the half-open display
    /// covers it, so the display's bar never listens behind a sheet; it stays open otherwise.
    @Test func coveringThePageClosesItsDetails() {
        #expect(!DailyGate.keepsDetails(covered: true))
        #expect(DailyGate.keepsDetails(covered: false))
        #expect(!DailyGate.keepsDetails(covered: DailyGate.coversPage(edition: .light, halfOpen: true)))
        #expect(DailyGate.keepsDetails(covered: DailyGate.coversPage(edition: .full, halfOpen: true)))
    }

    /// Leftover (c): the half-open display keeps the screen on only while half open and signed in.
    @Test func theScreenStaysOnOnlyHalfOpenAndSignedIn() {
        #expect(DailyGate.staysAwake(halfOpen: true, signedIn: true))
        #expect(!DailyGate.staysAwake(halfOpen: true, signedIn: false))
        #expect(!DailyGate.staysAwake(halfOpen: false, signedIn: true))
        #expect(!DailyGate.staysAwake(halfOpen: false, signedIn: false))
    }
}
