import Foundation
import SwiftData

/// A Month, Season or Year page in a light household: the walk's own mountain for that
/// level, with the person's flags, and no question and no light. It is drawn by
/// `WalkLayout.make(walkState, …, footing: .natural)` at the walk's own step for the
/// level (1 Year, 2 Season, 3 Month): the walk's camera for that level, peak labels under
/// their posts, and only the level shown and those above it. (Look back up, step 6, is
/// every level at once with the labels heading their columns; only `lookBack` uses it.)
///
/// Pure: what should be written comes back as `Effect`s for the page's model to carry out.
/// Every flag here is the person's own (the view reads only their own personal rows), and
/// every one may be chosen, moved or pulled up, not only those a walk planted.
struct MountainPage: Equatable {
    let level: WalkLevel                               // .year, .season or .month
    var items: [WalkItem]; var areas: [WalkArea]; var kept: [UUID]
    /// The person's flags one level below the page's (season goals on Year, month goals on
    /// Season, week tasks on Month): not drawn, read only to say when nothing hangs under one.
    var below: [WalkItem] = []
    var selected: UUID?; var focus: UUID?              // focus: a flag one level up (Season, Month)
    var focusArea: UUID?                               // a zoomed peak (Year)
    var expanded: WalkPostKey?; var moving = false
    /// Set by the view: the page's own periods (`periods(level:selected:today:seasons:)`), used by `panel` and `hanging`.
    var periods: WalkPeriods?
    /// Set by the view: the flags of the walk's own periods (`WalkPeriods.pick`), the only ones "Walk it down" opens.
    var walkItems: [WalkItem] = []

    init(level: WalkLevel, items: [WalkItem], areas: [WalkArea], saved: [UUID]) {
        self.level = level
        self.items = []
        self.areas = []
        self.kept = []
        read(items: items, areas: areas, saved: saved)
    }

    /// Takes in what the rows say now (at first, and each time they change): every item
    /// the person's own, nothing below the page's level drawn, the kept areas worked out
    /// again. A choice, a focus or a zoom whose flag or peak has gone is let go.
    mutating func read(items: [WalkItem], areas: [WalkArea], saved: [UUID]) {
        let own = items.map { item -> WalkItem in
            var item = item
            item.mine = true
            return item
        }
        self.items = own.filter { $0.level.rawValue <= level.rawValue }
        below = own.filter { $0.level.rawValue == level.rawValue + 1 }
        self.areas = areas
        kept = Self.kept(items: self.items, areas: areas, saved: saved)
        if let id = selected, item(id) == nil { selected = nil; moving = false }
        if let id = focus, item(id) == nil { focus = nil }
        if let id = focusArea, !kept.contains(id) { focusArea = nil }
    }

    // MARK: Periods and areas

    /// The page's own level is the period holding `selected`; the levels above are the walk's (`WalkPeriods.pick(now: today)`).
    /// The week and the day are always the walk's. "Current" for the page's own level means it holds today.
    static func periods(level: WalkLevel, selected: Date, today: Date, seasons: [SeasonBoundary]?) -> WalkPeriods {
        let walk = WalkPeriods.pick(now: today, seasons: seasons)
        switch level {
        case .year:
            return WalkPeriods(today: walk.today, year: PlanCalendar.year(of: selected), season: walk.season,
                               seasonIsCurrent: walk.seasonIsCurrent, monthStart: walk.monthStart,
                               monthIsCurrent: walk.monthIsCurrent, weekStart: walk.weekStart)
        case .season:
            let season = PlanCalendar.season(containing: selected, boundaries: seasons)
            let now = PlanCalendar.season(containing: today, boundaries: seasons)
            return WalkPeriods(today: walk.today, year: walk.year, season: season,
                               seasonIsCurrent: PlanCalendar.sameDay(season.start, now.start),
                               monthStart: walk.monthStart, monthIsCurrent: walk.monthIsCurrent, weekStart: walk.weekStart)
        case .month:
            let month = PlanCalendar.monthStart(selected)
            return WalkPeriods(today: walk.today, year: walk.year, season: walk.season,
                               seasonIsCurrent: walk.seasonIsCurrent, monthStart: month,
                               monthIsCurrent: PlanCalendar.sameDay(month, PlanCalendar.monthStart(today)),
                               weekStart: walk.weekStart)
        case .week, .today:
            return walk
        }
    }

