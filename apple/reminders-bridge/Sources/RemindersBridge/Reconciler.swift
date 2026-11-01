import Foundation

public enum Reconciler {
    /// Pure reconciliation: given Apple state and Symphony state for a single mapped list,
    /// produce the operations needed to make them converge.
    ///
    /// Strategy:
    /// - Match items by externalId.
    /// - Apple-only, never seen on both sides: insertSymphony (added in Reminders).
    /// - Apple-only, seen on both sides at the last pass (`paired`): deleteApple
    ///   (deleted in Symphony). Without this, a Symphony delete was copied back
    ///   from Reminders on the next tick (2026-11-01).
    /// - Symphony-only with externalId: deleteSymphony (Apple deleted it).
    /// - Symphony-only without externalId: insertApple (kiosk created it).
    /// - Both, same title and completion: no-op (already converged).
    /// - Both, content differs: newer updatedAt wins; equal timestamps = no-op.
    ///
    /// Preconditions (caller responsibility):
    /// - All `apple` items came from the Apple list named `mapping.appleListName`.
    /// - All `symphony` items belong to `mapping.symphonyListId`.
    /// - Symphony items with `externalId` set have distinct externalIds (DB unique
    ///   index enforces this; if it ever drifts, the last-seen item wins silently).
    /// - Apple items have distinct, non-empty `externalId` (EventKit guarantees this
    ///   via `calendarItemIdentifier`).
    ///
    /// Complexity: O(N + M) time and space, where N = apple.count and M = symphony.count.
    public static func reconcile(
        apple: [AppleItem],
        symphony: [SymphonyItem],
        mapping: ListMapping,
        paired: Set<String> = []
    ) -> [SyncOp] {
        var ops: [SyncOp] = []

        // Index Symphony items by externalId (those that have one).
        var symphonyByExt: [String: SymphonyItem] = [:]
        var orphanSymphony: [SymphonyItem] = [] // no externalId yet
        for item in symphony {
            if let ext = item.externalId {
                symphonyByExt[ext] = item
            } else {
                orphanSymphony.append(item)
            }
        }

        var seenExt = Set<String>()

        // Walk Apple items
        for a in apple {
            seenExt.insert(a.externalId)
            if let s = symphonyByExt[a.externalId] {
                // Same words and same done state: already converged. Each write
                // stamps the receiving side "now", so comparing timestamps alone
                // copied every item back and forth forever (2026-10-07).
                if a.title == s.text && a.isCompleted == s.completed { continue }
                if a.lastModified > s.updatedAt {
                    ops.append(.updateSymphony(symphonyId: s.id, fromApple: a))
                } else if s.updatedAt > a.lastModified {
                    ops.append(.updateApple(externalId: a.externalId, fromSymphony: s))
                }
                // equal timestamps: no-op
            } else if paired.contains(a.externalId) {
                ops.append(.deleteApple(externalId: a.externalId))
            } else {
                ops.append(.insertSymphony(listId: mapping.symphonyListId, apple: a))
            }
        }

        // Symphony items with externalId not seen on Apple -> deleted in Apple
        for (ext, s) in symphonyByExt where !seenExt.contains(ext) {
            ops.append(.deleteSymphony(symphonyId: s.id))
        }

        // Symphony items without externalId -> push to Apple
        for s in orphanSymphony {
            ops.append(.insertApple(symphony: s, appleListName: mapping.appleListName))
        }

        return ops
    }

    /// The items on both sides as fetched this pass, less the ones this pass
    /// deletes. Only what was actually seen on both sides counts, so an item
    /// whose copy failed is never mistaken for one deleted later.
    public static func pairedAfter(apple: [AppleItem], symphony: [SymphonyItem], ops: [SyncOp]) -> Set<String> {
        let symphonyIds = Set(symphony.compactMap { $0.externalId })
        var paired = Set(apple.map { $0.externalId }).intersection(symphonyIds)
        for op in ops {
            switch op {
            case .deleteApple(let ext): paired.remove(ext)
            case .deleteSymphony(let id):
                if let ext = symphony.first(where: { $0.id == id })?.externalId { paired.remove(ext) }
            default: break
            }
        }
        return paired
    }
}
