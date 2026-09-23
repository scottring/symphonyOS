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
    var bottomInset: CGFloat { keyboardVisible ? 0 : dockHeight }

    // Domain filter
    var domainFilter: DomainFilter = .all

    // Presentation state
    var showingQuickCapture = false
    var showingSettings = false

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
