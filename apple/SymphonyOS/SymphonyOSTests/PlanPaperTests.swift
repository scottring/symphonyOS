import Testing
import Foundation
import CoreGraphics
@testable import Symphony

// The paper (Task 7): the whole level as a plain list by area, read from plain inputs, so the walk,
// Look back up and the Month, Season and Year pages can each hand it their own items.

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// Friday 13 November 2026.
private let today = day(2026, 11, 13)

private func uid(_ n: Int) -> UUID {
    UUID(uuidString: String(format: "00000000-0000-0000-0000-%012x", n))!
}

private let health = WalkArea(id: uid(1), name: "Health")
private let home = WalkArea(id: uid(2), name: "Home")
private let work = WalkArea(id: uid(3), name: "Work")
private let money = WalkArea(id: uid(4), name: "Money")
/// The ridge, in its own order: the paper's sections follow it, never the order areas were kept.
private let ridge = [health, home, work, money]

private func item(_ level: WalkLevel, _ title: String, _ area: WalkArea?, day: Date? = nil) -> WalkItem {
    WalkItem(id: UUID(), level: level, title: title, areaId: area?.id, day: day)
}

private func paper(_ level: WalkLevel, _ items: [WalkItem], kept: [WalkArea] = [work, health, home]) -> PlanPaper {
    PlanPaper.make(level: level, items: items, areas: ridge, kept: kept.map(\.id), title: "December", today: today)
}

struct PlanPaperTests {

    @Test func sectionsFollowTheRidge() throws {
        // Planted Work first and kept Work first: still Health, Home, Work, as the ridge stands.
        let items = [item(.month, "Send two proposals", work), item(.month, "Find a gym that fits", health),
                     item(.month, "Hire a skip", home), item(.month, "Ask for a testimonial", work),
                     item(.month, "Book a check-up", health)]
        let p = paper(.month, items)
        #expect(p.sections.map(\.name) == ["Health", "Home", "Work"])
        #expect(p.sections.map(\.area) == [health.id, home.id, work.id])
        try #require(p.sections.count == 3)
        // Rows in planting order inside each area.
        #expect(p.sections[0].rows.map(\.title) == ["Find a gym that fits", "Book a check-up"])
        #expect(p.sections[2].rows.map(\.title) == ["Send two proposals", "Ask for a testimonial"])
        let listed: Set<UUID> = Set(p.sections.flatMap(\.rows).map(\.id))
        #expect(listed == Set(items.map(\.id)))
        #expect(p.title == "December" && p.total == 5 && p.count == "5 goals")
        #expect(Set(p.sections.map(\.id)).count == p.sections.count)
    }

    @Test func anAreaWithNothingHereIsLeftOut() {
        // Home holds a year goal and Work a week task: on Month neither has a section; other levels never show.
        let items = [item(.year, "Finish the bathroom", home), item(.week, "Call the leads", work, day: today),
                     item(.month, "Find a gym that fits", health)]
        let p = paper(.month, items)
        #expect(p.sections.map(\.name) == ["Health"])
        #expect(p.total == 1)
        #expect(paper(.month, []).sections.isEmpty)
    }

    @Test func looseFlagsComeLast() throws {
        // No area; an area on the ridge that was not kept (Money); an area no longer on the ridge.
        let gone = WalkArea(id: uid(9), name: "Gone")
        let items = [item(.season, "No area at all", nil), item(.season, "Lift twice a week", health),
                     item(.season, "Save two thousand", money), item(.season, "From an old area", gone),
                     item(.season, "Pitch three clients", work)]
        let p = paper(.season, items)
        #expect(p.sections.map(\.name) == ["Health", "Work", WalkCopy.paperNoArea])
        let loose = try #require(p.sections.last)
        #expect(loose.area == nil)
        #expect(loose.rows.map(\.title) == ["No area at all", "Save two thousand", "From an old area"])
        #expect(WalkCopy.paperNoArea == "Not under an area yet")
        // With nothing kept every flag is loose.
        #expect(paper(.season, items, kept: []).sections.map(\.name) == [WalkCopy.paperNoArea])
    }

