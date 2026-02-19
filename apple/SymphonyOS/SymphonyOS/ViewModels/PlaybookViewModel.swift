import Foundation
import SwiftData

/// Handles playbook block instantiation and feedback
@Observable
final class PlaybookViewModel {
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - Day Instantiation

    /// Creates PlaybookInstances for all blocks that match the given date's day type
    func instantiateDay(userId: UUID, date: Date) {
        let dayType = date.isWeekend ? "weekend" : "school-day"

        // Fetch blocks
        let blockDescriptor = FetchDescriptor<PlaybookBlock>()
        guard let blocks = try? modelContext.fetch(blockDescriptor) else { return }

        let matchingBlocks = blocks.filter { $0.userId == userId && $0.dayTypes.contains(dayType) }

        // Fetch existing instances for this date
        let instanceDescriptor = FetchDescriptor<PlaybookInstance>()
        let existingInstances = (try? modelContext.fetch(instanceDescriptor)) ?? []
        let existingBlockIds = Set(existingInstances.filter {
            Calendar.current.isDate($0.date, inSameDayAs: date)
        }.map(\.blockId))

        // Create missing instances
        for block in matchingBlocks {
            guard !existingBlockIds.contains(block.id) else { continue }
            let instance = PlaybookInstance(
                userId: userId,
                blockId: block.id,
                date: date
            )
            modelContext.insert(instance)
        }

        try? modelContext.save()
    }

    // MARK: - Feedback

    func setReact(_ instance: PlaybookInstance, react: String) {
        instance.react = react
        instance.updatedAt = Date()
        instance.syncStatus = .pending
        try? modelContext.save()
    }

    func addTag(_ instance: PlaybookInstance, tag: String) {
        if !instance.tags.contains(tag) {
            instance.tags.append(tag)
            instance.updatedAt = Date()
            instance.syncStatus = .pending
            try? modelContext.save()
        }
    }

    func removeTag(_ instance: PlaybookInstance, tag: String) {
        instance.tags.removeAll { $0 == tag }
        instance.updatedAt = Date()
        instance.syncStatus = .pending
        try? modelContext.save()
    }

    func setNotes(_ instance: PlaybookInstance, notes: String?) {
        instance.notes = notes
        instance.updatedAt = Date()
        instance.syncStatus = .pending
        try? modelContext.save()
    }

    func toggleItemState(_ instance: PlaybookInstance, itemId: String) {
        var state = instance.itemsState ?? [:]
        state[itemId] = !(state[itemId] ?? false)
        instance.itemsState = state
        instance.updatedAt = Date()
        instance.syncStatus = .pending

        // Check if all items completed → mark block done
        if let block = fetchBlock(id: instance.blockId) {
            let allDone = block.items.allSatisfy { state[$0.id] ?? false }
            if allDone {
                instance.completed = true
            }
        }

        try? modelContext.save()
    }

    func markComplete(_ instance: PlaybookInstance) {
        instance.completed = true
        instance.updatedAt = Date()
        instance.syncStatus = .pending
        try? modelContext.save()
    }

    private func fetchBlock(id: UUID) -> PlaybookBlock? {
        let descriptor = FetchDescriptor<PlaybookBlock>()
        return (try? modelContext.fetch(descriptor))?.first { $0.id == id }
    }
}
