import Foundation
import CoreGraphics

/// The orb's gestures as state changes: hold to speak, slide to a point, tap to
/// open the points, and typing as the way round speech. Time and touch
/// positions arrive in events; words arrive as `heard`. Nothing is listened to
/// or planted here, only asked for as effects.
extension WalkState {

    /// The compass points are out: the light is held (before speaking) or open.
    var showsPoints: Bool {
        switch orb {
        case .holding, .open: return true
        case .idle, .speaking, .finishing: return false
        }
    }

    /// The quiet Undo pill beside the hint; it gives way while the points show,
    /// where Undo is the up-left point instead.
    var showsUndoPill: Bool { undoShowing && !showsPoints }

    mutating func applyOrb(_ event: WalkEvent, _ env: WalkEnv) -> [WalkEffect] {
        switch event {
        case .orbDown: return orbDown(env)
        case .orbHeld: return orbHeld()
        case .orbMoved(let location): return orbMoved(location)
        case .orbUp(let heldMs): return orbUp(heldMs: heldMs, env)
        case .orbCancelled:
            orb = .idle
            orbWasOpen = false
            return [.listen(false), .timer(.hold, ms: nil)]
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
                return openTypingForSpeechOff()      // not remembered: the next hold tries again
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
            return openTypingForSpeechOff()
        case .speechReady:
            guard orb == .idle, typing == nil, note == nil else { return [] }
            note = WalkCopy.speakNow
            return [.timer(.note, ms: WalkState.noteMs)]
        case .typeChanged(let text):
            if typing != nil { typing = text }
            return []
        case .typeSubmitted:
            guard let text = typing else { return [] }
            let effects = plant(text, env)
            typing = nil
            return effects
        case .typeDismissed:
            typing = nil
            return []
        case .point(let point):
            guard orb == .open, let chosen = WalkCopy.points(self).first(where: { $0.at == point }) else { return [] }
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
        if speechIsOff {
            // Refused earlier in this walk: no flag, no listening, the field at once.
            startTyping()
            note = WalkCopy.speechOff
            return [.timer(.note, ms: WalkState.noteMs)]
        }
        orb = .speaking(live: "")
        sessionOver = false
        return [.listen(true), .sound(.unfurl, afterMs: 280)]
    }

    private mutating func orbMoved(_ location: CGPoint) -> [WalkEffect] {
        let hover = WalkOrb.point(at: location, among: WalkCopy.points(self).map(\.at))
        switch orb {
        case .speaking:
            guard WalkOrb.isOut(location) else { return [] }
            // Sliding out cancels what was being said; the points show again.
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
        let wasOpen = orbWasOpen
        orbWasOpen = false
        switch orb {
        case .holding(let hover?):
            guard let chosen = WalkCopy.points(self).first(where: { $0.at == hover }) else {
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
            if heldMs < WalkOrb.holdMs {
                orb = wasOpen ? .idle : .open
            } else {
                orb = step == 0 ? .open : .idle
            }
            return release
        case .idle, .open, .finishing:
            return release      // a release with no press of ours (typing was open): leave things as they are
        }
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

    private mutating func openTypingForSpeechOff() -> [WalkEffect] {
        orb = .idle
        orbWasOpen = false
        sessionOver = false
        typing = ""
        note = WalkCopy.speechOff
        return [.listen(false), .timer(.hold, ms: nil), .timer(.note, ms: WalkState.noteMs)]
    }

    private func isBlank(_ words: String) -> Bool {
        words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The Type it point: an empty one-line field, the orb at rest.
    mutating func startTyping() {
        typing = ""
        orb = .idle
    }
}