    /// Review Focus 2: the flag cuts a long title at three lines; the paper never cuts it.
    @Test func thePaperShowsEveryTitleWhole() {
        let long = String(String(repeating: "Walk more every day and sleep well. ", count: 8).prefix(200))
        let word = String(repeating: "x", count: 60)
        #expect(long.count == 200)
        let p = paper(.year, [item(.year, long, health), item(.year, word, nil)])
        #expect(p.sections.flatMap(\.rows).map(\.title) == [long, word])
    }

    @Test func theCountSaysGoalsOrTasks() {
        #expect(WalkCopy.paperCount(1, level: .year) == "1 goal")
        #expect(WalkCopy.paperCount(17, level: .month) == "17 goals")
        #expect(WalkCopy.paperCount(12, level: .week) == "12 tasks")
        #expect(WalkCopy.paperCount(1, level: .today) == "1 task")
        let goals = (1...17).map { item(.month, "Goal \($0)", [health, home, work][$0 % 3]) }
        #expect(paper(.month, goals).count == "17 goals")
        let tasks = (1...12).map { item(.week, "Task \($0)", [health, home, work][$0 % 3], day: day(2026, 11, 13 + $0 % 3)) }
        #expect(paper(.week, tasks).count == "12 tasks" && paper(.week, tasks).total == 12)
    }

    @Test func weekRowsCarryTheirDay() {
        let items = [item(.week, "Tour the gym", health, day: today), item(.week, "Choose the tile", home, day: day(2026, 11, 14)),
                     item(.week, "Draft the talk", work, day: day(2026, 11, 18)), item(.week, "Order the skip", home),
                     item(.month, "Hire a skip", home)]
        let week = paper(.week, items)
        let tags = Dictionary(uniqueKeysWithValues: week.sections.flatMap(\.rows).map { ($0.title, $0.tag) })
        #expect(tags["Tour the gym"] == .some("TODAY"))
        #expect(tags["Choose the tile"] == .some("TOMORROW"))
        #expect(tags["Draft the talk"] == .some("WEDNESDAY"))
        #expect(tags["Order the skip"] == .some(nil))
        #expect(tags["Hire a skip"] == nil)
        // Above the week no row carries a day.
        #expect(paper(.month, items).sections.flatMap(\.rows).allSatisfy { $0.tag == nil })
    }

    /// Today reads the week's tasks dated today, and counts them as tasks.
    @Test func todayIsTheWeekFilteredToToday() {
        let items = [item(.week, "Tour the gym", health, day: today), item(.week, "Choose the tile", home, day: day(2026, 11, 14)),
                     item(.week, "Order the skip", home), item(.week, "Send the deposit", home, day: today)]
        let p = paper(.today, items)
        #expect(p.sections.map(\.name) == ["Health", "Home"])
        #expect(p.sections.flatMap(\.rows).map(\.title) == ["Tour the gym", "Send the deposit"])
        #expect(p.count == "2 tasks")
    }

    /// The paper's heading names the step's period.
    @Test func theTitleSaysTheStepsPeriod() {
        let p = WalkPeriods.pick(now: today)
        var s = WalkState()
        let titles = (1...5).map { step -> String in s.step = step; return WalkCopy.paperTitle(s, p) }
        #expect(titles == ["2027, the year ahead", p.season.name, p.monthName, "This week", "Today"])
        #expect(p.season.name == "Winter" && p.monthName == "December")
        #expect(WalkCopy.showMountain == "Show the mountain")
    }

    // MARK: The paper and the mountain agree

