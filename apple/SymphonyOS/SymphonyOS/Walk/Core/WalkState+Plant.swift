import Foundation

/// What happens to flags: planting what was said, the examples, selecting,
/// moving and pulling up, the first thing, and undo of every one of them.
/// Still pure: rows are asked for as `.write` effects, never written here.
/// Only a flag this walk planted (`mine`) is ever selected, moved, pulled up
/// or taken back by Undo.
extension WalkState {

    // MARK: Planting

    /// Plants what was said on this step. On the ground it names an area; on
    /// Year a goal goes where its words clearly belong; lower levels hang under
    /// the focused parent; on Today it becomes the first thing. Nothing said,
    /// nothing planted.
    mutating func plant(_ raw: String, _ env: WalkEnv) -> [WalkEffect] {
        guard let level else { return [] }
        if ground { return nameArea(raw, env) }
        guard let said = WalkWords.said(raw, level: level, today: env.periods.today) else { return nothingToPlant() }
        return plantFlag(said, on: level, classify: true, plantSoundMs: 0, env)
    }

    /// An example is planted as the person's own words, only while examples are
    /// on for this step, with the focused peak's or parent's area and no classifying.
    /// Once it is planted (same words, and on Week the same day) another tap does nothing.
    mutating func plantExample(_ text: String, _ env: WalkEnv) -> [WalkEffect] {
        guard let level, !ground, examplesOn.contains(step), WalkCopy.examples(level).contains(text),
              let said = WalkWords.said(text, level: level, today: env.periods.today) else { return [] }
        let planted = items(on: level).contains {
            $0.title.caseInsensitiveCompare(said.title) == .orderedSame
                && (level != .week || $0.day.map(PlanCalendar.day) == said.day.map(PlanCalendar.day))
        }
        guard !planted else { return [] }
        return [.sound(.poles, afterMs: 0)] + plantFlag(said, on: level, classify: false, plantSoundMs: 160, env)
    }

    private mutating func plantFlag(_ said: WalkWords.Said, on level: WalkLevel, classify: Bool,
                                    plantSoundMs: Int, _ env: WalkEnv) -> [WalkEffect] {
        var areaId: UUID?
        var parent: WalkItem?
        var placedNote: String?
        if level == .year {
            if classify {
                if case .area(let id, let moved) = WalkClassifier.place(said.title, kept: keptAreas, focus: focusArea) {
                    areaId = id
                    if moved, let a = area(id) { placedNote = WalkCopy.placed(a.name) }
                }
            } else {
                areaId = focusArea.flatMap { kept.contains($0) ? $0 : nil }
            }
        } else {
            parent = item(focus[level])
            areaId = parent?.areaId
        }
        // The first thing is a week task dated today, titled with everything that was said.
        let item = WalkItem(id: env.newId(), level: level == .today ? .week : level, title: said.title,
                            areaId: areaId, parentId: parent?.id,
                            day: level == .today ? env.periods.today : said.day, mine: true)
        items.append(item)
        emptyHolds = 0

        var effects: [WalkEffect] = []
        if let a = area(areaId) { effects.append(.write(.area(a))) }
        effects.append(.write(.create(item, parent: parent)))
        if level == .today {
            effects.append(.write(.firstThing(item.id, previous: firstThing)))
            undo.append(.firstThing(previous: firstThing, created: item.id))
            moveMark(to: item.id, env.periods.today)
        } else {
            undo.append(.plant(item.id))
        }
        lastPlanted[level] = item.id
        selected = nil
        undoShowing = true
        effects += [.sound(.plant, afterMs: plantSoundMs), .timer(.undo, ms: WalkState.undoMs)]
        if let placedNote {
            note = placedNote
            effects.append(.timer(.note, ms: WalkState.noteMs))
        }
        effects.append(.save)
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

    /// The areas the selected flag can move to: every label but its own. None
    /// for Today's first thing, whose area comes from its parent: it can only be pulled up.
    var moveTargets: [WalkArea] {
        guard let item = item(selected), level != .today else { return [] }
        return areas.filter { $0.id != item.areaId }
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

    /// The post a flag stands on: its area's when that area is a column, else the unlabeled one.
    private func column(of item: WalkItem) -> UUID? {
        guard let id = item.areaId, area(id) != nil, ground || kept.contains(id) else { return nil }
        return id
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
        let item = items.remove(at: index)
        pulledChildren[id] = unlinkChildren(of: id)
        forget(id)
        undo.append(.pullUp(item, index: index, wasFirstThing: wasFirstThing))
        undoShowing = true
        return [.write(.remove(id, item.level)), .sound(.poles, afterMs: 0),
                .timer(.undo, ms: WalkState.undoMs), .save]
    }

    // MARK: Undo

    /// Reverses the newest action, whatever step it was taken on. The stack
    /// lives as long as the walk runs; the pill hiding does not empty it.
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
        case .pullUp(let item, let index, let wasFirstThing):
            if item.mine, self.item(item.id) == nil {
                items.insert(item, at: min(index, items.count))
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
    /// longer kept): not the tour, a focus, the last planted, the first thing,
    /// the selection, nor a focused peak that is no longer kept.
    private mutating func forget(_ id: UUID) {
        tour.removeAll { $0 == id }
        focus = focus.filter { $0.value != id }
        lastPlanted = lastPlanted.filter { $0.value != id }
        if firstThing == id { firstThing = nil }
        if selected == id { selected = nil }
        if let f = focusArea, f == id || !kept.contains(f) { focusArea = nil }
    }

    // MARK: The ending

    /// "Walk another one down": back to Season in a quick walk, focused on the
    /// first year goal with nothing under it yet, as a clean walk down. Nothing
    /// of the chain just walked steers the next one: no focus or last-planted
    /// flag below (so a skipped step links to nothing of the first chain), no
    /// tour, no Undo, no examples, no note, no half-finished hold. The flags,
    /// the ridge, today's first thing (and the day it replaced) and a refusal
    /// of speech stay. With every goal walked, or before the ending, nothing.
    mutating func walkAnother() -> [WalkEffect] {
        guard step == 6, let next = WalkEnding.nextToWalk(items) else { return [] }
        depth = .quick
        step = 2
        ground = false
        focusArea = nil
        tour = []
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

    /// Ticks any of today's tasks, planted by the walk or not; the writer decides whose rows it may touch.
    mutating func toggleRow(_ taskId: UUID) -> [WalkEffect] {
        if let index = items.firstIndex(where: { $0.id == taskId }) { items[index].done.toggle() }
        return [.write(.toggleDone(taskId))]
    }
}
