import Foundation

/// Where the walk stands, saved per signed-in person so it can be resumed after a
/// relaunch: the step and depth, the areas and focus, what the walk itself planted
/// (it decides which flags may later be moved or pulled up), and the periods it was
/// asked in. The undo stack is deliberately not saved.
struct WalkPosition: Codable, Equatable {
    var version = 1
    var status: WalkStatus; var depth: WalkDepth; var step: Int; var ground: Bool
    var areas: [WalkArea]; var kept: [UUID]; var focusArea: UUID?
    var focus: [String: UUID]                              // key = String(WalkLevel.rawValue)
    var tour: [UUID]; var planted: [UUID]; var firstThing: UUID?
    var lastPlanted: [String: UUID] = [:]                  // key = String(WalkLevel.rawValue); the parent the next step's first flag links to
    /// A walk down's own lines (`WalkState.walkingDown`). A save from before it was kept reads as a first walk.
    var walkingDown: [UUID] = []
    /// The light has been taught in this walk. A save from before it was kept reads as taught.
    var taught = true
    var year: Int; var seasonStart: String; var monthStart: String; var weekStart: String; var day: String   // YYYY-MM-DD
    var savedAt: Date

    init(_ state: WalkState, status: WalkStatus, planted: Set<UUID>, periods: WalkPeriods, now: Date) {
        self.status = status
        depth = state.depth; step = state.step; ground = state.ground
        areas = state.areas; kept = state.kept; focusArea = state.focusArea
        focus = Dictionary(state.focus.map { (String($0.key.rawValue), $0.value) }, uniquingKeysWith: { $1 })
        tour = state.tour
        self.planted = planted.sorted { $0.uuidString < $1.uuidString }
        firstThing = state.firstThing
        lastPlanted = Dictionary(state.lastPlanted.map { (String($0.key.rawValue), $0.value) }, uniquingKeysWith: { $1 })
        walkingDown = state.walkingDown
        taught = state.taught
        year = periods.year
        seasonStart = Self.dayString(periods.season.start)
        monthStart = Self.dayString(periods.monthStart)
        weekStart = Self.dayString(periods.weekStart)
        day = Self.dayString(periods.today)
        savedAt = now
    }

    private enum CodingKeys: String, CodingKey {
        case version, status, depth, step, ground, areas, kept, focusArea, focus, tour, planted, firstThing, lastPlanted, taught
        case walkingDown
        case year, seasonStart, monthStart, weekStart, day, savedAt
    }

