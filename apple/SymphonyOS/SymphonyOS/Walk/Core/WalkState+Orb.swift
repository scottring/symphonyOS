import Foundation
import CoreGraphics

/// The orb's gestures as state changes: hold to speak, slide to a point, tap to
/// open the points, and typing as the way round speech. Time and touch
/// positions arrive in events; words arrive as `heard`. Nothing is listened to
/// or planted here, only asked for as effects.
extension WalkState {

    mutating func applyOrb(_ event: WalkEvent, _ env: WalkEnv) -> [WalkEffect] {
        switch event {
        case .orbDown: return orbDown()
        case .orbHeld: return orbHeld()
        case .orbMoved(let location): return orbMoved(location)
        case .orbUp(let heldMs): return orbUp(heldMs: heldMs, env)
        case .orbCancelled:
            orb = .idle
            orbWasOpen = false
            return [.listen(false), .timer(.hold, ms: nil)]
        case .heard(let text):
            if case .speaking = orb { orb = .speaking(live: text) }
            return []
        case .speechUnavailable:
            // Speech is refused, missing or heard nothing: the one-line field opens instead.
            orb = .idle
            orbWasOpen = false
            typing = ""
            note = WalkCopy.speechOff
            return [.listen(false), .timer(.hold, ms: nil), .timer(.note, ms: WalkState.noteMs)]
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

    private mutating func orbDown() -> [WalkEffect] {
        if typing != nil { return [] }
        if case .speaking = orb { return [] }
        orbWasOpen = orb == .open
        orb = .holding(hover: nil)
        // Welcome and Look back up have nothing to speak: no hold, no sounds.
        guard (1...5).contains(step) else { return [] }
        return [.sound(.bag, afterMs: 0), .sound(.poles, afterMs: 120), .timer(.hold, ms: WalkOrb.holdMs)]
    }

    private mutating func orbHeld() -> [WalkEffect] {
        guard orb == .holding(hover: nil), (1...5).contains(step) else { return [] }
        orb = .speaking(live: "")
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
            orb = .idle
            return [.listen(false)] + plant(live, env) + release
        case .holding(nil):
            if heldMs < WalkOrb.holdMs {
                orb = wasOpen ? .idle : .open
            } else {
                orb = step == 0 ? .open : .idle
            }
            return release
        case .idle, .open:
            return release      // a release with no press of ours (typing was open): leave things as they are
        }
    }

    /// The Type it point: an empty one-line field, the orb at rest.
    mutating func startTyping() {
        typing = ""
        orb = .idle
    }
}
