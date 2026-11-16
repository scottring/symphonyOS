import Foundation

/// The paper (F7, F9, F12): a whole level read as a plain list by area, where every title is shown
/// whole. Made from plain inputs, so the walk, Look back up and the Month, Season and Year pages can
/// each hand it their own items. Sections follow the ridge (`areas`), kept areas only, an area with
/// nothing on the level left out; flags with no kept area come last, under `WalkCopy.paperNoArea`.
/// Rows are in planting order. A week task carries its day; nothing else carries a tag. Today reads
/// the week's tasks dated today.
struct PlanPaper: Equatable {
    struct Row: Equatable, Identifiable { let id: UUID; let title: String; let tag: String?; var hint: String? = nil }
    /// `area` is nil for the flags with no kept area.
    struct Section: Equatable, Identifiable { let id: String; let area: UUID?; let name: String; let rows: [Row] }
    let title: String; let count: String; let sections: [Section]
    /// The level as it is counted ("goals", or "tasks" on Week and Today), for VoiceOver's section words.
    var level: WalkLevel = .year

    /// How many rows the paper holds.
    var total: Int { sections.reduce(0) { $0 + $1.rows.count } }

    /// The section id of the flags with no kept area.
    static let looseId = "loose"

    static func make(level: WalkLevel, items: [WalkItem], areas: [WalkArea], kept: [UUID],
                     title: String, today: Date) -> PlanPaper {
        let read: [WalkItem] = level == .today
            ? items.filter { $0.level == .week && PlanCalendar.sameDay($0.day, today) }
            : items.filter { $0.level == level }
        let standing = areas.filter { kept.contains($0.id) }
        func row(_ item: WalkItem) -> Row {
            let tag = level == .week ? item.day.map { WalkWords.tag(for: $0, today: today) } : nil
            return Row(id: item.id, title: item.title, tag: tag)
        }
        var sections: [Section] = standing.compactMap { area in
            let rows = read.filter { $0.areaId == area.id }.map(row)
            return rows.isEmpty ? nil : Section(id: area.id.uuidString, area: area.id, name: area.name, rows: rows)
        }
        let loose = read.filter { item in !standing.contains { $0.id == item.areaId } }.map(row)
        if !loose.isEmpty { sections.append(Section(id: looseId, area: nil, name: WalkCopy.paperNoArea, rows: loose)) }
        let total = sections.reduce(0) { $0 + $1.rows.count }
        return PlanPaper(title: title, count: WalkCopy.paperCount(total, level: level), sections: sections, level: level)
    }

    /// The same paper with each row's words to VoiceOver for what its tap does (`Row.hint`).
    func hinted(_ hint: (UUID) -> String?) -> PlanPaper {
        let sections = self.sections.map { section in
            Section(id: section.id, area: section.area, name: section.name,
                    rows: section.rows.map { Row(id: $0.id, title: $0.title, tag: $0.tag, hint: hint($0.id)) })
        }
        return PlanPaper(title: title, count: count, sections: sections, level: level)
    }

    /// Each row in reading order with its place on the paper (`walk.paper.row.<n>`).
    var numberedRows: [(index: Int, row: Row)] {
        sections.flatMap(\.rows).enumerated().map { ($0.offset, $0.element) }
    }
}

extension WalkState {
    /// The paper over the walk while it is open: the step's whole level, titled with the step's period;
    /// on Look back up the level of the cloth that opened it (`paperLevel`, F21).
    func paper(_ p: WalkPeriods) -> PlanPaper? {
        guard paperOpen, let level = paperLevel ?? level else { return nil }
        return PlanPaper.make(level: level, items: items, areas: areas, kept: kept,
                              title: WalkCopy.paperTitle(level, p), today: p.today)
            .hinted { id in
                let does = paperRowTap(id)
                return WalkCopy.paperRowHint(walks: does.walks, chooses: does.chooses, lookingBack: step == 6)
            }
    }
}
