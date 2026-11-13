import Testing
import Foundation
import CoreGraphics
@testable import Symphony

private let now = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 13))!
private var env: WalkEnv { WalkEnv(periods: WalkPeriods.pick(now: now, weekStartsOn: 0), now: now) }

/// Health, Home kept; off the ground on a step; optionally one planted year flag.
private func state(step: Int, planted: Bool = false) -> WalkState {
    let health = WalkArea(id: UUID(), name: "Health")
    let home = WalkArea(id: UUID(), name: "Home")
    var s = WalkState()
    s.areas = [health, home]
    s.kept = [health.id, home.id]
    s.step = step
    if planted { s.items = [WalkItem(id: UUID(), level: .year, title: "Feel strong again", areaId: health.id)] }
    return s
}

private func polar(_ degrees: CGFloat, _ distance: CGFloat) -> CGPoint {
    let r = degrees * .pi / 180
    return CGPoint(x: WalkOrb.centre.x + distance * cos(r), y: WalkOrb.centre.y + distance * sin(r))
}

struct WalkOrbTests {
    @Test func thePointsShowWhileHeldOrOpen() {
        var s = state(step: 1)
        for (orb, shows) in [(WalkState.Orb.idle, false), (.open, true), (.holding(hover: nil), true),
                             (.holding(hover: .s), true), (.speaking(live: "x"), false)] {
            s.orb = orb
            #expect(s.showsPoints == shows)
        }
    }

    @Test func theUndoPillGivesWayToThePoints() {
        var s = state(step: 1, planted: true)
        s.undoShowing = true
        #expect(s.showsUndoPill)
        s.orb = .open; #expect(!s.showsUndoPill)
        s.orb = .holding(hover: .nw); #expect(!s.showsUndoPill)
        s.orb = .idle; #expect(s.showsUndoPill)
        s.undoShowing = false; #expect(!s.showsUndoPill)
    }

    @Test func pointsSitOnTheCompass() {
        #expect(WalkOrb.position(of: .s) == CGPoint(x: 195, y: 794))
        #expect(WalkOrb.position(of: .n) == CGPoint(x: 195, y: 562))
        #expect(WalkOrb.position(of: .w) == CGPoint(x: 79, y: 678))
        let ne = WalkOrb.position(of: .ne)
        #expect(abs(ne.x - 277) < 0.5 && abs(ne.y - 596) < 0.5)
    }

    @Test func slidingPicksTheNearestOfferedPoint() {
        #expect(WalkOrb.point(at: CGPoint(x: 195, y: 750), among: [.n, .s, .w]) == .s)
        #expect(WalkOrb.point(at: CGPoint(x: 195, y: 740), among: [.n, .s, .w]) == nil)
        #expect(WalkOrb.point(at: polar(-45, 100), among: [.n, .e]) == nil)
        #expect(WalkOrb.point(at: polar(-45, 100), among: [.n, .ne, .e]) == .ne)
        #expect(WalkOrb.point(at: polar(90 + 31, 100), among: [.s]) == .s)
        #expect(WalkOrb.point(at: polar(90 + 33, 100), among: [.s]) == nil)
    }

    @Test func aShortPressOpensThePoints() {
        var s = state(step: 1, planted: true)
        _ = s.apply(.orbDown, env)
        let fx = s.apply(.orbUp(heldMs: 100), env)
        #expect(s.orb == .open)
        #expect(fx.contains(.timer(.hold, ms: nil)))
    }

