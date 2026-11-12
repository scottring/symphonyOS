import SwiftUI
import SwiftData

/// What a tap on a row opens: a task's details, an event's, or the routine
/// occurrence (Done / Move / Skip / Edit routine). Today and the half-open
/// display both open things this way.
struct OpenedItemSheet: View {
    let item: TimelineItem
    let date: Date
    let userId: UUID

    @Environment(\.dismiss) private var dismiss
    @Query private var allTasks: [SymphonyTask]
    @Query private var routines: [Routine]

    var body: some View {
        switch item.type {
        case .task:
            if let task = allTasks.first(where: { $0.id == item.entityId }) {
                NavigationStack {
                    TaskDetailView(task: task)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
                }
                .presentationDetents([.large, .medium])
            }
        case .routine:
            if let routine = routines.first(where: { $0.id == item.entityId }) {
                RoutineOccurrenceSheet(routine: routine, date: date, completed: item.completed)
                    .presentationDetents([.medium, .large])
            }
        case .event:
            if let key = item.eventKey {
                NavigationStack {
                    EventDetailView(googleEventId: key, eventTitle: item.title, eventStart: item.startTime,
                                    eventLocation: item.location, recurringEventId: item.recurringEventId,
                                    date: date, userId: userId)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
                }
                .presentationDetents([.large, .medium])
            }
        }
    }
}
