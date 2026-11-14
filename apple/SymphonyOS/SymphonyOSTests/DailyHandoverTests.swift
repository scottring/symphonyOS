import Testing
import Foundation
import CoreGraphics
@testable import Symphony

// The handover: when a light household's walk finishes on light Today, the walk's light
// travels down and shrinks into the bar's light, which wears a halo, with one quiet line
// the first time only ("one control, two sizes").

struct DailyHandoverTests {
    private let window = CGSize(width: 390, height: 844)
    private var bar: DailyMetrics.Bar {
        DailyMetrics.today(size: window, safeTop: 44, safeBottom: 34).bar
    }
    private var from: (centre: CGPoint, diameter: CGFloat) { DailyHandover.start(window: window) }
    private var to: (centre: CGPoint, diameter: CGFloat) { DailyHandover.end(bar: bar) }

    private func memory() -> HandoverMemory {
        HandoverMemory(defaults: UserDefaults(suiteName: "DailyHandoverTests.\(UUID())")!)
    }

    // MARK: The light's path

    @Test func theLightEndsExactlyOnTheBarsLight() {
        let end = DailyHandover.light(at: 1, from: from, to: to)
        #expect(end.centre == to.centre)
        #expect(end.diameter == to.diameter)
        #expect(end.opacity == 1)
    }

    @Test func itStartsWhereTheWalksLightStood() {
        let start = DailyHandover.start(window: window)
        #expect(start.centre == WalkOrb.centre)
        #expect(start.diameter == 2 * WalkOrb.radius)
        #expect(DailyHandover.light(at: 0, from: from, to: to).centre == from.centre)
        #expect(DailyHandover.light(at: 0, from: from, to: to).diameter == from.diameter)
    }

    /// On a window the walk letterboxes, the light stands where the stage puts it.
    @Test func onAnotherWindowItStartsWhereTheStagePutsIt() {
        let other = CGSize(width: 466, height: 678)
        let stage = WalkStage(device: other)
        let start = DailyHandover.start(window: other)
        #expect(start.centre == stage.toDevice(WalkOrb.centre))
        #expect(start.diameter == 2 * WalkOrb.radius * stage.scale)
    }

