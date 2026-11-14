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
    /// The words typed in the field when the light was tapped (ruling D22: typed words are never
    /// thrown away): what is heard is added after them.
    var typed = ""
    /// What the listener has heard in this listen, before the typed words are put in front of it.
    var heard = ""
    /// Speech was refused or is missing: the light asks for the field instead.
    var speechOff = false
    /// The one plain line above the bar (where an add went, why it types).
    var note: String?
    var undoShowing = false
    /// The handover's one quiet line (`DailyCopy.handover`) is in the slot, lowest of all.
    var handoverLine = false
    /// Bumped when the field should take the keyboard.
    var fieldAsked = 0
    /// Bumped each time a note is put in the slot, and each time a change offers Undo, so a second
    /// line of the same shape (the same note twice, a new Undo over a live one) is still news to VoiceOver.
    var notesSaid = 0
    var undosOffered = 0

    /// Listening, or waiting for the last words (which looks the same): the field spans the
    /// width, More and Inbox give way, and the field shows what is heard but takes no typing.
    var isListening: Bool { mic != .idle }

    /// What the light is called to VoiceOver, for what a tap on it does now: listen, add what
    /// was heard (listening or waiting for the last words), or, with speech off, type.
    var lightLabel: String {
        if isListening { return DailyCopy.addWhatYouSaid }
        return speechOff ? DailyCopy.typeIt : DailyCopy.speakIt
    }

    /// A tap on the light now starts listening (idle, speech on): the light is then a control that
    /// starts recording to VoiceOver (`.startsMediaSession`), so VoiceOver says nothing as it is
    /// activated and the microphone does not take its words down.
    var tapStartsListening: Bool { mic == .idle && !speechOff }

    /// The light's state for VoiceOver: "Listening" while it listens (or waits for the last words),
    /// else nothing. With the label, it is how VoiceOver learns the microphone is open: nothing is
    /// announced then, since the microphone would hear it.
    var lightValue: String { isListening ? DailyCopy.listeningNow : "" }

    /// The one line slot above the bar, in this order of need: the listening line while the light
    /// listens; otherwise the note, Undo beside it when both show, either alone; otherwise the
    /// handover's line; or nothing.
    enum Slot: Equatable { case empty, listening, say(note: String?, undo: Bool), handover }

    var slot: Slot {
        if isListening { return .listening }
        if note != nil || undoShowing { return .say(note: note, undo: undoShowing) }
        return handoverLine ? .handover : .empty
    }

    /// What VoiceOver is told as the bar changes from `old` to `new`: a note (a refused microphone's
    /// and "nothing came through" among them) and Undo, each time one is newly put in the slot, and the
    /// handover's line as it appears; nothing as a line goes or comes back into sight. Never the
    /// listening line: it would be said while the microphone is open, and the phone could take it
    /// down as words. A note is only ever in the slot with the microphone stopped (`slot` puts
    /// listening first, and every way out of listening stops the listener in the same step).
    static func announcement(from old: DailyBar, to new: DailyBar) -> String? {
        switch new.slot {
        case .empty, .listening:
            return nil
        case .handover:
            return old.slot == .handover ? nil : DailyCopy.handover
        case .say(let note, let undo):
            let parts = [new.notesSaid != old.notesSaid ? note : nil,
                         undo && new.undosOffered != old.undosOffered ? WalkCopy.undo : nil].compactMap { $0 }
            return parts.isEmpty ? nil : parts.joined(separator: " ")
        }
    }

    enum Event: Equatable {
        case typed(String), submitted, micTapped, heard(String), speechUnavailable,
             listenEnded, finishExpired, did(note: String?), undoTapped, undoExpired, noteExpired, left,
             /// The handover's line asks for the slot; `handoverExpired` is its six seconds ending.
             handoverLine, handoverExpired
    }

    enum Timer: Equatable { case undo, note, finish, handover }

    enum Effect: Equatable {
        case add(String), listen(Bool), finishListening, undo
        /// `ms` nil cancels.
        case timer(Timer, ms: Int?)
    }

    /// The handover's line shows only in an empty slot, for `DailyHandover.lineMs`; listening, a
    /// note or Undo taking the slot meanwhile ends it, and it does not come back after them.
    mutating func apply(_ event: Event) -> [Effect] {
        switch event {
        case .handoverLine:
            guard slot == .empty else { return [] }
            handoverLine = true
            return [.timer(.handover, ms: DailyHandover.lineMs)]
        case .handoverExpired:
            handoverLine = false
            return []
        default:
            break
        }
        let effects = step(event)
        guard handoverLine, slot != .handover else { return effects }
        handoverLine = false
        return effects + [.timer(.handover, ms: nil)]
    }

    private mutating func step(_ event: Event) -> [Effect] {
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
                typed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                heard = ""
                return [.listen(true)]
            case .listening:
                mic = .finishing
                return [.finishListening, .timer(.finish, ms: WalkOrb.finishMs)]
            case .finishing:
                return []
            }

        case .heard(let words):
            guard mic != .idle else { return [] }
            heard = words
            draft = Self.joined(typed, words)
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
                guard Self.hasWords(heard) else {
                    draft = typed
                    return say(WalkCopy.nothingHeard)
                }
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
            undosOffered += 1
            self.note = note
            if note != nil { notesSaid += 1 }
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

        case .handoverLine, .handoverExpired:
            return []                                   // taken in `apply`
        }
    }

    /// The last words are in (the session ended, or the wait for them ran out):
    /// they are added at once, or with nothing said the field is asked for.
    /// With nothing heard, the words typed before stay in the field and nothing is added.
    private mutating func finish() -> [Effect] {
        mic = .idle
        let done: [Effect] = [.listen(false), .timer(.finish, ms: nil)]
        guard Self.hasWords(heard) else {
            draft = typed
            return done + say(WalkCopy.nothingHeard)
        }
        return done + takeDraft()
    }

    /// The typed words, then what was heard after them.
    private static func joined(_ typed: String, _ heard: String) -> String {
        let words = heard.trimmingCharacters(in: .whitespacesAndNewlines)
        if typed.isEmpty { return heard }
        return words.isEmpty ? typed : typed + " " + words
    }

    private mutating func takeDraft() -> [Effect] {
        let words = draft
        draft = ""
        return [.add(words)]
    }

    /// One plain line, and the field takes the keyboard.
    private mutating func say(_ line: String) -> [Effect] {
        note = line
        notesSaid += 1
        fieldAsked += 1
        return [.timer(.note, ms: WalkState.noteMs)]
    }

    /// Something to add: not blank and not only filler, as `DailyAdd.read` tidies it.
    private static func hasWords(_ text: String) -> Bool { WalkWords.tidy(text) != nil }
}
