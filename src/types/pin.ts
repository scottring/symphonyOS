// Entity types that can be pinned
export type PinnableEntityType = 'task' | 'project' | 'contact' | 'routine' | 'list'

// ============================================================================
// PinnedItem
// ============================================================================
export interface PinnedItem {
  id: string
  entityType: PinnableEntityType
  entityId: string
  displayOrder: number
  pinnedAt: Date
  lastAccessedAt: Date
  isStale: boolean // computed: lastAccessedAt > 14 days ago
}

export interface DbPinnedItem {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  display_order: number
  pinned_at: string
  last_accessed_at: string
}

// ============================================================================
// Constants
// ============================================================================
export const MAX_PINS = 7
export const STALE_THRESHOLD_DAYS = 14
export const AUTO_UNPIN_THRESHOLD_DAYS = 21

// ============================================================================
// Utility functions
// ============================================================================
export function daysSince(date: Date): number {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export function isStale(lastAccessedAt: Date): boolean {
  return daysSince(lastAccessedAt) >= STALE_THRESHOLD_DAYS
}

export function shouldAutoUnpin(lastAccessedAt: Date): boolean {
  return daysSince(lastAccessedAt) >= AUTO_UNPIN_THRESHOLD_DAYS
}

export function dbPinnedItemToPinnedItem(db: DbPinnedItem): PinnedItem {
  const lastAccessedAt = new Date(db.last_accessed_at)
  return {
    id: db.id,
    entityType: db.entity_type as PinnableEntityType,
    entityId: db.entity_id,
    displayOrder: db.display_order,
    pinnedAt: new Date(db.pinned_at),
    lastAccessedAt,
    isStale: isStale(lastAccessedAt),
  }
}

// ============================================================================
// Icon helpers for UI
// ============================================================================
export const pinnableEntityIcons: Record<PinnableEntityType, string> = {
  task: 'check',
  project: 'folder',
  contact: 'user',
  routine: 'repeat',
  list: 'list',
}

export const pinnableEntityLabels: Record<PinnableEntityType, string> = {
  task: 'Task',
  project: 'Project',
  contact: 'Contact',
  routine: 'Routine',
  list: 'List',
}