    /// Every key but `lastPlanted`, `taught` and `walkingDown` is required: a save missing one loads as nothing saved.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decode(Int.self, forKey: .version)
        status = try c.decode(WalkStatus.self, forKey: .status)
        depth = try c.decode(WalkDepth.self, forKey: .depth)
        step = try c.decode(Int.self, forKey: .step)
        ground = try c.decode(Bool.self, forKey: .ground)
        areas = try c.decode([WalkArea].self, forKey: .areas)
        kept = try c.decode([UUID].self, forKey: .kept)
        focusArea = try c.decodeIfPresent(UUID.self, forKey: .focusArea)
        focus = try c.decode([String: UUID].self, forKey: .focus)
        tour = try c.decode([UUID].self, forKey: .tour)
        planted = try c.decode([UUID].self, forKey: .planted)
        firstThing = try c.decodeIfPresent(UUID.self, forKey: .firstThing)
        lastPlanted = try c.decodeIfPresent([String: UUID].self, forKey: .lastPlanted) ?? [:]
        taught = try c.decodeIfPresent(Bool.self, forKey: .taught) ?? true
        walkingDown = try c.decodeIfPresent([UUID].self, forKey: .walkingDown) ?? []
        year = try c.decode(Int.self, forKey: .year)
        seasonStart = try c.decode(String.self, forKey: .seasonStart)
        monthStart = try c.decode(String.self, forKey: .monthStart)
        weekStart = try c.decode(String.self, forKey: .weekStart)
        day = try c.decode(String.self, forKey: .day)
        savedAt = try c.decode(Date.self, forKey: .savedAt)
    }

    /// Reopens for today's periods. A period that has moved on is asked again (the
    /// step steps back to it); anything naming a row that no longer exists is dropped.
    /// Kept areas and the planted set stay as they were.
    func restored(for periods: WalkPeriods, existing: Set<UUID>) -> WalkPosition {
        var out = self
        var newStep = min(max(step, 0), 6)
        if year != periods.year { newStep = min(newStep, 1) }
        if seasonStart != Self.dayString(periods.season.start) { newStep = min(newStep, 2) }
        if monthStart != Self.dayString(periods.monthStart) { newStep = min(newStep, 3) }
        if weekStart != Self.dayString(periods.weekStart) { newStep = min(newStep, 4) }
        if day != Self.dayString(periods.today) {
            newStep = min(newStep, 5)
            out.firstThing = nil
        }
        out.year = periods.year
        out.seasonStart = Self.dayString(periods.season.start)
        out.monthStart = Self.dayString(periods.monthStart)
        out.weekStart = Self.dayString(periods.weekStart)
        out.day = Self.dayString(periods.today)

        let stepChanged = newStep != step
        out.step = newStep
        out.focus = focus.filter { key, id in
            guard let level = Int(key), level <= newStep else { return false }
            return existing.contains(id)
        }
        // The Year tour's stops are kept areas (which have no row until used); later tours name goals.
        out.lastPlanted = lastPlanted.filter { key, id in
            guard let level = Int(key), level <= newStep else { return false }
            return existing.contains(id)
        }
        // Landing on Season, Month or Week, `apply` rebuilds the tour; landing on Year ends it.
        out.tour = stepChanged ? [] : tour.filter { newStep == 1 ? kept.contains($0) : existing.contains($0) }
        if let thing = out.firstThing, !existing.contains(thing) { out.firstThing = nil }
        out.walkingDown = walkingDown.filter(existing.contains)
        return out
    }

    /// Puts the saved place into a state, whose items must already be loaded: on Season,
    /// Month and Week the tour is rebuilt as entering the step would. Undo is left
    /// empty by design.
    func apply(to state: inout WalkState) {
        state.depth = depth; state.step = min(max(step, 0), 6); state.ground = ground
        state.areas = areas; state.kept = kept; state.focusArea = focusArea
        state.focus = Dictionary(focus.compactMap { key, id in
            Int(key).flatMap(WalkLevel.init(rawValue:)).map { ($0, id) }
        }, uniquingKeysWith: { $1 })
        state.lastPlanted = Dictionary(lastPlanted.compactMap { key, id in
            Int(key).flatMap(WalkLevel.init(rawValue:)).map { ($0, id) }
        }, uniquingKeysWith: { $1 })
        state.tour = tour
        state.walkingDown = walkingDown
        state.firstThing = firstThing
        state.taught = taught
        state.undo = []
        state.undoShowing = false
        state.resumeTour()
    }

    private static func dayString(_ date: Date) -> String {
        let c = PlanCalendar.calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

extension JSONEncoder {
    static var walk: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }
}

extension JSONDecoder {
    static var walk: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }
}

/// One saved position per signed-in person, in `UserDefaults`.
struct WalkPositionStore {
    var defaults: UserDefaults = .standard

    static func key(_ userId: UUID) -> String { "walk.position.\(userId.uuidString.lowercased())" }

    /// Nil when nothing is saved, the data does not decode, or it is another version.
    func load(for userId: UUID?) -> WalkPosition? {
        guard let userId, let data = defaults.data(forKey: Self.key(userId)),
              let position = try? JSONDecoder.walk.decode(WalkPosition.self, from: data),
              position.version == 1 else { return nil }
        return position
    }

    func save(_ position: WalkPosition, for userId: UUID?) {
        guard let userId, let data = try? JSONEncoder.walk.encode(position) else { return }
        defaults.set(data, forKey: Self.key(userId))
    }

    /// This person left a walk with Leave for now and it is waiting to be picked up
    /// (`WalkEntry.decide(resume: true, …)` opens it at the step it was on).
    func hasPausedWalk(for userId: UUID?) -> Bool {
        load(for: userId)?.status == .paused
    }

