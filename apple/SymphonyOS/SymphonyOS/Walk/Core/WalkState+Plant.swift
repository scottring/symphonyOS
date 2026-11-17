import Foundation

/// What happens to flags: planting what was said, the examples, selecting,
/// moving and pulling up, the first thing, and undo of every one of them.
/// Still pure: rows are asked for as `.write` effects, never written here.
/// Only a flag this walk planted (`mine`) is ever selected, moved, pulled up
/// or taken back by Undo.
extension WalkState {

    // MARK: Planting

    /// Plants what was said on this step. On the ground it names an area; on
    /// Year a goal goes in the area the walk stands in; lower levels hang under
    /// the focused parent; on Today it becomes the first thing and the goal above.
    /// Nothing said, nothing planted.
    mutating func plant(_ raw: String, _ env: WalkEnv) -> [WalkEffect] {
        guard let level else { return [] }
        if ground { return nameArea(raw, env) }
        guard let said = WalkWords.said(raw, level: level, today: env.periods.today) else { return nothingToPlant() }
        return plantFlag(said, on: level, plantSoundMs: 0, env)
    }

    // MARK: Examples (F27, and the library)

    /// Where a page of examples belongs: the step, the area stood in and the goal above shown.
    struct ExamplePlace: Equatable { var step: Int; var standing: UUID?; var above: UUID? }
    /// The page of examples the walk is on at a place, and how many pages this showing has gone through.
    struct ExamplePage: Equatable { var place: ExamplePlace; var index = 0; var seen = 0 }
    /// The most pages one showing goes through before the choice reads "Hide examples".
    static let examplePagesAShowing = 3

    private var examplePlace: ExamplePlace {
        ExamplePlace(step: step, standing: standing, above: level.flatMap { focus[$0] })
    }

    /// The goal above shown and the goals above it, nearest first: what the library reads to find a
    /// theme. Only a goal in the area stood in counts (an example is never planted under another area's).
    private func titlesAbove() -> [String] {
        guard let level, level != .year, var at = item(focus[level]), column(of: at) == standing else { return [] }
        var out = [at.title]
        while let up = item(at.parentId), out.count < 4 { out.append(up.title); at = up }
        return out
    }

    /// Every example for this step in the area stood in, best first (`WalkExampleLibrary.pool`), in
    /// pages of as many as show at once. None on Today, on the ground, on the nameless post or in an
    /// area of the person's own.
    private func examplePages() -> [[String]] {
        guard let level, !ground, (1...4).contains(step) else { return [] }
        let pool = WalkExampleLibrary.pool(level, area: area(standing)?.name, above: titlesAbove())
        let size = WalkExampleLibrary.pageSize(level)
        return stride(from: 0, to: pool.count, by: size).map { Array(pool[$0..<min($0 + size, pool.count)]) }
    }

    /// A page's examples not yet used: not already planted on this level (the same title ignoring
    /// case; on Week the same day too).
    private func unused(_ page: [String], today: Date) -> [String] {
        guard let level else { return [] }
        return page.filter { text in
            guard let said = Self.exampleSaid(text, level, today) else { return false }
            return !items(on: level).contains {
                $0.title.caseInsensitiveCompare(said.title) == .orderedSame
                    && (level != .week || $0.day.map(PlanCalendar.day) == said.day.map(PlanCalendar.day))
            }
        }
    }

    /// The page the walk is on here: the one last shown at this place, else the first.
    private func examplePageIndex(_ pages: [[String]]) -> Int {
        guard let page = examplePage, page.place == examplePlace, page.index < pages.count else { return 0 }
        return page.index
    }

    /// The first page from `start` on, going round, with an example left; nil when none has.
    private func pageWithOneLeft(_ pages: [[String]], from start: Int, today: Date) -> Int? {
        (0..<pages.count).map { (start + $0) % pages.count }.first { !unused(pages[$0], today: today).isEmpty }
    }

    /// The one question about examples (F27, P23): the examples that show here, or would on asking:
    /// the page the walk is on, its used ones gone; with none left on it, the next page that has one.
    /// The examples choice is offered, the action acts and the layout draws examples only from this;
    /// while they are on it is exactly what shows.
    func examplesLeft(today: Date) -> [String] {
        let pages = examplePages()
        guard let index = pageWithOneLeft(pages, from: examplePageIndex(pages), today: today) else { return [] }
        return unused(pages[index], today: today)
    }

