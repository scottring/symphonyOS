#if os(iOS)
import Foundation
import SwiftData
import Observation

/// What the orb listens through: the app's `Dictation`, or a fake in tests.
/// Words reach the model through `onWords`, on the main actor; `start()` asks
/// for permission the first time and leaves `problem` set if it cannot listen.
/// `finish()` is letting go: the microphone stops, the last words still arrive
/// through `onWords`, then `onEnd`. `stop()` is a cancel: nothing more arrives.
/// `onEnd` is called once per session that ends without `stop()`: after
/// `finish()`, or by itself (an error, an interruption).
@MainActor protocol WalkListening: AnyObject {
    var problem: String? { get }
    var onWords: ((String) -> Void)? { get set }
    var onEnd: (() -> Void)? { get set }
    func start() async
    func finish()
    func stop()
}

extension Dictation: WalkListening {}

/// The walk's one observable object. It holds the state, runs the reducer on
/// every event and compass point, and carries out what the reducer asks for:
/// rows through one `WalkWriter`, waits through the scheduler, the saved
/// position. Views read `state` and `layout` and send events; nothing else.
@MainActor @Observable final class WalkModel {
    private(set) var state: WalkState
    private(set) var periods: WalkPeriods
    /// The painting the scene draws and the layout measures against.
    let art: WalkArt = .overlookSquare
    var layout: WalkLayout { WalkLayout.make(state, today: periods.today, art: art) }
    var onEnd: ((WalkStatus) -> Void)?

    @ObservationIgnored private let userId: UUID
    @ObservationIgnored private let edition: Edition
    @ObservationIgnored private let now: Date
    @ObservationIgnored private let store: WalkPositionStore?
    @ObservationIgnored private let scheduler: WalkScheduling
    /// Made with the state and kept for the whole walk: the writer and the
    /// state each remember what a pull up or a first thing replaced.
    @ObservationIgnored private let writer: WalkWriter
    /// Ids of rows this walk planted: what makes a flag "mine" after a reload.
    @ObservationIgnored private var planted: Set<UUID>
    @ObservationIgnored private let listener: WalkListening
    @ObservationIgnored private let sound: WalkSoundPlaying
    /// Counts the holds that asked to listen; each session's callbacks carry their hold's number.
    @ObservationIgnored private var holdCount = 0
    @ObservationIgnored private var session: Session = .none
    /// Set by `close()`: nothing more reaches the state.
    @ObservationIgnored private var closed = false

    /// Where the listener is for the latest hold. Words and an end are taken only
    /// from the hold they belong to, and only while it is starting, live or finishing.
    private enum Session: Equatable {
        case none
        case waiting(Int)                   // asked to listen; start() not called yet
        case starting(Int)                  // start() called and not back: the permission prompts may be up
        case cancelledWhileStarting(Int)    // cancelled before start() came back (the prompts took the touch)
        case live(Int)
        case finishing(Int)                 // let go: waiting for the last words and the end
    }

    init(context: ModelContext, userId: UUID, entry: WalkEntry, position: WalkPosition?, edition: Edition,
         now: Date = .now, seasons: [SeasonBoundary]? = nil, store: WalkPositionStore? = WalkPositionStore(),
         scheduler: WalkScheduling? = nil, listener: WalkListening? = nil, sound: WalkSoundPlaying? = nil) {
        let periods = WalkPeriods.pick(now: now, seasons: seasons)
        let resuming = entry == .resume ? position : nil
        let planted = Set(resuming?.planted ?? [])

        // The plan is read first: restoring a saved place looks at the items
        // (what still exists, and a whole-year tour on Season).
        let areas = WalkLoad.areas((try? context.fetch(FetchDescriptor<GoalArea>())) ?? [], me: userId)
        var state = WalkState()
        state.areas = areas
        state.items = WalkLoad.items(goals: (try? context.fetch(FetchDescriptor<Goal>())) ?? [],
                                     tasks: (try? context.fetch(FetchDescriptor<SymphonyTask>())) ?? [],
                                     periods: periods, me: userId, planted: planted, areas: areas)
        if let resuming {
            resuming.restored(for: periods, existing: Set(state.items.map(\.id))).apply(to: &state)
        }

        self.state = state
        self.periods = periods
        self.planted = planted
        self.userId = userId
        self.edition = edition
        self.now = now
        self.store = store
        self.scheduler = scheduler ?? WalkClock()
        self.writer = WalkWriter(context: context, userId: userId, periods: periods)
        self.listener = listener ?? {
            // Nothing is asked here: permission comes with the first hold.
            let dictation = Dictation()
            dictation.playsAlongside = true
            dictation.onDeviceOnly = true
            return dictation
        }()
        self.sound = sound ?? WalkSound.shared
    }

    private var env: WalkEnv { WalkEnv(periods: periods, now: now) }

    func send(_ event: WalkEvent) {
        guard !closed else { return }
        carryOut(state.apply(event, env))
    }

    func choose(_ action: WalkAction) {
        guard !closed else { return }
        carryOut(state.act(action, env))
    }

