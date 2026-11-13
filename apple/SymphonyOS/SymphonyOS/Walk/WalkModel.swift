#if os(iOS)
import Foundation
import SwiftData
import Observation

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

    init(context: ModelContext, userId: UUID, entry: WalkEntry, position: WalkPosition?, edition: Edition,
         now: Date = .now, seasons: [SeasonBoundary]? = nil, store: WalkPositionStore? = WalkPositionStore(),
         scheduler: WalkScheduling? = nil) {
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
    }

    private var env: WalkEnv { WalkEnv(periods: periods, now: now) }

    func send(_ event: WalkEvent) {
        carryOut(state.apply(event, env))
    }

    func choose(_ action: WalkAction) {
        carryOut(state.act(action, env))
    }

    // MARK: Effects

    private func carryOut(_ effects: [WalkEffect]) {
        for effect in effects {
            switch effect {
            case .write(let write): self.write(write)
            case .save: save(.inProgress)
            case .timer(let timer, let ms): wait(timer, ms)
            case .end(let status):
                save(status)
                onEnd?(status)
            case .sound, .listen, .askCalendar:
                break                       // Tasks 19, 16 and 20
            }
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

    private func save(_ status: WalkStatus) {
        store?.save(WalkPosition(state, status: status, planted: planted, periods: periods, now: now), for: userId)
    }

    private func wait(_ timer: WalkTimer, _ ms: Int?) {
        let key: String
        let event: WalkEvent
        switch timer {
        case .hold: (key, event) = ("hold", .orbHeld)
        case .undo: (key, event) = ("undo", .undoExpired)
        case .note: (key, event) = ("note", .noteExpired)
        }
        guard let ms else {
            scheduler.cancel(key: key)
            return
        }
        scheduler.after(ms, key: key) { [weak self] in self?.send(event) }
    }
}
#endif
