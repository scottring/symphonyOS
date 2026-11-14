import Foundation
import CoreGraphics

/// What the reducer may read from outside: the periods, the time, a source of
/// ids, and whether the calendar may be asked for. Nothing else reaches it.
struct WalkEnv {
    var periods: WalkPeriods
    var now: Date
    var newId: () -> UUID = UUID.init
    var canAskCalendar = false
}

/// The whole walk as one value. `apply` and `act` move it from step to step and
/// say, as effects, what a later layer should do (sound, listen, write, wait, save).
struct WalkState: Equatable {
    static let undoMs = 7000; static let noteMs = 3200; static let calendarNoteMs = 6000    // the Undo pill, a note, the calendar line

    var step = 0; var ground = false       // 0 Welcome, 1 Year, 2 Season, 3 Month, 4 Week, 5 Today, 6 Look back up
    var depth: WalkDepth = .quick
    var areas: [WalkArea] = []; var kept: [UUID] = []     // ground labels in order; kept ids in the order kept
    var items: [WalkItem] = []             // in planting order
    var focusArea: UUID?
    var focus: [WalkLevel: UUID] = [:]     // a step's level → the focused item one level up
    var tour: [UUID] = []                  // whole-year stops still ahead on this step
    var firstThing: UUID?; var lastPlanted: [WalkLevel: UUID] = [:]
    var examplesOn: Set<Int> = []; var selected: UUID?; var expanded: WalkPostKey?
    var orb: Orb = .idle; var typing: String?
    // Speech, for this walk only (never saved): holds in a row that heard nothing; a
    // refusal, after which a hold opens typing; a session that ended while still held.
    var emptyHolds = 0; var speechIsOff = false; var sessionOver = false
    var orbWasOpen = false                 // the points were open when this press began, so a short press closes them
    var note: String?; var undoShowing = false
    var undo: [WalkUndoEntry] = []         // in memory only, by design: never saved, so a relaunch starts with nothing to undo
    var pulledChildren: [UUID: [UUID]] = [:]   // a pulled-up flag → the flags that named it as parent; in memory, for Undo
    var dayBeforeFirst: [UUID: Date?] = [:]    // a task the first-thing mark dated today → its day before; in memory
    var sheetOpen = false; var calendarOffer = false

    /// `finishing`: let go, waiting (up to `WalkOrb.finishMs`) for the recogniser's last words.
    enum Orb: Equatable { case idle, holding(hover: CompassPoint?), open, speaking(live: String), finishing(live: String) }

    /// The level this step plants on; nil on Welcome and Look back up.
    var level: WalkLevel? { (1...5).contains(step) ? WalkLevel(rawValue: step) : nil }

    /// Kept areas, in `areas` order (the order of the columns), not the order kept.
    var keptAreas: [WalkArea] { areas.filter { kept.contains($0.id) } }

    func items(on level: WalkLevel) -> [WalkItem] { items.filter { $0.level == level } }
    func item(_ id: UUID?) -> WalkItem? { id.flatMap { id in items.first { $0.id == id } } }
    func area(_ id: UUID?) -> WalkArea? { id.flatMap { id in areas.first { $0.id == id } } }

    // MARK: Events

    mutating func apply(_ event: WalkEvent, _ env: WalkEnv) -> [WalkEffect] {
        switch event {
        case .areaTapped(let id): return tapArea(id)
        case .bannerTapped(let id):
            // A flag on the step's own level (on Today, the first thing) is selected; one level up, focused.
            if selects(id) { return select(id) }
            return focusParent(id)
        case .noteExpired:
            note = nil
            return []
        // The orb, speech and typing (Task 11).
        case .orbDown, .orbHeld, .orbMoved, .orbUp, .orbCancelled,
             .heard, .listenEnded, .finishExpired, .speechUnavailable, .speechReady,
             .typeChanged, .typeSubmitted, .typeDismissed, .point:
            return applyOrb(event, env)
        // Planting, examples, undo, move and pull up (WalkState+Plant.swift).
        case .stubTapped(let key): return openStub(key)
        case .exampleTapped(let text): return plantExample(text, env)
        case .moveTo(let areaId): return moveSelected(to: areaId)
        case .pullUp: return pullUpSelected()
        case .undo: return undoLast(env)
        case .undoExpired:
            undoShowing = false             // only the pill goes: the stack stays
            return []
        case .rowToggled(let taskId): return toggleRow(taskId)
        // The calendar and the ending (Tasks 17 and 20).
        case .calendarAnswered, .sheetHandle, .walkAnother, .goToToday:
            return []
        }
    }

