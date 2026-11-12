import Foundation

/// Fingerprints of what a day is built from: completing, rescheduling or
/// editing leaves the counts unchanged, so a rebuild keys on content.
enum TimelineRevision {
    /// A content fingerprint of the task list — completion/reschedule/edits
    /// leave the count unchanged, so keying on count alone went stale.
    static func tasks(_ allTasks: [SymphonyTask]) -> Int {
        var hasher = Hasher()
        hasher.combine(allTasks.count)
        for task in allTasks {
            hasher.combine(task.id)
            hasher.combine(task.completed)
            hasher.combine(task.scheduledFor)
            hasher.combine(task.bucket)
            hasher.combine(task.title)
            hasher.combine(task.notes)
            hasher.combine(task.phoneNumber)
            hasher.combine(task.links?.count)
            hasher.combine(task.location)
            hasher.combine(task.parentTaskId)
            hasher.combine(task.captureId)
            hasher.combine(task.scope)
            hasher.combine(task.context)
            hasher.combine(task.assignedTo)
            hasher.combine(task.assignedToAll?.count)
        }
        return hasher.finalize()
    }

    /// Changes when the displayed day's cached events arrive or change.
    static func events(_ items: [TimelineItem]?) -> Int {
        var hasher = Hasher()
        hasher.combine(items == nil)
        for item in items ?? [] {
            hasher.combine(item.id)
            hasher.combine(item.startTime)
            hasher.combine(item.title)
        }
        return hasher.finalize()
    }

    static func eventNotes(_ eventNotes: [EventNote]) -> Int {
        var hasher = Hasher()
        hasher.combine(eventNotes.count)
        for note in eventNotes {
            hasher.combine(note.id)
            hasher.combine(note.notes)
            hasher.combine(note.links?.count)
            hasher.combine(note.isFree)
        }
        return hasher.finalize()
    }

    /// Routine completions and choices write `ActionableInstance` in place.
    static func instances(_ instances: [ActionableInstance]) -> Int {
        var hasher = Hasher()
        hasher.combine(instances.count)
        for instance in instances {
            hasher.combine(instance.id)
            hasher.combine(instance.status)
            hasher.combine(instance.plannedOn)
            hasher.combine(instance.deferredTo)
        }
        return hasher.finalize()
    }
}