    /// While examples are on: asking again brings other ones (another page has one left, and this
    /// showing has not gone through `examplePagesAShowing` yet). Otherwise asking again hides them.
    func showsOtherExamples(today: Date) -> Bool {
        guard examplesOn.contains(step) else { return false }
        let pages = examplePages()
        guard let index = pageWithOneLeft(pages, from: examplePageIndex(pages), today: today) else { return false }
        let seen = examplePage?.place == examplePlace ? examplePage?.seen ?? 0 : 0
        guard seen < Self.examplePagesAShowing, pages.count > 1 else { return false }
        return pageWithOneLeft(pages, from: (index + 1) % pages.count, today: today) != index
    }

    /// The examples choice. Off: the page the walk is on here shows. On: the next page with one left
    /// shows, for up to `examplePagesAShowing` pages; then they hide. Hiding keeps the page, so asking
    /// again brings the same ones back, and "Other examples" goes on from there.
    mutating func toggleExamples(today: Date) {
        let pages = examplePages()
        guard let index = pageWithOneLeft(pages, from: examplePageIndex(pages), today: today) else { return }
        var page = examplePage?.place == examplePlace ? examplePage ?? ExamplePage(place: examplePlace)
                                                      : ExamplePage(place: examplePlace)
        let others = showsOtherExamples(today: today)
        page.index = index
        if !examplesOn.contains(step) {
            examplesOn.insert(step)
            page.seen = 1
        } else if others, let next = pageWithOneLeft(pages, from: (index + 1) % pages.count, today: today) {
            page.index = next
            page.seen = max(page.seen, 1) + 1
        } else {
            examplesOn.remove(step)
            page.seen = 0
        }
        examplePage = page
    }

    /// The page that shows has no example left: they were all used, as examples or in the person's
    /// own words (P23).
    private func shownPageIsUsedUp(today: Date) -> Bool {
        let pages = examplePages()
        guard !pages.isEmpty else { return true }
        return unused(pages[examplePageIndex(pages)], today: today).isEmpty
    }

    /// An example read as anything said on this step is (Week's day comes off its end).
    private static func exampleSaid(_ text: String, _ level: WalkLevel, _ today: Date) -> WalkWords.Said? {
        WalkWords.said(text, level: level, today: today, detect: { _ in nil })
    }

    /// An example shown here is planted as the person's own words, in the area stood in, under the
    /// goal above (`plantFlag`); never under another area's goal. Once planted it comes down, so
    /// another tap does nothing.
    mutating func plantExample(_ text: String, _ env: WalkEnv) -> [WalkEffect] {
        guard let level, examplesOn.contains(step), examplesLeft(today: env.periods.today).contains(text),
              let said = Self.exampleSaid(text, level, env.periods.today) else { return [] }
        if level != .year, let parent = item(focus[level]), column(of: parent) != standing { return [] }
        return [.sound(.poles, afterMs: 0)] + plantFlag(said, on: level, plantSoundMs: 160, env)
    }

    /// A flag goes where the walk stands (F2): on Year in the area stood in; below,
    /// under the focused parent and in its area, or, with none, in the area stood in.
    private mutating func plantFlag(_ said: WalkWords.Said, on level: WalkLevel,
                                    plantSoundMs: Int, _ env: WalkEnv) -> [WalkEffect] {
        var parent = level == .year ? nil : item(focus[level])
        // On Today never under a flag whose own goal above is a week task (a first thing said
        // earlier): beside it, under that week task, so no line grows deeper than year to Today.
        while level == .today, let p = parent, let up = item(p.parentId), up.level == .week { parent = up }
        let areaId = parent?.areaId ?? standing
        // The first thing is a week task dated today, titled with everything that was said.
        let item = WalkItem(id: env.newId(), level: level == .today ? .week : level, title: said.title,
                            areaId: areaId, parentId: parent?.id,
                            day: level == .today ? env.periods.today : said.day, mine: true)
        items.append(item)
        // On a walk down, a flag said with no goal above starts a line of this walk down's own.
        if !walkingDown.isEmpty, level != .year, parent == nil { walkingDown.append(item.id) }
        emptyHolds = 0

        var effects: [WalkEffect] = []
        if let a = area(areaId) { effects.append(.write(.area(a))) }
        effects.append(.write(.create(item, parent: parent)))
        if level == .today {
            effects.append(.write(.firstThing(item.id, previous: firstThing)))
            undo.append(.firstThing(previous: firstThing, created: item.id))
            moveMark(to: item.id, env.periods.today)
            // P15: what was just said is what Finish is about, so it is the goal above at once (the next
            // thing said still hangs beside it, above).
            focus[.today] = item.id
        } else {
            undo.append(.plant(item.id))
        }
        lastPlanted[level] = item.id
        // The last example shown here was just used, as an example or in the person's own words (P23):
        // they come down, and asking again brings the next ones.
        if examplesOn.contains(step), shownPageIsUsedUp(today: env.periods.today) { examplesOn.remove(step) }
        selected = nil
        expanded = nil                      // the post just planted on is the open one, not one opened before
        undoShowing = true
        effects += [.sound(.plant, afterMs: plantSoundMs), .timer(.undo, ms: WalkState.undoMs), .save]
        return effects
    }