    /// The paper is the whole level the mountain shows: the area stood in has as many rows as its post
    /// shows flags plus its "+n more", and every side post's count is its section's. Over every generated
    /// state from Year to Week (Today's post shows only the first thing, by design), on a phone.
    @Test func theMountainAndThePaperCountTheSame() {
        let states = Generated.all, layouts = Generated.levelLayouts
        var checked = 0
        var problems: [String] = []
        for (s, layout) in zip(states, layouts) {
            guard let level = s.level, level != .today, !s.ground else { continue }
            let p = PlanPaper.make(level: level, items: s.items, areas: s.areas, kept: s.kept, title: "", today: today)
            func rows(_ area: UUID?) -> Int { p.sections.first { $0.area == area }?.rows.count ?? 0 }
            let banners = layout.posts.flatMap(\.banners)
            let shown = banners.filter { $0.kind == .full }.count
            let more = banners.reduce(0) { if case .more(let n) = $1.kind { return $0 + n }; return $0 }
            if rows(s.standing) != shown + more {
                problems.append("\(Generated.describe(s)): paper \(rows(s.standing)), post \(shown) + \(more)")
            }
            for side in layout.sides where side.count != rows(side.area) {
                problems.append("\(Generated.describe(s)): \(side.name) post \(side.count), paper \(rows(side.area))")
            }
            if p.total != s.items(on: level).count { problems.append("\(Generated.describe(s)): total \(p.total)") }
            checked += 1
        }
        #expect(problems.isEmpty, "\(problems.count): \(problems.prefix(5))")
        #expect(checked > 3000)
    }

    /// Fix round 1 (4): `WalkLayout.unseenChoice` is exactly a chosen flag its post does not draw, over every
    /// generated state (each one's chosen flag stands on its post) and the same states with a flag chosen
    /// in another area or under none.
    @Test func anUnseenChoiceIsExactlyOneThePostDoesNotDraw() {
        let states = Generated.all, layouts = Generated.levelLayouts
        var checked = 0, unseen = 0
        var problems: [String] = []
        for (s, layout) in zip(states, layouts) where s.level != nil && !s.ground {
            var cases = [(s, layout)]
            if let level = s.level, let other = s.items(on: level == .today ? .week : level).first(where: { s.column(of: $0) != s.standing }) {
                var moved = s
                moved.selected = other.id
                cases.append((moved, WalkLayout.make(moved, today: today, footing: .level)))
            }
            for (c, l) in cases {
                guard let chosen = c.selected else { continue }
                let drawn = l.posts.flatMap(\.banners).contains { $0.itemId == chosen }
                if (WalkLayout.unseenChoice(c) == nil) != drawn {
                    problems.append("\(Generated.describe(c)): drawn \(drawn), unseen \(WalkLayout.unseenChoice(c) != nil)")
                }
                checked += 1
                if !drawn { unseen += 1 }
            }
        }
        #expect(problems.isEmpty, "\(problems.count): \(problems.prefix(5))")
        #expect(checked > 1000 && unseen > 100, "checked \(checked), unseen \(unseen)")
    }

    /// The same over the demo's full and long plans, standing in each of their areas on each step.
    @Test func theDemoPlansCountTheSame() {
        for plan in [DemoStress.full, DemoStress.long] {
            var areas = ridge.filter { plan.areas.contains($0.name) }
            for name in plan.areas where !areas.contains(where: { $0.name == name }) {
                areas.append(WalkArea(id: UUID(), name: name))
            }
            var items: [WalkItem] = []
            for (level, words, name) in plan.script {
                guard let said = WalkWords.said(words, level: level, today: today) else { continue }
                let area = areas.first { $0.name == name }
                let parent = items.first { $0.level.rawValue == level.rawValue - 1 && $0.areaId == area?.id }
                items.append(WalkItem(id: UUID(), level: level, title: said.title, areaId: area?.id, parentId: parent?.id, day: said.day))
            }
            for step in 1...4 {
                for area in areas {
                    var s = WalkState()
                    s.areas = areas
                    s.kept = areas.map(\.id)
                    s.step = step
                    s.items = items
                    s.focusArea = area.id
                    s = s.settled
                    let level = s.level!
                    let p = PlanPaper.make(level: level, items: s.items, areas: s.areas, kept: s.kept, title: "", today: today)
                    let layout = WalkLayout.make(s, today: today, footing: .level)
                    let banners = layout.posts.flatMap(\.banners)
                    let more = banners.reduce(0) { if case .more(let n) = $1.kind { return $0 + n }; return $0 }
                    let here = p.sections.first { $0.area == s.standing }?.rows.count ?? 0
                    #expect(here == banners.filter { $0.kind == .full }.count + more, "step \(step) in \(area.name)")
                    #expect(p.total == s.items(on: level).count)
                }
            }
        }
    }
}
