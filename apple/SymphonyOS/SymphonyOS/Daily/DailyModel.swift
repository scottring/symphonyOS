#if os(iOS)
import Foundation
import SwiftData
import Observation

/// The one observable object the light pages read. It runs the bar's reducer
/// and carries out what it asks for: the listener (on the phone only), the
/// writer, and the timers through the scheduler. It keeps the one last change
/// Undo can take back, the sign put away today, the row a sign lit, and the day,
/// read again when the app comes back.
///
/// A pull-up is never written while its Undo can still be used: the row is
/// hidden at once (`pulledUp`), Undo shows it again with nothing written, and
/// the removal is written once the Undo window ends, another change replaces
/// it, the page or the app goes away (`.left`), the model closes, or a new day
/// is read. Killed inside those seconds, the row simply stays.
@MainActor @Observable final class DailyModel {
    private(set) var bar = DailyBar()
    private(set) var today: Date
    private(set) var periods: WalkPeriods
    private(set) var dismissed: Set<Signpost.Kind>
    /// The row a signpost tap lit.
    private(set) var lit: UUID?
    /// The row pulled up whose Undo is still open. Nothing is written yet: the pages
    /// leave it out of the rows, the ring, the signpost's facts and the week's days.
    private(set) var pulledUp: UUID?
    var page: DailyAdd.Page = .today
    /// Set by a mountain page: where a goal added from the bar hangs.
    var hanging: (kept: [WalkArea], focusArea: UUID?, parent: WalkItem?, periods: WalkPeriods)?

    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private let userId: UUID
    @ObservationIgnored private let seasons: [SeasonBoundary]?
    @ObservationIgnored private let clock: @MainActor () -> Date
    @ObservationIgnored private let scheduler: WalkScheduling
    @ObservationIgnored private let listener: WalkListening
    @ObservationIgnored private let memory: SignpostMemory
    @ObservationIgnored private let parse: (String) -> CaptureParser.Result
    /// Rebuilt on a new day, so the first thing and the walk's periods are today's.
    @ObservationIgnored private var writer: DailyWriter
    /// The one change Undo takes back.
    @ObservationIgnored private var last: Change?
    @ObservationIgnored private var queue: [DailyBar.Event] = []
    @ObservationIgnored private var draining = false
    /// Counts the taps that asked to listen; each session's callbacks carry their tap's number.
    @ObservationIgnored private var tapCount = 0
    @ObservationIgnored private var session: Session = .none
    /// For tests: called as a pending pull-up is written, with the periods of the writer that wrote it.
    @ObservationIgnored var onPullUpWritten: ((UUID, WalkPeriods) -> Void)?

    private enum Change {
        case added(DailyWriter.Added)
        case moved(PlanWriter.Snapshot)
        case pulledUp(UUID, WalkLevel)
        case area(UUID, WalkLevel, back: WalkArea?)
    }

    /// Where the listener is for the latest tap. Words and an end are taken only
    /// from the tap they belong to.
    private enum Session: Equatable {
        case none
        case waiting(Int)       // asked to listen; start() not called yet
        case starting(Int)      // start() called and not back: the permission prompts may be up
        case live(Int)
        case finishing(Int)     // the second tap: waiting for the last words and the end
    }

    init(context: ModelContext, userId: UUID, seasons: [SeasonBoundary]? = nil,
         clock: @escaping @MainActor () -> Date = DailyClock.now, scheduler: WalkScheduling? = nil,
         listener: WalkListening? = nil, memory: SignpostMemory = SignpostMemory(),
         parse: @escaping (String) -> CaptureParser.Result = CaptureParser.parse) {
        let now = clock()
        let periods = WalkPeriods.pick(now: now, seasons: seasons)
        self.today = PlanCalendar.day(now)
        self.periods = periods
        self.dismissed = memory.dismissed(for: userId, on: now)
        self.context = context
        self.userId = userId
        self.seasons = seasons
        self.clock = clock
        self.scheduler = scheduler ?? WalkClock()
        // Nothing is asked here: permission comes with the first tap on the light.
        self.listener = listener ?? Self.makeListener()
        self.memory = memory
        self.parse = parse
        self.writer = DailyWriter(context: context, userId: userId, periods: periods)
    }

    /// Torn down with a pull-up pending: it is written, straight through the writer
    /// (no observed state is touched on the way out).
    isolated deinit {
        if case .pulledUp(let id, let level) = last { writer.pullUp(id, level: level) }
    }

    /// The bar's listener: on the phone only (where it cannot recognise on its own,
    /// it reports speech unavailable and the bar types), recording only, as Tell does.
    static func makeListener() -> Dictation {
        let dictation = Dictation()
        dictation.onDeviceOnly = true
        dictation.playsAlongside = false
        return dictation
    }

