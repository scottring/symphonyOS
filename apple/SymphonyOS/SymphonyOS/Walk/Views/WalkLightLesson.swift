#if os(iOS)
import SwiftUI

/// The light taught by showing (once per walk, while `WalkState.teaching`): two short beats that take
/// turns until any touch puts the lesson away. In the first a fingertip presses the light and stays:
/// the light listens, a flag of sample words unfurls, the finger lifts. In the second the fingertip
/// taps and the light's own choices come out. `WalkHintRow` draws the beat's line, `WalkOrbView` the
/// fingertip, the flag and the choices. With Reduce Motion, or once speech is off, nothing moves
/// (`still`): the words alone teach it (`WalkCopy.teaching`).
enum WalkLessonBeat: Equatable {
    /// Nothing moves: no lesson, or one taught in words only.
    case still
    /// Between the beats: before the hold, before the tap.
    case beforeHold, beforeTap
    /// The fingertip is down on the light, not yet long enough to listen.
    case pressing
    /// Held: the light listens and the flag of sample words is out.
    case held
    /// The fingertip has lifted; the flag stays a moment.
    case letGo
    /// The fingertip is down and up again at once.
    case tapped
    /// The light's choices are out.
    case choices

    /// Which of `WalkCopy.teaching`'s lines the beat is about: 0 the hold, 1 the tap; nil while still.
    var line: Int? {
        switch self {
        case .still: return nil
        case .beforeHold, .pressing, .held, .letGo: return 0
        case .beforeTap, .tapped, .choices: return 1
        }
    }

    var fingerDown: Bool { self == .pressing || self == .held || self == .tapped }
    var listens: Bool { self == .held }
    var flagOut: Bool { self == .held || self == .letGo }
    var choicesOut: Bool { self == .choices }

    /// One round: each beat and how long it lasts, in seconds.
    static let round: [(beat: WalkLessonBeat, seconds: Double)] = [
        (.beforeHold, 0.6), (.pressing, 0.45), (.held, 2.0), (.letGo, 0.9),
        (.beforeTap, 0.6), (.tapped, 0.3), (.choices, 2.4),
    ]
}

extension EnvironmentValues {
    /// Where the light's lesson is in its round; `still` when no lesson is moving.
    @Entry var walkLessonBeat: WalkLessonBeat = .still
}

/// Runs the lesson's round for the views under it while `teaching` is true.
struct WalkLessonDriver: ViewModifier {
    /// The light is being taught and holding it speaks (not once speech is off).
    let teaching: Bool
    @State private var beat: WalkLessonBeat = .still
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        let moving = teaching && !reduceMotion
        content
            .environment(\.walkLessonBeat, moving ? beat : .still)
            .task(id: moving) {
                guard moving else { beat = .still; return }
                while !Task.isCancelled {
                    for step in WalkLessonBeat.round {
                        withAnimation(.easeInOut(duration: 0.25)) { beat = step.beat }
                        try? await Task.sleep(for: .seconds(step.seconds))
                        if Task.isCancelled { return }
                    }
                }
            }
    }
}

/// The fingertip of the lesson: a pointing hand whose tip rests on the light while it is down, and
/// stands off, unseen, while it is up.
struct WalkLessonFinger: View {
    let down: Bool

    var body: some View {
        Image(systemName: "hand.point.up.left.fill")
            .font(.system(size: 46, weight: .regular))
            .foregroundStyle(.white)
            .shadow(color: WalkPalette.ink.opacity(0.55), radius: 5, y: 2)
            // The symbol's fingertip is at its upper left: the tip sits a little inside the light.
            .offset(x: down ? 22 : 34, y: down ? 30 : 44)
            .scaleEffect(down ? 1 : 1.12)
            .opacity(down ? 1 : 0)
            .animation(.easeOut(duration: 0.16), value: down)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
#endif
