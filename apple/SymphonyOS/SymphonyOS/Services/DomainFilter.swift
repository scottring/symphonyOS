import Foundation
import SwiftData

/// Filters entities by domain context (work/family/personal)
enum DomainFilterService {
    /// Filter tasks by domain
    static func filterTasks(_ tasks: [SymphonyTask], domain: DomainFilter) -> [SymphonyTask] {
        guard let contextValue = domain.contextValue else { return tasks }
        return tasks.filter { $0.context == contextValue }
    }

    /// Filter projects by domain
    static func filterProjects(_ projects: [Project], domain: DomainFilter) -> [Project] {
        guard let contextValue = domain.contextValue else { return projects }
        return projects.filter { $0.context == contextValue }
    }

    /// Filter routines by domain
    static func filterRoutines(_ routines: [Routine], domain: DomainFilter) -> [Routine] {
        guard let contextValue = domain.contextValue else { return routines }
        return routines.filter { $0.context == contextValue }
    }
}
