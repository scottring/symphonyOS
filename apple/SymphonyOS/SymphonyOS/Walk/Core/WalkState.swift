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
    var tour: [UUID] = []                  // the stops still ahead on this step (`tourStops`)
    /// A walk down one chosen goal ("Walk another one down"): that goal first, then each flag
    /// this walk down planted with no goal above. Only lines that start at one of these give
    /// the goal above on the lower steps. Empty on a first walk.
    var walkingDown: [UUID] = []
    var firstThing: UUID?; var lastPlanted: [WalkLevel: UUID] = [:]
    var examplesOn: Set<Int> = []; var selected: UUID?; var expanded: WalkPostKey?
    /// The page of examples the walk is on where it stands (`toggleExamples`). In memory only.
    var examplePage: ExamplePage?
    /// The server can be asked for suggestions (`walk-suggest`): signed in, not a demo. Set by the model; never saved.
    var canSuggest = false
    /// What the server suggested for a place, asked once per place and kept for this walk; an empty
    /// list when nothing came (the written examples stand in). In memory only.
    var suggestions: [ExamplePlace: [String]] = [:]
    /// The place suggestions are being waited for; nil when none are.
    var suggesting: ExamplePlace?
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
    var calendarOffer = false
    /// The paper is raised over the mountain (F7): the whole level as a plain list by area. Belongs to
    /// the step it was opened on (`settle` closes it); never saved.
    var paperOpen = false
    /// Look back up (F21): the level whose paper a cloth opened; nil while the paper is shut, and on
    /// steps 1 to 5, where the paper reads the step's own level. Never saved.
    var paperLevel: WalkLevel?
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
        // While the paper is up nothing under it takes a touch (the light, Next, the top row, the flags).
        if paperOpen, event.isUnderThePaper { return [] }
        // Any touch puts the lesson away (a press on the light does it in `orbDown`, a tap on the veil below).
        if teaching, !event.leavesAWaitingFlag, event != .orbDown, event != .moreTapped { teaching = false }
        let place = placeForExamples
        let planted = event.leavesAWaitingFlag ? [] : plantWaitingFlag(env)
        let effects = planted + respond(to: event, env)
        settleStanding()
        askAfresh(since: place)
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
        case .suggested(let place, let lines): return suggested(place, lines, today: env.periods.today)
        case .suggestExpired: return suggesting.map { suggested($0, nil, today: env.periods.today) } ?? []
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
        // The ending's handle goes to Today, as the raised sheet's button does (only with a plan to look back at).
        case .sheetHandle: return step == 6 && !items.isEmpty ? end(.finished) : []
        case .goToToday: return step == 6 ? end(.finished) : []
        // Next at the foot: exactly what its own action does.
        case .nextTapped:
            guard let line = WalkCopy.nextLine(self, env.periods) else { return [] }
            return respond(to: line.action, env)
        // The top row: Back and Leave for now do what backing up and leaving do, only while the row
        // shows (never while typing, F10, nor on Welcome or Look back up).
        case .backTapped: return showsTopRow ? respond(to: WalkAction.back, env) : []
        case .leaveTapped: return showsTopRow ? respond(to: WalkAction.leave, env) : []
        // "More" opens the choices when they are closed (as a tap on the light opens them, with speech
        // off too, where a tap types) and closes them when they are open. While the light is taught,
        // More (which the lesson points to) puts the lesson away and opens them. Not while the light is held.
        case .moreTapped:
            guard showsMore, orb == .idle || orb == .open else { return [] }
            teaching = false
            orb = orb == .open ? .idle : .open
            return []
        // The paper (F7, F12): "+n more" and the nameless post raise it on steps 1 to 5 off the ground;
        // "Show the mountain" lowers it; a row walks to its flag (`paperRow`).
        case .paperOpened:
            guard (1...5).contains(step), !ground, typing == nil, orb == .idle else { return [] }
            paperOpen = true
            return []
        case .paperClosed:
            paperOpen = false
            paperLevel = nil
            return []
        case .paperRow(let id): return walkToRow(id)
        // Look back up (F21): a cloth raises the paper for its level, while the sheet is down.
        case .lookBackPaper(let level):
            guard step == 6, !ground, !sheetRaised else { return [] }
            paperOpen = true
            paperLevel = level
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
        // The paper is lowered first: an action never leaves it up over another step or another stop of a tour.
        paperOpen = false
        paperLevel = nil
        teaching = false                    // a compass point chosen through VoiceOver puts the lesson away
        let place = placeForExamples
        let planted = plantWaitingFlag(env)
        let effects = planted + respond(to: action, env)
        settleStanding()
        askAfresh(since: place)
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
        // Only while the area stood in has one left unused for the step (F27, P23). A place opened
        // mid-walk (the demo's preview) may not have settled yet, so it settles first, as after any touch.
        case .examples:
            settleStanding()
            return toggleExamples(env)
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
        resumeTour()
        guard level == .today else { return [] }
        calendarOffer = env.canAskCalendar
        return []
    }

    /// Leaving the ground: the walk stands in the first kept area, and the Year tour starts there, the
    /// rest waiting in `tour`: Next visits every area the person kept, on a quick start too (the
    /// owner's observation of 2026-11-17: kept areas were never offered their turn).
    private mutating func startTour() {
        focusArea = kept.first
        tour = Array(kept.dropFirst())
    }

    /// Season, Month and Week: the first time, the tour starts at the first stop; after that it
    /// picks up at the remembered focus. A focus that is gone (its goal was pulled up or deleted)
    /// starts it again; one that is a place of the person's own choosing and not a stop (a goal
    /// from before this walk, the area's flags under no goal) stays, with the stops left as they
    /// were. Nothing on a step with no tour (Today, a walk down) or no stop.
    mutating func resumeTour() {
        guard let level, toursGoalsAbove else { return }
        let stops = tourStops
        guard !stops.isEmpty else { return }
        if let current = focus[level] {
            if let index = stops.firstIndex(of: current) {
                tour = Array(stops[(index + 1)...])
                return
            }
            if current == Self.noGoalAbove || item(current)?.level.rawValue == level.rawValue - 1 { return }
        }
        focus[level] = stops.first
        tour = Array(stops.dropFirst())
    }

    /// Season, Month and Week go goal by goal through the goals above before Next moves down (the
    /// owner, 2026-11-17: with two areas, the other one's goal was never given its winter). Not
    /// Today, which asks for one first thing; not a walk down, which follows one line.
    var toursGoalsAbove: Bool { !ground && (2...4).contains(step) && walkingDown.isEmpty }

    /// A tour's full order: kept areas in kept order on Year; on Season, Month and Week the goals
    /// one level up in column order (`toursGoalsAbove`): every one in a whole-year walk, in a
    /// quick start the ones this walk planted (a quick start over a plan already made takes what
    /// is added now down to today; it does not go through the rest). Derived, so only the stops
    /// still ahead are stored.
    private var tourStops: [UUID] {
        guard !ground else { return [] }
        if step == 1 { return kept }
        guard toursGoalsAbove else { return [] }
        return goalsAboveInColumnOrder().filter { depth == .full || $0.mine }.map(\.id)
    }

    /// A tap that moves the focus during a tour moves the tour with it: the stops
    /// left are the ones after the new focus. No focus (nil) leaves the stops as they were.
    private mutating func follow(_ newFocus: UUID?) {
        guard !tour.isEmpty, let newFocus else { return }
        let stops = tourStops
        guard let index = stops.firstIndex(of: newFocus) else { return }
        tour = Array(stops[(index + 1)...])
    }

    /// The goals one level above the step's. Columns follow `areas`; the unlabeled post is last;
    /// planting order inside a column.
    private func goalsAboveInColumnOrder() -> [WalkItem] {
        let column = { (item: WalkItem) -> Int in
            self.column(of: item).flatMap { id in areas.firstIndex { $0.id == id } } ?? Int.max
        }
        return parentsAnywhere().enumerated()
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
        teaching = false
        paperOpen = false
        paperLevel = nil
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

    /// Steps 2 to 5: where a tap on the goal the step is about goes: the next stop of the area's round
    /// (`goalAboveRound`), round again; none with only one.
    func nextGoalAbove() -> UUID? {
        guard let level, level != .year, let current = focus[level] else { return nil }
        let round = goalAboveRound()
        guard round.count > 1, let index = round.firstIndex(of: current) else { return nil }
        return round[(index + 1) % round.count]
    }

    /// Steps 2 to 5: the goals above a tap on the goal above goes round, in a fixed order. On Season,
    /// Month and Week (F40) the area's stops (`goalAboveStops`). On Today every week task here in planting
    /// order; a first thing on the nameless post is in every area's round there: the nameless post has
    /// no label to walk to, so this is the way back to it.
    func goalAboveRound() -> [UUID] {
        guard let level, level != .year else { return [] }
        if hangsByGoalAbove { return goalAboveStops() }
        let here = standing
        return parentsAnywhere().filter {
            column(of: $0) == here || (level == .today && $0.id == firstThing && column(of: $0) == nil)
        }.map(\.id)
    }

    // MARK: The goal above shows only its own (F40)

    /// The stop of an area's round that holds its flags hanging under none of the area's goals above.
    static let noGoalAbove = UUID(uuidString: "00000000-0000-0000-0000-0000000F40A0")!

    /// Season, Month and Week (steps 2 to 4): the standing post shows only the flags of the goal above shown.
    /// (Year has no goal above; on Today the post's one flag is the first thing.)
    var hangsByGoalAbove: Bool { level == .season || level == .month || level == .week }

    /// The area stood in's goals above (`parentsHere`, in planting order), then, where the area also holds
    /// flags on this level hanging under none of its goals above, the stop for those (`noGoalAbove`). Empty
    /// where the area has no goal above at all: then the post shows all its flags, as before.
    func goalAboveStops() -> [UUID] {
        guard hangsByGoalAbove else { return [] }
        let goals = parentsHere()
        guard !goals.isEmpty else { return [] }
        return goals.map(\.id) + (unhungHere().isEmpty ? [] : [Self.noGoalAbove])
    }

    /// Season, Month and Week: the goal above shown is one of the area's stops and nothing hangs under it
    /// yet (P48: an empty goal above stays in the round, so a first goal can be added under it).
    var standsOnAnEmptyStop: Bool {
        guard hangsByGoalAbove, let level, let stop = focus[level], goalAboveStops().contains(stop) else { return false }
        return standingFlags().isEmpty
    }

    /// The step's flags in the area stood in whose parent is none of this area's goals one level up (no
    /// parent, or one elsewhere), in planting order.
    func unhungHere() -> [WalkItem] {
        guard let level, let above = WalkLevel(rawValue: level.rawValue - 1) else { return [] }
        let here = standing
        let goals = Set(items(on: above).filter { column(of: $0) == here }.map(\.id))
        return items(on: level).filter { column(of: $0) == here && !($0.parentId.map(goals.contains) ?? false) }
    }

    /// The step's flags the standing post shows, in planting order: on Season, Month and Week, where the
    /// area has goals above, only those of the stop shown (the goal above's own children, or on the
    /// `noGoalAbove` stop those hanging under none); otherwise every flag of the area on the level.
    /// Today's is the first thing.
    func standingFlags() -> [WalkItem] {
        guard let level else { return [] }
        let here = standing
        if level == .today { return [item(firstThing)].compactMap { $0 }.filter { column(of: $0) == here } }
        let all = items(on: level).filter { column(of: $0) == here }
        guard hangsByGoalAbove, let stop = focus[level], goalAboveStops().contains(stop) else { return all }
        return stop == Self.noGoalAbove ? unhungHere() : all.filter { $0.parentId == stop }
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

    /// The walk as it stands after any touch (`settleStanding`). The layout draws this, so a place
    /// opened mid-walk (a resume, a preview, a page) is laid out where the next touch would find it.
    var settled: WalkState {
        var s = self
        s.settleStanding()
        return s
    }

    /// After every event and action the walk stands somewhere, never on a post with no way on.
    /// Year: in a kept area. Steps 2 to 5: in the focused goal's area; with no focused goal,
    /// on the area's remembered or newest goal above; an area with nothing above but a flag
    /// on this step stays as it is; otherwise the newest goal above anywhere, and the walk
    /// goes to its area; with none at all, no goal and a kept area. Look back up: the area
    /// stood in while it holds a flag, else the first kept area holding one (F6); with none, the
    /// flags with no area (F12), else a kept area.
    private mutating func settleStanding() {
        guard !ground else { return }
        let stands = focusArea.map(kept.contains) ?? false
        switch step {
        case 1:
            if !stands, let first = kept.first { focusArea = first }
        case 2...5:
            guard let level else { return }
            if focus[level] == Self.noGoalAbove {
                if stands, goalAboveStops().contains(Self.noGoalAbove) { return }
                focus[level] = nil
            }
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
            // Where the walk last stood while that area holds a flag; else the first kept area with one;
            // with none holding any, the flags with no area, on the post with no name (F12); else a kept area.
            let held = Set(items.compactMap { column(of: $0) })
            let holds = { (id: UUID) in held.contains(id) }
            if stands, let here = focusArea, holds(here) { return }
            if let first = kept.first(where: holds) {
                focusArea = first
            } else if items.contains(where: { column(of: $0) == nil }) {
                focusArea = nil
            } else if !stands {
                focusArea = kept.first
            }
        default:
            return
        }
    }

    // MARK: Examples, a fresh ask (P24)

    /// While examples are on, the step and the area the walk stands in once settled; nil while they are off.
    private var placeForExamples: (step: Int, standing: UUID?)? {
        guard !examplesOn.isEmpty else { return nil }
        var settled = self
        settled.settleStanding()
        return (settled.step, settled.standing)
    }

    /// Examples are asked for in one area on one step: when the walk stands somewhere else (a tap on
    /// another area, a whole-year walk going on, anything that moves `standing`) or the step changes,
    /// they turn off, so the next area's never appear unasked.
    private mutating func askAfresh(since place: (step: Int, standing: UUID?)?) {
        guard let place, place.step != step || place.standing != standing else { return }
        examplesOn = []
        suggesting = nil                    // an answer still on its way is for a place the walk has left
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

    /// A row on the paper: the paper closes, and the walk stands where that flag stands. On steps 2 to 5
    /// the goal above is its own (the goal it hangs under, where that stands with it); on Today the
    /// task itself is the one the step is about. A flag this walk may choose is chosen, so the Move row
    /// shows. A flag with no kept area leaves the walk standing where it was (it is chosen if it may be).
    ///
    /// Only while the paper is up, never on the ground. On Season, Month and Week (F40) the goal above becomes
    /// the row's own (or the stop of the flags under none), in the area already stood in too, so the chosen
    /// flag is in sight. On a walk down the goal above changes only to one on the walked line (on Today, only
    /// to a task on it), so what is said next still hangs on that line; a row off it is named by the note.
    private mutating func walkToRow(_ id: UUID) -> [WalkEffect] {
        guard paperOpen, !ground else { return [] }
        let does = paperRowTap(id)
        paperOpen = false
        paperLevel = nil
        // Look back up: the walk stands in that flag's area and chooses nothing.
        if step == 6 {
            guard let row = item(id), let column = column(of: row) else { return [] }
            focusArea = column
            return [.save]
        }
        guard let row = item(id), let level else { return [] }
        var effects: [WalkEffect] = []
        if hangsByGoalAbove, let column = column(of: row), let shown = standing(toShow: row, in: column) {
            if shown.focusArea != focusArea || shown.focus[level] != focus[level] {
                focusArea = shown.focusArea
                focus[level] = shown.focus[level]
                follow(focus[level])
                effects.append(.save)
            }
        } else if does.walks, let column = column(of: row) {
            if level == .today, onWalkedLine(row) {
                focusArea = column
                focus[.today] = row.id
            } else if level != .year, level != .today, let parent = item(row.parentId),
                      parent.level.rawValue == level.rawValue - 1, self.column(of: parent) == column, onWalkedLine(parent) {
                focusArea = column
                focus[level] = parent.id
                follow(parent.id)
            } else {
                stand(in: column)
            }
            effects.append(.save)
        }
        if does.chooses, selected != id {
            selected = id
            undoShowing = false
            effects.append(.sound(.tick, afterMs: 0))
        }
        return effects
    }

    /// F40: the walk standing in `column` on the stop that draws `row` (its own goal above, or the stop of the
    /// flags under none); nil where none does on the walked line (a walk down's row off it).
    private func standing(toShow row: WalkItem, in column: UUID) -> WalkState? {
        guard let level, let above = WalkLevel(rawValue: level.rawValue - 1) else { return nil }
        let parent = item(row.parentId).flatMap { $0.level == above && self.column(of: $0) == column ? $0 : nil }
        if let parent, !onWalkedLine(parent) { return nil }
        var trial = self
        trial.focusArea = column
        trial.focus[level] = parent?.id ?? Self.noGoalAbove
        trial.settleStanding()
        guard trial.standing == column, trial.standingFlags().contains(where: { $0.id == row.id }) else { return nil }
        return trial
    }

    /// What a row's tap does here (`walkToRow`, and each row's words to VoiceOver): whether the walk goes
    /// to stand in another area (on Look back up, in that flag's area), and whether the flag is chosen. On
    /// steps 1 to 5 it walks exactly where a tap on that area's label would (`walksThere`): never to the
    /// area already stood in, nor to one the walk cannot stand in (on Today, on a walk down, an area with
    /// nothing on the walked line). `switches`: in the area already stood in, on Season, Month and Week, the
    /// goal above changes to the one the row hangs under (F40 rule 7), so the row comes into sight.
    func paperRowTap(_ id: UUID) -> (walks: Bool, chooses: Bool, switches: Bool) {
        guard let row = item(id) else { return (false, false, false) }
        let column = column(of: row)
        if step == 6 { return (column != nil, false, false) }
        let walks = column.map(walksThere) ?? false
        var switches = false
        if !walks, hangsByGoalAbove, let level, let column, column == standing,
           let shown = standing(toShow: row, in: column) {
            switches = shown.focus[level] != focus[level]
        }
        return (walks, selects(id) && row.mine, switches)
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
    /// The server's suggestions for a place arrived (nil: none came); the wait for them ran out.
    case suggested(WalkState.ExamplePlace, [String]?), suggestExpired
    /// The paper (F7): raised ("+n more", the nameless post), lowered ("Show the mountain", Escape), a row tapped.
    case paperOpened, paperClosed, paperRow(UUID)
    /// Look back up (F21): a cloth raises the paper for its level (a touch on what the paper covers).
    case lookBackPaper(WalkLevel)
}

enum WalkTimer: Equatable { case hold, undo, note, finish, suggest }

enum WalkWrite: Equatable {
    case area(WalkArea), dropArea(UUID), create(WalkItem, parent: WalkItem?), remove(UUID, WalkLevel), restore(UUID)
    case setArea(UUID, WalkLevel, UUID?), firstThing(UUID?, previous: UUID?), toggleDone(UUID)
}

enum WalkEffect: Equatable {
    /// `listen(false)` cancels; `finishListening` stops the microphone and waits for the last words.
    case sound(WalkSoundName, afterMs: Int), listen(Bool), finishListening, write(WalkWrite)
    case timer(WalkTimer, ms: Int?)        // nil cancels
    case askCalendar, save, end(WalkStatus)
    /// Ask the server for suggestions; the answer comes back as `.suggested`.
    case suggest(WalkSuggestRequest)
}

enum WalkUndoEntry: Equatable {
    case plant(UUID), nameArea(WalkArea), keep(UUID), unkeep(UUID, index: Int)
    /// `walkedAt`: where the pulled-up flag stood in `walkingDown`, if it started a walk down's line.
    case move(UUID, from: UUID?, keptAdded: UUID?), pullUp(WalkItem, index: Int, wasFirstThing: Bool, walkedAt: Int?)
    case firstThing(previous: UUID?, created: UUID?)
}