    @Test func aSecondShortPressClosesThem() {
        var s = state(step: 1, planted: true)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbUp(heldMs: 100), env)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbUp(heldMs: 100), env)
        #expect(s.orb == .idle)
    }

    @Test func holdingStartsListeningAndTheSoundsLineUp() {
        var s = state(step: 1)
        let down = s.apply(.orbDown, env)
        #expect(s.orb == .holding(hover: nil))
        #expect(down == [.sound(.bag, afterMs: 0), .sound(.poles, afterMs: 120), .timer(.hold, ms: WalkOrb.holdMs)])
        let held = s.apply(.orbHeld, env)
        #expect(s.orb == .speaking(live: ""))
        #expect(held == [.listen(true), .sound(.unfurl, afterMs: 280)])
    }

    @Test func lettingGoPlantsWhatWasHeard() {
        var s = state(step: 1)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbHeld, env)
        _ = s.apply(.heard("feel strong again"), env)
        #expect(s.orb == .speaking(live: "feel strong again"))
        let fx = s.apply(.orbUp(heldMs: 900), env)
        #expect(fx.first == .listen(false))
        #expect(s.items.map(\.title) == ["Feel strong again"])
        #expect(s.orb == .idle)
    }

    @Test func lettingGoWithNothingHeardPlantsNothing() {
        var s = state(step: 1)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbHeld, env)
        let fx = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.items.isEmpty)
        #expect(fx.first == .listen(false))
        #expect(s.orb == .idle)
    }

    @Test func slidingOutWhileSpeakingCancelsIt() {
        var s = state(step: 1, planted: true)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbHeld, env)
        _ = s.apply(.heard("something"), env)
        let fx = s.apply(.orbMoved(WalkOrb.position(of: .n)), env)
        #expect(fx.contains(.listen(false)))
        #expect(s.orb == .holding(hover: .n))
        let up = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.items.count == 1)
        #expect(!up.contains(.write(.create(s.items[0], parent: nil))))
    }

    @Test func enteringAPointTicksOnce() {
        var s = state(step: 1, planted: true)
        _ = s.apply(.orbDown, env)
        #expect(s.apply(.orbMoved(WalkOrb.position(of: .s)), env) == [.sound(.tick, afterMs: 0)])
        #expect(s.apply(.orbMoved(WalkOrb.position(of: .s)), env) == [])
        #expect(s.apply(.orbMoved(WalkOrb.centre), env) == [])
        #expect(s.orb == .holding(hover: nil))
    }

    @Test func aDirectionWithNoPointChoosesNothing() {
        var s = state(step: 1, planted: true)   // no Undo yet, so NW is not offered
        _ = s.apply(.orbDown, env)
        _ = s.apply(.orbMoved(polar(-135, 100)), env)
        #expect(s.orb == .holding(hover: nil))
        _ = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.step == 1 && s.orb == .idle)
    }

    @Test func lettingGoOnAPointChoosesIt() {
        var s = state(step: 1, planted: true)
        _ = s.apply(.orbDown, env)
        _ = s.apply(.orbMoved(WalkOrb.position(of: .s)), env)
        let fx = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.step == 2)
        #expect(s.orb == .idle)
        #expect(fx.contains(.save))
    }

    @Test func speechOffOpensTyping() {
        var s = state(step: 1)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbHeld, env)
        let fx = s.apply(.speechUnavailable, env)
        #expect(s.typing == "")
        #expect(s.note == WalkCopy.speechOff)
        #expect(s.orb == .idle)
        #expect(fx.contains(.listen(false)))
        #expect(fx.contains(.timer(.note, ms: WalkState.noteMs)))
        // Letting go afterwards leaves the field open and the orb usable.
        _ = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.typing == "" && s.orb == .idle)
        _ = s.apply(.typeDismissed, env)
        _ = s.apply(.orbDown, env)
        #expect(s.orb == .holding(hover: nil))
    }

    @Test func typingPlantsOnReturn() {
        var s = state(step: 1, planted: true)
        s.orb = .open
        _ = s.apply(.point(.w), env)
        #expect(s.typing == "" && s.orb == .idle)
        _ = s.apply(.typeChanged("run a 5K"), env)
        _ = s.apply(.typeSubmitted, env)
        #expect(s.items.map(\.title).contains("Run a 5K"))
        #expect(s.typing == nil)

        var t = state(step: 1)
        t.typing = ""
        let before = t.items
        _ = t.apply(.typeSubmitted, env)
        #expect(t.items == before && t.typing == nil)
    }

    @Test func dismissingTypingClosesTheField() {
        var s = state(step: 1)
        s.typing = "half"
        _ = s.apply(.typeDismissed, env)
        #expect(s.typing == nil && s.items.isEmpty)
    }

    @Test func theOrbIgnoresPressesWhileTyping() {
        var s = state(step: 1)
        s.typing = "ab"
        #expect(s.apply(.orbDown, env) == [])
        #expect(s.orb == .idle)
        var t = state(step: 1)
        _ = t.apply(.orbDown, env); _ = t.apply(.orbHeld, env)
        #expect(t.apply(.orbDown, env) == [])
        #expect(t.orb == .speaking(live: ""))
    }

    @Test func aPointChosenWhileOpenActsAndCloses() {
        var s = state(step: 1, planted: true)
        s.orb = .open
        _ = s.apply(.point(.s), env)
        #expect(s.step == 2 && s.orb == .idle)
        var t = state(step: 1, planted: true)
        t.orb = .open
        _ = t.apply(.point(.nw), env)       // not offered
        #expect(t.step == 1 && t.orb == .open)
    }

    @Test func onWelcomeAHoldKeepsThePointsOpen() {
        var s = WalkState()
        let down = s.apply(.orbDown, env)
        #expect(down == [])
        _ = s.apply(.orbHeld, env)
        #expect(s.orb == .holding(hover: nil))   // never speaks on Welcome
        _ = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.orb == .open)
    }

    @Test func aCancelledTouchLeavesNothingListening() {
        var s = state(step: 1)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbHeld, env)
        let fx = s.apply(.orbCancelled, env)
        #expect(s.orb == .idle)
        #expect(fx.contains(.listen(false)))
        #expect(fx.contains(.timer(.hold, ms: nil)))
        #expect(s.items.isEmpty)
    }
}
