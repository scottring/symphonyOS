import Foundation

/// How the add bar behaves: typing, listening, waiting for the last words, and
/// the quiet Undo after an add. A pure reducer; `DailyModel` carries out what it
/// asks for (the listener, the writer, the timers).
///
/// The light listens on the phone only. Where speech is refused or missing the
/// bar types from then on, with one plain line, and a tap on the light asks for
/// the field. Nothing empty (blank, or only filler) is ever added.
struct DailyBar: Equatable {
    enum Mic: Equatable { case idle, listening, finishing }

    var draft = ""
    var mic: Mic = .idle
    /// Speech was refused or is missing: the light asks for the field instead.
    var speechOff = false
    /// The one plain line above the bar (where an add went, why it types).
    var note: String?
    var undoShowing = false
    /// Bumped when the field should take the keyboard.
    var fieldAsked = 0

    /// Listening, or waiting for the last words (which looks the same): the field spans the
    /// width, More and Inbox give way, and the field shows what is heard but takes no typing.
    var isListening: Bool { mic != .idle }

    /// What the light is called to VoiceOver, for what a tap on it does now: listen, add what
    /// was heard (listening or waiting for the last words), or, with speech off, type.
    var lightLabel: String {
        if isListening { return DailyCopy.addWhatYouSaid }
        return speechOff ? DailyCopy.typeIt : DailyCopy.speakIt
    }

    /// The one line slot above the bar, in this order of need: the listening line while the light
    /// listens; otherwise the note, Undo beside it when both show, either alone, or nothing.
    enum Slot: Equatable { case empty, listening, say(note: String?, undo: Bool) }

    var slot: Slot {
        if isListening { return .listening }
        if note == nil && !undoShowing { return .empty }
        return .say(note: note, undo: undoShowing)
    }

    enum Event: Equatable {
        case typed(String), submitted, micTapped, heard(String), speechUnavailable,
             listenEnded, finishExpired, did(note: String?), undoTapped, undoExpired, noteExpired, left
    }

    enum Timer: Equatable { case undo, note, finish }

    enum Effect: Equatable {
        case add(String), listen(Bool), finishListening, undo
        /// `ms` nil cancels.
        case timer(Timer, ms: Int?)
    }

    mutating func apply(_ event: Event) -> [Effect] {
        switch event {
        case .typed(let words):
            guard mic == .idle else { return [] }
            draft = words
            return []

        case .submitted:
            guard mic == .idle, Self.hasWords(draft) else { return [] }
            return takeDraft()

        case .micTapped:
            switch mic {
            case .idle:
                guard !speechOff else {
                    fieldAsked += 1
                    return []
                }
                mic = .listening
                draft = ""
                return [.listen(true)]
            case .listening:
                mic = .finishing
                return [.finishListening, .timer(.finish, ms: WalkOrb.finishMs)]
            case .finishing:
                return []
            }

        case .heard(let words):
            guard mic != .idle else { return [] }
            draft = words
            return []

        case .speechUnavailable:
            speechOff = true
            mic = .idle
            return [.listen(false), .timer(.finish, ms: nil)] + say(WalkCopy.speechOff)

        case .listenEnded:
            switch mic {
            case .finishing:
                return finish()
            case .listening:
                // The session died with the light still on: the words stay in the field, nothing is added.
                mic = .idle
                guard Self.hasWords(draft) else { return say(WalkCopy.nothingHeard) }
                fieldAsked += 1
                return []
            case .idle:
                return []
            }

        case .finishExpired:
            guard mic == .finishing else { return [] }
            return finish()

        case .did(let note):
            undoShowing = true
            self.note = note
            return [.timer(.undo, ms: WalkState.undoMs), .timer(.note, ms: note == nil ? nil : WalkState.noteMs)]

        case .undoTapped:
            guard undoShowing else { return [] }
            undoShowing = false
            note = nil
            return [.undo, .timer(.undo, ms: nil), .timer(.note, ms: nil)]

        case .undoExpired:
            undoShowing = false
            return []

        case .noteExpired:
            note = nil
            return []

        case .left:
            mic = .idle
            return [.listen(false), .timer(.finish, ms: nil)]
        }
    }

    /// The last words are in (the session ended, or the wait for them ran out):
    /// they are added at once, or with nothing said the field is asked for.
    private mutating func finish() -> [Effect] {
        mic = .idle
        let done: [Effect] = [.listen(false), .timer(.finish, ms: nil)]
        guard Self.hasWords(draft) else { return done + say(WalkCopy.nothingHeard) }
        return done + takeDraft()
    }

    private mutating func takeDraft() -> [Effect] {
        let words = draft
        draft = ""
        return [.add(words)]
    }

    /// One plain line, and the field takes the keyboard.
    private mutating func say(_ line: String) -> [Effect] {
        note = line
        fieldAsked += 1
        return [.timer(.note, ms: WalkState.noteMs)]
    }

    /// Something to add: not blank and not only filler, as `DailyAdd.read` tidies it.
    private static func hasWords(_ text: String) -> Bool { WalkWords.tidy(text) != nil }
}
