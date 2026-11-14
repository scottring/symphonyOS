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

    // MARK: Before this sign-in's first pull (final review C1)

    /// A full household signing in on a fresh install: nothing on the phone, nothing remembered.
    /// The pages are not light while the first pull runs.
    @Test func aFreshInstallIsNotLightBeforeTheFirstPull() {
        #expect(Edition.current([], lastKnown: nil, firstPullFinished: false) == .full)
        #expect(!Edition.remembers([], firstPullFinished: false))
    }

    /// Another account's light household row is still in the store (sign-out keeps it): until this
    /// person's first pull it is not read, and it is never remembered for them.
    @Test func anotherAccountsRowIsNotReadBeforeTheFirstPull() {
        #expect(Edition.current(["light"], lastKnown: nil, firstPullFinished: false) == .full)
        #expect(Edition.current(["light"], lastKnown: .full, firstPullFinished: false) == .full)
        #expect(!Edition.remembers(["light"], firstPullFinished: false))
    }

    /// The pull lands light: light, and remembered.
    @Test func thePullLandingLightIsLight() {
        #expect(Edition.current(["light"], lastKnown: nil, firstPullFinished: true) == .light)
        #expect(Edition.remembers(["light"], firstPullFinished: true))
    }

    /// The pull lands full (even over a light row remembered from before): full, and remembered.
    @Test func thePullLandingFullIsFull() {
        #expect(Edition.current(["full"], lastKnown: .light, firstPullFinished: true) == .full)
        #expect(Edition.current([nil], lastKnown: nil, firstPullFinished: true) == .full)
        #expect(Edition.remembers(["full"], firstPullFinished: true))
    }

    /// The pull fails (offline): it never finishes for the session, so a person with nothing
    /// remembered stays not light, whatever rows are on the phone.
    @Test func aFailedPullStaysNotLight() {
        for rows in [[], ["light"], ["light", "light"]] as [[String?]] {
            #expect(Edition.current(rows, lastKnown: nil, firstPullFinished: false) == .full)
        }
    }

    /// A person remembered as light, offline: light, as before (their own memory, not the rows).
    @Test func aRememberedLightPersonOfflineIsLight() {
        #expect(Edition.current([], lastKnown: .light, firstPullFinished: false) == .light)
        #expect(Edition.current(["full"], lastKnown: .light, firstPullFinished: false) == .light)
    }

    /// The gate is handed what `current` reads: before the pull, with nothing remembered, no light
    /// page on any window and no light half-open display.
    @Test func theGateShowsNoLightPageBeforeTheFirstPull() {
        let edition = Edition.current(["light"], lastKnown: nil, firstPullFinished: false)
        for horizon in Horizon.allCases {
            for layout in [TodayLayout.oneColumn, .glance, .dayPage, .journal] {
                #expect(!DailyGate.shows(horizon, edition: edition, layout: layout, phone: true))
            }
        }
        #expect(!DailyGate.halfOpen(edition: edition, phone: true))
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

    /// A Tell still waiting (behind the walk) when a light household's person signs out is
    /// dropped, not answered.
    @MainActor @Test func aWaitingTellGoesWithTheSignedOutPerson() {
        let state = AppState()
        state.edition = .light
        state.tellRequested = true
        state.walkShowing = true
        state.signedOut()
        #expect(state.tellRequested == false)
    }

    /// A full household's Tell asked while signed out (or still waiting as they sign out) is kept,
    /// as before the light edition: it opens after the next sign-in.
    @MainActor @Test func aFullHouseholdsWaitingTellIsKeptAcrossSignIn() {
        let state = AppState()
        state.edition = .full
        state.tellRequested = true
        state.signedOut()
        #expect(state.tellRequested == true)
        state.dropWaitingTellIfLight()          // the main view going, or someone else signing in
        #expect(state.tellRequested == true)
        #expect(AppState.dropsWaitingTell(edition: .light))
        #expect(!AppState.dropsWaitingTell(edition: .full))
    }

    /// Nothing of one person's session greets the next: Inbox or More set to open, the dock given
    /// way, the page, the date and the edition all go with them.
    @MainActor @Test func signingOutLeavesNothingOfTheSessionOnScreen() {
        let state = AppState()
        state.edition = .light
        state.dailyPanel = .more
        state.dailyHidesDock = true
        state.horizon = .month
        state.selectedDate = Date(timeIntervalSince1970: 1_000_000)
        state.signedOut()
        #expect(state.dailyPanel == nil)
        #expect(state.dailyHidesDock == false)
        #expect(state.horizon == .today)
        #expect(PlanCalendar.sameDay(state.selectedDate, .now))
        #expect(state.edition == .full)
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
