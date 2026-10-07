import Testing
import Foundation
@testable import Symphony

/// Steps fold to their next one; only a step for someone else stays open
/// (web ScheduleItem.tsx, "Today, calmer" 2026-10-06).
struct StepFoldTests {
    let scott = UUID(), ella = UUID()

    func row(people: [UUID], steps: [TimelineItem.ChildItem], source: TimelineItem.Source? = nil) -> TimelineItem {
        var item = TimelineItem(id: "task-x", type: .task, title: "Plan the trip", startTime: nil, isAllDay: true,
                                completed: false, context: "family", entityId: UUID(), assignedTo: people)
        item.children = steps
        item.source = source
        return item
    }

    func step(_ title: String, _ who: UUID? = nil, done: Bool = false) -> TimelineItem.ChildItem {
        .init(id: UUID(), title: title, completed: done, assignedTo: who.map { [$0] } ?? [])
    }

    @Test func aStepForTheRowsOwnPersonFoldsLikeAnyOther() {
        let item = row(people: [scott], steps: [step("Talk with Iris", scott, done: true), step("Pick dates", scott), step("Book", scott)])
        #expect(item.perPersonSteps.isEmpty)
        #expect(item.nextStep?.title == "Pick dates")
        #expect(item.stepsTotal == 3)
    }

    @Test func aStepForSomeoneElseStaysOpenAndLeavesTheCount() {
        let item = row(people: [scott], steps: [step("Ella: pack", ella), step("Pick dates"), step("Book")])
        #expect(item.perPersonSteps.map(\.title) == ["Ella: pack"])
        #expect(item.plainSteps.map(\.title) == ["Pick dates", "Book"])
        #expect(item.stepsTotal == 2)
    }

    @Test func everyOpenStepOfAnEmailedRowStaysOpen() {
        let item = row(people: [scott], steps: [step("Liam: collared shirt"), step("Mia: form", nil, done: true)], source: .email)
        #expect(item.perPersonSteps.map(\.title) == ["Liam: collared shirt"])
        #expect(item.plainSteps.isEmpty)
    }
}
