import Foundation
import SwiftData

/// A Month, Season or Year page in a light household: the walk's own mountain for that
/// level, with the person's flags, and no question and no light. It is drawn by
/// `WalkLayout.make(walkState, …, footing: .natural)` at the walk's own step for the
/// level (1 Year, 2 Season, 3 Month): the walk's camera for that level, peak labels under
/// their posts, and only the level shown and those above it. (Look back up, step 6, reads one
/// area top to bottom, every level, the others as side posts (F6); only `lookBack` uses it.)
///
/// Pure: what should be written comes back as `Effect`s for the page's model to carry out.
/// Its flags come from the person's own rows by their links (`flags(...)`), and every one may
/// be chosen, moved or pulled up, not only those a walk planted.
struct MountainPage: Equatable {
    let level: WalkLevel                               // .year, .season or .month
    var items: [WalkItem]; var areas: [WalkArea]; var kept: [UUID]
    /// The person's flags one level below the page's (season goals on Year, month goals on
    /// Season, week tasks on Month), in any period: not drawn, read only to say when nothing
    /// hangs under one.
    var below: [WalkItem] = []
    /// The saved walk's kept areas as ids of this ridge (`kept(items:areas:saved:savedAreas:)`):
    /// `kept` is these and every area a flag stands in, worked out again whenever a flag moves or goes.
    var saved: [UUID] = []
    var selected: UUID?; var focus: UUID?              // focus: a flag one level up (Season, Month)
    var focusArea: UUID?                               // a zoomed peak (Year)
    var expanded: WalkPostKey?; var moving = false
    /// The page's own periods (`periods(level:selected:today:seasons:)`), used by `panel` and `hanging`.
    var periods: WalkPeriods?
    /// The flags of the periods "Walk it down" plans in (`DailyPeriods.walking`), the only ones it opens.
    var walkItems: [WalkItem] = []
    /// Those periods: the walk's own, or, on a page showing the period that holds today when the walk
    /// has moved on, the periods that hold today.
    var walkPeriods: WalkPeriods?

    init(level: WalkLevel, items: [WalkItem], areas: [WalkArea], saved: [UUID], savedAreas: [WalkArea] = []) {
        self.level = level
        self.items = []
        self.areas = []
        self.kept = []
        read(items: items, areas: areas, saved: saved, savedAreas: savedAreas)
    }

    /// A page built from `flags(...)`: its flags, the walk's, and its periods.
    init(level: WalkLevel, flags: Flags, areas: [WalkArea], saved: [UUID], savedAreas: [WalkArea] = []) {
        self.init(level: level, items: [], areas: areas, saved: saved, savedAreas: savedAreas)
        read(flags, areas: areas, saved: saved, savedAreas: savedAreas)
    }

    /// Takes in what the rows say now (at first, and each time they change): every item
    /// the person's own, nothing below the page's level drawn, the kept areas worked out
    /// again. A choice, a focus or a zoom whose flag or peak has gone is let go.
    mutating func read(items: [WalkItem], areas: [WalkArea], saved: [UUID], savedAreas: [WalkArea] = []) {
        let own = items.map { item -> WalkItem in
            var item = item
            item.mine = true
            return item
        }
        self.items = own.filter { $0.level.rawValue <= level.rawValue }
        below = own.filter { $0.level.rawValue == level.rawValue + 1 }
        self.areas = areas
        self.saved = Self.kept(items: [], areas: areas, saved: saved, savedAreas: savedAreas)
        settle()
    }

    /// `read(items:…)` with what `flags(...)` found, and the walk's flags and the page's periods with them.
    mutating func read(_ flags: Flags, areas: [WalkArea], saved: [UUID], savedAreas: [WalkArea] = []) {
        read(items: flags.items, areas: areas, saved: saved, savedAreas: savedAreas)
        walkItems = flags.walk
        periods = flags.periods
        walkPeriods = flags.walkPeriods
    }

    /// After the flags change: kept areas again, and nothing left pointing at what has gone.
    private mutating func settle() {
        kept = Self.kept(items: items, areas: areas, saved: saved)
        if let id = selected, item(id) == nil { selected = nil; moving = false }
        if let id = focus, item(id) == nil { focus = nil }
        if let id = focusArea, !kept.contains(id) { focusArea = nil }
    }

    // MARK: Periods and areas