    // MARK: Events

    /// Runs the reducer and carries out what it asks for. An event sent while
    /// effects are being carried out waits its turn, so effects apply in order.
    func send(_ event: DailyBar.Event) {
        queue.append(event)
        guard !draining else { return }
        draining = true
        defer { draining = false }
        while !queue.isEmpty {
            let next = queue.removeFirst()
            switch next {
            case .undoExpired:
                commitPullUp()
            case .left:
                // The page or the app went away: a pending pull-up is written, and its Undo goes.
                if commitPullUp() { forgetUndo() }
            default:
                break
            }
            carryOut(bar.apply(next))
        }
    }

    /// The model taken down: a pending pull-up is written, listening stops, nothing waiting runs.
    func close() {
        commitPullUp()
        cancelListening()
        for timer in [DailyBar.Timer.undo, .note, .finish] { scheduler.cancel(key: Self.key(timer)) }
    }

    // MARK: Rows

    /// Ticks a row off, or back on. Any tick puts the lit row out, and ends the Undo
    /// before it: the change it offered is no longer the last thing.
    func toggle(_ row: DailyDay.Row) {
        endUndo()
        writer.setDone(row, !row.done, today: today)
        lit = nil
    }

    /// Onto a day, or with `day` nil onto the week with no day; Undo puts it back.
    func move(_ taskId: UUID, to day: Date?) {
        guard let snapshot = writer.move(taskId, to: day) else { return }
        offerUndo(.moved(snapshot), note: nil)
    }

    /// Hidden at once and written only when its Undo can no longer be used.
    func pullUp(_ id: UUID, level: WalkLevel) {
        // A row the writer would refuse is never hidden: hidden, it would come back with no word.
        guard pulledUp != id, writer.canPullUp(id, level: level) else { return }
        offerUndo(.pulledUp(id, level), note: nil)
        pulledUp = id
        if lit == id { lit = nil }
    }

    /// Files a goal or task under another area (or none); `old` is the area it leaves, for Undo.
    func setArea(_ id: UUID, level: WalkLevel, to area: WalkArea?, from old: UUID?) {
        // Read before the change: the writer may drop the area it leaves.
        let back = old.flatMap { id in areaName(id).map { WalkArea(id: id, name: $0) } }
        writer.setArea(id, level: level, to: area)
        guard old == nil || back != nil else {
            // An area with no name to make it again cannot be put back: this change has no
            // Undo, and the one before it is no longer the last thing.
            endUndo()
            return
        }
        offerUndo(.area(id, level, back: back), note: nil)
    }

    /// Moves the first-thing mark. Not undone by Undo, so it ends the Undo before it.
    func setFirst(_ id: UUID?, previous: UUID?) {
        endUndo()
        writer.setFirst(id, previous: previous)
    }

    /// Lights a row; a second tap on the same sign puts it out.
    func light(_ id: UUID?) {
        lit = id == lit ? nil : id
    }

    func dismiss(_ kind: Signpost.Kind) {
        memory.dismiss(kind, for: userId, on: today)
        dismissed = memory.dismissed(for: userId, on: today)
    }

    /// Re-reads the clock. On a new day the day, the periods, the signs put away,
    /// the lit row and the note start over; a pending pull-up is written first,
    /// then the writer is rebuilt for the new periods and Undo is cleared.
    func refreshDay() {
        let now = clock()
        guard !PlanCalendar.sameDay(now, today) else {
            dismissed = memory.dismissed(for: userId, on: today)     // another page may have put one away
            return
        }
        commitPullUp()
        last = nil
        today = PlanCalendar.day(now)
        periods = WalkPeriods.pick(now: now, seasons: seasons)
        writer = DailyWriter(context: context, userId: userId, periods: periods)
        dismissed = memory.dismissed(for: userId, on: today)
        lit = nil
        forgetUndo()
        scheduler.cancel(key: Self.key(.note))
        send(.noteExpired)
    }

    // MARK: Effects

    private func carryOut(_ effects: [DailyBar.Effect]) {
        for effect in effects {
            switch effect {
            case .add(let words): add(words)
            case .listen(let on): on ? listen() : cancelListening()
            case .finishListening: finishListening()
            case .undo: undo()
            case .timer(let timer, let ms): wait(timer, ms)
            }
        }
    }