    // MARK: Actions (the compass points)

    mutating func act(_ action: WalkAction, _ env: WalkEnv) -> [WalkEffect] {
        switch action {
        case .quick: return choose(.quick)
        case .full: return choose(.full)
        case .notNow: return step == 0 ? [.end(.left)] : []
        case .next: return walkOn(env)
        case .back: return backUp(env)
        case .nudge: return nudge()
        case .examples:
            guard (1...4).contains(step), !ground else { return [] }
            if examplesOn.contains(step) { examplesOn.remove(step) } else { examplesOn.insert(step) }
            return []
        case .undo: return undoLast(env)
        case .startThere: return startThere(env)
        case .type:
            startTyping()
            return []
        // The calendar (Task 20).
        case .calendar:
            return []
        }
    }

    // MARK: Depth

    /// Choosing a depth opens the ground, and is the moment a position is first saved.
    private mutating func choose(_ depth: WalkDepth) -> [WalkEffect] {
        self.depth = depth
        ground = true
        kept = []
        focusArea = nil
        focus = [:]                         // a focus left from an earlier walk must not skip a first visit
        tour = []
        step = 1
        settle()
        return [.save]
    }

    // MARK: Walking on and backing up

    private mutating func walkOn(_ env: WalkEnv) -> [WalkEffect] {
        if step == 1, ground {
            ground = false
            orb = .idle
            startTour()
            return [.save]
        }
        if let stop = tour.first {
            // The stops left always follow the focus (see `follow`), so the next one is first.
            tour.removeFirst()
            selected = nil
            expanded = nil
            typing = nil
            orb = .idle
            if step == 1 { focusArea = stop } else if let level { focus[level] = stop }
            return [.save]
        }
        guard step < 6 else { return [] }
        enter(step + 1, env)
        return [.save]
    }

    private mutating func backUp(_ env: WalkEnv) -> [WalkEffect] {
        if step == 1, !ground {
            ground = true
            focusArea = nil
            tour = []
            settle()
            return [.save]
        }
        if step == 1, ground {
            ground = false
            step = 0
            settle()
            return [.save]
        }
        guard step > 0 else { return [] }
        enter(step - 1, env)
        return [.save]
    }

    /// Arrives on a step, from above or below. Focus per step is remembered. Year
    /// entered from below has its tour over: no peak focused, the whole range in view.
    private mutating func enter(_ newStep: Int, _ env: WalkEnv) {
        step = newStep
        focusArea = nil
        tour = []
        settle()
        guard let level, level != .year else { return }
        if level == .season, depth == .full {
            resumeSeasonTour()
        } else if focus[level] == nil, let above = WalkLevel(rawValue: level.rawValue - 1),
                  let last = item(lastPlanted[above]) {
            // The flag planted last on the level above, so the next flag links to it.
            focus[level] = last.id
        }
        if level == .today, env.canAskCalendar { calendarOffer = true }
    }

    /// Leaving the ground: in a whole-year walk the Year tour starts at the first
    /// kept area, the rest waiting in `tour`.
    private mutating func startTour() {
        guard depth == .full else {
            focusArea = nil
            tour = []
            return
        }
        focusArea = kept.first
        tour = Array(kept.dropFirst())
    }

    /// Season in a whole-year walk: the first time, the tour starts at the first
    /// year goal; after that it picks up at the remembered focus. A focus that is
    /// no longer a stop (its goal was pulled up) starts it again.
    mutating func resumeSeasonTour() {
        let stops = tourStops
        if let current = focus[.season], let index = stops.firstIndex(of: current) {
            tour = Array(stops[(index + 1)...])
        } else {
            focus[.season] = stops.first
            tour = Array(stops.dropFirst())
        }
    }

    /// A whole-year tour's full order: kept areas in kept order on Year, year goals
    /// in column order on Season. Derived, so only the stops still ahead are stored.
    private var tourStops: [UUID] {
        guard depth == .full, !ground else { return [] }
        switch step {
        case 1: return kept
        case 2: return yearGoalsInColumnOrder().map(\.id)
        default: return []
        }
    }

    /// A tap or a nudge that moves the focus during a tour moves the tour with it:
    /// the stops left are the ones after the new focus. Releasing the focus (nil)
    /// leaves the stops as they were.
    private mutating func follow(_ newFocus: UUID?) {
        guard !tour.isEmpty, let newFocus else { return }
        let stops = tourStops
        guard let index = stops.firstIndex(of: newFocus) else { return }
        tour = Array(stops[(index + 1)...])
    }

