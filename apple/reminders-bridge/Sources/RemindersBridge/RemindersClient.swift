import Foundation
import EventKit

public protocol RemindersClientProtocol {
    /// Request EventKit Reminders access. Throws if denied.
    func requestAccess() async throws

    /// Fetch all reminders (completed AND incomplete) from the named list.
    /// Returns empty array if list not found (warning logged).
    func fetchItems(fromListNamed name: String) async throws -> [AppleItem]

    /// Insert a new reminder; returns the resulting external_id (calendarItemIdentifier).
    func insert(title: String, completed: Bool, intoListNamed name: String) async throws -> String

    /// Update title and/or completion of an existing reminder.
    func update(externalId: String, title: String, completed: Bool) async throws

    /// Delete the reminder with the given calendarItemIdentifier.
    func delete(externalId: String) async throws
}

public enum RemindersError: Error {
    case accessDenied
    case listNotFound(String)
    case itemNotFound(String)
    case saveFailed(underlying: Error)
    case removeFailed(underlying: Error)
}

public final class RemindersClient: RemindersClientProtocol {
    private let store: EKEventStore

    public init(store: EKEventStore = EKEventStore()) {
        self.store = store
    }

    public func requestAccess() async throws {
        let granted = try await store.requestFullAccessToReminders()
        if !granted {
            throw RemindersError.accessDenied
        }
    }

    public func fetchItems(fromListNamed name: String) async throws -> [AppleItem] {
        guard let calendar = findCalendar(named: name) else {
            throw RemindersError.listNotFound(name)
        }
        let predicate = store.predicateForReminders(in: [calendar])
        let reminders = await withCheckedContinuation { continuation in
            store.fetchReminders(matching: predicate) { result in
                continuation.resume(returning: result ?? [])
            }
        }
        return reminders.compactMap { r in
            guard let title = r.title, !title.isEmpty else {
                return nil
            }
            return AppleItem(
                externalId: r.calendarItemIdentifier,
                title: title,
                isCompleted: r.isCompleted,
                lastModified: r.lastModifiedDate ?? r.creationDate ?? Date()
            )
        }
    }

    public func insert(title: String, completed: Bool, intoListNamed name: String) async throws -> String {
        guard let calendar = findCalendar(named: name) else {
            throw RemindersError.listNotFound(name)
        }
        let reminder = EKReminder(eventStore: store)
        reminder.title = title
        reminder.isCompleted = completed
        reminder.calendar = calendar
        do {
            try store.save(reminder, commit: true)
        } catch {
            throw RemindersError.saveFailed(underlying: error)
        }
        return reminder.calendarItemIdentifier
    }

    public func update(externalId: String, title: String, completed: Bool) async throws {
        guard let item = store.calendarItem(withIdentifier: externalId) as? EKReminder else {
            throw RemindersError.itemNotFound(externalId)
        }
        item.title = title
        item.isCompleted = completed
        do {
            try store.save(item, commit: true)
        } catch {
            throw RemindersError.saveFailed(underlying: error)
        }
    }

    public func delete(externalId: String) async throws {
        guard let item = store.calendarItem(withIdentifier: externalId) as? EKReminder else {
            throw RemindersError.itemNotFound(externalId)
        }
        do {
            try store.remove(item, commit: true)
        } catch {
            throw RemindersError.removeFailed(underlying: error)
        }
    }

    private func findCalendar(named name: String) -> EKCalendar? {
        store.calendars(for: .reminder).first { $0.title == name }
    }
}
