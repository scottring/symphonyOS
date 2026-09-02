import Foundation
import SwiftUI

// MARK: - View Navigation

enum AppTab: String, CaseIterable, Identifiable {
    case today = "Today"
    case inbox = "Inbox"
    case projects = "Projects"
    case more = "More"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .today: "sun.max"
        case .inbox: "tray"
        case .projects: "folder"
        case .more: "ellipsis"
        }
    }
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
    var activeTab: AppTab = .today
    var activeSidebarItem: SidebarItem = .today
    var selectedDate: Date = .now

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
}
