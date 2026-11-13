#if os(iOS)
import Testing
import Foundation
import SwiftData
import UIKit
@testable import Symphony

// The one observable object: it runs the reducer, carries out its effects
// (rows through the writer, timers through the scheduler, the saved
// position), and loads the plan back before a saved place is applied.

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// Friday 13 November 2026: the walk files year goals into 2027.
private let now = day(2026, 11, 13)

@MainActor
struct WalkModelTests {
    let me = UUID()
    let scheduler = ManualWalkScheduler()
    let listener = FakeWalkListener()

    private func store() -> WalkPositionStore {
        WalkPositionStore(defaults: UserDefaults(suiteName: "WalkModelTests.\(UUID())")!)
    }

    private func model(_ ctx: ModelContext, entry: WalkEntry = .start, position: WalkPosition? = nil,
                       store: WalkPositionStore? = nil) -> WalkModel {
        WalkModel(context: ctx, userId: me, entry: entry, position: position, edition: .light,
                  now: now, store: store, scheduler: scheduler, listener: listener)
    }

    private func fetch<T: PersistentModel>(_ ctx: ModelContext, _ type: T.Type) -> [T] {
        (try? ctx.fetch(FetchDescriptor<T>())) ?? []
    }

    private func health(_ m: WalkModel) -> UUID { m.state.areas.first { $0.name == "Health" }!.id }

    /// Quick start, keep Health, walk on to Year, type a goal and plant it.
    private func plantAGoal(_ m: WalkModel, _ words: String = "feel strong again") {
        m.choose(.quick)
        m.send(.areaTapped(health(m)))
        m.choose(.next)
        m.choose(.type)
        m.send(.typeChanged(words))
        m.send(.typeSubmitted)
    }

    /// A saved place on Season, built as the walk would save it.
    private func savedAtSeason(depth: WalkDepth = .quick, focus: UUID? = nil, planted: Set<UUID>) -> WalkPosition {
        var s = WalkState()
        s.depth = depth
        s.step = 2
        s.areas = WalkLoad.areas([], me: me)
        if let focus { s.focus = [.season: focus] }
        return WalkPosition(s, status: .inProgress, planted: planted, periods: WalkPeriods.pick(now: now), now: now)
    }

    private func plantYearGoal(_ ctx: ModelContext, _ title: String, areaId: UUID? = nil) -> UUID {
        let id = UUID()
        WalkWriter(context: ctx, userId: me, periods: WalkPeriods.pick(now: now))
            .create(WalkItem(id: id, level: .year, title: title, areaId: areaId, parentId: nil, day: nil), parent: nil)
        return id
    }

    // MARK: The scheduler

    @Test func theManualSchedulerRunsInOrder() async {
        let clock = ManualWalkScheduler()
        var ran: [String] = []
        clock.after(300, key: "a") { ran.append("a") }
        clock.after(100, key: "b") { ran.append("b") }
        clock.after(200, key: "a") { ran.append("a") }       // replaces the first "a"
        clock.after(50, key: "c") { ran.append("c") }
        clock.cancel(key: "c")
        clock.advance(150)
        #expect(ran == ["b"])
        clock.advance(100)
        #expect(ran == ["b", "a"])
        clock.advance(1000)
        #expect(ran == ["b", "a"])                             // the replaced "a" and the cancelled "c" never run

        var awaited = false
        clock.run { awaited = true }
        #expect(!awaited)
        await clock.settle()
        #expect(awaited)
    }

    // MARK: Starting

    @Test func aFreshWalkStartsAtWelcomeWithSixPeaks() throws {
        let m = model(try walkTestContext())
        #expect(m.state.step == 0)
        #expect(m.state.areas.map(\.name) == WalkClassifier.defaults)
        #expect(m.state.items.isEmpty)
        #expect(m.periods.year == 2027)
        #expect(m.layout.camera == WalkArt.overlookSquare.stops[0])
    }

    @Test func nothingIsSavedBeforeADepthIsChosen() throws {
        let saved = store()
        let m = model(try walkTestContext(), store: saved)
        #expect(saved.load(for: me) == nil)
        m.choose(.quick)
        let position = try #require(saved.load(for: me))
        #expect(position.status == .inProgress)
        #expect(position.step == 1)
        #expect(position.ground)
        #expect(position.planted.isEmpty)
    }

    // MARK: Planting and Undo

