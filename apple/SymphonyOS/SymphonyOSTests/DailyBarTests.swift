import Testing
import Foundation
@testable import Symphony

// How the add bar behaves: it types, or listens on a tap and adds on the second
// tap once the last words are in. Speech refused or missing types from then on.
// Nothing empty is ever added, and every add offers a quiet Undo.

struct DailyBarTests {
    private func listening() -> DailyBar {
        var bar = DailyBar()
        _ = bar.apply(.micTapped)
        return bar
    }

    private func adds(_ effects: [DailyBar.Effect]) -> [String] {
        effects.compactMap { if case .add(let words) = $0 { words } else { nil } }
    }

    @Test func tappingTheLightListensAndASecondTapFinishes() {
        var bar = DailyBar()
        bar.draft = "half typed"
        #expect(bar.apply(.micTapped) == [.listen(true)])
        #expect(bar.mic == .listening)
        #expect(bar.draft == "")

        _ = bar.apply(.heard("Call the plumber"))
        #expect(bar.draft == "Call the plumber")
        #expect(bar.apply(.micTapped) == [.finishListening, .timer(.finish, ms: WalkOrb.finishMs)])
        #expect(bar.mic == .finishing)
        #expect(bar.apply(.micTapped) == [])           // a third tap while the last words come in does nothing
    }

    @Test func theLastWordsAreWaitedFor() {
        var bar = listening()
        _ = bar.apply(.heard("Call the"))
        _ = bar.apply(.micTapped)
        _ = bar.apply(.heard("Call the plumber about the leak"))
        #expect(bar.mic == .finishing)
        #expect(bar.apply(.listenEnded) == [.listen(false), .timer(.finish, ms: nil), .add("Call the plumber about the leak")])
        #expect(bar.mic == .idle)
        #expect(bar.draft == "")

        // Or the wait runs out first: what came through is added, and the listener let go.
        var late = listening()
        _ = late.apply(.heard("Book the boiler service"))
        _ = late.apply(.micTapped)
        #expect(late.apply(.finishExpired) == [.listen(false), .timer(.finish, ms: nil), .add("Book the boiler service")])
        #expect(late.mic == .idle)
        #expect(late.apply(.listenEnded) == [])        // the session's own end, arriving late, adds nothing more
        #expect(late.apply(.finishExpired) == [])
    }

    @Test func nothingHeardAddsNothing() {
        for said in ["", "   ", "um", "uh, hmm"] {
            var bar = listening()
            _ = bar.apply(.heard(said))
            _ = bar.apply(.micTapped)
            let effects = bar.apply(.listenEnded)
            #expect(adds(effects).isEmpty)
            #expect(effects.contains(.timer(.note, ms: WalkState.noteMs)))
            #expect(bar.note == WalkCopy.nothingHeard)
            #expect(bar.fieldAsked == 1)
            #expect(bar.mic == .idle)
            #expect(!bar.speechOff)                     // the light still listens next time
        }
    }

    @Test func refusedSpeechOpensTypingAndStaysOff() {
        var bar = listening()
        let effects = bar.apply(.speechUnavailable)
        #expect(effects.contains(.listen(false)))
        #expect(effects.contains(.timer(.note, ms: WalkState.noteMs)))
        #expect(bar.speechOff)
        #expect(bar.mic == .idle)
        #expect(bar.note == WalkCopy.speechOff)
        #expect(bar.fieldAsked == 1)

        // From then on a tap on the light asks for the field; it never listens, and is never dead.
        _ = bar.apply(.noteExpired)
        let again = bar.apply(.micTapped)
        #expect(!again.contains { if case .listen = $0 { true } else { false } })
        #expect(bar.mic == .idle)
        #expect(bar.fieldAsked == 2)
        _ = bar.apply(.typed("Call the vet"))
        #expect(bar.apply(.submitted) == [.add("Call the vet")])
    }