    /// The ground: the words name an area. A peak of that name is kept; a new
    /// one joins the ridge while there is room. No row until something is filed under it.
    private mutating func nameArea(_ raw: String, _ env: WalkEnv) -> [WalkEffect] {
        guard let tidied = WalkWords.tidy(raw) else { return nothingToPlant() }
        let name = String(tidied.prefix(WalkWords.maxAreaName)).trimmingCharacters(in: .whitespaces)
        if let existing = areas.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
            guard !kept.contains(existing.id) else { return [] }
            kept.append(existing.id)
            undo.append(.keep(existing.id))
        } else {
            guard areas.count < WalkLoad.maxAreas else {
                note = WalkCopy.ridgeFull
                return [.timer(.note, ms: WalkState.noteMs)]
            }
            let area = WalkArea(id: env.newId(), name: name)
            areas.append(area)
            kept.append(area.id)
            undo.append(.nameArea(area))
        }
        emptyHolds = 0
        selected = nil
        undoShowing = true
        return [.sound(.plant, afterMs: 0), .timer(.undo, ms: WalkState.undoMs), .save]
    }

    private mutating func nothingToPlant() -> [WalkEffect] {
        note = WalkCopy.nothingToPlant
        return [.timer(.note, ms: WalkState.noteMs)]
    }

    // MARK: The first thing

    /// Today, a week flag focused: that task becomes the one first thing. The
    /// earlier first thing stays where it is.
    mutating func startThere(_ env: WalkEnv) -> [WalkEffect] {
        guard level == .today, let id = focus[.today], id != firstThing, item(id) != nil else { return [] }
        let previous = firstThing
        moveMark(to: id, env.periods.today)
        undo.append(.firstThing(previous: previous, created: nil))
        selected = nil
        undoShowing = true
        return [.write(.firstThing(id, previous: previous)), .timer(.undo, ms: WalkState.undoMs), .save]
    }

    /// Moves the mark as the writer does: a task marked from another day is
    /// dated today, and gets its day back when the mark leaves it.
    private mutating func moveMark(to id: UUID?, _ today: Date) {
        if let old = firstThing, old != id, let before = dayBeforeFirst.removeValue(forKey: old),
           let index = items.firstIndex(where: { $0.id == old }) {
            items[index].day = before
        }
        if let id, let index = items.firstIndex(where: { $0.id == id }), !PlanCalendar.sameDay(items[index].day, today) {
            dayBeforeFirst.updateValue(items[index].day, forKey: id)
            items[index].day = today
        }
        firstThing = id
    }

    // MARK: Selecting, moving, pulling up

    /// Whether a tap selects this flag rather than focusing it: a flag on the
    /// step's own level, and on Today the first thing, if this walk planted it.
    func selects(_ id: UUID) -> Bool {
        guard let level, let item = item(id) else { return false }
        if level == .today { return id == firstThing && item.mine }
        return item.level == level
    }

    /// The areas the selected flag can move to (F24): the areas the person kept, in ridge order, never
    /// its own. None for Today's first thing, whose area comes from its parent: it can only be pulled up.
    var moveTargets: [WalkArea] {
        guard let item = item(selected), level != .today else { return [] }
        return keptAreas.filter { $0.id != item.areaId }
    }

    /// A flag on the step's own level, planted by this walk: selected (or let go).
    mutating func select(_ id: UUID) -> [WalkEffect] {
        guard !ground, let item = item(id), item.mine else { return [] }
        selected = selected == id ? nil : id
        undoShowing = false
        return [.sound(.tick, afterMs: 0)]
    }

    /// A "+n" stub opens its post (again to close), and that column becomes the open one.
    mutating func openStub(_ key: WalkPostKey) -> [WalkEffect] {
        guard expanded != key else {
            expanded = nil
            return []
        }
        expanded = key
        if let newest = items(on: key.level).last(where: { column(of: $0) == key.column }) {
            lastPlanted[key.level] = newest.id
        }
        return []
    }

    /// The selected flag goes to another area; an area not kept is kept, so its column appears.
    mutating func moveSelected(to areaId: UUID) -> [WalkEffect] {
        guard let id = selected, let index = items.firstIndex(where: { $0.id == id }), items[index].mine,
              let target = moveTargets.first(where: { $0.id == areaId }) else { return [] }
        let from = items[index].areaId
        let keptAdded: UUID? = kept.contains(areaId) ? nil : areaId
        if keptAdded != nil { kept.append(areaId) }
        items[index].areaId = areaId
        undo.append(.move(id, from: from, keptAdded: keptAdded))
        selected = nil
        undoShowing = true
        return [.write(.area(target)), .write(.setArea(id, items[index].level, areaId)),
                .sound(.poles, afterMs: 0), .sound(.plant, afterMs: 140),
                .timer(.undo, ms: WalkState.undoMs), .save]
    }

    /// The selected flag comes out. Flags that hung under it stay, unlinked;
    /// nothing is left pointing at it.
    mutating func pullUpSelected() -> [WalkEffect] {
        guard let id = selected, let index = items.firstIndex(where: { $0.id == id }), items[index].mine
        else { return [] }
        let wasFirstThing = firstThing == id
        let walkedAt = walkingDown.firstIndex(of: id)       // a walk down's own line, given back by Undo
        let item = items.remove(at: index)
        pulledChildren[id] = unlinkChildren(of: id)
        forget(id)
        undo.append(.pullUp(item, index: index, wasFirstThing: wasFirstThing, walkedAt: walkedAt))
        undoShowing = true
        return [.write(.remove(id, item.level)), .sound(.poles, afterMs: 0),
                .timer(.undo, ms: WalkState.undoMs), .save]
    }

    // MARK: Undo

    /// Reverses the newest action taken on the step in view (F23): the stack is emptied whenever the
    /// step changes or the walk leaves the ground (`settle`), so Undo never reaches back past the
    /// step the person is looking at. The pill hiding does not empty it; a whole-year tour going on
    /// to the next area or goal stays on its step and keeps it.
    mutating func undoLast(_ env: WalkEnv) -> [WalkEffect] {
        guard let entry = undo.popLast() else { return [] }
        var effects: [WalkEffect] = []
        switch entry {
        case .plant(let id):
            effects = takeBack(id)
        case .nameArea(let area):
            areas.removeAll { $0.id == area.id }
            kept.removeAll { $0 == area.id }
            forget(area.id)
        case .keep(let id):
            kept.removeAll { $0 == id }
            forget(id)
        case .unkeep(let id, let index):
            if !kept.contains(id) { kept.insert(id, at: min(index, kept.count)) }
        case .move(let id, let from, let keptAdded):
            if let index = items.firstIndex(where: { $0.id == id }), items[index].mine {
                let to = items[index].areaId
                items[index].areaId = from
                // The area it left may have been dropped meanwhile: it comes back before the row names it.
                if let a = area(from) { effects.append(.write(.area(a))) }
                effects.append(.write(.setArea(id, items[index].level, from)))
                if let to { effects.append(.write(.dropArea(to))) }
                if let keptAdded {
                    kept.removeAll { $0 == keptAdded }
                    forget(keptAdded)
                }
            }
        case .pullUp(let item, let index, let wasFirstThing, let walkedAt):
            if item.mine, self.item(item.id) == nil {
                items.insert(item, at: min(index, items.count))
                if let walkedAt, !walkingDown.contains(item.id) {
                    walkingDown.insert(item.id, at: min(walkedAt, walkingDown.count))
                }
                for child in pulledChildren[item.id] ?? [] {
                    if let i = items.firstIndex(where: { $0.id == child }), items[i].parentId == nil {
                        items[i].parentId = item.id
                    }
                }
                if wasFirstThing { firstThing = item.id }
                effects.append(.write(.restore(item.id)))
            }
            pulledChildren[item.id] = nil
        case .firstThing(let previous, let created):
            effects.append(.write(.firstThing(previous, previous: firstThing)))
            moveMark(to: previous, env.periods.today)
            if let created { effects += takeBack(created) }
        }
        selected = nil
        undoShowing = false
        return effects + [.sound(.poles, afterMs: 0), .save]
    }

    /// Undo of a plant: the flag and its row go, and the area it alone used, if this walk made it.
    private mutating func takeBack(_ id: UUID) -> [WalkEffect] {
        guard let index = items.firstIndex(where: { $0.id == id }), items[index].mine else { return [] }
        let item = items.remove(at: index)
        _ = unlinkChildren(of: id)
        forget(id)
        var effects: [WalkEffect] = [.write(.remove(id, item.level))]
        if let areaId = item.areaId { effects.append(.write(.dropArea(areaId))) }
        return effects
    }

    /// Flags that named `id` as parent lose the link, as their rows do. Returns their ids.
    private mutating func unlinkChildren(of id: UUID) -> [UUID] {
        var children: [UUID] = []
        for i in items.indices where items[i].parentId == id {
            items[i].parentId = nil
            children.append(items[i].id)
        }
        return children
    }

    /// Nothing is left pointing at an id that is gone (a flag, or an area no
    /// longer kept): not the tour, a focus, the first thing, the selection, nor a
    /// focused peak that is no longer kept. A level whose last planted flag it was
    /// falls back to the newest flag the person still has planted on it in this
    /// walk, so the next step's flags still link (nil only when none is left).
    private mutating func forget(_ id: UUID) {
        tour.removeAll { $0 == id }
        walkingDown.removeAll { $0 == id }
        focus = focus.filter { $0.value != id }
        for (level, last) in lastPlanted where last == id {
            lastPlanted[level] = items(on: level).last(where: \.mine)?.id
        }
        if firstThing == id { firstThing = nil }
        if selected == id { selected = nil }
        if let f = focusArea, f == id || !kept.contains(f) { focusArea = nil }
    }

    // MARK: The ending

    /// "Walk another one down": back to Season in a quick walk, focused on the
    /// first year goal with nothing under it yet (the walk stands in its area), as
    /// a clean walk down. No focus or last-planted flag below is kept, and below it
    /// only that goal's own line is a goal above (`walkingDown`): a skipped step with
    /// none has no goal above rather than another chain's. No tour, no Undo, no
    /// examples, no note, no half-finished hold. The flags,
    /// the ridge, today's first thing (and the day it replaced) and a refusal
    /// of speech stay. With every goal walked, or before the ending, nothing.
    mutating func walkAnother() -> [WalkEffect] {
        guard step == 6, let next = WalkEnding.nextToWalk(items) else { return [] }
        depth = .quick
        step = 2
        ground = false
        focusArea = nil
        tour = []
        walkingDown = [next.id]
        focus = [.season: next.id]
        lastPlanted = [:]
        undo = []
        undoShowing = false
        pulledChildren = [:]                // only Undo reads it
        examplesOn = []
        note = nil
        selected = nil
        expanded = nil
        typing = nil
        orb = .idle
        orbWasOpen = false
        emptyHolds = 0
        sessionOver = false
        sheetOpen = false
        teachOnce()                         // a walk-down's first step teaches the light, if this walk never has
        return [.save]
    }

    // MARK: The sheet

    /// The sheet stands raised when the person opened it, or when there is no plan to look back at.
    var sheetRaised: Bool { sheetOpen || items.isEmpty }

    /// Look back up's one line: the plan while the sheet is down, today once it is up.
    var endingTitle: String { sheetRaised ? WalkCopy.heresToday : WalkCopy.lookBack }

    /// What the handle says; nil when there is nothing to look back at, so nothing to lower it to.
    var sheetHandleLabel: String? {
        guard !items.isEmpty else { return nil }
        return sheetOpen ? WalkCopy.lookBackHandle : WalkCopy.showMyDay
    }

    /// The handle raises the sheet and lowers it again; it never ends the walk.
    mutating func moveSheet() -> [WalkEffect] {
        guard step == 6, !items.isEmpty else { return [] }
        sheetOpen.toggle()
        return []
    }

    // MARK: The ending's rows

    /// Ticks any of today's tasks, planted by the walk or not, on the ending only. The model
    /// passes on only ids among the sheet's rows; the writer touches only the person's own.
    mutating func toggleRow(_ taskId: UUID) -> [WalkEffect] {
        guard step == 6 else { return [] }
        if let index = items.firstIndex(where: { $0.id == taskId }) { items[index].done.toggle() }
        return [.write(.toggleDone(taskId))]
    }
}