    /// The saved walk's kept areas, and every area with a flag on it, in `areas` order.
    static func kept(items: [WalkItem], areas: [WalkArea], saved: [UUID]) -> [UUID] {
        let used = Set(items.compactMap(\.areaId))
        return areas.map(\.id).filter { saved.contains($0) || used.contains($0) }
    }

    /// The ridge as the walk reads it (`WalkLoad.areas`), with ids that hold from one read to
    /// the next: an area with no row of its own takes the id the saved walk gave it, matched by
    /// name, as the walk does when it resumes (`WalkPosition.apply`), and a peak the walk named
    /// that has no row yet stays on the ridge while there is room. Read once per appearance:
    /// an area neither a row nor the saved walk knows is given a new id on every read.
    static func areas(_ rows: [GoalArea], me: UUID, saved: [WalkArea]) -> [WalkArea] {
        func key(_ name: String) -> String { name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        let rowIds = Set(rows.map(\.id))
        var out = WalkLoad.areas(rows, me: me).map { area -> WalkArea in
            guard !rowIds.contains(area.id), let named = saved.first(where: { key($0.name) == key(area.name) })
            else { return area }
            return WalkArea(id: named.id, name: area.name)
        }
        for area in saved where out.count < WalkLoad.maxAreas {
            guard !key(area.name).isEmpty, !out.contains(where: { key($0.name) == key(area.name) || $0.id == area.id })
            else { continue }
            out.append(area)
        }
        return out
    }

    // MARK: What is drawn

    /// The walk's state for this page: the level's own step, off the ground, with this page's
    /// focus, zoom, open post and choice. No examples, no typing, no lesson: the view draws the
    /// world alone (`WalkWorldView`), never the question, the light or the controls under it.
    var walkState: WalkState {
        var s = WalkState()
        s.step = level.rawValue
        s.ground = false
        s.depth = .quick
        s.areas = areas
        s.kept = kept
        s.items = items
        s.focusArea = level == .year ? focusArea : nil
        if level != .year, let focus { s.focus = [level: focus] }
        s.selected = selected
        s.expanded = expanded
        s.taught = true
        return s
    }

    /// Look back up (step 6): every level at once, each area with a flag a column.
    static func lookBack(items: [WalkItem], areas: [WalkArea], kept: [UUID]) -> WalkState {
        var s = WalkState()
        s.step = 6
        s.ground = false
        s.depth = .quick
        s.areas = areas
        s.kept = Self.kept(items: items, areas: areas, saved: kept)
        s.items = items
        s.taught = true
        return s
    }

    // MARK: Taps

    enum Event: Equatable { case flag(UUID), peak(UUID), post(WalkPostKey), moveTapped, moveTo(UUID), pullUp, walkDown, letGo }
    enum Effect: Equatable { case setArea(UUID, WalkLevel, to: UUID?, from: UUID?), pullUp(UUID, WalkLevel), walkDown(UUID), open(Horizon) }

    /// What a tap the walk's layout reads (`WalkLayout.tapEvent`, or a peak's label) means here.
    static func event(for tap: WalkEvent) -> Event? {
        switch tap {
        case .bannerTapped(let id): return .flag(id)
        case .stubTapped(let key): return .post(key)
        case .areaTapped(let id): return .peak(id)
        default: return nil
        }
    }

    /// A flag of this page's level is chosen, and let go on a second tap; one a level up
    /// (Season, Month) is focused, or let go; a peak on Year is zoomed, or back out. Move to,
    /// Pull it up and Walk it down act on the chosen flag. Anything else is ignored.
    mutating func apply(_ event: Event) -> [Effect] {
        switch event {
        case .flag(let id):
            guard let item = item(id) else { return [] }
            if item.level == level {
                selected = selected == id ? nil : id
                moving = false
            } else if item.level.rawValue == level.rawValue - 1 {
                focus = focus == id ? nil : id
            }
            return []
        case .peak(let id):
            guard level == .year, kept.contains(id) else { return [] }
            focusArea = focusArea == id ? nil : id
            return []
        case .post(let key):
            guard key.level.rawValue <= level.rawValue else { return [] }
            expanded = expanded == key ? nil : key
            return []
        case .moveTapped:
            guard chosen != nil else { return [] }
            moving = true
            return []
        case .moveTo(let areaId):
            guard let item = chosen, let index = items.firstIndex(where: { $0.id == item.id }),
                  moveTargets(for: item.id).contains(where: { $0.id == areaId }) else { return [] }
            items[index].areaId = areaId
            kept = Self.kept(items: items, areas: areas, saved: kept)
            selected = nil
            moving = false
            return [.setArea(item.id, item.level, to: areaId, from: item.areaId)]
        case .pullUp:
            guard let item = chosen else { return [] }
            items.removeAll { $0.id == item.id }
            selected = nil
            moving = false
            return [.pullUp(item.id, item.level)]
        case .walkDown:
            guard let item = chosen, Self.canWalkDown(item, in: walkItems) else { return [] }
            return [.walkDown(item.id)]
        case .letGo:
            selected = nil
            moving = false
            return []
        }
    }

    // MARK: The panel

    /// The chosen flag's panel; nil with nothing chosen. The line says when nothing hangs
    /// under it one level down (it needs `periods` for its words); the areas show once
    /// Move to is open.
    var panel: (line: String?, canWalkDown: Bool, moveTo: [WalkArea])? {
        guard let item = chosen else { return nil }
        let bare = !below.contains { $0.parentId == item.id }
        let line = bare ? periods.map { DailyCopy.nothingUnder(item.level, periods: $0) } : nil
        return (line, Self.canWalkDown(item, in: walkItems), moving ? moveTargets(for: item.id) : [])
    }

    /// The areas a flag can move to: every area but its own.
    func moveTargets(for id: UUID) -> [WalkArea] {
        guard let item = item(id) else { return [] }
        return areas.filter { $0.id != item.areaId }
    }

    /// What VoiceOver offers on a flag, as events `perform(_:on:)` runs on it: on the page's
    /// level, Walk it down (when it can), Move to each other area and Pull it up; on a flag
    /// one level up, nothing (its tap focuses it). The list depends only on the flag and the
    /// rows read, never on what is chosen, focused or open, so a flag's actions never flip
    /// between none and some while the page is up.
    func actions(for id: UUID) -> [Event] {
        guard let item = item(id), item.level == level else { return [] }
        return (Self.canWalkDown(item, in: walkItems) ? [.walkDown] : [])
            + moveTargets(for: id).map { .moveTo($0.id) } + [.pullUp]
    }

    /// Runs one of `actions(for: id)` on that flag, whatever was chosen before.
    mutating func perform(_ event: Event, on id: UUID) -> [Effect] {
        guard let item = item(id), item.level == level else { return [] }
        selected = id
        return apply(event)
    }

    /// Where a goal added from the bar on this page hangs: the kept areas, the zoomed peak
    /// (Year), the focused flag (Season, Month), and this page's own periods, so it files into
    /// the period on screen, not the walk's. Nil until the view has set `periods`.
    var hanging: (kept: [WalkArea], focusArea: UUID?, parent: WalkItem?, periods: WalkPeriods)? {
        guard let periods else { return nil }
        return (areas.filter { kept.contains($0.id) }, level == .year ? focusArea : nil,
                level == .year ? nil : item(focus), periods)
    }

    // MARK: Walk it down

    /// Opens the walk one level below `item`, about it: a quick walk, in progress, `focus[level + 1] = item.id`.
    /// It runs in the walk's own `periods`, over the walk's `items` (every one of them may be
    /// moved or pulled up there, so all are planted), with `item`'s area kept. The light is
    /// not taught again: this person has met it.
    static func walkDown(_ item: WalkItem, items: [WalkItem], areas: [WalkArea], kept: [UUID],
                         periods: WalkPeriods, now: Date) -> WalkPosition {
        let next = WalkLevel(rawValue: min(item.level.rawValue + 1, WalkLevel.today.rawValue)) ?? .today
        let all = items.contains { $0.id == item.id } ? items : items + [item]
        var s = WalkState()
        s.step = next.rawValue
        s.ground = false
        s.depth = .quick
        s.areas = areas
        s.kept = Self.kept(items: all, areas: areas, saved: kept)
        s.items = all
        s.focus = [next: item.id]
        s.taught = true
        return WalkPosition(s, status: .inProgress, planted: Set(all.map(\.id)), periods: periods, now: now)
    }

    /// Only a goal of the walk's own periods (`walkItems`, read for `WalkPeriods.pick`) can be walked down.
    static func canWalkDown(_ item: WalkItem, in walkItems: [WalkItem]) -> Bool {
        item.level.rawValue <= WalkLevel.month.rawValue
            && walkItems.contains { $0.id == item.id && $0.level == item.level }
    }

    // MARK: Helpers

    private func item(_ id: UUID?) -> WalkItem? { id.flatMap { id in items.first { $0.id == id } } }

    /// The chosen flag, while it is still here.
    private var chosen: WalkItem? { item(selected).flatMap { $0.level == level ? $0 : nil } }
}