    @Test func aSessionThatDiesKeepsItsWordsInTheField() {
        var bar = listening()
        _ = bar.apply(.heard("Pick up the dry cleaning"))
        #expect(adds(bar.apply(.listenEnded)).isEmpty)
        #expect(bar.mic == .idle)
        #expect(bar.draft == "Pick up the dry cleaning")
        #expect(bar.fieldAsked == 1)
        #expect(bar.apply(.submitted) == [.add("Pick up the dry cleaning")])
    }

    @Test func returnAddsWhatWasTyped() {
        var bar = DailyBar()
        _ = bar.apply(.typed("Buy milk"))
        #expect(bar.draft == "Buy milk")
        #expect(bar.apply(.submitted) == [.add("Buy milk")])
        #expect(bar.draft == "")

        // Typing does not reach the field while it listens.
        var live = listening()
        _ = live.apply(.typed("stray"))
        #expect(live.draft == "")
        #expect(live.apply(.submitted) == [])
    }

    @Test func anEmptyReturnAddsNothing() {
        for typed in ["", "  ", "um"] {
            var bar = DailyBar()
            _ = bar.apply(.typed(typed))
            #expect(bar.apply(.submitted) == [])
            #expect(bar.draft == typed)
        }
    }

    @Test func undoShowsThenGoes() {
        var bar = DailyBar()
        #expect(bar.apply(.did(note: "It’s somewhere")) == [.timer(.undo, ms: WalkState.undoMs), .timer(.note, ms: WalkState.noteMs)])
        #expect(bar.undoShowing)
        #expect(bar.note == "It’s somewhere")
        _ = bar.apply(.noteExpired)
        #expect(bar.note == nil)
        #expect(bar.undoShowing)
        _ = bar.apply(.undoExpired)
        #expect(!bar.undoShowing)
        #expect(bar.apply(.undoTapped) == [])           // gone: a late tap takes nothing back

        // An add with no note clears an old line; a tap takes it back once.
        bar.note = WalkCopy.nothingHeard
        #expect(bar.apply(.did(note: nil)) == [.timer(.undo, ms: WalkState.undoMs), .timer(.note, ms: nil)])
        #expect(bar.note == nil)
        #expect(bar.apply(.undoTapped) == [.undo, .timer(.undo, ms: nil), .timer(.note, ms: nil)])
        #expect(!bar.undoShowing)
        #expect(bar.apply(.undoTapped) == [])
    }

    @Test func leavingStopsListening() {
        var bar = listening()
        _ = bar.apply(.heard("Water the plants"))
        #expect(bar.apply(.left) == [.listen(false), .timer(.finish, ms: nil)])
        #expect(bar.mic == .idle)
        #expect(bar.draft == "Water the plants")

        var finishing = listening()
        _ = finishing.apply(.heard("Water the plants"))
        _ = finishing.apply(.micTapped)
        #expect(adds(finishing.apply(.left)).isEmpty)
        #expect(finishing.draft == "Water the plants")
        #expect(finishing.apply(.listenEnded) == [])
    }

    /// The light is called for what a tap on it does now: speak, add what was heard, or type.
    @Test func theLightSaysWhatATapDoes() {
        var bar = DailyBar()
        #expect(bar.lightLabel == DailyCopy.speakIt)
        _ = bar.apply(.micTapped)
        #expect(bar.lightLabel == DailyCopy.addWhatYouSaid)
        _ = bar.apply(.heard("Call the plumber"))
        _ = bar.apply(.micTapped)                       // waiting for the last words
        #expect(bar.lightLabel == DailyCopy.addWhatYouSaid)
        _ = bar.apply(.speechUnavailable)
        #expect(bar.lightLabel == DailyCopy.typeIt)
    }

    /// The light's state is in its value, so VoiceOver tells a listening light from a resting one
    /// without any announcement (the microphone would hear it).
    @Test func theLightsValueSaysItIsListening() {
        var bar = DailyBar()
        #expect(bar.lightValue == "")
        _ = bar.apply(.micTapped)
        #expect(bar.lightValue == DailyCopy.listeningNow)
        _ = bar.apply(.micTapped)                       // waiting for the last words: still listening
        #expect(bar.lightValue == DailyCopy.listeningNow)
        _ = bar.apply(.listenEnded)
        #expect(bar.lightValue == "")
    }

