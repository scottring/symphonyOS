import Testing
import Foundation
@testable import Symphony

struct EditionTests {
    @Test func resolveRules() {
        #expect(Edition.resolve([]) == .light)
        #expect(Edition.resolve(["light"]) == .light)
        #expect(Edition.resolve(["full"]) == .full)
        #expect(Edition.resolve([nil]) == .full)
        #expect(Edition.resolve(["light", "full"]) == .full)
        #expect(Edition.resolve(["something-new"]) == .full)
    }

    @Test func lightAllowsNothingFullAllowsAll() {
        for feature in Feature.allCases {
            #expect(!Edition.light.allows(feature))
            #expect(Edition.full.allows(feature))
        }
    }

    @Test func lightHidesRoutinesTab() {
        #expect(AppTab.visible(in: .light) == [.planner, .inbox, .more])
        #expect(AppTab.visible(in: .full) == [.planner, .inbox, .routines, .more])
    }

    @Test func assumedLifeArea() {
        #expect(Edition.light.assumedLifeArea == "personal")
        #expect(Edition.full.assumedLifeArea == nil)
    }
}

struct EditionLastKnownTests {
    @Test func emptyListKeepsLastKnown() {
        #expect(Edition.resolve([], lastKnown: .full) == .full)
        #expect(Edition.resolve([], lastKnown: nil) == .light)
        #expect(Edition.resolve([], lastKnown: .light) == .light)
    }

    @Test func nonEmptyListIgnoresLastKnown() {
        #expect(Edition.resolve(["light"], lastKnown: .full) == .light)
        #expect(Edition.resolve([nil], lastKnown: .light) == .full)
    }

    @MainActor @Test func appStateDefaultsToFull() {
        #expect(AppState().edition == .full)
    }

    /// Review Focus 5: an invite accepted while a light page or its Inbox sheet is up
    /// brings the full household's dock back at once, with nothing light left on top.
    @MainActor @Test func leavingTheLightPagesBringsTheDockBack() {
        let state = AppState()
        state.dailyHidesDock = true
        state.dailyPanel = .inbox
        state.leaveDaily()
        #expect(state.dailyHidesDock == false)
        #expect(state.dailyPanel == nil)
        #expect(state.bottomInset == state.dockHeight)
    }

    /// Off the light pages nothing light is left to come back to: the last day the light Planner
    /// saw goes (a later light Planner starts from its own today), and so does a handover not yet played.
    @MainActor @Test func leavingTheLightPagesForgetsTheirDayAndTheHandover() {
        let state = AppState()
        state.dailyLastDay = Date(timeIntervalSince1970: 1_000_000)
        state.handover = true
        state.leaveDaily()
        #expect(state.dailyLastDay == nil)
        #expect(state.handover == false)
    }

    /// The signed-out person's last light day goes with them.
    @MainActor @Test func signingOutForgetsTheLastLightDay() {
        let state = AppState()
        state.dailyLastDay = Date(timeIntervalSince1970: 1_000_000)
        state.signedOut()
        #expect(state.dailyLastDay == nil)
    }

    /// A Tell still waiting (behind the walk) when the person signs out is dropped, not answered.
    @MainActor @Test func aWaitingTellGoesWithTheSignedOutPerson() {
        let state = AppState()
        state.tellRequested = true
        state.walkShowing = true
        state.signedOut()
        #expect(state.tellRequested == false)
    }

    @MainActor @Test func noDockNoInset() {
        let state = AppState()
        #expect(state.bottomInset == state.dockHeight)
        state.dailyHidesDock = true
        #expect(state.bottomInset == 0)
    }

    @Test func memoryIsPerUser() throws {
        let suite = "EditionMemoryTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = EditionMemory(defaults: defaults)
        let a = UUID(), b = UUID()
        #expect(memory.lastKnown(for: a) == nil)
        memory.remember(.full, for: a)
        #expect(memory.lastKnown(for: a) == .full)
        #expect(memory.lastKnown(for: b) == nil)
        #expect(memory.lastKnown(for: nil) == nil)
        #expect(defaults.string(forKey: "edition.lastKnown.\(a.uuidString.lowercased())") == "full")
    }
}
