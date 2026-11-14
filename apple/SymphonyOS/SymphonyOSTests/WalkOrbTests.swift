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
        var s = state(step: 1, planted: true)   // no Undo yet, so SE is not offered
        _ = s.apply(.orbDown, env)
        _ = s.apply(.orbMoved(polar(45, 100)), env)
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
        _ = s.apply(.typeSubmitted("run a 5K"), env)
        #expect(s.items.map(\.title).contains("Run a 5K"))
        #expect(s.typing == nil)

        var t = state(step: 1)
        t.typing = ""
        let before = t.items
        _ = t.apply(.typeSubmitted(""), env)
        #expect(t.items == before && t.typing == nil)
    }

    @Test func dismissingTypingClosesTheField() {
        var s = state(step: 1)
        s.typing = "half"
        _ = s.apply(.typeDismissed, env)
        #expect(s.typing == nil && s.items.isEmpty)
    }

    /// Return and the field losing focus may reach the walk in either order: the submit
    /// carries the field's words, so they are planted either way. Tapping away (a dismiss
    /// with no return) still discards them, and the light is usable at once.
    @Test func aTypedFlagDoesNotDependOnTheOrderOfReturnAndBlur() {
        var s = state(step: 1, planted: true)
        _ = s.act(.type, env)
        _ = s.apply(.typeChanged("run a 5K"), env)
        _ = s.apply(.typeDismissed, env)                         // the blur first
        let fx = s.apply(.typeSubmitted("run a 5K"), env)
        #expect(s.items.map(\.title) == ["Feel strong again", "Run a 5K"])
        #expect(s.typing == nil)
        #expect(fx.contains(.save))

        var t = state(step: 1, planted: true)
        _ = t.act(.type, env)
        _ = t.apply(.typeChanged("half a thought"), env)
        _ = t.apply(.typeDismissed, env)                         // tapping away: no return follows
        #expect(t.items.count == 1 && t.typing == nil)
        _ = t.apply(.orbDown, env)
        #expect(t.orb == .holding(hover: nil))
        // A stray empty submit with the field already closed does nothing.
        var u = state(step: 1)
        #expect(u.apply(.typeSubmitted(""), env) == [])
        #expect(u.note == nil)
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
        _ = t.apply(.point(.se), env)       // not offered (Undo, with nothing to undo)
        #expect(t.step == 1 && t.orb == .open)
    }

    /// Welcome opens with its two other choices showing above the light, behind them the veil;
    /// a tap on one chooses it, the light at rest or not, and a tap on the veil keeps them.
    @Test func welcomeStartsWithItsPointsShowing() {
        let welcome = WalkState()
        #expect(welcome.showsPoints && welcome.showsVeil)
        #expect(WalkCopy.hint(welcome) == WalkCopy.hintChoose)
        #expect(welcome.lightSymbol == "figure.walk")
        #expect(WalkCopy.nextLine(welcome, env.periods)
                == WalkCopy.NextLine(text: WalkCopy.quickStart, action: .quick, skip: false, detail: WalkCopy.quickDetail))
        #expect(!welcome.showsMore)
        var s = welcome
        _ = s.apply(.point(.nw), env)
        #expect(s.step == 1 && s.ground && s.depth == .full)
        var t = welcome
        _ = t.apply(.veilTapped, env)
        #expect(t.showsPoints && t.step == 0)
        _ = t.apply(.point(.ne), env)
        #expect(t.ended)
    }

    /// On Welcome a tap on the light, a hold on it, and a tap on the line under it each do exactly
    /// what choosing the quick start does (the old bottom point): the same state and effects (the
    /// light's press also lets go of its hold timer, as every press does).
    @Test func onWelcomeTheLightIsTheQuickStart() {
        var chosen = WalkState()
        chosen.orb = .open
        let point = chosen.act(.quick, env)
        chosen.orb = .idle
        for heldMs in [80, 900] {
            var light = WalkState()
            _ = light.apply(.orbDown, env)
            if heldMs > WalkOrb.holdMs { _ = light.apply(.orbHeld, env) }
            let up = light.apply(.orbUp(heldMs: heldMs), env)
            #expect(light == chosen, "held \(heldMs)")
            #expect(up.filter { $0 != .timer(.hold, ms: nil) } == point)
        }
        var line = WalkState()
        #expect(line.apply(.nextTapped, env) == point)
        #expect(line == chosen)
    }

    /// "More" opens the compass exactly as a tap on the light does (the light's press also
    /// sounds and times its hold); not on Welcome, while open, typing or being taught.
    @Test func moreOpensTheCompassAsATapOnTheLight() {
        var byLight = state(step: 2, planted: true)
        var byMore = byLight
        #expect(byMore.showsMore)
        _ = byLight.apply(.orbDown, env); _ = byLight.apply(.orbUp(heldMs: 80), env)
        #expect(byMore.apply(.moreTapped, env) == [])
        #expect(byMore == byLight && byMore.orb == .open)
        #expect(!byMore.showsMore)
        // With speech off a tap on the light types; More still opens the choices.
        var off = state(step: 2); off.speechIsOff = true
        _ = off.apply(.moreTapped, env)
        #expect(off.orb == .open && off.typing == nil)
        for var s in [WalkState(), { var t = state(step: 2); t.typing = ""; return t }()] {
            let before = s
            #expect(s.apply(.moreTapped, env) == [] && s == before)
        }
        // While the light is taught More shows (the lesson points to it): a tap puts the lesson away and
        // opens the choices, and nothing else changes; the lesson stays taught (it is not shown again).
        for off in [false, true] {
            var taught = onTheGround(); taught.speechIsOff = off
            _ = taught.act(.next, env)
            #expect(taught.teaching && taught.showsMore)
            var expected = taught
            expected.teaching = false
            expected.orb = .open
            #expect(taught.apply(.moreTapped, env) == [])
            #expect(taught == expected && taught.taught)
            _ = taught.apply(.veilTapped, env); _ = taught.act(.next, env)
            #expect(!taught.teaching)
        }
    }

    /// The Next line does exactly what the south point does, in every state where either shows.
    @Test func theNextLineIsTheSouthPoint() throws {
        let health = WalkArea(id: UUID(), name: "Health"), home = WalkArea(id: UUID(), name: "Home")
        let goal = WalkItem(id: UUID(), level: .year, title: "Feel strong again", areaId: health.id)
        let week = WalkItem(id: UUID(), level: .week, title: "Gym", areaId: health.id)
        var states: [WalkState] = []
        for step in 1...5 {
            var s = WalkState()
            s.areas = [health, home]; s.kept = [health.id, home.id]; s.step = step
            states.append(s)
            s.items = [goal, week] + (step > 1 && step < 5 ? [WalkItem(id: UUID(), level: WalkLevel(rawValue: step)!, title: "x")] : [])
            if step == 5 { s.firstThing = week.id }
            states.append(s)
            if step == 5 { s.firstThing = nil; s.focus[.today] = week.id; states.append(s) }
            s.undo = [.plant(goal.id)]; states.append(s)
        }
        var ground = WalkState(); ground.areas = [health, home]; ground.step = 1; ground.ground = true
        states.append(ground); ground.kept = [health.id]; states.append(ground)
        var tour = WalkState(); tour.areas = [health, home]; tour.kept = [health.id, home.id]; tour.step = 1
        tour.depth = .full; tour.items = [goal]; tour.focusArea = health.id; tour.tour = [home.id]
        states.append(tour)
        for s in states {
            let line = try #require(WalkCopy.nextLine(s, env.periods))
            let south = try #require(WalkCopy.points(s, env.periods).first { $0.at == .s })
            #expect(line.text == south.label && line.action == south.action)
            var byLine = s
            var byPoint = s
            byPoint.orb = .open
            let lineEffects = byLine.apply(.nextTapped, env)
            let pointEffects = byPoint.apply(.point(.s), env)
            #expect(byLine == byPoint, "step \(s.step) ground \(s.ground)")
            #expect(lineEffects == pointEffects, "step \(s.step) ground \(s.ground)")
        }
        // Where the line is not shown (the compass open, typing), a stray tap does nothing.
        var open = states[1]; open.orb = .open
        #expect(open.apply(.nextTapped, env) == [] && open.step == states[1].step)
    }

    /// With the compass open, a tap on the veil closes it and changes nothing else.
    @Test func aTapOnTheVeilClosesTheCompass() {
        var s = state(step: 2, planted: true)
        s.undo = [.plant(UUID())]; s.undoShowing = true; s.note = "A note"
        s.orb = .open
        var expected = s
        expected.orb = .idle
        #expect(s.apply(.veilTapped, env) == [])
        #expect(s == expected)
        // Closed already: nothing.
        #expect(s.apply(.veilTapped, env) == [] && s == expected)
    }

    /// Leave for now, on every step after Welcome: the walk ends, paused where it is; nothing
    /// is written (the position is saved by the end). Not on Welcome or Look back up.
    @Test func leaveForNowEndsTheWalkPaused() {
        var ground = state(step: 1); ground.ground = true
        for var s in [ground] + (1...5).map({ state(step: $0, planted: true) }) {
            #expect(WalkCopy.points(s, env.periods).contains {
                $0.at == .nw && $0.action == .leave && $0.label == WalkCopy.leaveForNow && $0.detail == WalkCopy.leaveDetail
            })
            let step = s.step
            s.orb = .open
            #expect(s.apply(.point(.nw), env) == [.timer(.finish, ms: nil), .end(.paused)])
            #expect(s.ended && s.step == step && s.orb == .idle)
        }
        for step in [0, 6] {
            var s = state(step: step)
            #expect(s.act(.leave, env) == [])
            #expect(!s.ended)
        }
    }

    // MARK: The light, taught once

    /// The ground, Health kept, about to walk on to Year (the first step where holding answers).
    private func onTheGround() -> WalkState {
        var s = state(step: 1)
        s.ground = true
        return s
    }

    /// Walking on from the ground teaches the light, once: the veil, no Next line, no hint; going
    /// down and back up does not teach it again, nor does the next step.
    @Test func theLightIsTaughtOnceOnTheFirstStepThatListens() {
        var s = onTheGround()
        #expect(!s.teaching && !s.taught)
        _ = s.act(.next, env)
        #expect(s.step == 1 && !s.ground)
        #expect(s.teaching && s.taught)
        #expect(s.showsVeil && !s.showsNextLine && !s.showsPoints)
        #expect(WalkCopy.hint(s) == "")
        _ = s.apply(.veilTapped, env)
        #expect(!s.teaching)
        _ = s.act(.next, env)                       // Season
        #expect(!s.teaching)
        _ = s.act(.back, env); _ = s.act(.back, env) // Year, then the ground
        _ = s.act(.next, env)                       // Year again
        #expect(!s.teaching)
        // Skipping straight past the ground with nothing kept teaches it too.
        var skip = onTheGround(); skip.kept = []
        _ = skip.act(.next, env)
        #expect(skip.teaching)
    }

    /// A tap anywhere puts it away and changes nothing else.
    @Test func aTapOnTheVeilPutsTheLessonAway() {
        var s = onTheGround()
        _ = s.act(.next, env)
        var expected = s
        expected.teaching = false
        #expect(s.apply(.veilTapped, env) == [])
        #expect(s == expected)
        #expect(s.orb == .idle)                     // the compass was not opened
    }

    /// Holding the light puts it away and listens in the same gesture.
    @Test func holdingTheLightPutsTheLessonAwayAndListens() {
        var s = onTheGround()
        _ = s.act(.next, env)
        let down = s.apply(.orbDown, env)
        #expect(!s.teaching)
        #expect(down == [.sound(.bag, afterMs: 0), .sound(.poles, afterMs: 120), .timer(.hold, ms: WalkOrb.holdMs)])
        #expect(s.apply(.orbHeld, env) == [.listen(true), .sound(.unfurl, afterMs: 280)])
        #expect(s.orb == .speaking(live: ""))
    }

    /// During the lesson a tap on the light only puts it away, as a tap anywhere does: no typing,
    /// no choices. After it, a tap opens the other choices (the light means one thing: hold to speak).
    @Test func aTapOnTheLightOnlyPutsTheLessonAway() {
        var s = onTheGround()
        _ = s.act(.next, env)
        _ = s.apply(.orbDown, env)
        _ = s.apply(.orbUp(heldMs: 80), env)
        #expect(!s.teaching && s.typing == nil && s.orb == .idle)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbUp(heldMs: 80), env)
        #expect(s.orb == .open && s.typing == nil)
    }

    /// A compass point chosen through VoiceOver puts it away too.
    @Test func anyActionPutsTheLessonAway() {
        var s = onTheGround()
        _ = s.act(.next, env)
        _ = s.act(.examples, env)
        #expect(!s.teaching && s.examplesOn.contains(1))
    }

    /// A walk resumed from its saved place is not taught again; one that never was (left on the
    /// ground) is, on reaching Year; a save from before the lesson existed reads as taught; a fresh
    /// walk (a replay) is taught again.
    @Test func theLessonIsRememberedWithThePosition() throws {
        let p = env.periods
        var s = onTheGround()
        _ = s.act(.next, env)
        _ = s.apply(.veilTapped, env)
        let saved = WalkPosition(s, status: .inProgress, planted: [], periods: p, now: p.today)
        #expect(saved.taught)
        var resumed = WalkState()
        saved.apply(to: &resumed)
        #expect(resumed.taught && !resumed.teaching)
        _ = resumed.act(.next, env)
        #expect(!resumed.teaching)
        let roundTrip = try JSONDecoder.walk.decode(WalkPosition.self, from: JSONEncoder.walk.encode(saved))
        #expect(roundTrip.taught)

        let onGround = WalkPosition(onTheGround(), status: .inProgress, planted: [], periods: p, now: p.today)
        #expect(!onGround.taught)
        var picked = WalkState()
        onGround.apply(to: &picked)
        _ = picked.act(.next, env)
        #expect(picked.teaching)

        var object = try JSONSerialization.jsonObject(with: JSONEncoder.walk.encode(onGround)) as! [String: Any]
        object.removeValue(forKey: "taught")
        let old = try JSONDecoder.walk.decode(WalkPosition.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(old.taught)

        var replay = WalkState()                    // a replay starts from a fresh state
        replay.areas = s.areas
        _ = replay.act(.quick, env)
        _ = replay.act(.next, env)
        #expect(replay.teaching)
    }

    /// With speech off the lesson says to tap and type; a tap types, as it always does then.
    @Test func withSpeechOffTheLessonSaysTapAndType() {
        var s = onTheGround()
        s.speechIsOff = true
        _ = s.act(.next, env)
        #expect(s.teaching)
        #expect(WalkCopy.teaching(s) == [WalkCopy.teachSpeechOff])
        // The tap that puts the lesson away does only that; the next tap types, as it always does with speech off.
        _ = s.apply(.orbDown, env); _ = s.apply(.orbUp(heldMs: 80), env)
        #expect(!s.teaching && s.typing == nil)
        _ = s.apply(.orbDown, env); _ = s.apply(.orbUp(heldMs: 80), env)
        #expect(s.typing == "")
        #expect(s.lightSymbol == "keyboard")
        #expect(WalkCopy.hint({ var t = s; t.typing = nil; return t }()) == "Tap the light and type.")
    }

    /// What the light carries: a microphone at rest, a keyboard once speech is off, a walking figure
    /// on Welcome (it is the quick start), nothing while it is pressed, listening or waiting for the last words.
    /// Final wave: the light is a control that starts recording to VoiceOver (`.startsMediaSession`)
    /// exactly where holding it listens: a question step with speech on.
    @Test func theLightStartsAMediaSessionWhereHoldingListens() {
        var s = state(step: 2)
        #expect(s.holdListens)
        #expect(state(step: 1).holdListens && state(step: 5).holdListens)
        s.speechIsOff = true
        #expect(!s.holdListens)
        #expect(!WalkState().holdListens)                       // Welcome: the light is the quick start
        #expect(!state(step: 6).holdListens)
    }

    @Test func theLightShowsWhatHoldingDoes() {
        var s = state(step: 2)
        #expect(s.lightSymbol == "mic")
        s.orb = .open; #expect(s.lightSymbol == "mic")
        for orb: WalkState.Orb in [.holding(hover: nil), .speaking(live: "x"), .finishing(live: "x")] {
            s.orb = orb; #expect(s.lightSymbol == nil)
        }
        s.orb = .idle; s.speechIsOff = true
        #expect(s.lightSymbol == "keyboard")
        #expect(WalkState().lightSymbol == "figure.walk")      // Welcome: the light is the quick start
        #expect(state(step: 6).lightSymbol == nil)
        var ground = state(step: 1); ground.ground = true
        #expect(ground.lightSymbol == nil)                     // the ground: quiet until the light is taught
        ground.speechIsOff = true
        #expect(ground.lightSymbol == nil)
    }

    /// On Welcome a slide let go where there is no choice leaves the choices as they are: it does not begin the quick start.
    @Test func onWelcomeASlideToNothingChoosesNothing() {
        var s = WalkState()
        _ = s.apply(.orbDown, env)
        _ = s.apply(.orbMoved(polar(90, 100)), env)           // straight down: no choice there
        #expect(s.orb == .holding(hover: nil))
        let up = s.apply(.orbUp(heldMs: 900), env)
        #expect(up == [.timer(.hold, ms: nil)])
        #expect(s.step == 0 && s.orb == .idle && s.showsPoints && !s.ended)
        // The next tap on the light still begins it.
        _ = s.apply(.orbDown, env); _ = s.apply(.orbUp(heldMs: 80), env)
        #expect(s.step == 1 && s.depth == .quick)
    }

    @Test func onWelcomeAHoldNeverSpeaks() {
        var s = WalkState()
        let down = s.apply(.orbDown, env)
        #expect(down == [])
        #expect(s.apply(.orbHeld, env) == [])
        #expect(s.orb == .holding(hover: nil))   // never speaks on Welcome: letting go begins the quick start
        // Sliding to a choice and letting go there chooses it, as before.
        _ = s.apply(.orbMoved(WalkOrb.position(of: .nw)), env)
        _ = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.step == 1 && s.depth == .full)
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

    // MARK: The second after letting go: anything else plants the waiting flag first

    /// Season with two year goals, the first focused, a flag said for it and let go:
    /// it waits for its last words.
    private func waitingOnSeason() -> (state: WalkState, focused: WalkItem, other: WalkItem) {
        var s = state(step: 2)
        let strong = WalkItem(id: UUID(), level: .year, title: "Feel strong again", areaId: s.kept[0])
        let bathroom = WalkItem(id: UUID(), level: .year, title: "Finish the bathroom", areaId: s.kept[1])
        s.items = [strong, bathroom]
        s.focus[.season] = strong.id
        speak(&s, "lift twice a week")
        _ = s.apply(.orbUp(heldMs: 900), env)
        return (s, strong, bathroom)
    }

    @Test func aParentTapWhileFinishingPlantsUnderTheParentShownAtRelease() throws {
        let waiting = waitingOnSeason()
        var s = waiting.state
        let (strong, bathroom) = (waiting.focused, waiting.other)
        #expect(s.orb == .finishing(live: "lift twice a week"))
        let fx = s.apply(.bannerTapped(bathroom.id), env)
        let planted = try #require(s.items.last)
        #expect(planted.title == "Lift twice a week")
        #expect(planted.parentId == strong.id)
        #expect(planted.areaId == strong.areaId)
        #expect(fx.contains(.write(.create(planted, parent: strong))))
        #expect(fx.contains(.timer(.finish, ms: nil)))
        #expect(s.focus[.season] == bathroom.id)                  // then the tap takes effect
        #expect(s.orb == .idle)
        #expect(s.apply(.finishExpired, env) == [])              // nothing waits any more
        #expect(s.items.count == 3)
    }

    @Test func aCompassActionWhileFinishingPlantsThenActs() throws {
        // Walk on, through VoiceOver: the flag lands on Year, then the walk goes to Season.
        var s = state(step: 1)
        speak(&s, "feel strong again")
        _ = s.apply(.orbUp(heldMs: 900), env)
        let fx = s.act(.next, env)
        #expect(s.items.map(\.title) == ["Feel strong again"])
        let planted = try #require(s.items.first)
        #expect(planted.level == .year)
        #expect(s.step == 2)
        #expect(fx.contains(.write(.create(planted, parent: nil))))
        #expect(s.apply(.listenEnded, env) == [])

        // Type it: planted, then the field opens.
        var t = state(step: 1)
        speak(&t, "finish the bathroom")
        _ = t.apply(.orbUp(heldMs: 900), env)
        _ = t.act(.type, env)
        #expect(t.items.map(\.title) == ["Finish the bathroom"])
        #expect(t.typing == "")

        // Undo: the flag is planted first, so Undo takes back that newest flag.
        var u = state(step: 1)
        speak(&u, "run a 5K")
        _ = u.apply(.orbUp(heldMs: 900), env)
        _ = u.apply(.undo, env)
        #expect(u.items.isEmpty)
        #expect(u.apply(.finishExpired, env) == [])
        #expect(u.items.isEmpty)
    }

    @Test func aPeakTapWhileFinishingPlantsOnThePeakFocusedAtRelease() {
        var s = state(step: 1)
        let (health, home) = (s.kept[0], s.kept[1])
        s.focusArea = health
        speak(&s, "learn the cello")                              // no area's words: the focused peak catches it
        _ = s.apply(.orbUp(heldMs: 900), env)
        _ = s.apply(.areaTapped(home), env)
        #expect(s.items.map(\.areaId) == [health])
        #expect(s.focusArea == home)
    }

    /// Timers and other quiet events do not cut the wait short: the last words can still come.
    @Test func quietEventsLeaveTheFlagWaiting() {
        var s = waitingOnSeason().state
        for event: WalkEvent in [.noteExpired, .undoExpired, .orbMoved(WalkOrb.centre), .orbHeld, .orbUp(heldMs: 10)] {
            _ = s.apply(event, env)
            #expect(s.orb == .finishing(live: "lift twice a week"), "\(event)")
        }
        _ = s.apply(.heard("lift twice a week, heavy"), env)
        _ = s.apply(.listenEnded, env)
        #expect(s.items.last?.title == "Lift twice a week, heavy")
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
        _ = s.act(.type, env); _ = s.apply(.typeChanged("run a 5K"), env); _ = s.apply(.typeSubmitted("run a 5K"), env)
        speak(&s); _ = s.apply(.orbUp(heldMs: 900), env); _ = s.apply(.listenEnded, env)
        #expect(s.typing == nil && s.note == WalkCopy.nothingToPlant)
        #expect(s.items.map(\.title) == ["Feel strong", "Run a 5K"])
    }

    /// Once speech is off for this walk the light shows a keyboard: a tap opens typing at
    /// once, and a hold (which cannot listen) opens the other choices and leaves them open.
    @Test func onceSpeechIsOffATapTypesAndAHoldOpensTheChoices() {
        var s = state(step: 1)
        speak(&s)
        _ = s.apply(.speechUnavailable, env)
        #expect(s.speechIsOff)
        _ = s.apply(.orbUp(heldMs: 900), env)
        _ = s.apply(.typeDismissed, env); _ = s.apply(.noteExpired, env)
        #expect(s.lightSymbol == "keyboard")
        // A tap: the field at once, no points.
        _ = s.apply(.orbDown, env)
        let tap = s.apply(.orbUp(heldMs: 100), env)
        #expect(tap == [.timer(.hold, ms: nil)])
        #expect(s.typing == "" && s.orb == .idle && !s.showsPoints)
        _ = s.apply(.typeDismissed, env)
        // A hold: never listens, no flag; the points show and stay open after letting go.
        _ = s.apply(.orbDown, env)
        let held = s.apply(.orbHeld, env)
        #expect(held.isEmpty)
        #expect(s.orb == .holding(hover: nil) && s.typing == nil && s.showsPoints)
        _ = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.orb == .open && s.typing == nil)
        // A tap with the points open closes them, as with speech on.
        _ = s.apply(.orbDown, env); _ = s.apply(.orbUp(heldMs: 100), env)
        #expect(s.orb == .idle && s.typing == nil)
    }

    /// Speech works here; it just heard nothing that time, so the line says so (not `speechOff`).
    @Test func aSessionThatEndsMidHoldWithNothingOpensTyping() {
        var s = state(step: 1)
        speak(&s)
        _ = s.apply(.listenEnded, env)
        #expect(s.orb == .idle && s.typing == "" && s.note == WalkCopy.nothingHeard)
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

    // MARK: A cancel or an end takes back the finish wait

    @Test func aCancelWhileFinishingStopsTheFinishWait() {
        var s = state(step: 1)
        speak(&s, "finish the bathroom")
        _ = s.apply(.orbUp(heldMs: 900), env)
        #expect(s.orb == .finishing(live: "finish the bathroom"))
        let cancel = s.apply(.orbCancelled, env)
        #expect(cancel.contains(.timer(.finish, ms: nil)))
        #expect(s.orb == .idle)
        #expect(s.apply(.finishExpired, env) == [])            // a late expiry plants nothing
        #expect(s.items.isEmpty)
    }

    @Test func endingTheWalkStopsTheFinishWaitAndNothingAfterPlantsOrSaves() {
        // Not now on Welcome, and Go to Today at the ending, with a flag still waiting for its words.
        var welcome = state(step: 0)
        welcome.orb = .finishing(live: "something")
        #expect(welcome.act(.notNow, env) == [.timer(.finish, ms: nil), .end(.left)])
        #expect(welcome.orb == .idle)

        var s = state(step: 6, planted: true)
        s.orb = .finishing(live: "feel strong again")
        #expect(s.apply(.goToToday, env) == [.timer(.finish, ms: nil), .end(.finished)])
        #expect(s.orb == .idle)

        for ended in [welcome, s] {
            var t = ended
            let items = t.items
            for event: WalkEvent in [.finishExpired, .listenEnded, .orbDown, .orbHeld, .orbUp(heldMs: 900), .moreTapped,
                                     .typeSubmitted("feel strong again"), .sheetHandle, .walkAnother, .goToToday, .undo, .calendarAnswered,
                                     .nextTapped, .veilTapped] {
                #expect(t.apply(event, env) == [])
            }
            for action: WalkAction in [.next, .back, .quick, .notNow, .undo, .calendar, .leave] {
                #expect(t.act(action, env) == [])
            }
            #expect(t.items == items)
            #expect(t.orb == .idle)
        }
    }
}