    /// Columns follow `areas`; the unlabeled post is last; planting order inside a column.
    private func yearGoalsInColumnOrder() -> [WalkItem] {
        let column = { (item: WalkItem) -> Int in
            item.areaId.flatMap { id in areas.firstIndex { $0.id == id } } ?? Int.max
        }
        return items(on: .year).enumerated()
            .sorted { (column($0.element), $0.offset) < (column($1.element), $1.offset) }
            .map(\.element)
    }

    /// What belongs to one step only is put away when the step changes.
    private mutating func settle() {
        selected = nil
        expanded = nil
        undoShowing = false
        typing = nil
        orb = .idle
        sheetOpen = false
    }

    // MARK: Peaks, parent flags and nudge

    private mutating func tapArea(_ id: UUID) -> [WalkEffect] {
        guard step == 1, area(id) != nil else { return [] }
        if ground {
            if let index = kept.firstIndex(of: id) {
                kept.remove(at: index)
                undo.append(.unkeep(id, index: index))
            } else {
                kept.append(id)
                undo.append(.keep(id))
            }
            undoShowing = true
            return [.sound(.tick, afterMs: 0), .timer(.undo, ms: WalkState.undoMs), .save]
        }
        guard kept.contains(id) else { return [] }
        focusArea = focusArea == id ? nil : id
        follow(focusArea)
        return [.save]
    }

    /// Steps 2 to 5: a flag one level above is the parent the next flag links to.
    private mutating func focusParent(_ id: UUID) -> [WalkEffect] {
        guard let level, let item = item(id),
              item.level.rawValue == level.rawValue - 1 else { return [] }
        focus[level] = focus[level] == id ? nil : id
        follow(focus[level])
        return [.save]
    }

    private mutating func nudge() -> [WalkEffect] {
        guard let level, !ground else { return [] }
        if level == .year {
            guard !kept.isEmpty else { return [] }
            let next = focusArea.flatMap { kept.firstIndex(of: $0) }.map { ($0 + 1) % kept.count } ?? 0
            focusArea = kept[next]
            follow(focusArea)
            return [.save]
        }
        guard let above = WalkLevel(rawValue: level.rawValue - 1) else { return [] }
        // Season goes through the year goals in the order its tour visits them.
        let parents = level == .season ? yearGoalsInColumnOrder() : items(on: above)
        guard !parents.isEmpty else { return [] }
        let next = focus[level].flatMap { id in parents.firstIndex { $0.id == id } }
            .map { ($0 + 1) % parents.count } ?? 0
        focus[level] = parents[next].id
        follow(focus[level])
        return [.save]
    }
}

enum WalkEvent: Equatable {
    case orbDown, orbHeld, orbMoved(CGPoint), orbUp(heldMs: Int), orbCancelled
    case heard(String), speechUnavailable, typeChanged(String), typeSubmitted, typeDismissed, point(CompassPoint)
    /// The listening session ended (its last words are in); the finish wait ran out;
    /// permission was given after the prompts took the touch.
    case listenEnded, finishExpired, speechReady
    case areaTapped(UUID), bannerTapped(UUID), stubTapped(WalkPostKey), exampleTapped(String)
    case moveTo(UUID), pullUp, undo, undoExpired, noteExpired, calendarAnswered
    case sheetHandle, rowToggled(UUID), walkAnother, goToToday             // rowToggled carries a task id
}

enum WalkTimer: Equatable { case hold, undo, note, finish }

enum WalkWrite: Equatable {
    case area(WalkArea), dropArea(UUID), create(WalkItem, parent: WalkItem?), remove(UUID, WalkLevel), restore(UUID)
    case setArea(UUID, WalkLevel, UUID?), firstThing(UUID?, previous: UUID?), toggleDone(UUID)
}

enum WalkEffect: Equatable {
    /// `listen(false)` cancels; `finishListening` stops the microphone and waits for the last words.
    case sound(WalkSoundName, afterMs: Int), listen(Bool), finishListening, write(WalkWrite)
    case timer(WalkTimer, ms: Int?)        // nil cancels
    case askCalendar, save, end(WalkStatus)
}

enum WalkUndoEntry: Equatable {
    case plant(UUID), nameArea(WalkArea), keep(UUID), unkeep(UUID, index: Int)
    case move(UUID, from: UUID?, keptAdded: UUID?), pullUp(WalkItem, index: Int, wasFirstThing: Bool)
    case firstThing(previous: UUID?, created: UUID?)
}
