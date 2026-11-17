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
/// Asks the server for three next steps under a goal (`walk-suggest`). Nil for any failure: signed
/// out, no network, the allowance spent, nothing usable back.
@MainActor protocol WalkSuggesting {
    func suggest(_ request: WalkSuggestRequest) async -> [String]?
}

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
/// position. Views read `state` and `layout(wing:)` and send events; nothing else.
@MainActor @Observable final class WalkModel {
    private(set) var state: WalkState
    private(set) var periods: WalkPeriods
    /// The painting the scene draws and the layout measures against.
    let art: WalkArt = .overlookSquare
    /// The layout on the window the stage stands on (its wing, and the picture under Look back up's foot).
    func layout(stage: WalkStage) -> WalkLayout {
        WalkLayout.make(state, today: periods.today, art: art, wing: stage.wing, periods: periods, stage: stage)
    }

    /// The layout on a window with this wing and no sliver.
    func layout(wing: CGFloat) -> WalkLayout {
        WalkLayout.make(state, today: periods.today, art: art, wing: wing, periods: periods)
    }
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
    /// Asks the server for suggestions under a goal; nil where it cannot be asked (a demo, a test).
    @ObservationIgnored private let suggester: WalkSuggesting?
    /// Counts the holds that asked to listen; each session's callbacks carry their hold's number.
    @ObservationIgnored private var holdCount = 0
    @ObservationIgnored private var session: Session = .none
    /// Set by `close()`: nothing more reaches the state.
    @ObservationIgnored private var closed = false