    /// This person has a walk waiting to be picked up in this household (`WalkEntry.isWaiting`):
    /// one left with Leave for now, or, in a household that is not light only, one left in progress.
    func hasWaitingWalk(for userId: UUID?, householdEditions: [String?]) -> Bool {
        WalkEntry.isWaiting(load(for: userId), householdEditions: householdEditions)
    }

    func forget(for userId: UUID?) {
        guard let userId else { return }
        defaults.removeObject(forKey: Self.key(userId))
    }
}

/// Whether the walk starts by itself, resumes, or stays out of the way.
enum WalkEntry: Equatable {
    case none, start, resume

    /// Every household row on the phone is light (none at all, or an unknown edition, is not).
    static func lightOnly(_ householdEditions: [String?]) -> Bool {
        !householdEditions.isEmpty && householdEditions.allSatisfy { $0 == "light" }
    }

    /// The position is local, so a person who left the walk on one phone with no goals is offered it again on another.
    /// A walk left part-way resumes only in a light household; in a full one (or a mixed or
    /// unknown one) it is simply left, and "Walk the mountain again" starts it from the top.
    /// A walk left with Leave for now (`paused`) never reopens by itself, in any household:
    /// only `resume` (Pick the walk back up, in Settings or on Today) opens it, at the step it was on.
    static func decide(replay: Bool, resume: Bool = false, demoWalk: Bool, position: WalkPosition?,
                       householdEditions: [String?], initialSyncFinished: Bool, goalCount: Int) -> WalkEntry {
        if replay || demoWalk { return .start }
        if resume { return isWaiting(position, householdEditions: householdEditions) ? .resume : .none }
        let onlyLight = lightOnly(householdEditions)
        if let position { return position.status == .inProgress && onlyLight ? .resume : .none }
        return onlyLight && initialSyncFinished && goalCount == 0 ? .start : .none
    }

    /// Whether `decide` is asked at all: never while a walk is up or with nobody signed in.
    /// Before the first pull has finished, a saved walk in progress in a light household
    /// opens at once (it and every row it planted are on this phone), and so does a resume of
    /// a paused walk and a replay over a household already on this phone; a replay on a
    /// brand-new sign-in waits (still asked for), and the automatic first start waits as
    /// `decide` says. A paused walk alone never makes it ask early.
    static func mayDecide(walkUp: Bool, signedIn: Bool, initialSyncFinished: Bool, position: WalkPosition?,
                          replay: Bool, resume: Bool = false, householdEditions: [String?]) -> Bool {
        guard !walkUp, signedIn else { return false }
        if initialSyncFinished || (position?.status == .inProgress && lightOnly(householdEditions)) { return true }
        if resume && isWaiting(position, householdEditions: householdEditions) { return true }
        return replay && !householdEditions.isEmpty
    }

    /// A replay or a resume asked for while a walk is up is dropped, not kept for after it.
    static func dropsRequests(walkUp: Bool) -> Bool { walkUp }

    /// A walk waiting to be picked up (Settings' "Pick the walk back up"; `decide(resume: true)`):
    /// one left with Leave for now (`paused`), in any household; and in a household that is not
    /// light only, one left in progress too (a replay or a picked-up walk the day turned on, or the
    /// app was closed under). That one never reopens by itself there (W42), so this row is its way
    /// back; in a light household a walk in progress resumes by itself and is not "waiting".
    static func isWaiting(_ position: WalkPosition?, householdEditions: [String?]) -> Bool {
        switch position?.status {
        case .paused: return true
        case .inProgress: return !lightOnly(householdEditions)
        default: return false
        }
    }

    /// A walk that starts from the top (a replay) over one waiting to be picked up clears it:
    /// the saved place is forgotten, so nothing is left waiting.
    static func clearsPause(_ entry: WalkEntry, position: WalkPosition?, householdEditions: [String?]) -> Bool {
        entry == .start && isWaiting(position, householdEditions: householdEditions)
    }

    /// A walk still up on a later day than the one it opened on is taken down and decided
    /// again, so it resumes from its saved place with that day's periods.
    static func dayHasTurned(walkDay: Date, now: Date, calendar: Calendar = PlanCalendar.calendar) -> Bool {
        !calendar.isDate(walkDay, inSameDayAs: now)
    }
}
