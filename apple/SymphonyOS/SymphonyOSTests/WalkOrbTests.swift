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
                             (.holding(hover: .s), true), (.speaking(live: "x"), false),
                             (.finishing(live: "x"), false)] {
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
        _ = s.apply(.orbUp(heldMs: 900), env)
        let fx = s.apply(.listenEnded, env)
        #expect(fx.first == .listen(false))
        #expect(s.items.map(\.title) == ["Feel strong again"])
        #expect(s.orb == .idle)
    }

    @Test func lettingGoWithNothingHeardPlantsNothing() {
        var s = state(step: 1)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbHeld, env)
        _ = s.apply(.orbUp(heldMs: 900), env)
        let fx = s.apply(.listenEnded, env)
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

    // MARK: Letting go waits for the last words; a quiet hold is not "speech is off"

    /// Press and hold until speaking, and optionally hear some words.
    private func speak(_ s: inout WalkState, _ words: String? = nil) {
        _ = s.apply(.orbDown, env); _ = s.apply(.orbHeld, env)
        if let words { _ = s.apply(.heard(words), env) }
    }

    @Test func lettingGoWaitsForTheLastWords() {
        var s = state(step: 1)
        speak(&s, "finish the")
        let up = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.orb == .finishing(live: "finish the"))
        #expect(up == [.timer(.hold, ms: nil), .timer(.finish, ms: WalkOrb.finishMs), .finishListening])
        #expect(s.items.isEmpty)
        #expect(!s.showsPoints)
        _ = s.apply(.heard("finish the bathroom"), env)
        #expect(s.orb == .finishing(live: "finish the bathroom"))
        #expect(s.items.isEmpty)
        let end = s.apply(.listenEnded, env)
        #expect(s.items.map(\.title) == ["Finish the bathroom"])
        #expect(s.orb == .idle)
        #expect(end.contains(.timer(.finish, ms: nil)))
        // Whichever of the end and the timer comes second changes nothing.
        #expect(s.apply(.finishExpired, env) == [])
        #expect(s.apply(.listenEnded, env) == [])
        #expect(s.items.count == 1)
    }

    @Test func theFinishTimerPlantsWhatWasHeard() {
        var s = state(step: 1)
        speak(&s, "feel strong again")
        _ = s.apply(.orbUp(heldMs: 900), env)
        let fx = s.apply(.finishExpired, env)
        #expect(s.items.map(\.title) == ["Feel strong again"])
        #expect(fx.first == .listen(false))                    // gave up waiting: the listener is cancelled
        #expect(s.apply(.listenEnded, env) == [])
        _ = s.apply(.heard("late"), env)
        #expect(s.orb == .idle && s.items.count == 1)
    }

    @Test func aNewHoldWhileFinishingPlantsTheFirstFlagFirst() {
        var s = state(step: 1)
        speak(&s, "feel strong again")
        _ = s.apply(.orbUp(heldMs: 900), env)
        let down = s.apply(.orbDown, env)
        #expect(s.items.map(\.title) == ["Feel strong again"])
        #expect(s.orb == .holding(hover: nil))
        #expect(down.contains(.listen(false)))
        #expect(down.contains(.timer(.hold, ms: WalkOrb.holdMs)))
        _ = s.apply(.finishExpired, env)
        #expect(s.items.count == 1)
    }

    @Test func slidingOutOrACancelNeverFinishes() {
        var s = state(step: 1, planted: true)
        speak(&s, "something")
        let slide = s.apply(.orbMoved(WalkOrb.position(of: .n)), env)
        #expect(slide.contains(.listen(false)) && !slide.contains(.finishListening))
        var t = state(step: 1)
        speak(&t, "something")
        let cancel = t.apply(.orbCancelled, env)
        #expect(cancel.contains(.listen(false)) && !cancel.contains(.finishListening))
        #expect(t.items.isEmpty && t.orb == .idle)
    }

    @Test func aFirstEmptyHoldIsAQuietNoteTheSecondOpensTyping() {
        var s = state(step: 1)
        speak(&s)
        _ = s.apply(.orbUp(heldMs: 900), env)
        let first = s.apply(.listenEnded, env)
        #expect(s.note == WalkCopy.nothingToPlant && s.typing == nil && s.items.isEmpty)
        #expect(first.filter { if case .timer(.note, _) = $0 { return true } else { return false } }.count == 1)
        speak(&s)
        _ = s.apply(.orbUp(heldMs: 900), env)
        let second = s.apply(.finishExpired, env)
        #expect(s.typing == "" && s.note == WalkCopy.nothingHeard && s.items.isEmpty)
        #expect(second.filter { if case .timer(.note, _) = $0 { return true } else { return false } }.count == 1)
    }

    @Test func aPlantBetweenEmptyHoldsStartsTheCountAgain() {
        var s = state(step: 1)
        speak(&s); _ = s.apply(.orbUp(heldMs: 900), env); _ = s.apply(.listenEnded, env)
        speak(&s, "feel strong"); _ = s.apply(.orbUp(heldMs: 900), env); _ = s.apply(.listenEnded, env)
        speak(&s); _ = s.apply(.orbUp(heldMs: 900), env); _ = s.apply(.listenEnded, env)
        #expect(s.typing == nil && s.note == WalkCopy.nothingToPlant)
        // A typed plant resets it too.
        _ = s.act(.type, env); _ = s.apply(.typeChanged("run a 5K"), env); _ = s.apply(.typeSubmitted, env)
        speak(&s); _ = s.apply(.orbUp(heldMs: 900), env); _ = s.apply(.listenEnded, env)
        #expect(s.typing == nil && s.note == WalkCopy.nothingToPlant)
        #expect(s.items.map(\.title) == ["Feel strong", "Run a 5K"])
    }

    @Test func onceSpeechIsOffAHoldOpensTypingStraightAway() {
        var s = state(step: 1)
        speak(&s)
        _ = s.apply(.speechUnavailable, env)
        #expect(s.speechIsOff)
        _ = s.apply(.orbUp(heldMs: 900), env)
        _ = s.apply(.typeDismissed, env); _ = s.apply(.noteExpired, env)
        _ = s.apply(.orbDown, env)
        let held = s.apply(.orbHeld, env)
        #expect(!held.contains(.listen(true)))
        #expect(!held.contains(.sound(.unfurl, afterMs: 280)))
        #expect(s.orb == .idle && s.typing == "" && s.note == WalkCopy.speechOff)
        _ = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.typing == "" && s.orb == .idle)
    }

    @Test func aSessionThatEndsMidHoldWithNothingOpensTyping() {
        var s = state(step: 1)
        speak(&s)
        _ = s.apply(.listenEnded, env)
        #expect(s.orb == .idle && s.typing == "" && s.note == WalkCopy.speechOff)
        #expect(!s.speechIsOff)                                // an interruption is not a refusal: the next hold tries again
        _ = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.typing == "" && s.orb == .idle)
    }

    @Test func aSessionThatEndsMidHoldKeepsItsWordsAndPlantsOnRelease() {
        var s = state(step: 1)
        speak(&s, "feel strong again")
        #expect(s.apply(.listenEnded, env) == [])
        #expect(s.orb == .speaking(live: "feel strong again"))
        let up = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.items.map(\.title) == ["Feel strong again"])
        #expect(!up.contains(.finishListening))
        #expect(!up.contains(.timer(.finish, ms: WalkOrb.finishMs)))
        #expect(s.orb == .idle)
    }

    @Test func speechReadyIsAQuietNoteOnlyWhenNothingElseShows() {
        var s = state(step: 1)
        #expect(s.apply(.speechReady, env) == [.timer(.note, ms: WalkState.noteMs)])
        #expect(s.note == WalkCopy.speakNow)
        var noted = state(step: 1); noted.note = "Other"
        _ = noted.apply(.speechReady, env); #expect(noted.note == "Other")
        var typing = state(step: 1); typing.typing = ""
        _ = typing.apply(.speechReady, env); #expect(typing.note == nil)
        var held = state(step: 1); speak(&held)
        _ = held.apply(.speechReady, env); #expect(held.note == nil)
    }
}
