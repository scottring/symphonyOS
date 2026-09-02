import Testing
import Foundation
@testable import Symphony

/// The landing's block card renders per-kid child items under their parent and
/// a source pill. These pin the data side: subtasks attach to an on-day parent,
/// orphans stay excluded, and the pill derives from capture/scope/type.
private func task(_ title: String, today: Bool = true, parent: UUID? = nil, createdOffset: TimeInterval = 0) -> SymphonyTask {
    let t = SymphonyTask(userId: UUID(), title: title, scheduledFor: today ? Calendar.current.startOfDay(for: Date()) : nil)
    t.isAllDay = today
    t.parentTaskId = parent
    t.createdAt = Date(timeIntervalSince1970: 1_000_000 + createdOffset)
    return t
}

private func build(_ tasks: [SymphonyTask]) -> [TimelineItem] {
    let vm = TimelineViewModel()
    vm.buildTimeline(tasks: tasks, routines: [], instances: [], date: Date(), domainFilter: .all)
    return vm.timelineItems
}

private func eventNote(_ googleEventId: String, isFree: Bool) -> EventNote {
    let note = EventNote(userId: UUID(), googleEventId: googleEventId)
    note.isFree = isFree
    return note
}

struct TimelineEnrichmentTests {
    @Test func subtasksAttachToTheirOnDayParentInCreatedOrder() {
        let parent = task("School — Picture Day")
        let mia = task("School colors laid out", today: false, parent: parent.id, createdOffset: 20)
        let liam = task("Payment envelope in backpack", today: false, parent: parent.id, createdOffset: 10)
        let items = build([parent, mia, liam])
        #expect(items.count == 1)
        #expect(items[0].children.map(\.title) == ["Payment envelope in backpack", "School colors laid out"])
        #expect(items[0].isBlock)
    }

    @Test func orphanSubtasksStayOffTheDay() {
        // Parent is not on the day → the child is excluded (documented iOS/web divergence, unchanged).
        let child = task("Loose child", parent: UUID())
        #expect(build([child]).isEmpty)
    }

    @Test func childCompletionIsCarried() {
        let parent = task("Parent")
        let done = task("Done child", today: false, parent: parent.id)
        done.completed = true
        #expect(build([parent, done])[0].children.first?.completed == true)
    }

    @Test func plainTaskIsNotABlock() {
        let items = build([task("Pack lunches")])
        #expect(items[0].isBlock == false)
        #expect(items[0].source == nil)
    }

    @Test func notesLinksPhoneMakeABlock() {
        let a = task("A"); a.notes = "Bring the form"
        let b = task("B"); b.links = [TaskLink(url: "https://x", title: nil)]
        let c = task("C"); c.phoneNumber = "410-555-0100"
        let items = build([a, b, c])
        #expect(try items.allSatisfy(\.isBlock))
        #expect(items[0].noteLine == "Bring the form")
    }

    @Test func noteLineIsTheFirstNonEmptyLine() {
        let a = task("A"); a.notes = "\n\nFirst line here\nSecond"
        #expect(build([a])[0].noteLine == "First line here")
    }

    @Test func sourceDerivation() {
        #expect(TimelineViewModel.source(type: .event, captureId: nil, scope: nil) == .calendar)
        #expect(TimelineViewModel.source(type: .task, captureId: UUID(), scope: "compound") == .email)
        #expect(TimelineViewModel.source(type: .task, captureId: nil, scope: "couple") == .shared)
        #expect(TimelineViewModel.source(type: .task, captureId: nil, scope: "compound") == .shared)
        #expect(TimelineViewModel.source(type: .task, captureId: nil, scope: "individual") == nil)
        #expect(TimelineViewModel.source(type: .routine, captureId: nil, scope: nil) == nil)
    }

    @Test func sharedSourceAloneMakesABlockButCalendarDoesNot() {
        let shared = task("Handoff — pickup"); shared.scope = "couple"
        #expect(build([shared])[0].isBlock)
        // A bare calendar event (no location/notes) renders as a plain row, like
        // "Team standup" on the landing.
        let event = TimelineItem(id: "gcal-1", type: .event, title: "Team standup", startTime: Date(), isAllDay: false,
                                 completed: false, context: nil, entityId: UUID(), eventKey: "1", source: .calendar)
        #expect(event.isBlock == false)
    }

    // "Free" resolution — mirrors src/lib/today/eventFree.test.ts precedence.
    @Test func freeIsFalseWithNoNotes() {
        #expect(TimelineViewModel.isEventFree(eventKey: "a", seriesKey: nil, notes: []) == false)
    }

    @Test func freeReadsTheInstanceNote() {
        #expect(TimelineViewModel.isEventFree(eventKey: "a", seriesKey: nil, notes: [eventNote("a", isFree: true)]) == true)
    }

    @Test func freeFallsBackToTheSeriesNote() {
        #expect(TimelineViewModel.isEventFree(eventKey: "a_1", seriesKey: "a", notes: [eventNote("a", isFree: true)]) == true)
    }

    @Test func freeIsAnOrEvenWhenTheInstanceNoteIsUnflagged() {
        // Plain OR, no per-occurrence opt-out: an instance note that exists but
        // was never marked free must not defeat a flagged series.
        let notes = [eventNote("a", isFree: true), eventNote("a_1", isFree: false)]
        #expect(TimelineViewModel.isEventFree(eventKey: "a_1", seriesKey: "a", notes: notes) == true)
    }

    @Test func freeIsFalseWhenNeitherInstanceNorSeriesIsFlagged() {
        let notes = [eventNote("a", isFree: false), eventNote("b", isFree: false)]
        #expect(TimelineViewModel.isEventFree(eventKey: "a", seriesKey: "b", notes: notes) == false)
    }
}