    /// Every period holding `selected`, the date the page was opened on (its year, season and
    /// month); the week and the day are today's, as the walk's. `seasonIsCurrent` and
    /// `monthIsCurrent` keep the walk's meaning, "the one in force today, not one ahead": here,
    /// that the page's season or month holds today. Only the walk's question words read them;
    /// `WalkWriter` files by `year`, `season.start`, `monthStart` and `today` alone.
    static func periods(level: WalkLevel, selected: Date, today: Date, seasons: [SeasonBoundary]?) -> WalkPeriods {
        let walk = WalkPeriods.pick(now: today, seasons: seasons)
        guard level.rawValue <= WalkLevel.month.rawValue else { return walk }
        let season = PlanCalendar.season(containing: selected, boundaries: seasons)
        let month = PlanCalendar.monthStart(selected)
        return WalkPeriods(today: walk.today, year: PlanCalendar.year(of: selected), season: season,
                           seasonIsCurrent: PlanCalendar.sameDay(season.start,
                                                                 PlanCalendar.season(containing: today, boundaries: seasons).start),
                           monthStart: month,
                           monthIsCurrent: PlanCalendar.sameDay(month, PlanCalendar.monthStart(today)),
                           weekStart: walk.weekStart)
    }

    /// The saved walk's kept areas, and every area with a flag on it, in `areas` order. A saved
    /// id this ridge does not hold (its row came with another id) is found by its name in
    /// `savedAreas` (the saved walk's ridge) before it is dropped.
    static func kept(items: [WalkItem], areas: [WalkArea], saved: [UUID], savedAreas: [WalkArea] = []) -> [UUID] {
        func key(_ name: String) -> String { name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        let ids = Set(areas.map(\.id))
        let savedIds = Set(saved.compactMap { id -> UUID? in
            if ids.contains(id) { return id }
            guard let name = savedAreas.first(where: { $0.id == id }).map({ key($0.name) }) else { return nil }
            return areas.first { key($0.name) == name }?.id
        })
        let used = Set(items.compactMap(\.areaId))
        return areas.map(\.id).filter { savedIds.contains($0) || used.contains($0) }
    }

    // MARK: The flags, by their links

    /// What a page shows, read from the person's rows.
    struct Flags: Equatable {
        /// The page's own periods.
        let periods: WalkPeriods
        /// The levels above the page's: each own flag's real parent, up its links, in whatever
        /// period it is filed; and the upper flags of the walk's current periods, so there is
        /// always something to hang a new goal under. Each once, year first.
        var above: [WalkItem]
        /// The page's own level, in the page's own period.
        var own: [WalkItem]
        /// Every row one level down that links to an own flag, in any period.
        var below: [WalkItem]
        /// The flags of `walkPeriods`: what Walk it down opens, and the upper flags to hang a goal under.
        var walk: [WalkItem]
        /// The periods Walk it down plans in (`DailyPeriods.walking`): the walk's own, or on a page
        /// showing the period that holds today, while the walk has moved on, the periods that hold today.
        var walkPeriods: WalkPeriods

        var items: [WalkItem] { above + own + below }
    }

    /// A page from the person's rows by their links, not by the walk's calendar: the page's
    /// own level in the period holding `selected`, every flag hung under its real parent
    /// (`goalId` for a season goal, `sourceId` else `goalTaskId` below it, as the walk links
    /// them), and the level below by link. Pass every `Goal` and `SymphonyTask` row: only the
    /// person's own personal ones are read (goals through `WalkLoad.items`, tasks through
    /// `DailyDay.mine`), and an area off `areas` leaves a flag on the unlabeled post. A link to
    /// a row that is gone, or is not the person's, leaves the flag with no parent.
    static func flags(level: WalkLevel, goals: [Goal], tasks: [SymphonyTask], selected: Date, today: Date,
                      seasons: [SeasonBoundary]?, me: UUID, areas: [WalkArea]) -> Flags {
        let page = periods(level: level, selected: selected, today: today, seasons: seasons)
        let walkPeriods = DailyPeriods.walking(level, shown: selected, today: today, seasons: seasons)
        func load(_ p: WalkPeriods, goalsOnly: Bool = false) -> [WalkItem] {
            WalkLoad.items(goals: goals, tasks: goalsOnly ? [] : tasks, periods: p, me: me, planted: [], areas: areas)
        }
        let walk = load(walkPeriods)
        let mine = DailyDay.mine(tasks, me: me)
        let rows = Dictionary(mine.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let shown = Set(areas.map(\.id))

        func rowLevel(_ t: SymphonyTask) -> WalkLevel {
            switch t.bucket { case "quarter": .season; case "month": .month; default: .week }
        }
        /// The row a task links up to, by the walk's own rule for its level.
        func link(_ t: SymphonyTask) -> UUID? {
            let up = rowLevel(t) == .season ? t.goalId : (t.sourceId ?? t.goalTaskId)
            return up == t.id ? nil : up
        }
        func item(_ t: SymphonyTask, parent: UUID? = nil) -> WalkItem {
            WalkItem(id: t.id, level: rowLevel(t), title: t.title, areaId: t.areaId.flatMap { shown.contains($0) ? $0 : nil },
                     parentId: parent, day: t.scheduledFor, done: t.completed)
        }
        var yearGoals: [Int: [WalkItem]] = [:]
        /// A flag on `level` with this id, if it is the person's own.
        func row(_ id: UUID, on level: WalkLevel) -> WalkItem? {
            if level == .year {
                guard let year = goals.first(where: { $0.id == id })?.year else { return nil }
                if yearGoals[year] == nil {
                    let p = WalkPeriods(today: walkPeriods.today, year: year, season: walkPeriods.season,
                                        seasonIsCurrent: walkPeriods.seasonIsCurrent, monthStart: walkPeriods.monthStart,
                                        monthIsCurrent: walkPeriods.monthIsCurrent, weekStart: walkPeriods.weekStart)
                    yearGoals[year] = load(p, goalsOnly: true)
                }
                return yearGoals[year]?.first { $0.id == id }
            }
            guard let t = rows[id], rowLevel(t) == level else { return nil }
            return item(t)
        }

        // The page's own flags and the walk's upper ones, then each one's parents up its links.
        let own = load(page).filter { $0.level == level }
        var above = walk.filter { $0.level.rawValue < level.rawValue }
        var drawn = Set((own + above).map(\.id))
        var climbing = own + above
        while !climbing.isEmpty {
            var next: [WalkItem] = []
            for flag in climbing where flag.level != .year {
                guard let t = rows[flag.id], let up = link(t), !drawn.contains(up),
                      let level = WalkLevel(rawValue: flag.level.rawValue - 1), let parent = row(up, on: level)
                else { continue }
                drawn.insert(up)
                above.append(parent)
                next.append(parent)
            }
            climbing = next
        }
        let levelOf = Dictionary((own + above).map { ($0.id, $0.level) }, uniquingKeysWith: { a, _ in a })
        func hung(_ flag: WalkItem) -> WalkItem {
            var flag = flag
            flag.parentId = rows[flag.id].flatMap(link).flatMap { up in
                levelOf[up]?.rawValue == flag.level.rawValue - 1 ? up : nil
            }
            return flag
        }
        let ownIds = Set(own.map(\.id))
        let below = mine
            .filter { rowLevel($0).rawValue == level.rawValue + 1 && link($0).map(ownIds.contains) == true }
            .sorted { ($0.sortOrder ?? 0, $0.createdAt) < ($1.sortOrder ?? 0, $1.createdAt) }
            .map { item($0, parent: link($0)) }
        // Year first, then season: the walk's flags of a level before those found by link.
        let ordered = above.enumerated().sorted { ($0.element.level.rawValue, $0.offset) < ($1.element.level.rawValue, $1.offset) }
        return Flags(periods: page, above: ordered.map { hung($0.element) }, own: own.map(hung), below: below, walk: walk,
                     walkPeriods: walkPeriods)
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

    /// Look back up (step 6): every level of the area it stands in, top to bottom; every other kept area
    /// holding a flag a side post (F6). It stands where the walk's own rule puts it (`WalkState.settled`).
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
            guard let item = chosen, !moveTargets(for: item.id).isEmpty else { return [] }
            moving = true
            return []
        case .moveTo(let areaId):
            guard let item = chosen, let index = items.firstIndex(where: { $0.id == item.id }),
                  moveTargets(for: item.id).contains(where: { $0.id == areaId }) else { return [] }
            items[index].areaId = areaId
            selected = nil
            moving = false
            settle()
            return [.setArea(item.id, item.level, to: areaId, from: item.areaId)]
        case .pullUp:
            // As the writer does: the flags that hung under it stay, unlinked.
            guard let item = chosen else { return [] }
            items.removeAll { $0.id == item.id }
            for i in below.indices where below[i].parentId == item.id { below[i].parentId = nil }
            selected = nil
            moving = false
            settle()
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
    /// the period on screen, not the walk's, under that flag whatever period the flag is in.
    /// Nil until `periods` is set.
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
