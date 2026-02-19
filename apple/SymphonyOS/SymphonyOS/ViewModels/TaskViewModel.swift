import Foundation
import SwiftData
import SwiftUI

/// Handles task CRUD operations against SwiftData
@Observable
final class TaskViewModel {
    private var modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - Create

    func createTask(title: String, userId: UUID, scheduledFor: Date? = nil, context: String? = nil) -> SymphonyTask {
        let task = SymphonyTask(
            userId: userId,
            title: title,
            scheduledFor: scheduledFor,
            context: context
        )
        modelContext.insert(task)
        queueChange(tableName: "tasks", recordId: task.id, type: "insert")
        try? modelContext.save()
        return task
    }

    // MARK: - Update

    func toggleComplete(_ task: SymphonyTask) {
        task.completed.toggle()
        task.updatedAt = Date()
        task.syncStatus = .pending
        queueChange(tableName: "tasks", recordId: task.id, type: "update")
        try? modelContext.save()
    }

    func schedule(_ task: SymphonyTask, for date: Date?, isAllDay: Bool = false) {
        task.scheduledFor = date
        task.isAllDay = isAllDay
        task.isSomeday = false
        task.updatedAt = Date()
        task.syncStatus = .pending
        queueChange(tableName: "tasks", recordId: task.id, type: "update")
        try? modelContext.save()
    }

    func setContext(_ task: SymphonyTask, context: String?) {
        task.context = context
        task.updatedAt = Date()
        task.syncStatus = .pending
        queueChange(tableName: "tasks", recordId: task.id, type: "update")
        try? modelContext.save()
    }

    func assign(_ task: SymphonyTask, to memberId: UUID?) {
        task.assignedTo = memberId
        task.updatedAt = Date()
        task.syncStatus = .pending
        queueChange(tableName: "tasks", recordId: task.id, type: "update")
        try? modelContext.save()
    }

    func deferTask(_ task: SymphonyTask, until date: Date) {
        task.deferredUntil = date
        task.deferCount += 1
        task.scheduledFor = nil
        task.updatedAt = Date()
        task.syncStatus = .pending
        queueChange(tableName: "tasks", recordId: task.id, type: "update")
        try? modelContext.save()
    }

    func markSomeday(_ task: SymphonyTask) {
        task.isSomeday = true
        task.scheduledFor = nil
        task.updatedAt = Date()
        task.syncStatus = .pending
        queueChange(tableName: "tasks", recordId: task.id, type: "update")
        try? modelContext.save()
    }

    func updateTitle(_ task: SymphonyTask, title: String) {
        task.title = title
        task.updatedAt = Date()
        task.syncStatus = .pending
        queueChange(tableName: "tasks", recordId: task.id, type: "update")
        try? modelContext.save()
    }

    func updateNotes(_ task: SymphonyTask, notes: String?) {
        task.notes = notes
        task.updatedAt = Date()
        task.syncStatus = .pending
        queueChange(tableName: "tasks", recordId: task.id, type: "update")
        try? modelContext.save()
    }

    // MARK: - Delete

    func deleteTask(_ task: SymphonyTask) {
        let id = task.id
        queueChange(tableName: "tasks", recordId: id, type: "delete")
        modelContext.delete(task)
        try? modelContext.save()
    }

    // MARK: - Queue Changes

    private func queueChange(tableName: String, recordId: UUID, type: String) {
        let change = PendingChange(tableName: tableName, recordId: recordId, changeType: type)
        modelContext.insert(change)
    }
}