    @Test func itOnlyShrinks() {
        let diameters = [0, 0.25, 0.5, 0.75, 1].map { DailyHandover.light(at: $0, from: from, to: to).diameter }
        for (a, b) in zip(diameters, diameters.dropFirst()) { #expect(b < a) }
    }

    /// The path bows to the right of the straight line, and the light fades in over the first 0.15.
    @Test func itBowsRightAndFadesIn() {
        let mid = DailyHandover.light(at: 0.5, from: from, to: to)
        let chord = CGPoint(x: (from.centre.x + to.centre.x) / 2, y: (from.centre.y + to.centre.y) / 2)
        #expect(mid.centre.x > chord.x)
        #expect(DailyHandover.light(at: 0, from: from, to: to).opacity == 0)
        #expect(abs(DailyHandover.light(at: 0.075, from: from, to: to).opacity - 0.5) < 0.0001)
        #expect(DailyHandover.light(at: 0.15, from: from, to: to).opacity == 1)
        #expect(DailyHandover.light(at: 0.6, from: from, to: to).opacity == 1)
    }

    /// The microphone fades in over the last quarter of the travel, so the landing is one light.
    @Test func theMicFadesInOverTheLastQuarter() {
        let mic = { (p: Double) in DailyHandover.light(at: p, from: from, to: to).micOpacity }
        #expect(mic(0) == 0)
        #expect(mic(0.75) == 0)
        #expect(abs(mic(0.875) - 0.5) < 0.0001)
        #expect(mic(1) == 1)
    }

    /// The bar's light: its diameter, at the field's right end, `lightInset` in.
    @Test func theBarsLightIsAtTheFieldsRightEnd() {
        let end = DailyHandover.end(bar: bar)
        #expect(end.diameter == bar.light)
        #expect(end.centre.x == bar.field.maxX - DailyMetrics.lightInset - bar.light / 2)
        #expect(end.centre.y == bar.field.midY)
    }

    // MARK: The line's memory

    @Test func theLineShowsOnce() {
        let memory = memory()
        let me = UUID()
        #expect(memory.seen(for: me) == false)
        memory.markSeen(for: me)
        #expect(memory.seen(for: me) == true)
        #expect(memory.seen(for: UUID()) == false)
    }

    @Test func theMemoryKeyIsThePersonsLowercasedId() {
        let defaults = UserDefaults(suiteName: "DailyHandoverTests.\(UUID())")!
        let me = UUID()
        HandoverMemory(defaults: defaults).markSeen(for: me)
        #expect(defaults.bool(forKey: "daily.handover.seen.\(me.uuidString.lowercased())"))
    }

    // MARK: Which endings hand over

    @Test func aFullHouseholdEndsAsItDoesNow() {
        #expect(DailyGate.shows(.today, edition: .full, layout: .oneColumn) == false)
        #expect(DailyHandover.plays(.walk, status: .finished, edition: .full, lightToday: true) == false)
        #expect(DailyHandover.plays(.walk, status: .finished, edition: .full,
                                    lightToday: DailyGate.hidesDock(on: .today, edition: .full, layout: .oneColumn)) == false)
    }

    @Test func aFinishedWalkOnLightTodayHandsOver() {
        #expect(DailyHandover.plays(.walk, status: .finished, edition: .light,
                                    lightToday: DailyGate.hidesDock(on: .today, edition: .light, layout: .oneColumn)))
    }

    /// Not now (`left`) and Leave for now (`paused`) do not hand over; nor does anything not finished.
    @Test func onlyAFinishedWalkHandsOver() {
        for status in [WalkStatus.left, .paused, .inProgress] {
            #expect(DailyHandover.plays(.walk, status: status, edition: .light, lightToday: true) == false)
        }
    }

    /// A walk down from a flag or a sign returns to its page, however it ends.
    @Test func aWalkDownNeverHandsOver() {
        for status in [WalkStatus.finished, .left, .paused, .inProgress] {
            #expect(DailyHandover.plays(.walkDown, status: status, edition: .light, lightToday: true) == false)
        }
    }

    /// A phone on its side keeps the old Today: no light page, no bar, no handover.
    @Test func aPhoneOnItsSideDoesNotHandOver() {
        #expect(DailyHandover.plays(.walk, status: .finished, edition: .light,
                                    lightToday: DailyGate.hidesDock(on: .today, edition: .light, layout: .glanceWide)) == false)
    }

    // MARK: How it plays

    @Test func itTravelsWhereTheBarIsDrawn() {
        #expect(DailyHandover.play(lowered: false, sheetOver: false, reduceMotion: false) == .travel)
    }

    /// Reduce Motion: nothing travels and the sheet does not move; the halo and the line fade in.
    @Test func reduceMotionMovesNothing() {
        #expect(DailyHandover.play(lowered: false, sheetOver: false, reduceMotion: true) == .still)
    }

    /// The whole plan showing (no bar) or a sheet over the page: nothing plays, and the line is not spent.
    @Test func noBarNoHandover() {
        for reduceMotion in [false, true] {
            #expect(DailyHandover.play(lowered: true, sheetOver: false, reduceMotion: reduceMotion) == .skip)
            #expect(DailyHandover.play(lowered: false, sheetOver: true, reduceMotion: reduceMotion) == .skip)
        }
    }

    /// A slot already taken as the handover starts (a waiting Tell answered as Today appears)
    /// interrupts it before it begins: no travel, the light is home at once.
    @Test func aSlotAlreadyTakenMeansNoTravel() {
        #expect(DailyHandover.play(lowered: false, sheetOver: false, reduceMotion: false, slotTaken: true) == .still)
        #expect(DailyHandover.play(lowered: true, sheetOver: false, reduceMotion: false, slotTaken: true) == .skip)
    }

    // MARK: What ends the travel

    /// A tap on the light or the field: the travel ends and the light is home, then the tap does its work.
    @Test func aTouchOnTheBarEndsTheTravelAndArrives() {
        #expect(DailyHandover.interrupt(.touch) == (ends: true, arrives: true))
    }

    /// Listening, a note or Undo taking the slot ends the travel; the slot going back to empty does not.
    @Test func theSlotTakenEndsTheTravelAndArrives() {
        for slot in [DailyBar.Slot.listening, .say(note: "It’s on Friday the 20th.", undo: false), .say(note: nil, undo: true)] {
            #expect(DailyHandover.interrupt(.slot(slot)) == (ends: true, arrives: true))
        }
        #expect(DailyHandover.interrupt(.slot(.empty)) == (ends: false, arrives: false))
    }

    /// The handle lowers the sheet over the whole plan, taking the bar away: the travel ends with no
    /// arrival, so neither the halo nor the line plays and the line is not spent.
    @Test func theHandleEndsTheTravelWithNoArrival() {
        #expect(DailyHandover.interrupt(.handle) == (ends: true, arrives: false))
    }

    // MARK: The line in the bar's one slot

    @Test func theLineTakesAnEmptySlotForSixSeconds() {
        var bar = DailyBar()
        let effects = bar.apply(.handoverLine)
        #expect(bar.slot == .handover)
        #expect(effects == [.timer(.handover, ms: DailyHandover.lineMs)])
        _ = bar.apply(.handoverExpired)
        #expect(bar.slot == .empty)
    }

    /// Lowest in the slot: a note or Undo already there keeps it, and the line is not shown.
    @Test func theLineWaitsForNoOne() {
        var bar = DailyBar()
        _ = bar.apply(.did(note: "It’s on Friday the 20th."))
        #expect(bar.apply(.handoverLine) == [])
        #expect(bar.slot == .say(note: "It’s on Friday the 20th.", undo: true))
        _ = bar.apply(.undoExpired)
        _ = bar.apply(.noteExpired)
        #expect(bar.slot == .empty)

        var listening = DailyBar()
        _ = listening.apply(.micTapped)
        #expect(listening.apply(.handoverLine) == [])
        #expect(listening.slot == .listening)
    }

    /// Listening, a note or Undo taking the slot ends the line: it does not come back after them.
    @Test func whatTakesTheSlotEndsTheLine() {
        var bar = DailyBar()
        _ = bar.apply(.handoverLine)
        let effects = bar.apply(.micTapped)
        #expect(bar.slot == .listening)
        #expect(effects.contains(.timer(.handover, ms: nil)))
        _ = bar.apply(.left)
        #expect(bar.slot == .empty)

        var noted = DailyBar()
        _ = noted.apply(.handoverLine)
        _ = noted.apply(.did(note: nil))
        #expect(noted.slot == .say(note: nil, undo: true))
        _ = noted.apply(.undoExpired)
        #expect(noted.slot == .empty)
    }

    /// Typing does not take the slot: the line stays while the field is typed into.
    @Test func typingKeepsTheLine() {
        var bar = DailyBar()
        _ = bar.apply(.handoverLine)
        _ = bar.apply(.typed("Buy milk"))
        #expect(bar.slot == .handover)
    }

    // MARK: Signing out

    @Test func signingOutForgetsTheHandover() {
        let app = AppState()
        app.handover = true
        app.signedOut()
        #expect(app.handover == false)
    }
}