    private func add(_ words: String) {
        guard let read = DailyAdd.read(words, on: page, today: today, weekStart: periods.weekStart, parse: parse)
        else { return }
        let added: DailyWriter.Added
        if case .goal = read, let h = hanging {
            added = writer.add(read, kept: h.kept, focusArea: h.focusArea, parent: h.parent, periods: h.periods)
        } else {
            added = writer.add(read)
        }
        let note: String?
        if case .task(_, let day?, _, false) = read {
            note = DailyCopy.itsOn(day, today: today)
        } else if let placed = added.placed {
            note = WalkCopy.placed(placed)
        } else {
            note = nil
        }
        offerUndo(.added(added), note: note)
    }

    /// A new change takes the Undo: one replaced pull-up is written now.
    private func offerUndo(_ change: Change, note: String?) {
        commitPullUp()
        last = change
        send(.did(note: note))
    }

    private func undo() {
        guard let change = last else { return }
        last = nil
        switch change {
        case .added(let added): writer.takeBack(added)
        case .moved(let snapshot): writer.undoMove(snapshot)
        case .pulledUp: pulledUp = nil                      // nothing was written
        case .area(let id, let level, let back): writer.setArea(id, level: level, to: back)
        }
    }

    /// Writes a pending pull-up, once. True when there was one.
    @discardableResult
    private func commitPullUp() -> Bool {
        guard case .pulledUp(let id, let level) = last else { return false }
        last = nil
        pulledUp = nil
        writer.pullUp(id, level: level)
        onPullUpWritten?(id, writer.periods)
        return true
    }

    /// A change Undo cannot take back: the one before it is no longer the last thing,
    /// so a pending pull-up is written and the Undo goes.
    private func endUndo() {
        commitPullUp()
        last = nil
        forgetUndo()
    }

    /// The Undo pill goes, with nothing left for it to take back.
    private func forgetUndo() {
        scheduler.cancel(key: Self.key(.undo))
        if bar.undoShowing { send(.undoExpired) }
    }

    private func areaName(_ id: UUID) -> String? {
        var d = FetchDescriptor<GoalArea>(predicate: #Predicate { $0.id == id })
        d.fetchLimit = 1
        if let row = (try? context.fetch(d))?.first, row.userId == userId { return row.name }
        return hanging?.kept.first { $0.id == id }?.name
    }

    // MARK: Listening

    /// Starting goes through the scheduler and asks for permission the first time;
    /// a start that cannot listen turns speech off for the bar, which then types.
    private func listen() {
        tapCount += 1
        let tap = tapCount
        session = .waiting(tap)
        scheduler.run { [weak self] in await self?.begin(tap) }
    }

    private func begin(_ tap: Int) async {
        guard session == .waiting(tap) else { return }      // finished or cancelled before it began
        session = .starting(tap)
        listener.onWords = { [weak self] words in self?.heard(words, from: tap) }
        listener.onEnd = { [weak self] in self?.ended(tap) }
        await listener.start()
        guard tapCount == tap else { return }                // a newer tap has its own start
        if listener.problem != nil {
            // Refused, missing or failed, even if the light was tapped again while the prompts were up.
            session = .none
            send(.speechUnavailable)
        } else if session == .starting(tap) {
            session = .live(tap)
        }
    }

    private func heard(_ words: String, from tap: Int) {
        switch session {
        case .starting(tap), .live(tap), .finishing(tap): send(.heard(words))
        default: break                                       // an earlier tap's, or after a cancel
        }
    }

    private func ended(_ tap: Int) {
        switch session {
        case .live(tap), .finishing(tap):
            session = .none
            send(.listenEnded)
        default: break
        }
    }

    /// The second tap: the microphone stops and the last words are awaited. With no
    /// session listening there is nothing to wait for, so it ends now.
    private func finishListening() {
        switch session {
        case .live(let tap):
            session = .finishing(tap)
            listener.finish()
        case .starting:
            listener.stop()
            session = .none
            send(.listenEnded)
        case .waiting, .none:
            session = .none
            send(.listenEnded)
        case .finishing:
            break
        }
    }

    private func cancelListening() {
        switch session {
        case .starting, .live, .finishing:
            listener.stop()
        case .waiting, .none:
            break
        }
        session = .none
    }

    // MARK: Timers

    private static func key(_ timer: DailyBar.Timer) -> String {
        switch timer {
        case .undo: "daily.undo"
        case .note: "daily.note"
        case .finish: "daily.finish"
        }
    }

    private func wait(_ timer: DailyBar.Timer, _ ms: Int?) {
        let key = Self.key(timer)
        guard let ms else {
            scheduler.cancel(key: key)
            return
        }
        let event: DailyBar.Event
        switch timer {
        case .undo: event = .undoExpired
        case .note: event = .noteExpired
        case .finish: event = .finishExpired
        }
        scheduler.after(ms, key: key) { [weak self] in self?.send(event) }
    }
}
#endif
