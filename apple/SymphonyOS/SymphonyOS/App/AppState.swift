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

    // Coaching toggle (matches web's localStorage key semantics)
    @ObservationIgnored
    var hideCoaching: Bool {
        get { UserDefaults.standard.bool(forKey: "symphony-hide-coaching") }
        set { UserDefaults.standard.set(newValue, forKey: "symphony-hide-coaching") }
    }

    // Presentation state
    var showingQuickCapture = false
    var showingSettings = false

    init() {
        // Default coaching to hidden (matching web behavior)
        if !UserDefaults.standard.contains(key: "symphony-hide-coaching") {
            UserDefaults.standard.set(true, forKey: "symphony-hide-coaching")
        }
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
}

// MARK: - UserDefaults Helper

extension UserDefaults {
    func contains(key: String) -> Bool {
        object(forKey: key) != nil
    }
}
