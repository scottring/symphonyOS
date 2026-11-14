#if os(iOS)
import Testing
import Foundation
import SwiftData
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// Tuesday 10 November 2026, the demo's day: the walk's season is fall.
private let today = day(2026, 11, 10)

// The walk a light page opens one level down: on the step below the goal, with no lesson,
// and never stored, so a walk left with Leave for now is still there however this one ends.
@MainActor
struct DailyWalkDownTests {
    let me = UUID()

    /// A year goal of the walk's year in the store, and the walk-down the "No piece" sign asks for.
    private func yearGoalWalkedDown(_ ctx: ModelContext) throws -> (down: DailyWalkDown, goal: UUID) {
        let periods = WalkPeriods.pick(now: today)
        let goal = Goal(id: UUID(), userId: me, name: "Feel strong again", year: periods.year)
        goal.context = "personal"
        ctx.insert(goal)
        try ctx.save()
        let down = try #require(DailyWalkDown.sign(.walkDown(goal.id, .year), goals: [goal], tasks: [], areaRows: [],
                                                   saved: nil, periods: periods, now: today,
                                                   seasons: nil, me: me))
        return (down, goal.id)
    }

    private func open(_ down: DailyWalkDown, _ ctx: ModelContext) -> WalkModel {
        down.model(context: ctx, now: today, scheduler: ManualWalkScheduler(), listener: FakeWalkListener(),
                   sound: FakeWalkSound())
    }

    @Test func itOpensOnTheStepBelowAboutTheGoalWithNoLesson() throws {
        let ctx = try walkTestContext()
        let (down, goal) = try yearGoalWalkedDown(ctx)
        let walk = open(down, ctx)
        #expect(walk.state.step == 2)
        #expect(walk.state.focus[.season] == goal)
        #expect(walk.state.taught && !walk.state.teaching)
        #expect(!walk.state.ground)
        #expect(walk.state.items(on: .year).map(\.id) == [goal])
        #expect(walk.state.items(on: .year).allSatisfy { $0.mine })     // it may be moved or pulled up there
    }

    /// Never stored: the app's own store is never handed to it. A walk left with Leave for now
    /// is still there, untouched, after a walk-down ends, whether it is left or walked to the
    /// end; and with nothing stored, nothing is stored after.
    @Test func itIsNeverStoredHoweverItEnds() throws {
        let store = WalkPositionStore()                 // where the app keeps this person's walk
        defer { store.forget(for: me) }
        var s = WalkState()
        s.depth = .full
        s.step = 3
        s.areas = WalkLoad.areas([], me: me)
        let paused = WalkPosition(s, status: .paused, planted: [], periods: WalkPeriods.pick(now: today), now: today)
        store.save(paused, for: me)

        let ctx = try walkTestContext()
        let (down, _) = try yearGoalWalkedDown(ctx)
        var ended: [WalkStatus] = []

        // Leave for now, part-way: it simply closes.
        let left = open(down, ctx)
        left.onEnd = { ended.append($0) }
        left.choose(.leave)
        #expect(ended == [.paused])
        #expect(store.load(for: me) == paused)
        #expect(store.hasPausedWalk(for: me))

        // Walked on to Look back up and on to Today.
        let walked = open(down, ctx)
        walked.onEnd = { ended.append($0) }
        for _ in 0..<4 { walked.choose(.next) }
        #expect(walked.state.step == 6)
        walked.send(.goToToday)
        #expect(ended == [.paused, .finished])
        #expect(store.load(for: me) == paused)

        // With no walk stored, none is stored after.
        store.forget(for: me)
        let none = open(down, ctx)
        none.choose(.next)
        none.choose(.leave)
        #expect(store.load(for: me) == nil)
    }
}
#endif
