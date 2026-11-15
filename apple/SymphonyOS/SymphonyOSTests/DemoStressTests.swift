#if os(iOS) && DEBUG
import Testing
import Foundation
@testable import Symphony

private let tuesday = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 10))!

/// The demo's stress plans: what the screenshots lean on to look at a full plan and at long titles.
struct DemoStressTests {
    private func said(_ words: String, _ level: WalkLevel) -> WalkWords.Said {
        WalkWords.said(words, level: level, today: tuesday)!
    }

    @Test func theFullPlanIsFull() {
        let plan = DemoStress.full
        #expect(plan.areas.count == 5)
        for level in [WalkLevel.year, .season, .month] {
            for area in plan.areas {
                let n = plan.script.filter { $0.0 == level && $0.2 == area }.count
                #expect((3...4).contains(n), "\(level) \(area) has \(n) goals")
            }
        }
        let week = plan.script.filter { $0.0 == .week }
        #expect(week.count >= 12)
        let today = week.filter { (_, words, _) in
            guard let day = said(words, .week).day else { return false }
            return PlanCalendar.sameDay(day, tuesday)
        }
        #expect(today.count >= 9)
    }

    @Test func theLongPlanIsLong() {
        let plan = DemoStress.long
        for (level, words, _) in plan.script {
            let title = said(words, level).title
            #expect((36...44).contains(title.count), "\(title) is \(title.count) characters")
        }
        #expect(plan.areas.contains { $0.count == 24 })
        #expect(plan.customArea?.count == 24)
    }

    @Test func anUnknownNameIsNoPlan() {
        #expect(DemoStress.named("nope") == nil)
        #expect(DemoStress.named(nil) == nil)
    }
}
#endif
