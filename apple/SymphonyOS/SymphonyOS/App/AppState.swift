import Foundation
import SwiftUI

// MARK: - View Navigation

/// The phone dock: Planner · Inbox · ＋ · Routines · More.
enum AppTab: String, CaseIterable, Identifiable {
    case planner = "Planner"
    case inbox = "Inbox"
    case routines = "Routines"
    case more = "More"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .planner: "calendar"
        case .inbox: "tray"
        case .routines: "repeat"
        case .more: "ellipsis"
        }
    }
}

/// The Planner's horizons, switched from its serif title. Each is a real,
/// dated period — never an open-ended list.
enum Horizon: String, CaseIterable, Identifiable {
    case today, week, month, season, year

    var id: String { rawValue }
}

enum SidebarItem: String, CaseIterable, Identifiable {
    case today = "Today"
    case inbox = "Inbox"
    case projects = "Projects"
    case routines = "Routines"
    case contacts = "Contacts"
    case settings = "Settings"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .today: "sun.max"
        case .inbox: "tray"
        case .projects: "folder"
        case .routines: "repeat"
        case .contacts: "person.2"
        case .settings: "gear"
        }
    }
}

// MARK: - Domain Filter

enum DomainFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case work = "Work"
    case family = "Family"
    case personal = "Personal"

    var id: String { rawValue }

    var contextValue: String? {
        switch self {
        case .all: nil
        case .work: "work"
        case .family: "family"
        case .personal: "personal"
        }
    }
}

// MARK: - App State

@Observable
final class AppState {
    // Navigation
    var activeTab: AppTab = .planner
    var activeSidebarItem: SidebarItem = .today
    var selectedDate: Date = .now
    /// Which horizon the Planner shows. `selectedDate` anchors every horizon:
    /// the week, month, season and year shown are the ones containing it.
    var horizon: Horizon = .today

    /// The dock's measured height (it grows with larger text), and whether
    /// the keyboard is up (the dock hides while typing). Screens pad their
    /// floating bars by `bottomInset` so nothing sits behind the dock.
    var dockHeight: CGFloat = DockMetrics.height
    var keyboardVisible = false
    #if os(iOS)
    /// Bottom, or a side column where the system puts its bars (iPhone Duo).
    var dockLayout = DockLayout()
    var bottomInset: CGFloat { keyboardVisible || dailyHidesDock || dockLayout.edge != .bottom ? 0 : dockHeight }
    /// The Duo set down partly open shows the half-open display.
    var posture: DuoPosture = .flat
    /// Tonight's dinner being cooked on the half-open display.
    var cook: CookSession?
    #else
    var bottomInset: CGFloat { keyboardVisible || dailyHidesDock ? 0 : dockHeight }
    #endif
    /// A light page with its own bar is up (`DailyGate.hidesDock`, set by the light Planner for
    /// the window it measured): the dock, bottom or side, is not drawn and leaves no inset.
    var dailyHidesDock = false
    /// Inbox or More, opened from beside the light bar, as a sheet over the page.
    var dailyPanel: DailyPanel?
    /// The last day the light Planner saw (`DailyModel.today`; `DailyGate.dayTurn`). Kept here, beside the
    /// selected date it mends, so a day that turns while the Planner is away (its model let go) is
    /// still applied to `selectedDate` when the Planner and its model come back.
    var dailyLastDay: Date?
    /// The walk is showing over everything (set by the main view as it opens and closes it):
    /// a Tell asked for meanwhile waits until it closes (`DailyGate.tell`).
    var walkShowing = false
    /// A walk down from a light page or sign (`DailyWalkDown`), asked for: the main view opens
    /// it ahead of any other walk, never stored, and sets this back to nil.
    var walkDown: DailyWalkDown?
    /// An ordinary walk just finished onto light Today (`DailyHandover.plays`, set by the main view):
    /// light Today plays the handover and clears it.
    var handover = false