    /// The walk taken down from outside (it ended, a sign-out, another person, a new
    /// day): listening is cancelled, nothing waiting runs, and no later event reaches
    /// the state. `onEnd` is not called and the saved place stays as the last save left
    /// it (every plant has already saved), so the walk can be resumed from there.
    func close() {
        cancelListening()
        for timer in [WalkTimer.hold, .undo, .note, .finish] { scheduler.cancel(key: Self.key(timer)) }
        for name in WalkSoundName.allCases { scheduler.cancel(key: Self.key(name)) }
        closed = true
    }

    // MARK: Effects

    private func carryOut(_ effects: [WalkEffect]) {
        for effect in effects {
            switch effect {
            case .write(let write): self.write(write)
            case .save: save(.inProgress)
            case .timer(let timer, let ms): wait(timer, ms)
            case .end(let status):
                listen(false)
                save(status)
                onEnd?(status)
            case .listen(let on): listen(on)
            case .finishListening: finishListening()
            case .sound(let name, let ms): play(name, after: ms)
            case .askCalendar:
                break                       // Task 20
            }
        }
    }

    // MARK: Listening

    /// Starting goes through the scheduler and asks for permission the first time;
    /// a start that cannot listen opens typing. A cancel is at once.
    private func listen(_ on: Bool) {
        guard on else {
            cancelListening()
            return
        }
        holdCount += 1
        let hold = holdCount
        session = .waiting(hold)
        scheduler.run { [weak self] in await self?.begin(hold) }
    }

    private func begin(_ hold: Int) async {
        guard session == .waiting(hold) else { return }      // let go or cancelled before listening began
        session = .starting(hold)
        listener.onWords = { [weak self] words in self?.heard(words, from: hold) }
        listener.onEnd = { [weak self] in self?.ended(hold) }
        await listener.start()
        guard holdCount == hold else { return }               // a newer hold has its own start
        if listener.problem != nil {
            // Refused, missing or failed, even if the touch went while the prompts were up.
            session = .none
            send(.speechUnavailable)
        } else if session == .starting(hold) {
            session = .live(hold)
        } else if session == .cancelledWhileStarting(hold) {
            // Allowed, but the prompts took the touch: say to hold again.
            session = .none
            send(.speechReady)
        }
    }

    private func heard(_ words: String, from hold: Int) {
        switch session {
        case .starting(hold), .live(hold), .finishing(hold): send(.heard(words))
        default: break                                       // an earlier hold's, or after a cancel
        }
    }

    private func ended(_ hold: Int) {
        switch session {
        case .live(hold), .finishing(hold):
            session = .none
            send(.listenEnded)
        default: break
        }
    }

    /// Letting go: the microphone stops and the last words are awaited. With no
    /// session listening there is nothing to wait for, so the hold ends now.
    private func finishListening() {
        switch session {
        case .live(let hold):
            session = .finishing(hold)
            listener.finish()
        case .starting:
            listener.stop()                                  // released while the prompts were up: not a cancel
            session = .none
            send(.listenEnded)
        case .waiting:
            session = .none
            send(.listenEnded)
        case .none, .cancelledWhileStarting:
            send(.listenEnded)
        case .finishing:
            break                                            // already waiting for its end
        }
    }

    private func cancelListening() {
        switch session {
        case .starting(let hold):
            listener.stop()
            session = .cancelledWhileStarting(hold)
        case .live, .finishing:
            listener.stop()
            session = .none
        case .waiting:
            session = .none
        case .none, .cancelledWhileStarting:
            break
        }
    }

    private func write(_ write: WalkWrite) {
        switch write {
        case .area(let area): writer.ensureArea(area)
        case .dropArea(let id): writer.dropAreaIfUnused(id)
        case .create(let item, let parent):
            writer.create(item, parent: parent)
            planted.insert(item.id)
        case .remove(let id, let level):
            writer.remove(id, level: level)
            planted.remove(id)
        case .restore(let id):
            writer.restore(id)
            planted.insert(id)
        case .setArea(let id, let level, let area): writer.setArea(id, level: level, to: area)
        case .firstThing(let id, let previous): writer.setFirstThing(id, previous: previous)
        case .toggleDone(let id): writer.toggleDone(id)
        }
    }

    /// At once, or through the scheduler under a key of that sound's own, so
    /// `close()` can take back a sound still waiting.
    private func play(_ name: WalkSoundName, after ms: Int) {
        guard ms > 0 else {
            sound.play(name)
            return
        }
        scheduler.after(ms, key: Self.key(name)) { [weak self] in
            guard let self, !self.closed else { return }
            self.sound.play(name)
        }
    }

    private func save(_ status: WalkStatus) {
        store?.save(WalkPosition(state, status: status, planted: planted, periods: periods, now: now), for: userId)
    }

    private static func key(_ timer: WalkTimer) -> String {
        switch timer {
        case .hold: "hold"
        case .undo: "undo"
        case .note: "note"
        case .finish: "finish"
        }
    }

    private static func key(_ sound: WalkSoundName) -> String { "sound.\(sound.rawValue)" }

    private func wait(_ timer: WalkTimer, _ ms: Int?) {
        let key = Self.key(timer)
        let event: WalkEvent
        switch timer {
        case .hold: event = .orbHeld
        case .undo: event = .undoExpired
        case .note: event = .noteExpired
        case .finish: event = .finishExpired
        }
        guard let ms else {
            scheduler.cancel(key: key)
            return
        }
        scheduler.after(ms, key: key) { [weak self] in self?.send(event) }
    }
}
#endif