#if os(iOS)
import SwiftData

/// The model carries out the handover's arrival: the halo, and the line once per person per phone.
@MainActor
struct DailyHandoverModelTests {
    let me = UUID()
    let scheduler = ManualWalkScheduler()
    let listener = FakeWalkListener()
    let handoverMemory = HandoverMemory(defaults: UserDefaults(suiteName: "DailyHandoverModelTests.\(UUID())")!)

    private func model(_ ctx: ModelContext) -> DailyModel {
        let now = PlanCalendar.calendar.date(from: DateComponents(year: 2026, month: 11, day: 10, hour: 12))!
        return DailyModel(context: ctx, userId: me, clock: { now }, scheduler: scheduler, listener: listener,
                          memory: SignpostMemory(defaults: UserDefaults(suiteName: "DailyHandoverModelTests.\(UUID())")!),
                          handoverMemory: handoverMemory)
    }

    @Test func theLineShowsOnceAndIsRememberedWhenShown() throws {
        let ctx = try walkTestContext()
        let first = model(ctx)
        first.handoverArrived()
        #expect(first.bar.slot == .handover)
        #expect(first.handoverHalo)
        #expect(handoverMemory.seen(for: me))

        let again = model(ctx)
        again.handoverArrived()
        #expect(again.bar.slot == .empty)
        #expect(again.handoverHalo)                 // the halo plays each time; only the line is once
    }

    @Test func theHaloAndTheLineLastSixSeconds() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.handoverArrived()
        scheduler.advance(DailyHandover.lineMs - 1)
        #expect(m.handoverHalo)
        #expect(m.bar.slot == .handover)
        scheduler.advance(1)
        #expect(m.handoverHalo == false)
        #expect(m.bar.slot == .empty)
    }

    /// A line that never showed (the slot was taken) is not spent: it shows next time.
    @Test func aLineThatCouldNotShowIsNotSeen() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.send(.micTapped)
        await scheduler.settle()
        m.handoverArrived()
        #expect(m.bar.slot == .listening)
        #expect(handoverMemory.seen(for: me) == false)
    }

    /// The bar gone from the screen by the time the light lands (a sheet opened, the phone half
    /// open): no halo, no line, and the line is not spent.
    @Test func noBarAtTheLandingSpendsNothing() throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        m.handoverArrived(barShown: false)
        #expect(m.handoverHalo == false)
        #expect(m.bar.slot == .empty)
        #expect(handoverMemory.seen(for: me) == false)
        m.handoverArrived()
        #expect(m.bar.slot == .handover)
    }

    /// A Tell that waited for the walk is answered once as the handover starts: the bar listens,
    /// the listening line takes the slot, and the handover line is not spent.
    @Test func aWaitingTellIsAnsweredOnceThroughTheHandover() async throws {
        let ctx = try walkTestContext()
        let m = model(ctx)
        let app = AppState()
        app.tellRequested = true
        app.walkShowing = true
        #expect(m.answerTell(app) == false)         // waits behind the walk
        app.walkShowing = false                     // the walk closes; the handover starts
        #expect(m.answerTell(app))
        await scheduler.settle()
        m.handoverArrived()                         // the light arrives (or snapped home)
        #expect(m.answerTell(app) == false)         // taken once, never twice
        await scheduler.settle()
        #expect(listener.starts == 1)
        #expect(m.bar.slot == .listening)
        #expect(handoverMemory.seen(for: me) == false)
    }
}
#endif