    /// Off the light pages (the Planner went away, or the household is no longer light):
    /// the dock comes back and nothing light is left open on top.
    func leaveDaily() {
        dailyHidesDock = false
        dailyPanel = nil
    }

    // Domain filter
    var domainFilter: DomainFilter = .all
    /// The household's edition; set by the main view from the synced household.
    var edition: Edition = .full

    // Presentation state
    var showingQuickCapture = false
    /// Tell Symphony was asked for from outside the app (the Lock Screen
    /// control, `symphony://tell`); Today opens its Tell sheet and clears it.
    var tellRequested = false
    var showingSettings = false
    /// Stops sync and waits for it to finish; set by `ContentView` so the
    /// delete-account flow can wipe without the engine re-inserting rows.
    var stopSync: (() async -> Void)?
    /// The signed-in account's first pull has finished: households, life
    /// areas, tasks and goals all came back from the server. Until then an
    /// empty store means nothing (a new phone, or offline). Set by
    /// `ContentView`; false again on sign-out. Demo mode sets it at once: its
    /// seeded store is all there is.
    var initialSyncFinished = false
    /// "Walk the mountain again" was tapped in Settings (the only place that
    /// asks). The main view starts the walk once the first pull has finished,
    /// and sets this back to false.
    var walkReplayRequested = false
    /// The signed-in person left a walk with Leave for now and it is waiting to be picked up:
    /// read from their saved place (`WalkPositionStore.hasPausedWalk`) by the main view each
    /// time it decides about the walk and when a walk ends. While it is true Settings offers
    /// "Pick the walk back up" and the light edition's Today shows one quiet line.
    var walkPaused = false
    /// "Pick the walk back up" was tapped (`resumeWalk()`): the main view reopens the paused
    /// walk at the step it was left on, and sets this back to false.
    var walkResumeRequested = false

    /// Picks the paused walk back up, from Settings or Today: the walk reopens over the Planner.
    func resumeWalk() {
        walkResumeRequested = true
        activeTab = .planner
    }

    /// The signed-in person is gone: their first pull, any replay, resume or Tell they asked
    /// for that is still waiting, and the pause the app was showing go with them.
    func signedOut() {
        tellRequested = false           // a Tell still waiting (say, behind the walk) is dropped, not answered
        initialSyncFinished = false
        walkReplayRequested = false
        walkPaused = false
        walkResumeRequested = false
        walkDown = nil
        handover = false
    }

    // MARK: - Date Navigation

    func goToToday() {
        selectedDate = .now
    }

    func goToPreviousDay() {
        selectedDate = Calendar.current.date(byAdding: .day, value: -1, to: selectedDate) ?? selectedDate
    }

    func goToNextDay() {
        selectedDate = Calendar.current.date(byAdding: .day, value: 1, to: selectedDate) ?? selectedDate
    }

    var isToday: Bool {
        Calendar.current.isDateInToday(selectedDate)
    }

    /// Step the displayed period back or forward by one of the current
    /// horizon's units (a week, a month, a season, a year).
    func step(_ direction: Int, seasons: [SeasonBoundary]? = nil) {
        let cal = PlanCalendar.calendar
        switch horizon {
        case .today:
            selectedDate = PlanCalendar.addDays(selectedDate, direction)
        case .week:
            selectedDate = PlanCalendar.addDays(PlanCalendar.weekStart(selectedDate), 7 * direction)
        case .month:
            selectedDate = cal.date(byAdding: .month, value: direction, to: PlanCalendar.monthStart(selectedDate)) ?? selectedDate
        case .season:
            let season = PlanCalendar.season(containing: selectedDate, boundaries: seasons)
            selectedDate = direction > 0 ? season.end : PlanCalendar.addDays(season.start, -1)
        case .year:
            let y = PlanCalendar.year(of: selectedDate) + direction
            selectedDate = cal.date(from: DateComponents(year: y, month: 1, day: 1)) ?? selectedDate
        }
    }

    /// Back to the period containing today.
    func goToCurrentPeriod() { selectedDate = .now }
}
