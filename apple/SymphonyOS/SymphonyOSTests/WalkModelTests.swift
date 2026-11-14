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

    /// A hold, nothing heard, let go, and the session's end.
    private func emptyHold(_ m: WalkModel) async {
        await hold(m)
        m.send(.orbUp(heldMs: 900))
        listener.end()
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

    /// Letting go finishes (never cancels) the session; the flag is planted once,
    /// with the last words, when the session ends.
    @Test func lettingGoWaitsForTheLastWords() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await hold(m)
        listener.hear("Finish the")
        m.send(.orbUp(heldMs: 900))
        #expect(listener.finishes == 1 && listener.stops == 0)
        #expect(fetch(ctx, Goal.self).isEmpty)
        listener.hear("Finish the bathroom")
        #expect(m.state.orb == .finishing(live: "Finish the bathroom"))
        #expect(fetch(ctx, Goal.self).isEmpty)
        listener.end()
        #expect(fetch(ctx, Goal.self).map(\.name) == ["Finish the bathroom"])
        #expect(m.state.orb == .idle && m.state.typing == nil)
        #expect(listener.stops == 0)
    }

    @Test func withNoEndTheFinishTimerPlantsAndCancels() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await hold(m)
        listener.hear("feel strong")
        m.send(.orbUp(heldMs: 900))
        scheduler.advance(WalkOrb.finishMs - 1)
        #expect(fetch(ctx, Goal.self).isEmpty)
        scheduler.advance(1)
        #expect(fetch(ctx, Goal.self).map(\.name) == ["Feel strong"])
        #expect(listener.stops == 1)                           // gave up waiting: cancelled
        listener.hear("feel strong again")
        listener.end()
        #expect(fetch(ctx, Goal.self).map(\.name) == ["Feel strong"])
        #expect(m.state.orb == .idle && m.state.typing == nil)
    }

    /// A new hold while the last one finishes plants the first flag once; words and
    /// the end from the first session, arriving during the second, are dropped.
    @Test func wordsFromAnEarlierHoldNeverReachTheNextFlag() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await hold(m)
        let firstWords = listener.onWords
        let firstEnd = listener.onEnd
        listener.hear("feel strong")
        m.send(.orbUp(heldMs: 900))
        m.send(.orbDown)
        #expect(fetch(ctx, Goal.self).map(\.name) == ["Feel strong"])
        #expect(listener.stops == 1)

        scheduler.advance(WalkOrb.holdMs)
        #expect(m.state.orb == .speaking(live: ""))
        firstWords?("feel strong again")                       // before the second hold's listening starts
        #expect(m.state.orb == .speaking(live: ""))
        await scheduler.settle()
        #expect(listener.starts == 2)
        firstWords?("feel strong again")                       // while the second hold is listening
        firstEnd?()
        #expect(m.state.orb == .speaking(live: ""))
        listener.hear("finish the bathroom")
        #expect(m.state.orb == .speaking(live: "finish the bathroom"))
        m.send(.orbUp(heldMs: 900))
        listener.end()
        #expect(fetch(ctx, Goal.self).map(\.name).sorted() == ["Feel strong", "Finish the bathroom"])
    }

    /// Sliding out to the points or the system taking the touch cancels the mic:
    /// nothing is planted, nothing is finished, no field opens.
    @Test func slidingAwayOrACancelStopsWithoutTyping() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await hold(m)
        listener.hear("feel strong")
        m.send(.orbMoved(WalkOrb.position(of: .w)))
        #expect(listener.stops == 1)
        #expect(m.state.typing == nil)
        m.send(.orbCancelled)
        #expect(listener.stops == 1)                           // already stopped

        await hold(m)
        listener.hear("feel strong")
        m.send(.orbCancelled)
        #expect(listener.stops == 2)
        #expect(listener.finishes == 0)
        #expect(m.state.typing == nil)
        #expect(m.state.orb == .idle)
        #expect(fetch(ctx, Goal.self).isEmpty)
    }

    @Test func aFirstEmptyHoldIsQuietTheSecondOpensTyping() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await emptyHold(m)
        #expect(m.state.note == WalkCopy.nothingToPlant && m.state.typing == nil)
        await emptyHold(m)
        #expect(m.state.note == WalkCopy.nothingHeard && m.state.typing == "")
        #expect(fetch(ctx, Goal.self).isEmpty)
        #expect(listener.stops == 0)
    }

    /// A refusal: typing opens, and later holds open it at the hold without asking again.
    @Test func afterARefusalAHoldOpensTypingWithoutListening() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        listener.problemOnStart = "Allow the microphone in Settings to speak — or type it."
        await hold(m)
        #expect(m.state.typing == "" && m.state.note == WalkCopy.speechOff)
        m.send(.orbUp(heldMs: 900))
        m.send(.typeDismissed)
        listener.problemOnStart = nil

        m.send(.orbDown)
        scheduler.advance(WalkOrb.holdMs)
        #expect(m.state.orb == .idle)                          // never speaking: no flag rises
        #expect(m.state.typing == "" && m.state.note == WalkCopy.speechOff)
        await scheduler.settle()
        #expect(listener.starts == 1)
    }

    /// The session ends while the finger is still down.
    @Test func aSessionThatEndsMidHold() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        toYear(m)
        await hold(m)
        listener.end()                                         // nothing heard: typing at once
        #expect(m.state.orb == .idle && m.state.typing == "" && m.state.note == WalkCopy.speechOff)
        m.send(.orbUp(heldMs: 900))
        m.send(.typeDismissed)

        await hold(m)                                          // not latched: the next hold listens
        #expect(listener.starts == 2)
        listener.hear("feel strong")
        listener.end()                                         // words: they stay on the flag
        #expect(m.state.orb == .speaking(live: "feel strong"))
        m.send(.orbUp(heldMs: 900))                            // planted at once, no finishing wait
        #expect(fetch(ctx, Goal.self).map(\.name) == ["Feel strong"])
        #expect(listener.finishes == 0)
    }

    @Test func theWalkListensOnlyOnTheDevice() {
        #expect(Dictation.mayListen(onDeviceOnly: true, supportsOnDevice: true))
        #expect(!Dictation.mayListen(onDeviceOnly: true, supportsOnDevice: false))
        #expect(Dictation.mayListen(onDeviceOnly: false, supportsOnDevice: false))   // Tell, as before
        #expect(!Dictation().onDeviceOnly)
    }

    /// The first hold asks for permission and the prompt takes the touch away.
    /// Allowed: a quiet line says to hold again, and the next hold listens.
    @Test func thePermissionPromptLeavesTheOrbUsable() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        listener.whileStarting = { [m] in m.send(.orbCancelled) }
        await hold(m)
        #expect(listener.stops == 1)
        #expect(m.state.orb == .idle && m.state.typing == nil)
        #expect(m.state.note == WalkCopy.speakNow)

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

    /// Let go (not cancelled) while the prompts are up: an empty hold, not "speak now".
    @Test func aReleaseWhileThePromptIsUpIsAnEmptyHold() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        listener.whileStarting = { [m] in m.send(.orbUp(heldMs: 900)) }
        await hold(m)
        #expect(listener.stops == 1 && listener.finishes == 0)
        #expect(m.state.orb == .idle && m.state.typing == nil)
        #expect(m.state.note == WalkCopy.nothingToPlant)
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

    /// A start that comes back after a newer hold began says nothing about that hold.
    @Test func aStaleStartIsIgnored() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        listener.problemOnStart = "no microphone"
        listener.whileStarting = { [m, listener, scheduler] in
            m.send(.orbCancelled)                              // the first hold goes
            m.send(.orbDown)                                   // and a second one begins before the first start answers
            scheduler.advance(WalkOrb.holdMs)
            listener.whileStarting = { [listener] in listener.problemOnStart = nil }
        }
        await hold(m)
        #expect(listener.starts == 2)
        #expect(m.state.typing == nil)                         // the first start's problem is not this hold's
        listener.hear("feel strong")
        #expect(m.state.orb == .speaking(live: "feel strong"))
    }

    /// The walk ending stops the listener.
    @Test func endingTheWalkStopsListening() async throws {
        let m = model(try walkTestContext())
        toYear(m)
        await hold(m)
        m.choose(.back)                                        // to the ground
        m.choose(.back)                                        // to Welcome
        m.choose(.notNow)
        #expect(listener.stops == 1)
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

    // MARK: Appearing, replaying and being taken down

    @Test func aFreshAppHasNotAskedForAReplay() {
        #expect(AppState().walkReplayRequested == false)
    }

    @Test func aLeftWalkIsRememberedAndAReplayStartsFresh() throws {
        let saved = store()
        let ctx = try walkTestContext()
        model(ctx, store: saved).choose(.notNow)
        let left = try #require(saved.load(for: me))
        #expect(left.status == .left)
        #expect(WalkEntry.decide(replay: false, demoWalk: false, position: left, householdEditions: ["light"],
                                 initialSyncFinished: true, goalCount: 0) == .none)
        #expect(WalkEntry.decide(replay: true, demoWalk: false, position: left, householdEditions: ["light"],
                                 initialSyncFinished: true, goalCount: 0) == .start)

        let replay = model(ctx, entry: .start, position: left, store: saved)
        #expect(saved.load(for: me)?.status == .left)
        replay.choose(.quick)
        let fresh = try #require(saved.load(for: me))
        #expect(fresh.status == .inProgress)
        #expect(fresh.step == 1)
        #expect(fresh.planted.isEmpty)
    }

    /// A walk taken down from outside (a sign-out, another person, a new day) stops
    /// listening, runs none of its timers, takes no more events, never calls `onEnd`
    /// and leaves the saved place as the last save left it.
    @Test func closingStopsListeningAndEveryTimer() async throws {
        let saved = store()
        let m = model(try walkTestContext(), store: saved)
        var ended = false
        m.onEnd = { _ in ended = true }
        plantAGoal(m)
        await hold(m)
        listener.hear("lift twice")
        #expect(m.state.undoShowing)
        #expect(m.state.orb == .speaking(live: "lift twice"))
        let before = saved.load(for: me)

        m.close()
        #expect(listener.stops == 1)
        scheduler.advance(WalkState.undoMs + WalkOrb.finishMs)
        #expect(m.state.undoShowing)                           // the Undo timer never ran
        m.send(.orbUp(heldMs: 900))
        listener.end()
        #expect(m.state.orb == .speaking(live: "lift twice"))  // nothing more reaches the state
        #expect(!ended)
        #expect(saved.load(for: me) == before)
    }

    // MARK: The picture

    @Test func theBundledPictureResolves() {
        #expect(UIImage(named: WalkArt.overlookSquare.imageName)?.cgImage?.width == 3120)
    }
}
#endif