    // The calendar ask and the ending (Task 20).
    /// Today's tasks while on Look back up, each with what it is for: re-read after every
    /// send there; empty elsewhere.
    private(set) var endingRows: [WalkEnding.Row] = []
    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private let calendarAccess: @MainActor () -> AppleCalendarAccess
    @ObservationIgnored private let requestCalendar: @MainActor () async -> Void
    /// A day's calendar items as Today reads them (the calendar feed), and the time it is now.
    @ObservationIgnored private let calendarEvents: @MainActor (Date) -> [TimelineItem]?
    @ObservationIgnored private let clock: @MainActor () -> Date
    /// The Calendar point was chosen in this walk: it is never offered again, whatever the answer.
    @ObservationIgnored private var calendarAsked = false

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
         now: Date = .now, seasons: [SeasonBoundary]? = nil, periods chosen: WalkPeriods? = nil,
         store: WalkPositionStore? = WalkPositionStore(),
         scheduler: WalkScheduling? = nil, listener: WalkListening? = nil, sound: WalkSoundPlaying? = nil,
         suggester: WalkSuggesting? = nil,
         calendarAccess: @escaping @MainActor () -> AppleCalendarAccess = { AppleCalendarService.shared.access },
         requestCalendar: @escaping @MainActor () async -> Void = { await AppleCalendarService.shared.requestAccess() },
         calendarEvents: @escaping @MainActor (Date) -> [TimelineItem]? = { CalendarFeed.shared.items(for: $0) },
         clock: @escaping @MainActor () -> Date = { .now }) {
        // The walk's own periods; a walk-down from a light page may name others (`DailyWalkDown.periods`).
        let periods = chosen ?? WalkPeriods.pick(now: now, seasons: seasons)
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

        // A walk opened part-way (a resume, a walk down, a preview) stands where its first touch would
        // find it, so its words and its layout are of one area from the first frame.
        self.state = state.settled
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
        self.suggester = suggester
        self.context = context
        self.calendarAccess = calendarAccess
        self.requestCalendar = requestCalendar
        self.calendarEvents = calendarEvents
        self.clock = clock
        // A walk with no store (a walk-down) keeps no place: Leave for now does not say it does.
        self.state.placeKept = store != nil
        self.state.canSuggest = suggester != nil
        readEnding()
        // Picked back up after Leave for now: no longer paused, so from here on it resumes as any walk in progress.
        if resuming?.status == .paused { save(.inProgress) }
    }

    private var env: WalkEnv { WalkEnv(periods: periods, now: now, canAskCalendar: canAskCalendar) }

    func send(_ event: WalkEvent) {
        guard !closed else { return }
        // A tick counts only for one of the sheet's rows: never a stale or stray id.
        if case .rowToggled(let id) = event, !endingRows.contains(where: { $0.id == id }) { return }
        carryOut(state.apply(event, env))
        readEnding()
    }

    func choose(_ action: WalkAction) {
        guard !closed else { return }
        carryOut(state.act(action, env))
        readEnding()
    }

    /// The walk taken down from outside (it ended, a sign-out, another person, a new
    /// day): listening is cancelled, nothing waiting runs, and no later event reaches
    /// the state. `onEnd` is not called and the saved place stays as the last save left
    /// it (every plant has already saved), so the walk can be resumed from there.
    func close() {
        cancelListening()
        for timer in [WalkTimer.hold, .undo, .note, .finish, .suggest] { scheduler.cancel(key: Self.key(timer)) }
        for name in WalkSoundName.allCases {
            scheduler.cancel(key: Self.soundKey(name))
            scheduler.cancel(key: Self.hapticKey(name))
        }
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
            case .askCalendar: askCalendar()
            case .suggest(let request): suggest(request)
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

    /// The server is asked through the scheduler; whatever comes back (nil for a failure) goes to the
    /// state, which takes it only while it is still waiting for that place.
    private func suggest(_ request: WalkSuggestRequest) {
        guard let suggester else {
            send(.suggested(request.place, nil))
            return
        }
        scheduler.run { [weak self] in
            let lines = await suggester.suggest(request)
            guard let self, !self.closed else { return }
            self.send(.suggested(request.place, lines))
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
    /// `close()` can take back a sound still waiting. One key per sound: the same
    /// sound asked for again before the first is due replaces it, so two plants
    /// within 160 ms (two quick example taps) are heard once.
    private func play(_ name: WalkSoundName, after ms: Int) {
        guard ms > 0 else {
            playNow(name)
            return
        }
        scheduler.after(ms, key: Self.soundKey(name)) { [weak self] in
            guard let self, !self.closed else { return }
            self.playNow(name)
        }
    }

    /// The sound, silent while the walk's own listening holds the audio session,
    /// and its haptic always: at once, or (the plant's thud) through the scheduler.
    private func playNow(_ name: WalkSoundName) {
        sound.play(name, listening: ownListening)
        let delay = WalkSound.hapticDelayMs(for: name)
        guard delay > 0 else {
            sound.feel(name)
            return
        }
        scheduler.after(delay, key: Self.hapticKey(name)) { [weak self] in
            guard let self, !self.closed else { return }
            self.sound.feel(name)
        }
    }

    /// Whether the walk's own listening holds the audio session: from asking the
    /// listener to start until asking it to stop, or the end of a finished session.
    private var ownListening: Bool {
        switch session {
        case .waiting, .starting, .live, .finishing: true
        case .none, .cancelledWhileStarting: false
        }
    }

    private func save(_ status: WalkStatus) {
        store?.save(WalkPosition(state, status: status, planted: planted, periods: periods, now: now), for: userId)
    }

    // MARK: The calendar ask and the ending (Task 20)

    /// The calendar may be offered on Today: the light edition only, never once the Calendar
    /// point was chosen in this walk, and only while the system has never asked this person
    /// (any answer, here or elsewhere, ends the offer for good). Read before every reducer
    /// call; reading the system's status never prompts.
    private var canAskCalendar: Bool {
        guard edition == .light, !calendarAsked else { return false }
        return calendarAccess() == .notAsked
    }

    /// The system's own prompt, through the scheduler; the answer, whatever it is, ends the offer.
    private func askCalendar() {
        calendarAsked = true
        scheduler.run { [weak self] in
            guard let self, !self.closed else { return }
            await self.requestCalendar()
            self.send(.calendarAnswered)
        }
    }

    /// Done and total of today's rows, for the ring.
    var ring: (done: Int, total: Int) { (endingRows.filter(\.done).count, endingRows.count) }

    /// Today's next calendar event after now, as Today would show it: the same feed, with no
    /// domain filter (Today's events bypass it), less any event ticked off on Today. None
    /// without calendar access, in a full household with no connected calendar, or in a demo.
    var nextUp: (title: String, start: Date)? {
        let today = periods.today
        let moment = clock()
        let instances = (try? context.fetch(FetchDescriptor<ActionableInstance>())) ?? []
        let ticked = Set(instances.filter {
            $0.entityType == "calendar_event" && ($0.status == "completed" || $0.status == "skipped")
                && PlanCalendar.sameDay($0.date, today)
        }.map(\.entityId))
        return (calendarEvents(today) ?? [])
            .compactMap { item -> (title: String, start: Date)? in
                guard item.type == .event, !item.isAllDay, let start = item.startTime, start > moment,
                      !(item.eventKey.map(ticked.contains) ?? false) else { return nil }
                return (item.title, start)
            }
            .min { $0.start < $1.start }
    }

    /// The sheet's closing line: "That’s the day." once every one of today's rows is done,
    /// "Nothing planted for today yet." with none, otherwise nothing.
    var dayLine: String? {
        if endingRows.isEmpty { return WalkCopy.nothingToday }
        return endingRows.allSatisfy(\.done) ? WalkCopy.thatsTheDay : nil
    }

    /// The year goal "Walk another one down" would go under, if one is left to walk.
    var nextToWalk: String? { WalkEnding.nextToWalk(state.items)?.title }

    /// Today's rows from the store, re-read after the walk's own writes; empty off the ending.
    private func readEnding() {
        guard state.step == 6 else {
            if !endingRows.isEmpty { endingRows = [] }
            return
        }
        let rows = WalkEnding.rows(tasks: (try? context.fetch(FetchDescriptor<SymphonyTask>())) ?? [],
                                   goals: (try? context.fetch(FetchDescriptor<Goal>())) ?? [],
                                   today: periods.today, me: userId, firstThing: state.firstThing)
        if rows != endingRows { endingRows = rows }
    }

    private static func key(_ timer: WalkTimer) -> String {
        switch timer {
        case .hold: "hold"
        case .undo: "undo"
        case .note: "note"
        case .finish: "finish"
        case .suggest: "suggest"
        }
    }

    private static func soundKey(_ sound: WalkSoundName) -> String { "sound.\(sound.rawValue)" }
    private static func hapticKey(_ sound: WalkSoundName) -> String { "haptic.\(sound.rawValue)" }

    private func wait(_ timer: WalkTimer, _ ms: Int?) {
        let key = Self.key(timer)
        let event: WalkEvent
        switch timer {
        case .hold: event = .orbHeld
        case .undo: event = .undoExpired
        case .note: event = .noteExpired
        case .finish: event = .finishExpired
        case .suggest: event = .suggestExpired
        }
        guard let ms else {
            scheduler.cancel(key: key)
            return
        }
        scheduler.after(ms, key: key) { [weak self] in self?.send(event) }
    }
}
#endif