    @Test func plantingWritesTheRow() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        plantAGoal(m)
        let goals = fetch(ctx, Goal.self)
        #expect(goals.count == 1)
        #expect(goals.first?.name == "Feel strong again")
        #expect(goals.first?.year == 2027)
        #expect(goals.first?.areaId == health(m))
        let areas = fetch(ctx, GoalArea.self)
        #expect(areas.map(\.name) == ["Health"])
        let full = m.layout.posts.flatMap(\.banners).filter { $0.kind == .full }
        #expect(full.map(\.text) == ["Feel strong again"])
    }

    @Test func undoTakesTheRowBack() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        plantAGoal(m)
        let goalId = try #require(fetch(ctx, Goal.self).first?.id)
        let areaId = try #require(fetch(ctx, GoalArea.self).first?.id)
        m.send(.undo)
        #expect(fetch(ctx, Goal.self).isEmpty)
        #expect(fetch(ctx, GoalArea.self).isEmpty)
        #expect(!fetch(ctx, PendingChange.self).contains { $0.recordId == goalId || $0.recordId == areaId })
    }

    @Test func theUndoPillAndANoteHideInTheirTime() throws {
        let m = model(try walkTestContext())
        plantAGoal(m)
        #expect(m.state.undoShowing)
        scheduler.advance(WalkState.undoMs)
        #expect(!m.state.undoShowing)

        m.choose(.type)
        m.send(.typeChanged("um"))
        m.send(.typeSubmitted)
        #expect(m.state.note == WalkCopy.nothingToPlant)
        scheduler.advance(WalkState.noteMs)
        #expect(m.state.note == nil)
    }

    /// What makes a flag "mine" after a reload: every row the walk creates is in the
    /// saved planted set as soon as it is written, and leaves it when taken back.
    @Test func thePlantedSetFollowsWritesAndUndo() throws {
        let saved = store()
        let ctx = try walkTestContext()
        let m = model(ctx, store: saved)
        plantAGoal(m)
        let goalId = try #require(fetch(ctx, Goal.self).first?.id)
        #expect(saved.load(for: me)?.planted == [goalId])
        m.send(.undo)
        #expect(saved.load(for: me)?.planted == [])
    }

    // MARK: Speech

    /// Quick start, keep Health, walk on to Year: the orb can be held to speak.
    private func toYear(_ m: WalkModel) {
        m.choose(.quick)
        m.send(.areaTapped(health(m)))
        m.choose(.next)
    }

    /// Press, hold long enough, and let the listener's start run.
    private func hold(_ m: WalkModel) async {
        m.send(.orbDown)
        scheduler.advance(WalkOrb.holdMs)
        await scheduler.settle()
    }

    @Test func listeningStartsOnTheHoldNotBefore() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        m.send(.orbDown)
        await scheduler.settle()
        #expect(listener.starts == 0)                          // a press is not a hold: no permission asked yet
        scheduler.advance(WalkOrb.holdMs)
        await scheduler.settle()
        #expect(listener.starts == 1)
    }

    @Test func whatIsHeardFillsTheFlag() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        await hold(m)
        listener.hear("feel strong")
        #expect(m.state.orb == .speaking(live: "feel strong"))
    }

    @Test func aProblemOpensTyping() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        listener.problemOnStart = "no microphone"
        await hold(m)
        #expect(m.state.typing == "")
        #expect(m.state.note == WalkCopy.speechOff)
        #expect(m.state.orb == .idle)
    }

    @Test func stopIsCalledOnRelease() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await hold(m)
        listener.hear("feel strong")
        m.send(.orbUp(heldMs: 900))
        #expect(listener.stops == 1)
        #expect(fetch(ctx, Goal.self).map(\.name) == ["Feel strong"])
        #expect(m.state.typing == nil)
    }

    /// Letting go having heard nothing is speech that did not work: the field
    /// opens with the plain line, nothing is planted, and the mic is stopped once.
    @Test func lettingGoHavingHeardNothingOpensTyping() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await hold(m)
        m.send(.orbUp(heldMs: 900))
        #expect(m.state.typing == "")
        #expect(m.state.note == WalkCopy.speechOff)
        #expect(m.state.orb == .idle)
        #expect(fetch(ctx, Goal.self).isEmpty)
        #expect(listener.stops == 1)
    }

    /// Sliding out to the points or the system taking the touch stops the mic
    /// but is not a failure of speech: no field opens.
    @Test func slidingAwayOrACancelStopsWithoutTyping() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        await hold(m)
        m.send(.orbMoved(WalkOrb.position(of: .s)))
        #expect(listener.stops == 1)
        #expect(m.state.typing == nil)
        m.send(.orbUp(heldMs: 900))
        #expect(listener.stops == 1)                           // already stopped

        await hold(m)
        m.send(.orbCancelled)
        #expect(listener.stops == 2)
        #expect(m.state.typing == nil)
        #expect(m.state.orb == .idle)
    }

    /// A partial result that lands after letting go never fills the next flag,
    /// even when it lands after the next hold has begun but before it listens.
    @Test func wordsFromAnEarlierHoldNeverReachTheNextFlag() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await hold(m)
        listener.hear("feel strong")
        m.send(.orbUp(heldMs: 900))
        listener.hear("feel strong again")
        #expect(fetch(ctx, Goal.self).map(\.name) == ["Feel strong"])

        m.send(.orbDown)
        scheduler.advance(WalkOrb.holdMs)
        #expect(m.state.orb == .speaking(live: ""))
        listener.hear("feel strong again")                     // late, before this hold's listening starts
        #expect(m.state.orb == .speaking(live: ""))
        await scheduler.settle()
        #expect(listener.starts == 2)
        listener.hear("finish the bathroom")
        #expect(m.state.orb == .speaking(live: "finish the bathroom"))
    }

    /// The first hold asks for permission; the prompt takes the touch away. Allowed:
    /// the orb is at rest and the next hold listens. Refused: typing opens.
    @Test func thePermissionPromptLeavesTheOrbUsable() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        listener.whileStarting = { [m] in m.send(.orbCancelled) }
        await hold(m)
        #expect(listener.stops == 1)
        #expect(m.state.orb == .idle)
        #expect(m.state.typing == nil)

        listener.whileStarting = nil
        await hold(m)
        #expect(listener.starts == 2)
        listener.hear("feel strong")
        #expect(m.state.orb == .speaking(live: "feel strong"))
    }

    @Test func aRefusalWhileThePromptIsUpOpensTyping() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        listener.problemOnStart = "Allow the microphone in Settings to speak — or type it."
        listener.whileStarting = { [m] in m.send(.orbCancelled) }
        await hold(m)
        #expect(m.state.typing == "")
        #expect(m.state.note == WalkCopy.speechOff)
        #expect(m.state.orb == .idle)
    }

    /// A release before the listener's start has even run asks for nothing.
    @Test func aHoldThatEndsBeforeListeningAsksNothing() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        m.send(.orbDown)
        scheduler.advance(WalkOrb.holdMs)
        m.send(.orbUp(heldMs: 500))
        await scheduler.settle()
        #expect(listener.starts == 0)
        #expect(listener.stops == 0)
        #expect(m.state.typing == nil)
        #expect(m.state.note == WalkCopy.nothingToPlant)
    }

    // MARK: Resuming

    @Test func aResumedWalkShowsWhatWasPlanted() throws {
        let ctx = try walkTestContext()
        let goalId = plantYearGoal(ctx, "Feel strong again")
        let m = model(ctx, entry: .resume, position: savedAtSeason(planted: [goalId]))
        #expect(m.state.step == 2)
        let item = try #require(m.state.item(goalId))
        #expect(item.mine)
        #expect(item.level == .year)
    }

    /// The plan is loaded before the saved place is applied: a whole-year walk on
    /// Season rebuilds its tour from the year goals and keeps its focus.
    @Test func aResumedWholeYearKeepsItsSeasonFocus() throws {
        let ctx = try walkTestContext()
        let first = plantYearGoal(ctx, "Feel strong again")
        let second = plantYearGoal(ctx, "Finish the bathroom")
        let m = model(ctx, entry: .resume,
                      position: savedAtSeason(depth: .full, focus: second, planted: [first, second]))
        #expect(m.state.step == 2)
        #expect(m.state.focus[.season] == second)
    }

    /// An area the walk does not show (here a work area) leaves its goal on the unlabeled post.
    @Test func anItemOnAnAreaNotShownLoadsWithNoArea() throws {
        let ctx = try walkTestContext()
        let office = GoalArea(userId: me, name: "Office", context: "work")
        ctx.insert(office)
        let goalId = plantYearGoal(ctx, "Ship the launch", areaId: office.id)
        let m = model(ctx)
        let item = try #require(m.state.item(goalId))
        #expect(item.areaId == nil)
        #expect(!item.mine)
    }

    // MARK: Ending

    @Test func endingSavesTheStatus() throws {
        let saved = store()
        let m = model(try walkTestContext(), store: saved)
        var ended: WalkStatus?
        m.onEnd = { ended = $0 }
        m.choose(.notNow)
        #expect(ended == .left)
        #expect(saved.load(for: me)?.status == .left)
    }

    // MARK: The picture

    @Test func theBundledPictureResolves() {
        #expect(UIImage(named: WalkArt.overlookSquare.imageName)?.cgImage?.width == 3120)
    }
}
#endif
