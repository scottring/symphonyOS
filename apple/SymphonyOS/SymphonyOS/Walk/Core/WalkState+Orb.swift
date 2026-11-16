import Foundation
import CoreGraphics

/// The orb's gestures as state changes: hold to speak, slide to a point, tap to
/// open the points, and typing as the way round speech. Time and touch
/// positions arrive in events; words arrive as `heard`. Nothing is listened to
/// or planted here, only asked for as effects.
extension WalkState {

    /// The compass points are out: the light is open, or held after a press that began with them open
    /// or slid out of the light (S15: a plain hold on its way to speaking shows none). On Welcome
    /// they always are: its three choices are the whole screen.
    var showsPoints: Bool {
        if step == 0 { return true }
        switch orb {
        case .open: return true
        case .holding: return orbWasOpen || pressWentOut
        case .idle, .speaking, .finishing: return false
        }
    }

    /// F22: every word on the mountain is veiled (cloths, poles and pills stay; their words are not
    /// drawn) while the choices are open, the light is taught, or something is being typed.
    var veilsWords: Bool { (1...5).contains(step) && (orb == .open || teaching || typing != nil) }

    /// The field holds something that is not blank: Add plants it.
    var typedHasWords: Bool { !(typing ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    /// The veil behind the open compass (and Welcome's choices), the lesson and the typing field: the
    /// scene steps back. Not during a press, so a hold on its way to speaking does not darken the mountain.
    var showsVeil: Bool { step == 0 || orb == .open || teaching || ((1...5).contains(step) && typing != nil) }

    /// Next at the foot shows on steps 1 to 5 while the light is at rest and nothing is being typed,
    /// the lesson included (S19: it shows the way on), and not while the paper is up. On Welcome it is
    /// the quick start, under the light while it is not pressed.
    var showsNextLine: Bool {
        if step == 0 { return orb == .idle || orb == .open }
        return (1...5).contains(step) && orb == .idle && typing == nil && !paperOpen
    }

    /// The top row (Back, More, Leave for now) on every step after Welcome but Look back up; hidden
    /// while typing (F10: there is no Back with unsent words) and while the paper is up (it has its own way back).
    var showsTopRow: Bool { (1...5).contains(step) && typing == nil && !paperOpen }

    /// "More", in the middle of the top row: it opens the choices on the light and closes them again;
    /// shown while the light is taught too, since the lesson points to it.
    var showsMore: Bool { showsTopRow }

    /// The choices on the light are open (More is drawn gold then).
    var choicesOpen: Bool { orb == .open }

    /// The light (its dial, its touch and its points) is drawn. Not while the field is open on steps 1
    /// to 5: the note above the field (top 724) lies inside the light's ring, and the field has its own
    /// way out (its X) and in (Add), so the light stands aside and a tap where it was is the veil's.
    var showsLight: Bool { !((1...5).contains(step) && typing != nil) }

    /// The quiet Undo pill above the light, where the hint was; it gives way while the points show,
    /// where Undo is the top point instead.
    var showsUndoPill: Bool { undoShowing && !showsPoints }

    mutating func applyOrb(_ event: WalkEvent, _ env: WalkEnv) -> [WalkEffect] {
        switch event {
        case .orbDown: return orbDown(env)
        case .orbHeld: return orbHeld()
        case .orbMoved(let location): return orbMoved(location, env)
        case .orbUp(let heldMs): return orbUp(heldMs: heldMs, env)
        case .orbCancelled:
            // A cancel while waiting for the last words lets them go: the finish wait is taken back.
            orb = .idle
            orbWasOpen = false
            orbWasTeaching = false
            pressWentOut = false
            return [.listen(false), .timer(.hold, ms: nil), .timer(.finish, ms: nil)]
        case .heard(let text):
            switch orb {
            case .speaking: orb = .speaking(live: text)
            case .finishing: orb = .finishing(live: text)
            default: break
            }
            return []
        case .listenEnded:
            switch orb {
            case .finishing(let live): return plantHeard(live, env)
            case .speaking(let live):
                // Ended by itself with the finger still down.
                guard isBlank(live) else {
                    sessionOver = true       // the words stay; letting go plants them at once
                    return []
                }
                // Speech works; it heard nothing this time. Not remembered: the next hold tries again.
                return openTyping(note: WalkCopy.nothingHeard)
            default:
                return []
            }
        case .finishExpired:
            guard case .finishing(let live) = orb else { return [] }
            return plantHeard(live, env)
        case .speechUnavailable:
            // Refused, no recogniser, or it could not start: the one-line field opens
            // instead, now and at every hold for the rest of this walk.
            speechIsOff = true
            return openTyping(note: WalkCopy.speechOff)
        case .speechReady:
            guard orb == .idle, typing == nil, note == nil else { return [] }
            note = WalkCopy.speakNow
            return [.timer(.note, ms: WalkState.noteMs)]
        case .typeChanged(let text):
            if typing != nil { typing = text }
            return []
        case .typeSubmitted(let text):
            // Return and the blur can reach here in either order: the words come with the
            // submit, so a dismiss a moment before it loses nothing. A dismiss with no
            // return after it (tapping away) still discards them.
            guard typing != nil || !isBlank(text) else { return [] }
            let effects = plant(text, env)
            typing = nil
            return effects
        case .typeDismissed:
            typing = nil
            return []
        case .point(let point):
            // Welcome's choices take a tap whenever the light is not pressed.
            guard orb == .open || (step == 0 && orb == .idle),
                  let chosen = WalkCopy.points(self, env.periods).first(where: { $0.at == point }) else { return [] }
            orb = .idle
            return act(chosen.action, env)
        default:
            return []
        }
    }

    private mutating func orbDown(_ env: WalkEnv) -> [WalkEffect] {
        // Still waiting for the last flag's words: plant what there is first.
        var planted: [WalkEffect] = []
        if case .finishing(let live) = orb { planted = plantHeard(live, env) }
        // Pressing the light puts the lesson away in the same gesture: held, it listens; a tap types.
        orbWasTeaching = teaching
        teaching = false
        pressWentOut = false
        if typing != nil { return planted }
        if case .speaking = orb { return [] }
        orbWasOpen = orb == .open
        orb = .holding(hover: nil)
        // Welcome and Look back up have nothing to speak: no hold, no sounds.
        guard (1...5).contains(step) else { return planted }
        return planted + [.sound(.bag, afterMs: 0), .sound(.poles, afterMs: 120), .timer(.hold, ms: WalkOrb.holdMs)]
    }

    private mutating func orbHeld() -> [WalkEffect] {
        guard orb == .holding(hover: nil), (1...5).contains(step) else { return [] }
        // Refused earlier in this walk: no flag, no listening. A tap types; a hold keeps the
        // other choices out, and they stay open when it lets go.
        if speechIsOff { return [] }
        orb = .speaking(live: "")
        sessionOver = false
        return [.listen(true), .sound(.unfurl, afterMs: 280)]
    }

    private mutating func orbMoved(_ location: CGPoint, _ env: WalkEnv) -> [WalkEffect] {
        let hover = WalkOrb.point(at: location, among: WalkCopy.points(self, env.periods).map(\.at))
        if WalkOrb.isOut(location), case .holding = orb { pressWentOut = true }
        switch orb {
        case .speaking:
            guard WalkOrb.isOut(location) else { return [] }
            // Sliding out cancels what was being said; the points show again.
            pressWentOut = true
            orb = .holding(hover: hover)
            return [.listen(false)] + (hover == nil ? [] : [.sound(.tick, afterMs: 0)])
        case .holding(let current):
            guard hover != current else { return [] }
            orb = .holding(hover: hover)
            return hover == nil ? [] : [.sound(.tick, afterMs: 0)]
        default:
            return []
        }
    }

    private mutating func orbUp(heldMs: Int, _ env: WalkEnv) -> [WalkEffect] {
        let release: [WalkEffect] = [.timer(.hold, ms: nil)]
        let wasOpen = orbWasOpen, wasTeaching = orbWasTeaching, wentOut = pressWentOut
        orbWasOpen = false
        orbWasTeaching = false
        pressWentOut = false
        switch orb {
        case .holding(let hover?):
            guard let chosen = WalkCopy.points(self, env.periods).first(where: { $0.at == hover }) else {
                orb = .idle
                return release
            }
            orb = .idle
            return act(chosen.action, env) + release
        case .speaking(let live):
            // The session already ended by itself: nothing more is coming.
            if sessionOver { return plantHeard(live, env) + release }
            // Wait for the last words: the timer first, so an end that comes at once cancels it.
            orb = .finishing(live: live)
            return release + [.timer(.finish, ms: WalkOrb.finishMs), .finishListening]
        case .holding(nil):
            // On Welcome the light is the quick start: a tap or a hold begins it. A slide let go
            // where there is no choice leaves the choices as they are.
            if step == 0 {
                orb = .idle
                return wentOut ? release : act(.quick, env) + release
            }
            if heldMs < WalkOrb.holdMs {
                // A tap during the lesson puts it away and opens the choices (S19).
                if wasTeaching {
                    orb = .open
                    return release
                }
                // With speech off a tap types straight away (the light shows a keyboard).
                if speechIsOff, !wasOpen, (1...5).contains(step) {
                    startTyping()
                    return release
                }
                orb = wasOpen ? .idle : .open
            } else {
                orb = speechIsOff ? .open : .idle
            }
            return release
        case .idle, .open, .finishing:
            return release      // a release with no press of ours (typing was open): leave things as they are
        }
    }

    /// Plants what a flag let go has so far, if one is waiting for its last words on a
    /// step that plants (Welcome and Look back up have nothing to plant: ending the walk
    /// there lets it go). Called before any event or point that is not `leavesAWaitingFlag`.
    mutating func plantWaitingFlag(_ env: WalkEnv) -> [WalkEffect] {
        guard case .finishing(let live) = orb, level != nil else { return [] }
        return plantHeard(live, env)
    }

    /// The moment a held flag is planted: the session's end, the finish wait running
    /// out, or a new press. Exactly once per hold; the listener is let go (a cancel is
    /// harmless once it has ended). Blank words are an empty hold, not a refusal.
    private mutating func plantHeard(_ live: String, _ env: WalkEnv) -> [WalkEffect] {
        orb = .idle
        sessionOver = false
        let done: [WalkEffect] = [.listen(false), .timer(.finish, ms: nil)]
        guard !isBlank(live) else { return done + emptyHold() }
        emptyHolds = 0
        return done + plant(live, env)
    }

    /// The first empty hold is a quiet note; the second in a row opens the field.
    private mutating func emptyHold() -> [WalkEffect] {
        emptyHolds += 1
        if emptyHolds >= 2 {
            emptyHolds = 0
            typing = ""
            note = WalkCopy.nothingHeard
        } else {
            note = WalkCopy.nothingToPlant
        }
        return [.timer(.note, ms: WalkState.noteMs)]
    }

    /// The hold's listening is over: the field opens with `note` (why there is nothing to speak to).
    private mutating func openTyping(note: String) -> [WalkEffect] {
        orb = .idle
        orbWasOpen = false
        sessionOver = false
        typing = ""
        self.note = note
        return [.listen(false), .timer(.hold, ms: nil), .timer(.note, ms: WalkState.noteMs)]
    }

    private func isBlank(_ words: String) -> Bool {
        words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Holding the light would listen (a question step, speech not off): to VoiceOver the light is
    /// then a control that starts recording (`.startsMediaSession`), so VoiceOver stays quiet as it
    /// is activated and nothing it says is taken down.
    var holdListens: Bool { (1...5).contains(step) && !speechIsOff }

    /// What the light carries at its centre: a microphone while holding it would listen, a
    /// keyboard once speech is off for this walk (a tap types), a walking figure on Welcome (the
    /// light is the quick start), nothing on the ground (the light is not taught there yet) or
    /// while it is pressed, listening or a flag is rising.
    var lightSymbol: String? {
        if step == 0 {
            if case .holding = orb { return nil }
            return "figure.walk"                // Welcome: the light begins the quick start
        }
        guard (1...5).contains(step), !ground else { return nil }     // the ground: quiet until the light is taught
        switch orb {
        case .idle, .open: return speechIsOff ? "keyboard" : "mic"
        case .holding, .speaking, .finishing: return nil
        }
    }

    /// The Type it point: an empty one-line field, the orb at rest.
    mutating func startTyping() {
        typing = ""
        orb = .idle
    }
}

extension WalkEvent {
    /// While the paper is up only these reach the walk: the paper's own (open, close, a row), and what
    /// time and the system send (the words and the session's end, the waits, a permission answer).
    /// Every touch on what the paper covers (the light, Next, the top row, the flags and posts, the
    /// typing field, the veil) is not.
    var isUnderThePaper: Bool {
        switch self {
        case .paperOpened, .paperClosed, .paperRow, .heard, .listenEnded, .finishExpired, .noteExpired, .undoExpired,
             .speechReady, .calendarAnswered:
            return false
        case .orbDown, .orbHeld, .orbMoved, .orbUp, .orbCancelled, .speechUnavailable, .typeChanged, .typeSubmitted,
             .typeDismissed, .point, .areaTapped, .bannerTapped, .stubTapped, .exampleTapped, .moveTo, .pullUp, .undo,
             .rowToggled, .walkAnother, .sheetHandle, .goToToday, .nextTapped, .veilTapped, .moreTapped, .backTapped,
             .leaveTapped, .lookBackPaper:
            return true
        }
    }

    /// Events that leave a flag waiting for its last words to wait on: the words and the
    /// session's end themselves, the finish wait, touches on the light that do nothing
    /// while it waits (a cancel lets it go, as it always has; only a press, whose
    /// `orbDown` already planted it, can be cancelled), and timers and system answers
    /// that touch no flag. Everything else, a new press included, plants it first.
    var leavesAWaitingFlag: Bool {
        switch self {
        case .heard, .listenEnded, .finishExpired, .orbHeld, .orbMoved, .orbUp, .orbCancelled,
             .noteExpired, .undoExpired, .speechReady, .calendarAnswered, .veilTapped:
            return true
        case .orbDown, .speechUnavailable, .typeChanged, .typeSubmitted, .typeDismissed, .point,
             .areaTapped, .bannerTapped, .stubTapped, .exampleTapped, .moveTo, .pullUp, .undo,
             .rowToggled, .walkAnother, .sheetHandle, .goToToday, .nextTapped, .moreTapped, .backTapped, .leaveTapped,
             .paperOpened, .paperClosed, .paperRow, .lookBackPaper:
            return false
        }
    }
}
