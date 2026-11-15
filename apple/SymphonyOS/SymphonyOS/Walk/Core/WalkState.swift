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
    static let undoMs = 7000; static let noteMs = 3200      // the Undo pill, a note

    var step = 0; var ground = false       // 0 Welcome, 1 Year, 2 Season, 3 Month, 4 Week, 5 Today, 6 Look back up
    var depth: WalkDepth = .quick
    var areas: [WalkArea] = []; var kept: [UUID] = []     // ground labels in order; kept ids in the order kept
    var items: [WalkItem] = []             // in planting order
    var focusArea: UUID?                   // off the ground, the area the walk stands in (`standing`)
    var focus: [WalkLevel: UUID] = [:]     // a step's level → the focused item one level up
    var tour: [UUID] = []                  // whole-year stops still ahead on this step
    /// A walk down one chosen goal ("Walk another one down"): that goal first, then each flag
    /// this walk down planted with no goal above. Only lines that start at one of these give
    /// the goal above on the lower steps. Empty on a first walk.
    var walkingDown: [UUID] = []
    var firstThing: UUID?; var lastPlanted: [WalkLevel: UUID] = [:]
    var examplesOn: Set<Int> = []; var selected: UUID?; var expanded: WalkPostKey?
    var orb: Orb = .idle; var typing: String?
    // Speech, for this walk only (never saved): holds in a row that heard nothing; a
    // refusal, after which a hold opens typing; a session that ended while still held.
    var emptyHolds = 0; var speechIsOff = false; var sessionOver = false
    /// The walk's place is saved as it goes (false for a walk-down, which is never stored), so
    /// Leave for now may say "Your place is kept." Set by the model; never saved.
    var placeKept = true
    var orbWasOpen = false                 // the points were open when this press began, so a short press closes them
    /// The light is being taught (once per walk, on the first step where holding it answers),
    /// and it has been: `taught` is saved with the position, so a resume does not teach it again.
    var teaching = false; var taught = false
    var orbWasTeaching = false             // this press began while the light was taught: a short press only puts it away
    var pressWentOut = false               // this press slid out of the light (on Welcome, letting go there chooses nothing)
    var note: String?; var undoShowing = false
    var undo: [WalkUndoEntry] = []         // in memory only, by design: never saved, so a relaunch starts with nothing to undo
    var pulledChildren: [UUID: [UUID]] = [:]   // a pulled-up flag → the flags that named it as parent; in memory, for Undo
    var dayBeforeFirst: [UUID: Date?] = [:]    // a task the first-thing mark dated today → its day before; in memory
    var sheetOpen = false; var calendarOffer = false
    /// Set when the walk ends (Not now, Go to Today): no later event or point changes anything.
    var ended = false

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

    /// A flag let go and still waiting for its last words is planted before anything else
    /// the person does takes effect, so nothing in that second re-parents it or drops it.
    mutating func apply(_ event: WalkEvent, _ env: WalkEnv) -> [WalkEffect] {
        guard !ended else { return [] }
        // Any touch puts the lesson away (a press on the light does it in `orbDown`, a tap on the veil below).
        if teaching, !event.leavesAWaitingFlag, event != .orbDown, event != .moreTapped { teaching = false }
        let planted = event.leavesAWaitingFlag ? [] : plantWaitingFlag(env)
        let effects = planted + respond(to: event, env)
        settleStanding()
        return effects
    }

    private mutating func respond(to event: WalkEvent, _ env: WalkEnv) -> [WalkEffect] {
        switch event {
        case .areaTapped(let id): return tapArea(id)
        case .bannerTapped(let id):
            // The goal above is the switch, whoever planted it (on Today the first thing too); any
            // other flag on the step's own level (on Today, the first thing) is selected.
            if let level, id == focus[level] { return focusParent(id) }
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
        case .walkAnother: return walkAnother()
        // The calendar and the ending.
        case .calendarAnswered:
            calendarOffer = false
            return []
        case .sheetHandle: return moveSheet()
        case .goToToday: return step == 6 ? end(.finished) : []
        // Next at the foot: exactly what its own action does.
        case .nextTapped:
            guard let line = WalkCopy.nextLine(self, env.periods) else { return [] }
            return respond(to: line.action, env)
        // The top row: Back and Leave for now do what backing up and leaving do.
        case .backTapped: return respond(to: WalkAction.back, env)
        case .leaveTapped: return respond(to: WalkAction.leave, env)
        // "More" opens the choices when they are closed (as a tap on the light opens them, with speech
        // off too, where a tap types) and closes them when they are open. While the light is taught,
        // More (which the lesson points to) puts the lesson away and opens them. Not while the light is held.
        case .moreTapped:
            guard showsMore, orb == .idle || orb == .open else { return [] }
            teaching = false
            orb = orb == .open ? .idle : .open
            return []
        // A tap on the veil around the open compass closes it; on Welcome the choices stay. While typing
        // it closes an empty field and leaves one holding words as it is.
        case .veilTapped:
            if typing != nil {
                if !typedHasWords { typing = nil }
            } else if teaching {
                teaching = false
            } else if orb == .open, step != 0 {
                orb = .idle
            }
            return []
        }
    }

    // MARK: Actions (the compass points)

    /// A waiting flag is planted first, as for an event (a point chosen through VoiceOver).
    mutating func act(_ action: WalkAction, _ env: WalkEnv) -> [WalkEffect] {
        guard !ended else { return [] }
        teaching = false                    // a compass point chosen through VoiceOver puts the lesson away
        let planted = plantWaitingFlag(env)
        let effects = planted + respond(to: action, env)
        settleStanding()
        return effects
    }

    private mutating func respond(to action: WalkAction, _ env: WalkEnv) -> [WalkEffect] {
        switch action {
        case .quick: return choose(.quick)
        case .full: return choose(.full)
        case .notNow: return step == 0 ? end(.left) : []
        // Leave for now: the walk closes where it is; everything added is already saved.
        case .leave: return (1...5).contains(step) ? end(.paused) : []
        case .next: return walkOn(env)
        case .back: return backUp(env)
        case .examples:
            guard (1...4).contains(step), !ground else { return [] }
            if examplesOn.contains(step) { examplesOn.remove(step) } else { examplesOn.insert(step) }
            return []
        case .undo: return undoLast(env)
        case .startThere: return startThere(env)
        case .type:
            startTyping()
            return []
        // The calendar: the system's own prompt is the only one; asked once from here.
        case .calendar:
            guard level == .today, calendarOffer else { return [] }
            calendarOffer = false
            return [.askCalendar]
        }
    }

    /// Every way the walk ends: a flag still waiting for its last words is let go
    /// (its finish wait is taken back, so it can never plant after the end), and
    /// from here on nothing changes the walk or saves it.
    private mutating func end(_ status: WalkStatus) -> [WalkEffect] {
        orb = .idle
        orbWasOpen = false
        ended = true
        return [.timer(.finish, ms: nil), .end(status)]
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
        walkingDown = []
        step = 1
        settle()
        return [.save]
    }

    // MARK: Walking on and backing up

    private mutating func walkOn(_ env: WalkEnv) -> [WalkEffect] {
        if step == 1, ground {
            ground = false
            orb = .idle
            // What was done on the ground stays there (F23): Undo is for the step in view.
            undo = []
            pulledChildren = [:]
            undoShowing = false
            startTour()
            teachOnce()
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
        return enter(step + 1, env) + [.save]
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
        return enter(step - 1, env) + [.save]
    }

    /// Arrives on a step, from above or below, still standing in the same area. Focus per
    /// step is remembered; a step with none takes the area's remembered or newest goal above
    /// (`settleStanding`). Year entered from below has its tour over.
    /// Today, while the calendar may be asked for, offers it on the light's right point only (S35: no note).
    private mutating func enter(_ newStep: Int, _ env: WalkEnv) -> [WalkEffect] {
        step = newStep
        tour = []
        settle()
        teachOnce()
        guard let level, level != .year else { return [] }
        if level == .season, depth == .full { resumeSeasonTour() }
        guard level == .today else { return [] }
        calendarOffer = env.canAskCalendar
        return []
    }

    /// Leaving the ground: the walk stands in the first kept area; in a whole-year
    /// walk the Year tour starts there, the rest waiting in `tour`.
    private mutating func startTour() {
        focusArea = kept.first
        tour = depth == .full ? Array(kept.dropFirst()) : []
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

    /// A tap that moves the focus during a tour moves the tour with it: the stops
    /// left are the ones after the new focus. No focus (nil) leaves the stops as they were.
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

    /// The first step of a walk where holding the light answers: the light is taught, once.
    mutating func teachOnce() {
        guard !taught, (1...5).contains(step), !ground else { return }
        teaching = true
        taught = true
    }

    /// What belongs to one step only is put away when the step changes, Undo included (F23).
    private mutating func settle() {
        selected = nil
        expanded = nil
        undoShowing = false
        undo = []
        pulledChildren = [:]
        typing = nil
        orb = .idle
        sheetOpen = false
        teaching = false
    }

    // MARK: Where the walk stands

    /// Off the ground, the area the walk stands in: `focusArea` when it is a kept area;
    /// else nil (the nameless post, where flags with no kept area stand).
    var standing: UUID? {
        guard !ground, let id = focusArea, kept.contains(id) else { return nil }
        return id
    }

    /// Steps 2 to 5: the flags one level above the step's that stand where the walk
    /// stands (a flag with no kept area counts for the nameless post), in planting order.
    func parentsHere() -> [WalkItem] {
        let here = standing
        return parentsAnywhere().filter { column(of: $0) == here }
    }

    /// Steps 2 to 5: every flag one level above the step's, in planting order (on Today every
    /// week task, the first thing included: it is a week task like the others). On a walk down,
    /// only the flags of its own line (`walkingDown`).
    private func parentsAnywhere() -> [WalkItem] {
        guard let level, level != .year, let above = WalkLevel(rawValue: level.rawValue - 1) else { return [] }
        return items(on: above).filter(onWalkedLine)
    }

    /// The goals above the walk may settle on by itself: on Today any week task but the first
    /// thing, which it takes only when nothing else is there (a lone first thing is the goal above).
    private func choosable(_ parents: [WalkItem]) -> [WalkItem] {
        level == .today ? parents.filter { $0.id != firstThing } : parents
    }

    /// Of these parents, the one the walk settles on: the remembered or newest choosable one,
    /// else the first thing among them.
    private func pick(_ parents: [WalkItem]) -> WalkItem? {
        rememberedOrNewest(choosable(parents)) ?? parents.first { $0.id == firstThing }
    }

    /// On a walk down, whether the flag's line (it, then its parents up) starts at the goal
    /// walked or at a flag this walk down planted; any flag on a first walk.
    private func onWalkedLine(_ item: WalkItem) -> Bool {
        guard !walkingDown.isEmpty else { return true }
        var at: WalkItem? = item
        for _ in 0...WalkLevel.allCases.count {                // a chain is never deeper than year to Today
            guard let flag = at else { return false }
            if walkingDown.contains(flag.id) { return true }
            at = self.item(flag.parentId)
        }
        return false
    }

    /// Steps 2 to 5: where a tap on the goal the step is about goes: the next goal above here,
    /// round again (on Today the first thing is one of them); none with only one.
    /// A first thing on the nameless post is in every area's round on Today: the nameless post
    /// has no label to walk to, so this is the way back to it.
    func nextGoalAbove() -> UUID? {
        guard let level, level != .year, let current = focus[level] else { return nil }
        let here = standing
        let round = parentsAnywhere().filter {
            column(of: $0) == here || (level == .today && $0.id == firstThing && column(of: $0) == nil)
        }
        guard round.count > 1, let index = round.firstIndex(where: { $0.id == current }) else { return nil }
        return round[(index + 1) % round.count].id
    }

    /// The goal above after a tap on this flag, or nil when the tap does not change it: the
    /// goal above itself walks the round; on Today a first thing the walk did not plant, while
    /// it is not the goal above, becomes it (one the walk planted is selected instead).
    func goalAboveAfterTap(on id: UUID) -> UUID? {
        guard let level, level != .year else { return nil }
        if id == focus[level] { return nextGoalAbove() }
        guard level == .today, id == firstThing, let first = item(id), !first.mine, onWalkedLine(first) else { return nil }
        return id
    }

    /// The post a flag stands on: its area when that area is kept, else the nameless
    /// one (nil). On the ground every area is a column.
    func column(of item: WalkItem) -> UUID? {
        guard let id = item.areaId, area(id) != nil, ground || kept.contains(id) else { return nil }
        return id
    }

    /// Of these parents, the one the walk remembers (planted last on their level) or else the newest.
    private func rememberedOrNewest(_ parents: [WalkItem]) -> WalkItem? {
        guard let level = parents.first?.level else { return nil }
        return parents.first { $0.id == lastPlanted[level] } ?? parents.last
    }

    /// After every event and action the walk stands somewhere, never on a post with no way on.
    /// Year: in a kept area. Steps 2 to 5: in the focused goal's area; with no focused goal,
    /// on the area's remembered or newest goal above; an area with nothing above but a flag
    /// on this step stays as it is; otherwise the newest goal above anywhere, and the walk
    /// goes to its area; with none at all, no goal and a kept area. Look back up: a kept
    /// area, or the first one holding a flag.
    private mutating func settleStanding() {
        guard !ground else { return }
        let stands = focusArea.map(kept.contains) ?? false
        switch step {
        case 1:
            if !stands, let first = kept.first { focusArea = first }
        case 2...5:
            guard let level else { return }
            if let parent = item(focus[level]) {
                focusArea = column(of: parent)
                return
            }
            if let parent = pick(parentsHere()) {
                focus[level] = parent.id
                focusArea = column(of: parent)
                return
            }
            focus[level] = nil
            let here = standing
            if items(on: level).contains(where: { column(of: $0) == here }) { return }
            let anywhere = parentsAnywhere()
            if let newest = choosable(anywhere).last ?? anywhere.first(where: { $0.id == firstThing }) {
                focus[level] = newest.id
                focusArea = column(of: newest)
                return
            }
            if !stands { focusArea = kept.first }
        case 6:
            guard !stands else { return }
            focusArea = kept.first { id in items.contains { column(of: $0) == id } } ?? kept.first
        default:
            return
        }
    }

    // MARK: Areas and the goal above

    /// The ground: a tap keeps an area or lets it go. Off the ground, on steps 1 to 6, a tap
    /// on a kept area walks there; on steps 2 to 5 the area's remembered or newest goal
    /// above is the one the step is about (none if it has none). The area stood in: nothing.
    private mutating func tapArea(_ id: UUID) -> [WalkEffect] {
        guard area(id) != nil else { return [] }
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
        guard walksThere(id) else { return [] }
        stand(in: id)
        return [.save]
    }

    /// Off the ground, on steps 1 to 6, whether a tap on this kept area stands the walk there
    /// (after settling); never for the area already stood in. An area where the walk cannot stand
    /// (nothing above or on this step for it) takes no tap, and its label says so (`WalkCopy.areaHint`).
    func walksThere(_ id: UUID) -> Bool {
        guard !ground, (1...6).contains(step), kept.contains(id), area(id) != nil, id != standing else { return false }
        var after = self
        after.stand(in: id)
        after.settleStanding()
        return after.standing == id
    }

    /// Stands in the area; on steps 2 to 5 the goal above is the area's own (`pick`), or none.
    private mutating func stand(in id: UUID) {
        focusArea = id
        if let level, level != .year {
            focus[level] = pick(parentsHere())?.id
            follow(focus[level])
        } else {
            follow(focusArea)
        }
    }

    /// Steps 2 to 5: a tap on the goal the step is about switches (`goalAboveAfterTap`); with
    /// nowhere to go, nothing. No other goal above is drawn. A tap never changes the first thing.
    private mutating func focusParent(_ id: UUID) -> [WalkEffect] {
        guard let level, let next = goalAboveAfterTap(on: id) else { return [] }
        focus[level] = next
        follow(next)
        return [.save]
    }
}

enum WalkEvent: Equatable {
    case orbDown, orbHeld, orbMoved(CGPoint), orbUp(heldMs: Int), orbCancelled
    /// `typeSubmitted` carries the field's words, so a blur that closed the field first cannot lose them.
    case heard(String), speechUnavailable, typeChanged(String), typeSubmitted(String), typeDismissed, point(CompassPoint)
    /// The listening session ended (its last words are in); the finish wait ran out;
    /// permission was given after the prompts took the touch.
    case listenEnded, finishExpired, speechReady
    case areaTapped(UUID), bannerTapped(UUID), stubTapped(WalkPostKey), exampleTapped(String)
    case moveTo(UUID), pullUp, undo, undoExpired, noteExpired, calendarAnswered
    case sheetHandle, rowToggled(UUID), walkAnother, goToToday             // rowToggled carries a task id
    /// A tap on the Next line at the foot; a tap on the veil behind the open compass; the top row's
    /// More, Back and Leave for now.
    case nextTapped, veilTapped, moreTapped, backTapped, leaveTapped
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
    /// `walkedAt`: where the pulled-up flag stood in `walkingDown`, if it started a walk down's line.
    case move(UUID, from: UUID?, keptAdded: UUID?), pullUp(WalkItem, index: Int, wasFirstThing: Bool, walkedAt: Int?)
    case firstThing(previous: UUID?, created: UUID?)
}
