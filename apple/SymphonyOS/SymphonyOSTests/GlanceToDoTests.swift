import Testing
import Foundation
@testable import Symphony

/// The Duo's outside screen: finished items fold away; a row shows only the
/// people other than you.
struct GlanceToDoTests {
    private func item(_ title: String, done: Bool) -> TimelineItem {
        TimelineItem(id: title, type: .task, title: title, startTime: nil, isAllDay: false,
                     completed: done, context: nil, entityId: UUID())
    }

    @Test func finishedItemsFoldAwayInOrder() {
        let items = [item("A", done: true), item("B", done: false), item("C", done: true), item("D", done: false)]
        let (open, done) = GlanceToDo.split(items)
        #expect(open.map(\.title) == ["B", "D"])
        #expect(done.map(\.title) == ["A", "C"])
    }

    @Test func rowLeavesYouOffItsPeople() {
        let me = UUID(), kid = UUID()
        #expect(GlanceToDo.others([me], me: me).isEmpty)
        #expect(GlanceToDo.others([me, kid], me: me) == [kid])
        #expect(GlanceToDo.others([kid], me: nil) == [kid])
    }
}
