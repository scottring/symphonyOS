import Foundation

public enum Reconciler {
    /// Pure reconciliation: given Apple state and Symphony state for a single mapped list,
    /// produce the operations needed to make them converge.
    ///
    /// Strategy:
    /// - Match items by externalId.
    /// - Apple-only: insertSymphony.
    /// - Symphony-only with externalId: deleteSymphony (Apple deleted it).
    /// - Symphony-only without externalId: insertApple (kiosk created it).
    /// - Both: newer updatedAt wins; equal timestamps = no-op.
    public static func reconcile(
        apple: [AppleItem],
        symphony: [SymphonyItem],
        mapping: ListMapping
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
                if a.lastModified > s.updatedAt {
                    ops.append(.updateSymphony(symphonyId: s.id, fromApple: a))
                } else if s.updatedAt > a.lastModified {
                    ops.append(.updateApple(externalId: a.externalId, fromSymphony: s))
                }
                // equal timestamps: no-op
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
}