    /// "Calls made in this plan": the listening line, a note and Undo share one line slot above
    /// the bar. While the light listens (or waits for the last words) the slot says so and the
    /// field spans the width; otherwise the note, Undo beside it, either alone, or nothing.
    @Test func theOneLineAboveTheBarShowsWhatIsNeededMost() {
        let said = "It’s on Friday the 20th."
        var bar = DailyBar()
        #expect(bar.slot == .empty)
        #expect(!bar.isListening)

        _ = bar.apply(.did(note: said))
        #expect(bar.slot == .say(note: said, undo: true))
        _ = bar.apply(.noteExpired)
        #expect(bar.slot == .say(note: nil, undo: true))

        _ = bar.apply(.micTapped)                       // listening outranks the Undo still open
        #expect(bar.isListening)
        #expect(bar.slot == .listening)
        _ = bar.apply(.heard("Call the plumber"))
        _ = bar.apply(.micTapped)
        #expect(bar.mic == .finishing)
        #expect(bar.isListening)                        // waiting for the last words looks like listening
        #expect(bar.slot == .listening)
        _ = bar.apply(.listenEnded)
        #expect(!bar.isListening)

        var quiet = DailyBar()
        _ = quiet.apply(.speechUnavailable)             // a note with no Undo
        #expect(quiet.slot == .say(note: WalkCopy.speechOff, undo: false))
        _ = quiet.apply(.noteExpired)
        #expect(quiet.slot == .empty)
    }

    /// What VoiceOver hears as the line slot changes: a note, Undo, a refused microphone and the
    /// handover's line, each once as it appears, a second of the same shape too (a second add inside
    /// the Undo window); nothing as a line goes; and never the listening line, which would be said
    /// while the microphone is open (the light's label and value carry that state instead).
    @Test func eachLineIsHeardOnceAsItAppears() {
        let said = "It’s on Friday the 20th."
        func step(_ bar: inout DailyBar, _ event: DailyBar.Event) -> String? {
            let old = bar
            _ = bar.apply(event)
            return DailyBar.announcement(from: old, to: bar)
        }
        var bar = DailyBar()
        #expect(step(&bar, .micTapped) == nil)                          // listening: never announced
        #expect(bar.slot == .listening)
        #expect(step(&bar, .heard("Call the plumber")) == nil)
        #expect(step(&bar, .micTapped) == nil)
        #expect(step(&bar, .listenEnded) == nil)                        // the add itself is the model's
        #expect(step(&bar, .did(note: nil)) == WalkCopy.undo)           // a change offers Undo
        #expect(step(&bar, .did(note: nil)) == WalkCopy.undo)           // a second change: heard again
        #expect(step(&bar, .did(note: said)) == "\(said) \(WalkCopy.undo)")
        #expect(step(&bar, .did(note: said)) == "\(said) \(WalkCopy.undo)")   // the same note twice: twice
        #expect(step(&bar, .noteExpired) == nil)                        // the note going
        #expect(step(&bar, .typed("Dentist")) == nil)                   // typing says nothing
        #expect(step(&bar, .micTapped) == nil)                          // listening hides the Undo
        #expect(step(&bar, .left) == nil)                               // the old Undo again: not new
        #expect(step(&bar, .undoExpired) == nil)                        // Undo going

        // A refused microphone: listening, then the line that it types, once.
        var refused = DailyBar()
        _ = refused.apply(.micTapped)
        #expect(step(&refused, .speechUnavailable) == WalkCopy.speechOff)
        #expect(step(&refused, .noteExpired) == nil)

        // Nothing heard: the note, once the light has stopped.
        var quiet = DailyBar()
        _ = quiet.apply(.micTapped)
        _ = quiet.apply(.micTapped)
        #expect(step(&quiet, .listenEnded) == WalkCopy.nothingHeard)

        // The handover's line, once.
        var handover = DailyBar()
        #expect(step(&handover, .handoverLine) == DailyCopy.handover)
        #expect(step(&handover, .handoverExpired) == nil)
    }
}
